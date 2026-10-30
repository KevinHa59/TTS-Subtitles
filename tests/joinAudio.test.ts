import assert from "node:assert/strict";
import { spawnSync } from "node:child_process";
import fs from "node:fs";
import express from "express";
import type { Server } from "node:http";
import os from "node:os";
import path from "node:path";
import { after, test } from "node:test";
import { Readable } from "node:stream";
import { JoinAudioManager, type JoinAudioInput } from "../joinAudioManager";
import { createJoinAudioRouter } from "../joinAudioRoutes";

const temporaryDirectories: string[] = [];

async function createTemporaryDirectory(): Promise<string> {
  const directory = await fs.promises.mkdtemp(path.join(os.tmpdir(), "join-audio-test-"));
  temporaryDirectories.push(directory);
  return directory;
}

function run(command: string, args: string[], maxBuffer = 8 * 1024 * 1024) {
  const result = spawnSync(command, args, {
    windowsHide: true,
    encoding: "utf8",
    maxBuffer,
  });
  assert.equal(result.status, 0, result.stderr);
  return result;
}

function createTone(filePath: string, frequency: number, sampleRate: number, format: "wav" | "mp3") {
  run("ffmpeg", [
    "-hide_banner",
    "-loglevel", "error",
    "-f", "lavfi",
    "-i", `sine=frequency=${frequency}:sample_rate=${sampleRate}:duration=0.6`,
    ...(format === "mp3"
      ? ["-ac", "2", "-c:a", "libmp3lame", "-b:a", "128k"]
      : ["-ac", "1", "-c:a", "pcm_s16le"]),
    "-y", filePath,
  ]);
}

async function createManager(storageDirectory: string): Promise<JoinAudioManager> {
  return new JoinAudioManager({
    ffmpegPath: "ffmpeg",
    ffprobePath: "ffprobe",
    storageDirectory,
  });
}

async function createJobWithFiles(
  manager: JoinAudioManager,
  files: Array<{ name: string; path: string }>,
  options = { targetLufs: -20, truePeakDbtp: -1 },
): Promise<string> {
  const inputs: JoinAudioInput[] = files.map(({ name, path: filePath }) => ({
    name,
    size: fs.statSync(filePath).size,
  }));
  const id = manager.createJob(inputs, options);
  for (let index = 0; index < files.length; index++) {
    await manager.receiveFile(id, index, fs.createReadStream(files[index].path));
  }
  manager.startJob(id);
  return id;
}

async function waitForJob(manager: JoinAudioManager, id: string) {
  const deadline = Date.now() + 20_000;
  while (Date.now() < deadline) {
    const job = manager.getJob(id);
    if (job?.status === "completed" || job?.status === "failed" || job?.status === "cancelled") {
      return job;
    }
    await new Promise((resolve) => setTimeout(resolve, 25));
  }
  assert.fail(`Timed out waiting for join-audio job ${id}.`);
}

function estimateFrequency(samples: Buffer, startSeconds: number, durationSeconds: number): number {
  const sampleRate = 16000;
  const start = Math.floor(startSeconds * sampleRate);
  const end = Math.floor((startSeconds + durationSeconds) * sampleRate);
  let crossings = 0;
  for (let index = start + 1; index < end; index++) {
    if ((samples.readFloatLE((index - 1) * 4) < 0) !== (samples.readFloatLE(index * 4) < 0)) {
      crossings++;
    }
  }
  return crossings / (durationSeconds * 2);
}

