import assert from "node:assert/strict";
import test from "node:test";
import {
  constrainWhisperSegmentsToAudio,
  mergeShortWhisperSegments,
  splitLongWhisperSegment,
} from "../datasetTranscription";

test("splits long Whisper segments at timed word boundaries", () => {
  const tokens = [
    { text: "Đây là câu đầu. ", offsets: { from: 0, to: 4200 } },
    { text: "Đây là câu thứ hai, ", offsets: { from: 4300, to: 8500 } },
    { text: "và đây là câu cuối.", offsets: { from: 8600, to: 13000 } },
  ];
  const pieces = splitLongWhisperSegment({
    text: tokens.map((token) => token.text).join(""),
    offsets: { from: 0, to: 13000 },
    tokens,
  }, 8, 1);

  assert.deepEqual(pieces, [
    { text: "Đây là câu đầu.", fromMs: 0, toMs: 4200 },
    { text: "Đây là câu thứ hai,", fromMs: 4300, toMs: 8500 },
    { text: "và đây là câu cuối.", fromMs: 8600, toMs: 13000 },
  ]);
  assert.ok(pieces!.every((piece) => piece.toMs - piece.fromMs <= 8000));
});

test("keeps short Whisper segments intact and refuses unsafe splits", () => {
  const short = {
    text: "Câu ngắn.",
    offsets: { from: 200, to: 1700 },
  };
  assert.deepEqual(splitLongWhisperSegment(short, 8, 1), [
    { text: "Câu ngắn.", fromMs: 200, toMs: 1700 },
  ]);

  assert.equal(splitLongWhisperSegment({
    text: "Một đoạn dài không có word timestamps.",
    offsets: { from: 0, to: 15000 },
  }, 8, 1), null);
});

test("ignores untimed Whisper control tokens when splitting", () => {
  const pieces = splitLongWhisperSegment({
    text: "<|text|> Một câu. Hai câu.",
    offsets: { from: 0, to: 13000 },
    tokens: [
      { text: "<|text|>" },
      { text: "Một câu. ", offsets: { from: 0, to: 6000 } },
      { text: " ", offsets: { from: -1, to: -1 } },
      { text: "Hai câu.", offsets: { from: 6100, to: 13000 } },
      { text: "<|end|>" },
    ],
  }, 8, 1);

  assert.deepEqual(pieces, [
    { text: "Một câu.", fromMs: 0, toMs: 6000 },
    { text: "Hai câu.", fromMs: 6100, toMs: 13000 },
  ]);
});

test("ignores whisper-cli JSON-full token markers in bracket format", () => {
  const pieces = splitLongWhisperSegment({
    text: " Một câu. Hai câu.",
    offsets: { from: 0, to: 13000 },
    tokens: [
      { text: "[_BEG_]", offsets: { from: 0, to: 0 } },
      { text: " Một câu. ", offsets: { from: 100, to: 6100 } },
      { text: "[_SOT_]", offsets: { from: 6100, to: 6100 } },
      { text: "Hai câu.", offsets: { from: 6200, to: 13000 } },
    ],
  }, 8, 1);

  assert.deepEqual(pieces, [
    { text: "Một câu.", fromMs: 100, toMs: 6100 },
    { text: "Hai câu.", fromMs: 6200, toMs: 13000 },
  ]);
});

test("combines adjacent short segments without exceeding the duration limit", () => {
  const result = mergeShortWhisperSegments([
    { text: "Chào ", fromMs: 0, toMs: 300 },
    { text: "mọi ", fromMs: 400, toMs: 900 },
    { text: "người.", fromMs: 1000, toMs: 1800 },
    { text: "Câu tiếp theo.", fromMs: 1900, toMs: 5000 },
  ], 1, 8);

  assert.deepEqual(result, {
    segments: [
      { text: "Chào mọi người.", fromMs: 0, toMs: 1800 },
      { text: "Câu tiếp theo.", fromMs: 1900, toMs: 5000 },
    ],
    rejectedCount: 0,
  });
});

test("rejects Whisper timestamps beyond the actual audio chunk", () => {
  const result = constrainWhisperSegmentsToAudio([
    { text: "Có âm thanh.", fromMs: 1000, toMs: 2500 },
    { text: "Whisper hallucination.", fromMs: 9770, toMs: 19430 },
    { text: "Cũng nằm ngoài chunk.", fromMs: 19680, toMs: 28550 },
  ], 10_000, 1);

  assert.deepEqual(result, {
    segments: [{ text: "Có âm thanh.", fromMs: 1000, toMs: 2500 }],
    rejectedCount: 2,
  });
});

test("clamps small timestamp overrun but rejects clips made too short", () => {
  const result = constrainWhisperSegmentsToAudio([
    { text: "Câu vừa đủ.", fromMs: 8000, toMs: 10_020 },
    { text: "Quá ngắn sau khi cắt.", fromMs: 9500, toMs: 10_030 },
  ], 10_000, 1);

  assert.deepEqual(result, {
    segments: [{ text: "Câu vừa đủ.", fromMs: 8000, toMs: 10_000 }],
    rejectedCount: 1,
  });
});
