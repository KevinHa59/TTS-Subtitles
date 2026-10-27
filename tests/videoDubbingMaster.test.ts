import assert from "node:assert/strict";
import { spawnSync } from "node:child_process";
import express from "express";
import fs from "node:fs";
import path from "node:path";
import os from "node:os";
import { Readable } from "node:stream";
import { after, test } from "node:test";
import { TimelineJob, SubtitleItem } from "../src/types/subtitles";
import { VideoDubbingManager } from "../videoDubbingManager";
import { createVideoDubbingRouter } from "../videoDubbingRoutes";
import {
  VideoDubbingMasterCoordinator,
  VideoDubbingMasterRequest,
} from "../videoDubbingMaster";

const temporaryDirectories: string[] = [];

async function createTemporaryDirectory(): Promise<string> {
  const directory = await fs.promises.mkdtemp(
    path.join(os.tmpdir(), "video-dubbing-master-test-"),
  );
  temporaryDirectories.push(directory);
  return directory;
}

function createTestVideo(filePath: string, durationSeconds: number): Buffer {
  const result = spawnSync(
    "ffmpeg",
    [
      "-hide_banner",
      "-loglevel",
      "error",
      "-f",
      "lavfi",
      "-i",
      "color=c=black:s=320x240:r=25",
      "-t",
      String(durationSeconds),
      "-c:v",
      "libx264",
      "-pix_fmt",
      "yuv420p",
      "-y",
      filePath,
    ],
    { windowsHide: true, encoding: "utf8" },
  );
  assert.equal(result.status, 0, result.stderr);
  return fs.readFileSync(filePath);
}

function createWav(durationSeconds: number, frequency = 440): Buffer {
  const sampleRate = 22050;
  const samples = Math.floor(durationSeconds * sampleRate);
  const dataBytes = samples * 2;
  const wav = Buffer.alloc(44 + dataBytes);
  wav.write("RIFF", 0);
  wav.writeUInt32LE(36 + dataBytes, 4);
  wav.write("WAVEfmt ", 8);
  wav.writeUInt32LE(16, 16);
  wav.writeUInt16LE(1, 20);
  wav.writeUInt16LE(1, 22);
  wav.writeUInt32LE(sampleRate, 24);
  wav.writeUInt32LE(sampleRate * 2, 28);
  wav.writeUInt16LE(2, 32);
  wav.writeUInt16LE(16, 34);
  wav.write("data", 36);
  wav.writeUInt32LE(dataBytes, 40);
  for (let index = 0; index < samples; index++) {
    wav.writeInt16LE(
      Math.round(Math.sin((2 * Math.PI * frequency * index) / sampleRate) * 4000),
      44 + index * 2,
    );
  }
  return wav;
}

function readWavDuration(filePath: string): number {
  const wav = fs.readFileSync(filePath);
  assert.equal(wav.toString("ascii", 0, 4), "RIFF");
  assert.equal(wav.toString("ascii", 8, 12), "WAVE");
  return wav.readUInt32LE(40) / wav.readUInt32LE(28);
}

function probeAudio(filePath: string): {
  duration: number;
  sampleRate: number;
  channels: number;
} {
  const result = spawnSync(
    "ffprobe",
    [
      "-v",
      "error",
      "-show_entries",
      "format=duration:stream=sample_rate,channels",
      "-of",
      "json",
      filePath,
    ],
    { windowsHide: true, encoding: "utf8" },
  );
  assert.equal(result.status, 0, result.stderr);
  const metadata = JSON.parse(result.stdout);
  return {
    duration: Number(metadata.format.duration),
    sampleRate: Number(metadata.streams[0].sample_rate),
    channels: Number(metadata.streams[0].channels),
  };
}

async function createReadyVideo(
  manager: VideoDubbingManager,
  directory: string,
  fileName: string,
  durationSeconds: number,
): Promise<{ id: string; source: Buffer }> {
  const sourcePath = path.join(directory, fileName);
  const source = createTestVideo(sourcePath, durationSeconds);
  const job = manager.createJob(fileName, source.length);
  const completed = await manager.receiveUpload(
    job.id,
    Object.assign(Readable.from([source]), { headers: {} }),
  );
  assert.equal(completed.status, "completed");
  return { id: job.id, source };
}

