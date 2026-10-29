import assert from "node:assert/strict";
import { test } from "node:test";
import {
  hasMatchedVideoDubbingQueueInputs,
  pairVideoDubbingQueueRows,
} from "../src/utils/videoDubbingQueue";

test("pairs video and subtitle files by their row index", () => {
  const videos = [{ name: "Film-A.mp4" }, { name: "film-b.mkv" }];
  const subtitles = [
    { fileName: "film-b.srt" },
    { fileName: "FILM-a.SRT" },
  ];

  assert.deepEqual(pairVideoDubbingQueueRows(videos, subtitles), [
    { index: 0, video: videos[0], subtitle: subtitles[1] },
    { index: 1, video: videos[1], subtitle: subtitles[0] },
  ]);
  assert.equal(
    hasMatchedVideoDubbingQueueInputs(pairVideoDubbingQueueRows(videos, subtitles)),
    true,
  );
});

test("adds unmatched subtitles as rows without videos", () => {
  const videos = [{ name: "film-a.mp4" }];
  const subtitles = [
    { fileName: "film-a.srt" },
    { fileName: "extra.srt" },
  ];
  const rows = pairVideoDubbingQueueRows(videos, subtitles);

  assert.deepEqual(rows, [
    { index: 0, video: videos[0], subtitle: subtitles[0] },
    { index: 1, video: undefined, subtitle: subtitles[1] },
  ]);
  assert.equal(hasMatchedVideoDubbingQueueInputs(rows), false);
});

test("matches incoming videos to previously unmatched subtitles", () => {
  const subtitles = [{ fileName: "film-a.srt" }];
  const rows = pairVideoDubbingQueueRows([{ name: "Film-A.MP4" }], subtitles);

  assert.deepEqual(rows, [
    {
      index: 0,
      video: { name: "Film-A.MP4" },
      subtitle: subtitles[0],
    },
  ]);
  assert.equal(hasMatchedVideoDubbingQueueInputs(rows), true);
});
