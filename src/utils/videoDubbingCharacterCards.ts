import type {
  VideoDubbingOverlayPosition,
  VideoDubbingTextAlignment,
  VideoDubbingTextOverlayCue,
} from "../types/videoDubbing";

export interface CharacterCardOcrCue {
  startTime: number;
  endTime: number;
  text: string;
  confidence: number;
}

export interface CharacterCardOcrGroup {
  startTime: number;
  endTime: number;
  lines: string[];
}

export interface CharacterCardOcrOccurrence {
  startTime: number;
  endTime: number;
  time: number;
}

export interface CharacterCardScanRange {
  startTime: number;
  endTime: number;
  durationSeconds: number;
}

export interface TextOverlayTimelineLanes {
  lanes: number[];
  countsByTrackId: Record<string, number>;
}

export type CharacterCardStyle = {
  fontSize: number;
  characterRoleFontSize: number;
  fontFamily: string;
  color: string;
  bold: boolean;
  italic: boolean;
  underline: boolean;
  textCase: NonNullable<VideoDubbingTextOverlayCue["textCase"]>;
  outlineEnabled: boolean;
  outlineColor: string;
  outlineWidthPx: number;
  characterSpacingPx: number;
  lineSpacingPx: number;
  textAlign: VideoDubbingTextAlignment;
  position: VideoDubbingOverlayPosition;
  xPercent?: number;
  yPercent?: number;
  backgroundColor: string;
  backgroundTransparent: boolean;
  paddingPx: number;
};

export const DEFAULT_CHARACTER_CARD_STYLE: CharacterCardStyle = {
  fontSize: 28,
  characterRoleFontSize: 20,
  fontFamily: "Arial",
  color: "#ffffff",
  bold: false,
  italic: false,
  underline: false,
  textCase: "none",
  outlineEnabled: false,
  outlineColor: "#000000",
  outlineWidthPx: 2,
  characterSpacingPx: 0,
  lineSpacingPx: 0,
  textAlign: "center",
  position: "middle-center",
  backgroundColor: "#000000",
  backgroundTransparent: true,
  paddingPx: 0,
};

export function getTextOverlayTimelineLanes(
  cues: readonly VideoDubbingTextOverlayCue[],
  defaultTrackId: string,
): TextOverlayTimelineLanes {
  const lanes = new Array<number>(cues.length).fill(0);
  const cuesByTrack = new Map<string, Array<{ cue: VideoDubbingTextOverlayCue; index: number }>>();
  cues.forEach((cue, index) => {
    if (cue.isTitle) return;
    const trackId = cue.trackId || defaultTrackId;
    const trackCues = cuesByTrack.get(trackId) ?? [];
    trackCues.push({ cue, index });
    cuesByTrack.set(trackId, trackCues);
  });

  const countsByTrackId: Record<string, number> = {};
  for (const [trackId, trackCues] of cuesByTrack) {
    const laneEnds: number[] = [];
    trackCues
      .sort((first, second) =>
        first.cue.startTime - second.cue.startTime ||
        first.cue.endTime - second.cue.endTime ||
        first.index - second.index,
      )
      .forEach(({ cue, index }) => {
        let lane = laneEnds.findIndex((end) => end <= cue.startTime);
        if (lane < 0) lane = laneEnds.length;
        laneEnds[lane] = cue.endTime;
        lanes[index] = lane;
      });
    countsByTrackId[trackId] = Math.max(1, laneEnds.length);
  }

  return { lanes, countsByTrackId };
}

const CARD_POSITIONS = new Set<VideoDubbingOverlayPosition>([
  "top-left", "top-center", "top-right",
  "middle-left", "middle-center", "middle-right",
  "bottom-left", "bottom-center", "bottom-right",
]);

