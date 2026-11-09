import assert from "node:assert/strict";
import { test } from "node:test";
import {
  hasMatchedVideoDubbingQueueInputs,
  pairVideoDubbingQueueRows,
  replaceVideoDubbingSubtitleSources,
  resolveVideoDubbingTtsItems,
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

test("pairs unrelated multi-import subtitles by queue order", () => {
  const videos = [{ name: "camera-a.mp4" }, { name: "camera-b.mp4" }];
  const subtitles = [
    { fileName: "phu-de-mot.srt", matchByName: true },
    { fileName: "phu-de-hai.srt", matchByName: true },
  ];

  assert.deepEqual(
    pairVideoDubbingQueueRows(videos, subtitles).map((row) => row.subtitle?.fileName),
    ["phu-de-mot.srt", "phu-de-hai.srt"],
  );
  assert.equal(
    hasMatchedVideoDubbingQueueInputs(pairVideoDubbingQueueRows(videos, subtitles)),
    true,
  );
});

test("replaces a name-matched subtitle with a video-bound replacement", () => {
  const previous = [
    { id: "old", fileName: "001.srt" },
    { id: "other", fileName: "002.srt", videoId: "video-2" },
  ];
  const replacement = {
    id: "new",
    fileName: "001.srt",
    videoId: "video-1",
  };
  const subtitles = replaceVideoDubbingSubtitleSources(
    previous,
    [replacement],
  );
  const videos = [
    { id: "video-1", name: "001.mp4" },
    { id: "video-2", name: "002.mp4" },
  ];

  assert.deepEqual(subtitles, [previous[1], replacement]);
  assert.deepEqual(
    pairVideoDubbingQueueRows(videos, subtitles).map((row) => row.subtitle?.id),
    ["new", "other"],
  );
});

test("replacing a subtitle for a video removes its prior bound source", () => {
  const previous = [
    { id: "old", fileName: "old-name.srt", videoId: "video-1" },
    { id: "other", fileName: "002.srt", videoId: "video-2" },
  ];
  const replacement = {
    id: "new",
    fileName: "001.srt",
    videoId: "video-1",
  };

  assert.deepEqual(
    replaceVideoDubbingSubtitleSources(previous, [replacement]),
    [previous[1], replacement],
  );
});

test("uses edited timeline cues for TTS and preserves SRT items when no timeline edits exist", () => {
  const original = {
    id: "srt-1",
    index: 1,
    startTime: 0,
    endTime: 2,
    targetDuration: 2,
    text: "Bản gốc",
    status: "pending" as const,
  };
  const overrides = {
    "video-1": [{ startTime: 1, endTime: 3.5, text: "Đã sửa trên timeline" }],
  };

  assert.deepEqual(
    resolveVideoDubbingTtsItems("video-1", overrides, [original]),
    [{
      id: "timeline-1",
      index: 1,
      startTime: 1,
      endTime: 3.5,
      targetDuration: 2.5,
      text: "Đã sửa trên timeline",
      status: "pending",
    }],
  );
  assert.deepEqual(
    resolveVideoDubbingTtsItems("video-2", overrides, [original]),
    [original],
  );
});

test("an empty timeline override does not fall back to the original SRT", () => {
  const original = {
    id: "srt-1",
    index: 1,
    startTime: 0,
    endTime: 2,
    targetDuration: 2,
    text: "Bản gốc",
    status: "pending" as const,
  };

  assert.deepEqual(resolveVideoDubbingTtsItems("video-1", { "video-1": [] }, [original]), []);
});
