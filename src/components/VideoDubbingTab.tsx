import { ChangeEvent, ClipboardEvent as ReactClipboardEvent, DragEvent, MouseEvent as ReactMouseEvent, PointerEvent as ReactPointerEvent, useEffect, useMemo, useRef, useState } from "react";
import {
  AlertCircle,
  AudioLines,
  BookOpen,
  CheckCircle2,
  ChevronDown,
  Clock3,
  Download,
  FileText,
  Film,
  Filter,
  FolderOpen,
  HardDrive,
  History,
  Info,
  LoaderCircle,
  Pause,
  Play,
  Plus,
  RefreshCw,
  RotateCcw,
  Trash2,
  Upload,
  Volume2,
  X,
} from "lucide-react";
import {
  SrtAnalysis,
  VideoDubbingJob,
  VideoDubbingJobHistoryItem,
  VideoDubbingMetadata,
  VideoDubbingAutoPipelineConfig,
  VideoDubbingMixerSettings,
  VideoDubbingMixerTrack,
  VideoDubbingOverlayPosition,
  VideoDubbingExportQuality,
  VideoDubbingSeparationAvailability,
  VideoDubbingSubtitleCue,
  VideoDubbingEndSceneSettings,
  VideoDubbingEndSceneAspectRatio,
  VideoDubbingTextOverlayCue,
  VideoDubbingProject,
  VideoDubbingMasterEditClip,
} from "../types/videoDubbing";
import { SubtitleItem } from "../types/subtitles";
import { formatSecondsToSrtTime } from "../utils/srtParser";
import { createSrtZip } from "../utils/srtFromText";
import type { ExtractedSrtFile } from "../utils/srtFromText";
import { analyzeSrtContent, formatVideoDubbingSrt } from "../utils/videoDubbingSrt";
import { filterSubtitleAudioItems } from "../utils/subtitleAudioFilters";
import { combineSubtitleCueWithPrevious } from "../utils/videoDubbingSubtitleEditing";
import { VideoDubbingPreviewController } from "../utils/videoDubbingPreview";
import {
  hasMatchedVideoDubbingQueueInputs,
  pairVideoDubbingQueueRows,
  replaceVideoDubbingSubtitleSources,
  resolveVideoDubbingTtsItems,
} from "../utils/videoDubbingQueue";
import { fitTextOverlaysToVideoDuration } from "../utils/videoDubbingOverlays";
import {
  adjustSubtitleCueTimings,
  adjustSubtitleTimelineZoom,
} from "../utils/videoDubbingSubtitleTiming";
import {
  DEFAULT_CHARACTER_CARD_STYLE,
  getTextOverlayTimelineLanes,
  resolveCharacterCardStyle,
  type CharacterCardStyle,
  type CharacterCardOcrOccurrence,
  getCharacterCardScanRanges,
  groupCharacterCardOcrCuesByOccurrences,
  groupCharacterCardOcrCues,
} from "../utils/videoDubbingCharacterCards";
import { getAvailableVideoDubbingVoices } from "../utils/videoDubbingVoices";
import SubtitleOverlayRenderer from "./SubtitleOverlayRenderer";
import VideoDubbingAudioTimeline from "./VideoDubbingAudioTimeline";

interface SelectedVideo {
  fileName: string;
  sizeBytes: number;
  progress: number;
  job: VideoDubbingJob | null;
  error?: string;
  warning?: string;
}

interface SelectedSrt {
  fileName: string;
  sizeBytes: number;
  analysis?: SrtAnalysis;
  content?: string;
  error?: string;
}

interface QueuedSubtitle extends SelectedSrt {
  id: string;
  file?: File;
  videoId?: string;
  matchByName?: boolean;
}

interface QueuedVideo {
  id: string;
  name: string;
  size: number;
  lastModified?: number;
  file?: File;
  job?: VideoDubbingJob;
  uploading?: boolean;
  error?: string;
}

interface QueueItemState {
  status:
    | "queued"
    | "uploading"
    | "processing"
    | "completed"
    | "failed"
    | "cancelled";
  jobId?: string;
  phase?: string;
  progressPercent?: number;
  error?: string;
}

interface SubtitleAudioRow extends VideoDubbingSubtitleCue {
  id: string;
  index: number;
  status: "pending" | "generating" | "completed" | "failed";
  generatedText?: string;
  error?: string;
  audioUrl?: string;
}

type TimelineCueClipboard =
  | { kind: "subtitle"; cue: VideoDubbingSubtitleCue }
  | { kind: "text"; cue: VideoDubbingTextOverlayCue };

type CharacterCardOcrRegion = { left: number; top: number; width: number; height: number };
type CharacterCardOcrPoint = { x: number; y: number };
type CharacterCardOcrJob = {
  id: string;
  status: "queued" | "running" | "completed" | "error" | "cancelled";
  progressPercent: number;
  message: string;
  subtitles: Array<{ startTime: number; endTime: number; text: string; confidence: number }>;
  error?: string;
};

type CharacterCardOcrWorker = {
  status: "stopped" | "starting" | "ready" | "busy" | "error";
  message: string;
  backend?: "cpu" | "directml";
  activeJobId?: string;
};

type CharacterCardReferenceScanResult = {
  id: string;
  startTime: number;
  endTime: number;
  time: number;
  confidence: number;
  thumbnail: string | null;
};

type CharacterCardReferenceScanJob = {
  id: string;
  status: "running" | "completed" | "error" | "cancelled";
  progressPercent: number;
  processedFrames: number;
  totalFrames: number;
  message: string;
  results: CharacterCardReferenceScanResult[];
  error?: string;
};

type AllVideosActionName = "tts" | "demucs" | "mix" | "render" | "download";

interface AllVideosActionProgress {
  action: AllVideosActionName;
  status: "running" | "completed";
  currentIndex: number;
  total: number;
  currentFileName?: string;
  completed: number;
  errors: string[];
}

interface SubtitleTimelineDrag {
  cueIndex: number;
  track: "subtitle" | "text";
  mode: "move" | "start" | "end";
  pointerId: number;
  startX: number;
  trackWidth: number;
  timelineDuration: number;
  originalStart: number;
  originalEnd: number;
}

const SUBTITLE_TIMELINE_DRAG_THRESHOLD_PX = 4;

interface TextOverlayPreviewDrag {
  cueIndex: number;
  pointerX: number;
  pointerY: number;
  anchorX: number;
  centerY: number;
  stageLeft: number;
  stageTop: number;
  stageWidth: number;
  stageHeight: number;
  overlayWidth: number;
  overlayHeight: number;
}

interface VideoDubbingTextTrack {
  id: string;
  name: string;
}

const DEFAULT_TEXT_TRACK_ID = "text-track-1";
const DEFAULT_TEXT_TRACK: VideoDubbingTextTrack = {
  id: DEFAULT_TEXT_TRACK_ID,
  name: "TEXT 1",
};

interface VideoDubbingVoice {
  id: string;
  modelId: string;
  speakerId?: number;
  name: string;
  engine?: "piper" | "vieneu";
  hasLocalFile?: boolean;
}

const ACCEPTED_VIDEO_EXTENSIONS = new Set([
  ".mp4",
  ".mkv",
  ".mov",
  ".avi",
  ".webm",
]);

const DEFAULT_MIXER_SETTINGS: VideoDubbingMixerSettings = {
  vocals: { volumePercent: 100, muted: false },
  instrumental: { volumePercent: 100, muted: false },
  ttsMaster: { volumePercent: 100, muted: false },
};
const OVERLAY_POSITION_OPTIONS: Array<{
  value: VideoDubbingOverlayPosition;
  label: string;
}> = [
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
const SUBTITLE_FONT_OPTIONS = [
  "Arial",
  "Arial Black",
  "Verdana",
  "Tahoma",
  "Georgia",
  "Times New Roman",
  "Courier New",
  "Trebuchet MS",
];

type TextCase = "none" | "uppercase" | "lowercase" | "capitalize";

const DEFAULT_END_SCENE_DURATION_SECONDS = 5;
const DEFAULT_END_SCENE_ASPECT_RATIO: VideoDubbingEndSceneAspectRatio = "16:9";
const END_SCENE_ASPECT_RATIOS: VideoDubbingEndSceneAspectRatio[] = [
  "16:9",
  "9:16",
  "1:1",
  "4:3",
  "21:9",
];

const createDefaultEndSceneText = (
  durationSeconds = DEFAULT_END_SCENE_DURATION_SECONDS,
): VideoDubbingTextOverlayCue => ({
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

interface TextStyleControlValue {
  fontFamily: string;
  fontSize: number;
  bold: boolean;
  underline: boolean;
  italic: boolean;
  textCase: TextCase;
  color: string;
  outlineEnabled: boolean;
  outlineColor: string;
  outlineWidthPx: number;
  characterSpacingPx: number;
  lineSpacingPx: number;
}

function TextStyleControls({
  value,
  onChange,
  fontOptions,
  disabled = false,
  minFontSize = 8,
  maxFontSize = 160,
}: {
  value: TextStyleControlValue;
  onChange: (patch: Partial<TextStyleControlValue>) => void;
  fontOptions: string[];
  disabled?: boolean;
  minFontSize?: number;
  maxFontSize?: number;
}) {
  const buttonClass = (active: boolean) =>
    `min-w-8 rounded-md px-2.5 py-1.5 text-xs font-semibold transition-colors ${active ? "bg-violet-400 text-slate-950" : "bg-slate-800 text-slate-200 hover:bg-slate-700"}`;
  const numberClass = "w-16 rounded-md border border-slate-700 bg-slate-950 px-2 py-1.5 text-center text-xs text-white";
  const [fontPickerOpen, setFontPickerOpen] = useState(false);
  const fontPickerRef = useRef<HTMLDivElement | null>(null);

  useEffect(() => {
    if (!fontPickerOpen) return;
    const closeOnOutsideClick = (event: PointerEvent) => {
      if (
        event.target instanceof Node &&
        !fontPickerRef.current?.contains(event.target)
      ) {
        setFontPickerOpen(false);
      }
    };
    document.addEventListener("pointerdown", closeOnOutsideClick);
    return () => document.removeEventListener("pointerdown", closeOnOutsideClick);
  }, [fontPickerOpen]);

  return (
    <div className="space-y-3 rounded-lg border border-slate-700/80 bg-[#262626] p-3 text-xs text-slate-200">
      <div className="grid grid-cols-[82px_minmax(0,1fr)] items-center gap-3">
        <span>Font</span>
        <div ref={fontPickerRef} className="relative min-w-0">
          <button
            type="button"
            disabled={disabled}
            aria-haspopup="listbox"
            aria-expanded={fontPickerOpen}
            aria-label={`Font: ${value.fontFamily}`}
            onClick={() => setFontPickerOpen((open) => !open)}
            onKeyDown={(event) => {
              if (event.key === "Escape") setFontPickerOpen(false);
            }}
            className="flex w-full min-w-0 items-center justify-between gap-2 rounded-md border border-slate-700 bg-slate-800 px-2 py-1.5 text-left text-xs text-white disabled:opacity-50"
          >
            <span className="min-w-0 truncate" style={{ fontFamily: value.fontFamily }}>
              {value.fontFamily}
            </span>
            <span className="shrink-0 text-sm" style={{ fontFamily: value.fontFamily }}>
              {value.fontFamily} - Xin Chào
            </span>
            <ChevronDown className={`h-3.5 w-3.5 shrink-0 transition-transform ${fontPickerOpen ? "rotate-180" : ""}`} />
          </button>
          {fontPickerOpen && !disabled && (
            <div
              role="listbox"
              aria-label="Chọn font chữ"
              className="absolute left-0 right-0 top-full z-40 mt-1 max-h-56 overflow-y-auto rounded-lg border border-slate-600 bg-slate-900 p-1 shadow-xl"
            >
              {fontOptions.map((font) => (
                <button
                  key={font}
                  type="button"
                  role="option"
                  aria-selected={value.fontFamily === font}
                  onClick={() => {
                    onChange({ fontFamily: font });
                    setFontPickerOpen(false);
                  }}
                  className={`flex w-full items-center justify-between gap-3 rounded-md px-2 py-2 text-left hover:bg-slate-700 ${
                    value.fontFamily === font
                      ? "bg-violet-500/15 text-violet-100"
                      : "text-slate-200"
                  }`}
                >
                  <span className="min-w-0 truncate">{font}</span>
                  <span className="shrink-0 text-sm" style={{ fontFamily: font }}>
                    {font} - Xin Chào
                  </span>
                </button>
              ))}
            </div>
          )}
        </div>
      </div>
      <div className="grid grid-cols-[82px_minmax(0,1fr)_64px] items-center gap-3">
        <span>Font size</span>
        <input type="range" min={minFontSize} max={maxFontSize} value={value.fontSize} disabled={disabled} onChange={(event) => onChange({ fontSize: Number(event.target.value) })} className="w-full accent-violet-400" aria-label="Cỡ chữ" />
        <input type="number" min={minFontSize} max={maxFontSize} value={value.fontSize} disabled={disabled} onChange={(event) => onChange({ fontSize: Math.max(minFontSize, Math.min(maxFontSize, Number(event.target.value) || minFontSize)) })} className={numberClass} aria-label="Cỡ chữ" />
      </div>
      <div className="grid grid-cols-[82px_minmax(0,1fr)] items-center gap-3">
        <span>Pattern</span>
        <div className="flex flex-wrap gap-1.5">
          <button type="button" disabled={disabled} aria-pressed={value.bold} onClick={() => onChange({ bold: !value.bold })} className={`${buttonClass(value.bold)} font-black`}>B</button>
          <button type="button" disabled={disabled} aria-pressed={value.underline} onClick={() => onChange({ underline: !value.underline })} className={`${buttonClass(value.underline)} underline`}>U</button>
          <button type="button" disabled={disabled} aria-pressed={value.italic} onClick={() => onChange({ italic: !value.italic })} className={`${buttonClass(value.italic)} italic`}>I</button>
        </div>
      </div>
      <div className="grid grid-cols-[82px_minmax(0,1fr)] items-center gap-3">
        <span>Case</span>
        <div className="flex flex-wrap gap-1.5">
          {([
            ["none", "Aa"],
            ["uppercase", "TT"],
            ["lowercase", "tt"],
            ["capitalize", "Tt"],
          ] as const).map(([textCase, label]) => (
            <button key={textCase} type="button" disabled={disabled} aria-pressed={value.textCase === textCase} onClick={() => onChange({ textCase })} className={buttonClass(value.textCase === textCase)}>{label}</button>
          ))}
        </div>
      </div>
      <div className="grid grid-cols-[82px_minmax(0,1fr)] items-center gap-3">
        <span>Color</span>
        <input type="color" value={value.color} disabled={disabled} onChange={(event) => onChange({ color: event.target.value })} className="h-8 w-20 cursor-pointer rounded-md border border-slate-700 bg-slate-950 p-1" />
      </div>
      <div className="grid grid-cols-[82px_minmax(0,1fr)] items-center gap-3">
        <span>Outline</span>
        <div className="flex flex-wrap items-center gap-2">
          <input type="checkbox" checked={value.outlineEnabled} disabled={disabled} onChange={(event) => onChange({ outlineEnabled: event.target.checked })} className="accent-violet-400" aria-label="Bật outline" />
          <input type="color" value={value.outlineColor} disabled={disabled || !value.outlineEnabled} onChange={(event) => onChange({ outlineColor: event.target.value })} className="h-8 w-16 cursor-pointer rounded-md border border-slate-700 bg-slate-950 p-1" aria-label="Màu outline" />
          <input type="number" min={0} max={8} step={0.5} value={value.outlineWidthPx} disabled={disabled || !value.outlineEnabled} onChange={(event) => onChange({ outlineWidthPx: Math.max(0, Math.min(8, Number(event.target.value) || 0)) })} className={numberClass} aria-label="Độ dày outline" />
          <span className="text-[10px] text-slate-400">px</span>
        </div>
      </div>
      <div className="grid grid-cols-[82px_minmax(0,1fr)] items-center gap-3">
        <span>Character</span>
        <div className="flex items-center gap-2">
          <input type="number" min={0} max={40} step={1} value={value.characterSpacingPx} disabled={disabled} onChange={(event) => onChange({ characterSpacingPx: Math.max(0, Math.min(40, Number(event.target.value) || 0)) })} className={numberClass} aria-label="Giãn ký tự" />
          <span className="text-[10px] text-slate-400">px</span>
        </div>
      </div>
      <div className="grid grid-cols-[82px_minmax(0,1fr)] items-center gap-3">
        <span>Line</span>
        <div className="flex items-center gap-2">
          <input type="number" min={0} max={80} step={1} value={value.lineSpacingPx} disabled={disabled} onChange={(event) => onChange({ lineSpacingPx: Math.max(0, Math.min(80, Number(event.target.value) || 0)) })} className={numberClass} aria-label="Giãn dòng" />
          <span className="text-[10px] text-slate-400">px</span>
        </div>
      </div>
    </div>
  );
}

interface SubtitleFontCatalogFace {
  family: string;
  weight: number;
  style: "normal" | "italic";
  url: string;
}

function getOverlayAlignment(position: VideoDubbingOverlayPosition) {
  const horizontal = position.endsWith("left")
    ? "flex-start"
    : position.endsWith("right")
      ? "flex-end"
      : "center";
  const vertical = position.startsWith("top")
    ? "flex-start"
    : position.startsWith("bottom")
      ? "flex-end"
      : "center";
  return { horizontal, vertical };
}

function getSubtitleTextAlignment(position: VideoDubbingOverlayPosition) {
  return position.endsWith("left")
    ? "left"
    : position.endsWith("right")
      ? "right"
      : "center";
}

interface PreviewTrackNode {
  element: HTMLAudioElement;
  gain: GainNode;
}

function getJobProcessingProgress(job: VideoDubbingJob): {
  label: string;
  progressPercent?: number;
  colorClass: string;
} | null {
  if (job.autoPipeline?.status === "running") {
    const separating =
      job.autoPipeline.phase === "separation" &&
      job.separation?.status === "processing";
    return {
      label: separating
        ? "Đang tách audio"
        : job.autoPipeline.phase === "master"
          ? "Đang tạo TTS"
          : `Đang xử lý ${job.autoPipeline.phase}`,
      progressPercent: separating
        ? job.separation?.progressPercent
        : job.autoPipeline.progressPercent,
      colorClass: "bg-indigo-400",
    };
  }
  if (job.masterGeneration?.status === "generating") {
    return {
      label: "Đang tạo TTS Master",
      progressPercent: job.masterGeneration.progressPercent,
      colorClass: "bg-indigo-400",
    };
  }
  if (job.separation?.status === "processing") {
    return {
      label: "Đang tách audio",
      progressPercent: job.separation.progressPercent,
      colorClass: "bg-violet-400",
    };
  }
  if (job.finalMix?.status === "running" || job.audioMix?.status === "running") {
    const task = job.finalMix?.status === "running" ? job.finalMix : job.audioMix;
    return {
      label: "Đang Mix Audio",
      progressPercent: task?.progressPercent,
      colorClass: "bg-cyan-400",
    };
  }
  if (job.videoExport?.status === "running") {
    return {
      label: job.videoExport.detail?.toLowerCase().includes("audio mp4")
        ? "Đang cập nhật Audio MP4"
        : "Đang Render",
      progressPercent: job.videoExport.progressPercent,
      colorClass: "bg-sky-400",
    };
  }
  return null;
}

function formatFileSize(bytes: number): string {
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
  return `${(bytes / (1024 * 1024)).toFixed(2)} MB`;
}

function formatDuration(seconds: number): string {
  const totalMilliseconds = Math.round(seconds * 1000);
  const hours = Math.floor(totalMilliseconds / 3_600_000);
  const minutes = Math.floor((totalMilliseconds % 3_600_000) / 60_000);
  const remainingSeconds = Math.floor((totalMilliseconds % 60_000) / 1000);
  const milliseconds = totalMilliseconds % 1000;
  const pad = (value: number, length = 2) =>
    String(value).padStart(length, "0");
  return `${pad(hours)}:${pad(minutes)}:${pad(remainingSeconds)}.${pad(milliseconds, 3)}`;
}

function formatElapsed(seconds: number | undefined): string {
  const safeSeconds = Math.max(0, Math.floor(seconds || 0));
  const hours = Math.floor(safeSeconds / 3600);
  const minutes = Math.floor((safeSeconds % 3600) / 60);
  const remainingSeconds = safeSeconds % 60;
  const pad = (value: number) => String(value).padStart(2, "0");
  return hours > 0
    ? `${pad(hours)}:${pad(minutes)}:${pad(remainingSeconds)}`
    : `${pad(minutes)}:${pad(remainingSeconds)}`;
}

function formatFrameRate(frameRate: number | null): string {
  return frameRate
    ? `${frameRate.toFixed(3).replace(/0+$/, "").replace(/\.$/, "")} fps`
    : "Không xác định";
}

function statusLabel(job: VideoDubbingJob | null): string {
  if (!job) return "Đang chuẩn bị upload";
  switch (job.status) {
    case "uploading":
      return "Đang tải video lên";
    case "probing":
      return "Đang kiểm tra video";
    case "completed":
      return "Đã kiểm tra video";
    case "failed":
      return "Kiểm tra thất bại";
    case "cancelled":
      return "Đã hủy";
    case "interrupted":
      return "Bị gián đoạn";
  }
}

function MetadataGrid({ metadata }: { metadata: VideoDubbingMetadata }) {
  const details = [
    ["Thời lượng", formatDuration(metadata.durationSeconds)],
    ["Độ phân giải", `${metadata.width} × ${metadata.height}`],
    ["Frame rate", formatFrameRate(metadata.frameRate)],
    ["Video codec", metadata.videoCodec.toUpperCase()],
    ["Audio codec", metadata.audioCodec?.toUpperCase() || "Không có audio"],
    [
      "Audio",
      metadata.audioCodec
        ? `${metadata.audioSampleRate ? `${metadata.audioSampleRate} Hz` : "?"} · ${metadata.audioChannels ? `${metadata.audioChannels} kênh` : "?"}`
        : "Không có audio stream",
    ],
    ["Container", metadata.container],
    ["Dung lượng", formatFileSize(metadata.sizeBytes)],
  ];

  return (
    <dl className="grid grid-cols-1 sm:grid-cols-2 gap-2 mt-4">
      {details.map(([label, value]) => (
        <div
          key={label}
          className="flex items-start justify-between gap-3 rounded-xl border border-slate-800 bg-slate-950/70 px-3 py-2.5"
        >
          <dt className="text-xs text-slate-400">{label}</dt>
          <dd className="text-xs font-semibold text-slate-100 text-right break-all">
            {value}
          </dd>
        </div>
      ))}
    </dl>
  );
}

export default function VideoDubbingTab() {
  const [video, setVideo] = useState<SelectedVideo | null>(null);
  const [srt, setSrt] = useState<SelectedSrt | null>(null);
  const [subtitleCueOverridesByVideoId, setSubtitleCueOverridesByVideoId] = useState<
    Record<string, VideoDubbingSubtitleCue[]>
  >({});
  const [selectedSubtitleCue, setSelectedSubtitleCue] = useState<number | null>(null);
  const timelineCueClipboardRef = useRef<TimelineCueClipboard | null>(null);
  const [textOverlays, setTextOverlays] = useState<VideoDubbingTextOverlayCue[]>([]);
  const [characterCardCuesByVideoId, setCharacterCardCuesByVideoId] = useState<
    Record<string, VideoDubbingTextOverlayCue[]>
  >({});
  const [characterCardStyle, setCharacterCardStyle] = useState<CharacterCardStyle>(
    DEFAULT_CHARACTER_CARD_STYLE,
  );
  const [textTracks, setTextTracks] = useState<VideoDubbingTextTrack[]>([DEFAULT_TEXT_TRACK]);
  const [activeTextTrackId, setActiveTextTrackId] = useState(DEFAULT_TEXT_TRACK_ID);
  const [selectedTextOverlay, setSelectedTextOverlay] = useState<number | null>(null);
  const [logoTitleCollapsed, setLogoTitleCollapsed] = useState(false);
  const [settingsCollapsed, setSettingsCollapsed] = useState(false);
  const [leftPanelTab, setLeftPanelTab] = useState<"settings" | "sources">("settings");
  const [voices, setVoices] = useState<VideoDubbingVoice[]>([]);
  const [selectedVoiceId, setSelectedVoiceId] = useState("");
  const [voicesError, setVoicesError] = useState<string | null>(null);
  const [speedPriority, setSpeedPriority] = useState<
    "balanced" | "strict" | "natural"
  >("balanced");
  const [minSpeed, setMinSpeed] = useState(0.8);
  const [maxSpeed, setMaxSpeed] = useState(1.5);
  const [masterError, setMasterError] = useState<string | null>(null);
  const [mixerSettings, setMixerSettings] = useState<VideoDubbingMixerSettings>(
    DEFAULT_MIXER_SETTINGS,
  );
  const [mixerVolumeDrafts, setMixerVolumeDrafts] = useState<
    Partial<Record<VideoDubbingMixerTrack, string>>
  >({});
  const [mixerSettingsSaved, setMixerSettingsSaved] = useState(false);
  const [mixerError, setMixerError] = useState<string | null>(null);
  const [previewError, setPreviewError] = useState<string | null>(null);
  const [previewStatus, setPreviewStatus] = useState<
    "stopped" | "playing" | "paused"
  >("stopped");
  const [previewCurrentTime, setPreviewCurrentTime] = useState(0);
  const [subtitleTimelineCursorTime, setSubtitleTimelineCursorTime] = useState(0);
  const [videoPreviewReady, setVideoPreviewReady] = useState(false);
  const [mediaError, setMediaError] = useState<string | null>(null);
  const [audioUpdateErrors, setAudioUpdateErrors] = useState<Record<string, string>>({});
  const [coverEditorTarget, setCoverEditorTarget] = useState<VideoDubbingJob | null>(null);
  const [coverEditorFile, setCoverEditorFile] = useState<File | null>(null);
  const [coverEditorPreviewUrl, setCoverEditorPreviewUrl] = useState<string | null>(null);
  const [coverEditorFrameCount, setCoverEditorFrameCount] = useState(5);
  const [coverEditorBusy, setCoverEditorBusy] = useState(false);
  const [coverEditorError, setCoverEditorError] = useState<string | null>(null);
  const [coverEditorDragOver, setCoverEditorDragOver] = useState(false);
  const [characterCardRegion, setCharacterCardRegion] = useState<CharacterCardOcrRegion | null>(null);
  const [characterCardRegionDraft, setCharacterCardRegionDraft] = useState<CharacterCardOcrRegion | null>(null);
  const [characterCardDrawStart, setCharacterCardDrawStart] = useState<CharacterCardOcrPoint | null>(null);
  const [characterCardDrawMode, setCharacterCardDrawMode] = useState(false);
  const [characterCardOcrStartOffset, setCharacterCardOcrStartOffset] = useState(5);
  const [characterCardOcrDuration, setCharacterCardOcrDuration] = useState(10);
  const [characterCardScanCollapsed, setCharacterCardScanCollapsed] = useState(false);
  const [characterCardReferenceFile, setCharacterCardReferenceFile] = useState<File | null>(null);
  const [characterCardReferencePreviewUrl, setCharacterCardReferencePreviewUrl] = useState<string | null>(null);
  const [characterCardReferenceFramesToSkip, setCharacterCardReferenceFramesToSkip] = useState(30);
  const [characterCardReferenceSimilarity, setCharacterCardReferenceSimilarity] = useState(0.72);
  const [characterCardReferenceScanJob, setCharacterCardReferenceScanJob] =
    useState<CharacterCardReferenceScanJob | null>(null);
  const [characterCardReferenceSelectedIds, setCharacterCardReferenceSelectedIds] = useState<string[]>([]);
  const [characterCardReferenceError, setCharacterCardReferenceError] = useState<string | null>(null);
  const characterCardReferenceScanRequestRef = useRef(0);
  const characterCardReferenceScanJobIdRef = useRef<string | null>(null);
  const [characterCardOcrJob, setCharacterCardOcrJob] = useState<CharacterCardOcrJob | null>(null);
  const [characterCardOcrError, setCharacterCardOcrError] = useState<string | null>(null);
  const [characterCardOcrWorker, setCharacterCardOcrWorker] = useState<CharacterCardOcrWorker>({
    status: "stopped",
    message: "OCR thường trực đang tắt.",
  });
  const characterCardOcrRequestRef = useRef(0);
  const [logoEnabled, setLogoEnabled] = useState(false);
  const [logoWidthPercent, setLogoWidthPercent] = useState(15);
  const [logoPaddingPx, setLogoPaddingPx] = useState(24);
  const [logoPosition, setLogoPosition] =
    useState<VideoDubbingOverlayPosition>("top-left");
  const [logoUploading, setLogoUploading] = useState(false);
  const [subtitlesEnabled, setSubtitlesEnabled] = useState(false);
  const [subtitleFontSize, setSubtitleFontSize] = useState(32);
  const [subtitleFontFamily, setSubtitleFontFamily] = useState("Arial");
  const [subtitleFontOptions, setSubtitleFontOptions] = useState<string[]>(SUBTITLE_FONT_OPTIONS);
  const [subtitleColor, setSubtitleColor] = useState("#ffffff");
  const [subtitleBackgroundColor, setSubtitleBackgroundColor] =
    useState("#000000");
  const [subtitleBackgroundTransparent, setSubtitleBackgroundTransparent] =
    useState(false);
  const [subtitleBackgroundMode, setSubtitleBackgroundMode] = useState<
    "none" | "color" | "image"
  >("color");
  const [subtitleBold, setSubtitleBold] = useState(false);
  const [subtitleItalic, setSubtitleItalic] = useState(false);
  const [subtitleUnderline, setSubtitleUnderline] = useState(false);
  const [subtitleTextCase, setSubtitleTextCase] = useState<TextCase>("none");
  const [subtitleOutlineEnabled, setSubtitleOutlineEnabled] = useState(false);
  const [subtitleOutlineColor, setSubtitleOutlineColor] = useState("#000000");
  const [subtitleOutlineWidthPx, setSubtitleOutlineWidthPx] = useState(2);
  const [subtitleCharacterSpacingPx, setSubtitleCharacterSpacingPx] = useState(0);
  const [subtitleLineSpacingPx, setSubtitleLineSpacingPx] = useState(0);
  const [subtitlePaddingPx, setSubtitlePaddingPx] = useState(8);
  const [subtitleMarginPx, setSubtitleMarginPx] = useState(32);
  const [exportQuality, setExportQuality] = useState<VideoDubbingExportQuality>("high");
  const subtitleMarginSaveTimerRef = useRef<number | null>(null);
  const pendingSubtitleMarginSaveRef = useRef<{ jobId: string; value: number } | null>(null);
  const [subtitlePosition, setSubtitlePosition] =
    useState<VideoDubbingOverlayPosition>("bottom-center");
  const [subtitleBackgroundImage, setSubtitleBackgroundImage] = useState<
    string | null
  >(null);
  const [subtitleBackgroundPickerOpen, setSubtitleBackgroundPickerOpen] = useState(false);
  const [subtitleBackgrounds, setSubtitleBackgrounds] = useState<string[]>([
    "bg1",
  ]);
  const [separationAvailability, setSeparationAvailability] =
    useState<VideoDubbingSeparationAvailability | null>(null);
  const [separationError, setSeparationError] = useState<string | null>(null);
  const [jobHistory, setJobHistory] = useState<VideoDubbingJobHistoryItem[]>(
    [],
  );
  const [historyError, setHistoryError] = useState<string | null>(null);
  const [historyLoading, setHistoryLoading] = useState(false);
  const [historyExpanded, setHistoryExpanded] = useState(false);
  const [projects, setProjects] = useState<VideoDubbingProject[]>([]);
  const [activeProject, setActiveProject] = useState<VideoDubbingProject | null>(null);
  const importProjectRef = useRef<VideoDubbingProject | null>(null);
  const importProjectPromiseRef = useRef<Promise<VideoDubbingProject> | null>(null);
  const [defaultProjectId, setDefaultProjectId] = useState<string | null>(null);
  const [projectBusy, setProjectBusy] = useState(false);
  const [projectError, setProjectError] = useState<string | null>(null);
  const [projectSaveState, setProjectSaveState] = useState<"saved" | "saving" | "error">("saved");
  const [projectReady, setProjectReady] = useState(false);
  const [srtContent, setSrtContent] = useState("");
  const projectSaveRequestRef = useRef(0);
  const [projectsExpanded, setProjectsExpanded] = useState(false);
  const [guideOpen, setGuideOpen] = useState(false);
  const [videoWorkspaceTab, setVideoWorkspaceTab] = useState<"preview" | "merged" | "end-scene">("preview");
  const [timelineWorkspaceTab, setTimelineWorkspaceTab] = useState<"subtitle" | "audio" | "subtitle-audio">("subtitle");
  const [endSceneDurationSeconds, setEndSceneDurationSeconds] = useState(DEFAULT_END_SCENE_DURATION_SECONDS);
  const [endSceneAspectRatio, setEndSceneAspectRatio] =
    useState<VideoDubbingEndSceneAspectRatio>(DEFAULT_END_SCENE_ASPECT_RATIO);
  const endScenePreviewContainerRef = useRef<HTMLDivElement | null>(null);
  const [endScenePreviewSize, setEndScenePreviewSize] = useState({
    width: 640,
    height: 360,
  });
  const [endSceneTextOverlays, setEndSceneTextOverlays] = useState<VideoDubbingTextOverlayCue[]>(() => [
    createDefaultEndSceneText(),
  ]);
  const [selectedEndSceneTextIndex, setSelectedEndSceneTextIndex] = useState<number | null>(0);
  const endSceneStageRef = useRef<HTMLDivElement | null>(null);
  const [endSceneDrag, setEndSceneDrag] = useState<{
    index: number;
    pointerX: number;
    pointerY: number;
    xPercent: number;
    yPercent: number;
    stageLeft: number;
    stageTop: number;
    stageWidth: number;
    stageHeight: number;
  } | null>(null);
  const [subtitleTimelineZoom, setSubtitleTimelineZoom] = useState(18);
  const [subtitleTimelineViewportWidth, setSubtitleTimelineViewportWidth] = useState(720);
  const [subtitleTimingAdjustmentsMs, setSubtitleTimingAdjustmentsMs] = useState({
    start: 100,
    end: 100,
    move: 100,
  });
  const [subtitleTimelineDrag, setSubtitleTimelineDrag] = useState<SubtitleTimelineDrag | null>(null);
  const subtitleTimelineDragMovedRef = useRef(false);
  const [textOverlayPreviewDrag, setTextOverlayPreviewDrag] = useState<TextOverlayPreviewDrag | null>(null);
  const [exportClockNow, setExportClockNow] = useState(() => Date.now());
  const [fileDetailsOpen, setFileDetailsOpen] = useState(false);
  const [detailRowIndex, setDetailRowIndex] = useState<number | null>(null);
  const [videoFiles, setVideoFiles] = useState<QueuedVideo[]>([]);
  const [subtitleFiles, setSubtitleFiles] = useState<QueuedSubtitle[]>([]);
  const [queueStates, setQueueStates] = useState<
    Record<number, QueueItemState>
  >({});
  const [queueRunning, setQueueRunning] = useState(false);
  const [joinAfterQueue, setJoinAfterQueue] = useState(false);
  const [concatPreflight, setConcatPreflight] = useState<{ status: "idle" | "checking" | "compatible" | "incompatible"; message: string }>({ status: "idle", message: "" });
  const [concatStatus, setConcatStatus] = useState<"idle" | "running" | "completed" | "failed" | "skipped">("idle");
  const [joinedVideo, setJoinedVideo] = useState<{ jobId: string; fileName: string; sizeBytes: number } | null>(null);
  const [settingsSyncRunning, setSettingsSyncRunning] = useState(false);
  const [settingsSyncMessage, setSettingsSyncMessage] = useState<string | null>(null);
  const [srtDownloadMessage, setSrtDownloadMessage] = useState<string | null>(null);
  const [allVideosAction, setAllVideosAction] =
    useState<AllVideosActionProgress | null>(null);
  const autoPipelineEnabled = true;
  const [autoPipelineExpanded, setAutoPipelineExpanded] = useState(true);
  const [masterPanelExpanded, setMasterPanelExpanded] = useState(false);
  const [subtitleAudioItems, setSubtitleAudioItems] = useState<SubtitleAudioRow[]>([]);
  const [subtitleAudioError, setSubtitleAudioError] = useState<string | null>(null);
  const [subtitleAudioSyncing, setSubtitleAudioSyncing] = useState(false);
  const [subtitleAudioRegeneratingId, setSubtitleAudioRegeneratingId] = useState<string | null>(null);
  const [subtitleAudioMasterBusy, setSubtitleAudioMasterBusy] = useState(false);
  const [subtitleAudioDrafts, setSubtitleAudioDrafts] = useState<Record<string, string>>({});
  const [subtitleAudioPlayingId, setSubtitleAudioPlayingId] = useState<string | null>(null);
  const [subtitleAudioFilterOpen, setSubtitleAudioFilterOpen] = useState(false);
  const [subtitleAudioTimingStepMs, setSubtitleAudioTimingStepMs] = useState(100);
  const [subtitleAudioShortFilterEnabled, setSubtitleAudioShortFilterEnabled] = useState(false);
  const [subtitleAudioMaxCharacterCount, setSubtitleAudioMaxCharacterCount] = useState(5);
  const [subtitleAudioSpecialCharactersFilterEnabled, setSubtitleAudioSpecialCharactersFilterEnabled] = useState(false);
  const [subtitleAudioSimilarFilterEnabled, setSubtitleAudioSimilarFilterEnabled] = useState(false);
  const subtitleAudioSyncRequestRef = useRef(0);
  const subtitleAudioKnownNonEmptyJobIdsRef = useRef(new Set<string>());
  const subtitleAudioPlayerRef = useRef<HTMLAudioElement | null>(null);
  const subtitleAudioPlaybackIdRef = useRef<string | null>(null);
  const activeSubtitleSourceJobIdRef = useRef<string | null>(null);
  const [separationPanelExpanded, setSeparationPanelExpanded] = useState(false);
  const [mixerPanelExpanded, setMixerPanelExpanded] = useState(true);
  const [autoPipelineTtsMasterEnabled, setAutoPipelineTtsMasterEnabled] =
    useState(true);
  const [autoPipelineDemucsEnabled, setAutoPipelineDemucsEnabled] =
    useState(false);
  const [originalAudioVolumePercent, setOriginalAudioVolumePercent] =
    useState(100);
  const [autoPipelineError, setAutoPipelineError] = useState<string | null>(
    null,
  );
  const [autoPipelineSaving, setAutoPipelineSaving] = useState(false);
  const autoPipelineConfigJobRef = useRef<string | null>(null);
  const autoPipelineSavedConfigKeyRef = useRef<string | null>(null);
  const queueCancelRef = useRef(false);
  const queueCurrentJobIdRef = useRef<string | null>(null);
  const videoInputRef = useRef<HTMLInputElement | null>(null);
  const previewVideoRef = useRef<HTMLVideoElement | null>(null);
  const previewStageRef = useRef<HTMLDivElement | null>(null);
  const subtitleTimelineTrackRef = useRef<HTMLDivElement | null>(null);
  const subtitleTimelineScrollRef = useRef<HTMLDivElement | null>(null);
  const srtInputRef = useRef<HTMLInputElement | null>(null);
  const subtitleBrowseTargetRef = useRef<string | null>(null);
  const logoInputRef = useRef<HTMLInputElement | null>(null);
  const coverEditorInputRef = useRef<HTMLInputElement | null>(null);
  const uploadRef = useRef<XMLHttpRequest | null>(null);
  const videoGenerationRef = useRef(0);
  const srtGenerationRef = useRef(0);
  const activeJobIdRef = useRef<string | null>(null);
  const characterCardCueVideoIdRef = useRef<string | null>(null);
  const subtitleTimelineCursorRef = useRef(0);
  const subtitleTimelineFitRef = useRef(false);
  const subtitleTimelineZoomFocusRef = useRef<"playhead" | "left">("playhead");
  const mixerSettingsTimerRef = useRef<number | null>(null);
  const mixerSettingsRequestRef = useRef(0);
  const mixerSettingsVersionRef = useRef(0);
  const mixerSaveChainRef = useRef(Promise.resolve());
  const mixerTouchedRef = useRef(false);
  const audioContextRef = useRef<AudioContext | null>(null);
  const previewNodesRef = useRef<Map<VideoDubbingMixerTrack, PreviewTrackNode>>(
    new Map(),
  );
  const previewControllerRef = useRef<VideoDubbingPreviewController | null>(
    null,
  );
  const previewJobIdRef = useRef<string | null>(null);
  const previewTrackKeyRef = useRef<string | null>(null);

  useEffect(() => {
    if (!coverEditorFile) {
      setCoverEditorPreviewUrl(null);
      return;
    }
    const previewUrl = URL.createObjectURL(coverEditorFile);
    setCoverEditorPreviewUrl(previewUrl);
    return () => URL.revokeObjectURL(previewUrl);
  }, [coverEditorFile]);

  useEffect(() => {
    if (!characterCardReferenceFile) {
      setCharacterCardReferencePreviewUrl(null);
      return;
    }
    const previewUrl = URL.createObjectURL(characterCardReferenceFile);
    setCharacterCardReferencePreviewUrl(previewUrl);
    return () => URL.revokeObjectURL(previewUrl);
  }, [characterCardReferenceFile]);

  useEffect(() => () => {
    const scanId = characterCardReferenceScanJobIdRef.current;
    if (!scanId) return;
    characterCardReferenceScanRequestRef.current += 1;
    void fetch(`/api/video-dubbing/character-card-reference-scans/${scanId}/cancel`, {
      method: "POST",
    }).catch((error: unknown) => {
      console.error("Không thể dừng quét ảnh mẫu khi rời video:", error);
    });
  }, [video?.job?.id]);

  useEffect(() => {
    let active = true;
    const refreshWorkerStatus = async () => {
      try {
        const response = await fetch("/api/subtitle-ocr/worker/status");
        const result = await response.json() as { worker?: CharacterCardOcrWorker };
        if (active && response.ok && result.worker) setCharacterCardOcrWorker(result.worker);
      } catch (error) {
        if (active) {
          setCharacterCardOcrError(
            error instanceof Error ? error.message : "Không lấy được trạng thái OCR thường trực.",
          );
        }
      }
    };
    void refreshWorkerStatus();
    if (characterCardOcrWorker.status !== "starting" && characterCardOcrWorker.status !== "busy") {
      return () => { active = false; };
    }
    const timer = window.setInterval(() => void refreshWorkerStatus(), 800);
    return () => {
      active = false;
      window.clearInterval(timer);
    };
  }, [characterCardOcrWorker.status]);

  const releasePreviewGraph = (updateUi = true) => {
    previewControllerRef.current?.dispose();
    previewControllerRef.current = null;
    previewVideoRef.current?.pause();
    for (const { element } of previewNodesRef.current.values()) {
      element.pause();
      element.removeAttribute("src");
      element.load();
    }
    previewNodesRef.current.clear();
    const context = audioContextRef.current;
    audioContextRef.current = null;
    if (context && context.state !== "closed") {
      void context.close().catch((error: unknown) => {
        console.error("Không thể đóng Web Audio context:", error);
      });
    }
    previewJobIdRef.current = null;
    previewTrackKeyRef.current = null;
    if (updateUi) {
      setPreviewStatus("stopped");
      setPreviewCurrentTime(0);
      setSubtitleTimelineCursorTime(0);
      if (previewVideoRef.current && videoPreviewReady) {
        previewVideoRef.current.currentTime = 0;
      }
    }
  };

  const pauseMixerPreview = () => {
    previewControllerRef.current?.pause();
    setPreviewStatus("paused");
  };

  const seekMixerPreview = (time: number) => {
    const seekTo = Math.max(0, time);
    if (previewControllerRef.current) {
      previewControllerRef.current.seek(seekTo);
    } else if (previewVideoRef.current && videoPreviewReady) {
      previewVideoRef.current.currentTime = seekTo;
    }
    setPreviewCurrentTime(seekTo);
    setSubtitleTimelineCursorTime(seekTo);
  };

  const seekSubtitleTimeline = (time: number) => {
    const sourceDuration = job?.metadata?.durationSeconds ?? subtitleTimelineDuration;
    const endSceneEnabled = Boolean(job?.overlaySettings?.endScene?.enabled);
    const maximum = sourceDuration +
      (endSceneEnabled ? endSceneDurationSeconds : 0);
    const seekTo = Math.max(0, Math.min(time, maximum));
    if (endSceneEnabled && seekTo > sourceDuration) {
      previewControllerRef.current?.pause();
      if (previewVideoRef.current && videoPreviewReady) {
        previewVideoRef.current.currentTime = sourceDuration;
      }
      setPreviewStatus("paused");
      setPreviewCurrentTime(sourceDuration);
      setSubtitleTimelineCursorTime(seekTo);
      setVideoWorkspaceTab("preview");
      return;
    }
    if (videoWorkspaceTab === "end-scene") setVideoWorkspaceTab("preview");
    seekMixerPreview(seekTo);
  };
  const getCharacterCardPoint = (event: ReactPointerEvent<HTMLDivElement>) => {
    const bounds = previewStageRef.current?.getBoundingClientRect();
    if (!bounds || bounds.width <= 0 || bounds.height <= 0) return null;
    return {
      x: Math.max(0, Math.min(1, (event.clientX - bounds.left) / bounds.width)),
      y: Math.max(0, Math.min(1, (event.clientY - bounds.top) / bounds.height)),
    };
  };
  const startCharacterCardRegion = (event: ReactPointerEvent<HTMLDivElement>) => {
    if (!characterCardDrawMode) return;
    const point = getCharacterCardPoint(event);
    if (!point) return;
    event.preventDefault();
    event.stopPropagation();
    event.currentTarget.setPointerCapture(event.pointerId);
    setCharacterCardDrawStart(point);
    setCharacterCardRegionDraft({ left: point.x, top: point.y, width: 0, height: 0 });
    setCharacterCardOcrError(null);
  };
  const moveCharacterCardRegion = (event: ReactPointerEvent<HTMLDivElement>) => {
    if (!characterCardDrawStart) return;
    const point = getCharacterCardPoint(event);
    if (!point) return;
    setCharacterCardRegionDraft({
      left: Math.min(characterCardDrawStart.x, point.x),
      top: Math.min(characterCardDrawStart.y, point.y),
      width: Math.abs(point.x - characterCardDrawStart.x),
      height: Math.abs(point.y - characterCardDrawStart.y),
    });
  };
  const finishCharacterCardRegion = (event: ReactPointerEvent<HTMLDivElement>) => {
    if (!characterCardDrawStart) return;
    const point = getCharacterCardPoint(event);
    if (point) {
      const region = {
        left: Math.min(characterCardDrawStart.x, point.x),
        top: Math.min(characterCardDrawStart.y, point.y),
        width: Math.abs(point.x - characterCardDrawStart.x),
        height: Math.abs(point.y - characterCardDrawStart.y),
      };
      if (region.width >= 0.01 && region.height >= 0.01) {
        setCharacterCardRegion(region);
      } else {
        setCharacterCardOcrError("Vùng chọn quá nhỏ. Hãy kéo để khoanh vùng chữ trên video.");
      }
    }
    setCharacterCardDrawStart(null);
    setCharacterCardRegionDraft(null);
    setCharacterCardDrawMode(false);
  };
  const cancelCharacterCardRegionDraw = () => {
    setCharacterCardDrawStart(null);
    setCharacterCardRegionDraft(null);
    setCharacterCardDrawMode(false);
  };

  const restartMixerPreview = async () => {
    const controller = previewControllerRef.current;
    if (!controller) {
      seekMixerPreview(0);
      await playMixerPreview();
      return;
    }
    setPreviewError(null);
    try {
      const playback = controller.restart();
      await audioContextRef.current?.resume();
      await playback;
      setPreviewStatus("playing");
    } catch (error) {
      setPreviewStatus("paused");
      setPreviewError(
        error instanceof Error
          ? error.message
          : "Không thể khởi động lại preview.",
      );
    }
  };

  const updateMixerSetting = (
    track: VideoDubbingMixerTrack,
    patch: Partial<VideoDubbingMixerSettings[VideoDubbingMixerTrack]>,
  ) => {
    mixerSettingsVersionRef.current++;
    mixerTouchedRef.current = true;
    setMixerSettingsSaved(false);
    setMixerSettings((current) => ({
      ...current,
      [track]: { ...current[track], ...patch },
    }));
  };

  const playMixerPreview = async () => {
    const job = video?.job;
    const videoElement = previewVideoRef.current;
    if (!job || !videoElement || !job.metadata) return;
    if (previewStatus === "playing") {
      pauseMixerPreview();
      return;
    }
    const availableTracks: Array<{
      track: VideoDubbingMixerTrack;
      url: string;
    }> = [];
    if (
      job.masterGeneration?.sizeBytes &&
      job.masterGeneration.durationSeconds !== undefined
    ) {
      availableTracks.push({
        track: "ttsMaster",
        url: job.masterEdit?.clips.length
          ? `/api/video-dubbing/jobs/${job.id}/master-edit/preview?v=${job.masterEdit.updatedAt}`
          : `/api/video-dubbing/jobs/${job.id}/master-audio?v=${job.masterGeneration.audioVersion || job.masterGeneration.sizeBytes}`,
      });
    }
    if (job.separation?.vocalsSizeBytes) {
      availableTracks.push({
        track: "vocals",
        url: `/api/video-dubbing/jobs/${job.id}/separation/vocals`,
      });
    }
    if (job.separation?.instrumentalSizeBytes) {
      availableTracks.push({
        track: "instrumental",
        url: `/api/video-dubbing/jobs/${job.id}/separation/instrumental`,
      });
    }
    if (!videoPreviewReady) {
      setPreviewError("Video chưa sẵn sàng để xem trước.");
      return;
    }
    setPreviewError(null);
    try {
      const trackKey = availableTracks
        .map(({ track, url }) => `${track}:${url}`)
        .join("|");
      let context = audioContextRef.current;
      if (
        !context ||
        previewJobIdRef.current !== job.id ||
        previewTrackKeyRef.current !== trackKey
      ) {
        releasePreviewGraph(false);
        context = new AudioContext();
        const limiter = context.createDynamicsCompressor();
        limiter.threshold.value = -1;
        limiter.knee.value = 0;
        limiter.ratio.value = 20;
        limiter.attack.value = 0.003;
        limiter.release.value = 0.15;
        limiter.connect(context.destination);
        audioContextRef.current = context;
        previewJobIdRef.current = job.id;
        previewTrackKeyRef.current = trackKey;
        for (const { track, url } of availableTracks) {
          const element = new Audio();
          element.preload = "auto";
          element.src = url;
          const source = context.createMediaElementSource(element);
          const gain = context.createGain();
          source.connect(gain);
          gain.connect(limiter);
          const setting = mixerSettings[track];
          gain.gain.value = setting.muted ? 0 : setting.volumePercent / 100;
          previewNodesRef.current.set(track, { element, gain });
        }
      }
      const tracks = [...previewNodesRef.current.values()].map(
        ({ element }) => element,
      );
      if (!previewControllerRef.current) {
        const durationSeconds = job.metadata.durationSeconds;
        previewControllerRef.current = new VideoDubbingPreviewController(
          videoElement,
          tracks,
          durationSeconds,
          (time) => {
            setPreviewCurrentTime(time);
            setSubtitleTimelineCursorTime(time);
            if (time >= durationSeconds - 0.04) {
              setPreviewStatus("stopped");
            }
          },
          (error) => {
            setPreviewError(
              error instanceof Error
                ? error.message
                : "Không thể đồng bộ audio preview.",
            );
          },
        );
      }
      const playback = previewControllerRef.current.play();
      await context.resume();
      await playback;
      setPreviewStatus("playing");
    } catch (error) {
      for (const { element } of previewNodesRef.current.values()) {
        element.pause();
      }
      setPreviewStatus("paused");
      previewControllerRef.current?.pause();
      previewVideoRef.current?.pause();
      setPreviewError(
        error instanceof Error
          ? error.message
          : "Không thể phát mixer preview.",
      );
    }
  };

  const loadJobHistory = async (): Promise<VideoDubbingJobHistoryItem[]> => {
    setHistoryLoading(true);
    setHistoryError(null);
    try {
      const response = await fetch("/api/video-dubbing/jobs");
      const result = await response.json();
      if (!response.ok || !Array.isArray(result.jobs)) {
        throw new Error(result.error || "Không thể tải lịch sử Video Dubbing.");
      }
      const items = result.jobs as VideoDubbingJobHistoryItem[];
      setJobHistory(items);
      return items;
    } catch (error) {
      const message =
        error instanceof Error
          ? error.message
          : "Không thể tải lịch sử Video Dubbing.";
      setHistoryError(message);
      return [];
    } finally {
      setHistoryLoading(false);
    }
  };

  const loadProjects = async () => {
    try {
      const response = await fetch("/api/video-dubbing/projects");
      const result = await response.json();
      if (!response.ok || !Array.isArray(result.projects)) throw new Error(result.error || "Không thể tải project.");
      setProjects(result.projects as VideoDubbingProject[]);
      return result.projects as VideoDubbingProject[];
    } catch (error) {
      setProjectError(error instanceof Error ? error.message : "Không thể tải project.");
      return [];
    }
  };

  const makeProjectWorkspace = () => ({
    version: 1,
    mixerSettings, selectedVoiceId, minSpeed, maxSpeed, speedPriority,
    autoPipelineTtsMasterEnabled, autoPipelineDemucsEnabled, originalAudioVolumePercent,
    logoEnabled, logoWidthPercent, logoPaddingPx, logoPosition,
    subtitlesEnabled, subtitleFontSize, subtitleFontFamily, subtitleColor,
    subtitleMarginPx,
    subtitleBackgroundColor, subtitleBackgroundTransparent, subtitleBackgroundMode,
    subtitleBold, subtitleItalic, subtitleUnderline, subtitleTextCase,
    subtitleOutlineEnabled, subtitleOutlineColor, subtitleOutlineWidthPx,
    subtitleCharacterSpacingPx, subtitleLineSpacingPx, subtitlePaddingPx,
    subtitlePosition, subtitleBackgroundImage, exportQuality,
    subtitleCueOverrides: video?.job?.id
      ? subtitleCueOverridesByVideoId[video.job.id] ?? null
      : null,
    subtitleCueOverridesByVideoId,
    textOverlays: textOverlays.filter((cue) => cue.kind !== "character-card"),
    characterCardStyle,
    characterCardCuesByVideoId: video?.job?.id
      ? {
          ...characterCardCuesByVideoId,
          [video.job.id]: textOverlays.filter((cue) => cue.kind === "character-card"),
        }
      : characterCardCuesByVideoId,
    textTracks, subtitleTimelineZoom,
    endSceneTemplate: {
      durationSeconds: endSceneDurationSeconds,
      aspectRatio: endSceneAspectRatio,
      textOverlays: endSceneTextOverlays,
    },
  });

  const createProject = async () => {
    const name = window.prompt("Tên project Video Dubbing", video?.fileName?.replace(/\.[^.]+$/, "") || "Project mới");
    if (!name?.trim()) return;
    if (video?.job?.id && projects.some((project) => project.jobIds.includes(video.job!.id))) {
      setProjectError("Video này đã thuộc một project. Hãy tiếp tục lưu project đang mở hoặc tạo project mới rồi tải video vào project đó.");
      return;
    }
    setProjectBusy(true);
    setProjectError(null);
    try {
      const response = await fetch("/api/video-dubbing/projects", {
        method: "POST", headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ name: name.trim() }),
      });
      const result = await response.json();
      if (!response.ok || !result.project) throw new Error(result.error || "Không thể tạo project.");
      const created = result.project as VideoDubbingProject;
      const jobId = video?.job?.id;
      const saveResponse = await fetch(`/api/video-dubbing/projects/${created.id}`, {
        method: "PUT", headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          jobIds: jobId ? [jobId] : [], activeJobId: jobId || null,
          srt: srtContent ? { fileName: srt?.fileName || "subtitles.srt", content: srtContent } : null,
          workspace: makeProjectWorkspace(),
        }),
      });
      const saved = await saveResponse.json();
      if (!saveResponse.ok || !saved.project) throw new Error(saved.error || "Project được tạo nhưng chưa lưu được dữ liệu hiện tại.");
      setActiveProject(saved.project);
      importProjectRef.current = saved.project;
      setProjectReady(true);
      setProjectSaveState("saved");
      setProjects((items) => [saved.project, ...items.filter((item) => item.id !== saved.project.id)]);
    } catch (error) {
      setProjectError(error instanceof Error ? error.message : "Không thể tạo project.");
    } finally { setProjectBusy(false); }
  };

  const openProject = async (project: VideoDubbingProject) => {
    setProjectReady(false);
    setProjectError(null);
    setProjectBusy(true);
    subtitleTimelineFitRef.current = false;
    subtitleTimelineZoomFocusRef.current = "playhead";
    try {
      const response = await fetch(`/api/video-dubbing/projects/${project.id}`);
      const result = await response.json();
      if (!response.ok || !result.project) throw new Error(result.error || "Không thể mở project.");
      const loaded = result.project as VideoDubbingProject;
      const w = loaded.workspace || {};
      const savedCharacterCardCues = w.characterCardCuesByVideoId;
      const loadedCharacterCardCuesByVideoId: Record<
        string,
        VideoDubbingTextOverlayCue[]
      > = {};
      if (
        savedCharacterCardCues &&
        typeof savedCharacterCardCues === "object" &&
        !Array.isArray(savedCharacterCardCues)
      ) {
        for (const [videoId, cues] of Object.entries(savedCharacterCardCues)) {
          if (!loaded.jobIds.includes(videoId) || !Array.isArray(cues)) continue;
          loadedCharacterCardCuesByVideoId[videoId] = (
            cues as VideoDubbingTextOverlayCue[]
          ).filter((cue) => cue?.kind === "character-card");
        }
      }
      const savedCardStyle = Object.values(loadedCharacterCardCuesByVideoId)
        .flat()
        .find((cue) => cue?.kind === "character-card");
      setCharacterCardStyle(resolveCharacterCardStyle(
        w.characterCardStyle ?? savedCardStyle,
      ));
      setCharacterCardCuesByVideoId(loadedCharacterCardCuesByVideoId);
      // Mark ownership before switching the active job so the legacy job overlay
      // hydration effect cannot overwrite the newer project workspace snapshot.
      setActiveProject(loaded);
      importProjectRef.current = loaded;
      const history = await loadJobHistory();
      const activeId = loaded.activeJobId || loaded.jobIds[0];
      const item = history.find((entry) => entry.job.id === activeId);
      if (item) openHistoryJob(item);
      else if (activeId) throw new Error("Project có liên kết tới job không còn tồn tại.");
      else { setVideo(null); setSrt(null); setSrtContent(""); }
      if (loaded.srt) {
        const analysis = analyzeSrtContent(loaded.srt.content);
        setSrt({ fileName: loaded.srt.fileName, sizeBytes: new Blob([loaded.srt.content]).size, content: loaded.srt.content, analysis });
        setSrtContent(loaded.srt.content);
      } else { setSrt(null); setSrtContent(""); }
      const projectJobs = loaded.jobIds
        .map((id) => history.find((entry) => entry.job.id === id)?.job)
        .filter((item): item is VideoDubbingJob => Boolean(item))
        .sort((left, right) =>
          left.fileName.localeCompare(right.fileName, undefined, {
            numeric: true,
            sensitivity: "base",
          }),
        );
      setVideoFiles(projectJobs.map((item) => ({
        id: item.id, name: item.fileName, size: item.sizeBytes, job: item,
      })));
      const storedSrts = loaded.sourceSrts?.length
        ? loaded.sourceSrts
        : loaded.srt ? [{ id: `legacy-${loaded.id}`, ...loaded.srt }] : [];
      setSubtitleFiles(storedSrts.map((item) => {
        const analysis = analyzeSrtContent(item.content);
        return { id: item.id, fileName: item.fileName, sizeBytes: new Blob([item.content]).size, content: item.content, analysis, videoId: item.videoId, matchByName: item.matchByName };
      }));
      setSelectedSubtitleCue(null);
      if (typeof w.subtitleMarginPx === "number") setSubtitleMarginPx(w.subtitleMarginPx);
      if (w.mixerSettings) setMixerSettings(w.mixerSettings as VideoDubbingMixerSettings);
      if (typeof w.selectedVoiceId === "string") setSelectedVoiceId(w.selectedVoiceId);
      if (typeof w.minSpeed === "number") setMinSpeed(w.minSpeed);
      if (typeof w.maxSpeed === "number") setMaxSpeed(w.maxSpeed);
      if (w.speedPriority === "balanced" || w.speedPriority === "strict" || w.speedPriority === "natural") setSpeedPriority(w.speedPriority);
      setAutoPipelineTtsMasterEnabled(
        typeof w.autoPipelineTtsMasterEnabled === "boolean"
          ? w.autoPipelineTtsMasterEnabled
          : true,
      );
      if (typeof w.autoPipelineDemucsEnabled === "boolean") setAutoPipelineDemucsEnabled(w.autoPipelineDemucsEnabled);
      if (typeof w.originalAudioVolumePercent === "number") setOriginalAudioVolumePercent(w.originalAudioVolumePercent);
      if (typeof w.logoEnabled === "boolean") setLogoEnabled(w.logoEnabled);
      if (typeof w.logoWidthPercent === "number") setLogoWidthPercent(w.logoWidthPercent);
      if (typeof w.logoPaddingPx === "number") setLogoPaddingPx(w.logoPaddingPx);
      if (typeof w.logoPosition === "string") setLogoPosition(w.logoPosition as VideoDubbingOverlayPosition);
      if (typeof w.subtitlesEnabled === "boolean") setSubtitlesEnabled(w.subtitlesEnabled);
      if (typeof w.subtitleFontSize === "number") setSubtitleFontSize(w.subtitleFontSize);
      if (typeof w.subtitleFontFamily === "string") setSubtitleFontFamily(w.subtitleFontFamily);
      if (typeof w.subtitleColor === "string") setSubtitleColor(w.subtitleColor);
      if (typeof w.subtitleBackgroundColor === "string") setSubtitleBackgroundColor(w.subtitleBackgroundColor);
      if (typeof w.subtitleBackgroundTransparent === "boolean") setSubtitleBackgroundTransparent(w.subtitleBackgroundTransparent);
      if (w.subtitleBackgroundMode === "none" || w.subtitleBackgroundMode === "color" || w.subtitleBackgroundMode === "image") setSubtitleBackgroundMode(w.subtitleBackgroundMode);
      if (typeof w.subtitleBold === "boolean") setSubtitleBold(w.subtitleBold);
      if (typeof w.subtitleItalic === "boolean") setSubtitleItalic(w.subtitleItalic);
      if (typeof w.subtitleUnderline === "boolean") setSubtitleUnderline(w.subtitleUnderline);
      if (w.subtitleTextCase === "none" || w.subtitleTextCase === "uppercase" || w.subtitleTextCase === "lowercase" || w.subtitleTextCase === "capitalize") setSubtitleTextCase(w.subtitleTextCase);
      if (typeof w.subtitleOutlineEnabled === "boolean") setSubtitleOutlineEnabled(w.subtitleOutlineEnabled);
      if (typeof w.subtitleOutlineColor === "string") setSubtitleOutlineColor(w.subtitleOutlineColor);
      if (typeof w.subtitleOutlineWidthPx === "number") setSubtitleOutlineWidthPx(w.subtitleOutlineWidthPx);
      if (typeof w.subtitleCharacterSpacingPx === "number") setSubtitleCharacterSpacingPx(w.subtitleCharacterSpacingPx);
      if (typeof w.subtitleLineSpacingPx === "number") setSubtitleLineSpacingPx(w.subtitleLineSpacingPx);
      if (typeof w.subtitlePaddingPx === "number") setSubtitlePaddingPx(w.subtitlePaddingPx);
      setExportQuality(w.exportQuality === "source" || w.exportQuality === "low" || w.exportQuality === "medium" || w.exportQuality === "high" ? w.exportQuality : "high");
      if (typeof w.subtitlePosition === "string") setSubtitlePosition(w.subtitlePosition as VideoDubbingOverlayPosition);
      if (typeof w.subtitleBackgroundImage === "string" || w.subtitleBackgroundImage === null) setSubtitleBackgroundImage(w.subtitleBackgroundImage as string | null);
      if (w.subtitleCueOverridesByVideoId && typeof w.subtitleCueOverridesByVideoId === "object" && !Array.isArray(w.subtitleCueOverridesByVideoId)) {
        setSubtitleCueOverridesByVideoId(w.subtitleCueOverridesByVideoId as Record<string, VideoDubbingSubtitleCue[]>);
      } else if (loaded.activeJobId && Array.isArray(w.subtitleCueOverrides)) {
        setSubtitleCueOverridesByVideoId({
          [loaded.activeJobId]: w.subtitleCueOverrides as VideoDubbingSubtitleCue[],
        });
      } else {
        setSubtitleCueOverridesByVideoId({});
      }
      const loadedTextTracks = Array.isArray(w.textTracks)
        ? w.textTracks.filter((track): track is VideoDubbingTextTrack =>
            Boolean(track && typeof track.id === "string" && typeof track.name === "string"),
          )
        : [DEFAULT_TEXT_TRACK];
      setTextTracks(loadedTextTracks);
      setActiveTextTrackId(loadedTextTracks[0]?.id || DEFAULT_TEXT_TRACK_ID);
      const projectTextOverlays = Array.isArray(w.textOverlays)
        ? (w.textOverlays as VideoDubbingTextOverlayCue[])
            .filter((cue) => cue?.kind !== "character-card")
            .map((cue) => ({
              ...cue,
              trackId: cue.trackId || DEFAULT_TEXT_TRACK_ID,
            }))
        : [];
      const activeCharacterCards = activeId
        ? loadedCharacterCardCuesByVideoId[activeId] ??
          (item?.job.overlaySettings?.textOverlays ?? []).filter(
            (cue) => cue.kind === "character-card",
          )
        : [];
      characterCardCueVideoIdRef.current = activeId || null;
      setTextOverlays([
        ...projectTextOverlays,
        ...activeCharacterCards.map((cue) => ({
          ...cue,
          trackId: cue.trackId || DEFAULT_TEXT_TRACK_ID,
        })),
      ]);
      const savedEndSceneTemplate = w.endSceneTemplate;
      if (
        savedEndSceneTemplate &&
        typeof savedEndSceneTemplate === "object" &&
        !Array.isArray(savedEndSceneTemplate)
      ) {
        const template = savedEndSceneTemplate as {
          durationSeconds?: unknown;
          aspectRatio?: unknown;
          textOverlays?: unknown;
        };
        const durationSeconds =
          typeof template.durationSeconds === "number" &&
          Number.isFinite(template.durationSeconds)
            ? Math.max(1, Math.min(120, template.durationSeconds))
            : DEFAULT_END_SCENE_DURATION_SECONDS;
        const textOverlays = Array.isArray(template.textOverlays)
          ? (template.textOverlays as VideoDubbingTextOverlayCue[]).filter(
              (cue) =>
                cue &&
                typeof cue.text === "string" &&
                typeof cue.fontFamily === "string" &&
                Number.isFinite(cue.fontSize),
            )
          : [];
        setEndSceneDurationSeconds(durationSeconds);
        setEndSceneAspectRatio(
          END_SCENE_ASPECT_RATIOS.includes(
            template.aspectRatio as VideoDubbingEndSceneAspectRatio,
          )
            ? (template.aspectRatio as VideoDubbingEndSceneAspectRatio)
            : DEFAULT_END_SCENE_ASPECT_RATIO,
        );
        setEndSceneTextOverlays(textOverlays);
        setSelectedEndSceneTextIndex(textOverlays.length ? 0 : null);
      } else {
        setEndSceneDurationSeconds(DEFAULT_END_SCENE_DURATION_SECONDS);
        setEndSceneAspectRatio(DEFAULT_END_SCENE_ASPECT_RATIO);
        setEndSceneTextOverlays([
          createDefaultEndSceneText(DEFAULT_END_SCENE_DURATION_SECONDS),
        ]);
        setSelectedEndSceneTextIndex(0);
      }
      if (typeof w.subtitleTimelineZoom === "number") {
        subtitleTimelineFitRef.current = false;
        setSubtitleTimelineZoom(w.subtitleTimelineZoom);
      }
      setActiveProject(loaded);
      setProjects((items) => [loaded, ...items.filter((item) => item.id !== loaded.id)]);
      setProjectReady(true);
      setProjectSaveState("saved");
      setProjectsExpanded(false);
    } catch (error) {
      setProjectError(error instanceof Error ? error.message : "Không thể mở project.");
    } finally { setProjectBusy(false); }
  };

  const deleteProject = async (project: VideoDubbingProject) => {
    if (!window.confirm(`Xóa project “${project.name}” cùng video, logo, đầu ra và dữ liệu xử lý thuộc project?`)) return;
    setProjectBusy(true);
    try {
      const response = await fetch(`/api/video-dubbing/projects/${project.id}`, { method: "DELETE" });
      const result = await response.json();
      if (!response.ok) throw new Error(result.error || "Không thể xóa project.");
      setProjects((items) => items.filter((item) => item.id !== project.id));
      if (activeProject?.id === project.id) {
        importProjectRef.current = null;
        setVideoFiles([]); setSubtitleFiles([]); setQueueStates({});
        setActiveProject(null); setProjectReady(false); setVideo(null); setSrt(null); setSrtContent("");
        setEndSceneDurationSeconds(DEFAULT_END_SCENE_DURATION_SECONDS);
        setEndSceneAspectRatio(DEFAULT_END_SCENE_ASPECT_RATIO);
        setEndSceneTextOverlays([
          createDefaultEndSceneText(DEFAULT_END_SCENE_DURATION_SECONDS),
        ]);
        setSelectedEndSceneTextIndex(0);
      }
      if (defaultProjectId === project.id) {
        window.localStorage.removeItem("video-dubbing-default-project");
        setDefaultProjectId(null);
      }
    } catch (error) { setProjectError(error instanceof Error ? error.message : "Không thể xóa project."); }
    finally { setProjectBusy(false); }
  };

  const renameProject = async (project: VideoDubbingProject) => {
    const name = window.prompt("Tên project mới", project.name)?.trim();
    if (!name || name === project.name) return;
    setProjectBusy(true);
    setProjectError(null);
    ++projectSaveRequestRef.current;
    try {
      const response = await fetch(`/api/video-dubbing/projects/${project.id}`, {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ name }),
      });
      const result = await response.json();
      if (!response.ok || !result.project) throw new Error(result.error || "Không thể đổi tên project.");
      const renamed = result.project as VideoDubbingProject;
      setProjects((items) => items.map((item) => item.id === renamed.id ? renamed : item));
      if (activeProject?.id === renamed.id) {
        setActiveProject(renamed);
        importProjectRef.current = renamed;
      }
    } catch (error) {
      setProjectError(error instanceof Error ? error.message : "Không thể đổi tên project.");
    } finally { setProjectBusy(false); }
  };

  const saveSubtitleMarginForJob = async (jobId: string, value: number) => {
    try {
      const response = await fetch(`/api/video-dubbing/jobs/${jobId}/overlay-settings`, {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ subtitleMarginPx: value }),
      });
      const result = await response.json();
      if (!response.ok || !result.job) throw new Error(result.error || "Không thể lưu khoảng cách phụ đề.");
      const savedJob = result.job as VideoDubbingJob;
      setVideoFiles((items) => items.map((item) => item.job?.id === jobId ? { ...item, job: savedJob } : item));
      setJobHistory((items) => items.map((item) => item.job.id === jobId ? { ...item, job: savedJob } : item));
      setVideo((current) => current?.job?.id === jobId ? { ...current, job: savedJob } : current);
    } catch (error) {
      setMediaError(error instanceof Error ? error.message : "Không thể lưu khoảng cách phụ đề.");
    }
  };

  const flushSubtitleMarginSave = () => {
    if (subtitleMarginSaveTimerRef.current !== null) {
      window.clearTimeout(subtitleMarginSaveTimerRef.current);
      subtitleMarginSaveTimerRef.current = null;
    }
    const pending = pendingSubtitleMarginSaveRef.current;
    pendingSubtitleMarginSaveRef.current = null;
    if (pending) void saveSubtitleMarginForJob(pending.jobId, pending.value);
  };

  const scheduleSubtitleMarginSave = (jobId: string, value: number) => {
    pendingSubtitleMarginSaveRef.current = { jobId, value };
    if (subtitleMarginSaveTimerRef.current !== null) window.clearTimeout(subtitleMarginSaveTimerRef.current);
    subtitleMarginSaveTimerRef.current = window.setTimeout(() => {
      subtitleMarginSaveTimerRef.current = null;
      const pending = pendingSubtitleMarginSaveRef.current;
      pendingSubtitleMarginSaveRef.current = null;
      if (pending) void saveSubtitleMarginForJob(pending.jobId, pending.value);
    }, 350);
  };

  const openHistoryJob = (item: VideoDubbingJobHistoryItem | VideoDubbingJob) => {
    flushSubtitleMarginSave();
    const selectedJob = "job" in item ? item.job : item;
    const project = importProjectRef.current || activeProject;
    const projectCharacterCardCuesByVideoId =
      project?.workspace?.characterCardCuesByVideoId as
        | Record<string, VideoDubbingTextOverlayCue[]>
        | undefined;
    const savedCharacterCards = Object.prototype.hasOwnProperty.call(
      characterCardCuesByVideoId,
      selectedJob.id,
    )
      ? characterCardCuesByVideoId[selectedJob.id]
      : projectCharacterCardCuesByVideoId?.[selectedJob.id] ??
        (selectedJob.overlaySettings?.textOverlays ?? []).filter(
          (cue) => cue.kind === "character-card",
        );
    characterCardCueVideoIdRef.current = selectedJob.id;
    setTextOverlays((current) => [
      ...current.filter((cue) => cue.kind !== "character-card"),
      ...savedCharacterCards.map((cue) => ({
        ...cue,
        trackId: cue.trackId || DEFAULT_TEXT_TRACK_ID,
      })),
    ]);
    videoGenerationRef.current++;
    uploadRef.current?.abort();
    uploadRef.current = null;
    activeJobIdRef.current = selectedJob.id;
    setVideo({
      fileName: selectedJob.fileName,
      sizeBytes: selectedJob.sizeBytes,
      progress: 100,
      job: selectedJob,
      warning: "job" in item ? item.warning : undefined,
    });
    setSelectedTextOverlay(null);
    if (!activeProject?.jobIds.includes(selectedJob.id)) {
      setSrt(null);
      setSrtContent("");
    }
    setMasterError(null);
    setMediaError(null);
    setSeparationError(null);
    if (srtInputRef.current) srtInputRef.current.value = "";
  };

  const forgetCharacterCardCues = (videoId: string) => {
    if (characterCardCueVideoIdRef.current === videoId) {
      characterCardCueVideoIdRef.current = null;
    }
    setCharacterCardCuesByVideoId((current) => {
      if (!Object.prototype.hasOwnProperty.call(current, videoId)) return current;
      const next = { ...current };
      delete next[videoId];
      return next;
    });
  };

  const previewSourceVideo = async (
    selectedJob: VideoDubbingJob,
  ): Promise<VideoDubbingJob | null> => {
    if (selectedJob.status !== "completed" || queueRunning || settingsSyncRunning) return null;
    let currentJob = selectedJob;
    try {
      const response = await fetch(`/api/video-dubbing/jobs/${selectedJob.id}`);
      const result = await response.json();
      if (!response.ok || !result.job) {
        throw new Error(result.error || "Không thể tải trạng thái video mới nhất.");
      }
      currentJob = result.job as VideoDubbingJob;
      if (currentJob.status !== "completed") {
        throw new Error("Video hiện chưa sẵn sàng để mở preview.");
      }
      setVideoFiles((items) =>
        items.map((item) =>
          item.job?.id === currentJob.id ? { ...item, job: currentJob } : item,
        ),
      );
      setJobHistory((items) =>
        items.map((item) =>
          item.job.id === currentJob.id ? { ...item, job: currentJob } : item,
        ),
      );
    } catch (error) {
      setMediaError(
        error instanceof Error
          ? error.message
          : "Không thể tải trạng thái video mới nhất.",
      );
      return null;
    }

    let project = importProjectRef.current || activeProject;
    if (project && !project.jobIds.includes(currentJob.id)) {
      try {
        project = await attachJobToProject(project, currentJob.id);
      } catch (error) {
        setProjectError(error instanceof Error ? error.message : "Không thể mở preview của video trong project.");
        return null;
      }
    }

    openHistoryJob(currentJob);
    setSelectedSubtitleCue(null);
    const selectedSubtitle = pairVideoDubbingQueueRows(
      [{ id: currentJob.id, name: currentJob.fileName, size: currentJob.sizeBytes, job: currentJob }],
      subtitleFiles,
    )[0]?.subtitle;
    if (selectedSubtitle?.content && selectedSubtitle.analysis) {
      setSrt({
        fileName: selectedSubtitle.fileName,
        sizeBytes: selectedSubtitle.sizeBytes,
        content: selectedSubtitle.content,
        analysis: selectedSubtitle.analysis,
        error: selectedSubtitle.error,
      });
      setSrtContent(selectedSubtitle.content);
    } else if (project?.activeJobId === currentJob.id && project.srt) {
      const analysis = analyzeSrtContent(project.srt.content);
      setSrt({
        fileName: project.srt.fileName,
        sizeBytes: new Blob([project.srt.content]).size,
        content: project.srt.content,
        analysis,
      });
      setSrtContent(project.srt.content);
    } else {
      setSrt(null);
      setSrtContent("");
    }

    const latestProject = importProjectRef.current || project;
    if (latestProject?.jobIds.includes(currentJob.id) && latestProject.activeJobId !== currentJob.id) {
      try {
        const response = await fetch(`/api/video-dubbing/projects/${latestProject.id}`, {
          method: "PUT",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ activeJobId: currentJob.id }),
        });
        const result = await response.json();
        if (!response.ok || !result.project) throw new Error(result.error || "Không thể lưu video preview hiện tại.");
        const savedProject = result.project as VideoDubbingProject;
        setActiveProject(savedProject);
        importProjectRef.current = savedProject;
        setProjects((items) => items.map((entry) => entry.id === savedProject.id ? savedProject : entry));
      } catch (error) {
        setProjectError(error instanceof Error ? error.message : "Không thể lưu video preview hiện tại.");
      }
    }
    return currentJob;
  };

  const deleteHistoryJob = async (item: VideoDubbingJobHistoryItem) => {
    if (
      !window.confirm(
        `Xóa job "${item.job.fileName}" và toàn bộ file đầu ra của job này?`,
      )
    ) {
      return;
    }
    try {
      const response = await fetch(`/api/video-dubbing/jobs/${item.job.id}`, {
        method: "DELETE",
      });
      const result = await response.json();
      if (!response.ok) {
        throw new Error(result.error || "Không thể xóa job Video Dubbing.");
      }
      forgetCharacterCardCues(item.job.id);
      setJobHistory((current) =>
        current.filter((entry) => entry.job.id !== item.job.id),
      );
      if (activeJobIdRef.current === item.job.id) {
        activeJobIdRef.current = null;
        setVideo(null);
      }
    } catch (error) {
      setHistoryError(
        error instanceof Error
          ? error.message
          : "Không thể xóa job Video Dubbing.",
      );
    }
  };

  useEffect(() => {
    let active = true;
    void (async () => {
      const savedProjects = await loadProjects();
      if (!active) return;
      const configuredDefaultId = window.localStorage.getItem("video-dubbing-default-project");
      const defaultProject = savedProjects.find((item) => item.id === configuredDefaultId);
      if (defaultProject) {
        setDefaultProjectId(defaultProject.id);
        await openProject(defaultProject);
      } else {
        window.localStorage.removeItem("video-dubbing-default-project");
        setDefaultProjectId(null);
      }
    })();
    return () => {
      active = false;
    };
  }, [activeProject?.id]);

  const setDefaultProject = (project: VideoDubbingProject | null) => {
    if (project) window.localStorage.setItem("video-dubbing-default-project", project.id);
    else window.localStorage.removeItem("video-dubbing-default-project");
    setDefaultProjectId(project?.id ?? null);
  };

  const projectWorkspaceSnapshot = JSON.stringify(makeProjectWorkspace());
  useEffect(() => {
    const videoId = characterCardCueVideoIdRef.current;
    if (!videoId) return;
    const cues = textOverlays.filter((cue) => cue.kind === "character-card");
    setCharacterCardCuesByVideoId((current) => {
      if (JSON.stringify(current[videoId] ?? []) === JSON.stringify(cues)) {
        return current;
      }
      return { ...current, [videoId]: cues };
    });
  }, [textOverlays]);

  useEffect(() => {
    if (!activeProject || !projectReady) return;
    const projectId = activeProject.id;
    const requestId = ++projectSaveRequestRef.current;
    setProjectSaveState("saving");
    const timer = window.setTimeout(() => {
      void fetch(`/api/video-dubbing/projects/${projectId}`, {
        method: "PUT", headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          srt: srtContent ? { fileName: srt?.fileName || "subtitles.srt", content: srtContent } : null,
          workspace: JSON.parse(projectWorkspaceSnapshot),
        }),
      }).then(async (response) => {
        const result = await response.json();
        if (!response.ok || !result.project) throw new Error(result.error || "Không thể tự lưu project.");
        if (requestId !== projectSaveRequestRef.current) return;
        setActiveProject(result.project);
        setProjects((items) => [result.project, ...items.filter((item) => item.id !== result.project.id)]);
        setProjectSaveState("saved");
      }).catch((error) => {
        if (requestId !== projectSaveRequestRef.current) return;
        setProjectSaveState("error");
        setProjectError(error instanceof Error ? error.message : "Không thể tự lưu project.");
      });
    }, 600);
    return () => window.clearTimeout(timer);
  }, [activeProject?.id, projectReady, projectWorkspaceSnapshot, srtContent, srt?.fileName, video?.job?.id]);

  useEffect(() => {
    let active = true;
    const loadVoices = async () => {
      try {
        const response = await fetch("/api/voices");
        const result = await response.json();
        if (!response.ok || !Array.isArray(result.voices)) {
          throw new Error(result.error || "Không thể tải danh sách giọng.");
        }
        const availableVoices = getAvailableVideoDubbingVoices(
          result.voices as VideoDubbingVoice[],
        );
        if (!active) return;
        setVoices(availableVoices);
        const defaultVoice = availableVoices.find(
          (voice) => voice.modelId === result.defaultModel,
        );
        if (typeof activeProject?.workspace?.selectedVoiceId !== "string") {
          setSelectedVoiceId(defaultVoice?.id || availableVoices[0]?.id || "");
        }
        if (availableVoices.length === 0) {
          setVoicesError("Không tìm thấy mô hình giọng đọc khả dụng trên máy.");
        }
      } catch (error) {
        if (!active) return;
        setVoicesError(
          error instanceof Error
            ? error.message
            : "Không thể tải danh sách giọng.",
        );
      }
    };
    void loadVoices();
    return () => {
      active = false;
    };
  }, []);

  useEffect(() => {
    let active = true;
    const loadSeparationAvailability = async () => {
      try {
        const response = await fetch("/api/video-dubbing/separation/status");
        const result =
          (await response.json()) as VideoDubbingSeparationAvailability;
        if (!response.ok) {
          throw new Error("Không thể kiểm tra công cụ tách audio.");
        }
        if (active) setSeparationAvailability(result);
      } catch {
        if (active) {
          setSeparationAvailability({
            status: "unavailable",
            model: "htdemucs",
            message: "Không thể kiểm tra trạng thái Demucs trên máy này.",
          });
        }
      }
    };
    void loadSeparationAvailability();
    return () => {
      active = false;
    };
  }, []);

  useEffect(() => {
    const jobId = video?.job?.id;
    const status = video?.job?.status;
    const masterStatus = video?.job?.masterGeneration?.status;
    if (
      video?.error ||
      !jobId ||
      (status !== "uploading" &&
        status !== "probing" &&
        masterStatus !== "generating" &&
        video?.job?.autoPipeline?.status !== "running" &&
        video?.job?.audioMix?.status !== "running" &&
        video?.job?.finalMix?.status !== "running" &&
        video?.job?.videoExport?.status !== "running" &&
        video?.job?.separation?.status !== "processing")
    ) {
      return;
    }

    let active = true;
    const pollStatus = async () => {
      try {
        const response = await fetch(`/api/video-dubbing/jobs/${jobId}`);
        const result = await response.json();
        if (!response.ok || !result.job || !active) return;
        const job = result.job as VideoDubbingJob;
        setVideo((current) =>
          current?.job?.id === jobId ? { ...current, job } : current,
        );
        setVideoFiles((current) =>
          current.map((item) =>
            item.job?.id === jobId ? { ...item, job } : item,
          ),
        );
        setJobHistory((current) =>
          current.map((item) =>
            item.job.id === jobId ? { ...item, job } : item,
          ),
        );
      } catch (error) {
        console.error("Không thể cập nhật trạng thái kiểm tra video:", error);
      }
    };

    void pollStatus();
    const interval = window.setInterval(() => void pollStatus(), 500);
    return () => {
      active = false;
      window.clearInterval(interval);
    };
  }, [
    video?.error,
    video?.job?.id,
    video?.job?.audioMix?.status,
    video?.job?.finalMix?.status,
    video?.job?.masterGeneration?.status,
    video?.job?.autoPipeline?.status,
    video?.job?.separation?.status,
    video?.job?.status,
    video?.job?.videoExport?.status,
  ]);

  const localMixerSettingsKey = JSON.stringify(mixerSettings);
  const mixerSettingsRef = useRef(mixerSettings);
  mixerSettingsRef.current = mixerSettings;

  useEffect(() => {
    releasePreviewGraph();
    setPreviewError(null);
    setMixerError(null);
    setVideoPreviewReady(false);
    mixerTouchedRef.current = false;
  }, [video?.job?.id]);

  useEffect(() => {
    releasePreviewGraph();
  }, [
    video?.job?.masterGeneration?.sizeBytes,
    video?.job?.separation?.vocalsSizeBytes,
    video?.job?.separation?.instrumentalSizeBytes,
  ]);

  useEffect(() => {
    const currentJob = video?.job;
    if (mixerTouchedRef.current) return;
    if (
      activeProject &&
      (!currentJob || !activeProject.jobIds.includes(currentJob.id))
    ) {
      return;
    }
    const projectSettings = activeProject?.workspace?.mixerSettings;
    const savedSettings =
      currentJob?.mixerSettings ||
      currentJob?.autoPipeline?.config?.mixerSettings ||
      (projectSettings &&
      typeof projectSettings === "object" &&
      !Array.isArray(projectSettings)
        ? projectSettings as VideoDubbingMixerSettings
        : undefined);
    setMixerSettings(savedSettings || DEFAULT_MIXER_SETTINGS);
    setMixerSettingsSaved(Boolean(savedSettings));
  }, [
    activeProject?.id,
    video?.job?.id,
  ]);

  useEffect(() => {
    if (activeProject && (!video?.job?.id || activeProject.jobIds.includes(video.job.id))) {
      return;
    }
    const settings = video?.job?.overlaySettings;
    characterCardCueVideoIdRef.current = video?.job?.id ?? null;
    setTextTracks([DEFAULT_TEXT_TRACK]);
    setActiveTextTrackId(DEFAULT_TEXT_TRACK_ID);
    setTextOverlays((settings?.textOverlays ?? []).map((cue) => ({
      ...cue,
      trackId: cue.trackId || DEFAULT_TEXT_TRACK_ID,
    })));
    setExportQuality(settings?.exportQuality ?? "high");
    setSelectedTextOverlay(null);
    setLogoEnabled(settings?.logoEnabled ?? false);
    setLogoWidthPercent(settings?.logoWidthPercent ?? 15);
    setLogoPaddingPx(settings?.logoPaddingPx ?? 24);
    setLogoPosition(settings?.logoPosition ?? "top-left");
    setSubtitlesEnabled(settings?.subtitlesEnabled ?? false);
    setSubtitleFontSize(settings?.subtitleFontSize ?? 32);
    setSubtitleFontFamily(settings?.subtitleFontFamily ?? "Arial");
    setSubtitleColor(settings?.subtitleColor ?? "#ffffff");
    setSubtitleBackgroundColor(settings?.subtitleBackgroundColor ?? "#000000");
    setSubtitleBackgroundTransparent(
      settings?.subtitleBackgroundTransparent ?? false,
    );
    setSubtitleBackgroundMode(
      settings?.subtitleBackgroundMode ??
        (settings?.subtitleBackgroundImage
          ? "image"
          : settings?.subtitleBackgroundTransparent
            ? "none"
            : "color"),
    );
    setSubtitleBold(settings?.subtitleBold ?? false);
    setSubtitleItalic(settings?.subtitleItalic ?? false);
    setSubtitleUnderline(settings?.subtitleUnderline ?? false);
    setSubtitleTextCase(settings?.subtitleTextCase ?? "none");
    setSubtitleOutlineEnabled(settings?.subtitleOutlineEnabled ?? false);
    setSubtitleOutlineColor(settings?.subtitleOutlineColor ?? "#000000");
    setSubtitleOutlineWidthPx(settings?.subtitleOutlineWidthPx ?? 2);
    setSubtitleCharacterSpacingPx(settings?.subtitleCharacterSpacingPx ?? 0);
    setSubtitleLineSpacingPx(settings?.subtitleLineSpacingPx ?? 0);
    setSubtitlePaddingPx(settings?.subtitlePaddingPx ?? 8);
    setSubtitlePosition(settings?.subtitlePosition ?? "bottom-center");
    {
      const savedBackgroundImage = settings?.subtitleBackgroundImage ?? null;
      const normalizedBackgroundImage =
        typeof savedBackgroundImage === "string"
          ? savedBackgroundImage
              .replace(/\.(png|webp)$/i, "")
              .replace(/-(left|center|right)$/, "")
              .replace(/[^a-zA-Z0-9_-]/g, "") || null
          : null;
      setSubtitleBackgroundImage((current) =>
        normalizedBackgroundImage ?? current,
      );
    }
  }, [video?.job?.id, activeProject?.id]);

  // The subtitle margin is per-video even while the rest of the preview settings
  // may be hydrated from a shared project workspace. Prefer the project value
  // when present so project reload cannot reset the synchronized margin.
  useEffect(() => {
    const projectMargin = activeProject?.workspace?.subtitleMarginPx;
    if (typeof projectMargin === "number") {
      setSubtitleMarginPx(projectMargin);
      return;
    }
    setSubtitleMarginPx(video?.job?.overlaySettings?.subtitleMarginPx ?? 32);
  }, [video?.job?.id, activeProject?.id, activeProject?.workspace?.subtitleMarginPx]);

  useEffect(() => {
    void fetch("/api/video-dubbing/subtitle-backgrounds")
      .then((response) => response.json())
      .then((result: { backgrounds?: string[] }) => {
        setSubtitleBackgrounds(result.backgrounds ?? []);
        setSubtitleBackgroundImage((current) =>
          current && result.backgrounds?.includes(current)
            ? current
            : (result.backgrounds?.[0] ?? null),
        );
      })
      .catch(() => setSubtitleBackgrounds([]));
  }, []);

  useEffect(() => {
    void fetch("/api/video-dubbing/fonts")
      .then(async (response) => {
        if (!response.ok) throw new Error("Không thể tải danh sách font.");
        return response.json() as Promise<{
          families?: string[];
          faces?: SubtitleFontCatalogFace[];
        }>;
      })
      .then(async (catalog) => {
        const faces = catalog.faces ?? [];
        await Promise.all(faces.map(async (face) => {
          try {
            const font = new FontFace(
              face.family,
              `url("${face.url}")`,
              { weight: String(face.weight), style: face.style },
            );
            await font.load();
            document.fonts.add(font);
          } catch (error) {
            console.warn(`[VideoDubbing] Không thể tải font ${face.family}:`, error);
          }
        }));
        setSubtitleFontOptions(catalog.families?.length ? catalog.families : SUBTITLE_FONT_OPTIONS);
      })
      .catch((error) => {
        console.warn("[VideoDubbing] Không thể đọc thư mục assets/fonts:", error);
        setSubtitleFontOptions(SUBTITLE_FONT_OPTIONS);
      });
  }, []);

  useEffect(() => {
    const job = video?.job;
    if (!job || queueRunning || autoPipelineConfigJobRef.current === job.id) {
      return;
    }
    autoPipelineConfigJobRef.current = job.id;
    setAutoPipelineExpanded(true);
    setMasterPanelExpanded(false);
    setSeparationPanelExpanded(false);
    setMixerPanelExpanded(true);
    const config = job.autoPipeline?.config;
    autoPipelineSavedConfigKeyRef.current = config
      ? JSON.stringify({ ...config, mixerSettings: undefined })
      : null;
    const workspace = activeProject?.workspace;
    const hasProjectPipelineSettings = Boolean(
      workspace &&
        [
          "selectedVoiceId",
          "minSpeed",
          "maxSpeed",
          "speedPriority",
          "autoPipelineTtsMasterEnabled",
          "autoPipelineDemucsEnabled",
          "originalAudioVolumePercent",
          "mixerSettings",
        ].some((key) => Object.prototype.hasOwnProperty.call(workspace, key)),
    );
    if (hasProjectPipelineSettings) return;
    if (!config) {
      setAutoPipelineTtsMasterEnabled(true);
      setAutoPipelineDemucsEnabled(false);
      setOriginalAudioVolumePercent(100);
      setMixerSettings(DEFAULT_MIXER_SETTINGS);
      setSpeedPriority("balanced");
      setMinSpeed(0.8);
      setMaxSpeed(1.5);
      return;
    }
    setAutoPipelineTtsMasterEnabled(config.ttsMasterEnabled !== false);
    setAutoPipelineDemucsEnabled(config.demucsEnabled);
    setOriginalAudioVolumePercent(config.originalAudioVolumePercent);
    setMixerSettings(config.mixerSettings);
    setMixerSettingsSaved(true);
    setSpeedPriority(config.master.options.speedPriority);
    setMinSpeed(config.master.options.minSpeed);
    setMaxSpeed(config.master.options.maxSpeed);
    setSrt({
      fileName: "Phụ đề từ cấu hình Auto Pipeline",
      sizeBytes: 0,
      analysis: {
        subtitleCount: config.master.items.length,
        earliestStart: Math.min(
          ...config.master.items.map((item) => item.startTime),
        ),
        latestEnd: Math.max(...config.master.items.map((item) => item.endTime)),
        invalidBlockCount: 0,
        items: config.master.items,
      },
    });
    setSubtitlesEnabled(true);
  }, [video?.job?.id, video?.job?.autoPipeline?.config, queueRunning, activeProject?.id]);

  useEffect(() => {
    if (activeProject?.workspace && typeof activeProject.workspace.selectedVoiceId === "string") return;
    const savedModel = video?.job?.autoPipeline?.config?.master;
    if (!savedModel) return;
    const voice = voices.find(
      (candidate) =>
        candidate.modelId === savedModel.model &&
        candidate.speakerId === savedModel.speakerId,
    );
    if (voice) setSelectedVoiceId(voice.id);
  }, [video?.job?.id, video?.job?.autoPipeline?.config?.master, voices, activeProject?.id]);

  useEffect(() => {
    const job = video?.job;
    if (!job || job.status !== "completed" || !mixerTouchedRef.current) return;
    const version = ++mixerSettingsRequestRef.current;
    if (mixerSettingsTimerRef.current !== null) {
      window.clearTimeout(mixerSettingsTimerRef.current);
    }
    mixerSettingsTimerRef.current = window.setTimeout(() => {
      mixerSaveChainRef.current = mixerSaveChainRef.current.then(async () => {
        if (version !== mixerSettingsRequestRef.current) return;
        try {
          const response = await fetch(
            `/api/video-dubbing/jobs/${job.id}/mixer-settings`,
            {
              method: "PUT",
              headers: { "Content-Type": "application/json" },
              body: localMixerSettingsKey,
            },
          );
          const result = await response.json();
          if (!response.ok) {
            throw new Error(result.error || "Không thể lưu mixer settings.");
          }
          if (version === mixerSettingsRequestRef.current) {
            mixerTouchedRef.current = false;
            setMixerSettingsSaved(true);
            setMixerError(null);
            if (result.job) {
              setVideo((current) =>
                current?.job?.id === job.id
                  ? { ...current, job: result.job as VideoDubbingJob }
                  : current,
              );
              setVideoFiles((current) =>
                current.map((item) =>
                  item.job?.id === job.id
                    ? { ...item, job: result.job as VideoDubbingJob }
                    : item,
                ),
              );
              setJobHistory((current) =>
                current.map((item) =>
                  item.job.id === job.id
                    ? { ...item, job: result.job as VideoDubbingJob }
                    : item,
                ),
              );
            }
          }
        } catch (error) {
          if (version === mixerSettingsRequestRef.current) {
            setMixerSettingsSaved(false);
            setMixerError(
              error instanceof Error
                ? error.message
                : "Không thể lưu mixer settings.",
            );
          }
        }
      });
    }, 350);
    return () => {
      if (mixerSettingsTimerRef.current !== null) {
        window.clearTimeout(mixerSettingsTimerRef.current);
        mixerSettingsTimerRef.current = null;
      }
    };
  }, [video?.job?.id, video?.job?.status, localMixerSettingsKey]);

  useEffect(() => {
    const context = audioContextRef.current;
    if (!context) return;
    for (const [track, node] of previewNodesRef.current) {
      const setting = mixerSettings[track];
      node.gain.gain.setTargetAtTime(
        setting.muted ? 0 : setting.volumePercent / 100,
        context.currentTime,
        0.015,
      );
    }
  }, [localMixerSettingsKey]);

  useEffect(
    () => () => {
      releasePreviewGraph(false);
      if (mixerSettingsTimerRef.current !== null) {
        window.clearTimeout(mixerSettingsTimerRef.current);
      }
    },
    [],
  );

  useEffect(() => {
    const job = video?.job;
    if (!job) return;
    setJobHistory((current) =>
      current.map((item) =>
        item.job.id === job.id
          ? {
              ...item,
              job,
              outputs: {
                ...item.outputs,
                sourceVideo:
                  job.status === "completed" && Boolean(job.metadata),
                masterAudio:
                  job.masterGeneration?.status === "completed" ||
                  item.outputs.masterAudio,
                vocals:
                  Boolean(job.separation?.vocalsSizeBytes) ||
                  item.outputs.vocals,
                instrumental:
                  Boolean(job.separation?.instrumentalSizeBytes) ||
                  item.outputs.instrumental,
                mixedAudio:
                  job.audioMix?.status === "completed" ||
                  item.outputs.mixedAudio,
                exportedVideo:
                  job.videoExport?.status === "completed" ||
                  item.outputs.exportedVideo,
                finalMix:
                  job.finalMix?.status === "completed" || item.outputs.finalMix,
              },
            }
          : item,
      ),
    );
  }, [video?.job]);

  const removeServerJob = async (jobId: string) => {
    try {
      const response = await fetch(`/api/video-dubbing/jobs/${jobId}`, {
        method: "DELETE",
      });
      if (!response.ok) {
        throw new Error(`Máy chủ trả về HTTP ${response.status}.`);
      }
    } catch (error) {
      console.error("Không thể dọn dữ liệu job Video Dubbing:", error);
    }
  };

  const clearVideo = () => {
    videoGenerationRef.current++;
    activeJobIdRef.current = null;
    characterCardCueVideoIdRef.current = null;
    if (uploadRef.current) {
      uploadRef.current.abort();
      uploadRef.current = null;
    }
    setVideo(null);
    if (videoInputRef.current) videoInputRef.current.value = "";
  };

  const uploadVideo = async (file: File) => {
    const generation = ++videoGenerationRef.current;
    setVideo({
      fileName: file.name,
      sizeBytes: file.size,
      progress: 0,
      job: null,
    });

    try {
      const createResponse = await fetch("/api/video-dubbing/jobs", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ fileName: file.name, sizeBytes: file.size, projectId: activeProject?.id }),
      });
      const createResult = await createResponse.json();
      if (!createResponse.ok || !createResult.job) {
        throw new Error(createResult.error || "Không thể khởi tạo job video.");
      }

      const job = createResult.job as VideoDubbingJob;
      if (generation !== videoGenerationRef.current) {
        await removeServerJob(job.id);
        return;
      }
      const currentProject = importProjectRef.current || activeProject;
      const projectCharacterCardCuesByVideoId =
        currentProject?.workspace?.characterCardCuesByVideoId as
          | Record<string, VideoDubbingTextOverlayCue[]>
          | undefined;
      const savedCharacterCards = Object.prototype.hasOwnProperty.call(
        characterCardCuesByVideoId,
        job.id,
      )
        ? characterCardCuesByVideoId[job.id]
        : projectCharacterCardCuesByVideoId?.[job.id] ??
          (job.overlaySettings?.textOverlays ?? []).filter(
            (cue) => cue.kind === "character-card",
          );
      characterCardCueVideoIdRef.current = job.id;
      setTextOverlays((current) => [
        ...current.filter((cue) => cue.kind !== "character-card"),
        ...savedCharacterCards.map((cue) => ({
          ...cue,
          trackId: cue.trackId || DEFAULT_TEXT_TRACK_ID,
        })),
      ]);
      activeJobIdRef.current = job.id;
      setVideo((current) =>
        current?.fileName === file.name ? { ...current, job } : current,
      );

      const request = new XMLHttpRequest();
      uploadRef.current = request;
      request.open("PUT", `/api/video-dubbing/jobs/${job.id}/video`);
      request.setRequestHeader("Content-Type", "application/octet-stream");
      request.upload.onprogress = (event) => {
        if (
          !event.lengthComputable ||
          generation !== videoGenerationRef.current
        ) {
          return;
        }
        setVideo((current) =>
          current?.job?.id === job.id
            ? {
                ...current,
                progress: Math.min(100, (event.loaded / event.total) * 100),
              }
            : current,
        );
      };
      request.upload.onload = () => {
        if (generation !== videoGenerationRef.current) return;
        setVideo((current) =>
          current?.job?.id === job.id
            ? {
                ...current,
                progress: 100,
                job: { ...current.job!, status: "probing" },
              }
            : current,
        );
      };
      request.onload = () => {
        if (generation !== videoGenerationRef.current) return;
        uploadRef.current = null;
        try {
          const result = JSON.parse(request.responseText);
          if (!request.status || request.status >= 400) {
            setVideo((current) =>
              current?.job?.id === job.id
                ? {
                    ...current,
                    job: result.job || current.job,
                    error: result.error || "Không thể kiểm tra video.",
                  }
                : current,
            );
            return;
          }
          setVideo((current) =>
            current?.job?.id === job.id
              ? { ...current, job: result.job, progress: 100 }
              : current,
          );
          void loadJobHistory();
        } catch {
          setVideo((current) =>
            current?.job?.id === job.id
              ? { ...current, error: "Máy chủ trả về phản hồi không hợp lệ." }
              : current,
          );
        }
      };
      request.onerror = () => {
        if (generation !== videoGenerationRef.current) return;
        uploadRef.current = null;
        setVideo((current) =>
          current?.job?.id === job.id
            ? {
                ...current,
                error: "Kết nối bị gián đoạn khi tải hoặc kiểm tra video.",
              }
            : current,
        );
      };
      request.onabort = () => {
        if (uploadRef.current === request) uploadRef.current = null;
      };
      request.send(file);
    } catch (error) {
      if (generation !== videoGenerationRef.current) return;
      const message =
        error instanceof Error ? error.message : "Không thể tải video lên.";
      setVideo((current) =>
        current?.fileName === file.name
          ? { ...current, error: message }
          : current,
      );
    }
  };

  const handleVideoFile = (file: File) => {
    if (!file) return;
    if (characterCardReferenceScanJob?.status === "running") {
      setCharacterCardReferenceError("Hãy hủy lần quét hiện tại trước khi thay ảnh mẫu.");
      return;
    }
    const generation = ++videoGenerationRef.current;
    const previousJobId = activeJobIdRef.current;
    const previousJobStatus = video?.job?.status;
    activeJobIdRef.current = null;
    uploadRef.current?.abort();
    uploadRef.current = null;
    if (
      previousJobId &&
      (previousJobStatus === "uploading" || previousJobStatus === "probing")
    ) {
      void fetch(`/api/video-dubbing/jobs/${previousJobId}/cancel`, {
        method: "POST",
      });
    }

    const extension = file.name.slice(file.name.lastIndexOf(".")).toLowerCase();
    if (!ACCEPTED_VIDEO_EXTENSIONS.has(extension)) {
      setVideo({
        fileName: file.name,
        sizeBytes: file.size,
        progress: 0,
        job: null,
        error:
          "Định dạng video không được hỗ trợ. Hãy chọn MP4, MKV, MOV, AVI hoặc WebM.",
      });
      return;
    }
    void (async () => {
      if (generation === videoGenerationRef.current) {
        await uploadVideo(file);
      }
    })();
  };

  const handleVideoChange = (event: ChangeEvent<HTMLInputElement>) => {
    const files = Array.from(event.target.files || []);
    event.target.value = "";
    if (files.length === 0 || queueRunning) return;
    void importQueueVideos(files);
  };

  const ensureImportProject = async (suggestedName: string): Promise<VideoDubbingProject> => {
    if (importProjectRef.current) return importProjectRef.current;
    if (activeProject) { importProjectRef.current = activeProject; return activeProject; }
    if (importProjectPromiseRef.current) return importProjectPromiseRef.current;
    const creation = (async () => {
      const response = await fetch("/api/video-dubbing/projects", {
        method: "POST", headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ name: suggestedName.replace(/\.[^.]+$/, "").slice(0, 120) || "Project mới" }),
      });
      const result = await response.json();
      if (!response.ok || !result.project) throw new Error(result.error || "Không thể tạo project để lưu nguồn.");
      const created = result.project as VideoDubbingProject;
      setActiveProject(created);
      importProjectRef.current = created;
      setProjects((items) => [created, ...items.filter((item) => item.id !== created.id)]);
      setProjectReady(true);
      setProjectSaveState("saved");
      return created;
    })();
    importProjectPromiseRef.current = creation;
    try { return await creation; }
    finally { if (importProjectPromiseRef.current === creation) importProjectPromiseRef.current = null; }
  };

  const attachJobToProject = async (project: VideoDubbingProject, jobId: string): Promise<VideoDubbingProject> => {
    const latestProject = importProjectRef.current?.id === project.id
      ? importProjectRef.current
      : project;
    const jobIds = [...new Set([...latestProject.jobIds, jobId])];
    const response = await fetch(`/api/video-dubbing/projects/${latestProject.id}`, {
      method: "PUT", headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ jobIds, activeJobId: latestProject.activeJobId || jobId }),
    });
    const result = await response.json();
    if (!response.ok || !result.project) throw new Error(result.error || "Không thể liên kết video với project.");
    const saved = result.project as VideoDubbingProject;
    setActiveProject(saved);
    importProjectRef.current = saved;
    setProjects((items) => [saved, ...items.filter((item) => item.id !== saved.id)]);
    return saved;
  };

  const importQueueVideos = async (files: File[]) => {
    if (queueRunning) return;
    for (const file of files) {
      const entry: QueuedVideo = {
        id: `${file.name}-${file.size}-${file.lastModified}-${Math.random()}`,
        name: file.name, size: file.size, lastModified: file.lastModified, file, uploading: true,
      };
      setVideoFiles((current) => [...current, entry]);
      const extension = file.name.slice(file.name.lastIndexOf(".")).toLowerCase();
      if (!ACCEPTED_VIDEO_EXTENSIONS.has(extension)) {
        setVideoFiles((current) => current.map((item) => item.id === entry.id ? { ...item, error: "Định dạng video không hỗ trợ." } : item));
        continue;
      }
      try {
        const project = await ensureImportProject(file.name);
        const createResponse = await fetch("/api/video-dubbing/jobs", {
          method: "POST", headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ fileName: file.name, sizeBytes: file.size, projectId: project.id }),
        });
        const createdResult = await createResponse.json();
        if (!createResponse.ok || !createdResult.job) throw new Error(createdResult.error || "Không thể khởi tạo vùng lưu video.");
        let savedProject = await attachJobToProject(project, createdResult.job.id);
        const savedJob = await new Promise<VideoDubbingJob>((resolve, reject) => {
          const request = new XMLHttpRequest();
          request.open("PUT", `/api/video-dubbing/jobs/${createdResult.job.id}/video`);
          request.setRequestHeader("Content-Type", "application/octet-stream");
          request.upload.onprogress = (event) => {
            if (!event.lengthComputable) return;
            const index = queueRows.findIndex((row) => row.video?.id === entry.id);
            if (index < 0) return;
            setQueueStates((current) => ({ ...current, [index]: { status: "uploading", jobId: createdResult.job.id, phase: "Đang lưu video vào project", progressPercent: Math.min(100, event.loaded / event.total * 100) } }));
          };
          request.onload = () => {
            try {
              const payload = JSON.parse(request.responseText);
              if (request.status < 200 || request.status >= 300 || !payload.job) reject(new Error(payload.error || "Không thể xác minh video đã lưu."));
              else resolve(payload.job as VideoDubbingJob);
            } catch (error) { reject(error instanceof Error ? error : new Error("Phản hồi lưu video không hợp lệ.")); }
          };
          request.onerror = () => reject(new Error("Mất kết nối khi lưu video vào project."));
          request.send(file);
        });
        setVideoFiles((current) => current.map((item) => item.id === entry.id ? { ...item, file: undefined, uploading: false, job: savedJob } : item));
        const rowIndex = queueRows.findIndex((row) => row.video?.id === entry.id);
        if (rowIndex >= 0) setQueueStates((current) => ({ ...current, [rowIndex]: { status: "queued", jobId: savedJob.id, phase: "Đã lưu nguồn trong project" } }));
        // Ensure the project remains current if another import completed while this upload was in flight.
        savedProject = { ...savedProject, jobIds: [...new Set([...savedProject.jobIds, savedJob.id])] };
        if (!activeJobIdRef.current && !video?.job) {
          const savedCharacterCards = characterCardCuesByVideoId[savedJob.id] ??
            (savedJob.overlaySettings?.textOverlays ?? []).filter(
              (cue) => cue.kind === "character-card",
            );
          activeJobIdRef.current = savedJob.id;
          characterCardCueVideoIdRef.current = savedJob.id;
          setTextOverlays((current) => [
            ...current.filter((cue) => cue.kind !== "character-card"),
            ...savedCharacterCards.map((cue) => ({
              ...cue,
              trackId: cue.trackId || DEFAULT_TEXT_TRACK_ID,
            })),
          ]);
        }
        setVideo((current) => current || { fileName: savedJob.fileName, sizeBytes: savedJob.sizeBytes, progress: 100, job: savedJob });
        void loadJobHistory();
      } catch (error) {
        setVideoFiles((current) => current.map((item) => item.id === entry.id ? { ...item, uploading: false, error: error instanceof Error ? error.message : "Không thể lưu video vào project." } : item));
      }
    }
  };

  const handleSrtFile = async (file: File) => {
    if (!file) return;
    const generation = ++srtGenerationRef.current;
    setSrt({ fileName: file.name, sizeBytes: file.size });

    if (!file.name.toLowerCase().endsWith(".srt")) {
      setSrt({
        fileName: file.name,
        sizeBytes: file.size,
        error: "Chỉ hỗ trợ tệp phụ đề .srt.",
      });
      return;
    }

    try {
      const content = await file.text();
      const analysis = analyzeSrtContent(content);
      if (generation !== srtGenerationRef.current) return;
      setSrt({ fileName: file.name, sizeBytes: file.size, content, analysis });
      setSrtContent(content);
      setSubtitlesEnabled(true);
    } catch (error) {
      if (generation !== srtGenerationRef.current) return;
      setSrt({
        fileName: file.name,
        sizeBytes: file.size,
        error:
          error instanceof Error
            ? error.message
            : "Không thể đọc nội dung tệp SRT.",
      });
    }
  };

  const openSrtBrowser = (videoId?: string) => {
    subtitleBrowseTargetRef.current = videoId || null;
    srtInputRef.current?.click();
  };

  const fileStem = (fileName: string) =>
    (fileName.split(/[\\/]/).pop() || fileName).replace(/\.[^.]+$/, "").trim().toLocaleLowerCase();

  const handleSrtFiles = async (files: File[], targetVideoId?: string, matchByName = false) => {
    if (files.length === 0 || queueRunning) return;

    const queued = files.map((file) => {
      const matchingVideos = videoFiles.filter((item) => fileStem(item.name) === fileStem(file.name));
      const matchedVideoId = targetVideoId ||
        (matchingVideos.length === 1 ? matchingVideos[0].job?.id || matchingVideos[0].id : undefined);
      return {
        id: crypto.randomUUID(),
        file,
        fileName: file.name,
        sizeBytes: file.size,
        videoId: matchedVideoId,
        matchByName: matchByName || !matchedVideoId,
      };
    });
    setSubtitleFiles((current) =>
      replaceVideoDubbingSubtitleSources(current, queued, targetVideoId),
    );

    const sourceSrtsToSave: NonNullable<VideoDubbingProject["sourceSrts"]> = [];
    for (const entry of queued) {
      try {
        if (!entry.file.name.toLowerCase().endsWith(".srt")) {
          throw new Error("Chỉ hỗ trợ tệp phụ đề .srt.");
        }
        const content = await entry.file!.text();
        const analysis = analyzeSrtContent(content);
        const sourceSrt = {
          id: entry.id,
          fileName: entry.fileName,
          content,
          ...(entry.videoId ? { videoId: entry.videoId } : {}),
          ...(entry.matchByName ? { matchByName: true } : {}),
        };
        sourceSrtsToSave.push(sourceSrt);
        setSubtitlesEnabled(true);
        setSubtitleFiles((current) =>
          replaceVideoDubbingSubtitleSources(
            current.filter((item) => item.id !== entry.id),
            [{ ...entry, analysis, content, file: undefined }],
          ),
        );
        const activeJob = activeJobIdRef.current;
        if (entry.videoId && entry.videoId === activeJob) {
          setSrt({
              fileName: entry.fileName,
              sizeBytes: entry.sizeBytes,
              content,
              analysis,
          });
          setSrtContent(content);
          setSubtitleCueOverridesByVideoId((current) => {
            const next = { ...current };
            delete next[entry.videoId!];
            return next;
          });
          setSelectedSubtitleCue(null);
        } else {
          setSrt((current) =>
            current || {
              fileName: entry.fileName,
              sizeBytes: entry.sizeBytes,
              content,
              analysis,
            },
          );
        }
      } catch (error) {
        const message =
          error instanceof Error
            ? error.message
            : "Không thể đọc nội dung tệp SRT.";
        setSubtitleFiles((current) =>
          current.map((item) =>
            item.id === entry.id ? { ...item, error: message } : item,
          ),
        );
      }
    }

    if (sourceSrtsToSave.length > 0) {
      try {
        const project = await ensureImportProject(sourceSrtsToSave[0].fileName);
        const replacementIds = new Set(sourceSrtsToSave.map((item) => item.id));
        const sourceSrts = [
          ...(project.sourceSrts || []).filter((item) => !replacementIds.has(item.id)),
          ...sourceSrtsToSave,
        ];
        const saveResponse = await fetch(`/api/video-dubbing/projects/${project.id}`, {
          method: "PUT",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ sourceSrts }),
        });
        const savedResult = await saveResponse.json();
        if (!saveResponse.ok || !savedResult.project) {
          throw new Error(savedResult.error || "Không thể lưu các SRT vào project.");
        }
        const savedProject = savedResult.project as VideoDubbingProject;
        setActiveProject(savedProject);
        importProjectRef.current = savedProject;
        setProjects((items) => [
          savedProject,
          ...items.filter((item) => item.id !== savedProject.id),
        ]);
      } catch (error) {
        const message = error instanceof Error ? error.message : "Không thể lưu các SRT vào project.";
        setSubtitleFiles((current) =>
          current.map((item) =>
            sourceSrtsToSave.some((source) => source.id === item.id)
              ? { ...item, error: message }
              : item,
          ),
        );
      }
    }
  };

  const handleQueueDrop = (event: DragEvent<HTMLElement>, targetVideoId?: string) => {
    event.preventDefault();
    event.stopPropagation();
    if (queueRunning) return;
    const droppedFiles = Array.from(event.dataTransfer.files);
    const droppedVideos = droppedFiles.filter((file) =>
      ACCEPTED_VIDEO_EXTENSIONS.has(
        file.name.slice(file.name.lastIndexOf(".")).toLowerCase(),
      ),
    );
    const droppedSubtitles = droppedFiles.filter((file) =>
      file.name.toLowerCase().endsWith(".srt"),
    );
    if (droppedVideos.length > 0) {
      void importQueueVideos(droppedVideos);
    }
    if (droppedSubtitles.length > 0) {
      const droppedTogether =
        droppedVideos.length > 0 ||
        (!targetVideoId && droppedSubtitles.length > 0);
      void handleSrtFiles(droppedSubtitles, droppedTogether ? undefined : targetVideoId, droppedTogether);
    }
  };

  const handleSrtChange = async (event: ChangeEvent<HTMLInputElement>) => {
    const files = Array.from(event.target.files || []);
    event.target.value = "";
    const targetVideoId = subtitleBrowseTargetRef.current || undefined;
    subtitleBrowseTargetRef.current = null;
    await handleSrtFiles(files, targetVideoId);
  };

  const clearSrt = () => {
    srtGenerationRef.current++;
    subtitleBrowseTargetRef.current = null;
    setSrt(null);
    setSubtitlesEnabled(false);
    if (srtInputRef.current) srtInputRef.current.value = "";
  };

  const clearSelectedFiles = async () => {
    if (isBusy) {
      await cancelVideo();
    } else {
      clearVideo();
    }
    clearSrt();
    setVideoFiles([]);
    setSubtitleFiles([]);
    setQueueStates({});
    setFileDetailsOpen(false);
    setDetailRowIndex(null);
  };

  const removeQueuedSource = async (videoSource: QueuedVideo | undefined, subtitleSource: QueuedSubtitle | undefined) => {
    try {
      const currentProject = importProjectRef.current || activeProject;
      const isRemovingActivePreview = Boolean(
        videoSource?.job &&
          (activeJobIdRef.current === videoSource.job.id ||
            video?.job?.id === videoSource.job.id),
      );
      const remainingVideos = videoSource
        ? videoFiles.filter((item) => item.id !== videoSource.id)
        : videoFiles;
      const removedVideoIndex = videoSource
        ? videoFiles.findIndex((item) => item.id === videoSource.id)
        : -1;
      const replacementPreview = isRemovingActivePreview
        ? remainingVideos
            .slice(Math.max(0, removedVideoIndex))
            .find((item) => item.job?.status === "completed") ||
          remainingVideos
            .slice(0, Math.max(0, removedVideoIndex))
            .reverse()
            .find((item) => item.job?.status === "completed")
        : undefined;

      if (videoSource?.job && currentProject) {
        const response = await fetch(`/api/video-dubbing/jobs/${videoSource.job.id}`, { method: "DELETE" });
        const result = await response.json();
        if (!response.ok) throw new Error(result.error || "Không thể xóa video nguồn đã lưu.");
        forgetCharacterCardCues(videoSource.job.id);
        const jobIds = currentProject.jobIds.filter((id) => id !== videoSource.job!.id);
        const activeJobId = isRemovingActivePreview
          ? replacementPreview?.job?.id || null
          : currentProject.activeJobId === videoSource.job.id
            ? jobIds[0] || null
            : currentProject.activeJobId || null;
        const saveResponse = await fetch(`/api/video-dubbing/projects/${currentProject.id}`, {
          method: "PUT", headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ jobIds, activeJobId }),
        });
        const saved = await saveResponse.json();
        if (!saveResponse.ok || !saved.project) throw new Error(saved.error || "Không thể cập nhật project sau khi xóa video.");
        setActiveProject(saved.project);
        importProjectRef.current = saved.project;
        setProjects((items) => [saved.project, ...items.filter((item) => item.id !== saved.project.id)]);
        setJobHistory((items) => items.filter((item) => item.job.id !== videoSource.job!.id));
        if (isRemovingActivePreview) {
          if (replacementPreview?.job) {
            await previewSourceVideo(replacementPreview.job);
          } else {
            activeJobIdRef.current = null;
            setVideo(null);
          }
        }
      }
      const latestProject = importProjectRef.current || currentProject;
      if (subtitleSource && latestProject) {
        const sourceSrts = (latestProject.sourceSrts || []).filter((item) => item.id !== subtitleSource.id);
        const response = await fetch(`/api/video-dubbing/projects/${latestProject.id}`, {
          method: "PUT", headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ sourceSrts, ...(subtitleSource.id.startsWith("legacy-") ? { srt: null } : {}) }),
        });
        const saved = await response.json();
        if (!response.ok || !saved.project) throw new Error(saved.error || "Không thể xóa SRT khỏi project.");
        setActiveProject(saved.project);
        importProjectRef.current = saved.project;
      }
      if (videoSource) setVideoFiles((current) => current.filter((item) => item.id !== videoSource.id));
      if (subtitleSource) setSubtitleFiles((current) => current.filter((item) => item.id !== subtitleSource.id));
    } catch (error) {
      setProjectError(error instanceof Error ? error.message : "Không thể xóa tệp nguồn.");
    }
  };

  const cancelVideo = async () => {
    const jobId = activeJobIdRef.current;
    videoGenerationRef.current++;
    activeJobIdRef.current = null;
    uploadRef.current?.abort();
    uploadRef.current = null;
    if (jobId) {
      try {
        const response = await fetch(
          `/api/video-dubbing/jobs/${jobId}/cancel`,
          { method: "POST" },
        );
        const result = await response.json();
        if (result.job) {
          setVideo((current) =>
            current?.job?.id === jobId
              ? { ...current, job: result.job, error: undefined }
              : current,
          );
          return;
        }
      } catch (error) {
        console.error("Không thể hủy job Video Dubbing:", error);
      }
    }
    setVideo((current) =>
      current
        ? { ...current, error: "Đã hủy quá trình tải/kiểm tra." }
        : current,
    );
  };

  const job = video?.job || null;
  const selectedVoice = voices.find((voice) => voice.id === selectedVoiceId);
  useEffect(() => {
    if (!previewTrackKeyRef.current?.includes("ttsMaster:")) return;
    releasePreviewGraph(false);
    setPreviewStatus("paused");
  }, [
    job?.id,
    job?.masterEdit?.updatedAt,
    job?.masterGeneration?.audioVersion,
    job?.masterGeneration?.sizeBytes,
  ]);
  const masterGeneration = job?.masterGeneration;
  const isMasterGenerating = masterGeneration?.status === "generating";
  const audioMix = job?.audioMix;
  const finalMix = job?.finalMix;
  const videoExport = job?.videoExport;
  const separation = job?.separation;
  const autoPipeline = job?.autoPipeline;
  const isAutoPipelineRunning = autoPipeline?.status === "running";
  const isSeparationProcessing = separation?.status === "processing";
  const autoPipelineProgress = autoPipeline?.phase === "separation" && isSeparationProcessing
    ? separation?.progressPercent
    : autoPipeline?.progressPercent;
  const separationElapsedSeconds = isSeparationProcessing && separation?.startedAtMs
    ? Math.max(0, (exportClockNow - separation.startedAtMs) / 1000)
    : separation?.elapsedSeconds;
  const separationHeartbeatFresh = Boolean(
    isSeparationProcessing && separation?.heartbeatAtMs &&
    exportClockNow - separation.heartbeatAtMs < 15_000,
  );
  const separationPhaseLabel = separation?.phase === "loading_model"
    ? "nạp model"
    : separation?.phase === "extracting"
      ? "trích audio"
      : separation?.phase === "writing_outputs"
        ? "ghi track"
        : separation?.phase === "validating"
          ? "xác minh track"
          : separation?.phase === "checking"
            ? "kiểm tra môi trường"
            : "inference";
  const separationBackendLabel = separationAvailability?.backend === "mdx"
    ? `MDX · ${separationAvailability.device === "directml" ? "DirectML" : separationAvailability.device || "thiết bị chưa rõ"}`
    : separationAvailability?.backend === "demucs"
      ? `Demucs · ${separationAvailability.device || "CPU"}`
      : "đang xác định backend";
  const hasFinalMix = Boolean(finalMix?.sizeBytes && finalMix.sizeBytes > 44);
  const hasExportedVideo = Boolean(
    videoExport?.sizeBytes && videoExport.sizeBytes > 0,
  );
  useEffect(() => {
    if (
      videoExport?.status !== "running" &&
      !isSeparationProcessing &&
      !isAutoPipelineRunning
    ) return;
    const interval = window.setInterval(() => setExportClockNow(Date.now()), 1000);
    return () => window.clearInterval(interval);
  }, [videoExport?.status, isSeparationProcessing, isAutoPipelineRunning]);
  const isMediaProcessing =
    audioMix?.status === "running" ||
    finalMix?.status === "running" ||
    videoExport?.status === "running" ||
    isSeparationProcessing ||
    isAutoPipelineRunning;
  const hasMasterAudio = Boolean(
    masterGeneration?.durationSeconds !== undefined &&
    masterGeneration.sizeBytes !== undefined,
  );
  const isFinalMixCurrent = Boolean(
    finalMix &&
    finalMix.status !== "stale" &&
    finalMix.status !== "idle" &&
    finalMix.sizeBytes &&
    JSON.stringify(finalMix.renderedSettings) === localMixerSettingsKey,
  );
  const mixerTrackAvailability: Record<VideoDubbingMixerTrack, boolean> = {
    vocals: Boolean(separation?.vocalsSizeBytes),
    instrumental: Boolean(separation?.instrumentalSizeBytes),
    ttsMaster: hasMasterAudio,
  };
  const hasPreviewTrack = Object.entries(mixerTrackAvailability).some(
    ([track, available]) =>
      available &&
      !mixerSettings[track as VideoDubbingMixerTrack].muted &&
      mixerSettings[track as VideoDubbingMixerTrack].volumePercent > 0,
  );
  const canRenderFinalMix = Boolean(
    job?.status === "completed" &&
    (hasPreviewTrack || Boolean(job.metadata?.audioCodec)) &&
    !isMasterGenerating &&
    !isMediaProcessing,
  );
  const canStartSeparation = Boolean(
    job?.status === "completed" &&
    !isSeparationProcessing &&
    separationAvailability?.status === "ready" &&
    Boolean(job.metadata?.audioCodec) &&
    !isMasterGenerating &&
    !isMediaProcessing,
  );
  const currentTtsSubtitleItems = resolveVideoDubbingTtsItems(
    job?.id,
    subtitleCueOverridesByVideoId,
    srt?.analysis?.items ?? [],
  );
  const selectedSubtitleCueTtsItem = selectedSubtitleCue === null
    ? undefined
    : currentTtsSubtitleItems[selectedSubtitleCue];
  const canGenerateMaster = Boolean(
    job?.status === "completed" &&
    currentTtsSubtitleItems.length &&
    selectedVoice &&
    !isMasterGenerating &&
    !isMediaProcessing,
  );
  const autoPipelineConfig: VideoDubbingAutoPipelineConfig | null = useMemo(
    () =>
      (!autoPipelineTtsMasterEnabled ||
        (currentTtsSubtitleItems.length > 0 && Boolean(selectedVoice)))
        ? {
            enabled: autoPipelineEnabled,
            master: {
              items: currentTtsSubtitleItems,
              model:
                selectedVoice?.modelId ||
                job?.autoPipeline?.config?.master.model ||
                "",
              speakerId: selectedVoice?.speakerId,
              options: { minSpeed, maxSpeed, speedPriority },
            },
            ttsMasterEnabled: autoPipelineTtsMasterEnabled,
            demucsEnabled: autoPipelineDemucsEnabled,
            mixerSettings,
            originalAudioVolumePercent,
          }
        : null,
    [
      autoPipelineEnabled,
      autoPipelineTtsMasterEnabled,
      autoPipelineDemucsEnabled,
      maxSpeed,
      minSpeed,
      mixerSettings,
      originalAudioVolumePercent,
      job?.id,
      selectedVoice,
      speedPriority,
      srt?.analysis?.items,
      subtitleCueOverridesByVideoId,
    ],
  );
  const canStartAutoPipeline = Boolean(
    job?.status === "completed" &&
    autoPipelineEnabled &&
    (autoPipelineTtsMasterEnabled || autoPipelineDemucsEnabled) &&
    autoPipelineConfig &&
    !isAutoPipelineRunning &&
    !isMediaProcessing &&
    (!autoPipelineTtsMasterEnabled ||
    Boolean(currentTtsSubtitleItems.length && selectedVoice)) &&
    (!autoPipelineDemucsEnabled ||
    (separationAvailability?.status === "ready" &&
      Boolean(job.metadata?.audioCodec))),
  );
  const queueRows = pairVideoDubbingQueueRows(videoFiles, subtitleFiles);
  const projectJobItems = activeProject
    ? activeProject.jobIds
        .map((id) => jobHistory.find((item) => item.job.id === id))
        .filter((item): item is VideoDubbingJobHistoryItem => item !== undefined)
        .filter((item) => !videoFiles.some((video) => video.job?.id === item.job.id))
    : [];
  const allVideosJobs = Array.from(
    new Map(
      [
        ...projectJobItems.map(({ job: savedJob }) => savedJob),
        ...queueRows.flatMap(({ video: queuedVideo }) =>
          queuedVideo?.job ? [queuedVideo.job] : [],
        ),
      ]
        .filter((targetJob) => targetJob.status === "completed")
        .map((targetJob) => [targetJob.id, targetJob] as const),
    ).values(),
  );
  const resolveSrtDownload = (
    targetJob: VideoDubbingJob,
  ): { fileName: string; cues: VideoDubbingSubtitleCue[] } | null => {
    const queueRow = queueRows.find(
      ({ video: queuedVideo }) => queuedVideo?.job?.id === targetJob.id,
    );
    const hasTimelineOverride = Object.prototype.hasOwnProperty.call(
      subtitleCueOverridesByVideoId,
      targetJob.id,
    );
    const cues = hasTimelineOverride
      ? subtitleCueOverridesByVideoId[targetJob.id]
      : queueRow?.subtitle?.analysis?.items?.length
        ? queueRow.subtitle.analysis.items
        : job?.id === targetJob.id && srt?.analysis?.items?.length
          ? srt.analysis.items
          : targetJob.overlaySettings?.subtitles || [];
    if (!cues?.some((cue) => typeof cue.text === "string" && cue.text.trim())) {
      return null;
    }

    const matchedProjectSrt = activeProject?.sourceSrts?.find(
      (source) =>
        source.videoId === targetJob.id ||
        (!source.videoId &&
          source.matchByName !== false &&
          fileStem(source.fileName) === fileStem(targetJob.fileName)),
    );
    const originalFileName =
      queueRow?.subtitle?.fileName ||
      matchedProjectSrt?.fileName ||
      (activeProject?.activeJobId === targetJob.id
        ? activeProject.srt?.fileName
        : undefined);
    return {
      fileName:
        originalFileName?.split(/[\\/]/).pop() ||
        `${targetJob.fileName.split(/[\\/]/).pop()?.replace(/\.[^.]+$/, "") || "subtitles"}.srt`,
      cues: [...cues],
    };
  };
  const allSrtDownloadTargets = allVideosJobs.flatMap((targetJob) => {
    const resolved = resolveSrtDownload(targetJob);
    return resolved ? [{ targetJob, ...resolved }] : [];
  });
  const triggerFileDownload = (fileName: string, blob: Blob) => {
    const url = URL.createObjectURL(blob);
    const link = document.createElement("a");
    link.href = url;
    link.download = fileName;
    link.click();
    window.setTimeout(() => URL.revokeObjectURL(url), 1000);
  };
  const downloadSrtForJob = (targetJob: VideoDubbingJob) => {
    try {
      const resolved = resolveSrtDownload(targetJob);
      if (!resolved) {
        setSrtDownloadMessage(`Không có phụ đề để tải: ${targetJob.fileName}`);
        return;
      }
      triggerFileDownload(
        resolved.fileName,
        new Blob([formatVideoDubbingSrt(resolved.cues)], {
          type: "application/x-subrip;charset=utf-8",
        }),
      );
      setSrtDownloadMessage(`Đã tải ${resolved.fileName}.`);
    } catch (error) {
      setSrtDownloadMessage(
        error instanceof Error ? error.message : "Không thể tạo tệp SRT.",
      );
    }
  };
  const downloadAllSrts = () => {
    try {
      const usedNames = new Set<string>();
      const files: ExtractedSrtFile[] = allSrtDownloadTargets.map(
        ({ fileName, cues }) => {
          const extensionIndex = fileName.toLocaleLowerCase().endsWith(".srt")
            ? fileName.length - 4
            : fileName.length;
          const baseName = fileName.slice(0, extensionIndex);
          let uniqueName = `${baseName}.srt`;
          let suffix = 2;
          while (usedNames.has(uniqueName.toLocaleLowerCase())) {
            uniqueName = `${baseName} (${suffix}).srt`;
            suffix += 1;
          }
          usedNames.add(uniqueName.toLocaleLowerCase());
          return {
            fileName: uniqueName,
            content: formatVideoDubbingSrt(cues),
          };
        },
      );
      if (!files.length) {
        setSrtDownloadMessage("Không có phụ đề để tải.");
        return;
      }
      triggerFileDownload("subtitles.zip", createSrtZip(files));
      setSrtDownloadMessage(`Đã tạo ZIP gồm ${files.length} phụ đề.`);
    } catch (error) {
      setSrtDownloadMessage(
        error instanceof Error ? error.message : "Không thể tạo tệp ZIP SRT.",
      );
    }
  };
  const allVideosRunning = allVideosAction?.status === "running";
  const allVideosTtsReady = Boolean(
    selectedVoice ||
      allVideosJobs.every(
        (targetJob) => targetJob.autoPipeline?.config?.master.model,
      ),
  );
  const allVideosActionDisabled =
    allVideosJobs.length === 0 ||
    allVideosRunning ||
    queueRunning ||
    settingsSyncRunning;
  const queueRowCount = queueRows.length;
  const queueCountsMatch = hasMatchedVideoDubbingQueueInputs(queueRows);
  const queueInputsValid =
    queueCountsMatch &&
    queueRows.every(
      ({ video: file, subtitle: entry }) =>
        Boolean(
          file &&
          !file.uploading &&
          !file.error &&
          file.job?.status === "completed" &&
          ACCEPTED_VIDEO_EXTENSIONS.has(
            file.name.slice(file.name.lastIndexOf(".")).toLowerCase(),
          ),
        ) &&
        Boolean(entry?.analysis?.items.length) &&
        !entry?.error,
    );
  const canStartQueue = Boolean(
    queueInputsValid &&
    autoPipelineEnabled &&
    (autoPipelineTtsMasterEnabled ? selectedVoice : true) &&
    (autoPipelineTtsMasterEnabled || autoPipelineDemucsEnabled) &&
    !queueRunning &&
    !allVideosRunning &&
    !isAutoPipelineRunning &&
    (!autoPipelineDemucsEnabled || separationAvailability?.status === "ready"),
  );

  const uploadQueuedVideo = async (
    file: File,
    rowIndex: number,
  ): Promise<VideoDubbingJob> => {
    const createResponse = await fetch("/api/video-dubbing/jobs", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ fileName: file.name, sizeBytes: file.size, projectId: activeProject?.id }),
    });
    const createResult = await createResponse.json();
    if (!createResponse.ok || !createResult.job) {
      throw new Error(createResult.error || "Không thể khởi tạo job video.");
    }

    const createdJob = createResult.job as VideoDubbingJob;
    activeJobIdRef.current = createdJob.id;
    queueCurrentJobIdRef.current = createdJob.id;
    setVideo({
      fileName: file.name,
      sizeBytes: file.size,
      progress: 0,
      job: createdJob,
    });
    setQueueStates((current) => ({
      ...current,
      [rowIndex]: {
        status: "uploading",
        jobId: createdJob.id,
        phase: "Đang tải video lên",
        progressPercent: 0,
      },
    }));

    return await new Promise<VideoDubbingJob>((resolve, reject) => {
      const request = new XMLHttpRequest();
      uploadRef.current = request;
      request.open("PUT", `/api/video-dubbing/jobs/${createdJob.id}/video`);
      request.setRequestHeader("Content-Type", "application/octet-stream");
      request.upload.onprogress = (event) => {
        if (!event.lengthComputable) return;
        const progressPercent = Math.min(
          100,
          (event.loaded / event.total) * 100,
        );
        setQueueStates((current) => ({
          ...current,
          [rowIndex]: {
            ...current[rowIndex],
            status: "uploading",
            jobId: createdJob.id,
            phase: "Đang tải video lên",
            progressPercent,
          },
        }));
      };
      request.upload.onload = () => {
        setQueueStates((current) => ({
          ...current,
          [rowIndex]: {
            ...current[rowIndex],
            status: "uploading",
            jobId: createdJob.id,
            phase: "Đang kiểm tra video",
          },
        }));
      };
      request.onload = () => {
        if (uploadRef.current === request) uploadRef.current = null;
        try {
          const result = JSON.parse(request.responseText);
          if (request.status < 200 || request.status >= 300 || !result.job) {
            reject(new Error(result.error || "Không thể kiểm tra video."));
            return;
          }
          resolve(result.job as VideoDubbingJob);
        } catch (error) {
          reject(
            error instanceof Error
              ? error
              : new Error("Máy chủ trả về phản hồi tải video không hợp lệ."),
          );
        }
      };
      request.onerror = () => {
        if (uploadRef.current === request) uploadRef.current = null;
        reject(new Error("Kết nối bị gián đoạn khi tải hoặc kiểm tra video."));
      };
      request.onabort = () => {
        if (uploadRef.current === request) uploadRef.current = null;
        reject(new Error("Đã hủy tải video."));
      };
      request.send(file);
    });
  };

  const applyPreviewOverlayToJob = async (
    targetJob: VideoDubbingJob,
    subtitle?: QueuedSubtitle,
  ): Promise<VideoDubbingJob> => {
    const sourceJob = job;
    const sourceLogoName = sourceJob?.overlaySettings?.logoFileName;
    if (logoEnabled && (!sourceJob || !sourceLogoName)) {
      throw new Error("Logo đang bật nhưng chưa có logo trong preview để áp dụng cho hàng đợi.");
    }

    if (activeProject && !activeProject.jobIds.includes(targetJob.id)) {
      await attachJobToProject(activeProject, targetJob.id);
    }

    const duration = targetJob.metadata?.durationSeconds ?? Number.POSITIVE_INFINITY;
    const sourceCues = resolveVideoDubbingTtsItems(
      targetJob.id,
      subtitleCueOverridesByVideoId,
      subtitle?.analysis?.items?.length
        ? subtitle.analysis.items
        : targetJob.id === job?.id
          ? srt?.analysis?.items || []
          : (targetJob.overlaySettings?.subtitles || []).map(
              (cue, index): SubtitleItem => ({
                id: `saved-${index + 1}`,
                index: index + 1,
                startTime: cue.startTime,
                endTime: cue.endTime,
                targetDuration: Math.max(0.1, cue.endTime - cue.startTime),
                text: cue.text,
                status: "pending",
              }),
            ),
    );
    const targetCharacterCards = targetJob.id === sourceJob?.id
      ? textOverlays.filter((cue) => cue.kind === "character-card")
      : characterCardCuesByVideoId[targetJob.id] ??
        (targetJob.overlaySettings?.textOverlays ?? []).filter(
          (cue) => cue.kind === "character-card",
        );
    const textOverlayClips = fitTextOverlaysToVideoDuration(
      [
        ...textOverlays.filter((cue) => cue.kind !== "character-card"),
        ...targetCharacterCards,
      ],
      duration,
    );
    const settings = {
      exportQuality,
      logoEnabled: logoEnabled && Boolean(sourceLogoName),
      logoWidthPercent,
      logoPaddingPx,
      logoPosition,
      subtitlesEnabled: subtitlesEnabled && sourceCues.length > 0,
      subtitles: sourceCues.map(({ startTime, endTime, text }) => ({ startTime, endTime, text })),
      textOverlays: textOverlayClips,
      subtitleFontSize,
      subtitleFontFamily,
      subtitleColor,
      subtitleBackgroundColor,
      subtitleBackgroundTransparent: subtitleBackgroundMode === "none",
      subtitleBackgroundMode,
      subtitleBold,
      subtitleItalic,
      subtitleUnderline,
      subtitleTextCase,
      subtitleOutlineEnabled,
      subtitleOutlineColor,
      subtitleOutlineWidthPx,
      subtitleCharacterSpacingPx,
      subtitleLineSpacingPx,
      subtitlePaddingPx,
      subtitleMarginPx,
      subtitlePosition,
      subtitleBackgroundImage: subtitleBackgroundMode === "image" ? subtitleBackgroundImage : null,
      subtitleFontSizeScale: sourceJob?.overlaySettings?.subtitleFontSizeScale ?? 100,
      subtitleVerticalOffsetPx: sourceJob?.overlaySettings?.subtitleVerticalOffsetPx ?? 0,
      subtitleBackgroundSideScale: sourceJob?.overlaySettings?.subtitleBackgroundSideScale ?? 100,
      subtitleBackgroundLeftSlicePx: sourceJob?.overlaySettings?.subtitleBackgroundLeftSlicePx ?? 128,
      subtitleBackgroundRightSlicePx: sourceJob?.overlaySettings?.subtitleBackgroundRightSlicePx ?? 128,
    };
    const saveResponse = await fetch(`/api/video-dubbing/jobs/${targetJob.id}/overlay-settings`, {
      method: "PUT",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(settings),
    });
    const saveResult = await saveResponse.json();
    if (!saveResponse.ok || !saveResult.job) throw new Error(saveResult.error || "Không thể áp dụng cấu hình preview cho video trong hàng đợi.");
    const savedJob = saveResult.job as VideoDubbingJob;
    setVideoFiles((current) => current.map((item) => item.job?.id === savedJob.id ? { ...item, job: savedJob } : item));
    setJobHistory((current) => current.map((item) => item.job.id === savedJob.id ? { ...item, job: savedJob } : item));
    setVideo((current) => current?.job?.id === savedJob.id ? { ...current, job: savedJob } : current);
    return savedJob;
  };

  const syncSettingsToAllVideos = async () => {
    if (settingsSyncRunning || queueRunning) return;
    const sources = videoFiles.filter((item) => item.job?.status === "completed");
    if (sources.length === 0) {
      setSettingsSyncMessage("Chưa có video đã lưu để đồng bộ.");
      return;
    }
    setSettingsSyncRunning(true);
    setSettingsSyncMessage(null);
    let synced = 0;
    const errors: string[] = [];
    try {
      for (let index = 0; index < sources.length; index++) {
        const source = sources[index];
        const sourceJob = source.job!;
        const row = queueRows.find((item) => item.video?.job?.id === sourceJob.id);
        setSettingsSyncMessage(`Đang đồng bộ ${index + 1}/${sources.length}: ${source.name}`);
        try {
          await applyPreviewOverlayToJob(sourceJob, row?.subtitle);
          const subtitleItems = resolveVideoDubbingTtsItems(
            sourceJob.id,
            subtitleCueOverridesByVideoId,
            row?.subtitle?.analysis?.items || sourceJob.autoPipeline?.config?.master.items || [],
          );
          if (selectedVoice && subtitleItems?.length) {
            const config: VideoDubbingAutoPipelineConfig = {
              enabled: true,
              master: {
                items: subtitleItems,
                model: selectedVoice.modelId,
                speakerId: selectedVoice.speakerId,
                options: { minSpeed, maxSpeed, speedPriority },
              },
              ttsMasterEnabled: autoPipelineTtsMasterEnabled,
              demucsEnabled: autoPipelineDemucsEnabled && Boolean(sourceJob.metadata?.audioCodec),
              mixerSettings,
              originalAudioVolumePercent,
            };
            const response = await fetch(`/api/video-dubbing/jobs/${sourceJob.id}/auto-pipeline/config`, {
              method: "PUT", headers: { "Content-Type": "application/json" }, body: JSON.stringify(config),
            });
            const result = await response.json();
            if (!response.ok) throw new Error(result.error || "Không thể lưu cấu hình Auto Pipeline.");
          }
          synced++;
        } catch (error) {
          errors.push(`${source.name}: ${error instanceof Error ? error.message : "Lỗi đồng bộ"}`);
        }
      }
      void loadJobHistory();
      setSettingsSyncMessage(errors.length
        ? `Đã đồng bộ ${synced}/${sources.length} video. ${errors.slice(0, 2).join("; ")}${errors.length > 2 ? `; và ${errors.length - 2} lỗi khác` : ""}`
        : `Đã đồng bộ cài đặt cho ${synced} video.`);
    } finally {
      setSettingsSyncRunning(false);
    }
  };

  const checkQueueConcatCompatibility = async (jobIds: string[]) => {
    setConcatPreflight({ status: "checking", message: "Đang kiểm tra thông số video nguồn…" });
    try {
      const response = await fetch("/api/video-dubbing/exports/concat/preflight", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          jobIds,
          exportQuality,
          willRenderVideo: Boolean(
            (logoEnabled && job?.overlaySettings?.logoFileName) ||
            (subtitlesEnabled && (subtitleCueOverrides?.length || srt?.analysis?.items.length || job?.overlaySettings?.subtitles.length)) ||
            textOverlays.length,
          ),
        }),
      });
      const result = await response.json();
      if (!response.ok) throw new Error(result.error || "Không thể kiểm tra khả năng ghép video.");
      const compatible = Boolean(result.compatible);
      setConcatPreflight({ status: compatible ? "compatible" : "incompatible", message: result.message || "Không thể xác định khả năng ghép." });
      return compatible;
    } catch (error) {
      setConcatPreflight({ status: "incompatible", message: error instanceof Error ? error.message : "Không thể kiểm tra khả năng ghép video." });
      return false;
    }
  };

  const toggleJoinAfterQueue = async () => {
    if (joinAfterQueue) {
      setJoinAfterQueue(false);
      setConcatPreflight({ status: "idle", message: "" });
      return;
    }
    const jobIds = queueRows.map((row) => row.video?.job?.id);
    if (jobIds.length < 2 || jobIds.some((id) => !id)) {
      setConcatPreflight({ status: "incompatible", message: "Hãy lưu ít nhất hai video vào project để kiểm tra khả năng ghép trước." });
      return;
    }
    if (await checkQueueConcatCompatibility(jobIds as string[])) setJoinAfterQueue(true);
  };

  const startQueue = async () => {
    if (!canStartQueue || (autoPipelineTtsMasterEnabled && !selectedVoice)) return;
    let shouldJoinAfterQueue = joinAfterQueue;
    if (shouldJoinAfterQueue) {
      const jobIds = queueRows.map((row) => row.video?.job?.id);
      if (jobIds.length < 2 || jobIds.some((id) => !id) || !(await checkQueueConcatCompatibility(jobIds as string[]))) {
        setJoinAfterQueue(false);
        setMediaError("Preflight không xác nhận được khả năng ghép. Hàng đợi chưa chạy; có thể bỏ chọn ghép nối để export riêng từng video.");
        return;
      }
    }
    const completedJobIds: string[] = [];
    let queueHadFailure = false;
    queueCancelRef.current = false;
    setJoinedVideo(null);
    setConcatStatus("idle");
    setQueueRunning(true);
    setAutoPipelineError(null);
    setQueueStates(
      Object.fromEntries(
        queueRows.map(({ index }) => [index, { status: "queued" as const }]),
      ),
    );

    try {
      for (const row of queueRows) {
        const { index } = row;
        if (queueCancelRef.current) break;
        const file = row.video;
        const subtitle = row.subtitle;
        if (!file || !subtitle?.analysis) {
          queueHadFailure = true;
          setQueueStates((current) => ({
            ...current,
            [index]: {
              status: "failed",
              phase: "Thiếu video hoặc SRT hợp lệ",
              error: "Cần ghép đủ video và phụ đề SRT hợp lệ cho hàng này.",
            },
          }));
          continue;
        }
        let currentJobId: string | undefined;
        try {
          setSrt({
            fileName: subtitle.fileName,
            sizeBytes: subtitle.sizeBytes,
            content: subtitle.content,
            analysis: subtitle.analysis,
          });
          if (subtitle.content) setSrtContent(subtitle.content);
          const uploadedJob = file.job || (file.file
            ? await uploadQueuedVideo(file.file, index)
            : null);
          if (!uploadedJob) throw new Error("Video chưa được lưu vào project. Hãy nhập lại video nguồn.");
          currentJobId = uploadedJob.id;
          if (queueCancelRef.current) {
            throw new Error("Đã hủy hàng đợi.");
          }
          if (uploadedJob.status !== "completed") {
            throw new Error(
              uploadedJob.error || "Video chưa vượt qua bước kiểm tra.",
            );
          }
          setQueueStates((current) => ({
            ...current,
            [index]: { status: "processing", jobId: uploadedJob.id, phase: "Đang áp dụng logo và style preview" },
          }));
          const preparedJob = await applyPreviewOverlayToJob(uploadedJob, subtitle);
          setVideo({
            fileName: file.name,
            sizeBytes: file.size,
            progress: 100,
            job: preparedJob,
          });

          const config: VideoDubbingAutoPipelineConfig = {
            enabled: true,
            master: {
              items: resolveVideoDubbingTtsItems(
                uploadedJob.id,
                subtitleCueOverridesByVideoId,
                subtitle.analysis.items,
              ),
              model: selectedVoice?.modelId || uploadedJob.autoPipeline?.config?.master.model || "",
              speakerId: selectedVoice?.speakerId,
              options: { minSpeed, maxSpeed, speedPriority },
            },
            ttsMasterEnabled: autoPipelineTtsMasterEnabled,
            demucsEnabled: autoPipelineDemucsEnabled,
            mixerSettings,
            originalAudioVolumePercent,
          };
          const startResponse = await fetch(
            `/api/video-dubbing/jobs/${uploadedJob.id}/auto-pipeline`,
            {
              method: "POST",
              headers: { "Content-Type": "application/json" },
              body: JSON.stringify(config),
            },
          );
          const startResult = await startResponse.json();
          if (!startResponse.ok) {
            throw new Error(
              startResult.error || "Không thể bắt đầu Auto Pipeline.",
            );
          }

          setQueueStates((current) => ({
            ...current,
            [index]: {
              status: "processing",
              jobId: uploadedJob.id,
              phase: "Đang bắt đầu Auto Pipeline",
            },
          }));
          let completedJob: VideoDubbingJob | null = null;
          while (!completedJob) {
            const response = await fetch(
              `/api/video-dubbing/jobs/${uploadedJob.id}`,
            );
            const result = await response.json();
            if (!response.ok || !result.job) {
              throw new Error(result.error || "Không thể đọc trạng thái job.");
            }
            const latestJob = result.job as VideoDubbingJob;
            setVideo((current) =>
              current?.job?.id === latestJob.id
                ? { ...current, job: latestJob }
                : current,
            );
            const state = latestJob.autoPipeline;
            if (!state) {
              throw new Error("Job chưa có trạng thái Auto Pipeline.");
            }
            setQueueStates((current) => ({
              ...current,
              [index]: {
                status: "processing",
                jobId: latestJob.id,
                phase: state?.phase || "Đang xử lý",
                progressPercent: state?.progressPercent,
              },
            }));

            if (state?.status === "completed") {
              if (
                latestJob.videoExport?.status !== "completed" ||
                !latestJob.videoExport?.sizeBytes
              ) {
                throw new Error(
                  "Auto Pipeline chưa xác minh được file MP4 đầu ra.",
                );
              }
              completedJob = latestJob;
              break;
            }
            if (state?.status === "failed" || state?.status === "interrupted") {
              throw new Error(state.error || "Auto Pipeline không hoàn tất.");
            }
            if (state?.status === "cancelled") {
              queueCancelRef.current = true;
              setQueueStates((current) => ({
                ...current,
                [index]: {
                  status: "cancelled",
                  jobId: latestJob.id,
                  phase: "Đã hủy",
                },
              }));
              break;
            }
            if (queueCancelRef.current && state?.status === "running") {
              await fetch(
                `/api/video-dubbing/jobs/${latestJob.id}/auto-pipeline/cancel`,
                { method: "POST" },
              );
            }
            await new Promise((resolve) => window.setTimeout(resolve, 750));
          }

          if (completedJob) {
            completedJobIds.push(completedJob.id);
            setQueueStates((current) => ({
              ...current,
              [index]: {
                status: "completed",
                jobId: completedJob!.id,
                phase: "Hoàn tất",
                progressPercent: 100,
              },
            }));
          }
        } catch (error) {
          queueHadFailure = true;
          const message =
            error instanceof Error ? error.message : "Không thể xử lý video.";
          setQueueStates((current) => ({
            ...current,
            [index]: {
              status: queueCancelRef.current ? "cancelled" : "failed",
              jobId: currentJobId || current[index]?.jobId,
              phase: queueCancelRef.current ? "Đã hủy" : "Thất bại",
              error: message,
            },
          }));
          if (queueCancelRef.current) break;
        } finally {
          queueCurrentJobIdRef.current = null;
        }
      }
      if (shouldJoinAfterQueue) {
        if (queueCancelRef.current || queueHadFailure || completedJobIds.length !== queueRows.length) {
          setConcatStatus("skipped");
        } else if (completedJobIds.length < 2) {
          setConcatStatus("failed");
          setMediaError("Cần ít nhất hai video hoàn tất để ghép nối.");
        } else {
          setConcatStatus("running");
          setMediaError(null);
          try {
            const response = await fetch("/api/video-dubbing/exports/concat", {
              method: "POST",
              headers: { "Content-Type": "application/json" },
              body: JSON.stringify({ jobIds: completedJobIds }),
            });
            const result = await response.json();
            if (!response.ok || !result.fileName || !result.jobId) {
              throw new Error(result.error || "Không thể ghép video bằng stream copy.");
            }
            setJoinedVideo({ jobId: result.jobId, fileName: result.fileName, sizeBytes: result.sizeBytes });
            setConcatStatus("completed");
          } catch (error) {
            setConcatStatus("failed");
            setMediaError(error instanceof Error ? error.message : "Không thể ghép video bằng stream copy.");
          }
        }
      }
    } finally {
      queueCurrentJobIdRef.current = null;
      setQueueRunning(false);
      void loadJobHistory();
    }
  };

  const stopQueue = async () => {
    queueCancelRef.current = true;
    if (uploadRef.current) {
      uploadRef.current.abort();
      const activeJobId = activeJobIdRef.current;
      if (activeJobId) {
        try {
          const response = await fetch(
            `/api/video-dubbing/jobs/${activeJobId}/cancel`,
            { method: "POST" },
          );
          const result = await response.json();
          if (!response.ok) {
            throw new Error(result.error || "Không thể hủy tải video.");
          }
        } catch (error) {
          setAutoPipelineError(
            error instanceof Error ? error.message : "Không thể hủy tải video.",
          );
        }
      }
      return;
    }
    const currentJobId = queueCurrentJobIdRef.current;
    if (currentJobId) {
      try {
        const statusResponse = await fetch(
          `/api/video-dubbing/jobs/${currentJobId}`,
        );
        const statusResult = await statusResponse.json();
        if (!statusResponse.ok) {
          throw new Error(
            statusResult.error || "Không thể đọc trạng thái job.",
          );
        }
        if (statusResult.job?.autoPipeline?.status === "running") {
          const response = await fetch(
            `/api/video-dubbing/jobs/${currentJobId}/auto-pipeline/cancel`,
            { method: "POST" },
          );
          const result = await response.json();
          if (!response.ok) {
            throw new Error(result.error || "Không thể hủy Auto Pipeline.");
          }
        }
      } catch (error) {
        setAutoPipelineError(
          error instanceof Error
            ? error.message
            : "Không thể hủy Auto Pipeline.",
        );
      }
    }
  };
  const canExportVideo = Boolean(
    job?.status === "completed" &&
    mixerSettingsSaved &&
    isFinalMixCurrent &&
    !isMasterGenerating &&
    !isMediaProcessing,
  );
  const createMaster = async () => {
    if (!job || !currentTtsSubtitleItems.length || !selectedVoice) return;
    setMasterError(null);
    try {
      const response = await fetch(`/api/video-dubbing/jobs/${job.id}/master`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          items: currentTtsSubtitleItems,
          model: selectedVoice.modelId,
          speakerId: selectedVoice.speakerId,
          options: { minSpeed, maxSpeed, speedPriority },
        }),
      });
      const result = await response.json();
      if (!response.ok) {
        throw new Error(result.error || "Không thể bắt đầu tạo TTS Master.");
      }
      setVideo((current) =>
        current?.job?.id === job.id
          ? {
              ...current,
              job: {
                ...current.job,
                masterGeneration: result.masterGeneration,
              },
            }
          : current,
      );
    } catch (error) {
      setMasterError(
        error instanceof Error
          ? error.message
          : "Không thể bắt đầu tạo TTS Master.",
      );
    }
  };
  const regenerateSubtitleAudio = async (item: SubtitleItem) => {
    if (!job || !selectedVoice || subtitleAudioRegeneratingId) return;
    setSubtitleAudioRegeneratingId(item.id);
    setSubtitleAudioError(null);
    try {
      const syncResponse = await fetch(`/api/video-dubbing/jobs/${job.id}/subtitle-audio`, {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          items: subtitleAudioInput.map((entry) =>
            entry.id === item.id ? { ...entry, text: item.text } : entry,
          ),
        }),
      });
      const synced = await syncResponse.json();
      if (!syncResponse.ok || !Array.isArray(synced.items)) {
        throw new Error(synced.error || "Không thể đồng bộ danh sách audio phụ đề.");
      }
      setSubtitleAudioItems(synced.items);
      const response = await fetch(
        `/api/video-dubbing/jobs/${job.id}/subtitle-audio/${encodeURIComponent(item.id)}/regenerate`,
        {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            items: [item],
            model: selectedVoice.modelId,
            speakerId: selectedVoice.speakerId,
            options: { minSpeed, maxSpeed, speedPriority },
          }),
        },
      );
      const result = await response.json();
      if (!response.ok || !Array.isArray(result.items)) {
        throw new Error(result.error || `Không thể tạo lại audio câu #${item.index}.`);
      }
      setSubtitleAudioItems(result.items);
      const updated = result.items.find((entry: SubtitleAudioRow) => entry.id === item.id);
      if (updated?.status === "failed") {
        setSubtitleAudioError(`Câu #${item.index} (ID ${item.id}): ${updated.error || "Tạo audio thất bại."}`);
      }
    } catch (error) {
      setSubtitleAudioError(error instanceof Error ? error.message : "Không thể tạo lại audio phụ đề.");
    } finally {
      setSubtitleAudioRegeneratingId(null);
    }
  };
  const rebuildMasterFromSubtitleAudio = async () => {
    if (!job || !subtitleAudioInput.length || subtitleAudioMasterBusy) return;
    setSubtitleAudioMasterBusy(true);
    setSubtitleAudioError(null);
    try {
      const response = await fetch(
        `/api/video-dubbing/jobs/${job.id}/subtitle-audio/master`,
        {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ items: subtitleAudioInput }),
        },
      );
      const result = await response.json();
      if (!response.ok || !result.job) {
        throw new Error(result.error || "Không thể tạo lại Master từ các audio câu.");
      }
      setVideo((current) => current?.job?.id === job.id
        ? { ...current, job: result.job }
        : current);
    } catch (error) {
      setSubtitleAudioError(error instanceof Error ? error.message : "Không thể tạo lại Master.");
    } finally {
      setSubtitleAudioMasterBusy(false);
    }
  };
  const saveAutoPipelineConfig = async (config = autoPipelineConfig) => {
    if (!job || !config) return;
    setAutoPipelineError(null);
    setAutoPipelineSaving(true);
    try {
      const saveOperation = mixerSaveChainRef.current.then(async () => {
        const mixerSettingsVersion = mixerSettingsVersionRef.current;
        const configToSave = {
          ...config,
          mixerSettings: mixerSettingsRef.current,
        };
        const configKey = JSON.stringify(configToSave);
        const response = await fetch(
          `/api/video-dubbing/jobs/${job.id}/auto-pipeline/config`,
          {
            method: "PUT",
            headers: { "Content-Type": "application/json" },
            body: configKey,
          },
        );
        const result = await response.json();
        if (!response.ok) {
          throw new Error(
            result.error || "Không thể lưu cấu hình Auto Pipeline.",
          );
        }
        autoPipelineSavedConfigKeyRef.current = JSON.stringify({
          ...configToSave,
          mixerSettings: undefined,
        });
        if (mixerSettingsVersionRef.current === mixerSettingsVersion) {
          mixerTouchedRef.current = false;
          setMixerSettingsSaved(true);
        }
        setVideo((current) =>
          current?.job?.id === job.id
            ? {
                ...current,
                job: {
                  ...current.job,
                  mixerSettings:
                    mixerSettingsVersionRef.current === mixerSettingsVersion
                      ? result.config.mixerSettings
                      : current.job.mixerSettings,
                  autoPipeline: {
                    ...(current.job.autoPipeline || {
                      status: "idle",
                      phase: "validating",
                      completedStages: [],
                      reusedOutputs: [],
                      artifacts: {},
                      updatedAt: Date.now(),
                    }),
                    config: result.config,
                  },
                },
              }
            : current,
        );
      });
      mixerSaveChainRef.current = saveOperation.catch(() => undefined);
      await saveOperation;
    } catch (error) {
      setAutoPipelineError(
        error instanceof Error
          ? error.message
          : "Không thể lưu cấu hình Auto Pipeline.",
      );
    } finally {
      setAutoPipelineSaving(false);
    }
  };
  const startAutoPipeline = async () => {
    if (!job || !autoPipelineConfig) return;
    setAutoPipelineError(null);
    try {
      const response = await fetch(
        `/api/video-dubbing/jobs/${job.id}/auto-pipeline/tts`,
        {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify(autoPipelineConfig),
        },
      );
      const result = await response.json();
      if (!response.ok) {
        throw new Error(result.error || "Không thể bắt đầu tạo TTS.");
      }
      setVideo((current) =>
        current?.job?.id === job.id
          ? {
              ...current,
              job: { ...current.job, autoPipeline: result.state },
            }
          : current,
      );
    } catch (error) {
      setAutoPipelineError(
        error instanceof Error
          ? error.message
          : "Không thể bắt đầu tạo TTS.",
      );
    }
  };
  const cancelAutoPipeline = async () => {
    if (!job) return;
    setAutoPipelineError(null);
    try {
      const response = await fetch(
        `/api/video-dubbing/jobs/${job.id}/auto-pipeline/cancel`,
        { method: "POST" },
      );
      const result = await response.json();
      if (!response.ok) {
        throw new Error(result.error || "Không thể hủy Auto Pipeline.");
      }
      if (result.state) {
        setVideo((current) =>
          current?.job?.id === job.id
            ? {
                ...current,
                job: { ...current.job, autoPipeline: result.state },
              }
            : current,
        );
      }
    } catch (error) {
      setAutoPipelineError(
        error instanceof Error ? error.message : "Không thể hủy Auto Pipeline.",
      );
    }
  };
  const startFinalMix = async () => {
    if (!job) return;
    setMediaError(null);
    setMixerError(null);
    try {
      await flushMixerSettings(job.id);
      const response = await fetch(
        `/api/video-dubbing/jobs/${job.id}/final-mix`,
        {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: localMixerSettingsKey,
        },
      );
      const result = await response.json();
      if (!response.ok) {
        throw new Error(result.error || "Không thể render final mix.");
      }
      setMixerSettingsSaved(true);
      mixerTouchedRef.current = false;
      setVideo((current) =>
        current?.job?.id === job.id
          ? {
              ...current,
              job: {
                ...current.job,
                mixerSettings,
                mixSelection: "final",
                finalMix: result.finalMix,
              },
            }
          : current,
      );
    } catch (error) {
      setMediaError(
        error instanceof Error ? error.message : "Không thể render final mix.",
      );
    }
  };
  const cancelFinalMix = async () => {
    if (!job) return;
    try {
      const response = await fetch(
        `/api/video-dubbing/jobs/${job.id}/final-mix/cancel`,
        { method: "POST" },
      );
      const result = await response.json();
      if (!response.ok) {
        throw new Error(result.error || "Không thể hủy final mix.");
      }
      if (result.job) {
        setVideo((current) =>
          current?.job?.id === job.id
            ? { ...current, job: result.job }
            : current,
        );
      }
    } catch (error) {
      setMediaError(
        error instanceof Error ? error.message : "Không thể hủy final mix.",
      );
    }
  };
  const cancelMaster = async () => {
    if (!job) return;
    try {
      const response = await fetch(
        `/api/video-dubbing/jobs/${job.id}/master/cancel`,
        { method: "POST" },
      );
      const result = await response.json();
      if (!response.ok) {
        throw new Error(result.error || "Không thể hủy tạo TTS Master.");
      }
      if (result.job) {
        setVideo((current) =>
          current?.job?.id === job.id
            ? { ...current, job: result.job }
            : current,
        );
      }
    } catch (error) {
      setMasterError(
        error instanceof Error ? error.message : "Không thể hủy TTS Master.",
      );
    }
  };
  const flushMixerSettings = async (jobId: string) => {
    if (mixerSettingsTimerRef.current !== null) {
      window.clearTimeout(mixerSettingsTimerRef.current);
      mixerSettingsTimerRef.current = null;
    }
    const version = ++mixerSettingsRequestRef.current;
    if (!mixerTouchedRef.current) return;
    const response = await fetch(
      `/api/video-dubbing/jobs/${jobId}/mixer-settings`,
      {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: localMixerSettingsKey,
      },
    );
    const result = await response.json();
    if (!response.ok) {
      throw new Error(result.error || "Không thể lưu mixer settings.");
    }
    if (version === mixerSettingsRequestRef.current) {
      mixerTouchedRef.current = false;
      setMixerSettingsSaved(true);
      setMixerError(null);
    }
  };
  const chooseCoverFile = (file: File | undefined) => {
    if (!file) return;
    const extension = file.name.slice(file.name.lastIndexOf(".")).toLowerCase();
    if (![".png", ".jpg", ".jpeg", ".webp"].includes(extension)) {
      setCoverEditorError("Ảnh cover chỉ hỗ trợ PNG, JPG hoặc WebP.");
      return;
    }
    if (file.size > 20 * 1024 * 1024) {
      setCoverEditorError("Ảnh cover không được vượt quá 20 MB.");
      return;
    }
    setCoverEditorError(null);
    setCoverEditorFile(file);
  };

  const confirmCoverEditor = async () => {
    const targetJob = coverEditorTarget;
    if (!targetJob) return;
    if (!coverEditorFile && !targetJob.overlaySettings?.coverFileName) {
      setCoverEditorError("Hãy chọn ảnh cover trước khi xác nhận.");
      return;
    }

    setCoverEditorBusy(true);
    setCoverEditorError(null);
    try {
      if (coverEditorFile) {
        const extension = coverEditorFile.name
          .slice(coverEditorFile.name.lastIndexOf("."))
          .toLowerCase();
        const uploadResponse = await fetch(
          `/api/video-dubbing/jobs/${targetJob.id}/cover?extension=${encodeURIComponent(extension)}`,
          {
            method: "PUT",
            headers: { "Content-Type": "application/octet-stream" },
            body: coverEditorFile,
          },
        );
        const uploadResult = await uploadResponse.json();
        if (!uploadResponse.ok || !uploadResult.job) {
          throw new Error(uploadResult.error || "Không thể tải ảnh cover lên.");
        }
      }

      const settingsResponse = await fetch(
        `/api/video-dubbing/jobs/${targetJob.id}/overlay-settings`,
        {
          method: "PUT",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            coverEnabled: true,
            coverFrameCount: coverEditorFrameCount,
          }),
        },
      );
      const settingsResult = await settingsResponse.json();
      if (!settingsResponse.ok || !settingsResult.job) {
        throw new Error(settingsResult.error || "Không thể lưu cài đặt cover.");
      }
      updateListedJob(settingsResult.job as VideoDubbingJob);
      setCoverEditorTarget(null);
      setCoverEditorFile(null);
    } catch (error) {
      setCoverEditorError(
        error instanceof Error ? error.message : "Không thể lưu ảnh cover.",
      );
    } finally {
      setCoverEditorBusy(false);
    }
  };

  const removeCoverFromEditor = async () => {
    if (!coverEditorTarget) return;
    setCoverEditorBusy(true);
    setCoverEditorError(null);
    try {
      const response = await fetch(
        `/api/video-dubbing/jobs/${coverEditorTarget.id}/cover`,
        {
          method: "DELETE",
        },
      );
      const result = await response.json();
      if (!response.ok || !result.job) {
        throw new Error(result.error || "Không thể xóa ảnh cover.");
      }
      const updatedJob = result.job as VideoDubbingJob;
      updateListedJob(updatedJob);
      setCoverEditorTarget(updatedJob);
      setCoverEditorFile(null);
      setCoverEditorFrameCount(5);
    } catch (error) {
      setCoverEditorError(
        error instanceof Error ? error.message : "Không thể xóa ảnh cover.",
      );
    } finally {
      setCoverEditorBusy(false);
    }
  };

  const uploadOverlayLogo = async (file: File) => {
    if (!job) return;
    setMediaError(null);
    const extension = file.name.slice(file.name.lastIndexOf(".")).toLowerCase();
    if (![".png", ".jpg", ".jpeg", ".webp"].includes(extension)) {
      setMediaError("Logo chỉ hỗ trợ PNG, JPG hoặc WebP.");
      return;
    }
    if (file.size > 20 * 1024 * 1024) {
      setMediaError("Logo không được vượt quá 20 MB.");
      return;
    }
    setLogoUploading(true);
    try {
      const uploadUrl = activeProject
        ? `/api/video-dubbing/projects/${activeProject.id}/logo?extension=${encodeURIComponent(extension)}`
        : `/api/video-dubbing/jobs/${job.id}/logo?extension=${encodeURIComponent(extension)}`;
      const response = await fetch(
        uploadUrl,
        {
          method: "PUT",
          headers: { "Content-Type": "application/octet-stream" },
          body: file,
        },
      );
      const result = await response.json();
      if (!response.ok) {
        throw new Error(result.error || "Không thể tải logo lên.");
      }
      if (result.project) {
        const project = result.project as VideoDubbingProject;
        setActiveProject(project);
        importProjectRef.current = project;
        setProjects((items) => [project, ...items.filter((item) => item.id !== project.id)]);
      }
      if (result.job) {
        setVideo((current) =>
          current?.job?.id === job.id
            ? { ...current, job: result.job }
            : current,
        );
      }
      setLogoEnabled(true);
    } catch (error) {
      setMediaError(
        error instanceof Error ? error.message : "Không thể tải logo lên.",
      );
    } finally {
      setLogoUploading(false);
    }
  };

  const startVideoExport = async () => {
    if (!job) return;
    setMediaError(null);
    try {
      const response = await fetch(`/api/video-dubbing/jobs/${job.id}/export`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          exportQuality,
          coverEnabled: Boolean(
            job.overlaySettings?.coverEnabled &&
              job.overlaySettings.coverFileName,
          ),
          coverFrameCount: job.overlaySettings?.coverFrameCount ?? 5,
          logoEnabled:
            logoEnabled && Boolean(job.overlaySettings?.logoFileName),
          logoWidthPercent,
          logoPaddingPx,
          logoPosition,
          subtitlesEnabled,
          subtitles: (subtitleCueOverrides ||
            srt?.analysis?.items ||
            job.overlaySettings?.subtitles ||
            []).map(({ startTime, endTime, text }) => ({
            startTime,
            endTime,
            text,
          })),
          textOverlays: fitTextOverlaysToVideoDuration(
            textOverlays,
            job.metadata?.durationSeconds ?? Number.POSITIVE_INFINITY,
          ),
          endScene: {
            enabled: Boolean(job.overlaySettings?.endScene?.enabled),
            durationSeconds: endSceneDurationSeconds,
            aspectRatio: endSceneAspectRatio,
            textOverlays: endSceneTextOverlays,
          } satisfies VideoDubbingEndSceneSettings,
          subtitleFontSize,
          subtitleFontFamily,
          subtitleColor,
          subtitleBackgroundColor,
          subtitleBackgroundTransparent: subtitleBackgroundMode === "none",
          subtitleBackgroundMode,
          subtitleBold,
          subtitleItalic,
          subtitleUnderline,
          subtitleTextCase,
          subtitleOutlineEnabled,
          subtitleOutlineColor,
          subtitleOutlineWidthPx,
          subtitleCharacterSpacingPx,
          subtitleLineSpacingPx,
          subtitlePaddingPx,
          subtitleMarginPx,
          subtitlePosition,
          subtitleBackgroundImage:
            subtitleBackgroundMode === "image" ? subtitleBackgroundImage : null,
        }),
      });
      const result = await response.json();
      if (!response.ok) {
        throw new Error(result.error || "Không thể bắt đầu xuất MP4.");
      }
      setVideo((current) =>
        current?.job?.id === job.id
          ? {
              ...current,
              job: result.job || {
                ...current.job,
                videoExport: result.videoExport,
              },
            }
          : current,
      );
    } catch (error) {
      setMediaError(
        error instanceof Error ? error.message : "Không thể bắt đầu xuất MP4.",
      );
    }
  };

  const updateListedJob = (updatedJob: VideoDubbingJob) => {
    setVideo((current) =>
      current?.job?.id === updatedJob.id
        ? { ...current, job: updatedJob }
        : current,
    );
    setVideoFiles((current) =>
      current.map((item) =>
        item.job?.id === updatedJob.id ? { ...item, job: updatedJob } : item,
      ),
    );
    setJobHistory((current) =>
      current.map((item) =>
        item.job.id === updatedJob.id ? { ...item, job: updatedJob } : item,
      ),
    );
  };

  const saveEndSceneForCurrentVideo = async (enabled: boolean) => {
    if (!job) return;
    setMediaError(null);
    try {
      const response = await fetch(
        `/api/video-dubbing/jobs/${job.id}/overlay-settings`,
        {
          method: "PUT",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            endScene: {
              enabled,
              durationSeconds: endSceneDurationSeconds,
              aspectRatio: endSceneAspectRatio,
              textOverlays: endSceneTextOverlays,
            } satisfies VideoDubbingEndSceneSettings,
          }),
        },
      );
      const result = await response.json();
      if (!response.ok || !result.job) {
        throw new Error(result.error || "Không thể cập nhật End Scene cho video.");
      }
      updateListedJob(result.job as VideoDubbingJob);
    } catch (error) {
      setMediaError(
        error instanceof Error
          ? error.message
          : "Không thể cập nhật End Scene cho video.",
      );
    }
  };

  const updateEndSceneText = (
    index: number,
    patch: Partial<VideoDubbingTextOverlayCue>,
  ) => {
    setEndSceneTextOverlays((current) =>
      current.map((cue, cueIndex) =>
        cueIndex === index ? { ...cue, ...patch } : cue,
      ),
    );
  };

  const addEndSceneText = () => {
    const cue = createDefaultEndSceneText(endSceneDurationSeconds);
    cue.text = "Văn bản mới";
    cue.yPercent = Math.min(90, 50 + endSceneTextOverlays.length * 8);
    setEndSceneTextOverlays((current) => [...current, cue]);
    setSelectedEndSceneTextIndex(endSceneTextOverlays.length);
  };

  const removeSelectedEndSceneText = () => {
    if (selectedEndSceneTextIndex === null) return;
    const next = endSceneTextOverlays.filter(
      (_, index) => index !== selectedEndSceneTextIndex,
    );
    setEndSceneTextOverlays(next);
    setSelectedEndSceneTextIndex(next.length ? Math.min(selectedEndSceneTextIndex, next.length - 1) : null);
  };

  const updateRenderedAudio = async (targetJob: VideoDubbingJob) => {
    if (
      !targetJob.exportedVideoFileName ||
      !targetJob.videoExport?.sizeBytes ||
      targetJob.videoExport.status === "running"
    ) {
      return;
    }
    setAudioUpdateErrors((current) => {
      const next = { ...current };
      delete next[targetJob.id];
      return next;
    });
    try {
      const response = await fetch(
        `/api/video-dubbing/jobs/${targetJob.id}/update-rendered-audio`,
        { method: "POST" },
      );
      const result = await response.json();
      if (!response.ok || !result.job) {
        if (result.job) updateListedJob(result.job as VideoDubbingJob);
        throw new Error(result.error || "Không thể cập nhật audio MP4.");
      }
      updateListedJob(result.job as VideoDubbingJob);

      const deadline = Date.now() + 2 * 60 * 60 * 1000;
      while (Date.now() < deadline) {
        await new Promise((resolve) => window.setTimeout(resolve, 750));
        const statusResponse = await fetch(
          `/api/video-dubbing/jobs/${targetJob.id}`,
        );
        const statusResult = await statusResponse.json();
        if (!statusResponse.ok || !statusResult.job) {
          throw new Error(statusResult.error || "Không thể kiểm tra cập nhật audio MP4.");
        }
        const latestJob = statusResult.job as VideoDubbingJob;
        updateListedJob(latestJob);
        if (latestJob.videoExport?.status !== "running") {
          if (latestJob.videoExport?.status !== "completed") {
            throw new Error(
              latestJob.videoExport?.error ||
                `Cập nhật audio kết thúc với trạng thái ${latestJob.videoExport?.status || "không xác định"}.`,
            );
          }
          return;
        }
      }
      throw new Error("Cập nhật audio MP4 quá thời gian chờ.");
    } catch (error) {
      setAudioUpdateErrors((current) => ({
        ...current,
        [targetJob.id]:
          error instanceof Error ? error.message : "Không thể cập nhật audio MP4.",
      }));
    }
  };

  const requestMasterEdit = async (
    jobId: string,
    action: "split" | "merge" | "clips",
    clips?: VideoDubbingMasterEditClip[],
  ) => {
    try {
      const response = await fetch(
        `/api/video-dubbing/jobs/${jobId}/master-edit/${action}`,
        {
          method: action === "clips" ? "PUT" : "POST",
          ...(clips
            ? {
                headers: { "Content-Type": "application/json" },
                body: JSON.stringify({ clips }),
              }
            : {}),
        },
      );
      const result = await response.json();
      if (!response.ok || !result.job) {
        if (result.job) updateListedJob(result.job as VideoDubbingJob);
        throw new Error(result.error || "Không thể cập nhật TTS Master.");
      }
      updateListedJob(result.job as VideoDubbingJob);
      setMediaError(null);
    } catch (error) {
      const message = error instanceof Error ? error.message : "Không thể cập nhật TTS Master.";
      setMediaError(message);
      throw error;
    }
  };

  const runAllVideosAction = async (
    action: AllVideosActionName,
    targetJobs = allVideosJobs,
  ) => {
    if (
      allVideosRunning ||
      queueRunning ||
      settingsSyncRunning ||
      targetJobs.length === 0
    ) {
      return;
    }
    if (
      action === "tts" &&
      !selectedVoice &&
      targetJobs.some(
        (targetJob) => !targetJob.autoPipeline?.config?.master.model,
      )
    ) {
      setAllVideosAction({
        action,
        status: "completed",
        currentIndex: 0,
        total: targetJobs.length,
        completed: 0,
        errors: ["Hãy chọn giọng đọc trước khi tạo TTS."],
      });
      return;
    }

    const actionLabels: Record<AllVideosActionName, string> = {
      tts: "TTS",
      demucs: "Demucs",
      mix: "Mix Audio",
      render: "Render",
      download: "Download",
    };
    const errors: string[] = [];
    let completed = 0;
    setAllVideosAction({
      action,
      status: "running",
      currentIndex: 0,
      total: targetJobs.length,
      completed: 0,
      errors: [],
    });
    if (action === "download") {
      const downloadableJobs = targetJobs.filter(
        (targetJob) => targetJob.videoExport?.status === "completed",
      );
      if (!downloadableJobs.length) return;
      const downloadUrl = new URL(
        "/api/video-dubbing/exports/download-all",
        window.location.origin,
      );
      downloadUrl.searchParams.set(
        "jobIds",
        downloadableJobs.map((targetJob) => targetJob.id).join(","),
      );
      const link = document.createElement("a");
      link.href = downloadUrl.toString();
      link.download = "video-dubbing-exports.zip";
      document.body.appendChild(link);
      link.click();
      link.remove();
      setAllVideosAction({
        action,
        status: "completed",
        currentIndex: downloadableJobs.length,
        total: downloadableJobs.length,
        completed: downloadableJobs.length,
        errors: [],
      });
      void loadJobHistory();
      return;
    }

    const fetchLatestJob = async (jobId: string): Promise<VideoDubbingJob> => {
      const response = await fetch(`/api/video-dubbing/jobs/${jobId}`);
      const result = await response.json();
      if (!response.ok || !result.job) {
        throw new Error(result.error || "Không thể tải trạng thái job.");
      }
      updateListedJob(result.job as VideoDubbingJob);
      return result.job as VideoDubbingJob;
    };

    const postJobAction = async (
      jobId: string,
      body?: unknown,
    ): Promise<void> => {
      const endpoint =
        action === "tts"
          ? `/api/video-dubbing/jobs/${jobId}/auto-pipeline/tts`
          : action === "demucs"
            ? `/api/video-dubbing/jobs/${jobId}/separation`
            : action === "mix"
            ? `/api/video-dubbing/jobs/${jobId}/final-mix`
            : `/api/video-dubbing/jobs/${jobId}/export`;
      const response = await fetch(endpoint, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(body ?? {}),
      });
      const result = await response.json();
      if (!response.ok) {
        throw new Error(
          result.error || `Không thể bắt đầu ${actionLabels[action]}.`,
        );
      }
      if (result.job) updateListedJob(result.job as VideoDubbingJob);
      const isRunning = (currentJob: VideoDubbingJob) =>
        action === "tts"
          ? currentJob.autoPipeline?.status === "running"
          : action === "demucs"
            ? currentJob.separation?.status === "processing"
          : action === "mix"
            ? currentJob.finalMix?.status === "running"
            : currentJob.videoExport?.status === "running";
      const taskState = (currentJob: VideoDubbingJob) =>
        action === "tts"
          ? currentJob.autoPipeline
          : action === "demucs"
            ? currentJob.separation
          : action === "mix"
            ? currentJob.finalMix
            : currentJob.videoExport;
      const deadline = Date.now() + 2 * 60 * 60 * 1000;
      while (Date.now() < deadline) {
        const latestJob = await fetchLatestJob(jobId);
        if (!isRunning(latestJob)) {
          const state = taskState(latestJob);
          if (state?.status !== "completed") {
            throw new Error(
              state?.error ||
                `${actionLabels[action]} kết thúc với trạng thái ${state?.status || "không xác định"}.`,
            );
          }
          return;
        }
        await new Promise((resolve) => window.setTimeout(resolve, 1000));
      }
      throw new Error(`${actionLabels[action]} quá thời gian chờ.`);
    };

    try {
      for (let index = 0; index < targetJobs.length; index++) {
        const listedJob = targetJobs[index];
        setAllVideosAction({
          action,
          status: "running",
          currentIndex: index + 1,
          total: targetJobs.length,
          currentFileName: listedJob.fileName,
          completed,
          errors: [...errors],
        });
        try {
          const targetJob = await fetchLatestJob(listedJob.id);
          const row = queueRows.find(
            ({ video: queuedVideo }) => queuedVideo?.job?.id === targetJob.id,
          );
          if (action === "tts") {
            const isCurrentJob = targetJob.id === job?.id;
            const savedCues = targetJob.overlaySettings?.subtitles || [];
            const fallbackItems =
              (row?.subtitle?.analysis?.items.length
                ? row.subtitle.analysis.items
                : undefined) ||
              (targetJob.autoPipeline?.config?.master.items.length
                ? targetJob.autoPipeline.config.master.items
                : undefined) ||
              savedCues.map(
                (cue, cueIndex): SubtitleItem => ({
                  id: `saved-${cueIndex + 1}`,
                  index: cueIndex + 1,
                  startTime: cue.startTime,
                  endTime: cue.endTime,
                  targetDuration: Math.max(0.1, cue.endTime - cue.startTime),
                  text: cue.text,
                  status: "pending",
                }),
              );
            const items = resolveVideoDubbingTtsItems(
              targetJob.id,
              subtitleCueOverridesByVideoId,
              fallbackItems,
            );
            if (!items.length) {
              throw new Error("Video chưa có phụ đề để tạo TTS.");
            }
            const savedMaster = targetJob.autoPipeline?.config?.master;
            const useCurrentTtsSettings = isCurrentJob || !savedMaster;
            const voice = useCurrentTtsSettings
              ? selectedVoice
              : undefined;
            if (useCurrentTtsSettings && !voice) {
              throw new Error("Hãy chọn giọng đọc cho video này trước khi tạo TTS.");
            }
            const targetConfig: VideoDubbingAutoPipelineConfig = {
              enabled: true,
              master: {
                items,
                model: useCurrentTtsSettings
                  ? voice!.modelId
                  : savedMaster!.model,
                speakerId: useCurrentTtsSettings
                  ? voice?.speakerId
                  : savedMaster?.speakerId,
                options: useCurrentTtsSettings
                  ? { minSpeed, maxSpeed, speedPriority }
                  : savedMaster.options,
              },
              demucsEnabled:
                false,
              ttsMasterEnabled: true,
              mixerSettings: isCurrentJob
                ? mixerSettings
                : targetJob.mixerSettings ||
                  targetJob.autoPipeline?.config?.mixerSettings ||
                  mixerSettings,
              originalAudioVolumePercent:
                useCurrentTtsSettings
                  ? originalAudioVolumePercent
                  : targetJob.autoPipeline?.config
                      ?.originalAudioVolumePercent ?? originalAudioVolumePercent,
            };
            await postJobAction(targetJob.id, targetConfig);
          } else if (action === "mix") {
            const settings =
              targetJob.id === job?.id
                ? mixerSettings
                : targetJob.mixerSettings ||
                  targetJob.autoPipeline?.config?.mixerSettings ||
                  mixerSettings;
            await postJobAction(targetJob.id, settings);
          } else if (action === "demucs") {
            if (!targetJob.metadata?.audioCodec) {
              throw new Error("Video nguồn không có audio để Demucs tách.");
            }
            await postJobAction(targetJob.id);
          } else {
            await applyPreviewOverlayToJob(targetJob, row?.subtitle);
            await postJobAction(targetJob.id);
          }
          completed++;
        } catch (error) {
          errors.push(
            `${listedJob.fileName}: ${
              error instanceof Error ? error.message : "Lỗi không xác định."
            }`,
          );
        }
      }
    } finally {
      setAllVideosAction({
        action,
        status: "completed",
        currentIndex: targetJobs.length,
        total: targetJobs.length,
        completed,
        errors,
      });
      await loadJobHistory();
    }
  };

  const openProjectFolder = async () => {
    if (!activeProject) return;
    try {
      const response = await fetch(
        `/api/video-dubbing/projects/${activeProject.id}/open-folder`,
        { method: "POST" },
      );
      const result = await response.json();
      if (!response.ok) throw new Error(result.error || "Không thể mở thư mục project.");
    } catch (error) {
      setProjectError(error instanceof Error ? error.message : "Không thể mở thư mục project.");
    }
  };
  const cancelMediaTask = async (task: "audio-mix" | "export") => {
    if (!job) return;
    setMediaError(null);
    try {
      const response = await fetch(
        `/api/video-dubbing/jobs/${job.id}/${task}/cancel`,
        { method: "POST" },
      );
      const result = await response.json();
      if (!response.ok) {
        throw new Error(result.error || "Không thể hủy tác vụ media.");
      }
      if (result.job) {
        setVideo((current) =>
          current?.job?.id === job.id
            ? { ...current, job: result.job }
            : current,
        );
      }
    } catch (error) {
      setMediaError(
        error instanceof Error ? error.message : "Không thể hủy tác vụ media.",
      );
    }
  };
  const startSeparation = async () => {
    if (!job) return;
    setSeparationError(null);
    setVideo((current) =>
      current?.job?.id === job.id
        ? {
            ...current,
            job: {
              ...current.job,
              separation: {
                ...current.job.separation,
                status: "processing",
                phase: "checking",
              },
            },
          }
        : current,
    );
    try {
      const response = await fetch(
        `/api/video-dubbing/jobs/${job.id}/separation`,
        { method: "POST" },
      );
      const result = await response.json();
      if (!response.ok) {
        throw new Error(result.error || "Không thể bắt đầu tách audio.");
      }
      setVideo((current) =>
        current?.job?.id === job.id
          ? {
              ...current,
              job: { ...current.job, separation: result.separation },
            }
          : current,
      );
    } catch (error) {
      setSeparationError(
        error instanceof Error
          ? error.message
          : "Không thể bắt đầu tách audio.",
      );
      try {
        const statusResponse = await fetch(`/api/video-dubbing/jobs/${job.id}`);
        const statusResult = await statusResponse.json();
        if (statusResponse.ok && statusResult.job) {
          setVideo((current) =>
            current?.job?.id === job.id
              ? { ...current, job: statusResult.job }
              : current,
          );
        }
      } catch (statusError) {
        console.error("Không thể tải trạng thái tách audio:", statusError);
      }
    }
  };
  const cancelSeparation = async () => {
    if (!job) return;
    setSeparationError(null);
    try {
      const response = await fetch(
        `/api/video-dubbing/jobs/${job.id}/separation/cancel`,
        { method: "POST" },
      );
      const result = await response.json();
      if (!response.ok) {
        throw new Error(result.error || "Không thể hủy tác vụ tách audio.");
      }
      if (result.job) {
        setVideo((current) =>
          current?.job?.id === job.id
            ? { ...current, job: result.job }
            : current,
        );
      }
    } catch (error) {
      setSeparationError(
        error instanceof Error
          ? error.message
          : "Không thể hủy tác vụ tách audio.",
      );
    }
  };
  const autoPipelineConfigKey = autoPipelineConfig
    ? JSON.stringify({ ...autoPipelineConfig, mixerSettings: undefined })
    : "null";
  useEffect(() => {
    if (
      !job ||
      !autoPipelineConfig ||
      isAutoPipelineRunning ||
      autoPipelineSavedConfigKeyRef.current === autoPipelineConfigKey
    ) {
      return;
    }
    const timer = window.setTimeout(
      () => void saveAutoPipelineConfig(autoPipelineConfig),
      450,
    );
    return () => window.clearTimeout(timer);
  }, [
    job?.id,
    autoPipelineConfigKey,
    autoPipelineConfig,
    isAutoPipelineRunning,
  ]);
  const isBusy =
    !video?.error &&
    (!job || job.status === "uploading" || job.status === "probing");
  const detailVideoFile =
    detailRowIndex === null ? null : queueRows[detailRowIndex]?.video || null;
  const detailSubtitle =
    detailRowIndex === null
      ? null
      : queueRows[detailRowIndex]?.subtitle || null;
  const detailState =
    detailRowIndex === null ? null : queueStates[detailRowIndex] || null;
  const detailJobId = detailState?.jobId;
  const detailJob =
    (detailJobId && video?.job?.id === detailJobId ? video.job : null) ||
    (detailJobId
      ? jobHistory.find((item) => item.job.id === detailJobId)?.job || null
      : null);
  const previewVideoRow = (
    event: ReactMouseEvent<HTMLElement>,
    selectedJob?: VideoDubbingJob,
  ) => {
    if (
      !selectedJob ||
      !(event.target instanceof Element) ||
      event.target.closest("button, a, input, select, textarea, label, summary")
    ) {
      return;
    }
    void previewSourceVideo(selectedJob);
  };
  const renderJobProcessingBar = (targetJob: VideoDubbingJob) => {
    const progress = getJobProcessingProgress(targetJob);
    if (!progress) return null;
    const percent =
      progress.progressPercent === undefined
        ? undefined
        : Math.max(0, Math.min(100, progress.progressPercent));
    return (
      <div className="mt-1.5 space-y-1 px-1" aria-live="polite">
        <div className="flex items-center justify-between gap-2 text-[10px] text-slate-300">
          <span className="truncate">{progress.label}</span>
          <span className="shrink-0">
            {percent === undefined ? "Đang xử lý…" : `${Math.round(percent)}%`}
          </span>
        </div>
        <div
          role="progressbar"
          aria-label={`${progress.label}: ${targetJob.fileName}`}
          aria-valuemin={0}
          aria-valuemax={100}
          aria-valuenow={percent}
          className="h-1.5 overflow-hidden rounded-full bg-slate-800"
        >
          <div
            className={`h-full transition-all ${progress.colorClass} ${
              percent === undefined ? "w-1/3 animate-pulse" : ""
            }`}
            style={percent === undefined ? undefined : { width: `${percent}%` }}
          />
        </div>
      </div>
    );
  };
  const openCoverEditor = async (
    event: ReactMouseEvent<HTMLButtonElement>,
    targetJob: VideoDubbingJob,
  ) => {
    event.stopPropagation();
    const activeJob = job?.id === targetJob.id
      ? targetJob
      : await previewSourceVideo(targetJob);
    if (!activeJob) return;
    setCoverEditorTarget(activeJob);
    setCoverEditorFile(null);
    setCoverEditorFrameCount(activeJob.overlaySettings?.coverFrameCount ?? 5);
    setCoverEditorError(null);
  };
  const renderCoverEditorButton = (targetJob: VideoDubbingJob) => {
    const coverFileName = targetJob.overlaySettings?.coverFileName;
    return (
      <button
        type="button"
        onClick={(event) => openCoverEditor(event, targetJob)}
        disabled={targetJob.status !== "completed" || coverEditorBusy || queueRunning || settingsSyncRunning}
        title={coverFileName ? `Chỉnh cover · ${targetJob.fileName}` : `Thêm cover · ${targetJob.fileName}`}
        aria-label={coverFileName ? `Chỉnh ảnh cover ${targetJob.fileName}` : `Thêm ảnh cover ${targetJob.fileName}`}
        className="inline-flex h-10 w-10 shrink-0 items-center justify-center overflow-hidden rounded-lg border border-violet-500/35 bg-violet-950/30 text-violet-200 hover:bg-violet-900/40 disabled:cursor-not-allowed disabled:opacity-40"
      >
        {coverFileName ? (
          <img
            src={`/api/video-dubbing/jobs/${targetJob.id}/cover?v=${targetJob.updatedAt}`}
            alt=""
            className="h-full w-full object-cover"
          />
        ) : (
          <Upload className="h-4 w-4" />
        )}
      </button>
    );
  };
  const renderVideoActions = (targetJob: VideoDubbingJob) => {
    const isCurrentJob = job?.id === targetJob.id;
    const autoPipelineRunning = isCurrentJob && isAutoPipelineRunning;
    const finalMixRunning = isCurrentJob && finalMix?.status === "running";
    const exportRunning = isCurrentJob && videoExport?.status === "running";
    const hasSrtToDownload = Boolean(resolveSrtDownload(targetJob));
    const hasVideoToDownload = Boolean(
      targetJob.exportedVideoFileName && targetJob.videoExport?.sizeBytes,
    );
    const audioUpdateRunning =
      targetJob.videoExport?.status === "running" &&
      targetJob.videoExport.detail?.toLowerCase().includes("audio");
    return (
      <div className="flex w-full flex-col gap-1.5">
        <div className="grid grid-cols-3 gap-1">
        <button
          type="button"
          onClick={() => void (autoPipelineRunning ? cancelAutoPipeline() : startAutoPipeline())}
          disabled={allVideosRunning || !isCurrentJob || (!autoPipelineRunning && !canStartAutoPipeline)}
          title={autoPipelineRunning ? "Hủy Auto Pipeline" : "Tạo TTS Master cho video này"}
          aria-label={autoPipelineRunning ? "Hủy Auto Pipeline" : `TTS ${targetJob.fileName}`}
          className="rounded-none border border-indigo-400/35 bg-indigo-950/20 px-1.5 py-1 text-xs font-semibold text-indigo-100 hover:bg-indigo-950/40 disabled:cursor-not-allowed disabled:opacity-40"
        >
          {autoPipelineRunning ? "Hủy TTS" : "TTS"}
        </button>
          <button
            type="button"
            onClick={(event) => {
              event.stopPropagation();
              void runAllVideosAction("demucs", [targetJob]);
            }}
            disabled={
              allVideosActionDisabled ||
              !targetJob.metadata?.audioCodec ||
              targetJob.separation?.status === "processing" ||
              separationAvailability?.status !== "ready"
            }
            title={
              targetJob.separation?.status === "processing"
                ? "Demucs đang chạy"
                : separationAvailability?.status === "ready"
                  ? "Tách vocals và instrumental cho video này"
                  : separationAvailability?.message || "Demucs chưa sẵn sàng"
            }
            aria-label={`Demucs ${targetJob.fileName}`}
            className="rounded-none border border-violet-400/35 bg-violet-950/20 px-1.5 py-1 text-xs font-semibold text-violet-100 hover:bg-violet-950/40 disabled:cursor-not-allowed disabled:opacity-40"
          >
            {targetJob.separation?.status === "processing" ? "Đang tách" : "Demucs"}
          </button>
        <button
          type="button"
          onClick={() => void (finalMixRunning ? cancelFinalMix() : startFinalMix())}
          disabled={allVideosRunning || !isCurrentJob || (!finalMixRunning && !canRenderFinalMix)}
          title={finalMixRunning ? "Hủy render final mix" : "Render final mix"}
          aria-label={finalMixRunning ? "Hủy render final mix" : `Mix Audio ${targetJob.fileName}`}
          className="rounded-none border border-cyan-400/35 bg-cyan-950/20 px-1.5 py-1 text-xs font-semibold text-cyan-100 hover:bg-cyan-950/40 disabled:cursor-not-allowed disabled:opacity-40"
        >
          {finalMixRunning ? "Hủy Mix" : "Mix Audio"}
        </button>
        <button
          type="button"
          onClick={() => void (exportRunning ? cancelMediaTask("export") : startVideoExport())}
          disabled={allVideosRunning || !isCurrentJob || (!exportRunning && (!canExportVideo || logoUploading))}
          title={exportRunning ? "Hủy export" : "Export video"}
          aria-label={exportRunning ? "Hủy export" : `Render ${targetJob.fileName}`}
          className="rounded-none border border-sky-400/35 bg-sky-950/20 px-1.5 py-1 text-xs font-semibold text-sky-100 hover:bg-sky-950/40 disabled:cursor-not-allowed disabled:opacity-40"
        >
          {exportRunning ? "Hủy" : "Render"}
        </button>
        <button
          type="button"
          onClick={(event) => {
            event.stopPropagation();
            downloadSrtForJob(targetJob);
          }}
          disabled={!hasSrtToDownload}
          title={hasSrtToDownload ? "Tải phụ đề SRT đã chỉnh sửa" : "Video này chưa có phụ đề"}
          aria-label={`Tải SRT ${targetJob.fileName}`}
          className="rounded-none border border-emerald-500/35 bg-emerald-950/20 px-1.5 py-1 text-xs font-semibold text-emerald-100 hover:bg-emerald-950/40 disabled:cursor-not-allowed disabled:opacity-40 flex items-center justify-center gap-1"
        >
          <FileText className="h-3 w-3" />
          <span>Tải SRT</span>
        </button>
        {hasVideoToDownload ? (
          <a
            href={`/api/video-dubbing/jobs/${targetJob.id}/download`}
            download={targetJob.exportedVideoFileName || `${targetJob.fileName.replace(/\.[^.]+$/, "")}_merged.mp4`}
            onClick={(event) => event.stopPropagation()}
            title={
              targetJob.videoExport?.status === "stale"
                ? "Tải MP4 đã render trước đó (cài đặt hiện tại đã thay đổi)"
                : "Tải video đã render"
            }
            aria-label={`Tải Video ${targetJob.fileName}`}
            className="inline-flex items-center justify-center gap-1 rounded-none border border-emerald-500/35 bg-emerald-950/20 px-1.5 py-1 text-xs font-semibold text-emerald-100 hover:bg-emerald-950/40"
          >
            <Download className="h-3.5 w-3.5" />
            <span>Tải MP4</span>
          </a>
        ) : (
          <button
            type="button"
            disabled
            title="Render video trước khi tải"
            aria-label={`Tải Video ${targetJob.fileName} (chưa sẵn sàng)`}
            className="inline-flex items-center justify-center gap-1 rounded-none border border-emerald-500/35 bg-emerald-950/10 px-1.5 py-1 text-xs font-semibold text-emerald-100 opacity-40 cursor-not-allowed"
          >
            <Download className="h-3.5 w-3.5" />
            <span>Tải MP4</span>
          </button>
        )}
        <button
          type="button"
          onClick={(event) => {
            event.stopPropagation();
            void updateRenderedAudio(targetJob);
          }}
          disabled={
            !hasVideoToDownload ||
            targetJob.videoExport?.status === "running" ||
            targetJob.finalMix?.status === "running" ||
            allVideosRunning
          }
          title={
            !hasVideoToDownload
              ? "Hãy render video trước"
              : "Thay audio MP4 bằng Final Mix mới, không mã hóa lại hình ảnh"
          }
          aria-label={`Cập nhật Audio MP4 ${targetJob.fileName}`}
          className="col-span-3 inline-flex items-center justify-center gap-1.5 rounded-none border border-fuchsia-400/35 bg-fuchsia-950/20 px-2 py-1.5 text-xs font-semibold text-fuchsia-100 hover:bg-fuchsia-950/40 disabled:cursor-not-allowed disabled:opacity-40"
        >
          {audioUpdateRunning && (
            <LoaderCircle className="h-3.5 w-3.5 animate-spin" />
          )}
          {audioUpdateRunning ? "Đang cập nhật Audio MP4…" : "⚡ Cập nhật Audio MP4"}
        </button>
        </div>
        {audioUpdateErrors[targetJob.id] && (
          <p className="text-[10px] leading-snug text-rose-300" role="alert">
            {audioUpdateErrors[targetJob.id]}
          </p>
        )}
      </div>
    );
  };
  const overlayAlignment = getOverlayAlignment(logoPosition);
  const subtitleOverlayAlignment = getOverlayAlignment(subtitlePosition);
  const subtitleCueOverrides = job?.id
    ? subtitleCueOverridesByVideoId[job.id] ?? null
    : null;
  const previewSubtitleCues = subtitleCueOverrides ||
    srt?.analysis?.items || job?.overlaySettings?.subtitles || [];
  useEffect(() => {
    if (!job?.id || !previewSubtitleCues.length) return;
    const seen = new Set<string>();
    const needsIds = previewSubtitleCues.some((cue) => {
      const id = cue.id;
      if (!id || !/^[A-Za-z0-9_-]{1,100}$/.test(id) || seen.has(id)) return true;
      seen.add(id);
      return false;
    });
    if (!needsIds) return;
    setSubtitleCueOverridesByVideoId((current) => {
      const cues = current[job.id] ?? previewSubtitleCues;
      const ids = new Set<string>();
      return {
        ...current,
        [job.id]: cues.map((cue) => {
          let id = cue.id;
          if (!id || !/^[A-Za-z0-9_-]{1,100}$/.test(id) || ids.has(id)) {
            id = crypto.randomUUID();
          }
          ids.add(id);
          return { ...cue, id };
        }),
      };
    });
  }, [job?.id, previewSubtitleCues]);

  const subtitleAudioInput = currentTtsSubtitleItems.map((item, index) => ({
    id: item.id,
    index: index + 1,
    startTime: item.startTime,
    endTime: item.endTime,
    text: item.text,
  }));
  const subtitleAudioInputKey = JSON.stringify(subtitleAudioInput);
  const activeSubtitleAudioFilterCount = Number(subtitleAudioShortFilterEnabled) +
    Number(subtitleAudioSpecialCharactersFilterEnabled) +
    Number(subtitleAudioSimilarFilterEnabled);
  const filteredSubtitleAudioInput = filterSubtitleAudioItems(subtitleAudioInput, {
    ...(subtitleAudioShortFilterEnabled
      ? { maxCharacterCount: subtitleAudioMaxCharacterCount }
      : {}),
    specialCharactersOnly: subtitleAudioSpecialCharactersFilterEnabled,
    similarAdjacent: subtitleAudioSimilarFilterEnabled,
    similarityThreshold: 0.8,
  });
  useEffect(() => {
    setSubtitleAudioItems([]);
    setSubtitleAudioError(null);
    setSubtitleAudioDrafts({});
    subtitleAudioPlaybackIdRef.current = null;
    setSubtitleAudioPlayingId(null);
    const player = subtitleAudioPlayerRef.current;
    if (player) {
      player.pause();
      player.removeAttribute("src");
      player.load();
    }
  }, [job?.id]);

  useEffect(() => () => {
    const player = subtitleAudioPlayerRef.current;
    if (!player) return;
    subtitleAudioPlaybackIdRef.current = null;
    player.pause();
    player.removeAttribute("src");
  }, []);

  useEffect(() => {
    const activeJob = video?.job;
    if (!activeJob) return;

    const previousJobId = activeSubtitleSourceJobIdRef.current;
    const jobChanged = previousJobId !== activeJob.id;
    activeSubtitleSourceJobIdRef.current = activeJob.id;

    const queuedSubtitle = pairVideoDubbingQueueRows(
      [{
        id: activeJob.id,
        name: video.fileName,
        job: activeJob,
      }],
      subtitleFiles,
    )[0]?.subtitle;
    const projectSubtitle = activeProject?.sourceSrts?.find((source) =>
      source.videoId === activeJob.id ||
      (!source.videoId &&
        source.matchByName !== false &&
        fileStem(source.fileName) === fileStem(video.fileName)),
    );
    const legacyProjectSubtitle =
      activeProject?.activeJobId === activeJob.id ? activeProject.srt : undefined;
    const source = queuedSubtitle?.content !== undefined
      ? queuedSubtitle
      : projectSubtitle
        ? {
            fileName: projectSubtitle.fileName,
            content: projectSubtitle.content,
            sizeBytes: new Blob([projectSubtitle.content]).size,
          }
        : legacyProjectSubtitle
          ? {
              fileName: legacyProjectSubtitle.fileName,
              content: legacyProjectSubtitle.content,
              sizeBytes: new Blob([legacyProjectSubtitle.content]).size,
            }
          : null;

    if (source?.content !== undefined) {
      const analysis = "analysis" in source && source.analysis
        ? source.analysis
        : analyzeSrtContent(source.content);
      setSrt({
        fileName: source.fileName,
        sizeBytes: source.sizeBytes,
        content: source.content,
        analysis,
        error: "error" in source ? source.error : undefined,
      });
      setSrtContent(source.content);
      setSubtitlesEnabled(true);
    } else if (jobChanged && previousJobId !== null) {
      setSrt(null);
      setSrtContent("");
      setSelectedSubtitleCue(null);
    }
  }, [video?.job?.id, video?.fileName, subtitleFiles, activeProject]);

  useEffect(() => {
    if (videoWorkspaceTab !== "preview" || timelineWorkspaceTab !== "subtitle-audio" || !job?.id) return;
    if (subtitleAudioInput.length) {
      subtitleAudioKnownNonEmptyJobIdsRef.current.add(job.id);
    } else if (!subtitleAudioKnownNonEmptyJobIdsRef.current.has(job.id)) {
      return;
    }
    const requestId = ++subtitleAudioSyncRequestRef.current;
    const timer = window.setTimeout(() => {
      setSubtitleAudioSyncing(true);
      setSubtitleAudioError(null);
      void fetch(`/api/video-dubbing/jobs/${job.id}/subtitle-audio`, {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ items: JSON.parse(subtitleAudioInputKey) }),
      }).then(async (response) => {
        const result = await response.json();
        if (!response.ok || !Array.isArray(result.items)) {
          throw new Error(result.error || "Không thể đồng bộ audio từng câu.");
        }
        if (requestId === subtitleAudioSyncRequestRef.current) {
          setSubtitleAudioItems(result.items);
        }
      }).catch((error) => {
        if (requestId === subtitleAudioSyncRequestRef.current) {
          setSubtitleAudioError(error instanceof Error ? error.message : "Không thể đồng bộ audio từng câu.");
        }
      }).finally(() => {
        if (requestId === subtitleAudioSyncRequestRef.current) setSubtitleAudioSyncing(false);
      });
    }, 250);
    return () => {
      window.clearTimeout(timer);
      subtitleAudioSyncRequestRef.current += 1;
    };
  }, [videoWorkspaceTab, timelineWorkspaceTab, job?.id, subtitleAudioInputKey]);

  const updatePreviewSubtitleCues = (
    update: (cues: VideoDubbingSubtitleCue[]) => VideoDubbingSubtitleCue[],
  ) => {
    if (!job) return;
    setSubtitleCueOverridesByVideoId((current) => {
      const currentCues = current[job.id] ?? previewSubtitleCues;
      return {
        ...current,
        [job.id]: update(currentCues).map((cue) => ({
          id: cue.id || crypto.randomUUID(),
          startTime: cue.startTime,
          endTime: cue.endTime,
          text: cue.text,
        })),
      };
    });
  };
  const updateSelectedSubtitleCue = (patch: Partial<VideoDubbingSubtitleCue>) => {
    if (selectedSubtitleCue === null) return;
    updatePreviewSubtitleCues((cues) =>
      cues.map((cue, index) =>
        index === selectedSubtitleCue ? { ...cue, ...patch } : cue,
      ),
    );
  };
  const saveSubtitleAudioCueChanges = (cues: VideoDubbingSubtitleCue[]) => {
    updatePreviewSubtitleCues(() => cues);
    const content = formatVideoDubbingSrt(cues);
    const analysis = content ? analyzeSrtContent(content) : undefined;
    setSrtContent(content);
    setSrt((current) => ({
      fileName: current?.fileName || "subtitles.srt",
      sizeBytes: new TextEncoder().encode(content).length,
      content,
      analysis,
    }));
  };
  const adjustSubtitleAudioCueTiming = (
    cueId: string,
    field: "start" | "end",
    direction: -1 | 1,
  ) => {
    const draft = subtitleAudioDrafts[cueId];
    if (draft !== undefined && !draft.trim()) {
      commitSubtitleAudioCueText(cueId);
      return;
    }
    const cues = previewSubtitleCues.map((cue) =>
      cue.id === cueId && draft !== undefined
        ? { ...cue, text: draft.trim() }
        : cue,
    );
    const delta = (subtitleAudioTimingStepMs / 1000) * direction;
    const adjustedCues = adjustSubtitleCueTimings(
      cues,
      field,
      delta,
      job?.metadata?.durationSeconds,
    );
    const adjustedCue = adjustedCues.find((cue) => cue.id === cueId);
    if (!adjustedCue) return;
    saveSubtitleAudioCueChanges(cues.map((cue) =>
      cue.id === cueId ? adjustedCue : cue,
    ));
    setSubtitleAudioDrafts((current) => {
      const next = { ...current };
      delete next[cueId];
      return next;
    });
  };
  const commitSubtitleAudioCueText = (cueId: string) => {
    const draft = subtitleAudioDrafts[cueId];
    if (draft === undefined) return;
    if (!draft.trim()) {
      setSubtitleAudioError("Nội dung phụ đề không được để trống; hãy dùng nút xóa câu nếu muốn bỏ câu.");
      setSubtitleAudioDrafts((current) => {
        const next = { ...current };
        delete next[cueId];
        return next;
      });
      return;
    }
    const cues = previewSubtitleCues.map((cue) => cue.id === cueId
      ? { ...cue, text: draft.trim() }
      : cue);
    saveSubtitleAudioCueChanges(cues);
    setSubtitleAudioDrafts((current) => {
      const next = { ...current };
      delete next[cueId];
      return next;
    });
    setSubtitleAudioError(null);
  };
  const regenerateSubtitleAudioWithDraft = (item: SubtitleItem) => {
    const draft = subtitleAudioDrafts[item.id];
    if (draft !== undefined && !draft.trim()) {
      commitSubtitleAudioCueText(item.id);
      return;
    }
    if (draft !== undefined) commitSubtitleAudioCueText(item.id);
    void regenerateSubtitleAudio({
      ...item,
      text: draft?.trim() || item.text,
    });
  };
  const deleteSubtitleAudioCue = (cueId: string) => {
    const cues = previewSubtitleCues.filter((cue) => cue.id !== cueId);
    if (cues.length === previewSubtitleCues.length) return;
    saveSubtitleAudioCueChanges(cues);
    setSubtitleAudioError(null);
  };
  const playSubtitleAudio = async (item: SubtitleAudioRow) => {
    if (!item.audioUrl) return;
    let player = subtitleAudioPlayerRef.current;
    if (!player) {
      player = new Audio();
      player.preload = "none";
      player.onended = () => {
        subtitleAudioPlaybackIdRef.current = null;
        setSubtitleAudioPlayingId(null);
      };
      player.onerror = () => {
        const playbackId = subtitleAudioPlaybackIdRef.current;
        if (!playbackId) return;
        subtitleAudioPlaybackIdRef.current = null;
        setSubtitleAudioPlayingId(null);
        setSubtitleAudioError("Không thể phát audio câu phụ đề.");
      };
      subtitleAudioPlayerRef.current = player;
    }

    if (subtitleAudioPlaybackIdRef.current === item.id && !player.paused) {
      player.pause();
      subtitleAudioPlaybackIdRef.current = null;
      setSubtitleAudioPlayingId(null);
      return;
    }

    player.pause();
    const playbackId = item.id;
    subtitleAudioPlaybackIdRef.current = playbackId;
    player.src = `${item.audioUrl}?v=${encodeURIComponent(item.generatedText || "")}`;
    setSubtitleAudioError(null);
    try {
      await player.play();
      if (subtitleAudioPlaybackIdRef.current === playbackId) {
        setSubtitleAudioPlayingId(playbackId);
      }
    } catch (error) {
      if (subtitleAudioPlaybackIdRef.current !== playbackId) return;
      subtitleAudioPlaybackIdRef.current = null;
      setSubtitleAudioPlayingId(null);
      setSubtitleAudioError(
        error instanceof Error ? `Không thể phát audio: ${error.message}` : "Không thể phát audio.",
      );
    }
  };
  const combineSubtitleAudioCueAbove = (
    cueId: string,
    mode: "merge" | "join",
  ) => {
    const currentIndex = previewSubtitleCues.findIndex((cue) => cue.id === cueId);
    if (currentIndex <= 0) return;
    const aboveId = previewSubtitleCues[currentIndex - 1].id;
    const cues = combineSubtitleCueWithPrevious(
      previewSubtitleCues,
      cueId,
      mode,
      subtitleAudioDrafts,
    );
    if (!cues) return;
    saveSubtitleAudioCueChanges(cues);
    setSubtitleAudioDrafts((current) => {
      const next = { ...current };
      delete next[cueId];
      if (aboveId) delete next[aboveId];
      return next;
    });
    setSubtitleAudioError(null);
  };
  const adjustAllSubtitleCues = (
    field: "start" | "end" | "move",
    direction: -1 | 1,
  ) => {
    const delta = subtitleTimingAdjustmentsMs[field] / 1000 * direction;
    if (!Number.isFinite(delta) || delta === 0) return;
    updatePreviewSubtitleCues((originalCues) => {
      return adjustSubtitleCueTimings(
        originalCues,
        field,
        delta,
        job?.metadata?.durationSeconds,
      );
    });
  };
  const renderSubtitleTimingAdjustment = (
    field: "start" | "end" | "move",
    label: string,
  ) => (
    <div className="inline-flex items-center gap-1 whitespace-nowrap">
      <span>{label}:</span>
      <button
        type="button"
        disabled={!previewSubtitleCues.length || !job}
        onClick={() => adjustAllSubtitleCues(field, -1)}
        aria-label={`${label} giảm ${subtitleTimingAdjustmentsMs[field]} mili giây cho toàn bộ phụ đề`}
        title={`${label} giảm ${subtitleTimingAdjustmentsMs[field]} ms trên toàn bộ phụ đề`}
        className="rounded border border-slate-700 px-1.5 py-0.5 text-slate-300 hover:border-cyan-500/50 disabled:opacity-40"
      >
        ←
      </button>
      <input
        type="number"
        min={1}
        step={1}
        value={subtitleTimingAdjustmentsMs[field]}
        onChange={(event) => {
          const value = Number(event.target.value);
          if (Number.isFinite(value) && value >= 1) {
            setSubtitleTimingAdjustmentsMs((current) => ({
              ...current,
              [field]: Math.round(value),
            }));
          }
        }}
        aria-label={`${label} mili giây`}
        className="w-14 rounded border border-slate-700 bg-slate-950 px-1 py-0.5 text-center text-slate-200"
      />
      <span>ms</span>
      <button
        type="button"
        disabled={!previewSubtitleCues.length || !job}
        onClick={() => adjustAllSubtitleCues(field, 1)}
        aria-label={`${label} tăng ${subtitleTimingAdjustmentsMs[field]} mili giây cho toàn bộ phụ đề`}
        title={`${label} tăng ${subtitleTimingAdjustmentsMs[field]} ms trên toàn bộ phụ đề`}
        className="rounded border border-slate-700 px-1.5 py-0.5 text-slate-300 hover:border-cyan-500/50 disabled:opacity-40"
      >
        →
      </button>
    </div>
  );
  const subtitleTimelineDuration = Math.max(
    1,
    job?.metadata?.durationSeconds || 0,
    job?.overlaySettings?.endScene?.enabled
      ? (job.metadata?.durationSeconds || 0) + endSceneDurationSeconds
      : 0,
    ...previewSubtitleCues.map((cue) => cue.endTime),
    ...textOverlays.filter((cue) => !cue.isTitle).map((cue) => cue.endTime),
  );
  const subtitleTimelineCursor = previewStatus === "playing"
    ? previewCurrentTime
    : subtitleTimelineCursorTime;
  const previewingEndScene =
    videoWorkspaceTab === "preview" &&
    Boolean(job?.overlaySettings?.endScene?.enabled) &&
    Boolean(job?.metadata) &&
    subtitleTimelineCursor >= (job?.metadata?.durationSeconds ?? Number.POSITIVE_INFINITY);
  subtitleTimelineCursorRef.current = subtitleTimelineCursor;
  const fitSubtitleTimelineToPanel = () => {
    const container = subtitleTimelineScrollRef.current;
    if (!container) return;
    const viewportWidth = container.clientWidth;
    if (viewportWidth <= 0) return;
    setSubtitleTimelineViewportWidth(viewportWidth);
    subtitleTimelineFitRef.current = true;
    subtitleTimelineZoomFocusRef.current = "left";
    setSubtitleTimelineZoom(
      Math.max(0.001, Math.min(180, viewportWidth / subtitleTimelineDuration)),
    );
    container.scrollLeft = 0;
  };
  const changeSubtitleTimelineZoom = (zoom: number) => {
    subtitleTimelineFitRef.current = false;
    subtitleTimelineZoomFocusRef.current = "playhead";
    setSubtitleTimelineZoom(zoom);
  };
  const deleteActiveTextTrack = () => {
    if (!textTracks.some((track) => track.id === activeTextTrackId)) return;
    setTextTracks((tracks) => tracks.filter((track) => track.id !== activeTextTrackId));
    setTextOverlays((cues) =>
      cues.filter((cue) =>
        cue.isTitle || (cue.trackId || DEFAULT_TEXT_TRACK_ID) !== activeTextTrackId,
      ),
    );
    setActiveTextTrackId(
      textTracks.find((track) => track.id !== activeTextTrackId)?.id || DEFAULT_TEXT_TRACK_ID,
    );
    setSelectedTextOverlay(null);
    setSelectedSubtitleCue(null);
  };
  useEffect(() => {
    characterCardOcrRequestRef.current += 1;
    setCharacterCardRegion(null);
    setCharacterCardRegionDraft(null);
    setCharacterCardDrawStart(null);
    setCharacterCardDrawMode(false);
    setCharacterCardOcrJob(null);
    setCharacterCardOcrError(null);
  }, [job?.id]);
  useEffect(() => {
    if (timelineWorkspaceTab !== "subtitle") return;
    const onKeyDown = (event: KeyboardEvent) => {
      const target = event.target;
      if (!(target instanceof HTMLElement) || !target.closest("[data-video-dubbing-timeline]")) return;
      if (target.closest("input, textarea, select, [contenteditable='true'], [role='textbox']")) return;

      const hasModifier = event.ctrlKey || event.metaKey;
      const key = event.key.toLowerCase();
      if (event.shiftKey && !hasModifier && key === "z") {
        event.preventDefault();
        fitSubtitleTimelineToPanel();
        return;
      }
      if (hasModifier && (key === "c" || key === "v")) {
        if (key === "c") {
          if (selectedTextOverlay !== null) {
            const cue = textOverlays[selectedTextOverlay];
            if (!cue || cue.isTitle) return;
            timelineCueClipboardRef.current = { kind: "text", cue: { ...cue } };
          } else if (selectedSubtitleCue !== null) {
            const cue = previewSubtitleCues[selectedSubtitleCue];
            if (!cue) return;
            timelineCueClipboardRef.current = { kind: "subtitle", cue: { ...cue } };
          } else {
            return;
          }
          event.preventDefault();
          return;
        }

        const clipboard = timelineCueClipboardRef.current;
        if (!clipboard || !job) return;
        event.preventDefault();
        const duration = Math.max(0.1, job.metadata?.durationSeconds || subtitleTimelineDuration);
        const startTime = Math.min(subtitleTimelineCursor, Math.max(0, duration - 0.1));
        if (clipboard.kind === "subtitle") {
          const cueDuration = Math.max(0.1, clipboard.cue.endTime - clipboard.cue.startTime);
          const cue = {
            ...clipboard.cue,
            id: crypto.randomUUID(),
            startTime,
            endTime: Math.min(duration, startTime + cueDuration),
          };
          setSelectedTextOverlay(null);
          setSelectedSubtitleCue(previewSubtitleCues.length);
          setSubtitlesEnabled(true);
          updatePreviewSubtitleCues((cues) => [...cues, cue]);
        } else {
          const cueDuration = Math.max(0.1, clipboard.cue.endTime - clipboard.cue.startTime);
          const cue = {
            ...clipboard.cue,
            id: crypto.randomUUID(),
            startTime,
            endTime: Math.min(duration, startTime + cueDuration),
            isTitle: false,
            extendToVideoEnd: false,
          };
          setSelectedSubtitleCue(null);
          setSelectedTextOverlay(textOverlays.length);
          setActiveTextTrackId(cue.trackId || DEFAULT_TEXT_TRACK_ID);
          setTextOverlays([...textOverlays, cue]);
        }
        return;
      }

      if (event.key !== "Delete" || hasModifier) return;
      if (selectedTextOverlay !== null) {
        const cue = textOverlays[selectedTextOverlay];
        if (!cue || cue.isTitle) return;
        event.preventDefault();
        setTextOverlays(textOverlays.filter((_, index) => index !== selectedTextOverlay));
        setSelectedTextOverlay(null);
      } else if (selectedSubtitleCue !== null && previewSubtitleCues[selectedSubtitleCue]) {
        event.preventDefault();
        updatePreviewSubtitleCues((cues) => cues.filter((_, index) => index !== selectedSubtitleCue));
        setSelectedSubtitleCue(null);
      }
    };
    window.addEventListener("keydown", onKeyDown);
    return () => window.removeEventListener("keydown", onKeyDown);
  }, [
    timelineWorkspaceTab,
    selectedTextOverlay,
    selectedSubtitleCue,
    textOverlays,
    previewSubtitleCues,
    job,
    subtitleTimelineDuration,
    subtitleTimelineCursor,
    updatePreviewSubtitleCues,
    fitSubtitleTimelineToPanel,
  ]);
  const subtitleTimelineWidth = Math.max(
    subtitleTimelineViewportWidth,
    subtitleTimelineDuration * subtitleTimelineZoom,
  );
  const subtitleTimelineMinZoom = Math.min(
    8,
    Math.max(0.001, subtitleTimelineViewportWidth / subtitleTimelineDuration),
  );
  const subtitleTimelineStep = Math.max(
    5,
    Math.ceil(subtitleTimelineDuration / 12 / 5) * 5,
  );
  const subtitleTimelineTicks = Array.from(
    { length: Math.floor(subtitleTimelineDuration / subtitleTimelineStep) + 1 },
    (_, index) => index * subtitleTimelineStep,
  );
  useEffect(() => {
    const container = subtitleTimelineScrollRef.current;
    if (!container) return;
    const onWheel = (event: WheelEvent) => {
      if (!event.ctrlKey && !event.shiftKey) return;
      event.preventDefault();
      event.stopPropagation();
      if (event.ctrlKey) {
        const direction = event.deltaY < 0 ? 1 : -1;
        subtitleTimelineFitRef.current = false;
        subtitleTimelineZoomFocusRef.current = "playhead";
        setSubtitleTimelineZoom((current) =>
          adjustSubtitleTimelineZoom(
            current,
            direction > 0 ? "in" : "out",
            subtitleTimelineMinZoom,
          ),
        );
        return;
      }
      container.scrollLeft += event.deltaY || event.deltaX;
    };
    container.addEventListener("wheel", onWheel, { passive: false });
    return () => container.removeEventListener("wheel", onWheel);
  }, [job?.id, previewSubtitleCues.length, subtitleTimelineDuration, subtitleTimelineMinZoom]);
  useEffect(() => {
    const container = subtitleTimelineScrollRef.current;
    if (!container) return;
    const updateViewportWidth = () => {
      const viewportWidth = container.clientWidth;
      if (viewportWidth <= 0) return;
      setSubtitleTimelineViewportWidth(viewportWidth);
      if (subtitleTimelineFitRef.current) {
        subtitleTimelineZoomFocusRef.current = "left";
        setSubtitleTimelineZoom(
          Math.max(0.001, Math.min(180, viewportWidth / subtitleTimelineDuration)),
        );
      }
    };
    updateViewportWidth();
    const observer = new ResizeObserver(updateViewportWidth);
    observer.observe(container);
    return () => observer.disconnect();
  }, [job?.id, timelineWorkspaceTab, subtitleTimelineDuration]);
  useEffect(() => {
    if (timelineWorkspaceTab !== "subtitle") return;
    const frame = window.requestAnimationFrame(() => {
      const container = subtitleTimelineScrollRef.current;
      if (!container) return;
      if (subtitleTimelineZoomFocusRef.current === "left") {
        subtitleTimelineZoomFocusRef.current = "playhead";
        container.scrollLeft = 0;
        return;
      }
      const markerX = (subtitleTimelineCursor / subtitleTimelineDuration) * subtitleTimelineWidth;
      container.scrollLeft = Math.max(0, markerX - container.clientWidth / 2);
    });
    return () => window.cancelAnimationFrame(frame);
  }, [
    subtitleTimelineZoom,
    subtitleTimelineWidth,
    subtitleTimelineDuration,
    timelineWorkspaceTab,
  ]);
  useEffect(() => {
    if (previewStatus !== "playing" || subtitleTimelineFitRef.current) return;
    let frame = 0;
    const keepPlayheadCentered = () => {
      const container = subtitleTimelineScrollRef.current;
      if (container && !subtitleTimelineFitRef.current) {
        const markerX =
          (subtitleTimelineCursorRef.current / subtitleTimelineDuration) *
          subtitleTimelineWidth;
        const nextScrollLeft = Math.max(
          0,
          markerX - container.clientWidth / 2,
        );
        if (Math.abs(container.scrollLeft - nextScrollLeft) > 1) {
          container.scrollLeft = nextScrollLeft;
        }
      }
      frame = window.requestAnimationFrame(keepPlayheadCentered);
    };
    frame = window.requestAnimationFrame(keepPlayheadCentered);
    return () => window.cancelAnimationFrame(frame);
  }, [previewStatus, subtitleTimelineDuration, subtitleTimelineWidth]);
  const subtitleTimelineItems: Array<{
    cue: (typeof previewSubtitleCues)[number];
    index: number;
    lane: number;
  }> = [];
  const subtitleTimelineLaneEnds: number[] = [];
  previewSubtitleCues
    .map((cue, index) => ({ cue, index }))
    .sort((first, second) => first.cue.startTime - second.cue.startTime)
    .forEach(({ cue, index }) => {
      let lane = subtitleTimelineLaneEnds.findIndex((end) => end <= cue.startTime);
      if (lane < 0) lane = subtitleTimelineLaneEnds.length;
      subtitleTimelineLaneEnds[lane] = cue.endTime;
      subtitleTimelineItems.push({ cue, index, lane });
    });
  const textTimelineLanes = getTextOverlayTimelineLanes(
    textOverlays,
    DEFAULT_TEXT_TRACK_ID,
  );
  const activePreviewSubtitle = subtitlesEnabled
    ? previewSubtitleCues.find(
        (cue) =>
          cue.startTime <= previewCurrentTime &&
          cue.endTime >= previewCurrentTime,
      )
    : undefined;
  const orderedSubtitleAudioInput = [...subtitleAudioInput].sort(
    (first, second) => first.startTime - second.startTime || first.index - second.index,
  );
  const activeSubtitleAudioIndex = orderedSubtitleAudioInput.findIndex(
    (item) =>
      item.startTime <= previewCurrentTime &&
      item.endTime >= previewCurrentTime,
  );
  const activeSubtitleAudioItem = activeSubtitleAudioIndex >= 0
    ? orderedSubtitleAudioInput[activeSubtitleAudioIndex]
    : undefined;
  const previousSubtitleAudioItem = activeSubtitleAudioIndex >= 0
    ? orderedSubtitleAudioInput[activeSubtitleAudioIndex - 1]
    : [...orderedSubtitleAudioInput]
        .reverse()
        .find((item) => item.startTime < previewCurrentTime);
  const nextSubtitleAudioItem = activeSubtitleAudioIndex >= 0
    ? orderedSubtitleAudioInput[activeSubtitleAudioIndex + 1]
    : orderedSubtitleAudioInput.find((item) => item.startTime > previewCurrentTime);
  const activeSubtitleAudioRow = activeSubtitleAudioItem
    ? subtitleAudioItems.find((entry) => entry.id === activeSubtitleAudioItem.id)
    : undefined;
  const activeSubtitleAudio: SubtitleItem | undefined = activeSubtitleAudioItem
    ? {
        ...activeSubtitleAudioItem,
        targetDuration: Math.max(
          0.1,
          activeSubtitleAudioItem.endTime - activeSubtitleAudioItem.startTime,
        ),
        status: "pending",
      }
    : undefined;
  const previewTextOverlays = textOverlays.map((cue) =>
      cue.isTitle
        ? {
            ...cue,
            startTime: 0,
            endTime: job?.metadata?.durationSeconds ?? cue.endTime,
          }
        : cue,
  );
  const titleOverlayIndex = textOverlays.findIndex((cue) => cue.isTitle);
  const titleOverlay = titleOverlayIndex >= 0 ? textOverlays[titleOverlayIndex] : undefined;
  const activePreviewTextItems = previewTextOverlays
    .map((cue, index) => ({ cue, index }))
    .filter(({ cue }) =>
      cue.enabled !== false &&
      cue.startTime <= previewCurrentTime &&
      cue.endTime >= previewCurrentTime,
    );
  const updateSelectedTextOverlay = (
    patch: Partial<VideoDubbingTextOverlayCue>,
  ) => {
    if (selectedTextOverlay === null) return;
    if (textOverlays[selectedTextOverlay]?.kind === "character-card") {
      setCharacterCardStyle((current) =>
        resolveCharacterCardStyle({ ...current, ...patch }, current),
      );
    }
    setTextOverlays((items) => items.map((item, index) =>
      index === selectedTextOverlay ? { ...item, ...patch } : item,
    ));
  };
  const applySelectedTextOverlayToTrack = () => {
    if (selectedTextOverlay === null) return;
    const cue = textOverlays[selectedTextOverlay];
    if (!cue || cue.isTitle) return;
    const trackId = cue.trackId || DEFAULT_TEXT_TRACK_ID;
    const styleAndPosition: Partial<VideoDubbingTextOverlayCue> = {
      fontFamily: cue.fontFamily,
      fontSize: cue.fontSize,
      bold: cue.bold,
      italic: cue.italic,
      underline: cue.underline,
      textCase: cue.textCase,
      color: cue.color,
      outlineEnabled: cue.outlineEnabled,
      outlineColor: cue.outlineColor,
      outlineWidthPx: cue.outlineWidthPx,
      characterSpacingPx: cue.characterSpacingPx,
      lineSpacingPx: cue.lineSpacingPx,
      textAlign: cue.textAlign ?? getSubtitleTextAlignment(cue.position),
      position: cue.position,
      xPercent: cue.xPercent,
      yPercent: cue.yPercent,
      backgroundColor: cue.backgroundColor,
      backgroundTransparent: cue.backgroundTransparent,
      paddingPx: cue.paddingPx,
    };
    if (cue.kind === "character-card") {
      setCharacterCardStyle((current) =>
        resolveCharacterCardStyle({ ...cue, ...styleAndPosition }, current),
      );
    }
    setTextOverlays((items) => items.map((item) =>
      !item.isTitle && (item.trackId || DEFAULT_TEXT_TRACK_ID) === trackId
        ? {
            ...item,
            ...styleAndPosition,
            ...(cue.kind === "character-card" && item.kind === "character-card"
              ? { characterRoleFontSize: cue.characterRoleFontSize }
              : {}),
          }
        : item,
    ));
  };
  const addTextOverlayToTrack = (kind: "text" | "character-card" = "text") => {
    if (!job) return;
    const trackId = textTracks.some((track) => track.id === activeTextTrackId)
      ? activeTextTrackId
      : textTracks[0]?.id || DEFAULT_TEXT_TRACK_ID;
    const duration = Math.max(0.1, job.metadata?.durationSeconds || subtitleTimelineDuration);
    const startTime = Math.min(subtitleTimelineCursor, Math.max(0, duration - 0.1));
    const trackStyle = kind === "character-card"
      ? characterCardStyle
      : textOverlays.find((item) =>
        !item.isTitle && (item.trackId || DEFAULT_TEXT_TRACK_ID) === trackId,
      );
    const cue: VideoDubbingTextOverlayCue = {
      kind,
      startTime,
      endTime: Math.min(duration, startTime + 3),
      text: kind === "character-card" ? "Tên nhân vật" : "Text mới",
      characterRole: kind === "character-card" ? "Chức vụ" : undefined,
      characterRoleFontSize: kind === "character-card"
        ? trackStyle?.characterRoleFontSize ?? Math.max(8, Math.round((trackStyle?.fontSize ?? 32) * 0.7))
        : undefined,
      trackId,
      fontSize: trackStyle?.fontSize ?? 28,
      fontFamily: trackStyle?.fontFamily ?? "Arial",
      color: trackStyle?.color ?? "#ffffff",
      bold: trackStyle?.bold ?? false,
      italic: trackStyle?.italic ?? false,
      underline: trackStyle?.underline ?? false,
      textCase: trackStyle?.textCase ?? "none",
      outlineEnabled: trackStyle?.outlineEnabled ?? false,
      outlineColor: trackStyle?.outlineColor ?? "#000000",
      outlineWidthPx: trackStyle?.outlineWidthPx ?? 2,
      characterSpacingPx: trackStyle?.characterSpacingPx ?? 0,
      lineSpacingPx: trackStyle?.lineSpacingPx ?? 0,
      textAlign: trackStyle?.textAlign ?? (trackStyle ? getSubtitleTextAlignment(trackStyle.position) : "center"),
      position: trackStyle?.position ?? "middle-center",
      xPercent: trackStyle?.xPercent,
      yPercent: trackStyle?.yPercent,
      backgroundColor: trackStyle?.backgroundColor ?? "#000000",
      backgroundTransparent: trackStyle?.backgroundTransparent ?? true,
      paddingPx: trackStyle?.paddingPx ?? 0,
    };
    setTextOverlays((items) => [...items, cue]);
    setSelectedTextOverlay(textOverlays.length);
  };
  const startCharacterCardOcrWorker = async () => {
    setCharacterCardOcrError(null);
    try {
      const response = await fetch("/api/subtitle-ocr/worker/start", { method: "POST" });
      const result = await response.json() as { worker?: CharacterCardOcrWorker; error?: string };
      if (!response.ok || !result.worker) {
        throw new Error(result.error || "Không thể bật OCR thường trực.");
      }
      setCharacterCardOcrWorker(result.worker);
    } catch (error) {
      setCharacterCardOcrError(error instanceof Error ? error.message : "Không thể bật OCR thường trực.");
    }
  };
  const stopCharacterCardOcrWorker = async () => {
    setCharacterCardOcrError(null);
    try {
      const response = await fetch("/api/subtitle-ocr/worker/stop", { method: "POST" });
      const result = await response.json() as { worker?: CharacterCardOcrWorker; error?: string };
      if (!response.ok || !result.worker) {
        throw new Error(result.error || "Không thể dừng OCR thường trực.");
      }
      setCharacterCardOcrWorker(result.worker);
      if (characterCardOcrJob?.status === "running" || characterCardOcrJob?.status === "queued") {
        characterCardOcrRequestRef.current += 1;
        setCharacterCardOcrJob({
          ...characterCardOcrJob,
          status: "cancelled",
          message: "Đã dừng worker OCR thường trực.",
        });
      }
    } catch (error) {
      setCharacterCardOcrError(error instanceof Error ? error.message : "Không thể dừng OCR thường trực.");
    }
  };
  const acceptCharacterCardReferenceFile = (file: File | null) => {
    if (!file) return;
    if (!["image/png", "image/jpeg", "image/webp"].includes(file.type)) {
      setCharacterCardReferenceError("Ảnh mẫu cần có định dạng PNG, JPEG hoặc WebP.");
      return;
    }
    if (file.size > 8 * 1024 * 1024) {
      setCharacterCardReferenceError("Ảnh mẫu không được vượt quá 8 MB.");
      return;
    }
    setCharacterCardReferenceFile(file);
    setCharacterCardReferenceError(null);
    setCharacterCardReferenceScanJob(null);
    setCharacterCardReferenceSelectedIds([]);
  };
  const pasteCharacterCardReference = (event: ReactClipboardEvent<HTMLDivElement>) => {
    const imageItem = Array.from(event.clipboardData.items).find((item) =>
      item.type.startsWith("image/"),
    );
    const file = imageItem?.getAsFile();
    if (!file) return;
    event.preventDefault();
    acceptCharacterCardReferenceFile(file);
  };
  const startCharacterCardReferenceScan = async () => {
    if (!job || !characterCardRegion || !characterCardReferenceFile) return;
    const requestId = ++characterCardReferenceScanRequestRef.current;
    setCharacterCardReferenceError(null);
    setCharacterCardReferenceSelectedIds([]);
    setCharacterCardReferenceScanJob(null);
    try {
      const referenceImage = await new Promise<string>((resolve, reject) => {
        const reader = new FileReader();
        reader.onerror = () => reject(new Error("Không thể đọc ảnh mẫu."));
        reader.onload = () => {
          if (typeof reader.result !== "string") {
            reject(new Error("Không thể đọc ảnh mẫu."));
            return;
          }
          resolve(reader.result);
        };
        reader.readAsDataURL(characterCardReferenceFile);
      });
      if (requestId !== characterCardReferenceScanRequestRef.current) return;
      const response = await fetch(
        `/api/video-dubbing/jobs/${job.id}/character-card-reference-scan`,
        {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            referenceImage,
            region: characterCardRegion,
            framesToSkip: characterCardReferenceFramesToSkip,
            similarityThreshold: characterCardReferenceSimilarity,
          }),
        },
      );
      const result = await response.json() as {
        job?: CharacterCardReferenceScanJob;
        error?: string;
      };
      if (!response.ok || !result.job) {
        throw new Error(result.error || "Không thể bắt đầu quét ảnh mẫu.");
      }

      let scanJob = result.job;
      characterCardReferenceScanJobIdRef.current = scanJob.id;
      setCharacterCardReferenceScanJob(scanJob);
      while (scanJob.status === "running") {
        await new Promise((resolve) => window.setTimeout(resolve, 700));
        if (requestId !== characterCardReferenceScanRequestRef.current) return;
        const statusResponse = await fetch(
          `/api/video-dubbing/character-card-reference-scans/${scanJob.id}`,
        );
        const statusResult = await statusResponse.json() as {
          job?: CharacterCardReferenceScanJob;
          error?: string;
        };
        if (!statusResponse.ok || !statusResult.job) {
          throw new Error(statusResult.error || "Không lấy được trạng thái quét ảnh mẫu.");
        }
        scanJob = statusResult.job;
        setCharacterCardReferenceScanJob(scanJob);
      }
      if (characterCardReferenceScanJobIdRef.current === scanJob.id) {
        characterCardReferenceScanJobIdRef.current = null;
      }
      if (requestId !== characterCardReferenceScanRequestRef.current) return;
      if (scanJob.status !== "completed") {
        throw new Error(scanJob.error || scanJob.message || "Quét ảnh mẫu đã dừng trước khi hoàn tất.");
      }
      setCharacterCardReferenceSelectedIds(scanJob.results.map((item) => item.id));
    } catch (error) {
      if (requestId === characterCardReferenceScanRequestRef.current) {
        setCharacterCardReferenceError(
          error instanceof Error ? error.message : "Không thể quét ảnh mẫu.",
        );
      }
    }
  };
  const cancelCharacterCardReferenceScan = async () => {
    if (!characterCardReferenceScanJob || characterCardReferenceScanJob.status !== "running") return;
    try {
      const response = await fetch(
        `/api/video-dubbing/character-card-reference-scans/${characterCardReferenceScanJob.id}/cancel`,
        { method: "POST" },
      );
      const result = await response.json() as {
        job?: CharacterCardReferenceScanJob;
        error?: string;
      };
      if (!response.ok || !result.job) {
        throw new Error(result.error || "Không thể hủy quét ảnh mẫu.");
      }
      characterCardReferenceScanRequestRef.current += 1;
      characterCardReferenceScanJobIdRef.current = null;
      setCharacterCardReferenceScanJob(result.job);
    } catch (error) {
      setCharacterCardReferenceError(
        error instanceof Error ? error.message : "Không thể hủy quét ảnh mẫu.",
      );
    }
  };
  const createCharacterCardsAutomatically = async (
    selectedOccurrences?: CharacterCardOcrOccurrence[],
  ) => {
    if (!job || !characterCardRegion) return;
    const scanRanges = getCharacterCardScanRanges(
      selectedOccurrences?.length
        ? selectedOccurrences.map((occurrence) => occurrence.time)
        : [subtitleTimelineCursor],
      characterCardOcrStartOffset,
      characterCardOcrDuration,
      job.metadata?.durationSeconds ?? 0,
    );
    if (!scanRanges.length) {
      setCharacterCardOcrError("Không còn khoảng thời gian trong video để quét.");
      return;
    }

    const requestId = ++characterCardOcrRequestRef.current;
    setCharacterCardOcrError(null);
    setCharacterCardOcrJob(null);
    const subtitles: CharacterCardOcrJob["subtitles"] = [];
    try {
      for (let index = 0; index < scanRanges.length; index += 1) {
        const scanRange = scanRanges[index];
        const startResponse = await fetch(
          `/api/video-dubbing/jobs/${job.id}/character-card-ocr`,
          {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({
              timeStart: scanRange.startTime,
              durationSeconds: scanRange.durationSeconds,
              region: characterCardRegion,
            }),
          },
        );
        const startResult = await startResponse.json() as {
          job?: CharacterCardOcrJob;
          error?: string;
        };
        if (!startResponse.ok || !startResult.job) {
          throw new Error(startResult.error || "Không thể bắt đầu OCR vùng card.");
        }

        let ocrJob = startResult.job;
        setCharacterCardOcrJob(ocrJob);
        while (ocrJob.status === "queued" || ocrJob.status === "running") {
          await new Promise((resolve) => window.setTimeout(resolve, 700));
          if (requestId !== characterCardOcrRequestRef.current) return;
          const statusResponse = await fetch(`/api/subtitle-ocr/jobs/${ocrJob.id}`);
          const statusResult = await statusResponse.json() as {
            job?: CharacterCardOcrJob;
            error?: string;
          };
          if (!statusResponse.ok || !statusResult.job) {
            throw new Error(statusResult.error || "Không lấy được trạng thái OCR.");
          }
          ocrJob = statusResult.job;
          setCharacterCardOcrJob(ocrJob);
        }
        if (requestId !== characterCardOcrRequestRef.current) return;
        if (ocrJob.status !== "completed") {
          throw new Error(ocrJob.error || ocrJob.message || "OCR đã dừng trước khi hoàn tất.");
        }
        subtitles.push(...ocrJob.subtitles);
      }
      if (requestId !== characterCardOcrRequestRef.current) return;

      const groups = selectedOccurrences?.length
        ? groupCharacterCardOcrCuesByOccurrences(subtitles, selectedOccurrences)
        : groupCharacterCardOcrCues(subtitles);
      if (!groups.length) {
        setCharacterCardOcrError("Không phát hiện chữ trong vùng đã chọn; chưa tạo card nào.");
        return;
      }
      const trackId = textTracks.some((track) => track.id === activeTextTrackId)
        ? activeTextTrackId
        : textTracks[0]?.id || DEFAULT_TEXT_TRACK_ID;
      const trackStyle = characterCardStyle;
      const cards: VideoDubbingTextOverlayCue[] = groups.flatMap((group) => {
        const lines = group.lines.flatMap((line) => line.split(/\r?\n/).map((part) => part.trim()).filter(Boolean));
        const scanRange = scanRanges.find((range) =>
          group.startTime < range.endTime && group.endTime > range.startTime,
        );
        if (!scanRange) return [];
        const startTime = Math.max(scanRange.startTime, group.startTime);
        const endTime = Math.min(scanRange.endTime, group.endTime);
        if (endTime <= startTime || !lines.length) return [];
        return [{
          id: crypto.randomUUID(),
          kind: "character-card",
          startTime,
          endTime,
          text: lines[0] || "Tên nhân vật",
          characterRole: lines.slice(1).join(" "),
          trackId,
          fontSize: trackStyle?.fontSize ?? 28,
          characterRoleFontSize: trackStyle?.characterRoleFontSize ??
            Math.max(8, Math.round((trackStyle?.fontSize ?? 28) * 0.7)),
          fontFamily: trackStyle?.fontFamily ?? "Arial",
          color: trackStyle?.color ?? "#ffffff",
          bold: trackStyle?.bold ?? false,
          italic: trackStyle?.italic ?? false,
          underline: trackStyle?.underline ?? false,
          textCase: trackStyle?.textCase ?? "none",
          outlineEnabled: trackStyle?.outlineEnabled ?? false,
          outlineColor: trackStyle?.outlineColor ?? "#000000",
          outlineWidthPx: trackStyle?.outlineWidthPx ?? 2,
          characterSpacingPx: trackStyle?.characterSpacingPx ?? 0,
          lineSpacingPx: trackStyle?.lineSpacingPx ?? 0,
          textAlign: trackStyle?.textAlign ??
            (trackStyle ? getSubtitleTextAlignment(trackStyle.position) : "center"),
          position: trackStyle?.position ?? "middle-center",
          xPercent: trackStyle?.xPercent,
          yPercent: trackStyle?.yPercent,
          backgroundColor: trackStyle?.backgroundColor ?? "#000000",
          backgroundTransparent: trackStyle?.backgroundTransparent ?? true,
          paddingPx: trackStyle?.paddingPx ?? 0,
        }];
      });
      if (!cards.length) {
        setCharacterCardOcrError("Không phát hiện chữ trong vùng đã chọn; chưa tạo card nào.");
        return;
      }
      setTextOverlays((current) => [...current, ...cards]);
      setActiveTextTrackId(trackId);
      setSelectedTextOverlay(null);
      setSelectedSubtitleCue(null);
      if (selectedOccurrences?.length) {
        setCharacterCardReferenceScanJob(null);
        setCharacterCardReferenceSelectedIds([]);
      }
    } catch (error) {
      if (requestId === characterCardOcrRequestRef.current) {
        setCharacterCardOcrError(
          error instanceof Error ? error.message : "Không thể tạo card từ OCR.",
        );
      }
    }
  };
  const cancelCharacterCardOcr = async () => {
    if (!characterCardOcrJob) return;
    try {
      const response = await fetch(`/api/subtitle-ocr/jobs/${characterCardOcrJob.id}/cancel`, {
        method: "POST",
      });
      const result = await response.json() as { job?: CharacterCardOcrJob; error?: string };
      if (!response.ok || !result.job) {
        throw new Error(result.error || "Không thể hủy OCR.");
      }
      characterCardOcrRequestRef.current += 1;
      setCharacterCardOcrJob(result.job);
    } catch (error) {
      setCharacterCardOcrError(error instanceof Error ? error.message : "Không thể hủy OCR.");
    }
  };
  const createTitleOverlay = () => {
    if (titleOverlayIndex >= 0) {
      setTextOverlays((items) => items.map((item, index) =>
        index === titleOverlayIndex ? { ...item, enabled: true, isTitle: true, startTime: 0, extendToVideoEnd: true } : item,
      ));
      setSelectedTextOverlay(titleOverlayIndex);
      return;
    }

    const reusableClipIndex = textOverlays.findIndex(
      (cue) => cue.extendToVideoEnd && cue.startTime === 0,
    );
    if (reusableClipIndex >= 0) {
      setTextOverlays((items) => items.map((item, index) =>
        index === reusableClipIndex
          ? {
              ...item,
              isTitle: true,
              enabled: true,
              startTime: 0,
              endTime: job?.metadata?.durationSeconds ?? item.endTime,
              extendToVideoEnd: true,
            }
          : item,
      ));
      setSelectedTextOverlay(reusableClipIndex);
      return;
    }

    const duration = Math.max(0.1, job?.metadata?.durationSeconds ?? 1);
    const title: VideoDubbingTextOverlayCue = {
      kind: "text",
      startTime: 0,
      endTime: duration,
      text: "Tiêu đề phim",
      extendToVideoEnd: true,
      isTitle: true,
      enabled: true,
      fontSize: 28,
      fontFamily: "Arial",
      color: "#ffffff",
      bold: true,
      italic: true,
      underline: false,
      textCase: "none",
      outlineEnabled: true,
      outlineColor: "#000000",
      outlineWidthPx: 2,
      characterSpacingPx: 0,
      lineSpacingPx: 0,
      position: "top-center",
      xPercent: 55,
      yPercent: 12,
      backgroundColor: "#000000",
      backgroundTransparent: true,
      paddingPx: 0,
    };
    setTextOverlays((items) => [...items, title]);
    setSelectedTextOverlay(textOverlays.length);
  };
  const subtitleTextStyleValue: TextStyleControlValue = {
    fontFamily: subtitleFontFamily,
    fontSize: subtitleFontSize,
    bold: subtitleBold,
    underline: subtitleUnderline,
    italic: subtitleItalic,
    textCase: subtitleTextCase,
    color: subtitleColor,
    outlineEnabled: subtitleOutlineEnabled,
    outlineColor: subtitleOutlineColor,
    outlineWidthPx: subtitleOutlineWidthPx,
    characterSpacingPx: subtitleCharacterSpacingPx,
    lineSpacingPx: subtitleLineSpacingPx,
  };
  const updateSubtitleTextStyle = (patch: Partial<TextStyleControlValue>) => {
    if (patch.fontFamily !== undefined) setSubtitleFontFamily(patch.fontFamily);
    if (patch.fontSize !== undefined) setSubtitleFontSize(patch.fontSize);
    if (patch.bold !== undefined) setSubtitleBold(patch.bold);
    if (patch.underline !== undefined) setSubtitleUnderline(patch.underline);
    if (patch.italic !== undefined) setSubtitleItalic(patch.italic);
    if (patch.textCase !== undefined) setSubtitleTextCase(patch.textCase);
    if (patch.color !== undefined) setSubtitleColor(patch.color);
    if (patch.outlineEnabled !== undefined) setSubtitleOutlineEnabled(patch.outlineEnabled);
    if (patch.outlineColor !== undefined) setSubtitleOutlineColor(patch.outlineColor);
    if (patch.outlineWidthPx !== undefined) setSubtitleOutlineWidthPx(patch.outlineWidthPx);
    if (patch.characterSpacingPx !== undefined) setSubtitleCharacterSpacingPx(patch.characterSpacingPx);
    if (patch.lineSpacingPx !== undefined) setSubtitleLineSpacingPx(patch.lineSpacingPx);
  };
  const startTextOverlayPreviewDrag = (
    event: ReactPointerEvent<HTMLElement>,
    cueIndex: number,
  ) => {
    const stage = previewStageRef.current;
    if (!stage) return;
    const stageBounds = stage.getBoundingClientRect();
    const overlayBounds = event.currentTarget.getBoundingClientRect();
    if (stageBounds.width <= 0 || stageBounds.height <= 0) return;
    event.preventDefault();
    event.stopPropagation();
    setSelectedTextOverlay(cueIndex);
    const cue = textOverlays[cueIndex];
    const alignment = cue.isTitle ? "center" : cue.textAlign ?? getSubtitleTextAlignment(cue.position);
    const anchorX = alignment === "left"
      ? overlayBounds.left
      : alignment === "right"
        ? overlayBounds.right
        : overlayBounds.left + overlayBounds.width / 2;
    setTextOverlayPreviewDrag({
      cueIndex,
      pointerX: event.clientX,
      pointerY: event.clientY,
      anchorX: anchorX - stageBounds.left,
      centerY: overlayBounds.top + overlayBounds.height / 2 - stageBounds.top,
      stageLeft: stageBounds.left,
      stageTop: stageBounds.top,
      stageWidth: stageBounds.width,
      stageHeight: stageBounds.height,
      overlayWidth: overlayBounds.width,
      overlayHeight: overlayBounds.height,
    });
  };
  const startEndSceneTextDrag = (
    event: ReactPointerEvent<HTMLElement>,
    cueIndex: number,
  ) => {
    const stage = endSceneStageRef.current;
    const cue = endSceneTextOverlays[cueIndex];
    if (!stage || !cue) return;
    const bounds = stage.getBoundingClientRect();
    if (bounds.width <= 0 || bounds.height <= 0) return;
    event.preventDefault();
    event.stopPropagation();
    setSelectedEndSceneTextIndex(cueIndex);
    setEndSceneDrag({
      index: cueIndex,
      pointerX: event.clientX,
      pointerY: event.clientY,
      xPercent: cue.xPercent ?? 50,
      yPercent: cue.yPercent ?? 50,
      stageLeft: bounds.left,
      stageTop: bounds.top,
      stageWidth: bounds.width,
      stageHeight: bounds.height,
    });
  };
  const startSubtitleTimelineDrag = (
    event: ReactPointerEvent<HTMLElement>,
    cueIndex: number,
    startTime: number,
    endTime: number,
    mode: SubtitleTimelineDrag["mode"],
    track: SubtitleTimelineDrag["track"] = "subtitle",
  ) => {
    if (track === "subtitle" && previewSubtitleCues.length === 0) return;
    if (mode !== "move") event.preventDefault();
    event.stopPropagation();
    const trackBounds = subtitleTimelineTrackRef.current?.getBoundingClientRect();
    if (!trackBounds || trackBounds.width <= 0) return;
    subtitleTimelineDragMovedRef.current = false;
    setSubtitleTimelineDrag({
      cueIndex,
      track,
      mode,
      pointerId: event.pointerId,
      startX: event.clientX,
      trackWidth: trackBounds.width,
      timelineDuration: subtitleTimelineDuration,
      originalStart: startTime,
      originalEnd: endTime,
    });
  };
  useEffect(() => {
    const drag = subtitleTimelineDrag;
    if (!drag) return;
    const onPointerMove = (event: PointerEvent) => {
      if (event.pointerId !== drag.pointerId) return;
      if (!subtitleTimelineDragMovedRef.current) {
        if (Math.abs(event.clientX - drag.startX) < SUBTITLE_TIMELINE_DRAG_THRESHOLD_PX) return;
        subtitleTimelineDragMovedRef.current = true;
      }
      const delta = ((event.clientX - drag.startX) / drag.trackWidth) * drag.timelineDuration;
      const snap = (time: number) => Math.round(time * 20) / 20;
      let startTime = drag.originalStart;
      let endTime = drag.originalEnd;
      if (drag.mode === "move") {
        const length = drag.originalEnd - drag.originalStart;
        startTime = snap(Math.max(0, Math.min(drag.timelineDuration - length, drag.originalStart + delta)));
        endTime = startTime + length;
      } else if (drag.mode === "start") {
        startTime = snap(Math.max(0, Math.min(drag.originalEnd - 0.1, drag.originalStart + delta)));
      } else {
        endTime = snap(Math.min(drag.timelineDuration, Math.max(drag.originalStart + 0.1, drag.originalEnd + delta)));
      }
      const update = (items: readonly VideoDubbingSubtitleCue[], isText = false) => {
        if (!items[drag.cueIndex]) return items;
        return items.map((item, index) => index === drag.cueIndex
          ? {
              ...item,
              startTime,
              endTime,
              ...(isText ? { extendToVideoEnd: false } : {}),
            }
          : item,
        );
      };
      if (drag.track === "subtitle") {
        updatePreviewSubtitleCues((cues) => update(cues) as VideoDubbingSubtitleCue[]);
      } else {
        setTextOverlays((current) => update(current, true) as VideoDubbingTextOverlayCue[]);
      }
    };
    const onPointerUp = (event: PointerEvent) => {
      if (event.pointerId === drag.pointerId) {
        subtitleTimelineDragMovedRef.current = false;
        setSubtitleTimelineDrag(null);
      }
    };
    window.addEventListener("pointermove", onPointerMove);
    window.addEventListener("pointerup", onPointerUp);
    window.addEventListener("pointercancel", onPointerUp);
    return () => {
      window.removeEventListener("pointermove", onPointerMove);
      window.removeEventListener("pointerup", onPointerUp);
      window.removeEventListener("pointercancel", onPointerUp);
    };
  }, [subtitleTimelineDrag, previewSubtitleCues, subtitleCueOverrides, textOverlays, job?.id]);
  useEffect(() => {
    const drag = textOverlayPreviewDrag;
    if (!drag) return;
    const onPointerMove = (event: PointerEvent) => {
      const overlayWidthPercent = Math.min(100, (drag.overlayWidth / drag.stageWidth) * 100);
      const cue = textOverlays[drag.cueIndex];
      const alignment = cue?.isTitle
        ? "center"
        : cue?.textAlign ?? (cue ? getSubtitleTextAlignment(cue.position) : "center");
      const minimumX = alignment === "right"
        ? overlayWidthPercent
        : alignment === "center"
          ? overlayWidthPercent / 2
          : 0;
      const maximumX = alignment === "left"
        ? 100 - overlayWidthPercent
        : alignment === "center"
          ? 100 - overlayWidthPercent / 2
          : 100;
      const minimumY = Math.min(50, (drag.overlayHeight / 2 / drag.stageHeight) * 100);
      const xPercent = Math.max(minimumX, Math.min(maximumX,
        ((drag.anchorX + event.clientX - drag.pointerX) / drag.stageWidth) * 100));
      const yPercent = Math.max(minimumY, Math.min(100 - minimumY,
        ((drag.centerY + event.clientY - drag.pointerY) / drag.stageHeight) * 100));
      if (cue?.kind === "character-card") {
        setCharacterCardStyle((current) =>
          resolveCharacterCardStyle({ ...current, xPercent, yPercent }, current),
        );
      }
      setTextOverlays((items) => items.map((item, index) => index === drag.cueIndex
        ? { ...item, xPercent, yPercent }
        : item));
    };
    const onPointerUp = () => setTextOverlayPreviewDrag(null);
    window.addEventListener("pointermove", onPointerMove);
    window.addEventListener("pointerup", onPointerUp, { once: true });
    window.addEventListener("pointercancel", onPointerUp, { once: true });
    return () => {
      window.removeEventListener("pointermove", onPointerMove);
      window.removeEventListener("pointerup", onPointerUp);
      window.removeEventListener("pointercancel", onPointerUp);
    };
  }, [textOverlayPreviewDrag, textOverlays]);
  useEffect(() => {
    const drag = endSceneDrag;
    if (!drag) return;
    const onPointerMove = (event: PointerEvent) => {
      const xPercent = Math.max(
        0,
        Math.min(
          100,
          ((drag.xPercent / 100 * drag.stageWidth +
            event.clientX -
            drag.pointerX) /
            drag.stageWidth) *
            100,
        ),
      );
      const yPercent = Math.max(
        0,
        Math.min(
          100,
          ((drag.yPercent / 100 * drag.stageHeight +
            event.clientY -
            drag.pointerY) /
            drag.stageHeight) *
            100,
        ),
      );
      setEndSceneTextOverlays((items) =>
        items.map((item, index) =>
          index === drag.index ? { ...item, xPercent, yPercent } : item,
        ),
      );
    };
    const onPointerUp = () => setEndSceneDrag(null);
    window.addEventListener("pointermove", onPointerMove);
    window.addEventListener("pointerup", onPointerUp, { once: true });
    window.addEventListener("pointercancel", onPointerUp, { once: true });
    return () => {
      window.removeEventListener("pointermove", onPointerMove);
      window.removeEventListener("pointerup", onPointerUp);
      window.removeEventListener("pointercancel", onPointerUp);
    };
  }, [endSceneDrag]);
  useEffect(() => {
    if (videoWorkspaceTab !== "end-scene") return;
    const container = endScenePreviewContainerRef.current;
    if (!container) return;
    const updateSize = () => {
      const availableWidth = container.clientWidth;
      if (availableWidth <= 0) return;
      const [ratioWidth, ratioHeight] = endSceneAspectRatio
        .split(":")
        .map(Number);
      const ratio = ratioWidth / ratioHeight;
      const height = Math.min(window.innerHeight * 0.6, 640, availableWidth / ratio);
      const width = height * ratio;
      setEndScenePreviewSize((current) =>
        Math.abs(current.width - width) < 1 &&
        Math.abs(current.height - height) < 1
          ? current
          : { width, height },
      );
    };
    const observer = new ResizeObserver(updateSize);
    observer.observe(container);
    updateSize();
    return () => observer.disconnect();
  }, [videoWorkspaceTab, endSceneAspectRatio]);
  const measuredPreviewScale =
    videoPreviewReady && job?.metadata && previewVideoRef.current
      ? previewVideoRef.current.clientWidth / job.metadata.width
      : 0;
  const previewOverlayScale =
    measuredPreviewScale > 0
      ? measuredPreviewScale
      : job?.metadata?.width
        ? Math.min(1, 960 / job.metadata.width)
        : 1;
  const endSceneOverlayScale =
    job?.metadata?.width && endScenePreviewSize.width > 0
      ? endScenePreviewSize.width / job.metadata.width
      : previewOverlayScale;
  const selectedEndSceneCue =
    selectedEndSceneTextIndex === null
      ? null
      : endSceneTextOverlays[selectedEndSceneTextIndex] ?? null;
  const endSceneTextStyleValue: TextStyleControlValue = {
    fontFamily: selectedEndSceneCue?.fontFamily ?? "Arial",
    fontSize: selectedEndSceneCue?.fontSize ?? 48,
    bold: selectedEndSceneCue?.bold ?? false,
    underline: selectedEndSceneCue?.underline ?? false,
    italic: selectedEndSceneCue?.italic ?? false,
    textCase: selectedEndSceneCue?.textCase ?? "none",
    color: selectedEndSceneCue?.color ?? "#ffffff",
    outlineEnabled: selectedEndSceneCue?.outlineEnabled ?? false,
    outlineColor: selectedEndSceneCue?.outlineColor ?? "#000000",
    outlineWidthPx: selectedEndSceneCue?.outlineWidthPx ?? 2,
    characterSpacingPx: selectedEndSceneCue?.characterSpacingPx ?? 0,
    lineSpacingPx: selectedEndSceneCue?.lineSpacingPx ?? 0,
  };
  const updateSelectedEndSceneStyle = (
    patch: Partial<TextStyleControlValue>,
  ) => {
    if (selectedEndSceneTextIndex !== null) {
      updateEndSceneText(selectedEndSceneTextIndex, patch);
    }
  };
  const endSceneEnabled = Boolean(job?.overlaySettings?.endScene?.enabled);
  const subtitleBackgroundSliceUrl = (background: string, slice: "left" | "center" | "right") =>
    `/assets/subtitle/${encodeURIComponent(`${background}-${slice}.png`)}`;

  return (
    <section className={`grid w-full h-full max-w-none grid-cols-1 grid-rows-[auto_auto_minmax(0,1fr)] items-stretch gap-0 p-0 text-slate-200 overflow-hidden ${settingsCollapsed ? "xl:grid-cols-[48px_minmax(0,1fr)]" : "xl:grid-cols-[minmax(390px,440px)_minmax(0,1fr)] 2xl:grid-cols-[minmax(420px,470px)_minmax(0,1fr)]"}`}>
      {subtitleBackgroundPickerOpen && (
        <div className="fixed inset-0 z-[70] flex items-center justify-center bg-black/75 p-3 sm:p-6" role="presentation" onMouseDown={(event) => { if (event.target === event.currentTarget) setSubtitleBackgroundPickerOpen(false); }}>
          <section role="dialog" aria-modal="true" aria-labelledby="subtitle-background-picker-title" className="max-h-[88vh] w-full max-w-4xl space-y-4 overflow-y-auto rounded-2xl border border-slate-700 bg-slate-900 p-4 shadow-2xl sm:p-5">
            <header className="flex items-center justify-between gap-3">
              <div><h3 id="subtitle-background-picker-title" className="font-semibold text-white">Chọn ảnh nền phụ đề</h3><p className="mt-1 text-xs text-slate-400">Preview cách ghép ba slice left, center và right.</p></div>
              <button type="button" onClick={() => setSubtitleBackgroundPickerOpen(false)} className="rounded-lg border border-slate-700 p-2 text-slate-300 hover:bg-slate-800" aria-label="Đóng chọn ảnh nền"><X className="h-4 w-4" /></button>
            </header>
            {subtitleBackgrounds.length === 0 ? (
              <p className="rounded-xl border border-slate-800 bg-slate-950/50 p-4 text-sm text-slate-400">Chưa tìm thấy bộ ảnh nền 3-slice hợp lệ.</p>
            ) : (
              <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
                {subtitleBackgrounds.map((background) => {
                  const selected = subtitleBackgroundImage === background;
                  return (
                    <button key={background} type="button" aria-pressed={selected} onClick={() => { setSubtitleBackgroundImage(background); setSubtitleBackgroundPickerOpen(false); }} className={`rounded-xl border p-3 text-left transition-colors ${selected ? "border-sky-400/70 bg-sky-950/30" : "border-slate-700 bg-slate-950/60 hover:border-slate-500"}`}>
                      <div className="mx-auto flex h-20 w-full items-center justify-center overflow-hidden rounded-lg bg-slate-800">
                        <img aria-hidden="true" src={subtitleBackgroundSliceUrl(background, "left")} alt="" className="h-full w-auto shrink-0 object-contain" />
                        <img aria-hidden="true" src={subtitleBackgroundSliceUrl(background, "center")} alt="" className="h-full w-auto shrink-0 object-contain" />
                        <img aria-hidden="true" src={subtitleBackgroundSliceUrl(background, "right")} alt="" className="h-full w-auto shrink-0 object-contain" />
                      </div>
                      <span className="mt-2 flex items-center justify-between gap-2 text-xs font-medium text-slate-200"><span className="truncate">{background.replace(/\.(png|webp)$/i, "")}</span>{selected && <span className="shrink-0 text-sky-300">Đang chọn</span>}</span>
                    </button>
                  );
                })}
              </div>
            )}
          </section>
        </div>
      )}
      <header className="h-10 sm:h-11 px-3 shrink-0 flex items-center justify-between border-b border-slate-800 bg-slate-900/95 rounded-none xl:col-span-2 xl:row-start-1 select-none">
        <div className="flex items-center gap-2.5">
          <div className="w-6 h-6 rounded-none bg-amber-500/15 text-amber-400 border border-amber-500/25 flex items-center justify-center font-bold text-xs">
            <Film className="w-3.5 h-3.5" />
          </div>
          <div className="flex items-center gap-2">
            <h2 className="text-xs sm:text-sm font-bold text-white uppercase tracking-tight">Video Dubbing</h2>
            <span className="text-[10px] text-slate-400 hidden sm:inline font-mono">
              · Pipeline Đồng Bộ Phụ Đề
            </span>
          </div>
          <label className="flex items-center gap-2 ml-3 text-[11px] text-slate-300 cursor-pointer">
            <input
              type="checkbox"
              checked={autoPipelineTtsMasterEnabled}
              onChange={(event) =>
                setAutoPipelineTtsMasterEnabled(event.target.checked)
              }
              className="accent-indigo-400"
            />
            <span className="font-semibold text-slate-200">
              Tạo TTS Master trong Auto Pipeline
            </span>
          </label>
        </div>
        <span className="px-2 py-0.5 rounded-none text-[10px] font-bold uppercase tracking-wide bg-slate-800 text-slate-300 border border-slate-700">
          Piper & VieNeu Turbo · Demucs
        </span>
      </header>

      {historyExpanded && (
      <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/75 p-3 sm:p-6" role="presentation" onMouseDown={(event) => { if (event.target === event.currentTarget) setHistoryExpanded(false); }}>
      <section role="dialog" aria-modal="true" aria-labelledby="video-dubbing-history-title" className="max-h-[90vh] w-full max-w-5xl space-y-3 overflow-y-auto rounded-2xl border border-slate-800 bg-slate-900 p-4 shadow-2xl sm:p-5">
        <div className="flex items-center justify-between gap-3">
          <div className="flex min-w-0 items-center gap-2">
            <History className="w-4 h-4 text-amber-400" />
            <h3 id="video-dubbing-history-title" className="font-semibold text-white">Lịch sử job</h3>
            <span className="text-xs text-slate-500">{jobHistory.length}</span>
          </div>
          <div className="flex items-center gap-2">
          <button
            type="button"
            onClick={() => void loadJobHistory()}
            disabled={historyLoading}
            className="inline-flex items-center gap-1.5 rounded-lg border border-slate-700 bg-slate-950/70 px-2.5 py-1.5 text-xs text-slate-300 hover:text-white disabled:opacity-50"
          >
            <RefreshCw
              className={`w-3.5 h-3.5 ${historyLoading ? "animate-spin" : ""}`}
            />
            Làm mới
          </button>
          <button type="button" onClick={() => setHistoryExpanded(false)} className="rounded-lg border border-slate-700 px-3 py-1.5 text-xs text-slate-300 hover:text-white">Đóng</button>
          </div>
        </div>
        {historyExpanded && (
          <div id="video-dubbing-job-history" className="space-y-3">
            {historyError && (
              <p className="rounded-lg border border-rose-500/30 bg-rose-950/30 p-2.5 text-xs text-rose-200">
                {historyError}
              </p>
            )}
            {jobHistory.length === 0 ? (
              <p className="rounded-xl border border-slate-800 bg-slate-950/50 p-3 text-xs text-slate-500">
                {historyLoading
                  ? "Đang tải lịch sử job…"
                  : "Chưa có job Video Dubbing được lưu."}
              </p>
            ) : (
              <ul className="space-y-2">
                {jobHistory.map((item) => {
                  const isSelected = item.job.id === job?.id;
                  const outputs = [
                    ["Video", item.outputs.sourceVideo],
                    ["TTS Master", item.outputs.masterAudio],
                    ["Vocals", item.outputs.vocals],
                    ["Instrumental", item.outputs.instrumental],
                    ["Bản phối", item.outputs.mixedAudio],
                    ["Final mix", item.outputs.finalMix],
                    ["MP4", item.outputs.exportedVideo],
                  ] as const;
                  return (
                    <li
                      key={item.job.id}
                      className={`rounded-xl border p-3 ${
                        isSelected
                          ? "border-amber-500/40 bg-amber-950/15"
                          : "border-slate-800 bg-slate-950/50"
                      }`}
                    >
                      <div className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
                        <div className="min-w-0 flex-1">
                          <div className="flex flex-wrap items-center gap-x-2 gap-y-1">
                            <span className="truncate text-sm font-semibold text-slate-100">
                              {item.job.fileName}
                            </span>
                            <span className="rounded-full bg-slate-800 px-2 py-0.5 text-[10px] text-slate-300">
                              {statusLabel(item.job)}
                            </span>
                            <code className="text-[10px] text-slate-500">
                              {item.job.id.slice(-8)}
                            </code>
                            <span className="text-[10px] text-slate-500">
                              {new Date(item.job.createdAt).toLocaleString()}
                            </span>
                          </div>
                          <div className="mt-2 flex flex-wrap gap-1.5">
                            {outputs.map(([label, available]) => (
                              <span
                                key={label}
                                className={`inline-flex items-center gap-1 rounded-full border px-2 py-0.5 text-[10px] ${
                                  available
                                    ? "border-emerald-500/20 bg-emerald-950/20 text-emerald-300"
                                    : "border-slate-800 bg-slate-900/60 text-slate-500"
                                }`}
                              >
                                {available && (
                                  <CheckCircle2 className="h-3 w-3" />
                                )}
                                {label}
                              </span>
                            ))}
                          </div>
                          {item.warning && (
                            <p className="mt-2 text-[11px] leading-relaxed text-amber-300">
                              {item.warning}
                            </p>
                          )}
                        </div>
                        <div className="flex shrink-0 gap-2">
                          <button
                            type="button"
                            onClick={() => openHistoryJob(item)}
                            className="inline-flex items-center gap-1.5 rounded-lg border border-amber-500/30 bg-amber-950/20 px-2.5 py-1.5 text-xs font-semibold text-amber-200 hover:bg-amber-950/40"
                          >
                            <FolderOpen className="h-3.5 w-3.5" />
                            Mở job
                          </button>
                          <button
                            type="button"
                            onClick={() => void deleteHistoryJob(item)}
                            className="inline-flex items-center gap-1.5 rounded-lg border border-slate-700 bg-slate-950/70 px-2.5 py-1.5 text-xs text-slate-300 hover:border-rose-500/40 hover:text-rose-200"
                            aria-label={`Xóa job ${item.job.fileName}`}
                          >
                            <Trash2 className="h-3.5 w-3.5" />
                            Xóa
                          </button>
                        </div>
                      </div>
                    </li>
                  );
                })}
              </ul>
            )}
          </div>
        )}
      </section>
      </div>
      )}

      {projectsExpanded && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/75 p-3 sm:p-6" role="presentation" onMouseDown={(event) => { if (event.target === event.currentTarget) setProjectsExpanded(false); }}>
          <section role="dialog" aria-modal="true" aria-labelledby="video-dubbing-projects-title" className="max-h-[88vh] w-full max-w-3xl space-y-4 overflow-y-auto rounded-2xl border border-slate-800 bg-slate-900 p-4 shadow-2xl sm:p-5">
            <div className="flex items-center justify-between gap-3">
              <div><h3 id="video-dubbing-projects-title" className="font-semibold text-white">Project Video Dubbing</h3><p className="mt-1 text-xs text-slate-400">Mặc định ứng dụng mở workspace trống. Chỉ project được đặt mặc định mới tự mở khi khởi động.</p></div>
              <button type="button" onClick={() => setProjectsExpanded(false)} className="rounded-lg border border-slate-700 px-3 py-1.5 text-xs text-slate-300 hover:text-white">Đóng</button>
            </div>
            {projectError && <p className="rounded-lg border border-rose-500/30 bg-rose-950/30 p-2.5 text-xs text-rose-200">{projectError}</p>}
            <div className="flex items-center justify-between gap-2 rounded-xl border border-slate-800 bg-slate-950/50 p-3">
              <span className="text-xs text-slate-400">{activeProject ? `Đang mở: ${activeProject.name} · ${projectSaveState === "saved" ? "Đã lưu" : projectSaveState === "saving" ? "Đang lưu…" : "Lỗi lưu"}` : "Chưa mở project"}</span>
              <button type="button" disabled={projectBusy} onClick={() => void createProject()} className="rounded-lg bg-sky-400 px-3 py-2 text-xs font-bold text-slate-950 disabled:opacity-50">Tạo project từ phiên hiện tại</button>
            </div>
            {projects.length === 0 ? <p className="rounded-xl border border-slate-800 p-4 text-sm text-slate-500">Chưa có project được lưu.</p> : <ul className="space-y-2">{projects.map((project) => (
              <li key={project.id} className={`flex flex-wrap items-center justify-between gap-3 rounded-xl border p-3 ${activeProject?.id === project.id ? "border-sky-500/40 bg-sky-950/15" : "border-slate-800 bg-slate-950/40"}`}>
                <div className="min-w-0 flex-1">
                  <p className="truncate text-sm font-semibold text-white">{project.name}{defaultProjectId === project.id && <span className="ml-2 rounded-full border border-emerald-500/30 px-2 py-0.5 text-[10px] font-medium text-emerald-300">Mặc định</span>}</p>
                  <p className="mt-1 text-xs text-slate-500">{project.jobIds.length} video/job · cập nhật {new Date(project.updatedAt).toLocaleString()}</p>
                  {project.storagePath && <p className="mt-1 break-all font-mono text-[10px] leading-relaxed text-slate-400" title={project.storagePath}>Thư mục project: {project.storagePath}</p>}
                  {project.jobsDirectory && <p className="break-all font-mono text-[10px] leading-relaxed text-sky-300/80" title={project.jobsDirectory}>Video được lưu trong: {project.jobsDirectory}{"\\<ID video>\\source.video"}</p>}
                </div>
                <div className="flex flex-wrap gap-2"><button type="button" disabled={projectBusy} onClick={() => void openProject(project)} className="rounded-lg border border-sky-500/30 px-3 py-1.5 text-xs text-sky-200 disabled:opacity-50">Mở</button><button type="button" disabled={projectBusy} onClick={() => void renameProject(project)} className="rounded-lg border border-slate-700 px-3 py-1.5 text-xs text-slate-300 disabled:opacity-50">Đổi tên</button><button type="button" onClick={() => setDefaultProject(defaultProjectId === project.id ? null : project)} className="rounded-lg border border-slate-700 px-3 py-1.5 text-xs text-slate-300">{defaultProjectId === project.id ? "Bỏ mặc định" : "Đặt mặc định"}</button><button type="button" disabled={projectBusy} onClick={() => void deleteProject(project)} className="rounded-lg border border-rose-500/30 px-3 py-1.5 text-xs text-rose-200 disabled:opacity-50">Xóa</button></div>
              </li>
            ))}</ul>}
          </section>
        </div>
      )}

      {guideOpen && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/75 p-3 sm:p-6" role="presentation" onMouseDown={(event) => { if (event.target === event.currentTarget) setGuideOpen(false); }}>
          <section role="dialog" aria-modal="true" aria-labelledby="video-dubbing-guide-title" className="w-full max-w-xl space-y-4 rounded-2xl border border-slate-800 bg-slate-900 p-5 shadow-2xl">
            <div className="flex items-center justify-between gap-3"><h3 id="video-dubbing-guide-title" className="font-semibold text-white">Hướng Dẫn</h3><button type="button" onClick={() => setGuideOpen(false)} className="rounded-lg border border-slate-700 px-3 py-1.5 text-xs text-slate-300 hover:text-white">Đóng</button></div>
            <ul className="space-y-3 text-sm text-slate-300">
              <li><b className="text-white">Bắt đầu hàng đợi:</b> xử lý tuần tự các video và SRT trong danh sách nguồn.</li>
              <li><b className="text-white">TTS:</b> tạo TTS Master và tách vocal/instrumental nếu được bật; không tự chạy Mix Audio hay Render.</li>
              <li><b className="text-white">Mix Audio:</b> tạo file âm thanh cuối từ các track và mixer của video đang chọn.</li>
              <li><b className="text-white">Render:</b> ghép final mix, phụ đề và logo vào video đang chọn.</li>
              <li><b className="text-white">Mở Project Folder:</b> mở thư mục chứa dữ liệu của project đang mở.</li>
              <li><b className="text-white">Lịch sử job:</b> xem lại và mở các job đã lưu.</li>
            </ul>
          </section>
        </div>
      )}

      {coverEditorTarget && (
        <div
          className="fixed inset-0 z-[60] flex items-center justify-center bg-black/75 p-3 sm:p-6"
          role="presentation"
          onMouseDown={(event) => {
            if (event.target === event.currentTarget && !coverEditorBusy) {
              setCoverEditorTarget(null);
              setCoverEditorFile(null);
              setCoverEditorError(null);
            }
          }}
        >
          <section
            role="dialog"
            aria-modal="true"
            aria-labelledby="cover-editor-title"
            className="w-full max-w-lg space-y-4 rounded-2xl border border-slate-800 bg-slate-900 p-4 shadow-2xl sm:p-5"
          >
            <div className="flex items-start justify-between gap-3">
              <div className="min-w-0">
                <h3 id="cover-editor-title" className="font-semibold text-white">
                  Cover cho video
                </h3>
                <p className="mt-1 truncate text-xs text-slate-400">
                  {coverEditorTarget.fileName}
                </p>
              </div>
              <button
                type="button"
                onClick={() => {
                  setCoverEditorTarget(null);
                  setCoverEditorFile(null);
                  setCoverEditorError(null);
                }}
                disabled={coverEditorBusy}
                className="rounded-lg border border-slate-700 px-3 py-1.5 text-xs text-slate-300 hover:text-white disabled:opacity-40"
              >
                Đóng
              </button>
            </div>
            {coverEditorError && (
              <p className="rounded-lg border border-rose-500/30 bg-rose-950/30 p-2.5 text-xs text-rose-200" role="alert">
                {coverEditorError}
              </p>
            )}
            <input
              ref={coverEditorInputRef}
              type="file"
              accept=".png,.jpg,.jpeg,.webp,image/png,image/jpeg,image/webp"
              className="hidden"
              onChange={(event) => {
                chooseCoverFile(event.target.files?.[0]);
                event.target.value = "";
              }}
            />
            <div
              onDragEnter={(event: DragEvent<HTMLDivElement>) => {
                event.preventDefault();
                setCoverEditorDragOver(true);
              }}
              onDragOver={(event: DragEvent<HTMLDivElement>) => {
                event.preventDefault();
                event.dataTransfer.dropEffect = "copy";
              }}
              onDragLeave={(event: DragEvent<HTMLDivElement>) => {
                if (event.currentTarget === event.target) {
                  setCoverEditorDragOver(false);
                }
              }}
              onDrop={(event: DragEvent<HTMLDivElement>) => {
                event.preventDefault();
                event.stopPropagation();
                setCoverEditorDragOver(false);
                chooseCoverFile(event.dataTransfer.files[0]);
              }}
              className={`rounded-xl border border-dashed p-4 text-center transition-colors ${
                coverEditorDragOver
                  ? "border-violet-300 bg-violet-500/10"
                  : "border-slate-700 bg-slate-950/50"
              }`}
            >
              {coverEditorPreviewUrl || coverEditorTarget.overlaySettings?.coverFileName ? (
                <img
                  src={
                    coverEditorPreviewUrl ||
                    `/api/video-dubbing/jobs/${coverEditorTarget.id}/cover?v=${coverEditorTarget.updatedAt}`
                  }
                  alt="Preview ảnh cover"
                  className="mx-auto max-h-56 max-w-full rounded-lg object-contain"
                />
              ) : (
                <div className="flex h-40 flex-col items-center justify-center gap-2 text-slate-500">
                  <Upload className="h-8 w-8" />
                  <span className="text-xs">Kéo thả ảnh cover vào đây</span>
                </div>
              )}
              <p className="mt-3 truncate text-xs text-slate-300">
                {coverEditorFile?.name ||
                  coverEditorTarget.overlaySettings?.coverFileName ||
                  "PNG, JPG hoặc WebP · tối đa 20 MB"}
              </p>
              <button
                type="button"
                onClick={() => coverEditorInputRef.current?.click()}
                disabled={coverEditorBusy}
                className="mt-3 rounded-lg border border-violet-500/35 px-3 py-1.5 text-xs font-semibold text-violet-100 hover:bg-violet-950/40 disabled:opacity-40"
              >
                Chọn ảnh
              </button>
            </div>
            <label className="block space-y-2 text-xs text-slate-300">
              <span className="flex justify-between">
                <span>Số frame đầu hiển thị cover</span>
                <span>{coverEditorFrameCount} frame</span>
              </span>
              <input
                type="range"
                min="5"
                max="10"
                step="1"
                value={coverEditorFrameCount}
                onChange={(event) =>
                  setCoverEditorFrameCount(Number(event.target.value))
                }
                disabled={coverEditorBusy}
                className="w-full accent-violet-400"
              />
            </label>
            <p className="text-[11px] leading-relaxed text-slate-500">
              Ảnh được căn giữa và crop phần thừa để vừa khung hình, không bị kéo giãn. Cài đặt này chỉ áp dụng cho video đang chọn.
            </p>
            <div className="flex flex-wrap justify-between gap-2 border-t border-slate-800 pt-3">
              {coverEditorTarget.overlaySettings?.coverFileName ? (
                <button
                  type="button"
                  onClick={() => void removeCoverFromEditor()}
                  disabled={coverEditorBusy}
                  className="rounded-lg border border-rose-500/30 px-3 py-2 text-xs text-rose-200 hover:bg-rose-950/30 disabled:opacity-40"
                >
                  Xóa cover
                </button>
              ) : (
                <span />
              )}
              <div className="ml-auto flex gap-2">
                <button
                  type="button"
                  onClick={() => {
                    setCoverEditorTarget(null);
                    setCoverEditorFile(null);
                    setCoverEditorError(null);
                  }}
                  disabled={coverEditorBusy}
                  className="rounded-lg border border-slate-700 px-3 py-2 text-xs text-slate-300 hover:text-white disabled:opacity-40"
                >
                  Hủy
                </button>
                <button
                  type="button"
                  onClick={() => void confirmCoverEditor()}
                  disabled={
                    coverEditorBusy ||
                    (!coverEditorFile &&
                      !coverEditorTarget.overlaySettings?.coverFileName)
                  }
                  className="inline-flex items-center gap-2 rounded-lg bg-violet-400 px-3 py-2 text-xs font-bold text-slate-950 hover:bg-violet-300 disabled:cursor-not-allowed disabled:opacity-50"
                >
                  {coverEditorBusy && (
                    <LoaderCircle className="h-3.5 w-3.5 animate-spin" />
                  )}
                  Xác nhận
                </button>
              </div>
            </div>
          </section>
        </div>
      )}

      <section className="px-3 py-2 shrink-0 border-b border-slate-800 bg-slate-900/60 rounded-none xl:col-span-2 xl:row-start-2 space-y-2">
        <div className="flex flex-wrap items-center justify-between gap-2">
        <div className="flex flex-wrap items-center gap-2">
          {queueRunning ? (
            <button type="button" onClick={() => void stopQueue()} className="inline-flex items-center gap-2 rounded-lg border border-rose-500/30 bg-rose-950/30 px-3 py-2 text-xs font-bold text-rose-100"><X className="h-4 w-4" />Dừng hàng đợi</button>
          ) : (
            <button type="button" onClick={() => void startQueue()} disabled={!canStartQueue} className="inline-flex items-center gap-2 rounded-lg bg-indigo-400 px-3 py-2 text-xs font-bold text-slate-950 disabled:cursor-not-allowed disabled:bg-slate-800 disabled:text-slate-500"><Play className="h-4 w-4" />Bắt đầu hàng đợi</button>
          )}
          <label title="Sau khi tất cả video trong hàng đợi export thành công, ghép chúng bằng stream copy không encode lại." className={`inline-flex items-center gap-2 rounded-lg border border-slate-700 px-3 py-2 text-xs text-slate-200 ${queueRunning || queueRows.length < 2 || concatPreflight.status === "checking" ? "cursor-not-allowed opacity-50" : "cursor-pointer hover:border-sky-500/40"}`}>
            <input type="checkbox" checked={joinAfterQueue} onChange={() => void toggleJoinAfterQueue()} disabled={queueRunning || queueRows.length < 2 || concatPreflight.status === "checking"} className="accent-sky-400" />
            Ghép nối sau khi hàng đợi xong
          </label>
        </div>
        <div className="flex flex-wrap items-center gap-2">
          <label title="Theo nguồn dùng codec và bitrate video gốc. Low khoảng 70%, Medium 90% bitrate gốc. High giữ cấu hình chất lượng hiện tại." className="inline-flex items-center gap-2 rounded-lg border border-slate-700 px-2.5 py-2 text-xs text-slate-300">
            Chất lượng
            <select value={exportQuality} onChange={(event) => setExportQuality(event.target.value as VideoDubbingExportQuality)} className="rounded-md border border-slate-700 bg-slate-950 px-2 py-1 text-xs text-slate-100 focus:border-sky-400 focus:outline-none">
              <option value="source">Theo nguồn</option>
              <option value="low">Low</option>
              <option value="medium">Medium</option>
              <option value="high">High</option>
            </select>
          </label>
          <button type="button" onClick={() => void openProjectFolder()} disabled={!activeProject} className="inline-flex items-center gap-2 rounded-lg border border-slate-700 px-3 py-2 text-xs font-semibold text-slate-200 hover:border-slate-500 disabled:cursor-not-allowed disabled:opacity-40"><FolderOpen className="h-4 w-4" />Mở Project Folder</button>
          <button type="button" onClick={() => { setProjectsExpanded(true); void loadProjects(); }} className="inline-flex items-center gap-2 rounded-lg border border-slate-700 px-3 py-2 text-xs font-semibold text-slate-200 hover:border-sky-400/50"><FolderOpen className="h-4 w-4" />Project{activeProject ? ` · ${activeProject.name}` : ""}</button>
          <button type="button" onClick={() => setGuideOpen(true)} className="inline-flex items-center gap-2 rounded-lg border border-slate-700 px-3 py-2 text-xs font-semibold text-slate-200 hover:border-cyan-400/50"><BookOpen className="h-4 w-4" />Hướng Dẫn</button>
        </div>
        </div>
        {concatPreflight.status !== "idle" && <p className={`text-[10px] leading-relaxed ${concatPreflight.status === "incompatible" ? "text-rose-300" : concatPreflight.status === "compatible" ? "text-emerald-300" : "text-slate-400"}`}>{concatPreflight.message}</p>}
        <div className="grid gap-2 md:grid-cols-2 xl:grid-cols-3">
          {queueRunning && (
            <div className="space-y-2 rounded-xl border border-amber-500/25 bg-amber-950/20 p-3 text-xs text-amber-100">
              <div className="flex justify-between gap-2"><span className="font-semibold">Hàng đợi đang chạy</span><span>{Object.values(queueStates).filter((item) => item.status === "completed").length}/{queueRowCount}</span></div>
              <div role="progressbar" aria-label="Tiến trình hàng đợi video" aria-valuemin={0} aria-valuemax={queueRowCount} aria-valuenow={Object.values(queueStates).filter((item) => item.status === "completed").length} className="h-2 overflow-hidden rounded-full bg-slate-800"><div className="h-full bg-amber-400 transition-all" style={{ width: `${queueRowCount ? (Object.values(queueStates).filter((item) => item.status === "completed").length / queueRowCount) * 100 : 0}%` }} /></div>
            </div>
          )}
          {concatStatus !== "idle" && (
            <div className={`space-y-2 rounded-xl border p-3 text-xs ${concatStatus === "failed" ? "border-rose-500/25 bg-rose-950/20 text-rose-100" : "border-sky-500/25 bg-sky-950/20 text-sky-100"}`}>
              <div className="font-semibold">{concatStatus === "running" ? "Đang ghép video · stream copy" : concatStatus === "completed" ? "Đã ghép video · không encode lại" : concatStatus === "skipped" ? "Không ghép video vì hàng đợi chưa hoàn tất toàn bộ" : "Không thể ghép video"}</div>
              {joinedVideo && concatStatus === "completed" && <a href={`/api/video-dubbing/jobs/${joinedVideo.jobId}/concatenated-video?fileName=${encodeURIComponent(joinedVideo.fileName)}`} className="inline-flex items-center gap-2 rounded-lg border border-sky-400/30 px-2.5 py-1.5 font-semibold text-sky-100 hover:bg-sky-900/30">Tải {joinedVideo.fileName} · {formatFileSize(joinedVideo.sizeBytes)}</a>}
              {concatStatus === "failed" && mediaError && <p className="text-rose-200">{mediaError}</p>}
            </div>
          )}
          {autoPipeline && (
            <div className="space-y-2 rounded-xl border border-indigo-500/25 bg-indigo-950/20 p-3 text-xs text-indigo-100">
              <div className="flex items-center justify-between gap-2">
                <span className="font-semibold">{autoPipeline.status === "running" ? `Auto Pipeline · ${autoPipeline.phase === "separation" ? `tách audio · ${separationPhaseLabel}` : autoPipeline.phase}` : `Auto Pipeline · ${autoPipeline.status}`}</span>
                {autoPipeline.status === "running" && <span>{autoPipelineProgress === undefined ? autoPipeline.phase === "separation" ? `${formatElapsed(separationElapsedSeconds)} · heartbeat ${separationHeartbeatFresh ? "đang hoạt động" : "đang chờ"}` : "Đang xử lý…" : `${autoPipelineProgress}%${autoPipeline.phase === "separation" ? ` · ${formatElapsed(separationElapsedSeconds)}` : ""}`}</span>}
              </div>
              {autoPipeline.status === "running" && autoPipeline.phase === "separation" && <p className="text-[11px] text-indigo-200/80">Backend: {separationBackendLabel}{separation?.completedSegments !== undefined && separation.totalSegments !== undefined ? ` · ${separation.completedSegments}/${separation.totalSegments} đoạn` : " · model chưa gửi phần trăm chi tiết"}</p>}
              {autoPipeline.status === "running" && <div role="progressbar" aria-label="Tiến trình Auto Pipeline" aria-valuemin={0} aria-valuemax={100} aria-valuenow={autoPipelineProgress} aria-valuetext={autoPipelineProgress === undefined && autoPipeline.phase === "separation" ? `Đang tách audio, ${formatElapsed(separationElapsedSeconds)}, heartbeat ${separationHeartbeatFresh ? "đang hoạt động" : "không mới"}` : undefined} className="h-2 overflow-hidden rounded-full bg-slate-800"><div className={`h-full bg-indigo-400 transition-all ${autoPipelineProgress === undefined ? "w-1/3 animate-pulse" : ""}`} style={autoPipelineProgress === undefined ? undefined : { width: `${autoPipelineProgress}%` }} /></div>}
              {autoPipeline.error && <p className="text-rose-200">{autoPipeline.error}</p>}
              {autoPipelineError && <p className="text-rose-200">{autoPipelineError}</p>}
              {mediaError && <p className="text-rose-200">{mediaError}</p>}
            </div>
          )}
          {finalMix && finalMix.status !== "idle" && (
            <div className="space-y-2 rounded-xl border border-cyan-500/25 bg-cyan-950/20 p-3 text-xs text-cyan-100">
              <div className="flex items-center justify-between gap-2"><span className="font-semibold">Final mix · {finalMix.status === "running" ? finalMix.phase : finalMix.status}</span>{finalMix.status === "running" && <span>{finalMix.progressPercent === undefined ? "Đang xử lý…" : `${finalMix.progressPercent}%`}</span>}</div>
              {finalMix.status === "running" && <div role="progressbar" aria-label="Tiến trình render final mix" aria-valuemin={0} aria-valuemax={100} aria-valuenow={finalMix.progressPercent} className="h-2 overflow-hidden rounded-full bg-slate-800"><div className="h-full bg-cyan-400 transition-all" style={{ width: `${finalMix.progressPercent ?? 30}%` }} /></div>}
              {finalMix.error && <p className="text-rose-200">{finalMix.error}</p>}
              {finalMix.status === "running" && <button type="button" onClick={() => void cancelFinalMix()} className="rounded-lg border border-slate-700 px-2 py-1 text-[11px]">Hủy render</button>}
            </div>
          )}
          {videoExport && videoExport.status !== "idle" && (
            <div className="space-y-2 rounded-xl border border-sky-500/25 bg-sky-950/20 p-3 text-xs text-sky-100">
              <div className="flex items-center justify-between gap-2"><span className="font-semibold">Export · {videoExport.status === "running" ? videoExport.detail || videoExport.phase : videoExport.status}</span>{videoExport.status === "running" && <span>{videoExport.progressPercent === undefined ? "Đang xử lý…" : `${videoExport.progressPercent}%`} · {formatElapsed(videoExport.startedAtMs ? (exportClockNow - videoExport.startedAtMs) / 1000 : videoExport.elapsedSeconds)}</span>}</div>
              {videoExport.status === "running" && <div role="progressbar" aria-label="Tiến trình xuất video MP4" aria-valuemin={0} aria-valuemax={100} aria-valuenow={videoExport.progressPercent} className="h-2 overflow-hidden rounded-full bg-slate-800"><div className="h-full bg-sky-400 transition-all" style={{ width: `${videoExport.progressPercent ?? 30}%` }} /></div>}
              {videoExport.error && <p className="text-rose-200">{videoExport.error}</p>}
              {videoExport.status === "running" && <button type="button" onClick={() => void cancelMediaTask("export")} className="rounded-lg border border-slate-700 px-2 py-1 text-[11px]">Hủy export</button>}
            </div>
          )}
        </div>
      </section>

      <div className="hidden grid-cols-1 gap-3 md:grid-cols-3">
        <input
          type="file"
          accept=".mp4,.mkv,.mov,.avi,.webm,video/mp4,video/x-matroska,video/quicktime,video/x-msvideo,video/webm"
          onChange={handleVideoChange}
          className="hidden"
          aria-label="Chọn video nguồn"
        />
        <div
          role="button"
          tabIndex={0}
          onClick={() => !isBusy && videoInputRef.current?.click()}
          onKeyDown={(event) => {
            if (!isBusy && (event.key === "Enter" || event.key === " ")) {
              event.preventDefault();
              videoInputRef.current?.click();
            }
          }}
          onDragOver={(event) => event.preventDefault()}
          onDrop={(event) => {
            event.preventDefault();
            const file = event.dataTransfer.files[0];
            if (!isBusy && file) handleVideoFile(file);
          }}
          className={`flex min-h-24 cursor-pointer items-center gap-3 rounded-xl border border-dashed px-4 py-3 transition-colors ${
            isBusy
              ? "cursor-wait border-amber-500/30 bg-slate-950/40"
              : "border-slate-700 bg-slate-900/80 hover:border-amber-500/50 hover:bg-slate-900"
          }`}
          aria-label="Thả video vào đây hoặc chọn video"
        >
          <Film className="h-5 w-5 shrink-0 text-amber-400" />
          <span className="min-w-0">
            <span className="block truncate text-sm font-semibold text-white">
              {video?.fileName || "Chọn hoặc thả video"}
            </span>
            {!video && (
              <span className="mt-1 block text-xs text-slate-500">
                MP4 · MKV · MOV · AVI · WebM
              </span>
            )}
          </span>
          {isBusy && (
            <LoaderCircle className="ml-auto h-4 w-4 shrink-0 animate-spin text-amber-300" />
          )}
        </div>

        <input
          type="file"
          accept=".srt,application/x-subrip"
          onChange={(event) => void handleSrtChange(event)}
          className="hidden"
          aria-label="Chọn phụ đề SRT"
        />
        <div
          role="button"
          tabIndex={0}
          onClick={() => openSrtBrowser()}
          onKeyDown={(event) => {
            if (event.key === "Enter" || event.key === " ") {
              event.preventDefault();
              openSrtBrowser();
            }
          }}
          onDragOver={(event) => event.preventDefault()}
          onDrop={(event) => {
            event.preventDefault();
            const file = event.dataTransfer.files[0];
            if (file) void handleSrtFile(file);
          }}
          className="flex min-h-24 cursor-pointer items-center gap-3 rounded-xl border border-dashed border-slate-700 bg-slate-900/80 px-4 py-3 transition-colors hover:border-amber-500/50 hover:bg-slate-900"
          aria-label="Thả phụ đề SRT vào đây hoặc chọn phụ đề"
        >
          <FileText className="h-5 w-5 shrink-0 text-amber-400" />
          <span className="min-w-0">
            <span className="block truncate text-sm font-semibold text-white">
              {srt?.fileName || "Chọn hoặc thả phụ đề SRT"}
            </span>
            {!srt && (
              <span className="mt-1 block text-xs text-slate-500">
                Chỉ hỗ trợ .SRT
              </span>
            )}
          </span>
          {srt && !srt.error && (
            <CheckCircle2 className="ml-auto h-4 w-4 shrink-0 text-emerald-400" />
          )}
        </div>

        <div className="flex min-h-24 items-center justify-center gap-2 rounded-xl border border-slate-800 bg-slate-900/80 p-3">
          <button
            type="button"
            onClick={() => setFileDetailsOpen(true)}
            disabled={!video && !srt}
            className="inline-flex items-center gap-1.5 rounded-lg border border-slate-700 bg-slate-950/70 px-3 py-2 text-xs font-semibold text-slate-200 hover:border-amber-500/40 hover:text-white disabled:cursor-not-allowed disabled:opacity-40"
          >
            <HardDrive className="h-3.5 w-3.5" />
            Details
          </button>
          <button
            type="button"
            onClick={() => void clearSelectedFiles()}
            disabled={(!video && !srt) || (isBusy && !video)}
            className="inline-flex items-center gap-1.5 rounded-lg border border-rose-500/25 bg-rose-950/20 px-3 py-2 text-xs font-semibold text-rose-200 hover:border-rose-400/50 hover:bg-rose-950/40 disabled:cursor-not-allowed disabled:opacity-40"
          >
            <Trash2 className="h-3.5 w-3.5" />
            Xóa
          </button>
        </div>
      </div>

      <div className="hidden grid-cols-1 gap-4 xl:grid-cols-2">
        <section className="rounded-2xl border border-slate-800 bg-slate-900/80 p-4 sm:p-5 space-y-4">
          <div className="flex items-center justify-between gap-3">
            <div className="flex items-center gap-2">
              <Film className="w-4 h-4 text-amber-400" />
              <h3 className="font-semibold text-white">Video nguồn</h3>
            </div>
            {video && (
              <button
                type="button"
                onClick={isBusy ? () => void cancelVideo() : clearVideo}
                className="inline-flex items-center gap-1.5 rounded-lg border border-slate-700 bg-slate-950/70 px-2.5 py-1.5 text-xs text-slate-300 hover:text-white hover:border-slate-500 transition-colors"
              >
                {isBusy ? (
                  <>
                    <X className="w-3.5 h-3.5" />
                    Hủy
                  </>
                ) : (
                  <>
                    <Trash2 className="w-3.5 h-3.5" />
                    Đóng job
                  </>
                )}
                {video.warning && (
                  <p className="mt-3 rounded-lg border border-amber-500/25 bg-amber-950/20 p-3 text-xs text-amber-200">
                    {video.warning}
                  </p>
                )}
              </button>
            )}
          </div>

          <input
            type="file"
            accept=".mp4,.mkv,.mov,.avi,.webm,video/mp4,video/x-matroska,video/quicktime,video/x-msvideo,video/webm"
            onChange={handleVideoChange}
            className="hidden"
          />
          {!video ? (
            <button
              type="button"
              onClick={() => videoInputRef.current?.click()}
              className="w-full min-h-40 flex flex-col items-center justify-center gap-2 rounded-xl border border-dashed border-slate-700 bg-slate-950/50 text-slate-300 hover:border-amber-500/50 hover:bg-slate-950 transition-colors"
            >
              <Upload className="w-6 h-6 text-amber-400" />
              <span className="text-sm font-semibold">
                Chọn video từ máy tính
              </span>
              <span className="text-xs text-slate-500">
                MP4 · MKV · MOV · AVI · WebM
              </span>
            </button>
          ) : (
            <div className="rounded-xl border border-slate-800 bg-slate-950/70 p-3.5">
              <div className="flex items-start gap-3">
                <div className="w-9 h-9 rounded-lg bg-slate-800 text-amber-300 flex items-center justify-center shrink-0">
                  <HardDrive className="w-4 h-4" />
                </div>
                <div className="min-w-0 flex-1">
                  <p className="text-sm font-semibold text-white break-all">
                    {video.fileName}
                  </p>
                  <p className="text-xs text-slate-400 mt-1">
                    {formatFileSize(video.sizeBytes)}
                  </p>
                </div>
              </div>

              {isBusy && (
                <div className="mt-4 space-y-2">
                  <div className="flex justify-between gap-2 text-xs">
                    <span className="inline-flex items-center gap-1.5 text-amber-300">
                      <LoaderCircle className="w-3.5 h-3.5 animate-spin" />
                      {statusLabel(job)}
                    </span>
                    <span className="text-slate-400">
                      {job?.status === "probing"
                        ? "Đang đọc metadata…"
                        : `${Math.round(video.progress)}%`}
                    </span>
                  </div>
                  <div className="h-2 rounded-full bg-slate-800 overflow-hidden">
                    <div
                      className={`h-full rounded-full bg-amber-400 transition-all ${job?.status === "probing" ? "animate-pulse" : ""}`}
                      style={{
                        width: `${job?.status === "probing" ? 100 : video.progress}%`,
                      }}
                    />
                  </div>
                </div>
              )}

              {job && (
                <div className="mt-3 flex items-center gap-2 text-xs">
                  {job.status === "completed" ? (
                    <CheckCircle2 className="w-4 h-4 text-emerald-400" />
                  ) : job.status === "failed" ||
                    job.status === "cancelled" ||
                    job.status === "interrupted" ? (
                    <AlertCircle className="w-4 h-4 text-rose-400" />
                  ) : (
                    <Clock3 className="w-4 h-4 text-amber-400" />
                  )}
                  <span
                    className={
                      job.status === "completed"
                        ? "text-emerald-300"
                        : "text-slate-300"
                    }
                  >
                    {statusLabel(job)}
                  </span>
                </div>
              )}

              {video.error && (
                <div className="mt-3 flex items-start gap-2 rounded-lg border border-rose-500/30 bg-rose-950/40 p-3 text-xs text-rose-200">
                  <AlertCircle className="w-4 h-4 shrink-0 text-rose-400" />
                  <span>{video.error}</span>
                </div>
              )}

              {job?.status === "completed" && job.metadata && (
                <MetadataGrid metadata={job.metadata} />
              )}
              {job?.status === "failed" && job.error && !video.error && (
                <p className="mt-3 text-xs text-rose-300">{job.error}</p>
              )}
              {job?.status === "interrupted" && job.error && (
                <p className="mt-3 text-xs text-amber-300">{job.error}</p>
              )}

              {!isBusy && (
                <button
                  type="button"
                  onClick={() => videoInputRef.current?.click()}
                  className="mt-3 inline-flex items-center gap-1.5 text-xs font-semibold text-amber-300 hover:text-amber-200"
                >
                  <Upload className="w-3.5 h-3.5" />
                  Chọn video khác
                </button>
              )}
            </div>
          )}
          <p className="text-[11px] leading-relaxed text-slate-500">
            Video được gửi đến backend cục bộ để kiểm tra bằng FFprobe; tệp
            nguồn trên máy không bị chỉnh sửa.
          </p>
        </section>

        <section className="rounded-2xl border border-slate-800 bg-slate-900/80 p-4 sm:p-5 space-y-4">
          <div className="flex items-center justify-between gap-3">
            <div className="flex items-center gap-2">
              <FileText className="w-4 h-4 text-amber-400" />
              <h3 className="font-semibold text-white">Phụ đề SRT</h3>
            </div>
            {srt && (
              <button
                type="button"
                onClick={clearSrt}
                className="inline-flex items-center gap-1.5 rounded-lg border border-slate-700 bg-slate-950/70 px-2.5 py-1.5 text-xs text-slate-300 hover:text-white hover:border-slate-500 transition-colors"
              >
                <Trash2 className="w-3.5 h-3.5" />
                Bỏ SRT
              </button>
            )}
          </div>

          <input
            type="file"
            accept=".srt,application/x-subrip"
            onChange={(event) => void handleSrtChange(event)}
            className="hidden"
          />
          {!srt ? (
            <button
              type="button"
              onClick={() => openSrtBrowser()}
              className="w-full min-h-40 flex flex-col items-center justify-center gap-2 rounded-xl border border-dashed border-slate-700 bg-slate-950/50 text-slate-300 hover:border-amber-500/50 hover:bg-slate-950 transition-colors"
            >
              <Upload className="w-6 h-6 text-amber-400" />
              <span className="text-sm font-semibold">Chọn tệp phụ đề</span>
              <span className="text-xs text-slate-500">
                Chỉ hỗ trợ định dạng .SRT
              </span>
            </button>
          ) : (
            <div className="rounded-xl border border-slate-800 bg-slate-950/70 p-3.5">
              <div className="flex items-start gap-3">
                <div className="w-9 h-9 rounded-lg bg-slate-800 text-amber-300 flex items-center justify-center shrink-0">
                  <FileText className="w-4 h-4" />
                </div>
                <div className="min-w-0 flex-1">
                  <p className="text-sm font-semibold text-white break-all">
                    {srt.fileName}
                  </p>
                  <p className="text-xs text-slate-400 mt-1">
                    {formatFileSize(srt.sizeBytes)}
                  </p>
                </div>
              </div>

              {srt.error ? (
                <div className="mt-3 flex items-start gap-2 rounded-lg border border-rose-500/30 bg-rose-950/40 p-3 text-xs text-rose-200">
                  <AlertCircle className="w-4 h-4 shrink-0 text-rose-400" />
                  <span>{srt.error}</span>
                </div>
              ) : srt.analysis ? (
                <div className="grid grid-cols-1 sm:grid-cols-3 gap-2 mt-4">
                  <div className="rounded-xl border border-slate-800 bg-slate-900/70 p-3">
                    <p className="text-[11px] text-slate-400">
                      Subtitle hợp lệ
                    </p>
                    <p className="mt-1 text-sm font-bold text-emerald-300">
                      {srt.analysis.subtitleCount}
                    </p>
                  </div>
                  <div className="rounded-xl border border-slate-800 bg-slate-900/70 p-3">
                    <p className="text-[11px] text-slate-400">
                      Bắt đầu sớm nhất
                    </p>
                    <p className="mt-1 text-sm font-bold text-white">
                      {formatSecondsToSrtTime(srt.analysis.earliestStart)}
                    </p>
                  </div>
                  <div className="rounded-xl border border-slate-800 bg-slate-900/70 p-3">
                    <p className="text-[11px] text-slate-400">
                      Kết thúc muộn nhất
                    </p>
                    <p className="mt-1 text-sm font-bold text-white">
                      {formatSecondsToSrtTime(srt.analysis.latestEnd)}
                    </p>
                  </div>
                  {srt.analysis.invalidBlockCount > 0 && (
                    <div className="sm:col-span-3 flex items-start gap-2 rounded-lg border border-amber-500/30 bg-amber-950/30 p-3 text-xs text-amber-200">
                      <AlertCircle className="w-4 h-4 shrink-0 text-amber-400" />
                      <span>
                        Bỏ qua {srt.analysis.invalidBlockCount} block không hợp
                        lệ trong phần thống kê. Nội dung tệp không bị thay đổi.
                      </span>
                    </div>
                  )}
                </div>
              ) : null}
            </div>
          )}
          <p className="text-[11px] leading-relaxed text-slate-500">
            SRT được phân tích trong trình duyệt. Khi lưu cấu hình hoặc chạy
            Auto Pipeline, các cue được gửi tới backend cục bộ và lưu trong
            metadata job để có thể tiếp tục sau khi mở lại ứng dụng; dữ liệu
            không được gửi lên cloud.
          </p>
          {job && !srt && masterGeneration?.status !== "completed" && (
            <p className="text-[11px] leading-relaxed text-amber-300">
              File SRT không được lưu trong lịch sử job. Hãy chọn lại SRT nếu
              cần tạo TTS Master cho job này.
            </p>
          )}
        </section>
      </div>

      {fileDetailsOpen && detailRowIndex !== null && (
        <div
          className="fixed inset-0 z-50 flex items-center justify-center bg-black/70 p-4"
          role="presentation"
          onMouseDown={(event) => {
            if (event.target === event.currentTarget) {
              setFileDetailsOpen(false);
              setDetailRowIndex(null);
            }
          }}
        >
          <section
            role="dialog"
            aria-modal="true"
            aria-labelledby="video-dubbing-file-details-title"
            className="max-h-[85vh] w-full max-w-2xl overflow-y-auto rounded-2xl border border-slate-700 bg-slate-900 p-5 shadow-2xl"
          >
            <div className="flex items-center justify-between gap-3">
              <h3
                id="video-dubbing-file-details-title"
                className="text-lg font-bold text-white"
              >
                Thông tin Video và SRT
              </h3>
              <button
                type="button"
                onClick={() => {
                  setFileDetailsOpen(false);
                  setDetailRowIndex(null);
                }}
                className="rounded-lg p-2 text-slate-400 hover:bg-slate-800 hover:text-white"
                aria-label="Đóng details"
              >
                <X className="h-4 w-4" />
              </button>
            </div>

            <div className="mt-4 space-y-4">
              <div className="rounded-xl border border-slate-800 bg-slate-950/60 p-3">
                <h4 className="text-sm font-semibold text-white">
                  Video nguồn
                </h4>
                {!detailVideoFile ? (
                  <p className="mt-2 text-xs text-slate-500">
                    Chưa chọn video.
                  </p>
                ) : (
                  <>
                    <p className="mt-2 break-all text-xs text-slate-300">
                      {detailVideoFile.name} ·{" "}
                      {formatFileSize(detailVideoFile.size)}
                    </p>
                    <p className="mt-1 text-xs text-slate-400">
                      {detailState?.phase ||
                        (detailJob ? statusLabel(detailJob) : "Đang chờ xử lý")}
                      {detailState?.progressPercent !== undefined &&
                        ` · ${Math.round(detailState.progressPercent)}%`}
                    </p>
                    {detailState?.error && (
                      <p className="mt-2 text-xs text-rose-300">
                        {detailState.error}
                      </p>
                    )}
                    {detailJob?.status === "completed" &&
                      detailJob.metadata && (
                        <MetadataGrid metadata={detailJob.metadata} />
                      )}
                  </>
                )}
              </div>

              <div className="rounded-xl border border-slate-800 bg-slate-950/60 p-3">
                <h4 className="text-sm font-semibold text-white">Phụ đề SRT</h4>
                {!detailSubtitle ? (
                  <p className="mt-2 text-xs text-slate-500">Chưa chọn SRT.</p>
                ) : (
                  <>
                    <p className="mt-2 break-all text-xs text-slate-300">
                      {detailSubtitle.fileName} ·{" "}
                      {formatFileSize(detailSubtitle.sizeBytes)}
                    </p>
                    {detailSubtitle.error ? (
                      <p className="mt-2 text-xs text-rose-300">
                        {detailSubtitle.error}
                      </p>
                    ) : detailSubtitle.analysis ? (
                      <div className="mt-3 grid grid-cols-1 gap-2 sm:grid-cols-3">
                        <div className="rounded-lg border border-slate-800 p-2">
                          <p className="text-[11px] text-slate-400">
                            Cue hợp lệ
                          </p>
                          <p className="mt-1 text-sm font-bold text-emerald-300">
                            {detailSubtitle.analysis.subtitleCount}
                          </p>
                        </div>
                        <div className="rounded-lg border border-slate-800 p-2">
                          <p className="text-[11px] text-slate-400">Bắt đầu</p>
                          <p className="mt-1 text-sm font-bold text-white">
                            {formatSecondsToSrtTime(
                              detailSubtitle.analysis.earliestStart,
                            )}
                          </p>
                        </div>
                        <div className="rounded-lg border border-slate-800 p-2">
                          <p className="text-[11px] text-slate-400">Kết thúc</p>
                          <p className="mt-1 text-sm font-bold text-white">
                            {formatSecondsToSrtTime(
                              detailSubtitle.analysis.latestEnd,
                            )}
                          </p>
                        </div>
                        {detailSubtitle.analysis.invalidBlockCount > 0 && (
                          <p className="text-xs text-amber-300 sm:col-span-3">
                            Bỏ qua {detailSubtitle.analysis.invalidBlockCount}{" "}
                            block không hợp lệ.
                          </p>
                        )}
                      </div>
                    ) : (
                      <p className="mt-2 text-xs text-slate-400">
                        Đang phân tích nội dung SRT…
                      </p>
                    )}
                  </>
                )}
              </div>
            </div>

            <div className="mt-5 flex justify-end">
              <button
                type="button"
                onClick={() => {
                  setFileDetailsOpen(false);
                  setDetailRowIndex(null);
                }}
                className="rounded-lg bg-slate-800 px-4 py-2 text-xs font-semibold text-white hover:bg-slate-700"
              >
                Đóng
              </button>
            </div>
          </section>
        </div>
      )}

      <div className={`h-full min-h-0 overflow-y-auto border-r border-slate-800 bg-slate-900/40 flex flex-col divide-y divide-slate-800 rounded-none scrollbar-thin xl:col-start-1 xl:row-start-3 ${settingsCollapsed ? "min-w-0" : ""}`}>
      <button type="button" onClick={() => setSettingsCollapsed((value) => !value)} aria-expanded={!settingsCollapsed} className="flex shrink-0 w-full items-center justify-between gap-2 border-b border-slate-800 bg-slate-900/90 px-3 py-2 text-xs font-semibold text-slate-300 hover:border-cyan-500/40 hover:text-white rounded-none" title={settingsCollapsed ? "Mở rộng cài đặt" : "Thu gọn cài đặt"}>
        <span className={settingsCollapsed ? "xl:hidden" : ""}>{settingsCollapsed ? "Cài đặt" : "Thu gọn cột cài đặt"}</span>
        <ChevronDown className={`h-4 w-4 transition-transform ${settingsCollapsed ? "-rotate-90" : "rotate-90"}`} />
      </button>
      <div role="tablist" aria-label="Nội dung cột bên trái" className={settingsCollapsed ? "hidden" : "flex shrink-0 border-b border-slate-800 bg-slate-950/70 p-1 rounded-none gap-1"}>
        <button type="button" role="tab" aria-selected={leftPanelTab === "settings"} onClick={() => setLeftPanelTab("settings")} className={`flex-1 rounded-none px-3 py-1.5 text-xs font-semibold ${leftPanelTab === "settings" ? "bg-cyan-400 text-slate-950" : "text-slate-300 hover:bg-slate-800"}`}>Settings</button>
        <button type="button" role="tab" aria-selected={leftPanelTab === "sources"} onClick={() => setLeftPanelTab("sources")} className={`flex-1 rounded-none px-3 py-1.5 text-xs font-semibold ${leftPanelTab === "sources" ? "bg-cyan-400 text-slate-950" : "text-slate-300 hover:bg-slate-800"}`}>Danh sách video</button>
      </div>
      <div className={leftPanelTab !== "settings" ? "hidden" : settingsCollapsed ? "space-y-3 xl:hidden p-3" : "space-y-3 p-3"}>
      {(job?.status === "completed" || queueRowCount > 0) && (
        <section className="overflow-hidden rounded-2xl border border-indigo-500/25 bg-slate-900/80">
          <div className="flex flex-col gap-3 p-4 sm:flex-row sm:items-center sm:justify-between sm:p-5">
            <button
              type="button"
              onClick={() => setAutoPipelineExpanded((expanded) => !expanded)}
              aria-expanded={autoPipelineExpanded}
              className="flex min-w-0 flex-1 items-center gap-3 text-left"
            >
              <span className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl border border-indigo-500/25 bg-indigo-500/15 text-indigo-300">
                <RefreshCw className="h-5 w-5" />
              </span>
              <span>
                <span className="block font-semibold text-white">
                  Auto Pipeline
                </span>
                <span className="mt-1 block text-xs text-slate-400">
                  Cấu hình TTS, Demucs, Mixer và xuất MP4 theo một luồng.
                </span>
              </span>
              {autoPipelineExpanded ? (
                <ChevronDown className="ml-auto h-4 w-4 shrink-0 rotate-180 text-slate-400" />
              ) : (
                <ChevronDown className="ml-auto h-4 w-4 shrink-0 text-slate-400" />
              )}
            </button>
          </div>

          {autoPipelineExpanded && (
            <div className="space-y-4 border-t border-slate-800 p-4 sm:p-5">
              <fieldset
                disabled={
                  isAutoPipelineRunning || queueRunning
                }
                className="space-y-4 disabled:opacity-55"
              >
                <div>
                  <h4 className="text-sm font-semibold text-white">
                    TTS Master
                  </h4>
                  <p className="mt-1 text-xs text-slate-400">
                    Dùng Piper hoặc VieNeu Turbo và căn cue phụ đề theo
                    timestamp.
                  </p>
                </div>
                <div className="grid grid-cols-1 gap-3 md:grid-cols-2 xl:grid-cols-4">
                  <label className="space-y-1.5">
                    <span className="text-xs font-medium text-slate-300">
                      Giọng đọc
                    </span>
                    <select
                      value={selectedVoiceId}
                      onChange={(event) =>
                        setSelectedVoiceId(event.target.value)
                      }
                      disabled={voices.length === 0}
                      className="w-full rounded-lg border border-slate-700 bg-slate-950 px-3 py-2.5 text-sm text-white focus:border-indigo-400 focus:outline-none disabled:opacity-50"
                    >
                      {voices.length === 0 ? (
                        <option value="">Không có giọng đọc khả dụng</option>
                      ) : (
                        <>
                          <optgroup label="Piper">
                            {voices
                              .filter((voice) => voice.engine === "piper")
                              .map((voice) => (
                                <option key={voice.id} value={voice.id}>
                                  {voice.name}
                                </option>
                              ))}
                          </optgroup>
                          <optgroup label="VieNeu Turbo">
                            {voices
                              .filter((voice) => voice.engine === "vieneu")
                              .map((voice) => (
                                <option key={voice.id} value={voice.id}>
                                  {voice.name}
                                </option>
                              ))}
                          </optgroup>
                        </>
                      )}
                    </select>
                  </label>
                  <label className="space-y-1.5">
                    <span className="text-xs font-medium text-slate-300">
                      Ưu tiên tốc độ
                    </span>
                    <select
                      value={speedPriority}
                      onChange={(event) =>
                        setSpeedPriority(
                          event.target.value as
                            | "balanced"
                            | "strict"
                            | "natural",
                        )
                      }
                      className="w-full rounded-lg border border-slate-700 bg-slate-950 px-3 py-2.5 text-sm text-white focus:border-indigo-400 focus:outline-none"
                    >
                      <option value="balanced">Cân bằng</option>
                      <option value="strict">Khớp timestamp</option>
                      <option value="natural">Ưu tiên tự nhiên</option>
                    </select>
                  </label>
                  <label className="space-y-1.5 md:col-span-2 xl:col-span-4">
                    <span className="text-xs font-medium text-slate-300">
                      <span className="flex justify-between gap-2">
                        <span>Tốc độ tối thiểu</span>
                        <span>{minSpeed.toFixed(1)}×</span>
                      </span>
                    </span>
                    <input
                      type="range"
                      min={0.5}
                      max={1.5}
                      step={0.1}
                      value={minSpeed}
                      onChange={(event) =>
                        setMinSpeed(Number(event.target.value))
                      }
                      className="w-full accent-indigo-400"
                    />
                  </label>
                  <label className="space-y-1.5 md:col-span-2 xl:col-span-4">
                    <span className="text-xs font-medium text-slate-300">
                      <span className="flex justify-between gap-2">
                        <span>Tốc độ tối đa</span>
                        <span>{maxSpeed.toFixed(1)}×</span>
                      </span>
                    </span>
                    <input
                      type="range"
                      min={1}
                      max={3}
                      step={0.1}
                      value={maxSpeed}
                      onChange={(event) =>
                        setMaxSpeed(Number(event.target.value))
                      }
                      className="w-full accent-indigo-400"
                    />
                  </label>
                </div>
                {voicesError && (
                  <p className="text-xs text-rose-300">{voicesError}</p>
                )}

                <div className="border-t border-slate-800 pt-4">
                  <h4 className="text-sm font-semibold text-white">Demucs</h4>
                  <label className="mt-3 flex items-start gap-3 rounded-xl border border-slate-800 bg-slate-950/60 p-3 text-xs">
                    <input
                      type="checkbox"
                      checked={autoPipelineDemucsEnabled}
                      disabled={separationAvailability?.status !== "ready"}
                      onChange={(event) =>
                        setAutoPipelineDemucsEnabled(event.target.checked)
                      }
                      className="mt-0.5 accent-indigo-400"
                    />
                    <span>
                      <span className="block font-semibold text-slate-200">
                        Tự tách vocals và instrumental khi cần
                      </span>
                      <span className="mt-1 block text-slate-400">
                        {separationAvailability?.status === "ready"
                          ? `Sẵn sàng trên ${separationAvailability.device === "directml" ? "GPU DirectML" : separationAvailability.device === "cuda" ? "GPU CUDA" : "CPU"} · ${separationAvailability.model}.`
                          : separationAvailability?.message ||
                            "Đang kiểm tra môi trường Demucs."}
                      </span>
                    </span>
                  </label>
                  {autoPipelineDemucsEnabled ? (
                    <p className="mt-2 text-[11px] leading-relaxed text-slate-500">
                      Khi bật, pipeline chỉ tiếp tục sau khi cả hai track được
                      tạo và xác minh.
                    </p>
                  ) : (
                    <label className="mt-3 block max-w-xl space-y-2 rounded-xl border border-slate-800 bg-slate-950/60 p-3 text-xs">
                      <span className="flex justify-between gap-2 text-slate-300">
                        <span>Audio gốc (giọng nói và nhạc chung)</span>
                        <span className="font-semibold text-white">
                          {originalAudioVolumePercent}%
                        </span>
                      </span>
                      <input
                        type="range"
                        min={0}
                        max={200}
                        step={1}
                        value={originalAudioVolumePercent}
                        disabled={
                          !job?.metadata?.audioCodec && videoFiles.length === 0
                        }
                        onChange={(event) =>
                          setOriginalAudioVolumePercent(
                            Number(event.target.value),
                          )
                        }
                        className="w-full accent-indigo-400 disabled:opacity-40"
                        aria-label="Âm lượng audio gốc"
                      />
                      <span className="block leading-relaxed text-slate-500">
                        {job?.metadata?.audioCodec
                          ? "Không tách nguồn thì không thể điều chỉnh riêng thoại và nhạc."
                          : job
                            ? "Video không có audio gốc."
                            : "Audio gốc sẽ được kiểm tra khi tải từng video."}
                      </span>
                    </label>
                  )}
                </div>

                <div className="border-t border-slate-800 pt-4">
                  <h4 className="text-sm font-semibold text-white">
                    Mixer Preview · 3 track
                  </h4>
                  <div className="mt-3 grid grid-cols-1 gap-3">
                    {(
                      [
                        ["vocals", "Voice / Vocals"],
                        ["instrumental", "Background / Instrumental"],
                        ["ttsMaster", "TTS Master"],
                      ] as const
                    ).map(([track, label]) => {
                      const setting = mixerSettings[track];
                      const available = mixerTrackAvailability[track];
                      return (
                        <div
                          key={track}
                          className="space-y-3 rounded-xl border border-slate-800 bg-slate-950/60 p-3"
                        >
                          <div className="flex items-center justify-between gap-2">
                            <span className="text-xs font-semibold text-slate-200">
                              {label}
                            </span>
                            <span className="text-[10px] text-slate-500">
                              {available
                                ? "Đã có track"
                                : "Sẽ dùng khi có đầu ra"}
                            </span>
                          </div>
                          <label className="flex flex-wrap items-center gap-3 text-[11px] text-slate-400">
                            <span className="w-16 shrink-0">Âm lượng</span>
                            <input
                              type="range"
                              min={0}
                              max={200}
                              step={1}
                              value={setting.volumePercent}
                              onChange={(event) =>
                                updateMixerSetting(track, {
                                  volumePercent: Number(event.target.value),
                                })
                              }
                              className="min-w-24 flex-1 accent-indigo-400"
                              aria-label={`${label} volume`}
                            />
                            <span className="flex shrink-0 items-center gap-1 text-slate-200">
                              <input
                                type="text"
                                inputMode="numeric"
                                maxLength={3}
                                value={mixerVolumeDrafts[track] ?? String(setting.volumePercent)}
                                onChange={(event) => {
                                  const value = event.target.value;
                                  if (!/^\d{0,3}$/.test(value)) return;
                                  const boundedValue = value !== "" && Number(value) > 200 ? "200" : value;
                                  setMixerVolumeDrafts((current) => ({ ...current, [track]: boundedValue }));
                                  if (boundedValue !== "") {
                                    updateMixerSetting(track, { volumePercent: Number(boundedValue) });
                                  }
                                }}
                                onBlur={() => setMixerVolumeDrafts((current) => ({ ...current, [track]: undefined }))}
                                className="w-14 rounded-md border border-slate-700 bg-slate-900 px-2 py-1 text-right text-xs text-white"
                                aria-label={`${label} volume percent`}
                              />
                              <span>%</span>
                            </span>
                          </label>
                          <label className="inline-flex items-center gap-2 text-[11px] text-slate-300">
                            <input
                              type="checkbox"
                              checked={setting.muted}
                              onChange={(event) =>
                                updateMixerSetting(track, {
                                  muted: event.target.checked,
                                })
                              }
                              className="accent-indigo-400"
                            />
                            Tắt track
                          </label>
                        </div>
                      );
                    })}
                  </div>
                  <p className="mt-2 text-[11px] text-slate-500">
                    Có thể lưu mức âm lượng/mute trước khi các file track tồn
                    tại; các giá trị này chỉ áp dụng khi pipeline được chạy.
                  </p>
                </div>

              </fieldset>

              <div className="flex flex-wrap gap-2">
                <button
                  type="button"
                  onClick={() => void saveAutoPipelineConfig()}
                  disabled={
                    !autoPipelineConfig ||
                    autoPipelineSaving ||
                    isAutoPipelineRunning
                  }
                  className="inline-flex items-center justify-center gap-2 rounded-xl border border-slate-700 px-3 py-2.5 text-xs font-semibold text-slate-200 hover:border-slate-500 disabled:cursor-not-allowed disabled:opacity-40"
                >
                  {autoPipelineSaving ? (
                    <LoaderCircle className="h-4 w-4 animate-spin" />
                  ) : (
                    <HardDrive className="h-4 w-4" />
                  )}
                  Lưu cấu hình
                </button>
              </div>
              {!autoPipelineConfig && (
                <p className="text-[11px] leading-relaxed text-amber-300">
                  Chọn SRT có cue hợp lệ và giọng đọc để cấu hình Auto Pipeline.
                </p>
              )}
            </div>
          )}
        </section>
      )}

      <section className="rounded-2xl border border-slate-800 bg-slate-900/80 p-4 sm:p-5 space-y-5">
        <button
          type="button"
          onClick={() => setMasterPanelExpanded((expanded) => !expanded)}
          aria-expanded={masterPanelExpanded}
          aria-controls="video-dubbing-master-panel"
          className="flex w-full items-start gap-3 text-left"
        >
          <div className="w-10 h-10 rounded-xl bg-amber-500/15 text-amber-400 border border-amber-500/25 flex items-center justify-center shrink-0">
            <Volume2 className="w-5 h-5" />
          </div>
          <div className="min-w-0 flex-1">
            <h3 className="font-semibold text-white">Tạo TTS Master</h3>
            <p className="mt-1 text-xs leading-relaxed text-slate-400">
              Dùng pipeline Đồng Bộ Phụ Đề hiện có: mô hình giọng đọc tạo từng
              câu, căn theo timestamp rồi ghép WAV mono 22,050 Hz. Nếu timeline
              vượt video, phần dư cuối track sẽ được trim.
            </p>
          </div>
          <ChevronDown
            className={`mt-2 h-4 w-4 shrink-0 text-slate-400 transition-transform ${
              masterPanelExpanded ? "rotate-180" : ""
            }`}
          />
        </button>

        {masterPanelExpanded && (
          <div id="video-dubbing-master-panel" className="space-y-5">
            {masterGeneration?.status === "generating" && (
              <div className="space-y-2 rounded-xl border border-amber-500/25 bg-amber-950/20 p-3.5">
                <div className="flex flex-wrap items-center justify-between gap-2 text-xs">
                  <span className="inline-flex items-center gap-2 text-amber-200">
                    <LoaderCircle className="w-4 h-4 animate-spin" />
                    Đang tạo TTS Master
                  </span>
                  <span className="text-slate-300">
                    {masterGeneration.completedSentences}/
                    {masterGeneration.totalSentences} câu ·{" "}
                    {Math.round(masterGeneration.progressPercent)}%
                  </span>
                </div>
                <div className="h-2 rounded-full bg-slate-800 overflow-hidden">
                  <div
                    className="h-full rounded-full bg-amber-400 transition-all"
                    style={{ width: `${masterGeneration.progressPercent}%` }}
                  />
                </div>
                <button
                  type="button"
                  onClick={() => void cancelMaster()}
                  disabled={isAutoPipelineRunning}
                  className="inline-flex items-center gap-1.5 rounded-lg border border-slate-700 bg-slate-950/70 px-2.5 py-1.5 text-xs text-slate-300 hover:text-white hover:border-slate-500 transition-colors"
                >
                  <X className="w-3.5 h-3.5" />
                  Hủy tạo Master
                </button>
              </div>
            )}

            {masterError && (
              <div className="flex items-start gap-2 rounded-lg border border-rose-500/30 bg-rose-950/40 p-3 text-xs text-rose-200">
                <AlertCircle className="w-4 h-4 shrink-0 text-rose-400" />
                <span>{masterError}</span>
              </div>
            )}
            {masterGeneration?.status === "failed" &&
              masterGeneration.error && (
                <div className="flex items-start gap-2 rounded-lg border border-rose-500/30 bg-rose-950/40 p-3 text-xs text-rose-200">
                  <AlertCircle className="w-4 h-4 shrink-0 text-rose-400" />
                  <span>{masterGeneration.error}</span>
                </div>
              )}
            {masterGeneration?.status === "cancelled" &&
              !isMasterGenerating && (
                <p className="text-xs text-slate-400">
                  Đã hủy quá trình tạo TTS Master.
                </p>
              )}
            {masterGeneration?.status === "interrupted" && (
              <p className="rounded-lg border border-amber-500/25 bg-amber-950/20 p-3 text-xs text-amber-200">
                {masterGeneration.error || "Tác vụ TTS Master bị gián đoạn."}
              </p>
            )}

            <div className="flex flex-col sm:flex-row sm:items-center gap-3">
              <button
                type="button"
                onClick={() => void createMaster()}
                disabled={!canGenerateMaster}
                className="inline-flex items-center justify-center gap-2 rounded-xl bg-amber-500 px-4 py-2.5 text-sm font-bold text-slate-950 transition-colors hover:bg-amber-400 disabled:cursor-not-allowed disabled:bg-slate-800 disabled:text-slate-500"
              >
                {isMasterGenerating ? (
                  <LoaderCircle className="w-4 h-4 animate-spin" />
                ) : (
                  <Volume2 className="w-4 h-4" />
                )}
                Tạo TTS Master
              </button>
              {!canGenerateMaster && !isMasterGenerating && (
                <p className="text-xs text-slate-500">
                  Cần video đã kiểm tra thành công, SRT có cue hợp lệ và một
                  giọng đọc khả dụng.
                </p>
              )}
            </div>

            {hasMasterAudio &&
              masterGeneration?.durationSeconds !== undefined && (
                <div className="space-y-3 rounded-xl border border-emerald-500/25 bg-emerald-950/20 p-3.5">
                  <div className="flex flex-wrap items-center gap-x-3 gap-y-1 text-xs">
                    <span className="inline-flex items-center gap-1.5 font-semibold text-emerald-300">
                      {masterGeneration.status === "completed" ? (
                        <>
                          <CheckCircle2 className="w-4 h-4" />
                          TTS Master hoàn tất
                        </>
                      ) : (
                        "Master đã hoàn tất trước đó, vẫn được giữ"
                      )}
                    </span>
                    <span className="text-slate-300">
                      Thời lượng{" "}
                      {formatDuration(masterGeneration.durationSeconds)}
                    </span>
                    {masterGeneration.sizeBytes !== undefined && (
                      <span className="text-slate-400">
                        {formatFileSize(masterGeneration.sizeBytes)}
                      </span>
                    )}
                  </div>
                  <audio
                    key={`${job?.id}-${masterGeneration.audioVersion || masterGeneration.sizeBytes}`}
                    controls
                    preload="metadata"
                    src={`/api/video-dubbing/jobs/${job?.id}/master-audio?v=${masterGeneration.audioVersion || masterGeneration.sizeBytes}`}
                    className="w-full"
                  >
                    Trình duyệt không hỗ trợ phát WAV.
                  </audio>
                </div>
              )}

            <p className="text-[11px] leading-relaxed text-slate-500">
              Tùy chọn giọng/tốc độ chỉ áp dụng cho lần tạo mới; Master đã hoàn
              tất vẫn được giữ nguyên cho đến khi tạo Master mới hoặc bỏ job
              video.
            </p>
          </div>
        )}
      </section>

      {job &&
        (job.status === "completed" ||
          Boolean(
            separation?.vocalsSizeBytes || separation?.instrumentalSizeBytes,
          )) && (
          <section className="rounded-2xl border border-slate-800 bg-slate-900/80 p-4 sm:p-5 space-y-4">
            <button
              type="button"
              onClick={() =>
                setSeparationPanelExpanded((expanded) => !expanded)
              }
              aria-expanded={separationPanelExpanded}
              aria-controls="video-dubbing-separation-panel"
              className="flex w-full items-start gap-3 text-left"
            >
              <div className="w-10 h-10 rounded-xl bg-violet-500/15 text-violet-300 border border-violet-500/25 flex items-center justify-center shrink-0">
                <AudioLines className="w-5 h-5" />
              </div>
              <div className="min-w-0">
                <h3 className="font-semibold text-white">
                  Tách giọng và nhạc nền
                </h3>
                <p className="mt-1 text-xs leading-relaxed text-slate-400">
                  Chạy cục bộ bằng Demucs{" "}
                  {separationAvailability?.model || "htdemucs"}. Kết quả là các
                  stem ước lượng, có thể còn lẫn giọng hoặc nhạc.
                </p>
              </div>
              <ChevronDown
                className={`mt-2 h-4 w-4 shrink-0 text-slate-400 transition-transform ${
                  separationPanelExpanded ? "rotate-180" : ""
                }`}
              />
            </button>

            {separationPanelExpanded && (
              <div id="video-dubbing-separation-panel" className="space-y-4">
                {!separationAvailability ? (
                  <p className="text-xs text-slate-400">
                    Đang kiểm tra Python, model và thiết bị…
                  </p>
                ) : (
                  <div
                    className={`rounded-xl border p-3 text-xs ${
                      separationAvailability.status === "ready"
                        ? "border-emerald-500/25 bg-emerald-950/20 text-emerald-200"
                        : "border-amber-500/25 bg-amber-950/20 text-amber-200"
                    }`}
                  >
                    <div className="font-semibold">
                      {separationAvailability.status === "ready"
                        ? `Sẵn sàng · ${separationAvailability.device === "directml" ? "DirectML" : separationAvailability.device === "cuda" ? "CUDA" : "CPU"} · ${separationAvailability.model}`
                        : "Chưa sẵn sàng"}
                    </div>
                    <p className="mt-1 leading-relaxed">
                      {separationAvailability.message}
                    </p>
                    {separationAvailability.status === "unavailable" && (
                      <p className="mt-2 leading-relaxed">
                        Cấu hình riêng Python bằng biến
                        VIDEO_DUBBING_SEPARATION_PYTHON rồi khởi động lại ứng
                        dụng. Cần cài các dependency của backend đã chọn và
                        tải model local; nút xử lý không tự cài hoặc tải model.
                      </p>
                    )}
                  </div>
                )}

                {job.metadata?.audioCodec === null && (
                  <p className="rounded-lg border border-amber-500/25 bg-amber-950/20 p-3 text-xs text-amber-200">
                    Video này không có audio gốc để tách.
                  </p>
                )}
                {separationError && (
                  <div className="flex items-start gap-2 rounded-lg border border-rose-500/30 bg-rose-950/40 p-3 text-xs text-rose-200">
                    <AlertCircle className="w-4 h-4 shrink-0 text-rose-400" />
                    <span>{separationError}</span>
                  </div>
                )}
                {separation?.status === "error" && separation.error && (
                  <div className="flex items-start gap-2 rounded-lg border border-rose-500/30 bg-rose-950/40 p-3 text-xs text-rose-200">
                    <AlertCircle className="w-4 h-4 shrink-0 text-rose-400" />
                    <span>{separation.error}</span>
                  </div>
                )}
                {isSeparationProcessing && (
                  <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3 rounded-xl border border-violet-500/25 bg-violet-950/20 p-3.5">
                    <span className="inline-flex items-center gap-2 text-xs text-violet-200">
                      <LoaderCircle className="w-4 h-4 animate-spin" />
                      {separation.phase === "extracting"
                        ? "Đang trích và chuẩn hóa audio nguồn"
                        : separation.phase === "checking"
                          ? "Đang kiểm tra môi trường tách audio"
                          : separation.phase === "loading_model"
                            ? "Đang tải model Demucs từ cache cục bộ"
                            : separation.phase === "writing_outputs"
                              ? "Đang ghi các track vocals và instrumental"
                              : separation.phase === "validating"
                                ? "Đang ghi và xác minh hai track"
                                : "Demucs đang tách audio"}
                    </span>
                    <span className="text-xs text-violet-100">
                      {separation.progressPercent === undefined
                        ? `${formatElapsed(separationElapsedSeconds)} · heartbeat ${separationHeartbeatFresh ? "đang hoạt động" : "đang chờ"}`
                        : `${separation.progressPercent}%${
                            separation.completedSegments !== undefined &&
                            separation.totalSegments !== undefined
                              ? ` · ${separation.completedSegments}/${separation.totalSegments} đoạn`
                              : ""
                          }`}
                    </span>
                    <div
                      className="h-2 w-full overflow-hidden rounded-full bg-slate-800"
                      role="progressbar"
                      aria-label="Tiến trình tách audio"
                      aria-valuemin={0}
                      aria-valuemax={100}
                      aria-valuenow={separation.progressPercent}
                      aria-valuetext={
                        separation.progressPercent === undefined
                          ? "Đang xử lý, chưa xác định phần trăm"
                          : `${separation.progressPercent}%`
                      }
                    >
                      <div
                        className={`h-full rounded-full bg-violet-400 transition-all ${
                          separation.progressPercent === undefined
                            ? "w-1/3 animate-pulse"
                            : ""
                        }`}
                        style={
                          separation.progressPercent === undefined
                            ? undefined
                            : { width: `${separation.progressPercent}%` }
                        }
                      />
                    </div>
                    <span className="text-[11px] text-violet-200/80">{separationBackendLabel}{separation.progressPercent === undefined ? " · chưa có phần trăm inference" : ""}</span>
                    <button
                      type="button"
                      onClick={() => void cancelSeparation()}
                      disabled={isAutoPipelineRunning}
                      className="inline-flex items-center justify-center gap-1.5 rounded-lg border border-slate-700 bg-slate-950/70 px-2.5 py-1.5 text-xs text-slate-300 hover:text-white hover:border-slate-500 transition-colors"
                    >
                      <X className="w-3.5 h-3.5" />
                      Hủy tách audio
                    </button>
                  </div>
                )}
                {separation?.status === "cancelled" && (
                  <p className="text-xs text-amber-300">
                    Tác vụ tách audio đã bị hủy.
                  </p>
                )}
                {separation?.status === "interrupted" && (
                  <p className="rounded-lg border border-amber-500/25 bg-amber-950/20 p-3 text-xs text-amber-200">
                    {separation.error ||
                      "Tác vụ tách audio bị gián đoạn; có thể chạy lại."}
                  </p>
                )}

                {separationAvailability?.status === "ready" &&
                  Boolean(job.metadata?.audioCodec) && (
                    <button
                      type="button"
                      onClick={() => void startSeparation()}
                      disabled={!canStartSeparation}
                      className="inline-flex items-center justify-center gap-2 rounded-xl bg-violet-500 px-4 py-2.5 text-sm font-bold text-white transition-colors hover:bg-violet-400 disabled:cursor-not-allowed disabled:bg-slate-800 disabled:text-slate-500"
                    >
                      {isSeparationProcessing ? (
                        <LoaderCircle className="w-4 h-4 animate-spin" />
                      ) : (
                        <AudioLines className="w-4 h-4" />
                      )}
                      Tách audio nguồn
                    </button>
                  )}

                {(separation?.vocalsSizeBytes ||
                  separation?.instrumentalSizeBytes) && (
                  <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                    {(
                      [
                        {
                          key: "vocals",
                          label: "Giọng (vocals)",
                          size: separation.vocalsSizeBytes,
                        },
                        {
                          key: "instrumental",
                          label: "Nhạc nền (instrumental)",
                          size: separation.instrumentalSizeBytes,
                        },
                      ] as const
                    ).map((track) => (
                      <div
                        key={track.key}
                        className="space-y-2 rounded-xl border border-slate-800 bg-slate-950/60 p-3"
                      >
                        <div className="flex items-center justify-between gap-2 text-xs">
                          <span className="font-semibold text-slate-200">
                            {track.label}
                          </span>
                          <span className="text-slate-400">
                            {track.size
                              ? formatFileSize(track.size)
                              : "Không có"}
                          </span>
                        </div>
                        <audio
                          controls
                          preload="metadata"
                          src={`/api/video-dubbing/jobs/${job.id}/separation/${track.key}`}
                          className="w-full"
                        >
                          Trình duyệt không hỗ trợ phát WAV.
                        </audio>
                      </div>
                    ))}
                  </div>
                )}
                {separation?.status === "completed" && (
                  <p className="text-xs text-emerald-300">
                    Đã xác minh hai track WAV ·{" "}
                    {formatDuration(separation.durationSeconds || 0)} ·{" "}
                    {separation.sampleRate} Hz · {separation.channels} kênh. Kết
                    quả chưa được tự động đưa vào bản phối.
                  </p>
                )}
              </div>
            )}
          </section>
        )}
      </div>


      {leftPanelTab === "sources" && !settingsCollapsed && (
      <section
        className="flex-1 min-h-0 flex flex-col overflow-hidden rounded-none border-0 bg-transparent"
        onDragOver={(event) => {
          event.preventDefault();
          event.dataTransfer.dropEffect = queueRunning ? "none" : "copy";
        }}
        onDrop={handleQueueDrop}
      >
        {/* Compact Dropzones (2 sleek buttons side-by-side) */}
        <div className="border-b border-slate-800 p-2.5 bg-slate-950/60 shrink-0">
          <div
            className="grid grid-cols-2 gap-2 p-1 border border-dashed border-slate-700/80 bg-slate-900/40 rounded-none"
            onDragEnter={(event) => {
              event.preventDefault();
              event.stopPropagation();
            }}
            onDragOver={(event) => {
              event.preventDefault();
              event.stopPropagation();
              event.dataTransfer.dropEffect = queueRunning ? "none" : "copy";
            }}
            onDrop={(event) => handleQueueDrop(event)}
          >
            <button
              type="button"
              disabled={queueRunning}
              onClick={() => videoInputRef.current?.click()}
              className="flex items-center justify-center gap-2 p-2 border border-slate-800 bg-slate-950/70 hover:bg-amber-500/10 hover:border-amber-500/50 transition-colors text-left rounded-none disabled:opacity-40 cursor-pointer"
              title="Click hoặc kéo thả tệp video (MP4, MKV, MOV...)"
            >
              <Film className="h-4 w-4 shrink-0 text-amber-400" />
              <div className="min-w-0">
                <span className="block text-xs font-bold text-slate-200 truncate">Thêm Video</span>
                <span className="block text-[10px] text-slate-500 truncate">MP4, MKV, MOV</span>
              </div>
            </button>
            <button
              type="button"
              disabled={queueRunning}
              onClick={() => openSrtBrowser()}
              className="flex items-center justify-center gap-2 p-2 border border-slate-800 bg-slate-950/70 hover:bg-cyan-500/10 hover:border-cyan-500/50 transition-colors text-left rounded-none disabled:opacity-40 cursor-pointer"
              title="Click hoặc kéo thả tệp phụ đề SRT"
            >
              <FileText className="h-4 w-4 shrink-0 text-cyan-400" />
              <div className="min-w-0">
                <span className="block text-xs font-bold text-slate-200 truncate">Thêm Phụ Đề</span>
                <span className="block text-[10px] text-slate-500 truncate">Tệp .SRT</span>
              </div>
            </button>
          </div>
        </div>

        {/* All Videos Batch Actions Toolbar (2 neat rows, zero hidden buttons) */}
        <div className="border-b border-slate-800 p-2.5 bg-slate-900/70 shrink-0 space-y-2">
          <div className="flex items-center justify-between gap-2">
            <div className="flex items-center gap-1.5">
              <span className="text-xs font-bold text-white uppercase tracking-wider">
                All Videos ({allVideosJobs.length || queueRowCount || 0})
              </span>
              {allVideosRunning && (
                <span className="h-2 w-2 rounded-full bg-amber-400 animate-ping" />
              )}
            </div>
            <span className="text-[10px] text-slate-400 font-mono">
              Hàng loạt
            </span>
          </div>

          <div className="space-y-1">
            <div className="grid grid-cols-4 gap-1">
              <button
                type="button"
                onClick={() => void runAllVideosAction("tts")}
                disabled={allVideosActionDisabled || !allVideosTtsReady}
                title="Tạo riêng TTS Master cho tất cả video"
                className="px-1.5 py-1.5 rounded-none border border-indigo-400/35 bg-indigo-950/20 text-indigo-100 hover:bg-indigo-950/50 text-[11px] font-semibold flex items-center justify-center gap-1 disabled:opacity-40 cursor-pointer"
              >
                <span>TTS Tất Cả</span>
              </button>
              <button
                type="button"
                onClick={() =>
                  void runAllVideosAction(
                    "demucs",
                    allVideosJobs.filter(
                      (item) =>
                        item.metadata?.audioCodec &&
                        item.separation?.status !== "processing",
                    ),
                  )
                }
                disabled={
                  allVideosActionDisabled ||
                  !allVideosJobs.some(
                    (item) =>
                      item.metadata?.audioCodec &&
                      item.separation?.status !== "processing",
                  ) ||
                  separationAvailability?.status !== "ready"
                }
                title={
                  separationAvailability?.status === "ready"
                    ? "Tách vocals và instrumental cho tất cả video có audio"
                    : separationAvailability?.message || "Demucs chưa sẵn sàng"
                }
                className="px-1.5 py-1.5 rounded-none border border-violet-400/35 bg-violet-950/20 text-violet-100 hover:bg-violet-950/50 text-[11px] font-semibold flex items-center justify-center gap-1 disabled:opacity-40 cursor-pointer"
              >
                <span>Demucs</span>
              </button>
              <button
                type="button"
                onClick={() => void runAllVideosAction("mix")}
                disabled={allVideosActionDisabled}
                title="Chỉ render final mix cho tất cả video"
                className="px-1.5 py-1.5 rounded-none border border-cyan-400/35 bg-cyan-950/20 text-cyan-100 hover:bg-cyan-950/50 text-[11px] font-semibold flex items-center justify-center gap-1 disabled:opacity-40 cursor-pointer"
              >
                <span>Mix Audio</span>
              </button>
              <button
                type="button"
                onClick={() => void runAllVideosAction("render")}
                disabled={allVideosActionDisabled}
                title="Chỉ export tất cả video"
                className="px-1.5 py-1.5 rounded-none border border-sky-400/35 bg-sky-950/20 text-sky-100 hover:bg-sky-950/50 text-[11px] font-semibold flex items-center justify-center gap-1 disabled:opacity-40 cursor-pointer"
              >
                <span>Render All</span>
              </button>
            </div>

            <div className="grid grid-cols-3 gap-1">
              <button
                type="button"
                onClick={downloadAllSrts}
                disabled={!allSrtDownloadTargets.length}
                title="Tải phụ đề đã chỉnh sửa của tất cả video trong project"
                className="px-1.5 py-1.5 rounded-none border border-emerald-500/35 bg-emerald-950/20 text-emerald-200 hover:bg-emerald-950/50 text-[11px] font-semibold flex items-center justify-center gap-1 disabled:opacity-40 cursor-pointer"
              >
                <FileText className="h-3 w-3" />
                <span>Tải Tất Cả SRT</span>
              </button>
              <button
                type="button"
                onClick={() => void runAllVideosAction("download")}
                disabled={
                  allVideosActionDisabled ||
                  !allVideosJobs.some(
                    (item) => item.videoExport?.status === "completed",
                  )
                }
                title="Tải tất cả MP4 đã export hoàn tất trong một file ZIP"
                aria-label="Download tất cả video đã export"
                className="px-1.5 py-1.5 rounded-none border border-emerald-500/35 bg-emerald-950/20 text-emerald-200 hover:bg-emerald-950/50 text-[11px] font-semibold flex items-center justify-center gap-1 disabled:opacity-40 cursor-pointer"
              >
                <Download className="h-3 w-3" />
                <span>Tải Zip Video</span>
              </button>
              <button
                type="button"
                onClick={() => void syncSettingsToAllVideos()}
                disabled={settingsSyncRunning || queueRunning || allVideosRunning || videoFiles.some((item) => item.uploading) || !videoFiles.some((item) => item.job?.status === "completed")}
                title="Lưu cài đặt preview vào tất cả job video trong danh sách, không bắt đầu xử lý"
                className="px-1.5 py-1.5 rounded-none border border-cyan-400/30 bg-cyan-950/30 text-cyan-200 hover:bg-cyan-900/40 text-[11px] font-semibold flex items-center justify-center gap-1 disabled:opacity-40 cursor-pointer"
              >
                <RefreshCw className={`h-3 w-3 ${settingsSyncRunning ? "animate-spin" : ""}`} />
                <span>{settingsSyncRunning ? "Đang lưu…" : "Đồng Bộ Cài Đặt"}</span>
              </button>
            </div>
          </div>

          {settingsSyncMessage && <p className="text-[10px] text-cyan-200" role="status">{settingsSyncMessage}</p>}
          {srtDownloadMessage && <p className="text-[10px] text-emerald-200" role="status">{srtDownloadMessage}</p>}
          {allVideosAction && (
            <div className="space-y-0.5 text-[10px]" role="status" aria-live="polite">
              <p className="text-slate-300">
                {allVideosAction.status === "running"
                  ? `Đang ${allVideosAction.action === "tts" ? "tạo TTS" : allVideosAction.action === "demucs" ? "tách Demucs" : allVideosAction.action === "mix" ? "render Mix Audio" : allVideosAction.action === "render" ? "export" : "tải"} ${allVideosAction.currentIndex}/${allVideosAction.total}${allVideosAction.currentFileName ? `: ${allVideosAction.currentFileName}` : "…"}`
                  : `${allVideosAction.action === "tts" ? "TTS" : allVideosAction.action === "demucs" ? "Demucs" : allVideosAction.action === "mix" ? "Mix Audio" : allVideosAction.action === "render" ? "Render" : "Download"} hoàn tất: ${allVideosAction.completed}/${allVideosAction.total} video thành công.`}
              </p>
              {allVideosAction.errors.length > 0 && (
                <p className="text-rose-300">
                  {allVideosAction.errors.slice(0, 3).join(" · ")}
                  {allVideosAction.errors.length > 3
                    ? ` · và ${allVideosAction.errors.length - 3} lỗi khác`
                    : ""}
                </p>
              )}
            </div>
          )}
        </div>

        {/* Video Items List: Responsive Cards (No cramped tables, no hidden buttons) */}
        <div className="flex-1 min-h-0 w-full overflow-y-auto p-2 space-y-2.5 scrollbar-thin">
          {/* Project Saved Jobs */}
          {projectJobItems.map((item) => {
            const cues = item.job.overlaySettings?.subtitles || [];
            const srtName = activeProject?.activeJobId === item.job.id
              ? activeProject.srt?.fileName
              : undefined;
            const isCurrentJob = job?.id === item.job.id;
            return (
              <div
                key={`saved-${item.job.id}`}
                onClick={(event) => previewVideoRow(event, item.job)}
                aria-current={isCurrentJob ? "true" : undefined}
                className={`p-2.5 border transition-all cursor-pointer rounded-none flex flex-col gap-2 ${
                  isCurrentJob
                    ? "bg-sky-950/40 border-sky-400/60 ring-1 ring-sky-400/30"
                    : "bg-slate-900/50 border-slate-800 hover:bg-slate-900/80 hover:border-slate-700"
                }`}
              >
                {/* Row 1: Cover + Video Name + Badges */}
                <div className="flex items-center justify-between gap-2 min-w-0">
                  <div className="flex items-center gap-2 min-w-0 flex-1">
                    {renderCoverEditorButton(item.job)}
                    <button
                      type="button"
                      onClick={() => void previewSourceVideo(item.job)}
                      disabled={item.job.status !== "completed" || queueRunning || settingsSyncRunning}
                      className="flex items-center gap-1.5 min-w-0 flex-1 text-left cursor-pointer disabled:opacity-50"
                      title={item.job.fileName}
                    >
                      <Film className="h-4 w-4 shrink-0 text-amber-400" />
                      <span className="truncate text-xs font-bold text-slate-100 hover:text-white hover:underline">
                        {item.job.fileName}
                      </span>
                    </button>
                  </div>

                  <div className="flex items-center gap-1.5 shrink-0">
                    {isCurrentJob && (
                      <span className="px-1.5 py-0.5 text-[10px] font-bold bg-sky-500/20 text-sky-300 border border-sky-500/30 rounded-none">
                        Đang preview
                      </span>
                    )}
                    <span className="text-[10px] font-mono text-slate-400 bg-slate-950 px-1.5 py-0.5 border border-slate-800">
                      {statusLabel(item.job)}
                    </span>
                  </div>
                </div>

                {/* Row 2: Subtitle SRT info */}
                <div className="flex items-center justify-between gap-2 px-2 py-1.5 bg-slate-950/70 border border-slate-800/80 rounded-none text-xs">
                  <div className="flex items-center gap-1.5 min-w-0 flex-1">
                    <FileText className={`h-3.5 w-3.5 shrink-0 ${srtName || cues.length ? "text-cyan-400" : "text-slate-600"}`} />
                    <span className="truncate text-[11px] text-slate-300" title={srtName || (cues.length ? `Phụ đề (${cues.length} câu)` : "Chưa có SRT")}>
                      {srtName || (cues.length ? `Phụ đề (${cues.length} câu)` : "Chưa có file SRT")}
                    </span>
                  </div>
                  {cues.length > 0 && (
                    <span className="text-[10px] text-cyan-300 font-mono shrink-0 bg-cyan-950/40 px-1.5 py-0.2 border border-cyan-500/20">
                      {cues.length} câu
                    </span>
                  )}
                </div>

                {/* Progress bar if running */}
                {renderJobProcessingBar(item.job)}

                {/* Row 3: Pipeline Action Buttons (TTS, Demucs, Mix, Render, Tải SRT, Tải MP4, Cập nhật) */}
                <div className="pt-1 border-t border-slate-800/80">
                  {renderVideoActions(item.job)}
                </div>
              </div>
            );
          })}

          {/* Queue Rows */}
          {Array.from(
            { length: Math.max(queueRowCount, 1) },
            (_, index) => {
              const { video: file, subtitle } = queueRows[index] || {};
              const rowState = queueStates[index];
              const validVideo = Boolean(
                file &&
                ACCEPTED_VIDEO_EXTENSIONS.has(
                  file.name.slice(file.name.lastIndexOf(".")).toLowerCase(),
                ),
              );
              const isCurrentJob = file?.job?.id && job?.id === file.job.id;
              return (
                <div
                  key={`${file?.id || "no-video"}-${file?.name || ""}-${file?.size || 0}-${file?.lastModified || 0}-${subtitle?.id || "no-srt"}-${index}`}
                  onClick={(event) => previewVideoRow(event, file?.job)}
                  aria-current={isCurrentJob ? "true" : undefined}
                  className={`p-2.5 border transition-all rounded-none flex flex-col gap-2 ${
                    isCurrentJob
                      ? "bg-sky-950/40 border-sky-400/60 ring-1 ring-sky-400/30"
                      : "bg-slate-900/50 border-slate-800 hover:bg-slate-900/80 hover:border-slate-700"
                  }`}
                >
                  {/* Top: Video selector / dropzone + filename + status + info/delete */}
                  <div className="flex items-center justify-between gap-2 min-w-0">
                    <div className="flex items-center gap-2 min-w-0 flex-1">
                      {file?.job && renderCoverEditorButton(file.job)}
                      <div
                        onDragEnter={(event) => { event.preventDefault(); event.stopPropagation(); }}
                        onDragOver={(event) => { event.preventDefault(); event.stopPropagation(); event.dataTransfer.dropEffect = "copy"; }}
                        onDrop={(event) => handleQueueDrop(event, file?.job?.id)}
                        className="flex items-center min-w-0 flex-1"
                      >
                        <button
                          type="button"
                          disabled={queueRunning || Boolean(file?.uploading)}
                          onClick={(event) => {
                            event.stopPropagation();
                            videoInputRef.current?.click();
                          }}
                          className="flex items-center gap-1.5 min-w-0 flex-1 text-left cursor-pointer disabled:opacity-60"
                          title={file?.name || "Chọn hoặc thả video"}
                        >
                          <Film className="h-4 w-4 shrink-0 text-amber-400" />
                          <span className="truncate text-xs font-bold text-slate-200 hover:text-white">
                            {file?.name || "Chọn hoặc thả tệp video..."}
                          </span>
                        </button>
                      </div>
                    </div>

                    <div className="flex items-center gap-1 shrink-0">
                      {isCurrentJob && (
                        <span className="px-1.5 py-0.5 text-[10px] font-bold bg-sky-500/20 text-sky-300 border border-sky-500/30 rounded-none">
                          Đang preview
                        </span>
                      )}
                      {file?.uploading && <span className="text-[10px] text-amber-300 font-mono">Đang lưu…</span>}
                      {file?.job && !file.uploading && <span className="text-[10px] text-emerald-300 font-mono">Đã lưu</span>}
                      {file?.error && <span className="text-[10px] text-rose-300 font-mono">Lỗi lưu</span>}
                      {file && !validVideo && <span className="text-[10px] text-rose-300 font-mono">Định dạng lỗi</span>}

                      {/* Info button */}
                      <button
                        type="button"
                        onClick={(e) => {
                          e.stopPropagation();
                          setDetailRowIndex(index);
                          setFileDetailsOpen(true);
                        }}
                        disabled={!file && !subtitle}
                        title="Chi tiết video nguồn"
                        aria-label="Chi tiết video nguồn"
                        className="p-1 text-slate-300 hover:text-white hover:bg-slate-800 border border-slate-700 rounded-none cursor-pointer disabled:opacity-40"
                      >
                        <Info className="h-3.5 w-3.5" />
                      </button>
                      {/* Delete button */}
                      {(file || subtitle) && (
                        <button
                          type="button"
                          disabled={queueRunning || settingsSyncRunning}
                          onClick={(e) => {
                            e.stopPropagation();
                            void removeQueuedSource(file, subtitle);
                            setQueueStates((current) =>
                              Object.fromEntries(
                                Object.entries(current)
                                  .filter(([key]) => Number(key) !== index)
                                  .map(([key, value]) => [
                                    Number(key) > index
                                      ? Number(key) - 1
                                      : Number(key),
                                    value,
                                  ]),
                              ),
                            );
                            setDetailRowIndex((current) =>
                              current === index
                                ? null
                                : current !== null && current > index
                                  ? current - 1
                                  : current,
                            );
                          }}
                          title="Xóa video nguồn"
                          aria-label="Xóa video nguồn"
                          className="p-1 text-rose-300 hover:text-white hover:bg-rose-950/60 border border-rose-500/30 rounded-none cursor-pointer disabled:opacity-40"
                        >
                          <Trash2 className="h-3.5 w-3.5" />
                        </button>
                      )}
                    </div>
                  </div>

                  {/* Row 2: Subtitle SRT Selector */}
                  <div
                    onDragEnter={(event) => { event.preventDefault(); event.stopPropagation(); }}
                    onDragOver={(event) => { event.preventDefault(); event.stopPropagation(); event.dataTransfer.dropEffect = "copy"; }}
                    className="flex items-center justify-between gap-2 px-2 py-1.5 bg-slate-950/70 border border-slate-800/80 rounded-none text-xs"
                  >
                    <div className="flex items-center gap-1.5 min-w-0 flex-1">
                      <FileText className={`h-3.5 w-3.5 shrink-0 ${subtitle?.analysis && !subtitle.error ? "text-cyan-400" : "text-slate-500"}`} />
                      <span className="truncate text-[11px] text-slate-300" title={subtitle?.fileName || "Chưa chọn phụ đề SRT"}>
                        {subtitle?.fileName || "Chưa có file phụ đề SRT"}
                      </span>
                    </div>
                    <button
                      type="button"
                      disabled={queueRunning || Boolean(file?.uploading)}
                      onClick={(event) => {
                        event.stopPropagation();
                        openSrtBrowser(file?.job?.id);
                      }}
                      className="px-2 py-0.5 text-[10px] font-semibold bg-cyan-500/15 text-cyan-300 hover:bg-cyan-500/25 border border-cyan-500/30 rounded-none cursor-pointer shrink-0"
                    >
                      {subtitle?.fileName ? "Đổi SRT" : "Chọn SRT"}
                    </button>
                  </div>

                  {/* Progress bar if running */}
                  {file?.job && renderJobProcessingBar(file.job)}

                  {/* Row state info */}
                  {rowState && (
                    <div className="flex items-center justify-between text-[10px] font-mono text-slate-400 px-1">
                      <span className={rowState.status === "failed" ? "text-rose-300" : rowState.status === "completed" ? "text-emerald-300" : "text-slate-400"}>
                        {rowState.status === "completed" ? "Hoàn tất" : rowState.status === "failed" ? rowState.error || "Thất bại" : rowState.status === "cancelled" ? "Đã hủy" : rowState.status === "queued" ? "Trong hàng đợi" : rowState.phase || "Đang xử lý"}
                        {rowState.status === "processing" && rowState.progressPercent !== undefined && ` · ${Math.round(rowState.progressPercent)}%`}
                      </span>
                      {rowState?.status === "completed" && rowState.jobId && (
                        <a
                          href={`/api/video-dubbing/jobs/${rowState.jobId}/download`}
                          download
                          title="Tải video đã export"
                          className="inline-flex items-center gap-1 text-[10px] text-emerald-300 font-bold hover:underline"
                        >
                          <Download className="h-3 w-3" />
                          <span>Tải MP4</span>
                        </a>
                      )}
                    </div>
                  )}

                  {/* Pipeline actions */}
                  {file?.job && (
                    <div className="pt-1 border-t border-slate-800/80">
                      {renderVideoActions(file.job)}
                    </div>
                  )}
                </div>
              );
            },
          )}
        </div>

        <input
          ref={videoInputRef}
          type="file"
          multiple
          accept=".mp4,.mkv,.mov,.avi,.webm,video/mp4,video/x-matroska,video/quicktime,video/x-msvideo,video/webm"
          onChange={handleVideoChange}
          className="hidden"
          aria-label="Chọn một hoặc nhiều video nguồn"
        />
        <input
          ref={srtInputRef}
          type="file"
          multiple
          accept=".srt,application/x-subrip"
          onChange={(event) => void handleSrtChange(event)}
          className="hidden"
          aria-label="Chọn một hoặc nhiều phụ đề SRT"
        />
        <div className="shrink-0 border-t border-slate-800 p-2 bg-slate-950/70">
          <p className="text-[11px] text-slate-400 leading-tight">
            Ghép video và SRT theo thứ tự hàng. Hàng đợi chạy tự động.
            {videoFiles.length !== subtitleFiles.length && (
              <span className="block mt-0.5 text-amber-300">
                ⚠ Cần số lượng video và SRT bằng nhau ({videoFiles.length} video, {subtitleFiles.length} SRT).
              </span>
            )}
          </p>
        </div>
      </section>
      )}
      </div>
      <div className="h-full min-h-0 overflow-y-auto flex flex-col gap-0 divide-y divide-slate-800 min-w-0 bg-slate-950 rounded-none scrollbar-thin xl:col-start-2 xl:row-start-3">
      {job?.status === "completed" ? (
        <section className="space-y-4 rounded-2xl border border-cyan-500/25 bg-slate-900/80 p-4 sm:p-5">
          <button
            type="button"
            onClick={() => setMixerPanelExpanded((expanded) => !expanded)}
            aria-expanded={mixerPanelExpanded}
            aria-controls="video-dubbing-mixer-panel"
            className="flex w-full items-start gap-3 text-left"
          >
            <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl border border-cyan-500/25 bg-cyan-500/15 text-cyan-300">
              <AudioLines className="h-5 w-5" />
            </div>
            <div className="min-w-0 flex-1">
              <h3 className="font-semibold text-white">
                Mixer Preview · 3 track
              </h3>
              <p className="mt-1 text-xs leading-relaxed text-slate-400">
                Nghe đồng bộ bằng Web Audio với gain riêng cho vocals,
                instrumental và TTS Master. Mọi thay đổi chỉ áp dụng tức thời
                cho preview; chỉ nút render mới tạo file dùng khi xuất MP4.
              </p>
            </div>
            <ChevronDown
              className={`mt-2 h-4 w-4 shrink-0 text-slate-400 transition-transform ${
                mixerPanelExpanded ? "rotate-180" : ""
              }`}
            />
          </button>

          {mixerPanelExpanded && (
            <div
              id="video-dubbing-mixer-panel"
              className={`grid min-w-0 items-start gap-4 ${
                videoWorkspaceTab === "preview"
                  ? "lg:grid-cols-[minmax(0,1fr)_minmax(300px,360px)]"
                  : "grid-cols-1"
              }`}
            >
              <div className="space-y-4">
              <div role="tablist" aria-label="Video preview" className="flex gap-1 rounded-xl border border-slate-800 bg-slate-950/70 p-1">
                <button type="button" role="tab" aria-selected={videoWorkspaceTab === "preview"} onClick={() => setVideoWorkspaceTab("preview")} className={`flex-1 rounded-lg px-3 py-2 text-xs font-semibold ${videoWorkspaceTab === "preview" ? "bg-cyan-400 text-slate-950" : "text-slate-300 hover:bg-slate-800"}`}>Video Mixer Preview</button>
                <button type="button" role="tab" aria-selected={videoWorkspaceTab === "merged"} onClick={() => setVideoWorkspaceTab("merged")} className={`flex-1 rounded-lg px-3 py-2 text-xs font-semibold ${videoWorkspaceTab === "merged" ? "bg-emerald-400 text-slate-950" : "text-slate-300 hover:bg-slate-800"}`}>Merged Video</button>
                <button type="button" role="tab" aria-selected={videoWorkspaceTab === "end-scene"} onClick={() => setVideoWorkspaceTab("end-scene")} className={`flex-1 rounded-lg px-3 py-2 text-xs font-semibold ${videoWorkspaceTab === "end-scene" ? "bg-orange-400 text-slate-950" : "text-slate-300 hover:bg-slate-800"}`}>End Scene</button>
              </div>
              <div className="space-y-3 rounded-xl border border-slate-800 bg-black/40 p-3">
                <div className={`flex justify-center ${videoWorkspaceTab === "preview" ? "" : "hidden"}`}>
                  <div
                    ref={previewStageRef}
                    onPointerDownCapture={startCharacterCardRegion}
                    onPointerMove={moveCharacterCardRegion}
                    onPointerUp={finishCharacterCardRegion}
                    onPointerCancel={cancelCharacterCardRegionDraw}
                    className={`relative inline-block max-w-full overflow-hidden rounded-lg bg-black ${characterCardDrawMode ? "cursor-crosshair" : ""}`}
                  >
                    <video
                      key={job.id}
                      ref={previewVideoRef}
                      src={`/api/video-dubbing/jobs/${job.id}/source-video`}
                      muted
                      playsInline
                      preload="metadata"
                      onLoadedMetadata={() => setVideoPreviewReady(true)}
                      onError={() => {
                        setVideoPreviewReady(false);
                        setPreviewError(
                          "Trình duyệt không thể giải mã định dạng video này. Hãy dùng MP4 hoặc WebM tương thích để xem trước.",
                        );
                      }}
                      className={`block h-auto max-h-[min(60vh,640px)] max-w-full rounded-lg bg-black object-contain ${
                        previewingEndScene ? "opacity-0" : ""
                      }`}
                      aria-label="Video nguồn"
                    />
                    {previewingEndScene && (
                      <div
                        aria-hidden="true"
                        className="pointer-events-none absolute inset-0 z-0 bg-black"
                      />
                    )}
                    {job.overlaySettings?.coverEnabled &&
                      !previewingEndScene &&
                      job.overlaySettings?.coverFileName &&
                      previewCurrentTime <
                        (job.overlaySettings.coverFrameCount ?? 5) /
                          (job.metadata?.frameRate || 25) && (
                        <img
                          src={`/api/video-dubbing/jobs/${job.id}/cover?v=${job.updatedAt}`}
                          alt="Ảnh cover đầu video"
                          className="pointer-events-none absolute inset-0 h-full w-full object-cover"
                        />
                      )}
                    {logoEnabled && job.overlaySettings?.logoFileName && (
                      <div
                        className={`pointer-events-none absolute inset-0 flex ${
                          previewingEndScene ? "z-10" : ""
                        }`}
                        style={{
                          justifyContent: overlayAlignment.horizontal,
                          alignItems: overlayAlignment.vertical,
                          padding: `${logoPaddingPx * previewOverlayScale}px`,
                        }}
                      >
                        <img
                          src={`/api/video-dubbing/jobs/${job.id}/logo?v=${job.updatedAt}`}
                          alt=""
                          className="h-auto max-h-[40%] max-w-full object-contain"
                          style={{ width: `${logoWidthPercent}%` }}
                        />
                      </div>
                    )}
                    {activePreviewSubtitle && !previewingEndScene && (
                      <div
                        className="pointer-events-none absolute inset-0 flex"
                        style={{
                          justifyContent: subtitleOverlayAlignment.horizontal,
                          alignItems: subtitleOverlayAlignment.vertical,
                          padding: `${subtitleMarginPx * previewOverlayScale}px`,
                        }}
                      >
                        <SubtitleOverlayRenderer
                          text={activePreviewSubtitle.text}
                          scale={previewOverlayScale}
                          fontSize={subtitleFontSize}
                          fontFamily={subtitleFontFamily}
                          fontWeight={subtitleBold}
                          fontStyle={subtitleItalic}
                          underline={subtitleUnderline}
                          textCase={subtitleTextCase}
                          outlineEnabled={subtitleOutlineEnabled}
                          outlineColor={subtitleOutlineColor}
                          outlineWidthPx={subtitleOutlineWidthPx}
                          characterSpacingPx={subtitleCharacterSpacingPx}
                          lineSpacingPx={subtitleLineSpacingPx}
                          color={subtitleColor}
                          backgroundMode={subtitleBackgroundMode}
                          backgroundColor={subtitleBackgroundColor}
                          backgroundTransparent={subtitleBackgroundTransparent}
                          backgroundImage={subtitleBackgroundImage}
                          paddingPx={subtitlePaddingPx}
                          position={subtitlePosition}
                        />
                      </div>
                    )}
                    {activePreviewTextItems
                      .filter(({ cue }) => !previewingEndScene || cue.isTitle)
                      .map(({ cue, index }) => {
                      const customPosition = Number.isFinite(cue.xPercent) && Number.isFinite(cue.yPercent);
                      const selected = selectedTextOverlay === index;
                      const textAlign = cue.isTitle ? undefined : cue.textAlign ?? getSubtitleTextAlignment(cue.position);
                      const horizontalTransform = textAlign === "left" ? "0%" : textAlign === "right" ? "-100%" : "-50%";
                      const verticalTransform = customPosition || cue.position.startsWith("middle-")
                        ? "-50%"
                        : cue.position.startsWith("bottom-") ? "-100%" : "0%";
                      const content = (
                        <div
                          onPointerDown={(event) => startTextOverlayPreviewDrag(event, index)}
                          className={`pointer-events-auto touch-none cursor-move rounded-sm ${selected ? "outline outline-1 outline-dashed outline-violet-300/80" : ""}`}
                          title="Kéo để đổi vị trí text"
                        >
                          <SubtitleOverlayRenderer
                            text={cue.text}
                            secondaryText={cue.kind === "character-card" ? cue.characterRole ?? "" : undefined}
                            secondaryFontSize={cue.characterRoleFontSize}
                            scale={previewOverlayScale}
                            fontSize={cue.fontSize}
                            fontFamily={cue.fontFamily}
                            fontWeight={cue.bold}
                            fontStyle={cue.italic}
                            underline={cue.underline ?? false}
                            textCase={cue.textCase ?? "none"}
                            outlineEnabled={cue.outlineEnabled ?? false}
                            outlineColor={cue.outlineColor ?? "#000000"}
                            outlineWidthPx={cue.outlineWidthPx ?? 2}
                            characterSpacingPx={cue.characterSpacingPx ?? 0}
                            lineSpacingPx={cue.lineSpacingPx ?? 0}
                            color={cue.color}
                            backgroundMode={cue.backgroundTransparent ? "none" : "color"}
                            backgroundColor={cue.backgroundColor}
                            paddingPx={cue.paddingPx}
                            position={cue.position}
                            textAlign={textAlign}
                            wrap={false}
                          />
                        </div>
                      );
                      if (cue.isTitle) {
                        return customPosition ? (
                          <div key={`preview-text-${index}`} className="absolute z-10" style={{ left: `${cue.xPercent}%`, top: `${cue.yPercent}%`, transform: "translate(-50%, -50%)" }}>
                            {content}
                          </div>
                        ) : (
                          <div key={`preview-text-${index}`} className="pointer-events-none absolute inset-0 flex" style={{
                            justifyContent: getOverlayAlignment(cue.position).horizontal,
                            alignItems: getOverlayAlignment(cue.position).vertical,
                            padding: `${24 * previewOverlayScale}px`,
                          }}>
                            {content}
                          </div>
                        );
                      }
                      const margin = 24 * previewOverlayScale;
                      return (
                        <div key={`preview-text-${index}`} className="pointer-events-none absolute inset-0">
                          <div className="absolute z-10" style={{
                            left: customPosition
                              ? `${cue.xPercent}%`
                              : cue.position.endsWith("-left") ? `${margin}px` : cue.position.endsWith("-center") ? "50%" : undefined,
                            right: !customPosition && cue.position.endsWith("-right") ? `${margin}px` : undefined,
                            top: customPosition
                              ? `${cue.yPercent}%`
                              : cue.position.startsWith("top-") ? `${margin}px` : cue.position.startsWith("middle-") ? "50%" : undefined,
                            bottom: !customPosition && cue.position.startsWith("bottom-") ? `${margin}px` : undefined,
                            transform: `translate(${horizontalTransform}, ${verticalTransform})`,
                          }}>
                          {content}
                        </div>
                        </div>
                      );
                    })}
                    {previewingEndScene && endSceneTextOverlays.map((cue, index) => {
                      const textAlign = cue.textAlign ?? "center";
                      const horizontalTransform =
                        textAlign === "left"
                          ? "0%"
                          : textAlign === "right"
                            ? "-100%"
                            : "-50%";
                      const verticalTransform = cue.position.startsWith("top-")
                        ? "0%"
                        : cue.position.startsWith("bottom-")
                          ? "-100%"
                          : "-50%";
                      return (
                        <div
                          key={`mixer-end-scene-${cue.id ?? index}`}
                          className="pointer-events-none absolute z-30"
                          style={{
                            left: `${cue.xPercent ?? 50}%`,
                            top: `${cue.yPercent ?? 50}%`,
                            transform: `translate(${horizontalTransform}, ${verticalTransform})`,
                          }}
                        >
                          <SubtitleOverlayRenderer
                            text={cue.text}
                            scale={previewOverlayScale}
                            fontSize={cue.fontSize}
                            fontFamily={cue.fontFamily}
                            fontWeight={cue.bold}
                            fontStyle={cue.italic}
                            underline={cue.underline ?? false}
                            textCase={cue.textCase ?? "none"}
                            outlineEnabled={cue.outlineEnabled ?? false}
                            outlineColor={cue.outlineColor ?? "#000000"}
                            outlineWidthPx={cue.outlineWidthPx ?? 2}
                            characterSpacingPx={cue.characterSpacingPx ?? 0}
                            lineSpacingPx={cue.lineSpacingPx ?? 0}
                            color={cue.color}
                            backgroundMode={cue.backgroundTransparent ? "none" : "color"}
                            backgroundColor={cue.backgroundColor}
                            paddingPx={cue.paddingPx}
                            position={cue.position}
                            textAlign={textAlign}
                            wrap={false}
                          />
                        </div>
                      );
                    })}
                    {(characterCardRegionDraft || characterCardRegion) && (
                      <div
                        aria-hidden="true"
                        className="pointer-events-none absolute z-30 border-2 border-amber-300 bg-amber-300/10"
                        style={{
                          left: `${(characterCardRegionDraft || characterCardRegion)!.left * 100}%`,
                          top: `${(characterCardRegionDraft || characterCardRegion)!.top * 100}%`,
                          width: `${(characterCardRegionDraft || characterCardRegion)!.width * 100}%`,
                          height: `${(characterCardRegionDraft || characterCardRegion)!.height * 100}%`,
                        }}
                      />
                    )}
                  </div>
                </div>
                {videoWorkspaceTab === "end-scene" && (
                  <div className="space-y-4">
                    <div className="grid min-w-0 gap-4 xl:grid-cols-[minmax(0,1.4fr)_minmax(280px,0.8fr)]">
                      <div
                        ref={endScenePreviewContainerRef}
                        className="flex min-w-0 justify-center"
                      >
                        <div
                          ref={endSceneStageRef}
                          className="relative shrink-0 overflow-hidden rounded-lg border border-slate-700 bg-black"
                          style={{
                            width: `${endScenePreviewSize.width}px`,
                            height: `${endScenePreviewSize.height}px`,
                            maxWidth: "100%",
                          }}
                        >
                          {endSceneTextOverlays.map((cue, index) => {
                            const textAlign = cue.textAlign ?? "center";
                            const horizontalTransform =
                              textAlign === "left"
                                ? "0%"
                                : textAlign === "right"
                                  ? "-100%"
                                  : "-50%";
                            const verticalTransform = cue.position.startsWith("top-")
                              ? "0%"
                              : cue.position.startsWith("bottom-")
                                ? "-100%"
                                : "-50%";
                            return (
                              <div
                                key={cue.id ?? `end-scene-text-${index}`}
                                className={`absolute z-30 touch-none ${
                                  selectedEndSceneTextIndex === index
                                    ? "outline outline-1 outline-dashed outline-orange-300"
                                    : ""
                                }`}
                                style={{
                                  left: `${cue.xPercent ?? 50}%`,
                                  top: `${cue.yPercent ?? 50}%`,
                                  transform: `translate(${horizontalTransform}, ${verticalTransform})`,
                                }}
                                onPointerDown={(event) => startEndSceneTextDrag(event, index)}
                              >
                                <SubtitleOverlayRenderer
                                  text={cue.text}
                                  scale={endSceneOverlayScale}
                                  fontSize={cue.fontSize}
                                  fontFamily={cue.fontFamily}
                                  fontWeight={cue.bold}
                                  fontStyle={cue.italic}
                                  underline={cue.underline ?? false}
                                  textCase={cue.textCase ?? "none"}
                                  outlineEnabled={cue.outlineEnabled ?? false}
                                  outlineColor={cue.outlineColor ?? "#000000"}
                                  outlineWidthPx={cue.outlineWidthPx ?? 2}
                                  characterSpacingPx={cue.characterSpacingPx ?? 0}
                                  lineSpacingPx={cue.lineSpacingPx ?? 0}
                                  color={cue.color}
                                  backgroundMode={cue.backgroundTransparent ? "none" : "color"}
                                  backgroundColor={cue.backgroundColor}
                                  paddingPx={cue.paddingPx}
                                  position={cue.position}
                                  textAlign={textAlign}
                                  wrap={false}
                                />
                              </div>
                            );
                          })}
                          {endSceneTextOverlays.length === 0 && (
                            <p className="absolute inset-0 flex items-center justify-center text-xs text-slate-600">
                              Màn hình đen · Chưa có text
                            </p>
                          )}
                        </div>
                      </div>
                      <div className="min-w-0 space-y-3">
                        <div className="flex flex-wrap items-center justify-between gap-2">
                          <div>
                            <h4 className="text-sm font-semibold text-white">End Scene</h4>
                            <p className="mt-1 text-[10px] text-slate-400">
                              Style được lưu trong project; việc thêm vào timeline áp dụng riêng cho video này.
                            </p>
                          </div>
                          <button
                            type="button"
                            disabled={!job || !job.metadata || isMediaProcessing}
                            onClick={() => void saveEndSceneForCurrentVideo(!endSceneEnabled)}
                            className={`rounded-md border px-2.5 py-1.5 text-xs font-semibold disabled:opacity-40 ${
                              endSceneEnabled
                                ? "border-orange-400/50 bg-orange-500/15 text-orange-200"
                                : "border-slate-700 text-slate-300 hover:border-orange-400/50"
                            }`}
                          >
                            {endSceneEnabled ? "Bỏ End Scene khỏi video" : "Add End Scene vào video"}
                          </button>
                        </div>
                        <label className="flex items-center justify-between gap-3 rounded-lg border border-slate-800 bg-slate-950/60 p-2.5 text-xs text-slate-300">
                          Thời lượng End Scene (giây)
                          <input
                            type="number"
                            min={1}
                            max={120}
                            step={0.5}
                            value={endSceneDurationSeconds}
                            onChange={(event) => {
                              const value = Number(event.target.value);
                              if (!Number.isFinite(value) || value < 1 || value > 120) return;
                              setEndSceneDurationSeconds(value);
                              setEndSceneTextOverlays((items) =>
                                items.map((cue) => ({
                                  ...cue,
                                  startTime: Math.min(cue.startTime, value - 0.1),
                                  endTime: value,
                                })),
                              );
                            }}
                            className="w-24 rounded-md border border-slate-700 bg-slate-950 px-2 py-1.5 text-right text-xs text-white"
                          />
                        </label>
                        <label className="flex items-center justify-between gap-3 rounded-lg border border-slate-800 bg-slate-950/60 p-2.5 text-xs text-slate-300">
                          Tỉ lệ khung hình preview
                          <select
                            value={endSceneAspectRatio}
                            onChange={(event) =>
                              setEndSceneAspectRatio(
                                event.target.value as VideoDubbingEndSceneAspectRatio,
                              )
                            }
                            className="rounded-md border border-slate-700 bg-slate-950 px-2 py-1.5 text-xs text-white"
                          >
                            {END_SCENE_ASPECT_RATIOS.map((ratio) => (
                              <option key={ratio} value={ratio}>{ratio}</option>
                            ))}
                          </select>
                        </label>
                        <div className="flex flex-wrap gap-2">
                          <button
                            type="button"
                            onClick={addEndSceneText}
                            className="inline-flex items-center gap-1 rounded-md border border-orange-500/30 px-2.5 py-1.5 text-xs text-orange-200 hover:bg-orange-950/30"
                          >
                            <Plus className="h-3 w-3" />Thêm text
                          </button>
                          <button
                            type="button"
                            disabled={!selectedEndSceneCue}
                            onClick={removeSelectedEndSceneText}
                            className="inline-flex items-center gap-1 rounded-md border border-rose-500/30 px-2.5 py-1.5 text-xs text-rose-200 hover:bg-rose-950/30 disabled:opacity-40"
                          >
                            <Trash2 className="h-3 w-3" />Xóa text
                          </button>
                        </div>
                        <div className="max-h-28 space-y-1 overflow-y-auto rounded-lg border border-slate-800 bg-slate-950/50 p-1.5">
                          {endSceneTextOverlays.map((cue, index) => (
                            <button
                              key={cue.id ?? index}
                              type="button"
                              aria-pressed={selectedEndSceneTextIndex === index}
                              onClick={() => setSelectedEndSceneTextIndex(index)}
                              className={`w-full truncate rounded-md px-2 py-1.5 text-left text-xs ${
                                selectedEndSceneTextIndex === index
                                  ? "bg-orange-500/20 text-orange-100"
                                  : "text-slate-300 hover:bg-slate-800"
                              }`}
                            >
                              {cue.text || `Text ${index + 1}`}
                            </button>
                          ))}
                          {!endSceneTextOverlays.length && (
                            <p className="px-2 py-2 text-[10px] text-slate-500">Chưa có text trong End Scene.</p>
                          )}
                        </div>
                        {selectedEndSceneCue && selectedEndSceneTextIndex !== null && (
                          <div className="space-y-3 rounded-lg border border-slate-800 bg-slate-950/50 p-2.5">
                            <label className="block space-y-1 text-[10px] text-slate-400">
                              Nội dung
                              <textarea
                                rows={2}
                                value={selectedEndSceneCue.text}
                                onChange={(event) =>
                                  updateEndSceneText(selectedEndSceneTextIndex, { text: event.target.value })
                                }
                                className="w-full rounded-md border border-slate-700 bg-slate-950 px-2 py-1.5 text-xs text-white"
                              />
                            </label>
                            <TextStyleControls
                              value={endSceneTextStyleValue}
                              onChange={updateSelectedEndSceneStyle}
                              fontOptions={subtitleFontOptions}
                              disabled={!selectedEndSceneCue}
                              maxFontSize={160}
                            />
                            <div className="grid grid-cols-2 gap-2 text-[10px] text-slate-400">
                              <label className="flex items-center justify-between gap-2">
                                Căn chữ
                                <select
                                  value={selectedEndSceneCue.textAlign ?? "center"}
                                  onChange={(event) => updateEndSceneText(selectedEndSceneTextIndex, {
                                    textAlign: event.target.value as "left" | "center" | "right",
                                  })}
                                  className="rounded border border-slate-700 bg-slate-950 px-2 py-1 text-xs text-white"
                                >
                                  <option value="left">Trái</option>
                                  <option value="center">Giữa</option>
                                  <option value="right">Phải</option>
                                </select>
                              </label>
                              <label className="flex items-center justify-between gap-2">
                                Vị trí dọc
                                <select
                                  value={selectedEndSceneCue.position.startsWith("top-") ? "top" : selectedEndSceneCue.position.startsWith("bottom-") ? "bottom" : "middle"}
                                  onChange={(event) => {
                                    const vertical = event.target.value;
                                    const horizontal = selectedEndSceneCue.position.endsWith("-left")
                                      ? "left"
                                      : selectedEndSceneCue.position.endsWith("-right")
                                        ? "right"
                                        : "center";
                                    updateEndSceneText(selectedEndSceneTextIndex, {
                                      position: `${vertical}-${horizontal}` as VideoDubbingOverlayPosition,
                                    });
                                  }}
                                  className="rounded border border-slate-700 bg-slate-950 px-2 py-1 text-xs text-white"
                                >
                                  <option value="top">Trên</option>
                                  <option value="middle">Giữa</option>
                                  <option value="bottom">Dưới</option>
                                </select>
                              </label>
                              <label className="flex items-center justify-between gap-2">
                                Màu nền
                                <input
                                  type="color"
                                  value={selectedEndSceneCue.backgroundColor}
                                  disabled={selectedEndSceneCue.backgroundTransparent}
                                  onChange={(event) => updateEndSceneText(selectedEndSceneTextIndex, { backgroundColor: event.target.value })}
                                  className="h-7 w-10 rounded border border-slate-700 bg-slate-950 disabled:opacity-40"
                                />
                              </label>
                              <label className="flex items-center gap-2">
                                <input
                                  type="checkbox"
                                  checked={selectedEndSceneCue.backgroundTransparent}
                                  onChange={(event) => updateEndSceneText(selectedEndSceneTextIndex, { backgroundTransparent: event.target.checked })}
                                  className="accent-orange-400"
                                />
                                Nền trong suốt
                              </label>
                            </div>
                          </div>
                        )}
                      </div>
                    </div>
                  </div>
                )}
                {videoWorkspaceTab === "merged" && (hasExportedVideo && job ? (
                  <div className="space-y-3 rounded-xl border border-emerald-500/25 bg-emerald-950/20 p-3.5">
                    <div className="flex flex-wrap items-center justify-between gap-2">
                      <span className="text-xs font-semibold text-emerald-300">
                        {videoExport?.status === "completed" && isFinalMixCurrent ? "MP4 đã xuất" : "MP4 trước đó vẫn được giữ"}
                      </span>
                      <span className="text-xs text-slate-400">
                        {job.exportedVideoFileName || `${job.fileName.replace(/\.[^.]+$/, "")}_merged.mp4`} · {formatFileSize(videoExport?.sizeBytes || 0)}
                        {videoExport?.durationSeconds !== undefined && ` · ${formatDuration(videoExport.durationSeconds)}`}
                      </span>
                    </div>
                    {videoExport?.status === "completed" && <p className="text-xs text-slate-400">Thời gian export: {formatElapsed(videoExport.elapsedSeconds)}</p>}
                    <video key={`merged-${job.id}-${videoExport?.completedAtMs}`} controls playsInline preload="metadata" src={`/api/video-dubbing/jobs/${job.id}/exported-video?v=${videoExport?.sizeBytes || 0}-${videoExport?.completedAtMs || 0}`} className="max-h-[min(65vh,760px)] w-full rounded-lg bg-black" aria-label="Merged Video" />
                    <a href={`/api/video-dubbing/jobs/${job.id}/download`} download={job.exportedVideoFileName || `${job.fileName.replace(/\.[^.]+$/, "")}_merged.mp4`} className="inline-flex items-center justify-center gap-2 rounded-xl border border-emerald-500/40 px-4 py-2.5 text-sm font-bold text-emerald-200 hover:bg-emerald-950/60">Tải MP4</a>
                  </div>
                ) : (
                  <div className="flex min-h-64 flex-col items-center justify-center gap-2 rounded-lg border border-dashed border-slate-700 bg-slate-950/60 p-6 text-center">
                    <Film className="h-8 w-8 text-slate-600" />
                    <p className="text-sm font-semibold text-slate-300">Chưa có video đã merge</p>
                    <p className="text-xs text-slate-500">Video hoàn tất sẽ xuất hiện tại tab này.</p>
                  </div>
                ))}
                <p className={`text-[10px] leading-relaxed text-slate-500 ${videoWorkspaceTab === "preview" ? "" : "hidden"}`}>
                  Preview logo và style phụ đề sẽ cập nhật trực tiếp khi phát
                  hoặc tua video.
                </p>
                <div className={`flex flex-wrap items-center gap-2 ${videoWorkspaceTab === "preview" ? "" : "hidden"}`}>
                  <button
                    type="button"
                    onClick={() => void playMixerPreview()}
                    disabled={
                      !videoPreviewReady ||
                      isMediaProcessing
                    }
                    title={hasPreviewTrack ? "Phát preview video và các track âm thanh đang bật" : "Phát video preview (im lặng nếu chưa có track âm thanh)"}
                    className="inline-flex items-center gap-2 rounded-lg border border-cyan-500/30 bg-cyan-950/30 px-3 py-2 text-xs font-semibold text-cyan-100 hover:bg-cyan-950/60 disabled:cursor-not-allowed disabled:opacity-40"
                  >
                    {previewStatus === "playing" ? (
                      <Pause className="h-3.5 w-3.5" />
                    ) : (
                      <Play className="h-3.5 w-3.5" />
                    )}
                    {previewStatus === "playing" ? "Tạm dừng" : "Phát"}
                  </button>
                  <button
                    type="button"
                    onClick={() => void restartMixerPreview()}
                    disabled={!videoPreviewReady || isMediaProcessing}
                    className="inline-flex items-center gap-2 rounded-lg border border-slate-700 px-3 py-2 text-xs text-slate-300 hover:text-white disabled:opacity-40"
                  >
                    <RotateCcw className="h-3.5 w-3.5" />
                    Phát lại từ đầu
                  </button>
                  <span className="text-xs tabular-nums text-slate-400">
                    {formatDuration(previewCurrentTime)} /{" "}
                    {formatDuration(job.metadata?.durationSeconds || 0)}
                  </span>
                </div>
                {job.metadata && videoWorkspaceTab === "preview" && (
                  <input
                    type="range"
                    min={0}
                    max={job.metadata.durationSeconds}
                    step={0.05}
                    value={Math.min(
                      previewCurrentTime,
                      job.metadata.durationSeconds,
                    )}
                    onChange={(event) =>
                      seekMixerPreview(Number(event.target.value))
                    }
                    disabled={!videoPreviewReady}
                    className="w-full accent-cyan-400 disabled:opacity-40"
                    aria-label="Tua video và các track mixer"
                  />
                )}
                {videoWorkspaceTab === "preview" && timelineWorkspaceTab === "subtitle" && (
                  <section className="space-y-2 rounded-lg border border-amber-500/20 bg-amber-950/10 p-3">
                    <button
                      type="button"
                      aria-expanded={!characterCardScanCollapsed}
                      aria-controls="character-card-scan-panel"
                      onClick={() => setCharacterCardScanCollapsed((collapsed) => !collapsed)}
                      className="flex w-full items-center justify-between gap-2 text-left text-xs font-semibold text-amber-100"
                    >
                      <span>Quét và tạo card nhân vật</span>
                      <span className="flex items-center gap-2">
                        {(characterCardOcrJob?.status === "running" ||
                          characterCardReferenceScanJob?.status === "running") && (
                          <span className="text-[10px] font-normal text-amber-200">Đang quét…</span>
                        )}
                        <ChevronDown className={`h-4 w-4 transition-transform ${characterCardScanCollapsed ? "-rotate-90" : ""}`} />
                      </span>
                    </button>
                    <div
                      id="character-card-scan-panel"
                      className={characterCardScanCollapsed ? "hidden" : "space-y-2"}
                    >
                    <div className="flex flex-wrap items-center gap-2">
                      <button
                        type="button"
                        disabled={characterCardOcrWorker.status === "starting" || characterCardOcrWorker.status === "ready" || characterCardOcrWorker.status === "busy"}
                        onClick={() => void startCharacterCardOcrWorker()}
                        className="rounded-md border border-cyan-500/30 px-2.5 py-1.5 text-xs text-cyan-100 hover:bg-cyan-950/40 disabled:cursor-not-allowed disabled:opacity-40"
                      >
                        {characterCardOcrWorker.status === "starting" ? "Đang nạp OCR…" : "Giữ OCR chạy"}
                      </button>
                      {(characterCardOcrWorker.status === "starting" || characterCardOcrWorker.status === "ready" || characterCardOcrWorker.status === "busy") && (
                        <button
                          type="button"
                          onClick={() => void stopCharacterCardOcrWorker()}
                          className="rounded-md border border-rose-500/30 px-2.5 py-1.5 text-xs text-rose-200 hover:bg-rose-950/40"
                        >
                          Dừng OCR
                        </button>
                      )}
                      <span className="text-[10px] text-slate-400" role="status">
                        {characterCardOcrWorker.message}
                      </span>
                    </div>
                    <p className="text-[10px] text-slate-500">
                      Bật một lần để nạp model và tái sử dụng cho các lần quét tiếp theo; nhấn Dừng OCR để giải phóng RAM/VRAM.
                    </p>
                    <div className="flex flex-wrap items-center gap-2">
                      <button
                        type="button"
                        disabled={!videoPreviewReady || characterCardOcrJob?.status === "running" || characterCardOcrJob?.status === "queued"}
                        onClick={() => {
                          setCharacterCardOcrError(null);
                          setCharacterCardDrawMode((drawing) => !drawing);
                          setCharacterCardDrawStart(null);
                          setCharacterCardRegionDraft(null);
                        }}
                        className={`rounded-md border px-2.5 py-1.5 text-xs font-semibold disabled:cursor-not-allowed disabled:opacity-40 ${characterCardDrawMode ? "border-amber-300 bg-amber-300 text-slate-950" : "border-amber-500/40 text-amber-100 hover:bg-amber-950/40"}`}
                      >
                        {characterCardDrawMode ? "Đang vẽ vùng…" : characterCardRegion ? "Vẽ lại vùng card nhân vật" : "Vẽ vùng card nhân vật"}
                      </button>
                      {characterCardRegion && !characterCardDrawMode && (
                        <button
                          type="button"
                          disabled={characterCardOcrJob?.status === "running" || characterCardOcrJob?.status === "queued"}
                          onClick={() => setCharacterCardRegion(null)}
                          className="rounded-md border border-slate-700 px-2 py-1.5 text-xs text-slate-300 hover:bg-slate-800 disabled:opacity-40"
                        >
                          Xóa vùng
                        </button>
                      )}
                      <label className="flex items-center gap-2 text-xs text-slate-300">
                        Bắt đầu trước playhead (giây)
                        <input
                          type="number"
                          min={0}
                          max={60}
                          step={1}
                          value={characterCardOcrStartOffset}
                          onChange={(event) => {
                            const value = Number(event.target.value);
                            if (Number.isFinite(value)) {
                              setCharacterCardOcrStartOffset(Math.max(0, Math.min(60, value)));
                            }
                          }}
                          className="w-16 rounded-md border border-slate-700 bg-slate-950 px-2 py-1.5 text-center text-xs text-white"
                        />
                      </label>
                      <label className="flex items-center gap-2 text-xs text-slate-300">
                        Độ dài quét (giây)
                        <input
                          type="number"
                          min={1}
                          max={60}
                          step={1}
                          value={characterCardOcrDuration}
                          onChange={(event) => {
                            const value = Number(event.target.value);
                            if (Number.isFinite(value)) {
                              setCharacterCardOcrDuration(Math.max(1, Math.min(60, value)));
                            }
                          }}
                          className="w-16 rounded-md border border-slate-700 bg-slate-950 px-2 py-1.5 text-center text-xs text-white"
                        />
                      </label>
                      {characterCardOcrJob?.status === "running" || characterCardOcrJob?.status === "queued" ? (
                        <button
                          type="button"
                          onClick={() => void cancelCharacterCardOcr()}
                          className="rounded-md border border-rose-500/30 px-2.5 py-1.5 text-xs text-rose-200 hover:bg-rose-950/40"
                        >
                          {characterCardOcrWorker.status === "busy" ? "Hủy OCR · dừng worker" : "Hủy OCR"}
                        </button>
                      ) : (
                        <button
                          type="button"
                          disabled={!job || !characterCardRegion || characterCardDrawMode || characterCardOcrWorker.status === "starting" || characterCardOcrWorker.status === "busy"}
                          onClick={() => void createCharacterCardsAutomatically()}
                          className="rounded-md bg-amber-300 px-2.5 py-1.5 text-xs font-bold text-slate-950 hover:bg-amber-200 disabled:cursor-not-allowed disabled:opacity-40"
                        >
                          Tạo card tự động
                        </button>
                      )}
                    </div>
                    <p className="text-[10px] text-slate-400">
                      Khoanh vùng chứa card trên preview và dùng ảnh mẫu đã crop sát card. OCR bắt đầu từ N giây trước thời điểm khớp, quét M giây và tự giới hạn trong video.
                    </p>
                    {characterCardDrawMode && (
                      <p className="text-[10px] text-amber-200">Nhấn giữ và kéo trên video để chọn vùng.</p>
                    )}
                    {characterCardOcrJob && (
                      <p className="text-[10px] text-slate-300" role="status">
                        {characterCardOcrJob.message} {characterCardOcrJob.status === "running" && `${characterCardOcrJob.progressPercent}%`}
                      </p>
                    )}
                    {characterCardOcrError && (
                      <p className="text-[10px] text-rose-300" role="alert">{characterCardOcrError}</p>
                    )}
                    <div
                      onPaste={pasteCharacterCardReference}
                      tabIndex={0}
                      className="space-y-3 rounded-lg border border-violet-500/25 bg-violet-950/10 p-3 outline-none focus-visible:ring-2 focus-visible:ring-violet-400"
                      aria-label="Ảnh mẫu card nhân vật"
                    >
                      <div className="flex flex-wrap items-center justify-between gap-2">
                        <div>
                          <h4 className="text-xs font-semibold text-violet-100">Tìm card theo ảnh mẫu</h4>
                          <p className="mt-1 text-[10px] text-slate-400">
                            Dò ảnh bằng OpenCV rồi dùng OCR hiện có để lọc kết quả không có chữ trước khi hiển thị.
                          </p>
                        </div>
                        <label className={`rounded-md border border-violet-400/40 px-2.5 py-1.5 text-xs font-semibold text-violet-100 ${characterCardReferenceScanJob?.status === "running" ? "cursor-not-allowed opacity-40" : "cursor-pointer hover:bg-violet-950/50"}`}>
                          Chọn ảnh mẫu
                          <input
                            type="file"
                            accept="image/png,image/jpeg,image/webp"
                            className="sr-only"
                            disabled={characterCardReferenceScanJob?.status === "running"}
                            onChange={(event) => {
                              acceptCharacterCardReferenceFile(event.target.files?.[0] ?? null);
                              event.target.value = "";
                            }}
                          />
                        </label>
                      </div>
                      {characterCardReferencePreviewUrl ? (
                        <div className="flex items-center gap-3">
                          <img
                            src={characterCardReferencePreviewUrl}
                            alt="Ảnh mẫu card nhân vật"
                            className="max-h-24 max-w-48 rounded border border-slate-700 object-contain"
                          />
                          <div className="min-w-0 flex-1 text-[10px] text-slate-400">
                            <p className="truncate">{characterCardReferenceFile?.name || "Ảnh dán từ clipboard"}</p>
                            <button
                              type="button"
                              disabled={characterCardReferenceScanJob?.status === "running"}
                              onClick={() => {
                                setCharacterCardReferenceFile(null);
                                setCharacterCardReferenceScanJob(null);
                                setCharacterCardReferenceError(null);
                              }}
                              className="mt-1 text-rose-200 hover:text-rose-100 disabled:cursor-not-allowed disabled:opacity-40"
                            >
                              Xóa ảnh mẫu
                            </button>
                          </div>
                        </div>
                      ) : (
                        <p className="rounded-md border border-dashed border-slate-700 px-3 py-4 text-center text-[10px] text-slate-500">
                          Dán ảnh bằng Ctrl+V tại đây hoặc chọn ảnh PNG/JPEG/WebP.
                        </p>
                      )}
                      <div className="flex flex-wrap items-center gap-3">
                        <label className="flex items-center gap-2 text-[10px] text-slate-300">
                          Bỏ qua frame
                          <input
                            type="number"
                            min={0}
                            max={10000}
                            step={1}
                            value={characterCardReferenceFramesToSkip}
                            onChange={(event) => {
                              const value = Number(event.target.value);
                              if (Number.isFinite(value)) {
                                setCharacterCardReferenceFramesToSkip(Math.max(0, Math.min(10000, Math.round(value))));
                              }
                            }}
                            className="w-20 rounded-md border border-slate-700 bg-slate-950 px-2 py-1.5 text-center text-xs text-white"
                          />
                          <span className="text-slate-500">
                            ({((characterCardReferenceFramesToSkip + 1) / (job?.metadata?.frameRate || 30)).toFixed(2)} giây/mẫu)
                          </span>
                        </label>
                        <label className="flex items-center gap-2 text-[10px] text-slate-300">
                          Ngưỡng giống
                          <input
                            type="range"
                            min={0.3}
                            max={0.99}
                            step={0.01}
                            value={characterCardReferenceSimilarity}
                            onChange={(event) => setCharacterCardReferenceSimilarity(Number(event.target.value))}
                            className="w-24 accent-violet-400"
                          />
                          <span className="w-9 text-right tabular-nums">
                            {Math.round(characterCardReferenceSimilarity * 100)}%
                          </span>
                        </label>
                        {characterCardReferenceScanJob?.status === "running" ? (
                          <button
                            type="button"
                            onClick={() => void cancelCharacterCardReferenceScan()}
                            className="rounded-md border border-rose-500/30 px-2.5 py-1.5 text-xs text-rose-200 hover:bg-rose-950/40"
                          >
                            Hủy quét
                          </button>
                        ) : (
                          <button
                            type="button"
                            disabled={!job || !characterCardRegion || !characterCardReferenceFile || characterCardDrawMode}
                            onClick={() => void startCharacterCardReferenceScan()}
                            className="rounded-md bg-violet-300 px-2.5 py-1.5 text-xs font-bold text-slate-950 hover:bg-violet-200 disabled:cursor-not-allowed disabled:opacity-40"
                          >
                            Quét toàn video
                          </button>
                        )}
                      </div>
                      {characterCardReferenceScanJob?.status === "running" && (
                        <div className="space-y-1" role="status">
                          <div className="flex justify-between gap-2 text-[10px] text-slate-300">
                            <span>{characterCardReferenceScanJob.message}</span>
                            <span>{characterCardReferenceScanJob.progressPercent}%</span>
                          </div>
                          <div className="h-1 overflow-hidden rounded bg-slate-800">
                            <div
                              className="h-full bg-violet-300 transition-[width]"
                              style={{ width: `${characterCardReferenceScanJob.progressPercent}%` }}
                            />
                          </div>
                        </div>
                      )}
                      {characterCardReferenceScanJob?.status === "completed" && (
                        <p className="text-[10px] text-emerald-200" role="status">
                          {characterCardReferenceScanJob.message}
                        </p>
                      )}
                      {characterCardReferenceScanJob?.status === "error" && (
                        <p className="text-[10px] text-rose-300" role="alert">
                          {characterCardReferenceScanJob.error || characterCardReferenceScanJob.message}
                        </p>
                      )}
                      {characterCardReferenceError && (
                        <p className="text-[10px] text-rose-300" role="alert">{characterCardReferenceError}</p>
                      )}
                    </div>
                    </div>
                  </section>
                )}
                {characterCardReferenceScanJob?.status === "completed" && (
                  <div className="fixed inset-0 z-[120] flex items-center justify-center bg-slate-950/80 p-3 backdrop-blur-sm sm:p-6">
                    <section
                      role="dialog"
                      aria-modal="true"
                      aria-labelledby="character-card-reference-results-title"
                      className="flex max-h-[90vh] w-full max-w-4xl flex-col rounded-2xl border border-violet-500/30 bg-slate-900 shadow-2xl"
                    >
                      <header className="flex items-start gap-3 border-b border-slate-800 p-4">
                        <div className="min-w-0 flex-1">
                          <h3 id="character-card-reference-results-title" className="text-sm font-bold text-white">
                            Kết quả tìm card theo ảnh mẫu
                          </h3>
                          <p className="mt-1 text-[10px] text-slate-400">
                            Chọn các lần xuất hiện cần tạo card. OCR sẽ quét từ {characterCardOcrStartOffset} giây trước thời điểm khớp trong {characterCardOcrDuration} giây. Bật “Giữ OCR chạy” để tránh nạp lại model khi chọn nhiều khoảng.
                          </p>
                        </div>
                        <button
                          type="button"
                          onClick={() => {
                            setCharacterCardReferenceScanJob(null);
                            setCharacterCardReferenceSelectedIds([]);
                          }}
                          className="rounded-md p-1 text-slate-400 hover:bg-slate-800 hover:text-white"
                          aria-label="Đóng kết quả quét ảnh mẫu"
                        >
                          <X className="h-4 w-4" />
                        </button>
                      </header>
                      <div className="flex flex-wrap items-center justify-between gap-2 border-b border-slate-800 px-4 py-2">
                        <label className="flex items-center gap-2 text-xs text-slate-300">
                          <input
                            type="checkbox"
                            checked={
                              characterCardReferenceScanJob.results.length > 0 &&
                              characterCardReferenceSelectedIds.length === characterCardReferenceScanJob.results.length
                            }
                            onChange={(event) => setCharacterCardReferenceSelectedIds(
                              event.target.checked
                                ? characterCardReferenceScanJob.results.map((item) => item.id)
                                : [],
                            )}
                            className="accent-violet-400"
                          />
                          Chọn tất cả ({characterCardReferenceScanJob.results.length})
                        </label>
                        <span className="text-[10px] text-slate-500">
                          Độ giống tối thiểu {Math.round(characterCardReferenceSimilarity * 100)}%
                        </span>
                      </div>
                      <div className="min-h-0 flex-1 overflow-y-auto p-4">
                        {characterCardReferenceScanJob.results.length ? (
                          <div className="grid gap-2 sm:grid-cols-2">
                            {characterCardReferenceScanJob.results.map((item) => {
                              const checked = characterCardReferenceSelectedIds.includes(item.id);
                              return (
                                <label
                                  key={item.id}
                                  className={`flex cursor-pointer gap-3 rounded-lg border p-2.5 ${checked ? "border-violet-400/60 bg-violet-950/30" : "border-slate-800 bg-slate-950/50"}`}
                                >
                                  <input
                                    type="checkbox"
                                    checked={checked}
                                    onChange={(event) => setCharacterCardReferenceSelectedIds((current) =>
                                      event.target.checked
                                        ? [...current, item.id]
                                        : current.filter((id) => id !== item.id),
                                    )}
                                    className="mt-1 accent-violet-400"
                                    aria-label={`Chọn card tại ${formatDuration(item.time)}`}
                                  />
                                  {item.thumbnail && (
                                    <img
                                      src={item.thumbnail}
                                      alt=""
                                      className="h-20 w-32 shrink-0 rounded bg-black object-contain"
                                    />
                                  )}
                                  <span className="min-w-0 text-[10px] text-slate-300">
                                    <span className="block font-semibold text-white">
                                      {formatDuration(item.startTime)} – {formatDuration(item.endTime)}
                                    </span>
                                    <span className="mt-1 block text-slate-400">
                                      Khớp tốt nhất: {formatDuration(item.time)}
                                    </span>
                                    <span className="mt-1 block text-violet-200">
                                      Độ giống {Math.round(item.confidence * 100)}%
                                    </span>
                                  </span>
                                </label>
                              );
                            })}
                          </div>
                        ) : (
                          <p className="py-12 text-center text-sm text-slate-400">
                            Không tìm thấy kết quả phù hợp có chữ. Hãy thử giảm ngưỡng giống hoặc chọn ảnh mẫu rõ hơn.
                          </p>
                        )}
                        {characterCardOcrJob?.status === "running" && (
                          <p className="mt-3 text-xs text-amber-200" role="status">
                            {characterCardOcrJob.message} {characterCardOcrJob.progressPercent}%
                          </p>
                        )}
                        {characterCardOcrError && (
                          <p className="mt-3 text-xs text-rose-300" role="alert">{characterCardOcrError}</p>
                        )}
                      </div>
                      <footer className="flex flex-wrap items-center justify-between gap-2 border-t border-slate-800 p-4">
                        <button
                          type="button"
                          onClick={() => {
                            setCharacterCardReferenceScanJob(null);
                            setCharacterCardReferenceSelectedIds([]);
                          }}
                          className="rounded-md border border-slate-700 px-3 py-2 text-xs text-slate-300 hover:bg-slate-800"
                        >
                          Đóng
                        </button>
                        <button
                          type="button"
                          disabled={
                            !characterCardReferenceSelectedIds.length ||
                            characterCardOcrJob?.status === "running" ||
                            characterCardOcrJob?.status === "queued"
                          }
                          onClick={() => {
                            const selectedOccurrences = characterCardReferenceScanJob.results
                              .filter((item) => characterCardReferenceSelectedIds.includes(item.id))
                              .map(({ startTime, endTime, time }) => ({ startTime, endTime, time }));
                            void createCharacterCardsAutomatically(selectedOccurrences);
                          }}
                          className="rounded-md bg-violet-300 px-3 py-2 text-xs font-bold text-slate-950 hover:bg-violet-200 disabled:cursor-not-allowed disabled:opacity-40"
                        >
                          Tạo card từ {characterCardReferenceSelectedIds.length} kết quả đã chọn
                        </button>
                      </footer>
                    </section>
                  </div>
                )}
                <p className={`text-[10px] leading-relaxed text-slate-500 ${videoWorkspaceTab === "preview" ? "" : "hidden"}`}>
                  Video là mốc thời gian chính; nguồn video được làm im lặng
                  trong preview. Các track chưa có hoặc chưa xác minh sẽ không
                  thể chọn.
                </p>
              </div>
              {videoWorkspaceTab === "preview" && (
                <div className="space-y-3">
                  <div
                    role="tablist"
                    aria-label="Timeline video dubbing"
                    className="flex gap-1 rounded-xl border border-slate-800 bg-slate-950/70 p-1"
                  >
                    <button
                      type="button"
                      role="tab"
                      aria-selected={timelineWorkspaceTab === "subtitle"}
                      onClick={() => setTimelineWorkspaceTab("subtitle")}
                      className={`flex-1 rounded-lg px-3 py-2 text-xs font-semibold ${timelineWorkspaceTab === "subtitle" ? "bg-cyan-400 text-slate-950" : "text-slate-300 hover:bg-slate-800"}`}
                    >
                      Timeline phụ đề
                    </button>
                    <button
                      type="button"
                      role="tab"
                      aria-selected={timelineWorkspaceTab === "audio"}
                      onClick={() => setTimelineWorkspaceTab("audio")}
                      className={`flex-1 rounded-lg px-3 py-2 text-xs font-semibold ${timelineWorkspaceTab === "audio" ? "bg-violet-400 text-slate-950" : "text-slate-300 hover:bg-slate-800"}`}
                    >
                      Timeline âm thanh
                    </button>
                    <button
                      type="button"
                      role="tab"
                      aria-selected={timelineWorkspaceTab === "subtitle-audio"}
                      onClick={() => setTimelineWorkspaceTab("subtitle-audio")}
                      className={`flex-1 rounded-lg px-3 py-2 text-xs font-semibold ${timelineWorkspaceTab === "subtitle-audio" ? "bg-violet-400 text-slate-950" : "text-slate-300 hover:bg-slate-800"}`}
                    >
                      Subtitle-Audio
                    </button>
                  </div>
                  {timelineWorkspaceTab === "subtitle-audio" && (
                    <section className="space-y-3 rounded-xl border border-violet-500/25 bg-slate-950/70 p-3">
                      <div className="flex flex-wrap items-center justify-between gap-3">
                        <div>
                          <h4 className="text-xs font-semibold text-white">Subtitle-Audio</h4>
                          <p className="mt-1 text-[10px] text-slate-400">
                            Sửa chữ không tự tạo lại audio; tạo lại Master sẽ dùng audio hiện có.
                          </p>
                        </div>
                        <div className="flex items-center gap-2">
                          <span className="text-[10px] text-slate-400">
                            {activeSubtitleAudioFilterCount
                              ? `${filteredSubtitleAudioInput.length}/${subtitleAudioInput.length} câu`
                              : `${subtitleAudioInput.length} câu`}
                          </span>
                          <div className="relative">
                            <button
                              type="button"
                              aria-expanded={subtitleAudioFilterOpen}
                              aria-haspopup="dialog"
                              onClick={() => setSubtitleAudioFilterOpen((open) => !open)}
                              className={`inline-flex items-center gap-1.5 rounded-lg border px-2.5 py-2 text-xs font-semibold ${activeSubtitleAudioFilterCount ? "border-cyan-400/50 bg-cyan-950/30 text-cyan-100" : "border-slate-700 text-slate-300 hover:bg-slate-800"}`}
                            >
                              <Filter className="h-3.5 w-3.5" />
                              Lọc
                              {activeSubtitleAudioFilterCount > 0 && (
                                <span className="rounded-full bg-cyan-300 px-1.5 text-[10px] font-bold text-slate-950">
                                  {activeSubtitleAudioFilterCount}
                                </span>
                              )}
                            </button>
                            {subtitleAudioFilterOpen && (
                              <div
                                role="dialog"
                                aria-label="Lọc danh sách phụ đề"
                                className="absolute right-0 top-full z-30 mt-2 w-[min(22rem,calc(100vw-2rem))] space-y-3 rounded-xl border border-slate-700 bg-slate-900 p-3 shadow-2xl"
                              >
                                <div className="flex items-center justify-between gap-2">
                                  <h5 className="text-xs font-semibold text-white">Lọc câu phụ đề</h5>
                                  <button
                                    type="button"
                                    onClick={() => setSubtitleAudioFilterOpen(false)}
                                    className="rounded p-1 text-slate-400 hover:bg-slate-800 hover:text-white"
                                    aria-label="Đóng bộ lọc"
                                  >
                                    <X className="h-3.5 w-3.5" />
                                  </button>
                                </div>
                                <p className="text-[10px] text-slate-400">
                                  Hiện các câu khớp với bất kỳ tiêu chí nào đang bật.
                                </p>
                                <label className="flex items-center gap-2 text-xs text-slate-200">
                                  <input
                                    type="checkbox"
                                    checked={subtitleAudioShortFilterEnabled}
                                    onChange={(event) => setSubtitleAudioShortFilterEnabled(event.target.checked)}
                                    className="accent-cyan-400"
                                  />
                                  Câu ngắn, tối đa {subtitleAudioMaxCharacterCount} ký tự
                                </label>
                                <div className={`flex items-center gap-3 pl-6 ${subtitleAudioShortFilterEnabled ? "" : "opacity-50"}`}>
                                  <span className="text-[10px] text-slate-500">0</span>
                                  <input
                                    type="range"
                                    min={0}
                                    max={20}
                                    step={1}
                                    value={subtitleAudioMaxCharacterCount}
                                    disabled={!subtitleAudioShortFilterEnabled}
                                    onChange={(event) => setSubtitleAudioMaxCharacterCount(Number(event.target.value))}
                                    className="w-full accent-cyan-400"
                                    aria-label="Số ký tự tối đa của câu ngắn"
                                  />
                                  <span className="w-5 text-right text-[10px] tabular-nums text-slate-400">{subtitleAudioMaxCharacterCount}</span>
                                </div>
                                <label className="flex items-center gap-2 text-xs text-slate-200">
                                  <input
                                    type="checkbox"
                                    checked={subtitleAudioSpecialCharactersFilterEnabled}
                                    onChange={(event) => setSubtitleAudioSpecialCharactersFilterEnabled(event.target.checked)}
                                    className="accent-cyan-400"
                                  />
                                  Câu chỉ có ký tự đặc biệt, không có chữ hoặc số
                                </label>
                                <label className="flex items-center gap-2 text-xs text-slate-200">
                                  <input
                                    type="checkbox"
                                    checked={subtitleAudioSimilarFilterEnabled}
                                    onChange={(event) => setSubtitleAudioSimilarFilterEnabled(event.target.checked)}
                                    className="accent-cyan-400"
                                  />
                                  Câu liền kề giống nhau trên 80%
                                </label>
                                <div className="flex justify-end border-t border-slate-800 pt-2">
                                  <button
                                    type="button"
                                    onClick={() => {
                                      setSubtitleAudioShortFilterEnabled(false);
                                      setSubtitleAudioSpecialCharactersFilterEnabled(false);
                                      setSubtitleAudioSimilarFilterEnabled(false);
                                    }}
                                    disabled={!activeSubtitleAudioFilterCount}
                                    className="rounded-md px-2 py-1 text-[10px] font-semibold text-cyan-200 hover:bg-slate-800 disabled:cursor-not-allowed disabled:opacity-40"
                                  >
                                    Xóa bộ lọc
                                  </button>
                                </div>
                              </div>
                            )}
                          </div>
                          <button
                            type="button"
                            onClick={() => void rebuildMasterFromSubtitleAudio()}
                            disabled={!subtitleAudioInput.length || subtitleAudioSyncing || subtitleAudioMasterBusy || Boolean(subtitleAudioRegeneratingId) || isMasterGenerating || isMediaProcessing}
                            className="inline-flex items-center gap-2 rounded-lg bg-violet-400 px-3 py-2 text-xs font-bold text-slate-950 hover:bg-violet-300 disabled:cursor-not-allowed disabled:opacity-40"
                          >
                            {subtitleAudioMasterBusy ? <LoaderCircle className="h-3.5 w-3.5 animate-spin" /> : <RefreshCw className="h-3.5 w-3.5" />}
                            Tạo lại Master
                          </button>
                        </div>
                      </div>
                      {(subtitleAudioError || subtitleAudioSyncing) && (
                        <p role={subtitleAudioError ? "alert" : "status"} className={`rounded-lg border px-3 py-2 text-[11px] ${subtitleAudioError ? "border-rose-500/30 bg-rose-950/30 text-rose-200" : "border-slate-700 bg-slate-900 text-slate-400"}`}>
                          {subtitleAudioError || "Đang đồng bộ danh sách câu phụ đề…"}
                        </p>
                      )}
                      <div className="overflow-hidden rounded-lg border border-cyan-500/30 bg-cyan-950/10">
                        <div
                          role="row"
                          aria-label="Câu phụ đề đang nói"
                          className="grid w-full grid-cols-[3.5rem_minmax(0,1fr)_max-content_max-content] text-slate-300"
                        >
                          <div role="cell" className="px-2 py-1.5 font-mono text-cyan-300">
                            {activeSubtitleAudioItem?.index ?? "—"}
                          </div>
                          <div role="cell" className="min-w-0 px-2 py-1">
                            <div className="flex min-w-0 items-center gap-2">
                              <span className="shrink-0 rounded bg-cyan-500/10 px-1.5 py-1 text-[9px] font-semibold text-cyan-200">
                                Đang nói
                              </span>
                              <input
                                type="text"
                                aria-label="Nội dung phụ đề đang nói"
                                placeholder="Không có câu phụ đề tại vị trí hiện tại"
                                value={activeSubtitleAudioItem
                                  ? subtitleAudioDrafts[activeSubtitleAudioItem.id] ?? activeSubtitleAudioItem.text
                                  : ""}
                                onChange={(event) => {
                                  if (!activeSubtitleAudioItem) return;
                                  setSubtitleAudioDrafts((current) => ({
                                    ...current,
                                    [activeSubtitleAudioItem.id]: event.target.value,
                                  }));
                                }}
                                onBlur={() => {
                                  if (activeSubtitleAudioItem) {
                                    commitSubtitleAudioCueText(activeSubtitleAudioItem.id);
                                  }
                                }}
                                disabled={!activeSubtitleAudioItem || subtitleAudioSyncing || Boolean(subtitleAudioRegeneratingId) || subtitleAudioMasterBusy || isMasterGenerating || isMediaProcessing}
                                className="h-8 min-w-0 flex-1 rounded-md border border-cyan-500/30 bg-slate-950 px-2 text-xs text-slate-100 outline-none focus:border-cyan-300 disabled:opacity-60"
                              />
                              {activeSubtitleAudioItem && (
                                <span className="shrink-0 text-[10px] text-slate-500">
                                  {formatDuration(activeSubtitleAudioItem.startTime)} – {formatDuration(activeSubtitleAudioItem.endTime)}
                                </span>
                              )}
                            </div>
                          </div>
                          <div role="cell" className="whitespace-nowrap px-2 py-1">
                            <span className={`inline-flex items-center gap-1.5 text-[10px] ${activeSubtitleAudioRow?.status === "failed" ? "text-rose-300" : "text-slate-500"}`}>
                              {activeSubtitleAudioRow?.status === "generating" && <LoaderCircle className="h-3 w-3 animate-spin" />}
                              {activeSubtitleAudioRow?.status === "failed"
                                ? activeSubtitleAudioRow.error || "Tạo audio thất bại"
                                : activeSubtitleAudioRow?.status === "generating"
                                  ? "Đang tạo audio…"
                                  : activeSubtitleAudioRow?.audioUrl
                                    ? "Đã có audio"
                                    : activeSubtitleAudioItem
                                      ? "Chưa có audio"
                                      : "—"}
                            </span>
                          </div>
                          <div role="cell" className="px-2 py-1" />
                          <div role="cell" className="col-span-4 flex flex-wrap items-center gap-1.5 border-t border-cyan-500/15 px-2 py-1.5">
                            <button
                              type="button"
                              onClick={() => previousSubtitleAudioItem && seekSubtitleTimeline(previousSubtitleAudioItem.startTime)}
                              disabled={!previousSubtitleAudioItem || subtitleAudioSyncing || isMediaProcessing}
                              className="rounded-md border border-slate-700 px-2 py-1 text-[10px] font-semibold text-slate-200 hover:border-cyan-500/50 disabled:cursor-not-allowed disabled:opacity-40"
                              title="Nhảy đến câu phụ đề trước"
                            >
                              Câu Trước
                            </button>
                            <button
                              type="button"
                              onClick={() => nextSubtitleAudioItem && seekSubtitleTimeline(nextSubtitleAudioItem.startTime)}
                              disabled={!nextSubtitleAudioItem || subtitleAudioSyncing || isMediaProcessing}
                              className="rounded-md border border-slate-700 px-2 py-1 text-[10px] font-semibold text-slate-200 hover:border-cyan-500/50 disabled:cursor-not-allowed disabled:opacity-40"
                              title="Nhảy đến câu phụ đề sau"
                            >
                              Câu Sau
                            </button>
                            <span className="mx-1 h-5 border-l border-slate-700" aria-hidden="true" />
                            <span className="text-[10px] text-slate-400" title="Điều chỉnh điểm bắt đầu">Trước</span>
                            <button
                              type="button"
                              onClick={() => activeSubtitleAudioItem && adjustSubtitleAudioCueTiming(activeSubtitleAudioItem.id, "start", -1)}
                              disabled={!activeSubtitleAudioItem || subtitleAudioSyncing || Boolean(subtitleAudioRegeneratingId) || subtitleAudioMasterBusy || isMasterGenerating || isMediaProcessing}
                              aria-label={`Mở rộng phía trước ${subtitleAudioTimingStepMs} mili giây`}
                              title="Mở rộng thời gian phía trước"
                              className="rounded-md border border-cyan-500/30 px-2 py-1 text-xs font-bold text-cyan-200 hover:bg-cyan-950/40 disabled:cursor-not-allowed disabled:opacity-40"
                            >
                              +
                            </button>
                            <button
                              type="button"
                              onClick={() => activeSubtitleAudioItem && adjustSubtitleAudioCueTiming(activeSubtitleAudioItem.id, "start", 1)}
                              disabled={!activeSubtitleAudioItem || subtitleAudioSyncing || Boolean(subtitleAudioRegeneratingId) || subtitleAudioMasterBusy || isMasterGenerating || isMediaProcessing}
                              aria-label={`Thu gọn phía trước ${subtitleAudioTimingStepMs} mili giây`}
                              title="Thu gọn thời gian phía trước"
                              className="rounded-md border border-slate-700 px-2 py-1 text-xs font-bold text-slate-200 hover:bg-slate-800 disabled:cursor-not-allowed disabled:opacity-40"
                            >
                              −
                            </button>
                            <input
                              type="number"
                              min={1}
                              step={1}
                              value={subtitleAudioTimingStepMs}
                              onChange={(event) => {
                                const value = Number(event.target.value);
                                if (Number.isFinite(value) && value >= 1) {
                                  setSubtitleAudioTimingStepMs(Math.round(value));
                                }
                              }}
                              aria-label="Bước chỉnh thời gian câu đang nói (mili giây)"
                              className="h-7 w-16 rounded border border-slate-700 bg-slate-950 px-1 text-center text-[10px] tabular-nums text-slate-200"
                            />
                            <span className="-ml-1 text-[10px] text-slate-400">ms</span>
                            <span className="mx-1 h-5 border-l border-slate-700" aria-hidden="true" />
                            <span className="text-[10px] text-slate-400" title="Điều chỉnh điểm kết thúc">Sau</span>
                            <button
                              type="button"
                              onClick={() => activeSubtitleAudioItem && adjustSubtitleAudioCueTiming(activeSubtitleAudioItem.id, "end", -1)}
                              disabled={!activeSubtitleAudioItem || subtitleAudioSyncing || Boolean(subtitleAudioRegeneratingId) || subtitleAudioMasterBusy || isMasterGenerating || isMediaProcessing}
                              aria-label={`Thu gọn phía sau ${subtitleAudioTimingStepMs} mili giây`}
                              title="Thu gọn thời gian phía sau"
                              className="rounded-md border border-slate-700 px-2 py-1 text-xs font-bold text-slate-200 hover:bg-slate-800 disabled:cursor-not-allowed disabled:opacity-40"
                            >
                              −
                            </button>
                            <button
                              type="button"
                              onClick={() => activeSubtitleAudioItem && adjustSubtitleAudioCueTiming(activeSubtitleAudioItem.id, "end", 1)}
                              disabled={!activeSubtitleAudioItem || subtitleAudioSyncing || Boolean(subtitleAudioRegeneratingId) || subtitleAudioMasterBusy || isMasterGenerating || isMediaProcessing}
                              aria-label={`Mở rộng phía sau ${subtitleAudioTimingStepMs} mili giây`}
                              title="Mở rộng thời gian phía sau"
                              className="rounded-md border border-cyan-500/30 px-2 py-1 text-xs font-bold text-cyan-200 hover:bg-cyan-950/40 disabled:cursor-not-allowed disabled:opacity-40"
                            >
                              +
                            </button>
                            <span className="mx-1 h-5 border-l border-slate-700" aria-hidden="true" />
                            {activeSubtitleAudioRow?.audioUrl && (
                              <button
                                type="button"
                                onClick={() => void playSubtitleAudio(activeSubtitleAudioRow)}
                                aria-label={subtitleAudioPlayingId === activeSubtitleAudioRow.id ? "Dừng audio câu đang nói" : "Phát audio câu đang nói"}
                                title={subtitleAudioPlayingId === activeSubtitleAudioRow.id ? "Dừng phát" : "Phát audio"}
                                className="inline-flex h-7 w-7 shrink-0 items-center justify-center rounded-md border border-violet-500/30 bg-violet-500/10 text-violet-200 hover:bg-violet-500/20"
                              >
                                {subtitleAudioPlayingId === activeSubtitleAudioRow.id
                                  ? <Pause className="h-3.5 w-3.5" />
                                  : <Play className="h-3.5 w-3.5" />}
                              </button>
                            )}
                            <button
                              type="button"
                              onClick={() => {
                                if (activeSubtitleAudio) {
                                  regenerateSubtitleAudioWithDraft(activeSubtitleAudio);
                                }
                              }}
                              disabled={!activeSubtitleAudio || !selectedVoice || subtitleAudioSyncing || Boolean(subtitleAudioRegeneratingId) || subtitleAudioMasterBusy || isMasterGenerating || isMediaProcessing}
                              className="inline-flex items-center gap-1 rounded-md border border-violet-500/30 bg-violet-500/10 px-2 py-1 text-[10px] font-semibold text-violet-200 hover:bg-violet-500/20 disabled:cursor-not-allowed disabled:opacity-40"
                              title="Tạo lại TTS cho câu đang nói"
                            >
                              {subtitleAudioRegeneratingId === activeSubtitleAudioItem?.id
                                ? <LoaderCircle className="h-3 w-3 animate-spin" />
                                : <RefreshCw className="h-3 w-3" />}
                              Tạo lại
                            </button>
                          </div>
                        </div>
                      </div>
                      <div className="max-h-[70vh] overflow-auto rounded-lg border border-slate-800">
                        <div role="table" aria-label="Danh sách phụ đề và audio" className="w-full text-xs">
                          <div role="rowgroup">
                            <div role="row" className="sticky top-0 z-10 grid w-full grid-cols-[3.5rem_minmax(0,1fr)_max-content_max-content] bg-slate-900 text-[10px] uppercase tracking-wider text-slate-500">
                              <div role="columnheader" className="px-2 py-2">#</div>
                              <div role="columnheader" className="px-2 py-2">Phụ đề</div>
                              <div role="columnheader" className="whitespace-nowrap px-2 py-2">Audio</div>
                              <div role="columnheader" className="whitespace-nowrap px-2 py-2 text-right">Tác vụ</div>
                            </div>
                          </div>
                          <div role="rowgroup" className="divide-y divide-slate-800/80">
                            {filteredSubtitleAudioInput.length ? filteredSubtitleAudioInput.map((item) => {
                              const audio = subtitleAudioItems.find((entry) => entry.id === item.id);
                              const editedAfterAudio = Boolean(audio?.audioUrl && audio.generatedText !== item.text);
                              const subtitleItem: SubtitleItem = {
                                ...item,
                                targetDuration: Math.max(0.1, item.endTime - item.startTime),
                                status: "pending",
                              };
                              const subtitleCueIndex = previewSubtitleCues.findIndex(
                                (cue) => cue.id === item.id,
                              );
                              const combineDisabled =
                                subtitleCueIndex <= 0 ||
                                subtitleAudioSyncing ||
                                Boolean(subtitleAudioRegeneratingId) ||
                                subtitleAudioMasterBusy ||
                                isMasterGenerating ||
                                isMediaProcessing;
                              return (
                                <div key={item.id} role="row" className="grid w-full grid-cols-[3.5rem_minmax(0,1fr)_max-content_max-content] text-slate-300">
                                  <div
                                    role="cell"
                                    onClick={() => seekSubtitleTimeline(item.startTime)}
                                    title={`Tua preview đến câu ${item.index}`}
                                    className="cursor-pointer px-2 py-1.5 font-mono text-slate-500 hover:bg-cyan-950/20"
                                  >
                                    {item.index}
                                  </div>
                                  <div
                                    role="cell"
                                    onClick={() => seekSubtitleTimeline(item.startTime)}
                                    title={`Tua preview đến câu ${item.index}`}
                                    className="min-w-0 cursor-pointer px-2 py-1 hover:bg-cyan-950/20"
                                  >
                                    <div className="flex min-w-0 items-center gap-2">
                                    <input
                                      type="text"
                                      aria-label={`Nội dung phụ đề câu ${item.index}`}
                                      value={subtitleAudioDrafts[item.id] ?? item.text}
                                      onChange={(event) => setSubtitleAudioDrafts((current) => ({ ...current, [item.id]: event.target.value }))}
                                      onBlur={() => commitSubtitleAudioCueText(item.id)}
                                      disabled={subtitleAudioSyncing || Boolean(subtitleAudioRegeneratingId) || subtitleAudioMasterBusy || isMasterGenerating || isMediaProcessing}
                                      className="h-8 min-w-0 flex-1 rounded-md border border-slate-700 bg-slate-950 px-2 text-xs text-slate-100 outline-none focus:border-violet-400"
                                    />
                                    <span className="shrink-0 text-[10px] text-slate-500">
                                      {formatDuration(item.startTime)} – {formatDuration(item.endTime)}
                                    </span>
                                    {editedAfterAudio && (
                                      <span className="shrink-0 text-[10px] text-amber-300" title="Audio vẫn dùng nội dung trước">
                                        Audio cũ
                                      </span>
                                    )}
                                    </div>
                                  </div>
                                  <div role="cell" className="whitespace-nowrap px-2 py-1">
                                    {audio?.audioUrl ? (
                                      <div className="flex items-center gap-2">
                                        <button
                                          type="button"
                                          onClick={() => void playSubtitleAudio(audio)}
                                          aria-label={subtitleAudioPlayingId === item.id ? `Dừng audio câu ${item.index}` : `Phát audio câu ${item.index}`}
                                          title={subtitleAudioPlayingId === item.id ? "Dừng phát" : "Phát audio"}
                                          className="inline-flex h-8 w-8 shrink-0 items-center justify-center rounded-md border border-violet-500/30 bg-violet-500/10 text-violet-200 hover:bg-violet-500/20"
                                        >
                                          {subtitleAudioPlayingId === item.id
                                            ? <Pause className="h-3.5 w-3.5" />
                                            : <Play className="h-3.5 w-3.5" />}
                                        </button>
                                        {audio.status === "failed" && <span className="max-w-36 truncate text-[10px] text-rose-300" title={audio.error}>{audio.error || "Tạo audio thất bại"}</span>}
                                      </div>
                                    ) : (
                                      <span className={`inline-flex items-center gap-1.5 text-[10px] ${audio?.status === "failed" ? "text-rose-300" : "text-slate-500"}`}>
                                        {audio?.status === "generating" && <LoaderCircle className="h-3 w-3 animate-spin" />}
                                        {audio?.status === "failed" ? audio.error || "Tạo audio thất bại" : audio?.status === "generating" ? "Đang tạo audio…" : "Chưa có audio"}
                                      </span>
                                    )}
                                  </div>
                                  <div role="cell" className="whitespace-nowrap px-2 py-1 text-right">
                                    <div className="flex flex-nowrap justify-end gap-1">
                                      <button
                                        type="button"
                                        onClick={() => regenerateSubtitleAudioWithDraft(subtitleItem)}
                                        disabled={!selectedVoice || subtitleAudioSyncing || Boolean(subtitleAudioRegeneratingId) || subtitleAudioMasterBusy || isMasterGenerating || isMediaProcessing}
                                        className="inline-flex items-center gap-1 rounded-md border border-violet-500/30 bg-violet-500/10 px-1.5 py-1 text-[9px] font-semibold text-violet-200 hover:bg-violet-500/20 disabled:opacity-40"
                                        title={`Tạo lại audio câu ${item.index}`}
                                      >
                                        {subtitleAudioRegeneratingId === item.id ? <LoaderCircle className="h-3 w-3 animate-spin" /> : <RefreshCw className="h-3 w-3" />}Tạo lại
                                      </button>
                                      <button
                                        type="button"
                                        onClick={() => combineSubtitleAudioCueAbove(item.id, "merge")}
                                        disabled={combineDisabled}
                                        className="rounded-md border border-amber-500/30 px-1.5 py-1 text-[9px] font-semibold text-amber-200 hover:bg-amber-950/30 disabled:cursor-not-allowed disabled:opacity-40"
                                        title="Gộp với câu phía trên, giữ nội dung câu phía trên và mở rộng thời gian"
                                      >
                                        Merge above
                                      </button>
                                      <button
                                        type="button"
                                        onClick={() => combineSubtitleAudioCueAbove(item.id, "join")}
                                        disabled={combineDisabled}
                                        className="rounded-md border border-cyan-500/30 px-1.5 py-1 text-[9px] font-semibold text-cyan-200 hover:bg-cyan-950/30 disabled:cursor-not-allowed disabled:opacity-40"
                                        title="Nối nội dung với câu phía trên và mở rộng thời gian"
                                      >
                                        Join above
                                      </button>
                                      <button
                                        type="button"
                                        onClick={() => deleteSubtitleAudioCue(item.id)}
                                        disabled={subtitleAudioSyncing || Boolean(subtitleAudioRegeneratingId) || subtitleAudioMasterBusy || isMasterGenerating || isMediaProcessing}
                                        className="inline-flex items-center gap-1 rounded-md border border-rose-500/30 bg-rose-500/10 px-1.5 py-1 text-[9px] font-semibold text-rose-200 hover:bg-rose-500/20 disabled:opacity-40"
                                        title={`Xóa câu ${item.index} và audio`}
                                      >
                                        <Trash2 className="h-3 w-3" />Xóa
                                      </button>
                                    </div>
                                  </div>
                                </div>
                              );
                            }                            ) : (
                              <div role="row" className="grid w-full grid-cols-[3.5rem_minmax(0,1fr)_max-content_max-content]">
                                <div role="cell" className="col-span-4 px-4 py-10 text-center text-xs text-slate-500">
                                  {subtitleAudioInput.length
                                    ? "Không có câu nào khớp bộ lọc hiện tại."
                                    : "Chưa có câu phụ đề để tạo audio."}
                                </div>
                              </div>
                            )}
                          </div>
                        </div>
                      </div>
                    </section>
                  )}
                  {timelineWorkspaceTab === "subtitle" && (
                <section className="space-y-3 rounded-xl border border-slate-800 bg-slate-950/60 p-3">
                  <div className="flex flex-wrap items-center justify-between gap-3">
                    <div>
                      <h4 className="text-xs font-semibold text-white">Timeline phụ đề</h4>
                      <p className="mt-1 text-[10px] text-slate-500">Khi phát, timeline bám theo video; khi dừng, bấm timeline để di chuyển playhead riêng · Ctrl+C/V sao chép/dán tại playhead · Delete xóa cue · Ctrl+cuộn để zoom vào playhead · Shift+Z fit toàn timeline · Shift+cuộn để cuộn ngang</p>
                    </div>
                    <div className="flex items-center gap-2 text-[10px] text-slate-400">
                      <span>{previewSubtitleCues.length} câu</span>
                      <button type="button" disabled={!job} onClick={() => {
                        const duration = Math.max(0.1, job?.metadata?.durationSeconds || subtitleTimelineDuration);
                        const startTime = Math.min(subtitleTimelineCursor, Math.max(0, duration - 0.1));
                        const cue = {
                          startTime,
                          endTime: Math.min(duration, startTime + 3),
                          text: "Câu phụ đề mới",
                        };
                        setSelectedSubtitleCue(previewSubtitleCues.length);
                        setSubtitlesEnabled(true);
                        updatePreviewSubtitleCues((cues) => [...cues, cue]);
                      }} className="inline-flex items-center gap-1 rounded-md border border-cyan-500/30 px-2 py-1 text-cyan-200 hover:bg-cyan-950/40 disabled:cursor-not-allowed disabled:opacity-40"><Plus className="h-3 w-3" />Câu</button>
                      <button
                        type="button"
                        onClick={() => {
                          const nextNumber = textTracks.length + 1;
                          const track = { id: `text-track-${crypto.randomUUID()}`, name: `TEXT ${nextNumber}` };
                          setTextTracks((tracks) => [...tracks, track]);
                          setActiveTextTrackId(track.id);
                        }}
                        className="inline-flex items-center gap-1 rounded-md border border-violet-500/30 px-2 py-1 text-violet-200 hover:bg-violet-950/40"
                      >
                        <Plus className="h-3 w-3" />Timeline
                      </button>
                      <button
                        type="button"
                        disabled={!textTracks.some((track) => track.id === activeTextTrackId)}
                        onClick={deleteActiveTextTrack}
                        title="Xóa timeline đang chọn và các clip trên timeline đó"
                        aria-label="Xóa timeline đang chọn"
                        className="inline-flex items-center gap-1 rounded-md border border-rose-500/30 px-2 py-1 text-rose-200 hover:bg-rose-950/30 disabled:cursor-not-allowed disabled:opacity-40"
                      >
                        <Trash2 className="h-3 w-3" />Xóa timeline
                      </button>
                      <button
                        type="button"
                        disabled={!job || !textTracks.length}
                        onClick={() => addTextOverlayToTrack()}
                        className="inline-flex items-center gap-1 rounded-md border border-violet-500/30 px-2 py-1 text-violet-200 hover:bg-violet-950/40 disabled:cursor-not-allowed disabled:opacity-40"
                      >
                        <Plus className="h-3 w-3" />Text
                      </button>
                      <button
                        type="button"
                        disabled={!job || !textTracks.length}
                        onClick={() => addTextOverlayToTrack("character-card")}
                        className="inline-flex items-center gap-1 rounded-md border border-amber-500/30 px-2 py-1 text-amber-200 hover:bg-amber-950/40 disabled:cursor-not-allowed disabled:opacity-40"
                      >
                        <Plus className="h-3 w-3" />Card nhân vật
                      </button>
                      <button
                        type="button"
                        disabled={!job || !job.metadata || isMediaProcessing}
                        onClick={() => void saveEndSceneForCurrentVideo(!endSceneEnabled)}
                        className="inline-flex items-center gap-1 rounded-md border border-orange-500/30 px-2 py-1 text-orange-200 hover:bg-orange-950/30 disabled:cursor-not-allowed disabled:opacity-40"
                      >
                        {endSceneEnabled ? "Bỏ End Scene" : "Add End Scene"}
                      </button>
                      <button
                        type="button"
                        onClick={fitSubtitleTimelineToPanel}
                        title="Fit timeline vừa panel và cuộn về đầu (Shift+Z)"
                        aria-label="Fit timeline vừa panel và cuộn về đầu"
                        className="rounded-md border border-slate-700 px-2 py-1 text-slate-300 hover:border-cyan-500/50"
                      >
                        Fit
                      </button>
                      <label className="flex items-center gap-2">Zoom
                        <input type="range" min={subtitleTimelineMinZoom} max={180} step="any" value={subtitleTimelineZoom} onChange={(event) => changeSubtitleTimelineZoom(Number(event.target.value))} className="w-20 accent-cyan-400" aria-label="Zoom timeline phụ đề" />
                      </label>
                    </div>
                  </div>
                  {previewSubtitleCues.length > 0 && (
                    <div className="flex flex-wrap items-center gap-x-4 gap-y-2 rounded-lg border border-slate-800 bg-slate-950/50 px-2.5 py-2 text-[10px] text-slate-400">
                      {renderSubtitleTimingAdjustment("start", "Bắt đầu")}
                      {renderSubtitleTimingAdjustment("end", "Kết thúc")}
                      {renderSubtitleTimingAdjustment("move", "Di chuyển")}
                      <span className="text-slate-500">
                        Chỉ kéo dài vào khoảng trống, không chồng lấn phụ đề kế bên
                      </span>
                    </div>
                  )}
                  {previewSubtitleCues.length === 0 && textTracks.length === 0 && !endSceneEnabled ? (
                    <p className="rounded-lg border border-dashed border-slate-700 p-4 text-xs text-slate-500">Chọn file SRT để tạo các clip phụ đề trên timeline.</p>
                  ) : (
                    <div
                      ref={subtitleTimelineScrollRef}
                      data-video-dubbing-timeline
                      tabIndex={0}
                      aria-label="Timeline phụ đề và card nhân vật"
                      className="max-h-64 overflow-auto overscroll-contain rounded-lg border border-slate-800 bg-slate-900/50"
                    >
                      <div style={{ width: `${subtitleTimelineWidth}px` }}>
                        <div
                          className="relative h-7 cursor-crosshair border-b border-slate-700 bg-slate-950/80"
                          onClick={(event) => {
                            setSelectedSubtitleCue(null);
                            setSelectedTextOverlay(null);
                            const bounds = event.currentTarget.getBoundingClientRect();
                            const position = Math.max(0, Math.min(1, (event.clientX - bounds.left) / bounds.width));
                            seekSubtitleTimeline(position * subtitleTimelineDuration);
                          }}
                        >
                          {subtitleTimelineTicks.map((tick) => (
                            <span key={tick} className="absolute top-1 text-[9px] tabular-nums text-slate-500" style={{ left: `${(tick / subtitleTimelineDuration) * subtitleTimelineWidth}px` }}>{formatElapsed(tick)}</span>
                          ))}
                        </div>
                        <div
                          ref={subtitleTimelineTrackRef}
                          className="relative cursor-crosshair bg-slate-950/30"
                          style={{ height: `${Math.max(54, subtitleTimelineLaneEnds.length * 34 + (endSceneEnabled ? 34 : 0) + 10)}px` }}
                          onClick={(event) => {
                            if (event.target !== event.currentTarget) return;
                            setSelectedSubtitleCue(null);
                            setSelectedTextOverlay(null);
                            const bounds = event.currentTarget.getBoundingClientRect();
                            const position = Math.max(0, Math.min(1, (event.clientX - bounds.left) / bounds.width));
                            seekSubtitleTimeline(position * subtitleTimelineDuration);
                          }}
                        >
                          {subtitleTimelineTicks.map((tick) => (
                            <span key={`grid-${tick}`} className="pointer-events-none absolute inset-y-0 border-l border-slate-800/80" style={{ left: `${(tick / subtitleTimelineDuration) * subtitleTimelineWidth}px` }} />
                          ))}
                          <span className="pointer-events-none absolute inset-y-0 z-20 border-l-2 border-rose-400" style={{ left: `${(subtitleTimelineCursor / subtitleTimelineDuration) * subtitleTimelineWidth}px` }} />
                          {subtitleTimelineItems.map(({ cue, index, lane }) => {
                            const active = cue.startTime <= subtitleTimelineCursor && cue.endTime >= subtitleTimelineCursor;
                            const left = (cue.startTime / subtitleTimelineDuration) * subtitleTimelineWidth;
                            const width = Math.max(14, ((cue.endTime - cue.startTime) / subtitleTimelineDuration) * subtitleTimelineWidth);
                            return (
                              <div
                                key={`${cue.startTime}-${cue.endTime}-${index}`}
                                role="button"
                                tabIndex={0}
                                title={`${index + 1}. ${cue.text}\n${formatDuration(cue.startTime)} – ${formatDuration(cue.endTime)}`}
                                onClick={(event) => { event.stopPropagation(); setSelectedTextOverlay(null); setSelectedSubtitleCue(index); seekSubtitleTimeline(cue.startTime); }}
                                onKeyDown={(event) => { if (event.key === "Enter" || event.key === " ") { event.preventDefault(); setSelectedSubtitleCue(index); seekSubtitleTimeline(cue.startTime); } }}
                                onPointerDown={(event) => { setSelectedTextOverlay(null); startSubtitleTimelineDrag(event, index, cue.startTime, cue.endTime, "move"); }}
                                className={`absolute z-10 flex h-7 select-none items-center overflow-hidden rounded-md border px-1 text-[9px] text-white shadow-sm ${previewSubtitleCues.length ? "cursor-grab active:cursor-grabbing" : "cursor-pointer"} ${selectedSubtitleCue === index ? "border-amber-200 bg-amber-500/80" : active ? "border-cyan-200 bg-cyan-500/80" : "border-cyan-500/50 bg-cyan-700/70 hover:bg-cyan-600/80"}`}
                                style={{ left: `${left}px`, top: `${5 + lane * 34}px`, width: `${width}px` }}
                              >
                                {previewSubtitleCues.length > 0 && <span onClick={(event) => event.stopPropagation()} onPointerDown={(event) => { setSelectedTextOverlay(null); startSubtitleTimelineDrag(event, index, cue.startTime, cue.endTime, "start"); }} className="absolute inset-y-0 left-0 z-20 w-1.5 cursor-ew-resize bg-cyan-100/80" aria-label={`Chỉnh điểm bắt đầu câu ${index + 1}`} />}
                                <span className="pointer-events-none truncate px-1">{index + 1}. {cue.text}</span>
                                {previewSubtitleCues.length > 0 && <span onClick={(event) => event.stopPropagation()} onPointerDown={(event) => { setSelectedTextOverlay(null); startSubtitleTimelineDrag(event, index, cue.startTime, cue.endTime, "end"); }} className="absolute inset-y-0 right-0 z-20 w-1.5 cursor-ew-resize bg-cyan-100/80" aria-label={`Chỉnh điểm kết thúc câu ${index + 1}`} />}
                              </div>
                            );
                          })}
                          {endSceneEnabled && job?.metadata && (
                            <div
                              role="button"
                              tabIndex={0}
                              title={`End Scene · ${formatDuration(job.metadata.durationSeconds)} – ${formatDuration(job.metadata.durationSeconds + endSceneDurationSeconds)}`}
                              onClick={(event) => {
                                event.stopPropagation();
                                seekSubtitleTimeline(job.metadata!.durationSeconds + 0.01);
                              }}
                              onKeyDown={(event) => {
                                if (event.key === "Enter" || event.key === " ") {
                                  event.preventDefault();
                                  seekSubtitleTimeline(job.metadata!.durationSeconds + 0.01);
                                }
                              }}
                              className="absolute z-10 flex h-7 cursor-pointer items-center overflow-hidden rounded-md border border-orange-300/70 bg-orange-600/80 px-2 text-[9px] font-semibold text-white"
                              style={{
                                left: `${(job.metadata.durationSeconds / subtitleTimelineDuration) * subtitleTimelineWidth}px`,
                                top: `${5 + subtitleTimelineLaneEnds.length * 34}px`,
                                width: `${Math.max(22, (endSceneDurationSeconds / subtitleTimelineDuration) * subtitleTimelineWidth)}px`,
                              }}
                            >
                              End Scene
                            </div>
                          )}
                        </div>
                        {textTracks.map((track) => (
                          <div
                            key={track.id}
                            onClick={() => {
                              setActiveTextTrackId(track.id);
                              setSelectedSubtitleCue(null);
                              setSelectedTextOverlay(null);
                            }}
                            className={`border-t border-slate-800 transition-colors ${activeTextTrackId === track.id ? "bg-violet-500/10 ring-1 ring-inset ring-violet-400/40" : "bg-violet-950/10 hover:bg-violet-500/5"}`}
                          >
                            <div className="flex h-7 items-center px-2">
                              <span className="text-[9px] font-semibold text-violet-300">{track.name}</span>
                            </div>
                            <div
                              className="relative"
                              style={{
                                height: `${Math.max(
                                  32,
                                  (textTimelineLanes.countsByTrackId[track.id] ?? 1) * 34 - 2,
                                )}px`,
                              }}
                              onClick={(event) => {
                                setActiveTextTrackId(track.id);
                                if (event.target !== event.currentTarget) return;
                                setSelectedSubtitleCue(null);
                                setSelectedTextOverlay(null);
                                const bounds = event.currentTarget.getBoundingClientRect();
                                const position = Math.max(0, Math.min(1, (event.clientX - bounds.left) / bounds.width));
                                seekSubtitleTimeline(position * subtitleTimelineDuration);
                              }}
                            >
                              <span className="pointer-events-none absolute inset-y-0 z-20 border-l-2 border-rose-400" style={{ left: `${(subtitleTimelineCursor / subtitleTimelineDuration) * subtitleTimelineWidth}px` }} />
                              {textOverlays.map((cue, index) => ({ cue, index }))
                                .filter(({ cue }) => !cue.isTitle && (cue.trackId || DEFAULT_TEXT_TRACK_ID) === track.id)
                                .map(({ cue, index }) => {
                                  const left = (cue.startTime / subtitleTimelineDuration) * subtitleTimelineWidth;
                                  const width = Math.max(18, ((cue.endTime - cue.startTime) / subtitleTimelineDuration) * subtitleTimelineWidth);
                                  const lane = textTimelineLanes.lanes[index] ?? 0;
                                  return <div key={`text-${index}`} role="button" tabIndex={0} title={`${cue.text}${cue.kind === "character-card" ? ` · ${cue.characterRole ?? ""}` : ""}\n${formatDuration(cue.startTime)} – ${formatDuration(cue.endTime)}`} onClick={(event) => { event.stopPropagation(); setActiveTextTrackId(track.id); setSelectedSubtitleCue(null); setSelectedTextOverlay(index); seekSubtitleTimeline(cue.startTime); }} onPointerDown={(event) => { setActiveTextTrackId(track.id); setSelectedSubtitleCue(null); startSubtitleTimelineDrag(event, index, cue.startTime, cue.endTime, "move", "text"); }} className={`absolute z-10 flex h-6 select-none items-center overflow-hidden rounded-md border px-1 text-[9px] text-white ${selectedTextOverlay === index ? "border-violet-200 bg-violet-500/90" : "border-violet-400/50 bg-violet-700/75"} cursor-grab active:cursor-grabbing`} style={{ left: `${left}px`, top: `${4 + lane * 34}px`, width: `${width}px` }}>
                                    <span onClick={(event) => event.stopPropagation()} onPointerDown={(event) => { event.stopPropagation(); setActiveTextTrackId(track.id); startSubtitleTimelineDrag(event, index, cue.startTime, cue.endTime, "start", "text"); }} className="absolute inset-y-0 left-0 z-20 w-1.5 cursor-ew-resize bg-violet-100/80" />
                                    <span className="pointer-events-none truncate px-1">{cue.kind === "character-card" ? `${cue.text} · ${cue.characterRole ?? ""}` : cue.text}</span>
                                    <span onClick={(event) => event.stopPropagation()} onPointerDown={(event) => { event.stopPropagation(); setActiveTextTrackId(track.id); startSubtitleTimelineDrag(event, index, cue.startTime, cue.endTime, "end", "text"); }} className="absolute inset-y-0 right-0 z-20 w-1.5 cursor-ew-resize bg-violet-100/80" />
                                  </div>;
                                })}
                            </div>
                          </div>
                        ))}
                      </div>
                    </div>
                  )}
                  {selectedSubtitleCue !== null && previewSubtitleCues[selectedSubtitleCue] && (
                    <div className="grid gap-2 rounded-lg border border-cyan-500/20 bg-cyan-950/10 p-3 sm:grid-cols-2">
                      <label className="space-y-1 text-[10px] text-slate-400 sm:col-span-2">
                        Nội dung câu {selectedSubtitleCue + 1}
                        <textarea
                          value={previewSubtitleCues[selectedSubtitleCue].text}
                          onChange={(event) => updateSelectedSubtitleCue({ text: event.target.value })}
                          rows={2}
                          className="w-full rounded-md border border-slate-700 bg-slate-950 px-2 py-1.5 text-xs text-white"
                        />
                      </label>
                      <label className="space-y-1 text-[10px] text-slate-400">
                        Bắt đầu (giây)
                        <input
                          type="number"
                          min={0}
                          max={previewSubtitleCues[selectedSubtitleCue].endTime - 0.1}
                          step={0.05}
                          value={previewSubtitleCues[selectedSubtitleCue].startTime}
                          onChange={(event) => {
                            const value = Number(event.target.value);
                            if (Number.isFinite(value)) updateSelectedSubtitleCue({
                              startTime: Math.max(0, Math.min(value, previewSubtitleCues[selectedSubtitleCue].endTime - 0.1)),
                            });
                          }}
                          className="w-full rounded-md border border-slate-700 bg-slate-950 px-2 py-1.5 text-xs text-white"
                        />
                      </label>
                      <label className="space-y-1 text-[10px] text-slate-400">
                        Kết thúc (giây)
                        <input
                          type="number"
                          min={previewSubtitleCues[selectedSubtitleCue].startTime + 0.1}
                          step={0.05}
                          value={previewSubtitleCues[selectedSubtitleCue].endTime}
                          onChange={(event) => {
                            const value = Number(event.target.value);
                            if (Number.isFinite(value)) updateSelectedSubtitleCue({
                              endTime: Math.max(previewSubtitleCues[selectedSubtitleCue].startTime + 0.1, value),
                            });
                          }}
                          className="w-full rounded-md border border-slate-700 bg-slate-950 px-2 py-1.5 text-xs text-white"
                        />
                      </label>
                      {subtitleAudioError && (
                        <p role="alert" className="rounded-md border border-rose-500/30 bg-rose-950/20 px-2 py-1.5 text-[10px] text-rose-200 sm:col-span-2">
                          {subtitleAudioError}
                        </p>
                      )}
                      <div className="flex flex-wrap items-center gap-2 sm:col-span-2">
                        <button
                          type="button"
                          onClick={() => {
                            if (selectedSubtitleCueTtsItem) {
                              void regenerateSubtitleAudio(selectedSubtitleCueTtsItem);
                            }
                          }}
                          disabled={!selectedSubtitleCueTtsItem || !selectedVoice || subtitleAudioSyncing || Boolean(subtitleAudioRegeneratingId) || subtitleAudioMasterBusy || isMasterGenerating || isMediaProcessing}
                          className="inline-flex items-center justify-center gap-1 rounded-md border border-violet-500/30 bg-violet-500/10 px-2 py-1.5 text-xs text-violet-200 hover:bg-violet-500/20 disabled:cursor-not-allowed disabled:opacity-40"
                          title="Tạo lại TTS cho câu đang chọn"
                        >
                          {subtitleAudioRegeneratingId === selectedSubtitleCueTtsItem?.id
                            ? <LoaderCircle className="h-3 w-3 animate-spin" />
                            : <RefreshCw className="h-3 w-3" />}
                          Tạo lại TTS
                        </button>
                        <button
                          type="button"
                          onClick={() => void rebuildMasterFromSubtitleAudio()}
                          disabled={!subtitleAudioInput.length || subtitleAudioSyncing || Boolean(subtitleAudioRegeneratingId) || subtitleAudioMasterBusy || isMasterGenerating || isMediaProcessing}
                          className="inline-flex items-center justify-center gap-1 rounded-md border border-violet-500/30 px-2 py-1.5 text-xs text-violet-200 hover:bg-violet-950/30 disabled:cursor-not-allowed disabled:opacity-40"
                          title="Tạo lại Master từ audio của các câu phụ đề"
                        >
                          {subtitleAudioMasterBusy || isMasterGenerating
                            ? <LoaderCircle className="h-3 w-3 animate-spin" />
                            : <RefreshCw className="h-3 w-3" />}
                          Tạo lại Master
                        </button>
                        <button
                          type="button"
                          onClick={() => {
                            updatePreviewSubtitleCues((cues) => cues.filter((_, index) => index !== selectedSubtitleCue));
                            setSelectedSubtitleCue(null);
                          }}
                          className="inline-flex items-center justify-center gap-1 rounded-md border border-rose-500/30 px-2 py-1.5 text-xs text-rose-200 hover:bg-rose-950/30"
                        >
                          <Trash2 className="h-3 w-3" />Xóa câu
                        </button>
                      </div>
                    </div>
                  )}
                  {selectedTextOverlay !== null && textOverlays[selectedTextOverlay] && !textOverlays[selectedTextOverlay].isTitle && (() => {
                    const cue = textOverlays[selectedTextOverlay];
                    const textStyleValue: TextStyleControlValue = {
                      fontFamily: cue.fontFamily,
                      fontSize: cue.fontSize,
                      bold: cue.bold,
                      underline: cue.underline ?? false,
                      italic: cue.italic,
                      textCase: cue.textCase ?? "none",
                      color: cue.color,
                      outlineEnabled: cue.outlineEnabled ?? false,
                      outlineColor: cue.outlineColor ?? "#000000",
                      outlineWidthPx: cue.outlineWidthPx ?? 2,
                      characterSpacingPx: cue.characterSpacingPx ?? 0,
                      lineSpacingPx: cue.lineSpacingPx ?? 0,
                    };
                    const cueTrackId = cue.trackId || DEFAULT_TEXT_TRACK_ID;
                    const cueTrackName = textTracks.find((track) => track.id === cueTrackId)?.name || DEFAULT_TEXT_TRACK.name;
                    const cueTrackTextCount = textOverlays.filter((item) =>
                      !item.isTitle && (item.trackId || DEFAULT_TEXT_TRACK_ID) === cueTrackId,
                    ).length;
                    return <div className="grid gap-2 rounded-lg border border-violet-500/20 bg-violet-950/10 p-3 sm:grid-cols-2 xl:grid-cols-4">
                      <div className="flex flex-wrap items-center justify-between gap-2 sm:col-span-2 xl:col-span-4">
                        <p className="text-[10px] text-violet-200">Style và vị trí chỉ áp dụng cho clip này cho đến khi nhấn Apply to All ({cueTrackName}).</p>
                        <button
                          type="button"
                          disabled={cueTrackTextCount < 2}
                          onClick={applySelectedTextOverlayToTrack}
                          className="rounded-md border border-violet-400/40 px-2.5 py-1.5 text-xs font-semibold text-violet-100 hover:bg-violet-900/40 disabled:cursor-not-allowed disabled:opacity-40"
                          title={`Áp dụng style và vị trí cho ${cueTrackTextCount} clip trong ${cueTrackName}`}
                        >
                          Apply to All
                        </button>
                      </div>
                      <label className="space-y-1 text-[10px] text-slate-400 sm:col-span-2">{cue.kind === "character-card" ? "Tên nhân vật" : "Nội dung"}<textarea value={cue.text} onChange={(event) => updateSelectedTextOverlay({ text: event.target.value })} rows={2} className="w-full rounded-md border border-slate-700 bg-slate-950 px-2 py-1.5 text-xs text-white" /></label>
                      {cue.kind === "character-card" && (
                        <>
                          <label className="space-y-1 text-[10px] text-slate-400 sm:col-span-2">Chức vụ<textarea value={cue.characterRole ?? ""} onChange={(event) => updateSelectedTextOverlay({ characterRole: event.target.value })} rows={2} className="w-full rounded-md border border-slate-700 bg-slate-950 px-2 py-1.5 text-xs text-white" /></label>
                          <label className="space-y-1 text-[10px] text-slate-400">Cỡ chữ chức vụ<div className="flex items-center gap-2"><input type="range" min={8} max={160} value={cue.characterRoleFontSize ?? Math.max(8, Math.round(cue.fontSize * 0.7))} onChange={(event) => updateSelectedTextOverlay({ characterRoleFontSize: Number(event.target.value) })} className="w-full accent-violet-400" aria-label="Cỡ chữ chức vụ" /><input type="number" min={8} max={160} value={cue.characterRoleFontSize ?? Math.max(8, Math.round(cue.fontSize * 0.7))} onChange={(event) => updateSelectedTextOverlay({ characterRoleFontSize: Math.max(8, Math.min(160, Number(event.target.value) || 8)) })} className="w-16 rounded-md border border-slate-700 bg-slate-950 px-2 py-1.5 text-center text-xs text-white" /></div></label>
                        </>
                      )}
                      <div className="sm:col-span-2 xl:col-span-4"><TextStyleControls value={textStyleValue} onChange={updateSelectedTextOverlay} fontOptions={subtitleFontOptions} /></div>
                      <label className="inline-flex items-center gap-2 text-xs text-slate-300 sm:col-span-2 xl:col-span-4">
                        <input
                          type="checkbox"
                          checked={cue.extendToVideoEnd ?? false}
                          onChange={(event) => {
                            const extendToVideoEnd = event.target.checked;
                            const duration = video?.job?.metadata?.durationSeconds;
                            updateSelectedTextOverlay({
                              extendToVideoEnd,
                              ...(extendToVideoEnd && duration
                                ? {
                                    startTime: Math.min(cue.startTime, Math.max(0, duration - 0.1)),
                                    endTime: duration,
                                  }
                                : {}),
                            });
                          }}
                          className="accent-violet-400"
                        />
                        Hiển thị đến hết video (tự căn theo thời lượng từng video trong hàng đợi)
                      </label>
                      <label className="space-y-1 text-[10px] text-slate-400">Vị trí neo<select value={cue.position} onChange={(event) => updateSelectedTextOverlay({ position: event.target.value as VideoDubbingOverlayPosition, xPercent: undefined, yPercent: undefined })} className="w-full rounded-md border border-slate-700 bg-slate-950 px-2 py-1.5 text-xs text-white">{OVERLAY_POSITION_OPTIONS.map((option) => <option key={option.value} value={option.value}>{option.label}</option>)}</select></label>
                      <label className="space-y-1 text-[10px] text-slate-400">Align<select value={cue.textAlign ?? getSubtitleTextAlignment(cue.position)} onChange={(event) => updateSelectedTextOverlay({ textAlign: event.target.value as "left" | "center" | "right" })} className="w-full rounded-md border border-slate-700 bg-slate-950 px-2 py-1.5 text-xs text-white"><option value="left">Left</option><option value="center">Center</option><option value="right">Right</option></select></label>
                      {(cue.xPercent !== undefined || cue.yPercent !== undefined) && <button type="button" onClick={() => updateSelectedTextOverlay({ xPercent: undefined, yPercent: undefined })} className="self-end rounded-md border border-violet-500/30 px-2 py-1.5 text-xs text-violet-200">Đặt lại vị trí neo</button>}
                      <label className="inline-flex items-center gap-2 text-xs text-slate-300"><input type="checkbox" checked={cue.backgroundTransparent} onChange={(event) => updateSelectedTextOverlay({ backgroundTransparent: event.target.checked })} className="accent-violet-400" />Nền trong suốt</label>
                      {!cue.backgroundTransparent && <label className="space-y-1 text-[10px] text-slate-400">Màu nền<input type="color" value={cue.backgroundColor} onChange={(event) => updateSelectedTextOverlay({ backgroundColor: event.target.value })} className="h-8 w-full rounded-md border border-slate-700 bg-slate-950" /></label>}
                      <button type="button" onClick={() => { setTextOverlays((items) => items.filter((_, index) => index !== selectedTextOverlay)); setSelectedTextOverlay(null); }} className="inline-flex items-center justify-center gap-1 rounded-md border border-rose-500/30 px-2 py-1 text-xs text-rose-200"><Trash2 className="h-3 w-3" />Xóa text</button>
                    </div>;
                  })()}
                </section>
              )}
                  {timelineWorkspaceTab === "audio" && job && (
                    <VideoDubbingAudioTimeline
                      jobId={job.id}
                      duration={job.metadata?.durationSeconds || 1}
                      currentTime={subtitleTimelineCursor}
                      zoom={subtitleTimelineZoom}
                      onZoomChange={changeSubtitleTimelineZoom}
                      onSeek={seekSubtitleTimeline}
                      vocalsAvailable={Boolean(job.separation?.vocalsSizeBytes)}
                      instrumentalAvailable={Boolean(
                        job.separation?.instrumentalSizeBytes,
                      )}
                      ttsMasterAvailable={Boolean(
                        job.masterGeneration?.sizeBytes &&
                          job.masterGeneration.durationSeconds !== undefined,
                      )}
                      ttsMasterVersion={
                        job.masterGeneration?.audioVersion ||
                        job.masterGeneration?.sizeBytes ||
                        0
                      }
                      masterEdit={job.masterEdit}
                      onSplitMaster={() => requestMasterEdit(job.id, "split")}
                      onMergeMaster={() => requestMasterEdit(job.id, "merge")}
                      onMoveMasterClip={(clips) =>
                        requestMasterEdit(job.id, "clips", clips)
                      }
                      mixerSettings={mixerSettings}
                      onToggleMute={(track) =>
                        updateMixerSetting(track, {
                          muted: !mixerSettings[track].muted,
                        })
                      }
                    />
                  )}
                </div>
              )}
              </div>

              <div className={`space-y-4 ${videoWorkspaceTab === "preview" ? "" : "hidden"}`}>

              {!hasMasterAudio && job?.metadata?.audioCodec && (
                <p className="rounded-lg border border-amber-500/25 bg-amber-950/20 p-3 text-xs text-amber-200">
                  TTS Master là tùy chọn. Nếu không có track vocals hoặc
                  instrumental đang bật, Mix Audio sẽ dùng audio gốc của video.
                </p>
              )}
              {mixerError && (
                <p className="rounded-lg border border-rose-500/30 bg-rose-950/30 p-3 text-xs text-rose-200">
                  {mixerError}
                </p>
              )}
              {previewError && (
                <p className="rounded-lg border border-rose-500/30 bg-rose-950/30 p-3 text-xs text-rose-200">
                  {previewError}
                </p>
              )}
              <div className="flex flex-wrap items-center gap-3">
                {mixerSettingsSaved ? (
                  <span className="text-[11px] text-emerald-300">
                    Cấu hình mixer đã lưu cho job
                  </span>
                ) : mixerTouchedRef.current ? (
                  <span className="text-[11px] text-slate-400">
                    Đang lưu cấu hình mixer…
                  </span>
                ) : (
                  <span className="text-[11px] text-slate-400">
                    Cấu hình mặc định · thay đổi để lưu
                  </span>
                )}
              </div>

              {hasFinalMix && job && (
                <div className="space-y-2 rounded-xl border border-emerald-500/25 bg-emerald-950/20 p-3.5">
                  <p className="text-xs font-semibold text-emerald-300">
                    {isFinalMixCurrent
                      ? "Final mix đã xác minh"
                      : "Final mix cũ vẫn được giữ; chưa khớp mixer settings hiện tại"}
                  </p>
                  <audio
                    key={`${job.id}-${finalMix?.sizeBytes}`}
                    controls
                    preload="metadata"
                    src={`/api/video-dubbing/jobs/${job.id}/final-mix-audio`}
                    className="w-full"
                  >
                    Trình duyệt không hỗ trợ phát WAV.
                  </audio>
                </div>
              )}

              <div className="space-y-4 border-t border-slate-800 pt-4">
                <div className="grid grid-cols-1 gap-4">
                  <div className="space-y-3 rounded-xl border border-slate-800 bg-slate-950/50 p-4">
                    <button
                      type="button"
                      aria-expanded={!logoTitleCollapsed}
                      onClick={() => setLogoTitleCollapsed((collapsed) => !collapsed)}
                      className="flex w-full items-center justify-between text-left text-sm font-semibold text-slate-100"
                    >
                      Chèn logo và tiêu đề
                      <ChevronDown className={`h-4 w-4 transition-transform ${logoTitleCollapsed ? "-rotate-90" : ""}`} />
                    </button>
                    {!logoTitleCollapsed && <div className="space-y-3">
                    <div className="flex flex-wrap items-center justify-between gap-3">
                      <label className="flex items-center gap-2 text-sm font-semibold text-slate-100">
                        <input
                          type="checkbox"
                          checked={logoEnabled}
                          disabled={
                            !job?.overlaySettings?.logoFileName || logoUploading
                          }
                          onChange={(event) =>
                            setLogoEnabled(event.target.checked)
                          }
                          className="accent-sky-400"
                        />
                        Bật logo
                      </label>
                      <input
                        ref={logoInputRef}
                        type="file"
                        accept=".png,.jpg,.jpeg,.webp,image/png,image/jpeg,image/webp"
                        className="hidden"
                        onChange={(event) => {
                          const file = event.target.files?.[0];
                          event.target.value = "";
                          if (file) void uploadOverlayLogo(file);
                        }}
                      />
                      <button
                        type="button"
                        onClick={() => logoInputRef.current?.click()}
                        disabled={!job || logoUploading || isMediaProcessing}
                        className="inline-flex items-center gap-1.5 rounded-lg border border-slate-700 px-3 py-2 text-xs font-semibold text-slate-200 hover:border-sky-400/50 disabled:cursor-not-allowed disabled:opacity-50"
                      >
                        {logoUploading ? (
                          <LoaderCircle className="h-3.5 w-3.5 animate-spin" />
                        ) : (
                          <Upload className="h-3.5 w-3.5" />
                        )}
                        {job?.overlaySettings?.logoFileName
                          ? "Thay logo"
                          : "Thêm logo"}
                      </button>
                    </div>
                    {job?.overlaySettings?.logoFileName ? (
                      <div className="flex items-center gap-3">
                        <img
                          src={`/api/video-dubbing/jobs/${job.id}/logo`}
                          alt="Logo chèn vào video"
                          className="max-h-12 max-w-24 rounded border border-slate-700 bg-slate-900 object-contain p-1"
                        />
                        <span className="text-xs text-slate-400">
                          {job.overlaySettings.logoFileName}
                        </span>
                      </div>
                    ) : (
                      <p className="text-xs text-slate-500">
                        Chọn logo PNG, JPG hoặc WebP (tối đa 20 MB).
                      </p>
                    )}
                    <label className="block space-y-1.5 text-xs text-slate-300">
                      <span className="flex justify-between gap-2">
                        <span>Kích thước theo chiều rộng video</span>
                        <span>{logoWidthPercent}%</span>
                      </span>
                      <input
                        type="range"
                        min="5"
                        max="40"
                        value={logoWidthPercent}
                        onChange={(event) =>
                          setLogoWidthPercent(Number(event.target.value))
                        }
                        disabled={!job?.overlaySettings?.logoFileName}
                        className="w-full accent-sky-400"
                      />
                    </label>
                    <label className="block space-y-1.5 text-xs text-slate-300">
                      <span className="flex justify-between gap-2">
                        <span>Padding cách mép video</span>
                        <span>{logoPaddingPx} px</span>
                      </span>
                      <input
                        type="range"
                        min="0"
                        max="200"
                        step="4"
                        value={logoPaddingPx}
                        onChange={(event) =>
                          setLogoPaddingPx(Number(event.target.value))
                        }
                        disabled={!job?.overlaySettings?.logoFileName}
                        className="w-full accent-sky-400"
                      />
                    </label>
                    <label className="flex items-center justify-between gap-3 text-xs text-slate-300">
                      Vị trí logo
                      <select
                        value={logoPosition}
                        onChange={(event) =>
                          setLogoPosition(
                            event.target.value as VideoDubbingOverlayPosition,
                          )
                        }
                        disabled={!job?.overlaySettings?.logoFileName}
                        className="rounded-lg border border-slate-700 bg-slate-900 px-2.5 py-2 text-xs text-slate-100"
                      >
                        {OVERLAY_POSITION_OPTIONS.map((option) => (
                          <option key={option.value} value={option.value}>
                            {option.label}
                          </option>
                        ))}
                      </select>
                    </label>
                    <p className="text-[11px] text-slate-500">
                      Mặc định: trên trái.
                    </p>
                    <div className="border-t border-slate-800 pt-3">
                      <div className="flex flex-wrap items-center justify-between gap-3">
                        <label className="flex items-center gap-2 text-sm font-semibold text-slate-100">
                          <input
                            type="checkbox"
                            checked={Boolean(titleOverlay && titleOverlay.enabled !== false)}
                            disabled={!titleOverlay}
                            onChange={(event) => {
                              if (titleOverlayIndex >= 0) {
                                setTextOverlays((items) => items.map((item, index) =>
                                  index === titleOverlayIndex
                                    ? { ...item, enabled: event.target.checked }
                                    : item,
                                ));
                              }
                            }}
                            className="accent-violet-400"
                          />
                          Bật tiêu đề
                        </label>
                        <button
                          type="button"
                          onClick={createTitleOverlay}
                          disabled={!job || isMediaProcessing}
                          className="inline-flex items-center gap-1.5 rounded-lg border border-violet-500/30 bg-violet-950/20 px-3 py-2 text-xs font-semibold text-violet-100 hover:bg-violet-950/40 disabled:cursor-not-allowed disabled:opacity-50"
                        >
                          <Plus className="h-3.5 w-3.5" />
                          {titleOverlay ? "Chỉnh tiêu đề" : "Tạo Tiêu Đề"}
                        </button>
                      </div>
                      <p className="mt-2 text-[11px] text-slate-500">
                        Tiêu đề luôn hiển thị từ đầu đến hết video. Kéo tiêu đề trực tiếp trên preview để đặt cạnh logo.
                      </p>
                    </div>
                    {titleOverlay && selectedTextOverlay === titleOverlayIndex && (
                      <div className="grid gap-3 rounded-lg border border-violet-500/20 bg-violet-950/10 p-3 sm:grid-cols-2">
                        <label className="space-y-1 text-[10px] text-slate-400 sm:col-span-2">
                          Nội dung tiêu đề
                          <textarea
                            value={titleOverlay.text}
                            onChange={(event) => updateSelectedTextOverlay({ text: event.target.value })}
                            rows={2}
                            className="w-full rounded-md border border-slate-700 bg-slate-950 px-2 py-1.5 text-xs text-white"
                          />
                        </label>
                        <div className="sm:col-span-2">
                          <TextStyleControls
                            value={{
                              fontFamily: titleOverlay.fontFamily,
                              fontSize: titleOverlay.fontSize,
                              bold: titleOverlay.bold,
                              underline: titleOverlay.underline ?? false,
                              italic: titleOverlay.italic,
                              textCase: titleOverlay.textCase ?? "none",
                              color: titleOverlay.color,
                              outlineEnabled: titleOverlay.outlineEnabled ?? false,
                              outlineColor: titleOverlay.outlineColor ?? "#000000",
                              outlineWidthPx: titleOverlay.outlineWidthPx ?? 2,
                              characterSpacingPx: titleOverlay.characterSpacingPx ?? 0,
                              lineSpacingPx: titleOverlay.lineSpacingPx ?? 0,
                            }}
                            onChange={updateSelectedTextOverlay}
                            fontOptions={subtitleFontOptions}
                          />
                        </div>
                        <label className="space-y-1 text-[10px] text-slate-400">
                          Vị trí neo
                          <select
                            value={titleOverlay.position}
                            onChange={(event) => updateSelectedTextOverlay({
                              position: event.target.value as VideoDubbingOverlayPosition,
                              xPercent: undefined,
                              yPercent: undefined,
                            })}
                            className="w-full rounded-md border border-slate-700 bg-slate-950 px-2 py-1.5 text-xs text-white"
                          >
                            {OVERLAY_POSITION_OPTIONS.map((option) => (
                              <option key={option.value} value={option.value}>{option.label}</option>
                            ))}
                          </select>
                        </label>
                        {(titleOverlay.xPercent !== undefined || titleOverlay.yPercent !== undefined) && (
                          <button
                            type="button"
                            onClick={() => updateSelectedTextOverlay({ xPercent: undefined, yPercent: undefined })}
                            className="self-end rounded-md border border-violet-500/30 px-2 py-1.5 text-xs text-violet-200"
                          >
                            Đặt lại vị trí neo
                          </button>
                        )}
                        <label className="inline-flex items-center gap-2 text-xs text-slate-300">
                          <input
                            type="checkbox"
                            checked={titleOverlay.backgroundTransparent}
                            onChange={(event) => updateSelectedTextOverlay({ backgroundTransparent: event.target.checked })}
                            className="accent-violet-400"
                          />
                          Nền trong suốt
                        </label>
                        {!titleOverlay.backgroundTransparent && (
                          <label className="space-y-1 text-[10px] text-slate-400">
                            Màu nền
                            <input
                              type="color"
                              value={titleOverlay.backgroundColor}
                              onChange={(event) => updateSelectedTextOverlay({ backgroundColor: event.target.value })}
                              className="h-8 w-full rounded-md border border-slate-700 bg-slate-950"
                            />
                          </label>
                        )}
                        <button
                          type="button"
                          onClick={() => {
                            setTextOverlays((items) => items.filter((_, index) => index !== titleOverlayIndex));
                            setSelectedTextOverlay(null);
                          }}
                          className="inline-flex items-center justify-center gap-1 justify-self-start rounded-md border border-rose-500/30 px-2 py-1 text-xs text-rose-200"
                        >
                          <Trash2 className="h-3 w-3" />Xóa tiêu đề
                        </button>
                      </div>
                    )}
                    </div>}
                  </div>

                  <div className="space-y-3 rounded-xl border border-slate-800 bg-slate-950/50 p-4">
                    <label className="flex items-center gap-2 text-sm font-semibold text-slate-100">
                      <input
                        type="checkbox"
                        checked={subtitlesEnabled}
                        disabled={
                          (!srt?.analysis?.items.length &&
                            !job?.overlaySettings?.subtitles.length)
                        }
                        onChange={(event) =>
                          setSubtitlesEnabled(event.target.checked)
                        }
                        className="accent-sky-400"
                      />
                      Chèn phụ đề SRT
                    </label>
                    <p className="text-xs text-slate-400">
                      {srt?.analysis
                        ? `${srt.fileName} · ${srt.analysis.subtitleCount} dòng`
                        : job?.overlaySettings?.subtitles.length
                          ? `${job.overlaySettings.subtitles.length} dòng phụ đề đã lưu`
                          : "Chọn và phân tích tệp SRT ở phần phụ đề trước khi xuất."}
                    </p>
                    <TextStyleControls
                      value={subtitleTextStyleValue}
                      onChange={updateSubtitleTextStyle}
                      fontOptions={subtitleFontOptions}
                      minFontSize={12}
                      maxFontSize={72}
                      disabled={!srt?.analysis?.items.length && !job?.overlaySettings?.subtitles.length}
                    />
                    <div className="grid gap-3 sm:grid-cols-2">
                      <label className="flex items-center justify-between gap-2 text-xs text-slate-300">
                        Kiểu nền phụ đề
                        <select
                          value={subtitleBackgroundMode}
                          onChange={(event) => {
                            setSubtitleBackgroundMode(
                              event.target.value as "none" | "color" | "image",
                            );
                            if (
                              event.target.value === "image" &&
                              !subtitleBackgroundImage &&
                              subtitleBackgrounds.length > 0
                            ) {
                              setSubtitleBackgroundImage(subtitleBackgrounds[0]);
                            }
                          }}
                          disabled={
                            !srt?.analysis?.items.length &&
                            !job?.overlaySettings?.subtitles.length
                          }
                          className="min-w-0 rounded-lg border border-slate-700 bg-slate-900 px-2 py-2 text-xs text-slate-100"
                        >
                          <option value="none">Không nền / Trong suốt</option>
                          <option value="color">Màu nền</option>
                          <option value="image">Nền ảnh 3-slice</option>
                        </select>
                      </label>
                      {subtitleBackgroundMode === "color" && (
                        <label className="flex items-center justify-between gap-2 text-xs text-slate-300">
                          Màu nền
                          <input
                            type="color"
                            value={subtitleBackgroundColor}
                            onChange={(event) =>
                              setSubtitleBackgroundColor(event.target.value)
                            }
                            disabled={
                              !srt?.analysis?.items.length &&
                              !job?.overlaySettings?.subtitles.length
                            }
                            className="h-8 w-12 cursor-pointer rounded border border-slate-700 bg-slate-900 p-1 disabled:cursor-not-allowed"
                          />
                        </label>
                      )}
                      {subtitleBackgroundMode === "image" && (
                        <div className="flex items-center justify-between gap-2 text-xs text-slate-300">
                          <span>Ảnh nền</span>
                          <button
                            type="button"
                            onClick={() => setSubtitleBackgroundPickerOpen(true)}
                            disabled={
                              (!srt?.analysis?.items.length && !job?.overlaySettings?.subtitles.length) ||
                              subtitleBackgrounds.length === 0
                            }
                            className="flex min-w-0 items-center gap-2 rounded-lg border border-slate-700 bg-slate-900 px-2 py-2 text-xs text-slate-100 hover:border-sky-500/50 disabled:cursor-not-allowed disabled:opacity-50"
                          >
                            <span className="max-w-32 truncate">{subtitleBackgroundImage?.replace(/\.(png|webp)$/i, "") || "Chọn nền"}</span>
                            <ChevronDown className="h-3.5 w-3.5 shrink-0 text-slate-400" />
                          </button>
                        </div>
                      )}
                    </div>
                    <label className="block space-y-1.5 text-xs text-slate-300">
                      <span className="flex justify-between gap-2">
                        <span>Padding nền phụ đề</span>
                        <span>{subtitlePaddingPx} px</span>
                      </span>
                      <input
                        type="range"
                        min="0"
                        max="40"
                        value={subtitlePaddingPx}
                        onChange={(event) =>
                          setSubtitlePaddingPx(Number(event.target.value))
                        }
                        disabled={
                          !srt?.analysis?.items.length &&
                          !job?.overlaySettings?.subtitles.length
                        }
                        className="w-full accent-sky-400"
                      />
                    </label>
                    <label className="block space-y-1.5 text-xs text-slate-300">
                      <span className="flex justify-between gap-2">
                        <span>Khoảng cách phụ đề tới mép video</span>
                        <span>{subtitleMarginPx} px</span>
                      </span>
                      <input
                        type="range"
                        min="0"
                        max="200"
                        step="4"
                        value={subtitleMarginPx}
                        onChange={(event) =>
                          (() => {
                            const value = Number(event.target.value);
                            setSubtitleMarginPx(value);
                            if (job?.id) scheduleSubtitleMarginSave(job.id, value);
                          })()
                        }
                        onPointerUp={flushSubtitleMarginSave}
                        onKeyUp={flushSubtitleMarginSave}
                        disabled={
                          !srt?.analysis?.items.length &&
                          !job?.overlaySettings?.subtitles.length
                        }
                        className="w-full accent-sky-400"
                      />
                    </label>
                    <label className="flex items-center justify-between gap-3 text-xs text-slate-300">
                      Vị trí phụ đề
                      <select
                        value={subtitlePosition}
                        onChange={(event) =>
                          setSubtitlePosition(
                            event.target.value as VideoDubbingOverlayPosition,
                          )
                        }
                        disabled={
                          !srt?.analysis?.items.length &&
                          !job?.overlaySettings?.subtitles.length
                        }
                        className="rounded-lg border border-slate-700 bg-slate-900 px-2.5 py-2 text-xs text-slate-100"
                      >
                        {OVERLAY_POSITION_OPTIONS.map((option) => (
                          <option key={option.value} value={option.value}>
                            {option.label}
                          </option>
                        ))}
                      </select>
                    </label>
                    <p className="text-[11px] text-slate-500">
                      Mặc định: dưới giữa.
                    </p>
                  </div>
                </div>

              </div>
            </div>
            </div>
          )}
        </section>
      ) : (
        <section className="min-h-72 rounded-2xl border border-cyan-500/25 bg-slate-900/80 p-4 sm:p-5">
          <div role="tablist" aria-label="Video preview" className="flex gap-1 rounded-xl border border-slate-800 bg-slate-950/70 p-1">
            <button type="button" role="tab" aria-selected={videoWorkspaceTab === "preview"} onClick={() => setVideoWorkspaceTab("preview")} className={`flex-1 rounded-lg px-3 py-2 text-xs font-semibold ${videoWorkspaceTab === "preview" ? "bg-cyan-400 text-slate-950" : "text-slate-300 hover:bg-slate-800"}`}>Video Mixer Preview</button>
            <button type="button" role="tab" aria-selected={videoWorkspaceTab === "merged"} onClick={() => setVideoWorkspaceTab("merged")} className={`flex-1 rounded-lg px-3 py-2 text-xs font-semibold ${videoWorkspaceTab === "merged" ? "bg-emerald-400 text-slate-950" : "text-slate-300 hover:bg-slate-800"}`}>Merged Video</button>
            <button type="button" role="tab" aria-selected={videoWorkspaceTab === "end-scene"} onClick={() => setVideoWorkspaceTab("end-scene")} className={`flex-1 rounded-lg px-3 py-2 text-xs font-semibold ${videoWorkspaceTab === "end-scene" ? "bg-orange-400 text-slate-950" : "text-slate-300 hover:bg-slate-800"}`}>End Scene</button>
          </div>
          <div className="flex min-h-64 flex-col items-center justify-center gap-3 p-6 text-center">
            <Film className="h-9 w-9 text-cyan-400" />
            <h3 className="font-semibold text-white">{videoWorkspaceTab === "preview" ? "Chưa có video preview" : videoWorkspaceTab === "merged" ? "Chưa có video đã merge" : "End Scene cần video hoàn tất"}</h3>
            <p className="max-w-md text-sm text-slate-400">Chọn video nguồn và chạy hàng đợi để xem mixer preview; video export hoàn tất sẽ xuất hiện trong tab Merged Video. End Scene được cấu hình khi video đã hoàn tất.</p>
          </div>
        </section>
      )}


      </div>

    </section>
  );
}
