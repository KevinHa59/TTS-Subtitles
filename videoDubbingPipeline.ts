import { createHash } from "node:crypto";
import fs from "node:fs";
import path from "node:path";
import {
  VideoDubbingAutoPipelineConfig,
  VideoDubbingAutoPipelineStage,
  VideoDubbingAutoPipelineState,
  VideoDubbingJob,
} from "./src/types/videoDubbing";
import { VideoDubbingManager } from "./videoDubbingManager";
import { VideoDubbingMasterCoordinator } from "./videoDubbingMaster";
import { VideoDubbingMediaCoordinator } from "./videoDubbingMedia";
import { VideoDubbingSeparationCoordinator } from "./videoDubbingSeparation";

interface ActivePipeline {
  cancelled: boolean;
  phase: VideoDubbingAutoPipelineStage;
  operation: Promise<void>;
}

const TERMINAL_STATUSES = new Set([
  "completed",
  "failed",
  "cancelled",
  "interrupted",
]);

export class VideoDubbingPipelineCoordinator {
  private readonly activePipelines = new Map<string, ActivePipeline>();

  constructor(
    private readonly manager: VideoDubbingManager,
    private readonly master: VideoDubbingMasterCoordinator,
    private readonly separation: VideoDubbingSeparationCoordinator,
    private readonly media: VideoDubbingMediaCoordinator,
  ) {}

  isBusy(jobId: string): boolean {
    return this.activePipelines.has(jobId);
  }

  configure(
    jobId: string,
    input: unknown,
  ): VideoDubbingAutoPipelineConfig {
    const job = this.requireReadyJob(jobId);
    if (this.isBusy(jobId)) {
      throw new Error("Auto Pipeline của job này đang chạy.");
    }
    if (
      this.master.isBusy(jobId) ||
      this.separation.isBusy(jobId) ||
      this.media.isBusy(jobId)
    ) {
      throw new Error("Job đang có tác vụ TTS, Demucs hoặc media chạy.");
    }
    const config = this.validateConfig(input);
    const masterRequest = this.master.validateRequest(config.master);
    if (!this.master.isVoiceAvailable(masterRequest.model)) {
      throw new Error("Giọng đọc đã chọn không khả dụng.");
    }
    if (config.demucsEnabled && !job.metadata?.audioCodec) {
      throw new Error("Video nguồn không có audio để Demucs tách.");
    }
    const mixerSettings = this.media.validateMixerSettings(config.mixerSettings);
    const normalizedConfig = {
      ...config,
      master: masterRequest,
      mixerSettings,
    };
    const hasEnabledTts =
      !mixerSettings.ttsMaster.muted &&
      mixerSettings.ttsMaster.volumePercent > 0;
    const hasEnabledSeparatedTrack =
      normalizedConfig.demucsEnabled &&
      (["vocals", "instrumental"] as const).some(
        (track) =>
          !mixerSettings[track].muted &&
          mixerSettings[track].volumePercent > 0,
      );
    const hasOriginalAudioFallback =
      !normalizedConfig.demucsEnabled &&
      Boolean(job.metadata?.audioCodec) &&
      normalizedConfig.originalAudioVolumePercent > 0;
    if (
      !hasEnabledTts &&
      !hasEnabledSeparatedTrack &&
      !hasOriginalAudioFallback
    ) {
      throw new Error("Bật ít nhất một nguồn audio để tạo bản phối.");
    }
    if (
      JSON.stringify(job.mixerSettings || null) !==
      JSON.stringify(mixerSettings)
    ) {
      this.manager.updateMixerSettings(jobId, mixerSettings);
    }
    this.manager.setAutoPipelineConfig(jobId, normalizedConfig);
    return normalizedConfig;
  }

