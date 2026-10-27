import assert from "node:assert/strict";
import { spawnSync } from "node:child_process";
import express from "express";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { Readable } from "node:stream";
import { after, test } from "node:test";
import { VideoDubbingManager } from "../videoDubbingManager";
import { createVideoDubbingRouter } from "../videoDubbingRoutes";
import { VideoDubbingSeparationCoordinator } from "../videoDubbingSeparation";
import { VideoDubbingSeparationAvailability } from "../src/types/videoDubbing";

const temporaryDirectories: string[] = [];

async function createTemporaryDirectory(): Promise<string> {
  const directory = await fs.promises.mkdtemp(
    path.join(os.tmpdir(), "video-dubbing-separation-test-"),
  );
  temporaryDirectories.push(directory);
  return directory;
}

function run(command: string, args: string[]) {
  const result = spawnSync(command, args, {
    windowsHide: true,
    encoding: "utf8",
    maxBuffer: 16 * 1024 * 1024,
  });
  assert.equal(result.status, 0, result.stderr);
  return result;
}

function createVideo(filePath: string, durationSeconds = 1.5): Buffer {
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
    `sine=frequency=440:sample_rate=44100:duration=${durationSeconds}`,
    "-t",
    String(durationSeconds),
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

function createTrack(
  filePath: string,
  durationSeconds: number,
  frequency: number,
): void {
  run("ffmpeg", [
    "-hide_banner",
    "-loglevel",
    "error",
    "-f",
    "lavfi",
    "-i",
    `sine=frequency=${frequency}:sample_rate=44100:duration=${durationSeconds}`,
    "-ac",
    "2",
    "-c:a",
    "pcm_s16le",
    "-y",
    filePath,
  ]);
}

function createOutputTracks(
  durationSeconds: number,
  outputDirectory: string,
  instrumentalDuration = durationSeconds,
  vocalsFrequency = 880,
  instrumentalFrequency = 440,
): void {
  const output = path.join(outputDirectory, "htdemucs", "input");
  fs.mkdirSync(output, { recursive: true });
  createTrack(
    path.join(output, "vocals.wav"),
    durationSeconds,
    vocalsFrequency,
  );
  createTrack(
    path.join(output, "no_vocals.wav"),
    instrumentalDuration,
    instrumentalFrequency,
  );
}

async function createReadyJob(
  manager: VideoDubbingManager,
  fixtureDirectory: string,
  name: string,
  durationSeconds = 1.5,
): Promise<string> {
  const source = createVideo(
    path.join(fixtureDirectory, `${name}.mp4`),
    durationSeconds,
  );
  const job = manager.createJob(`${name}.mp4`, source.length);
  const result = await manager.receiveUpload(
    job.id,
    Object.assign(Readable.from([source]), { headers: {} }),
  );
  assert.equal(result.status, "completed");
  return job.id;
}

function createManager(storageDirectory: string): VideoDubbingManager {
  return new VideoDubbingManager({
    storageDirectory,
    ffprobePath: "ffprobe",
  });
}

function createReadyCoordinator(
  manager: VideoDubbingManager,
  runInference: (
    inputPath: string,
    outputDirectory: string,
    signal: AbortSignal,
  ) => Promise<void>,
  isMediaBusy: (jobId: string) => boolean = () => false,
) {
  const ready: VideoDubbingSeparationAvailability = {
    status: "ready",
    model: "htdemucs",
    device: "cpu",
    message: "Ready for test.",
  };
  return new VideoDubbingSeparationCoordinator(manager, {
    pythonPath: "python",
    ffmpegPath: "ffmpeg",
    ffprobePath: "ffprobe",
    isMediaBusy,
    checkAvailability: async () => ready,
    runInference,
  });
}

async function waitForSeparation(
  manager: VideoDubbingManager,
  jobId: string,
  terminal: "completed" | "error" | "cancelled",
): Promise<void> {
  const deadline = Date.now() + 15_000;
  while (Date.now() < deadline) {
    const state = manager.getJob(jobId)?.separation;
    if (state?.status === terminal) return;
    await new Promise((resolve) => setTimeout(resolve, 20));
  }
  assert.fail(
    `Timed out waiting for separation ${terminal}: ${JSON.stringify(
      manager.getJob(jobId)?.separation,
    )}`,
  );
}

function probeAudio(filePath: string): {
  duration: number;
  sampleRate: number;
  channels: number;
} {
  const result = run("ffprobe", [
    "-v",
    "error",
    "-show_entries",
    "format=duration:stream=codec_type,sample_rate,channels",
    "-of",
    "json",
    filePath,
  ]);
  const metadata = JSON.parse(result.stdout) as {
    format: { duration: string };
    streams: Array<{ sample_rate: string; channels: number }>;
  };
  return {
    duration: Number(metadata.format.duration),
    sampleRate: Number(metadata.streams[0].sample_rate),
    channels: metadata.streams[0].channels,
  };
}

after(async () => {
  await Promise.all(
    temporaryDirectories.map((directory) =>
      fs.promises.rm(directory, { recursive: true, force: true }),
    ),
  );
});

test("reports unavailable when the configured Python executable is missing", async () => {
  const root = await createTemporaryDirectory();
  const manager = createManager(path.join(root, "jobs"));
  const coordinator = new VideoDubbingSeparationCoordinator(manager, {
    pythonPath: path.join(root, "missing-python.exe"),
    ffmpegPath: "ffmpeg",
    ffprobePath: "ffprobe",
    isMediaBusy: () => false,
  });

  const availability = await coordinator.getAvailability();
  assert.equal(availability.status, "unavailable");
  assert.match(availability.message, /Python/i);
});

test("separates a fixture with the installed local model when available", async (context) => {
  const root = await createTemporaryDirectory();
  const fixtures = path.join(root, "fixtures");
  fs.mkdirSync(fixtures);
  const manager = createManager(path.join(root, "jobs"));
  const coordinator = new VideoDubbingSeparationCoordinator(manager, {
    pythonPath:
      process.env.VIDEO_DUBBING_SEPARATION_PYTHON ||
      process.env.BGM_PYTHON ||
      process.env.PYTHON ||
      "python",
    ffmpegPath: "ffmpeg",
    ffprobePath: "ffprobe",
    isMediaBusy: () => false,
  });
  const availability = await coordinator.getAvailability();
  if (availability.status !== "ready") {
    context.skip(`Local Demucs model unavailable: ${availability.message}`);
    return;
  }

  const jobId = await createReadyJob(manager, fixtures, "real-inference");
  const started = await coordinator.start(jobId);
  assert.equal(started.status, "processing");
  await waitForSeparation(manager, jobId, "completed");

  const state = manager.getJob(jobId)?.separation;
  assert.equal(state?.status, "completed");
  assert.ok(state?.vocalsSizeBytes && state.vocalsSizeBytes > 44);
  assert.ok(state?.instrumentalSizeBytes && state.instrumentalSizeBytes > 44);
  const vocalsPath = coordinator.getTrackPath(jobId, "vocals");
  const instrumentalPath = coordinator.getTrackPath(jobId, "instrumental");
  assert.ok(vocalsPath);
  assert.ok(instrumentalPath);
  for (const trackPath of [vocalsPath, instrumentalPath]) {
    const metadata = probeAudio(trackPath);
    assert.equal(metadata.sampleRate, 44_100);
    assert.equal(metadata.channels, 2);
    assert.ok(Math.abs(metadata.duration - 1.5) <= 0.1);
  }
});

test("rejects jobs without audio and jobs blocked by another media task", async () => {
  const root = await createTemporaryDirectory();
  const fixtures = path.join(root, "fixtures");
  fs.mkdirSync(fixtures);
  const noAudioPath = path.join(fixtures, "no-audio.mp4");
  run("ffmpeg", [
    "-hide_banner",
    "-loglevel",
    "error",
    "-f",
    "lavfi",
    "-i",
    "color=c=black:s=320x240:r=25",
    "-t",
    "1",
    "-c:v",
    "libx264",
    "-pix_fmt",
    "yuv420p",
    "-y",
    noAudioPath,
  ]);
  const bytes = fs.readFileSync(noAudioPath);
  const manager = createManager(path.join(root, "jobs"));
  const job = manager.createJob("no-audio.mp4", bytes.length);
  await manager.receiveUpload(
    job.id,
    Object.assign(Readable.from([bytes]), { headers: {} }),
  );
  const coordinator = createReadyCoordinator(manager, async () => {});
  await assert.rejects(() => coordinator.start(job.id), /không có audio/i);

  const audioJob = await createReadyJob(manager, fixtures, "busy");
  const busyCoordinator = createReadyCoordinator(manager, async () => {}, () => true);
  await assert.rejects(() => busyCoordinator.start(audioJob), /tác vụ media/i);
});

test("rejects a failed model process and retains both previous completed tracks", async () => {
  const root = await createTemporaryDirectory();
  const fixtures = path.join(root, "fixtures");
  fs.mkdirSync(fixtures);
  const manager = createManager(path.join(root, "jobs"));
  const jobId = await createReadyJob(manager, fixtures, "preserve");
  const successful = createReadyCoordinator(manager, async (_input, output) => {
    createOutputTracks(1.5, output);
  });
  await successful.start(jobId);
  await waitForSeparation(manager, jobId, "completed");
  const previousVocals = fs.readFileSync(successful.getTrackPath(jobId, "vocals")!);
  const previousInstrumental = fs.readFileSync(
    successful.getTrackPath(jobId, "instrumental")!,
  );

  const failing = createReadyCoordinator(manager, async () => {
    throw new Error("simulated model failure");
  });
  await failing.start(jobId);
  await waitForSeparation(manager, jobId, "error");
  assert.match(manager.getJob(jobId)?.separation?.error || "", /simulated model failure/);
  assert.deepEqual(
    fs.readFileSync(failing.getTrackPath(jobId, "vocals")!),
    previousVocals,
  );
  assert.deepEqual(
    fs.readFileSync(failing.getTrackPath(jobId, "instrumental")!),
    previousInstrumental,
  );
});

test("rejects missing and duration-mismatched model outputs", async () => {
  const root = await createTemporaryDirectory();
  const fixtures = path.join(root, "fixtures");
  fs.mkdirSync(fixtures);
  const manager = createManager(path.join(root, "jobs"));
  const missingJob = await createReadyJob(manager, fixtures, "missing");
  const missing = createReadyCoordinator(manager, async (_input, output) => {
    const directory = path.join(output, "htdemucs", "input");
    fs.mkdirSync(directory, { recursive: true });
    createTrack(path.join(directory, "vocals.wav"), 1.5, 880);
  });
  await missing.start(missingJob);
  await waitForSeparation(manager, missingJob, "error");
  assert.match(manager.getJob(missingJob)?.separation?.error || "", /instrumental/i);

  const mismatchJob = await createReadyJob(manager, fixtures, "mismatch");
  const mismatch = createReadyCoordinator(manager, async (_input, output) => {
    createOutputTracks(1.5, output, 0.7);
  });
  await mismatch.start(mismatchJob);
  await waitForSeparation(manager, mismatchJob, "error");
  assert.match(manager.getJob(mismatchJob)?.separation?.error || "", /thời lượng/i);
});

test("pads or trims only a small model tail difference to the checked source duration", async () => {
  const root = await createTemporaryDirectory();
  const fixtures = path.join(root, "fixtures");
  fs.mkdirSync(fixtures);
  const manager = createManager(path.join(root, "jobs"));
  const jobId = await createReadyJob(manager, fixtures, "minor-difference");
  const coordinator = createReadyCoordinator(manager, async (_input, output) => {
    createOutputTracks(1.5, output, 1.45);
  });

  await coordinator.start(jobId);
  await waitForSeparation(manager, jobId, "completed");
  const vocals = coordinator.getTrackPath(jobId, "vocals");
  const instrumental = coordinator.getTrackPath(jobId, "instrumental");
  assert.ok(vocals);
  assert.ok(instrumental);
  assert.ok(Math.abs(probeAudio(vocals).duration - 1.5) <= 0.1);
  assert.ok(Math.abs(probeAudio(instrumental).duration - 1.5) <= 0.1);
});

test("keeps concurrent jobs' track files separate", async () => {
  const root = await createTemporaryDirectory();
  const fixtures = path.join(root, "fixtures");
  fs.mkdirSync(fixtures);
  const manager = createManager(path.join(root, "jobs"));
  const first = await createReadyJob(manager, fixtures, "isolation-a");
  const second = await createReadyJob(manager, fixtures, "isolation-b");
  const firstCoordinator = createReadyCoordinator(manager, async (_input, output) => {
    createOutputTracks(1.5, output, 1.5, 880, 440);
  });
  const secondCoordinator = createReadyCoordinator(manager, async (_input, output) => {
    createOutputTracks(1.5, output, 1.5, 990, 550);
  });

  await Promise.all([
    firstCoordinator.start(first),
    secondCoordinator.start(second),
  ]);
  await Promise.all([
    waitForSeparation(manager, first, "completed"),
    waitForSeparation(manager, second, "completed"),
  ]);
  const firstVocals = firstCoordinator.getTrackPath(first, "vocals");
  const secondVocals = secondCoordinator.getTrackPath(second, "vocals");
  assert.ok(firstVocals);
  assert.ok(secondVocals);
  assert.notEqual(firstVocals, secondVocals);
  assert.notDeepEqual(
    fs.readFileSync(firstVocals),
    fs.readFileSync(secondVocals),
  );
});

test("cancels a running model task and removes only the deleted job", async () => {
  const root = await createTemporaryDirectory();
  const fixtures = path.join(root, "fixtures");
  const storage = path.join(root, "jobs");
  fs.mkdirSync(fixtures);
  const manager = createManager(storage);
  const first = await createReadyJob(manager, fixtures, "cancel");
  const second = await createReadyJob(manager, fixtures, "remain");
  const coordinator = createReadyCoordinator(
    manager,
    async (_input, _output, signal) =>
      new Promise<void>((_resolve, reject) => {
        signal.addEventListener(
          "abort",
          () => reject(new Error("cancelled")),
          { once: true },
        );
      }),
  );

  await coordinator.start(first);
  const deadline = Date.now() + 5000;
  while (
    Date.now() < deadline &&
    manager.getJob(first)?.separation?.phase !== "separating"
  ) {
    await new Promise((resolve) => setTimeout(resolve, 20));
  }
  assert.equal(manager.getJob(first)?.separation?.phase, "separating");
  await coordinator.cancel(first);
  assert.equal(manager.getJob(first)?.separation?.status, "cancelled");
  assert.ok(fs.existsSync(path.join(storage, second, "source.video")));
  assert.ok(
    !fs.readdirSync(path.join(storage, first)).some((name) => name.startsWith(".separation-")),
  );

  const deleteCoordinator = createReadyCoordinator(
    manager,
    async (_input, _output, signal) =>
      new Promise<void>((_resolve, reject) => {
        signal.addEventListener(
          "abort",
          () => reject(new Error("cancelled")),
          { once: true },
        );
      }),
  );
  await deleteCoordinator.start(second);
  const app = express();
  app.use(
    "/api/video-dubbing",
    createVideoDubbingRouter(manager, undefined, undefined, deleteCoordinator),
  );
  const server = app.listen(0, "127.0.0.1");
  await new Promise<void>((resolve, reject) => {
    server.once("listening", resolve);
    server.once("error", reject);
  });
  const address = server.address();
  assert.ok(address && typeof address !== "string");
  try {
    const response = await fetch(
      `http://127.0.0.1:${address.port}/api/video-dubbing/jobs/${second}`,
      { method: "DELETE" },
    );
    assert.equal(response.status, 200);
    assert.equal(manager.getJob(second), null);
    assert.ok(!fs.existsSync(path.join(storage, second)));
    assert.ok(fs.existsSync(path.join(storage, first)));
  } finally {
    server.closeAllConnections();
    await new Promise<void>((resolve, reject) => {
      server.close((error) => (error ? reject(error) : resolve()));
    });
  }
});

test("serves only job-owned separated tracks and exposes status through HTTP", async () => {
  const root = await createTemporaryDirectory();
  const fixtures = path.join(root, "fixtures");
  fs.mkdirSync(fixtures);
  const manager = createManager(path.join(root, "jobs"));
  const jobId = await createReadyJob(manager, fixtures, "api");
  const coordinator = createReadyCoordinator(manager, async (_input, output) => {
    createOutputTracks(1.5, output);
  });
  const app = express();
  app.use(
    "/api/video-dubbing",
    createVideoDubbingRouter(manager, undefined, undefined, coordinator),
  );
  const server = app.listen(0, "127.0.0.1");
  await new Promise<void>((resolve, reject) => {
    server.once("listening", resolve);
    server.once("error", reject);
  });
  const address = server.address();
  assert.ok(address && typeof address !== "string");
  const base = `http://127.0.0.1:${address.port}/api/video-dubbing`;
  try {
    const readiness = await fetch(`${base}/separation/status`);
    assert.equal(readiness.status, 200);
    assert.equal((await readiness.json()).status, "ready");
    const status = await fetch(`${base}/jobs/${jobId}/separation`);
    assert.equal(status.status, 200);
    assert.equal((await status.json()).separation.status, "unavailable");
    const invalid = await fetch(`${base}/jobs/not-a-job/separation/vocals`);
    assert.equal(invalid.status, 400);
    const missing = await fetch(`${base}/jobs/${jobId}/separation/vocals`);
    assert.equal(missing.status, 404);

    await coordinator.start(jobId);
    await waitForSeparation(manager, jobId, "completed");
    const vocals = await fetch(`${base}/jobs/${jobId}/separation/vocals`);
    assert.equal(vocals.status, 200);
    assert.match(vocals.headers.get("content-type") || "", /audio\/wav/i);
    const instrumental = await fetch(`${base}/jobs/${jobId}/separation/instrumental`);
    assert.equal(instrumental.status, 200);
    assert.ok((await instrumental.arrayBuffer()).byteLength > 44);
  } finally {
    server.closeAllConnections();
    await new Promise<void>((resolve, reject) => {
      server.close((error) => (error ? reject(error) : resolve()));
    });
  }
});
