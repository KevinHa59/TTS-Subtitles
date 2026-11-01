import fs from "fs";
import path from "path";
import { randomBytes } from "crypto";
import { ChildProcess, spawn } from "child_process";
import { once } from "events";
import { Readable, Transform, Writable } from "stream";
import { pipeline } from "stream/promises";
import { renderToStaticMarkup } from "react-dom/server";
import React from "react";
import sharp from "sharp";
import puppeteer, { Browser, Page } from "puppeteer-core";
import SubtitleOverlayRenderer from "./src/components/SubtitleOverlayRenderer";
import {
  VideoDubbingExportQuality,
  VideoDubbingFinalMixTask,
  VideoDubbingJob,
  VideoDubbingMixerSettings,
  VideoDubbingMixerTrack,
  VideoDubbingMediaTask,
  VideoDubbingOverlayPosition,
  VideoDubbingOverlaySettings,
  VideoDubbingSubtitleCue,
  VideoDubbingTextOverlayCue,
} from "./src/types/videoDubbing";
import { VideoDubbingManager } from "./videoDubbingManager";
import { createSubtitleFontFaceCss, getSupportedSubtitleFontFamilies, quoteCssFontFamily } from "./videoDubbingFonts";

const AUDIO_SAMPLE_RATE = 48_000;
const MAX_GAIN_PERCENT = 200;
const PROCESS_OUTPUT_LIMIT = 64 * 1024;
const MAX_MEDIA_TASK_MS = 2 * 60 * 60 * 1000;
const MAX_LOGO_BYTES = 20 * 1024 * 1024;
const DEFAULT_X264_THREADS = 8;
const MAX_X264_THREADS = 256;
const DEFAULT_QSV_GLOBAL_QUALITY = 18;
const DEFAULT_QSV_PRESET = "medium";
type TextCaseValue = "none" | "uppercase" | "lowercase" | "capitalize";
const VIDEO_EXPORT_PREPARATION_PROGRESS = 10;
const VIDEO_EXPORT_FFMPEG_PROGRESS_SPAN = 84;
const DEFAULT_OVERLAY_SETTINGS: VideoDubbingOverlaySettings = {
  exportQuality: "high",
  logoEnabled: false,
  logoWidthPercent: 15,
  logoPaddingPx: 24,
  logoPosition: "top-left",
  subtitlesEnabled: false,
  subtitles: [],
  textOverlays: [],
  subtitleFontSize: 32,
  subtitleFontFamily: "Arial",
  subtitleColor: "#ffffff",
  subtitleBackgroundColor: "#000000",
  subtitleBackgroundTransparent: false,
  subtitleBackgroundMode: "color",
  subtitleBold: false,
  subtitleItalic: false,
  subtitleUnderline: false,
  subtitleTextCase: "none",
  subtitleOutlineEnabled: false,
  subtitleOutlineColor: "#000000",
  subtitleOutlineWidthPx: 2,
  subtitleCharacterSpacingPx: 0,
  subtitleLineSpacingPx: 0,
  subtitlePaddingPx: 8,
  subtitleMarginPx: 32,
  subtitlePosition: "bottom-center",
  subtitleBackgroundImage: null,
  subtitleBackgroundLeftSlicePx: 128,
  subtitleBackgroundRightSlicePx: 128,
};
const OVERLAY_POSITIONS = new Set<VideoDubbingOverlayPosition>([
  "top-left",
  "top-center",
  "top-right",
  "middle-left",
  "middle-center",
  "middle-right",
  "bottom-left",
  "bottom-center",
  "bottom-right",
]);

interface ProbeStream {
  codec_type?: string;
  codec_name?: string;
  width?: number;
  height?: number;
  duration?: string;
  sample_rate?: string;
  channels?: number;
  r_frame_rate?: string;
  avg_frame_rate?: string;
  pix_fmt?: string;
  profile?: string;
  level?: number;
  time_base?: string;
  channel_layout?: string;
  extradata_hash?: string;
  bit_rate?: string;
}

interface MediaProbe {
  streams?: ProbeStream[];
  format?: { duration?: string; size?: string };
}

interface ActiveTask {
  jobId: string;
  kind: "audioMix" | "videoExport" | "finalMix";
  child?: ChildProcess;
  cancelled: boolean;
  operation: Promise<void>;
  temporaryFiles: Set<string>;
}

interface SubtitlePngOverlay extends SubtitleImageBounds {
  image: Buffer;
  left: number;
  top: number;
  startTime: number;
  endTime: number;
}

interface SubtitleImageBounds {
  left: number;
  top: number;
  width: number;
  height: number;
}

interface CachedSubtitleImage extends SubtitleImageBounds {
  image: Buffer;
}

interface SubtitleOverlayStream {
  overlays: SubtitlePngOverlay[];
  width: number;
  top: number;
  height: number;
  frameRate: number;
  frameCount: number;
}

class PersistentChromiumPage {
  private browser: Browser | null = null;
  private page: Page | null = null;

  constructor(
    private readonly executable: string,
    private readonly width: number,
    private readonly height: number,
  ) {}

  async start(): Promise<void> {
    let lastError: unknown;
    for (let attempt = 0; attempt < 2; attempt++) {
      try {
        this.browser = await puppeteer.launch({
          executablePath: this.executable,
          headless: true,
          timeout: 15_000,
          args: [
            "--hide-scrollbars",
            "--no-sandbox",
            "--disable-gpu",
            "--disable-dev-shm-usage",
            "--no-first-run",
            "--no-default-browser-check",
          ],
        });
        this.page = await this.browser.newPage();
        await this.page.setViewport({
          width: this.width,
          height: this.height,
          deviceScaleFactor: 1,
        });
        return;
      } catch (error) {
        lastError = error;
        if (this.browser?.connected) await this.browser.close().catch(() => undefined);
        this.browser = null;
        this.page = null;
      }
    }
    throw lastError instanceof Error
      ? lastError
      : new Error("Không khởi tạo được trang Chromium để render phụ đề.");
  }

  async renderHtml(html: string): Promise<Buffer> {
    if (!this.page) throw new Error("Trang Chromium chưa được khởi tạo.");
    try {
      await this.page.setContent(html, {
        waitUntil: "load",
        timeout: 15_000,
      });
    } catch (error) {
      if (!this.browser?.connected) throw error;
      if (!this.page.isClosed()) {
        await this.page.close().catch(() => undefined);
      }
      this.page = await this.browser.newPage();
      await this.page.setContent(html, {
        waitUntil: "load",
        timeout: 15_000,
      });
    }
    await this.page.evaluate(async () => {
      await (document.fonts ? document.fonts.ready : Promise.resolve());
      await Promise.all(Array.from(document.images).map((image) =>
        image.complete
          ? Promise.resolve()
          : new Promise<void>((resolve) => {
              image.addEventListener("load", () => resolve(), { once: true });
              image.addEventListener("error", () => resolve(), { once: true });
            }),
      ));
      await new Promise<void>((resolve) =>
        requestAnimationFrame(() => requestAnimationFrame(() => resolve())),
      );
    });
    const stage = await this.page.$("#video-subtitle-stage");
    if (!stage) throw new Error("Không tìm thấy container phụ đề để chụp PNG.");
    return await stage.screenshot({
      type: "png",
      omitBackground: true,
      encoding: "binary",
      captureBeyondViewport: false,
    }) as Buffer;
  }

  async close(): Promise<void> {
    if (this.page && !this.page.isClosed()) await this.page.close().catch(() => undefined);
    this.page = null;
    if (this.browser?.connected) await this.browser.close().catch(() => undefined);
    this.browser = null;
  }
}

export interface VideoDubbingMediaOptions {
  ffmpegPath: string;
  ffprobePath: string;
}

export class VideoDubbingMediaCoordinator {
  private readonly activeTasks = new Map<string, ActiveTask>();

  constructor(
    private readonly manager: VideoDubbingManager,
    private readonly options: VideoDubbingMediaOptions,
  ) {}

  isBusy(jobId: string): boolean {
    return this.activeTasks.has(jobId);
  }

  startMix(jobId: string, input: unknown): VideoDubbingMediaTask {
    const job = this.requireReadyJob(jobId);
    this.assertNoActiveTask(jobId);
    this.requireMaster(jobId, job);
    const volumes = this.validateVolumes(input);
    const previous = job.audioMix;
    const task = this.createTask(jobId, "audioMix", {
      status: "running",
      phase: "extracting",
      progressPercent: 0,
      ...volumes,
      durationSeconds: previous?.durationSeconds,
      sizeBytes: previous?.sizeBytes,
    });
    const active = this.registerTask(jobId, "audioMix");
    active.operation = this.runMix(job, active, volumes);
    return { ...task };
  }

  startExport(jobId: string, input?: unknown): VideoDubbingMediaTask {
    const job = this.requireReadyJob(jobId);
    this.assertNoActiveTask(jobId);
    const mixedAudioPath = this.requireMixedAudio(jobId, job);
    const settings = this.validateOverlaySettings(input, job);
    if (settings.logoEnabled && !this.manager.getOverlayLogoPath(jobId)) {
      throw new Error("Hãy chọn và tải logo lên trước khi bật chèn logo.");
    }
    if (settings.subtitlesEnabled && settings.subtitles.length === 0) {
      throw new Error("Hãy chọn tệp SRT hợp lệ trước khi bật phụ đề.");
    }
    this.manager.updateOverlaySettings(jobId, settings);
    const previous = job.videoExport;
    const startedAtMs = Date.now();
    const task = this.createTask(jobId, "videoExport", {
      status: "running",
      phase:
        settings.logoEnabled || settings.subtitlesEnabled || Boolean(settings.textOverlays?.length) || settings.exportQuality === "low" || settings.exportQuality === "medium"
          ? "rendering"
          : "remuxing",
      progressPercent: 0,
      detail: settings.subtitlesEnabled
        ? "Đang chuẩn bị Chromium render phụ đề trong suốt"
        : settings.logoEnabled
          ? "Đang chuẩn bị ghép logo và mã hóa video"
          : "Đang remux video và audio final mix",
      startedAtMs,
      completedAtMs: undefined,
      elapsedSeconds: 0,
      durationSeconds: previous?.durationSeconds,
      sizeBytes: previous?.sizeBytes,
    });
    const active = this.registerTask(jobId, "videoExport");
    active.operation = this.runExport(
      job,
      active,
      mixedAudioPath,
      settings,
    );
    return { ...task };
  }

  saveOverlaySettings(jobId: string, input: unknown): VideoDubbingJob {
    const job = this.requireReadyJob(jobId);
    this.assertNoActiveTask(jobId);
    const settings = this.validateOverlaySettings(input, job);
    if (settings.logoEnabled && !this.manager.getOverlayLogoPath(jobId)) {
      throw new Error("Hãy tải logo vào job trước khi bật chèn logo.");
    }
    this.manager.updateOverlaySettings(jobId, settings);
    return this.manager.getJob(jobId)!;
  }

  async uploadLogo(
    jobId: string,
    request: Readable,
    extensionInput: unknown,
  ): Promise<VideoDubbingJob> {
    this.requireReadyJob(jobId);
    this.assertNoActiveTask(jobId);
    const extension =
      typeof extensionInput === "string"
        ? extensionInput.toLowerCase()
        : "";
    if (![".png", ".jpg", ".jpeg", ".webp"].includes(extension)) {
      throw new Error("Logo chỉ hỗ trợ PNG, JPG hoặc WebP.");
    }
    const directory = this.requireDirectory(jobId);
    const temporaryPath = path.join(
      directory,
      `.overlay-logo-${randomBytes(8).toString("hex")}.upload`,
    );
    let receivedBytes = 0;
    try {
      const sizeLimiter = new Transform({
        transform(chunk: Buffer, _encoding, callback) {
          receivedBytes += chunk.length;
          if (receivedBytes > MAX_LOGO_BYTES) {
            callback(new Error("Logo vượt quá giới hạn 20 MB."));
            return;
          }
          callback(null, chunk);
        },
      });
      await pipeline(
        request,
        sizeLimiter,
        fs.createWriteStream(temporaryPath, { flags: "wx" }),
      );
      if (receivedBytes === 0) throw new Error("Tệp logo rỗng.");
      this.assertLogoImage(temporaryPath, extension);
      const fileName = `overlay-logo${extension}`;
      const targetPath = path.join(directory, fileName);
      this.publishFile(temporaryPath, targetPath, directory);
      this.manager.setOverlayLogo(jobId, fileName);
      return this.manager.getJob(jobId)!;
    } catch (error) {
      await fs.promises.rm(temporaryPath, { force: true });
      throw error;
    }
  }

