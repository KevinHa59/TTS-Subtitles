// Force CLI phonemizer to prevent the buggy espeak_bridge NAPI addon
// from cutting off audio at the first comma or period
process.env.PIPER_ESPEAK_BRIDGE = '0';

import express, { Request, Response } from 'express';
import { createServer as createViteServer } from 'vite';
import path from 'path';
import { fileURLToPath } from 'url';
import fs from 'fs';
import { exec, execSync, spawnSync } from 'child_process';
import { PiperNativeTTS } from 'pipertts';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const app = express();
const PORT = Number(process.env.PORT) || 3000;
const isProd = process.env.NODE_ENV === 'production';

// PID file for Windows Stop-App.bat process tracking
const PID_FILE = path.resolve(__dirname, '.server.pid');
try {
  fs.writeFileSync(PID_FILE, process.pid.toString());
} catch {}

function cleanupPidFile() {
  try {
    if (fs.existsSync(PID_FILE)) fs.unlinkSync(PID_FILE);
  } catch {}
}

process.on('SIGINT', () => { cleanupPidFile(); process.exit(0); });
process.on('SIGTERM', () => { cleanupPidFile(); process.exit(0); });
process.on('exit', () => { cleanupPidFile(); });

// Windows & cross-platform FFmpeg / FFprobe path resolution
function resolveFfmpegPath(): string {
  if (process.env.FFMPEG_PATH && fs.existsSync(process.env.FFMPEG_PATH)) {
    return process.env.FFMPEG_PATH;
  }
  const winCandidates = [
    path.resolve(__dirname, 'ffmpeg.exe'),
    path.resolve(__dirname, 'bin', 'ffmpeg.exe'),
    path.resolve(__dirname, 'ffmpeg', 'bin', 'ffmpeg.exe'),
  ];
  for (const c of winCandidates) {
    if (fs.existsSync(c)) return c;
  }
  return 'ffmpeg';
}

function resolveFfprobePath(): string {
  if (process.env.FFPROBE_PATH && fs.existsSync(process.env.FFPROBE_PATH)) {
    return process.env.FFPROBE_PATH;
  }
  const winCandidates = [
    path.resolve(__dirname, 'ffprobe.exe'),
    path.resolve(__dirname, 'bin', 'ffprobe.exe'),
    path.resolve(__dirname, 'ffmpeg', 'bin', 'ffprobe.exe'),
  ];
  for (const c of winCandidates) {
    if (fs.existsSync(c)) return c;
  }
  return 'ffprobe';
}

function checkFfmpegAvailable(): boolean {
  try {
    const res = spawnSync(resolveFfmpegPath(), ['-version'], { stdio: 'ignore' });
    return res.status === 0;
  } catch {
    return false;
  }
}

// Chained atempo filter for FFmpeg (atempo only accepts 0.5 to 2.0 per filter)
function buildAtempoFilter(speed: number): string {
  if (!speed || isNaN(speed) || speed <= 0) return 'atempo=1.0';
  const filters: string[] = [];
  let remaining = speed;
  while (remaining > 2.0) {
    filters.push('atempo=2.0');
    remaining /= 2.0;
  }
  while (remaining < 0.5) {
    filters.push('atempo=0.5');
    remaining /= 0.5;
  }
  filters.push(`atempo=${Number(remaining.toFixed(3))}`);
  return filters.join(',');
}

app.use(express.json({ limit: '20mb' }));
app.use(express.urlencoded({ extended: true, limit: '20mb' }));

const MODELS_DIR = path.resolve(__dirname, 'models');
if (!fs.existsSync(MODELS_DIR)) {
  fs.mkdirSync(MODELS_DIR, { recursive: true });
}

const JOBS_DIR = path.resolve(__dirname, 'jobs_storage');
if (!fs.existsSync(JOBS_DIR)) {
  fs.mkdirSync(JOBS_DIR, { recursive: true });
}

// In-memory cache for Piper Native TTS instances
const modelCache = new Map<string, any>();
const loadingPromises = new Map<string, Promise<any>>();

const DEFAULT_MODEL = 'hub:hoaimy-vietnamese-vi-medium-ljkjhi';

const AVAILABLE_MODELS = [
  {
    id: 'hub:hoaimy-vietnamese-vi-medium-ljkjhi',
    name: 'Hoài My (Khuyên Dùng)',
    tag: 'Nữ · Miền Bắc · Chuẩn & Truyền cảm',
    gender: 'female',
    description: 'Giọng đọc nữ tự nhiên, tròn vành rõ chữ, âm sắc ấm áp và biểu cảm tự nhiên.',
    sampleText: 'Xin chào, tôi là Hoài My. Rất hân hạnh được đồng hành cùng bạn với công nghệ Piper TTS.',
    recommended: true,
  },
  {
    id: 'hub:hoaimy-vietnamese-vi-congchualong',
    name: 'Hoài My (Phiên bản Dịu êm)',
    tag: 'Nữ · Miền Bắc · Thanh thoát, dịu dàng',
    gender: 'female',
    description: 'Phong cách nhẹ nhàng, thư giãn, rất hợp với nội dung tản văn hoặc hướng dẫn thiền.',
    sampleText: 'Chào bạn, chúc bạn một buổi tối thật bình yên và thư thái.',
    recommended: false,
  },
  {
    id: 'hub:hoaimy-vietnamese-vi-nmh19xx',
    name: 'Hoài My (Phiên bản Podcast)',
    tag: 'Nữ · Miền Bắc · Trầm ấm, sâu lắng',
    gender: 'female',
    description: 'Tông giọng đầm và ấm, phù hợp đọc sách nói, tâm sự hoặc bản tin radio.',
    sampleText: 'Chào mừng quý thính giả đang lắng nghe chương trình radio đêm muộn.',
    recommended: false,
  },
  {
    id: 'hub:ban-mai-vietnamese-vi-medium',
    name: 'Ban Mai',
    tag: 'Nữ · Miền Bắc · Trong trẻo, năng động',
    gender: 'female',
    description: 'Giọng nữ trẻ trung, tươi sáng, thích hợp cho video tin tức ngắn và thông báo công cộng.',
    sampleText: 'Bản tin sáng nay xin gửi tới quý vị và các bạn những tin tức mới nhất.',
    recommended: false,
  },
  {
    id: 'hub:thanh-nien-tu-tin-vietnamese-vi-medium',
    name: 'Thanh Niên Tự Tin',
    tag: 'Nam · Miền Bắc · Chững chạc, dõng dạc',
    gender: 'male',
    description: 'Giọng nam dứt khoát, uy tín, phù hợp bài giảng điện tử và phóng sự tài liệu.',
    sampleText: 'Kính chào quý vị khán giả, xin mời theo dõi nội dung chuyên đề khoa học công nghệ.',
    recommended: false,
  },
  {
    id: 'hub:viet-thao-vietnamese-vi-medium',
    name: 'Việt Thảo',
    tag: 'Nam · Miền Nam · Hóm hỉnh, sống động',
    gender: 'male',
    description: 'Âm sắc miền Nam tự nhiên, gần gũi, cuốn hút người nghe.',
    sampleText: 'Xin kính chào quý vị và các bạn đã quay trở lại với chương trình ngày hôm nay.',
    recommended: false,
  },
];

