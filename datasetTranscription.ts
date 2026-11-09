export interface WhisperTimedToken {
  text?: unknown;
  offsets?: {
    from?: unknown;
    to?: unknown;
  };
}

export interface WhisperTranscriptionSegment {
  text?: unknown;
  offsets?: {
    from?: unknown;
    to?: unknown;
  };
  tokens?: WhisperTimedToken[];
}

export interface WhisperClipSegment {
  text: string;
  fromMs: number;
  toMs: number;
}

export function constrainWhisperSegmentsToAudio(
  segments: WhisperClipSegment[],
  audioDurationMs: number,
  minDurationSec: number,
): { segments: WhisperClipSegment[]; rejectedCount: number } {
  if (!Number.isFinite(audioDurationMs) || audioDurationMs <= 0) {
    throw new Error("Audio duration must be a positive finite number.");
  }

  const minimumDurationMs = minDurationSec * 1000;
  const toleratedTimestampOverrunMs = 50;
  const validSegments: WhisperClipSegment[] = [];
  let rejectedCount = 0;

  for (const segment of segments) {
    if (
      !Number.isFinite(segment.fromMs) ||
      !Number.isFinite(segment.toMs) ||
      segment.fromMs < 0 ||
      segment.fromMs >= audioDurationMs ||
      segment.toMs <= segment.fromMs ||
      segment.toMs > audioDurationMs + toleratedTimestampOverrunMs
    ) {
      rejectedCount += 1;
      continue;
    }

    const toMs = Math.min(segment.toMs, audioDurationMs);
    if (toMs - segment.fromMs < minimumDurationMs) {
      rejectedCount += 1;
      continue;
    }

    validSegments.push({ ...segment, toMs });
  }

  return { segments: validSegments, rejectedCount };
}

function isWordBoundary(tokenText: string): boolean {
  return /\s$/.test(tokenText) || /[.!?。！？,;:]$/.test(tokenText.trimEnd());
}

function isSentenceBoundary(tokenText: string): boolean {
  return /[.!?。！？]$/.test(tokenText.trimEnd());
}

