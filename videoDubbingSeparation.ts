import fs from "fs";
import path from "path";
import { randomBytes } from "crypto";
import { ChildProcessByStdio, spawn } from "child_process";
import { Readable } from "stream";
import {
  VideoDubbingJob,
  VideoDubbingSeparationAvailability,
  VideoDubbingSeparationTask,
} from "./src/types/videoDubbing";
import { VideoDubbingManager } from "./videoDubbingManager";
import { getGpuExecutionSettings } from "./gpuExecutionSettings";

const MODEL_NAME = "htdemucs";
const MDX_MODEL_NAME = "UVR-MDX-NET-Inst_HQ_3.onnx";
const MODEL_SAMPLE_RATE = 44_100;
const SEPARATION_TIMEOUT_MS = 2 * 60 * 60 * 1000;
const PROBE_TIMEOUT_MS = 30_000;
const PROCESS_OUTPUT_LIMIT = 64 * 1024;
const DURATION_TOLERANCE_SECONDS = 0.1;

interface DemucsProgressEvent {
  type: "progress";
  completedSegments: number;
  totalSegments: number;
  progressPercent: number;
}

const AVAILABILITY_SCRIPT = [
  "import importlib.util, json, os, sys",
  "result = {'demucs': False, 'torch': False, 'model': False, 'cuda': False, 'mdx': False, 'dml': False}",
  "if importlib.util.find_spec('audio_separator') and importlib.util.find_spec('onnxruntime'):",
  "  import onnxruntime as ort",
  "  result['dml'] = 'DmlExecutionProvider' in ort.get_available_providers()",
  "  result['mdx'] = result['dml'] and os.path.isfile(sys.argv[2])",
  "if all(importlib.util.find_spec(name) for name in ('demucs', 'torch', 'huggingface_hub', 'yaml')):",
  "  result['demucs'] = True",
  "  import torch",
  "  result['torch'] = True",
  "  result['cuda'] = bool(torch.cuda.is_available())",
  "  from huggingface_hub import try_to_load_from_cache",
  "  import yaml",
  "  model = sys.argv[1]",
  "  repo = 'adefossez/HTDemucs' if model == 'htdemucs' else 'adefossez/Demucs-' + model",
  "  config = try_to_load_from_cache(repo, model + '.yaml')",
  "  if config:",
  "    with open(config, encoding='utf-8') as stream:",
  "      signatures = yaml.safe_load(stream).get('models', [])",
  "    result['model'] = bool(signatures) and all(try_to_load_from_cache(repo, signature + '.safetensors') for signature in signatures)",
  "print(json.dumps(result))",
].join("\n");

const MDX_ENTRY_SCRIPT = [
  "import json, os, shutil, socket, sys",
  "from pathlib import Path",
  "def deny_network(*args, **kwargs): raise RuntimeError('Network access is disabled for local separation.')",
  "socket.socket.connect = deny_network",
  "socket.create_connection = deny_network",
  "input_path, output_path, model_path = sys.argv[1:4]",
  "import onnxruntime as ort",
  "from audio_separator.separator import Separator",
  "if 'DmlExecutionProvider' not in ort.get_available_providers(): raise RuntimeError('ONNX Runtime DirectML provider is unavailable.')",
  "sessions = []",
  "original_session = ort.InferenceSession",
  "def tracked_session(*args, **kwargs):",
  "  session = original_session(*args, **kwargs)",
  "  sessions.append(session)",
  "  return session",
  "ort.InferenceSession = tracked_session",
  "model_path = Path(model_path).resolve()",
  "if not model_path.is_file(): raise RuntimeError('The configured MDX model file is missing.')",
  "output_directory = Path(output_path)",
  "output_directory.mkdir(parents=True, exist_ok=True)",
  "separator = Separator(log_level=40, model_file_dir=str(model_path.parent), output_dir=str(output_directory), output_format='WAV', sample_rate=44100)",
  "separator.onnx_execution_provider = ['DmlExecutionProvider']",
  "print(json.dumps({'type':'phase','phase':'loading_model'}), flush=True)",
  "separator.load_model(model_path.name)",
  "session = sessions[0] if sessions else None",
  "providers = session.get_providers() if session is not None else []",
  "if not providers or providers[0] != 'DmlExecutionProvider': raise RuntimeError('MDX ONNX session did not activate DmlExecutionProvider.')",
  "print(json.dumps({'type':'phase','phase':'separating','backend':'mdx','provider':providers[0]}), flush=True)",
  "outputs = separator.separate(input_path)",
  "target = output_directory / 'mdx' / 'input'",
  "target.mkdir(parents=True, exist_ok=True)",
  "found = set()",
  "for output in outputs:",
  "  source_file = Path(output)",
  "  if not source_file.is_absolute(): source_file = output_directory / source_file",
  "  name = source_file.name.lower()",
  "  stem = 'vocals' if 'vocal' in name else ('no_vocals' if 'instrumental' in name or 'no_vocal' in name else None)",
  "  if stem:",
  "    shutil.copy2(source_file, target / (stem + '.wav'))",
  "    found.add(stem)",
  "if found != {'vocals', 'no_vocals'}: raise RuntimeError('MDX did not produce both vocals and instrumental stems.')",
  "print(json.dumps({'type':'phase','phase':'validating'}), flush=True)",
].join("\n");

