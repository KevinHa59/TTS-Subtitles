import type { VideoDubbingSubtitleCue } from "../types/videoDubbing";

export type SubtitleTimingField = "start" | "end" | "move";

export function adjustSubtitleCueTimings(
  cues: VideoDubbingSubtitleCue[],
  field: SubtitleTimingField,
  deltaSeconds: number,
  videoDuration?: number,
): VideoDubbingSubtitleCue[] {
  if (!Number.isFinite(deltaSeconds) || deltaSeconds === 0 || !cues.length) {
    return cues;
  }

  if (field === "move") {
    const earliestStart = Math.min(...cues.map((cue) => cue.startTime));
    const latestEnd = Math.max(...cues.map((cue) => cue.endTime));
    const earliestAllowedShift = -earliestStart;
    const latestAllowedShift =
      typeof videoDuration === "number" && Number.isFinite(videoDuration)
        ? videoDuration - latestEnd
        : Number.POSITIVE_INFINITY;
    if (earliestAllowedShift > latestAllowedShift) return cues;
    const shift = Math.max(
      earliestAllowedShift,
      Math.min(deltaSeconds, latestAllowedShift),
    );
    return cues.map((cue) => ({
      ...cue,
      startTime: cue.startTime + shift,
      endTime: cue.endTime + shift,
    }));
  }

  const sorted = cues
    .map((cue, index) => ({ cue, index }))
    .sort((left, right) => left.cue.startTime - right.cue.startTime);
  const cueOrder = new Map(
    sorted.map(({ index }, position) => [index, position]),
  );
  return cues.map((cue, index) => {
    const position = cueOrder.get(index) ?? 0;
    const previous = sorted[position - 1]?.cue;
    const next = sorted[position + 1]?.cue;
    if (field === "start") {
      if (
        deltaSeconds < 0 &&
        ((previous && previous.endTime > cue.startTime) ||
          (next && next.startTime < cue.endTime))
      ) {
        return cue;
      }
      const earliest = previous?.endTime ?? 0;
      const latest = cue.endTime - 0.001;
      if (earliest > latest) return cue;
      return {
        ...cue,
        startTime: Math.max(
          earliest,
          Math.min(latest, cue.startTime + deltaSeconds),
        ),
      };
    }

    if (
      deltaSeconds > 0 &&
      ((previous && previous.endTime > cue.startTime) ||
        (next && next.startTime < cue.endTime))
    ) {
      return cue;
    }
    const earliest = cue.startTime + 0.001;
    const latest = Math.min(
      next?.startTime ?? Number.POSITIVE_INFINITY,
      typeof videoDuration === "number" && Number.isFinite(videoDuration)
        ? videoDuration
        : Number.POSITIVE_INFINITY,
    );
    if (latest < earliest) return cue;
    return {
      ...cue,
      endTime: Math.max(
        earliest,
        Math.min(latest, cue.endTime + deltaSeconds),
      ),
    };
  });
}
