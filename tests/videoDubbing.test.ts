import assert from "node:assert/strict";
import { spawnSync } from "node:child_process";
import { readFileSync } from "node:fs";
import express from "express";
import { createVideoDubbingRouter } from "../videoDubbingRoutes";
import { IncomingMessage } from "node:http";
import { PassThrough, Readable } from "node:stream";
import { mkdtemp, readdir, rm, stat } from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { after, test } from "node:test";
import { VideoDubbingManager } from "../videoDubbingManager";
import { analyzeSrtContent } from "../src/utils/videoDubbingSrt";

const temporaryDirectories: string[] = [];

async function createTemporaryDirectory(): Promise<string> {
  const directory = await mkdtemp(path.join(os.tmpdir(), "video-dubbing-test-"));
  temporaryDirectories.push(directory);
  return directory;
}

function createTestVideo(filePath: string, withAudio: boolean): Buffer {
  const args = [
    "-hide_banner",
    "-loglevel",
    "error",
    "-f",
    "lavfi",
    "-i",
    "color=c=black:s=320x240:r=25",
  ];
  if (withAudio) {
    args.push("-f", "lavfi", "-i", "sine=frequency=1000:sample_rate=44100");
  }
  args.push("-t", "1", "-c:v", "libx264", "-pix_fmt", "yuv420p");
  if (withAudio) args.push("-c:a", "aac", "-shortest");
  args.push("-y", filePath);

  const result = spawnSync("ffmpeg", args, {
    windowsHide: true,
    encoding: "utf8",
  });
  assert.equal(result.status, 0, result.stderr);
  return readFileSync(filePath);
}

function asIncomingMessage(stream: Readable | PassThrough): IncomingMessage {
  return Object.assign(stream, { headers: {} }) as IncomingMessage;
}

function createManager(storageDirectory: string, maxUploadBytes?: number) {
  return new VideoDubbingManager({
    storageDirectory,
    ffprobePath: "ffprobe",
    maxUploadBytes,
  });
}

after(async () => {
  await Promise.all(
    temporaryDirectories.map((directory) =>
      rm(directory, { recursive: true, force: true }),
    ),
  );
});

test("analyzes valid SRT and ignores malformed blocks in summary", () => {
  const analysis = analyzeSrtContent(
    "\uFEFF1\n00:00:02,500 --> 00:00:04,000\nXin chào.\n\n" +
      "2\n00:00:01.000 --> 00:00:01.900\nTạm biệt.\n\n" +
      "3\n99:99:99,000 --> 00:00:03,000\nInvalid.\n",
  );

  assert.equal(analysis.subtitleCount, 2);
  assert.equal(analysis.earliestStart, 1);
  assert.equal(analysis.latestEnd, 4);
  assert.equal(analysis.invalidBlockCount, 1);
});

test("rejects empty and malformed SRT input", () => {
  assert.throws(() => analyzeSrtContent(" \r\n "), /rỗng/i);
  assert.throws(
    () => analyzeSrtContent("not an srt file"),
    /timestamp SRT hợp lệ/i,
  );
  assert.throws(
    () => analyzeSrtContent("1\n00:00:03,000 --> 00:00:02,000\nSai.\n"),
    /timestamp SRT hợp lệ/i,
  );
});

test("keeps separate cues with matching timestamps in SRT order", () => {
  const analysis = analyzeSrtContent(
    "1\n00:00:01,000 --> 00:00:02,000\nCâu đầu.\n\n" +
      "2\n00:00:01,000 --> 00:00:02,000\nCâu thứ hai.\n",
  );
  assert.equal(analysis.subtitleCount, 2);
  assert.deepEqual(
    analysis.items.map((item) => item.text),
    ["Câu đầu.", "Câu thứ hai."],
  );
});

test("probes a Unicode-named video and accepts a source without audio", async () => {
  const directory = await createTemporaryDirectory();
  const storageDirectory = path.join(directory, "jobs");
  const sourcePath = path.join(directory, "source.mp4");
  const source = createTestVideo(sourcePath, false);
  const manager = createManager(storageDirectory);
  const job = manager.createJob("Tập thử nghiệm tiếng Việt (01).mp4", source.length);

  const result = await manager.receiveUpload(
    job.id,
    asIncomingMessage(Readable.from([source])),
  );

  assert.equal(result.status, "completed");
  assert.equal(result.fileName, "Tập thử nghiệm tiếng Việt (01).mp4");
  assert.equal(result.metadata?.width, 320);
  assert.equal(result.metadata?.height, 240);
  assert.equal(result.metadata?.durationSeconds, 1);
  assert.equal(result.metadata?.frameRate, 25);
  assert.equal(result.metadata?.videoCodec, "h264");
  assert.equal(result.metadata?.audioCodec, null);
  assert.equal(result.metadata?.sizeBytes, source.length);
  assert.equal(await stat(path.join(storageDirectory, job.id, "source.video")).then((s) => s.size), source.length);
  assert.deepEqual(readFileSync(sourcePath), source);
});

