import fs from "fs";
import path from "path";
import { randomBytes } from "crypto";
import { spawnSync } from "child_process";
import { SubtitleItem, TimelineJob } from "./src/types/subtitles";
import {
  VideoDubbingJob,
  VideoDubbingMasterGeneration,
} from "./src/types/videoDubbing";
import { VideoDubbingManager } from "./videoDubbingManager";

export interface VideoDubbingMasterRequest {
  items: SubtitleItem[];
  model: string;
  speakerId?: number;
  options: {
    minSpeed: number;
    maxSpeed: number;
    speedPriority: "balanced" | "strict" | "natural";
  };
}

export interface VideoDubbingSubtitleAudioItem {
  id: string;
  index: number;
  startTime: number;
  endTime: number;
  text: string;
  status: "pending" | "generating" | "completed" | "failed";
  generatedText?: string;
  error?: string;
  audioUrl?: string;
}

interface TimelineAdapter {
  isVoiceAvailable(model: string): boolean;
  isMediaBusy?(jobId: string): boolean;
  onMasterUpdated?(jobId: string): void;
  createJob(
    request: VideoDubbingMasterRequest,
    workingDirectory: string,
    maxTimelineDuration: number,
  ): TimelineJob;
  processJob(job: TimelineJob, workingDirectory: string): Promise<void>;
  removeJob(jobId: string): void;
  getAudioDuration(filePath: string): number;
  ffmpegPath: string;
}

interface ActiveGeneration {
  timelineJob: TimelineJob;
  workingDirectory: string;
  operation: Promise<void>;
  cancelled: boolean;
}

const SAMPLE_RATE = 22050;
const MAX_SUBTITLE_ITEMS = 10_000;
const SUBTITLE_AUDIO_DIRECTORY = "subtitle-audio";
const SUBTITLE_AUDIO_MANIFEST = "subtitle-audio.json";
const SUBTITLE_AUDIO_ID_PATTERN = /^[A-Za-z0-9_-]{1,100}$/;

export class VideoDubbingMasterCoordinator {
  private readonly activeJobs = new Map<string, ActiveGeneration>();
  private readonly activeCueJobs = new Set<string>();
  private readonly rebuildingJobs = new Set<string>();

  constructor(
    private readonly manager: VideoDubbingManager,
    private readonly timeline: TimelineAdapter,
  ) {}

  isBusy(jobId: string): boolean {
    return this.activeJobs.has(jobId) ||
      this.activeCueJobs.has(jobId) ||
      this.rebuildingJobs.has(jobId);
  }

  getSubtitleAudioItems(jobId: string): VideoDubbingSubtitleAudioItem[] {
    const directory = this.requireJobDirectory(jobId);
    const manifestPath = path.join(directory, SUBTITLE_AUDIO_MANIFEST);
    let parsed: unknown;
    try {
      parsed = JSON.parse(fs.readFileSync(manifestPath, "utf8"));
    } catch (error) {
      if ((error as NodeJS.ErrnoException).code === "ENOENT") return [];
      throw new Error(`Không đọc được danh sách audio phụ đề: ${error instanceof Error ? error.message : String(error)}`);
    }
    if (!Array.isArray(parsed)) {
      throw new Error("Danh sách audio phụ đề đã lưu không hợp lệ.");
    }
    return parsed.map((item, index) => {
      if (!this.isValidSubtitleAudioItem(item)) {
        throw new Error(`Dữ liệu audio phụ đề #${index + 1} đã lưu không hợp lệ.`);
      }
      const audioPath = this.subtitleAudioPath(directory, item.id);
      return {
        ...item,
        status: item.status === "generating" &&
          !this.activeCueJobs.has(jobId) &&
          !this.activeJobs.has(jobId)
          ? "failed"
          : item.status,
        error: item.status === "generating" &&
          !this.activeCueJobs.has(jobId) &&
          !this.activeJobs.has(jobId)
          ? "Tác vụ tạo audio bị gián đoạn; hãy tạo lại câu này."
          : item.error,
        ...(fs.existsSync(audioPath)
          ? { audioUrl: `/api/video-dubbing/jobs/${jobId}/subtitle-audio/${item.id}` }
          : {}),
      };
    });
  }

