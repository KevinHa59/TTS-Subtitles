import fs from "fs";
import path from "path";
import { randomBytes } from "crypto";
import { ChildProcessByStdio, spawn } from "child_process";
import { Readable } from "stream";
import {
  VideoDubbingJob,
  VideoDubbingMediaTask,
} from "./src/types/videoDubbing";
import { VideoDubbingManager } from "./videoDubbingManager";

const AUDIO_SAMPLE_RATE = 48_000;
const MAX_GAIN_PERCENT = 200;
const PROCESS_OUTPUT_LIMIT = 64 * 1024;
const MAX_MEDIA_TASK_MS = 2 * 60 * 60 * 1000;

interface ProbeStream {
  codec_type?: string;
  codec_name?: string;
  width?: number;
  height?: number;
  duration?: string;
  sample_rate?: string;
  channels?: number;
  r_frame_rate?: string;
  avg_frame_rate?: string;
}

interface MediaProbe {
  streams?: ProbeStream[];
  format?: { duration?: string; size?: string };
}

interface ActiveTask {
  jobId: string;
  kind: "audioMix" | "videoExport";
  child?: ChildProcessByStdio<null, Readable, Readable>;
  cancelled: boolean;
  operation: Promise<void>;
  temporaryFiles: Set<string>;
}

export interface VideoDubbingMediaOptions {
  ffmpegPath: string;
  ffprobePath: string;
}

export class VideoDubbingMediaCoordinator {
  private readonly activeTasks = new Map<string, ActiveTask>();

  constructor(
    private readonly manager: VideoDubbingManager,
    private readonly options: VideoDubbingMediaOptions,
  ) {}

  isBusy(jobId: string): boolean {
    return this.activeTasks.has(jobId);
  }

  startMix(jobId: string, input: unknown): VideoDubbingMediaTask {
    const job = this.requireReadyJob(jobId);
    this.assertNoActiveTask(jobId);
    this.requireMaster(jobId, job);
    const volumes = this.validateVolumes(input);
    const previous = job.audioMix;
    const task = this.createTask(jobId, "audioMix", {
      status: "running",
      phase: "extracting",
      progressPercent: 0,
      ...volumes,
      durationSeconds: previous?.durationSeconds,
      sizeBytes: previous?.sizeBytes,
    });
    const active = this.registerTask(jobId, "audioMix");
    active.operation = this.runMix(job, active, volumes);
    return { ...task };
  }

  startExport(jobId: string): VideoDubbingMediaTask {
    const job = this.requireReadyJob(jobId);
    this.assertNoActiveTask(jobId);
    const mixedAudioPath = this.requireMixedAudio(jobId, job);
    const previous = job.videoExport;
    const task = this.createTask(jobId, "videoExport", {
      status: "running",
      phase: "remuxing",
      progressPercent: 0,
      durationSeconds: previous?.durationSeconds,
      sizeBytes: previous?.sizeBytes,
    });
    const active = this.registerTask(jobId, "videoExport");
    active.operation = this.runExport(job, active, mixedAudioPath);
    return { ...task };
  }

  async cancel(jobId: string): Promise<void> {
    const active = this.activeTasks.get(jobId);
    if (!active) return;
    active.cancelled = true;
    const state = this.getTask(jobId, active.kind);
    if (state) {
      this.createTask(jobId, active.kind, {
        ...state,
        status: "cancelled",
        error: undefined,
      });
    }
    active.child?.kill();
    await active.operation;
  }

  getAudioMixPath(jobId: string): string | null {
    const job = this.manager.getJob(jobId);
    const directory = this.manager.getJobDirectory(jobId);
    if (!job || !directory) return null;
    const filePath = path.join(directory, "mixed-audio.m4a");
    return fs.existsSync(filePath) && fs.statSync(filePath).size > 0
      ? filePath
      : null;
  }

  getVideoExportPath(jobId: string): string | null {
    const job = this.manager.getJob(jobId);
    const directory = this.manager.getJobDirectory(jobId);
    if (!job || !directory) return null;
    const filePath = path.join(directory, "output.mp4");
    return fs.existsSync(filePath) && fs.statSync(filePath).size > 0
      ? filePath
      : null;
  }