async function getOrLoadModel(modelId: string) {
  if (modelCache.has(modelId)) {
    return modelCache.get(modelId);
  }

  if (loadingPromises.has(modelId)) {
    return await loadingPromises.get(modelId);
  }

  const loadPromise = (async () => {
    console.log(`[PiperTTS] Loading model "${modelId}"...`);
    const startTime = Date.now();
    const tts = await PiperNativeTTS.load({
      model: modelId,
      modelsDir: MODELS_DIR,
    });
    console.log(`[PiperTTS] Model "${modelId}" loaded successfully in ${Date.now() - startTime}ms.`);
    modelCache.set(modelId, tts);
    loadingPromises.delete(modelId);
    return tts;
  })();

  loadingPromises.set(modelId, loadPromise);
  return await loadPromise;
}

// Preload the default Hoài My voice at server startup
(async () => {
  try {
    console.log('[PiperTTS] Preloading default model:', DEFAULT_MODEL);
    await getOrLoadModel(DEFAULT_MODEL);
    console.log('[PiperTTS] Default model Hoài My is ready for instant synthesis!');
  } catch (err) {
    console.error('[PiperTTS] Error preloading default model:', err);
  }
})();

function normalizeVietnameseText(input: string): string {
  return input
    .replace(/，/g, ', ')
    .replace(/。/g, '. ')
    .replace(/！/g, '! ')
    .replace(/？/g, '? ')
    .replace(/；/g, '; ')
    .replace(/：/g, ': ')
    .replace(/[“”]/g, '"')
    .replace(/[‘’]/g, "'")
    .replace(/[–—]/g, ' - ')
    .replace(/([,;:?!])([^\s0-9])/g, '$1 $2')
    .replace(/\.{3,}/g, '...')
    .replace(/[ \t]+/g, ' ')
    .trim();
}

function createWavHeader(dataLength: number, sampleRate = 22050, channels = 1, bitsPerSample = 16): Buffer {
  const byteRate = sampleRate * channels * (bitsPerSample / 8);
  const blockAlign = channels * (bitsPerSample / 8);
  const buffer = Buffer.alloc(44);

  buffer.write('RIFF', 0);
  buffer.writeUInt32LE(36 + dataLength, 4);
  buffer.write('WAVE', 8);
  buffer.write('fmt ', 12);
  buffer.writeUInt32LE(16, 16); // Subchunk1Size
  buffer.writeUInt16LE(1, 20);  // AudioFormat (PCM)
  buffer.writeUInt16LE(channels, 22);
  buffer.writeUInt32LE(sampleRate, 24);
  buffer.writeUInt32LE(byteRate, 28);
  buffer.writeUInt16LE(blockAlign, 32);
  buffer.writeUInt16LE(bitsPerSample, 34);
  buffer.write('data', 36);
  buffer.writeUInt32LE(dataLength, 40);

  return buffer;
}

function getWavDuration(filePath: string): number {
  try {
    const buf = fs.readFileSync(filePath);
    if (buf.length >= 44 && buf.toString('ascii', 0, 4) === 'RIFF') {
      const byteRate = buf.readUInt32LE(28);
      let pos = 12;
      while (pos + 8 <= buf.length) {
        const chunkId = buf.toString('ascii', pos, pos + 4);
        const chunkSize = buf.readUInt32LE(pos + 4);
        if (chunkId === 'data') {
          if (byteRate > 0) {
            return chunkSize / byteRate;
          }
          break;
        }
        pos += 8 + chunkSize;
      }
    }
  } catch {}
  return 0;
}

function getAudioDuration(filePath: string): number {
  if (filePath.toLowerCase().endsWith('.wav')) {
    const wavDur = getWavDuration(filePath);
    if (wavDur > 0) return wavDur;
  }
  try {
    const ffprobeBin = resolveFfprobePath();
    const res = spawnSync(
      ffprobeBin,
      ['-v', 'error', '-show_entries', 'format=duration', '-of', 'default=noprint_wrappers=1:nokey=1', filePath],
      { encoding: 'utf8' }
    );
    if (res.status === 0 && res.stdout) {
      return parseFloat(res.stdout.trim()) || 0;
    }
  } catch (e) {
    console.error('Error getting duration for:', filePath, e);
  }
  return 0;
}

// -------------------------------------------------------------
// SUBTITLE TIMELINE JOB MANAGER WITH REAL-TIME SSE
// -------------------------------------------------------------

interface SubtitleItem {
  id: string;
  index: number;
  startTime: number;
  endTime: number;
  text: string;
  targetDuration: number;
  originalDuration?: number;
  finalDuration?: number;
  appliedSpeed?: number;
  status: 'pending' | 'generating' | 'adjusting' | 'completed' | 'failed' | 'retrying';
  audioUrl?: string;
  error?: string;
  warning?: string;
  retryCount?: number;
}

interface LogEntry {
  id: string;
  timestamp: string;
  level: 'INFO' | 'SUCCESS' | 'WARNING' | 'ERROR';
  message: string;
}

interface ProcessingStage {
  id: number;
  name: string;
  status: 'pending' | 'running' | 'completed' | 'failed';
  detail?: string;
}

interface TimelineJobOptions {
  batchSize: number;
  maxSpeed: number;
  minSpeed: number;
  speedPriority: 'balanced' | 'strict' | 'natural';
  padSilence: boolean;
  videoDuration?: number;
  outputFormat: 'mp3' | 'wav';
}

interface TimelineJob {
  id: string;
  model: string;
  items: SubtitleItem[];
  stages: ProcessingStage[];
  logs: LogEntry[];
  status: 'idle' | 'running' | 'paused' | 'cancelled' | 'completed';
  overallProgress: {
    total: number;
    completed: number;
    running: number;
    queued: number;
    failed: number;
    percent: number;
    totalBatches: number;
    currentBatch: number;
    batchSize: number;
    speedItemsPerSec?: number;
    startTimeMs?: number;
    elapsedMs: number;
    estimatedRemainingMs?: number;
  };
  options: TimelineJobOptions;
  masterAudio?: {
    url: string;
    duration: number;
    format: 'mp3' | 'wav';
    sizeBytes: number;
  };
}

