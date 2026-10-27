import { randomBytes } from "crypto";
import fs from "fs";
import path from "path";
import { ChildProcessByStdio, spawn } from "child_process";
import { IncomingMessage } from "http";
import { Readable, Transform } from "stream";
import { pipeline } from "stream/promises";
import {
  VideoDubbingJob,
  VideoDubbingMediaTask,
  VideoDubbingMasterGeneration,
  VideoDubbingMetadata,
  VideoDubbingJobHistoryItem,
  VideoDubbingSeparationTask,
} from "./src/types/videoDubbing";

const DEFAULT_MAX_UPLOAD_BYTES = 4 * 1024 * 1024 * 1024;
const PROBE_TIMEOUT_MS = 30_000;
const PROBE_OUTPUT_LIMIT_BYTES = 2 * 1024 * 1024;
const MAX_JOBS = 10;
const SUPPORTED_EXTENSIONS = new Set([".mp4", ".mkv", ".mov", ".avi", ".webm"]);
const JOB_ID_PATTERN = /^vd_[0-9a-f]{32}$/;
const JOB_STATUSES = new Set([
  "uploading",
  "probing",
  "completed",
  "failed",
  "cancelled",
  "interrupted",
]);
const MASTER_STATUSES = new Set([
  "idle",
  "generating",
  "completed",
  "failed",
  "cancelled",
  "interrupted",
]);
const MEDIA_STATUSES = new Set([
  "idle",
  "running",
  "completed",
  "failed",
  "cancelled",
  "interrupted",
]);
const SEPARATION_STATUSES = new Set([
  "unavailable",
  "processing",
  "completed",
  "error",
  "cancelled",
  "interrupted",
]);

function isCancelled(job: InternalJob): boolean {
  return job.state.status === "cancelled";
}

interface InternalJob {
  state: VideoDubbingJob;
  directory: string;
  videoPath: string;
  uploadRequest?: IncomingMessage;
  probeProcess?: ChildProcessByStdio<null, Readable, Readable>;
  activeTask?: Promise<void>;
}

interface ProbeStream {
  codec_type?: string;
  codec_name?: string;
  width?: number;
  height?: number;
  r_frame_rate?: string;
  avg_frame_rate?: string;
  sample_rate?: string;
  channels?: number;
}

interface ProbeResult {
  streams?: ProbeStream[];
  format?: {
    format_name?: string;
    duration?: string;
  };
}

interface ArtifactProbeResult {
  streams?: Array<{
    codec_type?: string;
    codec_name?: string;
    sample_rate?: string;
    channels?: number;
  }>;
  format?: {
    duration?: string;
    format_name?: string;
  };
}

function configuredMaxUploadBytes(): number {
  const raw = process.env.VIDEO_DUBBING_MAX_UPLOAD_BYTES;
  if (!raw) return DEFAULT_MAX_UPLOAD_BYTES;

  const parsed = Number(raw);
  if (!Number.isSafeInteger(parsed) || parsed <= 0) {
    console.warn(
      `[VideoDubbing] Invalid VIDEO_DUBBING_MAX_UPLOAD_BYTES value "${raw}"; using ${DEFAULT_MAX_UPLOAD_BYTES} bytes.`,
    );
    return DEFAULT_MAX_UPLOAD_BYTES;
  }
  return parsed;
}

function safeDisplayName(fileName: string): string {
  const normalized = fileName.normalize("NFC").replace(/[\u0000-\u001f\u007f]/g, "");
  const withoutPath = normalized.replace(/[\\/]/g, "_").trim();
  if (!withoutPath || withoutPath.length > 255) {
    throw new Error("Tên tệp video không hợp lệ.");
  }
  if (!SUPPORTED_EXTENSIONS.has(path.extname(withoutPath).toLowerCase())) {
    throw new Error("Định dạng tên tệp không được hỗ trợ (MP4, MKV, MOV, AVI, WebM).");
  }
  return withoutPath;
}

function parseFrameRate(value?: string): number | null {
  if (!value || value === "0/0") return null;
  const [numerator, denominator] = value.split("/").map(Number);
  if (
    !Number.isFinite(numerator) ||
    !Number.isFinite(denominator) ||
    denominator === 0
  ) {
    return null;
  }
  const frameRate = numerator / denominator;
  return Number.isFinite(frameRate) && frameRate > 0 ? frameRate : null;
}

