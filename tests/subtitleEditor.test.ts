import assert from "node:assert/strict";
import { test } from "node:test";
import {
  applyRawSubtitleText,
  createSubtitleCueAtTime,
  formatEditableSubtitles,
  parseEditableSubtitles,
} from "../src/utils/subtitleEditor";

test("parses SRT subtitles and strips a UTF-8 BOM", () => {
  assert.deepEqual(parseEditableSubtitles("\uFEFF1\n00:00:01,000 --> 00:00:02,500\nHello\n"), [
    { startTime: 1, endTime: 2.5, text: "Hello", translatedText: "" },
  ]);
});

test("exports edited source and translated text as SRT", () => {
  const cues = [{
    startTime: 1,
    endTime: 2.5,
    text: "Hello",
    translatedText: "Xin chào",
  }];

  assert.equal(
    formatEditableSubtitles(cues, true),
    "\uFEFF1\n00:00:01,000 --> 00:00:02,500\nXin chào\n",
  );
  assert.equal(
    formatEditableSubtitles(cues),
    "\uFEFF1\n00:00:01,000 --> 00:00:02,500\nHello\n",
  );
});

test("applies raw source SRT edits and clears translations when source text changes", () => {
  const existing = [{ startTime: 1, endTime: 2, text: "Hello", translatedText: "Xin chào" }];
  const unchanged = applyRawSubtitleText(
    "1\n00:00:01,000 --> 00:00:02,000\nHello\n",
    existing,
    false,
  );
  const changed = applyRawSubtitleText(
    "1\n00:00:01,000 --> 00:00:02,000\nHi\n",
    existing,
    false,
  );

  assert.equal(unchanged[0].translatedText, "Xin chào");
  assert.equal(changed[0].text, "Hi");
  assert.equal(changed[0].translatedText, "");
});

test("applies raw translated SRT while retaining source text and shared timestamps", () => {
  const result = applyRawSubtitleText(
    "1\n00:00:01,500 --> 00:00:03,000\nXin chào\n",
    [{ startTime: 1, endTime: 2, text: "Hello", translatedText: "" }],
    true,
  );

  assert.deepEqual(result, [{
    startTime: 1.5,
    endTime: 3,
    text: "Hello",
    translatedText: "Xin chào",
  }]);
});

test("rejects malformed or invalid-time raw SRT blocks", () => {
  assert.throws(
    () => applyRawSubtitleText("not an SRT block", [], false),
    /block SRT chưa đúng định dạng/,
  );
  assert.throws(
    () => applyRawSubtitleText("1\n00:00:02,000 --> 00:00:01,000\nBad timing\n", [], false),
    /Thời gian kết thúc phải sau thời gian bắt đầu/,
  );
});

test("creates a one-second cue at the current time and shortens it before the next cue", () => {
  const cues = [
    { startTime: 3, endTime: 4, text: "Later", translatedText: "" },
  ];
  assert.deepEqual(createSubtitleCueAtTime(cues, 1), {
    cue: { startTime: 1, endTime: 2, text: "phụ đề mới", translatedText: "" },
    index: 0,
  });
  assert.deepEqual(createSubtitleCueAtTime(cues, 2.7), {
    cue: { startTime: 2.7, endTime: 3, text: "phụ đề mới", translatedText: "" },
    index: 0,
  });
});

test("does not create a cue when the next subtitle leaves no safe gap", () => {
  assert.equal(createSubtitleCueAtTime([
    { startTime: 1, endTime: 2, text: "Existing", translatedText: "" },
  ], 1), null);
  assert.equal(createSubtitleCueAtTime([
    { startTime: 0.5, endTime: 1.5, text: "Currently active", translatedText: "" },
  ], 1), null);
});
