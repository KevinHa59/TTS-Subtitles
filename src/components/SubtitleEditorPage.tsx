import { useEffect, useMemo, useRef, useState, type DragEvent } from "react";
import {
  AlertCircle,
  Captions,
  CheckCircle2,
  Copy,
  Download,
  FileVideo2,
  Languages,
  LoaderCircle,
  Maximize2,
  Minimize2,
  Pause,
  Play,
  Plus,
  Settings,
  Square,
  Subtitles,
  Trash2,
  Upload,
  X,
  Zap, // for Gemini/AI indicator
  Cpu, // for FreeLLM indicator
  Globe, // for language detection
  RefreshCw, // for auto-detect
} from "lucide-react";
import SubtitleTimeline from "./SubtitleTimeline";
import {
  applyRawSubtitleText,
  createSubtitleCueAtTime,
  formatEditableSubtitles,
  parseEditableSubtitles,
  type EditableSubtitleCue,
} from "../utils/subtitleEditor";
import SubtitleList from "./SubtitleEditorPage/SubtitleList";

type VideoSubtitleStatus =
  | "missing-subtitle"
  | "missing-video"
  | "ready"
  | "translated"
  | "translating"
  | "error";
type VideoFrameElement = HTMLVideoElement & {
  requestVideoFrameCallback?: (
    callback: (_now: number, metadata: { mediaTime: number }) => void,
  ) => number;
  cancelVideoFrameCallback?: (callbackId: number) => void;
};
type VideoSubtitleItem = {
  id: string;
  video: File | null;
  subtitleFile: File | null;
  cues: EditableSubtitleCue[];
  status: VideoSubtitleStatus;
  error?: string;
};
type TranslationProgress = {
  completed: number;
  total: number;
  currentVideo: string;
  message: string;
};
type TranslationPromptResponse = {
  success: boolean;
  prompt?: string;
  error?: string;
};

type TranslationProvider = "local" | "gemini" | "freellm";
type GeminiStatusResponse = {
  success: boolean;
  status: {
    configured: boolean;
    totalKeys: number;
    availableKeys: number;
    model: string;
    fallbackModels?: string[];
  };
};
type FreeLLMStatusResponse = {
  success: boolean;
  status: {
    configured: boolean;
    providers: Array<{
      name: string;
      model: string;
      baseUrl: string;
      fallbackModels?: string[];
      priority?: number;
    }>;
    temperature: number;
    topP: number;
    maxTokens: number;
  };
};

const isVideoFile = (file: File) =>
  file.type.startsWith("video/") ||
  /\.(mp4|m4v|mkv|mov|webm|avi|mpeg|mpg|wmv|flv|ts|mts)$/i.test(file.name);
const isSrtFile = (file: File) => /\.srt$/i.test(file.name);
const basename = (name: string) =>
  name
    .replace(/\.[^.]+$/, "")
    .trim()
    .toLocaleLowerCase();
const fileKey = (file: File) =>
  `${file.name}:${file.size}:${file.lastModified}`;
const cueTime = (seconds: number) => {
  const value = Math.max(0, Math.floor(Number.isFinite(seconds) ? seconds : 0));
  const hours = Math.floor(value / 3600);
  const minutes = Math.floor((value % 3600) / 60);
  const remaining = value % 60;
  return hours > 0
    ? `${hours}:${String(minutes).padStart(2, "0")}:${String(remaining).padStart(2, "0")}`
    : `${minutes}:${String(remaining).padStart(2, "0")}`;
};

// Supported languages for translation
const SUPPORTED_LANGUAGES = [
  { code: "auto", name: "🔍 Tự động phát hiện" },
  { code: "English", name: "🇺🇸 English" },
  { code: "Vietnamese", name: "🇻🇳 Tiếng Việt" },
  { code: "Chinese", name: "🇨🇳 Chinese (中文)" },
  { code: "Japanese", name: "🇯🇵 Japanese (日本語)" },
  { code: "Korean", name: "🇰🇷 Korean (한국어)" },
  { code: "French", name: "🇫🇷 French (Français)" },
  { code: "Spanish", name: "🇪🇸 Spanish (Español)" },
  { code: "German", name: "🇩🇪 German (Deutsch)" },
  { code: "Russian", name: "🇷🇺 Russian (Русский)" },
  { code: "Thai", name: "🇹🇭 Thai (ไทย)" },
  { code: "Indonesian", name: "🇮🇩 Indonesian" },
  { code: "Portuguese", name: "🇵🇹 Portuguese" },
  { code: "Italian", name: "🇮🇹 Italian" },
  { code: "Arabic", name: "🇸🇦 Arabic (العربية)" },
  { code: "Hindi", name: "🇮🇳 Hindi (हिन्दी)" },
  { code: "Turkish", name: "🇹🇷 Turkish" },
];

// Simple language detection based on character patterns
function detectLanguage(text: string): string {
  const sample = text.slice(0, 2000);

  // Vietnamese detection (diacritics)
  if (
    /[àáạảãâầấậẩẫăằắặẳẵèéẹẻẽêềếệểễìíịỉĩòóọỏõôồốộổỗơờớợởỡùúụủũưừứựửữỳýỵỷỹđĐ]/.test(
      sample,
    )
  ) {
    return "Vietnamese";
  }

  // Chinese detection (CJK unified ideographs)
  if (/[\u4e00-\u9fff]/.test(sample)) {
    return "Chinese";
  }

  // Japanese detection (Hiragana/Katakana)
  if (/[\u3040-\u309f\u30a0-\u30ff]/.test(sample)) {
    return "Japanese";
  }

  // Korean detection (Hangul)
  if (/[\uac00-\ud7af]/.test(sample)) {
    return "Korean";
  }

  // Arabic detection
  if (/[\u0600-\u06ff]/.test(sample)) {
    return "Arabic";
  }

  // Thai detection
  if (/[\u0e00-\u0e7f]/.test(sample)) {
    return "Thai";
  }

  // Hindi/Devanagari detection
  if (/[\u0900-\u097f]/.test(sample)) {
    return "Hindi";
  }

  // Cyrillic (Russian, etc.)
  if (/[\u0400-\u04ff]/.test(sample)) {
    return "Russian";
  }

  // Default to English for Latin script
  return "English";
}

// Get translation config from server
async function fetchTranslationConfig(): Promise<{
  sourceLanguage: string;
  targetLanguage: string;
} | null> {
  try {
    const response = await fetch("/api/subtitle-translation/state");
    const data = await response.json();
    if (data.success && data.state?.config) {
      return {
        sourceLanguage: data.state.config.sourceLanguage,
        targetLanguage: data.state.config.targetLanguage,
      };
    }
  } catch (error) {
    console.warn("Failed to fetch translation config:", error);
  }
  return null;
}

// Save translation config to server
async function saveTranslationConfig(
  sourceLanguage: string,
  targetLanguage: string,
): Promise<boolean> {
  try {
    const response = await fetch("/api/subtitle-translation/config", {
      method: "PUT",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ sourceLanguage, targetLanguage }),
    });
    const data = await response.json();
    return data.success;
  } catch (error) {
    console.warn("Failed to save translation config:", error);
    return false;
  }
}

function RawSubtitleColumn({
  title,
  translated,
  cues,
  disabled,
  onApply,
}: {
  title: string;
  translated: boolean;
  cues: EditableSubtitleCue[];
  disabled: boolean;
  onApply: (cues: EditableSubtitleCue[]) => void;
}) {
  const externalText = useMemo(
    () => formatEditableSubtitles(cues, translated),
    [cues, translated],
  );
  const [draft, setDraft] = useState(externalText);
  const [error, setError] = useState("");
  const [copyMessage, setCopyMessage] = useState("");
  const lastAppliedTextRef = useRef<string | null>(null);

  useEffect(() => {
    if (lastAppliedTextRef.current === externalText) {
      lastAppliedTextRef.current = null;
      return;
    }
    lastAppliedTextRef.current = null;
    setDraft(externalText);
    setError("");
  }, [externalText]);

  const handleChange = (value: string) => {
    setDraft(value);
    setError("");
    setCopyMessage("");
    try {
      const next = applyRawSubtitleText(value, cues, translated);
      lastAppliedTextRef.current = formatEditableSubtitles(next, translated);
      onApply(next);
    } catch (parseError) {
      setError(
        parseError instanceof Error ? parseError.message : String(parseError),
      );
    }
  };

  const copyDraft = async () => {
    try {
      await navigator.clipboard.writeText(draft);
      setCopyMessage("Đã copy");
      setError("");
    } catch (copyError) {
      setCopyMessage("");
      setError(
        `Không thể copy: ${copyError instanceof Error ? copyError.message : String(copyError)}`,
      );
    }
  };

  return (
    <section className="flex min-h-0 flex-1 flex-col overflow-hidden rounded-none border border-slate-800 bg-slate-950/50">
      <header className="flex items-center justify-between gap-2 border-b border-slate-800 px-3 py-2 shrink-0 bg-slate-900/60">
        <div className="min-w-0">
          <h3 className="truncate text-[11px] font-bold text-slate-200">
            {title}
          </h3>
          <p className="text-[9px] text-slate-500">
            {cues.length} câu · định dạng SRT
          </p>
        </div>
        <button
          type="button"
          onClick={() => void copyDraft()}
          className="inline-flex shrink-0 items-center gap-1 rounded-none border border-slate-700 px-2 py-1 text-[10px] font-semibold text-slate-300 hover:border-cyan-500/40 hover:text-cyan-200 cursor-pointer"
        >
          <Copy className="h-3 w-3" />
          {copyMessage || "Copy"}
        </button>
      </header>
      <textarea
        aria-label={`${title} dạng SRT`}
        value={draft}
        disabled={disabled}
        spellCheck={false}
        onChange={(event) => handleChange(event.target.value)}
        className="min-h-0 flex-1 resize-none bg-slate-950/50 p-3 font-mono text-[10px] leading-relaxed text-slate-200 outline-none placeholder:text-slate-600 focus:bg-slate-950 disabled:opacity-60"
      />
      {error && (
        <p
          role="alert"
          className="border-t border-rose-500/20 bg-rose-500/5 px-3 py-1.5 text-[9px] text-rose-300"
        >
          {error}
        </p>
      )}
    </section>
  );
}