const DEMUCS_ENTRY_SCRIPT = [
  "import json, math, socket, sys",
  "def deny_network(*args, **kwargs):",
  "  raise RuntimeError('Network access is disabled for local separation.')",
  "socket.socket.connect = deny_network",
  "socket.create_connection = deny_network",
  "from pathlib import Path",
  "import torch",
  "from demucs.api import Separator",
  "from demucs.audio import save_audio",
  "input_path, output_path, device = sys.argv[1:4]",
  "def emit(value):",
  "  print(json.dumps(value, separators=(',', ':')), flush=True)",
  "emit({'type': 'phase', 'phase': 'loading_model'})",
  "separator = Separator(model='htdemucs', device=device, shifts=1, split=True, overlap=0.25, jobs=1, progress=False)",
  "emit({'type': 'phase', 'phase': 'separating'})",
  "segment_models = getattr(separator.model, 'models', [separator.model])",
  "def on_progress(event):",
  "  if event.get('state') != 'end':",
  "    return",
  "  length = int(event.get('audio_length', 0))",
  "  total = 0",
  "  if length > 0:",
  "    for sub_model in segment_models:",
  "      segment = getattr(sub_model, 'segment', None)",
  "      if segment is None:",
  "        total += 1",
  "      else:",
  "        segment_length = int(separator.samplerate * float(segment))",
  "        stride = int((1 - 0.25) * segment_length)",
  "        total += math.ceil(length / stride) if stride > 0 else 0",
  "    total *= 1",
  "  key = (int(event.get('model_idx_in_bag', 0)), int(event.get('shift_idx', 0)), int(event.get('segment_offset', 0)))",
  "  completed.add(key)",
  "  if total > 0:",
  "    emit({'type': 'progress', 'completedSegments': len(completed), 'totalSegments': total, 'progressPercent': min(99, int(len(completed) * 100 / total))})",
  "completed = set()",
  "separator.update_parameter(callback=on_progress)",
  "origin, stems = separator.separate_audio_file(Path(input_path))",
  "emit({'type': 'phase', 'phase': 'writing_outputs'})",
  "output_directory = Path(output_path) / 'htdemucs' / 'input'",
  "output_directory.mkdir(parents=True, exist_ok=True)",
  "vocals = stems.pop('vocals')",
  "instrumental = torch.zeros_like(next(iter(stems.values())))",
  "for stem in stems.values():",
  "  instrumental += stem",
  "kwargs = {'samplerate': separator.samplerate, 'clip': 'rescale', 'as_float': False, 'bits_per_sample': 16}",
  "save_audio(vocals, str(output_directory / 'vocals.wav'), **kwargs)",
  "save_audio(instrumental, str(output_directory / 'no_vocals.wav'), **kwargs)",
  "emit({'type': 'phase', 'phase': 'validating'})",
].join("\n");

interface ActiveSeparation {
  jobId: string;
  child?: ChildProcessByStdio<null, Readable, Readable>;
  cancelled: boolean;
  abortController: AbortController;
  operation: Promise<void>;
  temporaryDirectory: string;
}

interface SeparationProbe {
  streams?: Array<{
    codec_type?: string;
    sample_rate?: string;
    channels?: number;
  }>;
  format?: { duration?: string };
}

export interface VideoDubbingSeparationOptions {
  pythonPath: string;
  ffmpegPath: string;
  ffprobePath: string;
  isMediaBusy: (jobId: string) => boolean;
  checkAvailability?: () => Promise<VideoDubbingSeparationAvailability>;
  runInference?: (
    inputPath: string,
    outputDirectory: string,
    signal: AbortSignal,
    onProgress?: (event: DemucsProgressEvent) => void,
  ) => Promise<void>;
}

export class VideoDubbingSeparationCoordinator {
  private readonly activeTasks = new Map<string, ActiveSeparation>();
  private availabilityPromise?: Promise<VideoDubbingSeparationAvailability>;
  private availabilityMode?: ReturnType<typeof getGpuExecutionSettings>["mode"];

  constructor(
    private readonly manager: VideoDubbingManager,
    private readonly options: VideoDubbingSeparationOptions,
  ) {}

  isBusy(jobId: string): boolean {
    return this.activeTasks.has(jobId);
  }

  getAvailability(): Promise<VideoDubbingSeparationAvailability> {
    const mode = getGpuExecutionSettings().mode;
    if (this.availabilityMode !== mode) {
      this.availabilityMode = mode;
      this.availabilityPromise = undefined;
    }
    if (!this.availabilityPromise) {
      this.availabilityPromise = this.options.checkAvailability
        ? this.options.checkAvailability()
        : this.inspectAvailability();
    }
    return this.availabilityPromise;
  }

