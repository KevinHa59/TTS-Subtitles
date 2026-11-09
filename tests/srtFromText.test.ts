import assert from "node:assert/strict";
import { test } from "node:test";
import {
  createSrtZip,
  extractSrtFilesFromText,
} from "../src/utils/srtFromText";

const sample = `061.srt

1
00:00:00,208 --> 00:00:01,292
Trường mới mở được mấy ngày

2
00:00:01,792 --> 00:00:03,125
Không biết ai truyền tin ra ngoài

062.srt

1
00:00:01,875 --> 00:00:03,041
Thì ra giáo dục khó thế này

2
00:00:03,041 --> 00:00:04,625
Trường cuối cùng cũng vào guồng`;

test("extracts separate SRT files from named sections and renumbers each file", () => {
  const files = extractSrtFilesFromText(sample);
  assert.deepEqual(files.map((file) => file.fileName), ["061.srt", "062.srt"]);
  assert.match(files[0].content, /^1\n00:00:00,208 --> 00:00:01,292\nTrường mới mở được mấy ngày/m);
  assert.match(files[1].content, /^2\n00:00:03,041 --> 00:00:04,625\nTrường cuối cùng cũng vào guồng/m);
});

test("rejects malformed, empty, and duplicate file sections", () => {
  assert.throws(() => extractSrtFilesFromText("not a file marker\n"), /bắt đầu bằng tên file/);
  assert.throws(() => extractSrtFilesFromText("061.srt\n\n"), /không có nội dung/);
  assert.throws(
    () => extractSrtFilesFromText(`${sample}\n\n061.srt\n\n${sample.split("062.srt\n\n")[1]}`),
    /Tên file bị trùng/,
  );
});

test("creates a ZIP archive with named SRT files", async () => {
  const files = extractSrtFilesFromText(sample);
  const bytes = new Uint8Array(await createSrtZip(files).arrayBuffer());
  const view = new DataView(bytes.buffer);
  assert.equal(view.getUint32(0, true), 0x04034b50);
  const archiveText = new TextDecoder().decode(bytes);
  assert.ok(archiveText.includes("061.srt"));
  assert.ok(archiveText.includes("062.srt"));
  assert.equal(view.getUint32(bytes.length - 22, true), 0x06054b50);
});
