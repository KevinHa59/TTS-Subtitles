// Force CLI phonemizer to prevent the buggy espeak_bridge NAPI addon
// from cutting off audio at the first comma or period.
// Must be set before loading pipertts so the native addon uses the CLI path.
process.env.PIPER_ESPEAK_BRIDGE = "0";

const { PiperNativeTTS } = await import("pipertts");

import express, { Request, Response } from "express";
import { createServer as createViteServer } from "vite";
import path from "path";
import { fileURLToPath } from "url";
import fs from "fs";
import os from "os";
import { Transform } from "stream";
import { pipeline } from "stream/promises";
import { exec, execSync, spawnSync } from "child_process";
import {
  AVAILABLE_MODELS,
  DEFAULT_MODEL,
  LOCAL_MODEL_FILES,
} from "./voice-catalog";
import {
  normalizeVietnameseDollars,
  normalizeVietnameseUnits,
} from "./src/utils/textNormalizer";
import {
  startBgmGeneration,
  getBgmGenerationJob,
  getBgmHistory,
  deleteBgmTrack,
} from "./bgmService";
import {
  getBgmSystemStatus,
  startModelDownload,
  cancelModelDownload,
  deleteModel as deleteBgmModel,
} from "./bgmModelManager";
import {
  startStoryVideoExport,
  videoExportJobs,
  VIDEO_RESOLUTIONS,
} from "./storyVideoExporter";
import {
  scanCustomModelsOnDisk,
  registerCustomVoice,
  deleteCustomVoice,
  loadCustomVoices,
} from "./customVoiceManager";
import {
  prepareOfflineDataset,
  DatasetPreparationProgress,
  listDatasets,
  getDataset,
  updateDatasetClip,
  updateDatasetMetadata,
  deleteDataset,
  createDatasetZip,
  getAvailableWhisperModels,
} from "./datasetManager";
import {
  getSystemToolsStatus,
  startCompileWhisperCpp,
  startDownloadWhisperModel,
  deleteWhisperModel,
  resetCurrentJob,
} from "./systemToolsManager";

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const app = express();
const PORT = Number(process.env.PORT) || 3000;
const isProd = process.env.NODE_ENV === "production";

interface DatasetPreparationJob {
  id: string;
  status: "processing" | "completed" | "failed";
  progressPercent: number;
  message: string;
  dataset?: Awaited<ReturnType<typeof prepareOfflineDataset>>;
  error?: string;
  updatedAt: number;
}

const datasetPreparationJobs = new Map<string, DatasetPreparationJob>();
const MAX_DATASET_UPLOAD_BYTES = 4 * 1024 * 1024 * 1024;

// PID file for Windows Stop-App.bat process tracking
const PID_FILE = path.resolve(__dirname, ".server.pid");
try {
  fs.writeFileSync(PID_FILE, process.pid.toString());
} catch {}

function cleanupPidFile() {
  try {
    if (fs.existsSync(PID_FILE)) fs.unlinkSync(PID_FILE);
  } catch {}
}

process.on("SIGINT", () => {
  cleanupPidFile();
  process.exit(0);
});
process.on("SIGTERM", () => {
  cleanupPidFile();
  process.exit(0);
});
process.on("exit", () => {
  cleanupPidFile();
});

// Windows & cross-platform FFmpeg / FFprobe path resolution
function resolveFfmpegPath(): string {
  if (process.env.FFMPEG_PATH && fs.existsSync(process.env.FFMPEG_PATH)) {
    return process.env.FFMPEG_PATH;
  }
  const winCandidates = [
    path.resolve(__dirname, "ffmpeg.exe"),
    path.resolve(__dirname, "bin", "ffmpeg.exe"),
    path.resolve(__dirname, "ffmpeg", "bin", "ffmpeg.exe"),
  ];
  for (const c of winCandidates) {
    if (fs.existsSync(c)) return c;
  }
  return "ffmpeg";
}

function resolveFfprobePath(): string {
  if (process.env.FFPROBE_PATH && fs.existsSync(process.env.FFPROBE_PATH)) {
    return process.env.FFPROBE_PATH;
  }
  const winCandidates = [
    path.resolve(__dirname, "ffprobe.exe"),
    path.resolve(__dirname, "bin", "ffprobe.exe"),
    path.resolve(__dirname, "ffmpeg", "bin", "ffprobe.exe"),
  ];
  for (const c of winCandidates) {
    if (fs.existsSync(c)) return c;
  }
  return "ffprobe";
}

function checkFfmpegAvailable(): boolean {
  try {
    const res = spawnSync(resolveFfmpegPath(), ["-version"], {
      stdio: "ignore",
    });
    return res.status === 0;
  } catch {
    return false;
  }
}

// Windows & cross-platform eSpeak NG resolution (vital for Vietnamese diacritics / tones)
function resolveEspeakPath(): string {
  if (process.env.ESPEAK_PATH && fs.existsSync(process.env.ESPEAK_PATH)) {
    return process.env.ESPEAK_PATH;
  }
  const programFiles = process.env.ProgramFiles || "C:\\Program Files";
  const programFilesX86 =
    process.env["ProgramFiles(x86)"] || "C:\\Program Files (x86)";
  const localAppData = process.env.LOCALAPPDATA || "";

  const winCandidates = [
    path.resolve(__dirname, "espeak-ng.exe"),
    path.resolve(__dirname, "bin", "espeak-ng.exe"),
    path.resolve(__dirname, "espeak-ng", "espeak-ng.exe"),
    path.resolve(__dirname, "espeak-ng", "bin", "espeak-ng.exe"),
    path.join(programFiles, "eSpeak NG", "espeak-ng.exe"),
    path.join(programFilesX86, "eSpeak NG", "espeak-ng.exe"),
    path.join(localAppData, "Programs", "eSpeak NG", "espeak-ng.exe"),
  ];
  for (const c of winCandidates) {
    if (fs.existsSync(c)) return c;
  }
  return "espeak-ng";
}

function setupEspeakEnvironment() {
  const espeakBin = resolveEspeakPath();
  if (espeakBin && espeakBin !== "espeak-ng" && fs.existsSync(espeakBin)) {
    const espeakDir = path.dirname(espeakBin);
    if (!process.env.PATH?.toLowerCase().includes(espeakDir.toLowerCase())) {
      process.env.PATH = `${espeakDir}${path.delimiter}${process.env.PATH || ""}`;
      console.log(
        `[PiperTTS] Đã thêm thư mục eSpeak NG vào PATH: ${espeakDir}`,
      );
    }
  }

  if (
    process.env.ESPEAK_DATA_PATH &&
    fs.existsSync(process.env.ESPEAK_DATA_PATH)
  ) {
    return;
  }
  const programFiles = process.env.ProgramFiles || "C:\\Program Files";
  const programFilesX86 =
    process.env["ProgramFiles(x86)"] || "C:\\Program Files (x86)";
  const localAppData = process.env.LOCALAPPDATA || "";

  const candidates = [
    path.join(programFiles, "eSpeak NG", "espeak-ng-data"),
    path.join(programFilesX86, "eSpeak NG", "espeak-ng-data"),
    path.join(localAppData, "Programs", "eSpeak NG", "espeak-ng-data"),
    path.resolve(__dirname, "espeak-ng-data"),
    path.resolve(__dirname, "espeak-ng", "espeak-ng-data"),
    "/usr/lib/x86_64-linux-gnu/espeak-ng-data",
    "/usr/share/espeak-ng-data",
    "/usr/local/share/espeak-ng-data",
  ];
  for (const c of candidates) {
    if (fs.existsSync(c)) {
      process.env.ESPEAK_DATA_PATH = c;
      console.log(`[PiperTTS] Cấu hình ESPEAK_DATA_PATH: ${c}`);
      break;
    }
  }
}
setupEspeakEnvironment();

function checkEspeakAvailable(): boolean {
  try {
    const res = spawnSync(resolveEspeakPath(), ["--version"], {
      stdio: "ignore",
    });
    return res.status === 0;
  } catch {
    return false;
  }
}

// Chained atempo filter for FFmpeg (atempo only accepts 0.5 to 2.0 per filter)
function buildAtempoFilter(speed: number): string {
  if (!speed || isNaN(speed) || speed <= 0) return "atempo=1.0";
  const filters: string[] = [];
  let remaining = speed;
  while (remaining > 2.0) {
    filters.push("atempo=2.0");
    remaining /= 2.0;
  }
  while (remaining < 0.5) {
    filters.push("atempo=0.5");
    remaining /= 0.5;
  }
  filters.push(`atempo=${Number(remaining.toFixed(3))}`);
  return filters.join(",");
}

app.use(express.json({ limit: "150mb" }));
app.use(express.urlencoded({ extended: true, limit: "150mb" }));

const MODELS_DIR = path.resolve(__dirname, "models");
if (!fs.existsSync(MODELS_DIR)) {
  fs.mkdirSync(MODELS_DIR, { recursive: true });
}

const JOBS_DIR = path.resolve(__dirname, "jobs_storage");
if (!fs.existsSync(JOBS_DIR)) {
  fs.mkdirSync(JOBS_DIR, { recursive: true });
}

const STORIES_DIR = path.resolve(__dirname, "stories_storage");
if (!fs.existsSync(STORIES_DIR)) {
  fs.mkdirSync(STORIES_DIR, { recursive: true });
}

// VieNeu-TTS v3 Turbo Model Directory (48 kHz Neural TTS)
const VIENEU_MODELS_DIR = path.resolve(MODELS_DIR, "vieneu");
if (!fs.existsSync(VIENEU_MODELS_DIR)) {
  fs.mkdirSync(VIENEU_MODELS_DIR, { recursive: true });
}

function checkVieNeuModelAvailable(): { available: boolean; fileName?: string } {
  if (!fs.existsSync(VIENEU_MODELS_DIR)) return { available: false };
  try {
    const files = fs.readdirSync(VIENEU_MODELS_DIR);
    const match = files.find(
      (f) =>
        (f.endsWith(".gguf") ||
          f.endsWith(".onnx") ||
          f.endsWith(".bin") ||
          f.endsWith(".safetensors")) &&
        fs.statSync(path.join(VIENEU_MODELS_DIR, f)).size > 1000,
    );
    if (match) return { available: true, fileName: match };
  } catch {}
  return { available: false };
}

async function synthesizeVieNeuVoice(
  voiceId: string,
  text: string,
  outputWavPath: string,
  speed = 1.0,
): Promise<{ success: boolean; duration: number }> {
  const cleanVoice = voiceId.replace(/^vieneu:/, "").trim();
  const catalogVoice = AVAILABLE_MODELS.find(
    (voice) => voice.id === voiceId || voice.modelId === voiceId,
  );
  const vieneuVoice = catalogVoice
    ? catalogVoice.name.replace(/\s+\(VieNeu Turbo\)$/, "")
    : cleanVoice;
  const scriptPath = path.resolve(__dirname, "scripts", "generate_vieneu.py");
  const vieneuVenvPython = path.resolve(
    __dirname,
    ".venv-vieneu",
    process.platform === "win32" ? "Scripts/python.exe" : "bin/python",
  );
  const python =
    process.env.VIENEU_PYTHON ||
    (fs.existsSync(vieneuVenvPython)
      ? vieneuVenvPython
      : process.env.PYTHON ||
        (process.platform === "win32" ? "python" : "python3"));

  return new Promise((resolve, reject) => {
    const proc = spawnSync(
      python,
      [
        scriptPath,
        "--text",
        text,
        "--voice",
        vieneuVoice,
        "--output",
        outputWavPath,
        "--speed",
        String(speed),
        "--model-dir",
        path.relative(__dirname, VIENEU_MODELS_DIR),
      ],
      {
        encoding: "utf-8",
        cwd: __dirname,
        env: {
          ...process.env,
          PYTHONUTF8: "1",
          PYTHONIOENCODING: "utf-8",
        },
      },
    );

    if (
      proc.status === 0 &&
      fs.existsSync(outputWavPath) &&
      fs.statSync(outputWavPath).size > 44
    ) {
      const dur = getAudioDuration(outputWavPath) || 0;
      return resolve({ success: true, duration: dur });
    }

    let errorDetail = "";
    if (proc.stderr) {
      try {
        const parsed = JSON.parse(proc.stderr.trim());
        if (parsed.error) errorDetail = parsed.error;
      } catch {
        errorDetail = proc.stderr.trim();
      }
    }

    if (!errorDetail && proc.stdout) {
      errorDetail = proc.stdout.trim();
    }

    const friendlyError =
      errorDetail ||
      `Chưa tìm thấy mô hình VieNeu-TTS v3 Turbo hoặc chưa cài đặt thư viện 'vieneu'. Vui lòng mở file HD-VIENEU-TTS.md để xem hướng dẫn tải và vị trí đặt file mô hình tại 'models/vieneu/'.`;

    reject(new Error(friendlyError));
  });
}

// In-memory cache for Piper Native TTS instances
const modelCache = new Map<string, any>();
const loadingPromises = new Map<string, Promise<any>>();
const modelCacheSources = new Map<string, string>();
const loadingModelSources = new Map<string, string>();

// Resolve 100% local ONNX model path from models/ directory without any internet dependency
function resolveLocalModelPath(modelId: string): string | null {
  if (!modelId) return null;
  if (modelId.startsWith("vieneu:")) {
    const vn = checkVieNeuModelAvailable();
    return vn.fileName ? path.join(VIENEU_MODELS_DIR, vn.fileName) : null;
  }
  const cleanId = modelId.replace(/^(local:|hub:)/, "").trim();
  const localKey = `local:${cleanId}`;

  // 1. Check mapping in LOCAL_MODEL_FILES
  const mapped = LOCAL_MODEL_FILES[localKey] || LOCAL_MODEL_FILES[modelId];
  if (mapped) {
    const candidates = Array.isArray(mapped) ? mapped : [mapped];
    for (const cand of candidates) {
      const p = path.join(MODELS_DIR, cand);
      if (fs.existsSync(p)) return p;
    }
  }

  // 2. Check direct .onnx file in MODELS_DIR
  const directPath = path.join(MODELS_DIR, `${cleanId}.onnx`);
  if (fs.existsSync(directPath)) return directPath;

  // 3. Scan MODELS_DIR for any .onnx file that matches cleanId or its variants
  try {
    const files = fs.readdirSync(MODELS_DIR);

    // Exact name match case-insensitive
    const exactMatch = files.find(
      (f) => f.toLowerCase() === `${cleanId.toLowerCase()}.onnx`,
    );
    if (exactMatch) return path.join(MODELS_DIR, exactMatch);

    // Starts with cleanId
    const prefixMatch = files.find(
      (f) =>
        f.toLowerCase().startsWith(cleanId.toLowerCase()) &&
        f.endsWith(".onnx"),
    );
    if (prefixMatch) return path.join(MODELS_DIR, prefixMatch);

    // Contains cleanId base keyword
    const baseName = cleanId.split("-")[0];
    if (baseName && baseName.length >= 3) {
      const baseMatch = files.find(
        (f) =>
          f.toLowerCase().includes(baseName.toLowerCase()) &&
          f.endsWith(".onnx"),
      );
      if (baseMatch) return path.join(MODELS_DIR, baseMatch);
    }
  } catch (err) {
    console.error("[PiperTTS] Error scanning MODELS_DIR:", err);
  }

  // 4. Default fallback: check if Hoài My default model is available
  const defaultCandidate = path.join(
    MODELS_DIR,
    "hoaimy-vietnamese-vi-medium-ljkjhi.onnx",
  );
  if (fs.existsSync(defaultCandidate)) {
    console.warn(
      `[PiperTTS] Không tìm thấy file .onnx riêng cho "${modelId}", tự động dùng mô hình Hoài My có sẵn để tiếp tục offline.`,
    );
    return defaultCandidate;
  }

  return null;
}