function parseOptionalNumber(value?: string | number): number | null {
  if (value === undefined || value === null || value === "") return null;
  const parsed = Number(value);
  return Number.isFinite(parsed) && parsed > 0 ? parsed : null;
}

export class VideoDubbingManager {
  private readonly jobs = new Map<string, InternalJob>();
  private readonly maxUploadBytes: number;
  private initializationPromise?: Promise<void>;

  constructor(
    private readonly options: {
      storageDirectory: string;
      ffprobePath: string;
      maxUploadBytes?: number;
    },
  ) {
    this.maxUploadBytes =
      options.maxUploadBytes ?? configuredMaxUploadBytes();
  }

  createJob(fileName: string, sizeBytes: number): VideoDubbingJob {
    if (this.jobs.size >= MAX_JOBS) {
      throw new Error(
        "Đã đạt giới hạn 10 job Video Dubbing. Hãy bỏ bớt job đã kiểm tra.",
      );
    }
    if (typeof fileName !== "string") {
      throw new Error("Thiếu tên tệp video.");
    }
    const safeName = safeDisplayName(fileName);
    if (!Number.isSafeInteger(sizeBytes) || sizeBytes <= 0) {
      throw new Error("Dung lượng video không hợp lệ hoặc tệp rỗng.");
    }
    if (sizeBytes > this.maxUploadBytes) {
      throw new Error(
        `Video vượt quá giới hạn tải lên (${this.maxUploadBytes} byte).`,
      );
    }

    const id = `vd_${randomBytes(16).toString("hex")}`;
    const directory = path.resolve(this.options.storageDirectory, id);
    const root = path.resolve(this.options.storageDirectory);
    if (!directory.startsWith(`${root}${path.sep}`)) {
      throw new Error("Không thể tạo thư mục job an toàn.");
    }

    fs.mkdirSync(root, { recursive: true });
    fs.mkdirSync(directory, { recursive: false });
    const now = Date.now();
    const state: VideoDubbingJob = {
      id,
      status: "uploading",
      fileName: safeName,
      sizeBytes,
      uploadedBytes: 0,
      masterGeneration: {
        status: "idle",
        progressPercent: 0,
        completedSentences: 0,
        totalSentences: 0,
      },
      createdAt: now,
      updatedAt: now,
    };
    this.jobs.set(id, {
      state,
      directory,
      videoPath: path.join(directory, "source.video"),
    });
    this.persistJob(this.jobs.get(id)!);
    return { ...state };
  }

  async initialize(): Promise<void> {
    if (!this.initializationPromise) {
      this.initializationPromise = this.restoreJobs();
    }
    await this.initializationPromise;
  }

  async listJobs(): Promise<VideoDubbingJobHistoryItem[]> {
    await this.initialize();
    const jobs = [...this.jobs.values()].sort(
      (left, right) => right.state.createdAt - left.state.createdAt,
    );
    const result: VideoDubbingJobHistoryItem[] = [];
    for (const job of jobs) {
      result.push(await this.inspectJobHistory(job));
    }
    return result;
  }

  getJob(jobId: string): VideoDubbingJob | null {
    const job = this.findJob(jobId);
    return job
      ? {
          ...job.state,
          masterGeneration: job.state.masterGeneration
            ? { ...job.state.masterGeneration }
            : undefined,
          audioMix: job.state.audioMix ? { ...job.state.audioMix } : undefined,
          videoExport: job.state.videoExport
            ? { ...job.state.videoExport }
            : undefined,
          separation: job.state.separation
            ? { ...job.state.separation }
            : undefined,
        }
      : null;
  }

  setMediaTask(
    jobId: string,
    task: "audioMix" | "videoExport",
    state: VideoDubbingMediaTask,
  ): void {
    const job = this.findJob(jobId);
    if (!job) throw new Error("Không tìm thấy job Video Dubbing.");
    job.state[task] = { ...state };
    job.state.updatedAt = Date.now();
    this.persistJob(job);
  }

  setSeparationTask(
    jobId: string,
    state: VideoDubbingSeparationTask,
  ): void {
    const job = this.findJob(jobId);
    if (!job) throw new Error("Không tìm thấy job Video Dubbing.");
    job.state.separation = { ...state };
    job.state.updatedAt = Date.now();
    this.persistJob(job);
  }

