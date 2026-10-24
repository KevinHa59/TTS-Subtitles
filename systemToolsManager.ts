import fs from "fs";
import path from "path";
import { fileURLToPath } from "url";
import { spawn, execSync } from "child_process";
import https from "https";
import http from "http";

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

export interface SystemModelStatus {
  id: string;
  name: string;
  filename: string;
  sizeMb: number;
  expectedSizeMb: number;
  isDownloaded: boolean;
  description: string;
}

export interface SystemJobStatus {
  id: string;
  type: "download_model" | "compile_whisper" | "idle";
  target?: string;
  status: "running" | "completed" | "error" | "idle";
  progressPercent: number;
  downloadedMb?: number;
  totalMb?: number;
  speedMbS?: number;
  message: string;
  logs: string[];
  startTime: number;
  error?: string;
}

export const WHISPER_MODEL_SPECS = [
  {
    id: "base",
    name: "Whisper Base",
    filename: "ggml-base.bin",
    expectedSizeMb: 142,
    description: "Nhẹ & nhanh nhất (~140MB). Thích hợp máy cấu hình thấp hoặc thử nghiệm nhanh.",
  },
  {
    id: "small",
    name: "Whisper Small (Khuyên dùng)",
    filename: "ggml-small.bin",
    expectedSizeMb: 466,
    description: "Cân bằng hoàn hảo (~460MB). Độ chính xác tiếng Việt vượt trội, nhận diện dấu chuẩn.",
  },
  {
    id: "medium",
    name: "Whisper Medium",
    filename: "ggml-medium.bin",
    expectedSizeMb: 1530,
    description: "Độ chính xác cao (~1.5GB). Phù hợp âm thanh có tạp âm hoặc tiếng nói nhanh.",
  },
  {
    id: "large-v3-turbo",
    name: "Whisper Large-v3-turbo",
    filename: "ggml-large-v3-turbo.bin",
    expectedSizeMb: 1590,
    description: "Mô hình mới nhất (~1.5GB). Tối ưu hóa tốc độ và phiên âm chính xác cao nhất.",
  },
];

const TOOLS_DIR = path.resolve(__dirname, "tools");
const WHISPER_DIR = path.resolve(TOOLS_DIR, "whisper.cpp");
const MODELS_DIR = path.resolve(WHISPER_DIR, "models");

// Ensure base directories exist
if (!fs.existsSync(TOOLS_DIR)) {
  fs.mkdirSync(TOOLS_DIR, { recursive: true });
}

// Active background job
let currentJob: SystemJobStatus = {
  id: "idle",
  type: "idle",
  status: "idle",
  progressPercent: 0,
  message: "Hệ thống sẵn sàng",
  logs: [],
  startTime: Date.now(),
};

export function getWhisperCliPath(): string | null {
  const candidates = [
    path.resolve(WHISPER_DIR, "build", "bin", "whisper-cli"),
    path.resolve(WHISPER_DIR, "build", "bin", "main"),
    path.resolve(WHISPER_DIR, "main"),
    "whisper-cli",
  ];
  for (const c of candidates) {
    if (fs.existsSync(c)) return c;
  }
  return null;
}

export function getSystemToolsStatus() {
  const cliPath = getWhisperCliPath();
  const isWhisperInstalled = !!cliPath;

  const models: SystemModelStatus[] = WHISPER_MODEL_SPECS.map((spec) => {
    const fullPath = path.resolve(MODELS_DIR, spec.filename);
    const exists = fs.existsSync(fullPath);
    let sizeMb = 0;
    if (exists) {
      try {
        const stats = fs.statSync(fullPath);
        sizeMb = Math.round((stats.size / (1024 * 1024)) * 10) / 10;
      } catch {}
    }

    return {
      id: spec.id,
      name: spec.name,
      filename: spec.filename,
      sizeMb: exists ? sizeMb : 0,
      expectedSizeMb: spec.expectedSizeMb,
      isDownloaded: exists && sizeMb > 10,
      description: spec.description,
    };
  });

  return {
    isWhisperInstalled,
    whisperCliPath: cliPath,
    modelsDir: MODELS_DIR,
    models,
    activeJob: currentJob,
  };
}

export function getCurrentJob(): SystemJobStatus {
  return currentJob;
}

