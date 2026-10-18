export interface StoryCharacter {
  id: string;
  name: string;
  voiceId: string;
  speakerId?: number;
  speed: number;
  color?: string;
  description?: string;
}

export interface StoryParagraph {
  id: string;
  index: number;
  characterId: string;
  text: string;
  audioUrl?: string;
  duration?: number;
  status: 'pending' | 'generating' | 'completed' | 'failed';
  error?: string;
}

export interface StoryMasterAudio {
  url: string;
  downloadUrl: string;
  duration: number;
  format: 'mp3' | 'wav';
  sizeBytes: number;
}

export interface StoryProgress {
  total: number;
  completed: number;
  percent: number;
  currentParagraphIndex?: number;
}

export interface StoryLogEntry {
  timestamp: string;
  level: 'INFO' | 'SUCCESS' | 'WARNING' | 'ERROR';
  message: string;
}

export interface Story {
  id: string;
  title: string;
  rawContent?: string;
  characters: StoryCharacter[];
  paragraphs: StoryParagraph[];
  gapMs: number;
  outputFormat: 'mp3' | 'wav';
  status: 'idle' | 'running' | 'completed' | 'failed';
  progress?: StoryProgress;
  masterAudio?: StoryMasterAudio;
  logs?: StoryLogEntry[];
  error?: string;
  createdAt?: string;
  updatedAt?: string;
}