  syncSubtitleAudioItems(
    jobId: string,
    input: unknown,
  ): VideoDubbingSubtitleAudioItem[] {
    if (this.isBusy(jobId)) {
      throw new Error("Hãy đợi tác vụ TTS hiện tại hoàn tất trước khi sửa danh sách phụ đề.");
    }
    const directory = this.requireJobDirectory(jobId);
    if (!Array.isArray(input) || input.length > MAX_SUBTITLE_ITEMS) {
      throw new Error("Danh sách phụ đề không hợp lệ hoặc vượt quá giới hạn.");
    }
    const existing = new Map(this.getSubtitleAudioItems(jobId).map((item) => [item.id, item]));
    const next = input.map((raw, position) => {
      if (!raw || typeof raw !== "object") {
        throw new Error(`Câu phụ đề #${position + 1} không hợp lệ.`);
      }
      const item = raw as Partial<VideoDubbingSubtitleAudioItem>;
      if (
        typeof item.id !== "string" ||
        !SUBTITLE_AUDIO_ID_PATTERN.test(item.id) ||
        !Number.isFinite(item.startTime) ||
        !Number.isFinite(item.endTime) ||
        item.startTime! < 0 ||
        item.endTime! <= item.startTime! ||
        typeof item.text !== "string" ||
        !item.text.trim() ||
        item.text.length > 1800
      ) {
        throw new Error(`Dữ liệu câu phụ đề #${position + 1} không hợp lệ.`);
      }
      const previous = existing.get(item.id);
      return {
        id: item.id,
        index: position + 1,
        startTime: item.startTime!,
        endTime: item.endTime!,
        text: item.text.trim(),
        status: previous?.status === "generating" ? "generating" : previous?.status || "pending",
        generatedText: previous?.generatedText,
        error: previous?.error,
      } satisfies VideoDubbingSubtitleAudioItem;
    });
    if (new Set(next.map((item) => item.id)).size !== next.length) {
      throw new Error("ID câu phụ đề bị trùng.");
    }
    const nextIds = new Set(next.map((item) => item.id));
    for (const previous of existing.values()) {
      if (!nextIds.has(previous.id)) {
        fs.rmSync(this.subtitleAudioPath(directory, previous.id), { force: true });
      }
    }
    this.writeSubtitleAudioItems(jobId, next);
    return this.getSubtitleAudioItems(jobId);
  }

  getSubtitleAudioPath(jobId: string, cueId: string): string | null {
    if (!SUBTITLE_AUDIO_ID_PATTERN.test(cueId)) return null;
    const directory = this.requireJobDirectory(jobId);
    const filePath = this.subtitleAudioPath(directory, cueId);
    return fs.existsSync(filePath) && fs.statSync(filePath).isFile()
      ? filePath
      : null;
  }

