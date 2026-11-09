import { formatSecondsToSrtTime, parseSrtContent } from "./srtParser";

export type EditableSubtitleCue = {
  startTime: number;
  endTime: number;
  text: string;
  translatedText: string;
};

export function createSubtitleCueAtTime(
  cues: EditableSubtitleCue[],
  time: number,
): { cue: EditableSubtitleCue; index: number } | null {
  const startTime = Math.max(0, Number.isFinite(time) ? time : 0);
  if (cues.some((cue) => cue.startTime <= startTime && cue.endTime > startTime)) return null;
  const nextCueStart = cues
    .map((cue) => cue.startTime)
    .filter((cueStart) => cueStart >= startTime)
    .reduce((next, cueStart) => Math.min(next, cueStart), Number.POSITIVE_INFINITY);
  const availableDuration = nextCueStart - startTime;
  const duration = Math.min(1, availableDuration);
  if (duration < 0.01) return null;

  const cue: EditableSubtitleCue = {
    startTime,
    endTime: startTime + duration,
    text: "phụ đề mới",
    translatedText: "",
  };
  const index = cues.findIndex((existing) => existing.startTime > startTime);
  return { cue, index: index < 0 ? cues.length : index };
}

export function parseEditableSubtitles(content: string): EditableSubtitleCue[] {
  const parsed = parseSrtContent(content.replace(/^\uFEFF/, ""));
  return parsed.items.map((item) => ({
    startTime: item.startTime,
    endTime: item.endTime,
    text: item.text,
    translatedText: "",
  }));
}

export function applyRawSubtitleText(
  content: string,
  existingCues: EditableSubtitleCue[],
  translated: boolean,
): EditableSubtitleCue[] {
  if (!content.trim()) {
    return translated
      ? existingCues.map((cue) => ({ ...cue, translatedText: "" }))
      : [];
  }

  const parsed = parseEditableSubtitles(content);
  const blockCount = content.match(/^[\d:.,]+\s*-->\s*[\d:.,]+/gm)?.length || 0;
  if (!parsed.length || parsed.length !== blockCount) {
    throw new Error("Một hoặc nhiều block SRT chưa đúng định dạng.");
  }
  if (parsed.some((cue) => cue.endTime <= cue.startTime)) {
    throw new Error("Thời gian kết thúc phải sau thời gian bắt đầu.");
  }

  return parsed.map((cue, index) => translated
    ? { ...cue, text: existingCues[index]?.text || "", translatedText: cue.text }
    : {
      ...cue,
      translatedText: existingCues[index]?.text === cue.text ? existingCues[index].translatedText : "",
    });
}

export function formatEditableSubtitles(
  cues: EditableSubtitleCue[],
  translated = false,
): string {
  const content = cues
    .map((cue, index) => {
      const text = translated ? cue.translatedText : cue.text;
      return `${index + 1}\n${formatSecondsToSrtTime(cue.startTime)} --> ${formatSecondsToSrtTime(cue.endTime)}\n${text}\n`;
    })
    .join("\n");
  return `\uFEFF${content}`;
}
