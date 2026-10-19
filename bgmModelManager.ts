import fs from "fs";
import path from "path";
import os from "os";
import https from "https";
import http from "http";
import { URL } from "url";
import {
  BgmModelInfo,
  BgmSystemStatus,
  ModelDownloadStatus,
  BgmGenerateRequest,
  BgmTrack,
} from "./src/types/bgm";

const MODELS_BASE_DIR = path.resolve("./models/music");
if (!fs.existsSync(MODELS_BASE_DIR)) {
  fs.mkdirSync(MODELS_BASE_DIR, { recursive: true });
}

interface ActiveDownload {
  modelId: string;
  request: http.ClientRequest | null;
  downloadedBytes: number;
  totalBytes: number;
  startTime: number;
  lastSpeedCheckTime: number;
  lastBytes: number;
  currentSpeedMb: number;
  tempFilePath: string;
  error?: string;
}

const activeDownloads = new Map<string, ActiveDownload>();

// Available AI Models specification (Downloaded ON-DEMAND only)
export const AVAILABLE_MODELS: Record<string, {
  name: string;
  description: string;
  sizeFormatted: string;
  sizeBytes: number;
  ramRequired: string;
  recommendedFor: string;
  targetFilename: string;
  downloadUrls: string[];
}> = {
  "musicgen-small": {
    name: "Meta MusicGen Small (Neural Melody & Cinematic BGM)",
    description: "Mô hình nơ-ron học sâu sinh giai điệu, hòa âm đa nhạc cụ từ văn bản. Hoàn hảo cho nhạc nền truyện ma, trinh thám, kiếm hiệp, lofi.",
    sizeFormatted: "~1.2 GB",
    sizeBytes: 1250000000,
    ramRequired: "~4 GB RAM khả dụng",
    recommendedFor: "Khuyên dùng cho CPU đa nhân, RAM tự do >= 6GB",
    targetFilename: "musicgen_small_weights.bin",
    downloadUrls: [
      "https://huggingface.co/facebook/musicgen-small/resolve/main/model.safetensors",
      "https://hf-mirror.com/facebook/musicgen-small/resolve/main/model.safetensors"
    ],
  },
  "audioldm-soundscape": {
    name: "AudioLDM Soundscape (Atmospheric & Horror Drone)",
    description: "Mô hình khuếch tán âm học chuyên về ambient ma mị, không gian rùng rợn, tiếng động môi trường điện ảnh cho truyện đêm muộn.",
    sizeFormatted: "~680 MB",
    sizeBytes: 680000000,
    ramRequired: "~2.5 GB RAM khả dụng",
    recommendedFor: "Nhẹ hơn, phù hợp CPU, sinh không gian âm u kinh dị cực tốt",
    targetFilename: "audioldm_weights.bin",
    downloadUrls: [
      "https://huggingface.co/cvssp/audioldm-s-small-v2/resolve/main/diffusion_pytorch_model.bin",
      "https://hf-mirror.com/cvssp/audioldm-s-small-v2/resolve/main/diffusion_pytorch_model.bin"
    ],
  },
};

/**
 * Get current system RAM and models status
 */