test("reports audio metadata and keeps independent job directories", async () => {
  const directory = await createTemporaryDirectory();
  const storageDirectory = path.join(directory, "jobs");
  const sourcePath = path.join(directory, "source.mp4");
  const source = createTestVideo(sourcePath, true);
  const manager = createManager(storageDirectory);
  const first = manager.createJob("phim có thoại.mp4", source.length);
  const second = manager.createJob("khác.mp4", source.length);

  const result = await manager.receiveUpload(
    first.id,
    asIncomingMessage(Readable.from([source])),
  );
  assert.equal(result.status, "completed");
  assert.equal(result.metadata?.audioCodec, "aac");
  assert.equal(result.metadata?.audioSampleRate, 44100);
  assert.equal(result.metadata?.audioChannels, 1);
  assert.equal(manager.getJob(second.id)?.status, "uploading");

  await manager.deleteJob(first.id);
  assert.deepEqual(await readdir(storageDirectory), [second.id]);
});

test("rejects invalid media and removes only its job data", async () => {
  const directory = await createTemporaryDirectory();
  const storageDirectory = path.join(directory, "jobs");
  const manager = createManager(storageDirectory);
  const first = manager.createJob("bad.mkv", 12);
  const second = manager.createJob("keep.mkv", 12);

  const result = await manager.receiveUpload(
    first.id,
    asIncomingMessage(Readable.from([Buffer.from("not a video!") ])),
  );

  assert.equal(result.status, "failed");
  assert.match(result.error || "", /video|ffprobe|metadata/i);
  assert.deepEqual(await readdir(storageDirectory), [second.id]);
  assert.equal(manager.getJob("../outside"), null);
  assert.equal(manager.isValidJobId("../outside"), false);
});

test("enforces upload limits and cleans an interrupted upload", async () => {
  const directory = await createTemporaryDirectory();
  const storageDirectory = path.join(directory, "jobs");
  const manager = createManager(storageDirectory, 64);
  const tooLarge = manager.createJob("large.mp4", 32);
  const failed = await manager.receiveUpload(
    tooLarge.id,
    asIncomingMessage(Readable.from([Buffer.alloc(80)])),
  );
  assert.equal(failed.status, "failed");
  assert.deepEqual(await readdir(storageDirectory), []);

  const interrupted = manager.createJob("cancel.mp4", 50);
  const request = asIncomingMessage(new PassThrough());
  const upload = manager.receiveUpload(interrupted.id, request);
  request.write(Buffer.from("partial"));
  const cancelled = await manager.cancelJob(interrupted.id);
  await upload;

  assert.equal(cancelled?.status, "cancelled");
  assert.equal(manager.getJob(interrupted.id)?.status, "cancelled");
  assert.deepEqual(await readdir(storageDirectory), []);
});

test("HTTP API streams video, rejects invalid job IDs, and cleans one job", async () => {
  const directory = await createTemporaryDirectory();
  const storageDirectory = path.join(directory, "jobs");
  const sourcePath = path.join(directory, "source.mp4");
  const source = createTestVideo(sourcePath, true);
  const manager = createManager(storageDirectory);
  const app = express();
  app.use(express.json());
  app.use("/api/video-dubbing", createVideoDubbingRouter(manager));

  const server = app.listen(0, "127.0.0.1");
  await new Promise<void>((resolve, reject) => {
    server.once("listening", resolve);
    server.once("error", reject);
  });
  const address = server.address();
  assert.ok(address && typeof address !== "string");
  const baseUrl = `http://127.0.0.1:${address.port}/api/video-dubbing`;

  try {
    const invalidJobResponse = await fetch(`${baseUrl}/jobs/not-a-job`);
    assert.equal(invalidJobResponse.status, 400);

    const createResponse = await fetch(`${baseUrl}/jobs`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        fileName: "../../tên video.mp4",
        sizeBytes: source.length,
      }),
    });
    assert.equal(createResponse.status, 201);
    const created = await createResponse.json();
    const jobId = created.job.id as string;
    assert.equal(created.job.fileName, ".._.._tên video.mp4");

    const uploadResponse = await fetch(`${baseUrl}/jobs/${jobId}/video`, {
      method: "PUT",
      headers: { "Content-Type": "application/octet-stream" },
      body: source,
    });
    assert.equal(uploadResponse.status, 200);
    const uploaded = await uploadResponse.json();
    assert.equal(uploaded.job.status, "completed");
    assert.equal(uploaded.job.metadata.audioCodec, "aac");

    const videoPath = path.join(storageDirectory, jobId, "source.video");
    assert.equal((await stat(videoPath)).size, source.length);

    const deleteResponse = await fetch(`${baseUrl}/jobs/${jobId}`, {
      method: "DELETE",
    });
    assert.equal(deleteResponse.status, 200);
    assert.equal(manager.getJob(jobId), null);
    assert.deepEqual(await readdir(storageDirectory), []);

    const cancelCreateResponse = await fetch(`${baseUrl}/jobs`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ fileName: "cancel.mp4", sizeBytes: 16 }),
    });
    const cancelJobId = (await cancelCreateResponse.json()).job.id as string;
    const cancelResponse = await fetch(
      `${baseUrl}/jobs/${cancelJobId}/cancel`,
      { method: "POST" },
    );
    assert.equal(cancelResponse.status, 200);
    assert.equal((await cancelResponse.json()).job.status, "cancelled");
    assert.deepEqual(await readdir(storageDirectory), []);
  } finally {
    server.closeAllConnections();
    await new Promise<void>((resolve, reject) => {
      server.close((error) => (error ? reject(error) : resolve()));
    });
  }
});
