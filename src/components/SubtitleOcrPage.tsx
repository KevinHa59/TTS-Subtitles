import { useEffect, useRef, useState, type PointerEvent as ReactPointerEvent } from "react";
import {
  Captions,
  ChevronDown,
  Clock3,
  Download,
  FileVideo2,
  FolderOpen,
  Languages,
  LoaderCircle,
  Pause,
  Play,
  Settings2,
  Trash2,
  Upload,
  Video,
  Volume2,
  X,
} from "lucide-react";

type SubtitleRegion = "lower" | "center" | "upper";
type PreviewSubtitleMode = "none" | "original" | "vietnamese";
type NormalizedCrop = { x: number; y: number; width: number; height: number };
type CropDragState = { mode: "draw" | "move" | "resize"; startX: number; startY: number; crop: NormalizedCrop };
type VideoFrameElement = HTMLVideoElement & {
  requestVideoFrameCallback?: (callback: (_now: number, metadata: { mediaTime: number }) => void) => number;
  cancelVideoFrameCallback?: (callbackId: number) => void;
};
type InstallStatus = {
  status: "not_installed" | "running" | "ready" | "error" | "cancelled";
  stage: string;
  progressPercent: number | null;
  message: string;
  error?: string;
  gpuRuntimeError?: string;
  runtimeReady: boolean;
  gpuRuntimeReady: boolean;
  modelsReady: boolean;
};

const initialInstallStatus: InstallStatus = {
  status: "not_installed", stage: "idle", progressPercent: null,
  message: "Chưa cài bộ nhận diện.", runtimeReady: false, gpuRuntimeReady: false, modelsReady: false,
};
type OcrCue = { startTime: number; endTime: number; text: string; translatedText?: string; confidence: number; alignment?: string };
type OcrJob = { id: string; status: "queued" | "running" | "completed" | "error" | "cancelled"; startedAt: number; elapsedMs: number; progressPercent: number; processedFrames: number; totalFrames: number; message: string; backend?: "cpu" | "directml"; subtitles: OcrCue[]; error?: string };
type BatchVideo = { id: string; file: File; status: "pending" | "running" | "completed" | "error" | "cancelled"; job?: OcrJob; error?: string };

function formatTime(seconds: number) {
  const value = Math.max(0, seconds);
  const hours = Math.floor(value / 3600);
  const minutes = Math.floor((value % 3600) / 60);
  const wholeSeconds = Math.floor(value % 60);
  const milliseconds = Math.floor((value % 1) * 1000);
  return `${String(hours).padStart(2, "0")}:${String(minutes).padStart(2, "0")}:${String(wholeSeconds).padStart(2, "0")},${String(milliseconds).padStart(3, "0")}`;
}

function formatElapsed(milliseconds: number) {
  const seconds = Math.max(0, Math.floor(milliseconds / 1000));
  const hours = Math.floor(seconds / 3600);
  const minutes = Math.floor((seconds % 3600) / 60);
  const remainingSeconds = seconds % 60;
  return hours > 0
    ? `${String(hours).padStart(2, "0")}:${String(minutes).padStart(2, "0")}:${String(remainingSeconds).padStart(2, "0")}`
    : `${String(minutes).padStart(2, "0")}:${String(remainingSeconds).padStart(2, "0")}`;
}

function formatPlayerTime(seconds: number) {
  const value = Math.max(0, Math.floor(Number.isFinite(seconds) ? seconds : 0));
  const hours = Math.floor(value / 3600);
  const minutes = Math.floor((value % 3600) / 60);
  const remainingSeconds = value % 60;
  return hours > 0
    ? `${hours}:${String(minutes).padStart(2, "0")}:${String(remainingSeconds).padStart(2, "0")}`
    : `${minutes}:${String(remainingSeconds).padStart(2, "0")}`;
}

function PreviewSubtitleOverlay({
  videoRef,
  subtitles,
  mode,
}: {
  videoRef: React.RefObject<HTMLVideoElement | null>;
  subtitles: OcrCue[];
  mode: Exclude<PreviewSubtitleMode, "none">;
}) {
  const [activeIndex, setActiveIndex] = useState(-1);
  const activeIndexRef = useRef(-1);

  useEffect(() => {
    const video = videoRef.current as VideoFrameElement | null;
    if (!video) return;
    let disposed = false;
    let frameCallbackId: number | null = null;
    let animationFrameId: number | null = null;

    const updateActiveCue = (time: number) => {
      const nextIndex = subtitles.findIndex((cue) => time >= cue.startTime && time < cue.endTime);
      if (nextIndex !== activeIndexRef.current) {
        activeIndexRef.current = nextIndex;
        setActiveIndex(nextIndex);
      }
    };

    const onVideoTimeEvent = () => updateActiveCue(video.currentTime);
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
    const onPlay = () => scheduleVideoFrame();

    video.addEventListener("timeupdate", onVideoTimeEvent);
    video.addEventListener("seeked", onVideoTimeEvent);
    video.addEventListener("loadeddata", onVideoTimeEvent);
    video.addEventListener("play", onPlay);
    video.addEventListener("pause", onVideoTimeEvent);
    updateActiveCue(video.currentTime);
    if (!video.paused) scheduleVideoFrame();

    return () => {
      disposed = true;
      video.removeEventListener("timeupdate", onVideoTimeEvent);
      video.removeEventListener("seeked", onVideoTimeEvent);
      video.removeEventListener("loadeddata", onVideoTimeEvent);
      video.removeEventListener("play", onPlay);
      video.removeEventListener("pause", onVideoTimeEvent);
      if (frameCallbackId !== null) video.cancelVideoFrameCallback?.(frameCallbackId);
      if (animationFrameId !== null) window.cancelAnimationFrame(animationFrameId);
    };
  }, [mode, subtitles, videoRef]);

  const activeCue = activeIndex >= 0 ? subtitles[activeIndex] : undefined;
  const text = mode === "original" ? activeCue?.text : activeCue?.translatedText;
  if (!text) return null;

  return (
    <div className="pointer-events-none absolute inset-x-3 bottom-[9%] z-10 flex justify-center px-2">
      <div className="max-w-[90%] whitespace-pre-wrap rounded-md bg-black/75 px-3 py-1.5 text-center text-sm font-semibold leading-snug text-white [text-shadow:0_1px_2px_#000] sm:text-base">{text}</div>
    </div>
  );
}