  async uploadProjectLogo(
    assetsDirectory: string,
    request: Readable,
    extensionInput: unknown,
  ): Promise<string> {
    const extension = typeof extensionInput === "string" ? extensionInput.toLowerCase() : "";
    if (![".png", ".jpg", ".jpeg", ".webp"].includes(extension)) {
      throw new Error("Logo chỉ hỗ trợ PNG, JPG hoặc WebP.");
    }
    const directory = path.resolve(assetsDirectory);
    await fs.promises.mkdir(directory, { recursive: true });
    const temporaryPath = path.join(directory, `.overlay-logo-${randomBytes(8).toString("hex")}.upload`);
    let receivedBytes = 0;
    try {
      const sizeLimiter = new Transform({
        transform(chunk: Buffer, _encoding, callback) {
          receivedBytes += chunk.length;
          if (receivedBytes > MAX_LOGO_BYTES) {
            callback(new Error("Logo vượt quá giới hạn 20 MB."));
            return;
          }
          callback(null, chunk);
        },
      });
      await pipeline(request, sizeLimiter, fs.createWriteStream(temporaryPath, { flags: "wx" }));
      if (receivedBytes === 0) throw new Error("Tệp logo rỗng.");
      this.assertLogoImage(temporaryPath, extension);
      const fileName = `overlay-logo${extension}`;
      this.publishFile(temporaryPath, path.join(directory, fileName), directory);
      return fileName;
    } catch (error) {
      await fs.promises.rm(temporaryPath, { force: true });
      throw error;
    }
  }

  getLogoPath(jobId: string): string | null {
    return this.manager.getOverlayLogoPath(jobId);
  }

  async cancel(jobId: string): Promise<void> {
    const active = this.activeTasks.get(jobId);
    if (!active) return;
    active.cancelled = true;
    const state = this.getTask(jobId, active.kind);
    if (state) {
      this.createTask(jobId, active.kind, {
        ...state,
        status: "cancelled",
        error: undefined,
      });
    }
    active.child?.kill();
    await active.operation;
  }

  getAudioMixPath(jobId: string): string | null {
    const job = this.manager.getJob(jobId);
    const directory = this.manager.getJobDirectory(jobId);
    if (!job || !directory) return null;
    const filePath = path.join(directory, "mixed-audio.m4a");
    return fs.existsSync(filePath) && fs.statSync(filePath).size > 0
      ? filePath
      : null;
  }

  getVideoExportPath(jobId: string): string | null {
    const job = this.manager.getJob(jobId);
    const directory = this.manager.getJobDirectory(jobId);
    if (!job || !directory) return null;
    const filePath = path.join(directory, job.exportedVideoFileName || "output.mp4");
    return fs.existsSync(filePath) && fs.statSync(filePath).size > 0
      ? filePath
      : null;
  }

  async checkExportConcatCompatibility(jobIdsInput: unknown, qualityInput: unknown = "high", willRenderVideoInput = true): Promise<{ compatible: boolean; message: string }> {
    if (!Array.isArray(jobIdsInput) || jobIdsInput.length < 2 || jobIdsInput.some((id) => typeof id !== "string")) {
      throw new Error("Cần ít nhất hai video đã lưu để kiểm tra khả năng ghép.");
    }
    const jobIds = [...new Set(jobIdsInput as string[])];
    if (jobIds.length !== jobIdsInput.length) throw new Error("Danh sách video kiểm tra bị trùng.");
    const quality: VideoDubbingExportQuality = qualityInput === "source" || qualityInput === "low" || qualityInput === "medium" || qualityInput === "high"
      ? qualityInput
      : "high";
    const willRenderVideo = willRenderVideoInput !== false;
    const jobs = jobIds.map((jobId) => {
      const job = this.manager.getJob(jobId);
      if (!job || job.status !== "completed" || !job.metadata) {
        throw new Error(`Video ${jobId} chưa được lưu và kiểm tra hoàn tất.`);
      }
      return job;
    });
    const active: ActiveTask = {
      jobId: jobs[0].id,
      kind: "videoExport",
      cancelled: false,
      operation: Promise.resolve(),
      temporaryFiles: new Set(),
    };
    const probes = await Promise.all(jobs.map((job) => this.probe(this.requireVideoPath(job.id), active)));
    const baseline = probes[0].streams?.find((stream) => stream.codec_type === "video");
    if (!baseline || !baseline.width || !baseline.height || !baseline.r_frame_rate || !baseline.time_base) {
      return { compatible: false, message: "Không đọc đủ thông số video nguồn để xác nhận khả năng ghép." };
    }
    for (let index = 1; index < probes.length; index++) {
      const candidate = probes[index].streams?.find((stream) => stream.codec_type === "video");
      const expectedCodec = (probe: MediaProbe) => {
        const codec = probe.streams?.find((stream) => stream.codec_type === "video")?.codec_name;
        if (quality === "high" && !willRenderVideo) return codec || "unknown";
        return quality === "high" ? "h264" : codec === "hevc" || codec === "h265" ? "hevc" : "h264";
      };
      if (!candidate || candidate.width !== baseline.width || candidate.height !== baseline.height ||
          candidate.r_frame_rate !== baseline.r_frame_rate || candidate.avg_frame_rate !== baseline.avg_frame_rate ||
          candidate.time_base !== baseline.time_base || expectedCodec(probes[index]) !== expectedCodec(probes[0])) {
        return {
          compatible: false,
          message: `${jobs[index].fileName} khác codec đầu ra dự kiến, độ phân giải, FPS hoặc time base so với ${jobs[0].fileName}; ghép stream-copy có thể không chính xác.`,
        };
      }
      if (quality === "high" && !willRenderVideo &&
          (candidate.pix_fmt !== baseline.pix_fmt || candidate.profile !== baseline.profile ||
           candidate.level !== baseline.level || candidate.extradata_hash !== baseline.extradata_hash)) {
        return {
          compatible: false,
          message: `${jobs[index].fileName} có cấu hình codec nguồn khác ${jobs[0].fileName}; ghép stream-copy có thể không chính xác.`,
        };
      }
    }
    return {
      compatible: true,
      message: `${jobs.length} video có cùng độ phân giải, FPS và time base. Audio export được chuẩn hóa; sẽ kiểm tra lại các stream đầu ra trước khi ghép.`,
    };
  }