async function getOrLoadModel(modelId: string) {
  if (modelId.startsWith("vieneu:")) {
    return {
      isVieNeu: true,
      voiceId: modelId,
      getConfig: () => ({ espeakVoice: "vi" }),
      synthesize: async (text: string, options: any = {}) => {
        const tempWav = path.join(
          JOBS_DIR,
          `vn_${Date.now()}_${Math.random().toString(36).substring(2, 6)}.wav`,
        );
        const speed = options.lengthScale ? 1.0 / options.lengthScale : 1.0;
        await synthesizeVieNeuVoice(modelId, text, tempWav, speed);

        if (options.outputFormat === "mp3") {
          const tempMp3 = tempWav.replace(/\.wav$/, ".mp3");
          const ffmpegBin = resolveFfmpegPath();
          const proc = spawnSync(
            ffmpegBin,
            ["-y", "-i", tempWav, "-codec:a", "libmp3lame", "-b:a", "192k", tempMp3],
            { stdio: "ignore" },
          );
          if (proc.status === 0 && fs.existsSync(tempMp3)) {
            const mp3Buf = fs.readFileSync(tempMp3);
            try {
              fs.unlinkSync(tempWav);
              fs.unlinkSync(tempMp3);
            } catch {}
            return {
              audio: mp3Buf,
              sampleRate: 22050,
            };
          }
        }

        const audioBuf = fs.readFileSync(tempWav);
        try {
          fs.unlinkSync(tempWav);
        } catch {}
        return {
          audio: audioBuf,
          sampleRate: 22050,
        };
      },
    };
  }

  const cleanId = (modelId || "").replace(/^(local:|hub:)/, "").trim();
  const normalizedModelId = `local:${cleanId}`;
  const localOnnxPath = resolveLocalModelPath(modelId);
  if (!localOnnxPath || !fs.existsSync(localOnnxPath)) {
    throw new Error(
      `Không tìm thấy file mô hình (.onnx) cho "${modelId}" trong thư mục "${MODELS_DIR}". Vui lòng đảm bảo bạn đã lưu file .onnx vào thư mục models/ để sử dụng offline 100%.`,
    );
  }
  const modelStat = fs.statSync(localOnnxPath);
  const modelSource = `${path.resolve(localOnnxPath)}:${modelStat.size}:${modelStat.mtimeMs}`;

  if (modelCache.has(normalizedModelId)) {
    if (modelCacheSources.get(normalizedModelId) === modelSource) {
      return modelCache.get(normalizedModelId);
    }
    modelCache.delete(normalizedModelId);
    modelCache.delete(modelId);
  }
  if (modelCache.has(modelId)) {
    if (modelCacheSources.get(normalizedModelId) === modelSource) {
      return modelCache.get(modelId);
    }
    modelCache.delete(normalizedModelId);
    modelCache.delete(modelId);
  }

  if (
    loadingPromises.has(normalizedModelId) &&
    loadingModelSources.get(normalizedModelId) === modelSource
  ) {
    return await loadingPromises.get(normalizedModelId);
  }
  if (
    loadingPromises.has(modelId) &&
    loadingModelSources.get(normalizedModelId) === modelSource
  ) {
    return await loadingPromises.get(modelId);
  }

  const loadPromise = (async () => {
    console.log(
      `[PiperTTS] Loading local model "${normalizedModelId}" (input: ${modelId})...`,
    );
    const startTime = Date.now();
    const espeakBin = resolveEspeakPath();
    console.log(
      `[PiperTTS] Loading local ONNX file: "${localOnnxPath}" (100% offline, zero internet calls)`,
    );
    const tts = await PiperNativeTTS.load({
      modelPath: localOnnxPath,
      espeakBinary: espeakBin,
    });
    console.log(
      `[PiperTTS] Local model "${normalizedModelId}" loaded successfully in ${Date.now() - startTime}ms (espeakBinary: ${espeakBin}).`,
    );
    if (loadingModelSources.get(normalizedModelId) === modelSource) {
      modelCache.set(normalizedModelId, tts);
      modelCache.set(modelId, tts);
      modelCacheSources.set(normalizedModelId, modelSource);
    }
    return tts;
  })();

  loadingPromises.set(normalizedModelId, loadPromise);
  loadingPromises.set(modelId, loadPromise);
  loadingModelSources.set(normalizedModelId, modelSource);
  return await loadPromise;
}

// Preload the default Hoài My voice at server startup (100% Offline)
(async () => {
  try {
    console.log(
      "[PiperTTS] Preloading default model (100% offline):",
      DEFAULT_MODEL,
    );
    await getOrLoadModel(DEFAULT_MODEL);
    console.log(
      "[PiperTTS] Default model Hoài My is ready for instant offline synthesis!",
    );
  } catch (err) {
    console.error("[PiperTTS] Error preloading default model:", err);
  }
})();

interface TextNormalizationOptions {
  normalizeNumbers?: boolean;
  customReplacements?: { from: string; to: string }[];
}

function normalizeVietnameseText(
  input: string,
  options?: TextNormalizationOptions,
): string {
  if (!input) return "";

  // 1. Chuẩn hóa NFC: Biến đổi toàn bộ ký tự Unicode tổ hợp (NFD) thành Unicode dựng sẵn (NFC).
  // Điều này cực kỳ quan trọng để eSpeak-NG nhận dạng đúng nguyên âm tiếng Việt có dấu thanh điệu.
  let text = input.normalize("NFC");

  // 2. Loại bỏ ký tự BOM nếu file SRT được lưu dưới dạng UTF-8 with BOM
  if (text.charCodeAt(0) === 0xfeff) {
    text = text.slice(1);
  }

  // 3. Áp dụng quy tắc từ điển thay thế tùy chỉnh nếu có
  if (options?.customReplacements && Array.isArray(options.customReplacements)) {
    for (const rule of options.customReplacements) {
      if (rule.from && rule.from.trim()) {
        try {
          const escaped = rule.from.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
          text = text.replace(new RegExp(escaped, "gi"), rule.to || "");
        } catch {}
      }
    }
  }

  // 4. Chuẩn hóa số và tiền tệ tiếng Việt (Khắc phục triệt để lỗi "5.000" bị đọc thành "5 không không không")
  if (options?.normalizeNumbers !== false) {
    text = normalizeVietnameseDollars(text);

    // 4.1. Dấu chấm hàng nghìn: 5.000 -> 5000, 1.250.000 -> 1250000, 50.000 -> 50000
    // Khớp khi có đúng 3 chữ số sau dấu chấm và không phải là số thập phân
    text = text.replace(/\b(\d{1,3})(?:\.(\d{3}))+(?!\d)/g, (match) =>
      match.replace(/\./g, ""),
    );

    // 4.2. Dấu phẩy hàng nghìn: 5,000 -> 5000, 1,000,000 -> 1000000
    text = text.replace(/\b(\d{1,3})(?:,(\d{3}))+(?!\d)/g, (match) =>
      match.replace(/,/g, ""),
    );

    // 4.3. Tiền tệ tiếng Việt: 5000đ, 5.000 VNĐ, 50.000 đồng -> 50000 đồng
    text = text.replace(
      /(\d+)\s*(?:đ|vnđ|vnd|đồng)(?=$|[^\p{L}\p{N}])/gui,
      "$1 đồng",
    );

    text = normalizeVietnameseUnits(text);

    // 4.5. Phần trăm: 50% -> 50 phần trăm
    text = text.replace(/(\d+)\s*%/g, "$1 phần trăm");

    // 4.6. Viết tắt nghìn/triệu thông dụng: 50k -> 50 nghìn, 2tr -> 2 triệu
    text = text.replace(/\b(\d+)\s*k(?=$|[^\p{L}\p{N}])/gui, "$1 nghìn");
    text = text.replace(/\b(\d+)\s*tr(?=$|[^\p{L}\p{N}])/gui, "$1 triệu");

    // 4.7. Số thập phân: 3.5 -> 3 phẩy 5, 0.75 -> 0 phẩy 75
    text = text.replace(/\b(\d+)\.(\d{1,2})\b/g, "$1 phẩy $2");
    text = text.replace(/\b(\d+),(\d{1,2})\b/g, "$1 phẩy $2");

    // 4.8. Ngày tháng năm: 20/10/2026 -> ngày 20 tháng 10 năm 2026
    text = text.replace(
      /\b(\d{1,2})\/(\d{1,2})\/(\d{4})\b/g,
      "ngày $1 tháng $2 năm $3",
    );
  }

  // 5. Chuẩn hóa dấu câu và khoảng trắng
  return text
    .replace(/，/g, ", ")
    .replace(/。/g, ". ")
    .replace(/！/g, "! ")
    .replace(/？/g, "? ")
    .replace(/；/g, "; ")
    .replace(/：/g, ": ")
    .replace(/[“”]/g, '"')
    .replace(/[‘’]/g, "'")
    .replace(/[–—]/g, " - ")
    .replace(/([,;:?!])([^\s0-9])/g, "$1 $2")
    .replace(/\.{3,}/g, "...")
    .replace(/[ \t]+/g, " ")
    .trim();
}

