import fs from "fs";
import path from "path";
import { cpus } from "os";
import { spawn, spawnSync } from "child_process";
import {
  BgmMood,
  BgmIntensity,
  BgmElements,
  BgmGenerateRequest,
  BgmTrack,
} from "./src/types/bgm";
import { isModelReady, AVAILABLE_MODELS } from "./bgmModelManager";

const BGM_DIR = path.resolve("./bgm_storage");
const HISTORY_FILE = path.join(BGM_DIR, "history.json");

export interface BgmGenerationProgress {
  percent: number;
  stage: string;
  message: string;
}

export interface BgmGenerationJob {
  id: string;
  status: "queued" | "running" | "completed" | "failed";
  progress: BgmGenerationProgress;
  track?: BgmTrack;
  error?: string;
  updatedAt: number;
}

const bgmGenerationJobs = new Map<string, BgmGenerationJob>();

// Ensure directory exists
if (!fs.existsSync(BGM_DIR)) {
  fs.mkdirSync(BGM_DIR, { recursive: true });
}

function updateBgmJob(
  job: BgmGenerationJob,
  progress: BgmGenerationProgress,
): void {
  job.status = "running";
  job.progress = progress;
  job.updatedAt = Date.now();
}

export function getBgmGenerationJob(
  jobId: string,
): Omit<BgmGenerationJob, "updatedAt"> | undefined {
  const job = bgmGenerationJobs.get(jobId);
  if (!job) return undefined;

  const { updatedAt, ...publicJob } = job;
  return publicJob;
}

export function startBgmGeneration(req: BgmGenerateRequest): string {
  const now = Date.now();
  for (const [id, job] of bgmGenerationJobs) {
    if (job.status === "completed" || job.status === "failed") {
      if (now - job.updatedAt > 10 * 60 * 1000) bgmGenerationJobs.delete(id);
    }
  }

  const job: BgmGenerationJob = {
    id: `bgm-job-${now}-${Math.random().toString(36).slice(2, 8)}`,
    status: "queued",
    progress: {
      percent: 0,
      stage: "queued",
      message: "Đang xếp hàng tạo nhạc...",
    },
    updatedAt: now,
  };
  bgmGenerationJobs.set(job.id, job);

  void generateBgmTrack(req, (progress) => updateBgmJob(job, progress))
    .then((track) => {
      job.status = "completed";
      job.progress = {
        percent: 100,
        stage: "completed",
        message: "Đã tạo xong audio.",
      };
      job.track = track;
      job.updatedAt = Date.now();
    })
    .catch((error: unknown) => {
      job.status = "failed";
      job.error =
        error instanceof Error ? error.message : "Lỗi không xác định khi tạo nhạc.";
      job.progress = {
        ...job.progress,
        stage: "failed",
        message: job.error,
      };
      job.updatedAt = Date.now();
      console.error("[BGM Generate Error]:", error);
    });

  return job.id;
}

export function resolveFfmpegPath(): string {
  if (process.env.FFMPEG_PATH && fs.existsSync(process.env.FFMPEG_PATH)) {
    return process.env.FFMPEG_PATH;
  }
  const localWin = path.resolve("./ffmpeg.exe");
  if (fs.existsSync(localWin)) return localWin;
  const localLinux = path.resolve("./ffmpeg");
  if (fs.existsSync(localLinux)) return localLinux;
  return "ffmpeg";
}

