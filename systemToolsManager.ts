import fs from "fs";
import path from "path";
import { fileURLToPath } from "url";
import { spawn } from "child_process";
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

export function resetCurrentJob() {
  currentJob = {
    id: "idle",
    type: "idle",
    status: "idle",
    progressPercent: 0,
    message: "Hệ thống sẵn sàng",
    logs: [],
    startTime: Date.now(),
  };
}

// Non-blocking asynchronous child process executor
function runProcessAsync(
  cmd: string,
  args: string[],
  cwd: string,
  onLine: (line: string) => void
): Promise<void> {
  return new Promise((resolve, reject) => {
    const proc = spawn(cmd, args, { cwd });
    let stdoutBuffer = "";
    let stderrBuffer = "";

    proc.stdout.on("data", (data) => {
      stdoutBuffer += data.toString();
      const lines = stdoutBuffer.split("\n");
      stdoutBuffer = lines.pop() || "";
      for (const line of lines) {
        if (line.trim()) onLine(line.trim());
      }
    });

    proc.stderr.on("data", (data) => {
      stderrBuffer += data.toString();
      const lines = stderrBuffer.split("\n");
      stderrBuffer = lines.pop() || "";
      for (const line of lines) {
        if (line.trim()) onLine(line.trim());
      }
    });

    proc.on("error", (err) => {
      reject(err);
    });

    proc.on("close", (code) => {
      if (stdoutBuffer.trim()) onLine(stdoutBuffer.trim());
      if (stderrBuffer.trim()) onLine(stderrBuffer.trim());
      if (code === 0) {
        resolve();
      } else {
        reject(new Error(`Lệnh '${cmd} ${args.join(" ")}' kết thúc với mã ${code}`));
      }
    });
  });
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
          if (
            response.statusCode &&
            response.statusCode >= 300 &&
            response.statusCode < 400 &&
            response.headers.location
          ) {
            const nextUrl = response.headers.location.startsWith("http")
              ? response.headers.location
              : new URL(response.headers.location, currentUrl).toString();
            response.resume();
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
    progressPercent: 1,
    downloadedMb: 0,
    totalMb: spec.expectedSizeMb,
    message: `Đang tải ${spec.name} (~${spec.expectedSizeMb}MB)...`,
    logs: [`Bắt đầu tải mô hình ${spec.name} từ HuggingFace CDN...`],
    startTime: Date.now(),
  };

  (async () => {
    let lastLogTime = Date.now();
    let startTime = Date.now();

    try {
      await downloadFileWithProgress(downloadUrl, tempFile, (received, total) => {
        const percent = Math.min(100, Math.round((received / total) * 100));
        const downloadedMb = Math.round((received / (1024 * 1024)) * 10) / 10;
        const totalMb = Math.round((total / (1024 * 1024)) * 10) / 10;

        const elapsedSec = (Date.now() - startTime) / 1000;
        const speedMbS = elapsedSec > 0 ? Math.round((downloadedMb / elapsedSec) * 10) / 10 : 0;

        currentJob.progressPercent = Math.max(1, percent);
        currentJob.downloadedMb = downloadedMb;
        currentJob.totalMb = totalMb;
        currentJob.speedMbS = speedMbS;
        currentJob.message = `[${percent}%] Đang tải ${spec.name}: ${downloadedMb}MB / ${totalMb}MB (${speedMbS} MB/s)`;

        const now = Date.now();
        if (now - lastLogTime > 1500) {
          lastLogTime = now;
          currentJob.logs.push(`[Tải về] ${percent}% - ${downloadedMb}MB / ${totalMb}MB (${speedMbS} MB/s)`);
          if (currentJob.logs.length > 25) currentJob.logs.shift();
        }
      });

      if (fs.existsSync(tempFile)) {
        if (fs.existsSync(destFile)) {
          fs.unlinkSync(destFile);
        }
        fs.renameSync(tempFile, destFile);
      }

      currentJob.status = "completed";
      currentJob.progressPercent = 100;
      currentJob.message = `Đã tải xong mô hình ${spec.name} (${spec.expectedSizeMb}MB)!`;
      currentJob.logs.push(`Hoàn tất tải về và lưu vào hệ thống: ${destFile}`);
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

// Clone & Compile Whisper.cpp with Non-blocking child process and real-time percentage
export async function startCompileWhisperCpp(forceRebuild = false): Promise<boolean> {
  if (currentJob.status === "running") {
    throw new Error(`Hệ thống đang bận: ${currentJob.message}`);
  }

  const existingCli = getWhisperCliPath();

  // If already compiled and user did not request forceRebuild, immediately verify and complete
  if (existingCli && !forceRebuild) {
    const status = getSystemToolsStatus();
    const hasAnyModel = status.models.some((m) => m.isDownloaded);

    currentJob = {
      id: `compile_whisper_${Date.now()}`,
      type: "compile_whisper",
      target: "whisper.cpp",
      status: "completed",
      progressPercent: 100,
      message: "Whisper.cpp (whisper-cli) đã được cài đặt và sẵn sàng 100%!",
      logs: [
        `Phát hiện file thực thi: ${existingCli}`,
        "Bộ thực thi Whisper.cpp đã sẵn sàng hoạt động offline.",
      ],
      startTime: Date.now(),
    };

    if (!hasAnyModel) {
      currentJob.logs.push("Chưa có mô hình nào, đang tự động tải mô hình Whisper Small...");
      setTimeout(() => {
        startDownloadWhisperModel("small").catch(console.error);
      }, 500);
    }

    return true;
  }

  currentJob = {
    id: `compile_whisper_${Date.now()}`,
    type: "compile_whisper",
    target: "whisper.cpp",
    status: "running",
    progressPercent: 5,
    message: "[5%] Bắt đầu chuẩn bị môi trường biên dịch Whisper.cpp...",
    logs: ["[Khởi tạo] Kiểm tra thư mục mã nguồn tools/whisper.cpp..."],
    startTime: Date.now(),
  };

  (async () => {
    try {
      // Step 1: Git clone if CMakeLists.txt is not found
      if (!fs.existsSync(path.resolve(WHISPER_DIR, "CMakeLists.txt"))) {
        currentJob.progressPercent = 10;
        currentJob.message = "[10%] Đang tải mã nguồn Whisper.cpp từ GitHub...";
        currentJob.logs.push("Chạy: git clone --depth 1 https://github.com/ggerganov/whisper.cpp...");

        await runProcessAsync(
          "git",
          ["clone", "--depth", "1", "https://github.com/ggerganov/whisper.cpp", WHISPER_DIR],
          TOOLS_DIR,
          (line) => {
            currentJob.logs.push(line);
            if (currentJob.logs.length > 25) currentJob.logs.shift();
          }
        );
        currentJob.logs.push("Đã tải xong mã nguồn Whisper.cpp.");
      }

      // Step 2: Configure CMake
      currentJob.progressPercent = 20;
      currentJob.message = "[20%] Đang cấu hình CMake cho Whisper.cpp...";
      currentJob.logs.push("Chạy: cmake -B build -S . -DCMAKE_BUILD_TYPE=Release...");

      const buildDir = path.resolve(WHISPER_DIR, "build");
      if (!fs.existsSync(buildDir)) {
        fs.mkdirSync(buildDir, { recursive: true });
      }

      await runProcessAsync(
        "cmake",
        ["-B", "build", "-S", ".", "-DCMAKE_BUILD_TYPE=Release"],
        WHISPER_DIR,
        (line) => {
          currentJob.logs.push(line);
          if (currentJob.logs.length > 25) currentJob.logs.shift();
        }
      );
      currentJob.logs.push("Cấu hình CMake thành công.");

      // Step 3: Compile with real-time percentage parsing
      currentJob.progressPercent = 25;
      currentJob.message = "[25%] Bắt đầu biên dịch các tệp C/C++ (Release)...";
      currentJob.logs.push("Chạy: cmake --build build --config Release -j2...");

      await runProcessAsync(
        "cmake",
        ["--build", "build", "--config", "Release", "-j2"],
        WHISPER_DIR,
        (line) => {
          // Parse CMake's [ XX%] progress indicators
          const percentMatch = line.match(/\[\s*(\d+)%\]/);
          if (percentMatch) {
            const cmakePercent = parseInt(percentMatch[1], 10);
            // Map CMake 0-100% to overall 25-92%
            const overallPercent = 25 + Math.round((cmakePercent * 67) / 100);
            currentJob.progressPercent = overallPercent;
            currentJob.message = `[${overallPercent}%] Đang biên dịch Whisper.cpp: ${cmakePercent}% - ${line.slice(0, 60)}`;
          }

          currentJob.logs.push(line);
          if (currentJob.logs.length > 25) currentJob.logs.shift();
        }
      );

      const cli = getWhisperCliPath();
      if (!cli) {
        throw new Error("Biên dịch xong nhưng không tìm thấy file thực thi whisper-cli.");
      }

      currentJob.progressPercent = 95;
      currentJob.message = "[95%] Kiểm tra file thực thi và mô hình...";
      currentJob.logs.push(`File thực thi sẵn sàng: ${cli}`);

      // Step 4: Check models
      const status = getSystemToolsStatus();
      const hasAnyModel = status.models.some((m) => m.isDownloaded);

      if (!hasAnyModel) {
        currentJob.logs.push("Chưa có mô hình nào, đang tự động tải mô hình Whisper Small (~460MB)...");
        await startDownloadWhisperModel("small");
        return;
      }

      currentJob.progressPercent = 100;
      currentJob.status = "completed";
      currentJob.message = "Khởi tạo & biên dịch Whisper.cpp thành công 100%!";
      currentJob.logs.push("Hệ thống Whisper offline đã sẵn sàng hoạt động!");
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
