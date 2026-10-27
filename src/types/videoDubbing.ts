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
  videoExport?: VideoDubbingMediaTask;
  separation?: VideoDubbingSeparationTask;
  error?: string;
  warning?: string;
  createdAt: number;
  updatedAt: number;
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
    | "interrupted";
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
  | "interrupted";

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