export function splitLongWhisperSegment(
  segment: WhisperTranscriptionSegment,
  maxDurationSec: number,
  minDurationSec: number,
): WhisperClipSegment[] | null {
  const fromMs = Number(segment.offsets?.from);
  const toMs = Number(segment.offsets?.to);
  if (!Number.isFinite(fromMs) || !Number.isFinite(toMs) || toMs <= fromMs) return null;

  const maxDurationMs = maxDurationSec * 1000;
  const minDurationMs = minDurationSec * 1000;
  const text = typeof segment.text === "string" ? segment.text : "";
  if (toMs - fromMs <= maxDurationMs) return [{ text, fromMs, toMs }];

  if (!Array.isArray(segment.tokens) || segment.tokens.length === 0) return null;
  const tokens: Array<{ text: string; fromMs: number; toMs: number }> = [];
  let pendingWhitespace = "";
  for (const token of segment.tokens) {
    const tokenText = typeof token.text === "string" ? token.text : "";
    if (!tokenText) continue;
    const tokenFromMs = Number(token.offsets?.from);
    const tokenToMs = Number(token.offsets?.to);
    if (!Number.isFinite(tokenFromMs) || !Number.isFinite(tokenToMs) || tokenToMs <= tokenFromMs) {
      if (/^(?:<\|.*\|>|\[.*\])$/.test(tokenText.trim())) continue;
      if (tokenText.trim()) return null;
      if (tokens.length) tokens[tokens.length - 1].text += tokenText;
      else pendingWhitespace += tokenText;
      continue;
    }
    tokens.push({
      text: `${pendingWhitespace}${tokenText}`,
      fromMs: tokenFromMs,
      toMs: tokenToMs,
    });
    pendingWhitespace = "";
  }
  if (pendingWhitespace && tokens.length) tokens[tokens.length - 1].text += pendingWhitespace;
  if (tokens.length === 0) return null;

  const pieces: WhisperClipSegment[] = [];
  let startIndex = 0;
  while (startIndex < tokens.length) {
    const groupStartMs = tokens[startIndex].fromMs;
    let lastFittingIndex = -1;
    const sentenceBoundaries: number[] = [];
    const wordBoundaries: number[] = [];

    for (let index = startIndex; index < tokens.length; index += 1) {
      const token = tokens[index];
      if (token.toMs - groupStartMs > maxDurationMs) break;
      lastFittingIndex = index;
      if (isWordBoundary(token.text)) wordBoundaries.push(index);
      if (isSentenceBoundary(token.text)) sentenceBoundaries.push(index);
    }
    if (lastFittingIndex < startIndex) return null;

    const hasRemainder = (index: number) => index < tokens.length - 1;
    const leavesValidRemainder = (index: number) =>
      !hasRemainder(index) || tokens[tokens.length - 1].toMs - tokens[index].toMs >= minDurationMs;
    const validSentenceBoundaries = sentenceBoundaries.filter((index) =>
      tokens[index].toMs - groupStartMs >= minDurationMs && leavesValidRemainder(index),
    );
    const validWordBoundaries = wordBoundaries.filter((index) =>
      tokens[index].toMs - groupStartMs >= minDurationMs && leavesValidRemainder(index),
    );
    const preferredBoundary = validSentenceBoundaries.at(-1) ?? validWordBoundaries.at(-1);
    const endIndex = preferredBoundary ?? lastFittingIndex;
    const pieceText = tokens.slice(startIndex, endIndex + 1).map((token) => token.text).join("").trim();
    const pieceFromMs = tokens[startIndex].fromMs;
    const pieceToMs = tokens[endIndex].toMs;
    if (!pieceText || pieceToMs <= pieceFromMs) return null;
    pieces.push({ text: pieceText, fromMs: pieceFromMs, toMs: pieceToMs });
    startIndex = endIndex + 1;
  }

  return pieces;
}

export function mergeShortWhisperSegments(
  segments: WhisperClipSegment[],
  minDurationSec: number,
  maxDurationSec: number,
): { segments: WhisperClipSegment[]; rejectedCount: number } {
  const minDurationMs = minDurationSec * 1000;
  const maxDurationMs = maxDurationSec * 1000;
  const merged: WhisperClipSegment[] = [];
  let pending: WhisperClipSegment[] = [];
  let rejectedCount = 0;

  const combine = (items: WhisperClipSegment[]): WhisperClipSegment => ({
    text: items.map((item) => item.text.trim()).filter(Boolean).join(" "),
    fromMs: items[0].fromMs,
    toMs: items[items.length - 1].toMs,
  });

  const flushPending = () => {
    if (!pending.length) return;
    const candidate = combine(pending);
    if (candidate.toMs - candidate.fromMs >= minDurationMs) merged.push(candidate);
    else rejectedCount += pending.length;
    pending = [];
  };

  for (const segment of segments) {
    const candidate = pending.length ? [...pending, segment] : [segment];
    const combined = combine(candidate);
    if (combined.toMs - combined.fromMs > maxDurationMs) {
      flushPending();
      if (segment.toMs - segment.fromMs >= minDurationMs) merged.push(segment);
      else pending = [segment];
      continue;
    }

    if (pending.length || segment.toMs - segment.fromMs < minDurationMs) {
      pending = candidate;
      if (combined.toMs - combined.fromMs >= minDurationMs) flushPending();
      continue;
    }

    merged.push(segment);
  }

  if (pending.length) {
    const candidate = combine(pending);
    const previous = merged.at(-1);
    if (
      candidate.toMs - candidate.fromMs < minDurationMs &&
      previous &&
      candidate.toMs - previous.fromMs <= maxDurationMs
    ) {
      merged[merged.length - 1] = combine([previous, candidate]);
    } else {
      flushPending();
    }
  }

  return { segments: merged, rejectedCount };
}
