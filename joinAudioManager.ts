import fs from "node:fs";
import path from "node:path";
import { spawn } from "node:child_process";
import { randomUUID } from "node:crypto";
import { pipeline } from "node:stream/promises";
import { Transform, type Readable } from "node:stream";

export interface JoinAudioInput {
  name: string;
  size: number;
}

export interface JoinAudioOptions {
  targetLufs: number;
  truePeakDbtp: number;
}

export type JoinAudioStatus =
  | "uploading"
  | "processing"
  | "completed"
  | "failed"
  | "cancelled";

interface JoinAudioFile extends JoinAudioInput {
  durationSeconds?: number;
  uploaded: boolean;
}

interface JoinAudioJob {
  id: string;
  status: JoinAudioStatus;
  stage: string;
  progressPercent: number;
  message: string;
  files: JoinAudioFile[];
  options: JoinAudioOptions;
  totalDurationSeconds?: number;
  error?: string;
  fileErrors?: string[];
  output?: {
    durationSeconds: number;
    sampleRate: number;
    channels: number;
    codec: string;
    sizeBytes: number;
  };
  workDirectory: string;
  outputPath: string;
  abortRequested: boolean;
  children: Set<ReturnType<typeof spawn>>;
}

const MAX_FILES = 5000;
const MAX_FILE_BYTES = 4 * 1024 * 1024 * 1024;
const PROBE_CONCURRENCY = 4;
const CONCAT_BATCH_SIZE = 32;

function isValidName(name: unknown): name is string {
  if (typeof name !== "string" || name.trim().length === 0 || name.length > 1024) {
    return false;
  }
  return /\.(mp3|wav)$/i.test(name);
}

function validateOptions(value: unknown): JoinAudioOptions {
  const options = value as Partial<JoinAudioOptions> | null;
  const targetLufs = Number(options?.targetLufs);
  const truePeakDbtp = Number(options?.truePeakDbtp);
  if (
    !Number.isFinite(targetLufs) ||
    targetLufs < -30 ||
    targetLufs > -5 ||
    !Number.isFinite(truePeakDbtp) ||
    truePeakDbtp < -9 ||
    truePeakDbtp > 0
  ) {
    throw new Error("Cài đặt âm lượng không hợp lệ.");
  }
  return { targetLufs, truePeakDbtp };
}

async function runProcess(
  job: JoinAudioJob,
  command: string,
  args: string[],
  onProgress?: (outTimeMicroseconds: number) => void,
): Promise<{ stdout: string; stderr: string }> {
  if (job.abortRequested) throw new Error("Tác vụ đã bị hủy.");
  return new Promise((resolve, reject) => {
    const child = spawn(command, args, { windowsHide: true });
    job.children.add(child);
    let stdout = "";
    let stderr = "";
    let progressKey = "";

    child.stdout.setEncoding("utf8");
    child.stdout.on("data", (chunk: string) => {
      stdout = `${stdout}${chunk}`.slice(-64 * 1024);
      for (const line of chunk.split(/\r?\n/)) {
        const separator = line.indexOf("=");
        if (separator < 0) continue;
        const key = line.slice(0, separator);
        const value = line.slice(separator + 1);
        if (key === "out_time_ms") {
          onProgress?.(Number(value));
        } else if (key === "out_time") {
          progressKey = value;
        } else if (key === "progress" && progressKey) {
          const parts = progressKey.split(":").map(Number);
          if (parts.length === 3 && parts.every(Number.isFinite)) {
            onProgress?.(((parts[0] * 60 + parts[1]) * 60 + parts[2]) * 1_000_000);
          }
          progressKey = "";
        }
      }
    });
    child.stderr.setEncoding("utf8");
    child.stderr.on("data", (chunk: string) => {
      stderr = `${stderr}${chunk}`.slice(-16 * 1024);
    });
    child.once("error", (error) => {
      job.children.delete(child);
      reject(error);
    });
    child.once("close", (code) => {
      job.children.delete(child);
      if (job.abortRequested) {
        reject(new Error("Tác vụ đã bị hủy."));
      } else if (code !== 0) {
        reject(new Error(stderr.trim() || `Lệnh media thất bại (mã ${code}).`));
      } else {
        resolve({ stdout, stderr });
      }
    });
  });
}