  async concatExportedVideos(jobIdsInput: unknown): Promise<{ jobId: string; fileName: string; sizeBytes: number }> {
    if (!Array.isArray(jobIdsInput) || jobIdsInput.length < 2 || jobIdsInput.some((id) => typeof id !== "string")) {
      throw new Error("Cần ít nhất hai job đã export để ghép nối.");
    }
    const jobIds = [...new Set(jobIdsInput as string[])];
    if (jobIds.length !== jobIdsInput.length) throw new Error("Danh sách job ghép nối bị trùng.");

    const entries = jobIds.map((jobId) => {
      const job = this.manager.getJob(jobId);
      const filePath = this.getVideoExportPath(jobId);
      if (!job || job.status !== "completed" || job.videoExport?.status !== "completed" || !filePath) {
        throw new Error(`Job ${jobId} chưa có video export hoàn tất.`);
      }
      return { job, filePath };
    });

    const active: ActiveTask = {
      jobId: entries[0].job.id,
      kind: "videoExport",
      cancelled: false,
      operation: Promise.resolve(),
      temporaryFiles: new Set(),
    };
    const probes = await Promise.all(entries.map(({ filePath }) => this.probe(filePath, active)));
    const streamSignature = (probe: MediaProbe) => JSON.stringify((probe.streams || []).map((stream) => ({
      codec_type: stream.codec_type,
      codec_name: stream.codec_name,
      width: stream.width,
      height: stream.height,
      pix_fmt: stream.pix_fmt,
      profile: stream.profile,
      level: stream.level,
      sample_rate: stream.sample_rate,
      channels: stream.channels,
      channel_layout: stream.channel_layout,
      extradata_hash: stream.extradata_hash,
      r_frame_rate: stream.r_frame_rate,
      avg_frame_rate: stream.avg_frame_rate,
      time_base: stream.time_base,
    })));
    const expectedSignature = streamSignature(probes[0]);
    if (!probes[0].streams?.some((stream) => stream.codec_type === "video") ||
        !probes[0].streams?.some((stream) => stream.codec_type === "audio") ||
        probes.some((probe) => streamSignature(probe) !== expectedSignature)) {
      throw new Error("Các video có thông số video/audio khác nhau nên không thể ghép stream-copy. Không có video nào bị encode lại.");
    }

    const directory = this.requireDirectory(entries[0].job.id);
    const safeBaseName = path.parse(entries[0].job.fileName).name
      .replace(/[<>:"/\\|?*\u0000-\u001f]/g, "_")
      .replace(/[. ]+$/g, "") || "video";
    let outputPath = path.join(directory, `${safeBaseName}_joined.mp4`);
    let suffix = 1;
    while (fs.existsSync(outputPath)) outputPath = path.join(directory, `${safeBaseName}_joined (${suffix++}).mp4`);
    const temporaryOutput = path.join(directory, `.joined-${randomBytes(8).toString("hex")}.mp4`);
    const concatListPath = path.join(directory, `.concat-${randomBytes(8).toString("hex")}.txt`);
    const quoteConcatPath = (filePath: string) => `file '${filePath.replace(/\\/g, "/").replace(/'/g, "'\\''")}'`;
    await fs.promises.writeFile(concatListPath, `${entries.map(({ filePath }) => quoteConcatPath(filePath)).join("\n")}\n`, "utf8");
    try {
      await new Promise<void>((resolve, reject) => {
        const child = spawn(this.options.ffmpegPath, [
          "-nostdin", "-hide_banner", "-loglevel", "error", "-y",
          "-f", "concat", "-safe", "0", "-i", concatListPath,
          "-map", "0", "-c", "copy", "-movflags", "+faststart", temporaryOutput,
        ], { shell: false, windowsHide: true, stdio: ["ignore", "ignore", "pipe"] });
        let stderr = "";
        const timeout = setTimeout(() => child.kill(), MAX_MEDIA_TASK_MS);
        child.stderr!.setEncoding("utf8");
        child.stderr!.on("data", (chunk: string) => { stderr = (stderr + chunk).slice(-PROCESS_OUTPUT_LIMIT); });
        child.once("error", (error) => { clearTimeout(timeout); reject(new Error(`Không thể chạy FFmpeg concat: ${error.message}`)); });
        child.once("close", (code) => {
          clearTimeout(timeout);
          if (code === 0) resolve();
          else reject(new Error(`FFmpeg không thể ghép video bằng stream copy${stderr ? `: ${stderr.trim()}` : "."}`));
        });
      });
      this.assertOutputExists(temporaryOutput, "FFmpeg không tạo được video ghép nối.");
      const outputProbe = await this.probe(temporaryOutput, active);
      if (streamSignature(outputProbe) !== expectedSignature) throw new Error("Video ghép nối không vượt qua xác minh stream; file nguồn vẫn được giữ nguyên.");
      await fs.promises.rename(temporaryOutput, outputPath);
      return { jobId: entries[0].job.id, fileName: path.basename(outputPath), sizeBytes: fs.statSync(outputPath).size };
    } finally {
      await Promise.all([
        fs.promises.rm(concatListPath, { force: true }),
        fs.promises.rm(temporaryOutput, { force: true }),
      ]);
    }
  }

  getConcatenatedVideoPath(jobId: string, fileName: unknown): string | null {
    if (typeof fileName !== "string" || path.basename(fileName) !== fileName || !fileName.endsWith(".mp4")) return null;
    const directory = this.manager.getJobDirectory(jobId);
    if (!directory) return null;
    const filePath = path.resolve(directory, fileName);
    if (!filePath.startsWith(`${path.resolve(directory)}${path.sep}`)) return null;
    return fs.existsSync(filePath) && fs.statSync(filePath).isFile() && fs.statSync(filePath).size > 0
      ? filePath
      : null;
  }

  openExportFolder(jobId: string): void {
    const directory = this.manager.getJobDirectory(jobId);
    if (!directory || !fs.existsSync(directory)) {
      throw new Error("Không tìm thấy thư mục lưu video đã export.");
    }
    const command = process.platform === "win32"
      ? "explorer.exe"
      : process.platform === "darwin"
        ? "open"
        : "xdg-open";
    const child = spawn(command, [directory], {
      detached: true,
      stdio: "ignore",
      windowsHide: true,
    });
    child.once("error", (error) => {
      console.error("[VideoDubbing] Không mở được thư mục export:", error);
    });
    child.unref();
  }

  getFinalMixPath(jobId: string): string | null {
    const job = this.manager.getJob(jobId);
    const directory = this.manager.getJobDirectory(jobId);
    if (!job || !directory) return null;
    const filePath = path.join(directory, "mixed-audio.wav");
    return fs.existsSync(filePath) && fs.statSync(filePath).size > 44
      ? filePath
      : null;
  }

  updateMixerSettings(
    jobId: string,
    input: unknown,
  ): VideoDubbingMixerSettings {
    this.requireReadyJob(jobId);
    this.assertNoActiveTask(jobId);
    return this.manager.updateMixerSettings(
      jobId,
      this.validateMixerSettings(input),
    );
  }

  startFinalMix(
    jobId: string,
    input: unknown,
    originalAudioVolumePercent?: number,
    includeSeparatedTracks = true,
  ): VideoDubbingFinalMixTask {
    const job = this.requireReadyJob(jobId);
    this.assertNoActiveTask(jobId);
    const settings = this.validateMixerSettings(input);
    this.requireMaster(jobId, job);
    const directory = this.requireDirectory(jobId);
    const originalGain =
      originalAudioVolumePercent === undefined
        ? undefined
        : this.validateGain(originalAudioVolumePercent, "Âm lượng audio gốc");
    const hasEnabledTrack =
      (!settings.ttsMaster.muted && settings.ttsMaster.volumePercent > 0) ||
      (originalGain !== undefined && originalGain > 0) ||
      (["vocals", "instrumental"] as const).some(
        (track) => {
          const recordedSize =
            track === "vocals"
              ? job.separation?.vocalsSizeBytes
              : job.separation?.instrumentalSizeBytes;
          const filePath = path.join(directory, `${track}.wav`);
          return (
            !settings[track].muted &&
            settings[track].volumePercent > 0 &&
            Boolean(recordedSize && recordedSize > 44) &&
            fs.existsSync(filePath) &&
            fs.statSync(filePath).size > 44
          );
        },
      );
    if (!hasEnabledTrack) {
      throw new Error("Bật ít nhất một track có sẵn với âm lượng lớn hơn 0%.");
    }
    const savedSettings = this.manager.updateMixerSettings(jobId, settings);
    const previous = job.finalMix;
    const task: VideoDubbingFinalMixTask = {
      status: "running",
      phase: "rendering",
      progressPercent: 0,
      sizeBytes: previous?.sizeBytes,
      durationSeconds: previous?.durationSeconds,
      renderedSettings: previous?.renderedSettings,
      includedTracks: previous?.includedTracks,
    };
    this.manager.setFinalMixTask(jobId, task);
    const active = this.registerTask(jobId, "finalMix");
    active.operation = this.runFinalMix(
      job,
      active,
      savedSettings,
      originalGain,
      includeSeparatedTracks,
    );
    return { ...task };
  }

  validateMixerSettings(input: unknown): VideoDubbingMixerSettings {
    return this.validateMixerSettingsInput(input);
  }

  private validateOverlaySettings(
    input: unknown,
    job: VideoDubbingJob,
  ): VideoDubbingOverlaySettings {
    const saved = job.overlaySettings || DEFAULT_OVERLAY_SETTINGS;
    if (!input || typeof input !== "object") {
      if (input !== undefined) throw new Error("Cấu hình logo/phụ đề không hợp lệ.");
      return {
        ...saved,
        subtitles: saved.subtitles.map((cue) => ({ ...cue })),
      };
    }
    const values = input as Record<string, unknown>;
    const numberInRange = (
      value: unknown,
      minimum: number,
      maximum: number,
      label: string,
    ) => {
      if (
        typeof value !== "number" ||
        !Number.isFinite(value) ||
        value < minimum ||
        value > maximum
      ) {
        throw new Error(`${label} phải nằm trong khoảng ${minimum}–${maximum}.`);
      }
      return value;
    };
    const position = (
      value: unknown,
      fallback: VideoDubbingOverlayPosition,
      label: string,
    ) => {
      const selected = value ?? fallback;
      if (
        typeof selected !== "string" ||
        !OVERLAY_POSITIONS.has(selected as VideoDubbingOverlayPosition)
      ) {
        throw new Error(`${label} không hợp lệ.`);
      }
      return selected as VideoDubbingOverlayPosition;
    };
    const logoEnabled = values.logoEnabled ?? saved.logoEnabled;
    const subtitlesEnabled = values.subtitlesEnabled ?? saved.subtitlesEnabled;
    if (typeof logoEnabled !== "boolean" || typeof subtitlesEnabled !== "boolean") {
      throw new Error("Trạng thái bật/tắt logo hoặc phụ đề không hợp lệ.");
    }
    const exportQualityValue = values.exportQuality ?? saved.exportQuality ?? "high";
    if (!["source", "low", "medium", "high"].includes(String(exportQualityValue))) {
      throw new Error("Chất lượng export không hợp lệ.");
    }
    const subtitleFontFamily =
      values.subtitleFontFamily ?? saved.subtitleFontFamily ?? "Arial";
    if (
      typeof subtitleFontFamily !== "string" ||
      !getSupportedSubtitleFontFamilies().has(subtitleFontFamily)
    ) {
      throw new Error("Font phụ đề không được hỗ trợ.");
    }
    const color = (value: unknown, fallback: string, label: string) => {
      const selected = value ?? fallback;
      if (typeof selected !== "string" || !/^#[0-9a-f]{6}$/i.test(selected)) {
        throw new Error(`${label} phải là mã màu HEX hợp lệ.`);
      }
      return selected.toLowerCase();
    };
    const booleanValue = (value: unknown, fallback: boolean, label: string) => {
      const selected = value ?? fallback;
      if (typeof selected !== "boolean") {
        throw new Error(`${label} không hợp lệ.`);
      }
      return selected;
    };
    const textCaseValue = (value: unknown, fallback: TextCaseValue, label: string): TextCaseValue => {
      const selected = value ?? fallback;
      if (selected !== "none" && selected !== "uppercase" && selected !== "lowercase" && selected !== "capitalize") {
        throw new Error(`${label} không hợp lệ.`);
      }
      return selected;
    };
    const inputCues = values.subtitles ?? saved.subtitles;
    if (!Array.isArray(inputCues) || inputCues.length > 10_000) {
      throw new Error("Danh sách phụ đề không hợp lệ hoặc vượt quá 10.000 dòng.");
    }
    let totalTextLength = 0;
    const subtitles: VideoDubbingSubtitleCue[] = inputCues.map((cue) => {
      if (!cue || typeof cue !== "object") {
        throw new Error("Dữ liệu một dòng phụ đề không hợp lệ.");
      }
      const values = cue as Record<string, unknown>;
      if (typeof values.text !== "string") {
        throw new Error("Nội dung phụ đề phải là văn bản.");
      }
      totalTextLength += values.text.length;
      if (totalTextLength > 2_000_000) {
        throw new Error("Tổng nội dung phụ đề vượt quá 2 MB.");
      }
      const startTime = numberInRange(
        values.startTime,
        0,
        job.metadata!.durationSeconds,
        "Thời điểm bắt đầu phụ đề",
      );
      const endTime = numberInRange(
        values.endTime,
        0,
        job.metadata!.durationSeconds + 60,
        "Thời điểm kết thúc phụ đề",
      );
      if (endTime <= startTime) {
        throw new Error("Thời điểm kết thúc phụ đề phải sau thời điểm bắt đầu.");
      }
      return {
        startTime,
        endTime,
        text: values.text,
      };
    });
    const inputTextOverlays = values.textOverlays ?? saved.textOverlays ?? [];
    if (!Array.isArray(inputTextOverlays) || inputTextOverlays.length > 1_000) {
      throw new Error("Danh sách text timeline không hợp lệ hoặc vượt quá 1.000 clip.");
    }
    const textOverlays: VideoDubbingTextOverlayCue[] = inputTextOverlays.map((cue) => {
      if (!cue || typeof cue !== "object") throw new Error("Text clip không hợp lệ.");
      const item = cue as Record<string, unknown>;
      if (typeof item.text !== "string" || item.text.length > 10_000) throw new Error("Nội dung text clip không hợp lệ.");
      if (typeof item.fontFamily !== "string" || !getSupportedSubtitleFontFamilies().has(item.fontFamily)) throw new Error("Font text clip không được hỗ trợ.");
      return {
        startTime: numberInRange(item.startTime, 0, job.metadata!.durationSeconds, "Thời điểm bắt đầu text"),
        endTime: numberInRange(item.endTime, 0, job.metadata!.durationSeconds, "Thời điểm kết thúc text"),
        text: item.text,
        fontSize: numberInRange(item.fontSize, 8, 160, "Cỡ chữ text"),
        fontFamily: item.fontFamily,
        color: color(item.color, "#ffffff", "Màu chữ text"),
        bold: booleanValue(item.bold, false, "Text đậm"),
        italic: booleanValue(item.italic, false, "Text nghiêng"),
        underline: booleanValue(item.underline, false, "Text gạch chân"),
        textCase: textCaseValue(item.textCase, "none", "Kiểu chữ text"),
        outlineEnabled: booleanValue(item.outlineEnabled, false, "Outline text"),
        outlineColor: color(item.outlineColor, "#000000", "Màu outline text"),
        outlineWidthPx: numberInRange(item.outlineWidthPx ?? 2, 0, 8, "Độ dày outline text"),
        characterSpacingPx: numberInRange(item.characterSpacingPx ?? 0, 0, 40, "Giãn ký tự text"),
        lineSpacingPx: numberInRange(item.lineSpacingPx ?? 0, 0, 80, "Giãn dòng text"),
        position: position(item.position, "middle-center", "Vị trí text"),
        xPercent: item.xPercent === undefined
          ? undefined
          : numberInRange(item.xPercent, 0, 100, "Tọa độ ngang text"),
        yPercent: item.yPercent === undefined
          ? undefined
          : numberInRange(item.yPercent, 0, 100, "Tọa độ dọc text"),
        backgroundColor: color(item.backgroundColor, "#000000", "Màu nền text"),
        backgroundTransparent: booleanValue(item.backgroundTransparent, true, "Nền text trong suốt"),
        paddingPx: numberInRange(item.paddingPx, 0, 40, "Padding text"),
      };
    });
    if (textOverlays.some((cue) => cue.endTime <= cue.startTime)) throw new Error("Thời điểm kết thúc text phải sau thời điểm bắt đầu.");
    return {
      exportQuality: exportQualityValue as VideoDubbingExportQuality,
      logoEnabled,
      logoFileName: saved.logoFileName,
      logoWidthPercent: numberInRange(
        values.logoWidthPercent ?? saved.logoWidthPercent,
        5,
        40,
        "Kích thước logo",
      ),
      logoPaddingPx: numberInRange(
        values.logoPaddingPx ?? saved.logoPaddingPx ?? 24,
        0,
        200,
        "Khoảng cách logo",
      ),
      logoPosition: position(
        values.logoPosition,
        saved.logoPosition,
        "Vị trí logo",
      ),
      subtitlesEnabled,
      subtitles,
      textOverlays,
      subtitleFontSize: numberInRange(
        values.subtitleFontSize ?? saved.subtitleFontSize,
        12,
        72,
        "Cỡ chữ phụ đề",
      ),
      subtitleFontFamily,
      subtitleColor: color(
        values.subtitleColor,
        saved.subtitleColor || "#ffffff",
        "Màu chữ phụ đề",
      ),
      subtitleBackgroundColor: color(
        values.subtitleBackgroundColor,
        saved.subtitleBackgroundColor || "#000000",
        "Màu nền phụ đề",
      ),
      subtitleBackgroundTransparent: booleanValue(
        values.subtitleBackgroundTransparent,
        saved.subtitleBackgroundTransparent ?? false,
        "Nền phụ đề trong suốt",
      ),
      subtitleBackgroundMode:
        values.subtitleBackgroundMode === "none" ||
        values.subtitleBackgroundMode === "color" ||
        values.subtitleBackgroundMode === "image"
          ? values.subtitleBackgroundMode
          : saved.subtitleBackgroundMode ??
            (saved.subtitleBackgroundImage
              ? "image"
              : saved.subtitleBackgroundTransparent
                ? "none"
                : "color"),
      subtitleBold: booleanValue(
        values.subtitleBold,
        saved.subtitleBold ?? false,
        "Đậm phụ đề",
      ),
      subtitleItalic: booleanValue(
        values.subtitleItalic,
        saved.subtitleItalic ?? false,
        "Nghiêng phụ đề",
      ),
      subtitleUnderline: booleanValue(values.subtitleUnderline, saved.subtitleUnderline ?? false, "Gạch chân phụ đề"),
      subtitleTextCase: textCaseValue(values.subtitleTextCase, saved.subtitleTextCase ?? "none", "Kiểu chữ phụ đề"),
      subtitleOutlineEnabled: booleanValue(values.subtitleOutlineEnabled, saved.subtitleOutlineEnabled ?? false, "Outline phụ đề"),
      subtitleOutlineColor: color(values.subtitleOutlineColor, saved.subtitleOutlineColor ?? "#000000", "Màu outline phụ đề"),
      subtitleOutlineWidthPx: numberInRange(values.subtitleOutlineWidthPx ?? saved.subtitleOutlineWidthPx ?? 2, 0, 8, "Độ dày outline phụ đề"),
      subtitleCharacterSpacingPx: numberInRange(values.subtitleCharacterSpacingPx ?? saved.subtitleCharacterSpacingPx ?? 0, 0, 40, "Giãn ký tự phụ đề"),
      subtitleLineSpacingPx: numberInRange(values.subtitleLineSpacingPx ?? saved.subtitleLineSpacingPx ?? 0, 0, 80, "Giãn dòng phụ đề"),
      subtitlePaddingPx: numberInRange(
        values.subtitlePaddingPx ?? saved.subtitlePaddingPx ?? 8,
        0,
        40,
        "Padding phụ đề",
      ),
      subtitleMarginPx: numberInRange(
        values.subtitleMarginPx ?? saved.subtitleMarginPx ?? 32,
        0,
        200,
        "Khoảng cách phụ đề",
      ),
      subtitlePosition: position(
        values.subtitlePosition,
        saved.subtitlePosition,
        "Vị trí phụ đề",
      ),
      subtitleBackgroundImage:
        values.subtitleBackgroundImage === null
          ? null
          : typeof values.subtitleBackgroundImage === "string"
            ? values.subtitleBackgroundImage
                .replace(/\.(png|webp)$/i, "")
                .replace(/-(left|center|right)$/i, "")
                .replace(/[^a-zA-Z0-9_-]/g, "") || null
            : typeof saved.subtitleBackgroundImage === "string"
              ? saved.subtitleBackgroundImage
                  .replace(/\.(png|webp)$/i, "")
                  .replace(/-(left|center|right)$/i, "")
                  .replace(/[^a-zA-Z0-9_-]/g, "") || null
              : null,
    };
  }

  private assertLogoImage(filePath: string, extension: string): void {
    const header = Buffer.alloc(12);
    const descriptor = fs.openSync(filePath, "r");
    try {
      fs.readSync(descriptor, header, 0, header.length, 0);
    } finally {
      fs.closeSync(descriptor);
    }
    const valid =
      (extension === ".png" &&
        header.subarray(0, 8).equals(
          Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]),
        )) ||
      ((extension === ".jpg" || extension === ".jpeg") &&
        header[0] === 0xff &&
        header[1] === 0xd8 &&
        header[2] === 0xff) ||
      (extension === ".webp" &&
        header.toString("ascii", 0, 4) === "RIFF" &&
        header.toString("ascii", 8, 12) === "WEBP");
    if (!valid) throw new Error("Nội dung tệp không khớp định dạng logo đã chọn.");
  }