  async start(jobId: string): Promise<VideoDubbingSeparationTask> {
    const job = this.requireReadyJob(jobId);
    if (!job.metadata?.audioCodec) {
      throw new Error("Video nguồn không có audio stream để tách.");
    }
    if (job.masterGeneration?.status === "generating") {
      throw new Error("Hãy đợi TTS Master hoàn tất trước khi tách audio.");
    }
    this.assertNoConflict(jobId);

    const directory = this.requireDirectory(jobId);
    const temporaryDirectory = path.join(
      directory,
      `.separation-${randomBytes(12).toString("hex")}`,
    );
    fs.mkdirSync(temporaryDirectory, { recursive: false });
    const previous = job.separation;
    const state: VideoDubbingSeparationTask = {
      status: "processing",
      phase: "checking",
      startedAtMs: Date.now(),
      heartbeatAtMs: Date.now(),
      durationSeconds: previous?.durationSeconds,
      sampleRate: previous?.sampleRate,
      channels: previous?.channels,
      vocalsSizeBytes: previous?.vocalsSizeBytes,
      instrumentalSizeBytes: previous?.instrumentalSizeBytes,
    };
    this.manager.setSeparationTask(jobId, state);
    const active: ActiveSeparation = {
      jobId,
      cancelled: false,
      abortController: new AbortController(),
      operation: Promise.resolve(),
      temporaryDirectory,
    };
    this.activeTasks.set(jobId, active);
    active.operation = this.runSeparation(job, active);
    return { ...state };
  }

  async cancel(jobId: string): Promise<void> {
    const active = this.activeTasks.get(jobId);
    if (!active) return;
    active.cancelled = true;
    active.abortController.abort();
    active.child?.kill();
    await active.operation;
  }

  getTrackPath(jobId: string, track: "vocals" | "instrumental"): string | null {
    const directory = this.manager.getJobDirectory(jobId);
    if (!directory) return null;
    const filePath = path.resolve(directory, `${track}.wav`);
    if (!filePath.startsWith(`${path.resolve(directory)}${path.sep}`)) {
      return null;
    }
    return fs.existsSync(filePath) && fs.statSync(filePath).size > 44
      ? filePath
      : null;
  }

  private async inspectAvailability(): Promise<VideoDubbingSeparationAvailability> {
    try {
      const { stdout } = await this.runAvailabilityProcess();
      const result = JSON.parse(stdout) as {
        demucs?: boolean;
        torch?: boolean;
        model?: boolean;
        cuda?: boolean;
        mdx?: boolean;
        dml?: boolean;
      };
      const gpuMode = getGpuExecutionSettings().mode;
      const requestedBackend = gpuMode === "cpu"
        ? "demucs"
        : process.env.VIDEO_DUBBING_SEPARATION_BACKEND || "auto";
      const mdxReady = Boolean(result.mdx);
      const demucsReady = Boolean(result.demucs && result.torch && result.model);
      if (requestedBackend === "mdx" && mdxReady && demucsReady) {
        return {
          status: "ready",
          backend: "mdx",
          model: MDX_MODEL_NAME,
          device: "directml",
          fallbackDevice: result.cuda ? "cuda" : "cpu",
          message: "MDX htdemucs-Inst-HQ-3 sẵn sàng trên ONNX Runtime DirectML; Demucs CPU sẽ được dùng nếu DirectML gặp lỗi.",
        };
      }
      if (requestedBackend === "mdx") {
        return {
          status: "unavailable",
          model: MDX_MODEL_NAME,
          message:
            "MDX DirectML chưa sẵn sàng hoặc Demucs CPU fallback chưa có model/dependency. Cần audio-separator, onnxruntime-directml, model MDX local và Demucs htdemucs; ứng dụng không tự cài hoặc tải model.",
        };
      }
      if (requestedBackend !== "demucs" && mdxReady && demucsReady) {
        return {
          status: "ready",
          backend: "mdx",
          model: MDX_MODEL_NAME,
          device: "directml",
          fallbackDevice: result.cuda ? "cuda" : "cpu",
          message: "MDX DirectML sẵn sàng; Demucs CUDA/CPU được giữ làm fallback nếu inference DirectML lỗi.",
        };
      }
      if (demucsReady) {
        return {
          status: "ready",
          backend: "demucs",
          model: MODEL_NAME,
          device: gpuMode !== "cpu" && result.cuda ? "cuda" : "cpu",
          message: result.cuda
            && gpuMode !== "cpu"
            ? "Demucs htdemucs sẵn sàng; sẽ sử dụng CUDA."
            : gpuMode === "cpu"
              ? "Chế độ CPU đang bật; Demucs htdemucs sẽ chạy bằng CPU."
              : "Demucs htdemucs sẵn sàng; sẽ chạy bằng CPU.",
        };
      }
      return {
        status: "unavailable",
        model: MDX_MODEL_NAME,
        message: "Không có backend tách audio khả dụng. Cần Demucs + model htdemucs, hoặc MDX + ONNX Runtime DirectML + file model local.",
      };
    } catch (error) {
      console.error("[VideoDubbing] Separation preflight failed:", error);
      return {
        status: "unavailable",
        model: MODEL_NAME,
        message:
          "Không thể kiểm tra Python/Demucs. Hãy xác minh Python và cấu hình VIDEO_DUBBING_SEPARATION_PYTHON nếu cần.",
      };
    }
  }