  async start(
    jobId: string,
    input: unknown,
  ): Promise<VideoDubbingAutoPipelineState> {
    if (this.isBusy(jobId)) {
      throw new Error("Auto Pipeline của job này đang chạy.");
    }
    if (
      !input ||
      typeof input !== "object" ||
      (input as Record<string, unknown>).enabled !== true
    ) {
      throw new Error("Hãy bật Auto Pipeline trước khi bắt đầu xử lý.");
    }
    const config = this.configure(jobId, input);
    const state: VideoDubbingAutoPipelineState = {
      status: "running",
      phase: "validating",
      completedStages: [],
      reusedOutputs: [],
      artifacts: this.manager.getJob(jobId)?.autoPipeline?.artifacts || {},
      config,
      updatedAt: Date.now(),
    };
    this.manager.setAutoPipelineState(jobId, state);
    const active: ActivePipeline = {
      cancelled: false,
      phase: "validating",
      operation: Promise.resolve(),
    };
    this.activePipelines.set(jobId, active);
    active.operation = this.run(jobId, active, config);
    return state;
  }

  async cancel(jobId: string): Promise<void> {
    const active = this.activePipelines.get(jobId);
    if (!active) return;
    active.cancelled = true;
    if (active.phase === "master") await this.master.cancel(jobId);
    if (active.phase === "separation") await this.separation.cancel(jobId);
    if (active.phase === "finalMix" || active.phase === "export") {
      await this.media.cancel(jobId);
    }
    await active.operation;
  }

