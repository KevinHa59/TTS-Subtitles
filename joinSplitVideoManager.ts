import fs from "node:fs";
import path from "node:path";
import { randomUUID } from "node:crypto";
import { spawn } from "node:child_process";
import { pipeline } from "node:stream/promises";
import { Transform } from "node:stream";
import type { IncomingMessage } from "node:http";
import type {
  JoinSplitVideoExportFile,
  JoinSplitVideoRange,
  JoinSplitVideoRangeStatus,
  JoinSplitVideoSource,
  JoinSplitVideoStream,
} from "./src/types/joinSplitVideo";

const MAX_UPLOAD_BYTES = 4 * 1024 * 1024 * 1024;
const MAX_PROCESS_OUTPUT_BYTES = 64 * 1024 * 1024;
const PROCESS_TIMEOUT_MS = 2 * 60 * 60 * 1000;
const SUPPORTED_EXTENSIONS = new Set([".mp4", ".mkv", ".mov", ".avi", ".webm", ".m4v"]);

interface ProbeStream {
  codec_type?: string;
  codec_name?: string;
  codec_tag_string?: string;
  profile?: string;
  width?: number;
  height?: number;
  pix_fmt?: string;
  level?: number;
  has_b_frames?: number;
  time_base?: string;
  sample_aspect_ratio?: string;
  color_range?: string;
  color_space?: string;
  color_transfer?: string;
  color_primaries?: string;
  field_order?: string;
  r_frame_rate?: string;
  avg_frame_rate?: string;
  sample_rate?: string;
  channels?: number;
  channel_layout?: string;
  extradata_hash?: string;
  sample_fmt?: string;
  bits_per_raw_sample?: string;
  bits_per_coded_sample?: number;
  duration?: string;
  start_time?: string;
  nb_frames?: string;
  nb_read_frames?: string;
  nb_read_packets?: string;
}

interface ProbeResult {
  streams?: ProbeStream[];
  format?: { duration?: string; start_time?: string };
}

interface StoredSource {
  source: JoinSplitVideoSource;
  filePath: string;
}

interface StoredExport extends JoinSplitVideoExportFile {
  filePath: string;
}

function parseRate(value?: string): number {
  if (!value) return 0;
  const [numeratorText, denominatorText] = value.split("/");
  const numerator = Number(numeratorText);
  const denominator = Number(denominatorText || 1);
  return denominator && Number.isFinite(numerator / denominator)
    ? numerator / denominator
    : 0;
}

