import fs from "fs";
import path from "path";
import { fileURLToPath } from "url";
import { spawn, spawnSync, execSync } from "child_process";
import { availableParallelism } from "node:os";

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

export interface DatasetClip {
  id: string;
  filename: string;
  text: string;
  startMs: number;
  endMs: number;
  durationSec: number;
}

export interface DatasetInfo {
  id: string;
  voiceName: string;
  createdAt: string;
  originalAudioFilename: string;
  whisperModelUsed: string;
  totalClips: number;
  totalDurationSec: number;
  clips: DatasetClip[];
}

export interface DatasetPreparationProgress {
  progressPercent: number;
  message: string;
}

const DATASETS_ROOT = path.resolve(__dirname, "datasets_storage");
if (!fs.existsSync(DATASETS_ROOT)) {
  fs.mkdirSync(DATASETS_ROOT, { recursive: true });
}

// Locate whisper-cli executable (Cross-platform: Windows .exe and Linux/macOS)
export function getWhisperCliPath(): string | null {
  const isWin = process.platform === "win32";
  const names = isWin
    ? ["whisper-cli.exe", "main.exe", "whisper-cli", "main"]
    : ["whisper-cli", "main", "whisper-cli.exe", "main.exe"];

  const searchDirs = [
    path.resolve(__dirname, "tools", "whisper.cpp", "build", "bin"),
    path.resolve(__dirname, "tools", "whisper.cpp", "build", "bin", "Release"),
    path.resolve(__dirname, "tools", "whisper.cpp", "bin"),
    path.resolve(__dirname, "tools", "whisper.cpp"),
    path.resolve(__dirname, "tools", "bin"),
    path.resolve(__dirname, "tools"),
  ];

  for (const dir of searchDirs) {
    for (const name of names) {
      const full = path.resolve(dir, name);
      if (fs.existsSync(full)) return full;
    }
  }

  return null;
}

// Locate models for whisper.cpp
export function getAvailableWhisperModels(): Array<{ id: string; name: string; sizeMb: number; available: boolean }> {
  const modelsDir = path.resolve(__dirname, "tools", "whisper.cpp", "models");
  const modelDefs = [
    { id: "base", name: "Whisper Base (140MB - Siêu nhanh)", file: "ggml-base.bin", defaultSize: 140 },
    { id: "small", name: "Whisper Small (460MB - Khuyên dùng Tiếng Việt)", file: "ggml-small.bin", defaultSize: 460 },
    { id: "medium", name: "Whisper Medium (1.5GB - Độ chính xác cao)", file: "ggml-medium.bin", defaultSize: 1500 },
    { id: "large-v3-turbo", name: "Whisper Large-v3-turbo (1.5GB - Tối tân nhất)", file: "ggml-large-v3-turbo.bin", defaultSize: 1500 },
  ];

  return modelDefs.map((m) => {
    const fullPath = path.join(modelsDir, m.file);
    const exists = fs.existsSync(fullPath);
    const size = exists ? Math.round(fs.statSync(fullPath).size / (1024 * 1024)) : m.defaultSize;
    return {
      id: m.id,
      name: m.name,
      sizeMb: size,
      available: exists,
    };
  });
}

