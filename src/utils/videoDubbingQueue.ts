import type { SubtitleItem } from "../types/subtitles";
import type { VideoDubbingSubtitleCue } from "../types/videoDubbing";

export interface VideoDubbingQueueRow<TVideo, TSubtitle> {
  index: number;
  video?: TVideo;
  subtitle?: TSubtitle;
}

export function resolveVideoDubbingTtsItems(
  videoId: string | undefined,
  overridesByVideoId: Readonly<Record<string, readonly VideoDubbingSubtitleCue[] | undefined>>,
  fallbackItems: readonly SubtitleItem[],
): SubtitleItem[] {
  const overrides = videoId ? overridesByVideoId[videoId] : undefined;
  if (!overrides) return fallbackItems.map((item) => ({ ...item }));

  return overrides.map((cue, index) => ({
    id: `timeline-${index + 1}`,
    index: index + 1,
    startTime: cue.startTime,
    endTime: cue.endTime,
    targetDuration: Math.max(0.1, Number((cue.endTime - cue.startTime).toFixed(3))),
    text: cue.text,
    status: "pending",
  }));
}

export function pairVideoDubbingQueueRows<
  TVideo extends { name: string; id?: string; job?: { id: string } },
  TSubtitle extends { fileName: string; videoId?: string; matchByName?: boolean },
>(
  videos: readonly TVideo[],
  subtitles: readonly TSubtitle[],
): VideoDubbingQueueRow<TVideo, TSubtitle>[] {
  const subtitleIndicesByName = new Map<string, number[]>();
  subtitles.forEach((subtitle, index) => {
    const key = fileStem(subtitle.fileName);
    subtitleIndicesByName.set(key, [
      ...(subtitleIndicesByName.get(key) || []),
      index,
    ]);
  });

  const usedSubtitleIndices = new Set<number>();
  const rows: VideoDubbingQueueRow<TVideo, TSubtitle>[] = videos.map(
    (video, index) => {
    const sourceId = video.job?.id || video.id;
    const boundSubtitleIndex = sourceId
      ? subtitles.findIndex(
        (subtitle, candidate) => subtitle.videoId === sourceId && !usedSubtitleIndices.has(candidate),
      )
      : -1;
    const matchingIndices = subtitleIndicesByName.get(fileStem(video.name));
    const subtitleIndex = boundSubtitleIndex >= 0
      ? boundSubtitleIndex
      : matchingIndices?.find(
        (candidate) => !usedSubtitleIndices.has(candidate) && !subtitles[candidate].videoId && subtitles[candidate].matchByName !== false,
      );
    if (subtitleIndex !== undefined) usedSubtitleIndices.add(subtitleIndex);
    return {
      index,
      video,
      subtitle:
        subtitleIndex === undefined ? undefined : subtitles[subtitleIndex],
    };
    },
  );

  // If filenames do not match, pair remaining unnamed/multi-import SRT files
  // by queue order. This also covers multiple videos and SRT files dropped
  // together when their filenames are unrelated.
  rows.forEach((row) => {
    if (row.video === undefined || row.subtitle !== undefined) return;
    const subtitleIndex = subtitles.findIndex(
      (subtitle, candidate) =>
        !usedSubtitleIndices.has(candidate) &&
        !subtitle.videoId &&
        subtitle.matchByName === true,
    );
    if (subtitleIndex >= 0) {
      row.subtitle = subtitles[subtitleIndex];
      usedSubtitleIndices.add(subtitleIndex);
    }
  });

  subtitles.forEach((subtitle, subtitleIndex) => {
    if (usedSubtitleIndices.has(subtitleIndex)) return;
    rows.push({
      index: rows.length,
      video: undefined,
      subtitle,
    });
  });

  return rows;
}

export function hasMatchedVideoDubbingQueueInputs<TVideo, TSubtitle>(
  rows: readonly VideoDubbingQueueRow<TVideo, TSubtitle>[],
): boolean {
  return (
    rows.length > 0 &&
    rows.every((row) => row.video !== undefined && row.subtitle !== undefined)
  );
}

export function replaceVideoDubbingSubtitleSources<
  TSubtitle extends { fileName: string; videoId?: string },
>(
  current: readonly TSubtitle[],
  replacements: readonly TSubtitle[],
  targetVideoId?: string,
): TSubtitle[] {
  return [
    ...current.filter((item) => {
      return !replacements.some((replacement) => {
        const replacementVideoId = replacement.videoId || targetVideoId;
        if (replacementVideoId && item.videoId === replacementVideoId) return true;
        return !item.videoId && fileStem(item.fileName) === fileStem(replacement.fileName);
      });
    }),
    ...replacements,
  ];
}

function fileStem(fileName: string): string {
  const name = fileName.split(/[\\/]/).pop() || fileName;
  return name.replace(/\.[^.]+$/, "").trim().toLocaleLowerCase();
}