test("joins mixed formats and sample rates in order, normalizes loudness and verifies WAV output", async () => {
  const directory = await createTemporaryDirectory();
  const firstPath = path.join(directory, "giọng đầu.wav");
  const secondPath = path.join(directory, "audio thử.mp3");
  createTone(firstPath, 440, 22050, "wav");
  createTone(secondPath, 880, 48000, "mp3");
  const manager = await createManager(path.join(directory, "storage"));
  const id = await createJobWithFiles(manager, [
    { name: "giọng đầu.wav", path: firstPath },
    { name: "audio thử.mp3", path: secondPath },
  ]);
  const job = await waitForJob(manager, id);

  assert.equal(job.status, "completed");
  assert.equal(job.output?.sampleRate, 16000);
  assert.equal(job.output?.channels, 1);
  assert.equal(job.output?.codec, "pcm_s16le");
  assert.ok(Math.abs((job.totalDurationSeconds || 0) - 1.2) < 0.15);

  const outputPath = manager.getOutputPath(id);
  assert.ok(outputPath);
  const decodedPath = path.join(directory, "decoded.f32le");
  run("ffmpeg", [
    "-hide_banner", "-loglevel", "error", "-i", outputPath!,
    "-f", "f32le", "-ac", "1", "-ar", "16000", "-y", decodedPath,
  ], 2 * 1024 * 1024).stdout;
  const samples = fs.readFileSync(decodedPath);
  assert.ok(Math.abs(estimateFrequency(samples, 0.2, 0.1) - 440) < 30);
  assert.ok(Math.abs(estimateFrequency(samples, 0.85, 0.1) - 880) < 40);

  const loudnessReport = run("ffmpeg", [
    "-hide_banner", "-i", outputPath!,
    "-af", "loudnorm=I=-20:TP=-1:LRA=11:print_format=json",
    "-f", "null", "-",
  ], 2 * 1024 * 1024);
  const reportMatch = loudnessReport.stderr.match(/\{\s*"input_i"[\s\S]*?\}/);
  assert.ok(reportMatch, loudnessReport.stderr);
  const loudness = JSON.parse(reportMatch[0]);
  const inputLufs = Number(loudness.input_i);
  const inputTruePeak = Number(loudness.input_tp);
  assert.ok(Math.abs(inputLufs - -20) < 1.5, `Expected about -20 LUFS, got ${inputLufs}`);
  assert.ok(inputTruePeak <= -0.8, `Expected true peak at or below -1 dBTP, got ${inputTruePeak} dBTP`);
});

test("reports corrupt input details and does not produce an output file", async () => {
  const directory = await createTemporaryDirectory();
  const previousPath = path.join(directory, "previous.wav");
  createTone(previousPath, 440, 16000, "wav");
  const brokenPath = path.join(directory, "lỗi unicode.wav");
  fs.writeFileSync(brokenPath, Buffer.from("not an audio stream"));
  const manager = await createManager(path.join(directory, "storage"));
  const previousId = await createJobWithFiles(manager, [
    { name: "previous.wav", path: previousPath },
  ]);
  assert.equal((await waitForJob(manager, previousId)).status, "completed");
  const previousOutputPath = manager.getOutputPath(previousId);
  assert.ok(previousOutputPath);
  const previousOutputSize = fs.statSync(previousOutputPath!).size;

  const id = await createJobWithFiles(manager, [{ name: "lỗi unicode.wav", path: brokenPath }]);
  const job = await waitForJob(manager, id);

  assert.equal(job.status, "failed");
  assert.match(job.error || "", /tệp không hợp lệ/i);
  assert.match(job.fileErrors?.[0] || "", /lỗi unicode\.wav/i);
  assert.equal(manager.getOutputPath(id), undefined);
  assert.equal(fs.statSync(previousOutputPath!).size, previousOutputSize);
});

test("keeps same-named inputs distinct and preserves their chosen sequence", async () => {
  const directory = await createTemporaryDirectory();
  const firstPath = path.join(directory, "first-source.wav");
  const secondPath = path.join(directory, "second-source.wav");
  createTone(firstPath, 330, 16000, "wav");
  createTone(secondPath, 660, 44100, "wav");
  const manager = await createManager(path.join(directory, "storage"));
  const id = await createJobWithFiles(manager, [
    { name: "bản thu.wav", path: firstPath },
    { name: "bản thu.wav", path: secondPath },
  ]);
  const job = await waitForJob(manager, id);
  assert.equal(job.status, "completed");
  const outputPath = manager.getOutputPath(id);
  assert.ok(outputPath);
  const decodedPath = path.join(directory, "same-name.f32le");
  run("ffmpeg", [
    "-hide_banner", "-loglevel", "error", "-i", outputPath!,
    "-f", "f32le", "-ac", "1", "-ar", "16000", "-y", decodedPath,
  ]);
  const samples = fs.readFileSync(decodedPath);
  assert.ok(Math.abs(estimateFrequency(samples, 0.2, 0.1) - 330) < 30);
  assert.ok(Math.abs(estimateFrequency(samples, 0.85, 0.1) - 660) < 40);
});

