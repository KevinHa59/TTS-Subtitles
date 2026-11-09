import fs from "fs";
import os from "os";
import path from "path";
import https from "https";
import { spawn, spawnSync, ChildProcess } from "child_process";
import { fileURLToPath } from "url";

const MODULE_DIR = path.dirname(fileURLToPath(import.meta.url));

export type SubtitleOcrInstallStatus = {
  status: "not_installed" | "running" | "ready" | "error" | "cancelled";
  stage: "idle" | "python" | "runtime" | "detection" | "recognition" | "verify" | "done";
  progressPercent: number | null;
  message: string;
  error?: string;
  runtimeReady: boolean;
  modelsReady: boolean;
  updatedAt: number;
};

const ROOT = path.join(process.env.LOCALAPPDATA || path.join(os.homedir(), "AppData", "Local"), "PiperTTSStudio", "subtitle-ocr");
const VENV = path.join(ROOT, "runtime");
const MODELS = path.join(ROOT, "models");
const RUNTIME_READY_FILE = path.join(ROOT, "runtime-ready.json");
const PYTHON = process.platform === "win32" ? path.join(VENV, "Scripts", "python.exe") : path.join(VENV, "bin", "python");
const MODEL_SPECS = [
  { id: "detection", name: "PP-OCRv5_mobile_det", url: "https://paddle-model-ecology.bj.bcebos.com/paddlex/official_inference_model/paddle3.0.0/PP-OCRv5_mobile_det_infer.tar" },
  { id: "recognition", name: "PP-OCRv5_mobile_rec", url: "https://paddle-model-ecology.bj.bcebos.com/paddlex/official_inference_model/paddle3.0.0/PP-OCRv5_mobile_rec_infer.tar" },
];
const MODEL_FILES = ["inference.json", "inference.pdiparams", "inference.yml"];
const OCR_RUNTIME_SCHEMA = 2;

export interface SubtitleOcrCue {
  startTime: number;
  endTime: number;
  text: string;
  confidence: number;
}

export interface SubtitleOcrJob {
  id: string;
  status: "queued" | "running" | "completed" | "error" | "cancelled";
  startedAt: number;
  finishedAt?: number;
  elapsedMs: number;
  progressPercent: number;
  processedFrames: number;
  totalFrames: number;
  message: string;
  subtitles: SubtitleOcrCue[];
  error?: string;
  updatedAt: number;
}

export type OcrJobOptions = {
  timeStart: number;
  timeEnd: number | null;
  confidence: number;
  similarity: number;
  maxMergeGap: number;
  brightnessThreshold: number | null;
  ssimThreshold: number;
  maxImageWidth: number;
  framesToSkip: number;
  minimumDuration: number;
  useFullFrame: boolean;
  useDualZone: boolean;
  zone1: "lower" | "center" | "upper";
  zone2: "lower" | "center" | "upper";
  cropX: number | null;
  cropY: number | null;
  cropWidth: number | null;
  cropHeight: number | null;
  alignment1: string;
  alignment2: string;
  angleClassification: boolean;
  normalizeTraditional: boolean;
  cpuThreads: number;
};
const OCR_JOBS = new Map<string, SubtitleOcrJob>();
const OCR_CHILDREN = new Map<string, ChildProcess>();
const OCR_MAX_UPLOAD_BYTES = 4 * 1024 * 1024 * 1024;
const OCR_MAX_CONCURRENT_JOBS = 4;
const OCR_JOB_IDLE_TIMEOUT_MS = 5 * 60 * 1000;

let status: SubtitleOcrInstallStatus = {
  status: "not_installed", stage: "idle", progressPercent: null,
  message: "Chưa cài bộ nhận diện.", runtimeReady: false, modelsReady: false, updatedAt: Date.now(),
};
let activeChild: ChildProcess | null = null;
let cancelled = false;

function modelReady(name: string) {
  const dir = path.join(MODELS, name);
  return MODEL_FILES.every((file) => fs.existsSync(path.join(dir, file)) && fs.statSync(path.join(dir, file)).size > 0);
}

function publish(patch: Partial<SubtitleOcrInstallStatus>) {
  status = { ...status, ...patch, updatedAt: Date.now() };
}

