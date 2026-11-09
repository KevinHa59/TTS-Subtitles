import assert from "node:assert/strict";
import { execFileSync } from "node:child_process";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { Readable } from "node:stream";
import type { IncomingMessage } from "node:http";
import { test } from "node:test";
import { JoinSplitVideoManager } from "../joinSplitVideoManager";

test("uploads, analyzes, frame-cuts, and joins compatible video without re-encoding", async (t) => {
  try {
    execFileSync("ffmpeg", ["-version"], { stdio: "ignore" });
    execFileSync("ffprobe", ["-version"], { stdio: "ignore" });
  } catch {
    t.skip("FFmpeg/FFprobe are unavailable.");
    return;
  }

  const directory = fs.mkdtempSync(path.join(os.tmpdir(), "join-split-video-test-"));
  t.after(() => fs.rmSync(directory, { recursive: true, force: true }));
  const firstPath = path.join(directory, "first.mp4");
  const secondPath = path.join(directory, "second.mp4");
  const mismatchPath = path.join(directory, "mismatch.mp4");
  const mismatchRatePath = path.join(directory, "mismatch-rate.mp4");
  const bFramesPath = path.join(directory, "bframes.mp4");
  const shiftedTimestampPath = path.join(directory, "shifted-timestamp.mp4");
  const longGopPath = path.join(directory, "long-gop.mp4");
  const generate = (filePath: string, size: string, rate = 10, bFrames = 0, timestampOffset?: number) =>
    execFileSync("ffmpeg", [
      "-nostdin", "-hide_banner", "-loglevel", "error", "-y",
      "-f", "lavfi", "-i", `testsrc=size=${size}:rate=${rate}`,
      "-f", "lavfi", "-i", "sine=frequency=440:sample_rate=48000",
      "-t", "2", "-shortest", "-c:v", "libx264", "-bf", String(bFrames), "-g", "10",
      "-pix_fmt", "yuv420p", "-c:a", "aac", "-b:a", "128k",
      ...(timestampOffset === undefined ? [] : ["-output_ts_offset", String(timestampOffset)]),
      filePath,
    ], { stdio: "ignore" });
  generate(firstPath, "64x64");
  generate(secondPath, "64x64");
  generate(mismatchPath, "80x64");
  generate(mismatchRatePath, "64x64", 20);
  generate(bFramesPath, "64x64", 10, 2);
  generate(shiftedTimestampPath, "64x64", 10, 0, 5);
  execFileSync("ffmpeg", [
    "-nostdin", "-hide_banner", "-loglevel", "error", "-y",
    "-f", "lavfi", "-i", "color=c=black:s=64x64:r=30",
    "-t", "100", "-c:v", "libx264", "-preset", "ultrafast",
    "-g", "3000", "-keyint_min", "1", "-sc_threshold", "0",
    "-force_key_frames", "0,99.9666667", "-pix_fmt", "yuv420p",
    longGopPath,
  ], { stdio: "ignore" });

  const manager = new JoinSplitVideoManager({
    storageDirectory: path.join(directory, "storage"),
    ffmpegPath: "ffmpeg",
    ffprobePath: "ffprobe",
  });
  const upload = async (filePath: string) =>
    manager.addUpload(
      Readable.from(fs.readFileSync(filePath)) as unknown as IncomingMessage,
      path.basename(filePath),
    );
  const first = await upload(firstPath);
  const second = await upload(secondPath);
  const mismatch = await upload(mismatchPath);
  const mismatchRate = await upload(mismatchRatePath);
  const bFrames = await upload(bFramesPath);
  const shiftedTimestamp = await upload(shiftedTimestampPath);
  const longGop = await upload(longGopPath);
  const restoredAfterUploads = new JoinSplitVideoManager({
    storageDirectory: path.join(directory, "storage"),
    ffmpegPath: "ffmpeg",
    ffprobePath: "ffprobe",
  });
  assert.equal(restoredAfterUploads.getSource(first.id)?.fileName, first.fileName);
  assert.equal(restoredAfterUploads.getSource(shiftedTimestamp.id)?.keyframeTimes?.[0], 0);

  assert.equal(first.frameRate, 10);
  assert.equal(first.frameCount, 20);
  assert.equal(shiftedTimestamp.keyframeTimes?.[0], 0);
  const shiftedTimestampCut = {
    id: "shifted-timestamp-cut",
    sourceId: shiftedTimestamp.id,
    startFrame: 1,
    endFrame: 10,
  };
  assert.equal(
    manager.inspectRanges([shiftedTimestampCut], shiftedTimestamp.id)[0].requiresEncoding,
    false,
    "keyframes should be normalized against a non-zero stream start timestamp",
  );
  const bFrameAlignedCut = { id: "bframe-aligned", sourceId: bFrames.id, startFrame: 11, endFrame: 20 };
  assert.equal(
    manager.inspectRanges([bFrameAlignedCut], bFrames.id)[0].requiresEncoding,
    false,
    "a keyframe-aligned partial cut can be stream-copied even when the source has B-frames",
  );
  const copyRange = { id: "copy", sourceId: first.id, startFrame: 1, endFrame: 10 };
  const secondGopRange = { id: "copy-second-gop", sourceId: first.id, startFrame: 11, endFrame: 20 };
  assert.equal(
    manager.inspectRanges([copyRange, secondGopRange], first.id).every((range) => !range.requiresEncoding),
    true,
    "keyframe-aligned ranges with a matching profile can be copied",
  );
  const encodeRange = { ...copyRange, id: "encode", sourceId: mismatch.id };
  const crossVideoRange = {
    id: "cross-video",
    sourceId: first.id,
    startFrame: 11,
    endFrame: 20,
    segments: [
      { sourceId: first.id, startFrame: 11, endFrame: 20 },
      { sourceId: second.id, startFrame: 1, endFrame: 10 },
    ],
  };
  const mixedCrossVideoRange = {
    id: "mixed-cross-video",
    sourceId: first.id,
    startFrame: 11,
    endFrame: 20,
    segments: [
      { sourceId: first.id, startFrame: 11, endFrame: 20 },
      { sourceId: mismatch.id, startFrame: 1, endFrame: 10 },
    ],
  };
  assert.equal(
    manager.inspectRanges([encodeRange], first.id)[0].requiresEncoding,
    true,
    "a mismatched source profile requires encoding to the selected profile",
  );
  assert.equal(
    manager.inspectRanges([crossVideoRange], first.id)[0].requiresEncoding,
    false,
    "compatible keyframe-aligned segments can be concatenated without re-encoding",
  );
  const directEncodeStatus = manager.inspectRanges([copyRange], first.id, false)[0];
  assert.equal(directEncodeStatus.requiresEncoding, true);
  assert.deepEqual(directEncodeStatus.encodingReasons, ["keyframe preference is disabled"]);

  const [cutFile, secondGopFile, encodedCutFile, crossVideoFile, mixedCrossVideoFile] = await manager.exportRanges(
    [copyRange, secondGopRange, encodeRange, crossVideoRange, mixedCrossVideoRange],
    first.id,
  );
  assert.ok(fs.statSync(manager.getExport(cutFile.id)!.filePath).size > 0);
  const [queueOneFile] = await manager.exportRanges([copyRange], first.id, undefined, true, 1);
  const [queueTwoFile] = await manager.exportRanges([secondGopRange], first.id, undefined, true, 2);
  assert.match(queueOneFile.fileName, /^Q1_/);
  assert.match(queueTwoFile.fileName, /^Q2_/);
  const cutFrameCount = (filePath: string) =>
    Number(execFileSync("ffprobe", [
      "-v", "error", "-count_frames", "-select_streams", "v:0",
      "-show_entries", "stream=nb_read_frames", "-of", "default=nokey=1:noprint_wrappers=1",
      filePath,
    ], { encoding: "utf8" }).trim());
  const longGopRange = {
    id: "long-gop-exact-frame-count",
    sourceId: longGop.id,
    startFrame: 1,
    endFrame: 2999,
  };
  assert.equal(manager.inspectRanges([longGopRange], longGop.id)[0].requiresEncoding, false);
  const [longGopCut] = await manager.exportRanges([longGopRange], longGop.id);
  assert.equal(
    cutFrameCount(manager.getExport(longGopCut.id)!.filePath),
    2999,
    "stream-copy output must be capped to the requested video frame count",
  );
  const shiftedTimestampEncodeRange = {
    id: "shifted-timestamp-seek-encode",
    sourceId: shiftedTimestamp.id,
    startFrame: 11,
    endFrame: 20,
  };
  const [shiftedTimestampEncode] = await manager.exportRanges(
    [shiftedTimestampEncodeRange],
    shiftedTimestamp.id,
    undefined,
    false,
  );
  assert.equal(
    cutFrameCount(manager.getExport(shiftedTimestampEncode.id)!.filePath),
    10,
    "seek-before-decode must preserve exact frame counts with non-zero source timestamps",
  );
  assert.equal(cutFrameCount(manager.getExport(cutFile.id)!.filePath), 10);
  assert.equal(cutFrameCount(manager.getExport(secondGopFile.id)!.filePath), 10);
  assert.equal(cutFrameCount(manager.getExport(encodedCutFile.id)!.filePath), 10);
  assert.equal(cutFrameCount(manager.getExport(crossVideoFile.id)!.filePath), 20);
  assert.equal(cutFrameCount(manager.getExport(mixedCrossVideoFile.id)!.filePath), 20);
  const directEncodeProgressId = "direct-encode-progress";
  const [directEncodeFile] = await manager.exportRanges(
    [copyRange],
    first.id,
    directEncodeProgressId,
    false,
  );
  assert.equal(cutFrameCount(manager.getExport(directEncodeFile.id)!.filePath), 10);
  assert.equal(manager.getExportProgress(directEncodeProgressId)?.strategy, "encode");
  const progressId = "integration-progress";
  const [bFrameCut] = await manager.exportRanges([bFrameAlignedCut], bFrames.id, progressId);
  const restoredAfterExport = new JoinSplitVideoManager({
    storageDirectory: path.join(directory, "storage"),
    ffmpegPath: "ffmpeg",
    ffprobePath: "ffprobe",
  });
  assert.equal(restoredAfterExport.getExport(bFrameCut.id)?.fileName, bFrameCut.fileName);
  assert.deepEqual(manager.getExportProgress(progressId), {
    status: "done",
    percent: 100,
    message: "Đã xuất xong.",
    strategy: "stream-copy",
  });
  assert.equal(cutFrameCount(manager.getExport(bFrameCut.id)!.filePath), 10);
  const cancelProgressId = "integration-cancel";
  const cancelledExport = manager.exportRanges([encodeRange], first.id, cancelProgressId);
  assert.equal(manager.cancelExport(cancelProgressId), true);
  await assert.rejects(cancelledExport, /dừng/i);
  assert.equal(manager.getExportProgress(cancelProgressId)?.status, "cancelled");
  const joined = await manager.joinSources([first.id, second.id], first.id);
  assert.ok(fs.statSync(manager.getExport(joined.id)!.filePath).size > 0);
  assert.equal(cutFrameCount(manager.getExport(joined.id)!.filePath), 40);
  const mixedJoined = await manager.joinSources([first.id, mismatch.id], first.id);
  assert.equal(cutFrameCount(manager.getExport(mixedJoined.id)!.filePath), 40);
  const convertedRateJoin = await manager.joinSources([first.id, mismatchRate.id], first.id);
  assert.equal(cutFrameCount(manager.getExport(convertedRateJoin.id)!.filePath), 40);
  const queueJoinProgressId = "queue-join-progress";
  const queueJoined = await manager.joinExports(
    [cutFile.id, secondGopFile.id],
    first.id,
    queueJoinProgressId,
  );
  assert.deepEqual(manager.getExportProgress(queueJoinProgressId), {
    status: "done",
    percent: 100,
    message: "Đã ghép queue xong.",
    strategy: "stream-copy",
  });
  assert.equal(cutFrameCount(manager.getExport(queueJoined.id)!.filePath), 20);

  const storageDirectory = path.join(directory, "storage");
  assert.ok(fs.readdirSync(storageDirectory).length > 0);
  assert.ok((await manager.cleanStorage()) > 0);
  assert.deepEqual(fs.readdirSync(storageDirectory), []);
  assert.equal(manager.getSource(first.id), null);
  assert.equal(manager.getExport(cutFile.id), null);
});
