export interface PreviewMediaElement {
  currentTime: number;
  duration: number;
  paused: boolean;
  ended: boolean;
  play(): Promise<void>;
  pause(): void;
}

const END_TOLERANCE_SECONDS = 0.04;
const DRIFT_TOLERANCE_SECONDS = 0.12;

export class VideoDubbingPreviewController {
  private playing = false;
  private interval: ReturnType<typeof setInterval> | null = null;
  private disposed = false;

  constructor(
    private readonly video: PreviewMediaElement,
    private readonly tracks: PreviewMediaElement[],
    private readonly durationSeconds: number,
    private readonly onTimeUpdate: (timeSeconds: number) => void,
    private readonly onError: (error: unknown) => void,
  ) {}

  async play(): Promise<void> {
    if (this.disposed) throw new Error("Video preview đã được đóng.");
    if (this.video.currentTime >= this.durationSeconds - END_TOLERANCE_SECONDS) {
      this.seek(0);
    }

    this.syncTrackPositions(this.video.currentTime);
    const playPromises: Promise<void>[] = [this.video.play()];
    for (const track of this.tracks) {
      if (this.trackHasAudioAt(track, this.video.currentTime)) {
        playPromises.push(track.play());
      } else {
        track.pause();
      }
    }
    this.playing = true;
    this.startClock();
    try {
      await Promise.all(playPromises);
    } catch (error) {
      this.pause();
      throw error;
    }
  }

  pause(): void {
    this.playing = false;
    this.stopClock();
    this.video.pause();
    for (const track of this.tracks) track.pause();
    this.onTimeUpdate(this.clampTime(this.video.currentTime));
  }

  seek(timeSeconds: number): void {
    const seekTo = this.clampTime(timeSeconds);
    this.video.currentTime = seekTo;
    this.syncTrackPositions(seekTo);
    if (seekTo >= this.durationSeconds - END_TOLERANCE_SECONDS) {
      this.pause();
    }
    this.onTimeUpdate(seekTo);
  }

  async restart(): Promise<void> {
    this.seek(0);
    await this.play();
  }

  sync(): void {
    if (!this.playing || this.disposed) return;
    const videoTime = this.clampTime(this.video.currentTime);
    if (
      this.video.ended ||
      videoTime >= this.durationSeconds - END_TOLERANCE_SECONDS
    ) {
      this.video.pause();
      for (const track of this.tracks) track.pause();
      this.playing = false;
      this.stopClock();
      this.onTimeUpdate(this.durationSeconds);
      return;
    }

    for (const track of this.tracks) {
      if (!this.trackHasAudioAt(track, videoTime)) {
        track.pause();
        continue;
      }
      if (Math.abs(track.currentTime - videoTime) > DRIFT_TOLERANCE_SECONDS) {
        track.currentTime = videoTime;
      }
      if (track.paused) {
        void track.play().catch((error: unknown) => this.onError(error));
      }
    }
    this.onTimeUpdate(videoTime);
  }

  dispose(): void {
    if (this.disposed) return;
    this.playing = false;
    this.stopClock();
    this.video.pause();
    for (const track of this.tracks) track.pause();
    this.disposed = true;
  }

  private syncTrackPositions(timeSeconds: number): void {
    for (const track of this.tracks) {
      const duration = Number.isFinite(track.duration)
        ? Math.max(0, track.duration)
        : this.durationSeconds;
      const position = Math.min(timeSeconds, duration);
      track.currentTime = position;
      if (timeSeconds >= duration - END_TOLERANCE_SECONDS) {
        track.pause();
      }
    }
  }

  private trackHasAudioAt(
    track: PreviewMediaElement,
    timeSeconds: number,
  ): boolean {
    return (
      (!Number.isFinite(track.duration) ||
        timeSeconds < track.duration - END_TOLERANCE_SECONDS)
    );
  }

  private clampTime(timeSeconds: number): number {
    if (!Number.isFinite(timeSeconds)) return 0;
    return Math.max(0, Math.min(this.durationSeconds, timeSeconds));
  }

  private startClock(): void {
    this.stopClock();
    this.interval = setInterval(() => this.sync(), 100);
  }

  private stopClock(): void {
    if (this.interval === null) return;
    clearInterval(this.interval);
    this.interval = null;
  }
}
