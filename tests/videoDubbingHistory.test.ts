import assert from "node:assert/strict";
import { spawnSync } from "node:child_process";
import express from "express";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { Readable } from "node:stream";
import { after, test } from "node:test";
import { VideoDubbingManager } from "../videoDubbingManager";
import { VideoDubbingMediaCoordinator } from "../videoDubbingMedia";
import { createVideoDubbingRouter } from "../videoDubbingRoutes";
import { VideoDubbingSeparationCoordinator } from "../videoDubbingSeparation";
import { VideoDubbingSeparationAvailability } from "../src/types/videoDubbing";

const temporaryDirectories: string[] = [];

async function createTemporaryDirectory(): Promise<string> {
  const directory = await fs.promises.mkdtemp(
    path.join(os.tmpdir(), "video-dubbing-history-test-"),
  );
  temporaryDirectories.push(directory);
  return directory;
}

function run(command: string, args: string[]): void {
  const result = spawnSync(command, args, {
    windowsHide: true,
    encoding: "utf8",
    maxBuffer: 8 * 1024 * 1024,
  });
  assert.equal(result.status, 0, result.stderr);
}

function createVideo(filePath: string): Buffer {
  run("ffmpeg", [
    "-hide_banner",
    "-loglevel",
    "error",
    "-f",
    "lavfi",
    "-i",
    "color=c=black:s=320x240:r=25",
    "-f",
    "lavfi",
    "-i",
    "sine=frequency=440:sample_rate=44100:duration=1",
    "-t",
    "1",
    "-c:v",
    "libx264",
    "-preset",
    "ultrafast",
    "-pix_fmt",
    "yuv420p",
    "-c:a",
    "aac",
    "-y",
    filePath,
  ]);
  return fs.readFileSync(filePath);
}

function createWav(filePath: string): void {
  run("ffmpeg", [
    "-hide_banner",
    "-loglevel",
    "error",
    "-f",
    "lavfi",
    "-i",
    "sine=frequency=880:sample_rate=22050:duration=1",
    "-ac",
    "1",
    "-c:a",
    "pcm_s16le",
    "-y",
    filePath,
  ]);
}

function createDemucsTrack(filePath: string, frequency: number): void {
  run("ffmpeg", [
    "-hide_banner",
    "-loglevel",
    "error",
    "-f",
    "lavfi",
    "-i",
    `sine=frequency=${frequency}:sample_rate=44100:duration=1`,
    "-ac",
    "2",
    "-c:a",
    "pcm_s16le",
    "-y",
    filePath,
  ]);
}

function createManager(storageDirectory: string): VideoDubbingManager {
  return new VideoDubbingManager({
    storageDirectory,
    ffprobePath: "ffprobe",
  });
}

async function createCompletedJob(
  manager: VideoDubbingManager,
  fixtureDirectory: string,
  name: string,
): Promise<string> {
  const source = createVideo(path.join(fixtureDirectory, `${name}.mp4`));
  const job = manager.createJob(`${name}.mp4`, source.length);
  const uploaded = await manager.receiveUpload(
    job.id,
    Object.assign(Readable.from([source]), { headers: {} }),
  );
  assert.equal(uploaded.status, "completed");
  return job.id;
}

async function startServer(app: express.Express) {
  const server = app.listen(0, "127.0.0.1");
  await new Promise<void>((resolve, reject) => {
    server.once("listening", resolve);
    server.once("error", reject);
  });
  const address = server.address();
  assert.ok(address && typeof address !== "string");
  return {
    server,
    baseUrl: `http://127.0.0.1:${address.port}/api/video-dubbing`,
  };
}

after(async () => {
  await Promise.all(
    temporaryDirectories.map((directory) =>
      fs.promises.rm(directory, { recursive: true, force: true }),
    ),
  );
});

