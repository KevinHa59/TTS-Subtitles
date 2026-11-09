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
} from "lucide-react";
import SubtitleTimeline from "./SubtitleTimeline";
import {
  applyRawSubtitleText,
  createSubtitleCueAtTime,
  formatEditableSubtitles,
  parseEditableSubtitles,
  type EditableSubtitleCue,
} from "../utils/subtitleEditor";

type VideoSubtitleStatus = "missing-subtitle" | "missing-video" | "ready" | "translated" | "translating" | "error";
type LeftPanelTab = "videos" | "subtitles" | "raw";
type VideoFrameElement = HTMLVideoElement & {
  requestVideoFrameCallback?: (callback: (_now: number, metadata: { mediaTime: number }) => void) => number;
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
type TranslationPromptResponse = { success: boolean; prompt?: string; error?: string };

const isVideoFile = (file: File) =>
  file.type.startsWith("video/") || /\.(mp4|m4v|mkv|mov|webm|avi|mpeg|mpg|wmv|flv|ts|mts)$/i.test(file.name);
const isSrtFile = (file: File) => /\.srt$/i.test(file.name);
const basename = (name: string) => name.replace(/\.[^.]+$/, "").trim().toLocaleLowerCase();
const fileKey = (file: File) => `${file.name}:${file.size}:${file.lastModified}`;
const cueTime = (seconds: number) => {
  const value = Math.max(0, Math.floor(Number.isFinite(seconds) ? seconds : 0));
  const hours = Math.floor(value / 3600);
  const minutes = Math.floor((value % 3600) / 60);
  const remaining = value % 60;
  return hours > 0
    ? `${hours}:${String(minutes).padStart(2, "0")}:${String(remaining).padStart(2, "0")}`
    : `${minutes}:${String(remaining).padStart(2, "0")}`;
};

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
  const externalText = useMemo(() => formatEditableSubtitles(cues, translated), [cues, translated]);
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
      setError(parseError instanceof Error ? parseError.message : String(parseError));
    }
  };

  const copyDraft = async () => {
    try {
      await navigator.clipboard.writeText(draft);
      setCopyMessage("Đã copy");
      setError("");
    } catch (copyError) {
      setCopyMessage("");
      setError(`Không thể copy: ${copyError instanceof Error ? copyError.message : String(copyError)}`);
    }
  };

  return (
    <section className="flex min-h-0 flex-1 flex-col overflow-hidden rounded-xl border border-slate-800 bg-slate-950/50">
      <header className="flex items-center justify-between gap-2 border-b border-slate-800 px-3 py-2">
        <div className="min-w-0">
          <h3 className="truncate text-[11px] font-bold text-slate-200">{title}</h3>
          <p className="text-[9px] text-slate-500">{cues.length} câu · định dạng SRT</p>
        </div>
        <button type="button" onClick={() => void copyDraft()} className="inline-flex shrink-0 items-center gap-1 rounded-md border border-slate-700 px-2 py-1 text-[10px] font-semibold text-slate-300 hover:border-cyan-500/40 hover:text-cyan-200">
          <Copy className="h-3 w-3" />{copyMessage || "Copy"}
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
      {error && <p role="alert" className="border-t border-rose-500/20 bg-rose-500/5 px-3 py-1.5 text-[9px] text-rose-300">{error}</p>}
    </section>
  );
}

function statusLabel(status: VideoSubtitleStatus) {
  switch (status) {
    case "ready": return "Sẵn sàng";
    case "translated": return "Đã dịch";
    case "translating": return "Đang dịch";
    case "error": return "Lỗi";
    case "missing-video": return "Thiếu video";
    default: return "Thiếu SRT";
  }
}

function statusColor(status: VideoSubtitleStatus) {
  switch (status) {
    case "ready": return "text-cyan-300";
    case "translated": return "text-emerald-300";
    case "translating": return "text-violet-300";
    case "error": return "text-rose-300";
    default: return "text-amber-300";
  }
}