// Keyword-based analysis to detect mood and atmospheric elements from Vietnamese or English text
export function analyzePrompt(
  prompt: string,
  userMood?: BgmMood,
  userElements?: BgmElements,
): { mood: BgmMood; elements: BgmElements; title: string } {
  const p = (prompt || "").toLowerCase();

  let mood: BgmMood = userMood || "horror";
  const elements: BgmElements = {
    rain: false,
    thunder: false,
    wind: false,
    heartbeat: false,
    chimes: false,
    waves: false,
    vinyl: false,
    drone: true,
    ...(userElements || {}),
  };

  // If user didn't explicitly pick a mood or left default
  if (!userMood) {
    if (
      p.includes("kinh dị") ||
      p.includes("u ám") ||
      p.includes("rùng rợn") ||
      p.includes("ma") ||
      p.includes("quỷ") ||
      p.includes("đáng sợ") ||
      p.includes("hù") ||
      p.includes("horror") ||
      p.includes("scary") ||
      p.includes("creepy") ||
      p.includes("dark")
    ) {
      mood = "horror";
    } else if (
      p.includes("hồi hộp") ||
      p.includes("trinh thám") ||
      p.includes("gay cấn") ||
      p.includes("nhịp tim") ||
      p.includes("rượt đuổi") ||
      p.includes("căng thẳng") ||
      p.includes("suspense") ||
      p.includes("thriller") ||
      p.includes("tension")
    ) {
      mood = "suspense";
    } else if (
      p.includes("cổ trang") ||
      p.includes("kiếm hiệp") ||
      p.includes("sáo") ||
      p.includes("tiên hiệp") ||
      p.includes("trung hoa") ||
      p.includes("cổ phong") ||
      p.includes("asian") ||
      p.includes("guzheng") ||
      p.includes("flute")
    ) {
      mood = "ancient";
    } else if (
      p.includes("mưa") ||
      p.includes("sấm") ||
      p.includes("bão") ||
      p.includes("gió") ||
      p.includes("thiên nhiên") ||
      p.includes("rừng") ||
      p.includes("suối") ||
      p.includes("sóng") ||
      p.includes("biển") ||
      p.includes("rain") ||
      p.includes("nature") ||
      p.includes("thunder")
    ) {
      mood = "nature";
    } else if (
      p.includes("thần tiên") ||
      p.includes("cổ tích") ||
      p.includes("kỳ ảo") ||
      p.includes("phép thuật") ||
      p.includes("thần thoại") ||
      p.includes("chuông") ||
      p.includes("fantasy") ||
      p.includes("magic") ||
      p.includes("fairytale")
    ) {
      mood = "fantasy";
    } else if (
      p.includes("viễn tưởng") ||
      p.includes("vũ trụ") ||
      p.includes("cyberpunk") ||
      p.includes("không gian") ||
      p.includes("khoa học") ||
      p.includes("sci-fi") ||
      p.includes("space") ||
      p.includes("synth")
    ) {
      mood = "scifi";
    } else if (
      p.includes("hùng tráng") ||
      p.includes("chiến đấu") ||
      p.includes("sử thi") ||
      p.includes("chiến tranh") ||
      p.includes("tráng lệ") ||
      p.includes("epic") ||
      p.includes("battle") ||
      p.includes("heroic")
    ) {
      mood = "epic";
    } else if (
      p.includes("lofi") ||
      p.includes("chill") ||
      p.includes("thư giãn") ||
      p.includes("đọc sách") ||
      p.includes("cà phê") ||
      p.includes("ấm cúng") ||
      p.includes("relax") ||
      p.includes("calm")
    ) {
      mood = "lofi";
    } else if (
      p.includes("buồn") ||
      p.includes("chia ly") ||
      p.includes("bi thương") ||
      p.includes("da diết") ||
      p.includes("sad") ||
      p.includes("sorrow")
    ) {
      mood = "sad";
    }
  }

  // Detect specific elements from prompt keywords
  if (p.includes("mưa") || p.includes("rain")) elements.rain = true;
  if (p.includes("sấm") || p.includes("thunder")) elements.thunder = true;
  if (p.includes("gió") || p.includes("wind")) elements.wind = true;
  if (p.includes("nhịp tim") || p.includes("heartbeat")) elements.heartbeat = true;
  if (p.includes("chuông") || p.includes("chime") || p.includes("bell")) elements.chimes = true;
  if (p.includes("sóng") || p.includes("biển") || p.includes("wave")) elements.waves = true;
  if (p.includes("đĩa than") || p.includes("lofi") || p.includes("vinyl") || p.includes("crackle")) elements.vinyl = true;

  // Title generation
  const moodTitles: Record<BgmMood, string> = {
    horror: "Nhạc Nền Kinh Dị U Ám",
    suspense: "Nhạc Nền Hồi Hộp Gay Cấn",
    ancient: "Nhạc Nền Cổ Trang Kiếm Hiệp",
    nature: "Âm Thanh Mưa Rơi & Thiên Nhiên",
    fantasy: "Nhạc Nền Thần Tiên Kỳ Ảo",
    scifi: "Âm Thanh Vũ Trụ Viễn Tưởng",
    epic: "Nhạc Nền Hùng Tráng Sử Thi",
    lofi: "Nhạc Nền Lofi Thư Thái",
    sad: "Nhạc Nền Da Diết Bi Thương",
  };

  const title = moodTitles[mood] || "Nhạc Nền Loop";
  return { mood, elements, title };
}