  private requireReadyJob(jobId: string): VideoDubbingJob {
    const job = this.manager.getJob(jobId);
    if (!job) throw new Error("Không tìm thấy job Video Dubbing.");
    if (job.status !== "completed" || !job.metadata) {
      throw new Error("Video cần được kiểm tra thành công trước khi xử lý.");
    }
    return job;
  }

  private assertNoActiveTask(jobId: string): void {
    if (
      this.activeTasks.has(jobId) ||
      this.manager.getJob(jobId)?.separation?.status === "processing"
    ) {
      throw new Error("Job này đang có tác vụ FFmpeg khác chạy.");
    }
  }

  private requireMaster(jobId: string, job: VideoDubbingJob): string {
    const masterPath = this.manager.getMasterAudioPath(jobId);
    if (
      !masterPath ||
      !job.masterGeneration ||
      !["completed", "failed", "cancelled"].includes(
        job.masterGeneration.status,
      ) ||
      !job.masterGeneration.sizeBytes
    ) {
      throw new Error("Hãy tạo TTS Master thành công trước khi trộn âm thanh.");
    }
    return masterPath;
  }

  private requireMixedAudio(jobId: string, job: VideoDubbingJob): string {
    if (job.masterGeneration?.status === "generating") {
      throw new Error("Hãy đợi TTS Master hoàn tất trước khi xuất MP4.");
    }
    const mixedAudioPath = this.getAudioMixPath(jobId);
    if (!mixedAudioPath || job.audioMix?.status !== "completed") {
      throw new Error("Hãy tạo bản phối âm thanh thành công trước khi xuất MP4.");
    }
    return mixedAudioPath;
  }

  private validateVolumes(input: unknown): {
    ttsVolumePercent: number;
    originalVolumePercent: number;
  } {
    if (!input || typeof input !== "object") {
      throw new Error("Thiếu cấu hình âm lượng.");
    }
    const values = input as Record<string, unknown>;
    const validate = (value: unknown, label: string) => {
      if (typeof value !== "number" || !Number.isFinite(value)) {
        throw new Error(`${label} phải là số hữu hạn.`);
      }
      if (value < 0 || value > MAX_GAIN_PERCENT) {
        throw new Error(`${label} phải nằm trong khoảng 0–${MAX_GAIN_PERCENT}%.`);
      }
      return value;
    };
    return {
      ttsVolumePercent: validate(values.ttsVolumePercent, "Âm lượng TTS"),
      originalVolumePercent: validate(
        values.originalVolumePercent,
        "Âm lượng audio gốc",
      ),
    };
  }

  private createTask(
    jobId: string,
    kind: "audioMix" | "videoExport",
    task: VideoDubbingMediaTask,
  ): VideoDubbingMediaTask {
    this.manager.setMediaTask(jobId, kind, task);
    return task;
  }

  private getTask(
    jobId: string,
    kind: "audioMix" | "videoExport",
  ): VideoDubbingMediaTask | undefined {
    const job = this.manager.getJob(jobId);
    return kind === "audioMix" ? job?.audioMix : job?.videoExport;
  }

  private registerTask(
    jobId: string,
    kind: "audioMix" | "videoExport",
  ): ActiveTask {
    const active: ActiveTask = {
      jobId,
      kind,
      cancelled: false,
      operation: Promise.resolve(),
      temporaryFiles: new Set(),
    };
    this.activeTasks.set(jobId, active);
    return active;
  }

