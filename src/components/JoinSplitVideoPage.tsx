import { useCallback, useEffect, useLayoutEffect, useMemo, useRef, useState, type DragEvent, type MouseEvent, type PointerEvent as ReactPointerEvent } from "react";
import { createPortal } from "react-dom";
import {
  Download,
  Flag,
  Film,
  FolderOpen,
  LoaderCircle,
  Magnet,
  Minus,
  MoveLeft,
  MoveRight,
  Pause,
  Play,
  Plus,
  Scissors,
  Trash2,
  Video,
  Volume2,
  VolumeX,
  X,
} from "lucide-react";
import type {
  JoinSplitTimelineClipItem,
  JoinSplitVideoExportFile,
  JoinSplitVideoRange,
  JoinSplitVideoRangeStatus,
  JoinSplitVideoSegment,
  JoinSplitVideoSource,
} from "../types/joinSplitVideo";
import {
  getJoinSplitRangeSegments,
  getJoinSplitRangeTimelineBounds,
  getJoinSplitTimelinePartitionSegments,
  getJoinSplitTimelineSegments,
  snapCutTimeToKeyframe,
  snapJoinSplitTimelineTime,
  snapJoinSplitTimelineTimeToTargets,
} from "../utils/joinSplitVideoTimeline";

const API = "/api/join-split-video";
const MIN_ZOOM = 24;
const MAX_ZOOM = 2400;
const ZOOM_STEP = 1.2;
const FRAME_TICK_LABEL_SPACING_PX = 34;
const TIME_TICK_LABEL_SPACING_PX = 100;
const MAX_SNAP_DISTANCE_PX = 100;

interface TimelineClip {
  clipId: string;
  sourceId: string;
  start: number;
  end: number;
  duration: number;
  startFrame: number;
  endFrame: number;
  source: JoinSplitVideoSource;
}

interface SelectionRectangle {
  startX: number;
  startY: number;
  currentX: number;
  currentY: number;
}

interface UploadJob {
  id: string;
  fileName: string;
  percent: number;
  stage: string;
  status: "uploading" | "analyzing" | "error";
  error?: string;
}

interface SavedWorkspace {
  selectedSourceIds: string[];
  timelineSourceIds: string[];
  timelineClipItems?: JoinSplitTimelineClipItem[];
  magnetEnabled?: boolean;
  activeClipId?: string | null;
  activeSourceId: string | null;
  playhead: number;
  cutFromTime: number | null;
  cutToTime: number | null;
  queue: JoinSplitVideoRange[];
  splitMarkers: number[];
  selectedQueueId: string | null;
  queueExportState: Record<string, {
    status: "pending" | "exporting" | "done" | "error" | "cancelled";
    output?: JoinSplitVideoExportFile;
    error?: string;
    progress?: number;
    message?: string;
    strategy?: "checking" | "stream-copy" | "encode" | "fallback";
  }>;
  referenceSourceId: string;
  zoom: number;
  snapDistancePx: number;
  preferKeyframeCuts: boolean;
  timelineJoinOutput: JoinSplitVideoExportFile | null;
  queueJoinOutput: JoinSplitVideoExportFile | null;
  joinQueuesAfterExport: boolean;
  forceCopy: boolean;
  muted: boolean;
  volume: number;
}

const WORKSPACE_STORAGE_KEY = "join-split-video-workspace";

function frameTime(frame: number, frameRate: number): number {
  return Math.max(0, (frame - 1) / frameRate);
}

function formatTime(seconds: number): string {
  const safe = Math.max(0, Number.isFinite(seconds) ? seconds : 0);
  const whole = Math.floor(safe);
  const milliseconds = Math.floor((safe - whole) * 1000);
  const hours = Math.floor(whole / 3600);
  const minutes = Math.floor((whole % 3600) / 60);
  const secs = whole % 60;
  return `${hours ? `${String(hours).padStart(2, "0")}:` : ""}${String(minutes).padStart(2, "0")}:${String(secs).padStart(2, "0")}.${String(milliseconds).padStart(3, "0")}`;
}

function getTimeTickInterval(zoom: number): number {
  const rawInterval = TIME_TICK_LABEL_SPACING_PX / zoom;
  const magnitude = 10 ** Math.floor(Math.log10(rawInterval));
  for (const multiplier of [1, 2, 5, 10]) {
    const interval = multiplier * magnitude;
    if (interval >= rawInterval) return interval;
  }
  return 10 * magnitude;
}

async function responseJson<T>(response: Response): Promise<T> {
  const result = await response.json().catch(() => ({})) as T & { error?: string };
  if (!response.ok) throw new Error(result.error || `Yêu cầu thất bại (${response.status}).`);
  return result;
}

