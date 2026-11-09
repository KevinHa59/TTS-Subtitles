import fs from "fs";
import path from "path";
import { fileURLToPath } from "url";
import { spawn, spawnSync, execSync } from "child_process";
import { availableParallelism } from "node:os";
import {
  getCpuWhisperCliPath,
  getWhisperBackend as getInstalledWhisperBackend,
  getWhisperCliPath as getInstalledWhisperCliPath,
} from "./systemToolsManager";
import {
  constrainWhisperSegmentsToAudio,
  mergeShortWhisperSegments,
  splitLongWhisperSegment,
  WhisperClipSegment,
  WhisperTranscriptionSegment,
} from "./datasetTranscription";
import { getPcmWavDurationMs, isValidPiperPcmWav } from "./datasetAudio";

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

export interface DatasetChunkStatus {
  id: string;
  label: string;
  filename: string;
  origFilename: string;
  fileIndex: number;
  segmentIndex: number;
  status: "pending" | "processing" | "completed" | "failed";
  progressPercent: number;
  clipsFound?: number;
  segmentsRecognized?: number;
  segmentsTooLong?: number;
  segmentsTooShort?: number;
  segmentsRejected?: number;
  segmentsUnsplittable?: number;
  diagnostic?: string;
  error?: string;
}

export interface DatasetPreparationProgress {
  progressPercent: number;
  message: string;
  totalChunks?: number;
  completedChunks?: number;
  concurrency?: number;
  chunks?: DatasetChunkStatus[];
}

const DATASETS_ROOT = path.resolve(__dirname, "datasets_storage");
if (!fs.existsSync(DATASETS_ROOT)) {
  fs.mkdirSync(DATASETS_ROOT, { recursive: true });
}