function makeTimelineJob(
  id: string,
  request: VideoDubbingMasterRequest,
): TimelineJob {
  const items: SubtitleItem[] = request.items.map((item) => ({
    ...item,
    status: "pending",
  }));
  return {
    id,
    model: request.model,
    speakerId: request.speakerId,
    items,
    stages: [],
    logs: [],
    status: "idle",
    overallProgress: {
      total: items.length,
      completed: 0,
      running: 0,
      queued: items.length,
      failed: 0,
      percent: 0,
      totalBatches: 1,
      currentBatch: 0,
      batchSize: 4,
      elapsedMs: 0,
    },
    options: {
      batchSize: 4,
      maxSpeed: request.options.maxSpeed,
      minSpeed: request.options.minSpeed,
      speedPriority: request.options.speedPriority,
      padSilence: true,
      outputFormat: "wav",
    },
  };
}

async function waitForMaster(
  manager: VideoDubbingManager,
  jobId: string,
  terminal: "completed" | "failed" | "cancelled",
): Promise<void> {
  const deadline = Date.now() + 10_000;
  while (Date.now() < deadline) {
    if (manager.getJob(jobId)?.masterGeneration?.status === terminal) return;
    await new Promise((resolve) => setTimeout(resolve, 20));
  }
  assert.fail(
    `Master job did not reach status ${terminal}: ${JSON.stringify(
      manager.getJob(jobId)?.masterGeneration,
    )}`,
  );
}

after(async () => {
  await Promise.all(
    temporaryDirectories.map((directory) =>
      fs.promises.rm(directory, { recursive: true, force: true }),
    ),
  );
});

test("trims a long SRT timeline at video end and preserves cue order", async () => {
  const directory = await createTemporaryDirectory();
  const manager = new VideoDubbingManager({
    storageDirectory: path.join(directory, "video_jobs"),
    ffprobePath: "ffprobe",
  });
  const readyVideo = await createReadyVideo(manager, directory, "source.mp4", 1);
  const createdJobs: TimelineJob[] = [];
  const maxDurations: number[] = [];
  const coordinator = new VideoDubbingMasterCoordinator(manager, {
    isPiperVoiceAvailable: (model) => model === "local:piper-a",
    createJob: (request, _workingDirectory, maxDuration) => {
      maxDurations.push(maxDuration);
      const job = makeTimelineJob("timeline-trim-test", request);
      createdJobs.push(job);
      return job;
    },
    processJob: async (job, workingDirectory) => {
      job.items[0].finalDuration = 0.25;
      job.items[1].finalDuration = 1.3;
      job.items.forEach((item) => (item.status = "completed"));
      job.overallProgress.completed = job.items.length;
      job.overallProgress.percent = 100;
      fs.writeFileSync(path.join(workingDirectory, "master.wav"), createWav(2.2));
      job.status = "completed";
    },
    removeJob: () => {},
    getAudioDuration: readWavDuration,
    ffmpegPath: "ffmpeg",
  });

  const items: SubtitleItem[] = [
    {
      id: "s1",
      index: 1,
      startTime: 0.1,
      endTime: 0.4,
      targetDuration: 0.3,
      text: "Câu ngắn.",
      status: "pending",
    },
    {
      id: "s2",
      index: 2,
      startTime: 0.8,
      endTime: 2.5,
      targetDuration: 1.7,
      text: "Câu dài sau khoảng lặng.",
      status: "pending",
    },
  ];
  coordinator.start(readyVideo.id, {
    items,
    model: "local:piper-a",
    options: { minSpeed: 0.8, maxSpeed: 1.5, speedPriority: "balanced" },
  });
  await waitForMaster(manager, readyVideo.id, "completed");

  const job = manager.getJob(readyVideo.id);
  assert.equal(job?.masterGeneration?.status, "completed");
  assert.ok((job?.masterGeneration?.durationSeconds || 0) <= 1 + 1 / 22050 + 0.001);
  assert.equal(maxDurations[0], 1);
  assert.deepEqual(
    createdJobs[0].items.map((item) => [item.text, item.startTime, item.endTime]),
    items.map((item) => [item.text, item.startTime, item.endTime]),
  );
  const masterPath = manager.getMasterAudioPath(readyVideo.id);
  assert.ok(masterPath);
  const audioMetadata = probeAudio(masterPath);
  assert.ok(audioMetadata.duration <= 1 + 1 / 22050 + 0.001);
  assert.equal(audioMetadata.sampleRate, 22050);
  assert.equal(audioMetadata.channels, 1);
  assert.deepEqual(
    fs.readFileSync(path.join(manager.getJobDirectory(readyVideo.id)!, "source.video")),
    readyVideo.source,
  );
});