function applyVietnameseRPronunciation(
  text: string,
  modelId: string,
  espeakVoice: string,
): string {
  const normalizedModelId = modelId.replace(/^(?:local:|hub:)/i, "");
  if (
    !/^hoaimy-vietnamese-vi-/i.test(normalizedModelId) ||
    !/^vi(?:[-_]|$)/i.test(espeakVoice)
  ) {
    return text;
  }

  return text.replace(
    /(^|[^\p{L}\p{N}\[])r(?=[\p{L}])/giu,
    "$1\uE000",
  );
}

function createWavHeader(
  dataLength: number,
  sampleRate = 22050,
  channels = 1,
  bitsPerSample = 16,
): Buffer {
  const byteRate = sampleRate * channels * (bitsPerSample / 8);
  const blockAlign = channels * (bitsPerSample / 8);
  const buffer = Buffer.alloc(44);

  buffer.write("RIFF", 0);
  buffer.writeUInt32LE(36 + dataLength, 4);
  buffer.write("WAVE", 8);
  buffer.write("fmt ", 12);
  buffer.writeUInt32LE(16, 16); // Subchunk1Size
  buffer.writeUInt16LE(1, 20); // AudioFormat (PCM)
  buffer.writeUInt16LE(channels, 22);
  buffer.writeUInt32LE(sampleRate, 24);
  buffer.writeUInt32LE(byteRate, 28);
  buffer.writeUInt16LE(blockAlign, 32);
  buffer.writeUInt16LE(bitsPerSample, 34);
  buffer.write("data", 36);
  buffer.writeUInt32LE(dataLength, 40);

  return buffer;
}

function getWavDuration(filePath: string): number {
  try {
    const buf = fs.readFileSync(filePath);
    if (buf.length >= 44 && buf.toString("ascii", 0, 4) === "RIFF") {
      const byteRate = buf.readUInt32LE(28);
      let pos = 12;
      while (pos + 8 <= buf.length) {
        const chunkId = buf.toString("ascii", pos, pos + 4);
        const chunkSize = buf.readUInt32LE(pos + 4);
        if (chunkId === "data") {
          if (byteRate > 0) {
            return chunkSize / byteRate;
          }
          break;
        }
        pos += 8 + chunkSize;
      }
    }
  } catch {}
  return 0;
}

function getAudioDuration(filePath: string): number {
  if (filePath.toLowerCase().endsWith(".wav")) {
    const wavDur = getWavDuration(filePath);
    if (wavDur > 0) return wavDur;
  }
  try {
    const ffprobeBin = resolveFfprobePath();
    const res = spawnSync(
      ffprobeBin,
      [
        "-v",
        "error",
        "-show_entries",
        "format=duration",
        "-of",
        "default=noprint_wrappers=1:nokey=1",
        filePath,
      ],
      { encoding: "utf8" },
    );
    if (res.status === 0 && res.stdout) {
      return parseFloat(res.stdout.trim()) || 0;
    }
  } catch (e) {
    console.error("Error getting duration for:", filePath, e);
  }
  return 0;
}

// Trims silence or specified milliseconds from beginning and end of audio
function trimAudioFile(
  inputPath: string,
  outputPath: string,
  trimStartMs: number,
  trimEndMs: number,
): { success: boolean; trimmedDuration: number } {
  const rawDur = getAudioDuration(inputPath);
  if (!rawDur || rawDur <= 0.05) {
    if (inputPath !== outputPath) {
      try { fs.copyFileSync(inputPath, outputPath); } catch {}
    }
    return { success: true, trimmedDuration: rawDur || 0 };
  }

  let startSec = Math.max(0, (trimStartMs || 0) / 1000);
  let endTrimSec = Math.max(0, (trimEndMs || 0) / 1000);

  if (startSec <= 0 && endTrimSec <= 0) {
    if (inputPath !== outputPath) {
      try { fs.copyFileSync(inputPath, outputPath); } catch {}
    }
    return { success: true, trimmedDuration: rawDur };
  }

  // Ensure we don't trim more than total duration (leave at least 50ms)
  const minKeep = 0.05;
  if (startSec + endTrimSec >= rawDur - minKeep) {
    const available = Math.max(0.01, rawDur - minKeep);
    const ratio = available / (startSec + endTrimSec);
    startSec = Number((startSec * ratio).toFixed(4));
    endTrimSec = Number((endTrimSec * ratio).toFixed(4));
  }

  const durationSec = Math.max(0.05, rawDur - startSec - endTrimSec);

  try {
    const ffmpegBin = resolveFfmpegPath();
    // atrim filter with asetpts resets timestamps cleanly
    const filterStr = `atrim=start=${startSec.toFixed(3)}:duration=${durationSec.toFixed(3)},asetpts=PTS-STARTPTS`;
    const res = spawnSync(ffmpegBin, [
      "-y",
      "-i",
      inputPath,
      "-filter:a",
      filterStr,
      outputPath,
    ]);
    if (res.status === 0 && fs.existsSync(outputPath) && fs.statSync(outputPath).size > 44) {
      const trimmedDur = getAudioDuration(outputPath);
      return { success: true, trimmedDuration: trimmedDur || durationSec };
    }
  } catch (err) {
    console.error("[Trim Error]", err);
  }

  // Fallback
  if (inputPath !== outputPath) {
    try { fs.copyFileSync(inputPath, outputPath); } catch {}
  }
  return { success: false, trimmedDuration: rawDur };
}

// -------------------------------------------------------------
// SUBTITLE TIMELINE JOB MANAGER WITH REAL-TIME SSE
// -------------------------------------------------------------

interface SubtitleItem {
  id: string;
  index: number;
  startTime: number;
  endTime: number;
  text: string;
  targetDuration: number;
  originalDuration?: number;
  finalDuration?: number;
  appliedSpeed?: number;
  status:
    | "pending"
    | "generating"
    | "adjusting"
    | "completed"
    | "failed"
    | "retrying";
  audioUrl?: string;
  error?: string;
  warning?: string;
  retryCount?: number;
}

interface LogEntry {
  id: string;
  timestamp: string;
  level: "INFO" | "SUCCESS" | "WARNING" | "ERROR";
  message: string;
}

interface ProcessingStage {
  id: number;
  name: string;
  status: "pending" | "running" | "completed" | "failed";
  detail?: string;
}

interface TimelineJobOptions {
  batchSize: number;
  maxSpeed: number;
  minSpeed: number;
  speedPriority: "balanced" | "strict" | "natural";
  padSilence: boolean;
  trimStartMs?: number;
  trimEndMs?: number;
  videoDuration?: number;
  outputFormat: "mp3" | "wav";
  normalizeNumbers?: boolean;
  customReplacements?: { from: string; to: string }[];
}

interface TimelineJob {
  id: string;
  model: string;
  speakerId?: number;
  items: SubtitleItem[];
  stages: ProcessingStage[];
  logs: LogEntry[];
  status: "idle" | "running" | "paused" | "cancelled" | "completed";
  overallProgress: {
    total: number;
    completed: number;
    running: number;
    queued: number;
    failed: number;
    percent: number;
    totalBatches: number;
    currentBatch: number;
    batchSize: number;
    speedItemsPerSec?: number;
    startTimeMs?: number;
    elapsedMs: number;
    estimatedRemainingMs?: number;
  };
  options: TimelineJobOptions;
  masterAudio?: {
    url: string;
    duration: number;
    format: "mp3" | "wav";
    sizeBytes: number;
  };
}

const jobs = new Map<string, TimelineJob>();
const sseClients = new Map<string, Set<Response>>();

// -------------------------------------------------------------
// STORYTELLING TYPES & STATE
// -------------------------------------------------------------
export interface StoryCharacter {
  id: string;
  name: string;
  voiceId: string;
  speakerId?: number;
  speed: number;
  color?: string;
}

export interface StoryParagraph {
  id: string;
  index: number;
  characterId: string;
  text: string;
  pauseBefore?: number;
  speed?: number;
  audioUrl?: string;
  duration?: number;
  status: "pending" | "generating" | "completed" | "failed";
  error?: string;
}

export interface StoryJob {
  id: string;
  title: string;
  rawContent?: string;
  paragraphs: StoryParagraph[];
  characters: StoryCharacter[];
  gapMs: number;
  outputFormat: "mp3" | "wav";
  status: "idle" | "running" | "completed" | "failed";
  progress: {
    total: number;
    completed: number;
    percent: number;
    currentParagraphIndex?: number;
  };
  masterAudio?: {
    url: string;
    downloadUrl: string;
    duration: number;
    format: "mp3" | "wav";
    sizeBytes: number;
  };
  logs: LogEntry[];
  error?: string;
  createdAt?: string;
  updatedAt?: string;
}

const storyJobs = new Map<string, StoryJob>();
const storySseClients = new Map<string, Set<Response>>();

function broadcastStoryEvent(jobId: string, eventName: string, data: any) {
  const clients = storySseClients.get(jobId);
  if (!clients || clients.size === 0) return;
  const payload = `event: ${eventName}\ndata: ${JSON.stringify(data)}\n\n`;
  for (const res of clients) {
    try {
      res.write(payload);
    } catch {
      clients.delete(res);
    }
  }
}

function addStoryLog(
  job: StoryJob,
  level: "INFO" | "SUCCESS" | "WARNING" | "ERROR",
  message: string,
) {
  const entry: LogEntry = {
    id: `slog_${Date.now()}_${Math.random().toString(36).substring(2, 6)}`,
    timestamp: new Date().toLocaleTimeString("vi-VN"),
    level,
    message,
  };
  job.logs.push(entry);
  broadcastStoryEvent(job.id, "log", entry);
}

function saveStoryToDisk(story: StoryJob) {
  try {
    if (!fs.existsSync(STORIES_DIR)) {
      fs.mkdirSync(STORIES_DIR, { recursive: true });
    }
    const filePath = path.join(STORIES_DIR, `${story.id}.json`);
    fs.writeFileSync(filePath, JSON.stringify(story, null, 2), "utf-8");
  } catch (err) {
    console.error(`[Story] Lỗi lưu truyện ${story.id}:`, err);
  }
}

const DEFAULT_SAMPLE_STORY: StoryJob = {
  id: "story_sample_rua_va_tho",
  title: "Rùa và Thỏ (Truyện Ngụ Ngôn)",
  rawContent: `Ngày xửa ngày xưa, trong một khu rừng xanh tươi, có một chú Thỏ vô cùng kiêu ngạo vì tài chạy nhanh của mình.

Đố ai trong khu rừng này chạy nhanh bằng ta! Bác Gấu, chú Sóc hay anh Rùa chậm chạp đều không phải là đối thủ!

Nghe thấy lời thách thức của Thỏ, chú Rùa chậm rãi ngẩng đầu lên và bình tĩnh đáp lại.

Anh Thỏ đừng vội tự phụ. Nếu anh đồng ý, tôi và anh hãy cùng nhau thi chạy một chặng đường xem ai về đích trước nhé!

Ha ha! Anh Rùa mà cũng đòi thi chạy với ta sao? Được lắm, ta sẽ cho anh thấy ai mới là quán quân của khu rừng này!

Thế là cuộc đua bắt đầu. Thỏ cậy mình chạy nhanh nên vừa đi vừa hái hoa bắt bướm rồi nằm ngủ dưới gốc cây. Trong khi đó, Rùa từng bước kiên trì không hề dừng lại và đã về đích trước sự ngỡ ngàng của tất cả muôn loài.`,
  characters: [
    {
      id: "char_narrator",
      name: "Người kể chuyện",
      voiceId: DEFAULT_MODEL,
      speed: 1.0,
      color: "amber",
    },
    {
      id: "char_tho",
      name: "Chú Thỏ Kiêu Ngạo",
      voiceId: "local:doanhdoanh-vietnamese-vi-congchualong",
      speed: 1.15,
      color: "blue",
    },
    {
      id: "char_rua",
      name: "Chú Rùa Chăm Chỉ",
      voiceId: "local:huyenngoc-vietnamese-vi-medium-ljkjhi",
      speed: 0.95,
      color: "emerald",
    },
  ],
  paragraphs: [
    {
      id: "p_1",
      index: 1,
      characterId: "char_narrator",
      text: "Ngày xửa ngày xưa, trong một khu rừng xanh tươi, có một chú Thỏ vô cùng kiêu ngạo vì tài chạy nhanh của mình.",
      status: "pending",
    },
    {
      id: "p_2",
      index: 2,
      characterId: "char_tho",
      text: "Đố ai trong khu rừng này chạy nhanh bằng ta! Bác Gấu, chú Sóc hay anh Rùa chậm chạp đều không phải là đối thủ!",
      status: "pending",
    },
    {
      id: "p_3",
      index: 3,
      characterId: "char_narrator",
      text: "Nghe thấy lời thách thức của Thỏ, chú Rùa chậm rãi ngẩng đầu lên và bình tĩnh đáp lại.",
      status: "pending",
    },
    {
      id: "p_4",
      index: 4,
      characterId: "char_rua",
      text: "Anh Thỏ đừng vội tự phụ. Nếu anh đồng ý, tôi và anh hãy cùng nhau thi chạy một chặng đường xem ai về đích trước nhé!",
      status: "pending",
    },
    {
      id: "p_5",
      index: 5,
      characterId: "char_tho",
      text: "Ha ha! Anh Rùa mà cũng đòi thi chạy với ta sao? Được lắm, ta sẽ cho anh thấy ai mới là quán quân của khu rừng này!",
      status: "pending",
    },
    {
      id: "p_6",
      index: 6,
      characterId: "char_narrator",
      text: "Thế là cuộc đua bắt đầu. Thỏ cậy mình chạy nhanh nên vừa đi vừa hái hoa bắt bướm rồi nằm ngủ dưới gốc cây. Trong khi đó, Rùa từng bước kiên trì không hề dừng lại và đã về đích trước sự ngỡ ngàng của tất cả muôn loài.",
      status: "pending",
    },
  ],
  gapMs: 300,
  outputFormat: "mp3",
  status: "idle",
  progress: {
    total: 6,
    completed: 0,
    percent: 0,
  },
  logs: [],
  createdAt: new Date().toISOString(),
  updatedAt: new Date().toISOString(),
};

function loadAllStoriesFromDisk() {
  try {
    if (!fs.existsSync(STORIES_DIR)) {
      fs.mkdirSync(STORIES_DIR, { recursive: true });
    }
    const files = fs.readdirSync(STORIES_DIR);
    for (const f of files) {
      if (f.endsWith(".json")) {
        const fullPath = path.join(STORIES_DIR, f);
        try {
          const content = fs.readFileSync(fullPath, "utf-8");
          const story: StoryJob = JSON.parse(content);
          if (story && story.id) {
            const storyDir = path.join(STORIES_DIR, story.id);
            const masterWav = path.join(storyDir, "master.wav");
            const masterMp3 = path.join(storyDir, "master.mp3");
            if (fs.existsSync(masterMp3)) {
              const stat = fs.statSync(masterMp3);
              story.masterAudio = {
                url: `/api/stories/${story.id}/master-audio?format=mp3`,
                downloadUrl: `/api/stories/${story.id}/master-audio?format=mp3&download=1`,
                duration: story.masterAudio?.duration || getAudioDuration(masterMp3) || 0,
                format: "mp3",
                sizeBytes: stat.size,
              };
            } else if (fs.existsSync(masterWav)) {
              const stat = fs.statSync(masterWav);
              story.masterAudio = {
                url: `/api/stories/${story.id}/master-audio?format=wav`,
                downloadUrl: `/api/stories/${story.id}/master-audio?format=wav&download=1`,
                duration: story.masterAudio?.duration || getAudioDuration(masterWav) || 0,
                format: "wav",
                sizeBytes: stat.size,
              };
            }
            if (story.status === "running") {
              story.status = "idle";
            }
            storyJobs.set(story.id, story);
          }
        } catch (e) {
          console.error(`[Story] Lỗi phân tích file truyện ${f}:`, e);
        }
      }
    }
    if (storyJobs.size === 0) {
      storyJobs.set(DEFAULT_SAMPLE_STORY.id, DEFAULT_SAMPLE_STORY);
      saveStoryToDisk(DEFAULT_SAMPLE_STORY);
    }
    console.log(`[Story] Đã nạp ${storyJobs.size} truyện từ thư mục lưu trữ stories_storage.`);
  } catch (err) {
    console.error("[Story] Lỗi nạp danh sách truyện:", err);
  }
}

// Synthesize a single paragraph with its character and speed configuration
async function synthesizeSingleStoryParagraph(
  story: StoryJob,
  para: StoryParagraph,
): Promise<void> {
  const storyDir = path.join(STORIES_DIR, story.id);
  const paraDir = path.join(storyDir, "paragraphs");
  if (!fs.existsSync(paraDir)) {
    fs.mkdirSync(paraDir, { recursive: true });
  }

  const char =
    story.characters.find((c) => c.id === para.characterId) ||
    story.characters[0] || {
      id: "default",
      name: "Người kể chuyện",
      voiceId: DEFAULT_MODEL,
      speed: 1.0,
    };

  const tts = await getOrLoadModel(char.voiceId);
  const cleaned = normalizeVietnameseText(para.text);
  const espeakVoice = tts.getConfig().espeakVoice || "vi";
  const synthesisText = applyVietnameseRPronunciation(
    cleaned,
    char.voiceId,
    espeakVoice,
  );

  const effectiveSpeed =
    para.speed !== undefined && !isNaN(Number(para.speed)) && Number(para.speed) > 0
      ? Number(para.speed)
      : Number(char.speed) || 1.0;
  const speed = Math.max(0.5, Math.min(2.0, effectiveSpeed));
  const lengthScale = 1.0 / speed;

  const synthRes = await tts.synthesize(synthesisText, {
    outputFormat: "wav",
    lengthScale,
    speakerId: char.speakerId,
  });

  const paraWavPath = path.join(paraDir, `para_${para.index}.wav`);
  fs.writeFileSync(paraWavPath, synthRes.audio as Buffer);

  const dur = getAudioDuration(paraWavPath) || 0;
  para.duration = Number(dur.toFixed(2));
  para.audioUrl = `/api/stories/${story.id}/paragraph-audio/${para.index}?t=${Date.now()}`;
  para.status = "completed";
  para.error = undefined;
}

// Fast merge of already-generated paragraph WAVs with custom pauses into master audio
async function mergeStoryParagraphsToMaster(story: StoryJob): Promise<boolean> {
  const storyDir = path.join(STORIES_DIR, story.id);
  const paraDir = path.join(storyDir, "paragraphs");
  if (!fs.existsSync(paraDir)) {
    fs.mkdirSync(paraDir, { recursive: true });
  }

  const sampleRate = 22050;
  const pcmChunks: Buffer[] = [];
  const defaultGapMs = Math.max(0, Math.min(30000, Number(story.gapMs) || 300));
  const defaultGapSec = defaultGapMs / 1000;

  for (let i = 0; i < story.paragraphs.length; i++) {
    const para = story.paragraphs[i];
    const hasCustomPause =
      para.pauseBefore !== undefined &&
      para.pauseBefore !== null &&
      (typeof para.pauseBefore === "number" ||
        (typeof para.pauseBefore === "string" && (para.pauseBefore as string).trim() !== "")) &&
      !isNaN(Number(para.pauseBefore));

    const pauseSec = hasCustomPause
      ? Math.max(0, Math.min(120, Number(para.pauseBefore)))
      : (i === 0 ? 0 : defaultGapSec);

    if (pauseSec > 0) {
      const pauseSamples = Math.floor(pauseSec * sampleRate);
      if (pauseSamples > 0) {
        const silenceBuffer = Buffer.alloc(pauseSamples * 2, 0);
        pcmChunks.push(silenceBuffer);
      }
    }

    const paraWavPath = path.join(paraDir, `para_${para.index}.wav`);
    // If wav doesn't exist yet, synthesize it!
    if (!fs.existsSync(paraWavPath)) {
      await synthesizeSingleStoryParagraph(story, para);
    }

    if (fs.existsSync(paraWavPath)) {
      const fileBuf = fs.readFileSync(paraWavPath);
      let pcmOffset = 44;
      const dataIdx = fileBuf.indexOf("data");
      if (dataIdx !== -1 && dataIdx + 8 <= fileBuf.length) {
        pcmOffset = dataIdx + 8;
      }
      const pcmData = fileBuf.subarray(pcmOffset);
      pcmChunks.push(pcmData);
    }
  }

  const masterPcm = Buffer.concat(pcmChunks);
  const wavHeader = createWavHeader(masterPcm.length, sampleRate, 1, 16);
  const fullMasterWav = Buffer.concat([wavHeader, masterPcm]);

  const tempMasterWav = path.join(storyDir, "master_temp.wav");
  const tempMasterMp3 = path.join(storyDir, "master_temp.mp3");
  fs.writeFileSync(tempMasterWav, fullMasterWav);

  const finalMasterWav = path.join(storyDir, "master.wav");
  const finalMasterMp3 = path.join(storyDir, "master.mp3");

  let mp3Created = false;
  const ffmpegBin = resolveFfmpegPath();
  try {
    const res = spawnSync(
      ffmpegBin,
      [
        "-y",
        "-i",
        tempMasterWav,
        "-codec:a",
        "libmp3lame",
        "-b:a",
        "192k",
        tempMasterMp3,
      ],
      { stdio: "ignore" },
    );
    mp3Created =
      res.status === 0 &&
      fs.existsSync(tempMasterMp3) &&
      fs.statSync(tempMasterMp3).size > 0;
  } catch (e) {
    console.warn("[FFmpeg] Không thể chuyển master truyện sang MP3:", e);
  }

  if (fs.existsSync(tempMasterWav)) {
    if (fs.existsSync(finalMasterWav))
      fs.rmSync(finalMasterWav, { force: true });
    fs.renameSync(tempMasterWav, finalMasterWav);
  }
  if (mp3Created && fs.existsSync(tempMasterMp3)) {
    if (fs.existsSync(finalMasterMp3))
      fs.rmSync(finalMasterMp3, { force: true });
    fs.renameSync(tempMasterMp3, finalMasterMp3);
  }

  const finalPath = mp3Created ? finalMasterMp3 : finalMasterWav;
  const stat = fs.statSync(finalPath);
  const totalDuration =
    getAudioDuration(finalPath) || masterPcm.length / (sampleRate * 2);

  const vTimestamp = Date.now();
  story.masterAudio = {
    url: `/api/stories/${story.id}/master-audio?format=${mp3Created ? "mp3" : "wav"}&v=${vTimestamp}`,
    downloadUrl: `/api/stories/${story.id}/master-audio?format=${mp3Created ? "mp3" : "wav"}&download=1&v=${vTimestamp}`,
    duration: Number(totalDuration.toFixed(2)),
    format: mp3Created ? "mp3" : "wav",
    sizeBytes: stat.size,
  };
  story.status = "completed";
  saveStoryToDisk(story);
  broadcastStoryEvent(story.id, "story_completed", story);
  return true;
}

async function runStoryProcessor(story: StoryJob) {
  if (story.status === "running") return;
  story.status = "running";
  story.error = undefined;
  story.progress = {
    total: story.paragraphs.length,
    completed: 0,
    percent: 0,
    currentParagraphIndex: 1,
  };
  broadcastStoryEvent(story.id, "story_state", story);
  addStoryLog(
    story,
    "INFO",
    `Bắt đầu tạo audio truyện: "${story.title}" (${story.paragraphs.length} đoạn)...`,
  );

  try {
    for (let i = 0; i < story.paragraphs.length; i++) {
      const para = story.paragraphs[i];
      story.progress.currentParagraphIndex = para.index;
      para.status = "generating";
      broadcastStoryEvent(story.id, "paragraph_start", {
        index: para.index,
        characterId: para.characterId,
      });

      const char =
        story.characters.find((c) => c.id === para.characterId) ||
        story.characters[0] || {
          id: "default",
          name: "Người kể chuyện",
          voiceId: DEFAULT_MODEL,
          speed: 1.0,
        };

      addStoryLog(
        story,
        "INFO",
        `Đoạn #${para.index} (${char.name} - ${char.voiceId.replace(/^local:/, "")}): "${para.text.slice(0, 35)}..."`,
      );

      await synthesizeSingleStoryParagraph(story, para);

      story.progress.completed = i + 1;
      story.progress.percent = Math.round(
        ((i + 1) / story.paragraphs.length) * 100,
      );

      broadcastStoryEvent(story.id, "paragraph_completed", {
        index: para.index,
        duration: para.duration,
        audioUrl: para.audioUrl,
      });
      broadcastStoryEvent(story.id, "story_progress", story.progress);
    }

    addStoryLog(
      story,
      "INFO",
      `Đang ghép nối toàn bộ ${story.paragraphs.length} đoạn thành master audio với khoảng nghỉ ${story.gapMs || 300}ms...`,
    );

    await mergeStoryParagraphsToMaster(story);

    addStoryLog(
      story,
      "SUCCESS",
      `Đã tạo xong master audio thành công! Thời lượng: ${story.masterAudio?.duration || 0}s (${story.masterAudio?.sizeBytes ? (story.masterAudio.sizeBytes / (1024 * 1024)).toFixed(2) : 0} MB).`,
    );
  } catch (err: any) {
    console.error(`[Story] Lỗi tạo audio truyện ${story.id}:`, err);
    story.status = "failed";
    story.error = err.message || "Lỗi không xác định khi tạo audio truyện.";
    addStoryLog(story, "ERROR", `Lỗi: ${story.error}`);
    try {
      const storyDir = path.join(STORIES_DIR, story.id);
      const tempWav = path.join(storyDir, "master_temp.wav");
      const tempMp3 = path.join(storyDir, "master_temp.mp3");
      if (fs.existsSync(tempWav)) fs.rmSync(tempWav, { force: true });
      if (fs.existsSync(tempMp3)) fs.rmSync(tempMp3, { force: true });
    } catch {}
    saveStoryToDisk(story);
    broadcastStoryEvent(story.id, "story_failed", { error: story.error });
  }
}


function broadcastJobEvent(jobId: string, eventName: string, data: any) {
  const clients = sseClients.get(jobId);
  if (!clients || clients.size === 0) return;
  const payload = `event: ${eventName}\ndata: ${JSON.stringify(data)}\n\n`;
  for (const res of clients) {
    try {
      res.write(payload);
    } catch {
      clients.delete(res);
    }
  }
}

function addJobLog(
  job: TimelineJob,
  level: "INFO" | "SUCCESS" | "WARNING" | "ERROR",
  message: string,
) {
  const now = new Date();
  const timestamp = now.toTimeString().split(" ")[0]; // e.g. "13:58:01"
  const entry: LogEntry = {
    id: `log_${Date.now()}_${Math.random().toString(36).substring(2, 6)}`,
    timestamp,
    level,
    message,
  };
  job.logs.push(entry);
  broadcastJobEvent(job.id, "log", entry);
}

function updateJobStage(
  job: TimelineJob,
  stageId: number,
  status: "pending" | "running" | "completed" | "failed",
  detail?: string,
) {
  const stage = job.stages.find((s) => s.id === stageId);
  if (stage) {
    stage.status = status;
    if (detail !== undefined) stage.detail = detail;
    broadcastJobEvent(job.id, "stage_change", stage);
  }
}

function updateOverallProgress(job: TimelineJob) {
  const total = job.items.length;
  const completed = job.items.filter((i) => i.status === "completed").length;
  const running = job.items.filter(
    (i) => i.status === "generating" || i.status === "adjusting",
  ).length;
  const failed = job.items.filter((i) => i.status === "failed").length;
  const queued = Math.max(0, total - completed - running - failed);

  const percent = total > 0 ? Math.round((completed / total) * 100) : 0;
  const elapsedMs = job.overallProgress.startTimeMs
    ? Date.now() - job.overallProgress.startTimeMs
    : 0;

  const batchSize = job.options.batchSize || 4;
  const totalBatches = Math.ceil(total / batchSize);

  let estimatedRemainingMs: number | undefined = undefined;
  let speedItemsPerSec: number | undefined = undefined;

  if (completed > 0 && elapsedMs > 500) {
    speedItemsPerSec = Number((completed / (elapsedMs / 1000)).toFixed(2));
    if (total > completed && speedItemsPerSec > 0) {
      estimatedRemainingMs = Math.round(
        ((total - completed) / speedItemsPerSec) * 1000,
      );
    }
  }

  job.overallProgress = {
    total,
    completed,
    running,
    queued,
    failed,
    percent,
    totalBatches,
    currentBatch:
      job.overallProgress.currentBatch ||
      (completed > 0
        ? Math.min(totalBatches, Math.floor(completed / batchSize) + 1)
        : 0),
    batchSize,
    speedItemsPerSec,
    startTimeMs: job.overallProgress.startTimeMs,
    elapsedMs,
    estimatedRemainingMs,
  };

  broadcastJobEvent(job.id, "overall_progress", job.overallProgress);
}

const DEFAULT_STAGES: ProcessingStage[] = [
  { id: 1, name: "Upload và phân tích file phụ đề", status: "completed" },
  {
    id: 2,
    name: "Khởi tạo PiperTTS và tải mô hình giọng đọc",
    status: "pending",
  },
  { id: 3, name: "Tạo audio TTS cho từng câu", status: "pending" },
  { id: 4, name: "Đo thời lượng audio thực tế", status: "pending" },
  { id: 5, name: "Tự động điều chỉnh tốc độ đọc (atempo)", status: "pending" },
  { id: 6, name: "Chuẩn hóa định dạng audio", status: "pending" },
  { id: 7, name: "Ghép audio theo timeline & khoảng lặng", status: "pending" },
  { id: 8, name: "Xuất file hoàn chỉnh cuối cùng", status: "pending" },
  { id: 9, name: "Hoàn tất và cho phép tải xuống", status: "pending" },
];

// Assembles all processed items into master WAV and MP3
async function assembleJobTimeline(
  job: TimelineJob,
): Promise<{ wavPath: string; mp3Path: string; duration: number }> {
  const jobDir = path.join(JOBS_DIR, job.id);
  if (!fs.existsSync(jobDir)) {
    fs.mkdirSync(jobDir, { recursive: true });
  }

  updateJobStage(
    job,
    7,
    "running",
    "Đang tính toán timeline và ghép nối PCM...",
  );
  addJobLog(
    job,
    "INFO",
    "Bắt đầu ghép nối timeline âm thanh (PCM sample-accurate assembly)",
  );

  const sampleRate = 22050;
  let maxEndTime = 0;

  for (const item of job.items) {
    const actualEnd =
      item.startTime + (item.finalDuration || item.targetDuration);
    if (actualEnd > maxEndTime) maxEndTime = actualEnd;
    if (item.endTime > maxEndTime) maxEndTime = item.endTime;
  }

  if (job.options.videoDuration && job.options.videoDuration > maxEndTime) {
    maxEndTime = job.options.videoDuration;
  }

  addJobLog(
    job,
    "INFO",
    `Tổng thời lượng timeline dự kiến: ${maxEndTime.toFixed(2)}s cho ${job.items.length} câu`,
  );

  const totalSamples = Math.ceil(maxEndTime * sampleRate);
  const masterPcm = Buffer.alloc(totalSamples * 2, 0); // 16-bit mono zeroes

  // Read each completed item and mix into master PCM
  for (const item of job.items) {
    if (item.status !== "completed") continue;
    const itemWavPath = path.join(jobDir, `item_${item.index}_adjusted.wav`);
    const fallbackWavPath = path.join(jobDir, `item_${item.index}_orig.wav`);
    const wavToUse = fs.existsSync(itemWavPath) ? itemWavPath : fallbackWavPath;

    if (!fs.existsSync(wavToUse)) continue;

    const fileBuf = fs.readFileSync(wavToUse);
    // Find data chunk in WAV (typically 44 bytes header)
    let pcmOffset = 44;
    const dataIdx = fileBuf.indexOf("data");
    if (dataIdx !== -1 && dataIdx + 8 <= fileBuf.length) {
      pcmOffset = dataIdx + 8;
    }

    const itemPcm = fileBuf.subarray(pcmOffset);
    const itemNumSamples = Math.floor(itemPcm.length / 2);
    const startSample = Math.floor(item.startTime * sampleRate);

    for (let s = 0; s < itemNumSamples; s++) {
      const destIndex = startSample + s;
      if (destIndex >= totalSamples) break;

      const currentVal = masterPcm.readInt16LE(destIndex * 2);
      const incomingVal = itemPcm.readInt16LE(s * 2);
      // Soft clamp mix
      const mixed = Math.max(-32768, Math.min(32767, currentVal + incomingVal));
      masterPcm.writeInt16LE(mixed, destIndex * 2);
    }
  }

  const masterWavPath = path.join(jobDir, "master.wav");
  const masterMp3Path = path.join(jobDir, "master.mp3");

  const wavHeader = createWavHeader(masterPcm.length, sampleRate);
  fs.writeFileSync(masterWavPath, Buffer.concat([wavHeader, masterPcm]));

  updateJobStage(job, 7, "completed");
  updateJobStage(
    job,
    8,
    "running",
    "Đang mã hóa chuẩn MP3 (128 kbps) bằng FFmpeg...",
  );
  addJobLog(job, "INFO", "Đang mã hóa file MP3 hoàn chỉnh với FFmpeg...");

  const ffmpegBin = resolveFfmpegPath();
  let mp3Created = false;
  try {
    const res = spawnSync(
      ffmpegBin,
      [
        "-y",
        "-i",
        masterWavPath,
        "-codec:a",
        "libmp3lame",
        "-b:a",
        "128k",
        masterMp3Path,
      ],
      { stdio: "ignore" },
    );
    mp3Created =
      res.status === 0 &&
      fs.existsSync(masterMp3Path) &&
      fs.statSync(masterMp3Path).size > 0;
  } catch (encErr) {
    console.warn(
      "[FFmpeg] Không thể chuyển đổi sang MP3, fallback dùng WAV:",
      encErr,
    );
  }

  const finalFilePath =
    job.options.outputFormat === "mp3" && mp3Created
      ? masterMp3Path
      : masterWavPath;
  const realDuration = getAudioDuration(finalFilePath) || maxEndTime;

  addJobLog(
    job,
    "INFO",
    "Đã giữ audio từng câu và WAV master để phát lại/kiểm tra. Nhấn “Dọn Dẹp & Làm Mới” để xóa dữ liệu dự án.",
  );

  updateJobStage(job, 8, "completed");
  updateJobStage(job, 9, "completed", "File hoàn chỉnh đã sẵn sàng tải xuống!");

  addJobLog(
    job,
    "SUCCESS",
    `File audio hoàn chỉnh đã được tạo thành công! Thời lượng: ${realDuration.toFixed(2)}s`,
  );

  return {
    wavPath: masterWavPath,
    mp3Path: mp3Created ? masterMp3Path : masterWavPath,
    duration: realDuration,
  };
}

// Background Processor for a Timeline Job
async function runJobProcessor(job: TimelineJob) {
  if (job.status !== "running") return;

  const jobDir = path.join(JOBS_DIR, job.id);
  if (!fs.existsSync(jobDir)) {
    fs.mkdirSync(jobDir, { recursive: true });
  }

  try {
    // Stage 2: Initialize model
    updateJobStage(job, 2, "running", `Đang kết nối mô hình ${job.model}...`);
    addJobLog(job, "INFO", `Khởi tạo mô hình PiperTTS: ${job.model}`);
    const tts = await getOrLoadModel(job.model);
    updateJobStage(job, 2, "completed", `Mô hình ${job.model} đã sẵn sàng`);
    addJobLog(job, "SUCCESS", `Mô hình PiperTTS (${job.model}) đã sẵn sàng.`);

    // Stage 3 & 4 & 5 & 6: Process items
    updateJobStage(job, 3, "running");
    updateJobStage(job, 4, "running");
    updateJobStage(job, 5, "running");
    updateJobStage(job, 6, "running");

    const batchSize = Math.max(
      1,
      Math.min(32, Number(job.options.batchSize) || 4),
    );
    const itemsToProcess = job.items.filter(
      (item) => item.status !== "completed",
    );
    const batches: SubtitleItem[][] = [];
    for (let i = 0; i < itemsToProcess.length; i += batchSize) {
      batches.push(itemsToProcess.slice(i, i + batchSize));
    }

    const totalBatches = Math.ceil(job.items.length / batchSize);
    job.overallProgress.totalBatches = totalBatches;
    job.overallProgress.batchSize = batchSize;

    addJobLog(job, "INFO", `Bắt đầu xử lý bulk TTS`);
    addJobLog(job, "INFO", `Batch Size: ${batchSize}`);
    addJobLog(
      job,
      "INFO",
      `Tổng số câu: ${job.items.length} (${totalBatches} batch)`,
    );
    addJobLog(
      job,
      "INFO",
      `Mức độ song song tối đa (Maximum Concurrent Tasks): ${batchSize}`,
    );

    for (let b = 0; b < batches.length; b++) {
      if ((job.status as string) === "paused") {
        addJobLog(job, "WARNING", "Tiến trình tạm dừng bởi người dùng.");
        break;
      }
      if ((job.status as string) === "cancelled") {
        addJobLog(job, "WARNING", "Tiến trình đã bị hủy.");
        break;
      }

      const currentBatch = batches[b];
      const batchNumber =
        Math.floor((currentBatch[0].index - 1) / batchSize) + 1;
      job.overallProgress.currentBatch = batchNumber;
      addJobLog(job, "INFO", `Batch ${batchNumber}/${totalBatches} started`);

      // Mark items as generating and broadcast
      for (const item of currentBatch) {
        item.status = "generating";
        broadcastJobEvent(job.id, "sentence_start", {
          index: item.index,
          text: item.text,
          batch: batchNumber,
        });
        addJobLog(job, "INFO", `Sentence ${item.index}: TTS started`);
      }
      updateOverallProgress(job);

      // Execute sentences concurrently in current batch
      await Promise.all(
        currentBatch.map(async (item) => {
          try {
            const cleanedText = normalizeVietnameseText(item.text, {
              normalizeNumbers: job.options.normalizeNumbers,
              customReplacements: job.options.customReplacements,
            });
            const synthesisText = applyVietnameseRPronunciation(
              cleanedText,
              job.model,
              tts.getConfig().espeakVoice,
            );
            const synthRes = await tts.synthesize(synthesisText, {
              outputFormat: "wav",
              speakerId: job.speakerId,
            });

            // 1. Lưu audio gốc TTS
            const rawWavPath = path.join(
              jobDir,
              `item_${item.index}_raw.wav`,
            );
            fs.writeFileSync(rawWavPath, synthRes.audio);

            // 2. Cắt khoảng trắng (Trim đầu & đuôi theo cấu hình)
            const origWavPath = path.join(
              jobDir,
              `item_${item.index}_orig.wav`,
            );
            const trimStartMs = Math.max(0, Number(job.options.trimStartMs) || 0);
            const trimEndMs = Math.max(0, Number(job.options.trimEndMs) || 0);
            const trimResult = trimAudioFile(
              rawWavPath,
              origWavPath,
              trimStartMs,
              trimEndMs,
            );

            // 3. Đo thời lượng thực tế sau trim và co giãn tốc độ (Adjust Speed)
            const origDur = trimResult.trimmedDuration || getAudioDuration(origWavPath);
            item.originalDuration = Number(origDur.toFixed(3));
            const targetDur = item.targetDuration;

            item.status = "adjusting";
            broadcastJobEvent(job.id, "sentence_progress", {
              index: item.index,
              status: "adjusting",
            });

            const adjustedWavPath = path.join(
              jobDir,
              `item_${item.index}_adjusted.wav`,
            );
            const maxSpeed = job.options.maxSpeed || 1.5;
            const minSpeed = job.options.minSpeed || 0.8;
            const speedFloor = Math.max(0.5, minSpeed);
            const neededSpeed =
              origDur > 0 && targetDur > 0 ? origDur / targetDur : 1.0;
            let appliedSpeed = Math.max(
              speedFloor,
              Math.min(maxSpeed, neededSpeed),
            );
            let warningText: string | undefined = undefined;

            if (job.options.speedPriority === "natural") {
              const naturalMaxSpeed = Math.max(speedFloor, 1.15);
              appliedSpeed = Math.min(naturalMaxSpeed, appliedSpeed);
              if (neededSpeed > naturalMaxSpeed) {
                warningText = `Cần tăng tốc ${neededSpeed.toFixed(2)}x để khớp timestamp, nhưng giới hạn ${naturalMaxSpeed.toFixed(2)}x để giữ giọng tự nhiên.`;
                addJobLog(
                  job,
                  "WARNING",
                  `Sentence ${item.index}: ${warningText}`,
                );
              }
            } else if (neededSpeed > maxSpeed) {
              warningText = `Câu quá dài so với timestamp (cần ${neededSpeed.toFixed(2)}x), đã giới hạn tốc độ tối đa ${maxSpeed.toFixed(2)}x để tránh méo tiếng.`;
              addJobLog(
                job,
                "WARNING",
                `Sentence ${item.index}: ${warningText}`,
              );
            }

            if (Math.abs(appliedSpeed - 1.0) >= 0.01) {
              try {
                const ffmpegBin = resolveFfmpegPath();
                const filterStr = buildAtempoFilter(appliedSpeed);
                const res = spawnSync(ffmpegBin, [
                  "-y",
                  "-i",
                  origWavPath,
                  "-filter:a",
                  filterStr,
                  adjustedWavPath,
                ]);
                if (res.error) throw res.error;
                if (res.status !== 0 || !fs.existsSync(adjustedWavPath)) {
                  throw new Error(
                    res.stderr?.toString().trim() ||
                      "FFmpeg không thể điều chỉnh tốc độ audio.",
                  );
                }
              } catch (err) {
                throw new Error(
                  `Không thể điều chỉnh tốc độ câu #${item.index} sang ${appliedSpeed.toFixed(2)}x: ${err instanceof Error ? err.message : String(err)}`,
                );
              }
            } else {
              fs.copyFileSync(origWavPath, adjustedWavPath);
            }

            const finalDur = getAudioDuration(adjustedWavPath);
            item.finalDuration = Number(finalDur.toFixed(3));
            item.appliedSpeed = appliedSpeed;
            item.warning = warningText;
            item.status = "completed";
            item.audioUrl = `/api/subtitles/job/${job.id}/item-audio/${item.index}`;

            const completedCount = job.items.filter(
              (it) => it.status === "completed",
            ).length;
            const totalCount = job.items.length;
            addJobLog(
              job,
              "SUCCESS",
              `Sentence ${item.index} completed (${completedCount}/${totalCount})`,
            );
            broadcastJobEvent(job.id, "sentence_complete", item);
          } catch (itemErr: any) {
            console.error(`Error on item ${item.index}:`, itemErr);
            item.status = "failed";
            item.error = itemErr?.message || "Lỗi khi tạo TTS";
            item.retryCount = (item.retryCount || 0) + 1;
            addJobLog(
              job,
              "ERROR",
              `Sentence ${item.index} (Batch ${batchNumber}) failed: ${item.error}`,
            );
            broadcastJobEvent(job.id, "sentence_error", item);
          } finally {
            updateOverallProgress(job);
          }
        }),
      );

      addJobLog(job, "INFO", `Batch ${batchNumber}/${totalBatches} completed`);
    }

    if (job.status === "running") {
      updateJobStage(job, 3, "completed");
      updateJobStage(job, 4, "completed");
      updateJobStage(job, 5, "completed");
      updateJobStage(job, 6, "completed");

      // Assemble master timeline
      const { mp3Path, duration } = await assembleJobTimeline(job);
      const stats = fs.statSync(mp3Path);

      job.masterAudio = {
        url: `/api/subtitles/job/${job.id}/master-audio`,
        duration,
        format: job.options.outputFormat || "mp3",
        sizeBytes: stats.size,
      };

      job.status = "completed";
      updateOverallProgress(job);
      broadcastJobEvent(job.id, "job_finished", {
        success: true,
        masterAudio: job.masterAudio,
      });
    }
  } catch (err: any) {
    console.error("Job processor fatal error:", err);
    job.status = "idle";
    addJobLog(job, "ERROR", `Lỗi xử lý dự án: ${err.message}`);
    broadcastJobEvent(job.id, "job_error", { error: err.message });
  }
}

// -------------------------------------------------------------
// SUBTITLE API ROUTES
// -------------------------------------------------------------

// Create a new timeline job
app.post("/api/subtitles/job/create", (req: Request, res: Response) => {
  const { items, options = {}, model = DEFAULT_MODEL, speakerId } = req.body;

  if (!items || !Array.isArray(items) || items.length === 0) {
    return res
      .status(400)
      .json({ error: "Danh sách phụ đề trống hoặc không hợp lệ." });
  }

  const jobId = `job_${Date.now()}_${Math.random().toString(36).substring(2, 7)}`;
  const batchSize = Math.max(1, Math.min(32, Number(options.batchSize) || 4));
  const maxSpeed = Math.max(1.1, Math.min(3, Number(options.maxSpeed) || 1.5));
  const minSpeed = Math.max(
    0.5,
    Math.min(maxSpeed, 1.5, Number(options.minSpeed) || 0.8),
  );
  const totalBatches = Math.ceil(items.length / batchSize);

  const job: TimelineJob = {
    id: jobId,
    model,
    speakerId,
    items: items.map((it: any, idx: number) => ({
      id: it.id || `sub_${idx + 1}`,
      index: it.index || idx + 1,
      startTime: Number(it.startTime) || 0,
      endTime: Number(it.endTime) || 0,
      text: String(it.text || ""),
      targetDuration: Number((it.endTime - it.startTime).toFixed(3)),
      status: "pending",
      warning: it.warning,
    })),
    stages: JSON.parse(JSON.stringify(DEFAULT_STAGES)),
    logs: [],
    status: "idle",
    overallProgress: {
      total: items.length,
      completed: 0,
      running: 0,
      queued: items.length,
      failed: 0,
      percent: 0,
      totalBatches,
      currentBatch: 0,
      batchSize,
      elapsedMs: 0,
    },
    options: {
      batchSize,
      maxSpeed,
      minSpeed,
      speedPriority: options.speedPriority || "balanced",
      padSilence: options.padSilence !== false,
      trimStartMs: Math.max(0, Math.min(2000, Number(options.trimStartMs) || 0)),
      trimEndMs: Math.max(0, Math.min(2000, Number(options.trimEndMs) || 0)),
      videoDuration: options.videoDuration
        ? Number(options.videoDuration)
        : undefined,
      outputFormat: options.outputFormat === "wav" ? "wav" : "mp3",
      normalizeNumbers: options.normalizeNumbers !== false,
      customReplacements: Array.isArray(options.customReplacements)
        ? options.customReplacements
        : [],
    },
  };

  jobs.set(jobId, job);
  addJobLog(
    job,
    "INFO",
    `Khởi tạo dự án phụ đề: ${job.items.length} câu (${totalBatches} batch, ${batchSize} câu/batch).`,
  );
  if (job.options.trimStartMs || job.options.trimEndMs) {
    addJobLog(
      job,
      "INFO",
      `Cắt khoảng trắng (Trim): Đầu câu ${job.options.trimStartMs || 0}ms, Cuối câu ${job.options.trimEndMs || 0}ms.`,
    );
  }

  res.json({ success: true, jobId, job });
});

// Get job state
app.get("/api/subtitles/job/:jobId", (req: Request, res: Response) => {
  const job = jobs.get(req.params.jobId);
  if (!job) return res.status(404).json({ error: "Không tìm thấy dự án." });
  res.json(job);
});

// Real-time SSE stream for a job
app.get("/api/subtitles/job/:jobId/events", (req: Request, res: Response) => {
  const jobId = req.params.jobId;
  const job = jobs.get(jobId);

  if (!job) {
    return res.status(404).send("Job not found");
  }

  res.setHeader("Content-Type", "text/event-stream");
  res.setHeader("Cache-Control", "no-cache");
  res.setHeader("Connection", "keep-alive");
  res.flushHeaders?.();

  if (!sseClients.has(jobId)) {
    sseClients.set(jobId, new Set());
  }
  sseClients.get(jobId)!.add(res);

  // Send current state immediately
  res.write(`event: job_state\ndata: ${JSON.stringify(job)}\n\n`);

  // Keep-alive ping
  const interval = setInterval(() => {
    res.write(": ping\n\n");
  }, 15000);

  req.on("close", () => {
    clearInterval(interval);
    sseClients.get(jobId)?.delete(res);
  });
});

// Start or resume job processing
app.post("/api/subtitles/job/:jobId/start", (req: Request, res: Response) => {
  const job = jobs.get(req.params.jobId);
  if (!job) return res.status(404).json({ error: "Không tìm thấy dự án." });

  if (job.status === "running") {
    return res.json({ message: "Dự án đang trong tiến trình chạy." });
  }

  job.status = "running";
  if (!job.overallProgress.startTimeMs) {
    job.overallProgress.startTimeMs = Date.now();
  }
  addJobLog(job, "INFO", "Bắt đầu xử lý TTS đồng bộ timeline...");

  // Run in background without blocking HTTP response
  runJobProcessor(job);

  res.json({ success: true, status: job.status });
});

// Pause job
app.post("/api/subtitles/job/:jobId/pause", (req: Request, res: Response) => {
  const job = jobs.get(req.params.jobId);
  if (!job) return res.status(404).json({ error: "Không tìm thấy dự án." });

  job.status = "paused";
  addJobLog(job, "WARNING", "Yêu cầu tạm dừng xử lý đã được ghi nhận.");
  broadcastJobEvent(job.id, "job_status", { status: "paused" });

  res.json({ success: true, status: "paused" });
});

// Cancel job
app.post("/api/subtitles/job/:jobId/cancel", (req: Request, res: Response) => {
  const job = jobs.get(req.params.jobId);
  if (!job) return res.status(404).json({ error: "Không tìm thấy dự án." });

  job.status = "cancelled";
  addJobLog(job, "WARNING", "Dự án đã bị hủy bỏ bởi người dùng.");
  broadcastJobEvent(job.id, "job_status", { status: "cancelled" });

  res.json({ success: true, status: "cancelled" });
});

// Retry failed sentences
app.post(
  "/api/subtitles/job/:jobId/retry-failed",
  (req: Request, res: Response) => {
    const job = jobs.get(req.params.jobId);
    if (!job) return res.status(404).json({ error: "Không tìm thấy dự án." });

    let retryCount = 0;
    for (const item of job.items) {
      if (item.status === "failed") {
        item.status = "pending";
        item.error = undefined;
        retryCount++;
      }
    }

    if (retryCount === 0) {
      return res.json({ message: "Không có câu nào bị lỗi để thử lại." });
    }

    addJobLog(job, "INFO", `Chuẩn bị thử lại ${retryCount} câu bị lỗi.`);
    job.status = "running";
    runJobProcessor(job);

    res.json({ success: true, retriedCount: retryCount });
  },
);

// Regenerate single sentence
app.post(
  "/api/subtitles/job/:jobId/single/:index",
  async (req: Request, res: Response) => {
    const job = jobs.get(req.params.jobId);
    if (!job) return res.status(404).json({ error: "Không tìm thấy dự án." });

    const itemIndex = parseInt(req.params.index);
    const item = job.items.find((i) => i.index === itemIndex);
    if (!item)
      return res.status(404).json({ error: "Không tìm thấy câu phụ đề." });

    const jobDir = path.join(JOBS_DIR, job.id);
    if (!fs.existsSync(jobDir)) fs.mkdirSync(jobDir, { recursive: true });

    addJobLog(
      job,
      "INFO",
      `Tạo lại riêng câu #${item.index}: "${item.text.slice(0, 30)}..."`,
    );
    item.status = "generating";
    broadcastJobEvent(job.id, "sentence_start", {
      index: item.index,
      text: item.text,
    });

    try {
      const tts = await getOrLoadModel(job.model);
      const cleanedText = normalizeVietnameseText(item.text, {
        normalizeNumbers: job.options.normalizeNumbers,
        customReplacements: job.options.customReplacements,
      });
      const synthesisText = applyVietnameseRPronunciation(
        cleanedText,
        job.model,
        tts.getConfig().espeakVoice,
      );
      const synthRes = await tts.synthesize(synthesisText, {
        outputFormat: "wav",
        speakerId: job.speakerId,
      });
      // 1. Lưu audio gốc TTS
      const rawWavPath = path.join(jobDir, `item_${item.index}_raw.wav`);
      fs.writeFileSync(rawWavPath, synthRes.audio);

      // 2. Cắt khoảng trắng (Trim)
      const origWavPath = path.join(jobDir, `item_${item.index}_orig.wav`);
      const trimStartMs = Math.max(0, Number(job.options.trimStartMs) || 0);
      const trimEndMs = Math.max(0, Number(job.options.trimEndMs) || 0);
      const trimResult = trimAudioFile(
        rawWavPath,
        origWavPath,
        trimStartMs,
        trimEndMs,
      );

      // 3. Đo thời lượng thực tế sau trim và co giãn tốc độ
      const origDur = trimResult.trimmedDuration || getAudioDuration(origWavPath);
      item.originalDuration = Number(origDur.toFixed(3));
      const targetDur = item.targetDuration;

      const adjustedWavPath = path.join(
        jobDir,
        `item_${item.index}_adjusted.wav`,
      );
      const maxSpeed = job.options.maxSpeed || 1.5;
      const minSpeed = job.options.minSpeed || 0.8;
      const speedFloor = Math.max(0.5, minSpeed);
      const neededSpeed =
        origDur > 0 && targetDur > 0 ? origDur / targetDur : 1.0;
      const appliedSpeed = Math.max(
        speedFloor,
        Math.min(maxSpeed, neededSpeed),
      );

      if (Math.abs(appliedSpeed - 1.0) >= 0.01) {
        try {
          const ffmpegBin = resolveFfmpegPath();
          const filterStr = buildAtempoFilter(appliedSpeed);
          const res = spawnSync(ffmpegBin, [
            "-y",
            "-i",
            origWavPath,
            "-filter:a",
            filterStr,
            adjustedWavPath,
          ]);
          if (res.error) throw res.error;
          if (res.status !== 0 || !fs.existsSync(adjustedWavPath)) {
            throw new Error(
              res.stderr?.toString().trim() ||
                "FFmpeg không thể điều chỉnh tốc độ audio.",
            );
          }
        } catch (err) {
          throw new Error(
            `Không thể điều chỉnh tốc độ câu #${item.index} sang ${appliedSpeed.toFixed(2)}x: ${err instanceof Error ? err.message : String(err)}`,
          );
        }
      } else {
        fs.copyFileSync(origWavPath, adjustedWavPath);
      }

      item.finalDuration = Number(getAudioDuration(adjustedWavPath).toFixed(3));
      item.appliedSpeed = appliedSpeed;
      item.status = "completed";
      item.audioUrl = `/api/subtitles/job/${job.id}/item-audio/${item.index}?t=${Date.now()}`;

      addJobLog(
        job,
        "SUCCESS",
        `Tạo lại thành công câu #${item.index} (Thời lượng: ${item.finalDuration}s)`,
      );
      broadcastJobEvent(job.id, "sentence_complete", item);
      updateOverallProgress(job);

      res.json({ success: true, item });
    } catch (err: any) {
      item.status = "failed";
      item.error = err.message;
      addJobLog(
        job,
        "ERROR",
        `Lỗi khi tạo lại câu #${item.index}: ${err.message}`,
      );
      broadcastJobEvent(job.id, "sentence_error", item);
      res.status(500).json({ error: err.message });
    }
  },
);

// Force assemble master audio
app.post(
  "/api/subtitles/job/:jobId/assemble",
  async (req: Request, res: Response) => {
    const job = jobs.get(req.params.jobId);
    if (!job) return res.status(404).json({ error: "Không tìm thấy dự án." });

    try {
      const { mp3Path, duration } = await assembleJobTimeline(job);
      const stats = fs.statSync(mp3Path);
      job.masterAudio = {
        url: `/api/subtitles/job/${job.id}/master-audio?t=${Date.now()}`,
        duration,
        format: job.options.outputFormat || "mp3",
        sizeBytes: stats.size,
      };
      broadcastJobEvent(job.id, "job_finished", {
        success: true,
        masterAudio: job.masterAudio,
      });
      res.json({ success: true, masterAudio: job.masterAudio });
    } catch (e: any) {
      res.status(500).json({ error: e.message });
    }
  },
);

// Helper: Stream audio file with full HTTP Range (206 Partial Content) support for browser timeline seeking
function streamAudioWithRange(
  req: Request,
  res: Response,
  filePath: string,
  mimeType: string,
  downloadFilename?: string,
) {
  if (!fs.existsSync(filePath)) {
    return res.status(404).send("Audio file not found");
  }

  const stat = fs.statSync(filePath);
  const fileSize = stat.size;

  if (downloadFilename) {
    res.setHeader(
      "Content-Disposition",
      `attachment; filename="${downloadFilename}"`,
    );
    res.setHeader("Content-Type", mimeType);
    res.setHeader("Content-Length", fileSize);
    return fs.createReadStream(filePath).pipe(res);
  }

  const range = req.headers.range;
  if (range) {
    // Format: "bytes=start-end" or "bytes=start-"
    const parts = range.replace(/bytes=/, "").split("-");
    const start = parseInt(parts[0], 10);
    const end = parts[1] ? parseInt(parts[1], 10) : fileSize - 1;

    if (isNaN(start) || start >= fileSize || (parts[1] && end < start)) {
      res.setHeader("Content-Range", `bytes */${fileSize}`);
      return res.status(416).send("Requested Range Not Satisfiable");
    }

    const chunkSize = end - start + 1;
    const fileStream = fs.createReadStream(filePath, { start, end });

    res.writeHead(206, {
      "Content-Range": `bytes ${start}-${end}/${fileSize}`,
      "Accept-Ranges": "bytes",
      "Content-Length": chunkSize,
      "Content-Type": mimeType,
      "Cache-Control": "no-cache",
    });

    return fileStream.pipe(res);
  } else {
    res.writeHead(200, {
      "Content-Length": fileSize,
      "Accept-Ranges": "bytes",
      "Content-Type": mimeType,
      "Cache-Control": "no-cache",
    });
    return fs.createReadStream(filePath).pipe(res);
  }
}

// Stream or download master audio with full timeline scrubbing/seeking support
app.get(
  "/api/subtitles/job/:jobId/master-audio",
  (req: Request, res: Response) => {
    const jobDir = path.join(JOBS_DIR, req.params.jobId);
    const format = req.query.format === "wav" ? "wav" : "mp3";
    const filePath =
      format === "wav"
        ? path.join(jobDir, "master.wav")
        : path.join(jobDir, "master.mp3");

    if (!fs.existsSync(filePath)) {
      return res.status(404).send("Master audio not yet generated");
    }

    const isDownload = req.query.download === "1";
    const mimeType = format === "wav" ? "audio/wav" : "audio/mpeg";
    const downloadName = isDownload
      ? `hoaimy-timeline-master.${format}`
      : undefined;

    streamAudioWithRange(req, res, filePath, mimeType, downloadName);
  },
);

// Stream single item audio with range support
app.get(
  "/api/subtitles/job/:jobId/item-audio/:index",
  (req: Request, res: Response) => {
    const jobDir = path.join(JOBS_DIR, req.params.jobId);
    const adjustedPath = path.join(
      jobDir,
      `item_${req.params.index}_adjusted.wav`,
    );
    const origPath = path.join(jobDir, `item_${req.params.index}_orig.wav`);

    const fileToServe = fs.existsSync(adjustedPath) ? adjustedPath : origPath;
    if (!fs.existsSync(fileToServe)) {
      return res.status(404).send("Audio not found");
    }

    streamAudioWithRange(req, res, fileToServe, "audio/wav");
  },
);

// Download full execution logs as text file
app.get(
  "/api/subtitles/job/:jobId/logs/download",
  (req: Request, res: Response) => {
    const job = jobs.get(req.params.jobId);
    if (!job) return res.status(404).send("Job not found");

    const logLines = [
      `============================================================`,
      `PIPER TTS STUDIO - NHẬT KÝ ĐỒNG BỘ TIMELINE PHỤ ĐỀ`,
      `Dự án ID: ${job.id}`,
      `Mô hình: ${job.model}`,
      `Tổng số câu: ${job.items.length}`,
      `Ngày xuất log: ${new Date().toLocaleString("vi-VN")}`,
      `============================================================\n`,
      ...job.logs.map((l) => `[${l.timestamp}] [${l.level}] ${l.message}`),
    ].join("\n");

    res.setHeader("Content-Type", "text/plain; charset=utf-8");
    res.setHeader(
      "Content-Disposition",
      `attachment; filename="pipertts-logs-${job.id}.txt"`,
    );
    res.send(logLines);
  },
);

// Explicit cleanup endpoint for a specific job (Requirement 2)
app.post("/api/subtitles/job/:jobId/cleanup", (req: Request, res: Response) => {
  const jobId = req.params.jobId;
  const jobDir = path.join(JOBS_DIR, jobId);
  try {
    if (fs.existsSync(jobDir)) {
      fs.rmSync(jobDir, { recursive: true, force: true });
    }
    jobs.delete(jobId);
    sseClients.delete(jobId);
    res.json({
      success: true,
      message: "Đã xóa toàn bộ file tạm và giải phóng bộ nhớ.",
    });
  } catch (err: any) {
    res.status(500).json({ error: err.message });
  }
});

// Explicit cleanup endpoint to reset all temporary jobs
app.post("/api/subtitles/cleanup-all", (req: Request, res: Response) => {
  try {
    if (fs.existsSync(JOBS_DIR)) {
      const files = fs.readdirSync(JOBS_DIR);
      for (const f of files) {
        fs.rmSync(path.join(JOBS_DIR, f), { recursive: true, force: true });
      }
    }
    jobs.clear();
    sseClients.clear();
    res.json({
      success: true,
      message: "Đã dọn dẹp sạch toàn bộ file tạm trong hệ thống.",
    });
  } catch (err: any) {
    res.status(500).json({ error: err.message });
  }
});

// -------------------------------------------------------------
// AUDIO CLEANUP ENDPOINTS (Requirement: Dọn Dẹp Audio)
// -------------------------------------------------------------

// Calculate temporary audio status
app.get("/api/audio/status", (req: Request, res: Response) => {
  try {
    let subtitleFiles = 0;
    let subtitleBytes = 0;
    if (fs.existsSync(JOBS_DIR)) {
      const subEntries = fs.readdirSync(JOBS_DIR, { withFileTypes: true });
      for (const entry of subEntries) {
        const full = path.join(JOBS_DIR, entry.name);
        if (entry.isDirectory()) {
          const innerFiles = fs.readdirSync(full);
          for (const inf of innerFiles) {
            if (/\.(wav|mp3)$/i.test(inf)) {
              subtitleFiles++;
              subtitleBytes += fs.statSync(path.join(full, inf)).size;
            }
          }
        } else if (/\.(wav|mp3)$/i.test(entry.name)) {
          subtitleFiles++;
          subtitleBytes += fs.statSync(full).size;
        }
      }
    }

    let storyParagraphFiles = 0;
    let storyParagraphBytes = 0;
    let storyMasterFiles = 0;
    let storyMasterBytes = 0;

    if (fs.existsSync(STORIES_DIR)) {
      const entries = fs.readdirSync(STORIES_DIR, { withFileTypes: true });
      for (const entry of entries) {
        if (entry.isDirectory()) {
          const sDir = path.join(STORIES_DIR, entry.name);
          const paraDir = path.join(sDir, "paragraphs");
          if (fs.existsSync(paraDir)) {
            const pFiles = fs.readdirSync(paraDir);
            for (const pf of pFiles) {
              if (/\.(wav|mp3)$/i.test(pf)) {
                storyParagraphFiles++;
                storyParagraphBytes += fs.statSync(path.join(paraDir, pf)).size;
              }
            }
          }
          const masterWav = path.join(sDir, "master.wav");
          const masterMp3 = path.join(sDir, "master.mp3");
          if (fs.existsSync(masterWav)) {
            storyMasterFiles++;
            storyMasterBytes += fs.statSync(masterWav).size;
          }
          if (fs.existsSync(masterMp3)) {
            storyMasterFiles++;
            storyMasterBytes += fs.statSync(masterMp3).size;
          }
        }
      }
    }

    const totalFiles = subtitleFiles + storyParagraphFiles;
    const totalBytes = subtitleBytes + storyParagraphBytes;

    res.json({
      subtitles: {
        files: subtitleFiles,
        bytes: subtitleBytes,
        mb: Number((subtitleBytes / (1024 * 1024)).toFixed(2)),
      },
      storyParagraphs: {
        files: storyParagraphFiles,
        bytes: storyParagraphBytes,
        mb: Number((storyParagraphBytes / (1024 * 1024)).toFixed(2)),
      },
      storyMasters: {
        files: storyMasterFiles,
        bytes: storyMasterBytes,
        mb: Number((storyMasterBytes / (1024 * 1024)).toFixed(2)),
      },
      total: {
        files: totalFiles,
        bytes: totalBytes,
        mb: Number((totalBytes / (1024 * 1024)).toFixed(2)),
      },
    });
  } catch (err: any) {
    res.status(500).json({ error: err.message });
  }
});

// Explicit cleanup endpoint
app.post("/api/audio/cleanup", (req: Request, res: Response) => {
  try {
    const {
      cleanSubtitles = true,
      cleanStoryParagraphs = true,
      cleanStoryMasters = false,
    } = req.body || {};

    let deletedFiles = 0;
    let freedBytes = 0;

    // 1. Clean subtitle intermediate files from JOBS_DIR
    if (cleanSubtitles && fs.existsSync(JOBS_DIR)) {
      const jobDirs = fs.readdirSync(JOBS_DIR, { withFileTypes: true });
      for (const entry of jobDirs) {
        const full = path.join(JOBS_DIR, entry.name);
        if (entry.isDirectory()) {
          const files = fs.readdirSync(full);
          for (const f of files) {
            if (/\.(wav|mp3|txt)$/i.test(f)) {
              const fPath = path.join(full, f);
              try {
                freedBytes += fs.statSync(fPath).size;
                fs.rmSync(fPath, { force: true });
                deletedFiles++;
              } catch {}
            }
          }
          try {
            if (fs.readdirSync(full).length === 0) {
              fs.rmdirSync(full);
            }
          } catch {}
        }
      }
      for (const job of jobs.values()) {
        for (const item of job.items) {
          item.audioUrl = undefined;
          if (item.status === "completed") item.status = "pending";
        }
        job.masterAudio = undefined;
      }
    }

    // 2. Clean story intermediate paragraph audio files from STORIES_DIR
    if (cleanStoryParagraphs && fs.existsSync(STORIES_DIR)) {
      const storyEntries = fs.readdirSync(STORIES_DIR, { withFileTypes: true });
      for (const entry of storyEntries) {
        if (entry.isDirectory()) {
          const paraDir = path.join(STORIES_DIR, entry.name, "paragraphs");
          if (fs.existsSync(paraDir)) {
            const pFiles = fs.readdirSync(paraDir);
            for (const pf of pFiles) {
              if (/\.(wav|mp3)$/i.test(pf)) {
                const pfPath = path.join(paraDir, pf);
                try {
                  freedBytes += fs.statSync(pfPath).size;
                  fs.rmSync(pfPath, { force: true });
                  deletedFiles++;
                } catch {}
              }
            }
          }

          if (cleanStoryMasters) {
            const masterWav = path.join(STORIES_DIR, entry.name, "master.wav");
            const masterMp3 = path.join(STORIES_DIR, entry.name, "master.mp3");
            if (fs.existsSync(masterWav)) {
              try {
                freedBytes += fs.statSync(masterWav).size;
                fs.rmSync(masterWav, { force: true });
                deletedFiles++;
              } catch {}
            }
            if (fs.existsSync(masterMp3)) {
              try {
                freedBytes += fs.statSync(masterMp3).size;
                fs.rmSync(masterMp3, { force: true });
                deletedFiles++;
              } catch {}
            }
          }
        }
      }

      for (const story of storyJobs.values()) {
        for (const p of story.paragraphs) {
          p.audioUrl = undefined;
          if (p.status === "completed") p.status = "pending";
        }
        if (cleanStoryMasters) {
          story.masterAudio = undefined;
        }
        saveStoryToDisk(story);
      }
    }

    const freedMB = (freedBytes / (1024 * 1024)).toFixed(2);
    res.json({
      success: true,
      deletedFiles,
      freedBytes,
      freedMB: Number(freedMB),
      message: `Đã dọn dẹp thành công ${deletedFiles} file audio tạm (${freedMB} MB).`,
    });
  } catch (err: any) {
    res.status(500).json({ error: err.message });
  }
});

// -------------------------------------------------------------
// STORYTELLING ENDPOINTS (KỂ TRUYỆN ĐA NHÂN VẬT)
// -------------------------------------------------------------

// List all stories
app.get("/api/stories", (req: Request, res: Response) => {
  const list = Array.from(storyJobs.values()).map((s) => ({
    id: s.id,
    title: s.title,
    charactersCount: s.characters.length,
    paragraphsCount: s.paragraphs.length,
    gapMs: s.gapMs,
    status: s.status,
    masterAudio: s.masterAudio,
    updatedAt: s.updatedAt,
  }));
  res.json({ stories: list });
});

// Get story detail
app.get("/api/stories/:storyId", (req: Request, res: Response) => {
  const story = storyJobs.get(req.params.storyId);
  if (!story) return res.status(404).json({ error: "Không tìm thấy truyện." });
  res.json(story);
});

// Create or save story
app.post("/api/stories", (req: Request, res: Response) => {
  try {
    const {
      id = `story_${Date.now()}_${Math.random().toString(36).substring(2, 6)}`,
      title = "Truyện Mới",
      characters = [],
      paragraphs = [],
      gapMs = 300,
      outputFormat = "mp3",
      rawContent = "",
    } = req.body;

    const existing = storyJobs.get(id);
    const story: StoryJob = {
      id,
      title: title || "Truyện Mới",
      rawContent,
      characters:
        characters.length > 0
          ? characters
          : [
              {
                id: "char_narrator",
                name: "Người kể chuyện",
                voiceId: DEFAULT_MODEL,
                speed: 1.0,
                color: "amber",
              },
              {
                id: "char_a",
                name: "Nhân vật A",
                voiceId: "local:doanhdoanh-vietnamese-vi-congchualong",
                speed: 1.0,
                color: "blue",
              },
              {
                id: "char_b",
                name: "Nhân vật B",
                voiceId: "local:huyenngoc-vietnamese-vi-medium-ljkjhi",
                speed: 1.0,
                color: "emerald",
              },
            ],
      paragraphs: paragraphs.map((p: any, idx: number) => ({
        id: p.id || `p_${idx + 1}`,
        index: idx + 1,
        characterId: p.characterId || (characters[0]?.id || "char_narrator"),
        text: p.text || "",
        pauseBefore:
          p.pauseBefore !== undefined &&
          p.pauseBefore !== null &&
          (typeof p.pauseBefore === "number" ||
            (typeof p.pauseBefore === "string" && (p.pauseBefore as string).trim() !== "")) &&
          !isNaN(Number(p.pauseBefore))
            ? Number(p.pauseBefore)
            : undefined,
        status: p.status || "pending",
        duration: p.duration,
        audioUrl: p.audioUrl,
      })),
      gapMs: Number(gapMs) || 300,
      outputFormat: outputFormat === "wav" ? "wav" : "mp3",
      status: existing?.status === "running" ? "running" : "idle",
      progress: existing?.progress || {
        total: paragraphs.length,
        completed: 0,
        percent: 0,
      },
      masterAudio: existing?.masterAudio,
      logs: existing?.logs || [],
      createdAt: existing?.createdAt || new Date().toISOString(),
      updatedAt: new Date().toISOString(),
    };

    storyJobs.set(story.id, story);
    saveStoryToDisk(story);
    res.json(story);
  } catch (err: any) {
    res.status(500).json({ error: err.message });
  }
});

// Update story
app.put("/api/stories/:storyId", (req: Request, res: Response) => {
  const story = storyJobs.get(req.params.storyId);
  if (!story) return res.status(404).json({ error: "Không tìm thấy truyện." });
  const { title, characters, paragraphs, gapMs, outputFormat, rawContent } =
    req.body;
  if (title !== undefined) story.title = title;
  if (rawContent !== undefined) story.rawContent = rawContent;
  if (characters !== undefined) story.characters = characters;
  if (paragraphs !== undefined) {
    story.paragraphs = paragraphs.map((p: any, idx: number) => ({
      ...p,
      index: idx + 1,
      pauseBefore:
        p.pauseBefore !== undefined &&
        p.pauseBefore !== null &&
        (typeof p.pauseBefore === "number" ||
          (typeof p.pauseBefore === "string" && (p.pauseBefore as string).trim() !== "")) &&
        !isNaN(Number(p.pauseBefore))
          ? Number(p.pauseBefore)
          : undefined,
    }));
  }
  if (gapMs !== undefined) story.gapMs = Number(gapMs);
  if (outputFormat !== undefined) story.outputFormat = outputFormat;
  story.updatedAt = new Date().toISOString();
  saveStoryToDisk(story);
  res.json(story);
});

// Delete story
app.delete("/api/stories/:storyId", (req: Request, res: Response) => {
  const storyId = req.params.storyId;
  const story = storyJobs.get(storyId);
  if (!story) return res.status(404).json({ error: "Không tìm thấy truyện." });

  try {
    const jsonPath = path.join(STORIES_DIR, `${storyId}.json`);
    if (fs.existsSync(jsonPath)) fs.rmSync(jsonPath, { force: true });
    const storyDir = path.join(STORIES_DIR, storyId);
    if (fs.existsSync(storyDir))
      fs.rmSync(storyDir, { recursive: true, force: true });
    storyJobs.delete(storyId);
    storySseClients.delete(storyId);
    res.json({ success: true, message: "Đã xóa truyện thành công." });
  } catch (err: any) {
    res.status(500).json({ error: err.message });
  }
});

// Start story audio generation
app.post("/api/stories/:storyId/generate", (req: Request, res: Response) => {
  const story = storyJobs.get(req.params.storyId);
  if (!story) return res.status(404).json({ error: "Không tìm thấy truyện." });

  if (story.status === "running") {
    return res.json({ message: "Tiến trình tạo audio truyện đang chạy." });
  }

  runStoryProcessor(story);
  res.json({ message: "Đã bắt đầu tạo audio truyện.", storyId: story.id });
});

// Fast re-merge existing paragraphs without full re-TTS (1-2s instant merge)
app.post("/api/stories/:storyId/remerge", async (req: Request, res: Response) => {
  const story = storyJobs.get(req.params.storyId);
  if (!story) return res.status(404).json({ error: "Không tìm thấy truyện." });

  if (story.status === "running") {
    return res.status(400).json({ error: "Tiến trình tạo audio truyện đang chạy." });
  }

  // Update paragraphs and gapMs if provided in body
  const { paragraphs, gapMs } = req.body || {};
  if (paragraphs !== undefined && Array.isArray(paragraphs)) {
    story.paragraphs = paragraphs.map((p: any, idx: number) => ({
      ...p,
      index: idx + 1,
      pauseBefore:
        p.pauseBefore !== undefined &&
        p.pauseBefore !== null &&
        (typeof p.pauseBefore === "number" ||
          (typeof p.pauseBefore === "string" && (p.pauseBefore as string).trim() !== "")) &&
        !isNaN(Number(p.pauseBefore))
          ? Number(p.pauseBefore)
          : undefined,
      speed:
        p.speed !== undefined && !isNaN(Number(p.speed)) && Number(p.speed) > 0
          ? Number(p.speed)
          : undefined,
    }));
  }
  if (gapMs !== undefined && !isNaN(Number(gapMs))) {
    story.gapMs = Number(gapMs);
  }

  addStoryLog(
    story,
    "INFO",
    `[⚡ Ghép lại Master] Bắt đầu ghép lại nhanh ${story.paragraphs.length} đoạn với khoảng nghỉ/tốc độ mới...`,
  );

  try {
    await mergeStoryParagraphsToMaster(story);
    addStoryLog(
      story,
      "SUCCESS",
      `[⚡ Ghép lại Master] Đã ghép lại thành công trong 1s! Thời lượng: ${story.masterAudio?.duration || 0}s.`,
    );
    res.json({
      success: true,
      message: "Đã ghép lại master audio thành công!",
      masterAudio: story.masterAudio,
      story,
    });
  } catch (err: any) {
    console.error(`[Story] Lỗi ghép lại master truyện ${story.id}:`, err);
    res.status(500).json({ error: err.message || "Lỗi khi ghép lại master audio." });
  }
});

// Regenerate single paragraph audio (with new speed or updated text)
app.post(
  "/api/stories/:storyId/paragraphs/:index/regenerate",
  async (req: Request, res: Response) => {
    const story = storyJobs.get(req.params.storyId);
    if (!story) return res.status(404).json({ error: "Không tìm thấy truyện." });

    const paraIdx = parseInt(req.params.index, 10);
    const para = story.paragraphs.find((p) => p.index === paraIdx);
    if (!para) return res.status(404).json({ error: "Không tìm thấy đoạn văn." });

    const { speed, text, characterId, pauseBefore } = req.body || {};
    if (speed !== undefined && !isNaN(Number(speed)) && Number(speed) > 0) {
      para.speed = Number(speed);
    }
    if (text !== undefined && typeof text === "string" && text.trim()) {
      para.text = text;
    }
    if (characterId !== undefined) {
      para.characterId = characterId;
    }
    if (pauseBefore !== undefined) {
      para.pauseBefore = !isNaN(Number(pauseBefore)) ? Number(pauseBefore) : undefined;
    }

    para.status = "generating";
    broadcastStoryEvent(story.id, "paragraph_start", {
      index: para.index,
      characterId: para.characterId,
    });

    try {
      await synthesizeSingleStoryParagraph(story, para);
      saveStoryToDisk(story);

      broadcastStoryEvent(story.id, "paragraph_completed", {
        index: para.index,
        duration: para.duration,
        audioUrl: para.audioUrl,
      });

      addStoryLog(
        story,
        "SUCCESS",
        `[Đoạn #${para.index}] Đã tạo lại audio thành công (tốc độ: ${para.speed || "mặc định"}x, thời lượng: ${para.duration}s).`,
      );

      res.json({
        success: true,
        message: `Đã tạo lại đoạn #${para.index} thành công!`,
        paragraph: para,
      });
    } catch (err: any) {
      para.status = "failed";
      para.error = err.message;
      saveStoryToDisk(story);
      res.status(500).json({ error: err.message || "Lỗi khi tạo lại đoạn văn." });
    }
  },
);

// SSE events stream for story
app.get("/api/stories/:storyId/events", (req: Request, res: Response) => {
  const story = storyJobs.get(req.params.storyId);
  if (!story) return res.status(404).send("Story not found");

  res.setHeader("Content-Type", "text/event-stream");
  res.setHeader("Cache-Control", "no-cache");
  res.setHeader("Connection", "keep-alive");
  res.flushHeaders?.();

  if (!storySseClients.has(story.id)) {
    storySseClients.set(story.id, new Set());
  }
  storySseClients.get(story.id)!.add(res);

  res.write(`event: story_state\ndata: ${JSON.stringify(story)}\n\n`);

  const interval = setInterval(() => {
    res.write(": ping\n\n");
  }, 15000);

  req.on("close", () => {
    clearInterval(interval);
    storySseClients.get(story.id)?.delete(res);
  });
});

// Stream master audio for story with HTTP 206 Range support
app.get("/api/stories/:storyId/master-audio", (req: Request, res: Response) => {
  const storyDir = path.join(STORIES_DIR, req.params.storyId);
  const format = req.query.format === "wav" ? "wav" : "mp3";
  const filePath =
    format === "wav"
      ? path.join(storyDir, "master.wav")
      : path.join(storyDir, "master.mp3");

  const fallbackPath =
    format === "wav"
      ? path.join(storyDir, "master.mp3")
      : path.join(storyDir, "master.wav");

  const fileToServe = fs.existsSync(filePath) ? filePath : fallbackPath;
  if (!fs.existsSync(fileToServe)) {
    return res.status(404).send("Master audio not found");
  }

  const isDownload = req.query.download === "1";
  const finalExt = fileToServe.endsWith(".mp3") ? "mp3" : "wav";
  const mimeType = finalExt === "mp3" ? "audio/mpeg" : "audio/wav";
  const downloadName = isDownload
    ? `story-${req.params.storyId}.${finalExt}`
    : undefined;

  streamAudioWithRange(req, res, fileToServe, mimeType, downloadName);
});

// Stream individual paragraph audio
app.get(
  "/api/stories/:storyId/paragraph-audio/:index",
  (req: Request, res: Response) => {
    const paraPath = path.join(
      STORIES_DIR,
      req.params.storyId,
      "paragraphs",
      `para_${req.params.index}.wav`,
    );
    if (!fs.existsSync(paraPath)) {
      return res.status(404).send("Paragraph audio not found");
    }
    streamAudioWithRange(req, res, paraPath, "audio/wav");
  },
);

// Fast preview for a single paragraph
app.post(
  "/api/stories/:storyId/preview-paragraph",
  async (req: Request, res: Response) => {
    try {
      const { text, voiceId, speakerId, speed = 1.0 } = req.body;
      if (!text || !text.trim()) {
        return res.status(400).json({ error: "Văn bản không được để trống." });
      }
      const tts = await getOrLoadModel(voiceId || DEFAULT_MODEL);
      const cleaned = normalizeVietnameseText(text);
      const espeakVoice = tts.getConfig().espeakVoice || "vi";
      const synthesisText = applyVietnameseRPronunciation(
        cleaned,
        voiceId || DEFAULT_MODEL,
        espeakVoice,
      );
      const numSpeed = Math.max(0.5, Math.min(2.0, Number(speed) || 1.0));
      const lengthScale = 1.0 / numSpeed;

      const synthRes = await tts.synthesize(synthesisText, {
        outputFormat: "wav",
        lengthScale,
        speakerId,
      });

      res.setHeader("Content-Type", "audio/wav");
      res.setHeader("Cache-Control", "no-cache");
      res.send(synthRes.audio);
    } catch (err: any) {
      res.status(500).json({ error: err.message });
    }
  },
);

// Export or download SRT subtitles for story based on paragraph durations and gap
app.get("/api/stories/:storyId/subtitles.srt", (req: Request, res: Response) => {
  const story = storyJobs.get(req.params.storyId);
  if (!story) return res.status(404).json({ error: "Không tìm thấy truyện." });

  const withCharacter = req.query.withCharacter === "1";
  const defaultGapSec = (story.gapMs || 300) / 1000;
  let currentTime = 0;

  const pad = (n: number, z = 2) => String(n).padStart(z, "0");
  const toSrtTime = (sec: number) => {
    if (isNaN(sec) || sec < 0) sec = 0;
    const h = Math.floor(sec / 3600);
    const m = Math.floor((sec % 3600) / 60);
    const s = Math.floor(sec % 60);
    const ms = Math.floor((sec % 1) * 1000);
    return `${pad(h)}:${pad(m)}:${pad(s)},${pad(ms, 3)}`;
  };

  const srtBlocks: string[] = [];

  story.paragraphs.forEach((p, idx) => {
    const hasCustomPause =
      p.pauseBefore !== undefined &&
      p.pauseBefore !== null &&
      (typeof p.pauseBefore === "number" ||
        (typeof p.pauseBefore === "string" && (p.pauseBefore as string).trim() !== "")) &&
      !isNaN(Number(p.pauseBefore));

    const pauseSec = hasCustomPause
      ? Math.max(0, Number(p.pauseBefore))
      : (idx === 0 ? 0 : defaultGapSec);

    currentTime += pauseSec;

    const duration = p.duration || Math.max(1.0, Number((p.text.length * 0.08).toFixed(2)));
    const startTime = currentTime;
    const endTime = startTime + duration;
    currentTime = endTime;

    const startStr = toSrtTime(startTime);
    const endStr = toSrtTime(endTime);

    let text = p.text;
    if (withCharacter) {
      const char = story.characters.find((c) => c.id === p.characterId);
      if (char) {
        text = `[${char.name}]: ${p.text}`;
      }
    }

    srtBlocks.push(`${idx + 1}\n${startStr} --> ${endStr}\n${text}\n`);
  });

  const srtContent = srtBlocks.join("\n");
  const isDownload = req.query.download === "1";
  const filename = `story-${story.id}.srt`;

  res.setHeader("Content-Type", "text/plain; charset=utf-8");
  if (isDownload) {
    res.setHeader("Content-Disposition", `attachment; filename="${filename}"`);
  }
  res.send(srtContent);
});

// -------------------------------------------------------------
// STORY VIDEO EXPORT (MP4 9:16 VERTICAL MOBILE PLAYER)
// -------------------------------------------------------------
app.post(
  "/api/stories/:storyId/export-video",
  async (req: Request, res: Response) => {
    const story = storyJobs.get(req.params.storyId);
    if (!story) return res.status(404).json({ error: "Không tìm thấy truyện." });

    if (!checkFfmpegAvailable()) {
      return res.status(500).json({
        error: "Máy chủ chưa cài đặt FFmpeg. Không thể xuất video MP4.",
      });
    }

    try {
      // Ensure master audio exists
      const storyDir = path.join(STORIES_DIR, story.id);
      const masterMp3 = path.join(storyDir, "master.mp3");
      const masterWav = path.join(storyDir, "master.wav");
      if (!fs.existsSync(masterMp3) && !fs.existsSync(masterWav)) {
        await mergeStoryParagraphsToMaster(story);
      }

      const { resolution = "1080p", customBgImage } = req.body || {};
      const validRes = ["720p", "1080p", "2k", "4k"].includes(resolution)
        ? (resolution as "720p" | "1080p" | "2k" | "4k")
        : "1080p";

      const jobId = `export_${Date.now()}_${Math.random().toString(36).substring(2, 7)}`;
      const job = startStoryVideoExport({
        jobId,
        story,
        resolution: validRes,
        customBgImage,
        ffmpegPath: resolveFfmpegPath(),
        storiesDir: STORIES_DIR,
      });

      res.json({
        success: true,
        jobId: job.id,
        resolution: validRes,
        message: `Đã bắt đầu tiến trình xuất video ${validRes.toUpperCase()} (9:16).`,
      });
    } catch (err: any) {
      console.error("[StoryVideoExport] Lỗi khởi tạo:", err);
      res.status(500).json({ error: err.message || "Lỗi khi bắt đầu xuất video." });
    }
  },
);

// Check video export progress
app.get(
  "/api/stories/:storyId/export-video/progress/:jobId",
  (req: Request, res: Response) => {
    const job = videoExportJobs.get(req.params.jobId);
    if (!job) {
      return res.status(404).json({ error: "Không tìm thấy tiến trình xuất video." });
    }
    res.json({ success: true, job });
  },
);

// Download exported video MP4
app.get(
  "/api/stories/:storyId/export-video/download/:jobId",
  (req: Request, res: Response) => {
    const job = videoExportJobs.get(req.params.jobId);
    if (!job || !job.outputPath || !fs.existsSync(job.outputPath)) {
      return res.status(404).send("Tệp video không tồn tại hoặc chưa kết xuất xong.");
    }

    const defaultFilename = `story-${req.params.storyId}-${job.resolution}.mp4`;
    const filename = (req.query.filename as string) || defaultFilename;
    res.download(job.outputPath, filename);
  },
);




// Download Google Colab 1-Click Voice Cloning Notebook (.ipynb)
app.get("/api/colab/notebook", (_req: Request, res: Response) => {
  const notebookPath = path.resolve(__dirname, "Piper_Voice_Clone_Colab.ipynb");
  if (!fs.existsSync(notebookPath)) {
    return res.status(404).send("File Notebook không tồn tại trên máy chủ.");
  }
  res.setHeader("Content-Type", "application/x-ipynb+json");
  res.setHeader(
    "Content-Disposition",
    `attachment; filename="Piper_Voice_Clone_Colab.ipynb"`,
  );
  fs.createReadStream(notebookPath).pipe(res);
});

// List installed custom voices
app.get("/api/models/custom", (_req: Request, res: Response) => {
  try {
    const list = scanCustomModelsOnDisk();
    res.json({ success: true, customVoices: list });
  } catch (err: any) {
    res.status(500).json({ error: err.message });
  }
});

// Upload and register custom Piper model (.onnx and .onnx.json)
app.post("/api/models/upload", async (req: Request, res: Response) => {
  try {
    const {
      voiceId,
      name,
      gender = "female",
      description = "",
      onnxBase64,
      jsonContent,
    } = req.body || {};

    if (!voiceId || !onnxBase64 || !jsonContent) {
      return res.status(400).json({
        error: "Thiếu dữ liệu: Vui lòng cung cấp voiceId, file .onnx (base64) và file .onnx.json.",
      });
    }

    const onnxBuffer = Buffer.from(onnxBase64, "base64");
    if (onnxBuffer.length < 100) {
      return res.status(400).json({ error: "File .onnx không hợp lệ hoặc quá nhỏ." });
    }

    let jsonStr = "";
    if (typeof jsonContent === "string") {
      jsonStr = jsonContent;
    } else {
      jsonStr = JSON.stringify(jsonContent, null, 2);
    }

    // Verify valid JSON
    try {
      JSON.parse(jsonStr);
    } catch {
      return res.status(400).json({ error: "Nội dung file .onnx.json không đúng định dạng JSON." });
    }

    const registered = registerCustomVoice({
      voiceId,
      name: name || voiceId,
      gender: gender === "male" ? "male" : "female",
      description,
      onnxBuffer,
      jsonContent: jsonStr,
    });

    console.log(`[CustomVoiceManager] Đã nạp thành công giọng mới: ${registered.name} (${registered.modelId})`);

    res.json({
      success: true,
      voice: registered,
      message: `Đã nạp thành công giọng "${registered.name}" vào hệ thống!`,
    });
  } catch (err: any) {
    console.error("[CustomVoiceManager] Lỗi nạp giọng:", err);
    res.status(500).json({ error: err.message || "Lỗi khi nạp file mô hình." });
  }
});

// Delete custom voice
app.delete("/api/models/custom/:id", (req: Request, res: Response) => {
  try {
    const success = deleteCustomVoice(req.params.id);
    if (!success) {
      return res.status(404).json({ error: "Không tìm thấy giọng tùy chỉnh cần xóa." });
    }
    // Also clear from modelCache
    modelCache.delete(`local:${req.params.id}`);
    modelCache.delete(req.params.id);
    modelCacheSources.delete(`local:${req.params.id}`);
    loadingPromises.delete(`local:${req.params.id}`);
    loadingPromises.delete(req.params.id);
    loadingModelSources.delete(`local:${req.params.id}`);

    res.json({ success: true, message: "Đã xóa giọng tùy chỉnh thành công." });
  } catch (err: any) {
    res.status(500).json({ error: err.message });
  }
});

// ==========================================
// SYSTEM OFFLINE TOOLS & MODELS INITIALIZATION
// ==========================================

// Get system tools status (Whisper.cpp compilation & GGML models downloaded)
app.get("/api/system/tools-status", (_req: Request, res: Response) => {
  try {
    const status = getSystemToolsStatus();
    res.json({ success: true, ...status });
  } catch (err: any) {
    res.status(500).json({ error: err.message });
  }
});

// Start Whisper.cpp compilation/initialization
app.post("/api/system/init-whisper", async (req: Request, res: Response) => {
  try {
    const forceRebuild = !!req.body?.forceRebuild;
    await startCompileWhisperCpp(forceRebuild);
    res.json({ success: true, message: "Đã bắt đầu khởi tạo Whisper.cpp." });
  } catch (err: any) {
    res.status(400).json({ error: err.message });
  }
});

// Reset system active job
app.post("/api/system/reset-job", (_req: Request, res: Response) => {
  try {
    resetCurrentJob();
    res.json({ success: true, message: "Đã làm mới trạng thái tiến trình." });
  } catch (err: any) {
    res.status(500).json({ error: err.message });
  }
});

// Start downloading a specific Whisper GGML model
app.post("/api/system/download-whisper-model", async (req: Request, res: Response) => {
  try {
    const { modelId } = req.body || {};
    if (!modelId) {
      return res.status(400).json({ error: "Thiếu modelId cần tải." });
    }
    await startDownloadWhisperModel(modelId);
    res.json({ success: true, message: `Bắt đầu tải mô hình ${modelId}.` });
  } catch (err: any) {
    res.status(400).json({ error: err.message });
  }
});

// Delete Whisper GGML model from disk
app.delete("/api/system/whisper-model/:modelId", (req: Request, res: Response) => {
  try {
    const ok = deleteWhisperModel(req.params.modelId);
    if (!ok) {
      return res.status(404).json({ error: "Không tìm thấy file mô hình để xóa." });
    }
    res.json({ success: true, message: "Đã xóa mô hình khỏi hệ thống thành công." });
  } catch (err: any) {
    res.status(500).json({ error: err.message });
  }
});

// ==========================================
// OFFLINE DATASET PREPARATION (WHISPER.CPP)
// ==========================================

function startDatasetPreparation(
  audioSource: Buffer | string,
  originalFilename: string,
  voiceName: string,
  whisperModel: string,
  minDuration: number,
  maxDuration: number,
  uploadTempDir?: string,
  targetDatasetId?: string
): DatasetPreparationJob {
  const now = Date.now();
  for (const [id, job] of datasetPreparationJobs) {
    if (job.status !== "processing" && now - job.updatedAt > 30 * 60 * 1000) {
      datasetPreparationJobs.delete(id);
    }
  }

  const job: DatasetPreparationJob = {
    id: `dataset-${now}-${Math.random().toString(36).slice(2, 8)}`,
    status: "processing",
    progressPercent: 0,
    message: "Đang xếp hàng xử lý âm thanh...",
    updatedAt: now,
  };
  datasetPreparationJobs.set(job.id, job);

  void prepareOfflineDataset(
    audioSource,
    originalFilename,
    voiceName,
    whisperModel,
    minDuration,
    maxDuration,
    (progress: DatasetPreparationProgress) => {
      job.progressPercent = progress.progressPercent;
      job.message = progress.message;
      job.updatedAt = Date.now();
    },
    resolveFfmpegPath(),
    targetDatasetId
  )
    .then((datasetInfo) => {
      job.status = "completed";
      job.progressPercent = 100;
      job.message = `Hoàn tất: đã tạo ${datasetInfo.totalClips} câu thoại.`;
      job.dataset = datasetInfo;
      job.updatedAt = Date.now();
      console.log(
        `[OfflineDataset] Đã tạo thành công ${datasetInfo.totalClips} câu (${datasetInfo.totalDurationSec}s) cho "${datasetInfo.voiceName}"!`
      );
    })
    .catch((err: unknown) => {
      const message = err instanceof Error ? err.message : "Lỗi không xác định khi xử lý âm thanh.";
      job.status = "failed";
      job.message = message;
      job.error = message;
      job.updatedAt = Date.now();
      console.error("[OfflineDataset] Lỗi tạo dataset:", err);
    })
    .finally(() => {
      if (uploadTempDir) {
        fs.rm(uploadTempDir, { recursive: true, force: true }, (err) => {
          if (err) console.error("[OfflineDataset] Không thể xóa file upload tạm:", err);
        });
      }
    });

  return job;
}

// Get available Whisper models
app.get("/api/dataset/models", (_req: Request, res: Response) => {
  try {
    const models = getAvailableWhisperModels();
    res.json({ success: true, models });
  } catch (err: any) {
    res.status(500).json({ error: err.message });
  }
});

// List all prepared datasets
app.get("/api/dataset/list", (_req: Request, res: Response) => {
  try {
    const datasets = listDatasets();
    res.json({ success: true, datasets });
  } catch (err: any) {
    res.status(500).json({ error: err.message });
  }
});

// Stream an audio upload to disk so large files don't need to fit in a JSON request.
app.post("/api/dataset/prepare-upload", async (req: Request, res: Response) => {
  const contentLength = Number(req.headers["content-length"]);
  if (Number.isFinite(contentLength) && contentLength > MAX_DATASET_UPLOAD_BYTES) {
    return res.status(413).json({ error: "File âm thanh vượt quá giới hạn tải lên 4 GB." });
  }

  const uploadTempDir = fs.mkdtempSync(path.join(os.tmpdir(), "tts-dataset-upload-"));
  const uploadPath = path.join(uploadTempDir, "source-audio");
  let bytesReceived = 0;
  const sizeLimiter = new Transform({
    transform(chunk: Buffer, _encoding, callback) {
      bytesReceived += chunk.length;
      if (bytesReceived > MAX_DATASET_UPLOAD_BYTES) {
        callback(new Error("UPLOAD_TOO_LARGE"));
        return;
      }
      callback(null, chunk);
    },
  });

  try {
    await pipeline(req, sizeLimiter, fs.createWriteStream(uploadPath, { flags: "wx" }));
    if (bytesReceived < 1000) {
      fs.rmSync(uploadTempDir, { recursive: true, force: true });
      return res.status(400).json({ error: "File âm thanh không hợp lệ hoặc quá nhỏ." });
    }

    const queryString = (key: string, fallback: string) =>
      typeof req.query[key] === "string" ? req.query[key] as string : fallback;
    const originalFilename = path.basename(queryString("originalFilename", "audio.wav"));
    const targetDatasetId = queryString("extendDatasetId", "") || queryString("targetDatasetId", "");
    const job = startDatasetPreparation(
      uploadPath,
      originalFilename,
      queryString("voiceName", "giong_moi"),
      queryString("whisperModel", "small"),
      Number(queryString("minDuration", "1")) || 1,
      Number(queryString("maxDuration", "12")) || 12,
      uploadTempDir,
      targetDatasetId || undefined
    );

    res.status(202).json({ success: true, jobId: job.id });
  } catch (err) {
    fs.rm(uploadTempDir, { recursive: true, force: true }, (cleanupError) => {
      if (cleanupError) console.error("[OfflineDataset] Không thể xóa upload tạm:", cleanupError);
    });
    const errorMessage = err instanceof Error ? err.message : "Lỗi tải file âm thanh.";
    if (res.destroyed || res.headersSent) return;
    if (errorMessage === "UPLOAD_TOO_LARGE") {
      return res.status(413).json({ error: "File âm thanh vượt quá giới hạn tải lên 4 GB." });
    }
    console.error("[OfflineDataset] Lỗi nhận file âm thanh:", err);
    return res.status(500).json({ error: "Không thể nhận file âm thanh trên máy chủ." });
  }
});

// Prepare offline dataset from uploaded audio
app.post("/api/dataset/prepare", async (req: Request, res: Response) => {
  try {
    const {
      audioBase64,
      originalFilename = "audio.wav",
      voiceName = "giong_moi",
      whisperModel = "small",
      minDuration = 1.0,
      maxDuration = 12.0,
      extendDatasetId,
      targetDatasetId,
    } = req.body || {};

    if (!audioBase64) {
      return res.status(400).json({ error: "Vui lòng chọn hoặc tải lên file âm thanh." });
    }

    const audioBuffer = Buffer.from(audioBase64, "base64");
    if (audioBuffer.length < 1000) {
      return res.status(400).json({ error: "File âm thanh không hợp lệ hoặc quá nhỏ." });
    }

    console.log(
      `[OfflineDataset] Bắt đầu cắt và nhận diện bằng Whisper.cpp (${whisperModel}) cho giọng "${voiceName}"...`
    );

    const job = startDatasetPreparation(
      audioBuffer,
      originalFilename,
      voiceName,
      whisperModel,
      Number(minDuration) || 1.0,
      Number(maxDuration) || 12.0,
      undefined,
      extendDatasetId || targetDatasetId || undefined
    );

    res.status(202).json({ success: true, jobId: job.id });
  } catch (err: any) {
    console.error("[OfflineDataset] Lỗi tạo dataset:", err);
    res.status(500).json({ error: err.message || "Lỗi khi xử lý âm thanh bằng Whisper.cpp." });
  }
});

// Get offline dataset preparation progress
app.get("/api/dataset/prepare/:jobId", (req: Request, res: Response) => {
  const job = datasetPreparationJobs.get(req.params.jobId);
  if (!job) {
    return res.status(404).json({ error: "Không tìm thấy tác vụ xử lý dataset." });
  }

  const { updatedAt: _updatedAt, ...publicJob } = job;
  res.json({ success: true, job: publicJob });
});

// Get specific dataset
app.get("/api/dataset/:datasetId", (req: Request, res: Response) => {
  try {
    const info = getDataset(req.params.datasetId);
    if (!info) {
      return res.status(404).json({ error: "Không tìm thấy dataset." });
    }
    res.json({ success: true, dataset: info });
  } catch (err: any) {
    res.status(500).json({ error: err.message });
  }
});

// Stream clip audio for web preview
app.get("/api/dataset/:datasetId/audio/:filename", (req: Request, res: Response) => {
  try {
    const cleanDatasetId = req.params.datasetId.replace(/[^a-zA-Z0-9_-]/g, "");
    const cleanFilename = req.params.filename.replace(/[^a-zA-Z0-9_.-]/g, "");
    const clipPath = path.resolve(__dirname, "datasets_storage", cleanDatasetId, "wav", cleanFilename);

    if (!fs.existsSync(clipPath)) {
      return res.status(404).send("File audio clip không tồn tại.");
    }

    res.setHeader("Content-Type", "audio/wav");
    fs.createReadStream(clipPath).pipe(res);
  } catch (err: any) {
    res.status(500).send("Lỗi đọc file clip audio.");
  }
});

// Update clip text or delete clip
app.post("/api/dataset/:datasetId/clip", (req: Request, res: Response) => {
  try {
    const { clipId, text, shouldDelete } = req.body || {};
    if (!clipId) {
      return res.status(400).json({ error: "Thiếu clipId." });
    }

    const updated = updateDatasetClip(req.params.datasetId, clipId, text, !!shouldDelete);
    res.json({ success: true, dataset: updated });
  } catch (err: any) {
    res.status(500).json({ error: err.message });
  }
});

app.put("/api/dataset/:datasetId/metadata", (req: Request, res: Response) => {
  try {
    const { metadata } = req.body || {};
    const updated = updateDatasetMetadata(req.params.datasetId, metadata);
    res.json({ success: true, dataset: updated });
  } catch (err: unknown) {
    const message = err instanceof Error ? err.message : "Lỗi không xác định khi lưu metadata.";
    const status = message.startsWith("Dataset ") && message.endsWith(" không tồn tại.") ? 404 : 400;
    res.status(status).json({ error: message });
  }
});

// Export dataset as ZIP for Google Colab
app.get("/api/dataset/:datasetId/export-zip", (req: Request, res: Response) => {
  try {
    const zipPath = createDatasetZip(req.params.datasetId);
    const filename = `${req.params.datasetId}_dataset.zip`;
    res.setHeader("Content-Type", "application/zip");
    res.download(zipPath, filename, (err) => {
      if (err) {
        console.error("[OfflineDataset] Lỗi tải file ZIP:", err);
        if (!res.headersSent) {
          res.status(500).send(`Lỗi tải file zip: ${err.message}`);
        } else {
          res.destroy(err);
        }
      }
    });
  } catch (err: unknown) {
    const message = err instanceof Error ? err.message : "Lỗi không xác định khi tạo file zip.";
    console.error("[OfflineDataset] Lỗi tạo file ZIP:", err);
    res.status(500).send(`Lỗi tạo file zip: ${message}`);
  }
});

// Delete dataset
app.delete("/api/dataset/:datasetId", (req: Request, res: Response) => {
  try {
    const ok = deleteDataset(req.params.datasetId);
    if (!ok) {
      return res.status(404).json({ error: "Không tìm thấy dataset để xóa." });
    }
    res.json({ success: true, message: "Đã xóa dataset thành công." });
  } catch (err: any) {
    res.status(500).json({ error: err.message });
  }
});

app.get("/api/voices", (req: Request, res: Response) => {
  const vnCheck = checkVieNeuModelAvailable();
  const catalogModelIds = new Set(AVAILABLE_MODELS.map((voice) => voice.modelId));
  const customList = scanCustomModelsOnDisk().filter(
    (voice) => !catalogModelIds.has(voice.modelId),
  );

  const customOptions = customList.map((cv) => {
    const isLoaded = modelCache.has(cv.modelId) || modelCache.has(`local:${cv.id}`);
    const localPath = path.join(MODELS_DIR, cv.onnxFile);
    return {
      id: cv.modelId,
      modelId: cv.modelId,
      name: `${cv.name} ⭐ (Custom)`,
      tag: `${cv.gender === "female" ? "Nữ" : "Nam"} · Tùy chỉnh (Google Colab)`,
      gender: cv.gender,
      description: cv.description || "Giọng AI đã huấn luyện từ Colab",
      sampleText: cv.sampleText || "Xin chào! Đây là giọng đọc tùy chỉnh của tôi.",
      recommended: false,
      engine: "piper" as const,
      isCustom: true,
      isLoaded,
      hasLocalFile: fs.existsSync(localPath),
      localFilePath: cv.onnxFile,
      fileSizeBytes: cv.fileSizeBytes,
      createdAt: cv.createdAt,
    };
  });

  const builtinOptions = AVAILABLE_MODELS.map((v) => {
    if (v.id.startsWith("vieneu:")) {
      return {
        ...v,
        isLoaded: vnCheck.available,
        hasLocalFile: vnCheck.available,
        localFilePath: vnCheck.fileName
          ? path.join("models", "vieneu", vnCheck.fileName)
          : "models/vieneu/vieneu-v3-turbo-q8_0.gguf",
        engine: "vieneu",
      };
    }
    const cleanId = v.modelId.replace(/^(local:|hub:)/, "").trim();
    const normalized = `local:${cleanId}`;
    const isLoaded = modelCache.has(normalized) || modelCache.has(v.modelId);
    const localPath = resolveLocalModelPath(v.modelId);
    return {
      ...v,
      isLoaded,
      hasLocalFile: !!(localPath && fs.existsSync(localPath)),
      localFilePath: localPath ? path.basename(localPath) : null,
      engine: "piper",
    };
  });

  res.json({
    defaultModel: DEFAULT_MODEL,
    espeakAvailable: checkEspeakAvailable(),
    espeakPath: resolveEspeakPath(),
    vieneuAvailable: vnCheck.available,
    vieneuModelFile: vnCheck.fileName || null,
    voices: [...customOptions, ...builtinOptions],
  });
});

app.post("/api/tts", async (req: Request, res: Response) => {
  try {
    const {
      text,
      model = DEFAULT_MODEL,
      speakerId,
      speed = 1.0,
      sentenceSilence = 0.2,
      noiseScale = 0.667,
      noiseWScale = 0.8,
      format = "mp3",
    } = req.body;

    if (!text || typeof text !== "string" || text.trim().length === 0) {
      return res.status(400).json({ error: "Vui lòng nhập văn bản cần đọc." });
    }

    if (text.length > 5000) {
      return res.status(400).json({
        error: "Văn bản vượt quá giới hạn 5,000 ký tự cho mỗi lần tạo.",
      });
    }

    const cleanedText = normalizeVietnameseText(text, {
      normalizeNumbers: req.body.normalizeNumbers !== false,
      customReplacements: req.body.customReplacements,
    });
    const tts = await getOrLoadModel(model);
    const synthesisText = applyVietnameseRPronunciation(
      cleanedText,
      model,
      tts.getConfig().espeakVoice,
    );

    const numSpeed = Math.max(0.5, Math.min(2.0, Number(speed) || 1.0));
    const lengthScale = 1.0 / numSpeed;
    const outputFormat = format === "wav" ? "wav" : "mp3";

    const startTime = Date.now();
    const synthResult = await tts.synthesize(synthesisText, {
      lengthScale,
      speakerId,
      sentenceSilence: Math.max(
        0.0,
        Math.min(2.0, Number(sentenceSilence) || 0.2),
      ),
      noiseScale: Math.max(0.1, Math.min(1.5, Number(noiseScale) || 0.667)),
      noiseWScale: Math.max(0.1, Math.min(1.5, Number(noiseWScale) || 0.8)),
      outputFormat,
    });

    const elapsedMs = Date.now() - startTime;
    const audioBuffer = synthResult.audio as Buffer;
    const mimeType = outputFormat === "mp3" ? "audio/mpeg" : "audio/wav";

    res.json({
      success: true,
      audioBase64: audioBuffer.toString("base64"),
      mimeType,
      sampleRate: synthResult.sampleRate || 22050,
      format: outputFormat,
      sizeBytes: audioBuffer.length,
      elapsedMs,
      textLength: text.trim().length,
      modelUsed: model,
    });
  } catch (error: any) {
    console.error("[PiperTTS] Synthesis error:", error);
    res.status(500).json({
      error: error?.message || "Có lỗi xảy ra khi tạo giọng nói.",
    });
  }
});

app.post("/api/tts/download", async (req: Request, res: Response) => {
  try {
    const {
      text,
      model = DEFAULT_MODEL,
      speakerId,
      speed = 1.0,
      sentenceSilence = 0.2,
      noiseScale = 0.667,
      noiseWScale = 0.8,
      format = "mp3",
      filename,
    } = req.body;

    if (!text || typeof text !== "string" || text.trim().length === 0) {
      return res.status(400).send("Văn bản không hợp lệ.");
    }

    const tts = await getOrLoadModel(model);
    const numSpeed = Math.max(0.5, Math.min(2.0, Number(speed) || 1.0));
    const lengthScale = 1.0 / numSpeed;
    const outputFormat = format === "wav" ? "wav" : "mp3";

    const cleanedText = normalizeVietnameseText(text, {
      normalizeNumbers: req.body.normalizeNumbers !== false,
      customReplacements: req.body.customReplacements,
    });
    const synthesisText = applyVietnameseRPronunciation(
      cleanedText,
      model,
      tts.getConfig().espeakVoice,
    );
    const synthResult = await tts.synthesize(synthesisText, {
      lengthScale,
      speakerId,
      sentenceSilence: Math.max(
        0.0,
        Math.min(2.0, Number(sentenceSilence) || 0.2),
      ),
      noiseScale: Math.max(0.1, Math.min(1.5, Number(noiseScale) || 0.667)),
      noiseWScale: Math.max(0.1, Math.min(1.5, Number(noiseWScale) || 0.8)),
      outputFormat,
    });

    const audioBuffer = synthResult.audio as Buffer;
    const mimeType = outputFormat === "mp3" ? "audio/mpeg" : "audio/wav";
    const safeFilename =
      filename || `hoaimy-piper-${Date.now()}.${outputFormat}`;

    res.setHeader("Content-Type", mimeType);
    res.setHeader(
      "Content-Disposition",
      `attachment; filename="${safeFilename}"`,
    );
    res.setHeader("Content-Length", audioBuffer.length);
    res.end(audioBuffer);
  } catch (error: any) {
    console.error("[PiperTTS] Download error:", error);
    res.status(500).send("Lỗi khi tải file audio.");
  }
});

// -------------------------------------------------------------
// BGM (BACKGROUND MUSIC / SOUNDSCAPE) ENDPOINTS (100% OFFLINE)
// -------------------------------------------------------------
app.get("/api/bgm/history", (_req: Request, res: Response) => {
  try {
    const list = getBgmHistory();
    res.json({ success: true, tracks: list });
  } catch (err: any) {
    res.status(500).json({ error: err.message });
  }
});

app.post("/api/bgm/generate", (req: Request, res: Response) => {
  try {
    const jobId = startBgmGeneration(req.body);
    res.status(202).json({ success: true, jobId });
  } catch (err: any) {
    console.error("[BGM Generate Error]:", err);
    res.status(500).json({ error: err.message || "Lỗi khi tạo nhạc nền." });
  }
});

app.get("/api/bgm/generate/:jobId", (req: Request, res: Response) => {
  const job = getBgmGenerationJob(req.params.jobId);
  if (!job) {
    return res.status(404).json({ error: "Không tìm thấy tiến trình tạo nhạc." });
  }
  res.json({ success: true, job });
});

app.delete("/api/bgm/:id", (req: Request, res: Response) => {
  try {
    const ok = deleteBgmTrack(req.params.id);
    if (!ok) return res.status(404).json({ error: "Không tìm thấy đoạn nhạc." });
    res.json({ success: true });
  } catch (err: any) {
    res.status(500).json({ error: err.message });
  }
});

app.get("/api/bgm/audio/:filename", (req: Request, res: Response) => {
  const safeFilename = path.basename(req.params.filename);
  const filePath = path.join(path.resolve("./bgm_storage"), safeFilename);
  if (!fs.existsSync(filePath)) {
    return res.status(404).send("Tệp audio không tồn tại.");
  }
  const isMp3 = safeFilename.endsWith(".mp3");
  res.setHeader("Content-Type", isMp3 ? "audio/mpeg" : "audio/wav");
  res.setHeader("Cache-Control", "public, max-age=86400");
  fs.createReadStream(filePath).pipe(res);
});

app.get("/api/bgm/download/:filename", (req: Request, res: Response) => {
  const safeFilename = path.basename(req.params.filename);
  const filePath = path.join(path.resolve("./bgm_storage"), safeFilename);
  if (!fs.existsSync(filePath)) {
    return res.status(404).send("Tệp audio không tồn tại.");
  }
  res.download(filePath, safeFilename);
});

// BGM Model Management (On-Demand Download, RAM Monitoring & Storage)
app.get("/api/bgm/models/status", (_req: Request, res: Response) => {
  try {
    const status = getBgmSystemStatus();
    res.json({ success: true, ...status });
  } catch (err: any) {
    res.status(500).json({ error: err.message });
  }
});

app.post("/api/bgm/models/:id/download", (req: Request, res: Response) => {
  try {
    const result = startModelDownload(req.params.id);
    res.json(result);
  } catch (err: any) {
    res.status(500).json({ success: false, error: err.message });
  }
});

app.post("/api/bgm/models/:id/cancel", (req: Request, res: Response) => {
  try {
    const ok = cancelModelDownload(req.params.id);
    res.json({ success: ok });
  } catch (err: any) {
    res.status(500).json({ error: err.message });
  }
});

app.delete("/api/bgm/models/:id", (req: Request, res: Response) => {
  try {
    const ok = deleteBgmModel(req.params.id);
    res.json({ success: ok });
  } catch (err: any) {
    res.status(500).json({ error: err.message });
  }
});

async function startServer() {
  if (!isProd) {
    const vite = await createViteServer({
      server: { middlewareMode: true },
      appType: "spa",
    });
    app.use(vite.middlewares);
  } else {
    const distPath = path.resolve(__dirname, "dist");
    if (fs.existsSync(distPath)) {
      app.use(express.static(distPath));
      app.get("*", (req: Request, res: Response) => {
        res.sendFile(path.resolve(distPath, "index.html"));
      });
    } else {
      console.warn(
        "[Server] Thư mục dist chưa tồn tại. Đang fallback phục vụ Vite middleware...",
      );
      const vite = await createViteServer({
        server: { middlewareMode: true },
        appType: "spa",
      });
      app.use(vite.middlewares);
    }
  }

  loadAllStoriesFromDisk();

  const server = app.listen(PORT, () => {
    console.log(
      `\n==================================================================`,
    );
    console.log(`  PIPER TTS STUDIO - MÁY CHỦ SẴN SÀNG`);
    console.log(`  Truy cập ứng dụng tại: http://localhost:${PORT}`);
    if (checkFfmpegAvailable()) {
      console.log(`  [FFmpeg] FFmpeg đã được kích hoạt thành công.`);
    } else {
      console.log(
        `  [FFmpeg] CẢNH BÁO: Chưa tìm thấy FFmpeg trong PATH hoặc thư mục gốc.`,
      );
      console.log(
        `  (Để nén sang MP3 và tăng tốc đọc atempo, vui lòng cài đặt FFmpeg)`,
      );
    }
    if (checkEspeakAvailable()) {
      console.log(
        `  [eSpeak NG] eSpeak NG đã sẵn sàng: Xử lý ngữ âm tiếng Việt đầy đủ thanh điệu và dấu câu.`,
      );
    } else {
      console.log(
        `  [eSpeak NG] CẢNH BÁO: Chưa tìm thấy eSpeak NG trong PATH hoặc Program Files.`,
      );
      console.log(
        `  (Để PiperTTS phát âm chuẩn tiếng Việt có dấu, vui lòng cài eSpeak NG)`,
      );
    }
    console.log(
      `==================================================================\n`,
    );

    if (
      process.env.OPEN_BROWSER === "1" ||
      process.env.AUTO_OPEN_BROWSER === "1"
    ) {
      const url = `http://localhost:${PORT}`;
      console.log(`[AutoBrowser] Đang mở trình duyệt: ${url}`);
      const startCmd =
        process.platform === "win32"
          ? `start "" "${url}"`
          : process.platform === "darwin"
            ? `open "${url}"`
            : `xdg-open "${url}"`;
      exec(startCmd, () => {});
    }
  });
}

startServer().catch((err) => {
  console.error("Failed to start server:", err);
});