  async regenerateSubtitleAudioItem(
    jobId: string,
    input: unknown,
  ): Promise<VideoDubbingSubtitleAudioItem[]> {
    if (this.isBusy(jobId)) {
      throw new Error("Hãy đợi tác vụ TTS hiện tại hoàn tất.");
    }
    const job = this.manager.getJob(jobId);
    if (!job || job.status !== "completed" || !job.metadata) {
      throw new Error("Video chưa sẵn sàng để tạo audio phụ đề.");
    }
    const request = this.validateRequest(input);
    if (request.items.length !== 1) {
      throw new Error("Chỉ có thể tạo lại audio cho một câu mỗi lần.");
    }
    if (!this.timeline.isVoiceAvailable(request.model)) {
      throw new Error("Giọng đọc đã chọn không khả dụng.");
    }
    const item = request.items[0];
    if (!SUBTITLE_AUDIO_ID_PATTERN.test(item.id)) {
      throw new Error("ID câu phụ đề không hợp lệ.");
    }
    const directory = this.requireJobDirectory(jobId);
    const currentItems = this.getSubtitleAudioItems(jobId);
    const position = currentItems.findIndex((entry) => entry.id === item.id);
    if (position < 0) {
      throw new Error("Không tìm thấy câu phụ đề cần tạo audio.");
    }
    const updatedItems = currentItems.map((entry, index) => index === position
      ? { ...entry, ...item, status: "generating" as const, error: undefined }
      : entry);
    this.writeSubtitleAudioItems(jobId, updatedItems);
    this.activeCueJobs.add(jobId);
    const workingDirectory = path.join(
      directory,
      `.subtitle-audio-work-${randomBytes(8).toString("hex")}`,
    );
    let timelineJob: TimelineJob | undefined;
    try {
      fs.mkdirSync(workingDirectory);
      timelineJob = this.timeline.createJob(
        request,
        workingDirectory,
        job.metadata.durationSeconds,
      );
      await this.timeline.processJob(timelineJob, workingDirectory);
      const generatedItem = timelineJob.items[0];
      const generatedPath = path.join(
        workingDirectory,
        `item_${generatedItem.index}_adjusted.wav`,
      );
      if (generatedItem.status !== "completed" || !fs.existsSync(generatedPath)) {
        throw new Error(generatedItem.error || `Không tạo được audio cho câu #${item.index} (ID ${item.id}).`);
      }
      const destination = this.subtitleAudioPath(directory, item.id);
      const temporaryPath = `${destination}.${randomBytes(6).toString("hex")}.tmp`;
      fs.copyFileSync(generatedPath, temporaryPath);
      fs.renameSync(temporaryPath, destination);
      const completedItems = this.getSubtitleAudioItems(jobId).map((entry) =>
        entry.id === item.id
          ? {
            ...entry,
            ...item,
            status: "completed" as const,
            generatedText: item.text,
            error: undefined,
          }
          : entry,
      );
      this.writeSubtitleAudioItems(jobId, completedItems);
      return this.getSubtitleAudioItems(jobId);
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      const failedItems = this.getSubtitleAudioItems(jobId).map((entry) =>
        entry.id === item.id
          ? {
            ...entry,
            ...item,
            status: "failed" as const,
            generatedText: entry.generatedText,
            error: message,
          }
          : entry,
      );
      this.writeSubtitleAudioItems(jobId, failedItems);
      return this.getSubtitleAudioItems(jobId);
    } finally {
      if (timelineJob) this.timeline.removeJob(timelineJob.id);
      fs.rmSync(workingDirectory, { recursive: true, force: true });
      this.activeCueJobs.delete(jobId);
    }
  }

  rebuildMasterFromSubtitleAudio(
    jobId: string,
    input: unknown,
  ): VideoDubbingMasterGeneration {
    if (this.isBusy(jobId)) {
      throw new Error("Hãy đợi tác vụ TTS hoặc media hiện tại hoàn tất.");
    }
    const job = this.manager.getJob(jobId);
    if (!job || job.status !== "completed" || !job.metadata) {
      throw new Error("Video chưa sẵn sàng để tạo TTS Master.");
    }
    if (!Array.isArray(input) || input.length === 0) {
      throw new Error("Không có câu phụ đề để tạo TTS Master.");
    }
    const items = this.syncSubtitleAudioItems(jobId, input);
    const directory = this.requireJobDirectory(jobId);
    const missing = items.filter((item) =>
      item.status !== "completed" || !fs.existsSync(this.subtitleAudioPath(directory, item.id)),
    );
    if (missing.length) {
      const cueIds = missing.map((item) => `#${item.index} (ID ${item.id})`).join(", ");
      throw new Error(`Chưa có audio hoàn chỉnh cho các câu: ${cueIds}. Hãy tạo lại audio cho từng câu lỗi trước.`);
    }
    this.rebuildingJobs.add(jobId);
    let temporaryMasterPath: string | undefined;
    try {
      this.manager.setMasterGeneration(jobId, {
        status: "generating",
        progressPercent: 0,
        completedSentences: items.length,
        totalSentences: items.length,
      });
      const sampleCount = Math.ceil(job.metadata.durationSeconds * SAMPLE_RATE);
      const masterPcm = Buffer.alloc(sampleCount * 2);
      for (const item of items) {
        const wav = fs.readFileSync(this.subtitleAudioPath(directory, item.id));
        const data = this.readMonoPcmWav(wav, item.id);
        const startSample = Math.floor(item.startTime * SAMPLE_RATE);
        for (let sample = 0; sample < data.length; sample += 2) {
          const destination = startSample + sample / 2;
          if (destination >= sampleCount) break;
          const mixed = masterPcm.readInt16LE(destination * 2) + data.readInt16LE(sample);
          masterPcm.writeInt16LE(Math.max(-32768, Math.min(32767, mixed)), destination * 2);
        }
      }
      const header = this.createWavHeader(masterPcm.length);
      temporaryMasterPath = path.join(
        directory,
        `.tts-master-${randomBytes(8).toString("hex")}.tmp.wav`,
      );
      fs.writeFileSync(temporaryMasterPath, Buffer.concat([header, masterPcm]));
      const generation = this.manager.completeMasterGeneration(
        jobId,
        temporaryMasterPath,
        job.metadata.durationSeconds,
        items.map((item) => ({
          startTime: item.startTime,
          durationSeconds: item.endTime - item.startTime,
          text: item.text,
        })),
      );
      temporaryMasterPath = undefined;
      this.timeline.onMasterUpdated?.(jobId);
      return generation;
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      this.manager.setMasterGeneration(jobId, {
        status: "failed",
        progressPercent: 0,
        completedSentences: items.length,
        totalSentences: items.length,
        error: message,
      });
      throw error;
    } finally {
      if (temporaryMasterPath) fs.rmSync(temporaryMasterPath, { force: true });
      this.rebuildingJobs.delete(jobId);
    }
  }