  private async run(
    jobId: string,
    active: ActivePipeline,
    config: VideoDubbingAutoPipelineConfig,
  ): Promise<void> {
    try {
      const job = this.requireReadyJob(jobId);
      this.update(jobId, active, {
        status: "running",
        phase: "validating",
        progressPercent: undefined,
        error: undefined,
      });
      if (config.demucsEnabled) {
        const availability = await this.separation.getAvailability();
        if (availability.status !== "ready") {
          throw new Error(
            availability.message || "Demucs chưa sẵn sàng trên máy này.",
          );
        }
      }
      this.checkCancelled(active);
      const sourcePath = this.requireSourceVideo(jobId);
      const sourceFingerprint = this.fileFingerprint(sourcePath);
      const masterInput = this.hash(
        JSON.stringify({
          jobId,
          sourceFingerprint,
          duration: job.metadata?.durationSeconds,
          master: config.master,
        }),
      );
      const masterPath = this.manager.getMasterAudioPath(jobId);
      const masterReusable =
        Boolean(masterPath) &&
        job.masterGeneration?.status === "completed" &&
        this.matchesArtifact(jobId, "master", masterInput, masterPath!);
      if (masterReusable) {
        this.completeStage(jobId, active, "master", true);
      } else {
        active.phase = "master";
        this.update(jobId, active, {
          phase: "master",
          progressPercent: 0,
          error: undefined,
        });
        this.master.start(jobId, config.master);
        const master = await this.waitForStage(jobId, active, "master");
        if (master.status !== "completed") {
          throw new Error(master.error || "Không thể tạo TTS Master.");
        }
        const outputPath = this.manager.getMasterAudioPath(jobId);
        if (!outputPath) throw new Error("TTS Master hoàn tất nhưng file không có.");
        this.setArtifact(jobId, "master", masterInput, outputPath);
        this.completeStage(jobId, active, "master", false);
      }

      this.checkCancelled(active);
      const afterMaster = this.requireReadyJob(jobId);
      const currentMasterPath = this.manager.getMasterAudioPath(jobId);
      if (!currentMasterPath) throw new Error("TTS Master đã bị thiếu.");
      const masterArtifact = this.artifactValue(
        masterInput,
        currentMasterPath,
      );

      let separationArtifact = "";
      if (config.demucsEnabled) {
        const separationInput = this.hash(
          JSON.stringify({ jobId, sourceFingerprint, model: "htdemucs" }),
        );
        const vocalsPath = this.trackPath(jobId, "vocals");
        const instrumentalPath = this.trackPath(jobId, "instrumental");
        const reusable =
          afterMaster.separation?.status === "completed" &&
          vocalsPath !== null &&
          instrumentalPath !== null &&
          this.matchesArtifact(jobId, "separation", separationInput, [
            vocalsPath,
            instrumentalPath,
          ]);
        if (reusable) {
          this.completeStage(jobId, active, "separation", true);
        } else {
          active.phase = "separation";
          this.update(jobId, active, {
            phase: "separation",
            progressPercent: undefined,
            error: undefined,
          });
          await this.separation.start(jobId);
          const result = await this.waitForStage(jobId, active, "separation");
          if (result.status !== "completed") {
            throw new Error(result.error || "Demucs no pudo separar el audio.");
          }
          const outputPaths = [
            this.trackPath(jobId, "vocals"),
            this.trackPath(jobId, "instrumental"),
          ];
          if (outputPaths.some((filePath) => filePath === null)) {
            throw new Error("Demucs terminó sin validar las dos pistas.");
          }
          this.setArtifact(
            jobId,
            "separation",
            separationInput,
            outputPaths as string[],
          );
          this.completeStage(jobId, active, "separation", false);
        }
        separationArtifact =
          this.manager.getJob(jobId)?.autoPipeline?.artifacts.separation || "";
      } else {
        this.skipStage(jobId, active, "separation");
      }

      this.checkCancelled(active);
      const originalGain = config.demucsEnabled
        || !job.metadata?.audioCodec
        ? undefined
        : config.originalAudioVolumePercent;
      const finalMixInput = this.hash(
        JSON.stringify({
          jobId,
          masterArtifact,
          separationArtifact: config.demucsEnabled
            ? separationArtifact
            : sourceFingerprint,
          settings: config.mixerSettings,
          demucsEnabled: config.demucsEnabled,
          originalGain,
        }),
      );
      const current = this.requireReadyJob(jobId);
      const finalMixPath = this.media.getFinalMixPath(jobId);
      const finalMixReusable =
        current.finalMix?.status === "completed" &&
        JSON.stringify(current.finalMix.renderedSettings) ===
          JSON.stringify(config.mixerSettings) &&
        finalMixPath !== null &&
        this.matchesArtifact(jobId, "finalMix", finalMixInput, finalMixPath);
      if (finalMixReusable) {
        this.completeStage(jobId, active, "finalMix", true);
      } else {
        active.phase = "finalMix";
        this.update(jobId, active, {
          phase: "finalMix",
          progressPercent: 0,
          error: undefined,
        });
        this.media.startFinalMix(
          jobId,
          config.mixerSettings,
          originalGain,
          config.demucsEnabled,
        );
        const result = await this.waitForStage(jobId, active, "finalMix");
        if (result.status !== "completed") {
          throw new Error(result.error || "Không thể render Final Mix.");
        }
        const outputPath = this.media.getFinalMixPath(jobId);
        if (!outputPath) throw new Error("Final Mix chưa được xác minh.");
        this.setArtifact(jobId, "finalMix", finalMixInput, outputPath);
        this.completeStage(jobId, active, "finalMix", false);
      }

      this.checkCancelled(active);
      const currentFinalMix = this.media.getFinalMixPath(jobId);
      if (!currentFinalMix) throw new Error("Final Mix đã bị thiếu.");
      const finalMixArtifact = this.artifactValue(
        finalMixInput,
        currentFinalMix,
      );
      const exportInput = this.hash(
        JSON.stringify({
          jobId,
          sourceFingerprint,
          finalMixArtifact,
          output: "mp4-aac-copy-video",
        }),
      );
      const currentAfterMix = this.requireReadyJob(jobId);
      const exportPath = this.media.getVideoExportPath(jobId);
      const exportReusable =
        currentAfterMix.videoExport?.status === "completed" &&
        exportPath !== null &&
        this.matchesArtifact(jobId, "export", exportInput, exportPath);
      if (exportReusable) {
        this.completeStage(jobId, active, "export", true);
      } else {
        active.phase = "export";
        this.update(jobId, active, {
          phase: "export",
          progressPercent: 0,
          error: undefined,
        });
        this.media.startExport(jobId);
        const result = await this.waitForStage(jobId, active, "export");
        if (result.status !== "completed") {
          throw new Error(result.error || "Không thể xuất MP4.");
        }
        const outputPath = this.media.getVideoExportPath(jobId);
        if (!outputPath) throw new Error("MP4 hoàn tất nhưng không tồn tại.");
        this.setArtifact(jobId, "export", exportInput, outputPath);
        this.completeStage(jobId, active, "export", false);
      }

      const finalState = this.requirePipelineState(jobId);
      this.manager.setAutoPipelineState(jobId, {
        ...finalState,
        status: "completed",
        phase: "completed",
        progressPercent: 100,
        updatedAt: Date.now(),
        error: undefined,
      });
    } catch (error) {
      const current = this.manager.getJob(jobId)?.autoPipeline;
      if (current) {
        const message =
          error instanceof Error ? error.message : "Auto Pipeline thất bại.";
        this.manager.setAutoPipelineState(jobId, {
          ...current,
          status: active.cancelled ? "cancelled" : "failed",
          progressPercent: undefined,
          error: active.cancelled ? undefined : message,
          updatedAt: Date.now(),
        });
      }
    } finally {
      this.activePipelines.delete(jobId);
    }
  }