test("keeps a short master short and isolates concurrent jobs with different Piper voices", async () => {
  const directory = await createTemporaryDirectory();
  const manager = new VideoDubbingManager({
    storageDirectory: path.join(directory, "video_jobs"),
    ffprobePath: "ffprobe",
  });
  const firstVideo = await createReadyVideo(manager, directory, "first.mp4", 4);
  const secondVideo = await createReadyVideo(manager, directory, "second.mp4", 4);
  const createdJobs: TimelineJob[] = [];
  const requestedVoices: string[] = [];
  const coordinator = new VideoDubbingMasterCoordinator(manager, {
    isPiperVoiceAvailable: (model) =>
      model === "local:piper-a" || model === "local:piper-b",
    createJob: (request) => {
      requestedVoices.push(request.model);
      const job = makeTimelineJob(`timeline-${createdJobs.length + 1}`, request);
      createdJobs.push(job);
      return job;
    },
    processJob: async (job, workingDirectory) => {
      job.items.forEach((item) => {
        item.status = "completed";
        item.finalDuration = 0.5;
      });
      job.overallProgress.completed = job.items.length;
      job.overallProgress.percent = 100;
      await fs.promises.writeFile(
        path.join(workingDirectory, "master.wav"),
        createWav(job.model.endsWith("a") ? 1.25 : 1.5),
      );
      job.status = "completed";
    },
    removeJob: () => {},
    getAudioDuration: readWavDuration,
    ffmpegPath: "ffmpeg",
  });
  const oneItem = (text: string): SubtitleItem[] => [
    {
      id: "srt",
      index: 1,
      startTime: 0.25,
      endTime: 1.75,
      targetDuration: 1.5,
      text,
      status: "pending",
    },
  ];
  const options = {
    minSpeed: 0.8,
    maxSpeed: 1.5,
    speedPriority: "balanced" as const,
  };

  coordinator.start(firstVideo.id, {
    items: oneItem("First job."),
    model: "local:piper-a",
    options,
  });
  coordinator.start(secondVideo.id, {
    items: oneItem("Second job."),
    model: "local:piper-b",
    options,
  });
  await Promise.all([
    waitForMaster(manager, firstVideo.id, "completed"),
    waitForMaster(manager, secondVideo.id, "completed"),
  ]);

  const firstMaster = manager.getMasterAudioPath(firstVideo.id);
  const secondMaster = manager.getMasterAudioPath(secondVideo.id);
  assert.ok(firstMaster && secondMaster && firstMaster !== secondMaster);
  assert.ok(Math.abs(readWavDuration(firstMaster) - 1.25) < 0.001);
  assert.ok(Math.abs(readWavDuration(secondMaster) - 1.5) < 0.001);
  assert.deepEqual(requestedVoices, ["local:piper-a", "local:piper-b"]);
  assert.ok(
    Math.abs(
      (manager.getJob(firstVideo.id)?.masterGeneration?.durationSeconds || 0) -
        1.25,
    ) < 1 / 22050,
  );
  assert.ok(
    Math.abs(
      (manager.getJob(secondVideo.id)?.masterGeneration?.durationSeconds || 0) -
        1.5,
    ) < 1 / 22050,
  );
});

test("reports failure, cancels cleanly, and keeps an earlier completed master", async () => {
  const directory = await createTemporaryDirectory();
  const manager = new VideoDubbingManager({
    storageDirectory: path.join(directory, "video_jobs"),
    ffprobePath: "ffprobe",
  });
  const readyVideo = await createReadyVideo(manager, directory, "source.mp4", 3);
  const request: VideoDubbingMasterRequest = {
    items: [
      {
        id: "one",
        index: 1,
        startTime: 0,
        endTime: 1,
        targetDuration: 1,
        text: "Một câu.",
        status: "pending",
      },
    ],
    model: "local:piper-a",
    options: { minSpeed: 0.8, maxSpeed: 1.5, speedPriority: "balanced" },
  };
  let shouldFail = false;
  let shouldWaitForCancel = false;
  let timelineIndex = 0;
  const coordinator = new VideoDubbingMasterCoordinator(manager, {
    isPiperVoiceAvailable: () => true,
    createJob: (masterRequest) =>
      makeTimelineJob(`timeline-${++timelineIndex}`, masterRequest),
    processJob: async (job, workingDirectory) => {
      if (shouldWaitForCancel) {
        await new Promise((resolve) => setTimeout(resolve, 30));
        job.status = "cancelled";
        return;
      }
      if (shouldFail) throw new Error("Piper test failure");
      job.items.forEach((item) => {
        item.status = "completed";
        item.finalDuration = 0.5;
      });
      job.overallProgress.completed = job.items.length;
      job.overallProgress.percent = 100;
      await fs.promises.writeFile(
        path.join(workingDirectory, "master.wav"),
        createWav(1),
      );
      job.status = "completed";
    },
    removeJob: () => {},
    getAudioDuration: readWavDuration,
    ffmpegPath: "ffmpeg",
  });

  coordinator.start(readyVideo.id, request);
  await waitForMaster(manager, readyVideo.id, "completed");
  const masterPath = manager.getMasterAudioPath(readyVideo.id)!;
  const originalMaster = fs.readFileSync(masterPath);

  shouldFail = true;
  coordinator.start(readyVideo.id, request);
  await waitForMaster(manager, readyVideo.id, "failed");
  assert.deepEqual(fs.readFileSync(masterPath), originalMaster);
  assert.equal(
    fs.existsSync(path.join(manager.getJobDirectory(readyVideo.id)!, "tts_work")),
    false,
  );

  shouldFail = false;
  shouldWaitForCancel = true;
  coordinator.start(readyVideo.id, request);
  await coordinator.cancel(readyVideo.id);
  assert.equal(
    manager.getJob(readyVideo.id)?.masterGeneration?.status,
    "cancelled",
  );
  assert.deepEqual(fs.readFileSync(masterPath), originalMaster);
  assert.equal(
    fs.existsSync(path.join(manager.getJobDirectory(readyVideo.id)!, "tts_work")),
    false,
  );
});