export function resolveCharacterCardStyle(
  input: unknown,
  fallback: CharacterCardStyle = DEFAULT_CHARACTER_CARD_STYLE,
): CharacterCardStyle {
  const value = input && typeof input === "object" && !Array.isArray(input)
    ? input as Record<string, unknown>
    : {};
  const number = (key: string, defaultValue: number) =>
    typeof value[key] === "number" && Number.isFinite(value[key])
      ? value[key] as number
      : defaultValue;
  const string = (key: string, defaultValue: string) =>
    typeof value[key] === "string" && value[key]
      ? value[key] as string
      : defaultValue;

  return {
    fontSize: number("fontSize", fallback.fontSize),
    characterRoleFontSize: number("characterRoleFontSize", fallback.characterRoleFontSize),
    fontFamily: string("fontFamily", fallback.fontFamily),
    color: string("color", fallback.color),
    bold: typeof value.bold === "boolean" ? value.bold : fallback.bold,
    italic: typeof value.italic === "boolean" ? value.italic : fallback.italic,
    underline: typeof value.underline === "boolean" ? value.underline : fallback.underline,
    textCase: value.textCase === "none" || value.textCase === "uppercase" ||
      value.textCase === "lowercase" || value.textCase === "capitalize"
      ? value.textCase
      : fallback.textCase,
    outlineEnabled: typeof value.outlineEnabled === "boolean"
      ? value.outlineEnabled
      : fallback.outlineEnabled,
    outlineColor: string("outlineColor", fallback.outlineColor),
    outlineWidthPx: number("outlineWidthPx", fallback.outlineWidthPx),
    characterSpacingPx: number("characterSpacingPx", fallback.characterSpacingPx),
    lineSpacingPx: number("lineSpacingPx", fallback.lineSpacingPx),
    textAlign: value.textAlign === "left" || value.textAlign === "center" || value.textAlign === "right"
      ? value.textAlign
      : fallback.textAlign,
    position: typeof value.position === "string" && CARD_POSITIONS.has(value.position as VideoDubbingOverlayPosition)
      ? value.position as VideoDubbingOverlayPosition
      : fallback.position,
    ...(typeof value.xPercent === "number" && Number.isFinite(value.xPercent)
      ? { xPercent: value.xPercent }
      : {}),
    ...(typeof value.yPercent === "number" && Number.isFinite(value.yPercent)
      ? { yPercent: value.yPercent }
      : {}),
    backgroundColor: string("backgroundColor", fallback.backgroundColor),
    backgroundTransparent: typeof value.backgroundTransparent === "boolean"
      ? value.backgroundTransparent
      : fallback.backgroundTransparent,
    paddingPx: number("paddingPx", fallback.paddingPx),
  };
}

export function getCharacterCardScanRange(
  playheadTime: number,
  startOffsetSeconds: number,
  requestedDuration: number,
  videoDuration: number,
): CharacterCardScanRange {
  let startTime = Math.max(0, Math.min(playheadTime, videoDuration) - Math.max(0, startOffsetSeconds));
  const endTime = Math.min(videoDuration, startTime + Math.max(0, requestedDuration));
  if (endTime - startTime > 0 && endTime - startTime < 0.1 && videoDuration >= 0.1) {
    startTime = Math.max(0, endTime - 0.100001);
  }
  return {
    startTime,
    endTime,
    durationSeconds: endTime - startTime,
  };
}

export function getCharacterCardScanRanges(
  detectionTimes: number[],
  startOffsetSeconds: number,
  requestedDuration: number,
  videoDuration: number,
): CharacterCardScanRange[] {
  const ranges = detectionTimes
    .map((time) => getCharacterCardScanRange(time, startOffsetSeconds, requestedDuration, videoDuration))
    .filter((range) => range.durationSeconds > 0)
    .sort((a, b) => a.startTime - b.startTime);
  const merged: CharacterCardScanRange[] = [];
  for (const range of ranges) {
    const previous = merged.at(-1);
    if (!previous || range.startTime > previous.endTime) {
      merged.push({ ...range });
      continue;
    }
    previous.endTime = Math.max(previous.endTime, range.endTime);
    previous.durationSeconds = previous.endTime - previous.startTime;
  }
  return merged;
}

export function groupCharacterCardOcrCues(
  cues: CharacterCardOcrCue[],
): CharacterCardOcrGroup[] {
  const groups: CharacterCardOcrGroup[] = [];
  for (const cue of [...cues].sort((a, b) => a.startTime - b.startTime || a.endTime - b.endTime)) {
    const lines = cue.text.split(/\r?\n/).map((line) => line.trim()).filter(Boolean);
    if (!lines.length) continue;
    const current = groups.at(-1);
    if (!current || cue.startTime > current.endTime + 0.1) {
      groups.push({ startTime: cue.startTime, endTime: cue.endTime, lines: [...new Set(lines)] });
      continue;
    }
    current.endTime = Math.max(current.endTime, cue.endTime);
    for (const line of lines) {
      if (!current.lines.some((existing) => existing.toLowerCase() === line.toLowerCase())) {
        current.lines.push(line);
      }
    }
  }
  return groups;
}

export function groupCharacterCardOcrCuesByOccurrences(
  cues: CharacterCardOcrCue[],
  occurrences: CharacterCardOcrOccurrence[],
): CharacterCardOcrGroup[] {
  return [...occurrences]
    .sort((first, second) => first.time - second.time)
    .flatMap((occurrence) => {
      const matchingCues = cues.filter((cue) =>
        cue.startTime < occurrence.endTime &&
        cue.endTime > occurrence.startTime,
      );
      const lines = groupCharacterCardOcrCues(matchingCues)
        .flatMap((group) => group.lines)
        .filter((line, index, allLines) =>
          allLines.findIndex((candidate) =>
            candidate.toLowerCase() === line.toLowerCase(),
          ) === index,
        );
      return lines.length
        ? [{
            startTime: occurrence.startTime,
            endTime: occurrence.endTime,
            lines,
          }]
        : [];
    });
}
