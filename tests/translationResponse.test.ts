import assert from "node:assert/strict";
import { test } from "node:test";
import { parseSubtitleTranslations } from "../src/utils/translationResponse";
import { TranslationStreamParser } from "../src/utils/translationStreamParser";

test("ignores unknown and duplicate IDs while keeping the first valid translation", () => {
  const result = parseSubtitleTranslations(
    [{ id: "0" }, { id: "1" }],
    [
      { id: "unknown", translation: "Extra" },
      { id: "0", translation: "Xin chào" },
      { id: "0", translation: "Bản khác" },
      { id: "1", translation: "Tạm biệt" },
    ],
  );

  assert.deepEqual([...result], [["0", "Xin chào"], ["1", "Tạm biệt"]]);
});

test("still rejects a response missing a non-empty required translation", () => {
  assert.throws(
    () => parseSubtitleTranslations(
      [{ id: "0" }, { id: "1" }],
      [{ id: "0", translation: "Xin chào" }, { id: "1", translation: " " }],
    ),
    /không trả về bản dịch hợp lệ cho phụ đề 1/,
  );
});

test("parses complete streamed translations as chunks arrive", () => {
  const parser = new TranslationStreamParser();
  assert.deepEqual(parser.push('{"translations":[{"id":"0","translation":"xin '), []);
  assert.deepEqual(
    parser.push('chào"},{"id":"1","translation":"có } trong chuỗi \\"json\\""}'),
    [
      { id: "0", translation: "xin chào" },
      { id: "1", translation: 'có } trong chuỗi "json"' },
    ],
  );
  assert.deepEqual(parser.push("]}"), []);
});

test("waits for the full translation object before emitting it", () => {
  const parser = new TranslationStreamParser();
  assert.deepEqual(parser.push('{"translations":[{"id":"0","translation":"partial'), []);
  assert.deepEqual(parser.push(' result"}'), [{ id: "0", translation: "partial result" }]);
});
