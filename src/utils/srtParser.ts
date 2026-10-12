import { SubtitleItem } from '../types/subtitles';

/**
 * Parses a timestamp string into float seconds.
 * Supports:
 * - 00:00:00,133 or 00:00:00.133 (hours:minutes:seconds,ms)
 * - 00:04,933 or 00:04.933 (minutes:seconds,ms)
 * - 12.34 (seconds directly)
 */
export function parseTimestampToSeconds(timeStr: string): number {
  if (!timeStr) return 0;
  const clean = timeStr.trim().replace(',', '.');
  const parts = clean.split(':');

  if (parts.length === 3) {
    const h = parseFloat(parts[0]) || 0;
    const m = parseFloat(parts[1]) || 0;
    const s = parseFloat(parts[2]) || 0;
    return h * 3600 + m * 60 + s;
  }
  if (parts.length === 2) {
    const m = parseFloat(parts[0]) || 0;
    const s = parseFloat(parts[1]) || 0;
    return m * 60 + s;
  }
  return parseFloat(clean) || 0;
}

/**
 * Formats seconds into standard SRT timestamp: "00:01:23,456"
 */
export function formatSecondsToSrtTime(totalSec: number): string {
  if (isNaN(totalSec) || totalSec < 0) totalSec = 0;
  const hours = Math.floor(totalSec / 3600);
  const minutes = Math.floor((totalSec % 3600) / 60);
  const seconds = Math.floor(totalSec % 60);
  const milliseconds = Math.floor((totalSec % 1) * 1000);

  const pad = (n: number, z = 2) => String(n).padStart(z, '0');
  return `${pad(hours)}:${pad(minutes)}:${pad(seconds)},${pad(milliseconds, 3)}`;
}

/**
 * Formats seconds into human display: "01:23.4s"
 */
export function formatSecondsDisplay(totalSec: number): string {
  if (isNaN(totalSec) || totalSec < 0) return '0.0s';
  if (totalSec < 60) return `${totalSec.toFixed(2)}s`;
  const m = Math.floor(totalSec / 60);
  const s = (totalSec % 60).toFixed(1);
  return `${m}m ${s}s`;
}

/**
 * Strips HTML and formatting tags from subtitle text (e.g. <i>, <font color="...">)
 */
export function sanitizeSubtitleText(raw: string): string {
  return raw
    .replace(/<[^>]+>/g, '') // strip HTML tags
    .replace(/\{[^}]+\}/g, '') // strip ASS/SSA styling tags
    .replace(/\r/g, '')
    .trim();
}

/**
 * Parses raw SRT or TXT content into SubtitleItem array.
 */
export function parseSrtContent(content: string): { items: SubtitleItem[]; warnings: string[] } {
  const items: SubtitleItem[] = [];
  const warnings: string[] = [];

  if (!content || !content.trim()) {
    return { items, warnings };
  }

  // Normalize line endings
  const normalized = content.replace(/\r\n/g, '\n').replace(/\r/g, '\n');

  // Regex to match SRT subtitle blocks
  // Optional sequence number, then timestamp line "00:00:00,123 --> 00:00:04,567", then text
  const srtBlockRegex = /(?:(\d+)\s*\n)?([\d:.,]+)\s*-->\s*([\d:.,]+)[^\n]*\n([\s\S]*?)(?=(?:\n\s*\n\s*\d+\s*\n|\n\s*\n\s*[\d:.,]+\s*-->|$))/g;

  let match: RegExpExecArray | null;
  let prevEndTime = 0;

  while ((match = srtBlockRegex.exec(normalized)) !== null) {
    const rawStart = match[2];
    const rawEnd = match[3];
    const rawText = match[4];

    const startTime = parseTimestampToSeconds(rawStart);
    const endTime = parseTimestampToSeconds(rawEnd);
    const text = sanitizeSubtitleText(rawText);

    if (!text) continue;

    const index = items.length + 1;
    const targetDuration = Math.max(0.1, Number((endTime - startTime).toFixed(3)));

    let warning: string | undefined = undefined;

    if (endTime <= startTime) {
      warning = `Timestamp không hợp lệ: kết thúc (${endTime}s) <= bắt đầu (${startTime}s).`;
      warnings.push(`Câu #${index}: ${warning}`);
    } else if (startTime < prevEndTime - 0.05) {
      const overlapSec = (prevEndTime - startTime).toFixed(2);
      warning = `Chồng lấn thời gian với câu trước ${overlapSec}s (câu trước kết thúc lúc ${prevEndTime.toFixed(2)}s).`;
      warnings.push(`Câu #${index}: ${warning}`);
    } else if (targetDuration < 0.5) {
      warning = `Thời lượng quá ngắn (${targetDuration.toFixed(2)}s) cho đoạn lời thoại.`;
    }

    items.push({
      id: `sub_${index}_${Math.random().toString(36).substring(2, 7)}`,
      index,
      startTime,
      endTime,
      text,
      targetDuration,
      status: 'pending',
      warning,
    });

    if (endTime > prevEndTime) {
      prevEndTime = endTime;
    }
  }

  // Fallback: If standard SRT regex didn't find any blocks, try parsing line-by-line TXT formats:
  // e.g. "[00:01.00 - 00:04.00] Lời thoại" or "00:01 --> 00:04: Lời thoại"
  if (items.length === 0) {
    const lines = normalized.split('\n');
    let lineIdx = 1;
    for (const line of lines) {
      const trimmed = line.trim();
      if (!trimmed) continue;

      const altMatch = trimmed.match(/\[?([\d:.,]+)\s*(?:-->|-)\s*([\d:.,]+)\]?\s*[:|-]?\s*(.+)/);
      if (altMatch) {
        const start = parseTimestampToSeconds(altMatch[1]);
        const end = parseTimestampToSeconds(altMatch[2]);
        const text = sanitizeSubtitleText(altMatch[3]);
        if (text) {
          items.push({
            id: `sub_${lineIdx}_${Math.random().toString(36).substring(2, 7)}`,
            index: lineIdx++,
            startTime: start,
            endTime: end,
            text,
            targetDuration: Math.max(0.1, Number((end - start).toFixed(3))),
            status: 'pending',
          });
        }
      }
    }
  }

  return { items, warnings };
}

/**
 * Converts SubtitleItem array back to SRT string.
 */
export function exportToSrtString(items: SubtitleItem[]): string {
  return items
    .map((item, idx) => {
      const start = formatSecondsToSrtTime(item.startTime);
      const end = formatSecondsToSrtTime(item.endTime);
      return `${idx + 1}\n${start} --> ${end}\n${item.text}\n`;
    })
    .join('\n');
}
