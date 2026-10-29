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
import { VideoDubbingMediaCoordinator } from "../videoDubbingMedia";

const temporaryDirectories: string[] = [];

async function createTemporaryDirectory(): Promise<string> {
  const directory = await fs.promises.mkdtemp(
    path.join(os.tmpdir(), "video-dubbing-media-test-"),
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

function createVideo(filePath: string, duration: number, withAudio: boolean): Buffer {
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
    args.push(
      "-f",
      "lavfi",
      "-i",
      `sine=frequency=440:sample_rate=48000:duration=${duration}`,
    );
  }
  args.push(
    "-t",
    String(duration),
    "-c:v",
    "libx264",
    "-preset",
    "ultrafast",
    "-pix_fmt",
    "yuv420p",
  );
  if (withAudio) args.push("-c:a", "aac", "-b:a", "192k");
  args.push("-y", filePath);
  run("ffmpeg", args);
  return fs.readFileSync(filePath);
}

function createMaster(filePath: string, duration: number, frequency = 880): Buffer {
  run("ffmpeg", [
    "-hide_banner",
    "-loglevel",
    "error",
    "-f",
    "lavfi",
    "-i",
    `sine=frequency=${frequency}:sample_rate=22050:duration=${duration}`,
    "-af",
    "volume=0.5",
    "-c:a",
    "pcm_s16le",
    "-y",
    filePath,
  ]);
  return fs.readFileSync(filePath);
}

async function createReadyJob(
  manager: VideoDubbingManager,
  fixtureDirectory: string,
  name: string,
  duration: number,
  withAudio: boolean,
  masterDuration: number,
): Promise<{ id: string; source: Buffer }> {
  const source = createVideo(
    path.join(fixtureDirectory, `${name}.mp4`),
    duration,
    withAudio,
  );
  const job = manager.createJob(`${name}.mp4`, source.length);
  const uploaded = await manager.receiveUpload(
    job.id,
    Object.assign(Readable.from([source]), { headers: {} }),
  );
  assert.equal(uploaded.status, "completed");
  const jobDirectory = manager.getJobDirectory(job.id);
  assert.ok(jobDirectory);
  const masterPath = path.join(jobDirectory, "tts-master.wav");
  const master = createMaster(
    path.join(fixtureDirectory, `${name}-master.wav`),
    masterDuration,
  );
  fs.writeFileSync(masterPath, master);
  manager.setMasterGeneration(job.id, {
    status: "completed",
    progressPercent: 100,
    completedSentences: 1,
    totalSentences: 1,
    durationSeconds: masterDuration,
    sizeBytes: master.length,
  });
  return { id: job.id, source };
}

function createCoordinator(manager: VideoDubbingManager) {
  return new VideoDubbingMediaCoordinator(manager, {
    ffmpegPath: "ffmpeg",
    ffprobePath: "ffprobe",
  });
}

async function waitForTask(
  manager: VideoDubbingManager,
  jobId: string,
  task: "audioMix" | "videoExport" | "finalMix",
): Promise<void> {
  const deadline = Date.now() + 15_000;
  while (Date.now() < deadline) {
    const job = manager.getJob(jobId);
    const state =
      task === "finalMix" ? job?.finalMix : job?.[task];
    if (state?.status === "completed" || state?.status === "failed" || state?.status === "cancelled") {
      return;
    }
    await new Promise((resolve) => setTimeout(resolve, 20));
  }
  assert.fail(`Timed out waiting for ${task}: ${JSON.stringify(manager.getJob(jobId)?.[task])}`);
}

function decodeAudio(filePath: string): Float64Array {
  const result = spawnSync(
    "ffmpeg",
    [
      "-v",
      "error",
      "-i",
      filePath,
      "-map",
      "0:a:0",
      "-f",
      "s16le",
      "-ac",
      "2",
      "-ar",
      "48000",
      "pipe:1",
    ],
    { windowsHide: true, maxBuffer: 16 * 1024 * 1024 },
  );
  assert.equal(result.status, 0, result.stderr.toString());
  const samples = new Float64Array(result.stdout.length / 4);
  for (let frame = 0; frame < samples.length; frame++) {
    samples[frame] = result.stdout.readInt16LE(frame * 4) / 32768;
  }
  return samples;
}

function amplitudeAt(
  samples: Float64Array,
  frequency: number,
  startSeconds: number,
  durationSeconds: number,
): number {
  const sampleRate = 48_000;
  const start = Math.floor(startSeconds * sampleRate);
  const count = Math.floor(durationSeconds * sampleRate);
  let real = 0;
  let imaginary = 0;
  for (let offset = 0; offset < count; offset++) {
    const sample = samples[start + offset] || 0;
    const angle = (2 * Math.PI * frequency * offset) / sampleRate;
    real += sample * Math.cos(angle);
    imaginary += sample * Math.sin(angle);
  }
  return (2 * Math.hypot(real, imaginary)) / count;
}

function maximumAmplitude(
  samples: Float64Array,
  startSeconds: number,
  durationSeconds: number,
): number {
  const start = Math.floor(startSeconds * 48_000);
  const end = Math.min(
    samples.length,
    start + Math.floor(durationSeconds * 48_000),
  );
  let maximum = 0;
  for (let index = start; index < end; index++) {
    maximum = Math.max(maximum, Math.abs(samples[index]));
  }
  return maximum;
}

function probeMedia(filePath: string) {
  const result = run("ffprobe", [
    "-v",
    "error",
    "-show_entries",
    "format=duration:stream=codec_type,codec_name,width,height,sample_rate,channels",
    "-of",
    "json",
    filePath,
  ]);
  return JSON.parse(result.stdout) as {
    format: { duration: string };
    streams: Array<{
      codec_type: string;
      codec_name: string;
      width?: number;
      height?: number;
      sample_rate?: string;
      channels?: number;
    }>;
  };
}

after(async () => {
  await Promise.all(
    temporaryDirectories.map((directory) =>
      fs.promises.rm(directory, { recursive: true, force: true }),
    ),
  );
});

test("mixes independent source gains and keeps original audio through video end", async () => {
  const root = await createTemporaryDirectory();
  const fixtureDirectory = path.join(root, "fixtures");
  const storageDirectory = path.join(root, "jobs");
  fs.mkdirSync(fixtureDirectory);
  const manager = new VideoDubbingManager({
    storageDirectory,
    ffprobePath: "ffprobe",
  });
  const coordinator = createCoordinator(manager);
  const job = await createReadyJob(manager, fixtureDirectory, "with-audio", 1.4, true, 0.35);

  coordinator.startMix(job.id, {
    ttsVolumePercent: 0,
    originalVolumePercent: 100,
  });
  await waitForTask(manager, job.id, "audioMix");
  assert.equal(manager.getJob(job.id)?.audioMix?.status, "completed");
  let mixedPath = coordinator.getAudioMixPath(job.id);
  assert.ok(mixedPath);
  let metadata = probeMedia(mixedPath);
  assert.ok(Math.abs(Number(metadata.format.duration) - 1.4) < 0.1);
  let samples = decodeAudio(mixedPath);
  assert.ok(amplitudeAt(samples, 440, 0.8, 0.2) > 0.02);
  assert.ok(amplitudeAt(samples, 880, 0.05, 0.2) < 0.004);

  coordinator.startMix(job.id, {
    ttsVolumePercent: 100,
    originalVolumePercent: 0,
  });
  await waitForTask(manager, job.id, "audioMix");
  mixedPath = coordinator.getAudioMixPath(job.id);
  assert.ok(mixedPath);
  samples = decodeAudio(mixedPath);
  assert.ok(amplitudeAt(samples, 880, 0.05, 0.2) > 0.02);
  assert.ok(amplitudeAt(samples, 440, 0.8, 0.2) < 0.004);
  assert.deepEqual(
    fs.readFileSync(path.join(storageDirectory, job.id, "source.video")),
    job.source,
  );
});

test("creates a full-length silent mix without source audio and trims a long master", async () => {
  const root = await createTemporaryDirectory();
  const fixtureDirectory = path.join(root, "fixtures");
  fs.mkdirSync(fixtureDirectory);
  const manager = new VideoDubbingManager({
    storageDirectory: path.join(root, "jobs"),
    ffprobePath: "ffprobe",
  });
  const coordinator = createCoordinator(manager);
  const job = await createReadyJob(manager, fixtureDirectory, "silent", 1.3, false, 2.2);

  coordinator.startMix(job.id, {
    ttsVolumePercent: 100,
    originalVolumePercent: 0,
  });
  await waitForTask(manager, job.id, "audioMix");
  assert.equal(manager.getJob(job.id)?.audioMix?.status, "completed");
  let mixedPath = coordinator.getAudioMixPath(job.id);
  assert.ok(mixedPath);
  let metadata = probeMedia(mixedPath);
  assert.ok(Math.abs(Number(metadata.format.duration) - 1.3) < 0.1);
  let samples = decodeAudio(mixedPath);
  assert.ok(amplitudeAt(samples, 880, 1, 0.2) > 0.02);

  coordinator.startMix(job.id, {
    ttsVolumePercent: 0,
    originalVolumePercent: 0,
  });
  await waitForTask(manager, job.id, "audioMix");
  assert.equal(manager.getJob(job.id)?.audioMix?.status, "completed");
  mixedPath = coordinator.getAudioMixPath(job.id);
  assert.ok(mixedPath);
  metadata = probeMedia(mixedPath);
  assert.ok(Math.abs(Number(metadata.format.duration) - 1.3) < 0.1);
  samples = decodeAudio(mixedPath);
  assert.ok(Math.max(...Array.from(samples.slice(0, 1000), Math.abs)) < 0.004);

  const shortMasterJob = await createReadyJob(
    manager,
    fixtureDirectory,
    "short-master",
    1.3,
    false,
    0.3,
  );
  coordinator.startMix(shortMasterJob.id, {
    ttsVolumePercent: 100,
    originalVolumePercent: 0,
  });
  await waitForTask(manager, shortMasterJob.id, "audioMix");
  assert.equal(manager.getJob(shortMasterJob.id)?.audioMix?.status, "completed");
  const shortMasterMix = coordinator.getAudioMixPath(shortMasterJob.id);
  assert.ok(shortMasterMix);
  const shortMasterSamples = decodeAudio(shortMasterMix);
  assert.ok(amplitudeAt(shortMasterSamples, 880, 0.05, 0.2) > 0.02);
  assert.ok(maximumAmplitude(shortMasterSamples, 0.8, 0.3) < 0.004);
});

test("rejects invalid gains and requires a completed Master before mixing", async () => {
  const root = await createTemporaryDirectory();
  const fixtureDirectory = path.join(root, "fixtures");
  fs.mkdirSync(fixtureDirectory);
  const manager = new VideoDubbingManager({
    storageDirectory: path.join(root, "jobs"),
    ffprobePath: "ffprobe",
  });
  const source = createVideo(path.join(fixtureDirectory, "plain.mp4"), 1.2, false);
  const job = manager.createJob("plain.mp4", source.length);
  const uploaded = await manager.receiveUpload(
    job.id,
    Object.assign(Readable.from([source]), { headers: {} }),
  );
  assert.equal(uploaded.status, "completed");
  const coordinator = createCoordinator(manager);
  assert.throws(() => coordinator.startMix(job.id, {
    ttsVolumePercent: 100,
    originalVolumePercent: 100,
  }), /TTS Master/i);

  const master = createMaster(path.join(fixtureDirectory, "master.wav"), 0.5);
  const masterPath = path.join(manager.getJobDirectory(job.id)!, "tts-master.wav");
  fs.writeFileSync(masterPath, master);
  manager.setMasterGeneration(job.id, {
    status: "completed",
    progressPercent: 100,
    completedSentences: 1,
    totalSentences: 1,
    durationSeconds: 0.5,
    sizeBytes: master.length,
  });
  for (const invalid of [Number.NaN, Number.POSITIVE_INFINITY, -1, 201]) {
    assert.throws(
      () => coordinator.startMix(job.id, {
        ttsVolumePercent: invalid,
        originalVolumePercent: 100,
      }),
      /hữu hạn|khoảng/i,
    );
  }
  assert.equal(manager.getJob(job.id)?.audioMix, undefined);
});

test("renders a synchronized three-track WAV, persists settings, blocks stale export, and exports AAC MP4", async () => {
  const root = await createTemporaryDirectory();
  const fixtureDirectory = path.join(root, "fixtures");
  fs.mkdirSync(fixtureDirectory);
  const manager = new VideoDubbingManager({
    storageDirectory: path.join(root, "jobs"),
    ffprobePath: "ffprobe",
  });
  const coordinator = createCoordinator(manager);
  const job = await createReadyJob(
    manager,
    fixtureDirectory,
    "three-track",
    1.4,
    true,
    0.6,
  );
  const jobDirectory = manager.getJobDirectory(job.id)!;
  const vocals = createMaster(
    path.join(fixtureDirectory, "vocals.wav"),
    1.4,
    440,
  );
  const instrumental = createMaster(
    path.join(fixtureDirectory, "instrumental.wav"),
    1.4,
    660,
  );
  fs.writeFileSync(path.join(jobDirectory, "vocals.wav"), vocals);
  fs.writeFileSync(path.join(jobDirectory, "instrumental.wav"), instrumental);
  manager.setSeparationTask(job.id, {
    status: "completed",
    phase: "validating",
    progressPercent: 100,
    completedSegments: 1,
    totalSegments: 1,
    durationSeconds: 1.4,
    sampleRate: 48_000,
    channels: 2,
    vocalsSizeBytes: vocals.length,
    instrumentalSizeBytes: instrumental.length,
  });

  const vocalOnly = {
    vocals: { volumePercent: 100, muted: false },
    instrumental: { volumePercent: 0, muted: false },
    ttsMaster: { volumePercent: 0, muted: false },
  };
  coordinator.startFinalMix(job.id, vocalOnly);
  await waitForTask(manager, job.id, "finalMix");
  assert.equal(manager.getJob(job.id)?.finalMix?.status, "completed");
  assert.deepEqual(
    manager.getJob(job.id)?.finalMix?.includedTracks,
    ["vocals"],
  );
  let finalMixPath = coordinator.getFinalMixPath(job.id);
  assert.ok(finalMixPath);
  let metadata = probeMedia(finalMixPath);
  assert.equal(metadata.streams[0]?.codec_name, "pcm_s16le");
  assert.equal(metadata.streams[0]?.sample_rate, "48000");
  assert.equal(metadata.streams[0]?.channels, 2);
  assert.ok(Math.abs(Number(metadata.format.duration) - 1.4) < 0.1);
  let samples = decodeAudio(finalMixPath);
  assert.ok(amplitudeAt(samples, 440, 0.1, 0.2) > 0.02);
  assert.ok(amplitudeAt(samples, 660, 0.1, 0.2) < 0.004);
  assert.ok(amplitudeAt(samples, 880, 0.1, 0.2) < 0.004);
  const successfulMixBytes = fs.readFileSync(finalMixPath);
  const failingCoordinator = new VideoDubbingMediaCoordinator(manager, {
    ffmpegPath: path.join(root, "missing-final-mix-ffmpeg.exe"),
    ffprobePath: "ffprobe",
  });
  failingCoordinator.startFinalMix(job.id, vocalOnly);
  await waitForTask(manager, job.id, "finalMix");
  assert.equal(manager.getJob(job.id)?.finalMix?.status, "failed");
  assert.deepEqual(fs.readFileSync(finalMixPath), successfulMixBytes);

  const backgroundAndTts = {
    vocals: { volumePercent: 0, muted: false },
    instrumental: { volumePercent: 100, muted: false },
    ttsMaster: { volumePercent: 100, muted: false },
  };
  assert.throws(
    () =>
      coordinator.updateMixerSettings(job.id, {
        ...backgroundAndTts,
        vocals: { volumePercent: Number.NaN, muted: false },
      }),
    /không hợp lệ/i,
  );
  coordinator.updateMixerSettings(job.id, backgroundAndTts);
  assert.equal(manager.getJob(job.id)?.finalMix?.status, "stale");
  assert.throws(() => coordinator.startExport(job.id), /render lại/i);
  coordinator.startFinalMix(job.id, backgroundAndTts);
  await waitForTask(manager, job.id, "finalMix");
  assert.equal(manager.getJob(job.id)?.finalMix?.status, "completed");
  assert.deepEqual(
    manager.getJob(job.id)?.finalMix?.includedTracks,
    ["ttsMaster", "instrumental"],
  );
  finalMixPath = coordinator.getFinalMixPath(job.id);
  assert.ok(finalMixPath);
  samples = decodeAudio(finalMixPath);
  assert.ok(amplitudeAt(samples, 660, 0.1, 0.2) > 0.02);
  assert.ok(amplitudeAt(samples, 880, 0.1, 0.2) > 0.02);
  assert.ok(amplitudeAt(samples, 440, 0.1, 0.2) < 0.004);

  coordinator.startExport(job.id);
  await waitForTask(manager, job.id, "videoExport");
  assert.equal(manager.getJob(job.id)?.videoExport?.status, "completed");
  const exportedPath = coordinator.getVideoExportPath(job.id);
  assert.ok(exportedPath);
  const exportMetadata = probeMedia(exportedPath);
  assert.ok(exportMetadata.streams.some((stream) => stream.codec_type === "video"));
  const exportedAudio = exportMetadata.streams.find(
    (stream) => stream.codec_type === "audio",
  );
  assert.equal(exportedAudio?.codec_name, "aac");
  assert.ok(Math.abs(Number(exportMetadata.format.duration) - 1.4) < 0.1);

  const app = express();
  app.use(
    "/api/video-dubbing",
    createVideoDubbingRouter(manager, undefined, coordinator),
  );
  const server = app.listen(0);
  try {
    const address = server.address();
    assert.ok(address && typeof address !== "string");
    const response = await fetch(
      `http://127.0.0.1:${address.port}/api/video-dubbing/jobs/${job.id}/final-mix-audio`,
    );
    assert.equal(response.status, 200);
    assert.deepEqual(
      Buffer.from(await response.arrayBuffer()),
      fs.readFileSync(finalMixPath),
    );
  } finally {
    await new Promise<void>((resolve, reject) =>
      server.close((error) => (error ? reject(error) : resolve())),
    );
  }
  manager.setMasterGeneration(job.id, {
    status: "generating",
    progressPercent: 0,
    completedSentences: 0,
    totalSentences: 1,
  });
  manager.setMasterGeneration(job.id, {
    status: "cancelled",
    progressPercent: 0,
    completedSentences: 0,
    totalSentences: 1,
  });
  assert.equal(manager.getJob(job.id)?.finalMix?.status, "stale");
  assert.throws(() => coordinator.startExport(job.id), /render lại/i);
});

test("cancels a final mix before publishing output and leaves no task-owned files", async () => {
  const root = await createTemporaryDirectory();
  const fixtureDirectory = path.join(root, "fixtures");
  fs.mkdirSync(fixtureDirectory);
  const manager = new VideoDubbingManager({
    storageDirectory: path.join(root, "jobs"),
    ffprobePath: "ffprobe",
  });
  const coordinator = createCoordinator(manager);
  const job = await createReadyJob(
    manager,
    fixtureDirectory,
    "cancel-final-mix",
    1.4,
    true,
    0.6,
  );
  const settings = {
    vocals: { volumePercent: 0, muted: false },
    instrumental: { volumePercent: 0, muted: false },
    ttsMaster: { volumePercent: 100, muted: false },
  };
  coordinator.startFinalMix(job.id, settings);
  await coordinator.cancel(job.id);
  assert.equal(manager.getJob(job.id)?.finalMix?.status, "cancelled");
  assert.equal(coordinator.isBusy(job.id), false);
  const directory = manager.getJobDirectory(job.id)!;
  assert.equal(fs.existsSync(path.join(directory, "mixed-audio.wav")), false);
  assert.deepEqual(
    fs.readdirSync(directory).filter((file) => file.startsWith(".mixed-audio-")),
    [],
  );
});

test("cancels a running mix and removes task-owned temporary files", async () => {
  const root = await createTemporaryDirectory();
  const fixtureDirectory = path.join(root, "fixtures");
  fs.mkdirSync(fixtureDirectory);
  const manager = new VideoDubbingManager({
    storageDirectory: path.join(root, "jobs"),
    ffprobePath: "ffprobe",
  });
  const coordinator = createCoordinator(manager);
  const job = await createReadyJob(manager, fixtureDirectory, "cancel", 1.3, false, 0.5);

  coordinator.startMix(job.id, {
    ttsVolumePercent: 100,
    originalVolumePercent: 100,
  });
  await coordinator.cancel(job.id);

  assert.equal(manager.getJob(job.id)?.audioMix?.status, "cancelled");
  const files = fs.readdirSync(manager.getJobDirectory(job.id)!);
  assert.ok(!files.some((file) => file.startsWith(".original-audio-")));
  assert.ok(!files.some((file) => file.startsWith(".mixed-audio-")));
});

test("deleting a job during media processing waits for cancellation and removes only that job", async () => {
  const root = await createTemporaryDirectory();
  const fixtureDirectory = path.join(root, "fixtures");
  const storageDirectory = path.join(root, "jobs");
  fs.mkdirSync(fixtureDirectory);
  const manager = new VideoDubbingManager({
    storageDirectory,
    ffprobePath: "ffprobe",
  });
  const coordinator = createCoordinator(manager);
  const first = await createReadyJob(manager, fixtureDirectory, "delete-running", 1.3, false, 0.5);
  const second = await createReadyJob(manager, fixtureDirectory, "keep-running", 1.3, false, 0.5);
  coordinator.startMix(first.id, {
    ttsVolumePercent: 100,
    originalVolumePercent: 100,
  });

  const app = express();
  app.use("/api/video-dubbing", createVideoDubbingRouter(manager, undefined, coordinator));
  const server = app.listen(0, "127.0.0.1");
  await new Promise<void>((resolve, reject) => {
    server.once("listening", resolve);
    server.once("error", reject);
  });
  const address = server.address();
  assert.ok(address && typeof address !== "string");
  try {
    const response = await fetch(
      `http://127.0.0.1:${address.port}/api/video-dubbing/jobs/${first.id}`,
      { method: "DELETE" },
    );
    assert.equal(response.status, 200);
    assert.equal(manager.getJob(first.id), null);
    assert.ok(fs.existsSync(path.join(storageDirectory, second.id, "source.video")));
    assert.ok(!fs.existsSync(path.join(storageDirectory, first.id)));
  } finally {
    server.closeAllConnections();
    await new Promise<void>((resolve, reject) => {
      server.close((error) => (error ? reject(error) : resolve()));
    });
  }
});

test("keeps a successful mix when a later FFmpeg attempt fails", async () => {
  const root = await createTemporaryDirectory();
  const fixtureDirectory = path.join(root, "fixtures");
  fs.mkdirSync(fixtureDirectory);
  const manager = new VideoDubbingManager({
    storageDirectory: path.join(root, "jobs"),
    ffprobePath: "ffprobe",
  });
  const job = await createReadyJob(manager, fixtureDirectory, "preserve", 1.3, false, 0.5);
  const workingCoordinator = createCoordinator(manager);
  workingCoordinator.startMix(job.id, {
    ttsVolumePercent: 100,
    originalVolumePercent: 0,
  });
  await waitForTask(manager, job.id, "audioMix");
  assert.equal(manager.getJob(job.id)?.audioMix?.status, "completed");
  const audioPath = workingCoordinator.getAudioMixPath(job.id);
  assert.ok(audioPath);
  const previousAudio = fs.readFileSync(audioPath);

  const failingCoordinator = new VideoDubbingMediaCoordinator(manager, {
    ffmpegPath: path.join(root, "missing-ffmpeg.exe"),
    ffprobePath: "ffprobe",
  });
  failingCoordinator.startMix(job.id, {
    ttsVolumePercent: 50,
    originalVolumePercent: 50,
  });
  await waitForTask(manager, job.id, "audioMix");

  assert.equal(manager.getJob(job.id)?.audioMix?.status, "failed");
  assert.match(manager.getJob(job.id)?.audioMix?.error || "", /FFmpeg/i);
  assert.deepEqual(fs.readFileSync(audioPath), previousAudio);
});

test("exports an MP4, verifies it with FFprobe, and serves the real download", async () => {
  const root = await createTemporaryDirectory();
  const fixtureDirectory = path.join(root, "fixtures");
  fs.mkdirSync(fixtureDirectory);
  const manager = new VideoDubbingManager({
    storageDirectory: path.join(root, "jobs"),
    ffprobePath: "ffprobe",
  });
  const coordinator = createCoordinator(manager);
  const job = await createReadyJob(manager, fixtureDirectory, "export", 1.4, true, 0.8);
  const settings = {
    vocals: { volumePercent: 0, muted: false },
    instrumental: { volumePercent: 0, muted: false },
    ttsMaster: { volumePercent: 100, muted: false },
  };
  coordinator.startMix(job.id, {
    ttsVolumePercent: 100,
    originalVolumePercent: 60,
  });
  await waitForTask(manager, job.id, "audioMix");
  assert.equal(manager.getJob(job.id)?.audioMix?.status, "completed");
  assert.throws(() => coordinator.startExport(job.id), /final mix/i);
  coordinator.startFinalMix(job.id, settings);
  await waitForTask(manager, job.id, "finalMix");
  assert.equal(manager.getJob(job.id)?.finalMix?.status, "completed");

  coordinator.startExport(job.id);
  await waitForTask(manager, job.id, "videoExport");
  const exported = manager.getJob(job.id)?.videoExport;
  assert.equal(exported?.status, "completed", exported?.error);
  const outputPath = coordinator.getVideoExportPath(job.id);
  assert.ok(outputPath);
  const probe = probeMedia(outputPath);
  assert.deepEqual(
    probe.streams.map((stream) => stream.codec_type),
    ["video", "audio"],
  );
  assert.equal(probe.streams[0].codec_name, "h264");
  assert.equal(probe.streams[1].codec_name, "aac");
  assert.ok(Math.abs(Number(probe.format.duration) - 1.4) < 0.1);

  const app = express();
  app.use("/api/video-dubbing", createVideoDubbingRouter(manager, undefined, coordinator));
  const server = app.listen(0, "127.0.0.1");
  await new Promise<void>((resolve, reject) => {
    server.once("listening", resolve);
    server.once("error", reject);
  });
  const address = server.address();
  assert.ok(address && typeof address !== "string");
  try {
    const sourceResponse = await fetch(
      `http://127.0.0.1:${address.port}/api/video-dubbing/jobs/${job.id}/source-video`,
    );
    assert.equal(sourceResponse.status, 200);
    assert.match(sourceResponse.headers.get("content-type") || "", /video\/mp4/i);
    assert.deepEqual(Buffer.from(await sourceResponse.arrayBuffer()), job.source);
    const sourceRangeResponse = await fetch(
      `http://127.0.0.1:${address.port}/api/video-dubbing/jobs/${job.id}/source-video`,
      { headers: { Range: "bytes=0-31" } },
    );
    assert.equal(sourceRangeResponse.status, 206);
    assert.deepEqual(
      Buffer.from(await sourceRangeResponse.arrayBuffer()),
      job.source.subarray(0, 32),
    );

    const previewResponse = await fetch(
      `http://127.0.0.1:${address.port}/api/video-dubbing/jobs/${job.id}/exported-video`,
    );
    assert.equal(previewResponse.status, 200);
    assert.match(previewResponse.headers.get("content-type") || "", /video\/mp4/i);
    assert.deepEqual(
      Buffer.from(await previewResponse.arrayBuffer()),
      fs.readFileSync(outputPath),
    );
    const previewRangeResponse = await fetch(
      `http://127.0.0.1:${address.port}/api/video-dubbing/jobs/${job.id}/exported-video`,
      { headers: { Range: "bytes=0-31" } },
    );
    assert.equal(previewRangeResponse.status, 206);
    assert.deepEqual(
      Buffer.from(await previewRangeResponse.arrayBuffer()),
      fs.readFileSync(outputPath).subarray(0, 32),
    );

    const response = await fetch(
      `http://127.0.0.1:${address.port}/api/video-dubbing/jobs/${job.id}/download`,
    );
    assert.equal(response.status, 200);
    assert.match(response.headers.get("content-type") || "", /video\/mp4/i);
    assert.match(response.headers.get("content-disposition") || "", /\.mp4/i);
    assert.deepEqual(Buffer.from(await response.arrayBuffer()), fs.readFileSync(outputPath));
  } finally {
    server.closeAllConnections();
    await new Promise<void>((resolve, reject) => {
      server.close((error) => (error ? reject(error) : resolve()));
    });
  }
});

test("keeps media files and states isolated between jobs", async () => {
  const root = await createTemporaryDirectory();
  const fixtureDirectory = path.join(root, "fixtures");
  fs.mkdirSync(fixtureDirectory);
  const manager = new VideoDubbingManager({
    storageDirectory: path.join(root, "jobs"),
    ffprobePath: "ffprobe",
  });
  const coordinator = createCoordinator(manager);
  const first = await createReadyJob(manager, fixtureDirectory, "first", 1.2, false, 0.5);
  const second = await createReadyJob(manager, fixtureDirectory, "second", 1.2, false, 0.5);

  coordinator.startMix(first.id, { ttsVolumePercent: 100, originalVolumePercent: 0 });
  coordinator.startMix(second.id, { ttsVolumePercent: 0, originalVolumePercent: 100 });
  await Promise.all([
    waitForTask(manager, first.id, "audioMix"),
    waitForTask(manager, second.id, "audioMix"),
  ]);

  assert.equal(manager.getJob(first.id)?.audioMix?.status, "completed");
  assert.equal(manager.getJob(second.id)?.audioMix?.status, "completed");
  assert.notEqual(coordinator.getAudioMixPath(first.id), coordinator.getAudioMixPath(second.id));
});
