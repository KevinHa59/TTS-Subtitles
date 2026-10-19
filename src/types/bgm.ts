export type BgmMood =
  | 'horror'
  | 'suspense'
  | 'ancient'
  | 'nature'
  | 'fantasy'
  | 'scifi'
  | 'epic'
  | 'lofi'
  | 'sad';

export type BgmIntensity = 'soft' | 'medium' | 'intense';

export type BgmEngineType = 'procedural' | 'neural';

export interface BgmElements {
  rain?: boolean;
  thunder?: boolean;
  wind?: boolean;
  heartbeat?: boolean;
  chimes?: boolean;
  waves?: boolean;
  vinyl?: boolean;
  drone?: boolean;
}

export interface BgmGenerateRequest {
  prompt: string;
  mood?: BgmMood;
  duration?: number;
  loop?: boolean;
  crossfadeSec?: number;
  intensity?: BgmIntensity;
  format?: 'mp3' | 'wav';
  elements?: BgmElements;
  engine?: BgmEngineType;
  modelId?: string;
}

export interface BgmTrack {
  id: string;
  title: string;
  prompt: string;
  mood: BgmMood;
  duration: number;
  format: 'mp3' | 'wav';
  audioUrl: string;
  downloadUrl: string;
  sizeBytes: number;
  createdAt: string;
  elements?: BgmElements;
  engine?: BgmEngineType;
  modelName?: string;
}

export interface BgmMoodPreset {
  id: BgmMood;
  label: string;
  icon: string;
  tag: string;
  description: string;
  samplePrompts: string[];
  defaultElements: BgmElements;
  color: string;
  bgGradient: string;
}

export type ModelDownloadStatus = 'not_downloaded' | 'downloading' | 'ready' | 'error';

export interface BgmModelInfo {
  id: string;
  name: string;
  description: string;
  sizeFormatted: string;
  sizeBytes: number;
  ramRequired: string;
  recommendedFor: string;
  status: ModelDownloadStatus;
  downloadProgress: number; // 0 - 100
  downloadedBytes: number;
  totalBytes: number;
  downloadSpeedMb: number;
  downloadUrl?: string;
  localPath?: string;
  error?: string;
}

export interface BgmSystemStatus {
  ramTotalMb: number;
  ramFreeMb: number;
  ramFreePercent: number;
  models: BgmModelInfo[];
}