// Helper: Download a file with redirect follow and progress
function downloadFileWithProgress(
  url: string,
  destPath: string,
  onProgress: (bytesReceived: number, totalBytes: number) => void
): Promise<void> {
  return new Promise((resolve, reject) => {
    const makeRequest = (currentUrl: string, redirectCount = 0) => {
      if (redirectCount > 8) {
        return reject(new Error("Quá nhiều chuyển hướng (Redirect loop)"));
      }

      const client = currentUrl.startsWith("https") ? https : http;
      client
        .get(currentUrl, (response) => {
          // Handle HTTP redirects (301, 302, 303, 307, 308)
          if (
            response.statusCode &&
            response.statusCode >= 300 &&
            response.statusCode < 400 &&
            response.headers.location
          ) {
            const nextUrl = response.headers.location.startsWith("http")
              ? response.headers.location
              : new URL(response.headers.location, currentUrl).toString();
            response.resume(); // consume response data to free up memory
            return makeRequest(nextUrl, redirectCount + 1);
          }

          if (response.statusCode !== 200) {
            response.resume();
            return reject(new Error(`Tải về thất bại, mã HTTP: ${response.statusCode}`));
          }

          const totalBytes = parseInt(response.headers["content-length"] || "0", 10);
          let receivedBytes = 0;

          const fileStream = fs.createWriteStream(destPath);

          response.on("data", (chunk) => {
            receivedBytes += chunk.length;
            if (totalBytes > 0) {
              onProgress(receivedBytes, totalBytes);
            }
          });

          response.pipe(fileStream);

          fileStream.on("finish", () => {
            fileStream.close(() => resolve());
          });

          fileStream.on("error", (err) => {
            fs.unlink(destPath, () => {});
            reject(err);
          });
        })
        .on("error", (err) => {
          fs.unlink(destPath, () => {});
          reject(err);
        });
    };

    makeRequest(url);
  });
}

// Start downloading a Whisper GGML model
export async function startDownloadWhisperModel(modelId: string): Promise<boolean> {
  const spec = WHISPER_MODEL_SPECS.find((s) => s.id === modelId);
  if (!spec) {
    throw new Error(`Mô hình không hợp lệ: ${modelId}`);
  }

  if (currentJob.status === "running") {
    throw new Error(`Hệ thống đang bận thực hiện tác vụ: ${currentJob.message}`);
  }

  if (!fs.existsSync(MODELS_DIR)) {
    fs.mkdirSync(MODELS_DIR, { recursive: true });
  }

  const destFile = path.resolve(MODELS_DIR, spec.filename);
  const tempFile = `${destFile}.downloading`;

  const downloadUrl = `https://huggingface.co/ggerganov/whisper.cpp/resolve/main/${spec.filename}`;

  currentJob = {
    id: `download_${modelId}_${Date.now()}`,
    type: "download_model",
    target: modelId,
    status: "running",
    progressPercent: 0,
    downloadedMb: 0,
    totalMb: spec.expectedSizeMb,
    message: `Đang tải mô hình ${spec.name} (${spec.expectedSizeMb}MB)...`,
    logs: [`Bắt đầu tải ${spec.name} từ HuggingFace...`],
    startTime: Date.now(),
  };

  // Run in background
  (async () => {
    let lastLogTime = Date.now();
    try {
      await downloadFileWithProgress(downloadUrl, tempFile, (received, total) => {
        const percent = Math.min(100, Math.round((received / total) * 100));
        const downloadedMb = Math.round((received / (1024 * 1024)) * 10) / 10;
        const totalMb = Math.round((total / (1024 * 1024)) * 10) / 10;

        currentJob.progressPercent = percent;
        currentJob.downloadedMb = downloadedMb;
        currentJob.totalMb = totalMb;
        currentJob.message = `Đang tải ${spec.name}: ${downloadedMb}MB / ${totalMb}MB (${percent}%)`;

        const now = Date.now();
        if (now - lastLogTime > 2000) {
          lastLogTime = now;
          currentJob.logs.push(`[Tải về] ${percent}% (${downloadedMb}MB / ${totalMb}MB)`);
          if (currentJob.logs.length > 20) currentJob.logs.shift();
        }
      });

      // Atomically move temp to final file
      if (fs.existsSync(tempFile)) {
        if (fs.existsSync(destFile)) {
          fs.unlinkSync(destFile);
        }
        fs.renameSync(tempFile, destFile);
      }

      currentJob.status = "completed";
      currentJob.progressPercent = 100;
      currentJob.message = `Đã tải xong mô hình ${spec.name}!`;
      currentJob.logs.push(`Hoàn tất tải về và lưu vào ${destFile}`);
    } catch (err: any) {
      console.error("[SystemTools] Lỗi tải model:", err);
      try {
        if (fs.existsSync(tempFile)) fs.unlinkSync(tempFile);
      } catch {}
      currentJob.status = "error";
      currentJob.error = err.message || "Lỗi tải file";
      currentJob.message = `Tải mô hình ${spec.name} thất bại: ${err.message}`;
      currentJob.logs.push(`Lỗi: ${err.message}`);
    }
  })();

  return true;
}