const jobs = new Map<string, TimelineJob>();
const sseClients = new Map<string, Set<Response>>();

function broadcastJobEvent(jobId: string, eventName: string, data: any) {
  const clients = sseClients.get(jobId);
  if (!clients || clients.size === 0) return;
  const payload = `event: ${eventName}\ndata: ${JSON.stringify(data)}\n\n`;
  for (const res of clients) {
    try {
      res.write(payload);
    } catch {
      clients.delete(res);
    }
  }
}

function addJobLog(job: TimelineJob, level: 'INFO' | 'SUCCESS' | 'WARNING' | 'ERROR', message: string) {
  const now = new Date();
  const timestamp = now.toTimeString().split(' ')[0]; // e.g. "13:58:01"
  const entry: LogEntry = {
    id: `log_${Date.now()}_${Math.random().toString(36).substring(2, 6)}`,
    timestamp,
    level,
    message,
  };
  job.logs.push(entry);
  broadcastJobEvent(job.id, 'log', entry);
}

function updateJobStage(job: TimelineJob, stageId: number, status: 'pending' | 'running' | 'completed' | 'failed', detail?: string) {
  const stage = job.stages.find((s) => s.id === stageId);
  if (stage) {
    stage.status = status;
    if (detail !== undefined) stage.detail = detail;
    broadcastJobEvent(job.id, 'stage_change', stage);
  }
}

function updateOverallProgress(job: TimelineJob) {
  const total = job.items.length;
  const completed = job.items.filter((i) => i.status === 'completed').length;
  const running = job.items.filter((i) => i.status === 'generating' || i.status === 'adjusting').length;
  const failed = job.items.filter((i) => i.status === 'failed').length;
  const queued = Math.max(0, total - completed - running - failed);

  const percent = total > 0 ? Math.round((completed / total) * 100) : 0;
  const elapsedMs = job.overallProgress.startTimeMs ? Date.now() - job.overallProgress.startTimeMs : 0;

  const batchSize = job.options.batchSize || 4;
  const totalBatches = Math.ceil(total / batchSize);

  let estimatedRemainingMs: number | undefined = undefined;
  let speedItemsPerSec: number | undefined = undefined;

  if (completed > 0 && elapsedMs > 500) {
    speedItemsPerSec = Number((completed / (elapsedMs / 1000)).toFixed(2));
    if (total > completed && speedItemsPerSec > 0) {
      estimatedRemainingMs = Math.round(((total - completed) / speedItemsPerSec) * 1000);
    }
  }

  job.overallProgress = {
    total,
    completed,
    running,
    queued,
    failed,
    percent,
    totalBatches,
    currentBatch: job.overallProgress.currentBatch || (completed > 0 ? Math.min(totalBatches, Math.floor(completed / batchSize) + 1) : 0),
    batchSize,
    speedItemsPerSec,
    startTimeMs: job.overallProgress.startTimeMs,
    elapsedMs,
    estimatedRemainingMs,
  };

  broadcastJobEvent(job.id, 'overall_progress', job.overallProgress);
}

const DEFAULT_STAGES: ProcessingStage[] = [
  { id: 1, name: 'Upload và phân tích file phụ đề', status: 'completed' },
  { id: 2, name: 'Khởi tạo PiperTTS và tải model Hoài My', status: 'pending' },
  { id: 3, name: 'Tạo audio TTS cho từng câu', status: 'pending' },
  { id: 4, name: 'Đo thời lượng audio thực tế', status: 'pending' },
  { id: 5, name: 'Tự động điều chỉnh tốc độ đọc (atempo)', status: 'pending' },
  { id: 6, name: 'Chuẩn hóa định dạng audio', status: 'pending' },
  { id: 7, name: 'Ghép audio theo timeline & khoảng lặng', status: 'pending' },
  { id: 8, name: 'Xuất file hoàn chỉnh cuối cùng', status: 'pending' },
  { id: 9, name: 'Hoàn tất và cho phép tải xuống', status: 'pending' },
];