  private runAvailabilityProcess(): Promise<{ stdout: string }> {
    return new Promise((resolve, reject) => {
      const child = spawn(
        this.options.pythonPath,
        [
          "-c",
          AVAILABILITY_SCRIPT,
          MODEL_NAME,
          process.env.VIDEO_DUBBING_MDX_MODEL_PATH || "",
        ],
        {
          shell: false,
          windowsHide: true,
          env: this.pythonEnvironment(),
          stdio: ["ignore", "pipe", "pipe"],
        },
      );
      let stdout = "";
      let stderr = "";
      let timedOut = false;
      const timeout = setTimeout(() => {
        timedOut = true;
        child.kill();
      }, PROBE_TIMEOUT_MS);
      child.stdout.setEncoding("utf8");
      child.stderr.setEncoding("utf8");
      child.stdout.on("data", (chunk: string) => {
        stdout += chunk;
        if (Buffer.byteLength(stdout) > PROCESS_OUTPUT_LIMIT) child.kill();
      });
      child.stderr.on("data", (chunk: string) => {
        stderr = `${stderr}${chunk}`.slice(-8192);
      });
      child.once("error", (error) => {
        clearTimeout(timeout);
        reject(error);
      });
      child.once("close", (code) => {
        clearTimeout(timeout);
        if (timedOut) {
          reject(new Error("Python preflight timed out."));
        } else if (code !== 0) {
          reject(new Error(stderr || `Python preflight exited with ${code}.`));
        } else {
          resolve({ stdout });
        }
      });
    });
  }

  private pythonEnvironment(): NodeJS.ProcessEnv {
    const configuredThreads = Number(
      process.env.VIDEO_DUBBING_DEMUCS_THREADS || 2,
    );
    const threadCount =
      Number.isSafeInteger(configuredThreads) &&
      configuredThreads >= 1 &&
      configuredThreads <= 16
        ? configuredThreads
        : 2;
    return {
      ...process.env,
      PYTHONUTF8: "1",
      PYTHONIOENCODING: "utf-8",
      HF_HUB_OFFLINE: "1",
      TRANSFORMERS_OFFLINE: "1",
      HF_HUB_DISABLE_PROGRESS_BARS: "1",
      OMP_NUM_THREADS: String(threadCount),
      MKL_NUM_THREADS: String(threadCount),
      OPENBLAS_NUM_THREADS: String(threadCount),
    };
  }

  private requireReadyJob(jobId: string): VideoDubbingJob {
    const job = this.manager.getJob(jobId);
    if (!job) throw new Error("Không tìm thấy job Video Dubbing.");
    if (job.status !== "completed" || !job.metadata) {
      throw new Error("Video cần được tải lên và kiểm tra thành công trước.");
    }
    return job;
  }

  private assertNoConflict(jobId: string): void {
    if (this.activeTasks.has(jobId) || this.options.isMediaBusy(jobId)) {
      throw new Error("Job này đang có tác vụ media khác chạy.");
    }
  }

  private async extractInput(
    job: VideoDubbingJob,
    active: ActiveSeparation,
    outputPath: string,
  ): Promise<number> {
    if (!job.metadata?.audioCodec) {
      throw new Error("Video nguồn không có audio stream để tách.");
    }
    const videoPath = path.join(this.requireDirectory(active.jobId), "source.video");
    if (!fs.existsSync(videoPath)) throw new Error("Không tìm thấy video nguồn.");
    this.assertNotCancelled(active);
    await this.runChild(
      active,
      this.options.ffmpegPath,
      [
        "-nostdin",
        "-hide_banner",
        "-loglevel",
        "error",
        "-y",
        "-i",
        videoPath,
        "-map",
        "0:a:0",
        "-vn",
        "-ac",
        "2",
        "-ar",
        String(MODEL_SAMPLE_RATE),
        "-c:a",
        "pcm_s16le",
        outputPath,
      ],
      SEPARATION_TIMEOUT_MS,
      "FFmpeg không thể trích audio nguồn.",
    );
    this.assertNotCancelled(active);
    this.assertOutput(outputPath, "FFmpeg không tạo được audio đầu vào.");
    const metadata = await this.probe(outputPath, active);
    const duration = Number(metadata.format?.duration);
    if (
      !Number.isFinite(duration) ||
      duration <= 0
    ) {
      throw new Error("Audio trích xuất không có thời lượng hợp lệ.");
    }
    return duration;
  }

