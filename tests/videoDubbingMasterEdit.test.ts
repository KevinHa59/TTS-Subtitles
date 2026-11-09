import assert from "node:assert/strict";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { after, test } from "node:test";
import { VideoDubbingManager } from "../videoDubbingManager";
import { VideoDubbingMasterEditCoordinator } from "../videoDubbingMasterEdit";

const temporaryDirectories: string[] = [];

function createWav(samples: number[]): Buffer {
  const sampleRate = 1000;
  const data = Buffer.alloc(samples.length * 2);
  samples.forEach((sample, index) => data.writeInt16LE(sample, index * 2));
  const header = Buffer.alloc(44);
  header.write("RIFF", 0);
  header.writeUInt32LE(36 + data.length, 4);
  header.write("WAVEfmt ", 8);
  header.writeUInt32LE(16, 16);
  header.writeUInt16LE(1, 20);
  header.writeUInt16LE(1, 22);
  header.writeUInt32LE(sampleRate, 24);
  header.writeUInt32LE(sampleRate * 2, 28);
  header.writeUInt16LE(2, 32);
  header.writeUInt16LE(16, 34);
  header.write("data", 36);
  header.writeUInt32LE(data.length, 40);
  return Buffer.concat([header, data]);
}

async function setupJob() {
  const root = await fs.promises.mkdtemp(path.join(os.tmpdir(), "master-edit-test-"));
  temporaryDirectories.push(root);
  const manager = new VideoDubbingManager({
    storageDirectory: root,
    ffprobePath: "ffprobe",
  });
  const job = manager.createJob("source.mp4", 1);
  const directory = manager.getJobDirectory(job.id)!;
  fs.writeFileSync(path.join(directory, "source.video"), "test video");
  const masterPath = path.join(directory, "tts-master.wav");
  const temporaryMaster = path.join(directory, "initial-master.tmp.wav");
  fs.writeFileSync(temporaryMaster, createWav([
    ...Array(200).fill(0),
    ...Array(250).fill(5000),
    ...Array(200).fill(0),
    ...Array(250).fill(6000),
    ...Array(100).fill(0),
  ]));
  manager.completeMasterGeneration(job.id, temporaryMaster, 1, [
    { startTime: 0.1, durationSeconds: 0.55, text: "First exact" },
    { startTime: 0.65, durationSeconds: 0.35, text: "Second exact" },
  ]);
  manager.setAutoPipelineConfig(job.id, {
    enabled: true,
    master: {
      model: "test",
      options: { minSpeed: 1, maxSpeed: 1, speedPriority: "balanced" },
      items: [
        {
          id: "one", index: 0, startTime: 0.1, endTime: 0.65,
          targetDuration: 0.55, text: "Wrong first", status: "completed",
        },
        {
          id: "two", index: 1, startTime: 0.65, endTime: 1,
          targetDuration: 0.35, text: "Wrong second", status: "completed",
        },
      ],
    },
    ttsMasterEnabled: true,
    demucsEnabled: false,
    mixerSettings: {
      vocals: { volumePercent: 100, muted: false },
      instrumental: { volumePercent: 100, muted: false },
      ttsMaster: { volumePercent: 100, muted: false },
    },
    originalAudioVolumePercent: 100,
  });
  return { manager, coordinator: new VideoDubbingMasterEditCoordinator(manager), job, directory, masterPath };
}

after(async () => {
  await Promise.all(
    temporaryDirectories.map((directory) =>
      fs.promises.rm(directory, { recursive: true, force: true }),
    ),
  );
});

test("splits subtitle audio, persists moves, and replaces master only after merge succeeds", async () => {
  const { manager, coordinator, job, directory, masterPath } = await setupJob();
  const original = fs.readFileSync(masterPath);
  const split = coordinator.split(job.id);
  assert.equal(split.clips.length, 2);
  assert.deepEqual(split.clips.map((clip) => clip.text), ["First exact", "Second exact"]);
  assert.ok(split.clips.every((clip) => clip.durationSeconds < 0.55));

  const moved = split.clips.map((clip) => ({
    ...clip,
    startTime: clip.id === split.clips[0].id ? 0.5 : 0.1,
  }));
  coordinator.updateClips(job.id, moved);
  assert.equal(manager.getJob(job.id)?.masterEdit?.clips[0].startTime, 0.5);
  assert.deepEqual(fs.readFileSync(masterPath), original);
  const restoredManager = new VideoDubbingManager({
    storageDirectory: path.dirname(directory),
    ffprobePath: "ffprobe",
  });
  await restoredManager.initialize();
  assert.deepEqual(
    restoredManager.getJob(job.id)?.masterEdit?.clips.map((clip) => clip.text),
    ["First exact", "Second exact"],
  );
  assert.equal(restoredManager.getJob(job.id)?.masterEditSegments?.[0].text, "First exact");
  const preview = coordinator.createPreviewWav(job.id);
  assert.equal(preview.readInt16LE(44 + 250 * 2), 6000);
  assert.equal(preview.readInt16LE(44 + 650 * 2), 5000);

  coordinator.merge(job.id);
  assert.equal(manager.getJob(job.id)?.masterEdit, undefined);
  const merged = fs.readFileSync(masterPath);
  assert.notDeepEqual(merged, original);
  assert.equal(merged.readInt16LE(44 + 400 * 2), 0);
  assert.notEqual(merged.readInt16LE(44 + 600 * 2), 0);
  assert.equal(fs.existsSync(path.join(directory, "tts-master-clips")), false);
  assert.ok(manager.getJob(job.id)?.masterGeneration?.status === "completed");
  const savedState = JSON.parse(
    fs.readFileSync(path.join(directory, "job.json"), "utf8"),
  );
  assert.deepEqual(
    savedState.masterEditSegments.map((segment: { text: string }) => segment.text),
    ["First exact", "Second exact"],
  );
  const splitAfterMerge = coordinator.split(job.id);
  assert.deepEqual(
    splitAfterMerge.clips.map((clip) => clip.text),
    ["First exact", "Second exact"],
  );
});

test("keeps the original master and clips when merge fails", async () => {
  const { manager, coordinator, job, masterPath } = await setupJob();
  const split = coordinator.split(job.id);
  const original = fs.readFileSync(masterPath);
  fs.writeFileSync(
    path.join(path.dirname(masterPath), "tts-master-clips", split.clips[0].fileName),
    "invalid",
  );

  assert.throws(() => coordinator.merge(job.id), /WAV hợp lệ/);
  assert.deepEqual(fs.readFileSync(masterPath), original);
  assert.equal(manager.getJob(job.id)?.masterEdit?.status, "failed");
  assert.equal(fs.existsSync(path.join(path.dirname(masterPath), "tts-master-clips")), true);
});