// Assembles all processed items into master WAV and MP3
async function assembleJobTimeline(job: TimelineJob): Promise<{ wavPath: string; mp3Path: string; duration: number }> {
  const jobDir = path.join(JOBS_DIR, job.id);
  if (!fs.existsSync(jobDir)) {
    fs.mkdirSync(jobDir, { recursive: true });
  }

  updateJobStage(job, 7, 'running', 'Đang tính toán timeline và ghép nối PCM...');
  addJobLog(job, 'INFO', 'Bắt đầu ghép nối timeline âm thanh (PCM sample-accurate assembly)');

  const sampleRate = 22050;
  let maxEndTime = 0;

  for (const item of job.items) {
    const actualEnd = item.startTime + (item.finalDuration || item.targetDuration);
    if (actualEnd > maxEndTime) maxEndTime = actualEnd;
    if (item.endTime > maxEndTime) maxEndTime = item.endTime;
  }

  if (job.options.videoDuration && job.options.videoDuration > maxEndTime) {
    maxEndTime = job.options.videoDuration;
  }

  addJobLog(job, 'INFO', `Tổng thời lượng timeline dự kiến: ${maxEndTime.toFixed(2)}s cho ${job.items.length} câu`);

  const totalSamples = Math.ceil(maxEndTime * sampleRate);
  const masterPcm = Buffer.alloc(totalSamples * 2, 0); // 16-bit mono zeroes

  // Read each completed item and mix into master PCM
  for (const item of job.items) {
    if (item.status !== 'completed') continue;
    const itemWavPath = path.join(jobDir, `item_${item.index}_adjusted.wav`);
    const fallbackWavPath = path.join(jobDir, `item_${item.index}_orig.wav`);
    const wavToUse = fs.existsSync(itemWavPath) ? itemWavPath : fallbackWavPath;

    if (!fs.existsSync(wavToUse)) continue;

    const fileBuf = fs.readFileSync(wavToUse);
    // Find data chunk in WAV (typically 44 bytes header)
    let pcmOffset = 44;
    const dataIdx = fileBuf.indexOf('data');
    if (dataIdx !== -1 && dataIdx + 8 <= fileBuf.length) {
      pcmOffset = dataIdx + 8;
    }

    const itemPcm = fileBuf.subarray(pcmOffset);
    const itemNumSamples = Math.floor(itemPcm.length / 2);
    const startSample = Math.floor(item.startTime * sampleRate);

    for (let s = 0; s < itemNumSamples; s++) {
      const destIndex = startSample + s;
      if (destIndex >= totalSamples) break;

      const currentVal = masterPcm.readInt16LE(destIndex * 2);
      const incomingVal = itemPcm.readInt16LE(s * 2);
      // Soft clamp mix
      const mixed = Math.max(-32768, Math.min(32767, currentVal + incomingVal));
      masterPcm.writeInt16LE(mixed, destIndex * 2);
    }
  }

  const masterWavPath = path.join(jobDir, 'master.wav');
  const masterMp3Path = path.join(jobDir, 'master.mp3');

  const wavHeader = createWavHeader(masterPcm.length, sampleRate);
  fs.writeFileSync(masterWavPath, Buffer.concat([wavHeader, masterPcm]));

  updateJobStage(job, 7, 'completed');
  updateJobStage(job, 8, 'running', 'Đang mã hóa chuẩn MP3 (128 kbps) bằng FFmpeg...');
  addJobLog(job, 'INFO', 'Đang mã hóa file MP3 hoàn chỉnh với FFmpeg...');

  const ffmpegBin = resolveFfmpegPath();
  let mp3Created = false;
  try {
    const res = spawnSync(ffmpegBin, [
      '-y',
      '-i', masterWavPath,
      '-codec:a', 'libmp3lame',
      '-b:a', '128k',
      masterMp3Path
    ], { stdio: 'ignore' });
    mp3Created = res.status === 0 && fs.existsSync(masterMp3Path) && fs.statSync(masterMp3Path).size > 0;
  } catch (encErr) {
    console.warn('[FFmpeg] Không thể chuyển đổi sang MP3, fallback dùng WAV:', encErr);
  }

  const finalFilePath = (job.options.outputFormat === 'mp3' && mp3Created) ? masterMp3Path : masterWavPath;
  const realDuration = getAudioDuration(finalFilePath) || maxEndTime;

  // Cleanup intermediate audio files (Requirement 2 & 3)
  // Ensure intermediate files are deleted only AFTER master file has been successfully created
  let cleanedCount = 0;
  for (const item of job.items) {
    const itemWavPath = path.join(jobDir, `item_${item.index}_adjusted.wav`);
    const origWavPath = path.join(jobDir, `item_${item.index}_orig.wav`);
    if (fs.existsSync(itemWavPath)) {
      try {
        fs.unlinkSync(itemWavPath);
        cleanedCount++;
      } catch {}
    }
    if (fs.existsSync(origWavPath)) {
      try {
        fs.unlinkSync(origWavPath);
        cleanedCount++;
      } catch {}
    }
  }

  // If format is mp3 and mp3 file exists, clean up master.wav to save disk space
  if (job.options.outputFormat === 'mp3' && mp3Created && fs.existsSync(masterWavPath)) {
    try {
      fs.unlinkSync(masterWavPath);
      cleanedCount++;
    } catch {}
  }

  addJobLog(job, 'SUCCESS', `Đã dọn dẹp ${cleanedCount} tệp audio trung gian và dữ liệu tạm, giải phóng hoàn toàn dung lượng đĩa.`);

  updateJobStage(job, 8, 'completed');
  updateJobStage(job, 9, 'completed', 'File hoàn chỉnh đã sẵn sàng tải xuống!');

  addJobLog(job, 'SUCCESS', `File audio hoàn chỉnh đã được tạo thành công! Thời lượng: ${realDuration.toFixed(2)}s`);

  return {
    wavPath: masterWavPath,
    mp3Path: mp3Created ? masterMp3Path : masterWavPath,
    duration: realDuration
  };
}

