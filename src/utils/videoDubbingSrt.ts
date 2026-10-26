import { parseSrtContent, parseTimestampToSeconds } from "./srtParser";
import { SrtAnalysis } from "../types/videoDubbing";

const TIMESTAMP_PATTERN = /^\d{2,}:[0-5]\d:[0-5]\d[,.]\d{1,3}$/;

export function analyzeSrtContent(content: string): SrtAnalysis {
  if (!content.trim()) {
    throw new Error("Tệp SRT rỗng.");
  }

  const normalized = content.replace(/^\uFEFF/, "");
  const parsed = parseSrtContent(normalized);
  const blocks = normalized.split(/\r?\n\s*\r?\n/);
  const validRanges: Array<{ start: number; end: number }> = [];
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
      (item) => item.startTime === start && item.endTime === end,
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
  }

  if (!hasTimestamp || validRanges.length === 0) {
    throw new Error("Không tìm thấy timestamp SRT hợp lệ.");
  }

  return {
    subtitleCount: validRanges.length,
    earliestStart: Math.min(...validRanges.map((range) => range.start)),
    latestEnd: Math.max(...validRanges.map((range) => range.end)),
    invalidBlockCount,
  };
}