  private requireJobDirectory(jobId: string): string {
    const directory = this.manager.getJobDirectory(jobId);
    if (!directory) throw new Error("Không tìm thấy thư mục job Video Dubbing.");
    return directory;
  }

  private subtitleAudioPath(directory: string, cueId: string): string {
    return path.join(directory, SUBTITLE_AUDIO_DIRECTORY, `${cueId}.wav`);
  }

  private isValidSubtitleAudioItem(item: unknown): item is VideoDubbingSubtitleAudioItem {
    if (!item || typeof item !== "object") return false;
    const value = item as Partial<VideoDubbingSubtitleAudioItem>;
    return typeof value.id === "string" &&
      SUBTITLE_AUDIO_ID_PATTERN.test(value.id) &&
      Number.isSafeInteger(value.index) &&
      Number.isFinite(value.startTime) &&
      Number.isFinite(value.endTime) &&
      value.startTime! >= 0 &&
      value.endTime! > value.startTime! &&
      typeof value.text === "string" &&
      typeof value.status === "string" &&
      ["pending", "generating", "completed", "failed"].includes(value.status);
  }

  private writeSubtitleAudioItems(
    jobId: string,
    items: VideoDubbingSubtitleAudioItem[],
  ): void {
    const directory = this.requireJobDirectory(jobId);
    fs.mkdirSync(path.join(directory, SUBTITLE_AUDIO_DIRECTORY), { recursive: true });
    const manifestPath = path.join(directory, SUBTITLE_AUDIO_MANIFEST);
    const temporaryPath = `${manifestPath}.${randomBytes(6).toString("hex")}.tmp`;
    const persistedItems = items.map(({ audioUrl: _audioUrl, ...item }) => item);
    fs.writeFileSync(temporaryPath, JSON.stringify(persistedItems, null, 2), "utf8");
    fs.renameSync(temporaryPath, manifestPath);
  }

  private createWavHeader(dataLength: number): Buffer {
    const header = Buffer.alloc(44);
    header.write("RIFF", 0);
    header.writeUInt32LE(36 + dataLength, 4);
    header.write("WAVEfmt ", 8);
    header.writeUInt32LE(16, 16);
    header.writeUInt16LE(1, 20);
    header.writeUInt16LE(1, 22);
    header.writeUInt32LE(SAMPLE_RATE, 24);
    header.writeUInt32LE(SAMPLE_RATE * 2, 28);
    header.writeUInt16LE(2, 32);
    header.writeUInt16LE(16, 34);
    header.write("data", 36);
    header.writeUInt32LE(dataLength, 40);
    return header;
  }