async function mapWithConcurrency<T>(
  values: T[],
  concurrency: number,
  work: (value: T, index: number) => Promise<void>,
): Promise<void> {
  let nextIndex = 0;
  await Promise.all(
    Array.from({ length: Math.min(concurrency, values.length) }, async () => {
      while (nextIndex < values.length) {
        const index = nextIndex++;
        await work(values[index], index);
      }
    }),
  );
}

function getAudioStream(probe: { streams?: Array<Record<string, unknown>> }) {
  const stream = probe.streams?.find((item) => item.codec_type === "audio");
  if (!stream) throw new Error("Không tìm thấy luồng audio.");
  const duration = Number(stream.duration);
  if (!Number.isFinite(duration) || duration <= 0) {
    throw new Error("Không xác định được thời lượng audio.");
  }
  return {
    durationSeconds: duration,
    sampleRate: Number(stream.sample_rate) || 0,
    channels: Number(stream.channels) || 0,
    codec: String(stream.codec_name || "unknown"),
  };
}

export class JoinAudioManager {
  private readonly jobs = new Map<string, JoinAudioJob>();
  private readonly resultsDirectory: string;
  private readonly temporaryDirectory: string;

  constructor(
    private readonly options: {
      ffmpegPath: string;
      ffprobePath: string;
      storageDirectory: string;
    },
  ) {
    this.resultsDirectory = path.join(options.storageDirectory, "results");
    this.temporaryDirectory = path.join(options.storageDirectory, "temporary");
    fs.mkdirSync(this.resultsDirectory, { recursive: true });
    fs.mkdirSync(this.temporaryDirectory, { recursive: true });
    for (const entry of fs.readdirSync(this.temporaryDirectory, { withFileTypes: true })) {
      if (entry.isDirectory()) {
        fs.rmSync(path.join(this.temporaryDirectory, entry.name), {
          recursive: true,
          force: true,
        });
      }
    }
  }

  createJob(inputs: JoinAudioInput[], rawOptions: unknown): string {
    if (!Array.isArray(inputs) || inputs.length === 0 || inputs.length > MAX_FILES) {
      throw new Error(`Chọn từ 1 đến ${MAX_FILES} tệp MP3/WAV.`);
    }
    const files = inputs.map((input) => {
      if (!input || !isValidName(input.name)) {
        throw new Error("Tên tệp không hợp lệ; chỉ hỗ trợ MP3 và WAV.");
      }
      if (!Number.isSafeInteger(input.size) || input.size <= 0 || input.size > MAX_FILE_BYTES) {
        throw new Error(`Kích thước tệp "${input.name}" không hợp lệ hoặc vượt quá 4 GB.`);
      }
      return { name: input.name, size: input.size, uploaded: false };
    });
    const options = validateOptions(rawOptions);
    const id = randomUUID();
    const workDirectory = path.join(this.temporaryDirectory, id);
    fs.mkdirSync(workDirectory, { recursive: true });
    this.jobs.set(id, {
      id,
      status: "uploading",
      stage: "uploading",
      progressPercent: 0,
      message: "Đang chờ tải tệp lên.",
      files,
      options,
      workDirectory,
      outputPath: path.join(this.resultsDirectory, `${id}.wav`),
      abortRequested: false,
      children: new Set(),
    });
    return id;
  }

  getJob(id: string) {
    const job = this.jobs.get(id);
    if (!job) return undefined;
    return {
      id: job.id,
      status: job.status,
      stage: job.stage,
      progressPercent: job.progressPercent,
      message: job.message,
      fileCount: job.files.length,
      uploadedCount: job.files.filter((file) => file.uploaded).length,
      totalDurationSeconds: job.totalDurationSeconds,
      options: job.options,
      error: job.error,
      fileErrors: job.fileErrors?.slice(0, 5),
      output: job.output,
      outputUrl: job.output ? `/api/join-audio/jobs/${job.id}/output` : undefined,
    };
  }

  getOutputPath(id: string): string | undefined {
    const job = this.jobs.get(id);
    return job?.status === "completed" && job.output ? job.outputPath : undefined;
  }