// Generate FFmpeg command arguments for high-quality audio synthesis
function buildFfmpegArgs(
  outputPath: string,
  options: {
    mood: BgmMood;
    elements: BgmElements;
    duration: number;
    loop: boolean;
    crossfadeSec: number;
    intensity: BgmIntensity;
    format: "mp3" | "wav";
  },
): string[] {
  const { mood, elements, duration, loop, crossfadeSec, intensity, format } = options;
  const rawDuration = loop ? duration + crossfadeSec : duration;

  const inputs: string[] = [];
  const filters: string[] = [];
  let streamCount = 0;

  // Volume scale based on intensity
  const masterGain = intensity === "soft" ? 0.7 : intensity === "intense" ? 1.2 : 1.0;

  // MOOD-SPECIFIC SYNTHESIS LAYERS
  if (mood === "horror") {
    // 1. Deep sub-bass drone (55Hz / A1)
    inputs.push("-f", "lavfi", "-i", `sine=frequency=55:duration=${rawDuration}`);
    filters.push(`[${streamCount}:a]volume=0.55,tremolo=f=0.4:d=0.6[s_${streamCount}]`);
    streamCount++;

    // 2. Dissonant minor second (58.27Hz / Bb1)
    inputs.push("-f", "lavfi", "-i", `sine=frequency=58.27:duration=${rawDuration}`);
    filters.push(`[${streamCount}:a]volume=0.42[s_${streamCount}]`);
    streamCount++;

    // 3. Eerie mid tritone (116.54Hz / Bb2) with subtle wobble
    inputs.push("-f", "lavfi", "-i", `sine=frequency=116.54:duration=${rawDuration}`);
    filters.push(`[${streamCount}:a]volume=0.28,tremolo=f=1.1:d=0.4[s_${streamCount}]`);
    streamCount++;

    // 4. Subterranean brown noise rumble
    inputs.push("-f", "lavfi", "-i", `anoisesrc=color=brown:duration=${rawDuration}:amplitude=0.07`);
    filters.push(`[${streamCount}:a]lowpass=f=260,volume=0.6[s_${streamCount}]`);
    streamCount++;
  } else if (mood === "suspense") {
    // 1. Tension drone (65.41Hz / C2)
    inputs.push("-f", "lavfi", "-i", `sine=frequency=65.41:duration=${rawDuration}`);
    filters.push(`[${streamCount}:a]volume=0.5,tremolo=f=0.8:d=0.5[s_${streamCount}]`);
    streamCount++;

    // 2. High tension dissonance (493.88Hz / B4)
    inputs.push("-f", "lavfi", "-i", `sine=frequency=493.88:duration=${rawDuration}`);
    filters.push(`[${streamCount}:a]volume=0.18,tremolo=f=2.4:d=0.6[s_${streamCount}]`);
    streamCount++;

    // 3. Pulse / Heartbeat rhythm
    inputs.push("-f", "lavfi", "-i", `sine=frequency=50:duration=${rawDuration}`);
    filters.push(`[${streamCount}:a]volume=0.65,tremolo=f=1.2:d=0.9[s_${streamCount}]`);
    streamCount++;

    // 4. Low air tension
    inputs.push("-f", "lavfi", "-i", `anoisesrc=color=pink:duration=${rawDuration}:amplitude=0.04`);
    filters.push(`[${streamCount}:a]bandpass=f=350:w=120,volume=0.5[s_${streamCount}]`);
    streamCount++;
  } else if (mood === "ancient") {
    // Cổ trang / Kiếm hiệp: D minor pentatonic harmony (D2, A2, D3, F3, A3)
    // 1. Root D2 (73.42Hz)
    inputs.push("-f", "lavfi", "-i", `sine=frequency=73.42:duration=${rawDuration}`);
    filters.push(`[${streamCount}:a]volume=0.5[s_${streamCount}]`);
    streamCount++;

    // 2. Fifth A2 (110Hz)
    inputs.push("-f", "lavfi", "-i", `sine=frequency=110:duration=${rawDuration}`);
    filters.push(`[${streamCount}:a]volume=0.38,tremolo=f=0.3:d=0.3[s_${streamCount}]`);
    streamCount++;

    // 3. Flute-like octave D4 (293.66Hz)
    inputs.push("-f", "lavfi", "-i", `sine=frequency=293.66:duration=${rawDuration}`);
    filters.push(`[${streamCount}:a]volume=0.22,flanger=delay=4:depth=3:regen=30:width=60[s_${streamCount}]`);
    streamCount++;

    // 4. Minor third F4 (349.23Hz)
    inputs.push("-f", "lavfi", "-i", `sine=frequency=349.23:duration=${rawDuration}`);
    filters.push(`[${streamCount}:a]volume=0.18,tremolo=f=0.5:d=0.4[s_${streamCount}]`);
    streamCount++;

    // 5. Gentle wind / bamboo air
    inputs.push("-f", "lavfi", "-i", `anoisesrc=color=pink:duration=${rawDuration}:amplitude=0.03`);
    filters.push(`[${streamCount}:a]bandpass=f=600:w=250,volume=0.4[s_${streamCount}]`);
    streamCount++;
  } else if (mood === "nature") {
    // 1. Rain texture (Pink + Brown noise layered)
    inputs.push("-f", "lavfi", "-i", `anoisesrc=color=pink:duration=${rawDuration}:amplitude=0.08`);
    filters.push(`[${streamCount}:a]lowpass=f=950,volume=0.75[s_${streamCount}]`);
    streamCount++;

    // 2. Deep rain ground impact
    inputs.push("-f", "lavfi", "-i", `anoisesrc=color=brown:duration=${rawDuration}:amplitude=0.09`);
    filters.push(`[${streamCount}:a]lowpass=f=350,volume=0.8[s_${streamCount}]`);
    streamCount++;

    // 3. Gentle wind gust modulation
    inputs.push("-f", "lavfi", "-i", `anoisesrc=color=white:duration=${rawDuration}:amplitude=0.02`);
    filters.push(`[${streamCount}:a]bandpass=f=450:w=180,tremolo=f=0.2:d=0.7,volume=0.5[s_${streamCount}]`);
    streamCount++;
  } else if (mood === "fantasy") {
    // Thần tiên / Cổ tích: Ethereal major chords (F# / A# / C# / F shimmer)
    inputs.push("-f", "lavfi", "-i", `sine=frequency=146.83:duration=${rawDuration}`);
    filters.push(`[${streamCount}:a]volume=0.45[s_${streamCount}]`);
    streamCount++;

    inputs.push("-f", "lavfi", "-i", `sine=frequency=220:duration=${rawDuration}`);
    filters.push(`[${streamCount}:a]volume=0.35,flanger=delay=6:depth=4:regen=35:width=80[s_${streamCount}]`);
    streamCount++;

    inputs.push("-f", "lavfi", "-i", `sine=frequency=440:duration=${rawDuration}`);
    filters.push(`[${streamCount}:a]volume=0.2,tremolo=f=0.6:d=0.5[s_${streamCount}]`);
    streamCount++;

    inputs.push("-f", "lavfi", "-i", `sine=frequency=880:duration=${rawDuration}`);
    filters.push(`[${streamCount}:a]volume=0.12,tremolo=f=1.2:d=0.7[s_${streamCount}]`);
    streamCount++;
  } else if (mood === "scifi") {
    // Viễn tưởng / Vũ trụ: Detuned cyberpunk synth drone + analog warmth
    inputs.push("-f", "lavfi", "-i", `sine=frequency=65.41:duration=${rawDuration}`);
    filters.push(`[${streamCount}:a]volume=0.5[s_${streamCount}]`);
    streamCount++;

    inputs.push("-f", "lavfi", "-i", `sine=frequency=67.12:duration=${rawDuration}`);
    filters.push(`[${streamCount}:a]volume=0.48[s_${streamCount}]`);
    streamCount++;

    inputs.push("-f", "lavfi", "-i", `sine=frequency=196:duration=${rawDuration}`);
    filters.push(`[${streamCount}:a]volume=0.25,flanger=delay=10:depth=6:regen=45:width=85[s_${streamCount}]`);
    streamCount++;

    inputs.push("-f", "lavfi", "-i", `anoisesrc=color=pink:duration=${rawDuration}:amplitude=0.04`);
    filters.push(`[${streamCount}:a]bandpass=f=280:w=100,volume=0.45[s_${streamCount}]`);
    streamCount++;
  } else if (mood === "epic") {
    // Hùng tráng: Low war braam drone + rhythmic tom cadence
    inputs.push("-f", "lavfi", "-i", `sine=frequency=43.65:duration=${rawDuration}`);
    filters.push(`[${streamCount}:a]volume=0.65[s_${streamCount}]`);
    streamCount++;

    inputs.push("-f", "lavfi", "-i", `sine=frequency=65.41:duration=${rawDuration}`);
    filters.push(`[${streamCount}:a]volume=0.45,tremolo=f=0.5:d=0.4[s_${streamCount}]`);
    streamCount++;

    inputs.push("-f", "lavfi", "-i", `sine=frequency=87.31:duration=${rawDuration}`);
    filters.push(`[${streamCount}:a]volume=0.35[s_${streamCount}]`);
    streamCount++;

    // Low battle drum pulse
    inputs.push("-f", "lavfi", "-i", `sine=frequency=55:duration=${rawDuration}`);
    filters.push(`[${streamCount}:a]volume=0.7,tremolo=f=1.5:d=0.8[s_${streamCount}]`);
    streamCount++;
  } else if (mood === "lofi") {
    // Lofi: Warm Cmaj7/Dm9 mellow chords
    inputs.push("-f", "lavfi", "-i", `sine=frequency=130.81:duration=${rawDuration}`);
    filters.push(`[${streamCount}:a]volume=0.45,lowpass=f=750[s_${streamCount}]`);
    streamCount++;

    inputs.push("-f", "lavfi", "-i", `sine=frequency=164.81:duration=${rawDuration}`);
    filters.push(`[${streamCount}:a]volume=0.35,lowpass=f=750,tremolo=f=0.3:d=0.3[s_${streamCount}]`);
    streamCount++;

    inputs.push("-f", "lavfi", "-i", `sine=frequency=196:duration=${rawDuration}`);
    filters.push(`[${streamCount}:a]volume=0.3,lowpass=f=750[s_${streamCount}]`);
    streamCount++;

    // Vinyl crackle
    inputs.push("-f", "lavfi", "-i", `anoisesrc=color=pink:duration=${rawDuration}:amplitude=0.035`);
    filters.push(`[${streamCount}:a]highpass=f=800,lowpass=f=3500,volume=0.4[s_${streamCount}]`);
    streamCount++;
  } else {
    // Sad / Melancholic
    inputs.push("-f", "lavfi", "-i", `sine=frequency=110:duration=${rawDuration}`);
    filters.push(`[${streamCount}:a]volume=0.5[s_${streamCount}]`);
    streamCount++;

    inputs.push("-f", "lavfi", "-i", `sine=frequency=130.81:duration=${rawDuration}`);
    filters.push(`[${streamCount}:a]volume=0.42,tremolo=f=0.4:d=0.4[s_${streamCount}]`);
    streamCount++;

    inputs.push("-f", "lavfi", "-i", `sine=frequency=164.81:duration=${rawDuration}`);
    filters.push(`[${streamCount}:a]volume=0.3[s_${streamCount}]`);
    streamCount++;
  }

  // OPTIONAL ELEMENT OVERLAYS
  if (elements.rain && mood !== "nature") {
    inputs.push("-f", "lavfi", "-i", `anoisesrc=color=pink:duration=${rawDuration}:amplitude=0.06`);
    filters.push(`[${streamCount}:a]lowpass=f=900,volume=0.55[s_${streamCount}]`);
    streamCount++;
  }

  if (elements.wind && mood !== "nature") {
    inputs.push("-f", "lavfi", "-i", `anoisesrc=color=brown:duration=${rawDuration}:amplitude=0.04`);
    filters.push(`[${streamCount}:a]bandpass=f=320:w=140,tremolo=f=0.25:d=0.6,volume=0.45[s_${streamCount}]`);
    streamCount++;
  }

  if (elements.thunder) {
    inputs.push("-f", "lavfi", "-i", `sine=frequency=48:duration=${rawDuration}`);
    filters.push(`[${streamCount}:a]volume=0.6,tremolo=f=0.15:d=0.85,lowpass=f=180[s_${streamCount}]`);
    streamCount++;
  }

  if (elements.heartbeat && mood !== "suspense") {
    inputs.push("-f", "lavfi", "-i", `sine=frequency=52:duration=${rawDuration}`);
    filters.push(`[${streamCount}:a]volume=0.7,tremolo=f=1.2:d=0.9[s_${streamCount}]`);
    streamCount++;
  }

  if (elements.chimes && mood !== "fantasy") {
    inputs.push("-f", "lavfi", "-i", `sine=frequency=987.77:duration=${rawDuration}`);
    filters.push(`[${streamCount}:a]volume=0.14,tremolo=f=0.8:d=0.7[s_${streamCount}]`);
    streamCount++;
  }

  if (elements.vinyl && mood !== "lofi") {
    inputs.push("-f", "lavfi", "-i", `anoisesrc=color=pink:duration=${rawDuration}:amplitude=0.03`);
    filters.push(`[${streamCount}:a]highpass=f=1000,lowpass=f=4000,volume=0.4[s_${streamCount}]`);
    streamCount++;
  }

  // MIX ALL INPUTS
  const inputLabels = Array.from({ length: streamCount }, (_, i) => `[s_${i}]`).join("");
  const mixFilter = `${inputLabels}amix=inputs=${streamCount}:dropout_transition=0:normalize=0,aecho=0.8:0.88:80|160:0.35|0.2,volume=${masterGain}[raw_mix]`;
  filters.push(mixFilter);

  // SEAMLESS LOOP CROSSFADE
  let finalFilter = "";
  if (loop && crossfadeSec > 0) {
    const fade = crossfadeSec;
    // Split into main duration (0 -> duration) and overlap tail (duration -> duration + crossfade)
    // Then crossfade tail over the start of the audio
    finalFilter =
      `[raw_mix]asplit=2[m_full][t_full];` +
      `[m_full]atrim=0:${duration}[base_body];` +
      `[t_full]atrim=${duration}:${duration + fade},asetpts=PTS-STARTPTS[overlap_tail];` +
      `[base_body]asplit=2[h_cut][b_cut];` +
      `[h_cut]atrim=0:${fade},asetpts=PTS-STARTPTS[head_part];` +
      `[b_cut]atrim=${fade}:${duration},asetpts=PTS-STARTPTS[body_part];` +
      `[overlap_tail]afade=t=out:st=0:d=${fade}[faded_tail];` +
      `[head_part]afade=t=in:st=0:d=${fade}[faded_head];` +
      `[faded_tail][faded_head]amix=inputs=2:dropout_transition=0:normalize=0,apad=pad_dur=${duration - fade}[padded_head];` +
      `[body_part]adelay=delays=${Math.round(fade * 1000)}:all=1[delayed_body];` +
      `[padded_head][delayed_body]amix=inputs=2:duration=longest:dropout_transition=0:normalize=0,atrim=0:${duration},asetpts=N/SR/TB,loudnorm=I=-20:TP=-2:LRA=11,alimiter=limit=0.95[final_out]`;
  } else {
    // Non-looping: soft fade-in and fade-out
    finalFilter = `[raw_mix]afade=t=in:st=0:d=1,afade=t=out:st=${Math.max(0, duration - 1)}:d=1,loudnorm=I=-20:TP=-2:LRA=11,alimiter=limit=0.95[final_out]`;
  }
  filters.push(finalFilter);

  const filterGraph = filters.join(";");

  const args = [
    "-y",
    ...inputs,
    "-filter_complex",
    filterGraph,
    "-map",
    "[final_out]",
    "-t",
    String(duration),
  ];

  if (format === "mp3") {
    args.push("-c:a", "libmp3lame", "-b:a", "256k");
  } else {
    args.push("-c:a", "pcm_s16le", "-ar", "44100");
  }

  args.push(outputPath);
  return args;
}

