import {
  parseSrtContent,
  parseTimestampToSeconds,
  sanitizeSubtitleText,
} from "./srtParser";
import { SrtAnalysis } from "../types/videoDubbing";
import type { VideoDubbingSubtitleCue } from "../types/videoDubbing";

const TIMESTAMP_PATTERN = /^\d{2,}:[0-5]\d:[0-5]\d[,.]\d{1,3}$/;

export function formatVideoDubbingSrt(
  cues: readonly VideoDubbingSubtitleCue[],
): string {
  const formatTimestamp = (seconds: number) => {
    if (!Number.isFinite(seconds) || seconds < 0) {
      throw new Error("Timestamp phụ đề không hợp lệ.");
    }
    const milliseconds = Math.round(seconds * 1000);
    if (!Number.isSafeInteger(milliseconds)) {
      throw new Error("Timestamp phụ đề vượt quá giới hạn hợp lệ.");
    }
    const hours = Math.floor(milliseconds / 3_600_000);
    const minutes = Math.floor((milliseconds % 3_600_000) / 60_000);
    const secondsPart = Math.floor((milliseconds % 60_000) / 1000);
    const millisecondsPart = milliseconds % 1000;
    const pad = (value: number, length = 2) =>
      String(value).padStart(length, "0");
    return `${pad(hours)}:${pad(minutes)}:${pad(secondsPart)},${pad(millisecondsPart, 3)}`;
  };

  const nonEmptyCues = cues.filter((cue, index) => {
    if (typeof cue.text !== "string") {
      throw new Error(`Câu phụ đề ${index + 1} không hợp lệ.`);
    }
    return Boolean(cue.text.trim());
  });
  return nonEmptyCues
    .map((cue, index) => {
      if (
        !Number.isFinite(cue.startTime) ||
        !Number.isFinite(cue.endTime) ||
        cue.endTime <= cue.startTime ||
        typeof cue.text !== "string"
      ) {
        throw new Error(`Câu phụ đề ${index + 1} không hợp lệ.`);
      }
      if (Math.round(cue.endTime * 1000) <= Math.round(cue.startTime * 1000)) {
        throw new Error(`Câu phụ đề ${index + 1} có thời lượng dưới 1 ms.`);
      }
      return `${index + 1}\n${formatTimestamp(cue.startTime)} --> ${formatTimestamp(cue.endTime)}\n${cue.text}`;
    })
    .join("\n\n")
    .concat(nonEmptyCues.length ? "\n" : "");
}

export function analyzeSrtContent(content: string): SrtAnalysis {
  if (!content.trim()) {
    throw new Error("Tệp SRT rỗng.");
  }

  const normalized = content.replace(/^\uFEFF/, "");
  const parsed = parseSrtContent(normalized);
  const blocks = normalized.split(/\r?\n\s*\r?\n/);
  const validRanges: Array<{ start: number; end: number }> = [];
  const validItemIds = new Set<string>();
  let invalidBlockCount = 0;
  let hasTimestamp = false;

  for (const block of blocks) {
    const lines = block.split(/\r?\n/);
    if (lines.length < 3 || !/^\s*\d+\s*$/.test(lines[0])) {
      if (block.trim()) invalidBlockCount++;
      continue;
    }

    const timing = lines[1].match(/^\s*(\S+)\s*-->\s*(\S+)\s*$/);
    if (!timing) {
      if (block.trim()) invalidBlockCount++;
      continue;
    }

    hasTimestamp = true;
    if (
      !TIMESTAMP_PATTERN.test(timing[1]) ||
      !TIMESTAMP_PATTERN.test(timing[2])
    ) {
      invalidBlockCount++;
      continue;
    }

    const start = parseTimestampToSeconds(timing[1]);
    const end = parseTimestampToSeconds(timing[2]);
    const text = lines.slice(2).join("\n").trim();
    const parsedRange = parsed.items.find(
      (item) =>
        !validItemIds.has(item.id) &&
        item.startTime === start &&
        item.endTime === end &&
        item.text === sanitizeSubtitleText(text),
    );

    if (
      !Number.isFinite(start) ||
      !Number.isFinite(end) ||
      start < 0 ||
      end <= start ||
      !text ||
      !parsedRange
    ) {
      invalidBlockCount++;
      continue;
    }

    validRanges.push({ start, end });
    validItemIds.add(parsedRange.id);
  }

  if (!hasTimestamp || validRanges.length === 0) {
    throw new Error("Không tìm thấy timestamp SRT hợp lệ.");
  }

  return {
    subtitleCount: validRanges.length,
    earliestStart: Math.min(...validRanges.map((range) => range.start)),
    latestEnd: Math.max(...validRanges.map((range) => range.end)),
    invalidBlockCount,
    items: parsed.items.filter((item) => validItemIds.has(item.id)),
  };
}