// Background Processor for a Timeline Job
async function runJobProcessor(job: TimelineJob) {
  if (job.status !== 'running') return;

  const jobDir = path.join(JOBS_DIR, job.id);
  if (!fs.existsSync(jobDir)) {
    fs.mkdirSync(jobDir, { recursive: true });
  }

  try {
    // Stage 2: Initialize model
    updateJobStage(job, 2, 'running', `Đang kết nối mô hình ${job.model}...`);
    addJobLog(job, 'INFO', `Khởi tạo mô hình PiperTTS: ${job.model}`);
    const tts = await getOrLoadModel(job.model);
    updateJobStage(job, 2, 'completed', 'Mô hình Hoài My đã sẵn sàng');
    addJobLog(job, 'SUCCESS', 'Mô hình PiperTTS Hoài My đã sẵn sàng.');

    // Stage 3 & 4 & 5 & 6: Process items
    updateJobStage(job, 3, 'running');
    updateJobStage(job, 4, 'running');
    updateJobStage(job, 5, 'running');
    updateJobStage(job, 6, 'running');

    const batchSize = Math.max(1, Math.min(32, Number(job.options.batchSize) || 4));
    const itemsToProcess = job.items.filter((item) => item.status !== 'completed');
    const batches: SubtitleItem[][] = [];
    for (let i = 0; i < itemsToProcess.length; i += batchSize) {
      batches.push(itemsToProcess.slice(i, i + batchSize));
    }

    const totalBatches = Math.ceil(job.items.length / batchSize);
    job.overallProgress.totalBatches = totalBatches;
    job.overallProgress.batchSize = batchSize;

    addJobLog(job, 'INFO', `Bắt đầu xử lý bulk TTS`);
    addJobLog(job, 'INFO', `Batch Size: ${batchSize}`);
    addJobLog(job, 'INFO', `Tổng số câu: ${job.items.length} (${totalBatches} batch)`);
    addJobLog(job, 'INFO', `Mức độ song song tối đa (Maximum Concurrent Tasks): ${batchSize}`);

    for (let b = 0; b < batches.length; b++) {
      if ((job.status as string) === 'paused') {
        addJobLog(job, 'WARNING', 'Tiến trình tạm dừng bởi người dùng.');
        break;
      }
      if ((job.status as string) === 'cancelled') {
        addJobLog(job, 'WARNING', 'Tiến trình đã bị hủy.');
        break;
      }

      const currentBatch = batches[b];
      const batchNumber = Math.floor((currentBatch[0].index - 1) / batchSize) + 1;
      job.overallProgress.currentBatch = batchNumber;
      addJobLog(job, 'INFO', `Batch ${batchNumber}/${totalBatches} started`);

      // Mark items as generating and broadcast
      for (const item of currentBatch) {
        item.status = 'generating';
        broadcastJobEvent(job.id, 'sentence_start', { index: item.index, text: item.text, batch: batchNumber });
        addJobLog(job, 'INFO', `Sentence ${item.index}: TTS started`);
      }
      updateOverallProgress(job);

      // Execute sentences concurrently in current batch
      await Promise.all(
        currentBatch.map(async (item) => {
          try {
            const cleanedText = normalizeVietnameseText(item.text);
            const synthRes = await tts.synthesize(cleanedText, { outputFormat: 'wav' });
            const origWavPath = path.join(jobDir, `item_${item.index}_orig.wav`);
            fs.writeFileSync(origWavPath, synthRes.audio);

            const origDur = getAudioDuration(origWavPath);
            item.originalDuration = Number(origDur.toFixed(3));
            const targetDur = item.targetDuration;

            item.status = 'adjusting';
            broadcastJobEvent(job.id, 'sentence_progress', { index: item.index, status: 'adjusting' });

            const adjustedWavPath = path.join(jobDir, `item_${item.index}_adjusted.wav`);
            let appliedSpeed = 1.0;
            let warningText: string | undefined = undefined;

            if (origDur > targetDur) {
              const neededSpeed = origDur / targetDur;
              const maxSpeed = job.options.maxSpeed || 1.5;
              const minSpeed = job.options.minSpeed || 0.8;

              if (job.options.speedPriority === 'natural') {
                appliedSpeed = Math.min(1.15, neededSpeed);
                if (neededSpeed > 1.15) {
                  warningText = `Cần tăng tốc ${neededSpeed.toFixed(2)}x để khớp timestamp, nhưng giới hạn 1.15x để giữ giọng tự nhiên.`;
                  addJobLog(job, 'WARNING', `Sentence ${item.index}: ${warningText}`);
                }
              } else {
                if (neededSpeed > maxSpeed) {
                  appliedSpeed = maxSpeed;
                  warningText = `Câu quá dài so với timestamp (cần ${neededSpeed.toFixed(2)}x), đã giới hạn tốc độ tối đa ${maxSpeed.toFixed(2)}x để tránh méo tiếng.`;
                  addJobLog(job, 'WARNING', `Sentence ${item.index}: ${warningText}`);
                } else if (neededSpeed < minSpeed) {
                  appliedSpeed = minSpeed;
                } else {
                  appliedSpeed = Number(neededSpeed.toFixed(2));
                  addJobLog(job, 'INFO', `Sentence ${item.index}: target=${targetDur.toFixed(2)}s, original=${origDur.toFixed(2)}s (adjusted ${appliedSpeed}x)`);
                }
              }

              try {
                const ffmpegBin = resolveFfmpegPath();
                const filterStr = buildAtempoFilter(appliedSpeed);
                const res = spawnSync(ffmpegBin, ['-y', '-i', origWavPath, '-filter:a', filterStr, adjustedWavPath], {
                  stdio: 'ignore',
                });
                if (res.status !== 0 || !fs.existsSync(adjustedWavPath)) {
                  fs.copyFileSync(origWavPath, adjustedWavPath);
                }
              } catch {
                fs.copyFileSync(origWavPath, adjustedWavPath);
              }
            } else {
              appliedSpeed = 1.0;
              fs.copyFileSync(origWavPath, adjustedWavPath);
              const silenceGap = (targetDur - origDur).toFixed(2);
              addJobLog(job, 'INFO', `Sentence ${item.index}: target=${targetDur.toFixed(2)}s, original=${origDur.toFixed(2)}s (fits, +${silenceGap}s silence)`);
            }

            const finalDur = getAudioDuration(adjustedWavPath);
            item.finalDuration = Number(finalDur.toFixed(3));
            item.appliedSpeed = appliedSpeed;
            item.warning = warningText;
            item.status = 'completed';
            item.audioUrl = `/api/subtitles/job/${job.id}/item-audio/${item.index}`;

            addJobLog(job, 'SUCCESS', `Sentence ${item.index} completed`);
            broadcastJobEvent(job.id, 'sentence_complete', item);
          } catch (itemErr: any) {
            console.error(`Error on item ${item.index}:`, itemErr);
            item.status = 'failed';
            item.error = itemErr?.message || 'Lỗi khi tạo TTS';
            item.retryCount = (item.retryCount || 0) + 1;
            addJobLog(job, 'ERROR', `Sentence ${item.index} (Batch ${batchNumber}) failed: ${item.error}`);
            broadcastJobEvent(job.id, 'sentence_error', item);
          } finally {
            updateOverallProgress(job);
          }
        })
      );

      addJobLog(job, 'INFO', `Batch ${batchNumber}/${totalBatches} completed`);
    }

    if (job.status === 'running') {
      updateJobStage(job, 3, 'completed');
      updateJobStage(job, 4, 'completed');
      updateJobStage(job, 5, 'completed');
      updateJobStage(job, 6, 'completed');

      // Assemble master timeline
      const { mp3Path, duration } = await assembleJobTimeline(job);
      const stats = fs.statSync(mp3Path);

      job.masterAudio = {
        url: `/api/subtitles/job/${job.id}/master-audio`,
        duration,
        format: job.options.outputFormat || 'mp3',
        sizeBytes: stats.size,
      };

      job.status = 'completed';
      updateOverallProgress(job);
      broadcastJobEvent(job.id, 'job_finished', {
        success: true,
        masterAudio: job.masterAudio,
      });
    }
  } catch (err: any) {
    console.error('Job processor fatal error:', err);
    job.status = 'idle';
    addJobLog(job, 'ERROR', `Lỗi xử lý dự án: ${err.message}`);
    broadcastJobEvent(job.id, 'job_error', { error: err.message });
  }
}

// -------------------------------------------------------------
// SUBTITLE API ROUTES
// -------------------------------------------------------------