export function getSubtitleOcrInstallStatus(): SubtitleOcrInstallStatus {
  if (status.status !== "running") {
    let runtimeReady = false;
    try {
      runtimeReady = fs.existsSync(PYTHON) && JSON.parse(fs.readFileSync(RUNTIME_READY_FILE, "utf8")).schema === OCR_RUNTIME_SCHEMA;
    } catch { runtimeReady = false; }
    const modelsReady = MODEL_SPECS.every((model) => modelReady(model.name));
    if (runtimeReady && modelsReady) {
      status = { ...status, status: "ready", stage: "done", progressPercent: 100, message: "PaddleOCR và hai model đã sẵn sàng.", runtimeReady, modelsReady, updatedAt: Date.now() };
    } else {
      status = {
        ...status,
        status: status.status === "error" ? "error" : "not_installed",
        message: modelsReady && !runtimeReady ? "Cần cập nhật thư viện OCR để bật chuyển Phồn thể → Giản thể." : status.message,
        runtimeReady, modelsReady, updatedAt: Date.now(),
      };
    }
  }
  return { ...status };
}

function findPython(): { command: string; args: string[] } {
  const candidates = process.platform === "win32"
    ? [{ command: "py", args: ["-3.10"] }, { command: "py", args: ["-3.11"] }, { command: "py", args: ["-3.12"] }, { command: "python", args: [] }]
    : [{ command: "python3", args: [] }, { command: "python", args: [] }];
  for (const candidate of candidates) {
    const result = spawnSync(candidate.command, [...candidate.args, "-c", "import platform,sys; print(f'{sys.version_info.major}.{sys.version_info.minor} {platform.architecture()[0]}')"], { encoding: "utf8", windowsHide: true, timeout: 5000 });
    if (result.status !== 0) continue;
    const match = String(result.stdout).trim().match(/^(\d+)\.(\d+)\s+(\S+)/);
    if (match && Number(match[1]) === 3 && Number(match[2]) >= 10 && Number(match[2]) <= 12 && match[3] === "64bit") return candidate;
  }
  throw new Error("Cần cài Python 64-bit phiên bản 3.10, 3.11 hoặc 3.12 và thêm vào PATH.");
}

function run(command: string, args: string[], onLine?: (line: string) => void): Promise<void> {
  return new Promise((resolve, reject) => {
    const child = spawn(command, args, { windowsHide: true, stdio: ["ignore", "pipe", "pipe"] });
    activeChild = child;
    let output = "";
    const recentLines: string[] = [];
    const remember = (line: string) => {
      const clean = line.trim().slice(-800);
      if (!clean) return;
      recentLines.push(clean);
      if (recentLines.length > 24) recentLines.shift();
      onLine?.(clean.slice(-500));
    };
    const collect = (chunk: Buffer) => {
      output += chunk.toString();
      const lines = output.split(/\r?\n/);
      output = lines.pop() || "";
      for (const line of lines) remember(line);
    };
    child.stdout?.on("data", collect);
    child.stderr?.on("data", collect);
    child.once("error", (error) => {
      activeChild = null;
      reject(new Error(`Không chạy được ${command} ${args.join(" ")}: ${error.message}`));
    });
    child.once("close", (code) => {
      activeChild = null;
      if (output.trim()) remember(output);
      if (cancelled) reject(new Error("Đã hủy cài đặt."));
      else if (code === 0) resolve();
      else reject(new Error(`${command} ${args.join(" ")} kết thúc với mã ${code}.\n${recentLines.slice(-16).join("\n") || "Tiến trình không trả thêm thông tin lỗi."}`));
    });
  });
}

