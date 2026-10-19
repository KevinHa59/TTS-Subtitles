import fs from "fs";
import path from "path";
import { spawnSync } from "child_process";
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

// Ensure directory exists
if (!fs.existsSync(BGM_DIR)) {
  fs.mkdirSync(BGM_DIR, { recursive: true });
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
  const mixFilter = `${inputLabels}amix=inputs=${streamCount}:dropout_transition=0,aecho=0.8:0.88:80|160:0.35|0.2,volume=${masterGain}[raw_mix]`;
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
      `[faded_tail][faded_head]amix=inputs=2:dropout_transition=0[looped_head];` +
      `[looped_head][body_part]concat=n=2:v=0:a=1,alimiter=limit=0.95[final_out]`;
  } else {
    // Non-looping: soft fade-in and fade-out
    finalFilter = `[raw_mix]afade=t=in:st=0:d=1,afade=t=out:st=${Math.max(0, duration - 1)}:d=1,alimiter=limit=0.95[final_out]`;
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

  // If user selected Neural AI engine
  if (engine === "neural") {
    if (!isModelReady(modelId)) {
      throw new Error(
        `Mô hình AI [${modelSpec?.name || modelId}] chưa được tải về máy. Vui lòng bấm nút 'Tải Model AI' trong phần Quản lý Model để tải theo nhu cầu (~${modelSpec?.sizeFormatted || "1.2GB"}), hoặc chuyển sang Chế độ 'Tổng hợp Siêu tốc (Procedural)' để tạo tức thì không cần tải model.`
      );
    }
  }

  // Prompt Analysis
  const { mood, elements, title } = analyzePrompt(prompt, req.mood, req.elements);

  const trackId = `bgm_${Date.now()}_${Math.random().toString(36).substring(2, 6)}`;
  const filename = `${trackId}.${format}`;
  const outputPath = path.join(BGM_DIR, filename);

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

  const res = spawnSync(ffmpegBin, args, { encoding: "utf-8" });

  if (res.error || res.status !== 0) {
    console.error("FFmpeg synthesis error:", res.stderr || res.error);
    throw new Error(
      `Không thể tạo nhạc nền: ${res.stderr ? res.stderr.slice(-300) : "Lỗi hệ thống"}`,
    );
  }

  if (!fs.existsSync(outputPath)) {
    throw new Error("Tệp nhạc nền đầu ra không được tạo thành công.");
  }

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

  // Prepend to history
  const history = getBgmHistory();
  history.unshift(track);
  saveBgmHistory(history.slice(0, 50)); // Keep recent 50 tracks

  return track;
}