  private validateAudioMetadata(
    metadata: SeparationProbe,
    expectedDuration: number,
    label: string,
  ): void {
    const stream = metadata.streams?.find(
      (candidate) => candidate.codec_type === "audio",
    );
    const duration = Number(metadata.format?.duration);
    if (
      !stream ||
      Number(stream.sample_rate) !== MODEL_SAMPLE_RATE ||
      stream.channels !== 2 ||
      !Number.isFinite(duration) ||
      duration <= 0 ||
      Math.abs(duration - expectedDuration) > DURATION_TOLERANCE_SECONDS
    ) {
      throw new Error(
        `${label} không hợp lệ hoặc sai định dạng/thời lượng; yêu cầu WAV stereo 44.1 kHz và lệch không quá ${DURATION_TOLERANCE_SECONDS}s.`,
      );
    }
  }

  private probe(
    filePath: string,
    active: ActiveSeparation,
  ): Promise<SeparationProbe> {
    return this.runChild(
      active,
      this.options.ffprobePath,
      [
        "-v",
        "error",
        "-protocol_whitelist",
        "file",
        "-show_entries",
        "format=duration:stream=codec_type,sample_rate,channels",
        "-of",
        "json",
        filePath,
      ],
      PROBE_TIMEOUT_MS,
      "FFprobe không thể xác minh audio.",
    ).then((result) => {
      try {
        return JSON.parse(result.stdout) as SeparationProbe;
      } catch {
        throw new Error("FFprobe trả metadata audio không hợp lệ.");
      }
    });
  }

  private runChild(
    active: ActiveSeparation,
    executable: string,
    args: string[],
    timeoutMs: number,
    failureMessage: string,
    onStdoutLine?: (line: string) => void,
  ): Promise<{ stdout: string }> {
    this.assertNotCancelled(active);
    return new Promise((resolve, reject) => {
      const child = spawn(executable, args, {
        shell: false,
        windowsHide: true,
        env: this.pythonEnvironment(),
        stdio: ["ignore", "pipe", "pipe"],
      });
      active.child = child;
      let stdout = "";
      let stderr = "";
      let timedOut = false;
      let outputTooLarge = false;
      let callbackError: unknown;
      let stdoutBuffer = "";
      const timeout = setTimeout(() => {
        timedOut = true;
        child.kill();
      }, timeoutMs);
      child.stdout.setEncoding("utf8");
      child.stderr.setEncoding("utf8");
      child.stdout.on("data", (chunk: string) => {
        if (!onStdoutLine) {
          stdout += chunk;
          if (Buffer.byteLength(stdout) > PROCESS_OUTPUT_LIMIT) {
            outputTooLarge = true;
            child.kill();
          }
          return;
        }
        stdoutBuffer += chunk;
        if (Buffer.byteLength(stdoutBuffer) > PROCESS_OUTPUT_LIMIT) {
          outputTooLarge = true;
          child.kill();
          return;
        }
        let lineEnd = stdoutBuffer.indexOf("\n");
        while (lineEnd >= 0) {
          const line = stdoutBuffer.slice(0, lineEnd).trim();
          stdoutBuffer = stdoutBuffer.slice(lineEnd + 1);
          if (line) {
            try {
              onStdoutLine(line);
            } catch (error) {
              callbackError = error;
              child.kill();
              return;
            }
          }
          lineEnd = stdoutBuffer.indexOf("\n");
        }
      });
      child.stderr.on("data", (chunk: string) => {
        stderr = `${stderr}${chunk}`.slice(-PROCESS_OUTPUT_LIMIT);
      });
      child.once("error", (error) => {
        clearTimeout(timeout);
        if (active.child === child) active.child = undefined;
        console.error("[VideoDubbing] Separation process launch failed:", error);
        reject(new Error(failureMessage));
      });
      child.once("close", (code) => {
        clearTimeout(timeout);
        if (active.child === child) active.child = undefined;
        if (onStdoutLine && stdoutBuffer.trim()) {
          try {
            onStdoutLine(stdoutBuffer.trim());
          } catch (error) {
            callbackError = error;
          }
        }
        if (active.cancelled) {
          reject(new Error("Tác vụ tách audio đã bị hủy."));
        } else if (callbackError) {
          reject(callbackError);
        } else if (timedOut) {
          reject(new Error("Tác vụ tách audio vượt quá thời gian chờ."));
        } else if (outputTooLarge) {
          reject(new Error("Tiến trình tách audio trả đầu ra vượt giới hạn."));
        } else if (code !== 0) {
          console.error(
            "[VideoDubbing] Separation process failed:",
            stderr.slice(-2000),
          );
          reject(new Error(failureMessage));
        } else {
          resolve({ stdout });
        }
      });
    });
  }

  private assertOutput(filePath: string, message: string): void {
    if (!fs.existsSync(filePath) || fs.statSync(filePath).size <= 44) {
      throw new Error(message);
    }
  }