  private async waitForStage(
    jobId: string,
    active: ActivePipeline,
    stage: "master" | "separation" | "finalMix" | "export",
  ): Promise<{ status: string; error?: string }> {
    while (true) {
      this.checkCancelled(active);
      const job = this.manager.getJob(jobId);
      if (!job) throw new Error("Job đã bị xóa.");
      let task:
        | { status: string; progressPercent?: number; error?: string }
        | undefined;
      if (stage === "master") {
        this.master.refresh(jobId);
        task = this.manager.getJob(jobId)?.masterGeneration;
      } else if (stage === "separation") {
        task = this.manager.getJob(jobId)?.separation;
      } else if (stage === "finalMix") {
        task = this.manager.getJob(jobId)?.finalMix;
      } else {
        task = this.manager.getJob(jobId)?.videoExport;
      }
      if (!task) throw new Error(`Không thể đọc trạng thái giai đoạn ${stage}.`);
      this.update(jobId, active, {
        phase: stage,
        progressPercent:
          typeof task.progressPercent === "number"
            ? Math.max(0, Math.min(99, task.progressPercent))
            : undefined,
        error: task.error,
      });
      if (TERMINAL_STATUSES.has(task.status)) {
        if (
          task.status === "completed" &&
          (stage === "finalMix" || stage === "export") &&
          this.media.isBusy(jobId)
        ) {
          await new Promise((resolve) => setTimeout(resolve, 20));
          continue;
        }
        return task;
      }
      await new Promise((resolve) => setTimeout(resolve, 200));
    }
  }

  private validateConfig(input: unknown): VideoDubbingAutoPipelineConfig {
    if (!input || typeof input !== "object") {
      throw new Error("Thiếu cấu hình Auto Pipeline.");
    }
    const values = input as Record<string, unknown>;
    if (typeof values.demucsEnabled !== "boolean") {
      throw new Error("Tùy chọn Demucs không hợp lệ.");
    }
    const originalAudioVolumePercent = values.originalAudioVolumePercent;
    if (
      typeof originalAudioVolumePercent !== "number" ||
      !Number.isFinite(originalAudioVolumePercent) ||
      originalAudioVolumePercent < 0 ||
      originalAudioVolumePercent > 200
    ) {
      throw new Error("Âm lượng audio gốc phải nằm trong khoảng 0–200%.");
    }
    return {
      enabled: values.enabled === true,
      master: values.master as VideoDubbingAutoPipelineConfig["master"],
      demucsEnabled: values.demucsEnabled,
      mixerSettings: this.media.validateMixerSettings(values.mixerSettings),
      originalAudioVolumePercent,
    };
  }

  private requireReadyJob(jobId: string): VideoDubbingJob {
    const job = this.manager.getJob(jobId);
    if (!job) throw new Error("Không tìm thấy job Video Dubbing.");
    if (job.status !== "completed" || !job.metadata) {
      throw new Error("Video nguồn chưa được xác minh thành công.");
    }
    return job;
  }

  private requireSourceVideo(jobId: string): string {
    const filePath = this.manager.getSourceVideoPath(jobId);
    if (!filePath) throw new Error("Video nguồn bị thiếu hoặc không hợp lệ.");
    return filePath;
  }