// Text cleaner for Piper LJSpeech metadata
export function cleanPiperText(rawText: string): string {
  if (!rawText) return "";
  let text = rawText
    .replace(/[\[\]\(\)\{\}\<\>\"\'`«»“”]/g, " ")
    .replace(/\s+/g, " ")
    .trim();
  // Ensure pipe character is replaced so metadata.csv delimiter is never broken
  text = text.replace(/\|/g, ",");
  return text;
}

// List all prepared datasets
export function listDatasets(): DatasetInfo[] {
  if (!fs.existsSync(DATASETS_ROOT)) return [];
  const entries = fs.readdirSync(DATASETS_ROOT);
  const result: DatasetInfo[] = [];

  for (const entry of entries) {
    const infoPath = path.join(DATASETS_ROOT, entry, "info.json");
    if (fs.existsSync(infoPath)) {
      try {
        const info = JSON.parse(fs.readFileSync(infoPath, "utf-8")) as DatasetInfo;
        result.push(info);
      } catch (err) {
        console.error(`[Dataset] Error reading ${infoPath}:`, err);
      }
    }
  }

  return result.sort((a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime());
}

// Get specific dataset info
export function getDataset(datasetId: string): DatasetInfo | null {
  const infoPath = path.join(DATASETS_ROOT, datasetId, "info.json");
  if (!fs.existsSync(infoPath)) return null;
  try {
    return JSON.parse(fs.readFileSync(infoPath, "utf-8")) as DatasetInfo;
  } catch {
    return null;
  }
}

// Update clip text or delete clip
export function updateDatasetClip(
  datasetId: string,
  clipId: string,
  newText?: string,
  shouldDelete: boolean = false
): DatasetInfo {
  const datasetDir = path.join(DATASETS_ROOT, datasetId);
  const infoPath = path.join(datasetDir, "info.json");
  if (!fs.existsSync(infoPath)) {
    throw new Error(`Dataset ${datasetId} không tồn tại.`);
  }

  const info = JSON.parse(fs.readFileSync(infoPath, "utf-8")) as DatasetInfo;

  if (shouldDelete) {
    const clipIndex = info.clips.findIndex((c) => c.id === clipId);
    if (clipIndex !== -1) {
      const clip = info.clips[clipIndex];
      const wavPath = path.join(datasetDir, "wav", clip.filename);
      if (fs.existsSync(wavPath)) {
        try { fs.unlinkSync(wavPath); } catch {}
      }
      info.clips.splice(clipIndex, 1);
    }
  } else if (newText !== undefined) {
    const clip = info.clips.find((c) => c.id === clipId);
    if (clip) {
      clip.text = cleanPiperText(newText);
    }
  }

  // Recalculate stats
  info.totalClips = info.clips.length;
  info.totalDurationSec = Math.round(
    info.clips.reduce((sum, c) => sum + (c.durationSec || 0), 0) * 10
  ) / 10;

  // Rewrite metadata.csv
  const metadataPath = path.join(datasetDir, "metadata.csv");
  const metadataLines = info.clips.map((c) => `${c.id}|${c.text}`);
  fs.writeFileSync(metadataPath, metadataLines.join("\n"), "utf-8");

  // Rewrite info.json
  fs.writeFileSync(infoPath, JSON.stringify(info, null, 2), "utf-8");

  return info;
}

export function updateDatasetMetadata(
  datasetId: string,
  metadataText: string
): DatasetInfo {
  if (!/^[a-zA-Z0-9_-]+$/.test(datasetId)) {
    throw new Error("Mã dataset không hợp lệ.");
  }
  if (typeof metadataText !== "string") {
    throw new Error("Metadata phải là văn bản.");
  }

  const datasetDir = path.join(DATASETS_ROOT, datasetId);
  const infoPath = path.join(datasetDir, "info.json");
  if (!fs.existsSync(infoPath)) {
    throw new Error(`Dataset ${datasetId} không tồn tại.`);
  }

  const info = JSON.parse(fs.readFileSync(infoPath, "utf-8")) as DatasetInfo;
  const parsedEntries = metadataText
    .replace(/^\uFEFF/, "")
    .split(/\r?\n/)
    .map((line, index) => ({ line: line.trim(), lineNumber: index + 1 }))
    .filter(({ line }) => line.length > 0)
    .map(({ line, lineNumber }) => {
      const separatorIndex = line.indexOf("|");
      if (separatorIndex < 1) {
        throw new Error(`Dòng ${lineNumber} phải có định dạng clip_id|nội dung.`);
      }

      const clipId = line.slice(0, separatorIndex).trim();
      const text = cleanPiperText(line.slice(separatorIndex + 1));
      if (!clipId || !text) {
        throw new Error(`Dòng ${lineNumber} thiếu ID hoặc nội dung.`);
      }
      return { clipId, text, lineNumber };
    });

  if (parsedEntries.length === 0) {
    throw new Error("Metadata không có dòng nào để lưu.");
  }

  const datasetClipIds = new Set(info.clips.map((clip) => clip.id));
  const seenIds = new Set<string>();
  for (const entry of parsedEntries) {
    if (!datasetClipIds.has(entry.clipId)) {
      throw new Error(`Dòng ${entry.lineNumber} có ID không thuộc dataset: ${entry.clipId}.`);
    }
    if (seenIds.has(entry.clipId)) {
      throw new Error(`ID bị lặp ở dòng ${entry.lineNumber}: ${entry.clipId}.`);
    }
    seenIds.add(entry.clipId);
  }

  const missingIds = info.clips
    .filter((clip) => !seenIds.has(clip.id))
    .map((clip) => clip.id);
  if (missingIds.length > 0) {
    const preview = missingIds.slice(0, 10).join(", ");
    const suffix = missingIds.length > 10 ? ` và ${missingIds.length - 10} ID khác` : "";
    throw new Error(`Metadata còn thiếu ${missingIds.length} ID: ${preview}${suffix}.`);
  }

  const textById = new Map(parsedEntries.map(({ clipId, text }) => [clipId, text]));
  info.clips = info.clips.map((clip) => {
    const text = textById.get(clip.id);
    if (text === undefined) {
      throw new Error(`Không tìm thấy metadata cho ID ${clip.id}.`);
    }
    return { ...clip, text };
  });

  const metadataPath = path.join(datasetDir, "metadata.csv");
  const metadataLines = info.clips.map((clip) => `${clip.id}|${clip.text}`);
  fs.writeFileSync(metadataPath, metadataLines.join("\n"), "utf-8");
  fs.writeFileSync(infoPath, JSON.stringify(info, null, 2), "utf-8");

  return info;
}

// Delete whole dataset
export function deleteDataset(datasetId: string): boolean {
  const datasetDir = path.join(DATASETS_ROOT, datasetId);
  if (!fs.existsSync(datasetDir)) return false;
  fs.rmSync(datasetDir, { recursive: true, force: true });
  return true;
}

function runWhisper(
  whisperCli: string,
  args: string[],
  onProgress?: (progressPercent: number) => void
): Promise<void> {
  return new Promise((resolve, reject) => {
    const whisperProc = spawn(whisperCli, args, { stdio: ["ignore", "pipe", "pipe"] });
    let outputTail = "";
    let lastProgress = 0;

    const collectOutput = (chunk: Buffer) => {
      const output = chunk.toString();
      outputTail = `${outputTail}${output}`.slice(-400);

      for (const match of output.matchAll(/(\d{1,3})%/g)) {
        const progressPercent = Number(match[1]);
        if (progressPercent > lastProgress && progressPercent <= 100) {
          lastProgress = progressPercent;
          onProgress?.(progressPercent);
        }
      }
    };

    whisperProc.stdout.on("data", collectOutput);
    whisperProc.stderr.on("data", collectOutput);
    whisperProc.on("error", (error) => {
      reject(new Error(`Không thể chạy Whisper.cpp: ${error.message}`));
    });
    whisperProc.on("close", (code, signal) => {
      if (code === 0) {
        resolve();
      } else {
        const reason = outputTail.trim() || `mã thoát ${code ?? signal ?? "không xác định"}`;
        reject(new Error(`Whisper.cpp chạy thất bại: ${reason}`));
      }
    });
  });
}

// Process audio and prepare complete Piper dataset offline
export async function prepareOfflineDataset(
  audioSource: Buffer | string,
  originalFilename: string,
  voiceName: string,
  whisperModelId: string = "small",
  minDurationSec: number = 1.0,
  maxDurationSec: number = 12.0,
  onProgress?: (progress: DatasetPreparationProgress) => void,
  ffmpegPath: string = process.env.FFMPEG_PATH || "ffmpeg"
): Promise<DatasetInfo> {
  const whisperCli = getWhisperCliPath();
  if (!whisperCli) {
    throw new Error("Không tìm thấy bộ thực thi whisper-cli trên máy chủ.");
  }

  const modelsDir = path.resolve(__dirname, "tools", "whisper.cpp", "models");
  let modelFile = path.join(modelsDir, `ggml-${whisperModelId}.bin`);
  if (!fs.existsSync(modelFile)) {
    // Fallback to small or base if requested model isn't downloaded yet
    const fallback = path.join(modelsDir, "ggml-small.bin");
    const fallbackBase = path.join(modelsDir, "ggml-base.bin");
    if (fs.existsSync(fallback)) {
      modelFile = fallback;
    } else if (fs.existsSync(fallbackBase)) {
      modelFile = fallbackBase;
    } else {
      throw new Error(`Mô hình Whisper (${whisperModelId}) chưa được tải về máy chủ.`);
    }
  }

  // Clean voice ID
  const cleanVoiceId = (voiceName || "custom_voice")
    .toLowerCase()
    .trim()
    .replace(/[^a-z0-9_-]/g, "_")
    .replace(/_+/g, "_");

  const timestamp = Date.now();
  const datasetId = `${cleanVoiceId}_${timestamp}`;
  const datasetDir = path.join(DATASETS_ROOT, datasetId);
  const wavDir = path.join(datasetDir, "wav");
  const tempDir = path.join(datasetDir, "temp");

  fs.mkdirSync(datasetDir, { recursive: true });
  fs.mkdirSync(wavDir, { recursive: true });
  fs.mkdirSync(tempDir, { recursive: true });

  try {
    const inputAudioPath = typeof audioSource === "string"
      ? audioSource
      : path.join(
          tempDir,
          `input_${path.basename(originalFilename).replace(/[^a-zA-Z0-9_.-]/g, "_")}`
        );
    if (Buffer.isBuffer(audioSource)) {
      fs.writeFileSync(inputAudioPath, audioSource);
    }

    const chunkPattern = path.join(tempDir, "whisper_chunk_%04d.wav");
    onProgress?.({ progressPercent: 2, message: "Đang chia âm thanh thành các đoạn tạm..." });
    const splitResult = spawnSync(
      ffmpegPath,
      [
        "-y", "-i", inputAudioPath, "-vn",
        "-ac", "1", "-ar", "16000", "-c:a", "pcm_s16le",
        "-f", "segment", "-segment_time", "300", "-reset_timestamps", "1",
        chunkPattern,
      ],
      { stdio: "pipe" }
    );
    if (splitResult.status !== 0) {
      const err = splitResult.stderr?.toString().trim() || "FFmpeg không thể chia file âm thanh.";
      throw new Error(`Không thể chuẩn bị các đoạn âm thanh: ${err}`);
    }

    const chunkPaths = fs.readdirSync(tempDir)
      .filter((filename) => /^whisper_chunk_\d{4}\.wav$/.test(filename))
      .sort()
      .map((filename) => path.join(tempDir, filename));
    if (chunkPaths.length === 0) {
      throw new Error("FFmpeg không tạo được đoạn âm thanh nào để xử lý.");
    }

    const whisperThreads = Math.max(1, Math.min(8, availableParallelism()));
    const clips: DatasetClip[] = [];
    let clipIndex = 1;

    for (const [chunkIndex, whisperWavPath] of chunkPaths.entries()) {
      const chunkStartMs = chunkIndex * 300_000;
      const progressStart = 5 + Math.floor((chunkIndex / chunkPaths.length) * 80);
      const progressSpan = Math.max(1, Math.floor(80 / chunkPaths.length));
      const chunkName = path.basename(whisperWavPath, ".wav");
      const jsonOutPrefix = path.join(tempDir, `${chunkName}_transcription`);
      const full22kWavPath = path.join(tempDir, `${chunkName}_22050.wav`);

      onProgress?.({
        progressPercent: progressStart,
        message: `Đang phiên âm đoạn ${chunkIndex + 1}/${chunkPaths.length} bằng Whisper.cpp...`,
      });

      const ffmpeg22k = spawnSync(
        ffmpegPath,
        ["-y", "-i", whisperWavPath, "-ar", "22050", "-ac", "1", "-c:a", "pcm_s16le", full22kWavPath],
        { stdio: "pipe" }
      );
      if (ffmpeg22k.status !== 0 || !fs.existsSync(full22kWavPath)) {
        throw new Error(`Không thể chuyển đổi đoạn ${chunkIndex + 1} sang định dạng 22050Hz.`);
      }

      await runWhisper(
        whisperCli,
        [
          "-m", modelFile,
          "-f", whisperWavPath,
          "-l", "vi",
          "-oj",
          "-of", jsonOutPrefix,
          "-t", String(whisperThreads),
          "-pp",
          "--max-len", "0",
        ],
        (percent) => onProgress?.({
          progressPercent: progressStart + Math.floor((percent / 100) * progressSpan),
          message: `Đang phiên âm đoạn ${chunkIndex + 1}/${chunkPaths.length}: ${percent}%`,
        })
      );

      const jsonResultPath = `${jsonOutPrefix}.json`;
      if (!fs.existsSync(jsonResultPath)) {
        throw new Error(`Whisper.cpp không tạo kết quả cho đoạn ${chunkIndex + 1}.`);
      }

      let whisperData: any;
      try {
        whisperData = JSON.parse(fs.readFileSync(jsonResultPath, "utf-8"));
      } catch (error) {
        const message = error instanceof Error ? error.message : "JSON không hợp lệ.";
        throw new Error(`Lỗi đọc kết quả Whisper ở đoạn ${chunkIndex + 1}: ${message}`);
      }

      for (const seg of whisperData.transcription || []) {
        const cleanText = cleanPiperText(seg.text || "");
        if (!cleanText || cleanText.length < 2) continue;

        const fromMs = Number(seg.offsets?.from) || 0;
        const toMs = Number(seg.offsets?.to) || 0;
        const durationSec = (toMs - fromMs) / 1000;
        if (durationSec < minDurationSec || durationSec > maxDurationSec || toMs <= fromMs) {
          continue;
        }

        const clipId = `clip_${String(clipIndex).padStart(4, "0")}`;
        const clipFilename = `${clipId}.wav`;
        const clipDestPath = path.join(wavDir, clipFilename);
        const sliceProc = spawnSync(
          ffmpegPath,
          [
            "-y", "-ss", (fromMs / 1000).toFixed(3),
            "-i", full22kWavPath,
            "-t", durationSec.toFixed(3),
            "-c:a", "pcm_s16le",
            clipDestPath,
          ],
          { stdio: "ignore" }
        );

        if (sliceProc.status === 0 && fs.existsSync(clipDestPath)) {
          clips.push({
            id: clipId,
            filename: clipFilename,
            text: cleanText,
            startMs: chunkStartMs + fromMs,
            endMs: chunkStartMs + toMs,
            durationSec: Math.round(durationSec * 10) / 10,
          });
          clipIndex++;
        }
      }

      fs.rmSync(whisperWavPath, { force: true });
      fs.rmSync(full22kWavPath, { force: true });
      onProgress?.({
        progressPercent: 5 + Math.floor(((chunkIndex + 1) / chunkPaths.length) * 85),
        message: `Đã xử lý xong đoạn ${chunkIndex + 1}/${chunkPaths.length}.`,
      });
    }

    if (clips.length === 0) {
      throw new Error("Whisper không phát hiện được câu thoại phù hợp với khoảng thời lượng cài đặt.");
    }

    // 5. Generate metadata.csv (LJSpeech standard for Piper)
    const metadataLines = clips.map((c) => `${c.id}|${c.text}`);
    const metadataPath = path.join(datasetDir, "metadata.csv");
    fs.writeFileSync(metadataPath, metadataLines.join("\n"), "utf-8");

    // 6. Save info.json
    const totalDurationSec = Math.round(
      clips.reduce((sum, c) => sum + c.durationSec, 0) * 10
    ) / 10;

    const datasetInfo: DatasetInfo = {
      id: datasetId,
      voiceName: voiceName.trim() || cleanVoiceId,
      createdAt: new Date().toISOString(),
      originalAudioFilename: originalFilename,
      whisperModelUsed: whisperModelId,
      totalClips: clips.length,
      totalDurationSec,
      clips,
    };

    onProgress?.({ progressPercent: 99, message: "Đang lưu bộ dữ liệu..." });
    fs.writeFileSync(
      path.join(datasetDir, "info.json"),
      JSON.stringify(datasetInfo, null, 2),
      "utf-8"
    );

    return datasetInfo;
  } finally {
    fs.rmSync(tempDir, { recursive: true, force: true });
  }
}

// Generate ZIP file of dataset for Google Colab upload
export function createDatasetZip(datasetId: string): string {
  const datasetDir = path.join(DATASETS_ROOT, datasetId);
  const infoPath = path.join(datasetDir, "info.json");
  if (!fs.existsSync(infoPath)) {
    throw new Error(`Dataset ${datasetId} không tồn tại.`);
  }

  const info = JSON.parse(fs.readFileSync(infoPath, "utf-8")) as DatasetInfo;
  const zipFilename = `${datasetId}_dataset.zip`;
  const zipPath = path.join(datasetDir, zipFilename);

  // If already zipped and fresh, reuse
  if (fs.existsSync(zipPath)) {
    const zipStat = fs.statSync(zipPath);
    const metaStat = fs.statSync(path.join(datasetDir, "metadata.csv"));
    if (zipStat.mtimeMs > metaStat.mtimeMs) {
      return zipPath;
    }
  }

  // Use python3 zipfile to pack dataset/wav and dataset/metadata.csv
  const pyCode = [
    "import os, sys, zipfile",
    "dataset_dir, zip_path = sys.argv[1:3]",
    "metadata_path = os.path.join(dataset_dir, 'metadata.csv')",
    "wav_dir = os.path.join(dataset_dir, 'wav')",
    "if not os.path.isfile(metadata_path):",
    "    raise FileNotFoundError(f'Missing dataset metadata: {metadata_path}')",
    "if not os.path.isdir(wav_dir):",
    "    raise FileNotFoundError(f'Missing dataset audio directory: {wav_dir}')",
    "wav_files = sorted(name for name in os.listdir(wav_dir) if name.lower().endswith('.wav'))",
    "if not wav_files:",
    "    raise ValueError('Dataset does not contain any WAV audio clips')",
    "with zipfile.ZipFile(zip_path, 'w', zipfile.ZIP_DEFLATED) as archive:",
    "    archive.write(metadata_path, 'metadata.csv')",
    "    for name in wav_files:",
    "        archive.write(os.path.join(wav_dir, name), os.path.join('wav', name))",
  ].join("\n");
  const pythonCommand = process.platform === "win32" ? "python" : "python3";
  const zipProcess = spawnSync(pythonCommand, ["-c", pyCode, datasetDir, zipPath], {
    encoding: "utf-8",
    windowsHide: true,
  });

  if (zipProcess.error || zipProcess.status !== 0) {
    const details = zipProcess.error?.message || zipProcess.stderr?.trim() || `mã thoát ${zipProcess.status}`;
    throw new Error(`Không thể nén dataset bằng Python: ${details}`);
  }

  if (!fs.existsSync(zipPath) || fs.statSync(zipPath).size === 0) {
    throw new Error("Không thể nén file ZIP dữ liệu huấn luyện.");
  }

  return zipPath;
}
