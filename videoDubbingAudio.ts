import { spawnSync } from "node:child_process";
import fs from "node:fs";

export function normalizeVieNeuAudioForTimeline(
  inputPath: string,
  outputPath: string,
  ffmpegPath: string,
): void {
  const result = spawnSync(
    ffmpegPath,
    [
      "-hide_banner",
      "-loglevel",
      "error",
      "-y",
      "-i",
      inputPath,
      "-vn",
      "-ac",
      "1",
      "-ar",
      "22050",
      "-c:a",
      "pcm_s16le",
      outputPath,
    ],
    { windowsHide: true },
  );
  if (result.status !== 0 || !fs.existsSync(outputPath)) {
    try {
      fs.rmSync(outputPath, { force: true });
    } catch (error) {
      console.error("[VideoDubbing] Không thể dọn WAV VieNeu tạm:", error);
    }
    throw new Error(
      result.stderr?.toString().trim() ||
        "FFmpeg không thể chuẩn hóa audio VieNeu Turbo sang WAV mono 22,05 kHz.",
    );
  }
}
