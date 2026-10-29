export interface VideoDubbingQueueRow<TVideo, TSubtitle> {
  index: number;
  video?: TVideo;
  subtitle?: TSubtitle;
}

export function pairVideoDubbingQueueRows<
  TVideo extends { name: string },
  TSubtitle extends { fileName: string },
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
    const matchingIndices = subtitleIndicesByName.get(fileStem(video.name));
    const subtitleIndex = matchingIndices?.find(
      (candidate) => !usedSubtitleIndices.has(candidate),
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

function fileStem(fileName: string): string {
  const name = fileName.split(/[\\/]/).pop() || fileName;
  return name.replace(/\.[^.]+$/, "").trim().toLocaleLowerCase();
}
