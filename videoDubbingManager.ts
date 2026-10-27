import { randomBytes } from "crypto";
import fs from "fs";
import path from "path";
import { ChildProcessByStdio, spawn } from "child_process";
import { IncomingMessage } from "http";
import { Readable, Transform } from "stream";
import { pipeline } from "stream/promises";
import {
  VideoDubbingJob,
  VideoDubbingMasterGeneration,
  VideoDubbingMetadata,
} from "./src/types/videoDubbing";

const DEFAULT_MAX_UPLOAD_BYTES = 4 * 1024 * 1024 * 1024;
const PROBE_TIMEOUT_MS = 30_000;
const PROBE_OUTPUT_LIMIT_BYTES = 2 * 1024 * 1024;
const MAX_JOBS = 10;
const SUPPORTED_EXTENSIONS = new Set([".mp4", ".mkv", ".mov", ".avi", ".webm"]);
const JOB_ID_PATTERN = /^vd_[0-9a-f]{32}$/;

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
    return { ...state };
  }

  getJob(jobId: string): VideoDubbingJob | null {
    const job = this.findJob(jobId);
    return job
      ? {
          ...job.state,
          masterGeneration: job.state.masterGeneration
            ? { ...job.state.masterGeneration }
            : undefined,
        }
      : null;
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
      const metadata = await this.probeVideo(job);
      if (isCancelled(job)) return;
      job.state.metadata = metadata;
      job.state.status = "completed";
      job.state.updatedAt = Date.now();
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