function download(url: string, destination: string, onProgress: (percent: number | null, downloaded: number, total: number) => void): Promise<void> {
  return new Promise((resolve, reject) => {
    let settled = false;
    let request: ReturnType<typeof https.get> | undefined;
    let output: fs.WriteStream | undefined;
    const timer = setInterval(() => {
      if (cancelled) { request?.destroy(new Error("Đã hủy cài đặt.")); output?.destroy(); finish(new Error("Đã hủy cài đặt.")); }
    }, 200);
    const finish = (err?: Error) => {
      if (settled) return;
      settled = true;
      clearInterval(timer);
      output?.close();
      if (err) reject(err); else resolve();
    };
    const start = (target: string, redirects = 0) => {
      if (cancelled) return finish(new Error("Đã hủy cài đặt."));
      request = https.get(target, { headers: { "Accept-Encoding": "identity", "User-Agent": "PiperTTSStudio-SubtitleOCR/1.0" } }, (response) => {
        const location = response.headers.location;
        if ([301, 302, 303, 307, 308].includes(response.statusCode || 0) && location && redirects < 6) {
          response.resume(); start(new URL(location, target).toString(), redirects + 1); return;
        }
        if (response.statusCode !== 200) { response.resume(); return finish(new Error(`Tải model thất bại (HTTP ${response.statusCode}).`)); }
        const total = Number(response.headers["content-length"]) || 0;
        let downloaded = 0;
        output = fs.createWriteStream(destination);
        response.on("data", (chunk: Buffer) => {
          downloaded += chunk.length;
          onProgress(total ? Math.min(99, Math.floor(downloaded * 100 / total)) : null, downloaded, total);
        });
        response.once("error", finish);
        output.once("error", finish);
        output.once("finish", () => finish());
        response.pipe(output);
      });
      request.once("error", finish);
    };
    start(url);
  });
}

async function installModel(model: typeof MODEL_SPECS[number], python: string) {
  const finalDir = path.join(MODELS, model.name);
  if (modelReady(model.name)) return;
  if (fs.existsSync(finalDir)) throw new Error(`Thư mục model ${model.name} đã tồn tại nhưng chưa đủ file; giữ nguyên thư mục đó để tránh ghi đè.`);
  const archive = path.join(ROOT, `${model.name}.tar.partial`);
  const extractDir = path.join(MODELS, `${model.name}.partial`);
  fs.mkdirSync(MODELS, { recursive: true });
  try { fs.rmSync(archive, { force: true }); } catch { /* retry will overwrite */ }
  await download(model.url, archive, (progressPercent) => publish({ progressPercent, message: `Đang tải model ${model.id === "detection" ? "phát hiện" : "nhận dạng"}${progressPercent == null ? "…" : ` · ${progressPercent}%`}` }));
  publish({ stage: model.id as "detection" | "recognition", progressPercent: null, message: `Đang kiểm tra và giải nén ${model.name}…` });
  fs.rmSync(extractDir, { recursive: true, force: true });
  fs.mkdirSync(extractDir, { recursive: true });
  const safeExtract = "import pathlib,sys,tarfile; src=pathlib.Path(sys.argv[1]); dst=pathlib.Path(sys.argv[2]).resolve(); t=tarfile.open(src,'r:*');\nfor m in t.getmembers():\n p=(dst/m.name).resolve();\n if not p.is_relative_to(dst) or not (m.isfile() or m.isdir()): raise RuntimeError('Unsafe archive member');\nt.extractall(dst)";
  await run(python, ["-c", safeExtract, archive, extractDir]);
  let found: string | null = null;
  const visit = (dir: string, depth = 0) => {
    if (depth > 4 || found) return;
    if (MODEL_FILES.every((file) => fs.existsSync(path.join(dir, file)))) { found = dir; return; }
    for (const entry of fs.readdirSync(dir, { withFileTypes: true })) if (entry.isDirectory()) visit(path.join(dir, entry.name), depth + 1);
  };
  visit(extractDir);
  if (!found || !MODEL_FILES.every((file) => fs.statSync(path.join(found!, file)).size > 0)) throw new Error(`Gói model ${model.name} không hợp lệ hoặc thiếu file.`);
  fs.renameSync(found, finalDir);
  fs.rmSync(extractDir, { recursive: true, force: true });
  fs.rmSync(archive, { force: true });
}