test("lists persistent jobs after restart, verifies outputs, streams the right job, and deletes in isolation", async () => {
  const root = await createTemporaryDirectory();
  const storage = path.join(root, "jobs");
  const fixtures = path.join(root, "fixtures");
  fs.mkdirSync(fixtures);
  const firstManager = createManager(storage);
  const jobA = await createCompletedJob(firstManager, fixtures, "history-a");
  const jobB = await createCompletedJob(firstManager, fixtures, "history-b");

  const directoryA = path.join(storage, jobA);
  const masterTemp = path.join(directoryA, "master-temp.wav");
  createWav(masterTemp);
  firstManager.setMasterGeneration(jobA, {
    status: "generating",
    progressPercent: 100,
    completedSentences: 1,
    totalSentences: 1,
  });
  firstManager.completeMasterGeneration(jobA, masterTemp, 1);
  createDemucsTrack(path.join(directoryA, "vocals.wav"), 880);
  createDemucsTrack(path.join(directoryA, "instrumental.wav"), 440);
  firstManager.setSeparationTask(jobA, {
    status: "completed",
    progressPercent: 100,
    completedSegments: 1,
    totalSegments: 1,
    durationSeconds: 1,
    sampleRate: 44100,
    channels: 2,
    vocalsSizeBytes: fs.statSync(path.join(directoryA, "vocals.wav")).size,
    instrumentalSizeBytes: fs.statSync(
      path.join(directoryA, "instrumental.wav"),
    ).size,
  });
  const mixWav = path.join(directoryA, "mix-temp.wav");
  createWav(mixWav);
  run("ffmpeg", [
    "-hide_banner",
    "-loglevel",
    "error",
    "-i",
    mixWav,
    "-c:a",
    "aac",
    "-y",
    path.join(directoryA, "mixed-audio.m4a"),
  ]);
  run("ffmpeg", [
    "-hide_banner",
    "-loglevel",
    "error",
    "-i",
    path.join(directoryA, "source.video"),
    "-c",
    "copy",
    "-y",
    path.join(directoryA, "output.mp4"),
  ]);
  firstManager.setMediaTask(jobA, "audioMix", {
    status: "completed",
    ttsVolumePercent: 100,
    originalVolumePercent: 100,
    durationSeconds: 1,
    sizeBytes: fs.statSync(path.join(directoryA, "mixed-audio.m4a")).size,
  });
  firstManager.setMediaTask(jobA, "videoExport", {
    status: "completed",
    durationSeconds: 1,
    sizeBytes: fs.statSync(path.join(directoryA, "output.mp4")).size,
  });

  const restartedManager = createManager(storage);
  const availability: VideoDubbingSeparationAvailability = {
    status: "ready",
    model: "htdemucs",
    device: "cpu",
    message: "Ready for history test.",
  };
  const separation = new VideoDubbingSeparationCoordinator(restartedManager, {
    pythonPath: "python",
    ffmpegPath: "ffmpeg",
    ffprobePath: "ffprobe",
    isMediaBusy: () => false,
    checkAvailability: async () => availability,
  });
  const media = new VideoDubbingMediaCoordinator(restartedManager, {
    ffmpegPath: "ffmpeg",
    ffprobePath: "ffprobe",
  });
  const app = express();
  app.use(express.json());
  app.use(
    "/api/video-dubbing",
    createVideoDubbingRouter(restartedManager, undefined, media, separation),
  );
  const { server, baseUrl } = await startServer(app);

  try {
    const historyResponse = await fetch(`${baseUrl}/jobs`);
    assert.equal(historyResponse.status, 200);
    const history = (await historyResponse.json()).jobs as Array<{
      job: { id: string; status: string };
      outputs: Record<string, boolean>;
    }>;
    assert.deepEqual(
      history.map((entry) => entry.job.id).sort(),
      [jobA, jobB].sort(),
    );
    const first = history.find((entry) => entry.job.id === jobA);
    assert.ok(first);
    assert.equal(first.job.status, "completed");
    assert.deepEqual(first.outputs, {
      sourceVideo: true,
      masterAudio: true,
      vocals: true,
      instrumental: true,
      mixedAudio: true,
      exportedVideo: true,
    });

    const reopened = await fetch(`${baseUrl}/jobs/${jobA}`);
    assert.equal(reopened.status, 200);
    const vocals = await fetch(`${baseUrl}/jobs/${jobA}/separation/vocals`);
    const instrumental = await fetch(
      `${baseUrl}/jobs/${jobA}/separation/instrumental`,
    );
    assert.equal(vocals.status, 200);
    assert.equal(instrumental.status, 200);
    assert.ok((await vocals.arrayBuffer()).byteLength > 44);
    assert.ok((await instrumental.arrayBuffer()).byteLength > 44);
    const master = await fetch(`${baseUrl}/jobs/${jobA}/master-audio`);
    const mixed = await fetch(`${baseUrl}/jobs/${jobA}/mixed-audio`);
    const download = await fetch(`${baseUrl}/jobs/${jobA}/download`);
    assert.equal(master.status, 200);
    assert.match(master.headers.get("content-type") || "", /audio\/wav/i);
    assert.equal(mixed.status, 200);
    assert.match(mixed.headers.get("content-type") || "", /audio\/mp4/i);
    assert.equal(download.status, 200);
    assert.match(download.headers.get("content-type") || "", /video\/mp4/i);
    assert.ok((await download.arrayBuffer()).byteLength > 100);

    const deleteResponse = await fetch(`${baseUrl}/jobs/${jobB}`, {
      method: "DELETE",
    });
    assert.equal(deleteResponse.status, 200);
    assert.ok(fs.existsSync(path.join(storage, jobA, "vocals.wav")));
    assert.ok(!fs.existsSync(path.join(storage, jobB)));
    const afterDelete = await fetch(`${baseUrl}/jobs`);
    assert.deepEqual(
      ((await afterDelete.json()).jobs as Array<{ job: { id: string } }>).map(
        (entry) => entry.job.id,
      ),
      [jobA],
    );
  } finally {
    server.closeAllConnections();
    await new Promise<void>((resolve, reject) => {
      server.close((error) => (error ? reject(error) : resolve()));
    });
  }
});

