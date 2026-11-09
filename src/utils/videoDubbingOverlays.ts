import type { VideoDubbingTextOverlayCue } from "../types/videoDubbing";

export function fitTextOverlaysToVideoDuration(
  cues: VideoDubbingTextOverlayCue[],
  duration: number,
): VideoDubbingTextOverlayCue[] {
  return cues
    .filter((cue) => cue.enabled !== false && (cue.isTitle || cue.startTime < duration))
    .map((cue) => ({
      ...cue,
      startTime: cue.isTitle ? 0 : cue.startTime,
      endTime: (cue.isTitle || cue.extendToVideoEnd) && Number.isFinite(duration)
        ? duration
        : Math.min(cue.endTime, duration),
    }))
    .filter((cue) => cue.endTime > cue.startTime);
}
