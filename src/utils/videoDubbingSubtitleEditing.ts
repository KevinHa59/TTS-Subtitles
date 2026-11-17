import type { VideoDubbingSubtitleCue } from "../types/videoDubbing";

export type SubtitleCueCombineMode = "merge" | "join";

export function combineSubtitleCueWithPrevious(
  cues: readonly VideoDubbingSubtitleCue[],
  cueId: string,
  mode: SubtitleCueCombineMode,
  textOverrides: Readonly<Record<string, string>> = {},
): VideoDubbingSubtitleCue[] | null {
  const currentIndex = cues.findIndex((cue) => cue.id === cueId);
  if (currentIndex <= 0) return null;

  const above = cues[currentIndex - 1];
  const current = cues[currentIndex];
  const resolveText = (cue: VideoDubbingSubtitleCue) => {
    const draft = cue.id ? textOverrides[cue.id] : undefined;
    return (draft?.trim() ? draft : cue.text).trim();
  };
  const aboveText = resolveText(above);
  const currentText = resolveText(current);
  const mergedCue: VideoDubbingSubtitleCue = {
    ...above,
    startTime: Math.min(above.startTime, current.startTime),
    endTime: Math.max(above.endTime, current.endTime),
    text: mode === "merge"
      ? aboveText
      : [aboveText, currentText].filter(Boolean).join(" "),
  };

  return cues.flatMap((cue, index) => {
    if (index === currentIndex) return [];
    return index === currentIndex - 1 ? [mergedCue] : [cue];
  });
}