test("cancels a running probe and removes temporary input files", async () => {
  const directory = await createTemporaryDirectory();
  const inputPath = path.join(directory, "long.wav");
  run("ffmpeg", [
    "-hide_banner", "-loglevel", "error",
    "-f", "lavfi", "-i", "sine=frequency=440:sample_rate=48000:duration=20",
    "-c:a", "pcm_s16le", "-y", inputPath,
  ]);
  const manager = await createManager(path.join(directory, "storage"));
  const id = await createJobWithFiles(manager, [{ name: "long.wav", path: inputPath }]);
  await manager.cancelJob(id);
  assert.equal(manager.getJob(id)?.status, "cancelled");
  assert.equal(manager.getOutputPath(id), undefined);
  await new Promise((resolve) => setTimeout(resolve, 50));
  assert.equal(
    fs.existsSync(path.join(directory, "storage", "temporary", id)),
    false,
  );
});

test("manages metadata for one thousand files without materializing file rows in the UI", async () => {
  const directory = await createTemporaryDirectory();
  const manager = await createManager(path.join(directory, "storage"));
  const inputs = Array.from({ length: 1000 }, (_, index) => ({
    name: index % 2 === 0 ? "trùng tên tiếng Việt.wav" : `Audio ${index}.mp3`,
    size: 1024 + index,
  }));
  const id = manager.createJob(inputs, { targetLufs: -20, truePeakDbtp: -1 });
  const job = manager.getJob(id);
  assert.equal(job?.fileCount, 1000);
  assert.equal(job?.uploadedCount, 0);
  assert.equal(job?.status, "uploading");
});

test("streams an upload through the HTTP API and serves its verified WAV output", async () => {
  const directory = await createTemporaryDirectory();
  const inputPath = path.join(directory, "api-fixture.wav");
  createTone(inputPath, 510, 32000, "wav");
  const manager = await createManager(path.join(directory, "storage"));
  const app = express();
  app.use(express.json());
  app.use("/api/join-audio", createJoinAudioRouter(manager));
  const server = await new Promise<Server>((resolve) => {
    const listeningServer = app.listen(0, "127.0.0.1", () => resolve(listeningServer));
  });
  try {
    const address = server.address();
    assert.ok(address && typeof address !== "string");
    const baseUrl = `http://127.0.0.1:${address.port}/api/join-audio`;
    const createResponse = await fetch(`${baseUrl}/jobs`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        files: [{ name: "fixture.wav", size: fs.statSync(inputPath).size }],
        options: { targetLufs: -20, truePeakDbtp: -1 },
      }),
    });
    const created = await createResponse.json() as { success: boolean; id: string };
    assert.equal(createResponse.status, 201);
    assert.equal(created.success, true);

    const uploadResponse = await fetch(`${baseUrl}/jobs/${created.id}/files/0`, {
      method: "PUT",
      headers: { "Content-Type": "application/octet-stream" },
      body: fs.readFileSync(inputPath),
    });
    assert.equal(uploadResponse.status, 200);
    const startResponse = await fetch(`${baseUrl}/jobs/${created.id}/start`, { method: "POST" });
    assert.equal(startResponse.status, 200);
    const completed = await waitForJob(manager, created.id);
    assert.equal(completed.status, "completed");

    const outputResponse = await fetch(`${baseUrl}/jobs/${created.id}/output`);
    assert.equal(outputResponse.status, 200);
    assert.match(outputResponse.headers.get("content-type") || "", /audio\/wav/);
    assert.ok((await outputResponse.arrayBuffer()).byteLength > 44);
  } finally {
    await new Promise<void>((resolve, reject) =>
      server.close((error) => error ? reject(error) : resolve()),
    );
  }
});

after(async () => {
  await Promise.all(
    temporaryDirectories.map((directory) =>
      fs.promises.rm(directory, { recursive: true, force: true }),
    ),
  );
});