test("master HTTP API starts a job, reports progress, and streams WAV", async () => {
  const directory = await createTemporaryDirectory();
  const manager = new VideoDubbingManager({
    storageDirectory: path.join(directory, "video_jobs"),
    ffprobePath: "ffprobe",
  });
  const readyVideo = await createReadyVideo(manager, directory, "source.mp4", 3);
  const coordinator = new VideoDubbingMasterCoordinator(manager, {
    isPiperVoiceAvailable: (model) => model === "local:piper-a",
    createJob: (request) => makeTimelineJob("timeline-api", request),
    processJob: async (job, workingDirectory) => {
      job.items.forEach((item) => {
        item.status = "completed";
        item.finalDuration = 0.5;
      });
      job.overallProgress.completed = job.items.length;
      job.overallProgress.percent = 100;
      await fs.promises.writeFile(
        path.join(workingDirectory, "master.wav"),
        createWav(1.25),
      );
      job.status = "completed";
    },
    removeJob: () => {},
    getAudioDuration: readWavDuration,
    ffmpegPath: "ffmpeg",
  });
  const app = express();
  app.use(express.json());
  app.use("/api/video-dubbing", createVideoDubbingRouter(manager, coordinator));
  const server = app.listen(0, "127.0.0.1");
  await new Promise<void>((resolve, reject) => {
    server.once("listening", resolve);
    server.once("error", reject);
  });
  const address = server.address();
  assert.ok(address && typeof address !== "string");
  const baseUrl = `http://127.0.0.1:${address.port}/api/video-dubbing/jobs/${readyVideo.id}`;

  try {
    const invalidJob = await fetch(
      `http://127.0.0.1:${address.port}/api/video-dubbing/jobs/not-valid/master`,
      { method: "POST" },
    );
    assert.equal(invalidJob.status, 400);

    const startResponse = await fetch(`${baseUrl}/master`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        items: [
          {
            id: "s1",
            index: 1,
            startTime: 0.2,
            endTime: 1.2,
            targetDuration: 1,
            text: "Tạo Master qua API.",
            status: "pending",
          },
        ],
        model: "local:piper-a",
        options: {
          minSpeed: 0.8,
          maxSpeed: 1.5,
          speedPriority: "balanced",
        },
      }),
    });
    assert.equal(startResponse.status, 202);

    const deadline = Date.now() + 10_000;
    let status: string | undefined;
    while (Date.now() < deadline) {
      const stateResponse = await fetch(baseUrl);
      const state = await stateResponse.json();
      status = state.job?.masterGeneration?.status;
      if (status === "completed") break;
      await new Promise((resolve) => setTimeout(resolve, 20));
    }
    assert.equal(status, "completed");

    const audioResponse = await fetch(`${baseUrl}/master-audio`);
    assert.equal(audioResponse.status, 200);
    assert.match(audioResponse.headers.get("content-type") || "", /audio\/wav/i);
    const audio = Buffer.from(await audioResponse.arrayBuffer());
    assert.ok(audio.length > 44);
    assert.ok(Math.abs(readWavDuration(
      path.join(manager.getJobDirectory(readyVideo.id)!, "tts-master.wav"),
    ) - 1.25) < 1 / 22050);
  } finally {
    server.closeAllConnections();
    await new Promise<void>((resolve, reject) => {
      server.close((error) => (error ? reject(error) : resolve()));
    });
  }
});