  private async runMix(
    job: VideoDubbingJob,
    active: ActiveTask,
    volumes: { ttsVolumePercent: number; originalVolumePercent: number },
  ): Promise<void> {
    const directory = this.requireDirectory(active.jobId);
    const originalIsPresent = Boolean(job.metadata?.audioCodec);
    const token = randomBytes(8).toString("hex");
    const originalTemp = path.join(
      directory,
      `.original-audio-${token}.${originalIsPresent ? "mka" : "wav"}`,
    );
    const mixedTemp = path.join(directory, `.mixed-audio-${token}.m4a`);
    active.temporaryFiles.add(originalTemp);
    active.temporaryFiles.add(mixedTemp);
    try {
      if (originalIsPresent) {
        await this.runFfmpeg(
          active,
          [
            "-i",
            this.requireVideoPath(active.jobId),
            "-map",
            "0:a:0",
            "-vn",
            "-c:a",
            "copy",
            originalTemp,
          ],
          job.metadata!.durationSeconds,
          "extracting",
          0,
          10,
        );
      } else {
        await this.runFfmpeg(
          active,
          [
            "-f",
            "lavfi",
            "-i",
            `anullsrc=channel_layout=stereo:sample_rate=${AUDIO_SAMPLE_RATE}`,
            "-t",
            String(job.metadata!.durationSeconds),
            "-c:a",
            "pcm_s16le",
            originalTemp,
          ],
          job.metadata!.durationSeconds,
          "extracting",
          0,
          10,
        );
      }
      this.assertNotCancelled(active);
      this.assertOutputExists(originalTemp, "Không thể trích xuất audio gốc.");
      const masterPath = this.requireMaster(active.jobId, job);
      const duration = job.metadata!.durationSeconds;
      const originalGain = volumes.originalVolumePercent / 100;
      const ttsGain = volumes.ttsVolumePercent / 100;
      const filter =
        `[0:a:0]aresample=${AUDIO_SAMPLE_RATE},volume=${originalGain.toFixed(4)},apad,atrim=duration=${duration},asetpts=PTS-STARTPTS[original];` +
        `[1:a:0]aresample=${AUDIO_SAMPLE_RATE},volume=${ttsGain.toFixed(4)},apad,atrim=duration=${duration},asetpts=PTS-STARTPTS[tts];` +
        `[original][tts]amix=inputs=2:duration=longest:dropout_transition=0:normalize=0,alimiter=limit=0.98:level=disabled[mix]`;

      await this.runFfmpeg(
        active,
        [
          "-i",
          originalTemp,
          "-i",
          masterPath,
          "-filter_complex",
          filter,
          "-map",
          "[mix]",
          "-t",
          String(duration),
          "-c:a",
          "aac",
          "-b:a",
          "192k",
          "-ar",
          String(AUDIO_SAMPLE_RATE),
          "-ac",
          "2",
          "-movflags",
          "+faststart",
          mixedTemp,
        ],
        duration,
        "mixing",
        10,
        90,
      );
      this.assertNotCancelled(active);
      this.createTask(active.jobId, active.kind, {
        status: "running",
        phase: "validating",
        progressPercent: 95,
        ...volumes,
      });
      this.assertOutputExists(mixedTemp, "FFmpeg không tạo được bản phối audio.");
      const probe = await this.probe(mixedTemp, active);
      this.assertNotCancelled(active);
      const audioStream = probe.streams?.find(
        (stream) => stream.codec_type === "audio",
      );
      const outputDuration = Number(probe.format?.duration);
      const tolerance = 0.1;
      if (
        !audioStream ||
        audioStream.codec_name !== "aac" ||
        Number(audioStream.sample_rate) !== AUDIO_SAMPLE_RATE ||
        audioStream.channels !== 2 ||
        !Number.isFinite(outputDuration) ||
        Math.abs(outputDuration - duration) > tolerance
      ) {
        throw new Error(
          `Bản phối audio không hợp lệ hoặc sai thời lượng (video ${duration.toFixed(3)}s, audio ${Number.isFinite(outputDuration) ? outputDuration.toFixed(3) : "?"}s).`,
        );
      }

      const originalFinal = path.join(directory, "original-audio.mka");
      const silenceFinal = path.join(directory, "original-silence.wav");
      const extractionPath = originalIsPresent ? originalFinal : silenceFinal;
      this.publishFile(originalTemp, extractionPath, directory);
      active.temporaryFiles.delete(originalTemp);
      this.publishFile(mixedTemp, path.join(directory, "mixed-audio.m4a"), directory);
      active.temporaryFiles.delete(mixedTemp);
      const previousExport = this.manager.getJob(active.jobId)?.videoExport;
      if (previousExport?.sizeBytes) {
        this.manager.setMediaTask(active.jobId, "videoExport", {
          ...previousExport,
          status: "failed",
          error: "Bản phối âm thanh đã được thay đổi; hãy xuất lại MP4.",
        });
      }
      this.createTask(active.jobId, active.kind, {
        status: "completed",
        progressPercent: 100,
        ...volumes,
        durationSeconds: outputDuration,
        sizeBytes: fs.statSync(path.join(directory, "mixed-audio.m4a")).size,
      });
    } catch (error) {
      this.failOrCancel(active, error);
    } finally {
      await this.cleanup(active);
    }
  }