  private overlayCoordinates(
    position: VideoDubbingOverlayPosition,
    padding: number,
  ): { x: string; y: string } {
    const horizontal = position.endsWith("left")
      ? String(padding)
      : position.endsWith("right")
        ? `main_w-overlay_w-${padding}`
        : "(main_w-overlay_w)/2";
    const vertical = position.startsWith("top")
      ? String(padding)
      : position.startsWith("bottom")
        ? `main_h-overlay_h-${padding}`
        : "(main_h-overlay_h)/2";
    return { x: horizontal, y: vertical };
  }

  private requireReadyJob(jobId: string): VideoDubbingJob {
    const job = this.manager.getJob(jobId);
    if (!job) throw new Error("Không tìm thấy job Video Dubbing.");
    if (job.status !== "completed" || !job.metadata) {
      throw new Error("Video cần được kiểm tra thành công trước khi xử lý.");
    }
    return job;
  }

  private assertNoActiveTask(jobId: string): void {
    const job = this.manager.getJob(jobId);
    if (
      this.activeTasks.has(jobId) ||
      job?.separation?.status === "processing" ||
      job?.masterGeneration?.status === "generating"
    ) {
      throw new Error("Job này đang có tác vụ FFmpeg khác chạy.");
    }
  }

  private requireMaster(jobId: string, job: VideoDubbingJob): string {
    const masterPath = this.manager.getMasterAudioPath(jobId);
    if (
      !masterPath ||
      !job.masterGeneration ||
      !["completed", "failed", "cancelled"].includes(
        job.masterGeneration.status,
      ) ||
      !job.masterGeneration.sizeBytes
    ) {
      throw new Error("Hãy tạo TTS Master thành công trước khi trộn âm thanh.");
    }
    return masterPath;
  }

  private requireMixedAudio(jobId: string, job: VideoDubbingJob): string {
    if (job.masterGeneration?.status === "generating") {
      throw new Error("Hãy đợi TTS Master hoàn tất trước khi xuất MP4.");
    }
    if (!this.isFinalMixCurrent(job)) {
      throw new Error(
        "Final mix chưa được render và xác minh cho mixer settings hiện tại; hãy render lại trước khi xuất MP4.",
      );
    }
    const finalMixPath = this.getFinalMixPath(jobId);
    if (!finalMixPath) {
      throw new Error("File final mix chưa sẵn sàng.");
    }
    return finalMixPath;
  }

  private isFinalMixCurrent(job: VideoDubbingJob): boolean {
    return Boolean(
      job.finalMix &&
        ["completed", "failed", "cancelled", "interrupted"].includes(
          job.finalMix.status,
        ) &&
      job.finalMix?.renderedSettings &&
        JSON.stringify(job.finalMix.renderedSettings) ===
          JSON.stringify(job.mixerSettings) &&
        this.getFinalMixPath(job.id),
    );
  }

  private validateVolumes(input: unknown): {
    ttsVolumePercent: number;
    originalVolumePercent: number;
  } {
    if (!input || typeof input !== "object") {
      throw new Error("Thiếu cấu hình âm lượng.");
    }

    const values = input as Record<string, unknown>;
    const validate = (value: unknown, label: string) => {
      if (typeof value !== "number" || !Number.isFinite(value)) {
        throw new Error(`${label} phải là số hữu hạn.`);
      }
      if (value < 0 || value > MAX_GAIN_PERCENT) {
        throw new Error(`${label} phải nằm trong khoảng 0–${MAX_GAIN_PERCENT}%.`);
      }
      return value;
    };
    return {
      ttsVolumePercent: validate(values.ttsVolumePercent, "Âm lượng TTS"),
      originalVolumePercent: validate(
        values.originalVolumePercent,
        "Âm lượng audio gốc",
      ),
    };
  }

  private validateGain(value: unknown, label: string): number {
    if (
      typeof value !== "number" ||
      !Number.isFinite(value) ||
      value < 0 ||
      value > MAX_GAIN_PERCENT
    ) {
      throw new Error(`${label} phải nằm trong khoảng 0–${MAX_GAIN_PERCENT}%.`);
    }
    return value;
  }

  private validateMixerSettingsInput(input: unknown): VideoDubbingMixerSettings {
    if (!input || typeof input !== "object") {
      throw new Error("Thiếu cấu hình mixer.");
    }
    const values = input as Record<string, unknown>;
    const tracks: VideoDubbingMixerTrack[] = [
      "vocals",
      "instrumental",
      "ttsMaster",
    ];
    const settings = {} as VideoDubbingMixerSettings;
    for (const track of tracks) {
      const value = values[track];
      if (!value || typeof value !== "object") {
        throw new Error(`Thiếu cấu hình track ${track}.`);
      }
      const setting = value as Record<string, unknown>;
      if (
        typeof setting.volumePercent !== "number" ||
        !Number.isFinite(setting.volumePercent) ||
        setting.volumePercent < 0 ||
        setting.volumePercent > MAX_GAIN_PERCENT ||
        typeof setting.muted !== "boolean"
      ) {
        throw new Error(
          `Cấu hình track ${track} không hợp lệ (volume 0–${MAX_GAIN_PERCENT}%, muted phải là boolean).`,
        );
      }
      settings[track] = {
        volumePercent: setting.volumePercent,
        muted: setting.muted,
      };
    }
    return settings;
  }

  private updateVideoExportProgress(
    active: ActiveTask,
    phase: "rendering" | "validating",
    progressPercent: number,
    detail: string,
  ): void {
    if (active.kind !== "videoExport") return;
    const previous = this.getTask(active.jobId, active.kind) as VideoDubbingMediaTask | undefined;
    if (!previous || !("status" in previous)) return;
    this.createTask(active.jobId, active.kind, {
      ...previous,
      status: "running",
      phase,
      progressPercent,
      detail,
      completedAtMs: undefined,
      elapsedSeconds: previous.startedAtMs
        ? Math.max(0, (Date.now() - previous.startedAtMs) / 1000)
        : 0,
    } as VideoDubbingMediaTask);
  }

  private createTask(
    jobId: string,
    kind: "finalMix",
    task: VideoDubbingFinalMixTask,
  ): VideoDubbingFinalMixTask;
  private createTask(
    jobId: string,
    kind: "audioMix" | "videoExport",
    task: VideoDubbingMediaTask,
  ): VideoDubbingMediaTask;
  private createTask(
    jobId: string,
    kind: "audioMix" | "videoExport" | "finalMix",
    task: VideoDubbingMediaTask | VideoDubbingFinalMixTask,
  ): VideoDubbingMediaTask | VideoDubbingFinalMixTask;
  private createTask(
    jobId: string,
    kind: "audioMix" | "videoExport" | "finalMix",
    task: VideoDubbingMediaTask | VideoDubbingFinalMixTask,
  ): VideoDubbingMediaTask | VideoDubbingFinalMixTask {
    if (kind === "finalMix") {
      this.manager.setFinalMixTask(jobId, task as VideoDubbingFinalMixTask);
      return task as VideoDubbingFinalMixTask;
    }
    this.manager.setMediaTask(jobId, kind, task as VideoDubbingMediaTask);
    return task as VideoDubbingMediaTask;
  }

  private getTask(
    jobId: string,
    kind: "audioMix" | "videoExport" | "finalMix",
  ): VideoDubbingMediaTask | VideoDubbingFinalMixTask | undefined {
    const job = this.manager.getJob(jobId);
    if (kind === "finalMix") return job?.finalMix;
    return kind === "audioMix" ? job?.audioMix : job?.videoExport;
  }

  private registerTask(
    jobId: string,
    kind: "audioMix" | "videoExport" | "finalMix",
  ): ActiveTask {
    const active: ActiveTask = {
      jobId,
      kind,
      cancelled: false,
      operation: Promise.resolve(),
      temporaryFiles: new Set(),
    };
    this.activeTasks.set(jobId, active);
    return active;
  }

