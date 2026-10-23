import path from "path";
import fs from "fs";
import { spawn } from "child_process";
import sharp from "sharp";

export interface VideoResolutionConfig {
  name: "720p" | "1080p" | "2k" | "4k";
  label: string;
  width: number;
  height: number;
  videoBitrate: string;
  audioBitrate: string;
}

export const VIDEO_RESOLUTIONS: Record<string, VideoResolutionConfig> = {
  "720p": {
    name: "720p",
    label: "720p HD (720 × 1280)",
    width: 720,
    height: 1280,
    videoBitrate: "2800k",
    audioBitrate: "192k",
  },
  "1080p": {
    name: "1080p",
    label: "1080p Full HD (1080 × 1920) - Khuyên dùng",
    width: 1080,
    height: 1920,
    videoBitrate: "5000k",
    audioBitrate: "192k",
  },
  "2k": {
    name: "2k",
    label: "2K QHD (1440 × 2560)",
    width: 1440,
    height: 2560,
    videoBitrate: "9000k",
    audioBitrate: "256k",
  },
  "4k": {
    name: "4k",
    label: "4K UHD (2160 × 3840)",
    width: 2160,
    height: 3840,
    videoBitrate: "18000k",
    audioBitrate: "320k",
  },
};

export interface VideoExportJob {
  id: string;
  storyId: string;
  resolution: "720p" | "1080p" | "2k" | "4k";
  status: "queued" | "generating" | "completed" | "failed";
  progress: number; // 0 - 100
  message: string;
  outputPath?: string;
  downloadUrl?: string;
  fileSizeBytes?: number;
  error?: string;
  createdAt: number;
}

export const videoExportJobs = new Map<string, VideoExportJob>();

// Helper to escape XML/SVG special characters
function escapeXml(unsafe: string): string {
  return unsafe
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&apos;");
}

// Format seconds into MM:SS
function formatTime(secs: number): string {
  if (isNaN(secs) || secs < 0) secs = 0;
  const m = Math.floor(secs / 60);
  const s = Math.floor(secs % 60);
  return `${m < 10 ? "0" : ""}${m}:${s < 10 ? "0" : ""}${s}`;
}

// Format seconds into ASS timestamp H:MM:SS.cs
function toAssTime(sec: number): string {
  if (isNaN(sec) || sec < 0) sec = 0;
  const h = Math.floor(sec / 3600);
  const m = Math.floor((sec % 3600) / 60);
  const s = Math.floor(sec % 60);
  const cs = Math.floor((sec % 1) * 100);
  const pad = (n: number, z = 2) => String(n).padStart(z, "0");
  return `${h}:${pad(m)}:${pad(s)}.${pad(cs, 2)}`;
}

function resolveVideoFontPath(): string {
  const candidates = [
    process.env.VIDEO_FONT_PATH,
    process.platform === "win32"
      ? path.join(process.env.WINDIR || "C:\\Windows", "Fonts", "arial.ttf")
      : "/usr/share/fonts/truetype/noto/NotoSans-Regular.ttf",
    "/usr/share/fonts/truetype/dejavu/DejaVuSans.ttf",
    "/System/Library/Fonts/Supplemental/Arial.ttf",
  ];
  const fontPath = candidates.find(
    (candidate) => candidate && fs.existsSync(candidate),
  );
  if (!fontPath) {
    throw new Error(
      "Không tìm thấy font cho FFmpeg drawtext. Hãy cài Arial hoặc đặt biến VIDEO_FONT_PATH.",
    );
  }
  return fontPath.replace(/\\/g, "/").replace(/^([A-Za-z]):/, "$1\\:");
}