  private async runExport(
    job: VideoDubbingJob,
    active: ActiveTask,
    mixedAudioPath: string,
  ): Promise<void> {
    const directory = this.requireDirectory(active.jobId);
    const tempOutput = path.join(
      directory,
      `.output-${randomBytes(8).toString("hex")}.mp4`,
    );
    active.temporaryFiles.add(tempOutput);
    const duration = job.metadata!.durationSeconds;
    try {
      await this.runFfmpeg(
        active,
        [
          "-i",
          this.requireVideoPath(active.jobId),
          "-i",
          mixedAudioPath,
          "-map",
          "0:v:0",
          "-map",
          "1:a:0",
          "-map_metadata",
          "0",
          "-map_chapters",
          "0",
          "-c:v",
          "copy",
          "-c:a",
          "copy",
          "-t",
          String(duration),
          "-movflags",
          "+faststart",
          tempOutput,
        ],
        duration,
        "remuxing",
        0,
        90,
      );
      this.assertNotCancelled(active);
      this.createTask(active.jobId, active.kind, {
        status: "running",
        phase: "validating",
        progressPercent: 95,
      });
      this.assertOutputExists(
        tempOutput,
        "FFmpeg không tạo được MP4 đầu ra (codec video/container có thể không tương thích).",
      );
      const probe = await this.probe(tempOutput, active);
      this.assertNotCancelled(active);
      const videoStream = probe.streams?.find(
        (stream) => stream.codec_type === "video",
      );
      const audioStream = probe.streams?.find(
        (stream) => stream.codec_type === "audio",
      );
      const outputDuration = Number(probe.format?.duration);
      const expectedVideo = job.metadata!;
      const durationTolerance = Math.max(
        0.1,
        expectedVideo.frameRate ? 2 / expectedVideo.frameRate : 0,
      );
      if (
        !videoStream ||
        !audioStream ||
        audioStream.codec_name !== "aac" ||
        Number(audioStream.sample_rate) !== AUDIO_SAMPLE_RATE ||
        audioStream.channels !== 2 ||
        !videoStream.codec_name ||
        videoStream.codec_name !== expectedVideo.videoCodec ||
        videoStream.width !== expectedVideo.width ||
        videoStream.height !== expectedVideo.height ||
        !Number.isFinite(outputDuration) ||
        Math.abs(outputDuration - duration) > durationTolerance
      ) {
        throw new Error(
          "MP4 đầu ra không vượt qua xác minh stream video/audio, độ phân giải hoặc thời lượng.",
        );
      }
      this.publishFile(tempOutput, path.join(directory, "output.mp4"), directory);
      active.temporaryFiles.delete(tempOutput);
      this.createTask(active.jobId, active.kind, {
        status: "completed",
        progressPercent: 100,
        durationSeconds: outputDuration,
        sizeBytes: fs.statSync(path.join(directory, "output.mp4")).size,
      });
    } catch (error) {
      this.failOrCancel(active, error);
    } finally {
      await this.cleanup(active);
    }
  }

