export interface SubtitleItem {
  id: string;
  index: number;
  startTime: number; // in seconds
  endTime: number; // in seconds
  text: string;
  targetDuration: number; // endTime - startTime
  originalDuration?: number;
  finalDuration?: number;
  appliedSpeed?: number;
  status: 'pending' | 'generating' | 'adjusting' | 'completed' | 'failed' | 'retrying';
  audioUrl?: string;
  error?: string;
  warning?: string;
  retryCount?: number;
}

export type LogLevel = 'INFO' | 'SUCCESS' | 'WARNING' | 'ERROR';

export interface LogEntry {
  id: string;
  timestamp: string; // e.g. "13:58:01"
  level: LogLevel;
  message: string;
}

export interface ProcessingStage {
  id: number;
  name: string;
  status: 'pending' | 'running' | 'completed' | 'failed';
  detail?: string;
}

export interface TimelineJobOptions {
  batchSize: number; // e.g. 1, 2, 4, 8, 16 or custom
  maxSpeed: number; // e.g. 1.5
  minSpeed: number; // e.g. 0.8
  speedPriority: 'balanced' | 'strict' | 'natural';
  padSilence: boolean;
  trimStartMs?: number;
  trimEndMs?: number;
  videoDuration?: number; // in seconds
  outputFormat: 'mp3' | 'wav';
}

export interface TimelineJob {
  id: string;
  model: string;
  speakerId?: number;
  items: SubtitleItem[];
  stages: ProcessingStage[];
  logs: LogEntry[];
  status: 'idle' | 'running' | 'paused' | 'cancelled' | 'completed';
  overallProgress: {
    total: number;
    completed: number;
    running: number;
    queued: number;
    failed: number;
    percent: number;
    totalBatches: number;
    currentBatch: number;
    batchSize: number;
    speedItemsPerSec?: number;
    startTimeMs?: number;
    elapsedMs: number;
    estimatedRemainingMs?: number;
  };
  options: TimelineJobOptions;
  masterAudio?: {
    url: string;
    duration: number;
    format: 'mp3' | 'wav';
    sizeBytes: number;
  };
}