function statusLabel(status: VideoSubtitleStatus) {
  switch (status) {
    case "ready":
      return "Sẵn sàng";
    case "translated":
      return "Đã dịch";
    case "translating":
      return "Đang dịch";
    case "error":
      return "Lỗi";
    case "missing-video":
      return "Thiếu video";
    default:
      return "Thiếu SRT";
  }
}

function statusColor(status: VideoSubtitleStatus) {
  switch (status) {
    case "ready":
      return "text-cyan-300";
    case "translated":
      return "text-emerald-300";
    case "translating":
      return "text-violet-300";
    case "error":
      return "text-rose-300";
    default:
      return "text-amber-300";
  }
}

export default function SubtitleEditorPage({
  onOpenSetup,
}: {
  onOpenSetup: () => void;
}) {
  const fileInputRef = useRef<HTMLInputElement>(null);
  const videoRef = useRef<HTMLVideoElement>(null);
  const previewFrameRef = useRef<HTMLDivElement>(null);
  const subtitleListRef = useRef<HTMLDivElement>(null);
  const subtitleCueElementsRef = useRef(new Map<number, HTMLElement>());
  const translationAbortControllerRef = useRef<AbortController | null>(null);
  const [items, setItems] = useState<VideoSubtitleItem[]>([]);
  const [selectedId, setSelectedId] = useState("");
  const [videoUrl, setVideoUrl] = useState<string | null>(null);
  const [previewFullscreen, setPreviewFullscreen] = useState(false);
  const [videoAspectRatio, setVideoAspectRatio] = useState(16 / 9);
  const [videoDuration, setVideoDuration] = useState(0);
  const [videoCurrentTime, setVideoCurrentTime] = useState(0);
  const [videoPaused, setVideoPaused] = useState(true);
  const [activeCueIndex, setActiveCueIndex] = useState(-1);
  const activeCueIndexRef = useRef(-1);
  const [showTranslation, setShowTranslation] = useState(true);
  const [rawDialogOpen, setRawDialogOpen] = useState(false);
  const [dragging, setDragging] = useState(false);
  const [translationMode, setTranslationMode] = useState<
    "single" | "all" | null
  >(null);
  const [translationProgress, setTranslationProgress] =
    useState<TranslationProgress | null>(null);
  const [promptDialogOpen, setPromptDialogOpen] = useState(false);
  const [promptLoading, setPromptLoading] = useState(false);
  const [promptError, setPromptError] = useState("");
  const [promptDefault, setPromptDefault] = useState("");
  const [customPrompt, setCustomPrompt] = useState<string | null>(null);
  const [promptDraft, setPromptDraft] = useState("");
  const [batchMessage, setBatchMessage] = useState("");

  // Translation provider state
  const [translationProvider, setTranslationProvider] =
    useState<TranslationProvider>("local");
  const [geminiStatus, setGeminiStatus] = useState<
    GeminiStatusResponse["status"] | null
  >(null);
  const [geminiStatusLoading, setGeminiStatusLoading] = useState(true);
  const [freeLlmStatus, setFreeLlmStatus] = useState<{
    configured: boolean;
    providers: Array<{
      name: string;
      model: string;
      baseUrl: string;
      fallbackModels?: string[];
      priority?: number;
    }>;
    temperature: number;
    topP: number;
    maxTokens: number;
  } | null>(null);
  const [freeLlmStatusLoading, setFreeLlmStatusLoading] = useState(true);

  // Translation language state
  const [sourceLanguage, setSourceLanguage] = useState("English");
  const [targetLanguage, setTargetLanguage] = useState("Vietnamese");
  const [langConfigLoading, setLangConfigLoading] = useState(true);

  const selectedItem = items.find((item) => item.id === selectedId) || null;
  const activeCue = useMemo(
    () => selectedItem?.cues[activeCueIndex] || null,
    [activeCueIndex, selectedItem],
  );
  const translationInProgress = translationMode !== null;
  const scrollSubtitleCueIntoView = (index: number) => {
    window.requestAnimationFrame(() => {
      const container = subtitleListRef.current;
      const cueElement = subtitleCueElementsRef.current.get(index);

      if (!container || !cueElement) return;
      const topOffset = 120;
      container.scrollTo({
        top: cueElement.offsetTop - topOffset,
        behavior: "smooth",
      });
    });
  };

  useEffect(() => {
    if (activeCueIndex < 0) return;
    scrollSubtitleCueIntoView(activeCueIndex);
  }, [activeCueIndex, selectedId, selectedItem?.cues.length]);

  useEffect(() => {
    if (!items.some((item) => item.id === selectedId)) {
      setSelectedId(items[0]?.id || "");
    }
  }, [items, selectedId]);

  // Fetch Gemini status on mount
  useEffect(() => {
    const fetchGeminiStatus = async () => {
      try {
        const response = await fetch("/api/subtitle-translation/gemini/status");
        const data = (await response.json()) as GeminiStatusResponse;
        if (data.success) {
          setGeminiStatus(data.status);
        }
      } catch (error) {
        console.warn("Failed to fetch Gemini status:", error);
      } finally {
        setGeminiStatusLoading(false);
      }
    };
    fetchGeminiStatus();
  }, []);

  // Fetch FreeLLM status on mount
  useEffect(() => {
    const fetchFreeLlmStatus = async () => {
      try {
        const response = await fetch(
          "/api/subtitle-translation/freellm/status",
        );
        const data = (await response.json()) as FreeLLMStatusResponse;
        if (data.success) {
          setFreeLlmStatus(data.status);
        }
      } catch (error) {
        console.warn("Failed to fetch FreeLLM status:", error);
      } finally {
        setFreeLlmStatusLoading(false);
      }
    };
    fetchFreeLlmStatus();
  }, []);

  // Fetch translation config (source/target language) on mount
  useEffect(() => {
    const fetchConfig = async () => {
      try {
        const config = await fetchTranslationConfig();
        if (config) {
          setSourceLanguage(config.sourceLanguage);
          setTargetLanguage(config.targetLanguage);
        }
      } catch (error) {
        console.warn("Failed to fetch translation config:", error);
      } finally {
        setLangConfigLoading(false);
      }
    };
    fetchConfig();
  }, []);

  useEffect(() => {
    if (!selectedItem?.video) {
      setVideoUrl(null);
      return;
    }
    const url = URL.createObjectURL(selectedItem.video);
    setVideoUrl(url);
    setVideoAspectRatio(16 / 9);
    setVideoDuration(0);
    setVideoCurrentTime(0);
    setVideoPaused(true);
    return () => URL.revokeObjectURL(url);
  }, [selectedItem?.id, selectedItem?.video]);

  useEffect(() => {
    const syncFullscreenState = () => {
      setPreviewFullscreen(
        document.fullscreenElement === previewFrameRef.current,
      );
    };
    document.addEventListener("fullscreenchange", syncFullscreenState);
    return () =>
      document.removeEventListener("fullscreenchange", syncFullscreenState);
  }, []);

  useEffect(() => {
    const video = videoRef.current as VideoFrameElement | null;
    if (!video || !selectedItem) return;
    let disposed = false;
    let frameCallbackId: number | null = null;
    let animationFrameId: number | null = null;

    const updateActiveCue = (time: number) => {
      const nextIndex = selectedItem.cues.findIndex(
        (cue) => time >= cue.startTime && time < cue.endTime,
      );
      if (nextIndex !== activeCueIndexRef.current) {
        activeCueIndexRef.current = nextIndex;
        setActiveCueIndex(nextIndex);
      }
    };

    const scheduleVideoFrame = () => {
      if (disposed || video.paused || video.ended) return;
      if (video.requestVideoFrameCallback) {
        frameCallbackId = video.requestVideoFrameCallback((_now, metadata) => {
          updateActiveCue(metadata.mediaTime);
          scheduleVideoFrame();
        });
      } else {
        animationFrameId = window.requestAnimationFrame(() => {
          updateActiveCue(video.currentTime);
          scheduleVideoFrame();
        });
      }
    };

    const onVideoTimeEvent = () => {
      setVideoCurrentTime(video.currentTime);
      updateActiveCue(video.currentTime);
    };
    const onPlay = () => {
      setVideoPaused(false);
      setVideoCurrentTime(video.currentTime);
      updateActiveCue(video.currentTime);
      scheduleVideoFrame();
    };
    const onPause = () => setVideoPaused(true);

    video.addEventListener("timeupdate", onVideoTimeEvent);
    video.addEventListener("seeked", onVideoTimeEvent);
    video.addEventListener("loadeddata", onVideoTimeEvent);
    video.addEventListener("play", onPlay);
    video.addEventListener("pause", onPause);
    video.addEventListener("pause", onVideoTimeEvent);
    setVideoCurrentTime(video.currentTime);
    updateActiveCue(video.currentTime);
    if (!video.paused) scheduleVideoFrame();

    return () => {
      disposed = true;
      video.removeEventListener("timeupdate", onVideoTimeEvent);
      video.removeEventListener("seeked", onVideoTimeEvent);
      video.removeEventListener("loadeddata", onVideoTimeEvent);
      video.removeEventListener("play", onPlay);
      video.removeEventListener("pause", onPause);
      video.removeEventListener("pause", onVideoTimeEvent);
      if (frameCallbackId !== null)
        video.cancelVideoFrameCallback?.(frameCallbackId);
      if (animationFrameId !== null)
        window.cancelAnimationFrame(animationFrameId);
    };
  }, [selectedItem?.cues, selectedItem?.id, videoUrl]);

  const addFiles = async (inputFiles: FileList | File[]) => {
    const files = Array.from(inputFiles);
    const videos = files.filter(isVideoFile);
    const subtitleFiles = files.filter(isSrtFile);
    if (!videos.length && !subtitleFiles.length) {
      setBatchMessage("Hãy chọn video và/hoặc tệp phụ đề .srt.");
      return;
    }
    const parsedFiles = await Promise.all(
      subtitleFiles.map(async (file) => {
        try {
          const cues = parseEditableSubtitles(await file.text());
          if (!cues.length)
            throw new Error("Không tìm thấy câu phụ đề hợp lệ.");
          return { file, cues, error: undefined };
        } catch (error) {
          return {
            file,
            cues: [],
            error: error instanceof Error ? error.message : String(error),
          };
        }
      }),
    );

    setItems((current) => {
      const next = [...current];
      for (const video of videos) {
        if (
          next.some(
            (item) => item.video && fileKey(item.video) === fileKey(video),
          )
        )
          continue;
        const unmatchedSubtitle = next.find(
          (item) =>
            !item.video &&
            item.subtitleFile &&
            basename(item.subtitleFile.name) === basename(video.name),
        );
        if (unmatchedSubtitle) {
          unmatchedSubtitle.video = video;
          unmatchedSubtitle.status = unmatchedSubtitle.error
            ? "error"
            : "ready";
        } else {
          const item: VideoSubtitleItem = {
            id: crypto.randomUUID(),
            video,
            subtitleFile: null,
            cues: [],
            status: "missing-subtitle",
          };
          next.push(item);
        }
      }
      for (const parsed of parsedFiles) {
        const matchingVideo = next.find(
          (item) =>
            item.video &&
            !item.subtitleFile &&
            basename(item.video.name) === basename(parsed.file.name),
        );
        if (matchingVideo) {
          matchingVideo.subtitleFile = parsed.file;
          matchingVideo.cues = parsed.cues;
          matchingVideo.error = parsed.error;
          matchingVideo.status = parsed.error ? "error" : "ready";
        } else {
          const duplicateSubtitle = next.some(
            (item) =>
              item.subtitleFile &&
              basename(item.subtitleFile.name) === basename(parsed.file.name),
          );
          const item: VideoSubtitleItem = {
            id: crypto.randomUUID(),
            video: null,
            subtitleFile: parsed.file,
            cues: parsed.cues,
            status:
              parsed.error || duplicateSubtitle ? "error" : "missing-video",
            error:
              parsed.error ||
              (duplicateSubtitle
                ? "Tên video trùng nhau; không thể ghép SRT tự động."
                : undefined),
          };
          next.push(item);
        }
      }
      return next;
    });
    setBatchMessage("");
  };

  const handleDrop = (event: DragEvent<HTMLDivElement>) => {
    event.preventDefault();
    setDragging(false);
    void addFiles(event.dataTransfer.files);
  };

  const updateItem = (
    id: string,
    update: (item: VideoSubtitleItem) => VideoSubtitleItem,
  ) => {
    setItems((current) =>
      current.map((item) => (item.id === id ? update(item) : item)),
    );
  };

  const updateCue = (
    itemId: string,
    cueIndex: number,
    patch: Partial<EditableSubtitleCue>,
  ) => {
    updateItem(itemId, (item) => ({
      ...item,
      cues: item.cues.map((cue, index) =>
        index === cueIndex
          ? {
              ...cue,
              ...patch,
              ...(patch.text !== undefined && patch.text !== cue.text
                ? { translatedText: "" }
                : {}),
            }
          : cue,
      ),
      status:
        item.status === "error" ||
        (item.status === "translated" &&
          patch.text !== undefined &&
          patch.text !== item.cues[cueIndex]?.text)
          ? "ready"
          : item.status,
      error: undefined,
    }));
    setBatchMessage("");
  };

  const applyRawSubtitles = (cues: EditableSubtitleCue[]) => {
    if (!selectedItem) return;
    updateItem(selectedItem.id, (item) => ({
      ...item,
      cues,
      status:
        cues.length &&
        cues.every((cue) => cue.text.trim() && cue.translatedText.trim())
          ? "translated"
          : item.video
            ? cues.length
              ? "ready"
              : "missing-subtitle"
            : item.subtitleFile
              ? "missing-video"
              : "missing-subtitle",
      error: undefined,
    }));
    setBatchMessage("");
  };

  const openPromptDialog = async () => {
    setPromptDialogOpen(true);
    setPromptLoading(true);
    setPromptError("");
    try {
      const response = await fetch("/api/subtitle-translation/prompt");
      const body = (await response.json()) as TranslationPromptResponse;
      if (!response.ok || !body.success || typeof body.prompt !== "string") {
        throw new Error(body.error || "Không tải được prompt từ Setup.");
      }
      setPromptDefault(body.prompt);
      setPromptDraft(customPrompt ?? body.prompt);
    } catch (error) {
      setPromptError(error instanceof Error ? error.message : String(error));
    } finally {
      setPromptLoading(false);
    }
  };

  const translateItem = async (
    item: VideoSubtitleItem,
    onProgress: (completed: number, message: string) => void,
    systemPrompt: string | null,
    signal: AbortSignal,
  ) => {
    if (!item.cues.length) throw new Error("Video chưa có phụ đề để dịch.");

    // Use FreeLLM API if selected
    if (translationProvider === "freellm") {
      return translateItemWithFreeLLM(item, onProgress, systemPrompt, signal);
    }

    // Use Gemini API if selected
    if (translationProvider === "gemini") {
      return translateItemWithGemini(item, onProgress, systemPrompt, signal);
    }

    // Original local Qwen translation
    const translations = new Map<number, string>();
    onProgress(
      0,
      `Đang gửi toàn bộ ${item.cues.length} câu trong một request…`,
    );
    const response = await fetch("/api/subtitle-translation/translate", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      signal,
      body: JSON.stringify({
        cues: item.cues.map((cue, index) => ({
          id: String(index),
          text: cue.text,
        })),
        ...(systemPrompt ? { systemPrompt } : {}),
      }),
    });
    if (!response.ok) {
      const body = (await response.json()) as { error?: string };
      throw new Error(body.error || "Không thể dịch phụ đề.");
    }
    if (!response.body)
      throw new Error("Máy chủ không hỗ trợ stream kết quả dịch.");
    const reader = response.body.getReader();
    const decoder = new TextDecoder();
    const completedCues = new Set<number>();
    let pending = "";
    let completed = false;
    const processEventLine = (line: string) => {
      if (!line.startsWith("data:")) return;
      const data = line.slice(5).trim();
      if (!data) return;
      const event = JSON.parse(data) as {
        type?: string;
        id?: unknown;
        translation?: unknown;
        error?: unknown;
      };
      if (event.type === "translation") {
        const index = Number(event.id);
        if (
          !Number.isInteger(index) ||
          index < 0 ||
          index >= item.cues.length ||
          typeof event.translation !== "string" ||
          !event.translation.trim()
        )
          return;
        const translation = event.translation.trim();
        translations.set(index, translation);
        completedCues.add(index);
        updateItem(item.id, (current) => ({
          ...current,
          cues: current.cues.map((cue, cueIndex) =>
            cueIndex === index ? { ...cue, translatedText: translation } : cue,
          ),
        }));
        onProgress(
          completedCues.size,
          `Đã nhận ${completedCues.size}/${item.cues.length} câu dịch…`,
        );
      } else if (event.type === "complete") {
        completed = true;
      } else if (event.type === "error") {
        throw new Error(
          typeof event.error === "string"
            ? event.error
            : "Không thể hoàn tất dịch phụ đề.",
        );
      }
    };
    try {
      let ended = false;
      while (!ended) {
        signal.throwIfAborted();
        const chunk = await reader.read();
        ended = chunk.done;
        pending += decoder.decode(chunk.value, { stream: !ended });
        let newlineIndex = pending.indexOf("\n");
        while (newlineIndex >= 0) {
          processEventLine(pending.slice(0, newlineIndex).replace(/\r$/, ""));
          pending = pending.slice(newlineIndex + 1);
          newlineIndex = pending.indexOf("\n");
        }
      }
      if (pending.trim()) processEventLine(pending.replace(/\r$/, ""));
    } finally {
      reader.releaseLock();
    }
    if (!completed)
      throw new Error("Kết nối stream kết thúc trước khi dịch hoàn tất.");
    if (completedCues.size !== item.cues.length)
      throw new Error(
        "Kết quả dịch chưa đầy đủ. Một số câu chưa được model trả về.",
      );
    updateItem(item.id, (current) => ({
      ...current,
      cues: current.cues.map((cue, index) => ({
        ...cue,
        translatedText: translations.get(index) || cue.translatedText,
      })),
      status: "translated",
      error: undefined,
    }));
  };

  // Chunked translation helper - processes cues in batches of 50
  const CHUNK_SIZE = 50;

  const translateChunks = async (
    item: VideoSubtitleItem,
    onProgress: (completed: number, message: string) => void,
    systemPrompt: string | null,
    signal: AbortSignal,
    translateFn: (
      cues: EditableSubtitleCue[],
      srcLang: string,
      tgtLang: string,
      prompt: string | null,
      signal: AbortSignal,
    ) => Promise<Array<{ id: string; translation: string }>>,
  ) => {
    if (!item.cues.length) throw new Error("Video chưa có phụ đề để dịch.");

    const srcLang = sourceLanguage;
    const tgtLang = targetLanguage;
    const totalCues = item.cues.length;
    const chunks: EditableSubtitleCue[][] = [];

    // Split cues into chunks
    for (let i = 0; i < totalCues; i += CHUNK_SIZE) {
      chunks.push(item.cues.slice(i, i + CHUNK_SIZE));
    }

    let completedCount = 0;
    let allTranslations: Array<{ id: string; translation: string }> = [];

    onProgress(
      0,
      `Đang dịch ${totalCues} câu (${chunks.length} batch × ${CHUNK_SIZE} câu) với ${translationProvider === "gemini" ? "Gemini" : "FreeLLM"} (${sourceLanguage}→${targetLanguage})…`,
    );

    for (let chunkIndex = 0; chunkIndex < chunks.length; chunkIndex++) {
      signal?.throwIfAborted();

      const chunk = chunks[chunkIndex];
      const startIdx = chunkIndex * CHUNK_SIZE;
      const chunkProgressBase = startIdx;

      onProgress(
        completedCount,
        `Batch ${chunkIndex + 1}/${chunks.length} · đang dịch ${chunk.length} câu (${chunkProgressBase + 1}–${Math.min(startIdx + chunk.length, totalCues)})…`,
      );

      let chunkTranslations: Array<{ id: string; translation: string }> = [];
      let chunkSuccess = false;
      let lastError: Error | null = null;

      // Retry logic: try up to 3 times per chunk
      for (let retry = 0; retry < 3; retry++) {
        signal?.throwIfAborted();
        try {
          if (retry > 0) {
            onProgress(
              completedCount,
              `Batch ${chunkIndex + 1}/${chunks.length} · thử lại lần ${retry}/3…`,
            );
          }

          chunkTranslations = await translateFn(
            chunk,
            sourceLanguage,
            targetLanguage,
            systemPrompt,
            signal,
          );
          chunkSuccess = true;
          break;
        } catch (error) {
          lastError = error instanceof Error ? error : new Error(String(error));
          console.warn(
            `[Chunk ${chunkIndex + 1}] Retry ${retry + 1}/3 failed:`,
            lastError.message,
          );

          // If aborted, don't retry
          if (signal?.aborted) throw lastError;

          // Small delay before retry
          if (retry < 2)
            await new Promise((r) => setTimeout(r, 1000 * (retry + 1)));
        }
      }

      if (!chunkSuccess || !chunkTranslations.length) {
        throw (
          lastError ||
          new Error(`Batch ${chunkIndex + 1} thất bại sau 3 lần thử`)
        );
      }

      // Apply translations from this chunk
      for (const t of chunkTranslations) {
        const index = Number(t.id);
        if (
          Number.isInteger(index) &&
          index >= 0 &&
          index < chunk.length &&
          t.translation
        ) {
          const globalIndex = startIdx + index;
          updateItem(item.id, (current) => ({
            ...current,
            cues: current.cues.map((cue, cueIndex) =>
              cueIndex === globalIndex
                ? { ...cue, translatedText: t.translation.trim() }
                : cue,
            ),
          }));
        }
      }

      completedCount += chunk.length;
      allTranslations.push(...chunkTranslations);

      onProgress(
        completedCount,
        `Đã hoàn tất batch ${chunkIndex + 1}/${chunks.length} (${completedCount}/${totalCues} câu)`,
      );

      // Small delay between chunks to avoid rate limits
      if (chunkIndex < chunks.length - 1) {
        await new Promise((r) => setTimeout(r, 300));
      }
    }

    // Final update to set status
    updateItem(item.id, (current) => ({
      ...current,
      status: "translated",
      error: undefined,
    }));

    onProgress(
      totalCues,
      `Hoàn tất dịch ${totalCues} câu với ${translationProvider === "gemini" ? "Gemini" : "FreeLLM"}`,
    );
    return allTranslations;
  };

  // Gemini translation implementation (chunked)
  const translateItemWithGemini = async (
    item: VideoSubtitleItem,
    onProgress: (completed: number, message: string) => void,
    systemPrompt: string | null,
    signal: AbortSignal,
  ) => {
    const translateFn = async (
      cues: EditableSubtitleCue[],
      srcLang: string,
      tgtLang: string,
      prompt: string | null,
      signal: AbortSignal,
    ): Promise<Array<{ id: string; translation: string }>> => {
      const response = await fetch(
        "/api/subtitle-translation/translate/gemini",
        {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          signal,
          body: JSON.stringify({
            cues: cues.map((cue, index) => ({
              id: String(index),
              text: cue.text,
            })),
            sourceLanguage: srcLang,
            targetLanguage: tgtLang,
            ...(prompt ? { systemPrompt: prompt } : {}),
          }),
        },
      );

      if (!response.ok) {
        const body = (await response.json()) as { error?: string };
        throw new Error(body.error || "Không thể dịch với Gemini.");
      }

      const data = (await response.json()) as {
        success: boolean;
        translations?: Array<{ id: string; translation: string }>;
        error?: string;
      };

      if (!data.success || !data.translations) {
        throw new Error(data.error || "Gemini không trả về kết quả hợp lệ.");
      }

      return data.translations;
    };

    return translateChunks(item, onProgress, systemPrompt, signal, translateFn);
  };

  // FreeLLM translation implementation (chunked)
  const translateItemWithFreeLLM = async (
    item: VideoSubtitleItem,
    onProgress: (completed: number, message: string) => void,
    systemPrompt: string | null,
    signal: AbortSignal,
  ) => {
    const translateFn = async (
      cues: EditableSubtitleCue[],
      srcLang: string,
      tgtLang: string,
      prompt: string | null,
      signal: AbortSignal,
    ): Promise<Array<{ id: string; translation: string }>> => {
      // Convert cues to FreeLLM subtitle format
      const subtitleText = cues
        .map(
          (cue, index) =>
            `${index + 1}\n00:00:01,000 --> 00:00:03,000\n${cue.text.trim()}`,
        )
        .join("\n\n");

      try {
        const response = await fetch("/api/free-llm-translation", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          signal,
          body: JSON.stringify({
            subtitle: subtitleText,
            prompt:
              prompt ||
              `Dịch phụ đề từ ${srcLang} sang ${tgtLang}. Văn phong tự nhiên, giữ nguyên ý nghĩa và phong cách.`,
          }),
        });

        if (!response.ok) {
          const body = (await response.json()) as { error?: string };
          throw new Error(body.error || "Không thể dịch với FreeLLM.");
        }

        const data = (await response.json()) as {
          subtitle: string;
          result: string;
          totalEntries: number;
        };

        // Parse FreeLLM response and map to expected format
        const translations: Array<{ id: string; translation: string }> = [];
        const resultLines = data.result.split("\n");
        for (const line of resultLines) {
          const [id, translation] = line.split("|");
          if (id && translation) {
            translations.push({
              id: (parseInt(id.trim()) - 1).toString(), // Convert to 0-based index
              translation: translation.trim(),
            });
          }
        }

        return translations;
      } catch (error) {
        // Trả về mảng rỗng với các ID và translation trống nếu có lỗi
        console.error("Lỗi khi dịch với FreeLLM:", error);
        return cues.map((cue, index) => ({
          id: String(index),
          translation: "",
        }));
      }
    };

    return translateChunks(item, onProgress, systemPrompt, signal, translateFn);
  };

  const translateSelected = async () => {
    if (
      !selectedItem?.video ||
      translationInProgress ||
      !selectedItem.cues.length
    )
      return;
    const controller = new AbortController();
    translationAbortControllerRef.current = controller;
    setTranslationMode("single");
    setBatchMessage("");
    setTranslationProgress({
      completed: 0,
      total: selectedItem.cues.length,
      currentVideo: selectedItem.video.name,
      message: "Đang chuẩn bị nhóm đầu tiên…",
    });
    updateItem(selectedItem.id, (item) => ({
      ...item,
      status: "translating",
      error: undefined,
    }));
    try {
      await translateItem(
        selectedItem,
        (completed, message) =>
          setTranslationProgress({
            completed,
            total: selectedItem.cues.length,
            currentVideo: selectedItem.video!.name,
            message,
          }),
        promptDraft,
        controller.signal,
      );
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      if (controller.signal.aborted) {
        updateItem(selectedItem.id, (item) => ({
          ...item,
          status: "ready",
          error: undefined,
        }));
        setBatchMessage(
          "Đã dừng dịch. Các bản dịch đã có trước đó được giữ nguyên.",
        );
      } else {
        updateItem(selectedItem.id, (item) => ({
          ...item,
          status: "error",
          error: message,
        }));
        setBatchMessage(
          `${selectedItem.video?.name || selectedItem.subtitleFile?.name}: ${message}`,
        );
      }
    } finally {
      if (translationAbortControllerRef.current === controller)
        translationAbortControllerRef.current = null;
      setTranslationMode(null);
      setTranslationProgress(null);
    }
  };

  const translateAll = async () => {
    if (translationInProgress) return;
    const queue = items.filter(
      (item) => item.video && item.cues.length && item.status !== "translated",
    );
    if (!queue.length) return;
    const controller = new AbortController();
    translationAbortControllerRef.current = controller;
    setTranslationMode("all");
    setBatchMessage("");
    const totalCues = queue.reduce(
      (total, item) => total + item.cues.length,
      0,
    );
    let completedCues = 0;
    setTranslationProgress({
      completed: 0,
      total: totalCues,
      currentVideo: queue[0].video!.name,
      message: `Chuẩn bị video 1/${queue.length}…`,
    });
    const errors: string[] = [];
    for (const [itemIndex, item] of queue.entries()) {
      if (controller.signal.aborted) break;
      setTranslationProgress({
        completed: completedCues,
        total: totalCues,
        currentVideo: item.video!.name,
        message: `Video ${itemIndex + 1}/${queue.length} · chuẩn bị dịch…`,
      });
      updateItem(item.id, (current) => ({
        ...current,
        status: "translating",
        error: undefined,
      }));
      try {
        await translateItem(
          item,
          (itemCompleted, message) =>
            setTranslationProgress({
              completed: completedCues + itemCompleted,
              total: totalCues,
              currentVideo: item.video!.name,
              message: `Video ${itemIndex + 1}/${queue.length} · ${message}`,
            }),
          customPrompt,
          controller.signal,
        );
      } catch (error) {
        const message = error instanceof Error ? error.message : String(error);
        if (controller.signal.aborted) {
          updateItem(item.id, (current) => ({
            ...current,
            status: "ready",
            error: undefined,
          }));
          break;
        } else {
          updateItem(item.id, (current) => ({
            ...current,
            status: "error",
            error: message,
          }));
          errors.push(
            `${item.video?.name || item.subtitleFile?.name}: ${message}`,
          );
        }
      }
      if (controller.signal.aborted) break;
      completedCues += item.cues.length;
    }
    setBatchMessage(
      controller.signal.aborted
        ? "Đã dừng dịch. Các bản dịch đã hoàn tất trước đó được giữ nguyên."
        : errors.length
          ? `Đã dịch xong các video không lỗi; ${errors.length} video cần thử lại.`
          : `Đã dịch xong ${queue.length} video.`,
    );
    if (translationAbortControllerRef.current === controller)
      translationAbortControllerRef.current = null;
    setTranslationMode(null);
    setTranslationProgress(null);
  };

  const cancelTranslation = () => {
    translationAbortControllerRef.current?.abort(
      new DOMException("Đã dừng theo yêu cầu.", "AbortError"),
    );
  };

  const selectCue = (index: number) => {
    const cue = selectedItem?.cues[index];
    if (!cue) return;
    activeCueIndexRef.current = index;
    setActiveCueIndex(index);
    scrollSubtitleCueIntoView(index);
    setVideoCurrentTime(cue.startTime);
    if (videoRef.current) videoRef.current.currentTime = cue.startTime;
  };

  const addSubtitleCue = () => {
    if (!selectedItem) return;
    const created = createSubtitleCueAtTime(
      selectedItem.cues,
      videoCurrentTime,
    );
    if (!created) {
      setBatchMessage(
        "Không thể thêm phụ đề tại vị trí này vì đang nằm trong phụ đề khác hoặc không còn khoảng trống tối thiểu 0,01 giây.",
      );
      return;
    }
    updateItem(selectedItem.id, (item) => {
      const cues = [...item.cues];
      cues.splice(created.index, 0, created.cue);
      return { ...item, cues, status: "ready", error: undefined };
    });
    activeCueIndexRef.current = created.index;
    setActiveCueIndex(created.index);
    scrollSubtitleCueIntoView(created.index);
    setBatchMessage("");
  };

  const seekVideo = (time: number) => {
    if (videoRef.current) videoRef.current.currentTime = time;
    setVideoCurrentTime(time);
  };

  const toggleVideoPlayback = async () => {
    const video = videoRef.current;
    if (!video) return;
    try {
      if (video.paused) await video.play();
      else video.pause();
    } catch (error) {
      setBatchMessage(
        `Không thể phát video: ${error instanceof Error ? error.message : String(error)}`,
      );
    }
  };

  const stopVideo = () => {
    const video = videoRef.current;
    if (!video) return;
    video.pause();
    video.currentTime = 0;
    setVideoCurrentTime(0);
  };

  const downloadSrt = (item: VideoSubtitleItem, translated: boolean) => {
    const content = formatEditableSubtitles(item.cues, translated);
    const url = URL.createObjectURL(
      new Blob([content], { type: "text/plain;charset=utf-8" }),
    );
    const anchor = document.createElement("a");
    anchor.href = url;
    anchor.download = `${(item.video?.name || item.subtitleFile?.name || "subtitles").replace(/\.[^.]+$/, "")}${translated ? "_translated" : ""}.srt`;
    anchor.click();
    URL.revokeObjectURL(url);
  };

  const removeItem = (id: string) => {
    setItems((current) => current.filter((item) => item.id !== id));
  };

  const togglePreviewFullscreen = async () => {
    const preview = previewFrameRef.current;
    if (!preview) return;
    try {
      if (document.fullscreenElement === preview) {
        await document.exitFullscreen();
      } else {
        await preview.requestFullscreen();
      }
    } catch (error) {
      setBatchMessage(
        `Không thể mở toàn màn hình: ${error instanceof Error ? error.message : String(error)}`,
      );
    }
  };

  const displayedText = activeCue
    ? showTranslation && activeCue.translatedText.trim()
      ? activeCue.translatedText
      : activeCue.text
    : "";
  const readyVideoCount = items.filter(
    (item) => item.video && item.cues.length,
  ).length;

  return (
    <div className="w-full h-full flex flex-col overflow-hidden bg-slate-950">
      {/* ── TOP TOOLBAR ── */}
      <div className="h-10 px-3 shrink-0 flex items-center justify-between gap-2 border-b border-slate-800 bg-slate-900/90 select-none">
        <div className="flex items-center gap-2">
          <div className="flex items-center gap-1.5 text-violet-300">
            <Subtitles className="h-4 w-4" />
            <span className="text-xs font-bold uppercase tracking-wide text-white">
              Dịch &amp; Sửa Phụ Đề
            </span>
          </div>
          {selectedItem && (
            <span
              className={`hidden sm:inline border px-1.5 py-0.5 text-[9px] font-semibold ${statusColor(selectedItem.status)} border-slate-700`}
            >
              {statusLabel(selectedItem.status)}
            </span>
          )}
        </div>
      </div>
      {/* ── BOTTOM STATUS STRIP ── */}
      {/* Translation progress banner */}
      {translationProgress && (
        <div className="px-3 py-2 shrink-0 border-b border-violet-500/25 bg-violet-500/5 flex flex-wrap items-center gap-3">
          <LoaderCircle className="h-3.5 w-3.5 shrink-0 animate-spin text-violet-300" />
          <span className="truncate text-[11px] font-semibold text-violet-100 min-w-0 flex-1">
            {translationProgress.message} · {translationProgress.currentVideo}
          </span>
          <span className="shrink-0 font-mono text-[10px] font-bold text-violet-200">
            {translationProgress.total
              ? `${Math.floor((translationProgress.completed * 100) / translationProgress.total)}%`
              : "…"}
          </span>
          <div
            role="progressbar"
            aria-valuemin={0}
            aria-valuemax={translationProgress.total || 1}
            aria-valuenow={translationProgress.completed}
            className="w-full h-1 bg-slate-800"
          >
            <div
              className="h-full bg-gradient-to-r from-violet-500 to-cyan-400 transition-[width] duration-300"
              style={{
                width: `${translationProgress.total ? Math.floor((translationProgress.completed * 100) / translationProgress.total) : 0}%`,
              }}
            />
          </div>
          <button
            type="button"
            onClick={cancelTranslation}
            className="shrink-0 inline-flex items-center gap-1 border border-rose-500/30 bg-rose-500/10 px-2 py-0.5 text-[9px] font-semibold text-rose-200 hover:bg-rose-500/20 cursor-pointer"
          >
            <X className="h-2.5 w-2.5" />
            Dừng
          </button>
        </div>
      )}

      {/* Status/batch message strip */}
      {batchMessage && (
        <div
          role="status"
          className={`px-3 py-1.5 shrink-0 text-[10px] border-b ${batchMessage.includes("cần thử lại") || batchMessage.includes("không thể") ? "border-amber-500/20 bg-amber-500/5 text-amber-200" : "border-slate-800 bg-slate-900/60 text-slate-300"}`}
        >
          {batchMessage}
        </div>
      )}

      <input
        ref={fileInputRef}
        type="file"
        multiple
        accept="video/*,.srt"
        className="hidden"
        onChange={(event) => {
          if (event.target.files) void addFiles(event.target.files);
          event.target.value = "";
        }}
      />

      {promptDialogOpen && (
        <div className="fixed inset-0 z-[120] flex items-center justify-center bg-black/75 p-4 backdrop-blur-sm">
          <section
            role="dialog"
            aria-modal="true"
            aria-labelledby="subtitle-prompt-title"
            className="flex max-h-[85vh] w-full max-w-3xl flex-col overflow-hidden border border-slate-700 bg-slate-900 shadow-2xl"
          >
            <header className="flex items-center justify-between gap-3 border-b border-slate-800 px-5 py-4">
              <div>
                <h2
                  id="subtitle-prompt-title"
                  className="text-sm font-bold text-white"
                >
                  Prompt dịch riêng
                </h2>
                <p className="mt-1 text-[11px] text-slate-400">
                  Mặc định nạp prompt từ Setup. Thay đổi ở đây chỉ áp dụng trong
                  trang này, không sửa cấu hình Setup.
                </p>
              </div>
              <button
                type="button"
                onClick={() => setPromptDialogOpen(false)}
                aria-label="Đóng prompt"
                className="p-2 text-slate-400 hover:bg-slate-800 hover:text-white cursor-pointer"
              >
                <X className="h-4 w-4" />
              </button>
            </header>
            <div className="min-h-0 flex-1 space-y-3 overflow-y-auto p-5">
              {promptError && (
                <p
                  role="alert"
                  className="border border-rose-500/30 bg-rose-500/10 px-3 py-2 text-xs text-rose-200"
                >
                  {promptError}
                </p>
              )}
              <textarea
                value={promptDraft}
                onChange={(event) => setPromptDraft(event.target.value)}
                disabled={promptLoading}
                maxLength={12_000}
                rows={18}
                placeholder={
                  promptLoading
                    ? "Đang tải prompt từ Setup…"
                    : "Nhập prompt dịch…"
                }
                className="w-full resize-y border border-slate-700 bg-slate-950 p-3 font-mono text-xs leading-relaxed text-slate-100 outline-none placeholder:text-slate-600 focus:border-violet-400 disabled:opacity-50"
              />
              <div className="flex flex-wrap items-center justify-between gap-2 text-[10px] text-slate-500">
                <span>
                  Giữ yêu cầu trả JSON `translations` với `id` và `translation`
                  để hệ thống ghép đúng câu.
                </span>
                <span>{promptDraft.length.toLocaleString()}/12.000</span>
              </div>
            </div>
            <footer className="flex flex-wrap items-center justify-between gap-2 border-t border-slate-800 px-5 py-3">
              <button
                type="button"
                disabled={promptLoading || !promptDefault}
                onClick={() => {
                  setPromptDraft(promptDefault);
                  setCustomPrompt(null);
                }}
                className="border border-slate-700 px-3 py-2 text-xs font-semibold text-slate-300 hover:bg-slate-800 disabled:opacity-40 cursor-pointer"
              >
                Dùng lại prompt Setup
              </button>
              <div className="flex items-center gap-2">
                <button
                  type="button"
                  onClick={() => setPromptDialogOpen(false)}
                  className="border border-slate-700 px-3 py-2 text-xs font-semibold text-slate-300 hover:bg-slate-800 cursor-pointer"
                >
                  Hủy
                </button>
                <button
                  type="button"
                  disabled={
                    promptLoading ||
                    !promptDraft.trim() ||
                    promptDraft.length > 12_000
                  }
                  onClick={() => {
                    setCustomPrompt(promptDraft.trim());
                    setPromptDialogOpen(false);
                  }}
                  className="bg-violet-500 px-4 py-2 text-xs font-bold text-white hover:bg-violet-400 disabled:opacity-40 cursor-pointer"
                >
                  Dùng prompt này
                </button>
              </div>
            </footer>
          </section>
        </div>
      )}

      {rawDialogOpen && selectedItem && (
        <div className="fixed inset-0 z-[120] flex items-center justify-center bg-black/75 p-4 backdrop-blur-sm">
          <section
            role="dialog"
            aria-modal="true"
            aria-labelledby="subtitle-raw-title"
            className="flex h-[80vh] w-full max-w-4xl flex-col overflow-hidden border border-slate-700 bg-slate-900 shadow-2xl"
          >
            <header className="flex items-center justify-between gap-3 border-b border-slate-800 px-4 py-3 shrink-0">
              <div className="min-w-0">
                <h2
                  id="subtitle-raw-title"
                  className="text-sm font-bold text-white flex items-center gap-2"
                >
                  <Subtitles className="h-4 w-4 text-violet-300" />
                  <span>Phụ đề Raw (SRT)</span>
                  <span className="font-mono text-xs text-slate-400 font-normal truncate">
                    ·{" "}
                    {selectedItem.video?.name ||
                      selectedItem.subtitleFile?.name}
                  </span>
                </h2>
                <p className="mt-0.5 text-[10px] text-slate-400">
                  Xem, sao chép hoặc dán nội dung SRT thô cho phụ đề gốc và bản
                  dịch.
                </p>
              </div>
              <button
                type="button"
                onClick={() => setRawDialogOpen(false)}
                aria-label="Đóng bảng Raw"
                className="p-1.5 text-slate-400 hover:bg-slate-800 hover:text-white cursor-pointer"
              >
                <X className="h-4 w-4" />
              </button>
            </header>
            <div className="min-h-0 flex-1 p-3 grid grid-cols-1 md:grid-cols-2 gap-3 overflow-hidden">
              <RawSubtitleColumn
                title="SRT gốc"
                translated={false}
                cues={selectedItem.cues}
                disabled={translationInProgress}
                onApply={applyRawSubtitles}
              />
              <RawSubtitleColumn
                title="SRT bản dịch"
                translated
                cues={selectedItem.cues}
                disabled={translationInProgress}
                onApply={applyRawSubtitles}
              />
            </div>
            <footer className="flex items-center justify-between border-t border-slate-800 px-4 py-2 shrink-0 bg-slate-950/40">
              <span className="text-[10px] text-slate-500 font-mono">
                {selectedItem.cues.length} câu
              </span>
              <button
                type="button"
                onClick={() => setRawDialogOpen(false)}
                className="border border-slate-700 px-3 py-1 text-xs font-semibold text-slate-300 hover:bg-slate-800 cursor-pointer"
              >
                Đóng
              </button>
            </footer>
          </section>
        </div>
      )}

      {/* ── MAIN BODY: LEFT panel (video list + cue list) | RIGHT panel (video + subtitle list) ── */}
      <div className="flex-1 min-h-0 w-full flex flex-row overflow-hidden">
        {/* LEFT SIDEBAR: video list only */}
        <aside className="w-[280px] lg:w-[320px] shrink-0 h-full border-r border-slate-800 bg-slate-900/50 flex flex-col overflow-hidden">
          {/* Header */}
          <div className="flex items-center justify-between border-b border-slate-800 bg-slate-950/40 px-3 py-2 shrink-0">
            <span className="text-[10px] font-bold uppercase tracking-wider text-slate-300">
              Danh sách Video
            </span>
            <span className="font-mono text-[9px] text-slate-500">
              {items.filter((item) => item.video).length} video
            </span>
          </div>

          <div
            onDragEnter={(event) => {
              event.preventDefault();
              setDragging(true);
            }}
            onDragOver={(event) => {
              event.preventDefault();
              setDragging(true);
            }}
            onDragLeave={(event) => {
              if (
                !event.currentTarget.contains(
                  event.relatedTarget as Node | null,
                )
              )
                setDragging(false);
            }}
            onDrop={handleDrop}
            className="flex-1 min-h-0 overflow-y-auto scrollbar-thin"
          >
            <button
              type="button"
              onClick={() => fileInputRef.current?.click()}
              className={`m-2 block w-[calc(100%-1rem)] border border-dashed px-3 py-2 text-center text-[10px] transition-colors cursor-pointer ${dragging ? "border-violet-400 bg-violet-500/10 text-violet-100" : "border-slate-700 bg-slate-950/40 text-slate-400 hover:border-violet-400/50 hover:text-violet-200"}`}
            >
              <Upload className="mr-1.5 inline h-3 w-3" />
              Thả video/SRT vào đây hoặc bấm để thêm
              <span className="mt-0.5 block text-[9px] text-slate-500">
                Tự ghép theo tên file
              </span>
            </button>
            <div className="px-2 py-1 flex items-center justify-between border-b border-slate-800">
              <span className="text-[9px] font-bold text-slate-400 uppercase tracking-wide">
                Hàng đợi
              </span>
              <span className="font-mono text-[9px] text-slate-500">
                {readyVideoCount}/{items.filter((item) => item.video).length} có
                SRT
              </span>
            </div>
            <div className="divide-y divide-slate-800/70">
              {items.length ? (
                items.map((item) => (
                  <div
                    key={item.id}
                    title={item.error || undefined}
                    className={`flex items-center gap-1.5 px-2 ${selectedId === item.id ? "bg-violet-500/10" : "hover:bg-slate-900/60"}`}
                  >
                    <button
                      type="button"
                      onClick={() => {
                        setSelectedId(item.id);
                        setActiveCueIndex(-1);
                      }}
                      aria-pressed={selectedId === item.id}
                      className="flex min-w-0 flex-1 items-center gap-1.5 text-left cursor-pointer"
                    >
                      <FileVideo2
                        className={`h-3.5 w-3.5 shrink-0 ${selectedId === item.id ? "text-violet-300" : "text-slate-500"}`}
                      />
                      <span className="min-w-0 flex-1">
                        <span className="block truncate text-[10px] font-medium text-slate-200">
                          {item.video?.name || item.subtitleFile?.name}
                        </span>
                        <span
                          className={`mt-0.5 block text-[9px] font-mono ${statusColor(item.status)}`}
                        >
                          {item.status === "translating" ? (
                            <>
                              <LoaderCircle className="mr-1 inline h-2.5 w-2.5 animate-spin" />
                              {statusLabel(item.status)}
                            </>
                          ) : item.status === "translated" ? (
                            <>
                              <CheckCircle2 className="mr-1 inline h-2.5 w-2.5" />
                              {statusLabel(item.status)}
                            </>
                          ) : item.status === "error" ? (
                            <>
                              <AlertCircle className="mr-1 inline h-2.5 w-2.5" />
                              {item.error}
                            </>
                          ) : (
                            statusLabel(item.status)
                          )}
                          {item.cues.length ? ` · ${item.cues.length}` : ""}
                        </span>
                      </span>
                    </button>
                    <div className="flex flex-col items-end gap-1">
                      <button
                        type="button"
                        onClick={() => removeItem(item.id)}
                        disabled={translationInProgress}
                        title="Xóa khỏi danh sách"
                        aria-label={`Xóa ${item.video?.name || item.subtitleFile?.name}`}
                        className="p-1 text-slate-500 hover:bg-slate-800 hover:text-rose-300 disabled:opacity-30 cursor-pointer"
                      >
                        <X className="h-3 w-3" />
                      </button>
                      <div className="flex flex-row items-center">
                        <div className="flex flex-row items-center gap-1 px-2 py-1 text-[10px] font-semibold text-slate-300">
                          <Download className="h-2 w-2" />
                          <span className="truncate text-[10px] font-medium text-slate-200">
                            SRT
                          </span>
                        </div>

                        <div className="border border-slate-700/50 rounded-md flex flex-row items-center gap-1">
                          <button
                            type="button"
                            onClick={() =>
                              selectedItem && downloadSrt(selectedItem, false)
                            }
                            className="inline-flex items-center gap-1 px-2 py-1 text-[10px] font-semibold text-slate-300 hover:bg-slate-800 cursor-pointer"
                          >
                            Gốc
                          </button>
                          <button
                            type="button"
                            disabled={
                              !item.cues.every((cue) =>
                                cue.translatedText.trim(),
                              )
                            }
                            onClick={() => downloadSrt(item, true)}
                            className="inline-flex items-center gap-1  bg-emerald-500/10 px-2 py-1 text-[10px] font-semibold text-emerald-200 hover:bg-emerald-500/20 disabled:opacity-40 cursor-pointer"
                          >
                            Dịch
                          </button>
                        </div>
                      </div>
                    </div>
                  </div>
                ))
              ) : (
                <button
                  type="button"
                  onClick={() => fileInputRef.current?.click()}
                  className="flex w-full items-center justify-center gap-2 px-4 py-6 text-[10px] text-slate-500 hover:text-violet-200 cursor-pointer"
                >
                  <Upload className="h-3.5 w-3.5" />
                  Thêm video và tệp SRT
                </button>
              )}
            </div>
          </div>

          <div className="flex flex-col border-t border-slate-800 bg-slate-950/80 overflow-y-auto">
            <div className="divide-y divide-slate-800">
              {/* DATA */}
              <div className="flex flex-1 w-full justify-end gap-2  p-3">
                <button
                  type="button"
                  onClick={() => {
                    setItems([]);
                    setSelectedId("");
                    setBatchMessage("");
                  }}
                  disabled={translationInProgress || !items.length}
                  className="inline-flex items-center gap-1 border border-rose-500/30  px-2 py-1 text-[10px] font-semibold text-sm text-rose-200 hover:bg-rose-500/10"
                >
                  <Trash2 className="h-4 w-4" />
                  Xóa
                </button>
                <button
                  type="button"
                  onClick={() => void openPromptDialog()}
                  disabled={translationInProgress}
                  className="inline-flex items-center gap-1 border border-violet-500/30 bg-violet-500/10 px-2 py-1 text-[10px] font-semibold text-violet-200 hover:bg-violet-500/20 disabled:opacity-40 cursor-pointer"
                >
                  <Subtitles className="h-4 w-4" />
                  Prompt
                </button>
                <button
                  type="button"
                  onClick={onOpenSetup}
                  className="inline-flex items-center gap-1 border border-violet-500/30 bg-violet-500/10 px-2 py-1 text-[10px] font-semibold text-violet-200 hover:bg-violet-500/20 disabled:opacity-40 cursor-pointer"
                >
                  <Settings className="h-4 w-4" />
                  Cài đặt dịch
                </button>
              </div>
              {/* Dich thuật */}
              <div className="flex flex-col gap-1 p-3 items-end">
                {/* Provider */}
                <div className="flex flex-row gap-1 items-center w-full justify-between font-semibold">
                  <label className="text-xs text-slate-400">Provider</label>

                  <select
                    value={translationProvider}
                    onChange={(e) =>
                      setTranslationProvider(
                        e.target.value as TranslationProvider,
                      )
                    }
                    disabled={
                      translationInProgress ||
                      geminiStatusLoading ||
                      freeLlmStatusLoading
                    }
                    className="bg-slate-800 border border-slate-700 px-2 py-1 text-[10px] font-semibold text-slate-200 focus:border-violet-400 focus:outline-none disabled:opacity-40 cursor-pointer appearance-none"
                  >
                    <option value="local">🏠 Local (Qwen)</option>

                    <option value="gemini" disabled={!geminiStatus?.configured}>
                      ⚡ Gemini API
                    </option>

                    <option
                      value="freellm"
                      disabled={!freeLlmStatus?.configured}
                    >
                      🖥 FreeLLM
                    </option>
                  </select>
                </div>

                {translationProvider === "gemini" &&
                  geminiStatus?.configured && (
                    <span className="text-xs text-emerald-400">
                      {geminiStatus.availableKeys}/{geminiStatus.totalKeys} keys
                      khả dụng
                    </span>
                  )}

                {translationProvider === "freellm" &&
                  freeLlmStatus?.configured && (
                    <span className="text-xs text-emerald-400">
                      FreeLLM đã sẵn sàng
                    </span>
                  )}
              </div>
              {/* Languages */}
              <div className=" flex flex-col gap-2 p-3 items-end">
                <div className="flex flex-row items-center gap-1 justify-between w-full">
                  <span className="text-xs text-slate-400 hidden sm:inline font-semibold">
                    Ngôn ngữ
                  </span>
                  {/* Auto-detect button */}
                  <button
                    type="button"
                    onClick={() => {
                      const selected = items.find(
                        (item) => item.id === selectedId,
                      );
                      if (selected?.cues?.length) {
                        const allText = selected.cues
                          .map((c) => c.text)
                          .join(" ");
                        const detected = detectLanguage(allText);
                        setSourceLanguage(detected);
                        saveTranslationConfig(detected, targetLanguage);
                        setBatchMessage(`Đã phát hiện ngôn ngữ: ${detected}`);
                      } else {
                        setBatchMessage("Chưa có phụ đề để phát hiện ngôn ngữ");
                      }
                    }}
                    disabled={
                      translationInProgress ||
                      !selectedItem?.cues?.length ||
                      langConfigLoading
                    }
                    className="flex items-center gap-1 border border-cyan-500/30 bg-cyan-500/10 py-1 px-2 text-[10px] font-semibold text-cyan-200 hover:bg-cyan-500/20 disabled:opacity-40 cursor-pointer"
                    title="Tự động phát hiện ngôn ngữ từ phụ đề hiện tại"
                  >
                    <RefreshCw className="h-3 w-3" />
                    <span className="hidden sm:inline">Phát hiện</span>
                    <Globe className="h-3 w-3 ml-1" />
                  </button>
                </div>

                {/* Source Language */}
                <div className="flex flex-row">
                  <select
                    value={sourceLanguage}
                    onChange={(e) => {
                      const lang = e.target.value;
                      if (lang === "auto") {
                        const selected = items.find(
                          (item) => item.id === selectedId,
                        );
                        if (selected?.cues?.length) {
                          const allText = selected.cues
                            .map((c) => c.text)
                            .join(" ");
                          const detected = detectLanguage(allText);
                          setSourceLanguage(detected);
                          saveTranslationConfig(detected, targetLanguage);
                        }
                      } else {
                        setSourceLanguage(lang);
                        saveTranslationConfig(lang, targetLanguage);
                      }
                    }}
                    disabled={translationInProgress || langConfigLoading}
                    className="bg-slate-800 border border-slate-700 px-2 py-1 text-[10px] font-semibold text-slate-200 focus:border-cyan-400 focus:outline-none disabled:opacity-40 cursor-pointer appearance-none w-[100px]"
                    title="Ngôn ngữ nguồn (chọn 'Tự động phát hiện' để AI tự nhận diện)"
                  >
                    {SUPPORTED_LANGUAGES.map((l) => (
                      <option key={l.code} value={l.code}>
                        {l.name}
                      </option>
                    ))}
                  </select>

                  <span className="text-cyan-400 mx-1 hidden sm:inline">→</span>

                  {/* Target Language */}
                  <select
                    value={targetLanguage}
                    onChange={(e) => {
                      setTargetLanguage(e.target.value);
                      saveTranslationConfig(sourceLanguage, e.target.value);
                    }}
                    disabled={translationInProgress || langConfigLoading}
                    className="bg-slate-800 border border-slate-700 px-2 py-1 text-[10px] font-semibold text-slate-200 focus:border-emerald-400 focus:outline-none disabled:opacity-40 cursor-pointer appearance-none w-[100px]"
                    title="Ngôn ngữ đích"
                  >
                    {SUPPORTED_LANGUAGES.filter((l) => l.code !== "auto").map(
                      (l) => (
                        <option key={l.code} value={l.code}>
                          {l.name}
                        </option>
                      ),
                    )}
                  </select>
                </div>
              </div>

              {/* ACTIONS */}
              <div className="flex flex-row items-stretch w-full">
                <button
                  type="button"
                  disabled={
                    !selectedItem?.video ||
                    !selectedItem.cues.length ||
                    translationInProgress
                  }
                  onClick={() => void translateSelected()}
                  className="flex-1 inline-flex items-center justify-center gap-1 border border-violet-500/30 bg-violet-500/10 px-2 py-1 text-[15px] font-semibold text-violet-200 hover:bg-violet-500/20 disabled:opacity-40 cursor-pointer"
                >
                  {translationMode === "single" ? (
                    <LoaderCircle className="h-3 w-3 animate-spin" />
                  ) : (
                    <Languages className="h-3 w-3" />
                  )}
                  <span className="hidden lg:inline">
                    {translationMode === "single" ? "Đang dịch…" : "Dịch"}
                  </span>
                </button>
                <button
                  type="button"
                  disabled={
                    !items.some(
                      (item) =>
                        item.video &&
                        item.cues.length &&
                        item.status !== "translated",
                    ) || translationInProgress
                  }
                  onClick={() => void translateAll()}
                  className="flex-1 inline-flex items-center justify-center gap-1 border border-cyan-500/30 bg-cyan-500/10 px-2 py-1 text-[15px] font-semibold text-cyan-200 hover:bg-cyan-500/20 disabled:opacity-40 cursor-pointer"
                >
                  {translationMode === "all" ? (
                    <LoaderCircle className="h-3 w-3 animate-spin" />
                  ) : (
                    <Languages className="h-3 w-3" />
                  )}
                  <span className="hidden lg:inline">
                    {translationMode === "all"
                      ? "Đang dịch tất cả…"
                      : `Dịch tất cả (${items.filter((item) => item.video && item.cues.length && item.status !== "translated").length})`}
                  </span>
                </button>
              </div>
            </div>
          </div>
        </aside>

        {/* RIGHT PANEL: video + subtitle preview side-by-side, timeline docked at bottom */}
        <div className="flex-1 min-w-0 h-full flex flex-col overflow-hidden">
          {/* MAIN VIEW: video (left) + subtitle list (right) */}
          <div className="flex-1 min-h-0 flex flex-row overflow-hidden">
            {/* VIDEO PREVIEW */}
            <div className="flex-1 min-w-0 h-full flex flex-col overflow-hidden border-r border-slate-800 bg-black">
              {/* Video viewport */}
              <div
                ref={previewFrameRef}
                className={`flex-1 min-h-0 relative flex items-center justify-center overflow-hidden ${previewFullscreen ? "fixed inset-0 z-[100] bg-black" : "bg-black"}`}
              >
                <div
                  className="relative flex max-h-full max-w-full items-center justify-center bg-black"
                  style={
                    previewFullscreen && videoUrl
                      ? {
                          width: `min(100vw, ${videoAspectRatio * 100}vh)`,
                          aspectRatio: String(videoAspectRatio),
                        }
                      : { width: "100%", height: "100%" }
                  }
                >
                  {videoUrl ? (
                    <video
                      key={selectedId}
                      ref={videoRef}
                      src={videoUrl}
                      onLoadedMetadata={(event) => {
                        const { videoWidth, videoHeight } = event.currentTarget;
                        setVideoDuration(event.currentTarget.duration || 0);
                        setVideoCurrentTime(event.currentTarget.currentTime);
                        setVideoPaused(event.currentTarget.paused);
                        if (videoWidth > 0 && videoHeight > 0)
                          setVideoAspectRatio(videoWidth / videoHeight);
                      }}
                      className="max-h-full max-w-full object-contain"
                    />
                  ) : (
                    <button
                      type="button"
                      onClick={() => fileInputRef.current?.click()}
                      className="flex h-full w-full flex-col items-center justify-center gap-2 text-slate-600 hover:text-violet-300 cursor-pointer transition-colors"
                    >
                      <FileVideo2 className="h-10 w-10" />
                      <span className="text-xs">
                        Chọn video từ danh sách hoặc thêm video mới
                      </span>
                    </button>
                  )}
                  {videoUrl && displayedText && (
                    <div className="pointer-events-none absolute inset-x-0 bottom-[12%] flex justify-center px-6">
                      <span
                        className={`max-w-[90%] whitespace-pre-line bg-black/70 px-3 py-1.5 text-center font-semibold text-white [text-shadow:0_1px_3px_#000] ${previewFullscreen ? "text-[clamp(1.5rem,3.5vw,3rem)] leading-tight" : "text-sm"}`}
                      >
                        {displayedText}
                      </span>
                    </div>
                  )}
                  {videoUrl && (
                    <button
                      type="button"
                      onClick={() => void togglePreviewFullscreen()}
                      aria-label={
                        previewFullscreen
                          ? "Thoát toàn màn hình"
                          : "Xem video toàn màn hình"
                      }
                      className="absolute right-2 top-2 z-10 border border-white/20 bg-black/60 p-1.5 text-white opacity-60 transition-opacity hover:opacity-100 cursor-pointer"
                    >
                      {previewFullscreen ? (
                        <Minimize2 className="h-3.5 w-3.5" />
                      ) : (
                        <Maximize2 className="h-3.5 w-3.5" />
                      )}
                    </button>
                  )}
                </div>
              </div>

              {/* Video info strip */}
              {selectedItem && (
                <div className="h-6 px-2 shrink-0 border-t border-slate-800 bg-slate-900/80 flex items-center gap-2 text-[9px] text-slate-500 overflow-hidden">
                  <span className="truncate">
                    {selectedItem.video?.name ||
                      selectedItem.subtitleFile?.name ||
                      "—"}
                  </span>
                  {activeCue && (
                    <span className="shrink-0 font-mono text-cyan-400">
                      {cueTime(activeCue.startTime)} –{" "}
                      {cueTime(activeCue.endTime)}
                    </span>
                  )}

                  <div className="flex flex-row items-center gap-1 ml-auto shrink-0">
                    <span>Phụ đề</span>
                    <button
                      type="button"
                      onClick={() => setShowTranslation(false)}
                      title="Phụ đề dịch"
                      className={`border px-1.5 py-0.5 text-[9px] font-semibold cursor-pointer ${!showTranslation ? "border-violet-500/30 text-violet-200" : "border-slate-700 text-slate-400"}`}
                    >
                      Gốc
                    </button>
                    <button
                      type="button"
                      onClick={() => setShowTranslation(true)}
                      title="Phụ đề gốc"
                      className={`border px-1.5 py-0.5 text-[9px] font-semibold cursor-pointer ${!showTranslation ? "border-slate-700 text-slate-400" : "border-violet-500/30 text-violet-200"}`}
                    >
                      Dịch
                    </button>
                  </div>
                </div>
              )}
            </div>

            {/* UNIFIED SUBTITLE COLUMN: Combined preview & inline editor with side-by-side inputs */}
            {/* Subtitle cue list with side-by-side inputs on the same row */}
            <SubtitleList
              selectedItem={selectedItem}
              subtitleListRef={subtitleListRef}
              subtitleCueElementsRef={subtitleCueElementsRef}
              activeCue={activeCue}
              selectCue={selectCue}
              updateCue={updateCue}
              addSubtitleCue={addSubtitleCue}
              translationInProgress={translationInProgress}
            />
          </div>

          {/* ── FULL-WIDTH TIMELINE / TRANSPORT ── */}
          <div className="shrink-0 border-t border-slate-800 bg-slate-950">
            {/* Transport bar */}
            <div className="h-9 px-3 flex items-center gap-2.5 border-b border-slate-800 bg-slate-900/80 select-none">
              <div className="flex divide-x divide-slate-800">
                <div className="pr-3 flex items-center gap-2.5">
                  <button
                    type="button"
                    onClick={() => void toggleVideoPlayback()}
                    disabled={!videoUrl}
                    aria-label={videoPaused ? "Phát video" : "Tạm dừng video"}
                    className="inline-flex h-6 w-6 shrink-0 items-center justify-center border border-cyan-500/30 bg-cyan-500/10 text-cyan-200 hover:bg-cyan-500/20 disabled:opacity-40 cursor-pointer"
                  >
                    {videoPaused ? (
                      <Play className="h-3 w-3 ml-0.5" />
                    ) : (
                      <Pause className="h-3 w-3" />
                    )}
                  </button>
                  <button
                    type="button"
                    onClick={stopVideo}
                    disabled={!videoUrl}
                    aria-label="Dừng về đầu"
                    className="inline-flex h-6 w-6 shrink-0 items-center justify-center border border-slate-700 bg-slate-900 text-slate-300 hover:border-slate-500 disabled:opacity-40 cursor-pointer"
                  >
                    <Square className="h-3 w-3 fill-current" />
                  </button>
                  <span className="font-mono text-[11px] text-slate-300 tabular-nums shrink-0">
                    {cueTime(videoCurrentTime)}
                  </span>
                  <span className="text-slate-600 shrink-0">/</span>
                  <span className="font-mono text-[11px] text-slate-500 tabular-nums shrink-0">
                    {cueTime(videoDuration)}
                  </span>
                  {activeCue && (
                    <>
                      <div className="w-px h-3.5 bg-slate-700 shrink-0" />
                      <span className="text-[9px] text-violet-300 font-mono shrink-0 hidden md:inline">
                        câu #{activeCueIndex + 1} ·{" "}
                        {cueTime(activeCue.startTime)}–
                        {cueTime(activeCue.endTime)}
                      </span>
                    </>
                  )}
                </div>
              </div>
              <span className="ml-auto text-[9px] text-slate-600 hidden lg:inline shrink-0">
                Ctrl+scroll: zoom · Shift+scroll: cuộn ngang
              </span>
              <button
                type="button"
                onClick={addSubtitleCue}
                disabled={!selectedItem?.video}
                title="Thêm câu phụ đề tại thời điểm hiện tại"
                className="shrink-0 inline-flex items-center gap-1 border border-violet-500/30 bg-violet-500/10 px-2 py-0.5 text-[9px] font-semibold text-violet-200 hover:bg-violet-500/20 disabled:opacity-40 cursor-pointer"
              >
                <Plus className="h-2.5 w-2.5" />
                Thêm câu
              </button>
            </div>
            {/* Timeline */}
            <SubtitleTimeline
              file={selectedItem?.video || null}
              duration={videoDuration}
              currentTime={videoCurrentTime}
              cues={selectedItem?.cues || []}
              selectedCueIndex={activeCueIndex}
              disabled={translationInProgress || !selectedItem?.video}
              onCueChange={(index, patch) =>
                selectedItem && updateCue(selectedItem.id, index, patch)
              }
              onCueSelect={selectCue}
              onSeek={seekVideo}
              onAddCue={addSubtitleCue}
            />
          </div>
        </div>
      </div>
    </div>
  );
}