  private readMonoPcmWav(wav: Buffer, cueId: string): Buffer {
    if (wav.length < 44 || wav.toString("ascii", 0, 4) !== "RIFF" || wav.toString("ascii", 8, 12) !== "WAVE") {
      throw new Error(`Audio của câu ${cueId} không phải WAV hợp lệ.`);
    }
    let offset = 12;
    let channels = 0;
    let sampleRate = 0;
    let bitsPerSample = 0;
    let format = 0;
    while (offset + 8 <= wav.length) {
      const chunkId = wav.toString("ascii", offset, offset + 4);
      const chunkSize = wav.readUInt32LE(offset + 4);
      const chunkStart = offset + 8;
      const chunkEnd = chunkStart + chunkSize;
      if (chunkEnd > wav.length) break;
      if (chunkId === "fmt " && chunkSize >= 16) {
        format = wav.readUInt16LE(chunkStart);
        channels = wav.readUInt16LE(chunkStart + 2);
        sampleRate = wav.readUInt32LE(chunkStart + 4);
        bitsPerSample = wav.readUInt16LE(chunkStart + 14);
      } else if (chunkId === "data") {
        if (format !== 1 || channels !== 1 || sampleRate !== SAMPLE_RATE || bitsPerSample !== 16) {
          throw new Error(`Audio của câu ${cueId} không đúng định dạng PCM mono ${SAMPLE_RATE} Hz.`);
        }
        return wav.subarray(chunkStart, chunkEnd);
      }
      offset = chunkEnd + (chunkSize % 2);
    }
    throw new Error(`Không tìm thấy dữ liệu PCM cho câu ${cueId}.`);
  }

  isVoiceAvailable(model: string): boolean {
    return this.timeline.isVoiceAvailable(model);
  }

  start(jobId: string, input: unknown): VideoDubbingMasterGeneration {
    const videoJob = this.manager.getJob(jobId);
    if (!videoJob) throw new Error("Không tìm thấy job Video Dubbing.");
    if (videoJob.status !== "completed" || !videoJob.metadata) {
      throw new Error("Hãy chờ video được kiểm tra thành công trước khi tạo Master.");
    }
    if (this.isBusy(jobId)) {
      throw new Error("TTS Master của job này đang được tạo.");
    }
    if (this.timeline.isMediaBusy?.(jobId)) {
      throw new Error("Job đang trộn hoặc xuất media; hãy chờ tác vụ hoàn tất.");
    }

    const request = this.validateRequest(input);
    if (!this.timeline.isVoiceAvailable(request.model)) {
      throw new Error("Giọng đọc đã chọn không khả dụng.");
    }
    const jobDirectory = this.manager.getJobDirectory(jobId);
    if (!jobDirectory) throw new Error("Không tìm thấy thư mục job Video Dubbing.");
    const workingDirectory = path.join(jobDirectory, "tts_work");
    fs.rmSync(workingDirectory, { recursive: true, force: true });
    fs.mkdirSync(workingDirectory, { recursive: false });

    let timelineJob: TimelineJob;
    try {
      timelineJob = this.timeline.createJob(
        request,
        workingDirectory,
        videoJob.metadata.durationSeconds,
      );
    } catch (error) {
      fs.rmSync(workingDirectory, { recursive: true, force: true });
      throw error;
    }
    const audioItems = this.syncSubtitleAudioItems(
      jobId,
      request.items.map(({ id, index, startTime, endTime, text }) => ({
        id, index, startTime, endTime, text,
      })),
    ).map((item) => ({ ...item, status: "generating" as const, error: undefined }));
    this.writeSubtitleAudioItems(jobId, audioItems);

    const generation: VideoDubbingMasterGeneration = {
      status: "generating",
      progressPercent: 0,
      completedSentences: 0,
      totalSentences: request.items.length,
      durationSeconds: videoJob.masterGeneration?.durationSeconds,
      sizeBytes: videoJob.masterGeneration?.sizeBytes,
    };
    this.manager.setMasterGeneration(jobId, generation);

    const active: ActiveGeneration = {
      timelineJob,
      workingDirectory,
      operation: Promise.resolve(),
      cancelled: false,
    };
    this.activeJobs.set(jobId, active);
    active.operation = this.runGeneration(jobId, videoJob, active);
    return { ...generation };
  }

  refresh(jobId: string): void {
    const active = this.activeJobs.get(jobId);
    if (!active) return;
    const progress = active.timelineJob.overallProgress;
    const previous = this.manager.getJob(jobId)?.masterGeneration;
    this.manager.setMasterGeneration(jobId, {
      status: active.cancelled ? "cancelled" : "generating",
      progressPercent: Math.min(99, Math.max(0, progress.percent || 0)),
      completedSentences: progress.completed,
      totalSentences: progress.total,
      durationSeconds: previous?.durationSeconds,
      sizeBytes: previous?.sizeBytes,
    });
  }