  private publishTracks(
    temporaryDirectory: string,
    vocalsSource: string,
    instrumentalSource: string,
    jobDirectory: string,
  ): void {
    const targets = [
      { source: vocalsSource, target: path.join(jobDirectory, "vocals.wav") },
      {
        source: instrumentalSource,
        target: path.join(jobDirectory, "instrumental.wav"),
      },
    ];
    const resolvedJob = path.resolve(jobDirectory);
    const backups = targets.map((item) => ({
      ...item,
      backup: path.join(
        temporaryDirectory,
        `.previous-${path.basename(item.target)}-${randomBytes(6).toString("hex")}`,
      ),
      hadPrevious: fs.existsSync(item.target),
      published: false,
    }));
    for (const item of backups) {
      if (
        !path.resolve(item.source).startsWith(`${path.resolve(temporaryDirectory)}${path.sep}`) ||
        !path.resolve(item.target).startsWith(`${resolvedJob}${path.sep}`)
      ) {
        throw new Error("Đường dẫn track vượt ra ngoài thư mục job.");
      }
    }

    try {
      for (const item of backups) {
        if (item.hadPrevious) fs.renameSync(item.target, item.backup);
        fs.renameSync(item.source, item.target);
        item.published = true;
      }
    } catch (error) {
      for (const item of backups.reverse()) {
        if (item.published) fs.rmSync(item.target, { force: true });
        if (item.hadPrevious && fs.existsSync(item.backup)) {
          fs.renameSync(item.backup, item.target);
        }
      }
      throw error;
    }
  }

  private requireDirectory(jobId: string): string {
    const directory = this.manager.getJobDirectory(jobId);
    if (!directory) throw new Error("Không tìm thấy thư mục job Video Dubbing.");
    return path.resolve(directory);
  }

  private assertNotCancelled(active: ActiveSeparation): void {
    if (active.cancelled) throw new Error("Tác vụ tách audio đã bị hủy.");
  }

  private async runSeparation(
    job: VideoDubbingJob,
    active: ActiveSeparation,
  ): Promise<void> {
    const heartbeat = setInterval(() => {
      const current = this.manager.getJob(active.jobId)?.separation;
      if (current?.status !== "processing") return;
      const now = Date.now();
      this.updateTask(active, {
        heartbeatAtMs: now,
        elapsedSeconds: current.startedAtMs
          ? Math.max(0, Math.floor((now - current.startedAtMs) / 1000))
          : current.elapsedSeconds,
      });
    }, 5000);
    try {
      const availability = await this.getAvailability();
      this.assertNotCancelled(active);
      if (availability.status !== "ready") {
        throw new Error(availability.message);
      }
      this.updateTask(active, { phase: "extracting" });
      await this.processSeparation(job, active, availability);
    } catch (error) {
      const previous = this.manager.getJob(active.jobId)?.separation;
      const message = error instanceof Error ? error.message : "Tách audio thất bại.";
      if (this.manager.getJob(active.jobId)) {
        this.manager.setSeparationTask(active.jobId, {
          ...previous,
          status: active.cancelled ? "cancelled" : "error",
          elapsedSeconds: previous?.startedAtMs
            ? Math.max(0, Math.floor((Date.now() - previous.startedAtMs) / 1000))
            : previous?.elapsedSeconds,
          error: active.cancelled ? undefined : message,
        });
      }
      if (!active.cancelled) {
        console.error("[VideoDubbing] Separation failed:", error);
      }
    } finally {
      clearInterval(heartbeat);
      await this.cleanup(active);
    }
  }

