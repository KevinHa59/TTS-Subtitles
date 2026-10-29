import assert from "node:assert/strict";
import express from "express";
import { spawnSync } from "node:child_process";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { Readable } from "node:stream";
import { after, test } from "node:test";
import { TimelineJob } from "../src/types/subtitles";
import {
  VideoDubbingAutoPipelineConfig,
  VideoDubbingSeparationAvailability,
  VideoDubbingMixerSettings,
} from "../src/types/videoDubbing";
import { VideoDubbingManager } from "../videoDubbingManager";
import { VideoDubbingMasterCoordinator } from "../videoDubbingMaster";
import { VideoDubbingMediaCoordinator } from "../videoDubbingMedia";
import { VideoDubbingPipelineCoordinator } from "../videoDubbingPipeline";
import { createVideoDubbingRouter } from "../videoDubbingRoutes";
import { VideoDubbingSeparationCoordinator } from "../videoDubbingSeparation";

const temporaryDirectories: string[] = [];

async function createTemporaryDirectory(): Promise<string> {
  const directory = await fs.promises.mkdtemp(
    path.join(os.tmpdir(), "video-dubbing-pipeline-test-"),
  );
  temporaryDirectories.push(directory);
  return directory;
}

function run(command: string, args: string[]): string {
  const result = spawnSync(command, args, {
    windowsHide: true,
    encoding: "utf8",
    maxBuffer: 8 * 1024 * 1024,
  });
  assert.equal(result.status, 0, result.stderr);
  return result.stdout;
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
    "sine=frequency=440:sample_rate=44100:duration=2",
    "-t",
    "2",
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

function createMasterWav(filePath: string): void {
  run("ffmpeg", [
    "-hide_banner",
    "-loglevel",
    "error",
    "-f",
    "lavfi",
    "-i",
    "sine=frequency=880:sample_rate=22050:duration=1.5",
    "-ac",
    "1",
    "-c:a",
    "pcm_s16le",
    "-y",
    filePath,
  ]);
}

const mixerSettings: VideoDubbingMixerSettings = {
  vocals: { volumePercent: 0, muted: true },
  instrumental: { volumePercent: 0, muted: true },
  ttsMaster: { volumePercent: 100, muted: false },
};

function createPipeline(
  manager: VideoDubbingManager,
  onMasterRun: () => void,
  processDelayMs = 0,
): VideoDubbingPipelineCoordinator {
  const master = new VideoDubbingMasterCoordinator(manager, {
    isPiperVoiceAvailable: () => true,
    createJob: (request, workingDirectory) => {
      const items = request.items.map((item) => ({
        ...item,
        status: "pending" as const,
      }));
      return {
        id: "test-timeline",
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
          minSpeed: request.options.minSpeed,
          maxSpeed: request.options.maxSpeed,
          speedPriority: request.options.speedPriority,
          padSilence: true,
          outputFormat: "wav",
        },
      } satisfies TimelineJob;
    },
    processJob: async (timelineJob, workingDirectory) => {
      onMasterRun();
      if (processDelayMs) {
        await new Promise((resolve) => setTimeout(resolve, processDelayMs));
      }
      if (timelineJob.status === "cancelled") return;
      createMasterWav(path.join(workingDirectory, "master.wav"));
      timelineJob.items = timelineJob.items.map((item) => ({
        ...item,
        status: "completed",
        finalDuration: item.targetDuration,
      }));
      timelineJob.status = "completed";
      timelineJob.overallProgress.completed = timelineJob.items.length;
      timelineJob.overallProgress.queued = 0;
      timelineJob.overallProgress.percent = 100;
    },
    removeJob: () => undefined,
    getAudioDuration: (filePath) => {
      const output = run("ffprobe", [
        "-v",
        "error",
        "-show_entries",
        "format=duration",
        "-of",
        "default=noprint_wrappers=1:nokey=1",
        filePath,
      ]);
      return Number(output.trim());
    },
    ffmpegPath: "ffmpeg",
  });
  const unavailable: VideoDubbingSeparationAvailability = {
    status: "unavailable",
    model: "htdemucs",
    message: "Demucs intentionally disabled in this test.",
  };
  const separation = new VideoDubbingSeparationCoordinator(manager, {
    pythonPath: "python",
    ffmpegPath: "ffmpeg",
    ffprobePath: "ffprobe",
    isMediaBusy: () => false,
    checkAvailability: async () => unavailable,
  });
  const media = new VideoDubbingMediaCoordinator(manager, {
    ffmpegPath: "ffmpeg",
    ffprobePath: "ffprobe",
  });
  return new VideoDubbingPipelineCoordinator(
    manager,
    master,
    separation,
    media,
  );
}

function createConfig(): VideoDubbingAutoPipelineConfig {
  return {
    enabled: true,
    master: {
      items: [
        {
          id: "subtitle-1",
          index: 1,
          startTime: 0,
          endTime: 1.5,
          targetDuration: 1.5,
          text: "Test subtitle",
          status: "pending",
        },
      ],
      model: "test-piper",
      options: {
        minSpeed: 0.8,
        maxSpeed: 1.5,
        speedPriority: "balanced",
      },
    },
    demucsEnabled: false,
    mixerSettings,
    originalAudioVolumePercent: 50,
  };
}