function buildMusicGenFfmpegArgs(
  inputPath: string,
  outputPath: string,
  options: {
    duration: number;
    loop: boolean;
    crossfadeSec: number;
    format: "mp3" | "wav";
  },
): string[] {
  const { duration, loop, crossfadeSec, format } = options;
  const filters: string[] = [];

  if (loop) {
    const fade = crossfadeSec;
    filters.push(
      `[0:a]asplit=2[m_full][t_full]`,
      `[m_full]atrim=0:${duration}[base_body]`,
      `[t_full]atrim=${duration}:${duration + fade},asetpts=PTS-STARTPTS[overlap_tail]`,
      `[base_body]asplit=2[h_cut][b_cut]`,
      `[h_cut]atrim=0:${fade},asetpts=PTS-STARTPTS[head_part]`,
      `[b_cut]atrim=${fade}:${duration},asetpts=PTS-STARTPTS[body_part]`,
      `[overlap_tail]afade=t=out:st=0:d=${fade}[faded_tail]`,
      `[head_part]afade=t=in:st=0:d=${fade}[faded_head]`,
      `[faded_tail][faded_head]amix=inputs=2:dropout_transition=0:normalize=0,apad=pad_dur=${duration - fade}[padded_head]`,
      `[body_part]adelay=delays=${Math.round(fade * 1000)}:all=1[delayed_body]`,
      `[padded_head][delayed_body]amix=inputs=2:duration=longest:dropout_transition=0:normalize=0,atrim=0:${duration},asetpts=N/SR/TB,loudnorm=I=-20:TP=-2:LRA=11,alimiter=limit=0.95[final_out]`,
    );
  } else {
    filters.push(
      `[0:a]atrim=0:${duration},afade=t=in:st=0:d=1,afade=t=out:st=${Math.max(0, duration - 1)}:d=1,loudnorm=I=-20:TP=-2:LRA=11,alimiter=limit=0.95[final_out]`,
    );
  }

  const args = [
    "-y",
    "-i",
    inputPath,
    "-filter_complex",
    filters.join(";"),
    "-map",
    "[final_out]",
    "-t",
    String(duration),
  ];
  if (format === "mp3") {
    args.push("-c:a", "libmp3lame", "-b:a", "256k");
  } else {
    args.push("-c:a", "pcm_s16le", "-ar", "44100");
  }
  args.push(outputPath);
  return args;
}