function sanitizeFileName(value: string): string {
  const baseName = path.basename(value.replace(/\\/g, "/"));
  const cleaned = baseName.replace(/[<>:"/\\|?*\u0000-\u001f]/g, "_").trim();
  return cleaned || "video";
}

function streamDetails(stream: ProbeStream): JoinSplitVideoStream {
  const averageRate = parseRate(stream.avg_frame_rate);
  const nominalRate = parseRate(stream.r_frame_rate);
  const frameRateText =
    averageRate > 0
      ? stream.avg_frame_rate!
      : nominalRate > 0
        ? stream.r_frame_rate!
        : "0/1";
  return {
    codecName: stream.codec_name || "unknown",
    codecTag: stream.codec_tag_string,
    profile: stream.profile,
    width: stream.width,
    height: stream.height,
    pixelFormat: stream.pix_fmt,
    level: stream.level,
    hasBFrames: stream.has_b_frames,
    timeBase: stream.time_base,
    sampleAspectRatio: stream.sample_aspect_ratio,
    colorRange: stream.color_range,
    colorSpace: stream.color_space,
    colorTransfer: stream.color_transfer,
    colorPrimaries: stream.color_primaries,
    fieldOrder: stream.field_order,
    frameRate: averageRate || nominalRate,
    frameRateText,
    nominalFrameRateText: stream.r_frame_rate,
    sampleRate: stream.sample_rate ? Number(stream.sample_rate) : undefined,
    channels: stream.channels,
    channelLayout: stream.channel_layout,
    extradataHash: stream.extradata_hash,
    sampleFormat: stream.sample_fmt,
    bitsPerRawSample: stream.bits_per_raw_sample ? Number(stream.bits_per_raw_sample) : undefined,
    bitsPerCodedSample: stream.bits_per_coded_sample,
  };
}

function runProcess(
  executable: string,
  args: string[],
  outputLimit = MAX_PROCESS_OUTPUT_BYTES,
  onProgress?: (percent: number) => void,
  progressDuration?: number,
  signal?: AbortSignal,
  onStdoutLine?: (line: string) => void,
): Promise<string> {
  return new Promise((resolve, reject) => {
    if (signal?.aborted) {
      reject(new Error("Tác vụ đã bị dừng."));
      return;
    }
    const child = spawn(executable, args, {
      shell: false,
      windowsHide: true,
      stdio: ["ignore", "pipe", "pipe"],
    });
    let stdout = "";
    let stderr = "";
    let outputBytes = 0;
    let overflow = false;
    let progressLines = "";
    let stdoutLines = "";
    const abort = () => child.kill();
    const timeout = setTimeout(() => child.kill(), PROCESS_TIMEOUT_MS);
    signal?.addEventListener("abort", abort, { once: true });
    child.stdout.setEncoding("utf8");
    child.stderr.setEncoding("utf8");
    child.stdout.on("data", (chunk: string) => {
      outputBytes += Buffer.byteLength(chunk);
      if (outputBytes > outputLimit) {
        overflow = true;
        child.kill();
      } else {
        stdout += chunk;
      }
      if (onStdoutLine) {
        stdoutLines += chunk;
        const lines = stdoutLines.split(/\r?\n/);
        stdoutLines = lines.pop() || "";
        for (const line of lines) onStdoutLine(line);
      }
      if (onProgress && progressDuration && progressDuration > 0) {
        progressLines += chunk;
        const lines = progressLines.split(/\r?\n/);
        progressLines = lines.pop() || "";
        for (const line of lines) {
          const match = /^out_time_(?:us|ms)=(\d+)$/.exec(line);
          if (match) {
            const elapsed = Number(match[1]) / 1_000_000;
            onProgress(Math.min(99, Math.max(0, elapsed / progressDuration * 100)));
          }
        }
      }
    });
    child.stderr.on("data", (chunk: string) => {
      stderr = (stderr + chunk).slice(-16_384);
    });
    child.once("error", (error) => {
      clearTimeout(timeout);
      signal?.removeEventListener("abort", abort);
      reject(new Error(`Không thể chạy ${path.basename(executable)}: ${error.message}`));
    });
    child.once("close", (code) => {
      clearTimeout(timeout);
      signal?.removeEventListener("abort", abort);
      if (overflow) {
        reject(new Error("Đầu ra công cụ media vượt quá giới hạn an toàn."));
      } else if (signal?.aborted) {
        reject(new Error("Tác vụ đã bị dừng."));
      } else if (code === 0) {
        resolve(stdout);
      } else {
        reject(new Error(stderr.trim() || `${path.basename(executable)} kết thúc với mã ${code}.`));
      }
    });
  });
}

function streamSignature(source: JoinSplitVideoSource): string {
  return streamSignatureForStreams(source.video, source.audio);
}

function streamSignatureForStreams(
  video: JoinSplitVideoStream,
  audio?: JoinSplitVideoStream,
): string {
  const normalize = (stream?: JoinSplitVideoStream) =>
    stream
      ? {
          codecName: stream.codecName,
          codecTag: stream.codecTag,
          profile: stream.profile,
          width: stream.width,
          height: stream.height,
          pixelFormat: stream.pixelFormat,
          level: stream.level,
          hasBFrames: stream.hasBFrames,
          timeBase: stream.timeBase,
          sampleAspectRatio: stream.sampleAspectRatio,
          colorRange: stream.colorRange,
          colorSpace: stream.colorSpace,
          colorTransfer: stream.colorTransfer,
          colorPrimaries: stream.colorPrimaries,
          fieldOrder: stream.fieldOrder,
          sampleRate: stream.sampleRate,
          channels: stream.channels,
          channelLayout: stream.channelLayout,
          extradataHash: stream.extradataHash,
          sampleFormat: stream.sampleFormat,
          bitsPerRawSample: stream.bitsPerRawSample,
          bitsPerCodedSample: stream.bitsPerCodedSample,
          frameRateText: stream.frameRateText,
          nominalFrameRateText: stream.nominalFrameRateText,
        }
      : null;
  return JSON.stringify([normalize(video), normalize(audio)]);
}

function findEncoder(codecName: string): string | null {
  const encoders: Record<string, string> = {
    h264: "libx264",
    hevc: "libx265",
    vp9: "libvpx-vp9",
    av1: "libaom-av1",
    mpeg4: "mpeg4",
    aac: "aac",
    mp3: "libmp3lame",
    opus: "libopus",
    vorbis: "libvorbis",
    ac3: "ac3",
    flac: "flac",
    alac: "alac",
  };
  return encoders[codecName] || null;
}

function findHardwareEncoder(codecName: string): string | null {
  const encoders: Record<string, string> = {
    h264: "h264_qsv",
    hevc: "hevc_qsv",
    av1: "av1_qsv",
    mpeg2video: "mpeg2_qsv",
    vp9: "vp9_qsv",
  };
  return encoders[codecName] || null;
}

function getVideoEncoderArgs(
  encoder: string,
  video: JoinSplitVideoStream,
): string[] {
  if (encoder.endsWith("_qsv")) {
    const isTenBit = /10|12/.test(video.pixelFormat || "");
    return [
      "-c:v", encoder,
      "-preset", "veryfast",
      "-global_quality", "23",
      "-pix_fmt", isTenBit ? "p010le" : "nv12",
    ];
  }
  const args = ["-c:v", encoder];
  if (encoder === "libx264" || encoder === "libx265") {
    args.push("-crf", "18");
    if (Number.isInteger(video.hasBFrames)) args.push("-bf", String(video.hasBFrames));
  } else if (encoder === "libvpx-vp9" || encoder === "libaom-av1") {
    args.push("-crf", "30", "-b:v", "0");
  } else {
    args.push("-q:v", "3");
  }
  args.push("-pix_fmt", video.pixelFormat || "yuv420p");
  return args;
}

function outputExtension(source: JoinSplitVideoSource): string {
  if (
    ["h264", "hevc"].includes(source.video.codecName) &&
    (!source.audio || ["aac", "mp3", "ac3", "alac"].includes(source.audio.codecName))
  ) {
    return ".mp4";
  }
  if (
    ["vp8", "vp9", "av1"].includes(source.video.codecName) &&
    (!source.audio || ["opus", "vorbis"].includes(source.audio.codecName))
  ) {
    return ".webm";
  }
  return ".mkv";
}

export class JoinSplitVideoManager {
  private readonly sources = new Map<string, StoredSource>();
  private readonly exports = new Map<string, StoredExport>();
  private readonly exportProgress = new Map<string, {
    status: "running" | "done" | "error" | "cancelled";
    percent: number;
    message: string;
    strategy?: "checking" | "stream-copy" | "encode" | "fallback";
    updatedAt: number;
    controller: AbortController;
  }>();
  private readonly uploadProgress = new Map<string, {
    status: "processing" | "done" | "error";
    percent: number;
    stage: string;
    updatedAt: number;
    error?: string;
  }>();

  constructor(
    private readonly options: {
      storageDirectory: string;
      ffmpegPath: string;
      ffprobePath: string;
    },
  ) {
    fs.mkdirSync(options.storageDirectory, { recursive: true });
    this.restorePersistedState();
    this.removeExpiredFiles();
  }

  private get manifestPath(): string {
    return path.join(this.options.storageDirectory, ".join-split-manifest.json");
  }

  private restorePersistedState(): void {
    if (!fs.existsSync(this.manifestPath)) return;
    const raw = JSON.parse(fs.readFileSync(this.manifestPath, "utf8")) as {
      sources?: Array<{ source: JoinSplitVideoSource; fileName: string }>;
      exports?: Array<{ id: string; fileName: string; fileNameOnDisk: string }>;
    };
    if (!Array.isArray(raw.sources) || !Array.isArray(raw.exports)) {
      throw new Error("Tệp lưu trạng thái Join/Split không hợp lệ.");
    }
    for (const entry of raw.sources) {
      const source = entry?.source;
      const diskName = entry?.fileName;
      if (
        !source || typeof source.id !== "string" ||
        typeof source.fileName !== "string" ||
        typeof diskName !== "string" || path.basename(diskName) !== diskName
      ) continue;
      const filePath = path.join(this.options.storageDirectory, diskName);
      if (fs.existsSync(filePath)) this.sources.set(source.id, { source, filePath });
    }
    for (const entry of raw.exports) {
      if (
        typeof entry?.id !== "string" ||
        typeof entry.fileName !== "string" ||
        typeof entry.fileNameOnDisk !== "string" ||
        path.basename(entry.fileNameOnDisk) !== entry.fileNameOnDisk
      ) continue;
      const filePath = path.join(this.options.storageDirectory, entry.fileNameOnDisk);
      if (fs.existsSync(filePath)) {
        this.exports.set(entry.id, { id: entry.id, fileName: entry.fileName, filePath });
      }
    }
    this.persistState();
  }

  private persistState(): void {
    const manifest = {
      sources: Array.from(this.sources.values(), ({ source, filePath }) => ({
        source,
        fileName: path.basename(filePath),
      })),
      exports: Array.from(this.exports.values(), ({ id, fileName, filePath }) => ({
        id,
        fileName,
        fileNameOnDisk: path.basename(filePath),
      })),
    };
    const temporaryPath = `${this.manifestPath}.tmp`;
    fs.writeFileSync(temporaryPath, JSON.stringify(manifest), "utf8");
    fs.renameSync(temporaryPath, this.manifestPath);
  }

  private removeExpiredFiles(): void {
    const expiry = Date.now() - 24 * 60 * 60 * 1000;
    const retainedFiles = new Set([
      this.manifestPath,
      ...Array.from(this.sources.values(), (source) => source.filePath),
      ...Array.from(this.exports.values(), (output) => output.filePath),
    ]);
    for (const entry of fs.readdirSync(this.options.storageDirectory, { withFileTypes: true })) {
      if (!entry.isFile()) continue;
      const filePath = path.join(this.options.storageDirectory, entry.name);
      if (retainedFiles.has(filePath)) continue;
      try {
        if (fs.statSync(filePath).mtimeMs < expiry) fs.rmSync(filePath, { force: true });
      } catch (error) {
        console.error("[JoinSplitVideo] Không thể dọn tệp cũ:", error);
      }
    }
  }

  beginUpload(uploadId: string): void {
    const expiry = Date.now() - 30 * 60 * 1000;
    for (const [id, progress] of this.uploadProgress) {
      if (progress.status !== "processing" && progress.updatedAt < expiry) this.uploadProgress.delete(id);
    }
    this.uploadProgress.set(uploadId, {
      status: "processing",
      percent: 60,
      stage: "Đang chuẩn bị phân tích video…",
      updatedAt: Date.now(),
    });
  }

  getUploadProgress(uploadId: string): {
    status: "processing" | "done" | "error";
    percent: number;
    stage: string;
    error?: string;
  } | null {
    const progress = this.uploadProgress.get(uploadId);
    if (!progress) return null;
    const { status, percent, stage, error } = progress;
    return { status, percent, stage, ...(error ? { error } : {}) };
  }

  private reportUploadProgress(uploadId: string | undefined, percent: number, stage: string): void {
    if (!uploadId) return;
    const progress = this.uploadProgress.get(uploadId);
    if (!progress || progress.status !== "processing") return;
    progress.percent = Math.min(99, Math.max(progress.percent, percent));
    progress.stage = stage;
    progress.updatedAt = Date.now();
  }

  async addUpload(
    request: IncomingMessage,
    requestedName: string,
    uploadId?: string,
  ): Promise<JoinSplitVideoSource> {
    const fileName = sanitizeFileName(requestedName);
    const extension = path.extname(fileName).toLowerCase();
    if (!SUPPORTED_EXTENSIONS.has(extension)) {
      throw new Error("Định dạng video không được hỗ trợ.");
    }

    const id = randomUUID();
    const filePath = path.join(this.options.storageDirectory, `${id}${extension}`);
    let bytes = 0;
    try {
      await pipeline(
        request,
        new Transform({
          transform(chunk: Buffer, _encoding, callback) {
            bytes += chunk.length;
            callback(
              bytes > MAX_UPLOAD_BYTES
                ? new Error("Video vượt quá giới hạn tải lên 4 GB.")
                : null,
              chunk,
            );
          },
        }),
        fs.createWriteStream(filePath, { flags: "wx" }),
      );
      if (!bytes) throw new Error("Video rỗng.");

      this.reportUploadProgress(uploadId, 62, "Đã nhận file · đang đọc thông số video…");
      const rawProbe = await runProcess(this.options.ffprobePath, [
        "-v", "error", "-show_streams", "-show_format", "-show_data_hash", "sha256",
        "-of", "json", filePath,
      ]);
      const probe = JSON.parse(rawProbe) as ProbeResult;
      const videoStream = probe.streams?.find((stream) => stream.codec_type === "video");
      const audioStream = probe.streams?.find((stream) => stream.codec_type === "audio");
      if (!videoStream?.codec_name || !videoStream.width || !videoStream.height) {
        throw new Error("Không tìm thấy video stream hợp lệ trong tệp.");
      }
      const video = streamDetails(videoStream);
      const durationSeconds = Number(videoStream.duration);
      const formatDuration = Number(probe.format?.duration);
      const resolvedDuration = Number.isFinite(durationSeconds) && durationSeconds > 0
        ? durationSeconds
        : formatDuration;
      const frameRate = video.frameRate;
      if (!Number.isFinite(resolvedDuration) || resolvedDuration <= 0 || !frameRate) {
        throw new Error("Không đọc được thời lượng hoặc frame rate của video.");
      }
      const nominalFrameRate = parseRate(videoStream.r_frame_rate);
      if (
        nominalFrameRate > 0 &&
        Math.abs(frameRate - nominalFrameRate) > nominalFrameRate * 0.001
      ) {
        throw new Error("Video có frame rate biến đổi (VFR); cắt theo frame hiện chỉ hỗ trợ video CFR.");
      }

      let keyframeTimes: number[] | null = null;
      const declaredFrameCount = Number(videoStream.nb_frames);
      const frameCount = Number.isSafeInteger(declaredFrameCount) && declaredFrameCount > 0
        ? declaredFrameCount
        : Math.max(1, Math.round(resolvedDuration * frameRate));
      let scannedFrames = 0;
      try {
        this.reportUploadProgress(uploadId, 65, "Đang lập chỉ mục keyframe…");
        const parsedStartTime = Number(videoStream.start_time ?? probe.format?.start_time ?? 0);
        const streamStartTime = Number.isFinite(parsedStartTime) ? parsedStartTime : 0;
        const framesText = await runProcess(
          this.options.ffprobePath,
          [
            "-v", "error", "-select_streams", "v:0", "-skip_frame", "nokey",
            "-show_frames", "-show_entries", "frame=key_frame,best_effort_timestamp_time",
            "-of", "csv=p=0", filePath,
          ],
          32 * 1024 * 1024,
          undefined,
          undefined,
          undefined,
          (line) => {
            const fields = line.trim().split(",");
            if (Number(fields[0]) !== 1 || !Number.isFinite(Number(fields[1]))) return;
            scannedFrames += 1;
            const timestamp = Number(fields[1]);
            const progress = 65 + Math.min(1, Math.max(0, timestamp - streamStartTime) / resolvedDuration) * 34;
            this.reportUploadProgress(
              uploadId,
              progress,
              `Đang lập chỉ mục keyframe · ${scannedFrames.toLocaleString()} keyframe`,
            );
          },
        );
        keyframeTimes = [];
        for (const line of framesText.split(/\r?\n/)) {
          const fields = line.trim().split(",");
          if (Number(fields[0]) !== 1) continue;
          const timestamp = Number(fields[1]);
          if (!Number.isFinite(timestamp)) continue;
          const frameIndex = Math.round((timestamp - streamStartTime) * frameRate);
          if (frameIndex >= 0 && frameIndex < frameCount) keyframeTimes.push(frameIndex / frameRate);
        }
        if (!keyframeTimes.length) throw new Error("FFprobe không trả về keyframe để lập chỉ mục.");
      } catch (error) {
        console.warn(
          `[JoinSplitVideo] Không thể lập chỉ mục keyframe cho ${fileName}; các range sẽ được đánh dấu cần encode.`,
          error,
        );
      }

      const source: JoinSplitVideoSource = {
        id,
        fileName,
        durationSeconds: resolvedDuration,
        frameRate,
        frameRateText: video.frameRateText || "0/1",
        frameCount,
        video,
        audio: audioStream?.codec_name ? streamDetails(audioStream) : undefined,
        keyframeTimes,
      };
      this.sources.set(id, { source, filePath });
      this.persistState();
      this.reportUploadProgress(uploadId, 100, "Đã phân tích xong.");
      const progress = uploadId ? this.uploadProgress.get(uploadId) : undefined;
      if (progress) {
        progress.status = "done";
        progress.percent = 100;
      }
      return source;
    } catch (error) {
      this.sources.delete(id);
      this.persistState();
      await fs.promises.rm(filePath, { force: true });
      const progress = uploadId ? this.uploadProgress.get(uploadId) : undefined;
      if (progress) {
        progress.status = "error";
        progress.stage = "Phân tích thất bại.";
        progress.error = error instanceof Error ? error.message : String(error);
        progress.updatedAt = Date.now();
      }
      throw error;
    }
  }

  deleteSource(sourceId: string): void {
    const stored = this.sources.get(sourceId);
    if (!stored) return;
    this.sources.delete(sourceId);
    this.persistState();
    void fs.promises.rm(stored.filePath, { force: true }).catch((error) => {
      console.error("[JoinSplitVideo] Không thể xóa video nguồn:", error);
    });
  }

  async cleanStorage(): Promise<number> {
    if (Array.from(this.exportProgress.values()).some((progress) => progress.status === "running")) {
      throw new Error("Hãy đợi các tác vụ xuất video hoàn tất trước khi dọn dẹp.");
    }

    const entries = await fs.promises.readdir(this.options.storageDirectory, { withFileTypes: true });
    const results = await Promise.all(entries.map(async (entry) => {
      const filePath = path.join(this.options.storageDirectory, entry.name);
      try {
        await fs.promises.rm(filePath, { recursive: true, force: true });
        return null;
      } catch (error) {
        console.error(`[JoinSplitVideo] Không thể dọn ${entry.name}:`, error);
        return entry.name;
      }
    }));
    const failed = results.filter((name): name is string => name !== null);
    if (failed.length) {
      throw new Error(`Không thể dọn ${failed.length} mục: ${failed.join(", ")}.`);
    }
    this.sources.clear();
    this.exports.clear();
    this.exportProgress.clear();
    return entries.length;
  }

  getExportProgress(progressId: string): {
    status: "running" | "done" | "error" | "cancelled";
    percent: number;
    message: string;
    strategy?: "checking" | "stream-copy" | "encode" | "fallback";
  } | null {
    const progress = this.exportProgress.get(progressId);
    if (!progress) return null;
    return {
      status: progress.status,
      percent: progress.percent,
      message: progress.message,
      strategy: progress.strategy,
    };
  }

  cancelExport(progressId: string): boolean {
    const progress = this.exportProgress.get(progressId);
    if (progress?.status === "cancelled") return true;
    if (!progress || progress.status !== "running") return false;
    progress.controller.abort();
    progress.status = "cancelled";
    progress.message = "Đã dừng theo yêu cầu.";
    progress.updatedAt = Date.now();
    return true;
  }

  getSource(sourceId: string): JoinSplitVideoSource | null {
    return this.sources.get(sourceId)?.source || null;
  }

  listPersistedState(): {
    sources: JoinSplitVideoSource[];
    exports: JoinSplitVideoExportFile[];
  } {
    return {
      sources: Array.from(this.sources.values(), ({ source }) => source),
      exports: Array.from(this.exports.values(), ({ id, fileName }) => ({ id, fileName })),
    };
  }

  getSourcePath(sourceId: string): string | null {
    return this.sources.get(sourceId)?.filePath || null;
  }

  getSourceFileName(sourceId: string): string | null {
    return this.sources.get(sourceId)?.source.fileName || null;
  }

  inspectRanges(
    ranges: unknown,
    referenceSourceId: unknown,
    preferKeyframeCuts = true,
  ): JoinSplitVideoRangeStatus[] {
    const normalized = this.validateRanges(ranges);
    const reference = typeof referenceSourceId === "string"
      ? this.sources.get(referenceSourceId)
      : undefined;
    if (!reference) throw new Error("Hãy chọn video làm thông số chung.");
    return normalized.map((range) => {
      const segments = range.segments?.length
        ? range.segments
        : [{ sourceId: range.sourceId, startFrame: range.startFrame, endFrame: range.endFrame }];
      const blockers = segments.map((segment) =>
        preferKeyframeCuts
          ? this.streamCopyBlocker(
              this.sources.get(segment.sourceId)!.source,
              reference.source,
              segment,
            )
          : "keyframe preference is disabled",
      );
      const encodingReasons = Array.from(
        new Set(blockers.filter((reason): reason is string => reason !== null)),
      );
      return {
        ...range,
        requiresEncoding: encodingReasons.length > 0,
        segmentCount: segments.length,
        encodingSegmentCount: blockers.filter((reason) => reason !== null).length,
        encodingReasons,
      };
    });
  }

  private async getMediaStreamSignature(filePath: string): Promise<string> {
    const rawProbe = await runProcess(this.options.ffprobePath, [
      "-v", "error", "-show_streams", "-show_data_hash", "sha256", "-of", "json", filePath,
    ]);
    const probe = JSON.parse(rawProbe) as ProbeResult;
    const video = probe.streams?.find((stream) => stream.codec_type === "video");
    const audio = probe.streams?.find((stream) => stream.codec_type === "audio");
    if (!video?.codec_name) throw new Error(`Không tìm thấy video stream trong ${path.basename(filePath)}.`);
    return streamSignatureForStreams(
      streamDetails(video),
      audio?.codec_name ? streamDetails(audio) : undefined,
    );
  }

  private async ensureConcatInputsCompatible(filePaths: string[]): Promise<void> {
    if (filePaths.length < 2) throw new Error("Cần ít nhất hai đoạn để ghép.");
    const signatures = await Promise.all(filePaths.map((filePath) => this.getMediaStreamSignature(filePath)));
    const first = JSON.parse(signatures[0]) as Array<Record<string, unknown> | null>;
    const differences = new Set<string>();
    for (const signature of signatures.slice(1)) {
      const current = JSON.parse(signature) as Array<Record<string, unknown> | null>;
      for (const [streamIndex, streamName] of ["video", "audio"].entries()) {
        const referenceStream = first[streamIndex];
        const currentStream = current[streamIndex];
        if (!referenceStream || !currentStream) {
          if (referenceStream !== currentStream) differences.add(`${streamName} stream presence`);
          continue;
        }
        for (const key of new Set([...Object.keys(referenceStream), ...Object.keys(currentStream)])) {
          if (referenceStream[key] !== currentStream[key]) differences.add(`${streamName}.${key}`);
        }
      }
    }
    if (differences.size) {
      throw new Error(
        `Các đoạn sau xử lý khác thông số stream (${Array.from(differences).join(", ")}); stream-copy concat không an toàn.`,
      );
    }
  }

  private async verifyOutput(
    filePath: string,
    expectedFrames: number,
    expectedDuration: number,
    frameRate: number,
  ): Promise<void> {
    const rawProbe = await runProcess(this.options.ffprobePath, [
      "-v", "error", "-show_streams", "-show_format", "-of", "json", filePath,
    ]);
    let probe = JSON.parse(rawProbe) as ProbeResult;
    const video = probe.streams?.find((stream) => stream.codec_type === "video");
    let actualFrames = Number(video?.nb_frames);
    if (!Number.isSafeInteger(actualFrames) || actualFrames <= 0) {
      const packetProbe = await runProcess(this.options.ffprobePath, [
        "-v", "error", "-count_packets", "-show_streams", "-of", "json", filePath,
      ]);
      probe = JSON.parse(packetProbe) as ProbeResult;
      actualFrames = Number(probe.streams?.find((stream) => stream.codec_type === "video")?.nb_read_packets);
    }
    if (!Number.isSafeInteger(actualFrames) || actualFrames <= 0) {
      const frameProbe = await runProcess(this.options.ffprobePath, [
        "-v", "error", "-count_frames", "-show_streams", "-of", "json", filePath,
      ]);
      probe = JSON.parse(frameProbe) as ProbeResult;
      actualFrames = Number(probe.streams?.find((stream) => stream.codec_type === "video")?.nb_read_frames);
    }
    const audio = probe.streams?.find((stream) => stream.codec_type === "audio");
    if (!Number.isSafeInteger(actualFrames) || actualFrames !== expectedFrames) {
      throw new Error(
        `Video xuất có ${Number.isFinite(actualFrames) ? actualFrames : "không xác định"} frame, cần ${expectedFrames}; kết quả không được xác nhận.`,
      );
    }

    const finalVideo = probe.streams?.find((stream) => stream.codec_type === "video");
    const videoDuration = Number(finalVideo?.duration);
    const audioDuration = Number(audio?.duration);
    const videoStart = Number(finalVideo?.start_time);
    const audioStart = Number(audio?.start_time);
    const durationTolerance = Math.max(0.1, frameRate > 0 ? 1 / frameRate : 0);
    if (
      Number.isFinite(videoDuration) &&
      Math.abs(videoDuration - expectedDuration) > durationTolerance
    ) {
      throw new Error(`Thời lượng video xuất lệch dự kiến (${videoDuration.toFixed(3)}s / ${expectedDuration.toFixed(3)}s).`);
    }
    if (
      audio &&
      Number.isFinite(videoStart) &&
      Number.isFinite(audioStart) &&
      Math.abs(videoStart - audioStart) > durationTolerance
    ) {
      throw new Error(`Âm thanh và hình ảnh bắt đầu lệch nhau ${Math.abs(videoStart - audioStart).toFixed(3)}s.`);
    }
    if (
      audio &&
      Number.isFinite(videoDuration) &&
      Number.isFinite(audioDuration) &&
      Math.abs(videoDuration - audioDuration) > durationTolerance
    ) {
      throw new Error(`Thời lượng âm thanh và hình ảnh lệch nhau ${Math.abs(videoDuration - audioDuration).toFixed(3)}s.`);
    }
  }

  private async concatenateWithStreamCopy(
    inputs: Array<{ filePath: string; duration: number }>,
    outputPath: string,
    expectedFrames: number,
    expectedDuration: number,
    frameRate: number,
    onProgress?: (percent: number) => void,
    signal?: AbortSignal,
  ): Promise<void> {
    const concatListPath = path.join(this.options.storageDirectory, `${randomUUID()}.txt`);
    const quoteConcatPath = (filePath: string) =>
      `file '${filePath.replace(/\\/g, "/").replace(/'/g, "'\\''")}'`;
    try {
      await this.ensureConcatInputsCompatible(inputs.map((input) => input.filePath));
      const entries = inputs.flatMap((input) => [
        quoteConcatPath(input.filePath),
        `duration ${input.duration.toFixed(9)}`,
      ]);
      await fs.promises.writeFile(concatListPath, `${entries.join("\n")}\n`, "utf8");
      await runProcess(this.options.ffmpegPath, [
        "-nostdin", "-hide_banner", "-loglevel", "error", "-y",
        ...(onProgress ? ["-progress", "pipe:1", "-nostats"] : []),
        "-fflags", "+genpts",
        "-f", "concat", "-safe", "0", "-i", concatListPath,
        "-map", "0", "-c", "copy", "-avoid_negative_ts", "make_zero",
        ...(path.extname(outputPath).toLowerCase() === ".mp4" ? ["-movflags", "+faststart"] : []),
        outputPath,
      ], 1024 * 1024, onProgress, expectedDuration, signal);
      const stat = await fs.promises.stat(outputPath);
      if (!stat.isFile() || stat.size <= 0) throw new Error("FFmpeg tạo video ghép rỗng.");
      await this.verifyOutput(outputPath, expectedFrames, expectedDuration, frameRate);
    } finally {
      await fs.promises.rm(concatListPath, { force: true });
    }
  }

  private async exportRangeSegments(
    segments: Array<Pick<JoinSplitVideoRange, "sourceId" | "startFrame" | "endFrame">>,
    reference: StoredSource,
    range: JoinSplitVideoRange,
    outputPath: string,
    onProgress?: (percent: number) => void,
    signal?: AbortSignal,
  ): Promise<void> {
    const temporaryFiles: string[] = [];
    const prepared: Array<{ filePath: string; duration: number }> = [];
    let expectedFrames = 0;
    const totalDuration = segments.reduce((total, segment) => {
      const source = this.sources.get(segment.sourceId)!;
      return total + (segment.endFrame - segment.startFrame + 1) / source.source.frameRate;
    }, 0);
    let completedDuration = 0;
    const extension = outputExtension(reference.source);
    try {
      for (const [index, segment] of segments.entries()) {
        if (signal?.aborted) throw new Error("Tác vụ đã bị dừng.");
        const source = this.sources.get(segment.sourceId)!;
        const duration = (segment.endFrame - segment.startFrame + 1) / source.source.frameRate;
        const expectedSegmentFrames = Math.round(duration * reference.source.frameRate);
        expectedFrames += expectedSegmentFrames;
        const outputSegmentDuration = expectedSegmentFrames / reference.source.frameRate;
        const reason = this.streamCopyBlocker(source.source, reference.source, segment);
        const canCopyWholeSource =
          segment.startFrame === 1 && segment.endFrame === source.source.frameCount && reason === null;
        const needsTemporary = !canCopyWholeSource;
        const partPath = needsTemporary
          ? path.join(this.options.storageDirectory, `${path.parse(outputPath).name}-segment-${index}${extension}`)
          : source.filePath;
        const segmentProgress = (percent: number, startPercent = 0, spanPercent = 100) => {
          if (!onProgress || totalDuration <= 0) return;
          const adjustedPercent = startPercent + percent * spanPercent / 100;
          const overall = (completedDuration + duration * adjustedPercent / 100) / totalDuration * 90;
          onProgress(Math.min(90, overall));
        };
        if (needsTemporary) {
          temporaryFiles.push(partPath);
          if (reason) {
            console.info(`[JoinSplitVideo] Queue ${range.id} segment ${index + 1}: encode (${reason}).`);
            await this.renderRange(source, reference, segment, partPath, true, segmentProgress, signal);
          } else {
            console.info(`[JoinSplitVideo] Queue ${range.id} segment ${index + 1}: stream-copy cut.`);
            try {
              await this.renderRange(
                source,
                reference,
                segment,
                partPath,
                false,
                segmentProgress,
                signal,
              );
              segmentProgress(100);
            } catch (error) {
              if (signal?.aborted) throw error;
              console.warn(
                `[JoinSplitVideo] Queue ${range.id} segment ${index + 1}: stream-copy cut failed verification; retrying this segment with encode.`,
                error,
              );
              segmentProgress(0, 35, 65);
              await this.renderRange(
                source,
                reference,
                segment,
                partPath,
                true,
                (percent) => segmentProgress(percent, 35, 65),
                signal,
              );
            }
          }
        } else {
          console.info(`[JoinSplitVideo] Queue ${range.id} segment ${index + 1}: stream-copy full source.`);
          segmentProgress(100);
        }
        prepared.push({ filePath: partPath, duration: outputSegmentDuration });
        completedDuration += duration;
      }

      const expectedDuration = expectedFrames / reference.source.frameRate;
      try {
        await this.concatenateWithStreamCopy(
          prepared,
          outputPath,
          expectedFrames,
          expectedDuration,
          reference.source.frameRate,
          onProgress ? (percent) => onProgress(90 + percent * 0.09) : undefined,
          signal,
        );
        onProgress?.(99);
        console.info(`[JoinSplitVideo] Queue ${range.id}: concatenated prepared segments with stream-copy.`);
        return;
      } catch (error) {
        if (signal?.aborted) throw error;
        console.warn(
          `[JoinSplitVideo] Queue ${range.id}: falling back to full cue encode because prepared segments could not be stream-copied safely.`,
          error,
        );
        await fs.promises.rm(outputPath, { force: true });
        await this.renderRangeSegments(
          segments,
          reference,
          outputPath,
          onProgress ? (percent) => onProgress(90 + percent * 0.09) : undefined,
          signal,
        );
        onProgress?.(99);
        console.info(`[JoinSplitVideo] Queue ${range.id}: completed with full-cue filter re-encode.`);
      }
    } finally {
      await Promise.all(temporaryFiles.map((filePath) => fs.promises.rm(filePath, { force: true })));
    }
  }

  async exportRanges(
    rangesInput: unknown,
    referenceSourceId: unknown,
    progressId?: string,
    preferKeyframeCuts = true,
    queueIndex?: number,
  ): Promise<JoinSplitVideoExportFile[]> {
    if (queueIndex !== undefined && (!Number.isSafeInteger(queueIndex) || queueIndex < 1)) {
      throw new Error("Thứ tự queue không hợp lệ.");
    }
    const ranges = this.validateRanges(rangesInput);
    const reference = typeof referenceSourceId === "string"
      ? this.sources.get(referenceSourceId)
      : undefined;
    if (!reference) throw new Error("Hãy chọn video làm thông số chung.");
    if (progressId) {
      const expiry = Date.now() - 30 * 60 * 1000;
      for (const [id, progress] of this.exportProgress) {
        if (progress.status !== "running" && progress.updatedAt < expiry) this.exportProgress.delete(id);
      }
      this.exportProgress.set(progressId, {
        status: "running",
        percent: 0,
        message: "Đang chuẩn bị xuất video…",
        strategy: "checking",
        updatedAt: Date.now(),
        controller: new AbortController(),
      });
    }
    const signal = progressId ? this.exportProgress.get(progressId)?.controller.signal : undefined;
    const reportProgress = (
      percent: number,
      message = "FFmpeg đang xử lý video…",
      strategy?: "checking" | "stream-copy" | "encode" | "fallback",
    ) => {
      if (!progressId) return;
      const progress = this.exportProgress.get(progressId);
      if (!progress || progress.status !== "running") return;
      progress.percent = Math.min(99, Math.max(0, percent));
      progress.message = message;
      if (strategy) progress.strategy = strategy;
      progress.updatedAt = Date.now();
    };
    const outputFiles: StoredExport[] = [];
    try {
      for (const range of ranges) {
        if (signal?.aborted) throw new Error("Tác vụ đã bị dừng.");
        const segments = range.segments?.length
          ? range.segments
          : [{ sourceId: range.sourceId, startFrame: range.startFrame, endFrame: range.endFrame }];
        const stored = this.sources.get(segments[0].sourceId)!;
        const extension = outputExtension(reference.source);
        const fileName = this.buildExportFileName(
          stored.source.fileName,
          range,
          [...this.exports.values(), ...outputFiles],
          extension,
          queueIndex,
        );
        const outputId = randomUUID();
        const outputPath = path.join(this.options.storageDirectory, `${outputId}${extension}`);
        if (!preferKeyframeCuts) {
          reportProgress(0, "Đang encode trực tiếp bằng GPU…", "encode");
          console.info(`[JoinSplitVideo] Queue ${range.id}: encode trực tiếp (ưu tiên tốc độ).`);
          await this.renderRangeSegments(
            segments,
            reference,
            outputPath,
            (percent) => reportProgress(
              percent * 0.98,
              percent >= 98 ? "Đang xác minh đầu ra sau encode…" : "Đang encode trực tiếp…",
              "encode",
            ),
            signal,
          );
          const output = { id: outputId, fileName, filePath: outputPath };
          outputFiles.push(output);
          this.exports.set(outputId, output);
          this.persistState();
          continue;
        }
        if (segments.length > 1) {
          await this.exportRangeSegments(
            segments,
            reference,
            range,
            outputPath,
            (percent) => reportProgress(percent, "Đang xử lý và ghép các đoạn…"),
            signal,
          );
        } else {
          const segment = segments[0];
          const reason = this.streamCopyBlocker(stored.source, reference.source, segment);
          const requiresEncoding = reason !== null;
          console.info(
            `[JoinSplitVideo] Queue ${range.id}: ${requiresEncoding ? `encode (${reason})` : "stream-copy"}.`,
          );
          if (requiresEncoding) {
            reportProgress(0, `Đang encode: ${reason}.`, "encode");
            await this.renderRange(
              stored,
              reference,
              segment,
              outputPath,
              true,
              (percent) => reportProgress(percent * 0.98),
              signal,
              () => reportProgress(98, "Đang xác minh đầu ra sau encode…", "checking"),
            );
          } else {
            reportProgress(0, "Đang thử stream-copy…", "stream-copy");
            try {
              await this.renderRange(
                stored,
                reference,
                segment,
                outputPath,
                false,
                (percent) => reportProgress(percent * 0.98, "Đang cắt video không mã hóa lại…", "stream-copy"),
                signal,
                () => reportProgress(98, "Đang xác minh đầu ra stream-copy…", "checking"),
              );
              reportProgress(99, "Đang xác minh video đã cắt…");
            } catch (error) {
              console.warn(
                `[JoinSplitVideo] Queue ${range.id}: stream-copy cut failed verification; retrying with encode.`,
                error,
              );
              if (signal?.aborted) throw error;
              const reason = error instanceof Error ? error.message : String(error);
              reportProgress(
                35,
                `Stream-copy không đạt kiểm tra (${reason}); đang chuyển sang encode…`,
                "fallback",
              );
              await this.renderRange(
                stored,
                reference,
                segment,
                outputPath,
                true,
                (percent) => reportProgress(35 + percent * 0.63, "Đang encode lại đoạn video…"),
                signal,
                () => reportProgress(98, "Đang xác minh đầu ra sau encode…", "checking"),
              );
              reportProgress(99, "Đang xác minh video đã encode…");
            }
          }
        }
        const output = { id: outputId, fileName, filePath: outputPath };
        outputFiles.push(output);
        this.exports.set(outputId, output);
        this.persistState();
      }
      if (progressId) {
        const progress = this.exportProgress.get(progressId);
        if (progress && progress.status !== "cancelled") {
          progress.status = "done";
          progress.percent = 100;
          progress.message = "Đã xuất xong.";
          progress.updatedAt = Date.now();
        }
      }
    } catch (error) {
      if (progressId) {
        const progress = this.exportProgress.get(progressId);
        if (progress && progress.status !== "cancelled") {
          progress.status = signal?.aborted ? "cancelled" : "error";
          progress.message = signal?.aborted
            ? "Đã dừng theo yêu cầu."
            : error instanceof Error ? error.message : "Không thể xuất video.";
          progress.updatedAt = Date.now();
        }
      }
      for (const output of outputFiles) {
        this.exports.delete(output.id);
        await fs.promises.rm(output.filePath, { force: true });
      }
      this.persistState();
      throw error;
    }
    return outputFiles.map(({ id, fileName }) => ({ id, fileName }));
  }

  async joinSources(
    sourceIdsInput: unknown,
    referenceSourceId: unknown,
  ): Promise<JoinSplitVideoExportFile> {
    if (
      !Array.isArray(sourceIdsInput) ||
      sourceIdsInput.length < 2 ||
      sourceIdsInput.length > 200 ||
      sourceIdsInput.some((id) => typeof id !== "string")
    ) {
      throw new Error("Cần ít nhất hai video trên timeline để ghép.");
    }
    const sourceIds = sourceIdsInput as string[];
    if (new Set(sourceIds).size !== sourceIds.length) {
      throw new Error("Timeline không được chứa video trùng lặp.");
    }
    const reference = typeof referenceSourceId === "string"
      ? this.sources.get(referenceSourceId)
      : undefined;
    if (!reference) throw new Error("Hãy chọn video làm thông số chung.");
    const entries = sourceIds.map((id) => {
      const source = this.sources.get(id);
      if (!source) throw new Error("Một video trên timeline không còn khả dụng.");
      return source;
    });
    const outputId = randomUUID();
    const extension = outputExtension(reference.source);
    const outputPath = path.join(this.options.storageDirectory, `${outputId}${extension}`);
    const temporaryFiles: string[] = [];
    const referenceBase = path.parse(reference.source.fileName).name
      .replace(/[<>:"/\\|?*\u0000-\u001f]/g, "_") || "video";
    const fileName = `${referenceBase}_joined${extension}`;
    const expectedFrames = entries.reduce(
      (total, entry) => total + Math.round(
        entry.source.frameCount / entry.source.frameRate * reference.source.frameRate,
      ),
      0,
    );
    const expectedDuration = expectedFrames / reference.source.frameRate;
    try {
      const preparedInputs: Array<{ filePath: string; duration: number }> = [];
      for (const [index, entry] of entries.entries()) {
        const segment = { startFrame: 1, endFrame: entry.source.frameCount };
        const reason = this.streamCopyBlocker(entry.source, reference.source, segment);
        if (reason === null) {
          console.info(`[JoinSplitVideo] Join source ${entry.source.fileName}: stream-copy.`);
          preparedInputs.push({
            filePath: entry.filePath,
            duration: entry.source.frameCount / reference.source.frameRate,
          });
        } else {
          console.info(`[JoinSplitVideo] Join source ${entry.source.fileName}: encode (${reason}).`);
          const partPath = path.join(this.options.storageDirectory, `${outputId}-part-${index}${extension}`);
          temporaryFiles.push(partPath);
          await this.renderRange(entry, reference, segment, partPath, true);
          preparedInputs.push({
            filePath: partPath,
            duration: Math.round(
              entry.source.frameCount / entry.source.frameRate * reference.source.frameRate,
            ) / reference.source.frameRate,
          });
        }
      }

      try {
        await this.concatenateWithStreamCopy(
          preparedInputs,
          outputPath,
          expectedFrames,
          expectedDuration,
          reference.source.frameRate,
        );
        console.info("[JoinSplitVideo] Join Timeline: final concat completed with stream-copy.");
      } catch (error) {
        console.warn(
          "[JoinSplitVideo] Join Timeline: falling back to encoding every source because the prepared streams could not be concatenated and verified safely.",
          error,
        );
        await fs.promises.rm(outputPath, { force: true });
        await Promise.all(temporaryFiles.map((filePath) => fs.promises.rm(filePath, { force: true })));
        temporaryFiles.length = 0;
        const encodedInputs: Array<{ filePath: string; duration: number }> = [];
        for (const [index, entry] of entries.entries()) {
          const partPath = path.join(this.options.storageDirectory, `${outputId}-fallback-${index}${extension}`);
          temporaryFiles.push(partPath);
          await this.renderRange(
            entry,
            reference,
            { startFrame: 1, endFrame: entry.source.frameCount },
            partPath,
            true,
          );
          encodedInputs.push({
            filePath: partPath,
            duration: Math.round(
              entry.source.frameCount / entry.source.frameRate * reference.source.frameRate,
            ) / reference.source.frameRate,
          });
        }
        await this.concatenateWithStreamCopy(
          encodedInputs,
          outputPath,
          expectedFrames,
          expectedDuration,
          reference.source.frameRate,
        );
        console.info("[JoinSplitVideo] Join Timeline: completed after encoding all sources to the selected profile.");
      }
      const output = { id: outputId, fileName, filePath: outputPath };
      this.exports.set(outputId, output);
      this.persistState();
      return { id: outputId, fileName };
    } catch (error) {
      this.exports.delete(outputId);
      this.persistState();
      await fs.promises.rm(outputPath, { force: true });
      throw new Error(`Không thể ghép timeline: ${error instanceof Error ? error.message : String(error)}`);
    } finally {
      await Promise.all(temporaryFiles.map((filePath) => fs.promises.rm(filePath, { force: true })));
    }
  }

  async joinExports(
    exportIdsInput: unknown,
    referenceSourceIdInput: unknown,
    progressId?: string,
  ): Promise<JoinSplitVideoExportFile> {
    if (
      !Array.isArray(exportIdsInput) ||
      exportIdsInput.length < 2 ||
      exportIdsInput.length > 500 ||
      exportIdsInput.some((id) => typeof id !== "string")
    ) {
      throw new Error("Cần ít nhất hai video đã xuất để ghép.");
    }
    const exportIds = exportIdsInput as string[];
    if (new Set(exportIds).size !== exportIds.length) {
      throw new Error("Danh sách video đã xuất không được chứa mục trùng lặp.");
    }
    const entries = exportIds.map((id) => {
      const output = this.exports.get(id);
      if (!output || !fs.existsSync(output.filePath)) {
        throw new Error("Một video trong queue không còn khả dụng.");
      }
      return output;
    });
    const reference = typeof referenceSourceIdInput === "string"
      ? this.sources.get(referenceSourceIdInput)
      : undefined;
    if (!reference) throw new Error("Video profile chung không còn khả dụng.");
    const extension = outputExtension(reference.source);

    if (progressId) {
      const expiry = Date.now() - 30 * 60 * 1000;
      for (const [id, progress] of this.exportProgress) {
        if (progress.status !== "running" && progress.updatedAt < expiry) this.exportProgress.delete(id);
      }
      this.exportProgress.set(progressId, {
        status: "running",
        percent: 0,
        message: "Đang chuẩn bị ghép queue…",
        strategy: "checking",
        updatedAt: Date.now(),
        controller: new AbortController(),
      });
    }
    const progress = progressId ? this.exportProgress.get(progressId) : undefined;
    const signal = progress?.controller.signal;
    const reportProgress = (
      percent: number,
      message: string,
      strategy?: "checking" | "stream-copy" | "encode" | "fallback",
    ) => {
      if (!progress || progress.status !== "running") return;
      progress.percent = Math.min(99, Math.max(progress.percent, percent));
      progress.message = message;
      if (strategy) progress.strategy = strategy;
      progress.updatedAt = Date.now();
    };

    let completedProbes = 0;
    let probes: Array<{
      filePath: string;
      duration: number;
      frameCount: number;
      frameRate: number;
      video: JoinSplitVideoStream;
      audio?: JoinSplitVideoStream;
    }>;
    try {
      probes = await Promise.all(entries.map(async (entry) => {
        const rawProbe = await runProcess(this.options.ffprobePath, [
          "-v", "error", "-count_frames", "-show_streams", "-show_format", "-show_data_hash", "sha256", "-of", "json",
          entry.filePath,
        ], MAX_PROCESS_OUTPUT_BYTES, undefined, undefined, signal);
        const probe = JSON.parse(rawProbe) as ProbeResult;
        const videoStream = probe.streams?.find((stream) => stream.codec_type === "video");
        const audioStream = probe.streams?.find((stream) => stream.codec_type === "audio");
        const video = videoStream ? streamDetails(videoStream) : null;
        const frameCount = Number(videoStream?.nb_read_frames || videoStream?.nb_frames);
        if (!video?.codecName || !Number.isSafeInteger(frameCount) || frameCount <= 0 || !video.frameRate) {
          throw new Error(`Không đọc được thông số video queue ${entry.fileName}.`);
        }
        completedProbes += 1;
        reportProgress(
          completedProbes / entries.length * 25,
          `Đang phân tích video ghép · ${completedProbes}/${entries.length}`,
          "checking",
        );
        return {
          filePath: entry.filePath,
          duration: frameCount / video.frameRate,
          frameCount,
          frameRate: video.frameRate,
          video,
          audio: audioStream?.codec_name ? streamDetails(audioStream) : undefined,
        };
      }));
    } catch (error) {
      if (progress && progress.status === "running") {
        progress.status = signal?.aborted ? "cancelled" : "error";
        progress.message = signal?.aborted
          ? "Đã dừng theo yêu cầu."
          : error instanceof Error ? error.message : "Không thể phân tích video queue.";
        progress.updatedAt = Date.now();
      }
      throw error;
    }
    const frameRate = reference.source.frameRate;
    const expectedFrames = probes.reduce(
      (total, probe) => total + Math.round(probe.frameCount / probe.frameRate * frameRate),
      0,
    );
    const expectedDuration = expectedFrames / frameRate;
    const outputId = randomUUID();
    const baseName = path.parse(entries[0].fileName).name.replace(/_joined(?: \(\d+\))?$/i, "");
    let fileName = `${baseName}_queues_joined${extension}`;
    let suffix = 2;
    while (Array.from(this.exports.values()).some((entry) => entry.fileName.toLowerCase() === fileName.toLowerCase())) {
      fileName = `${baseName}_queues_joined (${suffix++})${extension}`;
    }
    const outputPath = path.join(this.options.storageDirectory, `${outputId}${extension}`);
    let completedStrategy: "stream-copy" | "fallback" = "stream-copy";
    try {
      try {
        reportProgress(25, "Đang ghép các video bằng stream-copy…", "stream-copy");
        await this.concatenateWithStreamCopy(
          probes.map(({ filePath, duration }) => ({ filePath, duration })),
          outputPath,
          expectedFrames,
          expectedDuration,
          frameRate,
          (percent) => reportProgress(
            25 + percent * 0.73,
            percent >= 99 ? "Đang xác minh video đã ghép…" : "Đang ghép các video…",
            percent >= 99 ? "checking" : "stream-copy",
          ),
          signal,
        );
        console.info(`[JoinSplitVideo] Queue join: joined ${entries.length} exported videos with stream-copy.`);
      } catch (copyError) {
        if (signal?.aborted) throw copyError;
        completedStrategy = "fallback";
        console.warn("[JoinSplitVideo] Queue join: stream-copy was unsafe; re-encoding the queue to the selected profile.", copyError);
        await fs.promises.rm(outputPath, { force: true });
        reportProgress(25, "Stream-copy không phù hợp; đang encode lại queue…", "fallback");
        const temporaryIds: string[] = [];
        try {
          const segments = probes.map((probe, index) => {
            const id = randomUUID();
            temporaryIds.push(id);
            const source: JoinSplitVideoSource = {
              id,
              fileName: entries[index].fileName,
              durationSeconds: probe.duration,
              frameRate: probe.frameRate,
              frameRateText: probe.video.frameRateText || "0/1",
              frameCount: probe.frameCount,
              video: probe.video,
              audio: probe.audio,
              keyframeTimes: null,
            };
            this.sources.set(id, { source, filePath: probe.filePath });
            return { sourceId: id, startFrame: 1, endFrame: probe.frameCount };
          });
          await this.renderRangeSegments(
            segments,
            reference,
            outputPath,
            (percent) => reportProgress(
              25 + percent * 0.73,
              percent >= 99 ? "Đang xác minh queue đã encode…" : "Đang encode queue bằng GPU…",
              percent >= 99 ? "checking" : "fallback",
            ),
            signal,
          );
          reportProgress(98, "Đang xác minh video đã ghép…", "checking");
          await this.verifyOutput(outputPath, expectedFrames, expectedDuration, frameRate);
        } finally {
          for (const id of temporaryIds) this.sources.delete(id);
        }
        console.info(`[JoinSplitVideo] Queue join: completed with encoding to the selected profile.`);
      }
      const output = { id: outputId, fileName, filePath: outputPath };
      this.exports.set(outputId, output);
      this.persistState();
      if (progress && progress.status === "running") {
        progress.status = "done";
        progress.percent = 100;
        progress.message = "Đã ghép queue xong.";
        progress.strategy = completedStrategy;
        progress.updatedAt = Date.now();
      }
      return { id: outputId, fileName };
    } catch (error) {
      this.exports.delete(outputId);
      this.persistState();
      await fs.promises.rm(outputPath, { force: true });
      if (progress && progress.status === "running") {
        progress.status = signal?.aborted ? "cancelled" : "error";
        progress.message = signal?.aborted
          ? "Đã dừng theo yêu cầu."
          : error instanceof Error ? error.message : "Không thể ghép video queue.";
        progress.updatedAt = Date.now();
      }
      throw new Error(`Không thể ghép các video queue: ${error instanceof Error ? error.message : String(error)}`);
    }
  }

  getExport(id: string): StoredExport | null {
    return this.exports.get(id) || null;
  }

  private validateRanges(input: unknown): JoinSplitVideoRange[] {
    if (!Array.isArray(input) || input.length === 0 || input.length > 500) {
      throw new Error("Cần có từ 1 đến 500 range trong queue.");
    }
    return input.map((item, index) => {
      const candidate = item as Partial<JoinSplitVideoRange>;
      if (typeof candidate.id !== "string") {
        throw new Error(`Range ${index + 1} không hợp lệ.`);
      }
      if (Array.isArray(candidate.segments) && candidate.segments.length > 0) {
        const segments = candidate.segments.map((segment) => {
          if (
            typeof segment.sourceId !== "string" ||
            !Number.isInteger(segment.startFrame) ||
            !Number.isInteger(segment.endFrame)
          ) {
            throw new Error(`Range ${index + 1} có đoạn video không hợp lệ.`);
          }
          const stored = this.sources.get(segment.sourceId);
          if (
            !stored ||
            segment.startFrame < 1 ||
            segment.endFrame < segment.startFrame ||
            segment.endFrame > stored.source.frameCount
          ) {
            throw new Error(`Range ${index + 1} nằm ngoài video nguồn.`);
          }
          return segment;
        });
        return {
          ...candidate,
          sourceId: segments[0].sourceId,
          startFrame: segments[0].startFrame,
          endFrame: segments[0].endFrame,
          segments,
        } as JoinSplitVideoRange;
      }
      if (
        typeof candidate.sourceId !== "string" ||
        !Number.isInteger(candidate.startFrame) ||
        !Number.isInteger(candidate.endFrame)
      ) {
        throw new Error(`Range ${index + 1} không hợp lệ.`);
      }
      const stored = this.sources.get(candidate.sourceId);
      if (
        !stored ||
        candidate.startFrame! < 1 ||
        candidate.endFrame! < candidate.startFrame! ||
        candidate.endFrame! > stored.source.frameCount
      ) {
        throw new Error(`Range ${index + 1} nằm ngoài video nguồn.`);
      }
      return candidate as JoinSplitVideoRange;
    });
  }

  private async renderRangeSegments(
    segments: Array<Pick<JoinSplitVideoRange, "sourceId" | "startFrame" | "endFrame">>,
    reference: StoredSource,
    outputPath: string,
    onProgress?: (percent: number) => void,
    signal?: AbortSignal,
  ): Promise<void> {
    const args = [
      "-nostdin", "-hide_banner", "-loglevel", "error", "-y",
      ...(onProgress ? ["-progress", "pipe:1", "-nostats"] : []),
    ];
    const filters: string[] = [];
    const concatSegmentLabels: string[] = [];
    let expectedFrames = 0;
    let inputIndex = 0;
    const audio = reference.source.audio;

    segments.forEach((segment, index) => {
      const stored = this.sources.get(segment.sourceId)!;
      const source = stored.source;
      const segmentFrames = segment.endFrame - segment.startFrame + 1;
      const duration = segmentFrames / source.frameRate;
      const sourceInputIndex = inputIndex++;
      const expectedSegmentFrames = Math.round(duration * reference.source.frameRate);
      const outputSegmentDuration = expectedSegmentFrames / reference.source.frameRate;
      expectedFrames += expectedSegmentFrames;
      const seekTime = (segment.startFrame - 1) / source.frameRate;
      args.push(
        "-ss",
        seekTime.toFixed(9),
        "-i",
        stored.filePath,
      );
      filters.push(
        `[${sourceInputIndex}:v:0]trim=start_frame=0:end_frame=${segmentFrames},` +
        `setpts=PTS-STARTPTS,scale=${reference.source.video.width}:${reference.source.video.height},` +
        `setsar=${reference.source.video.sampleAspectRatio || "1:1"},` +
        `fps=${reference.source.frameRateText}[v${index}]`,
      );
      let concatLabels = `[v${index}]`;
      if (!audio) {
        concatSegmentLabels.push(concatLabels);
        return;
      }

      if (source.audio) {
        filters.push(
          `[${sourceInputIndex}:a:0]atrim=start=0:duration=${outputSegmentDuration.toFixed(9)},asetpts=PTS-STARTPTS,` +
          `aresample=${audio.sampleRate || 48000},aformat=channel_layouts=${audio.channelLayout || "stereo"},` +
          `apad=pad_dur=${outputSegmentDuration.toFixed(9)},atrim=duration=${outputSegmentDuration.toFixed(9)}[a${index}]`,
        );
      } else {
        const silenceIndex = inputIndex++;
        args.push(
          "-f", "lavfi", "-t", outputSegmentDuration.toFixed(9), "-i",
          `anullsrc=r=${audio.sampleRate || 48000}:cl=${audio.channelLayout || "stereo"}`,
        );
        filters.push(
          `[${silenceIndex}:a:0]atrim=duration=${outputSegmentDuration.toFixed(9)},asetpts=PTS-STARTPTS[a${index}]`,
        );
      }
      concatLabels += `[a${index}]`;
      concatSegmentLabels.push(concatLabels);
    });

    filters.push(
      `${concatSegmentLabels.join("")}concat=n=${segments.length}:v=1:a=${audio ? 1 : 0}[vout]${audio ? "[aout]" : ""}`,
    );
    args.push("-filter_complex", filters.join(";"), "-map", "[vout]");
    if (audio) args.push("-map", "[aout]");
    const softwareEncoder = findEncoder(reference.source.video.codecName);
    const videoEncoders = [
      findHardwareEncoder(reference.source.video.codecName),
      softwareEncoder,
    ].filter((encoder, index, all): encoder is string =>
      Boolean(encoder) && all.indexOf(encoder) === index,
    );
    if (!videoEncoders.length) {
      throw new Error(`Không có encoder khả dụng cho codec ${reference.source.video.codecName}.`);
    }
    const commonArgs = [...args];
    if (audio) {
      const audioEncoder = findEncoder(audio.codecName);
      if (!audioEncoder) throw new Error(`Không có encoder khả dụng cho codec ${audio.codecName}.`);
      commonArgs.push("-c:a", audioEncoder, "-ar", String(audio.sampleRate || 48000), "-ac", String(audio.channels || 2));
    } else {
      commonArgs.push("-an");
    }
    const expectedDuration = expectedFrames / reference.source.frameRate;
    commonArgs.push("-frames:v", String(expectedFrames), "-t", expectedDuration.toFixed(9));
    if (outputExtension(reference.source) === ".mp4") commonArgs.push("-movflags", "+faststart");
    try {
      let lastError: unknown;
      for (const [index, encoder] of videoEncoders.entries()) {
        const encoderArgs = [
          ...commonArgs,
          ...getVideoEncoderArgs(encoder, reference.source.video),
          outputPath,
        ];
        try {
          await runProcess(
            this.options.ffmpegPath,
            encoderArgs,
            1024 * 1024,
            onProgress,
            expectedDuration,
            signal,
          );
          const stat = await fs.promises.stat(outputPath);
          if (!stat.isFile() || stat.size <= 0) throw new Error("FFmpeg tạo tệp đầu ra rỗng.");
          await this.verifyOutput(outputPath, expectedFrames, expectedDuration, reference.source.frameRate);
          if (index > 0) {
            console.warn(`[JoinSplitVideo] QSV không khả dụng cho đoạn đã ghép; đã dùng ${encoder}.`);
          } else if (encoder.endsWith("_qsv")) {
            console.info(`[JoinSplitVideo] Đã encode bằng Intel QSV (${encoder}).`);
          }
          onProgress?.(99);
          return;
        } catch (error) {
          lastError = error;
          await fs.promises.rm(outputPath, { force: true });
          if (signal?.aborted || index === videoEncoders.length - 1) throw error;
          console.warn(
            `[JoinSplitVideo] Encode bằng ${encoder} thất bại; đang thử encoder dự phòng.`,
            error,
          );
        }
      }
      throw lastError instanceof Error ? lastError : new Error("Không thể encode video.");
    } catch (error) {
      await fs.promises.rm(outputPath, { force: true });
      throw new Error(`Không thể ghép và xuất các đoạn đã chọn: ${error instanceof Error ? error.message : String(error)}`);
    }
  }

  private streamCopyBlocker(
    source: JoinSplitVideoSource,
    reference: JoinSplitVideoSource,
    range: Pick<JoinSplitVideoRange, "startFrame" | "endFrame">,
  ): string | null {
    if (streamSignature(source) !== streamSignature(reference)) {
      return "stream parameters differ from the selected reference profile";
    }
    const isFullSource =
      range.startFrame === 1 && range.endFrame === source.frameCount;
    if (isFullSource) return null;
    if (!source.keyframeTimes?.length) return "keyframe index is unavailable";
    const frameDuration = 1 / source.frameRate;
    const isKeyframe = (frameNumber: number) => {
      if (frameNumber > source.frameCount) return true;
      const timestamp = (frameNumber - 1) * frameDuration;
      return source.keyframeTimes!.some(
        (keyframeTime) => Math.abs(keyframeTime - timestamp) <= frameDuration * 0.25,
      );
    };
    if (!isKeyframe(range.startFrame)) return "cut start is not aligned to a keyframe";
    if (!isKeyframe(range.endFrame + 1)) return "cut end is not aligned to the next keyframe";
    return null;
  }

  private buildExportFileName(
    sourceName: string,
    range: JoinSplitVideoRange,
    previous: StoredExport[],
    extension: string,
    queueIndex?: number,
  ): string {
    const baseName = path.parse(sourceName).name.replace(/[<>:"/\\|?*\u0000-\u001f]/g, "_") || "video";
    const queuePrefix = queueIndex === undefined ? "" : `Q${queueIndex}_`;
    let fileName = `${queuePrefix}${baseName}_${String(range.startFrame).padStart(6, "0")}-${String(range.endFrame).padStart(6, "0")}${extension}`;
    let suffix = 2;
    while (previous.some((item) => item.fileName.toLowerCase() === fileName.toLowerCase())) {
      fileName = `${queuePrefix}${baseName}_${String(range.startFrame).padStart(6, "0")}-${String(range.endFrame).padStart(6, "0")} (${suffix++})${extension}`;
    }
    return fileName;
  }

  private async renderRange(
    source: StoredSource,
    reference: StoredSource,
    range: Pick<JoinSplitVideoRange, "startFrame" | "endFrame">,
    outputPath: string,
    encode: boolean,
    onProgress?: (percent: number) => void,
    signal?: AbortSignal,
    onVerifying?: () => void,
  ): Promise<void> {
    const sourceFile = source.filePath;
    const duration = (range.endFrame - range.startFrame + 1) / source.source.frameRate;
    const expectedFrames = encode
      ? Math.round(duration * reference.source.frameRate)
      : range.endFrame - range.startFrame + 1;
    const outputDuration = expectedFrames / reference.source.frameRate;
    const args = [
      "-nostdin", "-hide_banner", "-loglevel", "error", "-y",
      ...(onProgress ? ["-progress", "pipe:1", "-nostats"] : []),
    ];
    if (!encode) {
      const isFullSource =
        range.startFrame === 1 && range.endFrame === source.source.frameCount;
      if (isFullSource) {
        args.push("-i", sourceFile);
      } else {
        const startSeconds = (range.startFrame - 1) / source.source.frameRate;
        args.push("-ss", startSeconds.toFixed(9), "-i", sourceFile, "-t", outputDuration.toFixed(9));
      }
      args.push("-map", "0:v:0", "-map", "0:a:0?", "-c", "copy");
      args.push("-frames:v", String(expectedFrames));
      if (outputExtension(reference.source) === ".mp4") {
        args.push("-movflags", "+faststart");
      }
      args.push(outputPath);
    } else {
      const videoEncoder = findEncoder(reference.source.video.codecName);
      const audioEncoder = reference.source.audio
        ? findEncoder(reference.source.audio.codecName)
        : null;
      if (!videoEncoder || (reference.source.audio && !audioEncoder)) {
        throw new Error(
          `Không có encoder tương thích với codec tham chiếu ${reference.source.video.codecName}${reference.source.audio ? `/${reference.source.audio.codecName}` : ""}.`,
        );
      }
      const filters =
        `[0:v:0]trim=start_frame=0:end_frame=${range.endFrame - range.startFrame + 1},` +
        `setpts=PTS-STARTPTS,scale=${reference.source.video.width}:${reference.source.video.height},` +
        `setsar=${reference.source.video.sampleAspectRatio || "1:1"},` +
        `fps=${reference.source.frameRateText}[vout]`;
      const seekTime = (range.startFrame - 1) / source.source.frameRate;
      args.push("-ss", seekTime.toFixed(9), "-i", sourceFile, "-filter_complex", filters, "-map", "[vout]");
      if (source.source.audio && reference.source.audio) {
        args.push(
          "-filter_complex",
          `[0:a:0]atrim=start=0:duration=${outputDuration.toFixed(9)},asetpts=PTS-STARTPTS,` +
          `aresample=${reference.source.audio.sampleRate || 48000},` +
          `apad=pad_dur=${outputDuration.toFixed(9)},atrim=duration=${outputDuration.toFixed(9)}[aout]`,
          "-map", "[aout]",
        );
      } else if (reference.source.audio) {
        args.push(
          "-f", "lavfi", "-t", outputDuration.toFixed(9),
          "-i", `anullsrc=r=${reference.source.audio.sampleRate || 48000}:cl=${reference.source.audio.channelLayout || "stereo"}`,
          "-map", "1:a:0",
        );
      }
      const softwareEncoder = findEncoder(reference.source.video.codecName);
      const videoEncoders = [
        findHardwareEncoder(reference.source.video.codecName),
        softwareEncoder,
      ].filter((encoder, index, all): encoder is string =>
        Boolean(encoder) && all.indexOf(encoder) === index,
      );
      if (!videoEncoders.length) {
        throw new Error(`Không có encoder khả dụng cho codec ${reference.source.video.codecName}.`);
      }
      if (reference.source.audio && audioEncoder) {
        args.push(
          "-c:a", audioEncoder,
          "-ar", String(reference.source.audio.sampleRate || 48000),
          "-ac", String(reference.source.audio.channels || 2),
        );
      } else {
        args.push("-an");
      }
      args.push("-frames:v", String(expectedFrames), "-t", outputDuration.toFixed(9));
      if (outputExtension(reference.source) === ".mp4") {
        args.push("-movflags", "+faststart");
      }
      const commonArgs = [...args];
      let lastError: unknown;
      for (const [index, encoder] of videoEncoders.entries()) {
        try {
          await runProcess(
            this.options.ffmpegPath,
            [...commonArgs, ...getVideoEncoderArgs(encoder, reference.source.video), outputPath],
            1024 * 1024,
            onProgress,
            outputDuration,
            signal,
          );
          const stat = await fs.promises.stat(outputPath);
          if (!stat.isFile() || stat.size <= 0) throw new Error("FFmpeg tạo tệp đầu ra rỗng.");
          onVerifying?.();
          await this.verifyOutput(outputPath, expectedFrames, outputDuration, reference.source.frameRate);
          if (index > 0) {
            console.warn(`[JoinSplitVideo] QSV không khả dụng cho ${source.source.fileName}; đã dùng ${encoder}.`);
          } else if (encoder.endsWith("_qsv")) {
            console.info(`[JoinSplitVideo] Đã encode bằng Intel QSV (${encoder}).`);
          }
          onProgress?.(99);
          return;
        } catch (error) {
          lastError = error;
          await fs.promises.rm(outputPath, { force: true });
          if (signal?.aborted || index === videoEncoders.length - 1) throw error;
          console.warn(
            `[JoinSplitVideo] Encode bằng ${encoder} thất bại; đang thử encoder dự phòng.`,
            error,
          );
        }
      }
      throw lastError instanceof Error ? lastError : new Error("Không thể encode video.");
    }

    try {
      if (!encode) {
        await runProcess(this.options.ffmpegPath, args, 1024 * 1024, onProgress, outputDuration, signal);
        const stat = await fs.promises.stat(outputPath);
        if (!stat.isFile() || stat.size <= 0) throw new Error("FFmpeg tạo tệp đầu ra rỗng.");
        onVerifying?.();
        await this.verifyOutput(outputPath, expectedFrames, outputDuration, reference.source.frameRate);
        onProgress?.(99);
      }
    } catch (error) {
      await fs.promises.rm(outputPath, { force: true });
      throw new Error(
        `Không thể xuất ${source.source.fileName} (${range.startFrame}-${range.endFrame})${encode ? " bằng cấu hình thông số chung" : " bằng stream-copy"}: ${error instanceof Error ? error.message : String(error)}`,
      );
    }
  }

}
