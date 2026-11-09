import fs from "fs";
import os from "os";
import path from "path";

export type GpuExecutionMode = "auto" | "cpu" | "prefer-gpu";

export interface GpuExecutionSettings {
  mode: GpuExecutionMode;
}

const SETTINGS_DIRECTORY = path.join(
  process.env.LOCALAPPDATA || path.join(os.homedir(), ".local", "share"),
  "PiperTTSStudio",
);
const SETTINGS_FILE = path.join(SETTINGS_DIRECTORY, "gpu-execution.json");
const DEFAULT_SETTINGS: GpuExecutionSettings = { mode: "auto" };

function isGpuExecutionMode(value: unknown): value is GpuExecutionMode {
  return value === "auto" || value === "cpu" || value === "prefer-gpu";
}

export function getGpuExecutionSettings(): GpuExecutionSettings {
  if (!fs.existsSync(SETTINGS_FILE)) return { ...DEFAULT_SETTINGS };
  const parsed: unknown = JSON.parse(fs.readFileSync(SETTINGS_FILE, "utf8"));
  if (
    !parsed ||
    typeof parsed !== "object" ||
    !("mode" in parsed) ||
    !isGpuExecutionMode(parsed.mode)
  ) {
    throw new Error("Cấu hình GPU lưu trên máy không hợp lệ.");
  }
  return { mode: parsed.mode };
}

export function saveGpuExecutionSettings(input: unknown): GpuExecutionSettings {
  if (
    !input ||
    typeof input !== "object" ||
    !("mode" in input) ||
    !isGpuExecutionMode(input.mode)
  ) {
    throw new Error("Chế độ GPU phải là auto, cpu hoặc prefer-gpu.");
  }
  const settings = { mode: input.mode };
  fs.mkdirSync(SETTINGS_DIRECTORY, { recursive: true });
  const temporaryFile = `${SETTINGS_FILE}.${process.pid}.tmp`;
  fs.writeFileSync(temporaryFile, JSON.stringify(settings, null, 2), "utf8");
  fs.renameSync(temporaryFile, SETTINGS_FILE);
  return settings;
}

export function shouldUseGpu(): boolean {
  return getGpuExecutionSettings().mode !== "cpu";
}