  private async processSeparation(
    job: VideoDubbingJob,
    active: ActiveSeparation,
    availability: VideoDubbingSeparationAvailability,
  ): Promise<void> {
    const inputPath = path.join(active.temporaryDirectory, "input.wav");
    const outputDirectory = path.join(active.temporaryDirectory, "demucs");
    const expectedDuration = await this.extractInput(job, active, inputPath);
    const inputMetadata = await this.probe(inputPath, active);
    this.validateAudioMetadata(
      inputMetadata,
      expectedDuration,
      "Audio đầu vào sau trích xuất",
    );
    this.assertNotCancelled(active);
    this.manager.setSeparationTask(active.jobId, {
      ...this.manager.getJob(active.jobId)?.separation,
      status: "processing",
      phase: "separating",
      durationSeconds: expectedDuration,
      sampleRate: MODEL_SAMPLE_RATE,
      channels: 2,
    });

    let selectedBackend = availability.backend ?? "demucs";
    if (this.options.runInference) {
      await this.options.runInference(
        inputPath,
        outputDirectory,
        active.abortController.signal,
        (event) => this.handleDemucsEvent(active, JSON.stringify(event)),
      );
      selectedBackend = "demucs";
    } else {
      if (selectedBackend === "mdx") {
        const modelPath = process.env.VIDEO_DUBBING_MDX_MODEL_PATH || "";
        try {
          await this.runChild(
            active,
            this.options.pythonPath,
            ["-c", MDX_ENTRY_SCRIPT, inputPath, path.join(active.temporaryDirectory, "mdx-output"), modelPath],
            SEPARATION_TIMEOUT_MS,
            "MDX DirectML không thể hoàn tất inference.",
            (line) => this.handleDemucsEvent(active, line),
          );
        } catch (error) {
          this.assertNotCancelled(active);
          console.warn("[VideoDubbing] MDX DirectML failed; falling back to Demucs:", error);
          this.updateTask(active, {
            phase: "loading_model",
            progressPercent: undefined,
            completedSegments: undefined,
            totalSegments: undefined,
          });
          selectedBackend = "demucs";
        }
      }
      if (selectedBackend === "demucs") {
        const device =
          selectedBackend === availability.backend
            ? availability.device === "cuda"
              ? "cuda"
              : "cpu"
            : availability.fallbackDevice || "cpu";
        const demucsOutputDirectory = path.join(active.temporaryDirectory, "demucs");
        await this.runChild(
          active,
          this.options.pythonPath,
          [
            "-c",
            DEMUCS_ENTRY_SCRIPT,
            inputPath,
            demucsOutputDirectory,
            device,
          ],
          SEPARATION_TIMEOUT_MS,
          "Demucs không thể hoàn tất inference.",
          (line) => this.handleDemucsEvent(active, line),
        );
      }
    }
    this.assertNotCancelled(active);

    this.manager.setSeparationTask(active.jobId, {
      ...this.manager.getJob(active.jobId)?.separation,
      status: "processing",
      phase: "validating",
      durationSeconds: expectedDuration,
      sampleRate: MODEL_SAMPLE_RATE,
      channels: 2,
    });

    const modelOutput = selectedBackend === "mdx"
      ? path.join(active.temporaryDirectory, "mdx-output", "mdx", "input")
      : path.join(active.temporaryDirectory, "demucs", MODEL_NAME, "input");
    const vocalsPath = path.join(modelOutput, "vocals.wav");
    const instrumentalPath = path.join(modelOutput, "no_vocals.wav");
    this.assertOutput(vocalsPath, "Backend tách audio không tạo được track vocals.");
    this.assertOutput(instrumentalPath, "Backend tách audio không tạo được track instrumental.");
    const vocalsMetadata = await this.probe(vocalsPath, active);
    const instrumentalMetadata = await this.probe(instrumentalPath, active);
    this.validateAudioMetadata(
      vocalsMetadata,
      expectedDuration,
      "Track vocals",
    );
    this.validateAudioMetadata(
      instrumentalMetadata,
      expectedDuration,
      "Track instrumental",
    );
    const vocalsDuration = Number(vocalsMetadata.format?.duration);
    const instrumentalDuration = Number(instrumentalMetadata.format?.duration);
    if (
      Math.abs(vocalsDuration - instrumentalDuration) >
        DURATION_TOLERANCE_SECONDS ||
      Math.abs(vocalsDuration - expectedDuration) >
        DURATION_TOLERANCE_SECONDS ||
      Math.abs(instrumentalDuration - expectedDuration) >
        DURATION_TOLERANCE_SECONDS
    ) {
      throw new Error("Hai track Demucs lệch thời lượng quá ngưỡng cho phép.");
    }
    const alignedVocalsPath = path.join(active.temporaryDirectory, "vocals-aligned.wav");
    const alignedInstrumentalPath = path.join(
      active.temporaryDirectory,
      "instrumental-aligned.wav",
    );
    const exactDuration = expectedDuration.toFixed(6);
    await this.runChild(
      active,
      this.options.ffmpegPath,
      [
        "-nostdin",
        "-hide_banner",
        "-loglevel",
        "error",
        "-y",
        "-i",
        vocalsPath,
        "-i",
        instrumentalPath,
        "-filter_complex",
        `[0:a]aresample=${MODEL_SAMPLE_RATE},aformat=sample_rates=${MODEL_SAMPLE_RATE}:channel_layouts=stereo,apad,atrim=duration=${exactDuration},asetpts=PTS-STARTPTS[v];[1:a]aresample=${MODEL_SAMPLE_RATE},aformat=sample_rates=${MODEL_SAMPLE_RATE}:channel_layouts=stereo,apad,atrim=duration=${exactDuration},asetpts=PTS-STARTPTS[i]`,
        "-map",
        "[v]",
        "-c:a",
        "pcm_s16le",
        alignedVocalsPath,
        "-map",
        "[i]",
        "-c:a",
        "pcm_s16le",
        alignedInstrumentalPath,
      ],
      SEPARATION_TIMEOUT_MS,
      "FFmpeg không thể căn chỉnh các track tách audio.",
    );
    this.assertOutput(alignedVocalsPath, "Không tạo được track vocals đã căn chỉnh.");
    this.assertOutput(
      alignedInstrumentalPath,
      "Không tạo được track instrumental đã căn chỉnh.",
    );
    const alignedVocalsMetadata = await this.probe(alignedVocalsPath, active);
    const alignedInstrumentalMetadata = await this.probe(
      alignedInstrumentalPath,
      active,
    );
    this.validateAudioMetadata(
      alignedVocalsMetadata,
      expectedDuration,
      "Track vocals sau căn chỉnh",
    );
    this.validateAudioMetadata(
      alignedInstrumentalMetadata,
      expectedDuration,
      "Track instrumental sau căn chỉnh",
    );
    this.assertNotCancelled(active);
    this.publishTracks(
      active.temporaryDirectory,
      alignedVocalsPath,
      alignedInstrumentalPath,
      this.requireDirectory(active.jobId),
    );
    const vocalsSizeBytes = fs.statSync(this.getTrackPath(active.jobId, "vocals")!).size;
    const instrumentalSizeBytes = fs.statSync(
      this.getTrackPath(active.jobId, "instrumental")!,
    ).size;
    this.manager.setSeparationTask(active.jobId, {
      status: "completed",
      progressPercent: 100,
      startedAtMs: this.manager.getJob(active.jobId)?.separation?.startedAtMs,
      elapsedSeconds: this.manager.getJob(active.jobId)?.separation?.startedAtMs
        ? Math.max(0, Math.floor((Date.now() - this.manager.getJob(active.jobId)!.separation!.startedAtMs!) / 1000))
        : undefined,
      completedSegments:
        this.manager.getJob(active.jobId)?.separation?.completedSegments,
      totalSegments:
        this.manager.getJob(active.jobId)?.separation?.totalSegments,
      durationSeconds: expectedDuration,
      sampleRate: MODEL_SAMPLE_RATE,
      channels: 2,
      vocalsSizeBytes,
      instrumentalSizeBytes,
    });
  }