  private async runMix(
    job: VideoDubbingJob,
    active: ActiveTask,
    volumes: { ttsVolumePercent: number; originalVolumePercent: number },
  ): Promise<void> {
    const directory = this.requireDirectory(active.jobId);
    const originalIsPresent = Boolean(job.metadata?.audioCodec);
    const token = randomBytes(8).toString("hex");
    const originalTemp = path.join(
      directory,
      `.original-audio-${token}.${originalIsPresent ? "mka" : "wav"}`,
    );
    const mixedTemp = path.join(directory, `.mixed-audio-${token}.m4a`);
    active.temporaryFiles.add(originalTemp);
    active.temporaryFiles.add(mixedTemp);
    try {
      if (originalIsPresent) {
        await this.runFfmpeg(
          active,
          [
            "-i",
            this.requireVideoPath(active.jobId),
            "-map",
            "0:a:0",
            "-vn",
            "-c:a",
            "copy",
            originalTemp,
          ],
          job.metadata!.durationSeconds,
          "extracting",
          0,
          10,
        );
      } else {
        await this.runFfmpeg(
          active,
          [
            "-f",
            "lavfi",
            "-i",
            `anullsrc=channel_layout=stereo:sample_rate=${AUDIO_SAMPLE_RATE}`,
            "-t",
            String(job.metadata!.durationSeconds),
            "-c:a",
            "pcm_s16le",
            originalTemp,
          ],
          job.metadata!.durationSeconds,
          "extracting",
          0,
          10,
        );
      }

      this.assertNotCancelled(active);
      this.assertOutputExists(originalTemp, "Không thể trích xuất audio gốc.");
      const masterPath = this.requireMaster(active.jobId, job);
      const duration = job.metadata!.durationSeconds;
      const originalGain = volumes.originalVolumePercent / 100;
      const ttsGain = volumes.ttsVolumePercent / 100;
      const filter =
        `[0:a:0]aresample=${AUDIO_SAMPLE_RATE},volume=${originalGain.toFixed(4)},apad,atrim=duration=${duration},asetpts=PTS-STARTPTS[original];` +
        `[1:a:0]aresample=${AUDIO_SAMPLE_RATE},volume=${ttsGain.toFixed(4)},apad,atrim=duration=${duration},asetpts=PTS-STARTPTS[tts];` +
        `[original][tts]amix=inputs=2:duration=longest:dropout_transition=0:normalize=0,alimiter=limit=0.98:level=disabled[mix]`;

      await this.runFfmpeg(
        active,
        [
          "-i",
          originalTemp,
          "-i",
          masterPath,
          "-filter_complex",
          filter,
          "-map",
          "[mix]",
          "-t",
          String(duration),
          "-c:a",
          "aac",
          "-b:a",
          "192k",
          "-ar",
          String(AUDIO_SAMPLE_RATE),
          "-ac",
          "2",
          "-movflags",
          "+faststart",
          mixedTemp,
        ],
        duration,
        "mixing",
        10,
        90,
      );
      this.assertNotCancelled(active);
      this.createTask(active.jobId, active.kind, {
        status: "running",
        phase: "validating",
        progressPercent: 95,
        ...volumes,
      });
      this.assertOutputExists(mixedTemp, "FFmpeg không tạo được bản phối audio.");
      const probe = await this.probe(mixedTemp, active);
      this.assertNotCancelled(active);
      const audioStream = probe.streams?.find(
        (stream) => stream.codec_type === "audio",
      );
      const outputDuration = Number(probe.format?.duration);
      const tolerance = 0.1;
      if (
        !audioStream ||
        audioStream.codec_name !== "aac" ||
        Number(audioStream.sample_rate) !== AUDIO_SAMPLE_RATE ||
        audioStream.channels !== 2 ||
        !Number.isFinite(outputDuration) ||
        Math.abs(outputDuration - duration) > tolerance
      ) {
        throw new Error(
          `Bản phối audio không hợp lệ hoặc sai thời lượng (video ${duration.toFixed(3)}s, audio ${Number.isFinite(outputDuration) ? outputDuration.toFixed(3) : "?"}s).`,
        );
      }

      const originalFinal = path.join(directory, "original-audio.mka");
      const silenceFinal = path.join(directory, "original-silence.wav");
      const extractionPath = originalIsPresent ? originalFinal : silenceFinal;
      this.publishFile(originalTemp, extractionPath, directory);
      active.temporaryFiles.delete(originalTemp);
      this.publishFile(mixedTemp, path.join(directory, "mixed-audio.m4a"), directory);
      active.temporaryFiles.delete(mixedTemp);
      const previousExport = this.manager.getJob(active.jobId)?.videoExport;
      if (previousExport?.sizeBytes) {
        this.manager.setMediaTask(active.jobId, "videoExport", {
          ...previousExport,
          status: "failed",
          error: "Bản phối âm thanh đã được thay đổi; hãy xuất lại MP4.",
        });
      }
      this.createTask(active.jobId, active.kind, {
        status: "completed",
        progressPercent: 100,
        ...volumes,
        durationSeconds: outputDuration,
        sizeBytes: fs.statSync(path.join(directory, "mixed-audio.m4a")).size,
      });
    } catch (error) {
      this.failOrCancel(active, error);
    } finally {
      await this.cleanup(active);
    }
  }

  private async runFinalMix(
    job: VideoDubbingJob,
    active: ActiveTask,
    settings: VideoDubbingMixerSettings,
    originalAudioVolumePercent?: number,
    includeSeparatedTracks = true,
  ): Promise<void> {
    try {
      await this.runFinalMixBody(
        job,
        active,
        settings,
        originalAudioVolumePercent,
        includeSeparatedTracks,
      );
    } catch (error) {
      this.failOrCancel(active, error);
      await this.cleanup(active);
    }
  }

  private async runFinalMixBody(
    job: VideoDubbingJob,
    active: ActiveTask,
    settings: VideoDubbingMixerSettings,
    originalAudioVolumePercent?: number,
    includeSeparatedTracks = true,
  ): Promise<void> {
    const directory = this.requireDirectory(active.jobId);
    const duration = job.metadata!.durationSeconds;
    const availableSources: Array<{
      track: VideoDubbingMixerTrack | "originalAudio";
      filePath: string;
      volumePercent: number;
    }> = [
      {
        track: "ttsMaster",
        filePath: this.requireMaster(active.jobId, job),
        volumePercent: settings.ttsMaster.volumePercent,
      },
    ];
    let originalAudioTemp: string | undefined;
    if (originalAudioVolumePercent !== undefined) {
      originalAudioTemp = path.join(
        directory,
        `.original-audio-${randomBytes(8).toString("hex")}.wav`,
      );
      active.temporaryFiles.add(originalAudioTemp);
      if (job.metadata?.audioCodec) {
        await this.runFfmpeg(
          active,
          [
            "-i",
            this.requireVideoPath(active.jobId),
            "-map",
            "0:a:0",
            "-vn",
            "-ar",
            String(AUDIO_SAMPLE_RATE),
            "-ac",
            "2",
            "-c:a",
            "pcm_s16le",
            originalAudioTemp,
          ],
          duration,
          "extracting",
          0,
          10,
        );
      } else {
        await this.runFfmpeg(
          active,
          [
            "-f",
            "lavfi",
            "-i",
            `anullsrc=channel_layout=stereo:sample_rate=${AUDIO_SAMPLE_RATE}`,
            "-t",
            String(duration),
            "-c:a",
            "pcm_s16le",
            originalAudioTemp,
          ],
          duration,
          "extracting",
          0,
          10,
        );
      }
      this.assertNotCancelled(active);
      this.assertOutputExists(originalAudioTemp, "Không thể trích xuất audio gốc.");
      availableSources.push({
        track: "originalAudio",
        filePath: originalAudioTemp,
        volumePercent: originalAudioVolumePercent,
      });
    }
    for (const track of includeSeparatedTracks
      ? (["vocals", "instrumental"] as const)
      : ([])
    ) {
      const filePath = path.join(directory, `${track}.wav`);
      const recordedSize =
        track === "vocals"
          ? job.separation?.vocalsSizeBytes
          : job.separation?.instrumentalSizeBytes;
      if (
        recordedSize &&
        recordedSize > 44 &&
        fs.existsSync(filePath) &&
        fs.statSync(filePath).size > 44
      ) {
        availableSources.push({
          track,
          filePath,
          volumePercent: settings[track].volumePercent,
        });
      }
    }
    const included = availableSources.filter(({ track }) => {
      if (track === "originalAudio") {
        return originalAudioVolumePercent !== undefined &&
          originalAudioVolumePercent > 0;
      }
      const setting = settings[track];
      return !setting.muted && setting.volumePercent > 0;
    });
    if (included.length === 0) {
      this.failOrCancel(
        active,
        new Error("Bật ít nhất một track có sẵn với âm lượng lớn hơn 0%."),
      );
      await this.cleanup(active);
      return;
    }

    const temporaryOutput = path.join(
      directory,
      `.mixed-audio-${randomBytes(8).toString("hex")}.wav`,
    );
    active.temporaryFiles.add(temporaryOutput);
    try {
      for (const source of included) {
        this.assertNotCancelled(active);
        const probe = await this.probe(source.filePath, active);
        const stream = probe.streams?.find(
          (item) => item.codec_type === "audio",
        );
        const sourceDuration = Number(probe.format?.duration);
        if (
          !stream ||
          !Number.isFinite(sourceDuration) ||
          sourceDuration <= 0 ||
          (source.track !== "ttsMaster" &&
            Math.abs(sourceDuration - duration) > 0.25)
        ) {
          throw new Error(
            `Track ${source.track} không hợp lệ hoặc không đồng bộ với thời lượng video.`,
          );
        }
      }
      const filters = included.map(({ track, volumePercent }, index) => {
        const gain = volumePercent / 100;
        return `[${index}:a:0]aresample=${AUDIO_SAMPLE_RATE},aformat=sample_fmts=fltp:channel_layouts=stereo,volume=${gain.toFixed(4)},apad,atrim=duration=${duration},asetpts=PTS-STARTPTS[${track}]`;
      });
      const inputs = included.map(({ track }) => `[${track}]`).join("");
      filters.push(
        `${inputs}amix=inputs=${included.length}:duration=longest:dropout_transition=0:normalize=0,alimiter=limit=0.98:level=disabled[mix]`,
      );
      const ffmpegArgs = included.flatMap(({ filePath }) => ["-i", filePath]);
      ffmpegArgs.push(
        "-filter_complex",
        filters.join(";"),
        "-map",
        "[mix]",
        "-t",
        String(duration),
        "-ar",
        String(AUDIO_SAMPLE_RATE),
        "-ac",
        "2",
        "-c:a",
        "pcm_s16le",
        temporaryOutput,
      );
      await this.runFfmpeg(
        active,
        ffmpegArgs,
        duration,
        "mixing",
        originalAudioVolumePercent === undefined ? 0 : 10,
        originalAudioVolumePercent === undefined ? 90 : 80,
      );
      this.assertNotCancelled(active);
      this.createTask(active.jobId, active.kind, {
        status: "running",
        phase: "validating",
        progressPercent: 95,
        renderedSettings: settings,
        includedTracks: included.map(({ track }) => track),
      });
      this.assertOutputExists(
        temporaryOutput,
        "FFmpeg không tạo được final mix WAV.",
      );
      const probe = await this.probe(temporaryOutput, active);
      this.assertNotCancelled(active);
      const audioStream = probe.streams?.find(
        (stream) => stream.codec_type === "audio",
      );
      const outputDuration = Number(probe.format?.duration);
      if (
        !audioStream ||
        audioStream.codec_name !== "pcm_s16le" ||
        Number(audioStream.sample_rate) !== AUDIO_SAMPLE_RATE ||
        audioStream.channels !== 2 ||
        !Number.isFinite(outputDuration) ||
        Math.abs(outputDuration - duration) > 0.1
      ) {
        throw new Error("Final mix không vượt qua xác minh stream hoặc thời lượng.");
      }
      const outputPath = path.join(directory, "mixed-audio.wav");
      this.publishFile(temporaryOutput, outputPath, directory);
      active.temporaryFiles.delete(temporaryOutput);
      this.createTask(active.jobId, active.kind, {
        status: "completed",
        phase: "validating",
        progressPercent: 100,
        durationSeconds: outputDuration,
        sizeBytes: fs.statSync(outputPath).size,
        renderedSettings: settings,
        includedTracks: included.map(({ track }) => track),
      });
    } catch (error) {
      this.failOrCancel(active, error);
    } finally {
      await this.cleanup(active);
    }
  }

  private async ensureTransparentScreenshotPng(
    image: Buffer,
  ): Promise<SubtitleImageBounds | null> {
    const metadata = await sharp(image).metadata();
    if (metadata.format !== "png" || !metadata.hasAlpha || metadata.channels !== 4) {
      throw new Error("Ảnh phụ đề không phải PNG RGBA trong suốt.");
    }
    const { data, info } = await sharp(image)
      .raw()
      .toBuffer({ resolveWithObject: true });
    if (info.channels !== 4 || info.width < 1 || info.height < 1) {
      throw new Error("Ảnh phụ đề không có kênh alpha RGBA.");
    }
    const cornerOffsets = [
      0,
      (info.width - 1) * 4,
      (info.height - 1) * info.width * 4,
      (info.height * info.width - 1) * 4,
    ];
    const cornerIsTransparent = cornerOffsets.every(
      (offset) => (data[offset + 3] ?? 255) === 0,
    );
    if (!cornerIsTransparent) {
      throw new Error("Chromium tạo PNG phụ đề có nền không trong suốt ở vùng ngoài phụ đề.");
    }

    let left = info.width;
    let top = info.height;
    let right = -1;
    let bottom = -1;
    for (let y = 0; y < info.height; y++) {
      for (let x = 0; x < info.width; x++) {
        if ((data[(y * info.width + x) * 4 + 3] ?? 0) === 0) continue;
        left = Math.min(left, x);
        top = Math.min(top, y);
        right = Math.max(right, x);
        bottom = Math.max(bottom, y);
      }
    }
    if (right < left || bottom < top) return null;
    return {
      left,
      top,
      width: right - left + 1,
      height: bottom - top + 1,
    };
  }

  private getX264ThreadCount(): number {
    const configured = Number(process.env.VIDEO_DUBBING_X264_THREADS);
    return Number.isInteger(configured) && configured >= 1 && configured <= MAX_X264_THREADS
      ? configured
      : DEFAULT_X264_THREADS;
  }