  async cancel(jobId: string): Promise<void> {
    const active = this.activeJobs.get(jobId);
    if (!active) return;
    active.cancelled = true;
    active.timelineJob.status = "cancelled";
    const previous = this.manager.getJob(jobId)?.masterGeneration;
    this.manager.setMasterGeneration(jobId, {
      status: "cancelled",
      progressPercent: active.timelineJob.overallProgress.percent || 0,
      completedSentences: active.timelineJob.overallProgress.completed,
      totalSentences: active.timelineJob.overallProgress.total,
      durationSeconds: previous?.durationSeconds,
      sizeBytes: previous?.sizeBytes,
    });
    await active.operation;
  }

  validateRequest(input: unknown): VideoDubbingMasterRequest {
    if (!input || typeof input !== "object") {
      throw new Error("Thiếu cấu hình tạo TTS Master.");
    }
    const data = input as Record<string, unknown>;
    if (typeof data.model !== "string" || !data.model.trim()) {
      throw new Error("Hãy chọn một giọng đọc.");
    }
    if (!Array.isArray(data.items) || data.items.length === 0) {
      throw new Error("Không có câu phụ đề hợp lệ để tạo TTS Master.");
    }
    if (data.items.length > MAX_SUBTITLE_ITEMS) {
      throw new Error(`SRT vượt quá giới hạn ${MAX_SUBTITLE_ITEMS} câu.`);
    }

    const items: SubtitleItem[] = data.items.map((raw, index) => {
      if (!raw || typeof raw !== "object") {
        throw new Error(`Dữ liệu câu phụ đề #${index + 1} không hợp lệ.`);
      }
      const item = raw as Record<string, unknown>;
      const id = typeof item.id === "string" ? item.id : `video_dubbing_sub_${index + 1}`;
      const startTime = Number(item.startTime);
      const endTime = Number(item.endTime);
      const text = typeof item.text === "string" ? item.text : "";
      const warning =
        typeof item.warning === "string" ? item.warning : undefined;
      if (
        !Number.isFinite(startTime) ||
        !Number.isFinite(endTime) ||
        !SUBTITLE_AUDIO_ID_PATTERN.test(id) ||
        startTime < 0 ||
        endTime <= startTime ||
        !text.trim()
      ) {
        throw new Error(`Timestamp hoặc nội dung câu #${index + 1} không hợp lệ.`);
      }
      return {
        id,
        index: Number.isSafeInteger(item.index) && Number(item.index) > 0
          ? Number(item.index)
          : index + 1,
        startTime,
        endTime,
        targetDuration: Number((endTime - startTime).toFixed(3)),
        text,
        status: "pending",
        warning,
      };
    });

    const options = data.options && typeof data.options === "object"
      ? (data.options as Record<string, unknown>)
      : {};
    const speedPriority =
      options.speedPriority === "strict" || options.speedPriority === "natural"
        ? options.speedPriority
        : "balanced";
    const minSpeed = Number(options.minSpeed);
    const maxSpeed = Number(options.maxSpeed);
    const speakerId =
      data.speakerId === undefined ? undefined : Number(data.speakerId);
    if (
      speakerId !== undefined &&
      (!Number.isInteger(speakerId) || speakerId < 0)
    ) {
      throw new Error("Speaker ID không hợp lệ.");
    }

    return {
      items,
      model: data.model.trim(),
      speakerId,
      options: {
        minSpeed: Number.isFinite(minSpeed) ? minSpeed : 0.8,
        maxSpeed: Number.isFinite(maxSpeed) ? maxSpeed : 1.5,
        speedPriority,
      },
    };
  }

  private persistGeneratedAudioItems(
    jobId: string,
    timelineItems: SubtitleItem[],
    workingDirectory: string,
  ): VideoDubbingSubtitleAudioItem[] {
    const directory = this.requireJobDirectory(jobId);
    const existing = new Map(this.getSubtitleAudioItems(jobId).map((item) => [item.id, item]));
    const next = timelineItems.map((item) => {
      const previous = existing.get(item.id);
      if (item.status === "completed") {
        const source = path.join(workingDirectory, `item_${item.index}_adjusted.wav`);
        if (fs.existsSync(source)) {
          const destination = this.subtitleAudioPath(directory, item.id);
          const temporaryPath = `${destination}.${randomBytes(6).toString("hex")}.tmp`;
          fs.copyFileSync(source, temporaryPath);
          fs.renameSync(temporaryPath, destination);
          return {
            id: item.id,
            index: item.index,
            startTime: item.startTime,
            endTime: item.endTime,
            text: item.text,
            status: "completed" as const,
            generatedText: item.text,
          };
        }
      }
      return {
        id: item.id,
        index: item.index,
        startTime: item.startTime,
        endTime: item.endTime,
        text: item.text,
        status: "failed" as const,
        generatedText: previous?.generatedText,
        error: item.error || (item.status === "completed"
          ? "Không tìm thấy audio TTS đã tạo."
          : previous?.error || "Không tạo được audio TTS."),
      };
    });
    this.writeSubtitleAudioItems(jobId, next);
    return next.filter((item) => item.status !== "completed");
  }

