import assert from "node:assert/strict";
import { test } from "node:test";
import {
  DEFAULT_CHARACTER_CARD_STYLE,
  getCharacterCardScanRange,
  getCharacterCardScanRanges,
  getTextOverlayTimelineLanes,
  groupCharacterCardOcrCues,
  groupCharacterCardOcrCuesByOccurrences,
  resolveCharacterCardStyle,
} from "../src/utils/videoDubbingCharacterCards";

test("starts before the playhead and scans the requested duration", () => {
  assert.deepEqual(getCharacterCardScanRange(25, 5, 10, 100), {
    startTime: 20,
    endTime: 30,
    durationSeconds: 10,
  });
});

test("clamps the scan range at both video boundaries", () => {
  assert.deepEqual(getCharacterCardScanRange(4, 10, 10, 100), {
    startTime: 0,
    endTime: 10,
    durationSeconds: 10,
  });
  assert.deepEqual(getCharacterCardScanRange(98, 5, 10, 100), {
    startTime: 93,
    endTime: 100,
    durationSeconds: 7,
  });
  const nearEnd = getCharacterCardScanRange(99.95, 0, 10, 100);
  assert.equal(nearEnd.endTime, 100);
  assert.ok(nearEnd.durationSeconds >= 0.1);
});

test("merges overlapping scan windows from selected reference matches", () => {
  assert.deepEqual(getCharacterCardScanRanges([10, 14, 30], 5, 10, 100), [
    { startTime: 5, endTime: 19, durationSeconds: 14 },
    { startTime: 25, endTime: 35, durationSeconds: 10 },
  ]);
});

test("stacks overlapping text timeline cues within each track", () => {
  const result = getTextOverlayTimelineLanes([
    { kind: "character-card", trackId: "track-1", startTime: 1, endTime: 4, text: "Mina" },
    { kind: "character-card", trackId: "track-1", startTime: 2, endTime: 3, text: "Kai" },
    { kind: "character-card", trackId: "track-1", startTime: 4, endTime: 5, text: "Mina" },
    { kind: "text", trackId: "track-2", startTime: 2, endTime: 5, text: "Overlay" },
    { isTitle: true, trackId: "track-1", startTime: 0, endTime: 10, text: "Title" },
  ], "track-1");

  assert.deepEqual(result.lanes, [0, 1, 0, 0, 0]);
  assert.deepEqual(result.countsByTrackId, { "track-1": 2, "track-2": 1 });
});

test("restores shared character card style and safely defaults invalid values", () => {
  assert.deepEqual(resolveCharacterCardStyle({
    fontSize: 44,
    characterRoleFontSize: 30,
    fontFamily: "Genos",
    color: "#ffcc00",
    position: "bottom-right",
    xPercent: 70,
    yPercent: 88,
    textAlign: "right",
  }), {
    ...DEFAULT_CHARACTER_CARD_STYLE,
    fontSize: 44,
    characterRoleFontSize: 30,
    fontFamily: "Genos",
    color: "#ffcc00",
    position: "bottom-right",
    xPercent: 70,
    yPercent: 88,
    textAlign: "right",
  });
  assert.deepEqual(resolveCharacterCardStyle({ fontSize: "large", position: "invalid" }), {
    ...DEFAULT_CHARACTER_CARD_STYLE,
  });
});

test("groups overlapping OCR lines into one character card interval", () => {
  const groups = groupCharacterCardOcrCues([
    { startTime: 2, endTime: 4, text: "Mina", confidence: 0.9 },
    { startTime: 2.1, endTime: 3.9, text: "Detective", confidence: 0.8 },
    { startTime: 2.2, endTime: 4.1, text: "mina", confidence: 0.7 },
  ]);
  assert.deepEqual(groups, [{
    startTime: 2,
    endTime: 4.1,
    lines: ["Mina", "Detective"],
  }]);
});

test("keeps OCR detections with a visible gap as separate card cues", () => {
  const groups = groupCharacterCardOcrCues([
    { startTime: 1, endTime: 2, text: "Mina", confidence: 0.9 },
    { startTime: 2.2, endTime: 3, text: "Detective", confidence: 0.8 },
  ]);
  assert.equal(groups.length, 2);
});

test("creates OCR groups only for selected reference occurrences", () => {
  const groups = groupCharacterCardOcrCuesByOccurrences([
    { startTime: 9.4, endTime: 9.8, text: "Nearby before", confidence: 0.9 },
    { startTime: 10.1, endTime: 10.4, text: "Mina", confidence: 0.9 },
    { startTime: 10.2, endTime: 10.5, text: "Detective", confidence: 0.8 },
    { startTime: 11.2, endTime: 11.6, text: "Nearby after", confidence: 0.9 },
    { startTime: 20.1, endTime: 20.5, text: "Kai", confidence: 0.9 },
  ], [
    { startTime: 10, endTime: 11, time: 10.5 },
    { startTime: 20, endTime: 21, time: 20.5 },
  ]);

  assert.deepEqual(groups, [
    { startTime: 10, endTime: 11, lines: ["Mina", "Detective"] },
    { startTime: 20, endTime: 21, lines: ["Kai"] },
  ]);
});