  private resolveChromiumExecutable(): string {
    const candidates = [
      process.env.CHROMIUM_PATH,
      process.env.CHROME_PATH,
      String.raw`C:\Program Files\Google\Chrome\Application\chrome.exe`,
      String.raw`C:\Program Files (x86)\Google\Chrome\Application\chrome.exe`,
      path.join(process.env.LOCALAPPDATA ?? "", "Google", "Chrome", "Application", "chrome.exe"),
      String.raw`C:\Program Files\Microsoft\Edge\Application\msedge.exe`,
      "/usr/bin/google-chrome",
      "/usr/bin/chromium",
      "/usr/bin/chromium-browser",
    ];
    return candidates.find((candidate): candidate is string =>
      Boolean(candidate && fs.existsSync(candidate)),
    ) ?? "";
  }

  private async createTransparentSubtitleOverlay(
    active: ActiveTask,
    job: VideoDubbingJob,
    settings: VideoDubbingOverlaySettings,
    directory: string,
  ): Promise<SubtitlePngOverlay[]> {
    const renderItems = [
      ...(settings.subtitlesEnabled ? settings.subtitles.map((cue) => ({
        cue,
        style: {
          fontSize: settings.subtitleFontSize,
          fontFamily: settings.subtitleFontFamily,
          color: settings.subtitleColor,
          bold: settings.subtitleBold,
          italic: settings.subtitleItalic,
          underline: settings.subtitleUnderline ?? false,
          textCase: settings.subtitleTextCase ?? "none",
          outlineEnabled: settings.subtitleOutlineEnabled ?? false,
          outlineColor: settings.subtitleOutlineColor ?? "#000000",
          outlineWidthPx: settings.subtitleOutlineWidthPx ?? 2,
          characterSpacingPx: settings.subtitleCharacterSpacingPx ?? 0,
          lineSpacingPx: settings.subtitleLineSpacingPx ?? 0,
          position: settings.subtitlePosition,
          xPercent: undefined,
          yPercent: undefined,
          backgroundMode: settings.subtitleBackgroundMode ?? "color" as const,
          backgroundColor: settings.subtitleBackgroundColor,
          backgroundTransparent: settings.subtitleBackgroundTransparent ?? false,
          backgroundImage: settings.subtitleBackgroundImage,
          paddingPx: settings.subtitlePaddingPx,
          marginPx: settings.subtitleMarginPx,
        },
      })) : []),
      ...(settings.textOverlays ?? []).map((cue) => ({
        cue,
        style: {
          fontSize: cue.fontSize,
          fontFamily: cue.fontFamily,
          color: cue.color,
          bold: cue.bold,
          italic: cue.italic,
          underline: cue.underline ?? false,
          textCase: cue.textCase ?? "none",
          outlineEnabled: cue.outlineEnabled ?? false,
          outlineColor: cue.outlineColor ?? "#000000",
          outlineWidthPx: cue.outlineWidthPx ?? 2,
          characterSpacingPx: cue.characterSpacingPx ?? 0,
          lineSpacingPx: cue.lineSpacingPx ?? 0,
          position: cue.position,
          xPercent: cue.xPercent,
          yPercent: cue.yPercent,
          backgroundMode: cue.backgroundTransparent ? "none" as const : "color" as const,
          backgroundColor: cue.backgroundColor,
          backgroundTransparent: cue.backgroundTransparent,
          backgroundImage: null,
          paddingPx: cue.paddingPx,
          marginPx: 24,
        },
      })),
    ];
    if (renderItems.length === 0) return [];
    const chromium = this.resolveChromiumExecutable();
    if (!chromium) {
      throw new Error("Không tìm thấy Chromium hoặc Google Chrome để render phụ đề overlay.");
    }

    const width = Number(job.metadata?.width ?? 0);
    const height = Number(job.metadata?.height ?? 0);
    if (width <= 0 || height <= 0) {
      throw new Error("Không xác định được kích thước video để render phụ đề.");
    }
    const assetUrlFor = (imageName: string) => {
      const assetPath = path.join(directory, "..", "public", "assets", "subtitle", imageName);
      const fallbackPath = path.resolve(process.cwd(), "public", "assets", "subtitle", imageName);
      const resolvedPath = fs.existsSync(assetPath) ? assetPath : fallbackPath;
      if (!fs.existsSync(resolvedPath)) return `/assets/subtitle/${encodeURIComponent(imageName)}`;
      return `data:image/png;base64,${fs.readFileSync(resolvedPath).toString("base64")}`;
    };
    const imageCache = new Map<string, CachedSubtitleImage | null>();
    const overlays: SubtitlePngOverlay[] = [];
    const browser = new PersistentChromiumPage(
      chromium,
      width,
      height,
    );
    const renderStartedAt = Date.now();
    try {
      await browser.start();
      for (let index = 0; index < renderItems.length; index++) {
        this.assertNotCancelled(active);
        const { cue, style } = renderItems[index];
        const horizontal = style.position.endsWith("-left") ? "flex-start" : style.position.endsWith("-right") ? "flex-end" : "center";
        const vertical = style.position.startsWith("top-") ? "flex-start" : style.position.startsWith("bottom-") ? "flex-end" : "center";
        const cacheKey = [
          cue.text, style.fontSize, style.fontFamily, style.color,
          style.backgroundMode, style.backgroundColor, style.backgroundImage,
          style.backgroundTransparent, style.position, style.xPercent, style.yPercent,
          style.paddingPx, style.marginPx,
          style.bold, style.italic, style.underline, style.textCase,
          style.outlineEnabled, style.outlineColor, style.outlineWidthPx,
          style.characterSpacingPx, style.lineSpacingPx,
        ].join("|");
        if (!imageCache.has(cacheKey)) {
          const subtitle = renderToStaticMarkup(React.createElement(SubtitleOverlayRenderer, {
            text: cue.text,
            scale: 1,
            fontSize: style.fontSize,
            fontFamily: style.fontFamily,
            fontWeight: style.bold,
            fontStyle: style.italic,
            underline: style.underline,
            textCase: style.textCase,
            outlineEnabled: style.outlineEnabled,
            outlineColor: style.outlineColor,
            outlineWidthPx: style.outlineWidthPx,
            characterSpacingPx: style.characterSpacingPx,
            lineSpacingPx: style.lineSpacingPx,
            color: style.color,
            backgroundMode: style.backgroundMode,
            backgroundColor: style.backgroundColor,
            backgroundTransparent: style.backgroundTransparent,
            backgroundImage: style.backgroundImage,
            paddingPx: style.paddingPx,
            position: style.position,
            assetUrlFor,
          }));
          const hasCustomPosition = Number.isFinite(style.xPercent) && Number.isFinite(style.yPercent);
          const content = hasCustomPosition
            ? `<div style="position:absolute;left:${style.xPercent}%;top:${style.yPercent}%;transform:translate(-50%,-50%);box-sizing:border-box">${subtitle}</div>`
            : `<div style="position:absolute;inset:0;display:flex;align-items:${vertical};justify-content:${horizontal};padding:${style.marginPx}px;box-sizing:border-box">${subtitle}</div>`;
          // Keep the screenshot target full-frame. Capturing a custom-positioned
          // child directly would crop it to its own box and lose its video x/y.
          const markup = `<div id="video-subtitle-stage" style="position:absolute;left:0;top:0;width:${width}px;height:${height}px;overflow:hidden">${content}</div>`;
          const html = `<!doctype html><html><head><meta charset="utf-8"><style>${createSubtitleFontFaceCss(style.fontFamily)}html,body{margin:0;width:${width}px;height:${height}px;overflow:hidden;background:transparent}body{font-family:${quoteCssFontFamily(style.fontFamily)}}*{box-sizing:border-box}</style></head><body>${markup}</body></html>`;
          const screenshot = await browser.renderHtml(html);
          const bounds = await this.ensureTransparentScreenshotPng(screenshot);
          if (!bounds) {
            imageCache.set(cacheKey, null);
          } else {
            const croppedPng = await sharp(screenshot, { limitInputPixels: false })
              .extract(bounds)
              .png()
              .toBuffer();
            const image = await sharp(croppedPng)
              .ensureAlpha()
              .raw()
              .toBuffer();
            imageCache.set(cacheKey, { image, ...bounds });
          }
        }
        const image = imageCache.get(cacheKey);
        if (image) {
          overlays.push({
            ...image,
            startTime: cue.startTime,
            endTime: cue.endTime,
          });
        }
        if (index % 10 === 0 || index === renderItems.length - 1) {
          this.updateVideoExportProgress(
            active,
            "rendering",
            5 + ((index + 1) / renderItems.length) * 5,
            `Đang tạo PNG overlay ${index + 1}/${renderItems.length}`,
          );
        }
      }
      const renderSeconds = ((Date.now() - renderStartedAt) / 1000).toFixed(1);
      const renderedImageCount = Array.from(imageCache.values()).filter(
        (image) => image !== null,
      ).length;
      console.info(`[VideoDubbing] Chromium render: ${renderItems.length} cue/text, ${renderedImageCount} ảnh RGBA crop trong RAM, ${renderSeconds}s`);
      return overlays;
    } finally {
      await browser.close();
    }
  }

  private createSubtitleOverlayStream(
    overlays: SubtitlePngOverlay[],
    job: VideoDubbingJob,
    duration: number,
  ): SubtitleOverlayStream {
    const frameRate = job.metadata!.frameRate && job.metadata!.frameRate > 0
      ? job.metadata!.frameRate
      : 30;
    const videoHeight = job.metadata!.height;
    const firstRow = Math.min(...overlays.map((overlay) => overlay.top));
    const lastRow = Math.max(...overlays.map((overlay) => overlay.top + overlay.height));
    const top = Math.max(0, Math.floor(firstRow / 2) * 2);
    const bottom = Math.min(videoHeight, Math.ceil(lastRow / 2) * 2);
    if (bottom <= top) throw new Error("Không xác định được vùng overlay phụ đề hợp lệ.");
    return {
      overlays,
      width: job.metadata!.width,
      top,
      height: bottom - top,
      frameRate,
      frameCount: Math.max(1, Math.round(duration * frameRate)),
    };
  }