export default function JoinSplitVideoPage() {
  const [sources, setSources] = useState<JoinSplitVideoSource[]>([]);
  const [selectedSourceIds, setSelectedSourceIds] = useState<string[]>([]);
  const [selectionRectangle, setSelectionRectangle] = useState<SelectionRectangle | null>(null);
  const [timelineClipItems, setTimelineClipItems] = useState<JoinSplitTimelineClipItem[]>([]);
  const [magnetEnabled, setMagnetEnabled] = useState(true);
  const [activeClipId, setActiveClipId] = useState<string | null>(null);
  const [activeSourceId, setActiveSourceId] = useState<string | null>(null);
  const timelineSourceIds = useMemo(
    () => Array.from(new Set(timelineClipItems.map((item) => item.sourceId))),
    [timelineClipItems],
  );
  const [playhead, setPlayhead] = useState(0);
  const [cutFromTime, setCutFromTime] = useState<number | null>(null);
  const [cutToTime, setCutToTime] = useState<number | null>(null);
  const [splitMarkers, setSplitMarkers] = useState<number[]>([]);
  const [selectedSplitMarker, setSelectedSplitMarker] = useState<number | null>(null);
  const [queue, setQueue] = useState<JoinSplitVideoRange[]>([]);
  const [selectedQueueId, setSelectedQueueId] = useState<string | null>(null);
  const [queueExportState, setQueueExportState] = useState<Record<string, {
    status: "pending" | "exporting" | "done" | "error" | "cancelled";
    output?: JoinSplitVideoExportFile;
    error?: string;
    progress?: number;
    message?: string;
    strategy?: "checking" | "stream-copy" | "encode" | "fallback";
  }>>({});
  const [rangeStatuses, setRangeStatuses] = useState<JoinSplitVideoRangeStatus[]>([]);
  const [referenceSourceId, setReferenceSourceId] = useState<string>("");
  const [zoom, setZoom] = useState(180);
  const [fitViewResetVersion, setFitViewResetVersion] = useState(0);
  const [snapDistancePx, setSnapDistancePx] = useState(8);
  const [preferKeyframeCuts, setPreferKeyframeCuts] = useState(false);
  const [frameTolerance, setFrameTolerance] = useState(5);
  const [durationTolerance, setDurationTolerance] = useState(5);
  const [timelineJoinOutput, setTimelineJoinOutput] = useState<JoinSplitVideoExportFile | null>(null);
  const [queueJoinOutput, setQueueJoinOutput] = useState<JoinSplitVideoExportFile | null>(null);
  const [joinQueuesAfterExport, setJoinQueuesAfterExport] = useState(false);
  const [forceCopy, setForceCopy] = useState(false);
  const [uploadingName, setUploadingName] = useState<string | null>(null);
  const [uploadJobs, setUploadJobs] = useState<UploadJob[]>([]);
  const [workspaceHydrated, setWorkspaceHydrated] = useState(false);
  const [exporting, setExporting] = useState(false);
  const [joining, setJoining] = useState(false);
  const [queueJoinProgress, setQueueJoinProgress] = useState<{ percent: number; message: string } | null>(null);
  const [isPlaying, setIsPlaying] = useState(false);
  const [muted, setMuted] = useState(false);
  const [volume, setVolume] = useState(1);
  const [error, setError] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);
  const [isDropTarget, setIsDropTarget] = useState(false);
  const [queuePanelHost, setQueuePanelHost] = useState<HTMLDivElement | null>(null);
  const queueStopRequestedRef = useRef(false);
  const currentExportProgressIdRef = useRef<string | null>(null);
  const fileInputRef = useRef<HTMLInputElement | null>(null);
  const uploadInProgressRef = useRef(false);
  const skipWorkspaceSaveRef = useRef(false);
  const sourceListRef = useRef<HTMLDivElement | null>(null);
  const selectionDragRef = useRef<{
    startClientX: number;
    startClientY: number;
    currentClientX: number;
    currentClientY: number;
    initialSelectedIds: string[];
    additive: boolean;
  } | null>(null);
  const selectionAnchorIndexRef = useRef<number | null>(null);
  const previewRef = useRef<HTMLVideoElement | null>(null);
  const timelineScrollRef = useRef<HTMLDivElement | null>(null);
  const timelineContentRef = useRef<HTMLDivElement | null>(null);
  const [timelineViewportWidth, setTimelineViewportWidth] = useState(0);
  const [timelineScrollLeft, setTimelineScrollLeft] = useState(0);
  const isScrubbingRef = useRef(false);
  const queueCueDragRef = useRef<{
    rangeId: string;
    mode: "move" | "start" | "end";
    initialPointerTime: number;
    initialStart: number;
    initialEnd: number;
  } | null>(null);
  const playAfterSourceChangeRef = useRef(false);
  const transitioningToGapRef = useRef(false);

  useEffect(() => {
    if (!previewRef.current) return;
    previewRef.current.volume = volume;
    previewRef.current.muted = muted;
  }, [activeSourceId, muted, volume]);

  useEffect(() => {
    let cancelled = false;
    void (async () => {
      try {
        const result = await responseJson<{
          sources: JoinSplitVideoSource[];
          exports: JoinSplitVideoExportFile[];
        }>(await fetch(`${API}/files`));
        if (cancelled) return;

        let saved: Partial<SavedWorkspace> = {};
        try {
          const savedText = window.localStorage.getItem(WORKSPACE_STORAGE_KEY);
          if (savedText) saved = JSON.parse(savedText) as Partial<SavedWorkspace>;
        } catch (storageError) {
          console.error("[JoinSplitVideo] Không thể đọc trạng thái đã lưu:", storageError);
          setError("Không thể đọc trạng thái Join/Split đã lưu trong trình duyệt.");
        }

        const sourceIds = new Set(result.sources.map((source) => source.id));
        const sourceMap = new Map(result.sources.map((source) => [source.id, source]));
        const exportById = new Map(result.exports.map((output) => [output.id, output]));
        const savedQueue = Array.isArray(saved.queue)
          ? saved.queue.filter((range) =>
              Boolean(range && typeof range.id === "string") &&
              getJoinSplitRangeSegments(range).length > 0 &&
              getJoinSplitRangeSegments(range).every((segment) => sourceIds.has(segment.sourceId)),
            )
          : [];
        const restoredQueueState: SavedWorkspace["queueExportState"] = {};
        if (saved.queueExportState && typeof saved.queueExportState === "object") {
          for (const [rangeId, state] of Object.entries(saved.queueExportState)) {
            if (!savedQueue.some((range) => range.id === rangeId)) continue;
            if (state.status === "done" && state.output && exportById.has(state.output.id)) {
              restoredQueueState[rangeId] = { ...state, output: exportById.get(state.output.id)! };
            } else if (state.status === "exporting") {
              restoredQueueState[rangeId] = {
                status: "pending",
                message: "Tác vụ trước bị gián đoạn; hãy xuất lại.",
              };
            } else if (state.status === "error" || state.status === "cancelled") {
              restoredQueueState[rangeId] = state;
            }
          }
        }

        setSources(result.sources);
        setSelectedSourceIds(
          Array.isArray(saved.selectedSourceIds)
            ? saved.selectedSourceIds.filter((id) => sourceIds.has(id))
            : [],
        );
        const restoredClipItems: JoinSplitTimelineClipItem[] = [];
        if (Array.isArray(saved.timelineClipItems) && saved.timelineClipItems.length > 0) {
          for (const item of saved.timelineClipItems) {
            const src = sourceMap.get(item.sourceId);
            if (!src) continue;
            const startFrame = Math.max(1, Math.min(src.frameCount, Number.isFinite(item.startFrame) ? item.startFrame : 1));
            const endFrame = Math.max(startFrame, Math.min(src.frameCount, Number.isFinite(item.endFrame) ? item.endFrame : src.frameCount));
            restoredClipItems.push({
              id: typeof item.id === "string" ? item.id : crypto.randomUUID(),
              sourceId: item.sourceId,
              startFrame,
              endFrame,
              offsetSeconds: typeof item.offsetSeconds === "number" && Number.isFinite(item.offsetSeconds) ? Math.max(0, item.offsetSeconds) : undefined,
            });
          }
        } else if (Array.isArray(saved.timelineSourceIds)) {
          for (const id of saved.timelineSourceIds) {
            const src = sourceMap.get(id);
            if (!src) continue;
            restoredClipItems.push({
              id: crypto.randomUUID(),
              sourceId: id,
              startFrame: 1,
              endFrame: src.frameCount,
            });
          }
        }
        setTimelineClipItems(restoredClipItems);
        setMagnetEnabled(saved.magnetEnabled !== false);
        setActiveClipId(
          typeof saved.activeClipId === "string" && restoredClipItems.some((c) => c.id === saved.activeClipId)
            ? saved.activeClipId
            : restoredClipItems[0]?.id || null,
        );
        setActiveSourceId(
          typeof saved.activeSourceId === "string" && sourceIds.has(saved.activeSourceId)
            ? saved.activeSourceId
            : null,
        );
        setPlayhead(typeof saved.playhead === "number" && Number.isFinite(saved.playhead) ? saved.playhead : 0);
        setCutFromTime(typeof saved.cutFromTime === "number" && Number.isFinite(saved.cutFromTime)
          ? saved.cutFromTime
          : null);
        setCutToTime(typeof saved.cutToTime === "number" && Number.isFinite(saved.cutToTime)
          ? saved.cutToTime
          : null);
        setSplitMarkers(
          Array.isArray(saved.splitMarkers)
            ? [...new Set(saved.splitMarkers.filter((time) => Number.isFinite(time)))].sort((a, b) => a - b)
            : [],
        );
        setQueue(savedQueue);
        setSelectedQueueId(
          typeof saved.selectedQueueId === "string" && savedQueue.some((range) => range.id === saved.selectedQueueId)
            ? saved.selectedQueueId
            : null,
        );
        setQueueExportState(restoredQueueState);
        setReferenceSourceId(
          typeof saved.referenceSourceId === "string" && sourceIds.has(saved.referenceSourceId)
            ? saved.referenceSourceId
            : result.sources[0]?.id || "",
        );
        setZoom(typeof saved.zoom === "number" && Number.isFinite(saved.zoom) ? saved.zoom : 180);
        setSnapDistancePx(typeof saved.snapDistancePx === "number" ? saved.snapDistancePx : 8);
        setPreferKeyframeCuts(saved.preferKeyframeCuts === true);
        setTimelineJoinOutput(
          saved.timelineJoinOutput ? exportById.get(saved.timelineJoinOutput.id) || null : null,
        );
        setQueueJoinOutput(
          saved.queueJoinOutput ? exportById.get(saved.queueJoinOutput.id) || null : null,
        );
        setJoinQueuesAfterExport(saved.joinQueuesAfterExport === true);
        setForceCopy(saved.forceCopy === true);
        setMuted(saved.muted === true);
        setVolume(typeof saved.volume === "number" && Number.isFinite(saved.volume)
          ? Math.max(0, Math.min(1, saved.volume))
          : 1);
        setWorkspaceHydrated(true);
      } catch (loadError) {
        if (!cancelled) {
          setError(loadError instanceof Error ? loadError.message : "Không thể khôi phục trạng thái Join/Split.");
        }
      }
    })();
    return () => {
      cancelled = true;
    };
  }, []);

  useEffect(() => {
    if (!workspaceHydrated) return;
    if (skipWorkspaceSaveRef.current) {
      skipWorkspaceSaveRef.current = false;
      return;
    }
    const saved: SavedWorkspace = {
      selectedSourceIds,
      timelineSourceIds,
      timelineClipItems,
      magnetEnabled,
      activeClipId,
      activeSourceId,
      playhead,
      cutFromTime,
      cutToTime,
      splitMarkers,
      queue,
      selectedQueueId,
      queueExportState,
      referenceSourceId,
      zoom,
      snapDistancePx,
      preferKeyframeCuts,
      timelineJoinOutput,
      queueJoinOutput,
      joinQueuesAfterExport,
      forceCopy,
      muted,
      volume,
    };
    const timer = window.setTimeout(() => {
      try {
        window.localStorage.setItem(WORKSPACE_STORAGE_KEY, JSON.stringify(saved));
      } catch (saveError) {
        console.error("[JoinSplitVideo] Không thể lưu trạng thái trang:", saveError);
        setError("Không thể lưu trạng thái Join/Split vào trình duyệt.");
      }
    }, 250);
    return () => window.clearTimeout(timer);
  }, [
    activeClipId,
    activeSourceId,
    cutFromTime,
    cutToTime,
    forceCopy,
    joinQueuesAfterExport,
    magnetEnabled,
    muted,
    playhead,
    preferKeyframeCuts,
    queue,
    queueExportState,
    queueJoinOutput,
    referenceSourceId,
    selectedQueueId,
    selectedSourceIds,
    splitMarkers,
    snapDistancePx,
    timelineClipItems,
    timelineJoinOutput,
    timelineSourceIds,
    volume,
    workspaceHydrated,
    zoom,
  ]);

  const sourceById = useMemo(
    () => new Map(sources.map((source) => [source.id, source])),
    [sources],
  );
  const timelineClips = useMemo(() => {
    let prevEnd = 0;
    return timelineClipItems.flatMap((item) => {
      const source = sourceById.get(item.sourceId);
      if (!source) return [];
      const startFrame = Math.max(1, Math.min(source.frameCount, item.startFrame));
      const endFrame = Math.max(startFrame, Math.min(source.frameCount, item.endFrame));
      const frameSpan = endFrame - startFrame + 1;
      const duration = frameSpan / source.frameRate;
      const start = (magnetEnabled || typeof item.offsetSeconds !== "number")
        ? prevEnd
        : Math.max(prevEnd, item.offsetSeconds);
      const end = start + duration;
      prevEnd = end;
      const clip: TimelineClip = {
        clipId: item.id,
        sourceId: item.sourceId,
        start,
        end,
        duration,
        startFrame,
        endFrame,
        source,
      };
      return [clip];
    });
  }, [magnetEnabled, sourceById, timelineClipItems]);
  const keyframeTimelineClips = useMemo(
    () => timelineClips.map((clip) => ({
      ...clip,
      frameRate: clip.source.frameRate,
      frameCount: clip.source.frameCount,
      startFrame: clip.startFrame,
      endFrame: clip.endFrame,
      keyframeTimes: clip.source.keyframeTimes,
    })),
    [timelineClips],
  );
  const timelineDuration = timelineClips.at(-1)?.end || 0;
  const fitZoom = timelineDuration > 0 && timelineViewportWidth > 0
    ? Math.max(0.01, timelineViewportWidth / timelineDuration)
    : MIN_ZOOM;
  const minimumZoom = Math.min(MIN_ZOOM, fitZoom);
  const fitTimeline = useCallback(() => {
    setZoom(fitZoom);
    setFitViewResetVersion((version) => version + 1);
  }, [fitZoom]);
  const timelineWidth = Math.max(
    timelineViewportWidth,
    timelineDuration > 0 ? timelineDuration * zoom : 900,
  );
  const selectedSource = activeSourceId ? sourceById.get(activeSourceId) : undefined;

  useLayoutEffect(() => {
    if (fitViewResetVersion === 0) return;
    const container = timelineScrollRef.current;
    if (!container) return;
    container.scrollLeft = 0;
    setTimelineScrollLeft(0);
  }, [fitViewResetVersion]);

  const activeClip = useMemo(() => {
    if (timelineClips.length > 0) {
      const matchAtPlayhead = timelineClips.find((c) => playhead >= c.start && playhead < c.end);
      if (matchAtPlayhead) return matchAtPlayhead;
    }
    if (activeClipId) {
      const match = timelineClips.find((clip) => clip.clipId === activeClipId);
      if (match) return match;
    }
    if (activeSourceId) {
      const match = timelineClips.find((clip) => clip.sourceId === activeSourceId);
      if (match) return match;
    }
    return timelineClips[0];
  }, [activeClipId, activeSourceId, playhead, timelineClips]);
  const playheadClip = useMemo(
    () => timelineClips.find((c) => playhead >= c.start && playhead < c.end),
    [playhead, timelineClips],
  );
  const isInGap = timelineClips.length > 0 && !playheadClip;
  const localPlayhead = activeClip
    ? Math.max(0, Math.min(activeClip.duration, playhead - activeClip.start))
    : playhead;
  const currentFrame = activeClip && selectedSource
    ? Math.max(
        activeClip.startFrame,
        Math.min(
          activeClip.endFrame,
          activeClip.startFrame + Math.floor(localPlayhead * selectedSource.frameRate + 1e-6),
        ),
      )
    : 1;
  const isIncompatible = useMemo(() => {
    if (!referenceSourceId) return false;
    const reference = sourceById.get(referenceSourceId);
    if (!reference) return false;
    const signature = (source: JoinSplitVideoSource) =>
      JSON.stringify([source.video, source.audio || null]);
    return timelineClips.some((clip) => signature(clip.source) !== signature(reference));
  }, [referenceSourceId, sourceById, timelineClips]);

  const uploadFiles = useCallback(async (files: FileList | File[]) => {
    const candidates = Array.from(files).filter((file) => file.type.startsWith("video/") || /\.(mp4|mkv|mov|avi|webm|m4v)$/i.test(file.name));
    if (!candidates.length) {
      setError("Không tìm thấy video hợp lệ trong tệp đã chọn.");
      return;
    }
    if (uploadInProgressRef.current) return;
    uploadInProgressRef.current = true;
    setError(null);
    setNotice(null);
    try {
      for (const file of candidates) {
        const uploadId = crypto.randomUUID();
        const updateJob = (update: Partial<UploadJob>) => {
          setUploadJobs((current) => current.map((job) =>
            job.id === uploadId ? { ...job, ...update } : job,
          ));
        };
        setUploadingName(file.name);
        setUploadJobs((current) => [...current, {
          id: uploadId,
          fileName: file.name,
          percent: 0,
          stage: "Đang tải video lên…",
          status: "uploading",
        }]);

        let resolveUploadSent!: () => void;
        const uploadSent = new Promise<void>((resolve) => {
          resolveUploadSent = resolve;
        });
        let uploadResponseReceived = false;
        const uploadRequest = new Promise<{ source: JoinSplitVideoSource }>((resolve, reject) => {
          const xhr = new XMLHttpRequest();
          xhr.open("POST", `${API}/files`);
          xhr.setRequestHeader("Content-Type", "application/octet-stream");
          xhr.setRequestHeader("X-File-Name", encodeURIComponent(file.name));
          xhr.setRequestHeader("X-Upload-Id", uploadId);
          xhr.upload.addEventListener("progress", (event) => {
            if (!event.lengthComputable) return;
            updateJob({
              percent: Math.min(60, Math.round(event.loaded / event.total * 60)),
              stage: "Đang tải video lên…",
              status: "uploading",
            });
          });
          xhr.upload.addEventListener("load", () => {
            updateJob({ percent: 60, stage: "Đang phân tích video…", status: "analyzing" });
            resolveUploadSent();
          });
          xhr.addEventListener("load", () => {
            try {
              const result = JSON.parse(xhr.responseText) as { source?: JoinSplitVideoSource; error?: string };
              if (xhr.status < 200 || xhr.status >= 300) {
                reject(new Error(result.error || `Yêu cầu thất bại (${xhr.status}).`));
              } else if (!result.source) {
                reject(new Error("Máy chủ không trả về thông tin video."));
              } else {
                resolve({ source: result.source });
              }
            } catch (parseError) {
              reject(parseError instanceof Error ? parseError : new Error("Phản hồi tải video không hợp lệ."));
            }
          });
          xhr.addEventListener("error", () => reject(new Error(`Không thể tải ${file.name} lên máy chủ.`)));
          xhr.addEventListener("abort", () => reject(new Error(`Đã hủy tải ${file.name}.`)));
          xhr.send(file);
        });
        const pollProgress = async () => {
          await uploadSent;
          while (!uploadResponseReceived) {
            try {
              const response = await fetch(`${API}/files/upload-progress/${encodeURIComponent(uploadId)}`);
              if (response.ok) {
                const progress = await responseJson<{
                  status: "processing" | "done" | "error";
                  percent: number;
                  stage: string;
                  error?: string;
                }>(response);
                updateJob({
                  percent: progress.percent,
                  stage: progress.stage,
                  status: progress.status === "error" ? "error" : "analyzing",
                  ...(progress.error ? { error: progress.error } : {}),
                });
              } else if (response.status !== 404) {
                console.warn(`Không thể đọc tiến trình tải video (${response.status}).`);
              }
            } catch (pollError) {
              console.warn("Không thể đọc tiến trình phân tích video:", pollError);
            }
            await new Promise((resolve) => window.setTimeout(resolve, 400));
          }
        };
        const polling = pollProgress();
        try {
          const result = await uploadRequest;
          uploadResponseReceived = true;
          await polling;
          setSources((current) => [...current, result.source]);
          setSelectedSourceIds((current) => current.length ? current : [result.source.id]);
          setActiveSourceId((current) => current || result.source.id);
          setReferenceSourceId((current) => current || result.source.id);
          setUploadJobs((current) => current.filter((job) => job.id !== uploadId));
          setNotice(`Đã tải và phân tích ${file.name}.`);
        } catch (uploadError) {
          uploadResponseReceived = true;
          resolveUploadSent();
          await polling;
          const message = uploadError instanceof Error ? uploadError.message : `Không thể tải ${file.name}.`;
          updateJob({ status: "error", stage: "Tải hoặc phân tích thất bại.", error: message });
          setError(message);
        }
      }
    } finally {
      uploadInProgressRef.current = false;
      setUploadingName(null);
    }
  }, []);

  const selectSource = (sourceId: string, event?: MouseEvent) => {
    setError(null);
    const sourceIndex = sources.findIndex((source) => source.id === sourceId);
    if (event?.shiftKey && sourceIndex >= 0) {
      const anchorIndex = selectionAnchorIndexRef.current ?? sourceIndex;
      const start = Math.min(anchorIndex, sourceIndex);
      const end = Math.max(anchorIndex, sourceIndex);
      const rangeIds = sources.slice(start, end + 1).map((source) => source.id);
      setSelectedSourceIds((current) =>
        event.ctrlKey || event.metaKey
          ? [...new Set([...current, ...rangeIds])]
          : rangeIds,
      );
      setActiveSourceId(sourceId);
      setPlayhead(timelineClips.find((item) => item.sourceId === sourceId)?.start || 0);
      return;
    }
    if (event?.ctrlKey || event?.metaKey) {
      setSelectedSourceIds((current) => {
        const next = current.includes(sourceId)
          ? current.filter((id) => id !== sourceId)
          : [...current, sourceId];
        if (!current.includes(sourceId)) selectionAnchorIndexRef.current = sourceIndex;
        return next;
      });
      setActiveSourceId(sourceId);
      setPlayhead(timelineClips.find((item) => item.sourceId === sourceId)?.start || 0);
      return;
    }
    selectionAnchorIndexRef.current = sourceIndex;
    setSelectedSourceIds([sourceId]);
    setActiveSourceId(sourceId);
    const clip = timelineClips.find((item) => item.sourceId === sourceId);
    if (clip) setPlayhead(clip.start);
    else setPlayhead(0);
  };

  const appendToTimeline = (sourceIds: string[]) => {
    const validSources = sourceIds.map((id) => sourceById.get(id)).filter((s): s is JoinSplitVideoSource => Boolean(s));
    if (!validSources.length) return;
    const newItems: JoinSplitTimelineClipItem[] = validSources.map((source) => ({
      id: crypto.randomUUID(),
      sourceId: source.id,
      startFrame: 1,
      endFrame: source.frameCount,
    }));
    setTimelineClipItems((current) => [...current, ...newItems]);
    setActiveClipId(newItems[0].id);
    setActiveSourceId(newItems[0].sourceId);
    setNotice(`Đã thêm ${newItems.length} clip vào timeline, không tạo khoảng trống.`);
    setError(null);
  };

  const removeTimelineClip = (clipId: string) => {
    const clipIndex = timelineClipItems.findIndex((c) => c.id === clipId);
    if (clipIndex < 0) return;
    const clipToDelete = timelineClips.find((c) => c.clipId === clipId);
    const nextClipItems = timelineClipItems.filter((c) => c.id !== clipId);
    if (!magnetEnabled && clipToDelete) {
      for (let i = clipIndex; i < nextClipItems.length; i++) {
        const item = nextClipItems[i];
        if (typeof item.offsetSeconds !== "number") {
          const originalClip = timelineClips.find((c) => c.clipId === item.id);
          if (originalClip) {
            nextClipItems[i] = { ...item, offsetSeconds: originalClip.start };
          }
        }
      }
    }
    setTimelineClipItems(nextClipItems);
    if (nextClipItems.length === 0) {
      setActiveClipId(null);
      setPlayhead(0);
    } else if (activeClipId === clipId) {
      const nextItem = nextClipItems[Math.min(clipIndex, nextClipItems.length - 1)];
      setActiveClipId(nextItem.id);
      setActiveSourceId(nextItem.sourceId);
      const nextClip = timelineClips.find((c) => c.clipId === nextItem.id);
      setPlayhead(nextClip?.start || 0);
    }
    setNotice("Đã xóa clip khỏi timeline; video gốc vẫn còn trong danh sách input.");
  };

  const handleSwapClips = useCallback((clipId1: string, clipId2: string) => {
    setTimelineClipItems((current) => {
      const idx1 = current.findIndex((c) => c.id === clipId1);
      const idx2 = current.findIndex((c) => c.id === clipId2);
      if (idx1 < 0 || idx2 < 0 || idx1 === idx2) return current;
      const next = [...current];
      const temp = next[idx1];
      next[idx1] = next[idx2];
      next[idx2] = temp;
      return next;
    });
    setNotice("Đã hoán đổi vị trí thành công giữa 2 clip.");
  }, []);

  const handleMoveClipOffset = useCallback((clipId: string, direction: -1 | 1) => {
    setTimelineClipItems((current) => {
      const idx = current.findIndex((c) => c.id === clipId);
      if (idx < 0) return current;
      const targetIdx = idx + direction;
      if (targetIdx < 0 || targetIdx >= current.length) return current;
      const next = [...current];
      const temp = next[idx];
      next[idx] = next[targetIdx];
      next[targetIdx] = temp;
      return next;
    });
  }, []);

  const addActiveClipToQueue = () => {
    if (!activeClipId || !timelineClips.length) return;
    const activeClip = timelineClips.find((c) => c.clipId === activeClipId);
    if (!activeClip) return;
    const source = sourceById.get(activeClip.sourceId);
    if (!source) return;
    let startFrame = activeClip.startFrame;
    let endFrame = activeClip.endFrame;
    if (preferKeyframeCuts && source.keyframeTimes?.length) {
      const keyframeFrames = source.keyframeTimes
        .map((time) => Math.round(time * source.frameRate) + 1)
        .filter((f) => f >= 1 && f <= source.frameCount)
        .sort((a, b) => a - b);
      if (keyframeFrames.length > 0) {
        const prevKeyframe = keyframeFrames.filter((f) => f <= startFrame).at(-1);
        if (prevKeyframe !== undefined) startFrame = prevKeyframe;
        const nextKeyframe = keyframeFrames.find((f) => f > endFrame);
        if (nextKeyframe !== undefined) endFrame = nextKeyframe - 1;
      }
    }
    const range = { id: crypto.randomUUID(), sourceId: activeClip.sourceId, startFrame, endFrame };
    setQueue((current) => [...current, range]);
    setNotice(`Đã thêm clip vào queue: ${source.fileName} · frame ${startFrame}–${endFrame}${preferKeyframeCuts ? " (snapped to keyframe)" : ""}`);
    setError(null);
  };

  const addAllClipsToQueue = () => {
    if (!timelineClips.length) return;
    let addedCount = 0;
    const newRanges: JoinSplitVideoRange[] = [];
    for (const clip of timelineClips) {
      const source = sourceById.get(clip.sourceId);
      if (!source) continue;
      let startFrame = clip.startFrame;
      let endFrame = clip.endFrame;
      if (preferKeyframeCuts && source.keyframeTimes?.length) {
        const keyframeFrames = source.keyframeTimes
          .map((time) => Math.round(time * source.frameRate) + 1)
          .filter((f) => f >= 1 && f <= source.frameCount)
          .sort((a, b) => a - b);
        if (keyframeFrames.length > 0) {
          const prevKeyframe = keyframeFrames.filter((f) => f <= startFrame).at(-1);
          if (prevKeyframe !== undefined) startFrame = prevKeyframe;
          const nextKeyframe = keyframeFrames.find((f) => f > endFrame);
          if (nextKeyframe !== undefined) endFrame = nextKeyframe - 1;
        }
      }
      addedCount++;
      newRanges.push({ id: crypto.randomUUID(), sourceId: clip.sourceId, startFrame, endFrame });
    }
    setQueue((current) => [...current, ...newRanges]);
    setNotice(`Đã thêm ${addedCount} clip vào queue${preferKeyframeCuts ? " (snapped to keyframe)" : ""}.`);
    setError(null);
  };

  const createSingleMergedQueue = () => {
    if (!timelineClips.length) return;
    const allSegments = timelineClips.map((clip) => ({
      clipId: clip.clipId,
      sourceId: clip.sourceId,
      start: clip.start,
      end: clip.end,
      frameRate: clip.source.frameRate,
      frameCount: clip.source.frameCount,
      startFrame: clip.startFrame,
      endFrame: clip.endFrame,
    }));
    const segments = getJoinSplitTimelineSegments(0, timelineDuration, allSegments);
    if (!segments.length) {
      setError("Không thể tạo queue từ timeline rỗng.");
      return;
    }
    let snappedSegments = segments;
    if (preferKeyframeCuts) {
      snappedSegments = segments.map((segment) => {
        const source = sourceById.get(segment.sourceId);
        if (!source?.keyframeTimes?.length) return segment;
        const keyframeFrames = source.keyframeTimes
          .map((time) => Math.round(time * source.frameRate) + 1)
          .filter((f) => f >= 1 && f <= source.frameCount)
          .sort((a, b) => a - b);
        if (!keyframeFrames.length) return segment;
        let startFrame = segment.startFrame;
        let endFrame = segment.endFrame;
        const prevKeyframe = keyframeFrames.filter((f) => f <= startFrame).at(-1);
        if (prevKeyframe !== undefined) startFrame = prevKeyframe;
        const nextKeyframe = keyframeFrames.find((f) => f > endFrame);
        if (nextKeyframe !== undefined) endFrame = nextKeyframe - 1;
        return { ...segment, startFrame, endFrame };
      });
    }
    const firstSegment = snappedSegments[0];
    const lastSegment = snappedSegments[snappedSegments.length - 1];
    const range = {
      id: crypto.randomUUID(),
      sourceId: firstSegment.sourceId,
      startFrame: firstSegment.startFrame,
      endFrame: lastSegment.endFrame,
      ...(snappedSegments.length > 1 ? { segments: snappedSegments } : {}),
    };
    setQueue((current) => [...current, range]);
    setNotice(`Đã tạo 1 queue gộp toàn bộ ${timelineClips.length} clip (${snappedSegments.length} segment)${preferKeyframeCuts ? " (snapped to keyframe)" : ""}.`);
    setError(null);
  };

  const removeTimelineSource = (sourceId: string) => {
    const nextClipItems = timelineClipItems.filter((c) => c.sourceId !== sourceId);
    if (!magnetEnabled) {
      for (let i = 0; i < nextClipItems.length; i++) {
        const item = nextClipItems[i];
        if (typeof item.offsetSeconds !== "number") {
          const originalClip = timelineClips.find((c) => c.clipId === item.id);
          if (originalClip) {
            nextClipItems[i] = { ...item, offsetSeconds: originalClip.start };
          }
        }
      }
    }
    setTimelineClipItems(nextClipItems);
    if (nextClipItems.length === 0) {
      setActiveClipId(null);
      setPlayhead(0);
    } else if (activeSourceId === sourceId) {
      const nextItem = nextClipItems[0];
      setActiveClipId(nextItem.id);
      setActiveSourceId(nextItem.sourceId);
      const nextClip = timelineClips.find((c) => c.clipId === nextItem.id);
      setPlayhead(nextClip?.start || 0);
    }
    setNotice("Đã xóa video khỏi timeline; video vẫn còn trong danh sách input.");
  };

  const removeSource = async (sourceId: string) => {
    try {
      const response = await fetch(`${API}/files/${encodeURIComponent(sourceId)}`, { method: "DELETE" });
      await responseJson<{ success: boolean }>(response);
      setSources((current) => current.filter((source) => source.id !== sourceId));
      setSelectedSourceIds((current) => current.filter((id) => id !== sourceId));
      setTimelineClipItems((current) => current.filter((clip) => clip.sourceId !== sourceId));
      setQueue((current) => current.filter((range) =>
        !getJoinSplitRangeSegments(range).some((segment) => segment.sourceId === sourceId),
      ));
      setQueueExportState((current) => {
        const next = { ...current };
        for (const range of queue) {
          if (getJoinSplitRangeSegments(range).some((segment) => segment.sourceId === sourceId)) {
            delete next[range.id];
          }
        }
        return next;
      });
      if (queue.some((range) =>
        getJoinSplitRangeSegments(range).some((segment) => segment.sourceId === sourceId) &&
        range.id === selectedQueueId,
      )) setSelectedQueueId(null);
      if (activeSourceId === sourceId) {
        const nextId = sources.find((source) => source.id !== sourceId)?.id || null;
        setActiveSourceId(nextId);
        setPlayhead(0);
      }
      if (referenceSourceId === sourceId) {
        setReferenceSourceId(sources.find((source) => source.id !== sourceId)?.id || "");
      }
      setNotice("Đã xóa video khỏi danh sách.");
    } catch (removeError) {
      setError(removeError instanceof Error ? removeError.message : "Không thể xóa video.");
    }
  };

  const snapPlayheadTime = useCallback(
    (requestedTime: number, snapToClipEdges = true) => {
      const snapClips = timelineClips.map((clip) => ({
          start: clip.start,
          end: clip.end,
          frameRate: clip.source.frameRate,
      }));
      if (!snapToClipEdges) {
        return snapJoinSplitTimelineTime(
          requestedTime,
          snapClips,
          zoom,
          snapDistancePx,
          false,
        );
      }
      const cueBoundaries = queue.flatMap((range) => {
        const bounds = getJoinSplitRangeTimelineBounds(
          getJoinSplitRangeSegments(range),
          timelineClips.map((clip) => ({
            clipId: clip.clipId,
            sourceId: clip.sourceId,
            start: clip.start,
            end: clip.end,
            frameRate: clip.source.frameRate,
            frameCount: clip.source.frameCount,
            startFrame: clip.startFrame,
            endFrame: clip.endFrame,
          })),
        );
        return bounds ? [bounds.start, bounds.end] : [];
      });
      return snapJoinSplitTimelineTimeToTargets(
        requestedTime,
        snapClips,
        zoom,
        snapDistancePx,
        cueBoundaries,
      );
    },
    [queue, snapDistancePx, timelineClips, zoom],
  );
  const snapCueEdgeTime = useCallback(
    (requestedTime: number) => snapJoinSplitTimelineTimeToTargets(
      requestedTime,
      timelineClips.map((clip) => ({
        start: clip.start,
        end: clip.end,
        frameRate: clip.source.frameRate,
      })),
      zoom,
      snapDistancePx,
      [playhead],
    ),
    [playhead, snapDistancePx, timelineClips, zoom],
  );

  const seekGlobal = useCallback((requestedTime: number) => {
    if (!timelineClips.length) return;
    const time = snapPlayheadTime(requestedTime);
    const clip = timelineClips.find((item) => time >= item.start && time < item.end);
    if (clip) {
      const localTime = Math.min(clip.duration, time - clip.start);
      if (previewRef.current) {
        try {
          const sourceFrameTime = (clip.startFrame - 1) / clip.source.frameRate + localTime;
          previewRef.current.currentTime = Math.max(0, sourceFrameTime);
        } catch {
          setError("Không thể tua tới frame đã chọn.");
        }
      }
      setActiveClipId(clip.clipId);
      setActiveSourceId(clip.sourceId);
    } else {
      if (previewRef.current) {
        previewRef.current.pause();
      }
    }
    setPlayhead(time);
  }, [snapPlayheadTime, timelineClips]);

  const seekFrame = useCallback((frame: number) => {
    if (!selectedSource || !activeClip) return;
    const targetFrame = Math.max(activeClip.startFrame, Math.min(activeClip.endFrame, frame));
    const offsetSeconds = (targetFrame - activeClip.startFrame) / selectedSource.frameRate;
    seekGlobal(activeClip.start + offsetSeconds);
  }, [activeClip, seekGlobal, selectedSource]);

  const setCutFrom = () => {
    const exactFrameTime = snapPlayheadTime(playhead);
    const keyframeTime = preferKeyframeCuts
      ? snapCutTimeToKeyframe(exactFrameTime, keyframeTimelineClips, "start")
      : null;
    setCutFromTime(keyframeTime ?? exactFrameTime);
    if (preferKeyframeCuts && keyframeTime === null) {
      setNotice("Không có keyframe khả dụng tại vị trí này; đã giữ frame chính xác.");
    }
  };

  const setCutTo = () => {
    const exactFrameTime = snapPlayheadTime(playhead);
    const keyframeTime = preferKeyframeCuts
      ? snapCutTimeToKeyframe(exactFrameTime, keyframeTimelineClips, "end")
      : null;
    setCutToTime(keyframeTime ?? exactFrameTime);
    if (preferKeyframeCuts && keyframeTime === null) {
      setNotice("Không có keyframe khả dụng tại vị trí này; đã giữ frame chính xác.");
    }
  };

  const seekTimelineStart = () => {
    if (!timelineClips.length) return;
    seekGlobal(0);
  };

  const seekTimelineEnd = () => {
    if (!timelineClips.length) return;
    seekGlobal(timelineDuration);
  };

  const splitClipAtPlayhead = () => {
    if (!timelineClips.length) return;
    const time = playhead;
    const targetClip = timelineClips.find((c) => time > c.start + 1e-4 && time < c.end - 1e-4);
    if (!targetClip) {
      setNotice("Playhead phải nằm bên trong một clip (không ở mép đầu/cuối clip) để cắt.");
      return;
    }
    const localTime = time - targetClip.start;
    const splitFrame = Math.max(
      targetClip.startFrame,
      Math.min(
        targetClip.endFrame - 1,
        targetClip.startFrame + Math.floor(localTime * targetClip.source.frameRate + 1e-6),
      ),
    );
    if (splitFrame < targetClip.startFrame || splitFrame >= targetClip.endFrame) {
      setNotice("Vị trí cắt quá sát mép clip.");
      return;
    }
    const clipIndex = timelineClipItems.findIndex((c) => c.id === targetClip.clipId);
    if (clipIndex < 0) return;
    const firstPiece: JoinSplitTimelineClipItem = {
      id: targetClip.clipId,
      sourceId: targetClip.sourceId,
      startFrame: targetClip.startFrame,
      endFrame: splitFrame,
      offsetSeconds: !magnetEnabled ? targetClip.start : undefined,
    };
    const splitOffset = (splitFrame - targetClip.startFrame + 1) / targetClip.source.frameRate;
    const secondPiece: JoinSplitTimelineClipItem = {
      id: crypto.randomUUID(),
      sourceId: targetClip.sourceId,
      startFrame: splitFrame + 1,
      endFrame: targetClip.endFrame,
      offsetSeconds: !magnetEnabled ? targetClip.start + splitOffset : undefined,
    };
    const nextClips = [...timelineClipItems];
    nextClips.splice(clipIndex, 1, firstPiece, secondPiece);
    setTimelineClipItems(nextClips);
    setActiveClipId(secondPiece.id);
    setNotice(`Đã cắt clip "${targetClip.source.fileName}" tại frame ${splitFrame}.`);
    setError(null);
  };

  const addSplitMarker = () => {
    if (!timelineClips.length) return;
    const marker = snapPlayheadTime(playhead);
    if (marker <= 0 || marker >= timelineDuration) {
      setNotice("Mốc split phải nằm bên trong timeline, không ở đầu/cuối.");
      return;
    }
    if (splitMarkers.some((time) => Math.abs(time - marker) < 1e-6)) {
      setSelectedSplitMarker(marker);
      setSelectedQueueId(null);
      setNotice(`Đã có mốc split tại ${formatTime(marker)}.`);
      return;
    }
    setSplitMarkers((current) => [...current, marker].sort((a, b) => a - b));
    setSelectedSplitMarker(marker);
    setSelectedQueueId(null);
    setError(null);
    setNotice(`Đã đánh dấu split tại ${formatTime(marker)}.`);
  };

  const removeLastSplitMarker = () => {
    if (splitMarkers.at(-1) === selectedSplitMarker) setSelectedSplitMarker(null);
    setSplitMarkers((current) => current.slice(0, -1));
  };

  const splitTimelineToQueues = () => {
    const validMarkers = splitMarkers.filter((time) => time > 0 && time < timelineDuration);
    if (!validMarkers.length) {
      setError("Hãy đánh dấu ít nhất một mốc split trên timeline.");
      return;
    }
    if (
      queue.length > 0 &&
      !window.confirm("Tạo queue từ các mốc split và thay thế toàn bộ queue hiện tại?")
    ) {
      return;
    }
    const partitions = getJoinSplitTimelinePartitionSegments(
      validMarkers,
      timelineClips.map((clip) => ({
        clipId: clip.clipId,
        sourceId: clip.sourceId,
        start: clip.start,
        end: clip.end,
        frameRate: clip.source.frameRate,
        frameCount: clip.source.frameCount,
        startFrame: clip.startFrame,
        endFrame: clip.endFrame,
      })),
    );
    const nextQueue = partitions.flatMap((segments) => {
      const first = segments[0];
      const last = segments.at(-1);
      if (!first || !last) return [];
      return [{
        id: crypto.randomUUID(),
        sourceId: first.sourceId,
        startFrame: first.startFrame,
        endFrame: last.endFrame,
        ...(segments.length > 1 ? { segments } : {}),
      }];
    });
    if (nextQueue.length !== partitions.length) {
      setError("Không thể tạo queue cho một hoặc nhiều đoạn. Kiểm tra timeline và mốc split.");
      return;
    }
    setQueue(nextQueue);
    setQueueExportState({});
    setSelectedQueueId(nextQueue[0]?.id || null);
    setQueueJoinOutput(null);
    setError(null);
    setNotice(`Đã tạo ${nextQueue.length} queue theo ${validMarkers.length} mốc split.`);
  };

  const addRangeToQueue = (segments: JoinSplitVideoRange["segments"]) => {
    if (!segments?.length) {
      setError("Khoảng frame không hợp lệ. Hãy kiểm tra điểm đầu và điểm cuối.");
      return false;
    }
    const first = segments[0];
    const last = segments[segments.length - 1];
    setQueue((current) => [
      ...current,
      {
        id: crypto.randomUUID(),
        sourceId: first.sourceId,
        startFrame: first.startFrame,
        endFrame: first.endFrame,
        ...(segments.length > 1 ? { segments } : {}),
      },
    ]);
    setError(null);
    setNotice(`Đã thêm ${segments.length > 1 ? `${segments.length} đoạn liên tiếp` : `${sourceById.get(first.sourceId)?.fileName || "video"} · frame ${first.startFrame}–${last.endFrame}`} vào queue.`);
    setCutFromTime(null);
    setCutToTime(null);
    return true;
  };

  const addCurrentRange = () => {
    if (!timelineClips.length) return;
    const startTime = cutFromTime ?? 0;
    const endTime = cutToTime ?? timelineDuration;
    if (endTime < startTime) {
      setError("Điểm kết thúc phải nằm sau điểm bắt đầu.");
      return;
    }
    addRangeToQueue(getJoinSplitTimelineSegments(
      startTime,
      endTime,
      timelineClips.map((clip) => ({
        clipId: clip.clipId,
        sourceId: clip.sourceId,
        start: clip.start,
        end: clip.end,
        frameRate: clip.source.frameRate,
        frameCount: clip.source.frameCount,
        startFrame: clip.startFrame,
        endFrame: clip.endFrame,
      })),
    ));
  };

  const addLastCut = () => {
    const lastRange = queue.at(-1);
    if (!lastRange) {
      setError("Queue đang trống. Hãy thêm một đoạn cắt trước.");
      return;
    }
    const segments = getJoinSplitRangeSegments(lastRange);
    const lastSegment = segments.at(-1)!;
    const source = sourceById.get(lastSegment.sourceId);
    if (!source) {
      setError("Video nguồn của đoạn cuối trong queue không còn khả dụng.");
      return;
    }
    const startFrame = lastSegment.endFrame + 1;
    if (startFrame > source.frameCount) {
      setError("Đoạn cuối trong queue đã tới frame cuối của video.");
      return;
    }
    addRangeToQueue([{ sourceId: source.id, startFrame, endFrame: source.frameCount }]);
  };

  const togglePlayback = async () => {
    if (!timelineClips.length && !selectedSource) return;
    if (isPlaying) {
      if (previewRef.current && !previewRef.current.paused) {
        previewRef.current.pause();
      }
      setIsPlaying(false);
      return;
    }

    if (playhead >= timelineDuration - 1e-4) {
      setPlayhead(0);
      seekGlobal(0);
    }

    const currentClip = timelineClips.find((c) => playhead >= c.start && playhead < c.end);
    if (currentClip) {
      const video = previewRef.current;
      if (video) {
        try {
          const localTime = Math.max(0, playhead - currentClip.start);
          const targetSourceTime = (currentClip.startFrame - 1) / currentClip.source.frameRate + localTime;
          video.currentTime = targetSourceTime;
          await video.play();
          setIsPlaying(true);
        } catch (playError) {
          setError(playError instanceof Error ? playError.message : "Không thể phát video.");
        }
      } else {
        setIsPlaying(true);
      }
    } else {
      // Đang ở trong khoảng trống (gap)
      if (previewRef.current && !previewRef.current.paused) {
        previewRef.current.pause();
      }
      setIsPlaying(true);
    }
  };

  useEffect(() => {
    const container = timelineScrollRef.current;
    if (!container) return;
    const updateWidth = () => setTimelineViewportWidth(container.clientWidth);
    updateWidth();
    const observer = new ResizeObserver(updateWidth);
    observer.observe(container);
    return () => observer.disconnect();
  }, []);

  const exportQueue = async () => {
    if (!queue.length || !referenceSourceId) return;
    queueStopRequestedRef.current = false;
    setExporting(true);
    setError(null);
    setQueueJoinOutput(null);
    setNotice(`Đang xuất 0/${queue.length} queue item…`);
    setQueueExportState(Object.fromEntries(queue.map((range) => [range.id, { status: "pending" as const }])));
    let completed = 0;
    let failed = 0;
    const exportedFiles: JoinSplitVideoExportFile[] = [];
    for (const [queueIndex, range] of queue.entries()) {
      if (queueStopRequestedRef.current) {
        setQueueExportState((current) => ({
          ...current,
          [range.id]: current[range.id]?.status === "pending"
            ? { status: "cancelled", message: "Chưa chạy vì queue đã dừng." }
            : current[range.id],
        }));
        continue;
      }
      setQueueExportState((current) => ({
        ...current,
        [range.id]: { status: "exporting", progress: 0, message: "Đang khởi tạo…" },
      }));
      setNotice(`Đang xuất ${completed + failed + 1}/${queue.length} queue item…`);
      const progressId = crypto.randomUUID();
      currentExportProgressIdRef.current = progressId;
      let shouldPoll = true;
      const progressPoll = (async () => {
        while (shouldPoll) {
          const progressResponse = await fetch(`${API}/export/progress/${encodeURIComponent(progressId)}`);
          if (progressResponse.ok) {
            const progress = await responseJson<{
              status: "running" | "done" | "error" | "cancelled";
              percent: number;
              message: string;
              strategy?: "checking" | "stream-copy" | "encode" | "fallback";
            }>(progressResponse);
            setQueueExportState((current) => ({
              ...current,
              [range.id]: current[range.id]?.status === "exporting"
                ? {
                    ...current[range.id],
                    progress: progress.percent,
                    message: progress.message,
                    strategy: progress.strategy,
                  }
                : current[range.id],
            }));
          } else if (progressResponse.status !== 404) {
            throw new Error(`Không đọc được tiến trình xuất (${progressResponse.status}).`);
          }
          await new Promise((resolve) => window.setTimeout(resolve, 400));
        }
      })().catch((pollError: unknown) => {
        console.error("[JoinSplitVideo] Không thể cập nhật tiến trình xuất:", pollError);
      });
      try {
        const response = await fetch(`${API}/export`, {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            ranges: [range],
            referenceSourceId,
            progressId,
            preferKeyframeCuts,
            queueIndex: queueIndex + 1,
            forceCopy,
          }),
        });
        const result = await responseJson<{ files: JoinSplitVideoExportFile[] }>(response);
        const output = result.files[0];
        if (!output) throw new Error("Không nhận được tệp đầu ra.");
        exportedFiles.push(output);
        setQueueExportState((current) => ({
          ...current,
          [range.id]: {
            ...current[range.id],
            status: "done",
            progress: 100,
            message: current[range.id]?.message || "Đã xuất xong.",
            output,
          },
        }));
        completed += 1;
      } catch (exportError) {
        const message = exportError instanceof Error ? exportError.message : "Không thể xuất video.";
        setQueueExportState((current) => ({
          ...current,
          [range.id]: queueStopRequestedRef.current
            ? { status: "cancelled", message: "Đã dừng theo yêu cầu." }
            : { status: "error", error: message },
        }));
        if (!queueStopRequestedRef.current) failed += 1;
      } finally {
        shouldPoll = false;
        await progressPoll;
        if (currentExportProgressIdRef.current === progressId) currentExportProgressIdRef.current = null;
      }
    }
    setExporting(false);
    if (queueStopRequestedRef.current) {
      setJoining(false);
      setNotice(`Đã dừng queue. Hoàn tất ${completed}/${queue.length} mục; các mục chưa chạy được giữ lại.`);
      return;
    }
    if (failed) {
      setError(`Xuất xong ${completed}/${queue.length} queue item; ${failed} mục bị lỗi. Xem thông tin tại từng mục.`);
      setNotice(null);
      return;
    }

    if (joinQueuesAfterExport && exportedFiles.length > 1) {
      setJoining(true);
      const progressId = crypto.randomUUID();
      currentExportProgressIdRef.current = progressId;
      setQueueJoinProgress({ percent: 0, message: "Đang chuẩn bị ghép queue…" });
      setNotice(`Đã xuất ${completed} queue item. Đang ghép thành một video…`);
      let shouldPoll = true;
      const progressPoll = (async () => {
        while (shouldPoll) {
          const progressResponse = await fetch(`${API}/export/progress/${encodeURIComponent(progressId)}`);
          if (progressResponse.ok) {
            const progress = await responseJson<{
              status: "running" | "done" | "error" | "cancelled";
              percent: number;
              message: string;
            }>(progressResponse);
            setQueueJoinProgress({ percent: progress.percent, message: progress.message });
          } else if (progressResponse.status !== 404) {
            throw new Error(`Không đọc được tiến trình ghép queue (${progressResponse.status}).`);
          }
          await new Promise((resolve) => window.setTimeout(resolve, 400));
        }
      })().catch((pollError: unknown) => {
        console.error("[JoinSplitVideo] Không thể cập nhật tiến trình ghép queue:", pollError);
      });
      try {
        const response = await fetch(`${API}/exports/join`, {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            exportIds: exportedFiles.map((file) => file.id),
            referenceSourceId,
            progressId,
            forceCopy,
          }),
        });
        const result = await responseJson<{ file: JoinSplitVideoExportFile }>(response);
        setQueueJoinOutput(result.file);
        setQueueJoinProgress({ percent: 100, message: "Đã ghép queue xong." });
        setNotice(`Đã xuất và ghép ${completed} queue item thành ${result.file.fileName}.`);
      } catch (joinError) {
        const message = joinError instanceof Error ? joinError.message : "Không thể ghép các video queue.";
        setError(message);
        setQueueJoinProgress((current) => current
          ? { ...current, message: queueStopRequestedRef.current ? "Đã dừng theo yêu cầu." : message }
          : null);
        setNotice(null);
      } finally {
        shouldPoll = false;
        await progressPoll;
        if (currentExportProgressIdRef.current === progressId) currentExportProgressIdRef.current = null;
        setJoining(false);
      }
    } else {
      setNotice(`Đã xuất ${completed} queue item.`);
    }
  };

  const stopQueue = async () => {
    queueStopRequestedRef.current = true;
    setNotice("Đang dừng queue và tác vụ FFmpeg hiện tại…");
    const progressId = currentExportProgressIdRef.current;
    if (!progressId) return;
    try {
      for (let attempt = 0; attempt < 5; attempt += 1) {
        const response = await fetch(`${API}/export/cancel/${encodeURIComponent(progressId)}`, { method: "POST" });
        if (response.ok) return;
        if (response.status !== 409 || attempt === 4) {
          await responseJson<{ success: boolean }>(response);
          return;
        }
        await new Promise((resolve) => window.setTimeout(resolve, 150));
      }
    } catch (stopError) {
      setError(stopError instanceof Error ? stopError.message : "Không thể dừng tác vụ xuất.");
    }
  };

  const cleanSavedData = async () => {
    if (uploadingName || exporting || joining) return;
    const confirmed = window.confirm(
      "Dọn toàn bộ video đã tải lên, video đã xuất và tệp tạm của trang Join/Split? File gốc trên máy tính sẽ không bị xóa.",
    );
    if (!confirmed) return;
    setError(null);
    try {
      await responseJson<{ success: boolean }>(
        await fetch(`${API}/cleanup`, { method: "POST" }),
      );
      skipWorkspaceSaveRef.current = true;
      try {
        window.localStorage.removeItem(WORKSPACE_STORAGE_KEY);
      } catch (storageError) {
        console.error("[JoinSplitVideo] Không thể xóa trạng thái đã lưu:", storageError);
        setError("Đã dọn video nhưng không thể xóa trạng thái trong trình duyệt.");
      }
      previewRef.current?.pause();
      setSources([]);
      setSelectedSourceIds([]);
      setTimelineClipItems([]);
      setActiveClipId(null);
      setActiveSourceId(null);
      setPlayhead(0);
      setCutFromTime(null);
      setCutToTime(null);
      setSplitMarkers([]);
      setSelectedSplitMarker(null);
      setQueue([]);
      setSelectedQueueId(null);
      setQueueExportState({});
      setRangeStatuses([]);
      setReferenceSourceId("");
      setTimelineJoinOutput(null);
      setQueueJoinOutput(null);
      setNotice("Đã dọn video đã tải lên, video đã xuất và tệp tạm.");
    } catch (cleanupError) {
      setError(cleanupError instanceof Error ? cleanupError.message : "Không thể dọn dữ liệu video.");
    }
  };

  const joinTimeline = async () => {
    if (!timelineClipItems.length || !referenceSourceId) return;
    setJoining(true);
    setError(null);
    setNotice("Đang xuất video từ các clip trên timeline (1 lần render)…");
    const segments: JoinSplitVideoSegment[] = timelineClipItems.map((item) => ({
      sourceId: item.sourceId,
      startFrame: item.startFrame,
      endFrame: item.endFrame,
    }));
    try {
      const firstSegment = segments[0];
      const rangeId = crypto.randomUUID();
      const progressId = crypto.randomUUID();
      currentExportProgressIdRef.current = progressId;
      const progressPoll = (async () => {
        while (currentExportProgressIdRef.current === progressId) {
          await new Promise((resolve) => window.setTimeout(resolve, 350));
          if (currentExportProgressIdRef.current !== progressId) break;
          try {
            const progressResponse = await fetch(`${API}/export/progress/${encodeURIComponent(progressId)}`);
            if (progressResponse.ok) {
              const progress = await responseJson<{
                percent?: number;
                message?: string;
                strategy?: "checking" | "stream-copy" | "encode" | "fallback";
              }>(progressResponse);
              setNotice(progress.message ? `[${progress.percent ?? 0}%] ${progress.message}` : "Đang xử lý render video…");
            }
          } catch {}
        }
      })();
      const response = await fetch(`${API}/export`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          ranges: [
            {
              id: rangeId,
              sourceId: firstSegment.sourceId,
              startFrame: firstSegment.startFrame,
              endFrame: segments[segments.length - 1].endFrame,
              segments,
            },
          ],
          referenceSourceId,
          progressId,
          preferKeyframeCuts,
          forceCopy,
        }),
      });
      currentExportProgressIdRef.current = null;
      await progressPoll;
      const result = await responseJson<{ files: JoinSplitVideoExportFile[] }>(response);
      const exportedFile = result.files?.[0];
      if (exportedFile) {
        setTimelineJoinOutput(exportedFile);
        setNotice(`Đã xuất video hoàn chỉnh: ${exportedFile.fileName}.`);
      } else {
        throw new Error("Không nhận được file kết quả sau khi render.");
      }
    } catch (joinError) {
      currentExportProgressIdRef.current = null;
      setError(joinError instanceof Error ? joinError.message : "Không thể xuất video timeline.");
      setNotice(null);
    } finally {
      setJoining(false);
    }
  };

  useEffect(() => {
    if (queue.length === 0 || !referenceSourceId) {
      setRangeStatuses([]);
      return;
    }
    const controller = new AbortController();
    const timer = window.setTimeout(() => {
      void fetch(`${API}/ranges/inspect`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ ranges: queue, referenceSourceId, preferKeyframeCuts }),
        signal: controller.signal,
      })
        .then((response) => responseJson<{ ranges: JoinSplitVideoRangeStatus[] }>(response))
        .then((result) => setRangeStatuses(result.ranges))
        .catch((inspectError: unknown) => {
          if (!controller.signal.aborted) {
            setError(inspectError instanceof Error ? inspectError.message : "Không thể kiểm tra encoding.");
          }
        });
    }, 250);
    return () => {
      window.clearTimeout(timer);
      controller.abort();
    };
  }, [preferKeyframeCuts, queue, referenceSourceId]);

  useEffect(() => {
    if (!timelineClips.length) return;
    const clip = timelineClips.find((item) => playhead >= item.start && playhead < item.end);
    if (clip) {
      if (clip.sourceId !== activeSourceId) setActiveSourceId(clip.sourceId);
      if (clip.clipId !== activeClipId) setActiveClipId(clip.clipId);
    }
  }, [activeClipId, activeSourceId, playhead, timelineClips]);

  useEffect(() => {
    if (!isPlaying) return;
    const clipAtPlayhead = timelineClips.find((c) => playhead >= c.start && playhead < c.end);
    if (clipAtPlayhead) return;

    // Playhead đang ở trong khoảng trống (gap)
    let animationFrameId: number;
    let lastTime = performance.now();

    const step = (now: number) => {
      const dt = (now - lastTime) / 1000;
      lastTime = now;
      const nextTime = playhead + dt;

      if (nextTime >= timelineDuration) {
        setIsPlaying(false);
        setPlayhead(timelineDuration);
        return;
      }

      const enteringClip = timelineClips.find((c) => nextTime >= c.start && nextTime < c.end);
      if (enteringClip) {
        playAfterSourceChangeRef.current = true;
        seekGlobal(enteringClip.start);
      } else {
        setPlayhead(nextTime);
        animationFrameId = requestAnimationFrame(step);
      }
    };

    animationFrameId = requestAnimationFrame(step);
    return () => cancelAnimationFrame(animationFrameId);
  }, [isPlaying, playhead, seekGlobal, timelineClips, timelineDuration]);

  useEffect(() => {
    if (!selectedSource) return;
    const video = previewRef.current;
    if (!video) return;
    const handleLoaded = () => {
      const clip = timelineClips.find((c) => playhead >= c.start && playhead < c.end)
        || (activeClipId && timelineClips.find((c) => c.clipId === activeClipId))
        || timelineClips.find((c) => c.sourceId === selectedSource.id);
      const localTime = clip ? Math.max(0, Math.min(clip.duration, playhead - clip.start)) : 0;
      const targetSourceTime = clip ? (clip.startFrame - 1) / clip.source.frameRate + localTime : 0;
      video.currentTime = Math.max(0, Math.min(targetSourceTime, video.duration || targetSourceTime));
      if (playAfterSourceChangeRef.current) {
        playAfterSourceChangeRef.current = false;
        void video.play().then(() => setIsPlaying(true)).catch((playError: unknown) => {
          setError(playError instanceof Error ? playError.message : "Không thể phát video kế tiếp.");
        });
      }
    };
    video.addEventListener("loadedmetadata", handleLoaded);
    return () => video.removeEventListener("loadedmetadata", handleLoaded);
  }, [activeClipId, playhead, selectedSource, timelineClips]);

  useEffect(() => {
    const container = timelineScrollRef.current;
    if (!container) return;
    const handleWheel = (event: WheelEvent) => {
      if (!event.ctrlKey && !event.altKey) return;
      event.preventDefault();
      event.stopPropagation();
      const bounds = container.getBoundingClientRect();
      const pointerX = event.clientX - bounds.left;
      const currentScroll = container.scrollLeft;
      const anchoredTime = (currentScroll + pointerX) / zoom;
      const nextZoom = Math.max(
        minimumZoom,
        Math.min(
          MAX_ZOOM,
          Math.round(zoom * (event.deltaY < 0 ? ZOOM_STEP : 1 / ZOOM_STEP) * 100) / 100,
        ),
      );
      if (nextZoom === zoom) return;
      setZoom(nextZoom);
      requestAnimationFrame(() => {
        if (timelineScrollRef.current) {
          timelineScrollRef.current.scrollLeft = Math.max(0, anchoredTime * nextZoom - pointerX);
        }
      });
    };
    container.addEventListener("wheel", handleWheel, { passive: false });
    return () => container.removeEventListener("wheel", handleWheel);
  }, [minimumZoom, zoom]);

  const deleteQueueRange = useCallback((rangeId: string) => {
    setQueue((current) => current.filter((item) => item.id !== rangeId));
    setQueueExportState((current) => {
      const next = { ...current };
      delete next[rangeId];
      return next;
    });
    setSelectedQueueId((current) => current === rangeId ? null : current);
  }, []);

  useEffect(() => {
    const handlePointerDown = (event: PointerEvent) => {
      const target = event.target;
      if (!(target instanceof Element) || !target.closest("[data-split-marker]")) {
        setSelectedSplitMarker(null);
      }
    };
    document.addEventListener("pointerdown", handlePointerDown);
    return () => document.removeEventListener("pointerdown", handlePointerDown);
  }, []);

  useEffect(() => {
    const handleKeyDown = (event: KeyboardEvent) => {
      const target = event.target;
      const isSplitMarkerButton = target instanceof HTMLElement &&
        target.closest("[data-split-marker]") !== null;
      if (
        target instanceof HTMLElement &&
        (target.isContentEditable ||
          (["INPUT", "TEXTAREA", "SELECT", "BUTTON"].includes(target.tagName) && !isSplitMarkerButton))
      ) return;
      if ((event.key === "Delete" || event.key === "Backspace") && selectedSplitMarker !== null) {
        event.preventDefault();
        setSplitMarkers((current) => current.filter((time) => Math.abs(time - selectedSplitMarker) >= 1e-6));
        setSelectedSplitMarker(null);
        setNotice(`Đã xóa mốc split tại ${formatTime(selectedSplitMarker)}.`);
        return;
      }
      if (event.key === "Delete" && selectedQueueId) {
        event.preventDefault();
        deleteQueueRange(selectedQueueId);
        return;
      }
      if ((event.key === "Delete" || event.key === "Backspace") && activeClipId) {
        event.preventDefault();
        removeTimelineClip(activeClipId);
        setSelectedQueueId(null);
        return;
      }
      if (event.key === "Delete" && activeSourceId && timelineSourceIds.includes(activeSourceId)) {
        event.preventDefault();
        removeTimelineSource(activeSourceId);
        setSelectedQueueId(null);
        return;
      }
      const step = event.shiftKey ? 10 : 1;
      if (event.code === "Space") {
        if (!selectedSource) return;
        event.preventDefault();
        void togglePlayback();
      } else if (event.key === "ArrowLeft" || event.key === "ArrowRight") {
        if (!selectedSource) return;
        event.preventDefault();
        seekFrame(currentFrame + (event.key === "ArrowLeft" ? -step : step));
      } else if (event.key === "Home") {
        if (!timelineClips.length) return;
        event.preventDefault();
        seekTimelineStart();
      } else if (event.key === "End") {
        if (!timelineClips.length) return;
        event.preventDefault();
        seekTimelineEnd();
      } else if (event.key.toLowerCase() === "s" && !event.ctrlKey && !event.metaKey && !event.altKey) {
        event.preventDefault();
        splitClipAtPlayhead();
      } else if (event.key.toLowerCase() === "c" && !event.ctrlKey && !event.metaKey && !event.altKey) {
        event.preventDefault();
        splitClipAtPlayhead();
      } else if (event.key.toLowerCase() === "z" && event.shiftKey) {
        event.preventDefault();
        fitTimeline();
      } else if (event.key === "+" || event.key === "=") {
        event.preventDefault();
        setZoom((current) => Math.min(MAX_ZOOM, Math.round(current * ZOOM_STEP * 100) / 100));
      } else if (event.key === "-") {
        event.preventDefault();
        setZoom((current) => Math.max(minimumZoom, Math.round(current / ZOOM_STEP * 100) / 100));
      }
    };
    window.addEventListener("keydown", handleKeyDown);
    return () => window.removeEventListener("keydown", handleKeyDown);
  }, [activeClipId, activeSourceId, currentFrame, deleteQueueRange, fitTimeline, minimumZoom, removeTimelineClip, removeTimelineSource, selectedQueueId, selectedSource, selectedSplitMarker, seekFrame, splitClipAtPlayhead, timelineClips.length, timelineSourceIds]);

  useEffect(() => {
    const onPointerMove = (event: PointerEvent) => {
      if (!timelineContentRef.current) return;
      const bounds = timelineContentRef.current.getBoundingClientRect();
      const requestedTime = (event.clientX - bounds.left) / zoom;
      const drag = queueCueDragRef.current;
      if (drag) {
        const timelineEnd = timelineDuration;
        const duration = drag.initialEnd - drag.initialStart;
        const pointerDelta = requestedTime - drag.initialPointerTime;
        let start = drag.initialStart;
        let end = drag.initialEnd;
        if (drag.mode === "move") {
          const requestedStart = drag.initialStart + pointerDelta;
          const requestedEnd = drag.initialEnd + pointerDelta;
          const snappedStart = snapCueEdgeTime(requestedStart);
          const snappedEnd = snapCueEdgeTime(requestedEnd);
          const startAdjustment = Math.abs(snappedStart - requestedStart);
          const endAdjustment = Math.abs(snappedEnd - requestedEnd);
          const threshold = snapDistancePx / zoom;
          if (startAdjustment <= threshold && startAdjustment <= endAdjustment) {
            start = snappedStart;
          } else if (endAdjustment <= threshold) {
            start = snappedEnd - duration;
          } else {
            start = snapPlayheadTime(requestedStart);
          }
          start = Math.max(0, Math.min(timelineEnd - duration, start));
          end = start + duration;
        } else if (drag.mode === "start") {
          start = Math.max(0, Math.min(drag.initialEnd - 1 / 240, snapCueEdgeTime(requestedTime)));
        } else {
          end = Math.max(drag.initialStart + 1 / 240, Math.min(timelineEnd, snapCueEdgeTime(requestedTime)));
        }
        const segments = getJoinSplitTimelineSegments(
          start,
          Math.max(start, end - 1e-7),
          timelineClips.map((clip) => ({
            clipId: clip.clipId,
            sourceId: clip.sourceId,
            start: clip.start,
            end: clip.end,
            frameRate: clip.source.frameRate,
            frameCount: clip.source.frameCount,
            startFrame: clip.startFrame,
            endFrame: clip.endFrame,
          })),
        );
        if (segments.length) {
          setQueue((current) => current.map((range) => range.id === drag.rangeId
            ? {
                ...range,
                sourceId: segments[0].sourceId,
                startFrame: segments[0].startFrame,
                endFrame: segments[0].endFrame,
                ...(segments.length > 1 ? { segments } : { segments: undefined }),
              }
            : range));
        }
      } else if (isScrubbingRef.current) {
        seekGlobal(requestedTime);
      }
    };
    const onPointerUp = () => {
      isScrubbingRef.current = false;
      queueCueDragRef.current = null;
    };
    window.addEventListener("pointermove", onPointerMove);
    window.addEventListener("pointerup", onPointerUp);
    return () => {
      window.removeEventListener("pointermove", onPointerMove);
      window.removeEventListener("pointerup", onPointerUp);
    };
  }, [seekGlobal, snapCueEdgeTime, snapDistancePx, snapPlayheadTime, timelineClips, timelineDuration, zoom]);

  const [draggedClipId, setDraggedClipId] = useState<string | null>(null);
  const [dropTargetClipId, setDropTargetClipId] = useState<string | null>(null);
  const [dropPosition, setDropPosition] = useState<"before" | "after" | null>(null);

  const reorderTimelineClips = (sourceId: string, targetId: string, position: "before" | "after") => {
    if (sourceId === targetId) return;
    const fromIndex = timelineClipItems.findIndex((c) => c.id === sourceId);
    const toIndex = timelineClipItems.findIndex((c) => c.id === targetId);
    if (fromIndex < 0 || toIndex < 0) return;
    const nextItems = [...timelineClipItems];
    const [moved] = nextItems.splice(fromIndex, 1);
    const destinationIndex = position === "before"
      ? (fromIndex < toIndex ? toIndex - 1 : toIndex)
      : (fromIndex < toIndex ? toIndex : toIndex + 1);
    const cleanMoved = magnetEnabled ? { ...moved, offsetSeconds: undefined } : moved;
    nextItems.splice(Math.max(0, Math.min(nextItems.length, destinationIndex)), 0, cleanMoved);
    setTimelineClipItems(nextItems);
    setActiveClipId(moved.id);
    setActiveSourceId(moved.sourceId);
    setNotice("Đã đổi thứ tự clip trên timeline.");
  };

  const handleDropOnTimeline = (event: DragEvent<HTMLDivElement>) => {
    event.preventDefault();
    setIsDropTarget(false);
    const clipPayload = event.dataTransfer.getData("application/x-join-split-clip");
    if (clipPayload) {
      if (dropTargetClipId && dropPosition) {
        reorderTimelineClips(clipPayload, dropTargetClipId, dropPosition);
      }
      setDraggedClipId(null);
      setDropTargetClipId(null);
      setDropPosition(null);
      return;
    }
    const payload = event.dataTransfer.getData("application/x-join-split-video");
    if (payload) {
      try {
        appendToTimeline(JSON.parse(payload) as string[]);
        return;
      } catch {
        setError("Không đọc được danh sách video kéo vào timeline.");
      }
    }
    if (event.dataTransfer.files.length) void uploadFiles(event.dataTransfer.files);
  };

  const rulerFrameMode = timelineClips.some(
    (clip) => zoom / clip.source.frameRate >= FRAME_TICK_LABEL_SPACING_PX,
  );
  const rulerTicks = useMemo(() => {
    const visibleStart = Math.max(0, timelineScrollLeft / zoom);
    const visibleEnd = (timelineScrollLeft + timelineViewportWidth) / zoom;
    if (rulerFrameMode) {
      return timelineClips.flatMap((clip) => {
        if (clip.end < visibleStart || clip.start > visibleEnd) return [];
        const framePixelWidth = zoom / clip.source.frameRate;
        const frameStep = Math.max(1, Math.ceil(FRAME_TICK_LABEL_SPACING_PX / framePixelWidth));
        const firstFrame = Math.max(
          1,
          Math.floor((visibleStart - clip.start) * clip.source.frameRate) + 1,
        );
        const lastFrame = Math.min(
          clip.source.frameCount,
          Math.ceil((visibleEnd - clip.start) * clip.source.frameRate) + 1,
        );
        const alignedFirst = Math.ceil(firstFrame / frameStep) * frameStep;
        const ticks: Array<{ key: string; left: number; label: string }> = [];
        for (let frame = alignedFirst; frame <= lastFrame; frame += frameStep) {
          ticks.push({
            key: `${clip.sourceId}-${frame}`,
            left: (clip.start + frameTime(frame, clip.source.frameRate)) * zoom,
            label: `F${frame}`,
          });
        }
        return ticks;
      });
    }

    const intervalSeconds = getTimeTickInterval(zoom);
    const firstTick = Math.ceil(visibleStart / intervalSeconds) * intervalSeconds;
    const ticks: Array<{ key: string; left: number; label: string }> = [];
    for (let seconds = firstTick; seconds <= visibleEnd; seconds += intervalSeconds) {
      ticks.push({
        key: `time-${seconds}`,
        left: seconds * zoom,
        label: formatTime(seconds),
      });
    }
    return ticks;
  }, [timelineClips, timelineScrollLeft, timelineViewportWidth, zoom, rulerFrameMode]);

  const beginSourceSelection = (event: ReactPointerEvent<HTMLDivElement>) => {
    if (
      event.button !== 0 ||
      (event.target as HTMLElement).closest("[data-source-row], button")
    ) return;
    event.preventDefault();
    const container = event.currentTarget;
    const bounds = container.getBoundingClientRect();
    const additive = event.ctrlKey || event.metaKey;
    selectionDragRef.current = {
      startClientX: event.clientX,
      startClientY: event.clientY,
      currentClientX: event.clientX,
      currentClientY: event.clientY,
      initialSelectedIds: additive ? selectedSourceIds : [],
      additive,
    };
    setSelectionRectangle({
      startX: event.clientX - bounds.left,
      startY: event.clientY - bounds.top + container.scrollTop,
      currentX: event.clientX - bounds.left,
      currentY: event.clientY - bounds.top + container.scrollTop,
    });
    if (!additive) setSelectedSourceIds([]);
    container.setPointerCapture(event.pointerId);
  };

  const updateSourceSelection = (event: ReactPointerEvent<HTMLDivElement>) => {
    const drag = selectionDragRef.current;
    if (!drag) return;
    drag.currentClientX = event.clientX;
    drag.currentClientY = event.clientY;
    const container = event.currentTarget;
    const bounds = container.getBoundingClientRect();
    const left = Math.min(drag.startClientX, event.clientX);
    const right = Math.max(drag.startClientX, event.clientX);
    const top = Math.min(drag.startClientY, event.clientY);
    const bottom = Math.max(drag.startClientY, event.clientY);
    setSelectionRectangle({
      startX: drag.startClientX - bounds.left,
      startY: drag.startClientY - bounds.top + container.scrollTop,
      currentX: event.clientX - bounds.left,
      currentY: event.clientY - bounds.top + container.scrollTop,
    });
    if (right - left < 3 && bottom - top < 3) return;

    const selectedIds = Array.from(
      container.querySelectorAll<HTMLElement>("[data-source-row]"),
    )
      .filter((row) => {
        const rowBounds = row.getBoundingClientRect();
        return (
          rowBounds.right >= left &&
          rowBounds.left <= right &&
          rowBounds.bottom >= top &&
          rowBounds.top <= bottom
        );
      })
      .map((row) => row.dataset.sourceId)
      .filter((id): id is string => Boolean(id));
    setSelectedSourceIds(
      drag.additive
        ? [...new Set([...drag.initialSelectedIds, ...selectedIds])]
        : selectedIds,
    );
  };

  const finishSourceSelection = (event: ReactPointerEvent<HTMLDivElement>) => {
    const drag = selectionDragRef.current;
    if (!drag) return;
    const moved =
      Math.abs(event.clientX - drag.startClientX) > 3 ||
      Math.abs(event.clientY - drag.startClientY) > 3;
    if (!moved && !drag.additive) setSelectedSourceIds([]);
    selectionDragRef.current = null;
    setSelectionRectangle(null);
  };

  const queueStatusById = useMemo(
    () => new Map(rangeStatuses.map((status) => [status.id, status])),
    [rangeStatuses],
  );
  const selectedQueueRange = queue.find((range) => range.id === selectedQueueId);
  const selectedQueueSegments = selectedQueueRange
    ? getJoinSplitRangeSegments(selectedQueueRange)
    : [];
  const selectedQueueBounds = getJoinSplitRangeTimelineBounds(
    selectedQueueSegments,
    timelineClips.map((clip) => ({
      clipId: clip.clipId,
      sourceId: clip.sourceId,
      start: clip.start,
      end: clip.end,
      frameRate: clip.source.frameRate,
      frameCount: clip.source.frameCount,
      startFrame: clip.startFrame,
      endFrame: clip.endFrame,
    })),
  );
  const addQueueBesideSelected = (direction: "before" | "after") => {
    if (!selectedQueueRange || !selectedQueueBounds || !timelineClips.length) return;
    const rawStart = direction === "before"
      ? Math.max(0, selectedQueueBounds.start - 5)
      : selectedQueueBounds.end;
    const rawEnd = direction === "before"
      ? selectedQueueBounds.start
      : Math.min(timelineDuration, selectedQueueBounds.end + 5);
    if (rawEnd <= rawStart) {
      setError(direction === "before"
        ? "Không còn khoảng trống trước cue đã chọn."
        : "Không còn khoảng trống sau cue đã chọn.");
      return;
    }
    const segments = getJoinSplitTimelineSegments(
      rawStart,
      Math.max(rawStart, rawEnd - 1e-7),
      timelineClips.map((clip) => ({
        clipId: clip.clipId,
        sourceId: clip.sourceId,
        start: clip.start,
        end: clip.end,
        frameRate: clip.source.frameRate,
        frameCount: clip.source.frameCount,
        startFrame: clip.startFrame,
        endFrame: clip.endFrame,
      })),
    );
    if (!segments.length) {
      setError("Không thể tạo queue cue trong khoảng đã chọn.");
      return;
    }
    const first = segments[0];
    const last = segments[segments.length - 1];
    const newRange: JoinSplitVideoRange = {
      id: crypto.randomUUID(),
      sourceId: first.sourceId,
      startFrame: first.startFrame,
      endFrame: first.endFrame,
      ...(segments.length > 1 ? { segments } : {}),
    };
    setQueue((current) => {
      const selectedIndex = current.findIndex((range) => range.id === selectedQueueRange.id);
      if (selectedIndex < 0) return [...current, newRange];
      const insertAt = direction === "before" ? selectedIndex : selectedIndex + 1;
      return [...current.slice(0, insertAt), newRange, ...current.slice(insertAt)];
    });
    setSelectedQueueId(newRange.id);
    setError(null);
    setNotice(`Đã tạo queue cue ${direction === "before" ? "trước" : "sau"} · ${first.startFrame}–${last.endFrame}.`);
  };

  return (
    <div
      className="flex h-full min-h-0 w-full overflow-hidden bg-slate-950 text-slate-100"
      onClick={(event) => {
        if (!(event.target as HTMLElement).closest("[data-queue-cue], [data-queue-item]")) {
          setSelectedQueueId(null);
        }
      }}
    >
      <aside
        className={`flex w-[405px] shrink-0 flex-col border-r border-slate-800 bg-slate-900/90 ${isDropTarget ? "ring-2 ring-inset ring-amber-400" : ""}`}
        onDragOver={(event) => {
          event.preventDefault();
          setIsDropTarget(true);
        }}
        onDragLeave={(event) => {
          if (!event.currentTarget.contains(event.relatedTarget as Node | null)) setIsDropTarget(false);
        }}
        onDrop={(event) => {
          event.preventDefault();
          setIsDropTarget(false);
          if (event.dataTransfer.files.length) void uploadFiles(event.dataTransfer.files);
        }}
      >
        <div className="flex min-h-0 flex-1 flex-col">
        <div className="flex items-center justify-between border-b border-slate-800 px-3 py-3">
          <div className="flex items-center gap-2">
            <FolderOpen className="h-4 w-4 text-amber-300" />
            <h2 className="text-sm font-semibold">Input Video</h2>
          </div>
          <div className="flex items-center gap-1.5">
            <button
              type="button"
              onClick={cleanSavedData}
              disabled={Boolean(uploadingName) || exporting || joining}
              className="rounded-md border border-slate-700 p-1.5 text-slate-300 hover:border-rose-400/50 hover:text-rose-200 disabled:opacity-40"
              title="Dọn video đã lưu và cache"
              aria-label="Dọn video đã lưu và cache"
            >
              <Trash2 className="h-4 w-4" />
            </button>
            <button
              type="button"
              onClick={() => fileInputRef.current?.click()}
              disabled={Boolean(uploadingName) || exporting || joining}
              className="rounded-md border border-slate-700 p-1.5 text-slate-300 hover:border-amber-400/50 hover:text-white disabled:opacity-40"
              title="Thêm video"
              aria-label="Thêm video"
            >
              <Plus className="h-4 w-4" />
            </button>
          </div>
        </div>
        <div className="flex items-center justify-between gap-2 border-b border-slate-800 px-3 py-2 text-[10px] text-slate-500">
          <span>{sources.length} video · Ctrl/⌘ + click để chọn nhiều</span>
          {selectedSourceIds.length > 0 && (
            <button type="button" onClick={() => appendToTimeline(selectedSourceIds)} className="font-semibold text-amber-300 hover:text-amber-200">
              Thêm vào timeline
            </button>
          )}
        </div>
        <div
          ref={sourceListRef}
          className="relative min-h-0 flex-1 overflow-y-auto p-1.5"
          onPointerDown={beginSourceSelection}
          onPointerMove={updateSourceSelection}
          onPointerUp={finishSourceSelection}
          onPointerCancel={finishSourceSelection}
        >
          {selectionRectangle && (
            <div
              className="pointer-events-none absolute z-20 border border-sky-300 bg-sky-400/20"
              style={{
                left: Math.min(selectionRectangle.startX, selectionRectangle.currentX),
                top: Math.min(selectionRectangle.startY, selectionRectangle.currentY),
                width: Math.abs(selectionRectangle.currentX - selectionRectangle.startX),
                height: Math.abs(selectionRectangle.currentY - selectionRectangle.startY),
              }}
            />
          )}
          {!sources.length && !uploadingName && (
            <button
              type="button"
              onClick={() => fileInputRef.current?.click()}
              className="flex h-36 w-full flex-col items-center justify-center gap-2 rounded-lg border border-dashed border-slate-700 text-xs text-slate-500 hover:border-amber-400/50 hover:text-slate-300"
            >
              <Video className="h-6 w-6" />
              Thả video vào đây hoặc bấm để chọn
            </button>
          )}
          {sources.map((source) => {
            const selected = selectedSourceIds.includes(source.id);
            return (
              <div
                key={source.id}
                data-source-row
                data-source-id={source.id}
                draggable
                onDragStart={(event) => {
                  const ids = selectedSourceIds.includes(source.id) ? selectedSourceIds : [source.id];
                  setSelectedSourceIds(ids);
                  event.dataTransfer.effectAllowed = "copy";
                  event.dataTransfer.setData("application/x-join-split-video", JSON.stringify(ids));
                  event.dataTransfer.setData("text/plain", source.fileName);
                }}
                onClick={(event) => selectSource(source.id, event)}
                className={`group flex cursor-grab items-center gap-2 rounded-md px-2 py-2 text-xs active:cursor-grabbing ${selected ? "bg-amber-400/15 text-amber-100 ring-1 ring-inset ring-amber-300/40" : "text-slate-300 hover:bg-slate-800"}`}
                title={`${source.fileName} · kéo vào timeline`}
              >
                <Film className="h-4 w-4 shrink-0 text-slate-400" />
                <span className="min-w-0 flex-1 truncate">{source.fileName}</span>
                <button
                  type="button"
                  aria-label={`Xóa ${source.fileName}`}
                  title="Xóa video"
                  onClick={(event) => {
                    event.stopPropagation();
                    void removeSource(source.id);
                  }}
                  disabled={Boolean(uploadingName) || exporting || joining}
                  className="rounded p-1 text-slate-500 opacity-0 hover:bg-rose-950/50 hover:text-rose-300 group-hover:opacity-100 disabled:cursor-not-allowed disabled:opacity-30"
                >
                  <X className="h-3.5 w-3.5" />
                </button>
              </div>
            );
          })}
          {uploadJobs.map((job) => (
            <div key={job.id} className="rounded-md px-2 py-2 text-xs">
              <div className="flex items-center gap-2">
                {job.status === "error"
                  ? <X className="h-4 w-4 shrink-0 text-rose-300" />
                  : <LoaderCircle className="h-4 w-4 shrink-0 animate-spin text-amber-300" />}
                <span className="min-w-0 flex-1 truncate text-slate-200" title={job.fileName}>{job.fileName}</span>
                <span className={job.status === "error" ? "text-rose-300" : "text-amber-200"}>
                  {job.status === "error" ? "Lỗi" : `${job.percent}%`}
                </span>
              </div>
              <div
                className="ml-6 mt-1.5 h-1 overflow-hidden rounded-full bg-slate-700"
                role="progressbar"
                aria-label={`Tiến trình xử lý ${job.fileName}`}
                aria-valuemin={0}
                aria-valuemax={100}
                aria-valuenow={job.percent}
              >
                <div
                  className={`h-full rounded-full transition-[width] ${job.status === "error" ? "bg-rose-400" : "bg-amber-400"}`}
                  style={{ width: `${job.percent}%` }}
                />
              </div>
              <p className={`ml-6 mt-1 truncate ${job.status === "error" ? "text-rose-300" : "text-slate-500"}`} title={job.error || job.stage}>
                {job.error || job.stage}
              </p>
            </div>
          ))}
        </div>
        <div className="border-t border-slate-800 px-3 py-2 text-[10px] text-slate-500">
          Kéo video vào timeline để xếp liền nhau.
        </div>
        </div>
        <div ref={setQueuePanelHost} className="min-h-0 flex-1 border-t border-slate-700 bg-slate-900/70" />
        <input
          ref={fileInputRef}
          type="file"
          accept="video/*,.mkv,.avi,.m4v"
          multiple
          className="hidden"
          onChange={(event) => {
            if (event.currentTarget.files) void uploadFiles(event.currentTarget.files);
            event.currentTarget.value = "";
          }}
        />
      </aside>

      <section className="flex min-w-0 flex-1 flex-col">
        <div className="flex min-h-0 flex-1 flex-col border-b border-slate-800 bg-black">
          <div className="flex h-9 shrink-0 items-center justify-between border-b border-slate-800 bg-slate-900 px-3">
            <div className="flex min-w-0 items-center gap-2 text-xs">
              <Video className="h-4 w-4 text-sky-300" />
              <span className="font-semibold">Preview</span>
              <span className="max-w-[35vw] truncate text-slate-400">{selectedSource?.fileName || "Chọn video để preview"}</span>
            </div>
            {timelineClips.length > 0 ? (
              <span className="font-mono text-[11px] text-slate-300">
                {isInGap ? (
                  <>Khoảng trống · {formatTime(playhead)} / {formatTime(timelineDuration)}</>
                ) : (
                  <>{currentFrame}/{selectedSource?.frameCount || 0} · {formatTime(playhead)} / {formatTime(timelineDuration)}</>
                )}
              </span>
            ) : selectedSource ? (
              <span className="font-mono text-[11px] text-slate-300">
                {currentFrame}/{selectedSource.frameCount} · {formatTime(playhead)}
              </span>
            ) : null}
          </div>
          <div className="relative flex min-h-0 flex-1 items-center justify-center overflow-hidden bg-black">
            {isInGap ? (
              <div className="flex h-full w-full items-center justify-center bg-black">
                <span className="font-mono text-xs text-slate-600 select-none">[Khoảng trống - Màn hình đen]</span>
              </div>
            ) : selectedSource ? (
              <video
                ref={previewRef}
                key={selectedSource.id}
                src={`${API}/files/${encodeURIComponent(selectedSource.id)}/preview`}
                muted={muted}
                playsInline
                preload="metadata"
                onLoadedMetadata={(event) => {
                  const clip = timelineClips.find((c) => playhead >= c.start && playhead < c.end)
                    || (activeClipId && timelineClips.find((c) => c.clipId === activeClipId))
                    || timelineClips.find((c) => c.sourceId === selectedSource.id);
                  const localTime = clip ? Math.max(0, Math.min(clip.duration, playhead - clip.start)) : 0;
                  const targetSourceTime = clip ? (clip.startFrame - 1) / clip.source.frameRate + localTime : 0;
                  event.currentTarget.currentTime = Math.min(targetSourceTime, event.currentTarget.duration || targetSourceTime);
                  if (playAfterSourceChangeRef.current) {
                    playAfterSourceChangeRef.current = false;
                    void event.currentTarget.play().then(() => setIsPlaying(true)).catch(() => setIsPlaying(false));
                  }
                }}
                onTimeUpdate={(event) => {
                  if (!timelineClips.length) {
                    setPlayhead(event.currentTarget.currentTime);
                    return;
                  }
                  const clip = timelineClips.find((c) => playhead >= c.start && playhead < c.end)
                    || (activeClipId && timelineClips.find((c) => c.clipId === activeClipId))
                    || timelineClips[0];
                  if (!clip) return;
                  const currentSourceTime = event.currentTarget.currentTime;
                  const sourceStartTime = (clip.startFrame - 1) / clip.source.frameRate;
                  const sourceEndTime = clip.endFrame / clip.source.frameRate;

                  // Kiểm tra đã phát tới cuối đoạn cắt hiện tại của clip chưa
                  if (currentSourceTime >= sourceEndTime - 0.005) {
                    const nextTime = clip.end;
                    if (nextTime >= timelineDuration - 1e-4) {
                      event.currentTarget.pause();
                      setIsPlaying(false);
                      setPlayhead(timelineDuration);
                      return;
                    }

                    const nextClip = timelineClips.find((c) => nextTime >= c.start && nextTime < c.end);
                    if (nextClip) {
                      // Có clip tiếp theo liền kề
                      if (nextClip.sourceId === clip.sourceId) {
                        // Cùng video nguồn: chỉ cần tua trực tiếp không làm pause video
                        const targetSourceTime = (nextClip.startFrame - 1) / nextClip.source.frameRate;
                        event.currentTarget.currentTime = Math.max(0, targetSourceTime);
                        setActiveClipId(nextClip.clipId);
                        setPlayhead(nextClip.start);
                        if (event.currentTarget.paused) {
                          void event.currentTarget.play().catch(() => {});
                        }
                      } else {
                        // Khác video nguồn: cần chuyển source và tiếp tục play
                        playAfterSourceChangeRef.current = true;
                        seekGlobal(nextClip.start);
                      }
                    } else {
                      // Đi vào khoảng trống (gap / màn hình đen)
                      transitioningToGapRef.current = true;
                      event.currentTarget.pause();
                      setPlayhead(nextTime);
                    }
                    return;
                  }

                  const elapsed = Math.max(0, Math.min(clip.duration, currentSourceTime - sourceStartTime));
                  setPlayhead(snapPlayheadTime(clip.start + elapsed, false));
                }}
                onPlay={() => setIsPlaying(true)}
                onPause={() => {
                  if (transitioningToGapRef.current) {
                    transitioningToGapRef.current = false;
                    return;
                  }
                  setIsPlaying(false);
                }}
                onEnded={(event) => {
                  const currentClip = (activeClipId && timelineClips.find((c) => c.clipId === activeClipId))
                    || timelineClips.find((c) => playhead >= c.start && playhead < c.end);
                  if (currentClip) {
                    const nextTime = currentClip.end;
                    if (nextTime >= timelineDuration - 1e-4) {
                      setIsPlaying(false);
                      setPlayhead(timelineDuration);
                    } else {
                      const nextClip = timelineClips.find((c) => nextTime >= c.start && nextTime < c.end);
                      if (nextClip) {
                        if (nextClip.sourceId === currentClip.sourceId) {
                          const targetSourceTime = (nextClip.startFrame - 1) / nextClip.source.frameRate;
                          event.currentTarget.currentTime = Math.max(0, targetSourceTime);
                          setActiveClipId(nextClip.clipId);
                          setPlayhead(nextClip.start);
                          void event.currentTarget.play().catch(() => {});
                        } else {
                          playAfterSourceChangeRef.current = true;
                          seekGlobal(nextClip.start);
                        }
                      } else {
                        transitioningToGapRef.current = true;
                        setPlayhead(nextTime);
                      }
                    }
                  } else {
                    setIsPlaying(false);
                  }
                }}
                onError={() => setError("Không thể preview video này bằng trình duyệt.")}
                className="max-h-full max-w-full object-contain"
              />
            ) : (
              <div className="flex flex-col items-center gap-2 text-sm text-slate-500">
                <Film className="h-9 w-9" />
                Thêm video để bắt đầu
              </div>
            )}
          </div>
          <div className="flex shrink-0 items-center gap-3 border-t border-slate-800 bg-slate-900 px-3 py-2">
            <button
              type="button"
              onClick={() => void togglePlayback()}
              disabled={!selectedSource}
              className="rounded-md bg-sky-500 p-1.5 text-white hover:bg-sky-400 disabled:opacity-40"
              aria-label={isPlaying ? "Tạm dừng" : "Phát"}
              title={isPlaying ? "Tạm dừng (Space)" : "Phát (Space)"}
            >
              {isPlaying ? <Pause className="h-4 w-4" /> : <Play className="h-4 w-4" />}
            </button>
            <button type="button" onClick={() => seekFrame(currentFrame - 1)} disabled={!selectedSource} className="rounded border border-slate-700 px-2 py-1 text-xs disabled:opacity-40" title="Frame trước (←)">← Frame</button>
            <button type="button" onClick={() => seekFrame(currentFrame + 1)} disabled={!selectedSource} className="rounded border border-slate-700 px-2 py-1 text-xs disabled:opacity-40" title="Frame sau (→)">Frame →</button>
            <input
              aria-label="Tua preview video"
              type="range"
              min={0}
              max={timelineClips.length > 0 ? timelineDuration : selectedSource?.durationSeconds || 1}
              step={selectedSource ? 1 / selectedSource.frameRate : 0.04}
              value={timelineClips.length > 0 ? Math.min(playhead, timelineDuration) : localPlayhead}
              onChange={(event) => timelineClips.length > 0 ? seekGlobal(Number(event.target.value)) : seekFrame(Math.round(Number(event.target.value) * (selectedSource?.frameRate || 1)) + 1)}
              className="min-w-0 flex-1 accent-sky-400"
            />
            <span className="min-w-28 text-right font-mono text-[10px] text-slate-400">
              {timelineClips.length > 0 ? `${formatTime(playhead)} / ${formatTime(timelineDuration)}` : formatTime(localPlayhead)}
            </span>
            <button type="button" onClick={() => setMuted((value) => !value)} className="rounded-md border border-slate-700 p-1.5 text-slate-300 hover:text-white" aria-label={muted ? "Bật tiếng" : "Tắt tiếng"} title={muted ? "Bật tiếng" : "Tắt tiếng"}>
              {muted || volume === 0 ? <VolumeX className="h-4 w-4" /> : <Volume2 className="h-4 w-4" />}
            </button>
            <input
              type="range"
              min={0}
              max={1}
              step={0.01}
              value={volume}
              onChange={(event) => {
                const nextVolume = Number(event.target.value);
                setVolume(nextVolume);
                if (previewRef.current) previewRef.current.volume = nextVolume;
              }}
              className="w-20 accent-sky-400"
              aria-label="Âm lượng preview"
              title={`Âm lượng ${Math.round(volume * 100)}%`}
            />
            <span className="w-8 text-right font-mono text-[9px] text-slate-500">{Math.round(volume * 100)}%</span>
          </div>
        </div>

        <div className="flex min-h-[220px] flex-[0_0_38%] flex-col border-b border-slate-800 bg-slate-950">
          <div className="flex shrink-0 flex-wrap items-center justify-between gap-2 border-b border-slate-800 bg-slate-900/90 px-3 py-2">
            <div className="flex flex-wrap items-center gap-1.5">
              <button
                type="button"
                onClick={() => {
                  const nextState = !magnetEnabled;
                  setMagnetEnabled(nextState);
                  if (nextState) {
                    setTimelineClipItems((items) => items.map((item) => ({ ...item, offsetSeconds: undefined })));
                    setNotice("Đã bật chế độ Magnet: các clip tự động hút sát nhau, không để lại khoảng trống.");
                  } else {
                    setTimelineClipItems((items) => items.map((item) => {
                      const clip = timelineClips.find((c) => c.clipId === item.id);
                      return { ...item, offsetSeconds: clip ? clip.start : item.offsetSeconds };
                    }));
                    setNotice("Đã tắt chế độ Magnet: các khoảng trống được giữ nguyên.");
                  }
                }}
                className={`inline-flex items-center gap-1 rounded border px-2 py-1 text-[11px] font-semibold transition-colors ${
                  magnetEnabled
                    ? "border-amber-400/60 bg-amber-400/20 text-amber-200 hover:bg-amber-400/30"
                    : "border-slate-700 bg-slate-800/40 text-slate-400 hover:text-slate-200"
                }`}
                title={magnetEnabled ? "Magnet đang BẬT: xóa clip sẽ tự động kéo các video sau hút vào trước (Click để tắt)" : "Magnet đang TẮT: xóa clip sẽ giữ nguyên vị trí tạo khoảng trống màn hình đen (Click để bật)"}
              >
                <Magnet className={`h-3 w-3 ${magnetEnabled ? "text-amber-400" : "text-slate-400"}`} />
                Magnet
              </button>
              <button
                type="button"
                onClick={splitClipAtPlayhead}
                disabled={!timelineClips.length}
                title={`Cắt đôi clip tại vị trí playhead ${formatTime(playhead)} (Phím C hoặc S)`}
                className="inline-flex items-center gap-1 rounded bg-amber-400 px-2.5 py-1 text-[11px] font-bold text-slate-950 hover:bg-amber-300 disabled:opacity-40"
              >
                <Scissors className="h-3 w-3" />
                Cắt clip (C)
              </button>
              <button
                type="button"
                onClick={() => activeClipId && handleMoveClipOffset(activeClipId, -1)}
                disabled={!activeClipId || timelineClipItems.findIndex((c) => c.id === activeClipId) === 0}
                title="Di chuyển clip sang trái (Hoán đổi với clip trước)"
                className="inline-flex items-center gap-1 rounded border border-sky-500/50 bg-sky-950/30 px-2 py-1 text-[11px] font-semibold text-sky-200 hover:bg-sky-900/50 disabled:opacity-40"
              >
                <MoveLeft className="h-3 w-3" />
                Dịch trái
              </button>
              <button
                type="button"
                onClick={() => activeClipId && handleMoveClipOffset(activeClipId, 1)}
                disabled={!activeClipId || timelineClipItems.findIndex((c) => c.id === activeClipId) === timelineClipItems.length - 1}
                title="Di chuyển clip sang phải (Hoán đổi với clip sau)"
                className="inline-flex items-center gap-1 rounded border border-sky-500/50 bg-sky-950/30 px-2 py-1 text-[11px] font-semibold text-sky-200 hover:bg-sky-900/50 disabled:opacity-40"
              >
                <MoveRight className="h-3 w-3" />
                Dịch phải
              </button>
              <button
                type="button"
                onClick={() => {
                  if (activeClipId) removeTimelineClip(activeClipId);
                  else if (activeSourceId) removeTimelineSource(activeSourceId);
                }}
                disabled={!activeClipId && !activeSourceId}
                title="Xóa clip đang chọn trên timeline (Delete)"
                className="inline-flex items-center gap-1 rounded border border-rose-500/50 bg-rose-950/30 px-2 py-1 text-[11px] font-semibold text-rose-200 hover:bg-rose-900/50 disabled:opacity-40"
              >
                <Trash2 className="h-3 w-3" />
                Xóa clip
              </button>
              <button type="button" onClick={seekTimelineStart} disabled={!timelineClips.length} title="Đưa playhead về frame đầu của toàn timeline (Home)" className="rounded border border-slate-700 px-2 py-1 text-[11px] hover:border-slate-500 disabled:opacity-40">Start Frame</button>
              <button type="button" onClick={seekTimelineEnd} disabled={!timelineClips.length} title="Đưa playhead tới frame cuối của toàn timeline" className="rounded border border-slate-700 px-2 py-1 text-[11px] hover:border-slate-500 disabled:opacity-40">End Frame</button>
              <button type="button" onClick={setCutFrom} disabled={!timelineClips.length} title="Đặt frame hiện tại trên timeline làm đầu range" className="rounded border border-amber-400/40 px-2 py-1 text-[11px] text-amber-200 hover:bg-amber-400/10 disabled:opacity-40">Cut From Frame</button>
              <button type="button" onClick={setCutTo} disabled={!timelineClips.length} title="Đặt frame hiện tại trên timeline làm cuối range" className="rounded border border-amber-400/40 px-2 py-1 text-[11px] text-amber-200 hover:bg-amber-400/10 disabled:opacity-40">Cut To Frame</button>
              <button
                type="button"
                onClick={addSplitMarker}
                disabled={!timelineClips.length}
                title={`Đánh dấu split tại playhead ${formatTime(playhead)}`}
                className="rounded border border-cyan-400/50 px-2 py-1 text-[11px] text-cyan-200 hover:bg-cyan-400/10 disabled:opacity-40"
              >
                Mark to split
              </button>
              <button
                type="button"
                onClick={removeLastSplitMarker}
                disabled={!splitMarkers.length}
                title="Xóa mốc split được thêm gần đây nhất"
                className="rounded border border-cyan-400/30 px-2 py-1 text-[11px] text-cyan-200 hover:bg-cyan-400/10 disabled:opacity-40"
              >
                Undo mark
              </button>
              <button
                type="button"
                onClick={() => setSplitMarkers([])}
                disabled={!splitMarkers.length}
                title="Xóa toàn bộ mốc split"
                className="rounded border border-slate-700 px-2 py-1 text-[11px] text-slate-300 hover:border-slate-500 disabled:opacity-40"
              >
                Clear marks
              </button>
              <button
                type="button"
                onClick={splitTimelineToQueues}
                disabled={!splitMarkers.some((time) => time > 0 && time < timelineDuration)}
                title="Chia toàn bộ timeline từ đầu đến cuối thành các queue theo mốc đã đánh dấu"
                className="rounded bg-cyan-400 px-2.5 py-1 text-[11px] font-bold text-slate-950 hover:bg-cyan-300 disabled:opacity-40"
              >
                Split to queues
              </button>
              <div className="inline-flex flex-wrap items-center gap-1.5 border-l border-slate-700 pl-2 ml-1">
                <label className="flex items-center gap-1 text-[10px] text-slate-300" title="Tự snap frame start/end về keyframe gần nhất để tối ưu Stream-copy">
                  <input
                    type="checkbox"
                    checked={preferKeyframeCuts}
                    onChange={(e) => setPreferKeyframeCuts(e.target.checked)}
                    className="accent-sky-400"
                  />
                  Keyframe
                </label>
                <div className="inline-flex items-center gap-1">
                  <label className="text-[10px] text-slate-300">Frame Tol %:</label>
                  <input
                    type="number"
                    value={frameTolerance}
                    min={1}
                    max={50}
                    step={1}
                    onChange={(e) => setFrameTolerance(parseFloat(e.target.value) || 5)}
                    className="w-12 rounded border border-sky-400/40 bg-slate-900 px-1 py-0.5 text-[10px] text-sky-200 focus:outline-none"
                  />
                  <label className="text-[10px] text-slate-300 ml-1">Dur Tol %:</label>
                  <input
                    type="number"
                    value={durationTolerance}
                    min={1}
                    max={50}
                    step={0.5}
                    onChange={(e) => setDurationTolerance(parseFloat(e.target.value) || 5)}
                    className="w-12 rounded border border-sky-400/40 bg-slate-900 px-1 py-0.5 text-[10px] text-sky-200 focus:outline-none"
                  />
                  <button
                    type="button"
                    onClick={() => { setFrameTolerance(5); setDurationTolerance(5); }}
                    className="rounded border border-slate-700 px-1 py-0.5 text-[10px] text-slate-300 hover:bg-slate-800"
                    title="Đặt về mặc định (5%)"
                  >
                    Reset
                  </button>
                </div>
                <button
                  type="button"
                  onClick={addActiveClipToQueue}
                  disabled={!activeClipId || !timelineClips.length}
                  className="rounded border border-sky-400/40 px-2 py-1 text-[10px] font-semibold text-sky-200 hover:bg-sky-950/40 disabled:opacity-40"
                  title="Thêm clip đang chọn vào queue"
                >
                  Add clip to queue
                </button>
                <button
                  type="button"
                  onClick={addAllClipsToQueue}
                  disabled={!timelineClips.length}
                  className="rounded border border-emerald-400/40 px-2 py-1 text-[10px] font-semibold text-emerald-200 hover:bg-emerald-950/40 disabled:opacity-40"
                  title="Thêm tất cả các clip vào queue (mỗi clip = 1 queue item)"
                >
                  Add all Clips to queues
                </button>
                <button
                  type="button"
                  onClick={createSingleMergedQueue}
                  disabled={!timelineClips.length}
                  className="rounded border border-violet-400/40 px-2 py-1 text-[10px] font-semibold text-violet-200 hover:bg-violet-950/40 disabled:opacity-40"
                  title="Tạo 1 queue duy nhất gộp toàn bộ clips (chỉ export 1 lần, không cần join sau)"
                >
                  Tạo 1 Queue gộp tất cả
                </button>
              </div>
              <button type="button" onClick={addLastCut} disabled={!queue.length} title="Thêm phần còn lại sau frame cuối của range cuối trong queue" className="rounded border border-violet-400/40 px-2 py-1 text-[11px] text-violet-200 hover:bg-violet-400/10 disabled:opacity-40">Last Cut</button>
              <button
                type="button"
                onClick={(event) => {
                  event.stopPropagation();
                  addQueueBesideSelected("before");
                }}
                disabled={!selectedQueueRange || !selectedQueueBounds}
                title="Tạo cue dài tối đa 5 giây kết thúc tại đầu cue đang chọn"
                className="rounded border border-violet-400/40 px-2 py-1 text-[11px] text-violet-200 hover:bg-violet-400/10 disabled:opacity-40"
              >
                Add queue before
              </button>
              <button
                type="button"
                onClick={(event) => {
                  event.stopPropagation();
                  addQueueBesideSelected("after");
                }}
                disabled={!selectedQueueRange || !selectedQueueBounds}
                title="Tạo cue dài tối đa 5 giây bắt đầu tại cuối cue đang chọn"
                className="rounded border border-violet-400/40 px-2 py-1 text-[11px] text-violet-200 hover:bg-violet-400/10 disabled:opacity-40"
              >
                Add queue after
              </button>
              <button type="button" onClick={addCurrentRange} disabled={!timelineClips.length} className="inline-flex items-center gap-1 rounded bg-amber-400 px-2.5 py-1 text-[11px] font-bold text-slate-950 hover:bg-amber-300 disabled:opacity-40"><Scissors className="h-3 w-3" />Add to Queue</button>
            </div>
            <div className="flex items-center gap-1.5">
              <button type="button" onClick={() => setZoom((current) => Math.max(minimumZoom, current / ZOOM_STEP))} disabled={zoom <= minimumZoom} className="rounded border border-slate-700 p-1 text-slate-300 hover:text-white disabled:opacity-40" aria-label="Thu nhỏ timeline"><Minus className="h-3.5 w-3.5" /></button>
              <button type="button" onClick={fitTimeline} className="rounded border border-slate-700 px-1.5 py-1 text-[10px] text-slate-300 hover:text-white" title="Thu nhỏ để thấy toàn bộ timeline">Fit</button>
              <span className="min-w-[58px] text-center font-mono text-[10px] text-slate-400">{zoom < 10 ? zoom.toFixed(2) : Math.round(zoom)} px/s</span>
              <button type="button" onClick={() => setZoom((current) => Math.min(MAX_ZOOM, Math.round(current * ZOOM_STEP * 100) / 100))} className="rounded border border-slate-700 p-1 text-slate-300 hover:text-white" aria-label="Phóng to timeline"><Plus className="h-3.5 w-3.5" /></button>
              <label className="inline-flex items-center gap-1 text-[10px] text-slate-400" title="Khoảng snap đến đầu/cuối clip theo pixel màn hình">
                Snap
                <input
                  type="number"
                  min={0}
                  max={MAX_SNAP_DISTANCE_PX}
                  step={1}
                  value={snapDistancePx}
                  onChange={(event) => {
                    const value = Number(event.currentTarget.value);
                    setSnapDistancePx(
                      Number.isFinite(value)
                        ? Math.max(0, Math.min(MAX_SNAP_DISTANCE_PX, value))
                        : 0,
                    );
                  }}
                  className="w-12 rounded border border-slate-700 bg-slate-950 px-1.5 py-1 text-center font-mono text-[10px] text-slate-200"
                  aria-label="Khoảng snap theo pixel"
                />
                px
              </label>
              <span className="hidden text-[10px] text-slate-500 xl:inline">{rulerFrameMode ? "Ruler hiển thị số frame" : "Ctrl/Alt + cuộn để zoom"} · Space phát/dừng · ←/→ từng frame · Shift + ←/→ 10 frame</span>
            </div>
          </div>
          <div
            ref={timelineScrollRef}
            className="min-h-0 flex-1 overflow-auto overscroll-contain"
            onScroll={(event) => setTimelineScrollLeft(event.currentTarget.scrollLeft)}
            onDragOver={(event) => {
              event.preventDefault();
              event.dataTransfer.dropEffect = "copy";
            }}
            onDrop={handleDropOnTimeline}
          >
            <div
              ref={timelineContentRef}
              className="relative min-h-full"
              style={{ width: `${timelineWidth}px`, minWidth: "100%" }}
              onPointerDown={(event) => {
                if (!(event.target as HTMLElement).closest("[data-queue-cue]")) {
                  setSelectedQueueId(null);
                }
                if ((event.target as HTMLElement).closest("button, [data-queue-cue]")) return;
                isScrubbingRef.current = true;
                seekGlobal((event.clientX - event.currentTarget.getBoundingClientRect().left) / zoom);
              }}
            >
              <div className="relative h-7 border-b border-slate-800 bg-slate-900/70">
                {rulerTicks.map((tick) => (
                  <div key={tick.key} className={`absolute inset-y-0 border-l pl-1 pt-1 font-mono text-[9px] ${rulerFrameMode ? "border-sky-500/50 text-sky-300" : "border-slate-700/70 text-slate-500"}`} style={{ left: `${tick.left}px` }}>
                    {tick.label}
                  </div>
                ))}
              </div>
              <div className="relative h-[calc(100%-1.75rem)] min-h-44">
                {timelineClips.length === 0 ? (
                  <div className="flex h-full min-h-28 items-center justify-center text-xs text-slate-500">
                    Kéo video từ cột trái vào đây để bắt đầu biên tập
                  </div>
                ) : (
                  timelineClips.map((clip, clipIndex) => {
                    const clipWidth = clip.duration * zoom;
                    const isSelected = activeClipId === clip.clipId;
                    const isDraggingThis = draggedClipId === clip.clipId;
                    const isTarget = dropTargetClipId === clip.clipId;
                    return (
                      <div
                        key={clip.clipId}
                        data-timeline-clip
                        data-clip-id={clip.clipId}
                        draggable
                        onDragStart={(event) => {
                          event.dataTransfer.effectAllowed = "move";
                          event.dataTransfer.setData("application/x-join-split-clip", clip.clipId);
                          setDraggedClipId(clip.clipId);
                        }}
                        onDragEnd={() => {
                          setDraggedClipId(null);
                          setDropTargetClipId(null);
                          setDropPosition(null);
                        }}
                        onDragOver={(event) => {
                          event.preventDefault();
                          event.stopPropagation();
                          if (draggedClipId && draggedClipId !== clip.clipId) {
                            event.dataTransfer.dropEffect = "move";
                            const rect = event.currentTarget.getBoundingClientRect();
                            const midX = rect.left + rect.width / 2;
                            const pos = event.clientX < midX ? "before" : "after";
                            setDropTargetClipId(clip.clipId);
                            setDropPosition(pos);
                          }
                        }}
                        onDragLeave={() => {
                          if (dropTargetClipId === clip.clipId) {
                            setDropTargetClipId(null);
                            setDropPosition(null);
                          }
                        }}
                        onClick={(event) => {
                          event.stopPropagation();
                          setSelectedQueueId(null);
                          setActiveClipId(clip.clipId);
                          setActiveSourceId(clip.sourceId);
                          const localOffset = Math.max(0, (event.clientX - event.currentTarget.getBoundingClientRect().left) / zoom);
                          seekGlobal(clip.start + Math.min(clip.duration, localOffset));
                        }}
                        className={`group absolute left-0 top-10 flex h-16 cursor-grab items-center overflow-hidden border-y border-r text-left transition-all active:cursor-grabbing ${clipWidth >= 52 ? "px-2 pr-8" : clipWidth >= 20 ? "px-0.5" : "px-0"} ${isDraggingThis ? "opacity-30" : ""} ${isSelected ? "border-amber-300 bg-amber-500/30 text-amber-100 ring-2 ring-inset ring-amber-300" : activeSourceId === clip.sourceId ? "border-sky-300 bg-sky-500/25 text-sky-100" : "border-slate-600 bg-slate-700/60 text-slate-200 hover:bg-slate-600/70"}`}
                        style={{ left: `${clip.start * zoom}px`, width: `${clipWidth}px` }}
                        title={`[${clipIndex + 1}] ${clip.source.fileName} · Frame ${clip.startFrame}-${clip.endFrame} (${clip.endFrame - clip.startFrame + 1}f) · ${formatTime(clip.duration)} · Kéo để đổi vị trí`}
                      >
                        {isTarget && dropPosition === "before" && (
                          <div className="absolute inset-y-0 left-0 z-20 w-1 bg-amber-400 shadow-[0_0_8px_rgba(251,191,36,0.8)]" />
                        )}
                        {isTarget && dropPosition === "after" && (
                          <div className="absolute inset-y-0 right-0 z-20 w-1 bg-amber-400 shadow-[0_0_8px_rgba(251,191,36,0.8)]" />
                        )}
                        {clipWidth >= 20 && <Film className="h-3.5 w-3.5 shrink-0" />}
                        {clipWidth >= 72 && (
                          <>
                            <span className="truncate text-[11px] font-medium">
                              #{clipIndex + 1} {clip.source.fileName}
                            </span>
                            <span className="ml-auto shrink-0 pl-1 font-mono text-[9px] opacity-70">
                              {clip.startFrame}-{clip.endFrame} ({clip.endFrame - clip.startFrame + 1}f)
                            </span>
                          </>
                        )}
                        <button
                          type="button"
                          onClick={(event) => {
                            event.stopPropagation();
                            removeTimelineClip(clip.clipId);
                          }}
                          className="absolute right-1 top-1 hidden rounded p-0.5 text-slate-400 hover:bg-rose-950/80 hover:text-rose-300 group-hover:block"
                          title="Xóa đoạn này khỏi timeline"
                          aria-label="Xóa đoạn này khỏi timeline"
                        >
                          <X className="h-3 w-3" />
                        </button>
                      </div>
                    );
                  })
                )}
                {timelineClips.length > 0 && (
                  <>
                    {selectedQueueBounds && (
                      <div
                        className="pointer-events-none absolute top-10 z-[5] h-16 border-y-2 border-fuchsia-300 bg-fuchsia-400/20"
                        style={{
                          left: `${selectedQueueBounds.start * zoom}px`,
                          width: `${Math.max(1, (selectedQueueBounds.end - selectedQueueBounds.start) * zoom)}px`,
                        }}
                        aria-label="Khoảng queue đang chọn"
                      />
                    )}
                    {timelineClips.map((clip) => {
                      const cutStart = cutFromTime !== null &&
                        cutFromTime >= clip.start && cutFromTime <= clip.end
                        ? cutFromTime
                        : null;
                      const cutEnd = cutToTime !== null &&
                        cutToTime >= clip.start && cutToTime <= clip.end
                        ? cutToTime
                        : null;
                      return (
                        <div key={`marker-${clip.sourceId}`}>
                          {cutStart !== null && (
                            <div className="pointer-events-none absolute top-8 z-10 h-20 border-l-2 border-emerald-400" style={{ left: `${cutStart * zoom}px` }}>
                              <span className="absolute -top-3 left-1 whitespace-nowrap text-[9px] font-bold text-emerald-300">IN</span>
                            </div>
                          )}
                          {cutEnd !== null && (
                            <div className="pointer-events-none absolute top-8 z-10 h-20 border-l-2 border-rose-400" style={{ left: `${cutEnd * zoom}px` }}>
                              <span className="absolute -top-3 left-1 whitespace-nowrap text-[9px] font-bold text-rose-300">OUT</span>
                            </div>
                          )}
                        </div>
                      );
                    })}
                    {splitMarkers
                      .filter((marker) => marker > 0 && marker < timelineDuration)
                      .map((marker, index) => (
                        <div
                          key={`split-marker-${marker}`}
                          className="pointer-events-none absolute top-0 z-30 h-24"
                          style={{ left: `${marker * zoom}px` }}
                        >
                          <div
                            className={`absolute left-0 top-6 h-[4.5rem] border-l-2 ${
                              selectedSplitMarker === marker ? "border-cyan-100" : "border-cyan-300"
                            }`}
                          />
                          <button
                            type="button"
                            data-split-marker
                            aria-label={`Chọn mốc split S${index + 1} tại ${formatTime(marker)}`}
                            aria-pressed={selectedSplitMarker === marker}
                            title={`Mốc split S${index + 1} · ${formatTime(marker)} · chọn rồi nhấn Delete để xóa`}
                            onClick={(event) => {
                              event.stopPropagation();
                              setSelectedSplitMarker(marker);
                              setSelectedQueueId(null);
                              seekGlobal(marker);
                            }}
                            className={`pointer-events-auto absolute -left-2 -top-1 flex h-5 w-5 items-center justify-center rounded-full border shadow ${
                              selectedSplitMarker === marker
                                ? "border-cyan-100 bg-cyan-300 text-slate-950"
                                : "border-cyan-300 bg-slate-950 text-cyan-200 hover:bg-cyan-950"
                            }`}
                          >
                            <Flag className="h-3 w-3" />
                          </button>
                        </div>
                      ))}
                    <div className="absolute left-0 top-28 h-8 w-full border-y border-slate-800 bg-slate-900/40">
                      <span className="absolute left-2 top-1 z-10 rounded bg-slate-950/80 px-1 text-[9px] text-slate-500">
                        QUEUE
                      </span>
                      {queue.map((range, index) => {
                        const bounds = getJoinSplitRangeTimelineBounds(
                          getJoinSplitRangeSegments(range),
                          timelineClips.map((clip) => ({
                            clipId: clip.clipId,
                            sourceId: clip.sourceId,
                            start: clip.start,
                            end: clip.end,
                            frameRate: clip.source.frameRate,
                            frameCount: clip.source.frameCount,
                            startFrame: clip.startFrame,
                            endFrame: clip.endFrame,
                          })),
                        );
                        if (!bounds) return null;
                        const isSelected = selectedQueueId === range.id;
                        const cueWidth = (bounds.end - bounds.start) * zoom;
                        return (
                          <div
                            key={`queue-cue-${range.id}`}
                            data-queue-cue
                            onPointerDown={(event) => {
                              event.preventDefault();
                              event.stopPropagation();
                              const mode = (event.target as HTMLElement).closest<HTMLElement>("[data-queue-edge]")?.dataset.queueEdge;
                              queueCueDragRef.current = {
                                rangeId: range.id,
                                mode: mode === "start" || mode === "end" ? mode : "move",
                                initialPointerTime: (event.clientX - (timelineContentRef.current?.getBoundingClientRect().left || 0)) / zoom,
                                initialStart: bounds.start,
                                initialEnd: bounds.end,
                              };
                              setSelectedQueueId(range.id);
                            }}
                            onClick={(event) => {
                              event.stopPropagation();
                              setSelectedQueueId(range.id);
                              seekGlobal(bounds.start);
                            }}
                            className={`group absolute top-0 z-10 flex h-full cursor-grab items-center justify-center overflow-hidden rounded border text-[9px] font-semibold active:cursor-grabbing ${
                              isSelected
                                ? "border-fuchsia-200 bg-fuchsia-500/60 text-white"
                                : "border-violet-300/70 bg-violet-500/40 text-violet-100 hover:bg-violet-500/60"
                            }`}
                            style={{
                              left: `${bounds.start * zoom}px`,
                              width: `${cueWidth}px`,
                            }}
                            title={`Queue ${index + 1} · ${formatTime(bounds.start)}–${formatTime(bounds.end)} · kéo để di chuyển, kéo hai mép để chỉnh`}
                          >
                            {cueWidth >= 20 && <span className="truncate px-1">{index + 1}</span>}
                            <span
                              data-queue-edge="start"
                              className="absolute inset-y-0 left-0 w-2 cursor-ew-resize rounded-l bg-white/20 opacity-0 group-hover:opacity-100"
                              aria-label="Điều chỉnh đầu queue"
                            />
                            <span
                              data-queue-edge="end"
                              className="absolute inset-y-0 right-0 w-2 cursor-ew-resize rounded-r bg-white/20 opacity-0 group-hover:opacity-100"
                              aria-label="Điều chỉnh cuối queue"
                            />
                          </div>
                        );
                      })}
                    </div>
                    <div className="pointer-events-none absolute top-6 z-20 h-full border-l-2 border-red-500" style={{ left: `${playhead * zoom}px` }}>
                      <div className="absolute -left-[5px] top-0 h-2.5 w-2.5 rounded-b-sm bg-red-500" />
                    </div>
                  </>
                )}
              </div>
            </div>
          </div>
        </div>

        {queuePanelHost && createPortal(<div className="flex h-full min-h-0 flex-col bg-slate-900/70">
          <div className="flex shrink-0 flex-wrap items-center justify-between gap-2 border-b border-slate-800 px-3 py-2">
            <div>
              <h3 className="text-xs font-semibold">Video in queue</h3>
              <p className="text-[10px] text-slate-500">Chọn profile chung để phân tích stream-copy / encode · Chọn video hoặc queue cue rồi nhấn Delete để xóa.</p>
            </div>
            <div className="flex flex-wrap items-center gap-2">
              <label className="flex items-center gap-1.5 text-[10px] text-slate-400">
                Profile chung
                <select
                  value={referenceSourceId}
                  onChange={(event) => setReferenceSourceId(event.target.value)}
                  disabled={!sources.length}
                  className="max-w-48 rounded border border-slate-700 bg-slate-950 px-2 py-1 text-[10px] text-slate-200"
                >
                  {sources.map((source) => (
                    <option key={source.id} value={source.id}>{source.fileName} · {source.video.width}×{source.video.height} · {source.frameRate.toFixed(3)} fps</option>
                  ))}
                </select>
              </label>
              <button type="button" onClick={() => void joinTimeline()} disabled={!timelineClipItems.length || !referenceSourceId || joining || exporting} className="rounded border border-sky-400/40 px-2.5 py-1.5 text-[10px] font-semibold text-sky-200 hover:bg-sky-950/40 disabled:opacity-40">
                {joining ? "Đang xuất…" : "Xuất Timeline"}
              </button>
              {timelineJoinOutput && (
                <a
                  href={`${API}/exports/${encodeURIComponent(timelineJoinOutput.id)}/download`}
                  download={timelineJoinOutput.fileName}
                  className="rounded border border-sky-400/30 px-2 py-1.5 text-[10px] text-sky-200 hover:bg-sky-950/40"
                  title={timelineJoinOutput.fileName}
                >
                  Tải video timeline
                </a>
              )}
              <label className="flex items-center gap-1 text-[10px] text-slate-300">
                <input
                  type="checkbox"
                  checked={joinQueuesAfterExport}
                  onChange={(event) => setJoinQueuesAfterExport(event.target.checked)}
                  disabled={queue.length < 2 || exporting || joining}
                  className="accent-emerald-400"
                />
                Join queues
              </label>
              <label className="flex items-center gap-1 text-[10px] text-slate-300" title="Bỏ qua kiểm tra tương thích. Chỉ dùng khi các clip cùng nguồn/setting.">
                <input
                  type="checkbox"
                  checked={forceCopy}
                  onChange={(event) => setForceCopy(event.target.checked)}
                  disabled={exporting || joining}
                  className="accent-amber-400"
                />
                Force Copy
              </label>
              <button type="button" onClick={() => void exportQueue()} disabled={!queue.length || !referenceSourceId || exporting || joining} className="rounded bg-emerald-500 px-3 py-1.5 text-[10px] font-bold text-slate-950 hover:bg-emerald-400 disabled:opacity-40">
                {exporting ? "Đang Export…" : "Export Queue"}
              </button>
              <button
                type="button"
                onClick={() => void stopQueue()}
                disabled={!exporting && !joining}
                className="rounded border border-rose-400/40 px-2.5 py-1.5 text-[10px] font-semibold text-rose-200 hover:bg-rose-950/40 disabled:opacity-40"
              >
                {joining ? "Dừng ghép" : "Dừng queue"}
              </button>
              {queueJoinOutput && (
                <a
                  href={`${API}/exports/${encodeURIComponent(queueJoinOutput.id)}/download`}
                  download={queueJoinOutput.fileName}
                  className="rounded border border-emerald-400/40 px-2 py-1.5 text-[10px] font-semibold text-emerald-200 hover:bg-emerald-950/40"
                  title={queueJoinOutput.fileName}
                >
                  Tải video đã join
                </a>
              )}
            </div>
          </div>
          {joining && queueJoinProgress && (
            <div className="border-b border-emerald-400/20 bg-emerald-950/10 px-3 py-2">
              <div className="mb-1 flex items-center justify-between gap-2 text-[10px] text-slate-300">
                <span className="truncate">{queueJoinProgress.message}</span>
                <span className="shrink-0 font-mono">{Math.round(queueJoinProgress.percent)}%</span>
              </div>
              <div
                className="h-1.5 overflow-hidden rounded-full bg-slate-800"
                role="progressbar"
                aria-label="Tiến trình ghép các video queue"
                aria-valuemin={0}
                aria-valuemax={100}
                aria-valuenow={queueJoinProgress.percent}
                aria-valuetext={`${Math.round(queueJoinProgress.percent)}% · ${queueJoinProgress.message}`}
              >
                <div
                  className="h-full rounded-full bg-emerald-400 transition-[width] duration-300"
                  style={{ width: `${queueJoinProgress.percent}%` }}
                />
              </div>
            </div>
          )}
          {isIncompatible && (
            <div className="border-b border-amber-400/20 bg-amber-950/20 px-3 py-1.5 text-[10px] text-amber-200">
              Có video khác thông số profile chung; các range đó sẽ được encode lại để khớp video đã chọn.
            </div>
          )}
          <div className="min-h-0 flex-1 overflow-auto">
            {!queue.length ? (
              <div className="flex h-full min-h-16 items-center justify-center px-3 text-[11px] text-slate-500">
                Chọn frame In/Out trên timeline rồi bấm Add to Queue.
              </div>
            ) : (
              <div className="divide-y divide-slate-800/80">
                {queue.map((range, index) => {
                  const segments = getJoinSplitRangeSegments(range);
                  const source = sourceById.get(segments[0].sourceId);
                  const bounds = getJoinSplitRangeTimelineBounds(segments, timelineClips.map((clip) => ({
                    clipId: clip.clipId,
                    sourceId: clip.sourceId,
                    start: clip.start,
                    end: clip.end,
                    frameRate: clip.source.frameRate,
                    frameCount: clip.source.frameCount,
                    startFrame: clip.startFrame,
                    endFrame: clip.endFrame,
                  })));
                  const status = queueStatusById.get(range.id);
                  const exportState = queueExportState[range.id];
                  if (!source || segments.some((segment) => !sourceById.has(segment.sourceId))) return null;
                  const requiresEncoding = status?.requiresEncoding;
                  const encodingFallback = exportState?.strategy === "fallback";
                  const hasKeyframeBoundaryIssue = status?.encodingReasons.some((reason) =>
                    reason.includes("keyframe") || reason.includes("cut start") || reason.includes("cut end"),
                  );
                  const directEncodeRequired = status?.encodingReasons.includes("keyframe preference is disabled");
                  const encodingStatusLabel = encodingFallback
                    ? "Encode fallback"
                    : exportState?.strategy === "encode"
                      ? "Encode"
                      : directEncodeRequired
                        ? "Encode trực tiếp"
                      : !requiresEncoding
                        ? "Stream-copy"
                        : status && status.segmentCount > 1
                          ? `Encode ${status.encodingSegmentCount}/${status.segmentCount} đoạn`
                          : hasKeyframeBoundaryIssue
                            ? "Lệch keyframe"
                            : status?.encodingReasons.some((reason) => reason.includes("stream parameters differ"))
                              ? "Khác profile"
                              : "Cần encode";
                  const encodingReasonLabel = status?.encodingReasons.map((reason) => {
                    if (reason === "keyframe preference is disabled") return "Tắt Ưu tiên keyframe: encode trực tiếp, không thử stream-copy";
                    if (reason.includes("stream parameters differ")) return "Thông số stream khác profile tham chiếu";
                    if (reason.includes("keyframe index")) return "Không đọc được danh sách keyframe";
                    if (reason.includes("cut start")) return "Điểm bắt đầu không trùng keyframe";
                    if (reason.includes("cut end")) return "Điểm kết thúc không trùng keyframe";
                    return reason;
                  }).join("; ");
                  return (
                    <div
                      key={range.id}
                      data-queue-item
                      onClick={() => {
                        setSelectedQueueId(range.id);
                        if (bounds) seekGlobal(bounds.start);
                      }}
                      aria-current={selectedQueueId === range.id ? "true" : undefined}
                      className={`cursor-pointer px-3 py-1.5 hover:bg-slate-800/50 ${selectedQueueId === range.id ? "bg-fuchsia-950/30" : ""}`}
                    >
                      <div className="flex min-h-8 items-center gap-2">
                        <span className="min-w-0 flex-1 truncate font-mono text-[11px]">
                          Q{index + 1} · {formatTime(bounds?.start ?? 0)} - {formatTime(bounds?.end ?? 0)} · {formatTime(bounds ? bounds.end - bounds.start : 0)}
                        </span>
                        <span
                          title={(encodingFallback ? exportState?.message : encodingReasonLabel) || undefined}
                          className={`shrink-0 rounded px-1.5 py-0.5 text-[9px] font-semibold ${requiresEncoding === undefined ? "bg-slate-800 text-slate-400" : requiresEncoding || encodingFallback ? "bg-amber-400/10 text-amber-200" : "bg-emerald-400/10 text-emerald-200"}`}
                        >
                          {requiresEncoding === undefined ? "Đang kiểm tra…" : encodingStatusLabel}
                        </span>
                        {exportState?.output && (
                          <a
                            href={`${API}/exports/${encodeURIComponent(exportState.output.id)}/download`}
                            download={exportState.output.fileName}
                            onClick={(event) => event.stopPropagation()}
                            className="inline-flex shrink-0 items-center gap-1 rounded border border-emerald-500/25 px-2 py-1 text-[10px] text-emerald-100 hover:bg-emerald-950/40"
                            title="Tải queue item"
                          >
                            <Download className="h-3 w-3" /> Tải
                          </a>
                        )}
                        <button
                          type="button"
                          onClick={(event) => {
                            event.stopPropagation();
                            deleteQueueRange(range.id);
                          }}
                          className="rounded p-1 text-slate-500 hover:bg-rose-950/50 hover:text-rose-300"
                          title="Xóa range khỏi queue"
                          aria-label="Xóa range"
                        >
                          <Trash2 className="h-3.5 w-3.5" />
                        </button>
                      </div>
                      {(exportState?.status === "pending" || exportState?.status === "exporting" || exportState?.status === "done") && (
                        <div className="ml-7 mt-1.5">
                          <div className="mb-1 flex items-center justify-between gap-2 text-[9px] text-slate-400">
                            <span className="truncate">{exportState.message || (exportState.status === "done" ? "Hoàn tất" : exportState.status === "pending" ? "Đang chờ" : "Đang xuất…")}</span>
                            <span className="shrink-0 font-mono">{exportState.status === "done" ? "100%" : `${exportState.progress ?? 0}%`}</span>
                          </div>
                          <div
                            className={`h-1.5 overflow-hidden rounded-full ${exportState.status === "done" ? "bg-emerald-900/70" : "bg-slate-800"}`}
                            role="progressbar"
                            aria-label={`Tiến độ xuất queue item ${index + 1}`}
                            aria-valuemin={0}
                            aria-valuemax={100}
                            aria-valuenow={exportState.status === "done" ? 100 : exportState.progress ?? 0}
                            aria-valuetext={exportState.status === "done" ? "Hoàn tất" : `${exportState.progress ?? 0}% · ${exportState.message || "Đang xuất"}`}
                          >
                            <div
                              className={`h-full rounded-full transition-[width] duration-300 ${exportState.status === "done" ? "bg-emerald-400" : "bg-amber-300"}`}
                              style={{ width: `${exportState.status === "done" ? 100 : exportState.progress ?? 0}%` }}
                            />
                          </div>
                        </div>
                      )}
                      {exportState?.status === "error" && (
                        <p className="ml-7 mt-1 text-[10px] text-rose-300">{exportState.error}</p>
                      )}
                      {exportState?.status === "cancelled" && (
                        <p className="ml-7 mt-1 text-[10px] text-slate-400">{exportState.message || "Đã dừng."}</p>
                      )}
                    </div>
                  );
                })}
              </div>
            )}
          </div>
          {(error || notice) && (
            <div className={`shrink-0 border-t px-3 py-1.5 text-[10px] ${error ? "border-rose-500/30 bg-rose-950/25 text-rose-200" : "border-slate-800 text-slate-400"}`} role={error ? "alert" : "status"}>
              {error || notice}
            </div>
          )}
        </div>, queuePanelHost)}
      </section>
    </div>
  );
}