export async function startSubtitleOcrInstall() {
  if (status.status === "running") return { success: true, status: getSubtitleOcrInstallStatus() };
  cancelled = false;
  publish({ status: "running", stage: "python", progressPercent: null, message: "Đang kiểm tra Python 64-bit…", error: undefined });
  void (async () => {
    try {
      const basePython = findPython();
      fs.mkdirSync(ROOT, { recursive: true });
      if (!fs.existsSync(PYTHON)) {
        publish({ stage: "runtime", message: "Đang tạo môi trường Python riêng cho OCR…" });
        await run(basePython.command, [...basePython.args, "-m", "venv", VENV]);
      }
      publish({ stage: "runtime", progressPercent: null, message: "Đang cài PaddlePaddle CPU và PaddleOCR (có thể mất vài phút)…" });
      await run(PYTHON, ["-m", "pip", "install", "--disable-pip-version-check", "--upgrade", "pip"]);
      await run(PYTHON, ["-m", "pip", "install", "--disable-pip-version-check", "paddlepaddle==3.3.1", "paddleocr==3.7.0", "opencc-python-reimplemented==0.1.7"], (line) => publish({ message: line.slice(-220) }));
      await run(PYTHON, ["-c", "import paddle,paddleocr; print('Paddle',paddle.__version__); print('PaddleOCR ready')"]);
      fs.writeFileSync(RUNTIME_READY_FILE, JSON.stringify({ schema: OCR_RUNTIME_SCHEMA, paddlepaddle: "3.3.1", paddleocr: "3.7.0", opencc: "0.1.7", installedAt: Date.now() }, null, 2));
      publish({ runtimeReady: true });
      await installModel(MODEL_SPECS[0], PYTHON);
      await installModel(MODEL_SPECS[1], PYTHON);
      publish({ stage: "verify", progressPercent: null, message: "Đang xác minh runtime và model…" });
      await run(PYTHON, ["-c", "from paddleocr import PaddleOCR; from opencc import OpenCC; print('OCR imports ready')"]);
      if (!MODEL_SPECS.every((model) => modelReady(model.name))) throw new Error("Không tìm thấy đủ file model sau khi cài.");
      publish({ status: "ready", stage: "done", progressPercent: 100, message: "PaddleOCR và hai model đã sẵn sàng.", runtimeReady: true, modelsReady: true });
    } catch (error) {
      const wasCancelled = cancelled;
      publish({ status: wasCancelled ? "cancelled" : "error", stage: "idle", progressPercent: null, message: wasCancelled ? "Đã hủy cài đặt." : "Cài đặt không hoàn tất.", error: wasCancelled ? undefined : (error instanceof Error ? error.message : String(error)), runtimeReady: fs.existsSync(PYTHON), modelsReady: MODEL_SPECS.every((model) => modelReady(model.name)) });
    }
  })();
  return { success: true, status: getSubtitleOcrInstallStatus() };
}

export function cancelSubtitleOcrInstall() {
  if (status.status !== "running") return false;
  cancelled = true;
  activeChild?.kill();
  publish({ message: "Đang hủy cài đặt…" });
  return true;
}

export function getSubtitleOcrRuntimePaths() {
  const current = getSubtitleOcrInstallStatus();
  if (current.status !== "ready") throw new Error("Cài đặt PaddleOCR và model trước khi chạy nhận diện.");
  return {
    python: PYTHON,
    detectionModel: path.join(MODELS, MODEL_SPECS[0].name),
    recognitionModel: path.join(MODELS, MODEL_SPECS[1].name),
  };
}

function cleanupOcrUpload(videoPath: string) {
  const tempDir = path.dirname(videoPath);
  if (path.basename(tempDir).startsWith("subtitle-ocr-job-")) {
    try { fs.rmSync(tempDir, { recursive: true, force: true }); } catch { /* temp cleanup is best effort */ }
  }
}

