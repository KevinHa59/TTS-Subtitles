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
  exportedVideoFileName?: string;
  overlaySettings?: VideoDubbingOverlaySettings;
  separation?: VideoDubbingSeparationTask;
  autoPipeline?: VideoDubbingAutoPipelineState;
  error?: string;
  warning?: string;
  createdAt: number;
  updatedAt: number;
}

export type VideoDubbingOverlayPosition =
  | "top-left"
  | "top-center"
  | "top-right"
  | "middle-left"
  | "middle-center"
  | "middle-right"
  | "bottom-left"
  | "bottom-center"
  | "bottom-right";

export type VideoDubbingExportQuality = "source" | "low" | "medium" | "high";

export interface VideoDubbingSubtitleCue {
  startTime: number;
  endTime: number;
  text: string;
}

export interface VideoDubbingTextOverlayCue extends VideoDubbingSubtitleCue {
  fontSize: number;
  fontFamily: string;
  color: string;
  bold: boolean;
  italic: boolean;
  position: VideoDubbingOverlayPosition;
  /** Optional center point in video coordinates, normalized to 0–100%. */
  xPercent?: number;
  yPercent?: number;
  underline?: boolean;
  textCase?: "none" | "uppercase" | "lowercase" | "capitalize";
  outlineEnabled?: boolean;
  outlineColor?: string;
  outlineWidthPx?: number;
  characterSpacingPx?: number;
  lineSpacingPx?: number;
  backgroundColor: string;
  backgroundTransparent: boolean;
  paddingPx: number;
}

export interface VideoDubbingOverlaySettings {
  exportQuality?: VideoDubbingExportQuality;
  logoEnabled: boolean;
  logoFileName?: string;
  logoWidthPercent: number;
  logoPaddingPx: number;
  logoPosition: VideoDubbingOverlayPosition;
  subtitlesEnabled: boolean;
  subtitles: VideoDubbingSubtitleCue[];
  textOverlays?: VideoDubbingTextOverlayCue[];
  subtitleFontSize: number;
  subtitleFontFamily: string;
  subtitleColor: string;
  subtitleBackgroundColor: string;
  subtitleBackgroundTransparent?: boolean;
  subtitleBackgroundMode?: "none" | "color" | "image";
  subtitleBold: boolean;
  subtitleItalic: boolean;
  subtitleUnderline?: boolean;
  subtitleTextCase?: "none" | "uppercase" | "lowercase" | "capitalize";
  subtitleOutlineEnabled?: boolean;
  subtitleOutlineColor?: string;
  subtitleOutlineWidthPx?: number;
  subtitleCharacterSpacingPx?: number;
  subtitleLineSpacingPx?: number;
  subtitlePaddingPx: number;
  subtitleMarginPx: number;
  subtitleFontSizeScale?: number;
  subtitleVerticalOffsetPx?: number;
  subtitleBackgroundSideScale?: number;
  subtitlePosition: VideoDubbingOverlayPosition;
  subtitleBackgroundImage?: string | null;
  subtitleBackgroundLeftSlicePx?: number;
  subtitleBackgroundRightSlicePx?: number;
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

/** Persistent editable workspace that owns one or more Video Dubbing jobs. */
export interface VideoDubbingProject {
  id: string;
  name: string;
  logoFileName?: string;
  jobIds: string[];
  activeJobId?: string;
  srt?: { fileName: string; content: string };
  /** Source SRT files imported into this project, keyed by their stored id. */
  sourceSrts?: Array<{ id: string; fileName: string; content: string; videoId?: string; matchByName?: boolean }>;
  /** Versioned UI/editor state, validated and size-limited by the API. */
  workspace?: Record<string, unknown>;
  createdAt: number;
  updatedAt: number;
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
  phase?: "extracting" | "mixing" | "remuxing" | "rendering" | "validating";
  progressPercent?: number;
  detail?: string;
  startedAtMs?: number;
  completedAtMs?: number;
  elapsedSeconds?: number;
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
  backend?: "demucs" | "mdx";
  device?: "cpu" | "cuda" | "directml";
  fallbackDevice?: "cpu" | "cuda";
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
  startedAtMs?: number;
  elapsedSeconds?: number;
  /** Refreshed by the server while the separation worker process remains active. */
  heartbeatAtMs?: number;
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