  getJobDirectory(jobId: string): string | null {
    return this.findJob(jobId)?.directory || null;
  }

  getMasterAudioPath(jobId: string): string | null {
    const job = this.findJob(jobId);
    if (!job) return null;
    const audioPath = path.resolve(job.directory, "tts-master.wav");
    if (!audioPath.startsWith(`${path.resolve(job.directory)}${path.sep}`)) {
      throw new Error("Đường dẫn Master nằm ngoài thư mục job.");
    }
    return fs.existsSync(audioPath) ? audioPath : null;
  }

  setMasterGeneration(
    jobId: string,
    generation: VideoDubbingMasterGeneration,
  ): void {
    const job = this.findJob(jobId);
    if (!job) throw new Error("Không tìm thấy job Video Dubbing.");
    job.state.masterGeneration = { ...generation };
    job.state.updatedAt = Date.now();
    this.persistJob(job);
  }

  completeMasterGeneration(
    jobId: string,
    temporaryPath: string,
    durationSeconds: number,
  ): VideoDubbingMasterGeneration {
    const job = this.findJob(jobId);
    if (!job) throw new Error("Không tìm thấy job Video Dubbing.");
    const directory = path.resolve(job.directory);
    const temporary = path.resolve(temporaryPath);
    if (!temporary.startsWith(`${directory}${path.sep}`)) {
      throw new Error("Tệp Master tạm nằm ngoài thư mục job.");
    }

    const masterPath = path.join(directory, "tts-master.wav");
    const backupPath = path.join(
      directory,
      `.tts-master-${randomBytes(8).toString("hex")}.bak`,
    );
    const hadPreviousMaster = fs.existsSync(masterPath);
    if (hadPreviousMaster) fs.renameSync(masterPath, backupPath);
    try {
      fs.renameSync(temporary, masterPath);
      if (hadPreviousMaster) fs.rmSync(backupPath, { force: true });
    } catch (error) {
      if (hadPreviousMaster && fs.existsSync(backupPath)) {
        fs.renameSync(backupPath, masterPath);
      }
      throw error;
    }

    const generation: VideoDubbingMasterGeneration = {
      status: "completed",
      progressPercent: 100,
      completedSentences: job.state.masterGeneration?.totalSentences || 0,
      totalSentences: job.state.masterGeneration?.totalSentences || 0,
      durationSeconds,
      sizeBytes: fs.statSync(masterPath).size,
    };
    job.state.masterGeneration = generation;
    job.state.updatedAt = Date.now();
    this.persistJob(job);
    return { ...generation };
  }

  async receiveUpload(
    jobId: string,
    request: IncomingMessage,
  ): Promise<VideoDubbingJob> {
    const job = this.findJob(jobId);
    if (!job) throw new Error("Không tìm thấy job Video Dubbing.");
    if (job.state.status !== "uploading") {
      throw new Error("Job này không ở trạng thái nhận video.");
    }

    job.uploadRequest = request;
    const task = this.processUpload(job, request);
    job.activeTask = task;
    try {
      await task;
      return { ...job.state };
    } finally {
      if (job.activeTask === task) job.activeTask = undefined;
      job.uploadRequest = undefined;
    }
  }

  async cancelJob(jobId: string): Promise<VideoDubbingJob | null> {
    const job = this.findJob(jobId);
    if (!job) return null;
    if (job.state.status === "completed" || job.state.status === "failed") {
      return { ...job.state };
    }

    job.state.status = "cancelled";
    job.state.error = undefined;
    job.state.updatedAt = Date.now();
    job.uploadRequest?.destroy();
    job.probeProcess?.kill();
    await job.activeTask?.catch(() => undefined);
    await this.removeJobFiles(job);
    return { ...job.state };
  }

  async deleteJob(jobId: string): Promise<boolean> {
    const job = this.findJob(jobId);
    if (!job) return false;
    job.state.status = "cancelled";
    job.uploadRequest?.destroy();
    job.probeProcess?.kill();
    await job.activeTask?.catch(() => undefined);
    await this.removeJobFiles(job);
    this.jobs.delete(jobId);
    return true;
  }

  isValidJobId(jobId: string): boolean {
    return JOB_ID_PATTERN.test(jobId);
  }

  private findJob(jobId: string): InternalJob | undefined {
    if (!JOB_ID_PATTERN.test(jobId)) return undefined;
    return this.jobs.get(jobId);
  }