// Create a new timeline job
app.post('/api/subtitles/job/create', (req: Request, res: Response) => {
  const { items, options = {}, model = DEFAULT_MODEL } = req.body;

  if (!items || !Array.isArray(items) || items.length === 0) {
    return res.status(400).json({ error: 'Danh sách phụ đề trống hoặc không hợp lệ.' });
  }

  const jobId = `job_${Date.now()}_${Math.random().toString(36).substring(2, 7)}`;
  const batchSize = Math.max(1, Math.min(32, Number(options.batchSize) || 4));
  const totalBatches = Math.ceil(items.length / batchSize);

  // Clean up any old job directories to prevent disk bloat (Requirement 2)
  try {
    const existingDirs = fs.readdirSync(JOBS_DIR);
    for (const d of existingDirs) {
      fs.rmSync(path.join(JOBS_DIR, d), { recursive: true, force: true });
    }
  } catch {}

  const job: TimelineJob = {
    id: jobId,
    model,
    items: items.map((it: any, idx: number) => ({
      id: it.id || `sub_${idx + 1}`,
      index: it.index || idx + 1,
      startTime: Number(it.startTime) || 0,
      endTime: Number(it.endTime) || 0,
      text: String(it.text || ''),
      targetDuration: Number((it.endTime - it.startTime).toFixed(3)),
      status: 'pending',
      warning: it.warning,
    })),
    stages: JSON.parse(JSON.stringify(DEFAULT_STAGES)),
    logs: [],
    status: 'idle',
    overallProgress: {
      total: items.length,
      completed: 0,
      running: 0,
      queued: items.length,
      failed: 0,
      percent: 0,
      totalBatches,
      currentBatch: 0,
      batchSize,
      elapsedMs: 0,
    },
    options: {
      batchSize,
      maxSpeed: Number(options.maxSpeed) || 1.5,
      minSpeed: Number(options.minSpeed) || 0.8,
      speedPriority: options.speedPriority || 'balanced',
      padSilence: options.padSilence !== false,
      videoDuration: options.videoDuration ? Number(options.videoDuration) : undefined,
      outputFormat: options.outputFormat === 'wav' ? 'wav' : 'mp3',
    },
  };

  jobs.set(jobId, job);
  addJobLog(job, 'INFO', `Khởi tạo dự án phụ đề: ${job.items.length} câu (${totalBatches} batch, ${batchSize} câu/batch).`);

  res.json({ success: true, jobId, job });
});

// Get job state
app.get('/api/subtitles/job/:jobId', (req: Request, res: Response) => {
  const job = jobs.get(req.params.jobId);
  if (!job) return res.status(404).json({ error: 'Không tìm thấy dự án.' });
  res.json(job);
});

// Real-time SSE stream for a job
app.get('/api/subtitles/job/:jobId/events', (req: Request, res: Response) => {
  const jobId = req.params.jobId;
  const job = jobs.get(jobId);

  if (!job) {
    return res.status(404).send('Job not found');
  }

  res.setHeader('Content-Type', 'text/event-stream');
  res.setHeader('Cache-Control', 'no-cache');
  res.setHeader('Connection', 'keep-alive');
  res.flushHeaders?.();

  if (!sseClients.has(jobId)) {
    sseClients.set(jobId, new Set());
  }
  sseClients.get(jobId)!.add(res);

  // Send current state immediately
  res.write(`event: job_state\ndata: ${JSON.stringify(job)}\n\n`);

  // Keep-alive ping
  const interval = setInterval(() => {
    res.write(': ping\n\n');
  }, 15000);

  req.on('close', () => {
    clearInterval(interval);
    sseClients.get(jobId)?.delete(res);
  });
});

// Start or resume job processing
app.post('/api/subtitles/job/:jobId/start', (req: Request, res: Response) => {
  const job = jobs.get(req.params.jobId);
  if (!job) return res.status(404).json({ error: 'Không tìm thấy dự án.' });

  if (job.status === 'running') {
    return res.json({ message: 'Dự án đang trong tiến trình chạy.' });
  }

  job.status = 'running';
  if (!job.overallProgress.startTimeMs) {
    job.overallProgress.startTimeMs = Date.now();
  }
  addJobLog(job, 'INFO', 'Bắt đầu xử lý TTS đồng bộ timeline...');

  // Run in background without blocking HTTP response
  runJobProcessor(job);

  res.json({ success: true, status: job.status });
});

// Pause job
app.post('/api/subtitles/job/:jobId/pause', (req: Request, res: Response) => {
  const job = jobs.get(req.params.jobId);
  if (!job) return res.status(404).json({ error: 'Không tìm thấy dự án.' });

  job.status = 'paused';
  addJobLog(job, 'WARNING', 'Yêu cầu tạm dừng xử lý đã được ghi nhận.');
  broadcastJobEvent(job.id, 'job_status', { status: 'paused' });

  res.json({ success: true, status: 'paused' });
});

// Cancel job
app.post('/api/subtitles/job/:jobId/cancel', (req: Request, res: Response) => {
  const job = jobs.get(req.params.jobId);
  if (!job) return res.status(404).json({ error: 'Không tìm thấy dự án.' });

  job.status = 'cancelled';
  addJobLog(job, 'WARNING', 'Dự án đã bị hủy bỏ bởi người dùng.');
  broadcastJobEvent(job.id, 'job_status', { status: 'cancelled' });

  res.json({ success: true, status: 'cancelled' });
});

// Retry failed sentences
app.post('/api/subtitles/job/:jobId/retry-failed', (req: Request, res: Response) => {
  const job = jobs.get(req.params.jobId);
  if (!job) return res.status(404).json({ error: 'Không tìm thấy dự án.' });

  let retryCount = 0;
  for (const item of job.items) {
    if (item.status === 'failed') {
      item.status = 'pending';
      item.error = undefined;
      retryCount++;
    }
  }

  if (retryCount === 0) {
    return res.json({ message: 'Không có câu nào bị lỗi để thử lại.' });
  }

  addJobLog(job, 'INFO', `Chuẩn bị thử lại ${retryCount} câu bị lỗi.`);
  job.status = 'running';
  runJobProcessor(job);

  res.json({ success: true, retriedCount: retryCount });
});

