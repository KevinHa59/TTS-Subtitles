import fs from "fs";
import path from "path";
import { fileURLToPath } from "url";
import { spawnSync, execSync } from "child_process";

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

const DATASETS_ROOT = path.resolve(__dirname, "datasets_storage");
if (!fs.existsSync(DATASETS_ROOT)) {
  fs.mkdirSync(DATASETS_ROOT, { recursive: true });
}

// Locate whisper-cli executable
export function getWhisperCliPath(): string | null {
  const candidates = [
    path.resolve(__dirname, "tools", "whisper.cpp", "build", "bin", "whisper-cli"),
    path.resolve(__dirname, "tools", "whisper.cpp", "build", "bin", "main"),
    path.resolve(__dirname, "tools", "whisper.cpp", "main"),
    "whisper-cli",
  ];
  for (const c of candidates) {
    if (fs.existsSync(c)) return c;
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

// Delete whole dataset
export function deleteDataset(datasetId: string): boolean {
  const datasetDir = path.join(DATASETS_ROOT, datasetId);
  if (!fs.existsSync(datasetDir)) return false;
  fs.rmSync(datasetDir, { recursive: true, force: true });
  return true;
}

// Process audio and prepare complete Piper dataset offline
export async function prepareOfflineDataset(
  audioBuffer: Buffer,
  originalFilename: string,
  voiceName: string,
  whisperModelId: string = "small",
  minDurationSec: number = 1.0,
  maxDurationSec: number = 12.0
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

  // Save original input audio
  const inputAudioPath = path.join(tempDir, `input_${originalFilename}`);
  fs.writeFileSync(inputAudioPath, audioBuffer);

  // 1. Resample to 16kHz mono WAV for whisper-cli input
  const whisperWavPath = path.join(tempDir, "whisper_input_16k.wav");
  const ffmpegResample = spawnSync(
    "ffmpeg",
    ["-y", "-i", inputAudioPath, "-ar", "16000", "-ac", "1", "-c:a", "pcm_s16le", whisperWavPath],
    { stdio: "pipe" }
  );
  if (ffmpegResample.status !== 0 || !fs.existsSync(whisperWavPath)) {
    const err = ffmpegResample.stderr?.toString() || "FFmpeg lỗi chuyển đổi 16kHz.";
    throw new Error(`Không thể chuẩn hóa file âm thanh: ${err}`);
  }

  // 2. Also resample original to full 22050Hz mono 16-bit PCM for clean slicing
  const full22kWavPath = path.join(tempDir, "full_audio_22050.wav");
  const ffmpeg22k = spawnSync(
    "ffmpeg",
    ["-y", "-i", inputAudioPath, "-ar", "22050", "-ac", "1", "-c:a", "pcm_s16le", full22kWavPath],
    { stdio: "pipe" }
  );
  if (ffmpeg22k.status !== 0 || !fs.existsSync(full22kWavPath)) {
    throw new Error("Không thể chuyển đổi âm thanh sang định dạng 22050Hz chuẩn của Piper.");
  }

  // 3. Run whisper-cli with Vietnamese language and JSON timestamp output
  const jsonOutPrefix = path.join(tempDir, "whisper_out");
  const whisperProc = spawnSync(
    whisperCli,
    [
      "-m", modelFile,
      "-f", whisperWavPath,
      "-l", "vi",
      "-oj",
      "-of", jsonOutPrefix,
      "-t", "2",
      "--max-len", "0",
    ],
    { stdio: "pipe" }
  );

  const jsonResultPath = `${jsonOutPrefix}.json`;
  if (!fs.existsSync(jsonResultPath)) {
    const errMsg = whisperProc.stderr?.toString() || whisperProc.stdout?.toString() || "Whisper.cpp không tạo được kết quả phiên âm.";
    throw new Error(`Whisper AI nhận diện thất bại: ${errMsg.slice(-400)}`);
  }

  // 4. Parse JSON segments
  const jsonRaw = fs.readFileSync(jsonResultPath, "utf-8");
  let whisperData: any = {};
  try {
    whisperData = JSON.parse(jsonRaw);
  } catch (e: any) {
    throw new Error(`Lỗi đọc JSON Whisper: ${e.message}`);
  }

  const rawSegments = whisperData.transcription || [];
  if (!rawSegments || rawSegments.length === 0) {
    throw new Error("Whisper AI không phát hiện được giọng nói nào trong file âm thanh này.");
  }

  const clips: DatasetClip[] = [];
  let clipIndex = 1;

  for (const seg of rawSegments) {
    const rawText = seg.text || "";
    const cleanText = cleanPiperText(rawText);

    // Skip segments without usable text
    if (!cleanText || cleanText.length < 2) continue;

    const fromMs = seg.offsets?.from ?? 0;
    const toMs = seg.offsets?.to ?? 0;
    const durationSec = (toMs - fromMs) / 1000.0;

    // Filter duration
    if (durationSec < minDurationSec || durationSec > maxDurationSec) {
      continue;
    }

    const clipId = `clip_${String(clipIndex).padStart(4, "0")}`;
    const clipFilename = `${clipId}.wav`;
    const clipDestPath = path.join(wavDir, clipFilename);

    // Precise slice using FFmpeg from full22kWavPath
    const startSec = (fromMs / 1000.0).toFixed(3);
    const endSec = (toMs / 1000.0).toFixed(3);

    const sliceProc = spawnSync(
      "ffmpeg",
      [
        "-y",
        "-ss", startSec,
        "-to", endSec,
        "-i", full22kWavPath,
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
        startMs: fromMs,
        endMs: toMs,
        durationSec: Math.round(durationSec * 10) / 10,
      });
      clipIndex++;
    }
  }

  if (clips.length === 0) {
    throw new Error("Không trích xuất được câu nào phù hợp với khoảng thời lượng cài đặt.");
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

  fs.writeFileSync(
    path.join(datasetDir, "info.json"),
    JSON.stringify(datasetInfo, null, 2),
    "utf-8"
  );

  // Clean temp files to save disk
  try {
    fs.rmSync(tempDir, { recursive: true, force: true });
  } catch {}

  return datasetInfo;
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
  const pyCode = `
import zipfile, os
dataset_dir = r"${datasetDir.replace(/\\/g, "/")}"
zip_path = r"${zipPath.replace(/\\/g, "/")}"

with zipfile.ZipFile(zip_path, 'w', zipfile.ZIP_DEFLATED) as z:
    meta_path = os.path.join(dataset_dir, 'metadata.csv')
    if os.path.exists(meta_path):
        z.write(meta_path, 'metadata.csv')
    wav_dir = os.path.join(dataset_dir, 'wav')
    if os.path.exists(wav_dir):
        for f in sorted(os.listdir(wav_dir)):
            if f.endswith('.wav'):
                z.write(os.path.join(wav_dir, f), os.path.join('wav', f))
`;

  execSync(`python3 -c '${pyCode.replace(/'/g, "'\\''")}'`);

  if (!fs.existsSync(zipPath)) {
    throw new Error("Không thể nén file ZIP dữ liệu huấn luyện.");
  }

  return zipPath;
}