function runAudioGenerationWorker(
  workerFilename: string,
  engineName: string,
  prompt: string,
  duration: number,
  modelDir: string,
  outputPath: string,
  cpuThreads: number,
  onProgress: (progress: BgmGenerationProgress) => void,
): Promise<void> {
  const python = process.env.BGM_PYTHON || process.env.PYTHON || "python";
  const scriptPath = path.resolve(`./scripts/${workerFilename}`);
  if (!fs.existsSync(scriptPath)) {
    throw new Error(`Không tìm thấy worker ${engineName}: ${scriptPath}`);
  }

  return new Promise((resolve, reject) => {
    const child = spawn(python, ["-u", scriptPath], {
      cwd: process.cwd(),
      env: {
        ...process.env,
        PYTHONUTF8: "1",
        PYTHONIOENCODING: "utf-8",
        OMP_NUM_THREADS: String(cpuThreads),
        MKL_NUM_THREADS: String(cpuThreads),
        OPENBLAS_NUM_THREADS: String(cpuThreads),
        HF_HUB_DISABLE_PROGRESS_BARS: "1",
        TOKENIZERS_PARALLELISM: "false",
      },
      windowsHide: true,
      stdio: ["pipe", "pipe", "pipe"],
    });

    let stdout = "";
    let stderr = "";
    let stdoutBuffer = "";
    let timedOut = false;
    const timeout = setTimeout(() => {
      timedOut = true;
      child.kill();
    }, 45 * 60 * 1000);

    child.stdout.setEncoding("utf8");
    child.stderr.setEncoding("utf8");
    child.stdout.on("data", (chunk: string) => {
      stdout = `${stdout}${chunk}`.slice(-4000);
      stdoutBuffer += chunk;
      const lines = stdoutBuffer.split(/\r?\n/);
      stdoutBuffer = lines.pop() || "";
      for (const line of lines) {
        try {
          const event = JSON.parse(line) as {
            type?: string;
            percent?: number;
            stage?: string;
            message?: string;
          };
          if (
            event.type === "progress" &&
            typeof event.percent === "number" &&
            typeof event.stage === "string" &&
            typeof event.message === "string"
          ) {
            onProgress({
              percent: Math.max(0, Math.min(95, Math.round(event.percent))),
              stage: event.stage,
              message: event.message,
            });
          }
        } catch {
          stdout = `${stdout}${line}\n`.slice(-4000);
        }
      }
    });
    child.stderr.on("data", (chunk: string) => {
      stderr = `${stderr}${chunk}`.slice(-8000);
    });
    child.on("error", (error) => {
      clearTimeout(timeout);
      reject(
        new Error(
          `Không khởi chạy được Python "${python}". Cài requirements-bgm.txt hoặc đặt biến BGM_PYTHON. Chi tiết: ${error.message}`,
        ),
      );
    });
    child.on("close", (code, signal) => {
      clearTimeout(timeout);
      if (timedOut) {
        reject(new Error(`${engineName} quá thời gian chờ 45 phút trên CPU.`));
        return;
      }
      if (code === 0 && fs.existsSync(outputPath) && fs.statSync(outputPath).size > 44) {
        resolve();
        return;
      }

      const detail = (stderr || stdout).trim();
      reject(
        new Error(
          `${engineName} không tạo được audio${signal ? ` (signal ${signal})` : ` (exit ${code})`}. ${
            detail || "Không có thông tin lỗi từ Python."
          }`.slice(0, 900),
        ),
      );
    });

    child.stdin.on("error", (error) => {
      clearTimeout(timeout);
      child.kill();
      reject(new Error(`Không gửi được yêu cầu tới ${engineName}: ${error.message}`));
    });
    child.stdin.end(
      JSON.stringify({ prompt, duration, modelDir, outputPath, cpuThreads }),
    );
  });
}