// Regenerate single sentence
app.post('/api/subtitles/job/:jobId/single/:index', async (req: Request, res: Response) => {
  const job = jobs.get(req.params.jobId);
  if (!job) return res.status(404).json({ error: 'Không tìm thấy dự án.' });

  const itemIndex = parseInt(req.params.index);
  const item = job.items.find((i) => i.index === itemIndex);
  if (!item) return res.status(404).json({ error: 'Không tìm thấy câu phụ đề.' });

  const jobDir = path.join(JOBS_DIR, job.id);
  if (!fs.existsSync(jobDir)) fs.mkdirSync(jobDir, { recursive: true });

  addJobLog(job, 'INFO', `Tạo lại riêng câu #${item.index}: "${item.text.slice(0, 30)}..."`);
  item.status = 'generating';
  broadcastJobEvent(job.id, 'sentence_start', { index: item.index, text: item.text });

  try {
    const tts = await getOrLoadModel(job.model);
    const cleanedText = normalizeVietnameseText(item.text);
    const synthRes = await tts.synthesize(cleanedText, { outputFormat: 'wav' });
    const origWavPath = path.join(jobDir, `item_${item.index}_orig.wav`);
    fs.writeFileSync(origWavPath, synthRes.audio);

    const origDur = getAudioDuration(origWavPath);
    item.originalDuration = Number(origDur.toFixed(3));
    const targetDur = item.targetDuration;

    const adjustedWavPath = path.join(jobDir, `item_${item.index}_adjusted.wav`);
    let appliedSpeed = 1.0;

    if (origDur > targetDur) {
      const neededSpeed = origDur / targetDur;
      const maxSpeed = job.options.maxSpeed || 1.5;
      appliedSpeed = Math.min(maxSpeed, Math.max(0.5, neededSpeed));
      try {
        const ffmpegBin = resolveFfmpegPath();
        const filterStr = buildAtempoFilter(appliedSpeed);
        const res = spawnSync(ffmpegBin, ['-y', '-i', origWavPath, '-filter:a', filterStr, adjustedWavPath], {
          stdio: 'ignore',
        });
        if (res.status !== 0 || !fs.existsSync(adjustedWavPath)) {
          fs.copyFileSync(origWavPath, adjustedWavPath);
        }
      } catch {
        fs.copyFileSync(origWavPath, adjustedWavPath);
      }
    } else {
      fs.copyFileSync(origWavPath, adjustedWavPath);
    }

    item.finalDuration = Number(getAudioDuration(adjustedWavPath).toFixed(3));
    item.appliedSpeed = appliedSpeed;
    item.status = 'completed';
    item.audioUrl = `/api/subtitles/job/${job.id}/item-audio/${item.index}?t=${Date.now()}`;

    addJobLog(job, 'SUCCESS', `Tạo lại thành công câu #${item.index} (Thời lượng: ${item.finalDuration}s)`);
    broadcastJobEvent(job.id, 'sentence_complete', item);
    updateOverallProgress(job);

    res.json({ success: true, item });
  } catch (err: any) {
    item.status = 'failed';
    item.error = err.message;
    addJobLog(job, 'ERROR', `Lỗi khi tạo lại câu #${item.index}: ${err.message}`);
    broadcastJobEvent(job.id, 'sentence_error', item);
    res.status(500).json({ error: err.message });
  }
});

// Force assemble master audio
app.post('/api/subtitles/job/:jobId/assemble', async (req: Request, res: Response) => {
  const job = jobs.get(req.params.jobId);
  if (!job) return res.status(404).json({ error: 'Không tìm thấy dự án.' });

  try {
    const { mp3Path, duration } = await assembleJobTimeline(job);
    const stats = fs.statSync(mp3Path);
    job.masterAudio = {
      url: `/api/subtitles/job/${job.id}/master-audio?t=${Date.now()}`,
      duration,
      format: job.options.outputFormat || 'mp3',
      sizeBytes: stats.size,
    };
    broadcastJobEvent(job.id, 'job_finished', { success: true, masterAudio: job.masterAudio });
    res.json({ success: true, masterAudio: job.masterAudio });
  } catch (e: any) {
    res.status(500).json({ error: e.message });
  }
});

// Stream or download master audio
app.get('/api/subtitles/job/:jobId/master-audio', (req: Request, res: Response) => {
  const job = jobs.get(req.params.jobId);
  const jobDir = path.join(JOBS_DIR, req.params.jobId);

  const format = req.query.format === 'wav' ? 'wav' : 'mp3';
  const filePath = format === 'wav' ? path.join(jobDir, 'master.wav') : path.join(jobDir, 'master.mp3');

  if (!fs.existsSync(filePath)) {
    return res.status(404).send('Master audio not yet generated');
  }

  const isDownload = req.query.download === '1';
  const mimeType = format === 'wav' ? 'audio/wav' : 'audio/mpeg';

  if (isDownload) {
    res.setHeader('Content-Disposition', `attachment; filename="hoaimy-timeline-master.${format}"`);
  }
  res.setHeader('Content-Type', mimeType);
  fs.createReadStream(filePath).pipe(res);
});

// Stream single item audio
app.get('/api/subtitles/job/:jobId/item-audio/:index', (req: Request, res: Response) => {
  const jobDir = path.join(JOBS_DIR, req.params.jobId);
  const adjustedPath = path.join(jobDir, `item_${req.params.index}_adjusted.wav`);
  const origPath = path.join(jobDir, `item_${req.params.index}_orig.wav`);

  const fileToServe = fs.existsSync(adjustedPath) ? adjustedPath : origPath;
  if (!fs.existsSync(fileToServe)) {
    return res.status(404).send('Audio not found');
  }

  res.setHeader('Content-Type', 'audio/wav');
  fs.createReadStream(fileToServe).pipe(res);
});

// Download full execution logs as text file
app.get('/api/subtitles/job/:jobId/logs/download', (req: Request, res: Response) => {
  const job = jobs.get(req.params.jobId);
  if (!job) return res.status(404).send('Job not found');

  const logLines = [
    `============================================================`,
    `HOÀI MY PIPER TTS - NHẬT KÝ ĐỒNG BỘ TIMELINE PHỤ ĐỀ`,
    `Dự án ID: ${job.id}`,
    `Mô hình: ${job.model}`,
    `Tổng số câu: ${job.items.length}`,
    `Ngày xuất log: ${new Date().toLocaleString('vi-VN')}`,
    `============================================================\n`,
    ...job.logs.map((l) => `[${l.timestamp}] [${l.level}] ${l.message}`),
  ].join('\n');

  res.setHeader('Content-Type', 'text/plain; charset=utf-8');
  res.setHeader('Content-Disposition', `attachment; filename="pipertts-logs-${job.id}.txt"`);
  res.send(logLines);
});

// Explicit cleanup endpoint for a specific job (Requirement 2)
app.post('/api/subtitles/job/:jobId/cleanup', (req: Request, res: Response) => {
  const jobId = req.params.jobId;
  const jobDir = path.join(JOBS_DIR, jobId);
  try {
    if (fs.existsSync(jobDir)) {
      fs.rmSync(jobDir, { recursive: true, force: true });
    }
    jobs.delete(jobId);
    sseClients.delete(jobId);
    res.json({ success: true, message: 'Đã xóa toàn bộ file tạm và giải phóng bộ nhớ.' });
  } catch (err: any) {
    res.status(500).json({ error: err.message });
  }
});

// Explicit cleanup endpoint to reset all temporary jobs
app.post('/api/subtitles/cleanup-all', (req: Request, res: Response) => {
  try {
    if (fs.existsSync(JOBS_DIR)) {
      const files = fs.readdirSync(JOBS_DIR);
      for (const f of files) {
        fs.rmSync(path.join(JOBS_DIR, f), { recursive: true, force: true });
      }
    }
    jobs.clear();
    sseClients.clear();
    res.json({ success: true, message: 'Đã dọn dẹp sạch toàn bộ file tạm trong hệ thống.' });
  } catch (err: any) {
    res.status(500).json({ error: err.message });
  }
});

