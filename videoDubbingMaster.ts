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

interface TimelineAdapter {
  isPiperVoiceAvailable(model: string): boolean;
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

export class VideoDubbingMasterCoordinator {
  private readonly activeJobs = new Map<string, ActiveGeneration>();

  constructor(
    private readonly manager: VideoDubbingManager,
    private readonly timeline: TimelineAdapter,
  ) {}

  start(jobId: string, input: unknown): VideoDubbingMasterGeneration {
    const videoJob = this.manager.getJob(jobId);
    if (!videoJob) throw new Error("Không tìm thấy job Video Dubbing.");
    if (videoJob.status !== "completed" || !videoJob.metadata) {
      throw new Error("Hãy chờ video được kiểm tra thành công trước khi tạo Master.");
    }
    if (this.activeJobs.has(jobId)) {
      throw new Error("TTS Master của job này đang được tạo.");
    }
    if (this.timeline.isMediaBusy?.(jobId)) {
      throw new Error("Job đang trộn hoặc xuất media; hãy chờ tác vụ hoàn tất.");
    }

    const request = this.validateRequest(input);
    if (!this.timeline.isPiperVoiceAvailable(request.model)) {
      throw new Error("Giọng Piper đã chọn không khả dụng.");
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

  private validateRequest(input: unknown): VideoDubbingMasterRequest {
    if (!input || typeof input !== "object") {
      throw new Error("Thiếu cấu hình tạo TTS Master.");
    }
    const data = input as Record<string, unknown>;
    if (typeof data.model !== "string" || !data.model.trim()) {
      throw new Error("Hãy chọn một giọng Piper.");
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
      const startTime = Number(item.startTime);
      const endTime = Number(item.endTime);
      const text = typeof item.text === "string" ? item.text : "";
      const warning =
        typeof item.warning === "string" ? item.warning : undefined;
      if (
        !Number.isFinite(startTime) ||
        !Number.isFinite(endTime) ||
        startTime < 0 ||
        endTime <= startTime ||
        !text.trim()
      ) {
        throw new Error(`Timestamp hoặc nội dung câu #${index + 1} không hợp lệ.`);
      }
      return {
        id: `video_dubbing_sub_${index + 1}`,
        index: index + 1,
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
      const failedItem = active.timelineJob.items.find(
        (item) => item.status !== "completed",
      );
      if (failedItem) {
        throw new Error(
          `Không tạo được câu phụ đề #${failedItem.index}: ${
            failedItem.error || "pipeline không hoàn tất câu này"
          }`,
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
      );
      temporaryMasterPath = undefined;
      this.timeline.onMasterUpdated?.(videoJobId);
    } catch (error) {
      if (active.cancelled) {
        this.setTerminalStatus(videoJobId, active, "cancelled");
      } else {
        const message =
          error instanceof Error ? error.message : "Không thể tạo TTS Master.";
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