export function getBgmSystemStatus(): BgmSystemStatus {
  const totalMem = os.totalmem();
  const freeMem = os.freemem();
  const ramTotalMb = Math.round(totalMem / (1024 * 1024));
  const ramFreeMb = Math.round(freeMem / (1024 * 1024));
  const ramFreePercent = Math.round((freeMem / totalMem) * 100);

  const models: BgmModelInfo[] = Object.entries(AVAILABLE_MODELS).map(
    ([id, spec]) => {
      const modelDir = path.join(MODELS_BASE_DIR, id);
      const targetFile = path.join(modelDir, spec.targetFilename);
      const active = activeDownloads.get(id);

      let status: ModelDownloadStatus = "not_downloaded";
      let downloadProgress = 0;
      let downloadedBytes = 0;
      let totalBytes = spec.sizeBytes;
      let downloadSpeedMb = 0;
      let error: string | undefined = undefined;

      if (active) {
        status = "downloading";
        downloadedBytes = active.downloadedBytes;
        totalBytes = active.totalBytes || spec.sizeBytes;
        downloadProgress = totalBytes > 0
          ? Math.min(99, Math.round((downloadedBytes / totalBytes) * 100))
          : 0;
        downloadSpeedMb = active.currentSpeedMb;
        error = active.error;
      } else if (fs.existsSync(targetFile)) {
        try {
          const stat = fs.statSync(targetFile);
          // If file is at least 10MB or matches expected size
          if (stat.size > 10 * 1024 * 1024) {
            status = "ready";
            downloadProgress = 100;
            downloadedBytes = stat.size;
            totalBytes = stat.size;
          }
        } catch {
          status = "not_downloaded";
        }
      }

      return {
        id,
        name: spec.name,
        description: spec.description,
        sizeFormatted: spec.sizeFormatted,
        sizeBytes: spec.sizeBytes,
        ramRequired: spec.ramRequired,
        recommendedFor: spec.recommendedFor,
        status,
        downloadProgress,
        downloadedBytes,
        totalBytes,
        downloadSpeedMb,
        localPath: status === "ready" ? targetFile : undefined,
        error,
      };
    }
  );

  return {
    ramTotalMb,
    ramFreeMb,
    ramFreePercent,
    models,
  };
}

/**
 * Check if a specific model is ready on disk
 */
export function isModelReady(modelId: string): boolean {
  const spec = AVAILABLE_MODELS[modelId];
  if (!spec) return false;
  const targetFile = path.join(MODELS_BASE_DIR, modelId, spec.targetFilename);
  if (!fs.existsSync(targetFile)) return false;
  try {
    const stat = fs.statSync(targetFile);
    return stat.size > 10 * 1024 * 1024;
  } catch {
    return false;
  }
}

/**
 * Helper to download file with redirect following
 */
function downloadFileWithRedirect(
  targetUrl: string,
  destPath: string,
  activeState: ActiveDownload,
  onComplete: () => void,
  onError: (err: Error) => void,
  redirectCount = 0
) {
  if (redirectCount > 8) {
    return onError(new Error("Quá nhiều lần chuyển hướng (Too many redirects)"));
  }

  const parsedUrl = new URL(targetUrl);
  const protocol = parsedUrl.protocol === "https:" ? https : http;

  const req = protocol.get(
    targetUrl,
    {
      headers: {
        "User-Agent": "PiperTTS-BgmDownloader/1.0",
        Accept: "*/*",
      },
    },
    (res) => {
      // Handle redirect
      if (
        res.statusCode &&
        [301, 302, 303, 307, 308].includes(res.statusCode) &&
        res.headers.location
      ) {
        const nextUrl = new URL(res.headers.location, targetUrl).toString();
        res.resume();
        return downloadFileWithRedirect(
          nextUrl,
          destPath,
          activeState,
          onComplete,
          onError,
          redirectCount + 1
        );
      }

      if (res.statusCode && res.statusCode >= 400) {
        res.resume();
        return onError(
          new Error(`Máy chủ trả về mã lỗi HTTP ${res.statusCode}: ${res.statusMessage}`)
        );
      }

      const contentLength = res.headers["content-length"];
      if (contentLength) {
        const parsedLength = parseInt(contentLength, 10);
        if (!isNaN(parsedLength) && parsedLength > 0) {
          activeState.totalBytes = parsedLength;
        }
      }

      const fileStream = fs.createWriteStream(destPath, { flags: "w" });

      res.on("data", (chunk: Buffer) => {
        activeState.downloadedBytes += chunk.length;

        // Calculate speed every 800ms
        const now = Date.now();
        const elapsed = (now - activeState.lastSpeedCheckTime) / 1000;
        if (elapsed >= 0.8) {
          const deltaBytes = activeState.downloadedBytes - activeState.lastBytes;
          activeState.currentSpeedMb = parseFloat(
            ((deltaBytes / (1024 * 1024)) / elapsed).toFixed(2)
          );
          activeState.lastSpeedCheckTime = now;
          activeState.lastBytes = activeState.downloadedBytes;
        }
      });

      res.pipe(fileStream);

      fileStream.on("finish", () => {
        fileStream.close(() => {
          onComplete();
        });
      });

      fileStream.on("error", (err) => {
        try {
          fs.unlinkSync(destPath);
        } catch {}
        onError(err);
      });
    }
  );

  req.on("error", (err) => {
    try {
      fs.unlinkSync(destPath);
    } catch {}
    onError(err);
  });

  activeState.request = req;
}

