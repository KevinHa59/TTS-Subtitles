import assert from "node:assert/strict";
import { test } from "node:test";
import { combineSubtitleCueWithPrevious } from "../src/utils/videoDubbingSubtitleEditing";
import type { VideoDubbingSubtitleCue } from "../src/types/videoDubbing";

const cues: VideoDubbingSubtitleCue[] = [
  { id: "one", startTime: 2, endTime: 3, text: "Cảnh sát đã đến." },
  { id: "two", startTime: 1.5, endTime: 4, text: "Cảnh sát đã đến!" },
  { id: "three", startTime: 5, endTime: 6, text: "Câu tiếp theo." },
];

test("merge above keeps the upper text, spans both timings, and removes the lower cue", () => {
  assert.deepEqual(combineSubtitleCueWithPrevious(cues, "two", "merge"), [
    { id: "one", startTime: 1.5, endTime: 4, text: "Cảnh sát đã đến." },
    cues[2],
  ]);
});

test("join above combines both texts and spans both timings", () => {
  assert.deepEqual(combineSubtitleCueWithPrevious(cues, "two", "join"), [
    { id: "one", startTime: 1.5, endTime: 4, text: "Cảnh sát đã đến. Cảnh sát đã đến!" },
    cues[2],
  ]);
});

test("combine actions include pending text edits and reject the first cue", () => {
  assert.deepEqual(
    combineSubtitleCueWithPrevious(cues, "two", "join", {
      one: "Câu đã sửa.",
      two: "Bản nháp mới.",
    })?.[0].text,
    "Câu đã sửa. Bản nháp mới.",
  );
  assert.equal(combineSubtitleCueWithPrevious(cues, "one", "merge"), null);
});