  private async restoreJobs(): Promise<void> {
    const root = path.resolve(this.options.storageDirectory);
    await fs.promises.mkdir(root, { recursive: true });
    const entries = await fs.promises.readdir(root, { withFileTypes: true });
    for (const entry of entries) {
      if (!entry.isDirectory() || !JOB_ID_PATTERN.test(entry.name)) continue;
      if (this.jobs.has(entry.name)) continue;
      const directory = path.resolve(root, entry.name);
      if (!directory.startsWith(`${root}${path.sep}`)) continue;
      const videoPath = path.join(directory, "source.video");
      const metadataPath = path.join(directory, "job.json");
      let state: VideoDubbingJob | null = null;
      let metadataWasInvalid = false;

      try {
        const parsed = JSON.parse(await fs.promises.readFile(metadataPath, "utf8"));
        if (
          parsed?.id !== entry.name ||
          typeof parsed.fileName !== "string" ||
          !Number.isSafeInteger(parsed.sizeBytes) ||
          parsed.sizeBytes <= 0 ||
          !Number.isFinite(parsed.createdAt) ||
          !JOB_STATUSES.has(parsed.status) ||
          (parsed.masterGeneration &&
            !MASTER_STATUSES.has(parsed.masterGeneration.status)) ||
          (parsed.audioMix && !MEDIA_STATUSES.has(parsed.audioMix.status)) ||
          (parsed.videoExport &&
            !MEDIA_STATUSES.has(parsed.videoExport.status)) ||
          (parsed.separation &&
            !SEPARATION_STATUSES.has(parsed.separation.status))
        ) {
          throw new Error("Invalid Video Dubbing metadata.");
        }
        state = {
          ...parsed,
          fileName: safeDisplayName(parsed.fileName),
          uploadedBytes: Number.isSafeInteger(parsed.uploadedBytes)
            ? parsed.uploadedBytes
            : 0,
          updatedAt: Number.isFinite(parsed.updatedAt)
            ? parsed.updatedAt
            : parsed.createdAt,
        } as VideoDubbingJob;
      } catch {
        metadataWasInvalid = true;
      }

      if (!state) {
        let sizeBytes = 1;
        let createdAt = Date.now();
        try {
          const stats = await fs.promises.stat(videoPath);
          sizeBytes = Math.max(1, stats.size);
          createdAt = stats.birthtimeMs || stats.mtimeMs;
        } catch {
          try {
            const stats = await fs.promises.stat(directory);
            createdAt = stats.birthtimeMs || stats.mtimeMs;
          } catch {
            // Use current time when filesystem timestamps are unavailable.
          }
        }
        state = {
          id: entry.name,
          status: "interrupted",
          fileName: "video-restored.mp4",
          sizeBytes,
          uploadedBytes: 0,
          createdAt,
          updatedAt: Date.now(),
          warning: "Metadata bị thiếu hoặc không hợp lệ; đã khôi phục từ file còn lại.",
        };
      }

      if (
        state.status === "uploading" ||
        state.status === "probing" ||
        metadataWasInvalid
      ) {
        state.status = "interrupted";
        state.warning =
          state.warning ||
          "Job bị gián đoạn khi máy chủ dừng; các tác vụ không được tự chạy lại.";
      }
      if (state.masterGeneration?.status === "generating") {
        state.masterGeneration = {
          ...state.masterGeneration,
          status: "interrupted",
          error: "Tạo TTS Master bị gián đoạn khi máy chủ dừng.",
        };
      }
      if (state.audioMix?.status === "running") {
        state.audioMix = {
          ...state.audioMix,
          status: "interrupted",
          error: "Trộn âm thanh bị gián đoạn khi máy chủ dừng.",
        };
      }
      if (state.videoExport?.status === "running") {
        state.videoExport = {
          ...state.videoExport,
          status: "interrupted",
          error: "Xuất video bị gián đoạn khi máy chủ dừng.",
        };
      }
      if (state.separation?.status === "processing") {
        state.separation = {
          ...state.separation,
          status: "interrupted",
          phase: "interrupted",
          progressPercent: undefined,
          error: "Tách audio bị gián đoạn khi máy chủ dừng.",
        };
      }
      const job: InternalJob = { state, directory, videoPath };
      this.jobs.set(entry.name, job);

      try {
        const stats = await fs.promises.stat(videoPath);
        if (!stats.isFile() || stats.size <= 0) {
          throw new Error("Không tìm thấy video nguồn hợp lệ.");
        }
        job.state.sizeBytes = stats.size;
        job.state.uploadedBytes = stats.size;
        job.state.metadata = await this.probeVideo(job);
        if (
          job.state.status === "uploading" ||
          job.state.status === "probing" ||
          job.state.status === "interrupted"
        ) {
          job.state.status = "completed";
          job.state.error = undefined;
        }
      } catch (error) {
        job.state.status = "interrupted";
        job.state.metadata = undefined;
        job.state.error =
          error instanceof Error
            ? `Không thể xác minh video nguồn: ${error.message}`
            : "Không thể xác minh video nguồn.";
      }
      job.state.updatedAt = Date.now();
      await this.inspectJobHistory(job);
      this.persistJob(job);
    }
  }