// -------------------------------------------------------------
// ORIGINAL SINGLE TTS ENDPOINTS
// -------------------------------------------------------------

app.get('/api/voices', (req: Request, res: Response) => {
  res.json({
    defaultModel: DEFAULT_MODEL,
    voices: AVAILABLE_MODELS.map((v) => ({
      ...v,
      isLoaded: modelCache.has(v.id),
    })),
  });
});

app.post('/api/tts', async (req: Request, res: Response) => {
  try {
    const {
      text,
      model = DEFAULT_MODEL,
      speed = 1.0,
      sentenceSilence = 0.2,
      noiseScale = 0.667,
      noiseWScale = 0.8,
      format = 'mp3',
    } = req.body;

    if (!text || typeof text !== 'string' || text.trim().length === 0) {
      return res.status(400).json({ error: 'Vui lòng nhập văn bản cần đọc.' });
    }

    if (text.length > 5000) {
      return res.status(400).json({ error: 'Văn bản vượt quá giới hạn 5,000 ký tự cho mỗi lần tạo.' });
    }

    const cleanedText = normalizeVietnameseText(text);
    const tts = await getOrLoadModel(model);

    const numSpeed = Math.max(0.5, Math.min(2.0, Number(speed) || 1.0));
    const lengthScale = 1.0 / numSpeed;
    const outputFormat = format === 'wav' ? 'wav' : 'mp3';

    const startTime = Date.now();
    const synthResult = await tts.synthesize(cleanedText, {
      lengthScale,
      sentenceSilence: Math.max(0.0, Math.min(2.0, Number(sentenceSilence) || 0.2)),
      noiseScale: Math.max(0.1, Math.min(1.5, Number(noiseScale) || 0.667)),
      noiseWScale: Math.max(0.1, Math.min(1.5, Number(noiseWScale) || 0.8)),
      outputFormat,
    });

    const elapsedMs = Date.now() - startTime;
    const audioBuffer = synthResult.audio as Buffer;
    const mimeType = outputFormat === 'mp3' ? 'audio/mpeg' : 'audio/wav';

    res.json({
      success: true,
      audioBase64: audioBuffer.toString('base64'),
      mimeType,
      sampleRate: synthResult.sampleRate || 22050,
      format: outputFormat,
      sizeBytes: audioBuffer.length,
      elapsedMs,
      textLength: text.trim().length,
      modelUsed: model,
    });
  } catch (error: any) {
    console.error('[PiperTTS] Synthesis error:', error);
    res.status(500).json({
      error: error?.message || 'Có lỗi xảy ra khi tạo giọng nói.',
    });
  }
});

app.post('/api/tts/download', async (req: Request, res: Response) => {
  try {
    const {
      text,
      model = DEFAULT_MODEL,
      speed = 1.0,
      sentenceSilence = 0.2,
      noiseScale = 0.667,
      noiseWScale = 0.8,
      format = 'mp3',
      filename,
    } = req.body;

    if (!text || typeof text !== 'string' || text.trim().length === 0) {
      return res.status(400).send('Văn bản không hợp lệ.');
    }

    const tts = await getOrLoadModel(model);
    const numSpeed = Math.max(0.5, Math.min(2.0, Number(speed) || 1.0));
    const lengthScale = 1.0 / numSpeed;
    const outputFormat = format === 'wav' ? 'wav' : 'mp3';

    const cleanedText = normalizeVietnameseText(text);
    const synthResult = await tts.synthesize(cleanedText, {
      lengthScale,
      sentenceSilence: Math.max(0.0, Math.min(2.0, Number(sentenceSilence) || 0.2)),
      noiseScale: Math.max(0.1, Math.min(1.5, Number(noiseScale) || 0.667)),
      noiseWScale: Math.max(0.1, Math.min(1.5, Number(noiseWScale) || 0.8)),
      outputFormat,
    });

    const audioBuffer = synthResult.audio as Buffer;
    const mimeType = outputFormat === 'mp3' ? 'audio/mpeg' : 'audio/wav';
    const safeFilename = filename || `hoaimy-piper-${Date.now()}.${outputFormat}`;

    res.setHeader('Content-Type', mimeType);
    res.setHeader('Content-Disposition', `attachment; filename="${safeFilename}"`);
    res.setHeader('Content-Length', audioBuffer.length);
    res.end(audioBuffer);
  } catch (error: any) {
    console.error('[PiperTTS] Download error:', error);
    res.status(500).send('Lỗi khi tải file audio.');
  }
});

async function startServer() {
  if (!isProd) {
    const vite = await createViteServer({
      server: { middlewareMode: true },
      appType: 'spa',
    });
    app.use(vite.middlewares);
  } else {
    const distPath = path.resolve(__dirname, 'dist');
    if (fs.existsSync(distPath)) {
      app.use(express.static(distPath));
      app.get('*', (req: Request, res: Response) => {
        res.sendFile(path.resolve(distPath, 'index.html'));
      });
    } else {
      console.warn('[Server] Thư mục dist chưa tồn tại. Đang fallback phục vụ Vite middleware...');
      const vite = await createViteServer({
        server: { middlewareMode: true },
        appType: 'spa',
      });
      app.use(vite.middlewares);
    }
  }

  const server = app.listen(PORT, () => {
    console.log(`\n==================================================================`);
    console.log(`  HOÀI MY PIPER TTS - MÁY CHỦ SẴN SÀNG`);
    console.log(`  Truy cập ứng dụng tại: http://localhost:${PORT}`);
    if (checkFfmpegAvailable()) {
      console.log(`  [FFmpeg] FFmpeg đã được kích hoạt thành công.`);
    } else {
      console.log(`  [FFmpeg] CẢNH BÁO: Chưa tìm thấy FFmpeg trong PATH hoặc thư mục gốc.`);
      console.log(`  (Để nén sang MP3 và tăng tốc đọc atempo, vui lòng cài đặt FFmpeg)`);
    }
    console.log(`==================================================================\n`);

    if (process.env.OPEN_BROWSER === '1' || process.env.AUTO_OPEN_BROWSER === '1') {
      const url = `http://localhost:${PORT}`;
      console.log(`[AutoBrowser] Đang mở trình duyệt: ${url}`);
      const startCmd =
        process.platform === 'win32'
          ? `start "" "${url}"`
          : process.platform === 'darwin'
          ? `open "${url}"`
          : `xdg-open "${url}"`;
      exec(startCmd, () => {});
    }
  });
}

startServer().catch((err) => {
  console.error('Failed to start server:', err);
});