export default function SubtitleOcrPage({ onOpenSetup }: { onOpenSetup: () => void }) {
  const inputRef = useRef<HTMLInputElement>(null);
  const folderInputRef = useRef<HTMLInputElement>(null);
  const videoRef = useRef<HTMLVideoElement>(null);
  const previewRef = useRef<HTMLDivElement>(null);
  const cropDragRef = useRef<CropDragState | null>(null);
  const [videoFile, setVideoFile] = useState<File | null>(null);
  const [batchVideos, setBatchVideos] = useState<BatchVideo[]>([]);
  const [videoUrl, setVideoUrl] = useState<string | null>(null);
  const [videoSize, setVideoSize] = useState({ width: 0, height: 0 });
  const [playerTime, setPlayerTime] = useState(0);
  const [previewSubtitleMode, setPreviewSubtitleMode] = useState<PreviewSubtitleMode>("none");
  const [playerDuration, setPlayerDuration] = useState(0);
  const [playerPlaying, setPlayerPlaying] = useState(false);
  const [playerVolume, setPlayerVolume] = useState(1);
  const [previewSize, setPreviewSize] = useState({ width: 0, height: 0 });
  const [cropRegion, setCropRegion] = useState<NormalizedCrop | null>(null);
  const [drawCropMode, setDrawCropMode] = useState(false);
  const [zone1, setZone1] = useState<SubtitleRegion>("lower");
  const [zone2, setZone2] = useState<SubtitleRegion>("center");
  const [timeStart, setTimeStart] = useState("0:00");
  const [timeEnd, setTimeEnd] = useState("");
  const [confidence, setConfidence] = useState(75);
  const [similarity, setSimilarity] = useState(80);
  const [maxMergeGap, setMaxMergeGap] = useState("0.6");
  const [brightnessThreshold, setBrightnessThreshold] = useState("");
  const [ssimThreshold, setSsimThreshold] = useState(92);
  const [maxImageWidth, setMaxImageWidth] = useState("720");
  const [framesToSkip, setFramesToSkip] = useState("1");
  const [minimumDuration, setMinimumDuration] = useState("0.2");
  const [useFullFrame, setUseFullFrame] = useState(false);
  const [useDualZone, setUseDualZone] = useState(false);
  const [alignment1, setAlignment1] = useState("bottom-center");
  const [alignment2, setAlignment2] = useState("bottom-center");
  const [subtitleAlignment, setSubtitleAlignment] = useState(false);
  const [angleClassification, setAngleClassification] = useState(false);
  const [useGpu, setUseGpu] = useState(true);
  const [normalizeTraditional, setNormalizeTraditional] = useState(true);
  const [dragging, setDragging] = useState(false);
  const [installStatus, setInstallStatus] = useState<InstallStatus>(initialInstallStatus);
  const [ocrJob, setOcrJob] = useState<OcrJob | null>(null);
  const [ocrRequestPending, setOcrRequestPending] = useState(false);
  const [ocrError, setOcrError] = useState("");
  const [translationPending, setTranslationPending] = useState(false);
  const [translationError, setTranslationError] = useState("");
  const [translationStyle, setTranslationStyle] = useState("");
  const [translationStyleDraft, setTranslationStyleDraft] = useState("");
  const [translationStyleDialogOpen, setTranslationStyleDialogOpen] = useState(false);
  const [translationProgress, setTranslationProgress] = useState<{ current: number; total: number } | null>(null);
  const [parallelVideos, setParallelVideos] = useState(1);
  const [cpuThreads, setCpuThreads] = useState(8);
  const [downloadAllMessage, setDownloadAllMessage] = useState("");
  const batchCancelRef = useRef(false);
  const currentOcrJobIdsRef = useRef(new Set<string>());

  useEffect(() => {
    folderInputRef.current?.setAttribute("webkitdirectory", "");
    folderInputRef.current?.setAttribute("directory", "");
  }, []);

  useEffect(() => {
    const element = previewRef.current;
    if (!element || typeof ResizeObserver === "undefined") return;
    const observer = new ResizeObserver(([entry]) => {
      setPreviewSize({ width: entry.contentRect.width, height: entry.contentRect.height });
    });
    observer.observe(element);
    return () => observer.disconnect();
  }, [videoUrl]);

  const previewContentRect = (() => {
    if (!videoSize.width || !videoSize.height || !previewSize.width || !previewSize.height) return null;
    const scale = Math.min(previewSize.width / videoSize.width, previewSize.height / videoSize.height);
    const width = videoSize.width * scale;
    const height = videoSize.height * scale;
    return { left: (previewSize.width - width) / 2, top: (previewSize.height - height) / 2, width, height };
  })();

  const cropPointerPosition = (event: ReactPointerEvent<HTMLDivElement>) => {
    const bounds = event.currentTarget.getBoundingClientRect();
    return {
      x: Math.max(0, Math.min(1, (event.clientX - bounds.left) / Math.max(bounds.width, 1))),
      y: Math.max(0, Math.min(1, (event.clientY - bounds.top) / Math.max(bounds.height, 1))),
    };
  };

  const onCropPointerDown = (event: ReactPointerEvent<HTMLDivElement>) => {
    if (!drawCropMode || useFullFrame || ocrJob?.status === "running") return;
    event.preventDefault();
    const point = cropPointerPosition(event);
    const handle = (event.target as HTMLElement).dataset.cropHandle;
    const insideCrop = cropRegion && point.x >= cropRegion.x && point.x <= cropRegion.x + cropRegion.width && point.y >= cropRegion.y && point.y <= cropRegion.y + cropRegion.height;
    const mode: CropDragState["mode"] = handle ? "resize" : insideCrop ? "move" : "draw";
    cropDragRef.current = { mode, startX: point.x, startY: point.y, crop: cropRegion || { x: point.x, y: point.y, width: 0.01, height: 0.01 } };
    if (mode === "draw") setCropRegion({ x: point.x, y: point.y, width: 0.01, height: 0.01 });
    event.currentTarget.setPointerCapture(event.pointerId);
  };

  const onCropPointerMove = (event: ReactPointerEvent<HTMLDivElement>) => {
    const drag = cropDragRef.current;
    if (!drag) return;
    const point = cropPointerPosition(event);
    const minSize = 0.01;
    if (drag.mode === "draw") {
      const left = Math.min(drag.startX, point.x);
      const top = Math.min(drag.startY, point.y);
      const x = Math.min(left, 1 - minSize);
      const y = Math.min(top, 1 - minSize);
      setCropRegion({ x, y, width: Math.min(1 - x, Math.max(minSize, Math.abs(point.x - drag.startX))), height: Math.min(1 - y, Math.max(minSize, Math.abs(point.y - drag.startY))) });
    } else if (drag.mode === "move") {
      setCropRegion({
        ...drag.crop,
        x: Math.max(0, Math.min(1 - drag.crop.width, drag.crop.x + point.x - drag.startX)),
        y: Math.max(0, Math.min(1 - drag.crop.height, drag.crop.y + point.y - drag.startY)),
      });
    } else {
      setCropRegion({
        ...drag.crop,
        width: Math.max(minSize, Math.min(1 - drag.crop.x, point.x - drag.crop.x)),
        height: Math.max(minSize, Math.min(1 - drag.crop.y, point.y - drag.crop.y)),
      });
    }
  };

  const onCropPointerUp = (event: ReactPointerEvent<HTMLDivElement>) => {
    cropDragRef.current = null;
    if (event.currentTarget.hasPointerCapture(event.pointerId)) event.currentTarget.releasePointerCapture(event.pointerId);
  };

  useEffect(() => {
    let live = true;
    const pollStatus = async () => {
      try {
        const response = await fetch("/api/subtitle-ocr/install/status");
        if (response.ok) {
          const body = await response.json();
          if (live && body.success) setInstallStatus(body);
        }
      } catch { /* server may still be starting */ }
    };
    void pollStatus();
    const timer = window.setInterval(() => { void pollStatus(); }, 1200);
    return () => { live = false; window.clearInterval(timer); };
  }, []);

  useEffect(() => {
    if (!ocrJob?.id || !["queued", "running"].includes(ocrJob.status)) return;
    let live = true;
    const poll = async () => {
      try {
        const response = await fetch(`/api/subtitle-ocr/jobs/${ocrJob.id}`);
        const body = await response.json();
        if (live && body.success) setOcrJob(body.job);
      } catch { /* a temporary connection issue; poll again */ }
    };
    const timer = window.setInterval(() => { void poll(); }, 900);
    return () => { live = false; window.clearInterval(timer); };
  }, [ocrJob?.id, ocrJob?.status]);

  useEffect(() => {
    return () => {
      if (videoUrl) URL.revokeObjectURL(videoUrl);
    };
  }, [videoUrl]);

  const selectPreviewVideo = (file: File, job?: OcrJob) => {
    setVideoFile(file);
    setVideoUrl(URL.createObjectURL(file));
    setVideoSize({ width: 0, height: 0 });
    setPlayerTime(0);
    setPlayerDuration(0);
    setPlayerPlaying(false);
    setPlayerTime(0);
    setOcrJob(job || null);
    setOcrError(job?.error || "");
  };

  const loadVideos = (files?: FileList | File[]) => {
    const accepted = Array.from(files || []).filter((file) => file.type.startsWith("video/") || /\.(mp4|m4v|mkv|mov|webm|avi|mpeg|mpg|wmv|flv|ts|mts)$/i.test(file.name));
    if (!accepted.length) return;
    setOcrError("");
    const additions = accepted.map((file) => ({ id: crypto.randomUUID(), file, status: "pending" as const }));
    const fileKey = (file: File) => `${("webkitRelativePath" in file ? (file as File & { webkitRelativePath?: string }).webkitRelativePath : "") || file.name}:${file.size}:${file.lastModified}`;
    setBatchVideos((current) => {
      const known = new Set(current.map(({ file }) => fileKey(file)));
      const next = [...current];
      for (const addition of additions) {
        const key = fileKey(addition.file);
        if (known.has(key)) continue;
        known.add(key);
        next.push(addition);
      }
      return next;
    });
    if (!videoFile) {
      selectPreviewVideo(accepted[0]);
    }
  };

  const clearVideoList = () => {
    if (ocrRequestPending || !batchVideos.length) return;
    if (!window.confirm("Xóa toàn bộ video và kết quả OCR khỏi danh sách? Các thiết lập, bao gồm vùng OCR, sẽ được giữ nguyên.")) return;
    setBatchVideos([]);
    setVideoFile(null);
    setVideoUrl(null);
    setVideoSize({ width: 0, height: 0 });
    setPlayerTime(0);
    setPlayerDuration(0);
    setPlayerPlaying(false);
    setOcrJob(null);
    setOcrError("");
    setDownloadAllMessage("");
  };

  const makeOcrQuery = (file: File, width = videoSize.width, height = videoSize.height) => {
    const query = new URLSearchParams({
      filename: file.name, timeStart, timeEnd, confidence: String(confidence),
      similarity: String(similarity), maxMergeGap, brightnessThreshold,
      ssimThreshold: String(ssimThreshold), maxImageWidth, framesToSkip,
      minimumDuration, useFullFrame: String(useFullFrame), useDualZone: String(useDualZone),
      zone1, zone2, alignment1, alignment2, angleClassification: String(angleClassification),
      normalizeTraditional: String(normalizeTraditional), cpuThreads: String(cpuThreads), useGpu: String(useGpu),
    });
    if (cropRegion && !useFullFrame && width > 0 && height > 0) {
      query.set("cropX", String(Math.round(cropRegion.x * width)));
      query.set("cropY", String(Math.round(cropRegion.y * height)));
      query.set("cropWidth", String(Math.max(1, Math.round(cropRegion.width * width))));
      query.set("cropHeight", String(Math.max(1, Math.round(cropRegion.height * height))));
    }
    return query;
  };

  const readVideoMetadata = (file: File) => new Promise<{ width: number; height: number; duration: number }>((resolve, reject) => {
    const url = URL.createObjectURL(file);
    const probe = document.createElement("video");
    probe.preload = "metadata";
    probe.onloadedmetadata = () => {
      const metadata = { width: probe.videoWidth, height: probe.videoHeight, duration: Number.isFinite(probe.duration) ? probe.duration : 0 };
      URL.revokeObjectURL(url);
      resolve(metadata);
    };
    probe.onerror = () => {
      URL.revokeObjectURL(url);
      reject(new Error(`Không đọc được metadata của ${file.name}.`));
    };
    probe.src = url;
  });

  const secondsToClock = (seconds: number) => {
    const hours = Math.floor(seconds / 3600);
    const minutes = Math.floor((seconds % 3600) / 60);
    const remaining = (seconds % 60).toFixed(3).replace(/\.000$/, "");
    return `${hours}:${String(minutes).padStart(2, "0")}:${String(remaining).padStart(2, "0")}`;
  };

  const startOcr = async () => {
    const pendingVideos = batchVideos.filter((item) => item.status === "pending" || item.status === "error");
    if (!pendingVideos.length) return;
    if (installStatus.status !== "ready") {
      onOpenSetup();
      return;
    }
    batchCancelRef.current = false;
    setOcrRequestPending(true);
    setOcrError("");
    let nextIndex = 0;
    const runNextVideo = async () => {
      while (!batchCancelRef.current) {
        const item = pendingVideos[nextIndex++];
        if (!item) return;
        setBatchVideos((current) => current.map((entry) => entry.id === item.id ? { ...entry, status: "running", error: undefined, job: undefined } : entry));
        try {
          const metadata = await readVideoMetadata(item.file);
          const query = makeOcrQuery(item.file, metadata.width, metadata.height);
          if (timeEnd.trim()) {
            const endParts = timeEnd.trim().split(":").map(Number);
            const endSeconds = endParts.length === 3 ? endParts[0] * 3600 + endParts[1] * 60 + endParts[2] : endParts[0] * 60 + (endParts[1] || 0);
            if (Number.isFinite(endSeconds) && endSeconds > metadata.duration) query.set("timeEnd", secondsToClock(metadata.duration));
          }
          const response = await fetch(`/api/subtitle-ocr/jobs?${query}`, { method: "POST", headers: { "Content-Type": "application/octet-stream" }, body: item.file });
          const body = await response.json();
          if (!response.ok || !body.success) throw new Error(body.error || "Không thể bắt đầu nhận diện.");
          let job = body.job as OcrJob;
          currentOcrJobIdsRef.current.add(job.id);
          setOcrJob(job);
          setBatchVideos((current) => current.map((entry) => entry.id === item.id ? { ...entry, job } : entry));
          while (["queued", "running"].includes(job.status)) {
            if (batchCancelRef.current) {
              await fetch(`/api/subtitle-ocr/jobs/${job.id}/cancel`, { method: "POST" });
              job = { ...job, status: "cancelled", message: "Đã hủy nhận diện." };
              break;
            }
            await new Promise((resolve) => window.setTimeout(resolve, 900));
            const statusResponse = await fetch(`/api/subtitle-ocr/jobs/${job.id}`);
            const statusBody = await statusResponse.json();
            if (!statusResponse.ok || !statusBody.success) throw new Error(statusBody.error || "Không lấy được trạng thái OCR.");
            job = statusBody.job as OcrJob;
            setOcrJob(job);
            setBatchVideos((current) => current.map((entry) => entry.id === item.id ? { ...entry, job } : entry));
          }
          currentOcrJobIdsRef.current.delete(job.id);
          setBatchVideos((current) => current.map((entry) => entry.id === item.id ? { ...entry, status: job.status === "completed" ? "completed" : job.status === "cancelled" ? "cancelled" : "error", job, error: job.error } : entry));
          if (!videoFile || item.file === videoFile) setOcrJob(job);
          if (job.status === "error") setOcrError(job.error || job.message);
        } catch (error) {
          const message = error instanceof Error ? error.message : String(error);
          setBatchVideos((current) => current.map((entry) => entry.id === item.id ? { ...entry, status: "error", error: message } : entry));
          setOcrError(message);
        }
      }
    };
    await Promise.all(Array.from({ length: Math.min(parallelVideos, pendingVideos.length) }, () => runNextVideo()));
    currentOcrJobIdsRef.current.clear();
    setOcrRequestPending(false);
  };

  const cancelOcr = async () => {
    batchCancelRef.current = true;
    await Promise.all(Array.from(currentOcrJobIdsRef.current, async (jobId) => {
      try {
        const response = await fetch(`/api/subtitle-ocr/jobs/${jobId}/cancel`, { method: "POST" });
        const body = await response.json();
        if (body.job) setOcrJob(body.job);
      } catch { /* batch loop will stop after the next status check */ }
    }));
  };

  const translateSubtitles = async (job: OcrJob | null, file: File | null) => {
    if (!job?.subtitles.length || translationPending) return;
    const jobId = job.id;
    const sourceFile = file;
    const cues = job.subtitles;
    const groups = Array.from({ length: Math.ceil(cues.length / 20) }, (_, index) => cues.slice(index * 20, (index + 1) * 20));
    setTranslationPending(true);
    setTranslationProgress({ current: 0, total: groups.length });
    setTranslationError("");
    try {
      for (let groupIndex = 0; groupIndex < groups.length; groupIndex++) {
        const group = groups[groupIndex];
        const expectedIds = new Set(group.map((_cue, index) => String(groupIndex * 20 + index)));
        const translations = new Map<string, string>();
        let complete = false;
        const response = await fetch("/api/subtitle-translation/translate", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            cues: group.map((cue, index) => ({ id: String(groupIndex * 20 + index), text: cue.text })),
            translationStyle: translationStyle || undefined,
          }),
        });
        if (!response.ok) throw new Error(`Không thể dịch nhóm ${groupIndex + 1} (HTTP ${response.status}).`);
        if (!response.body) throw new Error("Máy chủ không hỗ trợ stream kết quả dịch.");
        const reader = response.body.getReader();
        const decoder = new TextDecoder();
        let pending = "";
        let eventData: string[] = [];
        const processEvent = () => {
          if (!eventData.length) return;
          let event: { type?: string; id?: string; translation?: string; count?: number; error?: string };
          try {
            event = JSON.parse(eventData.join("\n")) as typeof event;
          } catch (error) {
            throw new Error(`Không đọc được phản hồi dịch: ${error instanceof Error ? error.message : String(error)}`);
          }
          eventData = [];
          if (event.type === "translation") {
            if (typeof event.id === "string" && expectedIds.has(event.id) && typeof event.translation === "string" && event.translation.trim()) {
              translations.set(event.id, event.translation.trim());
            }
          } else if (event.type === "complete") {
            complete = event.count === group.length;
          } else if (event.type === "error") {
            throw new Error(event.error || `Dịch nhóm ${groupIndex + 1} thất bại.`);
          }
        };
        try {
          let done = false;
          while (!done) {
            const chunk = await reader.read();
            done = chunk.done;
            pending += decoder.decode(chunk.value, { stream: !done });
            let newlineIndex = pending.indexOf("\n");
            while (newlineIndex >= 0) {
              const line = pending.slice(0, newlineIndex).replace(/\r$/, "");
              pending = pending.slice(newlineIndex + 1);
              if (!line) processEvent();
              else if (line.startsWith("data:")) eventData.push(line.slice(5).trimStart());
              newlineIndex = pending.indexOf("\n");
            }
          }
          if (pending.trim().startsWith("data:")) eventData.push(pending.trim().slice(5).trimStart());
          processEvent();
        } finally {
          reader.releaseLock();
        }
        if (!complete || translations.size !== group.length) {
          throw new Error(`Kết quả dịch nhóm ${groupIndex + 1} chưa đầy đủ. Hãy kiểm tra model/prompt rồi thử lại.`);
        }
        const applyGroup = (current: OcrJob | null): OcrJob | null => current?.id === jobId
          ? {
            ...current,
            subtitles: current.subtitles.map((cue, index) => {
              const translation = translations.get(String(index));
              return translation ? { ...cue, translatedText: translation } : cue;
            }),
          }
          : current;
        setOcrJob(applyGroup);
        setBatchVideos((current) => current.map((item) => item.file === sourceFile && item.job?.id === jobId
          ? { ...item, job: applyGroup(item.job) || item.job }
          : item));
        setTranslationProgress({ current: groupIndex + 1, total: groups.length });
      }
    } catch (error) {
      setTranslationError(error instanceof Error ? error.message : String(error));
    } finally {
      setTranslationPending(false);
      setTranslationProgress(null);
    }
  };

  const updateCueTranslation = (job: OcrJob | null, file: File | null, index: number, translatedText: string) => {
    if (!job) return;
    const subtitles = job.subtitles.map((cue, cueIndex) => cueIndex === index ? { ...cue, translatedText } : cue);
    const updatedJob = { ...job, subtitles };
    setOcrJob((current) => current?.id === job.id ? updatedJob : current);
    setBatchVideos((current) => current.map((item) => item.file === file && item.job?.id === job.id ? { ...item, job: updatedJob } : item));
  };

  const makeSrtContent = (cues: OcrCue[], translated = false) => {
    const assAlignment: Record<string, number> = { "bottom-left": 1, "bottom-center": 2, "bottom-right": 3, "middle-left": 4, "middle-center": 5, "middle-right": 6, "top-left": 7, "top-center": 8, "top-right": 9 };
    const content = cues.map((cue, index) => {
      const tag = subtitleAlignment ? `{\\an${assAlignment[cue.alignment || "bottom-center"] || 2}}\n` : "";
      return `${index + 1}\n${formatTime(cue.startTime)} --> ${formatTime(cue.endTime)}\n${tag}${translated ? cue.translatedText : cue.text}\n`;
    }).join("\n");
    return `\uFEFF${content}`;
  };

  const exportSrt = (cues: OcrCue[], filename?: string, translated = false) => {
    if (!cues.length) return;
    const content = makeSrtContent(cues, translated);
    const url = URL.createObjectURL(new Blob([content], { type: "text/plain;charset=utf-8" }));
    const anchor = document.createElement("a");
    anchor.href = url;
    anchor.download = `${filename?.replace(/\.[^.]+$/, "") || "subtitles"}${translated ? "_translated" : ""}.srt`;
    anchor.click();
    URL.revokeObjectURL(url);
  };

  const downloadAllSrt = async () => {
    const completed = batchVideos.filter((item) => item.status === "completed" && item.job?.subtitles.length);
    if (!completed.length) return;
    const browserWindow = window as Window & { showDirectoryPicker?: (options: { mode: "readwrite" }) => Promise<FileSystemDirectoryHandle> };
    if (!browserWindow.showDirectoryPicker) {
      setDownloadAllMessage("Trình duyệt này chưa hỗ trợ chọn thư mục. Hãy dùng Chrome hoặc Edge để tải tất cả vào một thư mục.");
      return;
    }
    setDownloadAllMessage("");
    try {
      const directory = await browserWindow.showDirectoryPicker({ mode: "readwrite" });
      let saved = 0;
      for (const item of completed) {
        const baseName = item.file.name.replace(/\.[^.]+$/, "") || "subtitles";
        let filename = `${baseName}.srt`;
        let suffix = 1;
        while (true) {
          try {
            await directory.getFileHandle(filename);
            filename = `${baseName} (${suffix++}).srt`;
          } catch (error) {
            if (error instanceof DOMException && error.name === "NotFoundError") break;
            throw error;
          }
        }
        const output = await directory.getFileHandle(filename, { create: true });
        const writable = await output.createWritable();
        await writable.write(makeSrtContent(item.job!.subtitles));
        await writable.close();
        saved += 1;
      }
      setDownloadAllMessage(`Đã lưu ${saved} file SRT vào thư mục đã chọn.`);
    } catch (error) {
      if (error instanceof DOMException && error.name === "AbortError") return;
      setDownloadAllMessage(`Không thể lưu SRT: ${error instanceof Error ? error.message : String(error)}`);
    }
  };

  const seekToCue = (cue: OcrCue) => {
    if (!videoRef.current) return;
    videoRef.current.currentTime = cue.startTime;
    setPlayerTime(cue.startTime);
  };

  const togglePreviewPlayback = () => {
    const video = videoRef.current;
    if (!video) return;
    if (video.paused) void video.play();
    else video.pause();
  };

  const formatBytes = (bytes: number) => {
    if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(0)} KB`;
    return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
  };

  const previewOcrJob = batchVideos.find((item) => item.file === videoFile)?.job || (batchVideos.length === 0 ? ocrJob : null);

  return (
    <div className="w-full h-full flex flex-col gap-0 overflow-hidden">
      <div className="h-10 sm:h-11 px-3 shrink-0 flex items-center justify-between border-b border-slate-800 bg-slate-900/90 rounded-none select-none">
        <div className="flex items-center gap-2.5">
          <div className="w-6 h-6 rounded-none bg-cyan-500/15 text-cyan-300 border border-cyan-500/25 flex items-center justify-center font-bold text-xs">
            <Captions className="w-3.5 h-3.5" />
          </div>
          <div className="flex items-center gap-2">
            <h1 className="text-xs sm:text-sm font-bold text-white uppercase tracking-tight">Trích xuất phụ đề cứng (OCR)</h1>
            <span className="text-[10px] text-slate-400 hidden sm:inline font-mono">
              · Nhận diện chữ burn trong video & xuất SRT
            </span>
          </div>
        </div>
        <div className="flex items-center gap-2">
          <button type="button" onClick={onOpenSetup} className="inline-flex items-center gap-1.5 rounded-none border border-slate-700 bg-slate-900/80 px-2.5 py-1 text-xs font-semibold text-slate-200 transition-colors hover:border-cyan-500/50 hover:text-white cursor-pointer">
            <Settings2 className="h-3.5 w-3.5 text-cyan-300" />
            <span>Model & Thư viện</span>
            <span className={`h-1.5 w-1.5 rounded-none ${installStatus.status === "ready" ? "bg-emerald-400" : installStatus.status === "running" ? "animate-pulse bg-cyan-400" : "bg-amber-400"}`} />
          </button>
          <div className="flex items-center gap-1.5 rounded-none border border-slate-800 bg-slate-950/80 px-2.5 py-1 text-xs text-slate-300">
            <span className={`h-1.5 w-1.5 rounded-none ${ocrJob?.status === "completed" ? "bg-emerald-400" : ocrJob?.status === "running" ? "animate-pulse bg-cyan-400" : ocrJob?.status === "error" ? "bg-rose-400" : "bg-slate-500"}`} />
            <span className="truncate max-w-[200px] text-[11px]">{ocrJob?.message || "Chưa có phụ đề"}</span>
          </div>
        </div>
      </div>

      <div className="flex-1 min-h-0 w-full flex flex-col xl:flex-row gap-0 overflow-hidden">
        <aside className="w-full xl:w-[350px] shrink-0 h-full overflow-y-auto border-r border-slate-800 bg-slate-900/40 flex flex-col divide-y divide-slate-800 rounded-none scrollbar-thin">
          <section className="p-3 bg-slate-900/20 space-y-3 rounded-none">
            <div className="mb-3 flex items-center gap-2">
              <div className="flex h-8 w-8 items-center justify-center rounded-none border border-cyan-400/20 bg-cyan-400/10 text-cyan-300">
                <Settings2 className="h-4 w-4" />
              </div>
              <div>
                <h2 className="text-sm font-bold text-white">Cài đặt nhận diện</h2>
                <p className="text-[11px] text-slate-500">Nguồn video và cấu hình OCR</p>
              </div>
            </div>

          <input
              ref={inputRef}
              type="file"
              accept="video/*"
              multiple
              disabled={ocrRequestPending}
              className="hidden"
              onChange={(event) => { loadVideos(event.target.files || undefined); event.currentTarget.value = ""; }}
            />
            <input
              ref={folderInputRef}
              type="file"
              multiple
              disabled={ocrRequestPending}
              className="hidden"
              onChange={(event) => { loadVideos(event.target.files || undefined); event.currentTarget.value = ""; }}
            />
            <button
              type="button"
              onClick={() => { if (!ocrRequestPending) inputRef.current?.click(); }}
              onDragOver={(event) => { event.preventDefault(); if (!ocrRequestPending) setDragging(true); }}
              onDragLeave={() => setDragging(false)}
              onDrop={(event) => {
                event.preventDefault();
                if (ocrRequestPending) return;
                setDragging(false);
                loadVideos(event.dataTransfer.files);
              }}
              className={`w-full rounded-none border border-dashed p-3 text-left transition-colors ${dragging ? "border-cyan-400 bg-cyan-400/10" : "border-slate-700 bg-slate-950/60 hover:border-cyan-500/60 hover:bg-slate-950"} ${ocrRequestPending ? "cursor-not-allowed opacity-60" : ""}`}
            >
              <div className="flex items-center gap-3">
                <div className="flex h-9 w-9 shrink-0 items-center justify-center rounded-none bg-slate-800 text-cyan-300">
                  {batchVideos.length ? <FileVideo2 className="h-5 w-5" /> : <Upload className="h-5 w-5" />}
                </div>
                <div className="min-w-0 flex-1">
                  <div className="truncate text-xs font-semibold text-white">{batchVideos.length ? `${batchVideos.length} video đã thêm` : "Chọn hoặc thả video vào đây"}</div>
                  <div className="mt-1 text-[11px] text-slate-500">Nhiều video · MP4, MKV, MOV, WebM</div>
                </div>
                <FolderOpen className="h-4 w-4 shrink-0 text-slate-500" />
              </div>
            </button>
            <button type="button" disabled={ocrRequestPending} onClick={() => folderInputRef.current?.click()} className="mt-2 inline-flex w-full items-center justify-center gap-2 rounded-none border border-slate-700 bg-slate-950/60 px-3 py-2 text-xs font-semibold text-slate-300 transition-colors hover:border-cyan-500/50 hover:bg-slate-950 hover:text-white disabled:cursor-not-allowed disabled:opacity-50">
              <FolderOpen className="h-3.5 w-3.5 text-cyan-300" /> Browse folder · thêm toàn bộ video
            </button>

          </section>

          <section className="rounded-none border-b border-slate-800 bg-slate-900/40 p-3 shadow-none">
            <h2 className="text-xs font-semibold uppercase tracking-wider text-slate-400">Thông số quét</h2>
            <label className="mt-4 block space-y-1.5">
              <span className="text-xs font-medium text-slate-300">Số video chạy song song</span>
              <input type="number" min="1" max="4" step="1" value={parallelVideos} disabled={ocrRequestPending} onChange={(event) => setParallelVideos(Math.max(1, Math.min(4, Number(event.target.value) || 1)))} className="w-full rounded-none border border-slate-700 bg-slate-950 px-2.5 py-1.5 text-xs text-white outline-none focus:border-cyan-500 disabled:opacity-50" />
              <span className="block text-[10px] leading-relaxed text-slate-500">Tối đa 4 worker. Tăng số lượng dùng thêm CPU và RAM; nên thử từ 2.</span>
            </label>
            <label className="mt-3 block space-y-1.5">
              <span className="text-xs font-medium text-slate-300">CPU threads mỗi worker</span>
              <input type="number" min="1" max="32" step="1" value={cpuThreads} disabled={ocrRequestPending} onChange={(event) => setCpuThreads(Math.max(1, Math.min(32, Number(event.target.value) || 1)))} className="w-full rounded-none border border-slate-700 bg-slate-950 px-2.5 py-1.5 text-xs text-white outline-none focus:border-cyan-500 disabled:opacity-50" />
              <span className="block text-[10px] leading-relaxed text-slate-500">Mặc định 8. Tổng luồng suy luận xấp xỉ số worker × threads mỗi worker; có thể thay đổi để benchmark.</span>
            </label>
            <label className="mt-4 block space-y-2">
              <span className="flex items-center gap-1.5 text-xs font-medium text-slate-300"><Languages className="h-3.5 w-3.5 text-cyan-300" />Ngôn ngữ phụ đề</span>
              <div className="relative">
                <select value="zh-Hans" disabled className="w-full appearance-none rounded-none border border-slate-700 bg-slate-950 px-3 py-2 pr-9 text-xs text-slate-300 outline-none">
                  <option value="zh-Hans">Tiếng Trung giản thể</option>
                </select>
                <ChevronDown className="pointer-events-none absolute right-3 top-1/2 h-3.5 w-3.5 -translate-y-1/2 text-slate-500" />
              </div>
            </label>

            <div className="mt-4 grid grid-cols-2 gap-2">
              <label className="space-y-1.5"><span className="text-[11px] font-medium text-slate-300">Bắt đầu</span><input value={timeStart} onChange={(event) => setTimeStart(event.target.value)} placeholder="0:00" className="w-full rounded-none border border-slate-700 bg-slate-950 px-2.5 py-1.5 text-xs text-white outline-none focus:border-cyan-500" /></label>
              <label className="space-y-1.5"><span className="text-[11px] font-medium text-slate-300">Kết thúc</span><input value={timeEnd} onChange={(event) => setTimeEnd(event.target.value)} placeholder="Cuối video" className="w-full rounded-none border border-slate-700 bg-slate-950 px-2.5 py-1.5 text-xs text-white outline-none focus:border-cyan-500" /></label>
            </div>

            <div className="mt-4 space-y-3">
              <label className="block space-y-1.5"><span className="text-xs font-medium text-slate-300">{cropRegion ? "Vùng OCR · tùy chỉnh" : "Vùng OCR · Zone 1"}</span><select value={zone1} onChange={(event) => setZone1(event.target.value as SubtitleRegion)} disabled={useFullFrame || !!cropRegion} className="w-full rounded-none border border-slate-700 bg-slate-950 px-3 py-1.5 text-xs text-white outline-none disabled:opacity-50"><option value="lower">1/3 phía dưới</option><option value="center">1/3 vùng giữa</option><option value="upper">1/3 phía trên</option></select></label>
              {useDualZone && !useFullFrame && !cropRegion && <label className="block space-y-1.5"><span className="text-xs font-medium text-slate-300">Vùng OCR · Zone 2</span><select value={zone2} onChange={(event) => setZone2(event.target.value as SubtitleRegion)} className="w-full rounded-none border border-slate-700 bg-slate-950 px-3 py-1.5 text-xs text-white outline-none"><option value="lower">1/3 phía dưới</option><option value="center">1/3 vùng giữa</option><option value="upper">1/3 phía trên</option></select></label>}
              {cropRegion && videoSize.width > 0 && <p className="text-[10px] leading-relaxed text-cyan-200">Vùng crop: {Math.round(cropRegion.width * videoSize.width)} × {Math.round(cropRegion.height * videoSize.height)} px. Vùng này thay cho các Zone.</p>}
              <label className="flex items-center gap-2 text-xs text-slate-300"><input type="checkbox" checked={useFullFrame} onChange={(event) => setUseFullFrame(event.target.checked)} className="accent-cyan-400" />Use Full Frame OCR</label>
              <label className="flex items-center gap-2 text-xs text-slate-300"><input type="checkbox" checked={useDualZone} onChange={(event) => setUseDualZone(event.target.checked)} disabled={useFullFrame || !!cropRegion} className="accent-cyan-400" />Enable Dual Zone OCR</label>
            </div>

            <div className="mt-4 space-y-3 border-t border-slate-800 pt-4">
              <label className="block space-y-1.5"><span className="flex justify-between text-xs font-medium text-slate-300"><span>Confidence Threshold</span><span className="font-mono text-cyan-300">{confidence}</span></span><input type="range" min="0" max="100" step="1" value={confidence} onChange={(event) => setConfidence(Number(event.target.value))} className="w-full accent-cyan-400" /></label>
              <label className="block space-y-1.5"><span className="flex justify-between text-xs font-medium text-slate-300"><span>Similarity Threshold</span><span className="font-mono text-cyan-300">{similarity}</span></span><input type="range" min="0" max="100" step="1" value={similarity} onChange={(event) => setSimilarity(Number(event.target.value))} className="w-full accent-cyan-400" /></label>
              <label className="block space-y-1.5"><span className="flex justify-between text-xs font-medium text-slate-300"><span>SSIM Threshold</span><span className="font-mono text-cyan-300">{ssimThreshold}</span></span><input type="range" min="0" max="100" step="1" value={ssimThreshold} onChange={(event) => setSsimThreshold(Number(event.target.value))} className="w-full accent-cyan-400" /></label>
            </div>

            <div className="mt-4 grid grid-cols-2 gap-2">
              <label className="space-y-1.5"><span className="text-[11px] font-medium text-slate-300">Khoảng trống tối đa để nối câu (giây)</span><input type="number" min="0" max="30" step="0.05" value={maxMergeGap} onChange={(event) => setMaxMergeGap(event.target.value)} className="w-full rounded-none border border-slate-700 bg-slate-950 px-2.5 py-1.5 text-xs text-white outline-none focus:border-cyan-500" /></label>
              <label className="space-y-1.5"><span className="text-[11px] font-medium text-slate-300">Min Duration (s)</span><input type="number" min="0" max="60" step="0.1" value={minimumDuration} onChange={(event) => setMinimumDuration(event.target.value)} className="w-full rounded-none border border-slate-700 bg-slate-950 px-2.5 py-1.5 text-xs text-white outline-none focus:border-cyan-500" /></label>
              <label className="space-y-1.5"><span className="text-[11px] font-medium text-slate-300">Max OCR Width</span><input type="number" min="0" max="7680" step="1" value={maxImageWidth} onChange={(event) => setMaxImageWidth(event.target.value)} className="w-full rounded-none border border-slate-700 bg-slate-950 px-2.5 py-1.5 text-xs text-white outline-none focus:border-cyan-500" /></label>
              <label className="space-y-1.5"><span className="text-[11px] font-medium text-slate-300">Frames to Skip</span><input type="number" min="0" max="300" step="1" value={framesToSkip} onChange={(event) => setFramesToSkip(event.target.value)} className="w-full rounded-none border border-slate-700 bg-slate-950 px-2.5 py-1.5 text-xs text-white outline-none focus:border-cyan-500" /></label>
              <label className="col-span-2 space-y-1.5"><span className="text-[11px] font-medium text-slate-300">Brightness Threshold · để trống để tắt</span><input type="number" min="0" max="255" step="1" value={brightnessThreshold} onChange={(event) => setBrightnessThreshold(event.target.value)} placeholder="0–255" className="w-full rounded-none border border-slate-700 bg-slate-950 px-2.5 py-1.5 text-xs text-white outline-none focus:border-cyan-500" /></label>
            </div>

            <div className="mt-4 space-y-2 border-t border-slate-800 pt-4">
              <label className="flex items-center gap-2 text-xs text-slate-300"><input type="checkbox" checked={subtitleAlignment} onChange={(event) => setSubtitleAlignment(event.target.checked)} className="accent-cyan-400" />Enable Subtitle Alignment (ASS tags in SRT)</label>
              {subtitleAlignment && <div className="grid grid-cols-2 gap-2 pl-5">
                <label className="space-y-1"><span className="text-[10px] text-slate-400">Zone 1</span><select value={alignment1} onChange={(event) => setAlignment1(event.target.value)} className="w-full rounded-none border border-slate-700 bg-slate-950 px-2 py-1.5 text-[10px] text-white">{["bottom-left","bottom-center","bottom-right","middle-left","middle-center","middle-right","top-left","top-center","top-right"].map((value) => <option key={value}>{value}</option>)}</select></label>
                {useDualZone && <label className="space-y-1"><span className="text-[10px] text-slate-400">Zone 2</span><select value={alignment2} onChange={(event) => setAlignment2(event.target.value)} className="w-full rounded-none border border-slate-700 bg-slate-950 px-2 py-1.5 text-[10px] text-white">{["bottom-left","bottom-center","bottom-right","middle-left","middle-center","middle-right","top-left","top-center","top-right"].map((value) => <option key={value}>{value}</option>)}</select></label>}
              </div>}
              <label className="flex items-center gap-2 text-xs text-slate-500" title="Cần tải thêm orientation model; chưa được đóng gói trong bộ model hiện tại."><input type="checkbox" disabled checked={angleClassification} onChange={(event) => setAngleClassification(event.target.checked)} className="accent-cyan-400" />Enable Angle Classification · cần model bổ sung</label>
              <label className={`flex items-center gap-2 text-xs ${installStatus.gpuRuntimeReady ? "text-slate-300" : "text-slate-500"}`} title={installStatus.gpuRuntimeReady ? "Ưu tiên Intel GPU qua DirectML; nếu khởi tạo hoặc suy luận lỗi, tự chạy lại bằng PaddleOCR CPU." : installStatus.gpuRuntimeError || "Cài DirectML trong Setup để bật OCR GPU."}>
                <input type="checkbox" checked={useGpu} disabled={!installStatus.gpuRuntimeReady || ocrRequestPending} onChange={(event) => setUseGpu(event.target.checked)} className="accent-cyan-400 disabled:opacity-50" />
                Enable GPU Usage · DirectML{installStatus.gpuRuntimeReady ? "" : " · chưa cài"}
              </label>
              <label className="flex items-center gap-2 text-xs text-slate-500" title="VideOCR chỉ hỗ trợ post-processing cho một số ngôn ngữ Latin."><input type="checkbox" disabled className="accent-cyan-400" />Enable Post Processing · không áp dụng tiếng Trung</label>
              <label className="flex items-center gap-2 text-xs text-slate-300"><input type="checkbox" checked={normalizeTraditional} onChange={(event) => setNormalizeTraditional(event.target.checked)} className="accent-cyan-400" />Normalize Traditional to Simplified Chinese</label>
              <label className="flex items-center gap-2 text-xs text-slate-500" title="Model server chỉ dùng cho cấu hình GPU; ứng dụng này đang chạy PaddleOCR CPU."><input type="checkbox" disabled className="accent-cyan-400" />Use Server Model · chỉ GPU</label>
            </div>

            <div className="mt-4 flex items-start gap-2 rounded-none border border-slate-800 bg-slate-950/50 p-2.5 text-[10px] leading-relaxed text-slate-500">
              <Clock3 className="mt-0.5 h-3.5 w-3.5 shrink-0 text-cyan-400" />
              Mốc bắt đầu và kết thúc được suy ra từ các khung hình có cùng nội dung; nên rà soát trước khi xuất SRT.
            </div>

            <button type="button" onClick={ocrRequestPending ? cancelOcr : startOcr} disabled={!batchVideos.some((item) => item.status === "pending" || item.status === "error") && !ocrRequestPending} className={`mt-4 inline-flex w-full items-center justify-center gap-2 rounded-none px-4 py-2.5 text-xs font-bold transition-colors disabled:cursor-not-allowed disabled:opacity-50 ${ocrRequestPending ? "border border-rose-500/30 bg-rose-500/10 text-rose-200 hover:bg-rose-500/20" : "bg-cyan-400 text-slate-950 hover:bg-cyan-300"}`}>
              {ocrRequestPending ? <><LoaderCircle className="h-4 w-4 animate-spin" /> Hủy hàng đợi</> : <><Play className="h-4 w-4" /> Chạy hàng đợi · {batchVideos.filter((item) => item.status === "pending" || item.status === "error").length} video</>}
            </button>
            {ocrRequestPending && <div className="mt-3 space-y-1.5"><div className="flex justify-between gap-2 text-[10px] text-slate-400"><span>{ocrJob?.message || "Đang chuẩn bị video…"}</span><span>{ocrJob?.progressPercent || 0}%</span></div><div className="h-1.5 overflow-hidden rounded-none bg-slate-800"><div className="h-full rounded-none bg-cyan-400 transition-all" style={{ width: `${ocrJob?.progressPercent || 0}%` }} /></div><div className="text-right font-mono text-[10px] text-cyan-300">{batchVideos.filter((item) => item.status === "completed").length}/{batchVideos.length} video · {ocrJob ? formatElapsed(ocrJob.elapsedMs) : "đang tải"}</div></div>}
            {!ocrRequestPending && ocrJob && <div className="mt-3 text-right font-mono text-[10px] text-slate-400">Thời gian nhận diện video preview: {formatElapsed(ocrJob.elapsedMs)}</div>}
            {ocrError && <div className="mt-3 rounded-none border border-rose-500/20 bg-rose-950/20 p-2 text-[10px] leading-relaxed text-rose-200">{ocrError}</div>}
            {ocrJob?.status === "error" && ocrJob.error && <div className="mt-3 max-h-28 overflow-auto rounded-none border border-rose-500/20 bg-rose-950/20 p-2 text-[10px] leading-relaxed text-rose-200">{ocrJob.error}</div>}
          </section>
        </aside>

        {/* RIGHT PANEL: flex-col — top: video+subtitles side-by-side, bottom: full-width timeline */}
        <div className="flex-1 min-w-0 h-full overflow-hidden flex flex-col bg-slate-950">

          {/* ── TOOLBAR: crop controls + subtitle preview mode ── */}
          <div className="h-8 px-3 shrink-0 flex items-center justify-between gap-2 border-b border-slate-800 bg-slate-900/80 select-none">
            <div className="flex items-center gap-2 min-w-0">
              {videoFile ? (
                <span className="truncate max-w-[260px] lg:max-w-[400px] font-mono text-[10px] text-slate-300" title={videoFile.name}>
                  {videoFile.name}
                </span>
              ) : (
                <span className="text-[10px] text-slate-500">Chưa chọn video</span>
              )}
              {videoFile && (
                <span className="text-[10px] text-slate-600 font-mono hidden sm:inline shrink-0">· {formatBytes(videoFile.size)}</span>
              )}
            </div>
            <div className="flex items-center gap-1.5 shrink-0">
              <label className="flex items-center gap-1 border border-slate-700 bg-slate-950/60 px-2 py-0.5 text-[10px] text-slate-300">
                <Captions className="h-3 w-3 text-cyan-300 shrink-0" />
                <span className="hidden sm:inline">Phụ đề:</span>
                <select
                  value={previewSubtitleMode}
                  onChange={(event) => setPreviewSubtitleMode(event.target.value as PreviewSubtitleMode)}
                  className="bg-transparent text-[10px] font-semibold text-white outline-none cursor-pointer"
                >
                  <option value="none">Tắt</option>
                  <option value="original">Gốc</option>
                  <option value="vietnamese">Tiếng Việt</option>
                </select>
              </label>
              {videoFile && (
                <button
                  type="button"
                  disabled={useFullFrame || ocrRequestPending}
                  onClick={() => setDrawCropMode((active) => !active)}
                  className={`border px-2 py-0.5 text-[10px] font-semibold transition-colors disabled:opacity-40 cursor-pointer ${drawCropMode ? "border-cyan-400 bg-cyan-400 text-slate-950" : "border-cyan-500/30 bg-cyan-500/10 text-cyan-200 hover:bg-cyan-500/20"}`}
                >
                  {drawCropMode ? "Đang vẽ vùng" : cropRegion ? "Chỉnh vùng OCR" : "Vẽ vùng OCR"}
                </button>
              )}
              {cropRegion && (
                <button
                  type="button"
                  disabled={ocrRequestPending}
                  onClick={() => { setCropRegion(null); setDrawCropMode(false); }}
                  className="border border-slate-700 px-2 py-0.5 text-[10px] font-semibold text-slate-300 hover:bg-slate-800 disabled:opacity-40 cursor-pointer"
                >
                  Xóa vùng
                </button>
              )}
              <span className="hidden lg:inline text-[10px] text-slate-500 font-mono pl-1.5 border-l border-slate-800">
                Vùng: <span className="text-slate-300">{useFullFrame ? "Toàn khung" : cropRegion ? "Tự vẽ" : useDualZone ? `${zone1}+${zone2}` : zone1}</span>
              </span>
            </div>
          </div>

          {/* ── MAIN BODY: Video (left) + Subtitle List (right), share full remaining height minus timeline ── */}
          <div className="flex-1 min-h-0 w-full flex flex-row overflow-hidden">

            {/* VIDEO PREVIEW COLUMN */}
            <div className="flex-1 min-w-0 h-full flex flex-col overflow-hidden border-r border-slate-800 bg-black">
              {/* Video viewport */}
              <div ref={previewRef} className="flex-1 min-h-0 relative flex items-center justify-center bg-black overflow-hidden select-none">
                {videoUrl ? (
                  <>
                    <video
                      ref={videoRef}
                      src={videoUrl}
                      onLoadedMetadata={(event) => {
                        const video = event.currentTarget;
                        setVideoSize({ width: video.videoWidth, height: video.videoHeight });
                        setPlayerDuration(Number.isFinite(video.duration) ? video.duration : 0);
                        setPlayerTime(video.currentTime);
                        video.volume = playerVolume;
                      }}
                      onDurationChange={(event) => setPlayerDuration(Number.isFinite(event.currentTarget.duration) ? event.currentTarget.duration : 0)}
                      onTimeUpdate={(event) => setPlayerTime(event.currentTarget.currentTime)}
                      onPlay={() => setPlayerPlaying(true)}
                      onPause={() => setPlayerPlaying(false)}
                      onEnded={() => setPlayerPlaying(false)}
                      className="max-h-full max-w-full object-contain"
                    />
                    {previewSubtitleMode !== "none" && <PreviewSubtitleOverlay videoRef={videoRef} subtitles={previewOcrJob?.subtitles || []} mode={previewSubtitleMode} />}
                    {previewContentRect && (
                      <div
                        className="absolute"
                        style={{
                          left: previewContentRect.left,
                          top: previewContentRect.top,
                          width: previewContentRect.width,
                          height: previewContentRect.height,
                          pointerEvents: drawCropMode && !useFullFrame ? "auto" : "none",
                          touchAction: "none",
                          cursor: drawCropMode && !useFullFrame ? "crosshair" : "default",
                        }}
                        onPointerDown={onCropPointerDown}
                        onPointerMove={onCropPointerMove}
                        onPointerUp={onCropPointerUp}
                        onPointerCancel={onCropPointerUp}
                      >
                        {cropRegion && !useFullFrame && (
                          <div
                            className={`absolute border-2 ${drawCropMode ? "border-cyan-300 bg-cyan-400/10" : "border-cyan-400/80 bg-cyan-400/5"}`}
                            style={{
                              left: `${cropRegion.x * 100}%`,
                              top: `${cropRegion.y * 100}%`,
                              width: `${cropRegion.width * 100}%`,
                              height: `${cropRegion.height * 100}%`,
                              cursor: drawCropMode ? "move" : "default",
                            }}
                          >
                            <span className="absolute left-0 top-0 -translate-y-full whitespace-nowrap bg-cyan-400 px-1.5 py-0.5 text-[9px] font-bold text-slate-950">
                              OCR · {Math.round(cropRegion.width * videoSize.width)}×{Math.round(cropRegion.height * videoSize.height)}
                            </span>
                            {drawCropMode && (
                              <span data-crop-handle="resize" className="pointer-events-auto absolute -bottom-1.5 -right-1.5 h-3.5 w-3.5 cursor-se-resize border-2 border-slate-950 bg-cyan-300 shadow" />
                            )}
                          </div>
                        )}
                      </div>
                    )}
                  </>
                ) : (
                  <button
                    type="button"
                    onClick={() => inputRef.current?.click()}
                    className="flex h-full w-full flex-col items-center justify-center gap-2 bg-[radial-gradient(ellipse_at_center,_rgba(30,41,59,0.5),_rgba(2,6,23,1))] text-slate-400 transition-colors hover:text-white cursor-pointer"
                  >
                    <div className="flex h-10 w-10 items-center justify-center border border-slate-700 bg-slate-900/80 text-cyan-300">
                      <Video className="h-5 w-5" />
                    </div>
                    <div className="text-center">
                      <div className="text-xs font-semibold text-slate-200">Chưa chọn video preview</div>
                      <div className="mt-0.5 text-[10px] text-slate-500">Chọn từ cột cài đặt hoặc nhấn để duyệt file</div>
                    </div>
                  </button>
                )}
              </div>

              {/* Batch Queue strip — compact, docked inside video column */}
              {batchVideos.length > 0 && (
                <div className="h-7 px-2 shrink-0 border-t border-slate-800 bg-slate-900/80 flex items-center gap-2 overflow-hidden">
                  <span className="text-[9px] font-bold text-slate-400 uppercase tracking-wider shrink-0">Queue</span>
                  <span className="border border-slate-700 px-1 text-[9px] font-mono text-cyan-300 shrink-0">{batchVideos.length}</span>
                  <div className="flex-1 min-w-0 flex items-center gap-1 overflow-x-auto scrollbar-none">
                    {batchVideos.map((item) => {
                      const isPreview = item.file === videoFile;
                      const statusColor = item.status === "completed" ? "border-emerald-500/40 text-emerald-200" : item.status === "running" ? "border-cyan-500/40 text-cyan-200" : item.status === "error" ? "border-rose-500/40 text-rose-200" : "border-slate-700 text-slate-400";
                      return (
                        <button
                          key={item.id}
                          type="button"
                          onClick={() => selectPreviewVideo(item.file, item.job)}
                          className={`shrink-0 flex items-center gap-1 border px-1.5 py-0.5 text-[9px] font-medium cursor-pointer transition-colors ${isPreview ? "border-cyan-400 bg-cyan-400/15 text-cyan-100" : statusColor + " bg-slate-950/60 hover:bg-slate-800/80"}`}
                          title={item.file.name}
                        >
                          <span className="max-w-[80px] truncate">{item.file.name.replace(/\.[^.]+$/, "")}</span>
                          {item.job?.subtitles.length ? (
                            <span
                              role="button"
                              onClick={(e) => { e.stopPropagation(); exportSrt(item.job!.subtitles, item.file.name); }}
                              className="text-cyan-400 hover:text-cyan-200 cursor-pointer"
                              title="Tải SRT"
                            >
                              <Download className="h-2.5 w-2.5" />
                            </span>
                          ) : null}
                        </button>
                      );
                    })}
                  </div>
                  <div className="flex items-center gap-1 shrink-0">
                    <button
                      type="button"
                      onClick={clearVideoList}
                      disabled={!batchVideos.length || ocrRequestPending}
                      className="border border-rose-500/30 bg-rose-500/10 px-1.5 py-0.5 text-[9px] text-rose-200 hover:bg-rose-500/20 disabled:opacity-40 cursor-pointer"
                      title="Dọn danh sách"
                    >
                      <Trash2 className="h-2.5 w-2.5" />
                    </button>
                    <button
                      type="button"
                      onClick={() => void downloadAllSrt()}
                      disabled={!batchVideos.some((i) => i.status === "completed" && i.job?.subtitles.length)}
                      className="border border-cyan-500/30 bg-cyan-500/10 px-1.5 py-0.5 text-[9px] text-cyan-200 hover:bg-cyan-500/20 disabled:opacity-40 cursor-pointer"
                      title="Tải tất cả SRT"
                    >
                      <Download className="h-2.5 w-2.5" />
                    </button>
                  </div>
                </div>
              )}
              {downloadAllMessage && (
                <div className="px-3 py-1 text-[9px] text-cyan-200 bg-cyan-950/40 border-t border-slate-800 shrink-0">
                  {downloadAllMessage}
                </div>
              )}
            </div>

            {/* SUBTITLE LIST COLUMN */}
            <div className="w-[42%] lg:w-[45%] xl:w-[48%] min-w-[280px] max-w-[640px] h-full flex flex-col overflow-hidden bg-slate-950">
              {/* Subtitle list header / action bar */}
              <div className="h-8 px-2.5 shrink-0 flex items-center justify-between gap-2 border-b border-slate-800 bg-slate-900/80">
                <div className="flex items-center gap-1.5 min-w-0">
                  <h2 className="text-[10px] font-bold text-white shrink-0 uppercase tracking-wide">Phụ đề</h2>
                  <span className="border border-slate-700 bg-slate-950 px-1 text-[9px] font-mono text-cyan-300 shrink-0">
                    {previewOcrJob?.subtitles.length || 0}
                  </span>
                  {translationError && (
                    <span role="alert" className="text-[9px] text-rose-300 truncate max-w-[100px]" title={translationError}>
                      {translationError}
                    </span>
                  )}
                </div>
                <div className="flex items-center gap-1 shrink-0">
                  <button
                    type="button"
                    onClick={() => { setTranslationStyleDraft(translationStyle); setTranslationStyleDialogOpen(true); }}
                    disabled={translationPending}
                    className={`flex items-center gap-0.5 border px-1.5 py-0.5 text-[9px] font-semibold cursor-pointer disabled:opacity-50 ${translationStyle ? "border-violet-400/40 bg-violet-500/15 text-violet-100" : "border-slate-700 bg-slate-950/60 text-slate-300 hover:bg-slate-800"}`}
                  >
                    <Settings2 className="h-2.5 w-2.5" />
                    <span className="hidden sm:inline">Phong cách</span>
                  </button>
                  <button
                    type="button"
                    disabled={!previewOcrJob?.subtitles.length || previewOcrJob.status !== "completed" || translationPending}
                    onClick={() => void translateSubtitles(previewOcrJob, videoFile)}
                    title={previewOcrJob?.status === "running" ? "Đợi OCR hoàn tất trước khi dịch" : undefined}
                    className="flex items-center gap-0.5 border border-violet-500/30 bg-violet-500/10 px-1.5 py-0.5 text-[9px] font-semibold text-violet-200 hover:bg-violet-500/20 disabled:opacity-50 disabled:border-slate-700 disabled:bg-slate-800/60 disabled:text-slate-600 cursor-pointer"
                  >
                    {translationPending ? <LoaderCircle className="h-2.5 w-2.5 animate-spin" /> : <Languages className="h-2.5 w-2.5" />}
                    {translationPending ? `${translationProgress?.current || 0}/${translationProgress?.total || 0}…` : "Dịch"}
                  </button>
                  <button
                    type="button"
                    disabled={!previewOcrJob?.subtitles.length}
                    onClick={() => exportSrt(previewOcrJob?.subtitles || [], videoFile?.name)}
                    className="border border-cyan-500/30 bg-cyan-500/10 px-1.5 py-0.5 text-[9px] font-semibold text-cyan-200 hover:bg-cyan-500/20 disabled:opacity-50 disabled:border-slate-700 disabled:bg-slate-800/60 disabled:text-slate-600 cursor-pointer"
                  >
                    SRT
                  </button>
                  <button
                    type="button"
                    disabled={!previewOcrJob?.subtitles.length || !previewOcrJob.subtitles.every((cue) => Boolean(cue.translatedText?.trim()))}
                    onClick={() => exportSrt(previewOcrJob?.subtitles || [], videoFile?.name, true)}
                    className="border border-emerald-500/30 bg-emerald-500/10 px-1.5 py-0.5 text-[9px] font-semibold text-emerald-200 hover:bg-emerald-500/20 disabled:opacity-50 disabled:border-slate-700 disabled:bg-slate-800/60 disabled:text-slate-600 cursor-pointer"
                  >
                    SRT Dịch
                  </button>
                </div>
              </div>

              {/* Subtitle table */}
              <div className="flex-1 min-h-0 overflow-auto scrollbar-thin">
                <table className="w-full min-w-[380px] border-collapse text-left text-xs">
                  <thead className="sticky top-0 z-10 bg-slate-900 border-b border-slate-800 text-[9px] uppercase tracking-wider text-slate-400">
                    <tr>
                      <th className="w-8 px-2 py-1.5 font-semibold">#</th>
                      <th className="px-2 py-1.5 font-semibold">Nội dung</th>
                      <th className="px-2 py-1.5 font-semibold">Dịch</th>
                      <th className="w-14 px-2 py-1.5 font-semibold hidden lg:table-cell">Thời lượng</th>
                      <th className="w-16 px-2 py-1.5 font-semibold">Bắt đầu</th>
                    </tr>
                  </thead>
                  <tbody>
                    {previewOcrJob?.subtitles.length ? previewOcrJob.subtitles.map((cue, index) => (
                      <tr
                        key={`${index}-${cue.startTime}`}
                        onClick={() => seekToCue(cue)}
                        className="cursor-pointer border-t border-slate-800/80 text-slate-300 transition-colors hover:bg-cyan-500/5"
                      >
                        <td className="px-2 py-1.5 font-mono text-[9px] text-slate-500">{index + 1}</td>
                        <td className="max-w-0 whitespace-pre-wrap px-2 py-1.5 text-[10px] text-slate-100">{cue.text}</td>
                        <td className="min-w-32 px-2 py-1">
                          <textarea
                            aria-label={`Bản dịch câu ${index + 1}`}
                            value={cue.translatedText || ""}
                            onChange={(event) => updateCueTranslation(previewOcrJob, videoFile, index, event.target.value)}
                            onClick={(event) => event.stopPropagation()}
                            onKeyDown={(event) => event.stopPropagation()}
                            rows={Math.min(3, Math.max(1, (cue.translatedText || "").split("\n").length))}
                            placeholder="Dịch…"
                            className="w-full min-w-28 resize-y border border-violet-500/20 bg-slate-950/70 px-1.5 py-0.5 text-[10px] leading-relaxed text-violet-100 outline-none placeholder:text-slate-600 focus:border-violet-400/60"
                          />
                        </td>
                        <td className="px-2 py-1.5 font-mono text-[9px] text-slate-400 hidden lg:table-cell">{(cue.endTime - cue.startTime).toFixed(2)}s</td>
                        <td className="px-2 py-1.5 font-mono text-[9px] text-slate-400">{formatTime(cue.startTime)}</td>
                      </tr>
                    )) : (
                      <tr>
                        <td colSpan={5} className="px-4 py-10 text-center">
                          <div className="mx-auto flex h-7 w-7 items-center justify-center border border-slate-800 bg-slate-950 text-slate-600">
                            <Captions className="h-3.5 w-3.5" />
                          </div>
                          <div className="mt-2 text-[11px] font-medium text-slate-300">
                            {previewOcrJob?.status === "completed" ? "Không phát hiện câu phụ đề nào" : "Chưa có dữ liệu phụ đề"}
                          </div>
                          <div className="mt-0.5 text-[10px] text-slate-500">
                            Chọn video, cài model rồi nhấn Trích xuất phụ đề.
                          </div>
                        </td>
                      </tr>
                    )}
                  </tbody>
                </table>
              </div>
            </div>
          </div>

          {/* ── FULL-WIDTH TIMELINE / MEDIA CONTROLS ── */}
          <div className="h-9 px-3 shrink-0 border-t border-slate-800 bg-slate-950 flex items-center gap-2.5 select-none z-10">
            <button
              type="button"
              onClick={togglePreviewPlayback}
              disabled={!videoUrl}
              className="inline-flex h-6 w-6 shrink-0 items-center justify-center border border-cyan-500/40 bg-cyan-500/15 text-cyan-200 transition-colors hover:bg-cyan-500/30 disabled:opacity-40 cursor-pointer"
              aria-label={playerPlaying ? "Tạm dừng video" : "Phát video"}
            >
              {playerPlaying ? <Pause className="h-3 w-3" /> : <Play className="h-3 w-3 ml-0.5" />}
            </button>
            <span className="shrink-0 font-mono text-[11px] tabular-nums text-cyan-300 w-10 text-right">
              {formatPlayerTime(playerTime)}
            </span>
            <input
              type="range"
              min={0}
              max={Math.max(playerDuration, 0.01)}
              step={0.01}
              value={Math.min(playerTime, playerDuration || 0)}
              onChange={(event) => {
                const time = Number(event.target.value);
                if (videoRef.current) videoRef.current.currentTime = time;
                setPlayerTime(time);
              }}
              disabled={!videoUrl}
              className="flex-1 min-w-0 h-1 accent-cyan-400 cursor-pointer"
              aria-label="Tua video"
            />
            <span className="shrink-0 font-mono text-[11px] tabular-nums text-slate-400 w-10">
              {formatPlayerTime(playerDuration)}
            </span>
            <div className="h-3.5 w-px bg-slate-700 shrink-0" />
            <Volume2 className="h-3.5 w-3.5 shrink-0 text-slate-400" />
            <input
              type="range"
              min={0}
              max={1}
              step={0.01}
              value={playerVolume}
              onChange={(event) => {
                const volume = Number(event.target.value);
                setPlayerVolume(volume);
                if (videoRef.current) {
                  videoRef.current.volume = volume;
                  videoRef.current.muted = volume === 0;
                }
              }}
              className="w-16 h-1 accent-cyan-400 cursor-pointer shrink-0"
              aria-label="Âm lượng video"
            />
          </div>
        </div>
      </div>
      {translationStyleDialogOpen && (
        <div className="fixed inset-0 z-[120] flex items-center justify-center bg-black/75 p-4 backdrop-blur-sm">
          <section role="dialog" aria-modal="true" aria-labelledby="ocr-translation-style-title" className="flex max-h-[85vh] w-full max-w-2xl flex-col overflow-hidden rounded-none border border-slate-700 bg-slate-900 shadow-2xl">
            <header className="flex items-center justify-between gap-3 border-b border-slate-800 px-5 py-4">
              <div><h2 id="ocr-translation-style-title" className="text-sm font-bold text-white">Phong Cách Dịch</h2><p className="mt-1 text-[11px] text-slate-400">Phong cách này thay thế Quy tắc dịch trong Setup và chỉ áp dụng cho trang OCR này.</p></div>
              <button type="button" onClick={() => setTranslationStyleDialogOpen(false)} aria-label="Đóng phong cách dịch" className="rounded-none p-2 text-slate-400 hover:bg-slate-800 hover:text-white cursor-pointer"><X className="h-4 w-4" /></button>
            </header>
            <div className="min-h-0 flex-1 overflow-y-auto p-5">
              <textarea
                autoFocus
                value={translationStyleDraft}
                onChange={(event) => setTranslationStyleDraft(event.target.value)}
                maxLength={4000}
                rows={10}
                placeholder="Ví dụ: Dùng lời thoại tự nhiên, ngắn gọn; xưng hô thân mật; giữ nguyên tên riêng…"
                className="w-full resize-y rounded-none border border-slate-700 bg-slate-950 p-3 text-xs leading-relaxed text-slate-100 outline-none placeholder:text-slate-600 focus:border-violet-400"
              />
              <div className="mt-2 flex items-center justify-between gap-2 text-[10px] text-slate-500">
                <span>Để trống để dùng Quy tắc dịch đã cấu hình trong Setup.</span>
                <span>{translationStyleDraft.length.toLocaleString()}/4.000</span>
              </div>
            </div>
            <footer className="flex flex-wrap items-center justify-between gap-2 border-t border-slate-800 px-5 py-3">
              <button type="button" onClick={() => { setTranslationStyle(""); setTranslationStyleDraft(""); setTranslationStyleDialogOpen(false); }} className="rounded-none border border-slate-700 px-3 py-2 text-xs font-semibold text-slate-300 hover:bg-slate-800 cursor-pointer">Dùng quy tắc Setup</button>
              <div className="flex items-center gap-2">
                <button type="button" onClick={() => setTranslationStyleDialogOpen(false)} className="rounded-none border border-slate-700 px-3 py-2 text-xs font-semibold text-slate-300 hover:bg-slate-800 cursor-pointer">Hủy</button>
                <button type="button" disabled={translationStyleDraft.length > 4000} onClick={() => { setTranslationStyle(translationStyleDraft.trim()); setTranslationStyleDialogOpen(false); }} className="rounded-none bg-violet-500 px-4 py-2 text-xs font-bold text-white hover:bg-violet-400 disabled:opacity-40 cursor-pointer">Áp dụng</button>
              </div>
            </footer>
          </section>
        </div>
      )}
    </div>
  );
}
