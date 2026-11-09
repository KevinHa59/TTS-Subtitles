import assert from "node:assert/strict";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { after, test } from "node:test";

const settingsRoot = fs.mkdtempSync(path.join(os.tmpdir(), "piper-gpu-settings-"));
const previousLocalAppData = process.env.LOCALAPPDATA;
process.env.LOCALAPPDATA = settingsRoot;
const { getGpuExecutionSettings, saveGpuExecutionSettings, shouldUseGpu } =
  await import("../gpuExecutionSettings");
if (previousLocalAppData === undefined) delete process.env.LOCALAPPDATA;
else process.env.LOCALAPPDATA = previousLocalAppData;

after(() => fs.rmSync(settingsRoot, { recursive: true, force: true }));

test("defaults to automatic GPU selection and persists a selected mode", () => {
  assert.deepEqual(getGpuExecutionSettings(), { mode: "auto" });
  assert.deepEqual(saveGpuExecutionSettings({ mode: "cpu" }), { mode: "cpu" });
  assert.deepEqual(getGpuExecutionSettings(), { mode: "cpu" });
  assert.equal(shouldUseGpu(), false);
  assert.deepEqual(saveGpuExecutionSettings({ mode: "prefer-gpu" }), { mode: "prefer-gpu" });
  assert.equal(shouldUseGpu(), true);
});

test("rejects unsupported GPU modes", () => {
  assert.throws(() => saveGpuExecutionSettings({ mode: "cuda-only" }), /Chế độ GPU/);
});