  private async runExport(
    job: VideoDubbingJob,
    active: ActiveTask,
    mixedAudioPath: string,
    settings: VideoDubbingOverlaySettings,
  ): Promise<void> {
    const directory = this.requireDirectory(active.jobId);
    const tempOutput = path.join(directory, `.output-${randomBytes(8).toString("hex")}.mp4`);
    active.temporaryFiles.add(tempOutput);
    const duration = job.metadata!.durationSeconds;
    const finalMixInput = path.extname(mixedAudioPath).toLowerCase() === ".wav";
    const renderVideo = settings.logoEnabled || settings.subtitlesEnabled || Boolean(settings.textOverlays?.length);
    const encodeForQuality = settings.exportQuality === "low" || settings.exportQuality === "medium";
    const encodeVideo = renderVideo || encodeForQuality;
    const logoPath = settings.logoEnabled ? this.manager.getOverlayLogoPath(active.jobId) : null;
    const audioCodecArgs = finalMixInput
      ? ["-c:a", "aac", "-b:a", "192k", "-ar", String(AUDIO_SAMPLE_RATE), "-ac", "2"]
      : ["-c:a", "copy"];

    try {
      if (settings.logoEnabled && !logoPath) {
        throw new Error("Không tìm thấy logo trong thư mục job.");
      }

      let logoInputPath = logoPath;
      if (logoPath) {
        const logoWidth = Math.max(1, Math.round(job.metadata!.width * settings.logoWidthPercent / 100));
        const logoMaxHeight = Math.max(1, Math.round(job.metadata!.height * 0.4));
        logoInputPath = path.join(
          directory,
          `.scaled-overlay-logo-${randomBytes(8).toString("hex")}.png`,
        );
        active.temporaryFiles.add(logoInputPath);
        await sharp(logoPath)
          .resize(logoWidth, logoMaxHeight, { fit: "inside" })
          .png()
          .toFile(logoInputPath);
        this.assertNotCancelled(active);
      }

      let subtitleOverlays: SubtitlePngOverlay[] = [];
      if (settings.subtitlesEnabled) {
        this.updateVideoExportProgress(
          active,
          "rendering",
          5,
          "Đang chuẩn bị Chromium render phụ đề trong suốt",
        );
        subtitleOverlays = await this.createTransparentSubtitleOverlay(active, job, settings, directory);
        this.assertNotCancelled(active);
      }
      const subtitleOverlayStream = subtitleOverlays.length > 0
        ? this.createSubtitleOverlayStream(subtitleOverlays, job, duration)
        : null;

      const sourceProbe = encodeVideo
        ? await this.probe(this.requireVideoPath(active.jobId), active)
        : null;
      const sourceVideoStream = sourceProbe?.streams?.find((stream) => stream.codec_type === "video");
      const sourceCodec = sourceVideoStream?.codec_name || job.metadata!.videoCodec;
      const sourceBitrate = Number(sourceVideoStream?.bit_rate) ||
        Math.max(250_000, Math.round((job.sizeBytes * 8 / duration) * 0.94));
      const bitrateMultiplier = settings.exportQuality === "low" ? 0.7 : settings.exportQuality === "medium" ? 0.9 : 1;
      const targetVideoBitrate = Math.max(250_000, Math.round(sourceBitrate * bitrateMultiplier / 10_000) * 10_000);
      const useHevc = sourceCodec === "hevc" || sourceCodec === "h265";
      const preserveCurrentHighQuality = settings.exportQuality === "high";
      const useQsv = encodeVideo &&
        job.metadata!.width % 2 === 0 &&
        job.metadata!.height % 2 === 0;
      const qsvDeviceArgs = useQsv
        ? ["-init_hw_device", "qsv:hw,child_device_type=d3d11va"]
        : [];
      const ffmpegArgs = ["-y", ...qsvDeviceArgs, "-i", this.requireVideoPath(active.jobId), "-i", mixedAudioPath];
      let logoInputIndex: number | null = null;
      if (logoInputPath) {
        logoInputIndex = 2;
        ffmpegArgs.push("-loop", "1", "-i", logoInputPath);
      }
      let subtitleInputIndex: number | null = null;
      if (subtitleOverlayStream) {
        subtitleInputIndex = 2 + (logoInputPath ? 1 : 0);
        ffmpegArgs.push(
          "-f", "rawvideo",
          "-pixel_format", "rgba",
          "-video_size", `${job.metadata!.width}x${subtitleOverlayStream.height}`,
          "-framerate", String(subtitleOverlayStream.frameRate),
          "-t", String(duration),
          "-i", "pipe:0",
        );
      }

      const filters: string[] = [];
      let videoLabel = "0:v:0";
      if (logoPath) {
        const { x, y } = this.overlayCoordinates(settings.logoPosition, settings.logoPaddingPx);
        filters.push(`[${logoInputIndex}:v:0]format=rgba[scaledlogo]`);
        filters.push(`[${videoLabel}][scaledlogo]overlay=x=${x}:y=${y}:format=auto:eof_action=repeat:shortest=0[v_logo]`);
        videoLabel = "v_logo";
      }
      // Preview draws subtitles and extra text after the logo. Keep the same
      // layer order here so text remains visible when it crosses the logo.
      if (subtitleOverlayStream && subtitleInputIndex !== null) {
        filters.push(`[${subtitleInputIndex}:v:0]format=rgba[subtitle_stream]`);
        filters.push(
          `[${videoLabel}][subtitle_stream]overlay=x=0:y=${subtitleOverlayStream.top}:format=auto:shortest=1:eof_action=pass[v_subtitle]`,
        );
        videoLabel = "v_subtitle";
      }
      if (filters.length > 0) {
        // Passing a large filter graph as a spawn argument can exceed the
        // Windows command-line length limit for exports with many subtitles.
        // Keep the graph in a short-lived script file instead.
        const filterScriptPath = path.join(
          directory,
          `.ffmpeg-filter-${randomBytes(8).toString("hex")}.txt`,
        );
        active.temporaryFiles.add(filterScriptPath);
        await fs.promises.writeFile(filterScriptPath, filters.join(";"), "utf8");
        ffmpegArgs.push("-filter_complex_script", filterScriptPath);
        ffmpegArgs.push("-map", `[${videoLabel}]`);
      } else {
        ffmpegArgs.push("-map", "0:v:0");
      }
      ffmpegArgs.push("-map", "1:a:0", "-map_metadata", "0", "-map_chapters", "0");

      const qsvEncoderArgs = preserveCurrentHighQuality
        ? [
            "-c:v", "h264_qsv", "-preset", DEFAULT_QSV_PRESET,
            "-global_quality", String(DEFAULT_QSV_GLOBAL_QUALITY), "-pix_fmt", "yuv420p",
          ]
        : [
            "-c:v", useHevc ? "hevc_qsv" : "h264_qsv", "-preset", DEFAULT_QSV_PRESET,
            "-b:v", String(targetVideoBitrate), "-maxrate", String(Math.round(targetVideoBitrate * 1.5)),
            "-bufsize", String(targetVideoBitrate * 2), "-pix_fmt", "yuv420p",
          ];
      const softwareEncoderArgs = preserveCurrentHighQuality
        ? [
            "-c:v", "libx264", "-threads:v", String(this.getX264ThreadCount()),
            "-preset", "medium", "-crf", "18", "-pix_fmt",
            job.metadata!.width % 2 === 0 && job.metadata!.height % 2 === 0 ? "yuv420p" : "yuv444p",
          ]
        : [
            "-c:v", useHevc ? "libx265" : "libx264", "-threads:v", String(this.getX264ThreadCount()),
            "-preset", "medium", "-b:v", String(targetVideoBitrate),
            "-maxrate", String(Math.round(targetVideoBitrate * 1.5)), "-bufsize", String(targetVideoBitrate * 2),
            "-pix_fmt", job.metadata!.width % 2 === 0 && job.metadata!.height % 2 === 0 ? "yuv420p" : "yuv444p",
          ];
      ffmpegArgs.push(
        ...(encodeVideo
          ? useQsv ? qsvEncoderArgs : softwareEncoderArgs
          : ["-c:v", "copy"]),
        ...audioCodecArgs,
        "-t",
        String(duration),
        "-movflags",
        "+faststart",
        tempOutput,
      );

      this.updateVideoExportProgress(
        active,
        "rendering",
        VIDEO_EXPORT_PREPARATION_PROGRESS,
        settings.subtitlesEnabled
          ? "Đang composite overlay phụ đề và logo lên video gốc"
          : logoPath
            ? "Đang composite logo lên video gốc"
            : encodeForQuality
              ? `Đang mã hóa video theo mức ${settings.exportQuality}`
            : "Đang ghép audio final mix vào video nguồn",
      );
      try {
        await this.runFfmpeg(
          active,
          ffmpegArgs,
          duration,
        encodeVideo ? "rendering" : "remuxing",
          VIDEO_EXPORT_PREPARATION_PROGRESS,
          VIDEO_EXPORT_FFMPEG_PROGRESS_SPAN,
          subtitleOverlayStream ?? undefined,
        );
      } catch (error) {
        if (!useQsv || !this.isQsvEncoderError(error)) throw error;
        this.assertNotCancelled(active);
        console.warn(
          "[VideoDubbing] Intel Quick Sync không khởi chạy được; chuyển sang encoder CPU tương ứng:",
          error,
        );
        await fs.promises.rm(tempOutput, { force: true });
        const deviceArgsIndex = ffmpegArgs.indexOf("-init_hw_device");
        const encoderArgsIndex = ffmpegArgs.indexOf("-c:v");
        const softwareArgs = [
          ...ffmpegArgs.slice(0, deviceArgsIndex),
          ...ffmpegArgs.slice(deviceArgsIndex + qsvDeviceArgs.length, encoderArgsIndex),
          ...softwareEncoderArgs,
          ...ffmpegArgs.slice(encoderArgsIndex + qsvEncoderArgs.length),
        ];
        await this.runFfmpeg(
          active,
          softwareArgs,
          duration,
          "rendering",
          VIDEO_EXPORT_PREPARATION_PROGRESS,
          VIDEO_EXPORT_FFMPEG_PROGRESS_SPAN,
          subtitleOverlayStream ?? undefined,
        );
      }
      this.assertNotCancelled(active);
      const validatingTask = this.getTask(active.jobId, active.kind) as VideoDubbingMediaTask | undefined;
      this.createTask(active.jobId, active.kind, {
        ...(validatingTask || {}),
        status: "running",
        phase: "validating",
        progressPercent: 95,
        detail: "Đang xác minh độ phân giải, FPS, audio và thời lượng đầu ra",
      });
      this.assertOutputExists(tempOutput, "FFmpeg không tạo được MP4 đầu ra.");
      const probe = await this.probe(tempOutput, active);
      this.assertNotCancelled(active);
      const videoStream = probe.streams?.find((stream) => stream.codec_type === "video");
      const audioStream = probe.streams?.find((stream) => stream.codec_type === "audio");
      const outputDuration = Number(probe.format?.duration);
      const expectedVideo = job.metadata!;
      const durationTolerance = Math.max(0.1, expectedVideo.frameRate ? 2 / expectedVideo.frameRate : 0);
      if (
        !videoStream ||
        !audioStream ||
        videoStream.width !== expectedVideo.width ||
        videoStream.height !== expectedVideo.height ||
        !Number.isFinite(outputDuration) ||
        Math.abs(outputDuration - duration) > durationTolerance
      ) {
        throw new Error("MP4 đầu ra không vượt qua xác minh stream video/audio, độ phân giải hoặc thời lượng.");
      }
      const outputPath = this.getAvailableExportPath(job, directory);
      this.publishFile(tempOutput, outputPath, directory);
      this.manager.setExportedVideoFileName(job.id, path.basename(outputPath));
      active.temporaryFiles.delete(tempOutput);
      const completedTask = this.getTask(active.jobId, active.kind) as VideoDubbingMediaTask | undefined;
      const completedAtMs = Date.now();
      const elapsedSeconds = completedTask?.startedAtMs
        ? Math.max(0, (completedAtMs - completedTask.startedAtMs) / 1000)
        : 0;
      this.createTask(active.jobId, active.kind, {
        ...(completedTask || {}),
        status: "completed",
        progressPercent: 100,
        durationSeconds: outputDuration,
        sizeBytes: fs.statSync(outputPath).size,
        detail: "Xuất MP4 hoàn tất và đã kiểm chứng các stream đầu ra",
        completedAtMs,
        elapsedSeconds,
      });
    } catch (error) {
      this.failOrCancel(active, error);
    } finally {
      await this.cleanup(active);
    }
  }

  private async writeSubtitleOverlayFrames(
    stdin: Writable,
    active: ActiveTask,
    stream: SubtitleOverlayStream,
    frameWidth: number,
  ): Promise<void> {
    const frameBytes = frameWidth * stream.height * 4;
    const emptyFrame = Buffer.alloc(frameBytes);
    const rowOverlays = [...stream.overlays].sort((a, b) => a.startTime - b.startTime);
    for (let frameIndex = 0; frameIndex < stream.frameCount; frameIndex++) {
      this.assertNotCancelled(active);
      const time = frameIndex / stream.frameRate;
      const activeOverlays = rowOverlays.filter((overlay) =>
        overlay.startTime <= time && time < overlay.endTime,
      );
      let frame = emptyFrame;
      if (activeOverlays.length === 1) {
        const overlay = activeOverlays[0];
        frame = Buffer.alloc(frameBytes);
        const rowBytes = overlay.width * 4;
        for (let row = 0; row < overlay.height; row++) {
          const sourceStart = row * rowBytes;
          const targetStart = ((overlay.top - stream.top + row) * frameWidth + overlay.left) * 4;
          overlay.image.copy(frame, targetStart, sourceStart, sourceStart + rowBytes);
        }
      } else if (activeOverlays.length > 1) {
        frame = Buffer.alloc(frameBytes);
        for (const overlay of activeOverlays) {
          const rowBytes = overlay.width * 4;
          const targetY = overlay.top - stream.top;
          for (let row = 0; row < overlay.height; row++) {
            let sourceOffset = row * rowBytes;
            let targetOffset = ((targetY + row) * frameWidth + overlay.left) * 4;
            for (let column = 0; column < overlay.width; column++) {
              const sourceAlpha = overlay.image[sourceOffset + 3] / 255;
              if (sourceAlpha > 0) {
                const targetAlpha = frame[targetOffset + 3] / 255;
                const outputAlpha = sourceAlpha + targetAlpha * (1 - sourceAlpha);
                if (targetAlpha === 0) {
                  frame[targetOffset] = overlay.image[sourceOffset];
                  frame[targetOffset + 1] = overlay.image[sourceOffset + 1];
                  frame[targetOffset + 2] = overlay.image[sourceOffset + 2];
                } else if (outputAlpha > 0) {
                  for (let channel = 0; channel < 3; channel++) {
                    frame[targetOffset + channel] = Math.round(
                      (overlay.image[sourceOffset + channel] * sourceAlpha +
                        frame[targetOffset + channel] * targetAlpha * (1 - sourceAlpha)) /
                        outputAlpha,
                    );
                  }
                }
                frame[targetOffset + 3] = Math.round(outputAlpha * 255);
              }
              sourceOffset += 4;
              targetOffset += 4;
            }
          }
        }
      }
      if (!stdin.write(frame)) await once(stdin, "drain");
    }
    stdin.end();
  }