export default function SubtitleEditorPage({ onOpenSetup }: { onOpenSetup: () => void }) {
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
  const [leftPanelTab, setLeftPanelTab] = useState<LeftPanelTab>("videos");
  const [dragging, setDragging] = useState(false);
  const [translationMode, setTranslationMode] = useState<"single" | "all" | null>(null);
  const [translationProgress, setTranslationProgress] = useState<TranslationProgress | null>(null);
  const [promptDialogOpen, setPromptDialogOpen] = useState(false);
  const [promptLoading, setPromptLoading] = useState(false);
  const [promptError, setPromptError] = useState("");
  const [promptDefault, setPromptDefault] = useState("");
  const [customPrompt, setCustomPrompt] = useState<string | null>(null);
  const [promptDraft, setPromptDraft] = useState("");
  const [batchMessage, setBatchMessage] = useState("");

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
      const containerBounds = container.getBoundingClientRect();
      const cueBounds = cueElement.getBoundingClientRect();
      container.scrollTop += cueBounds.top - containerBounds.top - (container.clientHeight - cueBounds.height) / 2;
    });
  };

  useEffect(() => {
    if (leftPanelTab !== "subtitles" || activeCueIndex < 0) return;
    scrollSubtitleCueIntoView(activeCueIndex);
  }, [activeCueIndex, leftPanelTab, selectedId, selectedItem?.cues.length]);

  useEffect(() => {
    if (!items.some((item) => item.id === selectedId)) {
      setSelectedId(items[0]?.id || "");
    }
  }, [items, selectedId]);

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
      setPreviewFullscreen(document.fullscreenElement === previewFrameRef.current);
    };
    document.addEventListener("fullscreenchange", syncFullscreenState);
    return () => document.removeEventListener("fullscreenchange", syncFullscreenState);
  }, []);

  useEffect(() => {
    const video = videoRef.current as VideoFrameElement | null;
    if (!video || !selectedItem) return;
    let disposed = false;
    let frameCallbackId: number | null = null;
    let animationFrameId: number | null = null;

    const updateActiveCue = (time: number) => {
      const nextIndex = selectedItem.cues.findIndex((cue) => time >= cue.startTime && time < cue.endTime);
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
      if (frameCallbackId !== null) video.cancelVideoFrameCallback?.(frameCallbackId);
      if (animationFrameId !== null) window.cancelAnimationFrame(animationFrameId);
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
    const parsedFiles = await Promise.all(subtitleFiles.map(async (file) => {
      try {
        const cues = parseEditableSubtitles(await file.text());
        if (!cues.length) throw new Error("Không tìm thấy câu phụ đề hợp lệ.");
        return { file, cues, error: undefined };
      } catch (error) {
        return { file, cues: [], error: error instanceof Error ? error.message : String(error) };
      }
    }));

    setItems((current) => {
      const next = [...current];
      for (const video of videos) {
        if (next.some((item) => item.video && fileKey(item.video) === fileKey(video))) continue;
        const unmatchedSubtitle = next.find((item) => !item.video && item.subtitleFile && basename(item.subtitleFile.name) === basename(video.name));
        if (unmatchedSubtitle) {
          unmatchedSubtitle.video = video;
          unmatchedSubtitle.status = unmatchedSubtitle.error ? "error" : "ready";
        } else {
          const item: VideoSubtitleItem = {
            id: crypto.randomUUID(), video, subtitleFile: null, cues: [], status: "missing-subtitle",
          };
          next.push(item);
        }
      }
      for (const parsed of parsedFiles) {
        const matchingVideo = next.find((item) => item.video && !item.subtitleFile && basename(item.video.name) === basename(parsed.file.name));
        if (matchingVideo) {
          matchingVideo.subtitleFile = parsed.file;
          matchingVideo.cues = parsed.cues;
          matchingVideo.error = parsed.error;
          matchingVideo.status = parsed.error ? "error" : "ready";
        } else {
          const duplicateSubtitle = next.some((item) => item.subtitleFile && basename(item.subtitleFile.name) === basename(parsed.file.name));
          const item: VideoSubtitleItem = {
            id: crypto.randomUUID(),
            video: null,
            subtitleFile: parsed.file,
            cues: parsed.cues,
            status: parsed.error || duplicateSubtitle ? "error" : "missing-video",
            error: parsed.error || (duplicateSubtitle ? "Tên video trùng nhau; không thể ghép SRT tự động." : undefined),
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

  const updateItem = (id: string, update: (item: VideoSubtitleItem) => VideoSubtitleItem) => {
    setItems((current) => current.map((item) => item.id === id ? update(item) : item));
  };

  const updateCue = (itemId: string, cueIndex: number, patch: Partial<EditableSubtitleCue>) => {
    updateItem(itemId, (item) => ({
      ...item,
      cues: item.cues.map((cue, index) => index === cueIndex
        ? { ...cue, ...patch, ...(patch.text !== undefined && patch.text !== cue.text ? { translatedText: "" } : {}) }
        : cue),
      status: item.status === "error" || (item.status === "translated" && patch.text !== undefined && patch.text !== item.cues[cueIndex]?.text)
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
      status: cues.length && cues.every((cue) => cue.text.trim() && cue.translatedText.trim())
        ? "translated"
        : item.video
          ? cues.length ? "ready" : "missing-subtitle"
          : item.subtitleFile ? "missing-video" : "missing-subtitle",
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
      const body = await response.json() as TranslationPromptResponse;
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
    const translations = new Map<number, string>();
    onProgress(0, `Đang gửi toàn bộ ${item.cues.length} câu trong một request…`);
    const response = await fetch("/api/subtitle-translation/translate", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      signal,
      body: JSON.stringify({
        cues: item.cues.map((cue, index) => ({ id: String(index), text: cue.text })),
        ...(systemPrompt ? { systemPrompt } : {}),
      }),
    });
    if (!response.ok) {
      const body = await response.json() as { error?: string };
      throw new Error(body.error || "Không thể dịch phụ đề.");
    }
    if (!response.body) throw new Error("Máy chủ không hỗ trợ stream kết quả dịch.");
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
          !Number.isInteger(index)
          || index < 0
          || index >= item.cues.length
          || typeof event.translation !== "string"
          || !event.translation.trim()
        ) return;
        const translation = event.translation.trim();
        translations.set(index, translation);
        completedCues.add(index);
        updateItem(item.id, (current) => ({
          ...current,
          cues: current.cues.map((cue, cueIndex) => cueIndex === index
            ? { ...cue, translatedText: translation }
            : cue),
        }));
        onProgress(completedCues.size, `Đã nhận ${completedCues.size}/${item.cues.length} câu dịch…`);
      } else if (event.type === "complete") {
        completed = true;
      } else if (event.type === "error") {
        throw new Error(typeof event.error === "string" ? event.error : "Không thể hoàn tất dịch phụ đề.");
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
    if (!completed) throw new Error("Kết nối stream kết thúc trước khi dịch hoàn tất.");
    if (completedCues.size !== item.cues.length) throw new Error("Kết quả dịch chưa đầy đủ. Một số câu chưa được model trả về.");
    updateItem(item.id, (current) => ({
      ...current,
      cues: current.cues.map((cue, index) => ({ ...cue, translatedText: translations.get(index) || cue.translatedText })),
      status: "translated",
      error: undefined,
    }));
  };

  const translateSelected = async () => {
    if (!selectedItem?.video || translationInProgress || !selectedItem.cues.length) return;
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
    updateItem(selectedItem.id, (item) => ({ ...item, status: "translating", error: undefined }));
    try {
      await translateItem(selectedItem, (completed, message) => setTranslationProgress({
        completed,
        total: selectedItem.cues.length,
        currentVideo: selectedItem.video!.name,
        message,
      }), customPrompt, controller.signal);
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      if (controller.signal.aborted) {
        updateItem(selectedItem.id, (item) => ({ ...item, status: "ready", error: undefined }));
        setBatchMessage("Đã dừng dịch. Các bản dịch đã có trước đó được giữ nguyên.");
      } else {
        updateItem(selectedItem.id, (item) => ({ ...item, status: "error", error: message }));
        setBatchMessage(`${selectedItem.video?.name || selectedItem.subtitleFile?.name}: ${message}`);
      }
    } finally {
      if (translationAbortControllerRef.current === controller) translationAbortControllerRef.current = null;
      setTranslationMode(null);
      setTranslationProgress(null);
    }
  };

  const translateAll = async () => {
    if (translationInProgress) return;
    const queue = items.filter((item) => item.video && item.cues.length && item.status !== "translated");
    if (!queue.length) return;
    const controller = new AbortController();
    translationAbortControllerRef.current = controller;
    setTranslationMode("all");
    setBatchMessage("");
    const totalCues = queue.reduce((total, item) => total + item.cues.length, 0);
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
      updateItem(item.id, (current) => ({ ...current, status: "translating", error: undefined }));
      try {
        await translateItem(item, (itemCompleted, message) => setTranslationProgress({
          completed: completedCues + itemCompleted,
          total: totalCues,
          currentVideo: item.video!.name,
          message: `Video ${itemIndex + 1}/${queue.length} · ${message}`,
        }), customPrompt, controller.signal);
      } catch (error) {
        const message = error instanceof Error ? error.message : String(error);
        if (controller.signal.aborted) {
          updateItem(item.id, (current) => ({ ...current, status: "ready", error: undefined }));
          break;
        } else {
          updateItem(item.id, (current) => ({ ...current, status: "error", error: message }));
          errors.push(`${item.video?.name || item.subtitleFile?.name}: ${message}`);
        }
      }
      if (controller.signal.aborted) break;
      completedCues += item.cues.length;
    }
    setBatchMessage(controller.signal.aborted
      ? "Đã dừng dịch. Các bản dịch đã hoàn tất trước đó được giữ nguyên."
      : errors.length
        ? `Đã dịch xong các video không lỗi; ${errors.length} video cần thử lại.`
        : `Đã dịch xong ${queue.length} video.`);
    if (translationAbortControllerRef.current === controller) translationAbortControllerRef.current = null;
    setTranslationMode(null);
    setTranslationProgress(null);
  };

  const cancelTranslation = () => {
    translationAbortControllerRef.current?.abort(new DOMException("Đã dừng theo yêu cầu.", "AbortError"));
  };

  const selectCue = (index: number) => {
    const cue = selectedItem?.cues[index];
    if (!cue) return;
    activeCueIndexRef.current = index;
    setActiveCueIndex(index);
    setLeftPanelTab("subtitles");
    scrollSubtitleCueIntoView(index);
    setVideoCurrentTime(cue.startTime);
    if (videoRef.current) videoRef.current.currentTime = cue.startTime;
  };

  const addSubtitleCue = () => {
    if (!selectedItem) return;
    const created = createSubtitleCueAtTime(selectedItem.cues, videoCurrentTime);
    if (!created) {
      setBatchMessage("Không thể thêm phụ đề tại vị trí này vì đang nằm trong phụ đề khác hoặc không còn khoảng trống tối thiểu 0,01 giây.");
      return;
    }
    updateItem(selectedItem.id, (item) => {
      const cues = [...item.cues];
      cues.splice(created.index, 0, created.cue);
      return { ...item, cues, status: "ready", error: undefined };
    });
    activeCueIndexRef.current = created.index;
    setActiveCueIndex(created.index);
    setLeftPanelTab("subtitles");
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
      setBatchMessage(`Không thể phát video: ${error instanceof Error ? error.message : String(error)}`);
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
    const url = URL.createObjectURL(new Blob([content], { type: "text/plain;charset=utf-8" }));
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
      setBatchMessage(`Không thể mở toàn màn hình: ${error instanceof Error ? error.message : String(error)}`);
    }
  };

  const displayedText = activeCue
    ? showTranslation && activeCue.translatedText.trim() ? activeCue.translatedText : activeCue.text
    : "";
  const readyVideoCount = items.filter((item) => item.video && item.cues.length).length;

  return (
    <div className="w-full space-y-4 px-3 sm:px-5 lg:px-7">
      <header className="flex flex-wrap items-end justify-between gap-3">
        <div>
          <div className="flex items-center gap-2 text-violet-300"><Subtitles className="h-5 w-5" /><span className="text-[11px] font-semibold uppercase tracking-[0.18em]">Subtitle Studio</span></div>
          <h1 className="mt-1 text-xl font-bold text-white sm:text-2xl">Dịch & sửa phụ đề</h1>
          <p className="mt-1 text-sm text-slate-400">Kéo video cùng tệp SRT vào; các tệp được ghép theo tên để dịch, chỉnh sửa và xem trước.</p>
        </div>
        <div className="flex flex-wrap items-center gap-2">
          <button type="button" onClick={() => fileInputRef.current?.click()} className="inline-flex items-center gap-2 rounded-xl border border-slate-700 bg-slate-900 px-3 py-2 text-xs font-semibold text-slate-200 hover:border-violet-400/50 hover:text-white"><Plus className="h-3.5 w-3.5" />Thêm video / SRT</button>
          <button type="button" onClick={onOpenSetup} className="inline-flex items-center gap-2 rounded-xl border border-slate-700 bg-slate-900 px-3 py-2 text-xs font-semibold text-slate-200 hover:border-violet-400/50 hover:text-white"><Settings className="h-3.5 w-3.5" />Cài đặt dịch</button>
          <button type="button" onClick={() => void openPromptDialog()} disabled={translationInProgress} className="inline-flex items-center gap-2 rounded-xl border border-violet-500/30 bg-violet-500/10 px-3 py-2 text-xs font-semibold text-violet-200 hover:bg-violet-500/20 disabled:opacity-40"><Subtitles className="h-3.5 w-3.5" />Prompt riêng</button>
          <button type="button" disabled={!selectedItem?.video || !selectedItem.cues.length || translationInProgress} onClick={() => void translateSelected()} className="inline-flex items-center gap-2 rounded-xl border border-violet-500/30 bg-violet-500/10 px-3 py-2 text-xs font-semibold text-violet-200 hover:bg-violet-500/20 disabled:opacity-40">{translationMode === "single" ? <LoaderCircle className="h-3.5 w-3.5 animate-spin" /> : <Languages className="h-3.5 w-3.5" />}{translationMode === "single" ? "Đang dịch video…" : "Dịch video đang chọn"}</button>
          <button type="button" disabled={!items.some((item) => item.video && item.cues.length && item.status !== "translated") || translationInProgress} onClick={() => void translateAll()} className="inline-flex items-center gap-2 rounded-xl border border-cyan-500/30 bg-cyan-500/10 px-3 py-2 text-xs font-semibold text-cyan-200 hover:bg-cyan-500/20 disabled:opacity-40">{translationMode === "all" ? <LoaderCircle className="h-3.5 w-3.5 animate-spin" /> : <Languages className="h-3.5 w-3.5" />}{translationMode === "all" ? "Đang dịch lần lượt…" : `Dịch tất cả (${items.filter((item) => item.video && item.cues.length && item.status !== "translated").length})`}</button>
        </div>
      </header>

      {translationProgress && (
        <section
          aria-label="Tiến trình dịch phụ đề"
          className="rounded-xl border border-violet-500/25 bg-violet-500/5 px-4 py-3"
        >
          <div className="flex flex-wrap items-center justify-between gap-x-4 gap-y-1">
            <div className="flex min-w-0 items-center gap-2 text-xs font-semibold text-violet-100">
              <LoaderCircle className="h-3.5 w-3.5 shrink-0 animate-spin" />
              <span className="truncate">{translationProgress.currentVideo}</span>
            </div>
            <span className="shrink-0 font-mono text-xs font-bold text-violet-200">
              {translationProgress.total
                ? `${Math.floor(translationProgress.completed * 100 / translationProgress.total)}% · ${translationProgress.completed}/${translationProgress.total} câu`
                : "Đang chuẩn bị…"}
            </span>
            <button type="button" onClick={cancelTranslation} className="inline-flex shrink-0 items-center gap-1 rounded-lg border border-rose-500/30 bg-rose-500/10 px-2.5 py-1.5 text-[10px] font-semibold text-rose-200 hover:bg-rose-500/20">
              <X className="h-3 w-3" />Dừng dịch
            </button>
          </div>
          <div
            role="progressbar"
            aria-valuemin={0}
            aria-valuemax={translationProgress.total || 1}
            aria-valuenow={translationProgress.completed}
            className="mt-2 h-2 overflow-hidden rounded-full bg-slate-800"
          >
            <div
              className="h-full rounded-full bg-gradient-to-r from-violet-500 to-cyan-400 transition-[width] duration-300"
              style={{ width: `${translationProgress.total ? Math.floor(translationProgress.completed * 100 / translationProgress.total) : 0}%` }}
            />
          </div>
          <p className="mt-1.5 text-[10px] text-slate-400">
            {translationProgress.message}
            {translationProgress.completed === 0 && " Engine có thể đang khởi động; lần dịch đầu thường cần chờ lâu hơn."}
          </p>
        </section>
      )}

      <input ref={fileInputRef} type="file" multiple accept="video/*,.srt" className="hidden" onChange={(event) => {
        if (event.target.files) void addFiles(event.target.files);
        event.target.value = "";
      }} />
      {batchMessage && <div role="status" className={`rounded-xl border px-3 py-2 text-xs ${batchMessage.includes("cần thử lại") || batchMessage.includes("không thể") ? "border-amber-500/30 bg-amber-500/5 text-amber-200" : "border-slate-700 bg-slate-900 text-slate-300"}`}>{batchMessage}</div>}

      {promptDialogOpen && (
        <div className="fixed inset-0 z-[120] flex items-center justify-center bg-black/75 p-4 backdrop-blur-sm">
          <section role="dialog" aria-modal="true" aria-labelledby="subtitle-prompt-title" className="flex max-h-[85vh] w-full max-w-3xl flex-col overflow-hidden rounded-2xl border border-slate-700 bg-slate-900 shadow-2xl">
            <header className="flex items-center justify-between gap-3 border-b border-slate-800 px-5 py-4">
              <div><h2 id="subtitle-prompt-title" className="text-sm font-bold text-white">Prompt dịch riêng</h2><p className="mt-1 text-[11px] text-slate-400">Mặc định nạp prompt từ Setup. Thay đổi ở đây chỉ áp dụng trong trang này, không sửa cấu hình Setup.</p></div>
              <button type="button" onClick={() => setPromptDialogOpen(false)} aria-label="Đóng prompt" className="rounded-lg p-2 text-slate-400 hover:bg-slate-800 hover:text-white"><X className="h-4 w-4" /></button>
            </header>
            <div className="min-h-0 flex-1 space-y-3 overflow-y-auto p-5">
              {promptError && <p role="alert" className="rounded-lg border border-rose-500/30 bg-rose-500/10 px-3 py-2 text-xs text-rose-200">{promptError}</p>}
              <textarea
                value={promptDraft}
                onChange={(event) => setPromptDraft(event.target.value)}
                disabled={promptLoading}
                maxLength={12_000}
                rows={18}
                placeholder={promptLoading ? "Đang tải prompt từ Setup…" : "Nhập prompt dịch…"}
                className="w-full resize-y rounded-xl border border-slate-700 bg-slate-950 p-3 font-mono text-xs leading-relaxed text-slate-100 outline-none placeholder:text-slate-600 focus:border-violet-400 disabled:opacity-50"
              />
              <div className="flex flex-wrap items-center justify-between gap-2 text-[10px] text-slate-500">
                <span>Giữ yêu cầu trả JSON `translations` với `id` và `translation` để hệ thống ghép đúng câu.</span>
                <span>{promptDraft.length.toLocaleString()}/12.000</span>
              </div>
            </div>
            <footer className="flex flex-wrap items-center justify-between gap-2 border-t border-slate-800 px-5 py-3">
              <button type="button" disabled={promptLoading || !promptDefault} onClick={() => { setPromptDraft(promptDefault); setCustomPrompt(null); }} className="rounded-lg border border-slate-700 px-3 py-2 text-xs font-semibold text-slate-300 hover:bg-slate-800 disabled:opacity-40">Dùng lại prompt Setup</button>
              <div className="flex items-center gap-2">
                <button type="button" onClick={() => setPromptDialogOpen(false)} className="rounded-lg border border-slate-700 px-3 py-2 text-xs font-semibold text-slate-300 hover:bg-slate-800">Hủy</button>
                <button type="button" disabled={promptLoading || !promptDraft.trim() || promptDraft.length > 12_000} onClick={() => { setCustomPrompt(promptDraft.trim()); setPromptDialogOpen(false); }} className="rounded-lg bg-violet-500 px-4 py-2 text-xs font-bold text-white hover:bg-violet-400 disabled:opacity-40">Dùng prompt này</button>
              </div>
            </footer>
          </section>
        </div>
      )}

      <div className="grid grid-cols-1 items-start gap-4 xl:grid-cols-2">
        <section className="flex h-[75vh] min-h-[360px] max-h-[900px] flex-col overflow-hidden rounded-2xl border border-slate-800 bg-slate-900/90 shadow-xl">
          <div className="flex flex-wrap items-center justify-between gap-2 border-b border-slate-800 px-4 py-3">
            <div><h2 className="text-sm font-bold text-white">Danh sách phụ đề · video preview</h2><p className="mt-0.5 text-[11px] text-slate-500">Chọn video để sửa; nhấn câu để tua đến thời điểm bắt đầu.</p></div>
            <div className="flex items-center gap-2">
              <button type="button" disabled={!selectedItem?.cues.length} onClick={() => selectedItem && downloadSrt(selectedItem, false)} className="inline-flex items-center gap-1.5 rounded-lg border border-slate-700 px-2.5 py-1.5 text-[10px] font-semibold text-slate-300 hover:bg-slate-800 disabled:opacity-40"><Download className="h-3 w-3" />SRT gốc</button>
              <button type="button" disabled={!selectedItem?.cues.length || !selectedItem.cues.every((cue) => cue.translatedText.trim())} onClick={() => selectedItem && downloadSrt(selectedItem, true)} className="inline-flex items-center gap-1.5 rounded-lg border border-emerald-500/30 bg-emerald-500/10 px-2.5 py-1.5 text-[10px] font-semibold text-emerald-200 hover:bg-emerald-500/20 disabled:opacity-40"><Download className="h-3 w-3" />SRT đã dịch</button>
              {items.length > 0 && <button type="button" onClick={() => { setItems([]); setSelectedId(""); setBatchMessage(""); }} disabled={translationInProgress} className="inline-flex items-center gap-1 rounded-lg border border-rose-500/30 px-2 py-1.5 text-[10px] font-semibold text-rose-200 hover:bg-rose-500/10 disabled:opacity-40"><Trash2 className="h-3 w-3" />Dọn</button>}
            </div>
          </div>
          <div className="flex border-b border-slate-800 bg-slate-950/40">
            <button type="button" role="tab" aria-selected={leftPanelTab === "videos"} onClick={() => setLeftPanelTab("videos")} className={`flex-1 border-b-2 px-4 py-2.5 text-xs font-semibold transition-colors ${leftPanelTab === "videos" ? "border-violet-400 text-violet-200" : "border-transparent text-slate-400 hover:text-white"}`}>Videos <span className="ml-1 font-mono text-[10px] text-slate-500">{items.filter((item) => item.video).length}</span></button>
            <button type="button" role="tab" aria-selected={leftPanelTab === "subtitles"} onClick={() => setLeftPanelTab("subtitles")} disabled={!selectedItem} className={`flex-1 border-b-2 px-4 py-2.5 text-xs font-semibold transition-colors disabled:cursor-not-allowed disabled:opacity-40 ${leftPanelTab === "subtitles" ? "border-violet-400 text-violet-200" : "border-transparent text-slate-400 hover:text-white"}`}>Phụ đề{selectedItem ? ` · ${selectedItem.video?.name || selectedItem.subtitleFile?.name}` : ""}</button>
            <button type="button" role="tab" aria-selected={leftPanelTab === "raw"} onClick={() => setLeftPanelTab("raw")} disabled={!selectedItem} className={`flex-1 border-b-2 px-4 py-2.5 text-xs font-semibold transition-colors disabled:cursor-not-allowed disabled:opacity-40 ${leftPanelTab === "raw" ? "border-violet-400 text-violet-200" : "border-transparent text-slate-400 hover:text-white"}`}>Phụ đề Raw</button>
          </div>
          {leftPanelTab === "videos" ? (
            <div
              role="tabpanel"
              onDragEnter={(event) => { event.preventDefault(); setDragging(true); }}
              onDragOver={(event) => { event.preventDefault(); setDragging(true); }}
              onDragLeave={(event) => { if (!event.currentTarget.contains(event.relatedTarget as Node | null)) setDragging(false); }}
              onDrop={handleDrop}
              className="min-h-0 flex-1 overflow-y-auto"
            >
              <button
                type="button"
                onClick={() => fileInputRef.current?.click()}
                className={`mx-3 mt-3 block w-[calc(100%-1.5rem)] rounded-xl border border-dashed px-3 py-3 text-center text-[11px] transition-colors ${dragging ? "border-violet-400 bg-violet-500/10 text-violet-100" : "border-slate-700 bg-slate-950/40 text-slate-400 hover:border-violet-400/50 hover:text-violet-200"}`}
              >
                <Upload className="mr-1.5 inline h-3.5 w-3.5" />Thả video/SRT vào đây hoặc bấm để thêm
                <span className="mt-1 block text-[9px] text-slate-500">Tự ghép theo tên file</span>
              </button>
              <div className="sticky top-0 z-10 flex items-center justify-between border-b border-slate-800 bg-slate-900/95 px-4 py-2 backdrop-blur"><h3 className="text-[11px] font-bold text-slate-300">Video trong hàng đợi</h3><span className="font-mono text-[10px] text-slate-500">{readyVideoCount}/{items.filter((item) => item.video).length} video có phụ đề</span></div>
              <div className="divide-y divide-slate-800/70">
                {items.length ? items.map((item) => (
                  <div key={item.id} title={item.error || undefined} className={`flex items-center gap-2 px-3 py-2 ${selectedId === item.id ? "bg-violet-500/10" : ""}`}>
                    <button type="button" onClick={() => { setSelectedId(item.id); setActiveCueIndex(-1); setLeftPanelTab("subtitles"); }} aria-pressed={selectedId === item.id} className="flex min-w-0 flex-1 items-center gap-2 rounded text-left">
                      <FileVideo2 className={`h-4 w-4 shrink-0 ${selectedId === item.id ? "text-violet-300" : "text-slate-500"}`} />
                      <span className="min-w-0 flex-1"><span className="block truncate text-[11px] font-medium text-slate-200">{item.video?.name || item.subtitleFile?.name}</span><span className={`mt-0.5 block text-[10px] ${statusColor(item.status)}`}>{item.status === "translating" ? <><LoaderCircle className="mr-1 inline h-3 w-3 animate-spin" />{statusLabel(item.status)}</> : item.status === "translated" ? <><CheckCircle2 className="mr-1 inline h-3 w-3" />{statusLabel(item.status)}</> : item.status === "error" ? <><AlertCircle className="mr-1 inline h-3 w-3" />{statusLabel(item.status)} · {item.error}</> : statusLabel(item.status)}{item.cues.length ? ` · ${item.cues.length} câu` : ""}</span></span>
                    </button>
                    <button type="button" onClick={() => removeItem(item.id)} disabled={translationInProgress} title="Xóa khỏi danh sách" aria-label={`Xóa ${item.video?.name || item.subtitleFile?.name}`} className="rounded p-1 text-slate-500 hover:bg-slate-800 hover:text-rose-300 disabled:opacity-30"><X className="h-3.5 w-3.5" /></button>
                  </div>
                )) : <button type="button" onClick={() => fileInputRef.current?.click()} className="flex w-full items-center justify-center gap-2 px-4 py-5 text-[11px] text-slate-500 hover:text-violet-200"><Upload className="h-4 w-4" />Thêm video và tệp SRT</button>}
              </div>
            </div>
          ) : leftPanelTab === "subtitles" ? (
            <div ref={subtitleListRef} role="tabpanel" className="min-h-0 flex-1 overflow-y-auto">
              <div className="sticky top-0 z-10 flex items-center justify-between border-b border-slate-800 bg-slate-900/95 px-4 py-2.5 backdrop-blur">
                <span className="truncate text-xs font-bold text-white">{selectedItem?.video?.name || selectedItem?.subtitleFile?.name || "Chưa chọn video"}</span>
                <div className="ml-2 flex shrink-0 items-center gap-2"><span className="font-mono text-[10px] text-slate-500">{selectedItem?.cues.length || 0} câu</span><button type="button" onClick={() => setShowTranslation((current) => !current)} className={`rounded-md border px-2 py-1 text-[10px] font-semibold ${showTranslation ? "border-violet-500/30 text-violet-200" : "border-slate-700 text-slate-400"}`}>{showTranslation ? "Preview: dịch" : "Preview: gốc"}</button></div>
              </div>
              {selectedItem?.cues.length ? <div className="divide-y divide-slate-800/80">
                {selectedItem.cues.map((cue, index) => (
                  <article
                    key={`${selectedItem.id}-${index}`}
                    ref={(element) => {
                      if (element) subtitleCueElementsRef.current.set(index, element);
                      else subtitleCueElementsRef.current.delete(index);
                    }}
                    className={`p-3 transition-colors ${activeCue === cue ? "bg-violet-500/5" : ""}`}
                  >
                    <div className="mb-2 flex flex-wrap items-center justify-between gap-2">
                      <button type="button" onClick={() => selectCue(index)} className="font-mono text-[10px] text-cyan-300 hover:text-cyan-100">#{index + 1} · {cueTime(cue.startTime)} → {cueTime(cue.endTime)}</button>
                      <div className="flex items-center gap-1.5">
                        <label className="flex items-center gap-1 text-[9px] text-slate-500">Bắt đầu<input aria-label={`Thời gian bắt đầu câu ${index + 1}`} type="number" min="0" step="0.01" value={cue.startTime} disabled={translationInProgress} onChange={(event) => updateCue(selectedItem.id, index, { startTime: Math.max(0, Number(event.target.value) || 0) })} className="w-16 rounded border border-slate-700 bg-slate-950 px-1 py-1 font-mono text-[10px] text-slate-300 outline-none focus:border-cyan-500" /></label>
                        <label className="flex items-center gap-1 text-[9px] text-slate-500">Kết thúc<input aria-label={`Thời gian kết thúc câu ${index + 1}`} type="number" min="0" step="0.01" value={cue.endTime} disabled={translationInProgress} onChange={(event) => updateCue(selectedItem.id, index, { endTime: Math.max(cue.startTime + 0.01, Number(event.target.value) || cue.startTime + 0.01) })} className="w-16 rounded border border-slate-700 bg-slate-950 px-1 py-1 font-mono text-[10px] text-slate-300 outline-none focus:border-cyan-500" /></label>
                      </div>
                    </div>
                    <div className="grid grid-cols-1 gap-2 md:grid-cols-2">
                      <label className="min-w-0 text-[9px] font-semibold uppercase tracking-wide text-slate-500">Gốc<textarea aria-label={`Nội dung gốc câu ${index + 1}`} value={cue.text} disabled={translationInProgress} onChange={(event) => updateCue(selectedItem.id, index, { text: event.target.value })} rows={Math.min(4, Math.max(2, cue.text.split("\n").length))} className="mt-1 w-full resize-y rounded-lg border border-slate-700/80 bg-slate-950/70 px-2.5 py-1.5 text-[11px] font-normal leading-[15px] normal-case tracking-normal text-slate-100 outline-none focus:border-cyan-500/60 disabled:opacity-60" /></label>
                      <label className="min-w-0 text-[9px] font-semibold uppercase tracking-wide text-violet-300">Bản dịch<textarea aria-label={`Bản dịch câu ${index + 1}`} value={cue.translatedText} disabled={translationInProgress} onChange={(event) => updateCue(selectedItem.id, index, { translatedText: event.target.value })} rows={Math.min(4, Math.max(2, cue.translatedText.split("\n").length))} placeholder="Nhập hoặc sửa bản dịch…" className="mt-1 w-full resize-y rounded-lg border border-violet-500/20 bg-violet-950/10 px-2.5 py-1.5 text-[11px] font-normal leading-[15px] normal-case tracking-normal text-violet-100 outline-none placeholder:text-slate-600 focus:border-violet-400/60 disabled:opacity-60" /></label>
                    </div>
                  </article>
                ))}
              </div> : <div className="flex min-h-56 flex-col items-center justify-center px-6 text-center"><Captions className="h-8 w-8 text-slate-600" /><p className="mt-3 text-xs font-medium text-slate-300">{selectedItem ? selectedItem.status === "missing-subtitle" ? "Video chưa có tệp SRT ghép cặp" : "Tệp SRT chưa được ghép với video" : "Chưa có video hoặc phụ đề"}</p><p className="mt-1 text-[11px] text-slate-500">Thêm video và SRT cùng lúc, hoặc bổ sung tệp còn thiếu sau.</p></div>}
            </div>
          ) : (
            <div role="tabpanel" className="flex min-h-0 flex-1 flex-col overflow-hidden">
              <div className="flex items-center justify-between border-b border-slate-800 bg-slate-900/95 px-4 py-2.5">
                <span className="truncate text-xs font-bold text-white">{selectedItem?.video?.name || selectedItem?.subtitleFile?.name || "Chưa chọn video"}</span>
                <span className="ml-2 shrink-0 font-mono text-[10px] text-slate-500">{selectedItem?.cues.length || 0} câu</span>
              </div>
              <div className="grid min-h-0 flex-1 grid-cols-1 gap-2 overflow-y-auto p-2 lg:grid-cols-2">
                <RawSubtitleColumn
                  title="SRT gốc"
                  translated={false}
                  cues={selectedItem?.cues || []}
                  disabled={translationInProgress}
                  onApply={applyRawSubtitles}
                />
                <RawSubtitleColumn
                  title="SRT bản dịch"
                  translated
                  cues={selectedItem?.cues || []}
                  disabled={translationInProgress}
                  onApply={applyRawSubtitles}
                />
              </div>
            </div>
          )}
        </section>

        <section className="overflow-hidden rounded-2xl border border-slate-800 bg-slate-900/90 shadow-xl">
          <div className="flex items-center justify-between gap-3 border-b border-slate-800 px-4 py-3">
            <div><h2 className="text-sm font-bold text-white">Xem trước video</h2><p className="mt-0.5 max-w-[60vw] truncate text-[11px] text-slate-500">{selectedItem?.video?.name || "Chọn video từ danh sách"}</p></div>
            <span className={`rounded-full border px-2.5 py-1 text-[10px] font-semibold ${selectedItem ? `${statusColor(selectedItem.status)} border-slate-700` : "border-slate-700 text-slate-500"}`}>{selectedItem ? statusLabel(selectedItem.status) : "Chưa chọn"}</span>
          </div>
          <div
            ref={previewFrameRef}
            className={previewFullscreen
              ? "fixed inset-0 z-[100] flex h-screen w-screen items-center justify-center bg-black"
              : "relative flex aspect-video items-center justify-center bg-black"}
          >
            <div
              className="relative flex aspect-video max-h-full max-w-full items-center justify-center bg-black"
              style={previewFullscreen && videoUrl
                ? { width: `min(100vw, ${videoAspectRatio * 100}vh)`, aspectRatio: String(videoAspectRatio) }
                : { width: "100%" }}
            >
              {videoUrl ? <video key={selectedId} ref={videoRef} src={videoUrl} onLoadedMetadata={(event) => {
                const { videoWidth, videoHeight } = event.currentTarget;
                setVideoDuration(event.currentTarget.duration || 0);
                setVideoCurrentTime(event.currentTarget.currentTime);
                setVideoPaused(event.currentTarget.paused);
                if (videoWidth > 0 && videoHeight > 0) setVideoAspectRatio(videoWidth / videoHeight);
              }} className="h-full w-full object-contain" /> : <div className="flex flex-col items-center gap-2 text-slate-600"><FileVideo2 className="h-10 w-10" /><span className="text-xs">Video chưa được ghép hoặc chưa được chọn</span></div>}
              {videoUrl && displayedText && <div className="pointer-events-none absolute inset-x-0 bottom-[12%] flex justify-center px-6"><span className={`max-w-[90%] whitespace-pre-line rounded bg-black/70 px-3 py-1.5 text-center font-semibold text-white [text-shadow:0_1px_3px_#000] ${previewFullscreen ? "text-[clamp(1.5rem,3.5vw,3rem)] leading-tight" : "text-sm sm:text-base"}`}>{displayedText}</span></div>}
              {videoUrl && <button type="button" onClick={() => void togglePreviewFullscreen()} aria-label={previewFullscreen ? "Thoát toàn màn hình" : "Xem video toàn màn hình"} title={previewFullscreen ? "Thoát toàn màn hình" : "Xem video toàn màn hình"} className="absolute right-3 top-3 z-10 rounded-lg border border-white/20 bg-black/60 p-2 text-white opacity-70 transition-opacity hover:opacity-100 focus:opacity-100">
                {previewFullscreen ? <Minimize2 className="h-4 w-4" /> : <Maximize2 className="h-4 w-4" />}
              </button>}
            </div>
          </div>
          <div className="flex items-center gap-2 border-b border-slate-800 bg-slate-950/50 px-4 py-2">
            <button type="button" onClick={() => void toggleVideoPlayback()} disabled={!videoUrl} aria-label={videoPaused ? "Phát video" : "Tạm dừng video"} title={videoPaused ? "Phát" : "Tạm dừng"} className="rounded-lg border border-cyan-500/30 bg-cyan-500/10 p-2 text-cyan-200 hover:bg-cyan-500/20 disabled:opacity-40">
              {videoPaused ? <Play className="h-4 w-4" /> : <Pause className="h-4 w-4" />}
            </button>
            <button type="button" onClick={stopVideo} disabled={!videoUrl} aria-label="Dừng video và tua về đầu" title="Dừng / về đầu" className="rounded-lg border border-slate-700 bg-slate-900 p-2 text-slate-300 hover:border-slate-500 disabled:opacity-40">
              <Square className="h-4 w-4 fill-current" />
            </button>
            <span className="ml-1 font-mono text-[11px] text-slate-300">{cueTime(videoCurrentTime)} <span className="text-slate-600">/</span> {cueTime(videoDuration)}</span>
            <span className="ml-auto text-[10px] text-slate-500">Ctrl + cuộn: zoom · Shift + cuộn: cuộn ngang</span>
          </div>
          <SubtitleTimeline
            file={selectedItem?.video || null}
            duration={videoDuration}
            currentTime={videoCurrentTime}
            cues={selectedItem?.cues || []}
            selectedCueIndex={activeCueIndex}
            disabled={translationInProgress || !selectedItem?.video}
            onCueChange={(index, patch) => selectedItem && updateCue(selectedItem.id, index, patch)}
            onCueSelect={selectCue}
            onSeek={seekVideo}
            onAddCue={addSubtitleCue}
          />
          <div className="flex flex-wrap items-center justify-between gap-2 border-t border-slate-800 bg-slate-950/40 px-4 py-3 text-[11px] text-slate-400">
            <span>{activeCue ? `Câu đang phát · ${cueTime(activeCue.startTime)} – ${cueTime(activeCue.endTime)}` : "Phụ đề sẽ hiện theo thời gian phát video."}</span>
            <span>{showTranslation ? "Ưu tiên bản dịch, tự dùng câu gốc nếu chưa dịch" : "Đang xem câu gốc"}</span>
          </div>
        </section>
      </div>
    </div>
  );
}