  private async runFfmpeg(
    active: ActiveTask,
    mediaArgs: string[],
    durationSeconds: number,
    phase: "extracting" | "mixing" | "remuxing",
    progressStart: number,
    progressSpan: number,
  ): Promise<void> {
    this.assertNotCancelled(active);
    const current = this.getTask(active.jobId, active.kind);
    this.createTask(active.jobId, active.kind, {
      ...current,
      status: "running",
      phase,
    });

    await new Promise<void>((resolve, reject) => {
      const child = spawn(
        this.options.ffmpegPath,
        [
          "-nostdin",
          "-hide_banner",
          "-loglevel",
          "error",
          "-y",
          ...mediaArgs.slice(0, -1),
          "-progress",
          "pipe:1",
          "-nostats",
          mediaArgs[mediaArgs.length - 1],
        ],
        {
          shell: false,
          windowsHide: true,
          stdio: ["ignore", "pipe", "pipe"],
        },
      );
      active.child = child;
      let stderr = "";
      let progressBuffer = "";
      let timedOut = false;
      let outputTooLarge = false;
      const timeout = setTimeout(() => {
        timedOut = true;
        child.kill();
      }, MAX_MEDIA_TASK_MS);

      child.stdout.setEncoding("utf8");
      child.stdout.on("data", (chunk: string) => {
        progressBuffer += chunk;
        let lineEnd = progressBuffer.indexOf("\n");
        while (lineEnd >= 0) {
          const line = progressBuffer.slice(0, lineEnd).trim();
          progressBuffer = progressBuffer.slice(lineEnd + 1);
          const match = line.match(/^out_time_(?:us|ms)=(\d+)$/);
          if (match) {
            const seconds = Number(match[1]) / 1_000_000;
            const phaseProgress = Math.max(
              0,
              Math.min(1, seconds / durationSeconds),
            );
            const progressPercent = Math.min(
              94,
              Math.round(progressStart + progressSpan * phaseProgress),
            );
            const state = this.getTask(active.jobId, active.kind);
            if (state?.status === "running") {
              this.createTask(active.jobId, active.kind, {
                ...state,
                phase,
                progressPercent,
              });
            }
          }
          lineEnd = progressBuffer.indexOf("\n");
        }
      });
      child.stderr.setEncoding("utf8");
      child.stderr.on("data", (chunk: string) => {
        stderr += chunk;
        if (Buffer.byteLength(stderr) > PROCESS_OUTPUT_LIMIT) {
          stderr = stderr.slice(-PROCESS_OUTPUT_LIMIT);
          outputTooLarge = true;
          child.kill();
        }
      });
      child.once("error", (error) => {
        clearTimeout(timeout);
        if (active.child === child) active.child = undefined;
        reject(new Error(`Không thể chạy FFmpeg: ${error.message}`));
      });
      child.once("close", (code, signal) => {
        clearTimeout(timeout);
        if (active.child === child) active.child = undefined;
        if (active.cancelled) {
          reject(new Error("Đã hủy tác vụ media."));
        } else if (timedOut) {
          reject(new Error("FFmpeg vượt quá thời gian chờ hai giờ."));
        } else if (outputTooLarge) {
          reject(new Error("FFmpeg tạo đầu ra lỗi vượt giới hạn."));
        } else if (code !== 0) {
          reject(
            new Error(
              stderr.trim() ||
                `FFmpeg thất bại (mã ${code ?? signal ?? "không xác định"}).`,
            ),
          );
        } else {
          resolve();
        }
      });
    });
  }

