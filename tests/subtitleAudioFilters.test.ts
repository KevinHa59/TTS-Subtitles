import assert from "node:assert/strict";
import { test } from "node:test";
import { filterSubtitleAudioItems } from "../src/utils/subtitleAudioFilters";

const items = [
  { id: "one", text: "Cảnh sát đã đến hiện trường." },
  { id: "two", text: "Cảnh sát đã đến hiện trường!" },
  { id: "three", text: "Một nội dung khác." },
  { id: "four", text: "?!..." },
  { id: "five", text: "12345" },
  { id: "six", text: "" },
];

test("filters short subtitles by a maximum character count", () => {
  assert.deepEqual(
    filterSubtitleAudioItems(items, { maxCharacterCount: 0 }).map(({ id }) => id),
    ["six"],
  );
  assert.deepEqual(
    filterSubtitleAudioItems(items, { maxCharacterCount: 5 }).map(({ id }) => id),
    ["four", "five", "six"],
  );
});

test("filters punctuation-only subtitles but keeps numbers and letters", () => {
  assert.deepEqual(
    filterSubtitleAudioItems(items, { specialCharactersOnly: true }).map(({ id }) => id),
    ["four"],
  );
});

test("filters both members of adjacent pairs with similarity strictly above 80 percent", () => {
  assert.deepEqual(
    filterSubtitleAudioItems(items, { similarAdjacent: true }).map(({ id }) => id),
    ["one", "two"],
  );
});

test("does not include adjacent sentences at exactly 80 percent similarity", () => {
  const boundaryItems = [
    { id: "long", text: "abcdefghij" },
    { id: "short", text: "abcdefgh" },
  ];

  assert.deepEqual(
    filterSubtitleAudioItems(boundaryItems, { similarAdjacent: true }),
    [],
  );
});

test("combines enabled subtitle filters as a union", () => {
  assert.deepEqual(
    filterSubtitleAudioItems(items, {
      maxCharacterCount: 0,
      specialCharactersOnly: true,
    }).map(({ id }) => id),
    ["four", "six"],
  );
});