test("recovers corrupt metadata and marks a source-missing job interrupted without deleting files", async () => {
  const root = await createTemporaryDirectory();
  const storage = path.join(root, "jobs");
  const fixtures = path.join(root, "fixtures");
  fs.mkdirSync(fixtures);
  const originalManager = createManager(storage);
  const corruptId = await createCompletedJob(
    originalManager,
    fixtures,
    "corrupt-metadata",
  );
  const missingId = await createCompletedJob(
    originalManager,
    fixtures,
    "missing-source",
  );
  const interruptedId = await createCompletedJob(
    originalManager,
    fixtures,
    "interrupted-task",
  );
  originalManager.setMasterGeneration(interruptedId, {
    status: "generating",
    progressPercent: 40,
    completedSentences: 2,
    totalSentences: 5,
  });
  originalManager.setMediaTask(interruptedId, "audioMix", {
    status: "running",
    phase: "mixing",
    progressPercent: 40,
  });
  originalManager.setMediaTask(interruptedId, "videoExport", {
    status: "running",
    phase: "remuxing",
    progressPercent: 40,
  });
  originalManager.setSeparationTask(interruptedId, {
    status: "processing",
    phase: "separating",
    progressPercent: 40,
    completedSegments: 2,
    totalSegments: 5,
  });
  fs.writeFileSync(path.join(storage, corruptId, "job.json"), "{not-json");
  fs.rmSync(path.join(storage, missingId, "source.video"));

  const recoveredManager = createManager(storage);
  const jobs = await recoveredManager.listJobs();
  const corrupt = jobs.find((entry) => entry.job.id === corruptId);
  const missing = jobs.find((entry) => entry.job.id === missingId);
  assert.equal(corrupt?.job.status, "completed");
  assert.match(corrupt?.warning || "", /Metadata bị thiếu hoặc không hợp lệ/i);
  assert.equal(corrupt?.outputs.sourceVideo, true);
  assert.equal(missing?.job.status, "interrupted");
  assert.equal(missing?.outputs.sourceVideo, false);
  assert.ok(fs.existsSync(path.join(storage, missingId, "job.json")));
  const interrupted = jobs.find((entry) => entry.job.id === interruptedId);
  assert.equal(interrupted?.job.status, "completed");
  assert.equal(interrupted?.job.masterGeneration?.status, "interrupted");
  assert.equal(interrupted?.job.audioMix?.status, "interrupted");
  assert.equal(interrupted?.job.videoExport?.status, "interrupted");
  assert.equal(interrupted?.job.separation?.status, "interrupted");
  assert.equal(interrupted?.job.separation?.progressPercent, undefined);
});
