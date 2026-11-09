import assert from "node:assert/strict";
import { test } from "node:test";
import { adjustSubtitleCueTimings } from "../src/utils/videoDubbingSubtitleTiming";
import type { VideoDubbingSubtitleCue } from "../src/types/videoDubbing";

const cues: VideoDubbingSubtitleCue[] = [
  { startTime: 1, endTime: 2, text: "One" },
  { startTime: 2.2, endTime: 3, text: "Two" },
  { startTime: 4, endTime: 5, text: "Three" },
];

test("extends subtitle boundaries only into available gaps", () => {
  const startsEarlier = adjustSubtitleCueTimings(cues, "start", -0.5, 6);
  assert.equal(startsEarlier[0].startTime, 0.5);
  assert.equal(startsEarlier[1].startTime, 2);

  const endsLater = adjustSubtitleCueTimings(cues, "end", 0.5, 6);
  assert.equal(endsLater[0].endTime, 2.2);
  assert.equal(endsLater[1].endTime, 3.5);

  assert.ok(endsLater.every((cue, index) =>
    index === endsLater.length - 1 || cue.endTime <= endsLater[index + 1].startTime,
  ));

  const alreadyOverlapping: VideoDubbingSubtitleCue[] = [
    { startTime: 1, endTime: 2.5, text: "Overlap one" },
    { startTime: 2, endTime: 3, text: "Overlap two" },
  ];
  assert.deepEqual(
    adjustSubtitleCueTimings(alreadyOverlapping, "end", 0.2, 6),
    alreadyOverlapping,
  );
});

test("moves every subtitle by one shared bounded offset", () => {
  const movedLeft = adjustSubtitleCueTimings(cues, "move", -2, 6);
  assert.deepEqual(movedLeft.map(({ endTime }) => endTime), [1, 2, 4]);
  assert.ok(Math.abs(movedLeft[1].startTime - 1.2) < 1e-9);

  const movedRight = adjustSubtitleCueTimings(cues, "move", 2, 6);
  assert.deepEqual(movedRight.map(({ endTime }) => endTime), [3, 4, 6]);
  assert.ok(Math.abs(movedRight[1].startTime - 3.2) < 1e-9);
});
