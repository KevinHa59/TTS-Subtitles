import { SubtitleItem } from "./subtitles";

export interface VideoDubbingMetadata {
  durationSeconds: number;
  width: number;
  height: number;
  frameRate: number | null;
  videoCodec: string;
  audioCodec: string | null;
  audioSampleRate: number | null;
  audioChannels: number | null;
  container: string;
  sizeBytes: number;
}

export type VideoDubbingJobStatus =
  | "uploading"
  | "probing"
  | "completed"
  | "failed"
  | "cancelled"
  | "interrupted";

export interface VideoDubbingJob {
  id: string;
  status: VideoDubbingJobStatus;
  fileName: string;
  sizeBytes: number;
  uploadedBytes: number;
  metadata?: VideoDubbingMetadata;
  masterGeneration?: VideoDubbingMasterGeneration;
  audioMix?: VideoDubbingMediaTask;
  finalMix?: VideoDubbingFinalMixTask;
  mixerSettings?: VideoDubbingMixerSettings;
  mixSelection?: "legacy" | "final";
  videoExport?: VideoDubbingMediaTask;
  separation?: VideoDubbingSeparationTask;
  autoPipeline?: VideoDubbingAutoPipelineState;
  error?: string;
  warning?: string;
  createdAt: number;
  updatedAt: number;
}

export interface VideoDubbingAutoPipelineConfig {
  enabled: boolean;
  master: {
    items: SubtitleItem[];
    model: string;
    speakerId?: number;
    options: {
      minSpeed: number;
      maxSpeed: number;
      speedPriority: "balanced" | "strict" | "natural";
    };
  };
  demucsEnabled: boolean;
  mixerSettings: VideoDubbingMixerSettings;
  originalAudioVolumePercent: number;
}

export type VideoDubbingAutoPipelineStatus =
  | "idle"
  | "running"
  | "completed"
  | "failed"
  | "cancelled"
  | "interrupted";

export type VideoDubbingAutoPipelineStage =
  | "validating"
  | "master"
  | "separation"
  | "finalMix"
  | "export"
  | "completed";

export interface VideoDubbingAutoPipelineState {
  status: VideoDubbingAutoPipelineStatus;
  phase: VideoDubbingAutoPipelineStage;
  progressPercent?: number;
  completedStages: VideoDubbingAutoPipelineStage[];
  reusedOutputs: Array<"master" | "separation" | "finalMix" | "export">;
  artifacts: {
    master?: string;
    separation?: string;
    finalMix?: string;
    export?: string;
  };
  config?: VideoDubbingAutoPipelineConfig;
  error?: string;
  updatedAt: number;
}

export type VideoDubbingMixerTrack = "vocals" | "instrumental" | "ttsMaster";

export interface VideoDubbingMixerTrackSettings {
  volumePercent: number;
  muted: boolean;
}

export type VideoDubbingMixerSettings = Record<
  VideoDubbingMixerTrack,
  VideoDubbingMixerTrackSettings
>;

export interface VideoDubbingFinalMixTask {
  status:
    | "idle"
    | "running"
    | "completed"
    | "failed"
    | "cancelled"
    | "stale"
    | "interrupted";
  phase?: "rendering" | "validating";
  progressPercent?: number;
  durationSeconds?: number;
  sizeBytes?: number;
  renderedSettings?: VideoDubbingMixerSettings;
  includedTracks?: Array<VideoDubbingMixerTrack | "originalAudio">;
  error?: string;
}

export interface VideoDubbingJobHistoryItem {
  job: VideoDubbingJob;
  outputs: {
    sourceVideo: boolean;
    masterAudio: boolean;
    vocals: boolean;
    instrumental: boolean;
    mixedAudio: boolean;
    exportedVideo: boolean;
    finalMix: boolean;
  };
  warning?: string;
}

export interface VideoDubbingMasterGeneration {
  status:
    | "idle"
    | "generating"
    | "completed"
    | "failed"
    | "cancelled"
    | "interrupted"
    | "stale";
  progressPercent: number;
  completedSentences: number;
  totalSentences: number;
  durationSeconds?: number;
  sizeBytes?: number;
  error?: string;
}

export type VideoDubbingMediaTaskStatus =
  | "idle"
  | "running"
  | "completed"
  | "failed"
  | "cancelled"
  | "interrupted"
  | "stale";

export interface VideoDubbingMediaTask {
  status: VideoDubbingMediaTaskStatus;
  phase?: "extracting" | "mixing" | "remuxing" | "validating";
  progressPercent?: number;
  ttsVolumePercent?: number;
  originalVolumePercent?: number;
  durationSeconds?: number;
  sizeBytes?: number;
  error?: string;
}

export type VideoDubbingSeparationStatus =
  | "unavailable"
  | "ready"
  | "processing"
  | "completed"
  | "error"
  | "cancelled"
  | "interrupted";

export interface VideoDubbingSeparationAvailability {
  status: "unavailable" | "ready";
  model: string;
  device?: "cpu" | "cuda";
  message: string;
}

export interface VideoDubbingSeparationTask {
  status: Exclude<VideoDubbingSeparationStatus, "ready">;
  phase?:
    | "checking"
    | "extracting"
    | "loading_model"
    | "separating"
    | "writing_outputs"
    | "validating"
    | "interrupted";
  progressPercent?: number;
  completedSegments?: number;
  totalSegments?: number;
  durationSeconds?: number;
  sampleRate?: number;
  channels?: number;
  vocalsSizeBytes?: number;
  instrumentalSizeBytes?: number;
  error?: string;
}

export interface SrtAnalysis {
  subtitleCount: number;
  earliestStart: number;
  latestEnd: number;
  invalidBlockCount: number;
  items: SubtitleItem[];
}
