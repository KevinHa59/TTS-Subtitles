import assert from "node:assert/strict";
import { test } from "node:test";
import type { VideoDubbingTextOverlayCue } from "../src/types/videoDubbing";
import { fitTextOverlaysToVideoDuration } from "../src/utils/videoDubbingOverlays";

const createCue = (
  startTime: number,
  endTime: number,
  extendToVideoEnd = false,
): VideoDubbingTextOverlayCue => ({
  startTime,
  endTime,
  text: "Text mới",
  extendToVideoEnd,
  fontSize: 36,
  fontFamily: "Arial",
  color: "#ffffff",
  bold: false,
  italic: false,
  position: "middle-center",
  backgroundColor: "#000000",
  backgroundTransparent: true,
  paddingPx: 8,
});

test("extends full-video text overlays to each target video's duration", () => {
  const cue = createCue(2, 5, true);

  assert.equal(fitTextOverlaysToVideoDuration([cue], 8)[0].endTime, 8);
  assert.equal(fitTextOverlaysToVideoDuration([cue], 3)[0].endTime, 3);
});

test("titles always span the full target video regardless of their saved timing", () => {
  const title = { ...createCue(12, 18), isTitle: true };

  assert.deepEqual(
    fitTextOverlaysToVideoDuration([title], 30).map(({ startTime, endTime }) => ({ startTime, endTime })),
    [{ startTime: 0, endTime: 30 }],
  );
  assert.deepEqual(
    fitTextOverlaysToVideoDuration([title], 8).map(({ startTime, endTime }) => ({ startTime, endTime })),
    [{ startTime: 0, endTime: 8 }],
  );
});

test("does not export disabled title overlays", () => {
  const title = { ...createCue(0, 10), isTitle: true, enabled: false };
  assert.deepEqual(fitTextOverlaysToVideoDuration([title], 20), []);
});

test("keeps fixed text timing and omits clips outside the target video", () => {
  const cues = [createCue(1, 7), createCue(8, 10, true)];
  const fitted = fitTextOverlaysToVideoDuration(cues, 5);

  assert.deepEqual(fitted.map(({ startTime, endTime }) => ({ startTime, endTime })), [
    { startTime: 1, endTime: 5 },
  ]);
});
