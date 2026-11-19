export const SUBTITLE_TIMELINE_DRAG_THRESHOLD_PX = 4;

export const DEFAULT_TEXT_TRACK_ID = "text-track-1";

export const DEFAULT_TEXT_TRACK = {
  id: DEFAULT_TEXT_TRACK_ID,
  name: "TEXT 1",
};

export const ACCEPTED_VIDEO_EXTENSIONS = new Set([
  ".mp4",
  ".mkv",
  ".mov",
  ".avi",
  ".webm",
]);

export const DEFAULT_MIXER_SETTINGS = {
  vocals: { volumePercent: 100, muted: false },
  instrumental: { volumePercent: 100, muted: false },
  ttsMaster: { volumePercent: 100, muted: false },
};

export const OVERLAY_POSITION_OPTIONS = [
  { value: "top-left", label: "Trên trái" },
  { value: "top-center", label: "Trên giữa" },
  { value: "top-right", label: "Trên phải" },
  { value: "middle-left", label: "Giữa trái" },
  { value: "middle-center", label: "Chính giữa" },
  { value: "middle-right", label: "Giữa phải" },
  { value: "bottom-left", label: "Dưới trái" },
  { value: "bottom-center", label: "Dưới giữa" },
  { value: "bottom-right", label: "Dưới phải" },
];

export const SUBTITLE_FONT_OPTIONS = [
  "Arial",
  "Arial Black",
  "Verdana",
  "Tahoma",
  "Georgia",
  "Times New Roman",
  "Courier New",
  "Trebuchet MS",
];

export const DEFAULT_END_SCENE_DURATION_SECONDS = 5;

export const DEFAULT_END_SCENE_ASPECT_RATIO = "16:9";

export const END_SCENE_ASPECT_RATIOS = ["16:9", "9:16", "1:1", "4:3", "21:9"];

export const createDefaultEndSceneText = (
  durationSeconds = DEFAULT_END_SCENE_DURATION_SECONDS,
) => ({
  id: crypto.randomUUID(),
  startTime: 0,
  endTime: durationSeconds,
  text: "Hết Phim",
  fontSize: 48,
  fontFamily: "Arial",
  color: "#ffffff",
  bold: true,
  italic: false,
  underline: false,
  textCase: "none",
  outlineEnabled: true,
  outlineColor: "#000000",
  outlineWidthPx: 2,
  characterSpacingPx: 0,
  lineSpacingPx: 0,
  position: "middle-center",
  xPercent: 50,
  yPercent: 50,
  textAlign: "center",
  backgroundColor: "#000000",
  backgroundTransparent: true,
  paddingPx: 0,
});
