import { ChangeEvent, DragEvent, PointerEvent as ReactPointerEvent, useEffect, useMemo, useRef, useState } from "react";
import {
  AlertCircle,
  AudioLines,
  BookOpen,
  CheckCircle2,
  ChevronDown,
  Clock3,
  FileText,
  Film,
  FolderOpen,
  HardDrive,
  History,
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
  VideoDubbingTextOverlayCue,
  VideoDubbingProject,
} from "../types/videoDubbing";
import { formatSecondsToSrtTime } from "../utils/srtParser";
import { analyzeSrtContent } from "../utils/videoDubbingSrt";
import { VideoDubbingPreviewController } from "../utils/videoDubbingPreview";
import {
  hasMatchedVideoDubbingQueueInputs,
  pairVideoDubbingQueueRows,
} from "../utils/videoDubbingQueue";
import { getAvailableVideoDubbingVoices } from "../utils/videoDubbingVoices";
import SubtitleOverlayRenderer from "./SubtitleOverlayRenderer";

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

interface SubtitleTimelineDrag {
  cueIndex: number;
  track: "subtitle" | "text";
  mode: "move" | "start" | "end";
  startX: number;
  trackWidth: number;
  timelineDuration: number;
  originalStart: number;
  originalEnd: number;
}

interface TextOverlayPreviewDrag {
  cueIndex: number;
  pointerX: number;
  pointerY: number;
  centerX: number;
  centerY: number;
  stageLeft: number;
  stageTop: number;
  stageWidth: number;
  stageHeight: number;
  overlayWidth: number;
  overlayHeight: number;
}

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
  return (
    <div className="space-y-3 rounded-lg border border-slate-700/80 bg-[#262626] p-3 text-xs text-slate-200">
      <label className="grid grid-cols-[82px_minmax(0,1fr)] items-center gap-3">
        <span>Font</span>
        <select value={value.fontFamily} disabled={disabled} onChange={(event) => onChange({ fontFamily: event.target.value })} className="min-w-0 rounded-md border border-slate-700 bg-slate-800 px-2 py-1.5 text-xs text-white">
          {fontOptions.map((font) => <option key={font} value={font}>{font}</option>)}
        </select>
      </label>
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
  const [subtitleCueOverrides, setSubtitleCueOverrides] = useState<Array<{
    startTime: number;
    endTime: number;
    text: string;
  }> | null>(null);
  const [textOverlays, setTextOverlays] = useState<VideoDubbingTextOverlayCue[]>([]);
  const [selectedTextOverlay, setSelectedTextOverlay] = useState<number | null>(null);
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
  const [videoPreviewReady, setVideoPreviewReady] = useState(false);
  const [mediaError, setMediaError] = useState<string | null>(null);
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
  const [videoWorkspaceTab, setVideoWorkspaceTab] = useState<"preview" | "merged">("preview");
  const [subtitleTimelineZoom, setSubtitleTimelineZoom] = useState(18);
  const [subtitleTimelineDrag, setSubtitleTimelineDrag] = useState<SubtitleTimelineDrag | null>(null);
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
  const autoPipelineEnabled = true;
  const [autoPipelineExpanded, setAutoPipelineExpanded] = useState(true);
  const [masterPanelExpanded, setMasterPanelExpanded] = useState(false);
  const [separationPanelExpanded, setSeparationPanelExpanded] = useState(false);
  const [mixerPanelExpanded, setMixerPanelExpanded] = useState(true);
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
  const srtInputRef = useRef<HTMLInputElement | null>(null);
  const subtitleBrowseTargetRef = useRef<string | null>(null);
  const logoInputRef = useRef<HTMLInputElement | null>(null);
  const uploadRef = useRef<XMLHttpRequest | null>(null);
  const videoGenerationRef = useRef(0);
  const srtGenerationRef = useRef(0);
  const activeJobIdRef = useRef<string | null>(null);
  const mixerSettingsTimerRef = useRef<number | null>(null);
  const mixerSettingsRequestRef = useRef(0);
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
        url: `/api/video-dubbing/jobs/${job.id}/master-audio`,
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
    const included = availableTracks.filter(
      ({ track }) =>
        !mixerSettings[track].muted && mixerSettings[track].volumePercent > 0,
    );
    if (included.length === 0 || !videoPreviewReady) {
      if (!videoPreviewReady) {
        setPreviewError("Video chưa sẵn sàng để xem trước.");
        return;
      }
      setPreviewError("Bật ít nhất một track có sẵn để nghe thử.");
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
    autoPipelineDemucsEnabled, originalAudioVolumePercent,
    logoEnabled, logoWidthPercent, logoPaddingPx, logoPosition,
    subtitlesEnabled, subtitleFontSize, subtitleFontFamily, subtitleColor,
    subtitleBackgroundColor, subtitleBackgroundTransparent, subtitleBackgroundMode,
    subtitleBold, subtitleItalic, subtitleUnderline, subtitleTextCase,
    subtitleOutlineEnabled, subtitleOutlineColor, subtitleOutlineWidthPx,
    subtitleCharacterSpacingPx, subtitleLineSpacingPx, subtitlePaddingPx,
    subtitlePosition, subtitleBackgroundImage, exportQuality,
    subtitleCueOverrides, textOverlays, subtitleTimelineZoom,
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
    try {
      const response = await fetch(`/api/video-dubbing/projects/${project.id}`);
      const result = await response.json();
      if (!response.ok || !result.project) throw new Error(result.error || "Không thể mở project.");
      const loaded = result.project as VideoDubbingProject;
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
        .filter((item): item is VideoDubbingJob => Boolean(item));
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
      const w = loaded.workspace || {};
      if (w.mixerSettings) setMixerSettings(w.mixerSettings as VideoDubbingMixerSettings);
      if (typeof w.selectedVoiceId === "string") setSelectedVoiceId(w.selectedVoiceId);
      if (typeof w.minSpeed === "number") setMinSpeed(w.minSpeed);
      if (typeof w.maxSpeed === "number") setMaxSpeed(w.maxSpeed);
      if (w.speedPriority === "balanced" || w.speedPriority === "strict" || w.speedPriority === "natural") setSpeedPriority(w.speedPriority);
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
      if (Array.isArray(w.subtitleCueOverrides)) setSubtitleCueOverrides(w.subtitleCueOverrides as typeof subtitleCueOverrides);
      if (Array.isArray(w.textOverlays)) setTextOverlays(w.textOverlays as VideoDubbingTextOverlayCue[]);
      if (typeof w.subtitleTimelineZoom === "number") setSubtitleTimelineZoom(w.subtitleTimelineZoom);
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
    if (!activeProject?.jobIds.includes(selectedJob.id)) {
      setSrt(null);
      setSrtContent("");
    }
    setMasterError(null);
    setMediaError(null);
    setSeparationError(null);
    if (srtInputRef.current) srtInputRef.current.value = "";
  };

  const previewSourceVideo = async (selectedJob: VideoDubbingJob) => {
    if (selectedJob.status !== "completed" || queueRunning || settingsSyncRunning) return;
    let project = importProjectRef.current || activeProject;
    if (project && !project.jobIds.includes(selectedJob.id)) {
      try {
        project = await attachJobToProject(project, selectedJob.id);
      } catch (error) {
        setProjectError(error instanceof Error ? error.message : "Không thể mở preview của video trong project.");
        return;
      }
    }

    openHistoryJob(selectedJob);
    setSubtitleCueOverrides(null);
    const selectedSubtitle = pairVideoDubbingQueueRows(
      [{ id: selectedJob.id, name: selectedJob.fileName, size: selectedJob.sizeBytes, job: selectedJob }],
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
    } else if (project?.activeJobId === selectedJob.id && project.srt) {
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
    if (latestProject?.jobIds.includes(selectedJob.id) && latestProject.activeJobId !== selectedJob.id) {
      try {
        const response = await fetch(`/api/video-dubbing/projects/${latestProject.id}`, {
          method: "PUT",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ activeJobId: selectedJob.id }),
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
  }, []);

  const setDefaultProject = (project: VideoDubbingProject | null) => {
    if (project) window.localStorage.setItem("video-dubbing-default-project", project.id);
    else window.localStorage.removeItem("video-dubbing-default-project");
    setDefaultProjectId(project?.id ?? null);
  };

  const projectWorkspaceSnapshot = JSON.stringify(makeProjectWorkspace());
  useEffect(() => {
    if (!activeProject || !projectReady) return;
    const projectId = activeProject.id;
    const requestId = ++projectSaveRequestRef.current;
    setProjectSaveState("saving");
    const timer = window.setTimeout(() => {
      const currentJobId = video?.job?.id;
      const jobIds = [...new Set([...activeProject.jobIds, ...(currentJobId ? [currentJobId] : [])])];
      void fetch(`/api/video-dubbing/projects/${projectId}`, {
        method: "PUT", headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          jobIds,
          activeJobId: currentJobId && jobIds.includes(currentJobId) ? currentJobId : activeProject.activeJobId || null,
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
        setSelectedVoiceId(defaultVoice?.id || availableVoices[0]?.id || "");
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

  const serverMixerSettingsKey = JSON.stringify(
    video?.job?.mixerSettings || null,
  );
  const localMixerSettingsKey = JSON.stringify(mixerSettings);

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
    const savedSettings = video?.job?.mixerSettings;
    setMixerSettings(savedSettings || DEFAULT_MIXER_SETTINGS);
    setMixerSettingsSaved(Boolean(savedSettings));
  }, [video?.job?.id, serverMixerSettingsKey, video?.job?.mixSelection]);

  useEffect(() => {
    if (video?.job?.id && activeProject?.jobIds.includes(video.job.id)) {
      return;
    }
    const settings = video?.job?.overlaySettings;
    setTextOverlays(settings?.textOverlays ?? []);
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
  // may be hydrated from a shared project workspace.
  useEffect(() => {
    setSubtitleMarginPx(video?.job?.overlaySettings?.subtitleMarginPx ?? 32);
  }, [video?.job?.id, activeProject?.id]);

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
      ? JSON.stringify(config)
      : null;
    if (!config) {
      setAutoPipelineDemucsEnabled(false);
      setOriginalAudioVolumePercent(100);
      setMixerSettings(DEFAULT_MIXER_SETTINGS);
      setSpeedPriority("balanced");
      setMinSpeed(0.8);
      setMaxSpeed(1.5);
      return;
    }
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
  }, [video?.job?.id, video?.job?.autoPipeline?.config, queueRunning]);

  useEffect(() => {
    const savedModel = video?.job?.autoPipeline?.config?.master;
    if (!savedModel) return;
    const voice = voices.find(
      (candidate) =>
        candidate.modelId === savedModel.model &&
        candidate.speakerId === savedModel.speakerId,
    );
    if (voice) setSelectedVoiceId(voice.id);
  }, [video?.job?.id, video?.job?.autoPipeline?.config?.master, voices]);

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
    if (activeProject) { importProjectRef.current = activeProject; return activeProject; }
    if (importProjectRef.current) return importProjectRef.current;
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

  const handleSrtFiles = async (files: File[], targetVideoId?: string, matchByName = false) => {
    if (files.length === 0 || queueRunning) return;

    const queued = files.map((file) => ({
      id: crypto.randomUUID(),
      file,
      fileName: file.name,
      sizeBytes: file.size,
      videoId: targetVideoId,
      matchByName,
    }));
    setSubtitleFiles((current) => [
      ...current.filter((item) => !targetVideoId || item.videoId !== targetVideoId),
      ...queued,
    ]);

    for (const entry of queued) {
      try {
        if (!entry.file.name.toLowerCase().endsWith(".srt")) {
          throw new Error("Chỉ hỗ trợ tệp phụ đề .srt.");
        }
        const content = await entry.file!.text();
        const analysis = analyzeSrtContent(content);
        const project = await ensureImportProject(entry.fileName);
        const sourceSrts = [...(project.sourceSrts || []).filter((item) => item.id !== entry.id && (!targetVideoId || item.videoId !== targetVideoId)), { id: entry.id, fileName: entry.fileName, content, ...(targetVideoId ? { videoId: targetVideoId } : {}), ...(matchByName ? { matchByName: true } : {}) }];
        const saveResponse = await fetch(`/api/video-dubbing/projects/${project.id}`, {
          method: "PUT", headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ sourceSrts }),
        });
        const savedResult = await saveResponse.json();
        if (!saveResponse.ok || !savedResult.project) throw new Error(savedResult.error || "Không thể lưu SRT vào project.");
        const savedProject = savedResult.project as VideoDubbingProject;
        setActiveProject(savedProject);
        importProjectRef.current = savedProject;
        setProjects((items) => [savedProject, ...items.filter((item) => item.id !== savedProject.id)]);
        setSubtitlesEnabled(true);
        setSubtitleFiles((current) =>
          current.map((item) =>
            item.id === entry.id ? { ...item, analysis, content, file: undefined } : item,
          ),
        );
        setSrt(
          (current) =>
            current || {
              fileName: entry.fileName,
              sizeBytes: entry.sizeBytes,
              analysis,
            },
        );
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
      const droppedTogether = droppedVideos.length > 0;
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
      if (videoSource?.job && activeProject) {
        const response = await fetch(`/api/video-dubbing/jobs/${videoSource.job.id}`, { method: "DELETE" });
        const result = await response.json();
        if (!response.ok) throw new Error(result.error || "Không thể xóa video nguồn đã lưu.");
        const jobIds = activeProject.jobIds.filter((id) => id !== videoSource.job!.id);
        const saveResponse = await fetch(`/api/video-dubbing/projects/${activeProject.id}`, {
          method: "PUT", headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ jobIds, activeJobId: activeProject.activeJobId === videoSource.job.id ? jobIds[0] || null : activeProject.activeJobId || null }),
        });
        const saved = await saveResponse.json();
        if (!saveResponse.ok || !saved.project) throw new Error(saved.error || "Không thể cập nhật project sau khi xóa video.");
        setActiveProject(saved.project);
        importProjectRef.current = saved.project;
        setProjects((items) => [saved.project, ...items.filter((item) => item.id !== saved.project.id)]);
        setJobHistory((items) => items.filter((item) => item.job.id !== videoSource.job!.id));
        if (activeJobIdRef.current === videoSource.job.id) { activeJobIdRef.current = null; setVideo(null); }
      }
      if (subtitleSource && activeProject) {
        const sourceSrts = (activeProject.sourceSrts || []).filter((item) => item.id !== subtitleSource.id);
        const response = await fetch(`/api/video-dubbing/projects/${activeProject.id}`, {
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
  useEffect(() => {
    setSubtitleCueOverrides(null);
  }, [job?.id, srt?.fileName, srt?.sizeBytes]);
  const selectedVoice = voices.find((voice) => voice.id === selectedVoiceId);
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
    hasMasterAudio &&
    hasPreviewTrack &&
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
  const canGenerateMaster = Boolean(
    job?.status === "completed" &&
    srt?.analysis?.items.length &&
    selectedVoice &&
    !isMasterGenerating &&
    !isMediaProcessing,
  );
  const autoPipelineConfig: VideoDubbingAutoPipelineConfig | null = useMemo(
    () =>
      srt?.analysis?.items.length && selectedVoice
        ? {
            enabled: autoPipelineEnabled,
            master: {
              items: srt.analysis.items,
              model: selectedVoice.modelId,
              speakerId: selectedVoice.speakerId,
              options: { minSpeed, maxSpeed, speedPriority },
            },
            demucsEnabled: autoPipelineDemucsEnabled,
            mixerSettings,
            originalAudioVolumePercent,
          }
        : null,
    [
      autoPipelineEnabled,
      autoPipelineDemucsEnabled,
      maxSpeed,
      minSpeed,
      mixerSettings,
      originalAudioVolumePercent,
      selectedVoice,
      speedPriority,
      srt?.analysis?.items,
    ],
  );
  const canStartAutoPipeline = Boolean(
    job?.status === "completed" &&
    autoPipelineEnabled &&
    autoPipelineConfig &&
    !isAutoPipelineRunning &&
    !isMediaProcessing &&
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
    selectedVoice &&
    !queueRunning &&
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
    const sourceCues = targetJob.id === sourceJob?.id && subtitleCueOverrides
      ? subtitleCueOverrides
      : subtitle?.analysis?.items || targetJob.overlaySettings?.subtitles || [];
    const textOverlayClips = textOverlays
      .filter((cue) => cue.startTime < duration)
      .map((cue) => ({ ...cue, endTime: Math.min(cue.endTime, duration) }))
      .filter((cue) => cue.endTime > cue.startTime);
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
          const subtitleItems = row?.subtitle?.analysis?.items || sourceJob.autoPipeline?.config?.master.items;
          if (selectedVoice && subtitleItems?.length) {
            const config: VideoDubbingAutoPipelineConfig = {
              enabled: true,
              master: {
                items: subtitleItems,
                model: selectedVoice.modelId,
                speakerId: selectedVoice.speakerId,
                options: { minSpeed, maxSpeed, speedPriority },
              },
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
    if (!canStartQueue || !selectedVoice) return;
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
              items: subtitle.analysis.items,
              model: selectedVoice.modelId,
              speakerId: selectedVoice.speakerId,
              options: { minSpeed, maxSpeed, speedPriority },
            },
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
    if (!job || !srt?.analysis?.items.length || !selectedVoice) return;
    setMasterError(null);
    try {
      const response = await fetch(`/api/video-dubbing/jobs/${job.id}/master`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          items: srt.analysis.items,
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
  const saveAutoPipelineConfig = async (config = autoPipelineConfig) => {
    if (!job || !config) return;
    const configKey = JSON.stringify(config);
    setAutoPipelineError(null);
    setAutoPipelineSaving(true);
    try {
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
      autoPipelineSavedConfigKeyRef.current = configKey;
      mixerTouchedRef.current = false;
      setMixerSettingsSaved(true);
      setVideo((current) =>
        current?.job?.id === job.id
          ? {
              ...current,
              job: {
                ...current.job,
                mixerSettings: result.config.mixerSettings,
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
      const overlayResponse = await fetch(`/api/video-dubbing/jobs/${job.id}/overlay-settings`, {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ exportQuality }),
      });
      const overlayResult = await overlayResponse.json();
      if (!overlayResponse.ok || !overlayResult.job) throw new Error(overlayResult.error || "Không thể lưu mức chất lượng export.");
      setVideo((current) => current?.job?.id === job.id ? { ...current, job: overlayResult.job } : current);
      const response = await fetch(
        `/api/video-dubbing/jobs/${job.id}/auto-pipeline`,
        {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify(autoPipelineConfig),
        },
      );
      const result = await response.json();
      if (!response.ok) {
        throw new Error(result.error || "Không thể bắt đầu Auto Pipeline.");
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
          : "Không thể bắt đầu Auto Pipeline.",
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
          textOverlays,
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

  const openExportFolder = async () => {
    if (!job) return;
    try {
      const response = await fetch(
        `/api/video-dubbing/jobs/${job.id}/open-export-folder`,
        { method: "POST" },
      );
      const result = await response.json();
      if (!response.ok) throw new Error(result.error || "Không thể mở thư mục export.");
    } catch (error) {
      setMediaError(error instanceof Error ? error.message : "Không thể mở thư mục export.");
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
  const autoPipelineConfigKey = JSON.stringify(autoPipelineConfig);
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
  const overlayAlignment = getOverlayAlignment(logoPosition);
  const subtitleOverlayAlignment = getOverlayAlignment(subtitlePosition);
  const previewSubtitleCues = subtitleCueOverrides ||
    srt?.analysis?.items || job?.overlaySettings?.subtitles || [];
  const subtitleTimelineDuration = Math.max(
    1,
    job?.metadata?.durationSeconds || 0,
    ...previewSubtitleCues.map((cue) => cue.endTime),
    ...textOverlays.map((cue) => cue.endTime),
  );
  const subtitleTimelineWidth = Math.max(
    720,
    subtitleTimelineDuration * subtitleTimelineZoom,
  );
  const subtitleTimelineStep = Math.max(
    5,
    Math.ceil(subtitleTimelineDuration / 12 / 5) * 5,
  );
  const subtitleTimelineTicks = Array.from(
    { length: Math.floor(subtitleTimelineDuration / subtitleTimelineStep) + 1 },
    (_, index) => index * subtitleTimelineStep,
  );
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
  const activePreviewSubtitle = subtitlesEnabled
    ? previewSubtitleCues.find(
        (cue) =>
          cue.startTime <= previewCurrentTime &&
          cue.endTime >= previewCurrentTime,
      )
    : undefined;
  const selectedTextIsActive = selectedTextOverlay !== null &&
    textOverlays[selectedTextOverlay]?.startTime <= previewCurrentTime &&
    textOverlays[selectedTextOverlay]?.endTime >= previewCurrentTime;
  const activePreviewTextIndex = selectedTextIsActive
    ? selectedTextOverlay!
    : textOverlays.findIndex(
        (cue) => cue.startTime <= previewCurrentTime && cue.endTime >= previewCurrentTime,
      );
  const activePreviewText = activePreviewTextIndex >= 0
    ? textOverlays[activePreviewTextIndex]
    : undefined;
  const updateSelectedTextOverlay = (
    patch: Partial<VideoDubbingTextOverlayCue>,
  ) => {
    if (selectedTextOverlay === null) return;
    setTextOverlays((items) => items.map((item, index) =>
      index === selectedTextOverlay ? { ...item, ...patch } : item,
    ));
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
    setTextOverlayPreviewDrag({
      cueIndex,
      pointerX: event.clientX,
      pointerY: event.clientY,
      centerX: overlayBounds.left + overlayBounds.width / 2 - stageBounds.left,
      centerY: overlayBounds.top + overlayBounds.height / 2 - stageBounds.top,
      stageLeft: stageBounds.left,
      stageTop: stageBounds.top,
      stageWidth: stageBounds.width,
      stageHeight: stageBounds.height,
      overlayWidth: overlayBounds.width,
      overlayHeight: overlayBounds.height,
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
    setSubtitleTimelineDrag({
      cueIndex,
      track,
      mode,
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
      const update = (current: typeof textOverlays | null | typeof previewSubtitleCues) => {
        const items = drag.track === "subtitle"
          ? (subtitleCueOverrides || previewSubtitleCues)
          : textOverlays;
        if (!items[drag.cueIndex]) return current;
        return items.map((item, index) => index === drag.cueIndex
          ? { ...item, startTime, endTime }
          : item,
        );
      };
      if (drag.track === "subtitle") {
        setSubtitleCueOverrides((current) => update(current) as typeof previewSubtitleCues);
      } else {
        setTextOverlays((current) => update(current) as VideoDubbingTextOverlayCue[]);
      }
    };
    const onPointerUp = () => setSubtitleTimelineDrag(null);
    window.addEventListener("pointermove", onPointerMove);
    window.addEventListener("pointerup", onPointerUp, { once: true });
    window.addEventListener("pointercancel", onPointerUp, { once: true });
    return () => {
      window.removeEventListener("pointermove", onPointerMove);
      window.removeEventListener("pointerup", onPointerUp);
      window.removeEventListener("pointercancel", onPointerUp);
    };
  }, [subtitleTimelineDrag, previewSubtitleCues, subtitleCueOverrides, textOverlays]);
  useEffect(() => {
    const drag = textOverlayPreviewDrag;
    if (!drag) return;
    const onPointerMove = (event: PointerEvent) => {
      const minimumX = Math.min(50, (drag.overlayWidth / 2 / drag.stageWidth) * 100);
      const minimumY = Math.min(50, (drag.overlayHeight / 2 / drag.stageHeight) * 100);
      const xPercent = Math.max(minimumX, Math.min(100 - minimumX,
        ((drag.centerX + event.clientX - drag.pointerX) / drag.stageWidth) * 100));
      const yPercent = Math.max(minimumY, Math.min(100 - minimumY,
        ((drag.centerY + event.clientY - drag.pointerY) / drag.stageHeight) * 100));
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
  }, [textOverlayPreviewDrag]);
  const previewOverlayScale =
    videoPreviewReady && job?.metadata && previewVideoRef.current
      ? previewVideoRef.current.clientWidth / job.metadata.width
      : 1;
  const subtitleBackgroundSliceUrl = (background: string, slice: "left" | "center" | "right") =>
    `/assets/subtitle/${encodeURIComponent(`${background}-${slice}.png`)}`;

  return (
    <section className={`grid w-full max-w-none grid-cols-1 items-start gap-5 px-3 py-4 text-slate-200 sm:px-5 ${settingsCollapsed ? "xl:grid-cols-[52px_minmax(0,1fr)]" : "xl:grid-cols-[minmax(320px,0.8fr)_minmax(0,1.8fr)]"}`}>
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
      <header className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 xl:col-span-2">
        <div className="flex items-center gap-3">
          <div className="w-11 h-11 rounded-2xl bg-amber-500/15 text-amber-400 border border-amber-500/25 flex items-center justify-center">
            <Film className="w-5 h-5" />
          </div>
          <div>
            <h2 className="text-xl font-bold text-white">Video Dubbing</h2>
            <p className="text-xs sm:text-sm text-slate-400">
              Tạo TTS Master theo timestamp bằng pipeline Đồng Bộ Phụ Đề hiện
              có.
            </p>
          </div>
        </div>
        <span className="self-start sm:self-auto px-2.5 py-1 rounded-full text-[10px] font-bold uppercase tracking-wide bg-slate-800 text-slate-300 border border-slate-700">
          Video Dubbing · Piper & VieNeu Turbo · Demucs cục bộ
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
                <div className="min-w-0"><p className="truncate text-sm font-semibold text-white">{project.name}{defaultProjectId === project.id && <span className="ml-2 rounded-full border border-emerald-500/30 px-2 py-0.5 text-[10px] font-medium text-emerald-300">Mặc định</span>}</p><p className="mt-1 text-xs text-slate-500">{project.jobIds.length} video/job · cập nhật {new Date(project.updatedAt).toLocaleString()}</p></div>
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
              <li><b className="text-white">Bắt đầu Auto Pipeline:</b> chạy pipeline cho job hiện tại theo cấu hình đã lưu.</li>
              <li><b className="text-white">Render final mix:</b> tạo file âm thanh cuối từ các track và mixer.</li>
              <li><b className="text-white">Export:</b> ghép final mix, phụ đề và logo vào video.</li>
              <li><b className="text-white">Open Export Folder:</b> mở thư mục lưu output của job hiện tại.</li>
              <li><b className="text-white">Lịch sử job:</b> xem lại và mở các job đã lưu.</li>
            </ul>
          </section>
        </div>
      )}

      <section className="space-y-3 rounded-2xl border border-slate-800 bg-slate-900/90 p-3 sm:p-4 xl:col-span-2 xl:row-start-3">
        <div className="flex flex-wrap items-center justify-between gap-2">
        <div className="flex flex-wrap items-center gap-2">
          {queueRunning ? (
            <button type="button" onClick={() => void stopQueue()} className="inline-flex items-center gap-2 rounded-lg border border-rose-500/30 bg-rose-950/30 px-3 py-2 text-xs font-bold text-rose-100"><X className="h-4 w-4" />Dừng hàng đợi</button>
          ) : (
            <button type="button" onClick={() => void startQueue()} disabled={!canStartQueue} className="inline-flex items-center gap-2 rounded-lg bg-indigo-400 px-3 py-2 text-xs font-bold text-slate-950 disabled:cursor-not-allowed disabled:bg-slate-800 disabled:text-slate-500"><Play className="h-4 w-4" />Bắt đầu hàng đợi</button>
          )}
          {isAutoPipelineRunning ? (
            <button type="button" onClick={() => void cancelAutoPipeline()} className="inline-flex items-center gap-2 rounded-lg border border-rose-500/30 bg-rose-950/30 px-3 py-2 text-xs font-bold text-rose-100"><X className="h-4 w-4" />Hủy Auto Pipeline</button>
          ) : (
            <button type="button" onClick={() => void startAutoPipeline()} disabled={!canStartAutoPipeline} className="inline-flex items-center gap-2 rounded-lg border border-indigo-400/40 px-3 py-2 text-xs font-bold text-indigo-100 disabled:cursor-not-allowed disabled:opacity-40"><Play className="h-4 w-4" />Bắt đầu Auto Pipeline</button>
          )}
        </div>
        <div className="flex flex-wrap items-center gap-2">
          <button type="button" onClick={() => void startFinalMix()} disabled={!canRenderFinalMix} className="inline-flex items-center gap-2 rounded-lg bg-cyan-400 px-3 py-2 text-xs font-bold text-slate-950 disabled:cursor-not-allowed disabled:bg-slate-800 disabled:text-slate-500"><Volume2 className="h-4 w-4" />Render final mix</button>
          <label title="Theo nguồn dùng codec và bitrate video gốc. Low khoảng 70%, Medium 90% bitrate gốc. High giữ cấu hình chất lượng hiện tại." className="inline-flex items-center gap-2 rounded-lg border border-slate-700 px-2.5 py-2 text-xs text-slate-300">
            Chất lượng
            <select value={exportQuality} onChange={(event) => setExportQuality(event.target.value as VideoDubbingExportQuality)} className="rounded-md border border-slate-700 bg-slate-950 px-2 py-1 text-xs text-slate-100 focus:border-sky-400 focus:outline-none">
              <option value="source">Theo nguồn</option>
              <option value="low">Low</option>
              <option value="medium">Medium</option>
              <option value="high">High</option>
            </select>
          </label>
          <button type="button" onClick={() => void startVideoExport()} disabled={!canExportVideo || logoUploading} className="inline-flex items-center gap-2 rounded-lg bg-sky-500 px-3 py-2 text-xs font-bold text-slate-950 disabled:cursor-not-allowed disabled:bg-slate-800 disabled:text-slate-500"><Film className="h-4 w-4" />Export</button>
          <div className="flex max-w-sm flex-col gap-1">
            <label title="Sau khi tất cả video trong hàng đợi export thành công, ghép chúng bằng stream copy không encode lại." className={`inline-flex items-center gap-2 rounded-lg border border-slate-700 px-3 py-2 text-xs text-slate-200 ${queueRunning || queueRows.length < 2 || concatPreflight.status === "checking" ? "cursor-not-allowed opacity-50" : "cursor-pointer hover:border-sky-500/40"}`}>
              <input type="checkbox" checked={joinAfterQueue} onChange={() => void toggleJoinAfterQueue()} disabled={queueRunning || queueRows.length < 2 || concatPreflight.status === "checking"} className="accent-sky-400" />
              Ghép nối sau khi hàng đợi xong
            </label>
            {concatPreflight.status !== "idle" && <span className={`max-w-sm text-[10px] leading-relaxed ${concatPreflight.status === "incompatible" ? "text-rose-300" : concatPreflight.status === "compatible" ? "text-emerald-300" : "text-slate-400"}`}>{concatPreflight.message}</span>}
          </div>
          <button type="button" onClick={() => void openExportFolder()} disabled={!job} className="inline-flex items-center gap-2 rounded-lg border border-slate-700 px-3 py-2 text-xs font-semibold text-slate-200 hover:border-slate-500 disabled:opacity-40"><FolderOpen className="h-4 w-4" />Open Export Folder</button>
          <button type="button" onClick={() => { setProjectsExpanded(true); void loadProjects(); }} className="inline-flex items-center gap-2 rounded-lg border border-slate-700 px-3 py-2 text-xs font-semibold text-slate-200 hover:border-sky-400/50"><FolderOpen className="h-4 w-4" />Project{activeProject ? ` · ${activeProject.name}` : ""}</button>
          <button type="button" onClick={() => setGuideOpen(true)} className="inline-flex items-center gap-2 rounded-lg border border-slate-700 px-3 py-2 text-xs font-semibold text-slate-200 hover:border-cyan-400/50"><BookOpen className="h-4 w-4" />Hướng Dẫn</button>
        </div>
        </div>
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

      <div className={`space-y-5 xl:col-start-1 xl:row-start-4 ${settingsCollapsed ? "min-w-0" : ""}`}>
      <button type="button" onClick={() => setSettingsCollapsed((value) => !value)} aria-expanded={!settingsCollapsed} className="flex w-full items-center justify-between gap-2 rounded-xl border border-slate-800 bg-slate-900/90 px-3 py-2 text-xs font-semibold text-slate-300 hover:border-cyan-500/40 hover:text-white" title={settingsCollapsed ? "Mở rộng cài đặt" : "Thu gọn cài đặt"}>
        <span className={settingsCollapsed ? "xl:hidden" : ""}>{settingsCollapsed ? "Cài đặt" : "Thu gọn cột cài đặt"}</span>
        <ChevronDown className={`h-4 w-4 transition-transform ${settingsCollapsed ? "-rotate-90" : "rotate-90"}`} />
      </button>
      <div role="tablist" aria-label="Nội dung cột bên trái" className={settingsCollapsed ? "hidden" : "flex gap-1 rounded-xl border border-slate-800 bg-slate-950/70 p-1"}>
        <button type="button" role="tab" aria-selected={leftPanelTab === "settings"} onClick={() => setLeftPanelTab("settings")} className={`flex-1 rounded-lg px-3 py-2 text-xs font-semibold ${leftPanelTab === "settings" ? "bg-cyan-400 text-slate-950" : "text-slate-300 hover:bg-slate-800"}`}>Settings</button>
        <button type="button" role="tab" aria-selected={leftPanelTab === "sources"} onClick={() => setLeftPanelTab("sources")} className={`flex-1 rounded-lg px-3 py-2 text-xs font-semibold ${leftPanelTab === "sources" ? "bg-cyan-400 text-slate-950" : "text-slate-300 hover:bg-slate-800"}`}>Danh sách video</button>
      </div>
      <div className={leftPanelTab !== "settings" ? "hidden" : settingsCollapsed ? "space-y-5 xl:hidden" : "space-y-5"}>
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
                    key={`${job?.id}-${masterGeneration.sizeBytes}`}
                    controls
                    preload="metadata"
                    src={`/api/video-dubbing/jobs/${job?.id}/master-audio`}
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
        className="overflow-hidden rounded-xl border border-slate-800 bg-slate-900/80"
        onDragOver={(event) => {
          event.preventDefault();
          event.dataTransfer.dropEffect = queueRunning ? "none" : "copy";
        }}
        onDrop={handleQueueDrop}
      >
        <div className="border-b border-slate-800 px-4 py-3">
          <div className="flex flex-col gap-2 sm:flex-row sm:items-center sm:justify-between">
            <div>
              <h3 className="text-sm font-semibold text-white">Danh sách video nguồn</h3>
              <p className="mt-1 text-xs text-slate-400">Video đã lưu trong job của project được liệt kê tại đây. Thả thêm video và SRT để ghép theo tên file.</p>
            </div>
            <button
              type="button"
              onClick={() => void syncSettingsToAllVideos()}
              disabled={settingsSyncRunning || queueRunning || videoFiles.some((item) => item.uploading) || !videoFiles.some((item) => item.job?.status === "completed")}
              title="Lưu cài đặt preview vào tất cả job video trong danh sách, không bắt đầu xử lý"
              className="inline-flex shrink-0 items-center justify-center gap-2 rounded-lg border border-cyan-400/30 bg-cyan-950/30 px-3 py-2 text-xs font-semibold text-cyan-100 hover:bg-cyan-900/40 disabled:cursor-not-allowed disabled:opacity-50"
            >
              <RefreshCw className={`h-3.5 w-3.5 ${settingsSyncRunning ? "animate-spin" : ""}`} />
              {settingsSyncRunning ? "Đang đồng bộ…" : "Đồng bộ"}
            </button>
          </div>
          {settingsSyncMessage && <p className="mt-2 text-xs text-cyan-200" role="status">{settingsSyncMessage}</p>}
        </div>
        <div className="w-full min-w-0 overflow-hidden">
          <table className="w-full min-w-0 table-fixed border-collapse text-left">
            <thead className="bg-slate-950/80">
              <tr className="border-b border-slate-800 text-xs font-semibold uppercase tracking-wide text-slate-400">
                <th scope="col" className="w-1/3 px-3 py-3">
                  Video nguồn
                </th>
                <th scope="col" className="w-[1%] whitespace-nowrap px-2 py-3 text-center">
                  Phụ đề SRT
                </th>
                <th scope="col" className="px-3 py-3 text-right">
                  Thao tác
                </th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-800/80">
              {projectJobItems.map((item) => {
                const cues = item.job.overlaySettings?.subtitles || [];
                const srtName = activeProject?.activeJobId === item.job.id
                  ? activeProject.srt?.fileName
                  : undefined;
                return (
                  <tr key={`saved-${item.job.id}`} aria-current={job?.id === item.job.id ? "true" : undefined} className={job?.id === item.job.id ? "bg-sky-900/30 ring-1 ring-inset ring-sky-400/35" : "bg-slate-950/20"}>
                    <td className="min-w-0 p-2"><button type="button" onClick={() => openHistoryJob(item)} className="flex w-full min-w-0 items-center gap-2 rounded-lg px-1 py-2 text-left hover:bg-slate-800/70"><Film className="h-4 w-4 shrink-0 text-sky-300" /><span className="min-w-0 flex-1 truncate text-sm text-slate-100">{item.job.fileName}</span>{job?.id === item.job.id && <span className="shrink-0 rounded-full bg-sky-400/15 px-2 py-0.5 text-[10px] font-semibold text-sky-200">Đang preview</span>}</button></td>
                    <td className="whitespace-nowrap p-2 text-center"><span title={srtName || (cues.length ? "Phụ đề đã lưu trong job" : "Chưa có SRT lưu cho job này")}><FileText className={`mx-auto h-4 w-4 ${srtName || cues.length ? "text-cyan-300" : "text-slate-600"}`} /></span>{cues.length > 0 && <div className="mt-1 text-[10px] text-slate-500">{cues.length} câu</div>}</td>
                    <td className="min-w-0 p-2"><div className="flex flex-wrap items-center justify-end gap-2"><span className="text-[11px] text-slate-400">{statusLabel(item.job)}</span><button type="button" onClick={() => void previewSourceVideo(item.job)} disabled={item.job.status !== "completed" || queueRunning || settingsSyncRunning} title={`Preview ${item.job.fileName}`} aria-label={`Preview ${item.job.fileName}`} className="rounded-lg border border-sky-500/30 p-2 text-sky-200 hover:bg-sky-950/30 disabled:cursor-not-allowed disabled:opacity-40"><Play className="h-4 w-4" /></button></div></td>
                  </tr>
                );
              })}
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
                  return (
                    <tr
                      key={`${file?.id || "no-video"}-${file?.name || ""}-${file?.size || 0}-${file?.lastModified || 0}-${subtitle?.id || "no-srt"}-${index}`}
                      aria-current={file?.job?.id && job?.id === file.job.id ? "true" : undefined}
                      className={file?.job?.id && job?.id === file.job.id ? "bg-sky-900/30 ring-1 ring-inset ring-sky-400/35" : undefined}
                    >
                      <td className="min-w-0 p-2">
                        <div
                          onDragEnter={(event) => {
                            event.preventDefault();
                            event.stopPropagation();
                          }}
                          onDragOver={(event) => {
                            event.preventDefault();
                            event.stopPropagation();
                            event.dataTransfer.dropEffect = "copy";
                          }}
                          onDrop={(event) => handleQueueDrop(event, file?.job?.id)}
                          className="min-h-14"
                        >
                          <button
                            type="button"
                            disabled={queueRunning}
                            onClick={() => videoInputRef.current?.click()}
                            className="flex min-h-14 w-full items-center gap-2 rounded-lg border border-dashed border-slate-700 bg-slate-950/50 px-3 py-2 text-left hover:border-amber-500/50 disabled:cursor-wait disabled:opacity-60"
                          >
                            <Film className="h-4 w-4 shrink-0 text-amber-400" />
                            <span className="min-w-0 flex-1 truncate text-sm text-slate-200">
                              {file?.name || "Chọn hoặc thả video"}
                            </span>
                            {file?.job?.id === job?.id && <span className="shrink-0 rounded-full bg-sky-400/15 px-2 py-0.5 text-[10px] font-semibold text-sky-200">Đang preview</span>}
                            {file && !validVideo && (
                              <span className="text-[11px] text-rose-300">
                                Định dạng không hỗ trợ
                              </span>
                            )}
                            {file?.uploading && <span className="shrink-0 text-[11px] text-amber-300">Đang lưu vào project…</span>}
                            {file?.job && !file.uploading && <span className="shrink-0 text-[11px] text-emerald-300">Đã lưu</span>}
                            {file?.error && <span className="shrink-0 text-[11px] text-rose-300">Lỗi lưu</span>}
                            {rowState?.status === "uploading" && (
                              <span className="shrink-0 text-[11px] text-amber-300">
                                {rowState.progressPercent === undefined
                                  ? rowState.phase
                                  : `${Math.round(rowState.progressPercent)}%`}
                              </span>
                            )}
                          </button>
                        </div>
                      </td>
                      <td className="whitespace-nowrap p-2">
                        <div
                          onDragEnter={(event) => {
                            event.preventDefault();
                            event.stopPropagation();
                          }}
                          onDragOver={(event) => {
                            event.preventDefault();
                            event.stopPropagation();
                            event.dataTransfer.dropEffect = "copy";
                          }}
                          className="flex min-h-14 items-center justify-center"
                        >
                          <button
                            type="button"
                            disabled={queueRunning || Boolean(file?.uploading)}
                            onClick={() => openSrtBrowser(file?.job?.id)}
                            title={subtitle?.fileName ? `SRT: ${subtitle.fileName}` : "Chọn phụ đề SRT"}
                            aria-label={subtitle?.fileName ? `Thay đổi phụ đề SRT ${subtitle.fileName}` : "Chọn phụ đề SRT"}
                            className={`rounded-lg border p-2.5 transition-colors disabled:cursor-wait disabled:opacity-60 ${subtitle?.analysis && !subtitle.error ? "border-cyan-400/40 bg-cyan-400/10 text-cyan-300 hover:bg-cyan-400/20" : subtitle?.error ? "border-rose-500/30 bg-rose-950/20 text-rose-300" : "border-slate-700 bg-slate-950/50 text-slate-500 hover:border-slate-500 hover:text-slate-300"}`}
                          >
                            <FileText className="h-5 w-5" />
                          </button>
                        </div>
                      </td>
                      <td className="min-w-0 p-2">
                        <div className="flex min-w-0 flex-wrap items-center justify-end gap-2">
                          {file?.job && (
                            <button
                              type="button"
                              onClick={() => void previewSourceVideo(file.job!)}
                              disabled={file.job.status !== "completed" || file.uploading || queueRunning || settingsSyncRunning}
                              title={`Preview ${file.name}`}
                              aria-label={`Preview ${file.name}`}
                              className="rounded-lg border border-sky-500/30 bg-sky-950/20 p-2 text-sky-200 hover:bg-sky-950/40 disabled:cursor-not-allowed disabled:opacity-40"
                            >
                              <Play className="h-4 w-4" />
                            </button>
                          )}
                          <button
                            type="button"
                            onClick={() => {
                              setDetailRowIndex(index);
                              setFileDetailsOpen(true);
                            }}
                            disabled={!file && !subtitle}
                            className="rounded-lg border border-slate-700 bg-slate-950/70 px-2.5 py-1.5 text-xs font-semibold text-slate-200 hover:border-amber-500/40 disabled:cursor-not-allowed disabled:opacity-40"
                          >
                            Details
                          </button>
                          {rowState?.status === "completed" &&
                            rowState.jobId && (
                              <a
                                href={`/api/video-dubbing/jobs/${rowState.jobId}/download`}
                                download
                                className="rounded-lg border border-emerald-500/30 bg-emerald-950/20 px-2.5 py-1.5 text-xs font-semibold text-emerald-200 hover:bg-emerald-950/40"
                              >
                                Tải
                              </a>
                            )}
                          {(file || subtitle) && (
                            <button
                              type="button"
                              disabled={queueRunning}
                              onClick={() => {
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
                              className="rounded-lg border border-rose-500/25 bg-rose-950/20 px-2.5 py-1.5 text-xs font-semibold text-rose-200 hover:border-rose-400/50 disabled:cursor-not-allowed disabled:opacity-40"
                            >
                              Xóa
                            </button>
                          )}
                        </div>
                        {rowState && (
                          <p
                            className={`mt-1.5 text-[11px] ${
                              rowState.status === "failed"
                                ? "text-rose-300"
                                : rowState.status === "completed"
                                  ? "text-emerald-300"
                                  : "text-slate-400"
                            }`}
                          >
                            {rowState.status === "completed"
                              ? "Hoàn tất"
                              : rowState.status === "failed"
                                ? rowState.error || "Thất bại"
                                : rowState.status === "cancelled"
                                  ? "Đã hủy"
                                  : rowState.status === "queued"
                                    ? "Trong hàng đợi"
                                    : rowState.phase || "Đang xử lý"}
                            {rowState.status === "processing" &&
                              rowState.progressPercent !== undefined &&
                              ` · ${Math.round(rowState.progressPercent)}%`}
                          </p>
                        )}
                      </td>
                    </tr>
                  );
                },
              )}
            </tbody>
          </table>
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
          accept=".srt,application/x-subrip"
          onChange={(event) => void handleSrtChange(event)}
          className="hidden"
          aria-label="Chọn một hoặc nhiều phụ đề SRT"
        />
        <div className="flex flex-col gap-3 border-t border-slate-800 p-3 sm:flex-row sm:items-center sm:justify-between">
          <p className="text-xs text-slate-400">
            Ghép video và SRT theo cùng số thứ tự của hàng. Hàng đợi chạy tuần
            tự.
            {videoFiles.length !== subtitleFiles.length && (
              <span className="ml-1 text-amber-300">
                Cần số lượng video và SRT bằng nhau ({videoFiles.length} video,{" "}
                {subtitleFiles.length} SRT).
              </span>
            )}
          </p>
        </div>
      </section>
      )}
      </div>
      <div className="space-y-5 min-w-0 xl:col-start-2 xl:row-start-4">
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
            <div id="video-dubbing-mixer-panel" className="grid min-w-0 items-start gap-4 lg:grid-cols-[minmax(0,1fr)_minmax(300px,360px)]">
              <div className="space-y-4">
              <div role="tablist" aria-label="Video preview" className="flex gap-1 rounded-xl border border-slate-800 bg-slate-950/70 p-1">
                <button type="button" role="tab" aria-selected={videoWorkspaceTab === "preview"} onClick={() => setVideoWorkspaceTab("preview")} className={`flex-1 rounded-lg px-3 py-2 text-xs font-semibold ${videoWorkspaceTab === "preview" ? "bg-cyan-400 text-slate-950" : "text-slate-300 hover:bg-slate-800"}`}>Video Mixer Preview</button>
                <button type="button" role="tab" aria-selected={videoWorkspaceTab === "merged"} onClick={() => setVideoWorkspaceTab("merged")} className={`flex-1 rounded-lg px-3 py-2 text-xs font-semibold ${videoWorkspaceTab === "merged" ? "bg-emerald-400 text-slate-950" : "text-slate-300 hover:bg-slate-800"}`}>Merged Video</button>
              </div>
              <div className="space-y-3 rounded-xl border border-slate-800 bg-black/40 p-3">
                <div className={`flex justify-center ${videoWorkspaceTab === "preview" ? "" : "hidden"}`}>
                  <div ref={previewStageRef} className="relative inline-block max-w-full overflow-hidden rounded-lg bg-black">
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
                      className="block h-auto max-h-[min(60vh,640px)] max-w-full rounded-lg bg-black object-contain"
                      aria-label="Video nguồn"
                    />
                    {logoEnabled && job.overlaySettings?.logoFileName && (
                      <div
                        className="pointer-events-none absolute inset-0 flex"
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
                    {activePreviewSubtitle && (
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
                    {activePreviewText && activePreviewTextIndex >= 0 && (() => {
                      const cue = activePreviewText;
                      const index = activePreviewTextIndex;
                      const customPosition = Number.isFinite(cue.xPercent) && Number.isFinite(cue.yPercent);
                      const selected = selectedTextOverlay === index;
                      const content = (
                        <div
                          onPointerDown={(event) => startTextOverlayPreviewDrag(event, index)}
                          className={`pointer-events-auto touch-none cursor-move rounded-sm ${selected ? "outline outline-1 outline-dashed outline-violet-300/80" : ""}`}
                          title="Kéo để đổi vị trí text"
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
                          />
                        </div>
                      );
                      return customPosition ? (
                        <div className="absolute z-10" style={{ left: `${cue.xPercent}%`, top: `${cue.yPercent}%`, transform: "translate(-50%, -50%)" }}>
                          {content}
                        </div>
                      ) : (
                        <div className="pointer-events-none absolute inset-0 flex" style={{
                          justifyContent: getOverlayAlignment(cue.position).horizontal,
                          alignItems: getOverlayAlignment(cue.position).vertical,
                          padding: `${24 * previewOverlayScale}px`,
                        }}>
                          {content}
                        </div>
                      );
                    })()}
                  </div>
                </div>
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
                      !hasPreviewTrack ||
                      !videoPreviewReady ||
                      isMediaProcessing
                    }
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
                <p className={`text-[10px] leading-relaxed text-slate-500 ${videoWorkspaceTab === "preview" ? "" : "hidden"}`}>
                  Video là mốc thời gian chính; nguồn video được làm im lặng
                  trong preview. Các track chưa có hoặc chưa xác minh sẽ không
                  thể chọn.
                </p>
              </div>
              {videoWorkspaceTab === "preview" && (
                <section className="space-y-3 rounded-xl border border-slate-800 bg-slate-950/60 p-3">
                  <div className="flex flex-wrap items-center justify-between gap-3">
                    <div>
                      <h4 className="text-xs font-semibold text-white">Timeline phụ đề</h4>
                      <p className="mt-1 text-[10px] text-slate-500">Bấm clip để tua · kéo clip để di chuyển · kéo mép clip để chỉnh thời gian</p>
                    </div>
                    <div className="flex items-center gap-2 text-[10px] text-slate-400">
                      <span>{previewSubtitleCues.length} câu</span>
                      <button type="button" onClick={() => {
                        const startTime = Math.min(previewCurrentTime, Math.max(0, subtitleTimelineDuration - 0.1));
                        const next = [...textOverlays, {
                          startTime,
                          endTime: Math.min(subtitleTimelineDuration, startTime + 3),
                          text: "Text mới",
                          fontSize: 36,
                          fontFamily: "Arial",
                          color: "#ffffff",
                          bold: false,
                          italic: false,
                          underline: false,
                          textCase: "none" as const,
                          outlineEnabled: false,
                          outlineColor: "#000000",
                          outlineWidthPx: 2,
                          characterSpacingPx: 0,
                          lineSpacingPx: 0,
                          position: "middle-center" as VideoDubbingOverlayPosition,
                          backgroundColor: "#000000",
                          backgroundTransparent: true,
                          paddingPx: 8,
                        }];
                        setTextOverlays(next);
                        setSelectedTextOverlay(next.length - 1);
                      }} className="inline-flex items-center gap-1 rounded-md border border-cyan-500/30 px-2 py-1 text-cyan-200 hover:bg-cyan-950/40"><Plus className="h-3 w-3" />Text</button>
                      <label className="flex items-center gap-2">Zoom
                        <input type="range" min={8} max={36} step={1} value={subtitleTimelineZoom} onChange={(event) => setSubtitleTimelineZoom(Number(event.target.value))} className="w-20 accent-cyan-400" aria-label="Zoom timeline phụ đề" />
                      </label>
                    </div>
                  </div>
                  {previewSubtitleCues.length === 0 ? (
                    <p className="rounded-lg border border-dashed border-slate-700 p-4 text-xs text-slate-500">Chọn file SRT để tạo các clip phụ đề trên timeline.</p>
                  ) : (
                    <div className="max-h-64 overflow-auto rounded-lg border border-slate-800 bg-slate-900/50">
                      <div style={{ width: `${subtitleTimelineWidth}px` }}>
                        <div className="relative h-7 border-b border-slate-700 bg-slate-950/80">
                          {subtitleTimelineTicks.map((tick) => (
                            <span key={tick} className="absolute top-1 text-[9px] tabular-nums text-slate-500" style={{ left: `${(tick / subtitleTimelineDuration) * subtitleTimelineWidth}px` }}>{formatElapsed(tick)}</span>
                          ))}
                        </div>
                        <div
                          ref={subtitleTimelineTrackRef}
                          className="relative cursor-crosshair bg-slate-950/30"
                          style={{ height: `${Math.max(54, subtitleTimelineLaneEnds.length * 34 + 10)}px` }}
                          onClick={(event) => {
                            if (event.target !== event.currentTarget || !videoPreviewReady) return;
                            const bounds = event.currentTarget.getBoundingClientRect();
                            const position = Math.max(0, Math.min(1, (event.clientX - bounds.left) / bounds.width));
                            seekMixerPreview(position * subtitleTimelineDuration);
                          }}
                        >
                          {subtitleTimelineTicks.map((tick) => (
                            <span key={`grid-${tick}`} className="pointer-events-none absolute inset-y-0 border-l border-slate-800/80" style={{ left: `${(tick / subtitleTimelineDuration) * subtitleTimelineWidth}px` }} />
                          ))}
                          <span className="pointer-events-none absolute inset-y-0 z-20 border-l-2 border-rose-400" style={{ left: `${(previewCurrentTime / subtitleTimelineDuration) * subtitleTimelineWidth}px` }} />
                          {subtitleTimelineItems.map(({ cue, index, lane }) => {
                            const active = cue.startTime <= previewCurrentTime && cue.endTime >= previewCurrentTime;
                            const left = (cue.startTime / subtitleTimelineDuration) * subtitleTimelineWidth;
                            const width = Math.max(14, ((cue.endTime - cue.startTime) / subtitleTimelineDuration) * subtitleTimelineWidth);
                            return (
                              <div
                                key={`${cue.startTime}-${cue.endTime}-${index}`}
                                role="button"
                                tabIndex={0}
                                title={`${index + 1}. ${cue.text}\n${formatDuration(cue.startTime)} – ${formatDuration(cue.endTime)}`}
                                onClick={(event) => { event.stopPropagation(); seekMixerPreview(cue.startTime); }}
                                onKeyDown={(event) => { if (event.key === "Enter" || event.key === " ") { event.preventDefault(); seekMixerPreview(cue.startTime); } }}
                                onPointerDown={(event) => startSubtitleTimelineDrag(event, index, cue.startTime, cue.endTime, "move")}
                                className={`absolute z-10 flex h-7 select-none items-center overflow-hidden rounded-md border px-1 text-[9px] text-white shadow-sm ${previewSubtitleCues.length ? "cursor-grab active:cursor-grabbing" : "cursor-pointer"} ${active ? "border-cyan-200 bg-cyan-500/80" : "border-cyan-500/50 bg-cyan-700/70 hover:bg-cyan-600/80"}`}
                                style={{ left: `${left}px`, top: `${5 + lane * 34}px`, width: `${width}px` }}
                              >
                                {previewSubtitleCues.length > 0 && <span onClick={(event) => event.stopPropagation()} onPointerDown={(event) => startSubtitleTimelineDrag(event, index, cue.startTime, cue.endTime, "start")} className="absolute inset-y-0 left-0 z-20 w-1.5 cursor-ew-resize bg-cyan-100/80" aria-label={`Chỉnh điểm bắt đầu câu ${index + 1}`} />}
                                <span className="pointer-events-none truncate px-1">{index + 1}. {cue.text}</span>
                                {previewSubtitleCues.length > 0 && <span onClick={(event) => event.stopPropagation()} onPointerDown={(event) => startSubtitleTimelineDrag(event, index, cue.startTime, cue.endTime, "end")} className="absolute inset-y-0 right-0 z-20 w-1.5 cursor-ew-resize bg-cyan-100/80" aria-label={`Chỉnh điểm kết thúc câu ${index + 1}`} />}
                              </div>
                            );
                          })}
                        </div>
                        <div className="relative h-8 border-t border-slate-800 bg-violet-950/10" onClick={(event) => {
                          if (event.target !== event.currentTarget || !videoPreviewReady) return;
                          const bounds = event.currentTarget.getBoundingClientRect();
                          const position = Math.max(0, Math.min(1, (event.clientX - bounds.left) / bounds.width));
                          seekMixerPreview(position * subtitleTimelineDuration);
                        }}>
                          <span className="absolute left-2 top-2 z-20 text-[9px] font-semibold text-violet-300">TEXT</span>
                          <span className="pointer-events-none absolute inset-y-0 z-20 border-l-2 border-rose-400" style={{ left: `${(previewCurrentTime / subtitleTimelineDuration) * subtitleTimelineWidth}px` }} />
                          {textOverlays.map((cue, index) => {
                            const left = (cue.startTime / subtitleTimelineDuration) * subtitleTimelineWidth;
                            const width = Math.max(18, ((cue.endTime - cue.startTime) / subtitleTimelineDuration) * subtitleTimelineWidth);
                            return <div key={`text-${index}`} role="button" tabIndex={0} title={`${cue.text}\n${formatDuration(cue.startTime)} – ${formatDuration(cue.endTime)}`} onClick={(event) => { event.stopPropagation(); setSelectedTextOverlay(index); seekMixerPreview(cue.startTime); }} onPointerDown={(event) => startSubtitleTimelineDrag(event, index, cue.startTime, cue.endTime, "move", "text")} className={`absolute inset-y-1 z-10 flex select-none items-center overflow-hidden rounded-md border px-1 text-[9px] text-white ${selectedTextOverlay === index ? "border-violet-200 bg-violet-500/90" : "border-violet-400/50 bg-violet-700/75"} cursor-grab active:cursor-grabbing`} style={{ left: `${left}px`, width: `${width}px` }}>
                              <span onClick={(event) => event.stopPropagation()} onPointerDown={(event) => startSubtitleTimelineDrag(event, index, cue.startTime, cue.endTime, "start", "text")} className="absolute inset-y-0 left-0 z-20 w-1.5 cursor-ew-resize bg-violet-100/80" />
                              <span className="pointer-events-none truncate px-1">{cue.text}</span>
                              <span onClick={(event) => event.stopPropagation()} onPointerDown={(event) => startSubtitleTimelineDrag(event, index, cue.startTime, cue.endTime, "end", "text")} className="absolute inset-y-0 right-0 z-20 w-1.5 cursor-ew-resize bg-violet-100/80" />
                            </div>;
                          })}
                        </div>
                      </div>
                    </div>
                  )}
                  {selectedTextOverlay !== null && textOverlays[selectedTextOverlay] && (() => {
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
                    return <div className="grid gap-2 rounded-lg border border-violet-500/20 bg-violet-950/10 p-3 sm:grid-cols-2 xl:grid-cols-4">
                      <p className="text-[10px] text-violet-200 sm:col-span-2 xl:col-span-4">Kéo trực tiếp text trên preview để đặt vị trí; kéo giữ nguyên vị trí trong khung hình khi export.</p>
                      <label className="space-y-1 text-[10px] text-slate-400 sm:col-span-2">Nội dung<textarea value={cue.text} onChange={(event) => updateSelectedTextOverlay({ text: event.target.value })} rows={2} className="w-full rounded-md border border-slate-700 bg-slate-950 px-2 py-1.5 text-xs text-white" /></label>
                      <div className="sm:col-span-2 xl:col-span-4"><TextStyleControls value={textStyleValue} onChange={updateSelectedTextOverlay} fontOptions={subtitleFontOptions} /></div>
                      <label className="space-y-1 text-[10px] text-slate-400">Vị trí neo<select value={cue.position} onChange={(event) => updateSelectedTextOverlay({ position: event.target.value as VideoDubbingOverlayPosition, xPercent: undefined, yPercent: undefined })} className="w-full rounded-md border border-slate-700 bg-slate-950 px-2 py-1.5 text-xs text-white">{OVERLAY_POSITION_OPTIONS.map((option) => <option key={option.value} value={option.value}>{option.label}</option>)}</select></label>
                      {(cue.xPercent !== undefined || cue.yPercent !== undefined) && <button type="button" onClick={() => updateSelectedTextOverlay({ xPercent: undefined, yPercent: undefined })} className="self-end rounded-md border border-violet-500/30 px-2 py-1.5 text-xs text-violet-200">Đặt lại vị trí neo</button>}
                      <label className="inline-flex items-center gap-2 text-xs text-slate-300"><input type="checkbox" checked={cue.backgroundTransparent} onChange={(event) => updateSelectedTextOverlay({ backgroundTransparent: event.target.checked })} className="accent-violet-400" />Nền trong suốt</label>
                      {!cue.backgroundTransparent && <label className="space-y-1 text-[10px] text-slate-400">Màu nền<input type="color" value={cue.backgroundColor} onChange={(event) => updateSelectedTextOverlay({ backgroundColor: event.target.value })} className="h-8 w-full rounded-md border border-slate-700 bg-slate-950" /></label>}
                      <button type="button" onClick={() => { setTextOverlays((items) => items.filter((_, index) => index !== selectedTextOverlay)); setSelectedTextOverlay(null); }} className="inline-flex items-center justify-center gap-1 rounded-md border border-rose-500/30 px-2 py-1 text-xs text-rose-200"><Trash2 className="h-3 w-3" />Xóa text</button>
                    </div>;
                  })()}
                </section>
              )}
              </div>

              <div className="space-y-4">

              {!hasMasterAudio && (
                <p className="rounded-lg border border-amber-500/25 bg-amber-950/20 p-3 text-xs text-amber-200">
                  Cần tạo TTS Master bằng pipeline hiện có trước khi render
                  final mix. Các track vocals/instrumental có thể nghe riêng ở
                  phần tách audio phía trên.
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
                        Chèn logo
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
          </div>
          <div className="flex min-h-64 flex-col items-center justify-center gap-3 p-6 text-center">
            <Film className="h-9 w-9 text-cyan-400" />
            <h3 className="font-semibold text-white">{videoWorkspaceTab === "preview" ? "Chưa có video preview" : "Chưa có video đã merge"}</h3>
            <p className="max-w-md text-sm text-slate-400">Chọn video nguồn và chạy hàng đợi để xem mixer preview; video export hoàn tất sẽ xuất hiện trong tab Merged Video.</p>
          </div>
        </section>
      )}


      </div>

    </section>
  );
}