  private async cleanup(active: ActiveSeparation): Promise<void> {
    try {
      await fs.promises.rm(active.temporaryDirectory, {
        recursive: true,
        force: true,
      });
    } catch (error) {
      console.error("[VideoDubbing] Could not clean separation temp files:", error);
    }
    if (this.activeTasks.get(active.jobId) === active) {
      this.activeTasks.delete(active.jobId);
    }
  }

  private handleDemucsEvent(active: ActiveSeparation, line: string): void {
    if (active.cancelled || !this.manager.getJob(active.jobId)) return;
    let event:
      | {
          type?: string;
          phase?: string;
          backend?: string;
          provider?: string;
          progressPercent?: number;
          completedSegments?: number;
          totalSegments?: number;
        }
      | undefined;
    try {
      event = JSON.parse(line) as typeof event;
    } catch {
      return;
    }
    if (!event || event.type === "phase") {
      if (event?.phase === "loading_model") {
        this.updateTask(active, {
          phase: "loading_model",
          progressPercent: undefined,
          completedSegments: undefined,
          totalSegments: undefined,
        });
      } else if (event?.phase === "separating") {
        if (event.backend === "mdx" && event.provider === "DmlExecutionProvider") {
          console.info("[VideoDubbing] MDX inference is using DmlExecutionProvider.");
        }
        this.updateTask(active, {
          phase: "separating",
          progressPercent: undefined,
          completedSegments: undefined,
          totalSegments: undefined,
        });
      } else if (event?.phase === "validating") {
        this.updateTask(active, { phase: "validating" });
      } else if (event?.phase === "writing_outputs") {
        this.updateTask(active, { phase: "writing_outputs" });
      }
      return;
    }
    if (
      event.type !== "progress" ||
      !Number.isSafeInteger(event.completedSegments) ||
      !Number.isSafeInteger(event.totalSegments) ||
      !Number.isFinite(event.progressPercent) ||
      !event.totalSegments ||
      event.totalSegments <= 0
    ) {
      return;
    }
    const previous = this.manager.getJob(active.jobId)?.separation;
    const progressPercent = Math.min(
      99,
      Math.max(previous?.progressPercent || 0, event.progressPercent!),
    );
    const completedSegments = Math.max(
      previous?.completedSegments || 0,
      Math.min(event.completedSegments!, event.totalSegments!),
    );
    if (
      previous &&
      previous.completedSegments === completedSegments &&
      previous.totalSegments === event.totalSegments &&
      previous.progressPercent === progressPercent
    ) {
      return;
    }
    this.updateTask(active, {
      phase: "separating",
      progressPercent,
      completedSegments,
      totalSegments: event.totalSegments,
    });
  }

  private updateTask(
    active: ActiveSeparation,
    update: Partial<VideoDubbingSeparationTask>,
  ): void {
    const job = this.manager.getJob(active.jobId);
    if (!job || job.separation?.status !== "processing") return;
    this.manager.setSeparationTask(active.jobId, {
      ...job.separation,
      ...update,
    });
  }
}