  private async inspectJobHistory(
    job: InternalJob,
  ): Promise<VideoDubbingJobHistoryItem> {
    const sourceVideo =
      job.state.status === "uploading" || job.state.status === "probing"
        ? false
        : await this.isValidVideo(job);
    const masterAudio = await this.isValidAudio(
      path.join(job.directory, "tts-master.wav"),
    );
    const vocals = await this.isValidSeparationTrack(
      path.join(job.directory, "vocals.wav"),
    );
    const instrumental = await this.isValidSeparationTrack(
      path.join(job.directory, "instrumental.wav"),
    );
    const separationAligned =
      vocals &&
      instrumental &&
      Math.abs(
        (await this.probeDuration(path.join(job.directory, "vocals.wav")))! -
          (await this.probeDuration(
            path.join(job.directory, "instrumental.wav"),
          ))!,
      ) <= 0.1;
    const mixedAudio = await this.isValidAudio(
      path.join(job.directory, "mixed-audio.m4a"),
    );
    const exportedVideo = await this.isValidVideoFile(
      path.join(job.directory, "output.mp4"),
    );
    const warnings: string[] = [];

    if (!sourceVideo) warnings.push("Video nguồn bị thiếu hoặc không hợp lệ.");
    if (!sourceVideo && job.state.status === "completed") {
      job.state.status = "interrupted";
      job.state.error = "Video nguồn bị thiếu hoặc không thể xác minh.";
    }
    if (job.state.masterGeneration?.status === "completed" && !masterAudio) {
      job.state.masterGeneration = {
        ...job.state.masterGeneration,
        status: "interrupted",
        durationSeconds: undefined,
        sizeBytes: undefined,
        error: "File TTS Master bị thiếu hoặc không hợp lệ.",
      };
      warnings.push("TTS Master không còn khả dụng.");
    } else if (masterAudio && job.state.masterGeneration?.status !== "completed") {
      const previousGeneration = job.state.masterGeneration;
      const sizeBytes = fs.statSync(path.join(job.directory, "tts-master.wav")).size;
      job.state.masterGeneration = {
        ...previousGeneration,
        status:
          !previousGeneration || previousGeneration.status === "idle"
            ? "completed"
            : previousGeneration.status,
        progressPercent:
          !previousGeneration || previousGeneration.status === "idle"
            ? 100
            : previousGeneration.progressPercent,
        completedSentences: previousGeneration?.completedSentences || 0,
        totalSentences: previousGeneration?.totalSentences || 0,
        sizeBytes,
        durationSeconds:
          previousGeneration?.durationSeconds ||
          (await this.probeDuration(path.join(job.directory, "tts-master.wav"))),
      };
    }
    if (job.state.audioMix?.status === "completed" && !mixedAudio) {
      job.state.audioMix = {
        ...job.state.audioMix,
        status: "interrupted",
        durationSeconds: undefined,
        sizeBytes: undefined,
        error: "File bản phối bị thiếu hoặc không hợp lệ.",
      };
      warnings.push("Bản phối âm thanh không còn khả dụng.");
    } else if (mixedAudio && job.state.audioMix?.status !== "completed") {
      const previousMix = job.state.audioMix;
      job.state.audioMix = {
        ...previousMix,
        status: previousMix?.status || "completed",
        sizeBytes: fs.statSync(path.join(job.directory, "mixed-audio.m4a")).size,
        durationSeconds: await this.probeDuration(
          path.join(job.directory, "mixed-audio.m4a"),
        ),
      };
    }
    if (job.state.videoExport?.status === "completed" && !exportedVideo) {
      job.state.videoExport = {
        ...job.state.videoExport,
        status: "interrupted",
        durationSeconds: undefined,
        sizeBytes: undefined,
        error: "File MP4 xuất ra bị thiếu hoặc không hợp lệ.",
      };
      warnings.push("MP4 xuất ra không còn khả dụng.");
    } else if (exportedVideo && job.state.videoExport?.status !== "completed") {
      const previousExport = job.state.videoExport;
      job.state.videoExport = {
        ...previousExport,
        status: previousExport?.status || "completed",
        sizeBytes: fs.statSync(path.join(job.directory, "output.mp4")).size,
        durationSeconds: await this.probeDuration(
          path.join(job.directory, "output.mp4"),
        ),
      };
    }
    if (
      job.state.separation?.status === "completed" &&
      !separationAligned
    ) {
      job.state.separation = {
        ...job.state.separation,
        status: "interrupted",
        phase: "interrupted",
        progressPercent: undefined,
        vocalsSizeBytes: vocals
          ? fs.statSync(path.join(job.directory, "vocals.wav")).size
          : undefined,
        instrumentalSizeBytes: instrumental
          ? fs.statSync(path.join(job.directory, "instrumental.wav")).size
          : undefined,
        error:
          "Một hoặc cả hai track tách audio bị thiếu, không hợp lệ hoặc lệch thời lượng.",
      };
      warnings.push("Các track tách audio không đầy đủ.");
    } else if (
      separationAligned &&
      job.state.separation?.status !== "completed"
    ) {
      const previousSeparation = job.state.separation;
      job.state.separation = {
        ...previousSeparation,
        status: previousSeparation?.status || "completed",
        progressPercent:
          previousSeparation?.status === undefined ||
          previousSeparation.status === "unavailable"
            ? 100
            : previousSeparation.progressPercent,
        vocalsSizeBytes: fs.statSync(path.join(job.directory, "vocals.wav")).size,
        instrumentalSizeBytes: fs.statSync(
          path.join(job.directory, "instrumental.wav"),
        ).size,
      };
    }

    if (job.state.warning) warnings.push(job.state.warning);
    job.state.updatedAt = Date.now();
    if (fs.existsSync(job.directory)) this.persistJob(job);
    return {
      job: this.getJob(job.state.id)!,
      outputs: {
        sourceVideo,
        masterAudio,
        vocals,
        instrumental,
        mixedAudio,
        exportedVideo,
      },
      warning: warnings.length ? [...new Set(warnings)].join(" ") : undefined,
    };
  }