async function generateMusicGenAudio(
  prompt: string,
  outputPath: string,
  options: {
    duration: number;
    loop: boolean;
    crossfadeSec: number;
    format: "mp3" | "wav";
    cpuThreads: number;
  },
  onProgress: (progress: BgmGenerationProgress) => void,
): Promise<void> {
  const modelDir = path.resolve("./models/music/musicgen-small");
  const rawOutputPath = path.join(
    BGM_DIR,
    `musicgen_${Date.now()}_${Math.random().toString(36).slice(2, 8)}.wav`,
  );
  const generationDuration =
    options.duration + (options.loop ? options.crossfadeSec : 0);

  try {
    await runAudioGenerationWorker(
      "generate_musicgen.py",
      "MusicGen",
      prompt,
      generationDuration,
      modelDir,
      rawOutputPath,
      options.cpuThreads,
      onProgress,
    );

    onProgress({
      percent: 92,
      stage: "encoding",
      message: "MusicGen đã sinh xong; đang chuẩn hóa và xuất audio...",
    });
    const ffmpegBin = resolveFfmpegPath();
    const args = buildMusicGenFfmpegArgs(rawOutputPath, outputPath, options);
    const result = spawnSync(ffmpegBin, args, {
      encoding: "utf-8",
      maxBuffer: 10 * 1024 * 1024,
    });
    if (result.error || result.status !== 0) {
      const detail =
        result.stderr?.trim() ||
        result.error?.message ||
        `FFmpeg thoát với mã ${result.status}`;
      throw new Error(`Không thể xử lý audio MusicGen: ${detail.slice(-500)}`);
    }
  } finally {
    try {
      if (fs.existsSync(rawOutputPath)) fs.unlinkSync(rawOutputPath);
    } catch (error) {
      console.error("Không thể xóa file WAV trung gian MusicGen:", error);
    }
  }
}