  private trackPath(
    jobId: string,
    track: "vocals" | "instrumental",
  ): string | null {
    const directory = this.manager.getJobDirectory(jobId);
    if (!directory) return null;
    const filePath = path.join(directory, `${track}.wav`);
    try {
      const stats = fs.statSync(filePath);
      return stats.isFile() && stats.size > 44 ? filePath : null;
    } catch (error) {
      if (this.isMissingFileError(error)) return null;
      throw error;
    }
  }

  private fileFingerprint(filePath: string): string {
    const stats = fs.statSync(filePath);
    return `${stats.dev}:${stats.ino}:${stats.size}:${stats.mtimeMs}`;
  }

  private artifactValue(inputFingerprint: string, filePath: string): string {
    return this.hash(`${inputFingerprint}:${this.fileFingerprint(filePath)}`);
  }

  private matchesArtifact(
    jobId: string,
    stage: "master" | "separation" | "finalMix" | "export",
    inputFingerprint: string,
    output: string | string[],
  ): boolean {
    const stored = this.manager.getJob(jobId)?.autoPipeline?.artifacts[stage];
    if (!stored) return false;
    const paths = Array.isArray(output) ? output : [output];
    try {
      return (
        stored ===
        this.hash(
          `${inputFingerprint}:${paths
            .map((filePath) => this.fileFingerprint(filePath))
            .join(":")}`,
        )
      );
    } catch (error) {
      if (this.isMissingFileError(error)) return false;
      throw error;
    }
  }

  private setArtifact(
    jobId: string,
    stage: "master" | "separation" | "finalMix" | "export",
    inputFingerprint: string,
    output: string | string[],
  ): void {
    const state = this.requirePipelineState(jobId);
    const paths = Array.isArray(output) ? output : [output];
    this.manager.setAutoPipelineState(jobId, {
      ...state,
      artifacts: {
        ...state.artifacts,
        [stage]: this.hash(
          `${inputFingerprint}:${paths
            .map((filePath) => this.fileFingerprint(filePath))
            .join(":")}`,
        ),
      },
      updatedAt: Date.now(),
    });
  }

  private completeStage(
    jobId: string,
    active: ActivePipeline,
    stage: "master" | "separation" | "finalMix" | "export",
    reused: boolean,
  ): void {
    const state = this.requirePipelineState(jobId);
    this.manager.setAutoPipelineState(jobId, {
      ...state,
      phase: stage,
      progressPercent: 100,
      completedStages: state.completedStages.includes(stage)
        ? state.completedStages
        : [...state.completedStages, stage],
      reusedOutputs: reused && !state.reusedOutputs.includes(stage)
        ? [...state.reusedOutputs, stage]
        : state.reusedOutputs,
      updatedAt: Date.now(),
    });
    active.phase = stage;
  }

  private skipStage(
    jobId: string,
    _active: ActivePipeline,
    stage: VideoDubbingAutoPipelineStage,
  ): void {
    const state = this.requirePipelineState(jobId);
    this.manager.setAutoPipelineState(jobId, {
      ...state,
      phase: stage,
      progressPercent: undefined,
      updatedAt: Date.now(),
    });
  }

  private update(
    jobId: string,
    _active: ActivePipeline,
    patch: Partial<VideoDubbingAutoPipelineState>,
  ): void {
    const state = this.requirePipelineState(jobId);
    if (
      Object.entries(patch).every(([key, value]) =>
        Object.is(state[key as keyof VideoDubbingAutoPipelineState], value),
      )
    ) {
      return;
    }
    this.manager.setAutoPipelineState(jobId, {
      ...state,
      ...patch,
      updatedAt: Date.now(),
    });
  }

  private requirePipelineState(jobId: string): VideoDubbingAutoPipelineState {
    const state = this.manager.getJob(jobId)?.autoPipeline;
    if (!state) throw new Error("Không tìm thấy trạng thái Auto Pipeline.");
    return state;
  }

  private checkCancelled(active: ActivePipeline): void {
    if (active.cancelled) throw new Error("Đã hủy Auto Pipeline.");
  }

  private hash(value: string): string {
    return createHash("sha256").update(value).digest("hex");
  }

  private isMissingFileError(error: unknown): boolean {
    return Boolean(
      error &&
        typeof error === "object" &&
        "code" in error &&
        error.code === "ENOENT",
    );
  }
}