async function createReadyJob(
  manager: VideoDubbingManager,
  directory: string,
): Promise<string> {
  const source = createVideo(path.join(directory, "source.mp4"));
  const job = manager.createJob("source.mp4", source.length);
  const ready = await manager.receiveUpload(
    job.id,
    Object.assign(Readable.from([source]), { headers: {} }),
  );
  assert.equal(ready.status, "completed");
  return job.id;
}

async function waitForPipeline(
  manager: VideoDubbingManager,
  jobId: string,
  status: "completed" | "failed" | "cancelled",
): Promise<void> {
  const deadline = Date.now() + 30_000;
  while (Date.now() < deadline) {
    if (manager.getJob(jobId)?.autoPipeline?.status === status) return;
    await new Promise((resolve) => setTimeout(resolve, 25));
  }
  assert.fail(
    `Auto Pipeline timed out: ${JSON.stringify(
      manager.getJob(jobId)?.autoPipeline,
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

test("runs and reuses a complete local pipeline with original audio fallback", async () => {
  const root = await createTemporaryDirectory();
  const manager = new VideoDubbingManager({
    storageDirectory: path.join(root, "jobs"),
    ffprobePath: "ffprobe",
  });
  let masterRuns = 0;
  const pipeline = createPipeline(manager, () => masterRuns++);
  const jobId = await createReadyJob(manager, root);

  await pipeline.start(jobId, createConfig());
  await waitForPipeline(manager, jobId, "completed");

  const first = manager.getJob(jobId)!;
  assert.equal(masterRuns, 1);
  assert.equal(first.finalMix?.status, "completed");
  assert.deepEqual(
    first.finalMix?.includedTracks?.sort(),
    ["originalAudio", "ttsMaster"].sort(),
  );
  assert.ok(first.videoExport?.status === "completed");
  assert.equal(
    fs.existsSync(path.join(manager.getJobDirectory(jobId)!, "output.mp4")),
    true,
  );

  await pipeline.start(jobId, createConfig());
  await waitForPipeline(manager, jobId, "completed");
  const rerun = manager.getJob(jobId)!.autoPipeline!;
  assert.equal(masterRuns, 1);
  assert.deepEqual(
    rerun.reusedOutputs.sort(),
    ["export", "finalMix", "master"].sort(),
  );
  const beforeDisable = manager.getJob(jobId)!;
  pipeline.configure(jobId, { ...createConfig(), enabled: false });
  const afterDisable = manager.getJob(jobId)!;
  assert.equal(afterDisable.finalMix?.status, beforeDisable.finalMix?.status);
  assert.equal(afterDisable.videoExport?.status, beforeDisable.videoExport?.status);
  assert.equal(
    fs.existsSync(path.join(manager.getJobDirectory(jobId)!, "output.mp4")),
    true,
  );
});

test("cancels the active stage and persists the cancelled pipeline state", async () => {
  const root = await createTemporaryDirectory();
  const manager = new VideoDubbingManager({
    storageDirectory: path.join(root, "jobs"),
    ffprobePath: "ffprobe",
  });
  const pipeline = createPipeline(manager, () => undefined, 250);
  const jobId = await createReadyJob(manager, root);

  await pipeline.start(jobId, createConfig());
  const deadline = Date.now() + 5_000;
  while (!manager.getJob(jobId)?.masterGeneration?.status ||
    manager.getJob(jobId)?.masterGeneration?.status === "idle") {
    if (Date.now() > deadline) assert.fail("Master stage did not start.");
    await new Promise((resolve) => setTimeout(resolve, 10));
  }
  await pipeline.cancel(jobId);
  await waitForPipeline(manager, jobId, "cancelled");
  assert.equal(manager.getJob(jobId)?.videoExport?.status, undefined);
});

test("does not start TTS when requested Demucs is unavailable", async () => {
  const root = await createTemporaryDirectory();
  const storageDirectory = path.join(root, "jobs");
  const manager = new VideoDubbingManager({
    storageDirectory,
    ffprobePath: "ffprobe",
  });
  let masterRuns = 0;
  const pipeline = createPipeline(manager, () => masterRuns++);
  const jobId = await createReadyJob(manager, root);
  const config = createConfig();
  config.demucsEnabled = true;
  config.mixerSettings = {
    ...config.mixerSettings,
    vocals: { volumePercent: 100, muted: false },
  };

  await pipeline.start(jobId, config);
  await waitForPipeline(manager, jobId, "failed");
  assert.equal(masterRuns, 0);
  assert.match(
    manager.getJob(jobId)?.autoPipeline?.error || "",
    /Demucs intentionally disabled/,
  );
});

test("persists mixer settings before audio tracks exist and refuses disabled starts", async () => {
  const root = await createTemporaryDirectory();
  const manager = new VideoDubbingManager({
    storageDirectory: path.join(root, "jobs"),
    ffprobePath: "ffprobe",
  });
  let masterRuns = 0;
  const pipeline = createPipeline(manager, () => masterRuns++);
  const jobId = await createReadyJob(manager, root);
  const config = createConfig();
  config.enabled = false;
  config.mixerSettings = {
    vocals: { volumePercent: 135, muted: true },
    instrumental: { volumePercent: 72, muted: false },
    ttsMaster: { volumePercent: 115, muted: false },
  };
  pipeline.configure(jobId, config);
  assert.deepEqual(manager.getJob(jobId)?.mixerSettings, config.mixerSettings);
  assert.equal(manager.getJob(jobId)?.separation?.status, undefined);
  await assert.rejects(() => pipeline.start(jobId, config), /bật Auto Pipeline/i);
  assert.equal(masterRuns, 0);
  assert.equal(manager.getJob(jobId)?.masterGeneration?.status, "idle");
});

test("restores a running persisted pipeline as interrupted without rerunning it", async () => {
  const root = await createTemporaryDirectory();
  const storageDirectory = path.join(root, "jobs");
  const manager = new VideoDubbingManager({
    storageDirectory,
    ffprobePath: "ffprobe",
  });
  const jobId = await createReadyJob(manager, root);
  const config = createConfig();
  manager.setAutoPipelineConfig(jobId, config);
  manager.setAutoPipelineState(jobId, {
    status: "running",
    phase: "master",
    progressPercent: 42,
    completedStages: [],
    reusedOutputs: [],
    artifacts: {},
    config,
    updatedAt: Date.now(),
  });

  const restoredManager = new VideoDubbingManager({
    storageDirectory,
    ffprobePath: "ffprobe",
  });
  await restoredManager.initialize();
  const restored = restoredManager.getJob(jobId)?.autoPipeline;
  assert.equal(restored?.status, "interrupted");
  assert.equal(restored?.progressPercent, undefined);
  assert.match(restored?.error || "", /không tự chạy lại/);
});

test("keeps locked Windows metadata replacement recoverable without failing the job", async () => {
  const root = await createTemporaryDirectory();
  const storageDirectory = path.join(root, "jobs");
  const manager = new VideoDubbingManager({
    storageDirectory,
    ffprobePath: "ffprobe",
    renameMetadataFile: () => {
      const error = new Error("Access denied while replacing an open file.") as
        NodeJS.ErrnoException;
      error.code = "EPERM";
      throw error;
    },
  });
  const job = manager.createJob("locked.mp4", 100);
  const config = createConfig();
  config.enabled = false;
  config.master.model = "persisted-local-voice";
  manager.setAutoPipelineConfig(job.id, config);

  const restoredManager = new VideoDubbingManager({
    storageDirectory,
    ffprobePath: "ffprobe",
  });
  await restoredManager.initialize();
  const restored = restoredManager.getJob(job.id);
  assert.equal(restored?.autoPipeline?.config?.enabled, false);
  assert.equal(
    restored?.autoPipeline?.config?.master.model,
    "persisted-local-voice",
  );
  assert.match(restored?.warning || "", /bản ghi tạm/);
});

test("exposes persisted pipeline configuration and execution through job-scoped APIs", async () => {
  const root = await createTemporaryDirectory();
  const manager = new VideoDubbingManager({
    storageDirectory: path.join(root, "jobs"),
    ffprobePath: "ffprobe",
  });
  const pipeline = createPipeline(manager, () => undefined);
  const jobId = await createReadyJob(manager, root);
  const app = express();
  app.use(express.json());
  app.use(
    "/api/video-dubbing",
    createVideoDubbingRouter(
      manager,
      undefined,
      undefined,
      undefined,
      pipeline,
    ),
  );
  const server = app.listen(0, "127.0.0.1");
  await new Promise<void>((resolve) => server.once("listening", resolve));
  const address = server.address();
  assert.ok(address && typeof address !== "string");
  const baseUrl = `http://127.0.0.1:${address.port}/api/video-dubbing/jobs/${jobId}/auto-pipeline`;

  try {
    const configResponse = await fetch(`${baseUrl}/config`, {
      method: "PUT",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(createConfig()),
    });
    assert.equal(configResponse.status, 200);
    const configResult = (await configResponse.json()) as {
      success: boolean;
      config: VideoDubbingAutoPipelineConfig;
    };
    assert.equal(configResult.success, true);

    const startResponse = await fetch(baseUrl, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(createConfig()),
    });
    assert.equal(startResponse.status, 202);
    await waitForPipeline(manager, jobId, "completed");

    const statusResponse = await fetch(baseUrl);
    assert.equal(statusResponse.status, 200);
    const statusResult = (await statusResponse.json()) as {
      config: VideoDubbingAutoPipelineConfig;
      state: { status: string };
    };
    assert.equal(statusResult.state.status, "completed");
    assert.equal(statusResult.config.master.model, "test-piper");
  } finally {
    await new Promise<void>((resolve, reject) =>
      server.close((error) => (error ? reject(error) : resolve())),
    );
  }
});