  async receiveFile(id: string, index: number, input: Readable): Promise<void> {
    const job = this.requireJob(id);
    if (job.status !== "uploading" || !Number.isInteger(index) || index < 0 || index >= job.files.length) {
      throw new Error("Phiên tải lên hoặc chỉ số tệp không hợp lệ.");
    }
    const file = job.files[index];
    if (file.uploaded) throw new Error(`Tệp số ${index + 1} đã được tải lên.`);
    const extension = path.extname(file.name).toLowerCase();
    const outputPath = path.join(job.workDirectory, `input-${String(index).padStart(5, "0")}${extension}`);
    let bytesReceived = 0;
    const sizeGuard = new Transform({
      transform(chunk: Buffer, _encoding, callback) {
        bytesReceived += chunk.length;
        callback(
          bytesReceived > file.size
            ? new Error(`Dữ liệu tải lên của "${file.name}" vượt kích thước đã khai báo.`)
            : null,
          chunk,
        );
      },
    });
    try {
      await pipeline(input, sizeGuard, fs.createWriteStream(outputPath, { flags: "wx" }));
      if (bytesReceived !== file.size) {
        throw new Error(`Tệp "${file.name}" tải lên không đầy đủ.`);
      }
      file.uploaded = true;
    } catch (error) {
      await fs.promises.rm(outputPath, { force: true });
      throw error;
    }
  }

  startJob(id: string): void {
    const job = this.requireJob(id);
    if (job.status !== "uploading" || job.files.some((file) => !file.uploaded)) {
      throw new Error("Cần tải lên đầy đủ các tệp trước khi bắt đầu ghép.");
    }
    job.status = "processing";
    job.stage = "probing";
    job.progressPercent = 1;
    job.message = `Đang kiểm tra ${job.files.length} tệp audio.`;
    void this.processJob(job);
  }

  async cancelJob(id: string): Promise<void> {
    const job = this.requireJob(id);
    if (job.status === "completed" || job.status === "failed" || job.status === "cancelled") {
      return;
    }
    job.abortRequested = true;
    job.status = "cancelled";
    job.stage = "cancelled";
    job.message = "Đã hủy tác vụ.";
    for (const child of job.children) child.kill();
    await this.cleanup(job);
  }

  private requireJob(id: string): JoinAudioJob {
    const job = this.jobs.get(id);
    if (!job) throw new Error("Không tìm thấy tác vụ ghép audio.");
    return job;
  }

