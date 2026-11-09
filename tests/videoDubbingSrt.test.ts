import assert from "node:assert/strict";
import { test } from "node:test";
import { createSrtZip } from "../src/utils/srtFromText";
import { formatVideoDubbingSrt } from "../src/utils/videoDubbingSrt";

test("formats edited subtitle cues with rounded millisecond timestamps", () => {
  const content = formatVideoDubbingSrt([
    { startTime: 1.0414, endTime: 2.7086, text: "Dòng phụ đề thứ nhất\nDòng hai" },
    { startTime: 62.5, endTime: 63, text: "Dòng tiếp theo" },
  ]);

  assert.equal(
    content,
    "1\n00:00:01,041 --> 00:00:02,709\nDòng phụ đề thứ nhất\nDòng hai\n\n2\n00:01:02,500 --> 00:01:03,000\nDòng tiếp theo\n",
  );
});

test("rejects invalid subtitle cue timestamps", () => {
  assert.throws(
    () =>
      formatVideoDubbingSrt([
        { startTime: 3, endTime: 2, text: "Invalid" },
      ]),
    /không hợp lệ/,
  );
});

test("creates a ZIP containing the requested SRT names and contents", async () => {
  const zip = createSrtZip([
    { fileName: "061.srt", content: "1\n00:00:00,000 --> 00:00:01,000\nMột\n" },
    { fileName: "062.srt", content: "1\n00:00:01,000 --> 00:00:02,000\nHai\n" },
  ]);
  const entries = new TextDecoder().decode(await zip.arrayBuffer());

  assert.equal(zip.type, "application/zip");
  assert.match(entries, /061\.srt/);
  assert.match(entries, /062\.srt/);
  assert.match(entries, /Một/);
  assert.match(entries, /Hai/);
});