  private async runFfmpeg(
    active: ActiveTask,
    mediaArgs: string[],
    durationSeconds: number,
    phase: "extracting" | "mixing" | "remuxing" | "rendering",
    progressStart: number,
    progressSpan: number,
    subtitleOverlayStream?: SubtitleOverlayStream,
  ): Promise<void> {
    this.assertNotCancelled(active);
    this.updateTaskProgress(active, phase);

    await new Promise<void>((resolve, reject) => {
      const child = spawn(
        this.options.ffmpegPath,
        [
          "-nostdin",
          "-hide_banner",
          "-loglevel",
          "error",
          "-y",
          ...mediaArgs.slice(0, -1),
          "-progress",
          "pipe:1",
          "-nostats",
          mediaArgs[mediaArgs.length - 1],
        ],
        {
          shell: false,
          windowsHide: true,
          stdio: [subtitleOverlayStream ? "pipe" : "ignore", "pipe", "pipe"],
        },
      );
      active.child = child;
      let stderr = "";
      let progressBuffer = "";
      let progressValues: Record<string, string> = {};
      let timedOut = false;
      let outputTooLarge = false;
      let overlayInputError: Error | null = null;
      const timeout = setTimeout(() => {
        timedOut = true;
        child.kill();
      }, MAX_MEDIA_TASK_MS);

      child.stdout!.setEncoding("utf8");
      child.stdout!.on("data", (chunk: string) => {
        progressBuffer += chunk;
        let lineEnd = progressBuffer.indexOf("\n");
        while (lineEnd >= 0) {
          const line = progressBuffer.slice(0, lineEnd).trim();
          progressBuffer = progressBuffer.slice(lineEnd + 1);
          const separator = line.indexOf("=");
          if (separator > 0) {
            progressValues[line.slice(0, separator)] = line.slice(separator + 1);
          }
          if (line.startsWith("progress=")) {
            const rawTime = progressValues.out_time_us ?? progressValues.out_time_ms;
            if (rawTime && /^\d+$/.test(rawTime)) {
              const seconds = Number(rawTime) / 1_000_000;
              const phaseProgress = Math.max(
                0,
                Math.min(1, seconds / durationSeconds),
              );
              const progressPercent = Math.min(
                94,
                Math.round((progressStart + progressSpan * phaseProgress) * 10) / 10,
              );
              const detail = active.kind === "videoExport"
                ? `${phase === "rendering" ? "Đang composite và mã hóa" : "Đang xử lý video"}: ${this.formatProgressTime(seconds)} / ${this.formatProgressTime(durationSeconds)}${progressValues.speed ? ` · ${progressValues.speed}` : ""}${progressValues.fps ? ` · ${progressValues.fps} FPS` : ""}`
                : undefined;
              this.updateTaskProgress(active, phase, progressPercent, detail);
            }
            progressValues = {};
          }
          lineEnd = progressBuffer.indexOf("\n");
        }
      });
      child.stderr!.setEncoding("utf8");
      child.stderr!.on("data", (chunk: string) => {
        stderr += chunk;
        if (Buffer.byteLength(stderr) > PROCESS_OUTPUT_LIMIT) {
          stderr = stderr.slice(-PROCESS_OUTPUT_LIMIT);
          outputTooLarge = true;
          child.kill();
        }
      });
      if (subtitleOverlayStream && child.stdin) {
        child.stdin.on("error", (error) => {
          overlayInputError = error;
        });
        void this.writeSubtitleOverlayFrames(
          child.stdin,
          active,
          subtitleOverlayStream,
          subtitleOverlayStream.width,
        ).catch((error: unknown) => {
          overlayInputError = error instanceof Error ? error : new Error(String(error));
        });
      }
      child.once("error", (error) => {
        clearTimeout(timeout);
        if (active.child === child) active.child = undefined;
        reject(new Error(`Không thể chạy FFmpeg: ${error.message}`));
      });
      child.once("close", (code, signal) => {
        clearTimeout(timeout);
        if (active.child === child) active.child = undefined;
        if (active.cancelled) {
          reject(new Error("Đã hủy tác vụ media."));
        } else if (timedOut) {
          reject(new Error("FFmpeg vượt quá thời gian chờ hai giờ."));
        } else if (outputTooLarge) {
          reject(new Error("FFmpeg tạo đầu ra lỗi vượt giới hạn."));
        } else if (code !== 0) {
          reject(
            new Error(
              stderr.trim() ||
                `FFmpeg thất bại (mã ${code ?? signal ?? "không xác định"}).`,
            ),
          );
        } else if (overlayInputError) {
          reject(new Error(`Không thể tạo raw subtitle overlay stream: ${overlayInputError.message}`));
        } else {
          resolve();
        }
      });
    });
  }

  private updateTaskProgress(
    active: ActiveTask,
    phase: "extracting" | "mixing" | "remuxing" | "rendering",
    progressPercent?: number,
    detail?: string,
  ): void {
    const job = this.manager.getJob(active.jobId);
    if (active.kind === "finalMix") {
      const state = job?.finalMix;
      if (!state || state.status !== "running") return;
      this.manager.setFinalMixTask(active.jobId, {
        ...state,
        phase: "rendering",
        progressPercent:
          progressPercent === undefined
            ? state.progressPercent
            : Math.max(state.progressPercent || 0, progressPercent),
      });
      return;
    }
    const state =
      active.kind === "audioMix" ? job?.audioMix : job?.videoExport;
    if (!state || state.status !== "running") return;
    this.manager.setMediaTask(active.jobId, active.kind, {
      ...state,
      phase,
      ...(detail ? { detail } : {}),
      progressPercent:
        progressPercent === undefined
          ? state.progressPercent
          : Math.max(state.progressPercent || 0, progressPercent),
      elapsedSeconds: state.startedAtMs
        ? Math.max(0, (Date.now() - state.startedAtMs) / 1000)
        : state.elapsedSeconds,
    });
  }

  private formatProgressTime(seconds: number): string {
    const safeSeconds = Number.isFinite(seconds) ? Math.max(0, Math.floor(seconds)) : 0;
    const hours = Math.floor(safeSeconds / 3600);
    const minutes = Math.floor((safeSeconds % 3600) / 60);
    const remainder = safeSeconds % 60;
    return [hours, minutes, remainder]
      .map((part) => String(part).padStart(2, "0"))
      .join(":");
  }

  private isQsvEncoderError(error: unknown): boolean {
    const message = error instanceof Error ? error.message : String(error);
    return /h264_qsv|quick sync|\bqsv\b|\bmfx\b|d3d11|hardware device/i.test(message);
  }

  private async probe(
    filePath: string,
    active: ActiveTask,
  ): Promise<MediaProbe> {
    const result = await new Promise<string>((resolve, reject) => {
      const child = spawn(
        this.options.ffprobePath,
        [
          "-v",
          "error",
          "-protocol_whitelist",
          "file,crypto,data",
          "-show_data_hash", "sha256",
          "-show_entries",
          "format=duration,size:stream=codec_type,codec_name,width,height,duration,sample_rate,channels,channel_layout,r_frame_rate,avg_frame_rate,pix_fmt,profile,level,time_base,extradata_hash,bit_rate",
          "-of",
          "json",
          filePath,
        ],
        {
          shell: false,
          windowsHide: true,
          stdio: ["ignore", "pipe", "pipe"],
        },
      );
      let stdout = "";
      let stderr = "";
      let timedOut = false;
      let outputTooLarge = false;
      active.child = child;
      const timeout = setTimeout(() => {
        timedOut = true;
        child.kill();
      }, 30_000);
      child.stdout.on("data", (chunk: Buffer) => {
        stdout += chunk.toString("utf8");
        if (Buffer.byteLength(stdout) > PROCESS_OUTPUT_LIMIT) {
          outputTooLarge = true;
          child.kill();
        }
      });
      child.stderr.on("data", (chunk: Buffer) => {
        stderr = (stderr + chunk.toString("utf8")).slice(-8192);
      });
      child.once("error", (error) => {
        clearTimeout(timeout);
        if (active.child === child) active.child = undefined;
        reject(new Error(`Không thể chạy FFprobe: ${error.message}`));
      });
      child.once("close", (code) => {
        clearTimeout(timeout);
        if (active.child === child) active.child = undefined;
        if (active.cancelled) {
          reject(new Error("Đã hủy xác minh media."));
        } else if (timedOut) {
          reject(new Error("FFprobe quá thời gian chờ 30 giây."));
        } else if (outputTooLarge) {
          reject(new Error("FFprobe trả metadata vượt giới hạn."));
        } else if (code !== 0) {
          reject(
            new Error(stderr.trim() || `FFprobe thất bại (mã ${code}).`),
          );
          return;
        }
        resolve(stdout);
      });
    });
    try {
      return JSON.parse(result) as MediaProbe;
    } catch {
      throw new Error("FFprobe trả metadata không hợp lệ.");
    }
  }

  private getAvailableExportPath(job: VideoDubbingJob, directory: string): string {
    const sourceName = path.parse(job.fileName).name
      .replace(/[<>:"/\\|?*\u0000-\u001f]/g, "_")
      .replace(/[. ]+$/g, "") || "video";
    const baseName = `${sourceName}_merged`;
    let candidate = path.join(directory, `${baseName}.mp4`);
    let suffix = 1;
    while (fs.existsSync(candidate)) {
      candidate = path.join(directory, `${baseName} (${suffix}).mp4`);
      suffix++;
    }
    return candidate;
  }

  private requireDirectory(jobId: string): string {
    const directory = this.manager.getJobDirectory(jobId);
    if (!directory) throw new Error("Không tìm thấy thư mục job Video Dubbing.");
    return path.resolve(directory);
  }

  private requireVideoPath(jobId: string): string {
    const directory = this.requireDirectory(jobId);
    const filePath = path.resolve(directory, "source.video");
    if (!filePath.startsWith(`${directory}${path.sep}`) || !fs.existsSync(filePath)) {
      throw new Error("Không tìm thấy video nguồn trong thư mục job.");
    }
    return filePath;
  }

  private assertOutputExists(filePath: string, errorMessage: string): void {
    if (!fs.existsSync(filePath) || fs.statSync(filePath).size <= 0) {
      throw new Error(errorMessage);
    }
  }

  private publishFile(source: string, target: string, directory: string): void {
    const resolvedSource = path.resolve(source);
    const resolvedTarget = path.resolve(target);
    const resolvedDirectory = path.resolve(directory);
    if (
      !resolvedSource.startsWith(`${resolvedDirectory}${path.sep}`) ||
      !resolvedTarget.startsWith(`${resolvedDirectory}${path.sep}`)
    ) {
      throw new Error("Đường dẫn media vượt ra ngoài thư mục job.");
    }
    const backup = `${resolvedTarget}.${randomBytes(6).toString("hex")}.bak`;
    const existed = fs.existsSync(resolvedTarget);
    if (existed) fs.renameSync(resolvedTarget, backup);
    try {
      fs.renameSync(resolvedSource, resolvedTarget);
      if (existed) fs.rmSync(backup, { force: true });
    } catch (error) {
      if (existed && fs.existsSync(backup)) fs.renameSync(backup, resolvedTarget);
      throw error;
    }
  }

  private assertNotCancelled(active: ActiveTask): void {
    if (active.cancelled) throw new Error("Đã hủy tác vụ media.");
  }

  private failOrCancel(active: ActiveTask, error: unknown): void {
    const previous = this.getTask(active.jobId, active.kind);
    if (!previous) return;
    const completedAtMs = Date.now();
    const elapsedSeconds =
      "startedAtMs" in previous && previous.startedAtMs
        ? Math.max(0, (completedAtMs - previous.startedAtMs) / 1000)
        : 0;
    if (active.cancelled) {
      this.createTask(active.jobId, active.kind, {
        ...previous,
        status: "cancelled",
        error: undefined,
        detail: "Tác vụ export đã được hủy",
        completedAtMs,
        elapsedSeconds,
      });
      return;
    }
    const message = error instanceof Error ? error.message : String(error);
    this.createTask(active.jobId, active.kind, {
      ...previous,
      status: "failed",
      error: message,
      detail: "Export thất bại trong khi xử lý",
      completedAtMs,
      elapsedSeconds,
    });
    console.error(`[VideoDubbing] ${active.kind} thất bại:`, error);
  }

  private async cleanup(active: ActiveTask): Promise<void> {
    for (const file of active.temporaryFiles) {
      for (let attempt = 0; attempt < 10; attempt++) {
        try {
          await fs.promises.rm(file, { recursive: true, force: true });
          break;
        } catch (error) {
          if (attempt === 9) {
            console.error("[VideoDubbing] Không thể dọn file media tạm:", error);
          } else {
            await new Promise((resolve) => setTimeout(resolve, 500));
          }
        }
      }
    }
    this.activeTasks.delete(active.jobId);
  }
}