  private async isValidVideo(job: InternalJob): Promise<boolean> {
    try {
      const stats = await fs.promises.stat(job.videoPath);
      if (!stats.isFile() || stats.size <= 0) return false;
      await this.probeVideo(job);
      return true;
    } catch {
      return false;
    }
  }

  private async isValidVideoFile(filePath: string): Promise<boolean> {
    try {
      const stats = await fs.promises.stat(filePath);
      if (!stats.isFile() || stats.size <= 0) return false;
      const probe = await this.probeArtifact(filePath);
      return Boolean(
        probe.streams?.some((stream) => stream.codec_type === "video") &&
          probe.streams?.some((stream) => stream.codec_type === "audio") &&
          Number(probe.format?.duration) > 0,
      );
    } catch {
      return false;
    }
  }

  private async isValidAudio(filePath: string): Promise<boolean> {
    try {
      const stats = await fs.promises.stat(filePath);
      if (!stats.isFile() || stats.size <= 44) return false;
      const probe = await this.probeArtifact(filePath);
      return Boolean(
        probe.streams?.some((stream) => stream.codec_type === "audio") &&
          Number(probe.format?.duration) > 0,
      );
    } catch {
      return false;
    }
  }

  private async isValidSeparationTrack(filePath: string): Promise<boolean> {
    try {
      const stats = await fs.promises.stat(filePath);
      if (!stats.isFile() || stats.size <= 44) return false;
      const probe = await this.probeArtifact(filePath);
      const stream = probe.streams?.find(
        (candidate) => candidate.codec_type === "audio",
      );
      return Boolean(
        stream?.codec_name === "pcm_s16le" &&
          Number(stream.sample_rate) === 44_100 &&
          stream.channels === 2 &&
          probe.format?.format_name?.split(",").includes("wav") &&
          Number(probe.format?.duration) > 0,
      );
    } catch {
      return false;
    }
  }