  private async runGeneration(
    videoJobId: string,
    videoJob: VideoDubbingJob,
    active: ActiveGeneration,
  ): Promise<void> {
    let temporaryMasterPath: string | undefined;
    try {
      await this.timeline.processJob(
        active.timelineJob,
        active.workingDirectory,
      );
      const failedItems = this.persistGeneratedAudioItems(
        videoJobId,
        active.timelineJob.items,
        active.workingDirectory,
      );
      if (active.cancelled || active.timelineJob.status === "cancelled") {
        this.setTerminalStatus(videoJobId, active, "cancelled");
        return;
      }
      if (active.timelineJob.status !== "completed") {
        throw new Error(
          active.timelineJob.items.find((item) => item.status === "failed")
            ?.error || "Không thể tạo TTS Master bằng pipeline Đồng Bộ Phụ Đề.",
        );
      }
      if (failedItems.length) {
        const failedItem = failedItems[0];
        throw new Error(
          `Không thể tạo TTS cho ${failedItems.length} câu: ${failedItems
            .map((item) => `#${item.index} (ID ${item.id})`)
            .join(", ")}. Lỗi đầu tiên: ${failedItem.error || "pipeline không hoàn tất câu này"}`,
        );
      }

      const sourceWavPath = path.join(active.workingDirectory, "master.wav");
      if (!fs.existsSync(sourceWavPath)) {
        throw new Error("Pipeline Đồng Bộ Phụ Đề không tạo được Master WAV.");
      }

      const videoDuration = videoJob.metadata?.durationSeconds;
      if (!videoDuration || !Number.isFinite(videoDuration)) {
        throw new Error("Không xác định được thời lượng video nguồn.");
      }
      const predictedTimelineEnd = active.timelineJob.items.reduce(
        (maximum, item) =>
          Math.max(
            maximum,
            item.endTime,
            item.startTime + (item.finalDuration || item.targetDuration),
          ),
        0,
      );
      const shouldTrim = predictedTimelineEnd > videoDuration;
      const jobDirectory = this.manager.getJobDirectory(videoJobId);
      if (!jobDirectory) throw new Error("Không tìm thấy thư mục job Video Dubbing.");
      temporaryMasterPath = path.join(
        jobDirectory,
        `.tts-master-${randomBytes(8).toString("hex")}.tmp.wav`,
      );

      if (shouldTrim) {
        this.trimWav(sourceWavPath, temporaryMasterPath, videoDuration);
      } else {
        fs.copyFileSync(sourceWavPath, temporaryMasterPath);
      }

      let duration = this.timeline.getAudioDuration(temporaryMasterPath);
      if (!Number.isFinite(duration) || duration <= 0) {
        throw new Error("Không đọc được thời lượng TTS Master sau xử lý.");
      }
      const sampleTolerance = 1 / SAMPLE_RATE + 0.001;
      if (!shouldTrim && duration > videoDuration + sampleTolerance) {
        const correctedPath = path.join(
          active.workingDirectory,
          "master-duration-limited.wav",
        );
        this.trimWav(temporaryMasterPath, correctedPath, videoDuration);
        fs.copyFileSync(correctedPath, temporaryMasterPath);
        fs.rmSync(correctedPath, { force: true });
        duration = this.timeline.getAudioDuration(temporaryMasterPath);
      }
      if (duration > videoDuration + sampleTolerance) {
        throw new Error(
          `TTS Master dài hơn video (${duration.toFixed(3)}s > ${videoDuration.toFixed(3)}s) sau khi trim.`,
        );
      }
      if (active.cancelled) {
        this.setTerminalStatus(videoJobId, active, "cancelled");
        return;
      }

      this.manager.completeMasterGeneration(
        videoJobId,
        temporaryMasterPath,
        duration,
        active.timelineJob.items
          .filter(
            (item) =>
              item.status === "completed" &&
              Number.isFinite(item.startTime) &&
              Number.isFinite(item.finalDuration || item.targetDuration) &&
              (item.finalDuration || item.targetDuration) > 0,
          )
          .map((item) => ({
            startTime: item.startTime,
            durationSeconds: item.finalDuration || item.targetDuration,
            text: item.text,
          })),
      );
      temporaryMasterPath = undefined;
      this.timeline.onMasterUpdated?.(videoJobId);
    } catch (error) {
      if (active.cancelled) {
        this.setTerminalStatus(videoJobId, active, "cancelled");
      } else {
        const message =
          error instanceof Error ? error.message : "Không thể tạo TTS Master.";
        const subtitleAudioItems = this.getSubtitleAudioItems(videoJobId).map((item) =>
          item.status === "generating"
            ? { ...item, status: "failed" as const, error: message }
            : item,
        );
        this.writeSubtitleAudioItems(videoJobId, subtitleAudioItems);
        const previous = this.manager.getJob(videoJobId)?.masterGeneration;
        this.manager.setMasterGeneration(videoJobId, {
          status: "failed",
          progressPercent: previous?.progressPercent || 0,
          completedSentences: previous?.completedSentences || 0,
          totalSentences: previous?.totalSentences || 0,
          durationSeconds: previous?.durationSeconds,
          sizeBytes: previous?.sizeBytes,
          error: message,
        });
      }
    } finally {
      const cleanupErrors: string[] = [];
      if (temporaryMasterPath) {
        try {
          fs.rmSync(temporaryMasterPath, { force: true });
        } catch (error) {
          const message =
            error instanceof Error ? error.message : String(error);
          cleanupErrors.push(message);
          console.error("[VideoDubbing] Không thể dọn WAV Master tạm:", error);
        }
      }
      try {
        fs.rmSync(active.workingDirectory, { recursive: true, force: true });
      } catch (error) {
        const message =
          error instanceof Error ? error.message : String(error);
        cleanupErrors.push(message);
        console.error("[VideoDubbing] Không thể dọn thư mục TTS tạm:", error);
      }
      try {
        this.timeline.removeJob(active.timelineJob.id);
      } catch (error) {
        const message =
          error instanceof Error ? error.message : String(error);
        cleanupErrors.push(message);
        console.error("[VideoDubbing] Không thể dọn trạng thái timeline:", error);
      } finally {
        this.activeJobs.delete(videoJobId);
      }
      if (cleanupErrors.length > 0) {
        const previous = this.manager.getJob(videoJobId)?.masterGeneration;
        if (previous) {
          this.manager.setMasterGeneration(videoJobId, {
            ...previous,
            status: "failed",
            error: `Không thể dọn dữ liệu tạm của TTS Master: ${cleanupErrors.join("; ")}`,
          });
        }
      }
    }
  }

  private setTerminalStatus(
    videoJobId: string,
    active: ActiveGeneration,
    status: "cancelled",
  ): void {
    const previous = this.manager.getJob(videoJobId)?.masterGeneration;
    this.manager.setMasterGeneration(videoJobId, {
      status,
      progressPercent: previous?.progressPercent || 0,
      completedSentences: previous?.completedSentences || 0,
      totalSentences: previous?.totalSentences || active.timelineJob.items.length,
      durationSeconds: previous?.durationSeconds,
      sizeBytes: previous?.sizeBytes,
    });
  }

  private trimWav(
    inputPath: string,
    outputPath: string,
    durationSeconds: number,
  ): void {
    const result = spawnSync(
      this.timeline.ffmpegPath,
      [
        "-nostdin",
        "-hide_banner",
        "-loglevel",
        "error",
        "-y",
        "-i",
        inputPath,
        "-t",
        String(durationSeconds),
        "-map",
        "0:a:0",
        "-c:a",
        "pcm_s16le",
        "-ar",
        String(SAMPLE_RATE),
        "-ac",
        "1",
        outputPath,
      ],
      { encoding: "utf8", windowsHide: true, timeout: 120_000 },
    );
    if (result.error || result.status !== 0) {
      throw new Error(
        `Không thể trim TTS Master theo thời lượng video: ${
          result.error?.message ||
          result.stderr?.trim() ||
          `FFmpeg exit ${result.status}`
        }`,
      );
    }
  }
}