async function generateAudioLDM(
  prompt: string,
  outputPath: string,
  options: {
    duration: number;
    loop: boolean;
    crossfadeSec: number;
    format: "mp3" | "wav";
    cpuThreads: number;
  },
  onProgress: (progress: BgmGenerationProgress) => void,
): Promise<void> {
  const modelDir = path.resolve("./models/music/audioldm-soundscape");
  const rawOutputPath = path.join(
    BGM_DIR,
    `audioldm_${Date.now()}_${Math.random().toString(36).slice(2, 8)}.wav`,
  );
  const generationDuration =
    options.duration + (options.loop ? options.crossfadeSec : 0);

  try {
    await runAudioGenerationWorker(
      "generate_audioldm.py",
      "AudioLDM",
      prompt,
      generationDuration,
      modelDir,
      rawOutputPath,
      options.cpuThreads,
      onProgress,
    );

    onProgress({
      percent: 92,
      stage: "encoding",
      message: "AudioLDM đã sinh xong; đang chuẩn hóa và xuất audio...",
    });
    const result = spawnSync(
      resolveFfmpegPath(),
      buildMusicGenFfmpegArgs(rawOutputPath, outputPath, options),
      { encoding: "utf-8", maxBuffer: 10 * 1024 * 1024 },
    );
    if (result.error || result.status !== 0) {
      const detail =
        result.stderr?.trim() ||
        result.error?.message ||
        `FFmpeg thoát với mã ${result.status}`;
      throw new Error(`Không thể xử lý audio AudioLDM: ${detail.slice(-500)}`);
    }
  } finally {
    try {
      if (fs.existsSync(rawOutputPath)) fs.unlinkSync(rawOutputPath);
    } catch (error) {
      console.error("Không thể xóa file WAV trung gian AudioLDM:", error);
    }
  }
}

// Read History
export function getBgmHistory(): BgmTrack[] {
  try {
    if (fs.existsSync(HISTORY_FILE)) {
      const data = fs.readFileSync(HISTORY_FILE, "utf-8");
      const list = JSON.parse(data);
      if (Array.isArray(list)) return list;
    }
  } catch (e) {
    console.error("Failed to read BGM history:", e);
  }
  return [];
}

// Save History
function saveBgmHistory(list: BgmTrack[]) {
  try {
    fs.writeFileSync(HISTORY_FILE, JSON.stringify(list, null, 2), "utf-8");
  } catch (e) {
    console.error("Failed to write BGM history:", e);
    const message = e instanceof Error ? e.message : String(e);
    throw new Error(`Không thể lưu lịch sử nhạc nền: ${message}`);
  }
}

function validateGeneratedAudio(filePath: string): void {
  if (!fs.existsSync(filePath)) {
    throw new Error("FFmpeg không tạo được tệp nhạc nền đầu ra.");
  }

  const stat = fs.statSync(filePath);
  if (stat.size === 0) {
    throw new Error("Tệp nhạc nền được tạo nhưng không có dữ liệu.");
  }

  const ffmpegBin = resolveFfmpegPath();
  const check = spawnSync(
    ffmpegBin,
    ["-hide_banner", "-i", filePath, "-af", "volumedetect", "-f", "null", "-"],
    { encoding: "utf-8", maxBuffer: 10 * 1024 * 1024 },
  );

  if (check.error || check.status !== 0) {
    const detail = check.stderr?.trim() || check.error?.message || "Lỗi không xác định";
    throw new Error(`Không thể kiểm tra tệp nhạc nền vừa tạo: ${detail.slice(-500)}`);
  }

  const maxVolumeMatch = check.stderr.match(/max_volume:\s*(-?[\d.]+|-inf)\s*dB/i);
  if (!maxVolumeMatch) {
    throw new Error("Không xác định được âm lượng của tệp nhạc nền vừa tạo.");
  }

  const maxVolume = Number.parseFloat(maxVolumeMatch[1]);
  if (!Number.isFinite(maxVolume) || maxVolume <= -60) {
    throw new Error("Tệp nhạc nền được tạo nhưng không có âm thanh nghe được.");
  }
}

// Delete Track
export function deleteBgmTrack(id: string): boolean {
  const history = getBgmHistory();
  const track = history.find((t) => t.id === id);
  if (!track) return false;

  const filename = path.basename(track.audioUrl);
  const filePath = path.join(BGM_DIR, filename);
  if (fs.existsSync(filePath)) {
    try {
      fs.unlinkSync(filePath);
    } catch {}
  }

  const updated = history.filter((t) => t.id !== id);
  saveBgmHistory(updated);
  return true;
}