  private async probeDuration(filePath: string): Promise<number | undefined> {
    const probe = await this.probeArtifact(filePath);
    const duration = Number(probe.format?.duration);
    return Number.isFinite(duration) && duration > 0 ? duration : undefined;
  }

  private probeArtifact(filePath: string): Promise<ArtifactProbeResult> {
    return new Promise((resolve, reject) => {
      const child = spawn(
        this.options.ffprobePath,
        [
          "-v",
          "error",
          "-protocol_whitelist",
          "file",
          "-show_entries",
          "format=duration,format_name:stream=codec_type,codec_name,sample_rate,channels",
          "-of",
          "json",
          filePath,
        ],
        {
          shell: false,
          windowsHide: true,
          stdio: ["ignore", "pipe", "pipe"],
        },
      );
      let stdout = "";
      let stderr = "";
      const timeout = setTimeout(() => child.kill(), PROBE_TIMEOUT_MS);
      child.stdout.setEncoding("utf8");
      child.stderr.setEncoding("utf8");
      child.stdout.on("data", (chunk: string) => {
        stdout += chunk;
        if (Buffer.byteLength(stdout) > PROBE_OUTPUT_LIMIT_BYTES) child.kill();
      });
      child.stderr.on("data", (chunk: string) => {
        stderr = `${stderr}${chunk}`.slice(-8192);
      });
      child.once("error", (error) => {
        clearTimeout(timeout);
        reject(error);
      });
      child.once("close", (code) => {
        clearTimeout(timeout);
        if (code !== 0) {
          reject(new Error(stderr || "FFprobe không xác minh được file đầu ra."));
          return;
        }
        try {
          resolve(JSON.parse(stdout) as ArtifactProbeResult);
        } catch {
          reject(new Error("FFprobe trả metadata file đầu ra không hợp lệ."));
        }
      });
    });
  }

  private persistJob(job: InternalJob): void {
    const metadataPath = path.join(job.directory, "job.json");
    const temporaryPath = `${metadataPath}.${randomBytes(6).toString("hex")}.tmp`;
    try {
      fs.writeFileSync(temporaryPath, JSON.stringify(job.state), {
        encoding: "utf8",
        flag: "wx",
      });
      fs.renameSync(temporaryPath, metadataPath);
    } catch (error) {
      try {
        fs.rmSync(temporaryPath, { force: true });
      } catch {
        // Preserve the original persistence error.
      }
      throw new Error(
        `Không thể lưu metadata job Video Dubbing: ${
          error instanceof Error ? error.message : "lỗi không xác định"
        }`,
      );
    }
  }

  private async processUpload(
    job: InternalJob,
    request: IncomingMessage,
  ): Promise<void> {
    let receivedBytes = 0;
    const limiter = new Transform({
      transform: (chunk: Buffer, _encoding, callback) => {
        receivedBytes += chunk.length;
        if (receivedBytes > this.maxUploadBytes) {
          callback(new Error("Video vượt quá giới hạn tải lên."));
          return;
        }
        if (receivedBytes > job.state.sizeBytes) {
          callback(new Error("Dữ liệu upload vượt quá kích thước đã khai báo."));
          return;
        }
        job.state.uploadedBytes = receivedBytes;
        job.state.updatedAt = Date.now();
        callback(null, chunk);
      },
    });

    try {
      await pipeline(
        request,
        limiter,
        fs.createWriteStream(job.videoPath, { flags: "wx" }),
      );
      if (isCancelled(job)) return;
      if (receivedBytes !== job.state.sizeBytes) {
        throw new Error("Tệp tải lên không đầy đủ hoặc kích thước không khớp.");
      }

      job.state.status = "probing";
      job.state.updatedAt = Date.now();
      this.persistJob(job);
      const metadata = await this.probeVideo(job);
      if (isCancelled(job)) return;
      job.state.metadata = metadata;
      job.state.status = "completed";
      job.state.updatedAt = Date.now();
      this.persistJob(job);
    } catch (error) {
      if (isCancelled(job)) {
        await this.removeJobFiles(job);
        return;
      }
      const message =
        error instanceof Error ? error.message : "Không thể tải hoặc kiểm tra video.";
      await this.failJob(job, message);
    }
  }