/**
 * Start downloading model on-demand
 */
export function startModelDownload(modelId: string): { success: boolean; message: string } {
  const spec = AVAILABLE_MODELS[modelId];
  if (!spec) {
    return { success: false, message: `Mô hình "${modelId}" không tồn tại trong danh mục.` };
  }

  if (activeDownloads.has(modelId)) {
    return { success: true, message: `Mô hình "${spec.name}" đang được tải về.` };
  }

  if (isModelReady(modelId)) {
    return { success: true, message: `Mô hình "${spec.name}" đã được tải về sẵn rồi.` };
  }

  const modelDir = path.join(MODELS_BASE_DIR, modelId);
  if (!fs.existsSync(modelDir)) {
    fs.mkdirSync(modelDir, { recursive: true });
  }

  const tempFilePath = path.join(modelDir, `${spec.targetFilename}.download.tmp`);
  const finalFilePath = path.join(modelDir, spec.targetFilename);

  const activeState: ActiveDownload = {
    modelId,
    request: null,
    downloadedBytes: 0,
    totalBytes: spec.sizeBytes,
    startTime: Date.now(),
    lastSpeedCheckTime: Date.now(),
    lastBytes: 0,
    currentSpeedMb: 0,
    tempFilePath,
  };

  activeDownloads.set(modelId, activeState);

  const initialUrl = spec.downloadUrls[0];
  console.log(`[BGM Model Manager] Bắt đầu tải model "${modelId}" từ ${initialUrl}...`);

  downloadFileWithRedirect(
    initialUrl,
    tempFilePath,
    activeState,
    () => {
      // Completed successfully
      try {
        if (fs.existsSync(tempFilePath)) {
          fs.renameSync(tempFilePath, finalFilePath);
        }
        activeDownloads.delete(modelId);
        console.log(`[BGM Model Manager] Tải xong mô hình "${modelId}" -> ${finalFilePath}`);
      } catch (e: any) {
        console.error(`[BGM Model Manager] Lỗi đổi tên file model:`, e);
        activeDownloads.delete(modelId);
      }
    },
    (err) => {
      console.error(`[BGM Model Manager] Lỗi khi tải mô hình "${modelId}":`, err.message);
      activeState.error = err.message;
      try {
        if (fs.existsSync(tempFilePath)) {
          fs.unlinkSync(tempFilePath);
        }
      } catch {}
      setTimeout(() => {
        activeDownloads.delete(modelId);
      }, 5000);
    }
  );

  return { success: true, message: `Đã bắt đầu tải mô hình "${spec.name}" theo yêu cầu.` };
}

/**
 * Cancel an ongoing download
 */
export function cancelModelDownload(modelId: string): boolean {
  const active = activeDownloads.get(modelId);
  if (!active) return false;

  try {
    if (active.request) {
      active.request.destroy();
    }
    if (fs.existsSync(active.tempFilePath)) {
      fs.unlinkSync(active.tempFilePath);
    }
  } catch (e) {
    console.warn(`[BGM Model Manager] Lỗi khi hủy tải:`, e);
  }

  activeDownloads.delete(modelId);
  return true;
}

/**
 * Delete a downloaded model to free disk space
 */
export function deleteModel(modelId: string): boolean {
  cancelModelDownload(modelId);

  const modelDir = path.join(MODELS_BASE_DIR, modelId);
  if (fs.existsSync(modelDir)) {
    try {
      fs.rmSync(modelDir, { recursive: true, force: true });
      return true;
    } catch (e) {
      console.error(`[BGM Model Manager] Lỗi xóa thư mục model:`, e);
      return false;
    }
  }
  return true;
}