  private async processJob(job: JoinAudioJob): Promise<void> {
    try {
      const failures: string[] = [];
      await mapWithConcurrency(job.files, PROBE_CONCURRENCY, async (file, index) => {
        if (job.abortRequested) return;
        try {
          const inputPath = this.inputPath(job, index);
          const { stdout } = await runProcess(job, this.options.ffprobePath, [
            "-v", "error", "-select_streams", "a:0", "-show_entries",
            "stream=codec_type,codec_name,sample_rate,channels,duration",
            "-of", "json", inputPath,
          ]);
          file.durationSeconds = getAudioStream(JSON.parse(stdout)).durationSeconds;
        } catch (error) {
          if (!job.abortRequested) {
            failures.push(
              `${file.name}: ${error instanceof Error ? error.message : String(error)}`.slice(0, 500),
            );
          }
        }
      });
      if (job.abortRequested) return;
      if (failures.length > 0) {
        job.fileErrors = failures;
        throw new Error(
          `${failures.length} tệp không hợp lệ. Kiểm tra chi tiết lỗi để sửa các tệp đầu vào.`,
        );
      }

      job.totalDurationSeconds = job.files.reduce(
        (total, file) => total + (file.durationSeconds || 0),
        0,
      );
      const batchCount = Math.ceil(job.files.length / CONCAT_BATCH_SIZE);
      const intermediatePaths: string[] = [];
      job.stage = "joining";
      job.message = `Đang ghép ${job.files.length} tệp theo thứ tự đã chọn.`;

      for (let batchIndex = 0; batchIndex < batchCount; batchIndex++) {
        if (job.abortRequested) return;
        const first = batchIndex * CONCAT_BATCH_SIZE;
        const last = Math.min(first + CONCAT_BATCH_SIZE, job.files.length);
        const inputs = Array.from({ length: last - first }, (_, index) => first + index);
        const intermediatePath = path.join(
          job.workDirectory,
          `batch-${String(batchIndex).padStart(4, "0")}.wav`,
        );
        intermediatePaths.push(intermediatePath);
        await this.concatenate(job, inputs, intermediatePath, (fraction) => {
          const overall = (first + fraction * (last - first)) / job.files.length;
          job.progressPercent = Math.min(80, 5 + overall * 75);
        });
      }

      if (job.abortRequested) return;
      job.stage = "normalizing";
      job.message = "Đang chuẩn hóa loudness và giới hạn true peak.";
      const partialPath = path.join(job.workDirectory, "result.partial.wav");
      const args: string[] = ["-hide_banner", "-nostats", "-y"];
      for (const input of intermediatePaths) args.push("-i", input);
      const filters = intermediatePaths.map(
        (_input, index) =>
          `[${index}:a:0]aresample=16000,aformat=sample_fmts=s16:channel_layouts=mono[a${index}]`,
      );
      const concatInputs = intermediatePaths.map((_input, index) => `[a${index}]`).join("");
      filters.push(
        `${concatInputs}concat=n=${intermediatePaths.length}:v=0:a=1[merged]`,
        `[merged]loudnorm=I=${job.options.targetLufs}:TP=${job.options.truePeakDbtp}:LRA=11[normalized]`,
      );
      args.push(
        "-filter_complex", filters.join(";"),
        "-map", "[normalized]",
        "-ar", "16000", "-ac", "1", "-c:a", "pcm_s16le",
        "-progress", "pipe:1", partialPath,
      );
      await runProcess(job, this.options.ffmpegPath, args, (outTime) => {
        const fraction = Math.min(1, outTime / (job.totalDurationSeconds! * 1_000_000));
        job.progressPercent = Math.min(97, 80 + fraction * 17);
      });
      if (job.abortRequested) return;

      const { stdout } = await runProcess(job, this.options.ffprobePath, [
        "-v", "error", "-select_streams", "a:0", "-show_entries",
        "stream=codec_type,codec_name,sample_rate,channels,duration",
        "-of", "json", partialPath,
      ]);
      const audio = getAudioStream(JSON.parse(stdout));
      if (audio.sampleRate !== 16000 || audio.channels !== 1 || audio.codec !== "pcm_s16le") {
        throw new Error("Tệp kết quả không đúng WAV mono, 16 kHz, PCM 16-bit.");
      }
      const outputStat = await fs.promises.stat(partialPath);
      if (job.abortRequested) return;
      fs.renameSync(partialPath, job.outputPath);
      job.output = {
        ...audio,
        sizeBytes: outputStat.size,
      };
      job.status = "completed";
      job.stage = "completed";
      job.progressPercent = 100;
      job.message = "Đã ghép, chuẩn hóa và xác minh tệp WAV.";
    } catch (error) {
      if (job.abortRequested) return;
      job.status = "failed";
      job.stage = "failed";
      job.error = error instanceof Error ? error.message : String(error);
      job.message = "Tác vụ ghép audio thất bại.";
    } finally {
      if (job.status !== "processing") await this.cleanup(job);
    }
  }

  private inputPath(job: JoinAudioJob, index: number): string {
    const extension = path.extname(job.files[index].name).toLowerCase();
    return path.join(job.workDirectory, `input-${String(index).padStart(5, "0")}${extension}`);
  }

  private async concatenate(
    job: JoinAudioJob,
    inputIndices: number[],
    outputPath: string,
    onProgress: (fraction: number) => void,
  ): Promise<void> {
    const args = ["-hide_banner", "-nostats", "-y"];
    for (const index of inputIndices) args.push("-i", this.inputPath(job, index));
    const filters = inputIndices.map(
      (_index, inputIndex) =>
        `[${inputIndex}:a:0]aresample=16000,aformat=sample_fmts=s16:channel_layouts=mono[a${inputIndex}]`,
    );
    const concatInputs = inputIndices.map((_index, inputIndex) => `[a${inputIndex}]`).join("");
    filters.push(`${concatInputs}concat=n=${inputIndices.length}:v=0:a=1[merged]`);
    args.push(
      "-filter_complex", filters.join(";"),
      "-map", "[merged]",
      "-ar", "16000", "-ac", "1", "-c:a", "pcm_s16le",
      "-progress", "pipe:1", outputPath,
    );
    const batchDuration = inputIndices.reduce(
      (total, index) => total + (job.files[index].durationSeconds || 0),
      0,
    );
    await runProcess(job, this.options.ffmpegPath, args, (outTime) => {
      onProgress(Math.min(1, outTime / (batchDuration * 1_000_000)));
    });
  }

  private async cleanup(job: JoinAudioJob): Promise<void> {
    await fs.promises.rm(job.workDirectory, { recursive: true, force: true });
  }
}