// Delete a Whisper GGML model to free disk space
export function deleteWhisperModel(modelId: string): boolean {
  const spec = WHISPER_MODEL_SPECS.find((s) => s.id === modelId);
  if (!spec) return false;

  const target = path.resolve(MODELS_DIR, spec.filename);
  if (fs.existsSync(target)) {
    fs.unlinkSync(target);
    return true;
  }
  return false;
}

// Clone & Compile Whisper.cpp
export async function startCompileWhisperCpp(): Promise<boolean> {
  if (currentJob.status === "running") {
    throw new Error(`Hệ thống đang bận: ${currentJob.message}`);
  }

  currentJob = {
    id: `compile_whisper_${Date.now()}`,
    type: "compile_whisper",
    target: "whisper.cpp",
    status: "running",
    progressPercent: 5,
    message: "Bắt đầu khởi tạo Whisper.cpp...",
    logs: ["[Khởi tạo] Chuẩn bị thư mục mã nguồn Whisper.cpp..."],
    startTime: Date.now(),
  };

  // Run compilation steps asynchronously
  (async () => {
    try {
      // Step 1: Git clone if not existing
      if (!fs.existsSync(path.resolve(WHISPER_DIR, "CMakeLists.txt"))) {
        currentJob.progressPercent = 15;
        currentJob.message = "Đang tải mã nguồn Whisper.cpp từ GitHub...";
        currentJob.logs.push("Cloning https://github.com/ggerganov/whisper.cpp...");

        execSync(`git clone --depth 1 https://github.com/ggerganov/whisper.cpp "${WHISPER_DIR}"`, {
          stdio: "pipe",
        });
        currentJob.logs.push("Đã tải xong mã nguồn Whisper.cpp.");
      }

      // Step 2: Configure CMake
      currentJob.progressPercent = 35;
      currentJob.message = "Đang cấu hình CMake cho Whisper.cpp...";
      currentJob.logs.push("Chạy cmake -B build...");

      const buildDir = path.resolve(WHISPER_DIR, "build");
      if (!fs.existsSync(buildDir)) {
        fs.mkdirSync(buildDir, { recursive: true });
      }

      execSync(`cmake -B build -S . -DCMAKE_BUILD_TYPE=Release`, {
        cwd: WHISPER_DIR,
        stdio: "pipe",
      });
      currentJob.logs.push("Cấu hình CMake thành công.");

      // Step 3: Build Release binary
      currentJob.progressPercent = 60;
      currentJob.message = "Đang biên dịch Whisper.cpp (whisper-cli)...";
      currentJob.logs.push("Chạy cmake --build build --config Release -j2...");

      execSync(`cmake --build build --config Release -j2`, {
        cwd: WHISPER_DIR,
        stdio: "pipe",
      });

      const cli = getWhisperCliPath();
      if (!cli) {
        throw new Error("Biên dịch xong nhưng không tìm thấy file thực thi whisper-cli.");
      }

      // Step 4: Check if any model exists, if not auto-start base model download
      currentJob.progressPercent = 90;
      currentJob.message = "Đang kiểm tra mô hình ngôn ngữ...";
      currentJob.logs.push(`Bộ thực thi whisper-cli đã sẵn sàng: ${cli}`);

      const status = getSystemToolsStatus();
      const hasAnyModel = status.models.some((m) => m.isDownloaded);

      if (!hasAnyModel) {
        currentJob.logs.push("Chưa có mô hình nào, đang tự động tải mô hình base (~140MB)...");
        await startDownloadWhisperModel("base");
        return;
      }

      currentJob.progressPercent = 100;
      currentJob.status = "completed";
      currentJob.message = "Khởi tạo & biên dịch Whisper.cpp thành công!";
      currentJob.logs.push("Hệ thống Whisper offline đã sẵn sàng 100%!");
    } catch (err: any) {
      console.error("[SystemTools] Lỗi biên dịch whisper:", err);
      currentJob.status = "error";
      currentJob.error = err.message || "Lỗi biên dịch";
      currentJob.message = `Biên dịch Whisper.cpp thất bại: ${err.message}`;
      currentJob.logs.push(`Lỗi: ${err.message}`);
    }
  })();

  return true;
}
