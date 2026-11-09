import assert from "node:assert/strict";
import { test } from "node:test";
import {
  getJoinSplitRangeSegments,
  getJoinSplitRangeTimelineBounds,
  getJoinSplitTimelineSegments,
  snapCutTimeToKeyframe,
  snapJoinSplitTimelineTime,
  snapJoinSplitTimelineTimeToTargets,
} from "../src/utils/joinSplitVideoTimeline";

const clips = [
  { start: 0, end: 2, frameRate: 24 },
  { start: 2, end: 4, frameRate: 30 },
];

test("snaps cut-in backward and cut-out before the next keyframe", () => {
  const keyframeClips = [
    {
      start: 5,
      end: 8,
      frameRate: 10,
      frameCount: 30,
      keyframeTimes: [0, 1, 2],
    },
  ];
  assert.equal(snapCutTimeToKeyframe(6.4, keyframeClips, "start"), 6);
  assert.equal(snapCutTimeToKeyframe(6.4, keyframeClips, "end"), 6.9);
});

test("keeps precise cuts when no keyframe index is available", () => {
  assert.equal(
    snapCutTimeToKeyframe(1, [
      { start: 0, end: 2, frameRate: 10, frameCount: 20, keyframeTimes: null },
    ], "start"),
    null,
  );
});

test("snaps a timeline cursor to the nearest frame", () => {
  assert.equal(snapJoinSplitTimelineTime(0.026, clips, 100, 0), 1 / 24);
  assert.equal(snapJoinSplitTimelineTime(0.01, clips, 100, 0), 0);
});

test("snaps to clip edges using a fixed screen-pixel threshold", () => {
  assert.equal(snapJoinSplitTimelineTime(1.95, clips, 100, 8), 2);
  assert.equal(snapJoinSplitTimelineTime(1.95, clips, 200, 8), 2 - 1 / 24);
});

test("supports disabling clip-edge snap while playback advances frame-by-frame", () => {
  assert.equal(snapJoinSplitTimelineTime(1.99, clips, 100, 8, false), 2);
});

test("keeps the cursor within the whole timeline and snaps the exact end", () => {
  assert.equal(snapJoinSplitTimelineTime(9, clips, 100, 8), 4);
});

test("snaps a queue cue edge to the playhead within the configured pixel threshold", () => {
  assert.equal(snapJoinSplitTimelineTimeToTargets(1.94, clips, 100, 8, [1.9]), 1.9);
  assert.equal(snapJoinSplitTimelineTimeToTargets(1.9, clips, 100, 8, [1.8]), 46 / 24);
});

test("maps a timeline range across adjacent videos to source frame segments", () => {
  assert.deepEqual(
    getJoinSplitTimelineSegments(1, 2.5, [
      { sourceId: "first", start: 0, end: 2, frameRate: 24, frameCount: 48 },
      { sourceId: "second", start: 2, end: 4, frameRate: 30, frameCount: 60 },
    ]),
    [
      { sourceId: "first", startFrame: 25, endFrame: 48 },
      { sourceId: "second", startFrame: 1, endFrame: 16 },
    ],
  );
});

test("supports legacy queue ranges and computes selected queue timeline bounds", () => {
  assert.deepEqual(
    getJoinSplitRangeSegments({ sourceId: "first", startFrame: 3, endFrame: 5 }),
    [{ sourceId: "first", startFrame: 3, endFrame: 5 }],
  );
  assert.deepEqual(
    getJoinSplitRangeTimelineBounds(
      [
        { sourceId: "first", startFrame: 25, endFrame: 48 },
        { sourceId: "second", startFrame: 1, endFrame: 16 },
      ],
      [
        { sourceId: "first", start: 0, end: 2, frameRate: 24, frameCount: 48 },
        { sourceId: "second", start: 2, end: 4, frameRate: 30, frameCount: 60 },
      ],
    ),
    { start: 1, end: 2 + 16 / 30 },
  );
});