  private async probeVideo(job: InternalJob): Promise<VideoDubbingMetadata> {
    const args = [
      "-v",
      "error",
      "-protocol_whitelist",
      "file",
      "-show_entries",
      "format=format_name,duration:stream=codec_type,codec_name,width,height,r_frame_rate,avg_frame_rate,sample_rate,channels",
      "-of",
      "json",
      job.videoPath,
    ];

    const result = await new Promise<ProbeResult>((resolve, reject) => {
      const child = spawn(this.options.ffprobePath, args, {
        shell: false,
        windowsHide: true,
        stdio: ["ignore", "pipe", "pipe"],
      });
      job.probeProcess = child;
      let stdout = "";
      let stderr = "";
      let outputTooLarge = false;
      let timedOut = false;

      const timeout = setTimeout(() => {
        timedOut = true;
        child.kill();
      }, PROBE_TIMEOUT_MS);

      child.stdout.on("data", (chunk: Buffer) => {
        stdout += chunk.toString("utf8");
        if (Buffer.byteLength(stdout) > PROBE_OUTPUT_LIMIT_BYTES) {
          outputTooLarge = true;
          child.kill();
        }
      });
      child.stderr.on("data", (chunk: Buffer) => {
        stderr = (stderr + chunk.toString("utf8")).slice(-8192);
      });
      child.once("error", (error) => {
        clearTimeout(timeout);
        reject(new Error(`Không thể chạy FFprobe: ${error.message}`));
      });
      child.once("close", (code) => {
        clearTimeout(timeout);
        if (job.probeProcess === child) job.probeProcess = undefined;
        if (isCancelled(job)) {
          reject(new Error("Đã hủy kiểm tra video."));
          return;
        }
        if (timedOut) {
          reject(new Error("FFprobe quá thời gian chờ khi kiểm tra video."));
          return;
        }
        if (outputTooLarge) {
          reject(new Error("FFprobe trả về metadata vượt quá giới hạn."));
          return;
        }
        if (code !== 0) {
          reject(
            new Error(
              stderr.trim() || `FFprobe không đọc được video (mã lỗi ${code}).`,
            ),
          );
          return;
        }
        try {
          resolve(JSON.parse(stdout) as ProbeResult);
        } catch {
          reject(new Error("FFprobe trả về metadata không hợp lệ."));
        }
      });
    });

    const streams = result.streams || [];
    const video = streams.find((stream) => stream.codec_type === "video");
    const audio = streams.find((stream) => stream.codec_type === "audio");
    const durationSeconds = parseOptionalNumber(result.format?.duration);
    const container = result.format?.format_name || "";
    const supportedContainer =
      container.split(",").some((format) =>
        ["avi", "matroska", "webm", "mov", "mp4", "3gp", "3g2", "mj2"].includes(
          format,
        ),
      );

    if (!video || !supportedContainer || !durationSeconds) {
      throw new Error("Tệp không phải video được hỗ trợ hoặc không hợp lệ.");
    }
    const width = parseOptionalNumber(video.width);
    const height = parseOptionalNumber(video.height);
    if (!width || !height || !video.codec_name) {
      throw new Error("FFprobe không tìm thấy thông tin hình ảnh hợp lệ.");
    }

    return {
      durationSeconds,
      width,
      height,
      frameRate:
        parseFrameRate(video.avg_frame_rate) ||
        parseFrameRate(video.r_frame_rate),
      videoCodec: video.codec_name,
      audioCodec: audio?.codec_name || null,
      audioSampleRate: parseOptionalNumber(audio?.sample_rate),
      audioChannels: parseOptionalNumber(audio?.channels),
      container,
      sizeBytes: job.state.sizeBytes,
    };
  }

  private async failJob(job: InternalJob, message: string): Promise<void> {
    job.state.status = "failed";
    job.state.error = message;
    job.state.updatedAt = Date.now();
    this.persistJob(job);
    await this.removeJobFiles(job);
  }

  private async removeJobFiles(job: InternalJob): Promise<void> {
    const root = path.resolve(this.options.storageDirectory);
    const directory = path.resolve(job.directory);
    if (!directory.startsWith(`${root}${path.sep}`)) {
      throw new Error("Đường dẫn job nằm ngoài thư mục Video Dubbing.");
    }
    await fs.promises.rm(directory, { recursive: true, force: true });
  }
}
