import assert from "node:assert/strict";
import { spawnSync } from "node:child_process";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { after, test } from "node:test";
import { normalizeVieNeuAudioForTimeline } from "../videoDubbingAudio";

const temporaryDirectories: string[] = [];

test("normalizes VieNeu Turbo WAV to mono 22.05 kHz PCM for the subtitle timeline", async () => {
  const directory = await fs.promises.mkdtemp(path.join(os.tmpdir(), "video-dubbing-audio-"));
  temporaryDirectories.push(directory);
  const inputPath = path.join(directory, "vieneu-source.wav");
  const outputPath = path.join(directory, "timeline.wav");
  const generated = spawnSync(
    "ffmpeg",
    [
      "-hide_banner",
      "-loglevel",
      "error",
      "-f",
      "lavfi",
      "-i",
      "sine=frequency=440:sample_rate=48000:duration=0.25",
      "-ac",
      "2",
      "-c:a",
      "pcm_s16le",
      "-y",
      inputPath,
    ],
    { windowsHide: true },
  );
  assert.equal(generated.status, 0, generated.stderr?.toString());

  normalizeVieNeuAudioForTimeline(inputPath, outputPath, "ffmpeg");
  const probe = spawnSync(
    "ffprobe",
    [
      "-v",
      "error",
      "-select_streams",
      "a:0",
      "-show_entries",
      "stream=codec_name,sample_rate,channels",
      "-of",
      "json",
      outputPath,
    ],
    { encoding: "utf8", windowsHide: true },
  );
  assert.equal(probe.status, 0, probe.stderr);
  const [audio] = JSON.parse(probe.stdout).streams;
  assert.equal(audio.codec_name, "pcm_s16le");
  assert.equal(audio.sample_rate, "22050");
  assert.equal(audio.channels, 1);
});

after(async () => {
  await Promise.all(
    temporaryDirectories.map((directory) =>
      fs.promises.rm(directory, { recursive: true, force: true }),
    ),
  );
});
