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
  | "cancelled";

export interface VideoDubbingJob {
  id: string;
  status: VideoDubbingJobStatus;
  fileName: string;
  sizeBytes: number;
  uploadedBytes: number;
  metadata?: VideoDubbingMetadata;
  error?: string;
  createdAt: number;
  updatedAt: number;
}

export interface SrtAnalysis {
  subtitleCount: number;
  earliestStart: number;
  latestEnd: number;
  invalidBlockCount: number;
}