// Locate whisper-cli executable (Cross-platform: Windows .exe and Linux/macOS)
export function getWhisperCliPath(): string | null {
  return getInstalledWhisperCliPath();
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
    const reportedBackendLines = new Set<string>();

    const collectOutput = (chunk: Buffer) => {
      const output = chunk.toString();
      outputTail = `${outputTail}${output}`.slice(-400);

      for (const line of output.split(/\r?\n/)) {
        if (
          /loaded .* backend|vulkan.*device|device.*vulkan|using device/i.test(line) &&
          !reportedBackendLines.has(line.trim())
        ) {
          reportedBackendLines.add(line.trim());
          console.info(`[OfflineDataset][Whisper.cpp] ${line.trim()}`);
        }
      }

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

// Process audio and prepare complete Piper dataset offline (with parallel concurrency & multi-file support)
export async function prepareOfflineDataset(
  audioSource: Buffer | string | (Buffer | string)[],
  originalFilename: string | string[],
  voiceName: string,
  whisperModelId: string = "small",
  minDurationSec: number = 3.0,
  maxDurationSec: number = 12.0,
  onProgress?: (progress: DatasetPreparationProgress) => void,
  ffmpegPath: string = process.env.FFMPEG_PATH || "ffmpeg",
  targetDatasetId?: string,
  concurrency: number = 2
): Promise<DatasetInfo> {
  const whisperCli = getWhisperCliPath();
  if (!whisperCli) {
    throw new Error("Không tìm thấy bộ thực thi whisper-cli trên máy chủ.");
  }
  const whisperBackend = getInstalledWhisperBackend(whisperCli);

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

  // Check if extending an existing dataset
  let datasetId = `${cleanVoiceId}_${Date.now()}`;
  let existingInfo: DatasetInfo | null = null;
  if (targetDatasetId) {
    const existingDir = path.join(DATASETS_ROOT, targetDatasetId);
    const existingInfoPath = path.join(existingDir, "info.json");
    if (fs.existsSync(existingInfoPath)) {
      try {
        existingInfo = JSON.parse(fs.readFileSync(existingInfoPath, "utf-8")) as DatasetInfo;
        datasetId = targetDatasetId;
      } catch (err) {
        console.warn(`[Dataset] Không thể đọc info.json của ${targetDatasetId}, sẽ tạo dataset mới:`, err);
      }
    }
  }

  const datasetDir = path.join(DATASETS_ROOT, datasetId);
  const wavDir = path.join(datasetDir, "wav");
  const tempDir = path.join(datasetDir, "temp");

  fs.mkdirSync(datasetDir, { recursive: true });
  fs.mkdirSync(wavDir, { recursive: true });
  fs.mkdirSync(tempDir, { recursive: true });

  if (existingInfo && Array.isArray(existingInfo.clips)) {
    const validExistingClips = existingInfo.clips.filter((clip) =>
      isValidPiperPcmWav(path.join(wavDir, clip.filename))
    );
    for (const clip of existingInfo.clips) {
      if (!validExistingClips.includes(clip)) {
        fs.rmSync(path.join(wavDir, clip.filename), { force: true });
      }
    }
    existingInfo = {
      ...existingInfo,
      clips: validExistingClips,
      totalClips: validExistingClips.length,
      totalDurationSec: Math.round(
        validExistingClips.reduce((sum, clip) => sum + (clip.durationSec || 0), 0) * 10
      ) / 10,
    };
    fs.writeFileSync(
      path.join(datasetDir, "metadata.csv"),
      validExistingClips.map((clip) => `${clip.id}|${clip.text}`).join("\n"),
      "utf-8"
    );
    fs.writeFileSync(
      path.join(datasetDir, "info.json"),
      JSON.stringify(existingInfo, null, 2),
      "utf-8"
    );
  }

  try {
    const inputSources: (Buffer | string)[] = Array.isArray(audioSource) ? audioSource : [audioSource];
    const inputFilenames: string[] = Array.isArray(originalFilename) ? originalFilename : [originalFilename];

    interface ChunkJob {
      jobId: string;
      fileIndex: number;
      segmentIndex: number;
      whisperWavPath: string;
      chunkStartMs: number;
      origFilename: string;
    }

    const allChunkJobs: ChunkJob[] = [];
    onProgress?.({ progressPercent: 2, message: "Đang phân tích và cắt các tệp âm thanh thành đoạn 16kHz..." });

    for (let fileIdx = 0; fileIdx < inputSources.length; fileIdx++) {
      const src = inputSources[fileIdx];
      const origName = inputFilenames[fileIdx] || `audio_${fileIdx + 1}.wav`;
      const safeBaseName = path.basename(origName).replace(/[^a-zA-Z0-9_.-]/g, "_");
      const inputPath = typeof src === "string"
        ? src
        : path.join(tempDir, `input_${fileIdx}_${safeBaseName}`);

      if (Buffer.isBuffer(src)) {
        fs.writeFileSync(inputPath, src);
      }

      const fileChunkPattern = path.join(tempDir, `wchunk_${fileIdx}_%04d.wav`);
      const splitResult = spawnSync(
        ffmpegPath,
        [
          "-y", "-i", inputPath, "-vn",
          "-ac", "1", "-ar", "16000", "-c:a", "pcm_s16le",
          "-f", "segment", "-segment_time", "300", "-reset_timestamps", "1",
          fileChunkPattern,
        ],
        { stdio: "pipe" }
      );

      if (splitResult.status !== 0) {
        const err = splitResult.stderr?.toString().trim() || `FFmpeg không thể chia tệp âm thanh #${fileIdx + 1}.`;
        throw new Error(`Không thể chuẩn bị đoạn âm thanh cho ${origName}: ${err}`);
      }

      const chunkFiles = fs.readdirSync(tempDir)
        .filter((fn) => new RegExp(`^wchunk_${fileIdx}_\\d{4}\\.wav$`).test(fn))
        .sort();

      for (let sIdx = 0; sIdx < chunkFiles.length; sIdx++) {
        allChunkJobs.push({
          jobId: `f${fileIdx}_s${sIdx}`,
          fileIndex: fileIdx,
          segmentIndex: sIdx,
          whisperWavPath: path.join(tempDir, chunkFiles[sIdx]),
          chunkStartMs: sIdx * 300_000,
          origFilename: origName,
        });
      }
    }

    if (allChunkJobs.length === 0) {
      throw new Error("FFmpeg không tạo được đoạn âm thanh nào để xử lý.");
    }

    const requestedConcurrency = Math.max(1, Math.min(8, Number(concurrency) || 2));
    const effectiveConcurrency = Math.min(
      whisperBackend === "vulkan" ? 1 : requestedConcurrency,
      allChunkJobs.length,
    );
    const totalCores = availableParallelism();
    const threadsPerJob = Math.max(1, Math.min(8, Math.floor(totalCores / effectiveConcurrency)));

    console.log(
      `[OfflineDataset] Bắt đầu phiên âm song song: ${allChunkJobs.length} đoạn với ${effectiveConcurrency} tiến trình đồng thời (mỗi tiến trình ${threadsPerJob} threads)...`
    );

    const chunksStatus: DatasetChunkStatus[] = allChunkJobs.map((cj, idx) => {
      const startSec = Math.floor(cj.chunkStartMs / 1000);
      const endSec = startSec + 300;
      const formatTime = (s: number) => {
        const m = Math.floor(s / 60);
        const sec = s % 60;
        return `${String(m).padStart(2, "0")}:${String(sec).padStart(2, "0")}`;
      };
      return {
        id: cj.jobId,
        label: `Đoạn ${idx + 1}/${allChunkJobs.length} (${formatTime(startSec)} - ${formatTime(endSec)})`,
        filename: path.basename(cj.whisperWavPath),
        origFilename: cj.origFilename,
        fileIndex: cj.fileIndex,
        segmentIndex: cj.segmentIndex,
        status: "pending",
        progressPercent: 0,
        clipsFound: 0,
      };
    });

    let completedChunks = 0;
    let vulkanRuntimeFailed = false;

    const emitProgress = (message: string) => {
      const sumProgress = chunksStatus.reduce(
        (acc, c) => acc + (c.status === "completed" ? 100 : c.progressPercent),
        0
      );
      const avg = chunksStatus.length > 0 ? sumProgress / chunksStatus.length : 0;
      const overallPercent = 5 + Math.floor(avg * 0.75);
      onProgress?.({
        progressPercent: Math.min(80, Math.max(5, overallPercent)),
        message,
        totalChunks: allChunkJobs.length,
        completedChunks,
        concurrency: effectiveConcurrency,
        chunks: chunksStatus.map((c) => ({ ...c })),
      });
    };

    emitProgress(
      `Đã chia thành ${allChunkJobs.length} đoạn. Bắt đầu phiên âm với ${effectiveConcurrency} tiến trình song song...`
    );

    interface RawClipResult {
      fileIndex: number;
      startMs: number;
      endMs: number;
      durationSec: number;
      text: string;
      full22kWavPath: string;
      fromMs: number;
    }

    const rawClips: RawClipResult[] = [];
    let jobQueueIndex = 0;

    const runWorker = async (workerId: number) => {
      while (true) {
        const currentIndex = jobQueueIndex++;
        if (currentIndex >= allChunkJobs.length) {
          break;
        }

        const chunkJob = allChunkJobs[currentIndex];
        const chunkName = path.basename(chunkJob.whisperWavPath, ".wav");
        const jsonOutPrefix = path.join(tempDir, `${chunkName}_transcription`);
        const full22kWavPath = path.join(tempDir, `${chunkName}_22050.wav`);

        chunksStatus[currentIndex].status = "processing";
        chunksStatus[currentIndex].progressPercent = 1;
        emitProgress(
          `Đang xử lý ${effectiveConcurrency} tiến trình song song: bắt đầu đoạn ${currentIndex + 1}/${allChunkJobs.length}...`
        );

        // Convert chunk to 22050Hz mono for crisp dataset slicing
        const ffmpeg22k = spawnSync(
          ffmpegPath,
          ["-y", "-i", chunkJob.whisperWavPath, "-ar", "22050", "-ac", "1", "-c:a", "pcm_s16le", full22kWavPath],
          { stdio: "pipe" }
        );
        if (ffmpeg22k.status !== 0 || !fs.existsSync(full22kWavPath)) {
          chunksStatus[currentIndex].status = "failed";
          chunksStatus[currentIndex].error = "Lỗi chuyển đổi 22050Hz";
          throw new Error(`Không thể chuyển đổi đoạn ${chunkName} sang định dạng 22050Hz.`);
        }
        const audioDurationMs = getPcmWavDurationMs(full22kWavPath);
        if (audioDurationMs <= 0) {
          chunksStatus[currentIndex].status = "failed";
          chunksStatus[currentIndex].error = "Đoạn audio không có dữ liệu PCM hợp lệ";
          throw new Error(`Đoạn ${chunkName} không có âm thanh PCM 22050Hz hợp lệ.`);
        }

        // Run whisper.cpp with real-time percentage callback
        const useVulkanForChunk = whisperBackend === "vulkan" && !vulkanRuntimeFailed;
        const cpuWhisperCli = whisperBackend === "vulkan" ? getCpuWhisperCliPath() : null;
        const activeWhisperCli = useVulkanForChunk
          ? whisperCli
          : cpuWhisperCli || whisperCli;
        const whisperArgs = [
          "-m", modelFile,
          "-f", chunkJob.whisperWavPath,
          "-l", "vi",
          "-ojf",
          "-of", jsonOutPrefix,
          "-t", String(threadsPerJob),
          "-pp",
          "--split-on-word",
        ];
        const onWhisperProgress = (percent: number) => {
          chunksStatus[currentIndex].progressPercent = Math.min(99, percent);
          emitProgress(
            `Đang phiên âm: ${completedChunks}/${allChunkJobs.length} đoạn xong (đoạn ${currentIndex + 1} đạt ${percent}%)...`
          );
        };
        if (useVulkanForChunk) {
          whisperArgs.push("--device", "0");
        }

        const jsonResultPath = `${jsonOutPrefix}.json`;
        try {
          await runWhisper(activeWhisperCli, whisperArgs, onWhisperProgress);
        } catch (error) {
          const cpuCli = useVulkanForChunk ? getCpuWhisperCliPath() : null;
          if (!cpuCli || path.resolve(cpuCli) === path.resolve(whisperCli)) throw error;

          vulkanRuntimeFailed = true;
          const reason = error instanceof Error ? error.message : String(error);
          console.warn(`[OfflineDataset] Vulkan Whisper thất bại; chuyển sang CPU: ${reason}`);
          emitProgress(`GPU Vulkan gặp lỗi ở đoạn ${currentIndex + 1}; đang chạy lại đoạn này bằng CPU...`);
          fs.rmSync(jsonResultPath, { force: true });
          await runWhisper(cpuCli, whisperArgs.slice(0, -2), onWhisperProgress);
        }

        if (!fs.existsSync(jsonResultPath)) {
          chunksStatus[currentIndex].status = "failed";
          chunksStatus[currentIndex].error = "Không có kết quả JSON";
          throw new Error(`Whisper.cpp không tạo kết quả cho đoạn ${chunkName}.`);
        }

        let whisperData: any;
        try {
          whisperData = JSON.parse(fs.readFileSync(jsonResultPath, "utf-8"));
        } catch (error) {
          chunksStatus[currentIndex].status = "failed";
          const message = error instanceof Error ? error.message : "JSON không hợp lệ.";
          throw new Error(`Lỗi đọc kết quả Whisper ở đoạn ${chunkName}: ${message}`);
        }

        let clipsInThisChunk = 0;
        let segmentsTooLong = 0;
        let segmentsTooShort = 0;
        let segmentsRejected = 0;
        let segmentsUnsplittable = 0;
        let segmentsOutsideAudio = 0;
        const candidatePieces: WhisperClipSegment[] = [];
        const transcription = Array.isArray(whisperData.transcription) ? whisperData.transcription : [];
        for (const seg of transcription) {
          const pieces = splitLongWhisperSegment(
            seg as WhisperTranscriptionSegment,
            maxDurationSec,
            minDurationSec,
          );
          if (!pieces) {
            const segmentFromMs = Number(seg.offsets?.from);
            const segmentToMs = Number(seg.offsets?.to);
            if (
              Number.isFinite(segmentFromMs) &&
              Number.isFinite(segmentToMs) &&
              segmentToMs - segmentFromMs > maxDurationSec * 1000
            ) {
              segmentsTooLong++;
              segmentsUnsplittable++;
            } else {
              segmentsRejected++;
            }
            continue;
          }

          for (const piece of pieces) {
            const cleanText = cleanPiperText(piece.text);
            if (!cleanText || cleanText.length < 2) {
              segmentsRejected++;
              continue;
            }
            const durationSec = (piece.toMs - piece.fromMs) / 1000;
            if (durationSec > maxDurationSec) {
              segmentsTooLong++;
              continue;
            }
            candidatePieces.push({ ...piece, text: cleanText });
          }
        }

        const usablePieces = mergeShortWhisperSegments(
          candidatePieces,
          minDurationSec,
          maxDurationSec,
        );
        segmentsTooShort = usablePieces.rejectedCount;
        const boundedPieces = constrainWhisperSegmentsToAudio(
          usablePieces.segments,
          audioDurationMs,
          minDurationSec,
        );
        segmentsOutsideAudio = boundedPieces.rejectedCount;
        segmentsRejected += segmentsOutsideAudio;
        for (const piece of boundedPieces.segments) {
          const durationSec = (piece.toMs - piece.fromMs) / 1000;
          rawClips.push({
            fileIndex: chunkJob.fileIndex,
            startMs: chunkJob.chunkStartMs + piece.fromMs,
            endMs: chunkJob.chunkStartMs + piece.toMs,
            durationSec: Math.round(durationSec * 1000) / 1000,
            text: cleanPiperText(piece.text),
            full22kWavPath,
            fromMs: piece.fromMs,
          });
          clipsInThisChunk++;
        }

        fs.rmSync(chunkJob.whisperWavPath, { force: true });
        completedChunks++;
        chunksStatus[currentIndex].status = "completed";
        chunksStatus[currentIndex].progressPercent = 100;
        chunksStatus[currentIndex].clipsFound = clipsInThisChunk;
        chunksStatus[currentIndex].segmentsRecognized = transcription.length;
        chunksStatus[currentIndex].segmentsTooLong = segmentsTooLong;
        chunksStatus[currentIndex].segmentsTooShort = segmentsTooShort;
        chunksStatus[currentIndex].segmentsRejected = segmentsRejected;
        chunksStatus[currentIndex].segmentsUnsplittable = segmentsUnsplittable;
        if (clipsInThisChunk === 0) {
          chunksStatus[currentIndex].diagnostic = transcription.length === 0
            ? "Whisper không nhận diện được đoạn thoại nào trong chunk này."
            : `Whisper nhận diện ${transcription.length} đoạn nhưng không tạo clip: ${segmentsTooLong} đoạn dài hơn ${maxDurationSec}s (${segmentsUnsplittable} đoạn thiếu timestamp từ để tách), ${segmentsTooShort} đoạn ngắn hơn ${minDurationSec}s, ${segmentsOutsideAudio} đoạn có timestamp vượt thời lượng audio, ${segmentsRejected - segmentsOutsideAudio} đoạn thiếu nội dung hoặc thời gian hợp lệ.`;
        } else if (segmentsTooLong || segmentsTooShort || segmentsRejected) {
          chunksStatus[currentIndex].diagnostic =
            `Đã bỏ qua ${segmentsTooLong + segmentsTooShort + segmentsRejected} đoạn: ${segmentsTooLong} quá dài (${segmentsUnsplittable} đoạn không đủ timestamp để tách), ${segmentsTooShort} quá ngắn, ${segmentsOutsideAudio} đoạn có timestamp vượt thời lượng audio, ${segmentsRejected - segmentsOutsideAudio} đoạn thiếu nội dung/thời gian hợp lệ.`;
        }

        emitProgress(
          `Đã hoàn tất đoạn ${currentIndex + 1}/${allChunkJobs.length} (${clipsInThisChunk} câu thoại).`
        );
      }
    };

    // Run worker pool
    const workers = Array.from({ length: effectiveConcurrency }, (_, i) => runWorker(i));
    await Promise.all(workers);

    if (rawClips.length === 0) {
      throw new Error("Whisper không phát hiện được câu thoại phù hợp với khoảng thời lượng cài đặt.");
    }

    // Sort raw clips chronologically by fileIndex and startMs
    rawClips.sort((a, b) => {
      if (a.fileIndex !== b.fileIndex) return a.fileIndex - b.fileIndex;
      return a.startMs - b.startMs;
    });

    // Find starting clipIndex if extending
    let clipIndex = 1;
    if (existingInfo && Array.isArray(existingInfo.clips)) {
      for (const c of existingInfo.clips) {
        const match = c.id.match(/\d+/);
        if (match) {
          const num = parseInt(match[0], 10);
          if (num >= clipIndex) clipIndex = num + 1;
        }
      }
    }

    onProgress?.({
      progressPercent: 82,
      message: `Đang trích xuất ${rawClips.length} câu thoại chuẩn 22050Hz vào bộ dữ liệu...`,
      totalChunks: allChunkJobs.length,
      completedChunks,
      concurrency: effectiveConcurrency,
      chunks: chunksStatus.map((c) => ({ ...c })),
    });

    const newClips: DatasetClip[] = [];
    const used22kFiles = new Set<string>();

    for (const [idx, clipData] of rawClips.entries()) {
      used22kFiles.add(clipData.full22kWavPath);
      const clipId = `clip_${String(clipIndex).padStart(4, "0")}`;
      const clipFilename = `${clipId}.wav`;
      const clipDestPath = path.join(wavDir, clipFilename);

      const sliceProc = spawnSync(
        ffmpegPath,
        [
          "-y", "-ss", (clipData.fromMs / 1000).toFixed(3),
          "-i", clipData.full22kWavPath,
          "-t", clipData.durationSec.toFixed(3),
          "-ar", "22050",
          "-ac", "1",
          "-c:a", "pcm_s16le",
          clipDestPath,
        ],
        { stdio: "pipe" }
      );

      if (sliceProc.status !== 0 || !fs.existsSync(clipDestPath)) {
        const details = sliceProc.error?.message ||
          sliceProc.stderr?.toString().trim() ||
          `mã thoát ${sliceProc.status}`;
        throw new Error(`Không thể trích xuất ${clipFilename}: ${details}`);
      }
      if (!isValidPiperPcmWav(clipDestPath)) {
        fs.rmSync(clipDestPath, { force: true });
        throw new Error(
          `FFmpeg không trích được dữ liệu âm thanh hợp lệ cho ${clipFilename}; dataset chưa được lưu clip rỗng.`,
        );
      }

      newClips.push({
        id: clipId,
        filename: clipFilename,
        text: clipData.text,
        startMs: clipData.startMs,
        endMs: clipData.endMs,
        durationSec: clipData.durationSec,
      });
      clipIndex++;

      if ((idx + 1) % 10 === 0 || idx === rawClips.length - 1) {
        const sliceProgress = 82 + Math.floor(((idx + 1) / rawClips.length) * 15);
        onProgress?.({
          progressPercent: sliceProgress,
          message: `Đã trích xuất ${idx + 1}/${rawClips.length} câu thoại...`,
          totalChunks: allChunkJobs.length,
          completedChunks,
          concurrency: effectiveConcurrency,
          chunks: chunksStatus.map((c) => ({ ...c })),
        });
      }
    }

    // Clean up all 22k temporary files
    for (const f of used22kFiles) {
      fs.rmSync(f, { force: true });
    }

    if (newClips.length === 0) {
      throw new Error("Không thể trích xuất các đoạn âm thanh từ kết quả phiên âm.");
    }

    // Combine existing clips with new clips
    const allClips: DatasetClip[] = existingInfo ? [...existingInfo.clips, ...newClips] : newClips;

    // 5. Generate metadata.csv (LJSpeech standard for Piper)
    const metadataLines = allClips.map((c) => `${c.id}|${c.text}`);
    const metadataPath = path.join(datasetDir, "metadata.csv");
    fs.writeFileSync(metadataPath, metadataLines.join("\n"), "utf-8");

    // Clear stale dataset zip if exists so new zip will be generated on download
    const zipPath = path.join(datasetDir, `${datasetId}_dataset.zip`);
    if (fs.existsSync(zipPath)) {
      try {
        fs.rmSync(zipPath, { force: true });
      } catch {}
    }

    // 6. Save info.json
    const totalDurationSec = Math.round(
      allClips.reduce((sum, c) => sum + c.durationSec, 0) * 10
    ) / 10;

    const originalAudioString = inputFilenames.join(", ");
    const datasetInfo: DatasetInfo = {
      id: datasetId,
      voiceName: (existingInfo?.voiceName || voiceName).trim() || cleanVoiceId,
      createdAt: existingInfo?.createdAt || new Date().toISOString(),
      originalAudioFilename: existingInfo
        ? (existingInfo.originalAudioFilename.includes(originalAudioString)
            ? existingInfo.originalAudioFilename
            : `${existingInfo.originalAudioFilename}, ${originalAudioString}`)
        : originalAudioString,
      whisperModelUsed: whisperModelId,
      totalClips: allClips.length,
      totalDurationSec,
      clips: allClips,
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
  const wavDir = path.join(datasetDir, "wav");
  const validClips = info.clips.filter((clip) =>
    isValidPiperPcmWav(path.join(wavDir, clip.filename))
  );
  const validFilenames = new Set(validClips.map((clip) => clip.filename));

  if (validClips.length !== info.clips.length) {
    for (const clip of info.clips) {
      if (!validFilenames.has(clip.filename)) {
        fs.rmSync(path.join(wavDir, clip.filename), { force: true });
      }
    }
    info.clips = validClips;
    info.totalClips = validClips.length;
    info.totalDurationSec = Math.round(
      validClips.reduce((sum, clip) => sum + (clip.durationSec || 0), 0) * 10
    ) / 10;
    fs.writeFileSync(infoPath, JSON.stringify(info, null, 2), "utf-8");
  }

  const metadataPath = path.join(datasetDir, "metadata.csv");
  if (fs.existsSync(metadataPath)) {
    const validMetadataLines = fs.readFileSync(metadataPath, "utf-8")
      .split(/\r?\n/)
      .filter((line) => {
        const clipId = line.split("|", 1)[0]?.trim();
        return Boolean(clipId && validFilenames.has(`${clipId}.wav`));
      });
    fs.writeFileSync(metadataPath, validMetadataLines.join("\n"), "utf-8");
  }

  const hasInvalidClips = info.clips.some((clip) => {
    const wavPath = path.join(wavDir, clip.filename);
    return !isValidPiperPcmWav(wavPath);
  });

  // If already zipped and fresh, reuse
  if (fs.existsSync(zipPath) && !hasInvalidClips) {
    const zipStat = fs.statSync(zipPath);
    const metaStat = fs.statSync(path.join(datasetDir, "metadata.csv"));
    if (
      zipStat.mtimeMs > metaStat.mtimeMs &&
      zipStat.mtimeMs > fs.statSync(infoPath).mtimeMs
    ) {
      return zipPath;
    }
  }

  // Filter invalid WAV clips in legacy datasets before making the training archive.
  const pyCode = [
    "import os, sys, wave, zipfile, struct",
    "dataset_dir, zip_path = sys.argv[1:3]",
    "metadata_path = os.path.join(dataset_dir, 'metadata.csv')",
    "wav_dir = os.path.join(dataset_dir, 'wav')",
    "if not os.path.isfile(metadata_path):",
    "    raise FileNotFoundError(f'Missing dataset metadata: {metadata_path}')",
    "if not os.path.isdir(wav_dir):",
    "    raise FileNotFoundError(f'Missing dataset audio directory: {wav_dir}')",
    "rows = []",
    "wav_files = []",
    "with open(metadata_path, 'r', encoding='utf-8-sig') as source:",
    "    for line in source:",
    "        row = line.rstrip('\\r\\n')",
    "        if not row or '|' not in row:",
    "            continue",
    "        clip_id = row.split('|', 1)[0].strip()",
    "        name = clip_id + '.wav'",
    "        wav_path = os.path.join(wav_dir, name)",
    "        try:",
    "            with wave.open(wav_path, 'rb') as audio:",
    "                nframes = audio.getnframes()",
    "                base_valid = (nframes > 0 and audio.getframerate() == 22050 and audio.getnchannels() == 1 and audio.getsampwidth() == 2)",
    "                pcm = audio.readframes(nframes) if base_valid else b''",
    "                has_audio = len(pcm) >= 2 and any(sample != 0 for sample in struct.unpack('<' + 'h' * (len(pcm) // 2), pcm[:len(pcm) // 2 * 2]))",
    "                valid = base_valid and has_audio",
    "        except (OSError, EOFError, wave.Error):",
    "            valid = False",
    "        if valid:",
    "            rows.append(row)",
    "            wav_files.append(name)",
    "if not wav_files:",
    "    raise ValueError('Dataset does not contain any valid Piper WAV audio clips')",
    "with zipfile.ZipFile(zip_path, 'w', zipfile.ZIP_DEFLATED) as archive:",
    "    archive.writestr('metadata.csv', '\\n'.join(rows))",
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