  private async probe(
    filePath: string,
    active: ActiveTask,
  ): Promise<MediaProbe> {
    const result = await new Promise<string>((resolve, reject) => {
      const child = spawn(
        this.options.ffprobePath,
        [
          "-v",
          "error",
          "-protocol_whitelist",
          "file,crypto,data",
          "-show_entries",
          "format=duration,size:stream=codec_type,codec_name,width,height,duration,sample_rate,channels,r_frame_rate,avg_frame_rate",
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
      let timedOut = false;
      let outputTooLarge = false;
      active.child = child;
      const timeout = setTimeout(() => {
        timedOut = true;
        child.kill();
      }, 30_000);
      child.stdout.on("data", (chunk: Buffer) => {
        stdout += chunk.toString("utf8");
        if (Buffer.byteLength(stdout) > PROCESS_OUTPUT_LIMIT) {
          outputTooLarge = true;
          child.kill();
        }
      });
      child.stderr.on("data", (chunk: Buffer) => {
        stderr = (stderr + chunk.toString("utf8")).slice(-8192);
      });
      child.once("error", (error) => {
        clearTimeout(timeout);
        if (active.child === child) active.child = undefined;
        reject(new Error(`Không thể chạy FFprobe: ${error.message}`));
      });
      child.once("close", (code) => {
        clearTimeout(timeout);
        if (active.child === child) active.child = undefined;
        if (active.cancelled) {
          reject(new Error("Đã hủy xác minh media."));
        } else if (timedOut) {
          reject(new Error("FFprobe quá thời gian chờ 30 giây."));
        } else if (outputTooLarge) {
          reject(new Error("FFprobe trả metadata vượt giới hạn."));
        } else if (code !== 0) {
          reject(
            new Error(stderr.trim() || `FFprobe thất bại (mã ${code}).`),
          );
          return;
        }
        resolve(stdout);
      });
    });
    try {
      return JSON.parse(result) as MediaProbe;
    } catch {
      throw new Error("FFprobe trả metadata không hợp lệ.");
    }
  }

  private requireDirectory(jobId: string): string {
    const directory = this.manager.getJobDirectory(jobId);
    if (!directory) throw new Error("Không tìm thấy thư mục job Video Dubbing.");
    return path.resolve(directory);
  }

  private requireVideoPath(jobId: string): string {
    const directory = this.requireDirectory(jobId);
    const filePath = path.resolve(directory, "source.video");
    if (!filePath.startsWith(`${directory}${path.sep}`) || !fs.existsSync(filePath)) {
      throw new Error("Không tìm thấy video nguồn trong thư mục job.");
    }
    return filePath;
  }

  private assertOutputExists(filePath: string, errorMessage: string): void {
    if (!fs.existsSync(filePath) || fs.statSync(filePath).size <= 0) {
      throw new Error(errorMessage);
    }
  }

  private publishFile(source: string, target: string, directory: string): void {
    const resolvedSource = path.resolve(source);
    const resolvedTarget = path.resolve(target);
    const resolvedDirectory = path.resolve(directory);
    if (
      !resolvedSource.startsWith(`${resolvedDirectory}${path.sep}`) ||
      !resolvedTarget.startsWith(`${resolvedDirectory}${path.sep}`)
    ) {
      throw new Error("Đường dẫn media vượt ra ngoài thư mục job.");
    }
    const backup = `${resolvedTarget}.${randomBytes(6).toString("hex")}.bak`;
    const existed = fs.existsSync(resolvedTarget);
    if (existed) fs.renameSync(resolvedTarget, backup);
    try {
      fs.renameSync(resolvedSource, resolvedTarget);
      if (existed) fs.rmSync(backup, { force: true });
    } catch (error) {
      if (existed && fs.existsSync(backup)) fs.renameSync(backup, resolvedTarget);
      throw error;
    }
  }

  private assertNotCancelled(active: ActiveTask): void {
    if (active.cancelled) throw new Error("Đã hủy tác vụ media.");
  }

  private failOrCancel(active: ActiveTask, error: unknown): void {
    const previous = this.getTask(active.jobId, active.kind);
    if (!previous) return;
    if (active.cancelled) {
      this.createTask(active.jobId, active.kind, {
        ...previous,
        status: "cancelled",
        error: undefined,
      });
      return;
    }
    const message = error instanceof Error ? error.message : String(error);
    this.createTask(active.jobId, active.kind, {
      ...previous,
      status: "failed",
      error: message,
    });
    console.error(`[VideoDubbing] ${active.kind} thất bại:`, error);
  }

  private async cleanup(active: ActiveTask): Promise<void> {
    for (const file of active.temporaryFiles) {
      try {
        await fs.promises.rm(file, { force: true });
      } catch (error) {
        console.error("[VideoDubbing] Không thể dọn file media tạm:", error);
      }
    }
    this.activeTasks.delete(active.jobId);
  }
}