export function createSubtitleOcrJob(id: string, videoPath: string, options: OcrJobOptions) {
  const runningJobs = Array.from(OCR_JOBS.values()).filter((job) => job.status === "running" || job.status === "queued").length;
  if (runningJobs >= OCR_MAX_CONCURRENT_JOBS) {
    throw new Error(`Đã đạt giới hạn ${OCR_MAX_CONCURRENT_JOBS} video OCR chạy đồng thời.`);
  }
  const runtime = getSubtitleOcrRuntimePaths();
  const job: SubtitleOcrJob = {
    id, status: "queued", progressPercent: 0, processedFrames: 0, totalFrames: 0,
    startedAt: Date.now(), elapsedMs: 0,
    message: "Đang khởi động PaddleOCR…", subtitles: [], updatedAt: Date.now(),
  };
  OCR_JOBS.set(id, job);
  const worker = path.resolve(MODULE_DIR, "tools", "subtitle-ocr", "worker.py");
  const child = spawn(runtime.python, [
    worker, videoPath, runtime.detectionModel, runtime.recognitionModel,
    JSON.stringify(options),
  ], {
    windowsHide: true, stdio: ["ignore", "pipe", "pipe"],
  });
  OCR_CHILDREN.set(id, child);
  job.status = "running";
  let idleTimer: ReturnType<typeof setTimeout>;
  const resetIdleTimer = () => {
    clearTimeout(idleTimer);
    idleTimer = setTimeout(() => {
      if (job.status !== "running") return;
      const message = "Worker OCR không cập nhật tiến trình trong 5 phút. Video đã được dừng để không chặn hàng đợi; hãy thử lại.";
      job.status = "error";
      job.finishedAt = Date.now();
      job.elapsedMs = job.finishedAt - job.startedAt;
      job.error = message;
      job.message = "Nhận diện phụ đề bị kẹt và đã tự dừng.";
      job.updatedAt = Date.now();
      child.kill();
    }, OCR_JOB_IDLE_TIMEOUT_MS);
  };
  resetIdleTimer();
  const stderr: string[] = [];
  let stdoutBuffer = "";
  child.stdout?.on("data", (chunk: Buffer) => {
    stdoutBuffer += chunk.toString("utf8");
    const lines = stdoutBuffer.split(/\r?\n/);
    stdoutBuffer = lines.pop() || "";
    for (const line of lines) {
      if (job.status !== "running") return;
      try {
        const event = JSON.parse(line);
        if (event.type === "progress") {
          resetIdleTimer();
          Object.assign(job, {
            progressPercent: event.total ? Math.floor(event.processed * 100 / event.total) : 0,
            processedFrames: event.processed || 0, totalFrames: event.total || 0,
            message: event.message || "Đang nhận diện phụ đề…", updatedAt: Date.now(),
          });
        } else if (event.type === "result") {
          resetIdleTimer();
          job.subtitles = Array.isArray(event.subtitles) ? event.subtitles : [];
          job.progressPercent = 100;
          job.message = `Hoàn tất · nhận diện ${job.subtitles.length} câu.`;
        } else if (event.type === "error") {
          stderr.push(String(event.message || "Lỗi worker OCR"));
        }
      } catch { stderr.push(line.slice(-600)); }
    }
  });
  child.stderr?.on("data", (chunk: Buffer) => {
    stderr.push(...chunk.toString("utf8").split(/\r?\n/).filter(Boolean).slice(-10));
    if (stderr.length > 30) stderr.splice(0, stderr.length - 30);
  });
  child.once("error", (error) => {
    clearTimeout(idleTimer);
    OCR_CHILDREN.delete(id);
    cleanupOcrUpload(videoPath);
    if (job.status !== "running") return;
    job.status = "error"; job.finishedAt = Date.now(); job.elapsedMs = job.finishedAt - job.startedAt; job.error = error.message; job.message = "Không thể khởi động worker OCR."; job.updatedAt = Date.now();
  });
  child.once("close", (code) => {
    clearTimeout(idleTimer);
    OCR_CHILDREN.delete(id);
    cleanupOcrUpload(videoPath);
    if (job.status === "cancelled" || job.status === "error") return;
    job.finishedAt = Date.now();
    job.elapsedMs = job.finishedAt - job.startedAt;
    if (code === 0 && job.subtitles.length >= 0) {
      job.status = "completed";
      job.message = `Hoàn tất · nhận diện ${job.subtitles.length} câu.`;
    } else {
      job.status = "error";
      job.error = stderr.join("\n").slice(-4000) || `Worker OCR kết thúc với mã ${code}.`;
      job.message = "Nhận diện phụ đề thất bại.";
    }
    job.updatedAt = Date.now();
  });
  return { ...job };
}

export function getSubtitleOcrJob(id: string) {
  const job = OCR_JOBS.get(id);
  return job ? { ...job, elapsedMs: (job.finishedAt || Date.now()) - job.startedAt, subtitles: [...job.subtitles] } : null;
}

export function cancelSubtitleOcrJob(id: string) {
  const job = OCR_JOBS.get(id);
  const child = OCR_CHILDREN.get(id);
  if (!job || !child || job.status !== "running") return false;
  job.status = "cancelled"; job.finishedAt = Date.now(); job.elapsedMs = job.finishedAt - job.startedAt; job.message = "Đã hủy nhận diện."; job.updatedAt = Date.now();
  child.kill();
  return true;
}

export function getSubtitleOcrMaxUploadBytes() { return OCR_MAX_UPLOAD_BYTES; }
