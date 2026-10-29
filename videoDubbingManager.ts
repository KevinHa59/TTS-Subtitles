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
  VideoDubbingFinalMixTask,
  VideoDubbingMixerSettings,
  VideoDubbingSeparationTask,
  VideoDubbingAutoPipelineConfig,
  VideoDubbingAutoPipelineState,
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
  "stale",
]);
const SEPARATION_STATUSES = new Set([
  "unavailable",
  "processing",
  "completed",
  "error",
  "cancelled",
  "interrupted",
]);
const FINAL_MIX_STATUSES = new Set([
  "idle",
  "running",
  "completed",
  "failed",
  "cancelled",
  "stale",
  "interrupted",
]);
const AUTO_PIPELINE_STATUSES = new Set([
  "idle",
  "running",
  "completed",
  "failed",
  "cancelled",
  "interrupted",
]);
const AUTO_PIPELINE_STAGES = new Set([
  "validating",
  "master",
  "separation",
  "finalMix",
  "export",
  "completed",
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
      renameMetadataFile?: typeof fs.renameSync;
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
          finalMix: job.state.finalMix
            ? {
                ...job.state.finalMix,
                renderedSettings: job.state.finalMix.renderedSettings
                  ? this.cloneMixerSettings(job.state.finalMix.renderedSettings)
                  : undefined,
                includedTracks: job.state.finalMix.includedTracks
                  ? [...job.state.finalMix.includedTracks]
                  : undefined,
              }
            : undefined,
          mixerSettings: job.state.mixerSettings
            ? this.cloneMixerSettings(job.state.mixerSettings)
            : undefined,
          separation: job.state.separation
            ? { ...job.state.separation }
            : undefined,
          autoPipeline: job.state.autoPipeline
            ? this.cloneAutoPipelineState(job.state.autoPipeline)
            : undefined,
        }
      : null;
  }

  setAutoPipelineConfig(
    jobId: string,
    config: VideoDubbingAutoPipelineConfig,
  ): void {
    const job = this.findJob(jobId);
    if (!job) throw new Error("Không tìm thấy job Video Dubbing.");
    const current = job.state.autoPipeline;
    const configChanged = current?.config
      ? JSON.stringify({ ...current.config, enabled: false }) !==
        JSON.stringify({ ...config, enabled: false })
      : Boolean(job.state.finalMix?.sizeBytes || job.state.videoExport?.sizeBytes);
    if (configChanged) {
      if (job.state.finalMix?.renderedSettings) {
        this.invalidateFinalMix(
          job,
          "Cấu hình nguồn âm thanh của Auto Pipeline đã thay đổi.",
        );
      }
      if (job.state.videoExport?.sizeBytes) {
        job.state.videoExport = {
          ...job.state.videoExport,
          status: "stale",
          error: "Cấu hình Auto Pipeline đã thay đổi; hãy render và xuất lại.",
        };
      }
    }
    job.state.autoPipeline = {
      status: current?.status || "idle",
      phase: current?.phase || "validating",
      completedStages: current?.completedStages || [],
      reusedOutputs: current?.reusedOutputs || [],
      ...current,
      config: this.cloneAutoPipelineConfig(config),
      artifacts: configChanged
        ? {
            ...(current?.artifacts || {}),
            finalMix: undefined,
            export: undefined,
          }
        : current?.artifacts || {},
      updatedAt: Date.now(),
    };
    job.state.updatedAt = Date.now();
    this.persistJob(job);
  }

  setAutoPipelineState(
    jobId: string,
    state: VideoDubbingAutoPipelineState,
  ): void {
    const job = this.findJob(jobId);
    if (!job) throw new Error("Không tìm thấy job Video Dubbing.");
    job.state.autoPipeline = this.cloneAutoPipelineState(state);
    job.state.updatedAt = Date.now();
    this.persistJob(job);
  }

  setMediaTask(
    jobId: string,
    task: "audioMix" | "videoExport",
    state: VideoDubbingMediaTask,
  ): void {
    const job = this.findJob(jobId);
    if (!job) throw new Error("Không tìm thấy job Video Dubbing.");
    job.state[task] = { ...state };
    if (task === "audioMix") job.state.mixSelection = "legacy";
    if (task === "videoExport" && job.state.autoPipeline) {
      job.state.autoPipeline.artifacts.export = undefined;
    }
    job.state.updatedAt = Date.now();
    this.persistJob(job);
  }

  setFinalMixTask(jobId: string, state: VideoDubbingFinalMixTask): void {
    const job = this.findJob(jobId);
    if (!job) throw new Error("Không tìm thấy job Video Dubbing.");
    job.state.finalMix = {
      ...state,
      renderedSettings: state.renderedSettings
        ? this.cloneMixerSettings(state.renderedSettings)
        : undefined,
      includedTracks: state.includedTracks
        ? [...state.includedTracks]
        : undefined,
    };
    if (state.status === "running" && job.state.autoPipeline) {
      job.state.autoPipeline.artifacts.finalMix = undefined;
      job.state.autoPipeline.artifacts.export = undefined;
    }
    job.state.mixSelection = "final";
    job.state.updatedAt = Date.now();
    this.persistJob(job);
  }

  updateMixerSettings(
    jobId: string,
    settings: VideoDubbingMixerSettings,
  ): VideoDubbingMixerSettings {
    const job = this.findJob(jobId);
    if (!job) throw new Error("Không tìm thấy job Video Dubbing.");
    if (
      job.state.finalMix?.status === "running" ||
      job.state.videoExport?.status === "running"
    ) {
      throw new Error("Không thể thay đổi mixer settings khi render hoặc xuất video đang chạy.");
    }
    const normalized = this.validateMixerSettings(settings);
    job.state.mixerSettings = normalized;
    job.state.mixSelection = "final";
    if (
      job.state.finalMix?.renderedSettings &&
      JSON.stringify(job.state.finalMix.renderedSettings) !==
        JSON.stringify(normalized)
    ) {
      job.state.finalMix = {
        ...job.state.finalMix,
        status: "stale",
        error: "Mixer settings đã thay đổi; hãy render lại final mix.",
      };
      if (job.state.videoExport?.status === "completed") {
        job.state.videoExport = {
          ...job.state.videoExport,
          status: "stale",
          error: "Mixer settings đã thay đổi; hãy render final mix và xuất lại MP4.",
        } as VideoDubbingJob["videoExport"];
      }
    } else if (
      job.state.finalMix?.renderedSettings &&
      JSON.stringify(job.state.finalMix.renderedSettings) ===
        JSON.stringify(normalized) &&
      ["stale", "failed", "cancelled"].includes(job.state.finalMix.status) &&
      fs.existsSync(path.join(job.directory, "mixed-audio.wav")) &&
      fs.statSync(path.join(job.directory, "mixed-audio.wav")).size > 44
    ) {
      job.state.finalMix = {
        ...job.state.finalMix,
        status: "completed",
        error: undefined,
      };
    }
    job.state.updatedAt = Date.now();
    this.persistJob(job);
    return this.cloneMixerSettings(normalized);
  }

  setSeparationTask(
    jobId: string,
    state: VideoDubbingSeparationTask,
  ): void {
    const job = this.findJob(jobId);
    if (!job) throw new Error("Không tìm thấy job Video Dubbing.");
    if (
      state.status === "completed" &&
      job.state.finalMix?.renderedSettings &&
      job.state.finalMix.includedTracks?.some(
        (track) => track === "vocals" || track === "instrumental",
      )
    ) {
      this.invalidateFinalMix(job, "Các track tách audio đã được thay đổi.");
    }
    if (state.status === "processing" && job.state.autoPipeline) {
      job.state.autoPipeline.artifacts.separation = undefined;
      job.state.autoPipeline.artifacts.finalMix = undefined;
      job.state.autoPipeline.artifacts.export = undefined;
    }
    job.state.separation = { ...state };
    job.state.updatedAt = Date.now();
    this.persistJob(job);
  }

  getJobDirectory(jobId: string): string | null {
    return this.findJob(jobId)?.directory || null;
  }

  getSourceVideoPath(jobId: string): string | null {
    const job = this.findJob(jobId);
    if (!job || job.state.status !== "completed" || !job.state.metadata) {
      return null;
    }
    const videoPath = path.resolve(job.videoPath);
    const directory = path.resolve(job.directory);
    if (!videoPath.startsWith(`${directory}${path.sep}`)) {
      throw new Error("Đường dẫn video nguồn nằm ngoài thư mục job.");
    }
    try {
      const stats = fs.statSync(videoPath);
      return stats.isFile() && stats.size > 0 ? videoPath : null;
    } catch (error) {
      if (
        error &&
        typeof error === "object" &&
        "code" in error &&
        error.code === "ENOENT"
      ) {
        return null;
      }
      throw error;
    }
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
    if (
      generation.status === "generating" &&
      job.state.finalMix?.renderedSettings
    ) {
      this.invalidateFinalMix(job, "TTS Master đang được tạo lại.");
    }
    if (generation.status === "generating" && job.state.autoPipeline) {
      job.state.autoPipeline.artifacts.master = undefined;
      job.state.autoPipeline.artifacts.finalMix = undefined;
      job.state.autoPipeline.artifacts.export = undefined;
    }
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
    if (job.state.finalMix?.renderedSettings) {
      this.invalidateFinalMix(job, "TTS Master đã thay đổi.");
    }
    if (job.state.autoPipeline) {
      job.state.autoPipeline.artifacts.master = undefined;
      job.state.autoPipeline.artifacts.finalMix = undefined;
      job.state.autoPipeline.artifacts.export = undefined;
    }
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

      let metadataCandidates: string[] = [];
      try {
        const names = await fs.promises.readdir(directory);
        metadataCandidates = names
          .filter(
            (name) =>
              name === "job.json" ||
              /^job\.json\.[0-9a-f]{12}\.tmp$/i.test(name),
          )
          .map((name) => path.join(directory, name));
        const candidateStats = await Promise.all(
          metadataCandidates.map(async (candidate) => ({
            path: candidate,
            modifiedAt: (await fs.promises.stat(candidate)).mtimeMs,
          })),
        );
        candidateStats.sort((left, right) => right.modifiedAt - left.modifiedAt);
        metadataCandidates = candidateStats.map((candidate) => candidate.path);
      } catch {
        metadataCandidates = [metadataPath];
      }

      for (const candidatePath of metadataCandidates) {
        try {
          const parsed = JSON.parse(
            await fs.promises.readFile(candidatePath, "utf8"),
          );
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
            (parsed.finalMix &&
              !FINAL_MIX_STATUSES.has(parsed.finalMix.status)) ||
            (parsed.autoPipeline &&
              !AUTO_PIPELINE_STATUSES.has(parsed.autoPipeline.status)) ||
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
          if (state.mixerSettings) {
            try {
              state.mixerSettings = this.validateMixerSettings(
                state.mixerSettings,
              );
            } catch {
              state.mixerSettings = undefined;
              state.warning =
                "Mixer settings cũ không hợp lệ; đã quay về mặc định khi mở mixer.";
            }
          }
          if (state.autoPipeline) {
            state.autoPipeline = this.normalizeAutoPipelineState(
              state.autoPipeline,
            );
          }
          if (candidatePath !== metadataPath) {
            state.warning =
              "Metadata job được khôi phục từ bản ghi tạm sau lỗi thay thế file trên Windows.";
          }
          metadataWasInvalid = false;
          break;
        } catch {
          metadataWasInvalid = true;
          state = null;
        }
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
      if (state.finalMix?.status === "running") {
        state.finalMix = {
          ...state.finalMix,
          status: "interrupted",
          error: "Render final mix bị gián đoạn khi máy chủ dừng.",
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
    const finalMixAudio = await this.isValidAudio(
      path.join(job.directory, "mixed-audio.wav"),
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
      job.state.finalMix?.renderedSettings &&
      !finalMixAudio
    ) {
      job.state.finalMix = {
        ...job.state.finalMix,
        status: "interrupted",
        sizeBytes: undefined,
        durationSeconds: undefined,
        error: "File final mix bị thiếu hoặc không hợp lệ.",
      };
      warnings.push("Final mix không còn khả dụng.");
    } else if (
      finalMixAudio &&
      ![
        "completed",
        "stale",
        "failed",
        "cancelled",
        "interrupted",
      ].includes(job.state.finalMix?.status || "")
    ) {
      job.state.finalMix = {
        ...job.state.finalMix,
        status: "interrupted",
        error: "Có file final mix nhưng metadata xác nhận chưa hoàn tất.",
      };
      warnings.push("Final mix cần được render lại.");
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
        finalMix: finalMixAudio,
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
      const fileDescriptor = fs.openSync(temporaryPath, "r+");
      try {
        fs.fsyncSync(fileDescriptor);
      } finally {
        fs.closeSync(fileDescriptor);
      }

      let renameError: unknown;
      for (const delayMs of [0, 25, 75, 150]) {
        if (delayMs > 0) {
          Atomics.wait(new Int32Array(new SharedArrayBuffer(4)), 0, 0, delayMs);
        }
        try {
          (this.options.renameMetadataFile || fs.renameSync)(
            temporaryPath,
            metadataPath,
          );
          renameError = undefined;
          break;
        } catch (error) {
          renameError = error;
          if (!this.isReplaceLockError(error)) throw error;
        }
      }

      if (renameError) {
        if (!this.isReplaceLockError(renameError)) throw renameError;
        this.removeStaleMetadataTemps(job.directory, temporaryPath);
        console.warn(
          `[VideoDubbing] Không thể thay thế job.json do file bị khóa; giữ metadata mới trong bản ghi tạm để khôi phục khi khởi động lại (${job.state.id}).`,
        );
        return;
      }
      this.removeStaleMetadataTemps(job.directory);
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

  private isReplaceLockError(error: unknown): boolean {
    return Boolean(
      error &&
        typeof error === "object" &&
        "code" in error &&
        (error.code === "EPERM" || error.code === "EBUSY" || error.code === "EACCES"),
    );
  }

  private removeStaleMetadataTemps(
    directory: string,
    keepPath?: string,
  ): void {
    let names: string[];
    try {
      names = fs.readdirSync(directory);
    } catch (error) {
      console.warn("[VideoDubbing] Không thể liệt kê metadata tạm cũ:", error);
      return;
    }
    for (const name of names) {
      if (!/^job\.json\.[0-9a-f]{12}\.tmp$/i.test(name)) continue;
      const candidate = path.join(directory, name);
      if (candidate === keepPath) continue;
      try {
        fs.rmSync(candidate, { force: true });
      } catch (error) {
        console.warn("[VideoDubbing] Không thể dọn metadata tạm cũ:", error);
      }
    }
  }

  private validateMixerSettings(
    value: VideoDubbingMixerSettings,
  ): VideoDubbingMixerSettings {
    const tracks = ["vocals", "instrumental", "ttsMaster"] as const;
    if (!value || typeof value !== "object") {
      throw new Error("Mixer settings không hợp lệ.");
    }
    const result = {} as VideoDubbingMixerSettings;
    for (const track of tracks) {
      const setting = value[track];
      if (
        !setting ||
        typeof setting.volumePercent !== "number" ||
        !Number.isFinite(setting.volumePercent) ||
        setting.volumePercent < 0 ||
        setting.volumePercent > 200 ||
        typeof setting.muted !== "boolean"
      ) {
        throw new Error(`Mixer settings của track ${track} không hợp lệ.`);
      }
      result[track] = {
        volumePercent: setting.volumePercent,
        muted: setting.muted,
      };
    }
    return result;
  }

  private cloneMixerSettings(
    settings: VideoDubbingMixerSettings,
  ): VideoDubbingMixerSettings {
    return {
      vocals: { ...settings.vocals },
      instrumental: { ...settings.instrumental },
      ttsMaster: { ...settings.ttsMaster },
    };
  }

  private normalizeAutoPipelineState(
    input: VideoDubbingAutoPipelineState,
  ): VideoDubbingAutoPipelineState {
    const config = this.normalizeAutoPipelineConfig(input.config);
    const progress =
      typeof input.progressPercent === "number" &&
      Number.isFinite(input.progressPercent)
        ? Math.max(0, Math.min(100, input.progressPercent))
        : undefined;
    const artifacts = input.artifacts && typeof input.artifacts === "object"
      ? Object.fromEntries(
          (["master", "separation", "finalMix", "export"] as const)
            .filter((key) => typeof input.artifacts[key] === "string")
            .map((key) => [key, input.artifacts[key]]),
        )
      : {};
    const wasRunning = input.status === "running";
    return {
      status: wasRunning ? "interrupted" : input.status,
      phase: AUTO_PIPELINE_STAGES.has(input.phase) ? input.phase : "validating",
      progressPercent: wasRunning ? undefined : progress,
      completedStages: Array.isArray(input.completedStages)
        ? input.completedStages.filter((stage) =>
            AUTO_PIPELINE_STAGES.has(stage),
          )
        : [],
      reusedOutputs: Array.isArray(input.reusedOutputs)
        ? input.reusedOutputs.filter((stage) =>
            ["master", "separation", "finalMix", "export"].includes(stage),
          )
        : [],
      artifacts,
      config,
      error: wasRunning
        ? "Auto Pipeline bị gián đoạn khi máy chủ dừng; không tự chạy lại."
        : config || !input.config
          ? input.error
          : "Cấu hình Auto Pipeline đã lưu không hợp lệ; hãy cấu hình lại trước khi chạy.",
      updatedAt: Number.isFinite(input.updatedAt) ? input.updatedAt : Date.now(),
    };
  }

  private normalizeAutoPipelineConfig(
    input: VideoDubbingAutoPipelineConfig | undefined,
  ): VideoDubbingAutoPipelineConfig | undefined {
    if (!input || typeof input !== "object") return undefined;
    try {
      const master = input.master as unknown as Record<string, unknown>;
      const options = master.options as Record<string, unknown>;
      if (
        typeof master.model !== "string" ||
        !master.model.trim() ||
        !Array.isArray(master.items) ||
        master.items.length === 0 ||
        !options ||
        typeof options !== "object" ||
        typeof options.minSpeed !== "number" ||
        typeof options.maxSpeed !== "number" ||
        !Number.isFinite(options.minSpeed) ||
        !Number.isFinite(options.maxSpeed) ||
        !["balanced", "strict", "natural"].includes(
          String(options.speedPriority),
        ) ||
        typeof input.demucsEnabled !== "boolean" ||
        typeof input.originalAudioVolumePercent !== "number" ||
        !Number.isFinite(input.originalAudioVolumePercent) ||
        input.originalAudioVolumePercent < 0 ||
        input.originalAudioVolumePercent > 200
      ) {
        return undefined;
      }
      const items = master.items.map((item) => {
        if (
          !item ||
          typeof item !== "object" ||
          typeof item.text !== "string" ||
          !Number.isFinite(item.startTime) ||
          !Number.isFinite(item.endTime) ||
          Number(item.startTime) < 0 ||
          Number(item.endTime) <= Number(item.startTime)
        ) {
          throw new Error("Invalid subtitle item.");
        }
        return { ...item };
      });
      return {
        enabled: input.enabled === true,
        master: {
          items: items as VideoDubbingAutoPipelineConfig["master"]["items"],
          model: master.model,
          speakerId:
            Number.isInteger(master.speakerId) && Number(master.speakerId) >= 0
              ? Number(master.speakerId)
              : undefined,
          options: {
            minSpeed: options.minSpeed,
            maxSpeed: options.maxSpeed,
            speedPriority: options.speedPriority as
              | "balanced"
              | "strict"
              | "natural",
          },
        },
        demucsEnabled: input.demucsEnabled,
        mixerSettings: this.validateMixerSettings(input.mixerSettings),
        originalAudioVolumePercent: input.originalAudioVolumePercent,
      };
    } catch {
      return undefined;
    }
  }

  private cloneAutoPipelineConfig(
    config: VideoDubbingAutoPipelineConfig,
  ): VideoDubbingAutoPipelineConfig {
    return {
      enabled: config.enabled,
      master: {
        ...config.master,
        items: config.master.items.map((item) => ({ ...item })),
        options: { ...config.master.options },
      },
      demucsEnabled: config.demucsEnabled,
      mixerSettings: this.cloneMixerSettings(config.mixerSettings),
      originalAudioVolumePercent: config.originalAudioVolumePercent,
    };
  }

  private cloneAutoPipelineState(
    state: VideoDubbingAutoPipelineState,
  ): VideoDubbingAutoPipelineState {
    return {
      ...state,
      completedStages: [...state.completedStages],
      reusedOutputs: [...state.reusedOutputs],
      artifacts: { ...state.artifacts },
      config: state.config
        ? this.cloneAutoPipelineConfig(state.config)
        : undefined,
    };
  }

  private invalidateFinalMix(job: InternalJob, reason: string): void {
    if (!job.state.finalMix?.renderedSettings) return;
    job.state.finalMix = {
      ...job.state.finalMix,
      status: "stale",
      error: `${reason} Hãy render lại final mix.`,
    };
    if (job.state.videoExport?.status === "completed") {
      job.state.videoExport = {
        ...job.state.videoExport,
        status: "stale",
        error: `${reason} Hãy render lại final mix và xuất lại MP4.`,
      };
    }
    job.state.mixSelection = "final";
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