function escapeFilterPath(filePath: string): string {
  return filePath
    .replace(/\\/g, "/")
    .replace(/:/g, "\\:")
    .replace(/'/g, "\\'");
}

export function startStoryVideoExport(params: {
  jobId: string;
  story: any;
  resolution: "720p" | "1080p" | "2k" | "4k";
  customBgImage?: string;
  ffmpegPath: string;
  storiesDir: string;
}) {
  const { jobId, story, resolution, customBgImage, ffmpegPath, storiesDir } =
    params;

  const job: VideoExportJob = {
    id: jobId,
    storyId: story.id,
    resolution,
    status: "generating",
    progress: 5,
    message: "Đang khởi tạo tài nguyên và bố cục video 9:16...",
    createdAt: Date.now(),
  };
  videoExportJobs.set(jobId, job);

  // Run async in background
  (async () => {
    try {
      const resConfig = VIDEO_RESOLUTIONS[resolution] || VIDEO_RESOLUTIONS["1080p"];
      const W = resConfig.width;
      const H = resConfig.height;
      const scale = W / 1080;

      const storyDir = path.join(storiesDir, story.id);
      const tempDir = path.join(storyDir, `export_tmp_${jobId}`);
      if (!fs.existsSync(tempDir)) fs.mkdirSync(tempDir, { recursive: true });

      // 1. Locate master audio file and duration
      const masterMp3 = path.join(storyDir, "master.mp3");
      const masterWav = path.join(storyDir, "master.wav");
      let audioPath = fs.existsSync(masterMp3)
        ? masterMp3
        : fs.existsSync(masterWav)
        ? masterWav
        : null;

      if (!audioPath) {
        throw new Error("Không tìm thấy master audio cho truyện này. Vui lòng tạo audio trước.");
      }

      const totalDuration = Number(story.masterAudio?.duration) || 10;
      job.progress = 10;
      job.message = "Đang tổng hợp phụ đề đồng bộ và timeline...";

      // 2. Build Subtitles ASS file with fading transitions
      const defaultGapSec = (Number(story.gapMs) || 300) / 1000;
      let currentTime = 0;
      const assEvents: string[] = [];

      story.paragraphs.forEach((p: any, idx: number) => {
        const hasCustomPause =
          p.pauseBefore !== undefined &&
          p.pauseBefore !== null &&
          (typeof p.pauseBefore === "number" ||
            (typeof p.pauseBefore === "string" && (p.pauseBefore as string).trim() !== "")) &&
          !isNaN(Number(p.pauseBefore));

        const pauseSec = hasCustomPause
          ? Math.max(0, Number(p.pauseBefore))
          : idx === 0
          ? 0
          : defaultGapSec;

        currentTime += pauseSec;
        const dur = Number(p.duration) || Math.max(1.0, p.text.length * 0.08);
        const startTime = currentTime;
        const endTime = startTime + dur;
        currentTime = endTime;

        const startStr = toAssTime(startTime);
        const endStr = toAssTime(endTime);
        // Clean text for ASS
        const textClean = p.text
          .replace(/\\/g, "")
          .replace(/\{/g, "")
          .replace(/\}/g, "")
          .trim();

        // Subtitle text inside card with smooth 250ms fade-in and 250ms fade-out
        assEvents.push(
          `Dialogue: 0,${startStr},${endStr},Subtitle,,0,0,0,,{\\fad(250,250)}${textClean}`,
        );
      });

      const assFontSize = Math.round(42 * scale);
      const assMarginLR = Math.round(110 * scale);
      const assMarginV = Math.round(200 * scale);

      const assContent = `[Script Info]
ScriptType: v4.00+
PlayResX: ${W}
PlayResY: ${H}
WrapStyle: 0
ScaledBorderAndShadow: yes

[V4+ Styles]
Format: Name, Fontname, Fontsize, PrimaryColour, SecondaryColour, OutlineColour, BackColour, Bold, Italic, Underline, StrikeOut, ScaleX, ScaleY, Spacing, Angle, BorderStyle, Outline, Shadow, Alignment, MarginL, MarginR, MarginV, Encoding
Style: Subtitle,Noto Sans,${assFontSize},&H00F472B6,&H000000FF,&H00000000,&H80000000,-1,0,0,0,100,100,0,0,1,0,0,2,${assMarginLR},${assMarginLR},${assMarginV},1

[Events]
Format: Layer, Start, End, Style, Name, MarginL, MarginR, MarginV, Effect, Text
${assEvents.join("\n")}
`;
      const assPath = path.join(tempDir, "subtitles.ass");
      fs.writeFileSync(assPath, assContent, "utf8");

      // 3. Handle custom background image if provided (saved to local PNG in tempDir)
      let customBgPath: string | null = null;
      if (customBgImage && customBgImage.startsWith("data:image")) {
        try {
          const match = customBgImage.match(/^data:image\/([a-zA-Z0-9]+);base64,(.+)$/);
          if (match) {
            const ext = match[1] === "jpeg" ? "jpg" : match[1];
            const base64Data = match[2];
            customBgPath = path.join(tempDir, `custom_bg.${ext}`);
            fs.writeFileSync(customBgPath, Buffer.from(base64Data, "base64"));
          }
        } catch (e) {
          console.warn("[VideoExporter] Lỗi phân tích ảnh nền tùy chỉnh:", e);
        }
      }

      job.progress = 20;
      job.message = "Đang kết xuất giao diện vector 9:16 và đĩa quay...";

      // 4. Generate Main UI Frame (SVG)
      const storyTitleEsc = escapeXml(story.title || "Kể Truyện TTS");
      const narratorName =
        story.characters?.[0]?.name || "Kể Truyện TTS";
      const narratorEsc = escapeXml(narratorName);
      const totalTimeStr = formatTime(totalDuration);

      // SVG dimensions & scaled positioning
      const discSize = Math.round(520 * scale);
      const discY = Math.round(410 * scale);
      const topBarY = Math.round(70 * scale);
      const titleY = Math.round(1080 * scale);
      const scrubberY = Math.round(1220 * scale);
      const scrubberW = Math.round(960 * scale);
      const scrubberH = Math.round(12 * scale);
      const controlsY = Math.round(1310 * scale);
      const subtitleBoxY = Math.round(1440 * scale);
      const subtitleBoxW = Math.round(960 * scale);
      const subtitleBoxH = Math.round(380 * scale);

      const uiSvg = `<svg xmlns="http://www.w3.org/2000/svg" width="${W}" height="${H}" viewBox="0 0 ${W} ${H}">
  <defs>
    <linearGradient id="bgGrad" x1="0" y1="0" x2="0" y2="1">
      <stop offset="0%" stop-color="#0b0c1c"/>
      <stop offset="50%" stop-color="#101229"/>
      <stop offset="100%" stop-color="#080914"/>
    </linearGradient>
    <linearGradient id="overlayGrad" x1="0" y1="0" x2="0" y2="1">
      <stop offset="0%" stop-color="#0b0c1c" stop-opacity="0.88"/>
      <stop offset="50%" stop-color="#0e1026" stop-opacity="0.92"/>
      <stop offset="100%" stop-color="#070812" stop-opacity="0.96"/>
    </linearGradient>
    <radialGradient id="sphere1" cx="35%" cy="35%" r="65%">
      <stop offset="0%" stop-color="#f43f5e" stop-opacity="0.95"/>
      <stop offset="50%" stop-color="#db2777" stop-opacity="0.6"/>
      <stop offset="100%" stop-color="#7e22ce" stop-opacity="0"/>
    </radialGradient>
    <radialGradient id="sphere2" cx="35%" cy="35%" r="65%">
      <stop offset="0%" stop-color="#9333ea" stop-opacity="0.95"/>
      <stop offset="50%" stop-color="#6366f1" stop-opacity="0.6"/>
      <stop offset="100%" stop-color="#312e81" stop-opacity="0"/>
    </radialGradient>
    <linearGradient id="playBtn" x1="0" y1="0" x2="1" y2="1">
      <stop offset="0%" stop-color="#7e22ce"/>
      <stop offset="50%" stop-color="#e11d48"/>
      <stop offset="100%" stop-color="#f97316"/>
    </linearGradient>
    <linearGradient id="subBg" x1="0" y1="0" x2="0" y2="1">
      <stop offset="0%" stop-color="#181b36" stop-opacity="0.92"/>
      <stop offset="50%" stop-color="#14162e" stop-opacity="0.94"/>
      <stop offset="100%" stop-color="#0e1022" stop-opacity="0.98"/>
    </linearGradient>
  </defs>

  <!-- 1. Background -->
  ${
    customBgPath
      ? `
    <image href="${customBgPath}" width="${W}" height="${H}" preserveAspectRatio="xMidYMid slice" />
    <rect width="${W}" height="${H}" fill="url(#overlayGrad)" />
  `
      : `
    <rect width="${W}" height="${H}" fill="url(#bgGrad)"/>
    <!-- Ambient Glowing Planetary Spheres -->
    <circle cx="${280 * scale}" cy="${480 * scale}" r="${160 * scale}" fill="url(#sphere1)"/>
    <circle cx="${800 * scale}" cy="${880 * scale}" r="${140 * scale}" fill="url(#sphere2)"/>
  `
  }

  <!-- 2. Disc Outer Rim Shadow -->
  <circle cx="${W / 2}" cy="${discY + discSize / 2}" r="${discSize / 2 + 5 * scale}" fill="none" stroke="rgba(255,255,255,0.08)" stroke-width="${6 * scale}"/>

  <!-- 3. Top Bar -->
  <g transform="translate(${60 * scale}, ${topBarY})">
    <circle cx="${36 * scale}" cy="${36 * scale}" r="${36 * scale}" fill="#1e293b" fill-opacity="0.6"/>
    <path d="M${26 * scale} ${31 * scale} L${36 * scale} ${41 * scale} L${46 * scale} ${31 * scale}" fill="none" stroke="#e2e8f0" stroke-width="${4 * scale}" stroke-linecap="round" stroke-linejoin="round"/>
    <text x="${(W - 120 * scale) / 2}" y="${48 * scale}" font-family="Noto Sans" font-size="${34 * scale}" font-weight="600" fill="#ffffff" text-anchor="middle">Now Playing</text>
    <circle cx="${W - 120 * scale - 36 * scale}" cy="${36 * scale}" r="${36 * scale}" fill="#1e293b" fill-opacity="0.6"/>
    <circle cx="${W - 120 * scale - 50 * scale}" cy="${36 * scale}" r="${4 * scale}" fill="#e2e8f0"/>
    <circle cx="${W - 120 * scale - 36 * scale}" cy="${36 * scale}" r="${4 * scale}" fill="#e2e8f0"/>
    <circle cx="${W - 120 * scale - 22 * scale}" cy="${36 * scale}" r="${4 * scale}" fill="#e2e8f0"/>
  </g>

  <!-- 4. Story Title & Heart Favorite -->
  <g transform="translate(${60 * scale}, ${titleY})">
    <text x="0" y="${42 * scale}" font-family="Noto Sans" font-size="${44 * scale}" font-weight="700" fill="#ffffff">${storyTitleEsc}</text>
    <text x="0" y="${88 * scale}" font-family="Noto Sans" font-size="${28 * scale}" font-weight="500" fill="#94a3b8">${narratorEsc}</text>
    <circle cx="${W - 120 * scale - 40 * scale}" cy="${50 * scale}" r="${36 * scale}" fill="#1e293b" fill-opacity="0.6" stroke="#475569" stroke-width="${2 * scale}"/>
    <!-- Heart Icon -->
    <path d="M${W - 120 * scale - 40 * scale} ${62 * scale} C${W - 120 * scale - 40 * scale} ${62 * scale} ${W - 120 * scale - 55 * scale} ${52 * scale} ${W - 120 * scale - 55 * scale} ${40 * scale} C${W - 120 * scale - 55 * scale} ${32 * scale} ${W - 120 * scale - 49 * scale} ${26 * scale} ${W - 120 * scale - 42 * scale} ${26 * scale} C${W - 120 * scale - 38 * scale} ${26 * scale} ${W - 120 * scale - 34 * scale} ${29 * scale} ${W - 120 * scale - 33 * scale} ${32 * scale} C${W - 120 * scale - 32 * scale} ${29 * scale} ${W - 120 * scale - 28 * scale} ${26 * scale} ${W - 120 * scale - 24 * scale} ${26 * scale} C${W - 120 * scale - 17 * scale} ${26 * scale} ${W - 120 * scale - 11 * scale} ${32 * scale} ${W - 120 * scale - 11 * scale} ${40 * scale} C${W - 120 * scale - 11 * scale} ${52 * scale} ${W - 120 * scale - 26 * scale} ${62 * scale} ${W - 120 * scale - 26 * scale} ${62 * scale} Z" fill="#c084fc"/>
  </g>

  <!-- 5. Timeline Scrubber Background & Total Time Label -->
  <g transform="translate(${60 * scale}, ${scrubberY})">
    <rect x="0" y="0" width="${scrubberW}" height="${scrubberH}" rx="${6 * scale}" fill="#1e293b"/>
    <!-- Total time text on right -->
    <text x="${scrubberW}" y="${42 * scale}" font-family="Noto Sans" font-size="${26 * scale}" font-weight="500" fill="#94a3b8" text-anchor="end">${totalTimeStr}</text>
  </g>

  <!-- 6. Playback Controls Row -->
  <g transform="translate(${60 * scale}, ${controlsY})">
    <!-- Repeat / 1x -->
    <text x="${40 * scale}" y="${65 * scale}" font-family="Noto Sans" font-size="${28 * scale}" font-weight="700" fill="#ec4899" text-anchor="middle">1x</text>
    <!-- Prev -->
    <path d="M${260 * scale} ${40 * scale} L${285 * scale} ${20 * scale} L${285 * scale} ${60 * scale} Z M${250 * scale} ${20 * scale} L${250 * scale} ${60 * scale}" fill="#cbd5e1" stroke="#cbd5e1" stroke-width="${4 * scale}" stroke-linecap="round"/>
    <!-- Big Center Gradient Button with Pause icon -->
    <circle cx="${480 * scale}" cy="${40 * scale}" r="${52 * scale}" fill="url(#playBtn)"/>
    <rect x="${466 * scale}" y="${22 * scale}" width="${9 * scale}" height="${36 * scale}" rx="${3 * scale}" fill="#ffffff"/>
    <rect x="${485 * scale}" y="${22 * scale}" width="${9 * scale}" height="${36 * scale}" rx="${3 * scale}" fill="#ffffff"/>
    <!-- Next -->
    <path d="M${680 * scale} ${40 * scale} L${655 * scale} ${20 * scale} L${655 * scale} ${60 * scale} Z M${690 * scale} ${20 * scale} L${690 * scale} ${60 * scale}" fill="#cbd5e1" stroke="#cbd5e1" stroke-width="${4 * scale}" stroke-linecap="round"/>
    <!-- Shuffle -->
    <path d="M${890 * scale} ${30 * scale} L${930 * scale} ${50 * scale} M${890 * scale} ${50 * scale} L${930 * scale} ${30 * scale}" stroke="#94a3b8" stroke-width="${4 * scale}" stroke-linecap="round"/>
  </g>

  <!-- 7. Subtitle Glassmorphism Card Frame & Header -->
  <g transform="translate(${60 * scale}, ${subtitleBoxY})">
    <rect x="0" y="0" width="${subtitleBoxW}" height="${subtitleBoxH}" rx="${28 * scale}" fill="url(#subBg)" stroke="#a855f7" stroke-width="${2 * scale}" stroke-opacity="0.3"/>
    <!-- Glowing Pink Dot & PHỤ ĐỀ -->
    <circle cx="${40 * scale}" cy="${46 * scale}" r="${6 * scale}" fill="#ec4899"/>
    <text x="${60 * scale}" y="${52 * scale}" font-family="Noto Sans" font-size="${24 * scale}" font-weight="700" fill="#ffffff" letter-spacing="2">PHỤ ĐỀ</text>
    <line x1="${20 * scale}" y1="${74 * scale}" x2="${subtitleBoxW - 20 * scale}" y2="${74 * scale}" stroke="#a855f7" stroke-width="${1 * scale}" stroke-opacity="0.2"/>
  </g>
</svg>`;

      const uiSvgPath = path.join(tempDir, "ui_base.svg");
      fs.writeFileSync(uiSvgPath, uiSvg, "utf8");

      // 5. Generate Rotating Disc (SVG)
      const discCenter = discSize / 2;
      const discSvg = `<svg xmlns="http://www.w3.org/2000/svg" width="${discSize}" height="${discSize}" viewBox="0 0 ${discSize} ${discSize}">
  <defs>
    <linearGradient id="discGrad" x1="0" y1="0" x2="1" y2="1">
      <stop offset="0%" stop-color="#ea580c"/>
      <stop offset="50%" stop-color="#e11d48"/>
      <stop offset="100%" stop-color="#581c87"/>
    </linearGradient>
    <clipPath id="circleClip">
      <circle cx="${discCenter}" cy="${discCenter}" r="${discCenter - 2 * scale}"/>
    </clipPath>
  </defs>

  <g clip-path="url(#circleClip)">
    ${
      customBgPath
        ? `<image href="${customBgPath}" width="${discSize}" height="${discSize}" preserveAspectRatio="xMidYMid slice"/>`
        : `
      <rect width="${discSize}" height="${discSize}" fill="url(#discGrad)"/>
      <path d="M${discCenter - 30 * scale} ${discCenter - 40 * scale} L${discCenter} ${discCenter - 20 * scale} L${discCenter + 30 * scale} ${discCenter - 40 * scale} L${discCenter + 30 * scale} ${discCenter + 10 * scale} L${discCenter} ${discCenter + 30 * scale} L${discCenter - 30 * scale} ${discCenter + 10 * scale} Z" fill="#ffffff" fill-opacity="0.9"/>
      <text x="${discCenter}" y="${discCenter + 90 * scale}" font-family="Noto Sans" font-size="${32 * scale}" font-weight="700" fill="#ffffff" text-anchor="middle" letter-spacing="${3 * scale}">TTS STORY</text>
    `
    }
    <!-- Center spindle spindle vinyl grooves -->
    <circle cx="${discCenter}" cy="${discCenter}" r="${discSize * 0.16}" fill="#000000" fill-opacity="0.45"/>
    <circle cx="${discCenter}" cy="${discCenter}" r="${discSize * 0.05}" fill="#ffffff" fill-opacity="0.85"/>
  </g>
  <circle cx="${discCenter}" cy="${discCenter}" r="${discCenter - 2 * scale}" fill="none" stroke="rgba(255,255,255,0.2)" stroke-width="${4 * scale}"/>
</svg>`;

      const discSvgPath = path.join(tempDir, "disc.svg");
      fs.writeFileSync(discSvgPath, discSvg, "utf8");

      // 6. Rasterize SVG to PNG; FFmpeg builds on Windows may not include an SVG decoder.
      const uiPngPath = path.join(tempDir, "ui_base.png");
      const discPngPath = path.join(tempDir, "disc.png");

      await Promise.all([
        sharp(uiSvgPath).png().toFile(uiPngPath),
        sharp(discSvgPath).png().toFile(discPngPath),
      ]);

      job.progress = 30;
      job.message = `Đang mã hóa video ${resolution.toUpperCase()} với bộ tăng tốc H.264...`;

      // 7. Compose Video with FFmpeg
      const outMp4Path = path.join(storyDir, `export_${resolution}_${jobId}.mp4`);
      const scrubX = 60 * scale;
      const scrubY = scrubberY;
      const scrubW = scrubberW;
      const scrubH = scrubberH;
      const timeFontSize = Math.round(26 * scale);
      const videoFontPath = resolveVideoFontPath();

      // FFmpeg filter complex:
      // 1. Rotate disc continuously at 24s/rotation:
      // 2. Overlay rotated disc on background
      // 3. Draw animated progress scrubber fill with pink color
      // 4. Draw playhead knob
      // 5. Draw dynamic current time text
      // 6. Apply ASS subtitles
      const filterComplex = [
        `[1:v]rotate=a=2*PI*t/24:c=none:ow=iw:oh=ih[rot]`,
        `[0:v][rot]overlay=x=(W-w)/2:y=${discY}[v1]`,
        `[v1]drawbox=x=${scrubX}:y=${scrubY}:w='(${scrubW})*min(1,t/${totalDuration})':h=${scrubH}:color=0xEC4899@1:t=fill[v2]`,
        `[v2]drawbox=x='${scrubX}+(${scrubW})*min(1,t/${totalDuration})-${8 * scale}':y=${scrubY - 4 * scale}:w=${16 * scale}:h=${20 * scale}:color=0xFFFFFF@1:t=fill[v3]`,
        `[v3]drawtext=fontfile='${videoFontPath}':text='%{pts\\:gmtime\\:0\\:%M\\\\\\:%S}':fontsize=${timeFontSize}:fontcolor=0x94A3B8:x=${scrubX}:y=${scrubY + 20 * scale}[v4]`,
        `[v4]ass='${escapeFilterPath(assPath)}'[vout]`,
      ].join(";");

      const ffmpegArgs = [
        "-y",
        "-loop",
        "1",
        "-i",
        uiPngPath,
        "-loop",
        "1",
        "-i",
        discPngPath,
        "-i",
        audioPath,
        "-t",
        String(totalDuration),
        "-filter_complex",
        filterComplex,
        "-map",
        "[vout]",
        "-map",
        "2:a",
        "-c:v",
        "libx264",
        "-preset",
        "veryfast",
        "-b:v",
        resConfig.videoBitrate,
        "-pix_fmt",
        "yuv420p",
        "-c:a",
        "aac",
        "-b:a",
        resConfig.audioBitrate,
        "-shortest",
        outMp4Path,
      ];

      const ffmpegProc = spawn(ffmpegPath, ffmpegArgs);
      let ffmpegStderr = "";

      ffmpegProc.stderr.on("data", (data) => {
        const line = data.toString();
        ffmpegStderr += line;
        // Parse time=HH:MM:SS.cs to compute progress
        const timeMatch = line.match(/time=(\d+):(\d+):(\d+\.\d+)/);
        if (timeMatch) {
          const hours = parseInt(timeMatch[1], 10);
          const mins = parseInt(timeMatch[2], 10);
          const secs = parseFloat(timeMatch[3]);
          const currentSec = hours * 3600 + mins * 60 + secs;
          const pct = Math.min(
            99,
            Math.max(30, Math.round(30 + (currentSec / totalDuration) * 68)),
          );
          job.progress = pct;
          job.message = `Đang xuất video ${resolution.toUpperCase()} (${formatTime(currentSec)} / ${formatTime(totalDuration)})...`;
        }
      });

      ffmpegProc.on("close", (code) => {
        // Cleanup tempDir
        try {
          fs.rmSync(tempDir, { recursive: true, force: true });
        } catch {}

        if (code === 0 && fs.existsSync(outMp4Path)) {
          const stats = fs.statSync(outMp4Path);
          job.status = "completed";
          job.progress = 100;
          job.message = `Xuất video ${resolution.toUpperCase()} thành công!`;
          job.outputPath = outMp4Path;
          job.fileSizeBytes = stats.size;
          job.downloadUrl = `/api/stories/${story.id}/export-video/download/${jobId}?filename=${encodeURIComponent(
            `story-${story.id}-${resolution}.mp4`,
          )}`;
        } else {
          job.status = "failed";
          const stderrSummary = ffmpegStderr.trim().split(/\r?\n/).slice(-8).join("\n");
          job.error = stderrSummary
            ? `FFmpeg kết thúc với mã lỗi: ${code}\n${stderrSummary}`
            : `FFmpeg kết thúc với mã lỗi: ${code}`;
          job.message = "Xuất video thất bại.";
        }
      });

      ffmpegProc.on("error", (err) => {
        job.status = "failed";
        job.error = err.message;
        job.message = `Lỗi hệ thống: ${err.message}`;
      });
    } catch (err: any) {
      console.error("[VideoExporter] Lỗi:", err);
      job.status = "failed";
      job.error = err.message || "Lỗi không xác định khi xuất video.";
      job.message = `Lỗi: ${job.error}`;
    }
  })();

  return job;
}
