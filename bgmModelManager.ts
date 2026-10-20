import fs from "fs";
import path from "path";
import os from "os";
import crypto from "crypto";
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
const AUDIOLDM_REPO_REVISION = "feeb3d14203495a4b6ac0893cbdedb2159b4819c";
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

interface ModelFileSpec {
  path: string;
  sizeBytes: number;
  sha256?: string;
  legacyPaths?: string[];
}

const activeDownloads = new Map<string, ActiveDownload>();
const failedDownloads = new Map<string, string>();

// Available AI Models specification (Downloaded ON-DEMAND only)
export const AVAILABLE_MODELS: Record<string, {
  name: string;
  description: string;
  sizeFormatted: string;
  sizeBytes: number;
  ramRequired: string;
  recommendedFor: string;
  targetFilename: string;
  expectedSizeBytes?: number;
  downloadUrls: string[];
  files?: ModelFileSpec[];
}> = {
  "musicgen-small": {
    name: "Meta MusicGen Small (Neural Melody & Cinematic BGM)",
    description: "Mô hình MusicGen thật, sinh nhạc đa nhạc cụ từ prompt bằng Transformers/PyTorch. Lần đầu cần tải metadata mô hình; CPU có thể mất vài phút.",
    sizeFormatted: "~2.2 GiB",
    sizeBytes: 2364427288,
    ramRequired: "~8 GB RAM khả dụng",
    recommendedFor: "CPU đa nhân; cần cài requirements-bgm.txt",
    targetFilename: "musicgen_small_weights.bin",
    downloadUrls: [
      "https://huggingface.co/facebook/musicgen-small/resolve/main/model.safetensors",
      "https://hf-mirror.com/facebook/musicgen-small/resolve/main/model.safetensors"
    ],
  },
  "audioldm-soundscape": {
    name: "AudioLDM Soundscape (Atmospheric & Horror Drone)",
    description: "AudioLDM S-Full-v2 tạo âm thanh môi trường từ prompt. Tải đầy đủ pipeline Diffusers để có thể chạy offline.",
    sizeFormatted: "~1.57 GiB",
    sizeBytes: 1687448107,
    ramRequired: "~4 GB RAM khả dụng",
    recommendedFor: "CPU; sinh từng đoạn 10 giây, có thể chậm hơn MusicGen",
    targetFilename: "unet/diffusion_pytorch_model.safetensors",
    downloadUrls: [],
    files: [
      { path: "model_index.json", sizeBytes: 462 },
      { path: "scheduler/scheduler_config.json", sizeBytes: 439 },
      { path: "text_encoder/config.json", sizeBytes: 843 },
      { path: "text_encoder/model.safetensors", sizeBytes: 501241456 },
      { path: "tokenizer/merges.txt", sizeBytes: 456356 },
      { path: "tokenizer/special_tokens_map.json", sizeBytes: 280 },
      { path: "tokenizer/tokenizer.json", sizeBytes: 2108746 },
      { path: "tokenizer/tokenizer_config.json", sizeBytes: 424 },
      { path: "tokenizer/vocab.json", sizeBytes: 798293 },
      { path: "unet/config.json", sizeBytes: 1300 },
      {
        path: "unet/diffusion_pytorch_model.safetensors",
        sizeBytes: 740228912,
        sha256: "fc30d5b5a3bb8d08672736efb1fff10755ba7024dace39b2dcb579a105aa2a5a5",
        legacyPaths: ["audioldm_unet.safetensors"],
      },
      { path: "vae/config.json", sizeBytes: 534 },
      { path: "vae/diffusion_pytorch_model.safetensors", sizeBytes: 221530316 },
      { path: "vocoder/config.json", sizeBytes: 654 },
      { path: "vocoder/model.safetensors", sizeBytes: 221079092 },
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
      let error: string | undefined;
      const requiredFiles = spec.files ?? [
        { path: spec.targetFilename, sizeBytes: spec.expectedSizeBytes ?? 0 },
      ];
      const modelReady = requiredFiles.every(({ path: relativePath, sizeBytes }) => {
        const filePath = path.join(modelDir, relativePath);
        if (!fs.existsSync(filePath)) return false;
        try {
          const actualSize = fs.statSync(filePath).size;
          return sizeBytes > 0 ? actualSize === sizeBytes : actualSize > 10 * 1024 * 1024;
        } catch {
          return false;
        }
      });

      if (active) {
        status = "downloading";
        downloadedBytes = active.downloadedBytes;
        totalBytes = active.totalBytes || spec.sizeBytes;
        downloadProgress = totalBytes > 0
          ? Math.min(99, Math.round((downloadedBytes / totalBytes) * 100))
          : 0;
        downloadSpeedMb = active.currentSpeedMb;
        error = active.error;
      } else if (modelReady) {
        status = "ready";
        downloadProgress = 100;
        downloadedBytes = spec.sizeBytes;
      } else if (failedDownloads.has(id)) {
        status = "error";
        error = failedDownloads.get(id);
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
  const modelDir = path.join(MODELS_BASE_DIR, modelId);
  const requiredFiles = spec.files ?? [
    { path: spec.targetFilename, sizeBytes: spec.expectedSizeBytes ?? 0 },
  ];
  return requiredFiles.every(({ path: relativePath, sizeBytes }) => {
    const filePath = path.join(modelDir, relativePath);
    if (!fs.existsSync(filePath)) return false;
    try {
      const actualSize = fs.statSync(filePath).size;
      return sizeBytes > 0 ? actualSize === sizeBytes : actualSize > 10 * 1024 * 1024;
    } catch {
      return false;
    }
  });
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
      if (res.statusCode !== 200) {
        res.resume();
        return onError(
          new Error(`Máy chủ trả về mã HTTP không mong đợi: ${res.statusCode ?? "không rõ"}.`)
        );
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
      res.on("aborted", () => {
        try {
          fs.unlinkSync(destPath);
        } catch {}
        onError(new Error("Kết nối bị ngắt giữa chừng khi tải checkpoint."));
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
  failedDownloads.delete(modelId);

  const modelDir = path.join(MODELS_BASE_DIR, modelId);
  if (!fs.existsSync(modelDir)) {
    fs.mkdirSync(modelDir, { recursive: true });
  }

  const files = spec.files ?? [
    {
      path: spec.targetFilename,
      sizeBytes: spec.expectedSizeBytes ?? spec.sizeBytes,
    },
  ];

  const activeState: ActiveDownload = {
    modelId,
    request: null,
    downloadedBytes: 0,
    totalBytes: spec.sizeBytes,
    startTime: Date.now(),
    lastSpeedCheckTime: Date.now(),
    lastBytes: 0,
    currentSpeedMb: 0,
    tempFilePath: "",
  };

  activeDownloads.set(modelId, activeState);

  const failDownload = (err: Error, tempFilePath: string) => {
    if (activeDownloads.get(modelId) !== activeState) {
      try {
        if (fs.existsSync(tempFilePath)) fs.unlinkSync(tempFilePath);
      } catch {}
      return;
    }
    console.error(`[BGM Model Manager] Lỗi khi tải mô hình "${modelId}":`, err.message);
    activeState.error = err.message;
    failedDownloads.set(modelId, err.message);
    try {
      if (fs.existsSync(tempFilePath)) fs.unlinkSync(tempFilePath);
    } catch {}
    setTimeout(() => activeDownloads.delete(modelId), 5000);
  };

  const downloadNextFile = (fileIndex: number): void => {
    if (activeDownloads.get(modelId) !== activeState) return;
    if (fileIndex >= files.length) {
      activeDownloads.delete(modelId);
      failedDownloads.delete(modelId);
      console.log(`[BGM Model Manager] Tải xong mô hình "${modelId}" -> ${modelDir}`);
      return;
    }

    const file = files[fileIndex];
    const finalFilePath = path.join(modelDir, file.path);
    const tempFilePath = `${finalFilePath}.download.tmp`;
    activeState.tempFilePath = tempFilePath;
    fs.mkdirSync(path.dirname(finalFilePath), { recursive: true });
    if (!fs.existsSync(finalFilePath)) {
      const legacyPath = file.legacyPaths
        ?.map((relativePath) => path.join(modelDir, relativePath))
        .find((candidate) => {
          try {
            if (fs.statSync(candidate).size !== file.sizeBytes) return false;
            if (!file.sha256) return true;
            const hash = crypto.createHash("sha256");
            const descriptor = fs.openSync(candidate, "r");
            const buffer = Buffer.allocUnsafe(8 * 1024 * 1024);
            try {
              let bytesRead = 0;
              do {
                bytesRead = fs.readSync(
                  descriptor,
                  buffer,
                  0,
                  buffer.length,
                  null,
                );
                if (bytesRead > 0) hash.update(buffer.subarray(0, bytesRead));
              } while (bytesRead > 0);
            } finally {
              fs.closeSync(descriptor);
            }
            return hash.digest("hex") === file.sha256;
          } catch {
            return false;
          }
        });
      if (legacyPath) {
        try {
          fs.linkSync(legacyPath, finalFilePath);
        } catch (error) {
          console.warn(
            `[BGM Model Manager] Không thể tái sử dụng checkpoint cũ ${legacyPath}; sẽ tải lại:`,
            error,
          );
        }
      }
    }
    if (fs.existsSync(finalFilePath)) {
      try {
        if (fs.statSync(finalFilePath).size === file.sizeBytes) {
          activeState.downloadedBytes += file.sizeBytes;
          downloadNextFile(fileIndex + 1);
          return;
        }
      } catch {}
    }
    const fileUrl =
      spec.files
        ? `https://huggingface.co/cvssp/audioldm-s-full-v2/resolve/${AUDIOLDM_REPO_REVISION}/${file.path}`
        : spec.downloadUrls[0];
    if (!fileUrl) {
      failDownload(new Error(`Không có URL tải cho tệp ${file.path}.`), tempFilePath);
      return;
    }

    downloadFileWithRedirect(
      fileUrl,
      tempFilePath,
      activeState,
      () => {
        try {
          const downloadedSize = fs.statSync(tempFilePath).size;
          if (downloadedSize !== file.sizeBytes) {
            throw new Error(
              `Kích thước ${file.path} không hợp lệ (${downloadedSize} bytes; mong đợi ${file.sizeBytes}).`,
            );
          }
          fs.renameSync(tempFilePath, finalFilePath);
          downloadNextFile(fileIndex + 1);
        } catch (error) {
          failDownload(
            error instanceof Error ? error : new Error("Không thể lưu checkpoint vừa tải."),
            tempFilePath,
          );
        }
      },
      (error) => failDownload(error, tempFilePath),
    );
  };

  console.log(`[BGM Model Manager] Bắt đầu tải model "${modelId}" (${files.length} tệp)...`);
  downloadNextFile(0);

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
