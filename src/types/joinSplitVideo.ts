export interface JoinSplitVideoStream {
  codecName: string;
  codecTag?: string;
  profile?: string;
  width?: number;
  height?: number;
  pixelFormat?: string;
  level?: number;
  hasBFrames?: number;
  timeBase?: string;
  sampleAspectRatio?: string;
  colorRange?: string;
  colorSpace?: string;
  colorTransfer?: string;
  colorPrimaries?: string;
  fieldOrder?: string;
  frameRate?: number;
  frameRateText?: string;
  nominalFrameRateText?: string;
  sampleRate?: number;
  channels?: number;
  channelLayout?: string;
  extradataHash?: string;
  sampleFormat?: string;
  bitsPerRawSample?: number;
  bitsPerCodedSample?: number;
}

export interface JoinSplitVideoSource {
  id: string;
  fileName: string;
  durationSeconds: number;
  frameRate: number;
  frameRateText: string;
  frameCount: number;
  video: JoinSplitVideoStream;
  audio?: JoinSplitVideoStream;
  keyframeTimes: number[] | null;
}

export interface JoinSplitVideoRange {
  id: string;
  sourceId: string;
  startFrame: number;
  endFrame: number;
  segments?: JoinSplitVideoSegment[];
}

export interface JoinSplitVideoSegment {
  sourceId: string;
  startFrame: number;
  endFrame: number;
}

export interface JoinSplitVideoRangeStatus extends JoinSplitVideoRange {
  requiresEncoding: boolean;
  segmentCount: number;
  encodingSegmentCount: number;
  encodingReasons: string[];
}

export interface JoinSplitVideoExportFile {
  id: string;
  fileName: string;
}