// Main generation function
export async function generateBgmTrack(
  req: BgmGenerateRequest,
  onProgress: (progress: BgmGenerationProgress) => void = () => {},
): Promise<BgmTrack> {
  const prompt = (req.prompt || "").trim();
  const duration = Math.max(10, Math.min(180, Number(req.duration) || 30));
  const loop = req.loop !== false; // Default true
  const crossfadeSec = Math.max(0.5, Math.min(4, Number(req.crossfadeSec) || 1.5));
  const intensity: BgmIntensity = req.intensity || "medium";
  const format: "mp3" | "wav" = req.format === "wav" ? "wav" : "mp3";

  const engine = req.engine || "procedural";
  const modelId = req.modelId || "musicgen-small";
  const modelSpec = AVAILABLE_MODELS[modelId];

  if (
    engine === "neural" &&
    modelId !== "musicgen-small" &&
    modelId !== "audioldm-soundscape"
  ) {
    throw new Error(
      `Engine Neural không hỗ trợ model "${modelId}".`,
    );
  }

  if (engine === "neural") {
    if (!isModelReady(modelId)) {
      throw new Error(
        `Mô hình AI [${modelSpec?.name || modelId}] chưa được tải về máy. Vui lòng bấm nút 'Tải Model AI' trong phần Quản lý Model để tải theo nhu cầu (~${modelSpec?.sizeFormatted || "2.2 GiB"}), hoặc chuyển sang Chế độ 'Tổng hợp Siêu tốc (Procedural)' để tạo tức thì không cần tải model.`
      );
    }
  }

  // Prompt Analysis
  const { mood, elements, title } = analyzePrompt(prompt, req.mood, req.elements);

  const trackId = `bgm_${Date.now()}_${Math.random().toString(36).substring(2, 6)}`;
  const filename = `${trackId}.${format}`;
  const outputPath = path.join(BGM_DIR, filename);

  try {
    if (engine === "neural") {
      onProgress({
        percent: 2,
        stage: "loading",
        message:
          modelId === "audioldm-soundscape"
            ? "Đang khởi tạo AudioLDM trên CPU..."
            : "Đang khởi tạo MusicGen và kiểm tra metadata...",
      });
      const moodPrompts: Record<BgmMood, string> =
        modelId === "audioldm-soundscape"
          ? {
              horror: "dark eerie horror ambience soundscape with unsettling low drones",
              suspense: "tense suspenseful atmospheric soundscape",
              ancient: "ancient Asian ambient soundscape with distant bamboo flute",
              nature: "peaceful natural outdoor ambience soundscape",
              fantasy: "magical fantasy ambience with soft shimmering bells",
              scifi: "mysterious futuristic space ambience soundscape",
              epic: "epic cinematic atmospheric soundscape",
              lofi: "warm quiet room ambience with soft vinyl texture",
              sad: "melancholic atmospheric ambient soundscape",
            }
          : {
              horror: "dark eerie horror cinematic instrumental soundtrack",
              suspense: "tense suspenseful thriller cinematic instrumental soundtrack",
              ancient: "ancient wuxia Chinese cinematic instrumental soundtrack with bamboo flute",
              nature: "peaceful nature ambience instrumental soundtrack",
              fantasy: "magical fantasy cinematic instrumental soundtrack with shimmering bells",
              scifi: "mysterious futuristic sci-fi ambient synth instrumental soundtrack",
              epic: "epic heroic cinematic orchestral instrumental soundtrack",
              lofi: "warm mellow lofi instrumental background music",
              sad: "melancholic emotional cinematic instrumental soundtrack",
            };
      const elementPrompts = [
        elements.rain && "rain ambience",
        elements.thunder && "distant thunder",
        elements.wind && "wind ambience",
        elements.heartbeat && "heartbeat-like rhythmic pulse",
        elements.chimes && "soft chimes",
        elements.waves && "ocean waves",
        elements.vinyl && "vinyl crackle texture",
      ].filter(Boolean);
      const intensityPrompt =
        intensity === "soft"
          ? "soft and subtle"
          : intensity === "intense"
            ? "powerful and intense"
            : "moderate intensity";
      const musicPrompt = [
        prompt,
        moodPrompts[mood],
        intensityPrompt,
        ...elementPrompts,
        modelId === "audioldm-soundscape"
          ? "environmental soundscape, no speech"
          : "instrumental only, no vocals",
      ]
        .filter(Boolean)
        .join(", ");

      const generateAudio = modelId === "audioldm-soundscape"
        ? generateAudioLDM
        : generateMusicGenAudio;
      await generateAudio(musicPrompt, outputPath, {
        duration,
        loop,
        crossfadeSec,
        format,
        cpuThreads: Math.max(
          1,
          Math.min(
            cpus().length,
            Math.floor(Number(req.cpuThreads) || Math.min(12, cpus().length)),
          ),
        ),
      }, onProgress);
    } else {
      onProgress({
        percent: 10,
        stage: "synthesis",
        message: "Đang tổng hợp các lớp âm thanh bằng FFmpeg...",
      });
      const ffmpegBin = resolveFfmpegPath();
      const args = buildFfmpegArgs(outputPath, {
        mood,
        elements,
        duration,
        loop,
        crossfadeSec,
        intensity,
        format,
      });

      const res = spawnSync(ffmpegBin, args, {
        encoding: "utf-8",
        maxBuffer: 10 * 1024 * 1024,
      });

      if (res.error || res.status !== 0) {
        const detail =
          res.stderr?.trim() || res.error?.message || `FFmpeg thoát với mã ${res.status}`;
        console.error("FFmpeg synthesis error:", detail);
        throw new Error(`Không thể tạo nhạc nền: ${detail.slice(-500)}`);
      }
      onProgress({
        percent: 85,
        stage: "validation",
        message: "Đã tổng hợp xong; đang kiểm tra file audio...",
      });
    }

    validateGeneratedAudio(outputPath);
    onProgress({
      percent: 97,
      stage: "saving",
      message: "Audio hợp lệ; đang lưu vào thư viện nhạc nền...",
    });

    const stat = fs.statSync(outputPath);
    const track: BgmTrack = {
      id: trackId,
      title,
      prompt: prompt || `Nhạc nền ${title}`,
      mood,
      duration,
      format,
      audioUrl: `/api/bgm/audio/${filename}`,
      downloadUrl: `/api/bgm/download/${filename}`,
      sizeBytes: stat.size,
      createdAt: new Date().toISOString(),
      elements,
      engine,
      modelName: engine === "neural" ? modelSpec?.name : undefined,
    };

    const history = getBgmHistory();
    history.unshift(track);
    saveBgmHistory(history.slice(0, 50));

    return track;
  } catch (error) {
    try {
      if (fs.existsSync(outputPath)) fs.unlinkSync(outputPath);
    } catch (cleanupError) {
      console.error("Failed to remove invalid BGM output:", cleanupError);
    }
    throw error;
  }
}
