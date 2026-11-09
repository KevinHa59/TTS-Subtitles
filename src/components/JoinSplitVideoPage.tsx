import { useCallback, useEffect, useLayoutEffect, useMemo, useRef, useState, type DragEvent, type MouseEvent, type PointerEvent as ReactPointerEvent } from "react";
import { createPortal } from "react-dom";
import {
  Download,
  Film,
  FolderOpen,
  LoaderCircle,
  Minus,
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
  JoinSplitVideoExportFile,
  JoinSplitVideoRange,
  JoinSplitVideoRangeStatus,
  JoinSplitVideoSource,
} from "../types/joinSplitVideo";
import {
  getJoinSplitRangeSegments,
  getJoinSplitRangeTimelineBounds,
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
  sourceId: string;
  start: number;
  end: number;
  duration: number;
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
  activeSourceId: string | null;
  playhead: number;
  cutFromTime: number | null;
  cutToTime: number | null;
  queue: JoinSplitVideoRange[];
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
  const [timelineSourceIds, setTimelineSourceIds] = useState<string[]>([]);
  const [activeSourceId, setActiveSourceId] = useState<string | null>(null);
  const [playhead, setPlayhead] = useState(0);
  const [cutFromTime, setCutFromTime] = useState<number | null>(null);
  const [cutToTime, setCutToTime] = useState<number | null>(null);
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
  const [timelineJoinOutput, setTimelineJoinOutput] = useState<JoinSplitVideoExportFile | null>(null);
  const [queueJoinOutput, setQueueJoinOutput] = useState<JoinSplitVideoExportFile | null>(null);
  const [joinQueuesAfterExport, setJoinQueuesAfterExport] = useState(false);
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
        setTimelineSourceIds(
          Array.isArray(saved.timelineSourceIds)
            ? saved.timelineSourceIds.filter((id) => sourceIds.has(id))
            : [],
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
      activeSourceId,
      playhead,
      cutFromTime,
      cutToTime,
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
    activeSourceId,
    cutFromTime,
    cutToTime,
    joinQueuesAfterExport,
    muted,
    playhead,
    preferKeyframeCuts,
    queue,
    queueExportState,
    queueJoinOutput,
    referenceSourceId,
    selectedQueueId,
    selectedSourceIds,
    snapDistancePx,
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
    let offset = 0;
    return timelineSourceIds.flatMap((sourceId) => {
      const source = sourceById.get(sourceId);
      if (!source) return [];
      const duration = source.frameCount / source.frameRate;
      const clip = {
        sourceId,
        start: offset,
        end: offset + duration,
        duration,
        source,
      };
      offset += duration;
      return [clip];
    });
  }, [sourceById, timelineSourceIds]);
  const keyframeTimelineClips = useMemo(
    () => timelineClips.map((clip) => ({
      ...clip,
      frameRate: clip.source.frameRate,
      frameCount: clip.source.frameCount,
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

  const activeClip = timelineClips.find((clip) => clip.sourceId === activeSourceId);
  const localPlayhead = activeClip
    ? Math.max(0, Math.min(activeClip.duration, playhead - activeClip.start))
    : playhead;
  const currentFrame = selectedSource
    ? Math.max(
        1,
        Math.min(
          selectedSource.frameCount,
          Math.floor(localPlayhead * selectedSource.frameRate + 1e-6) + 1,
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
    const existing = new Set(timelineSourceIds);
    const additions = sourceIds.filter((id) => sourceById.has(id) && !existing.has(id));
    if (!additions.length) return;
    setTimelineSourceIds((current) => [...current, ...additions]);
    setActiveSourceId(additions[0]);
    setNotice(`Đã thêm ${additions.length} video vào timeline, không tạo khoảng trống.`);
    setError(null);
  };

  const removeTimelineSource = (sourceId: string) => {
    const clipIndex = timelineSourceIds.indexOf(sourceId);
    if (clipIndex < 0) return;
    const nextSourceIds = timelineSourceIds.filter((id) => id !== sourceId);
    setTimelineSourceIds(nextSourceIds);
    if (nextSourceIds.length === 0) {
      setActiveSourceId(sourceId);
      setPlayhead(0);
    } else if (activeSourceId === sourceId) {
      const nextId = nextSourceIds[Math.min(clipIndex, nextSourceIds.length - 1)];
      const nextClip = timelineClips.find((clip) => clip.sourceId === nextId);
      setActiveSourceId(nextId);
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
      setTimelineSourceIds((current) => current.filter((id) => id !== sourceId));
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
            sourceId: clip.sourceId,
            start: clip.start,
            end: clip.end,
            frameRate: clip.source.frameRate,
            frameCount: clip.source.frameCount,
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
    const clip = timelineClips.find((item) => time >= item.start && time < item.end)
      || (time >= timelineDuration ? timelineClips[timelineClips.length - 1] : undefined);
    if (!clip) return;
    const localTime = Math.min(clip.duration, time - clip.start);
    if (previewRef.current) {
      try {
        previewRef.current.currentTime = localTime;
      } catch {
        setError("Không thể tua tới frame đã chọn.");
      }
    }
    setActiveSourceId(clip.sourceId);
    setPlayhead(time);
  }, [snapPlayheadTime, timelineClips, timelineDuration]);

  const seekFrame = useCallback((frame: number) => {
    if (!selectedSource) return;
    const localTime = frameTime(
      Math.max(1, Math.min(selectedSource.frameCount, frame)),
      selectedSource.frameRate,
    );
    if (activeClip) seekGlobal(activeClip.start + localTime);
    else {
      if (previewRef.current) previewRef.current.currentTime = localTime;
      setPlayhead(localTime);
    }
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
        sourceId: clip.sourceId,
        start: clip.start,
        end: clip.end,
        frameRate: clip.source.frameRate,
        frameCount: clip.source.frameCount,
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
    const video = previewRef.current;
    if (!video || !selectedSource) return;
    if (video.paused) {
      try {
        await video.play();
        setIsPlaying(true);
      } catch (playError) {
        setError(playError instanceof Error ? playError.message : "Không thể phát video.");
      }
    } else {
      video.pause();
      setIsPlaying(false);
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
      setTimelineSourceIds([]);
      setActiveSourceId(null);
      setPlayhead(0);
      setCutFromTime(null);
      setCutToTime(null);
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
    if (timelineSourceIds.length < 2 || !referenceSourceId) return;
    setJoining(true);
    setError(null);
    setNotice("Đang ghép timeline…");
    try {
      const response = await fetch(`${API}/join`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ sourceIds: timelineSourceIds, referenceSourceId }),
      });
      const result = await responseJson<{ file: JoinSplitVideoExportFile }>(response);
      setTimelineJoinOutput(result.file);
      setNotice(`Đã ghép timeline thành ${result.file.fileName}.`);
    } catch (joinError) {
      setError(joinError instanceof Error ? joinError.message : "Không thể ghép timeline.");
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
    if (!timelineClips.length || !timelineClips.some((clip) => clip.sourceId === activeSourceId)) return;
    const clip = timelineClips.find((item) => playhead >= item.start && playhead < item.end)
      || (playhead >= timelineDuration ? timelineClips[timelineClips.length - 1] : undefined);
    if (clip && clip.sourceId !== activeSourceId) setActiveSourceId(clip.sourceId);
  }, [activeSourceId, playhead, timelineClips, timelineDuration]);

  useEffect(() => {
    if (!selectedSource) return;
    const video = previewRef.current;
    if (!video) return;
    const handleLoaded = () => {
      const localTime = activeClip
        ? Math.max(0, Math.min(activeClip.duration, playhead - activeClip.start))
        : 0;
      video.currentTime = localTime;
      if (playAfterSourceChangeRef.current) {
        playAfterSourceChangeRef.current = false;
        void video.play().then(() => setIsPlaying(true)).catch((playError: unknown) => {
          setError(playError instanceof Error ? playError.message : "Không thể phát video kế tiếp.");
        });
      }
    };
    video.addEventListener("loadedmetadata", handleLoaded);
    return () => video.removeEventListener("loadedmetadata", handleLoaded);
  }, [activeClip, selectedSource, playhead]);

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
    const handleKeyDown = (event: KeyboardEvent) => {
      const target = event.target;
      if (
        target instanceof HTMLElement &&
        (target.isContentEditable || ["INPUT", "TEXTAREA", "SELECT", "BUTTON"].includes(target.tagName))
      ) return;
      if (event.key === "Delete" && selectedQueueId) {
        event.preventDefault();
        deleteQueueRange(selectedQueueId);
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
  }, [activeSourceId, currentFrame, deleteQueueRange, fitTimeline, minimumZoom, removeTimelineSource, selectedQueueId, selectedSource, seekFrame, timelineClips.length, timelineSourceIds]);

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
            sourceId: clip.sourceId,
            start: clip.start,
            end: clip.end,
            frameRate: clip.source.frameRate,
            frameCount: clip.source.frameCount,
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

  const handleDropOnTimeline = (event: DragEvent<HTMLDivElement>) => {
    event.preventDefault();
    setIsDropTarget(false);
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
      sourceId: clip.sourceId,
      start: clip.start,
      end: clip.end,
      frameRate: clip.source.frameRate,
      frameCount: clip.source.frameCount,
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
        sourceId: clip.sourceId,
        start: clip.start,
        end: clip.end,
        frameRate: clip.source.frameRate,
        frameCount: clip.source.frameCount,
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
            {selectedSource && (
              <span className="font-mono text-[11px] text-slate-300">
                {currentFrame}/{selectedSource.frameCount} · {formatTime(localPlayhead)}
              </span>
            )}
          </div>
          <div className="relative flex min-h-0 flex-1 items-center justify-center overflow-hidden">
            {selectedSource ? (
              <video
                ref={previewRef}
                key={selectedSource.id}
                src={`${API}/files/${encodeURIComponent(selectedSource.id)}/preview`}
                muted={muted}
                playsInline
                preload="metadata"
                onLoadedMetadata={(event) => {
                  const clip = timelineClips.find((item) => item.sourceId === selectedSource.id);
                  const localTime = clip ? Math.max(0, playhead - clip.start) : 0;
                  event.currentTarget.currentTime = Math.min(localTime, event.currentTarget.duration || localTime);
                  if (playAfterSourceChangeRef.current) {
                    playAfterSourceChangeRef.current = false;
                    void event.currentTarget.play().then(() => setIsPlaying(true)).catch(() => setIsPlaying(false));
                  }
                }}
                onTimeUpdate={(event) => {
                  const clip = timelineClips.find((item) => item.sourceId === selectedSource.id);
                  if (clip) setPlayhead(snapPlayheadTime(clip.start + event.currentTarget.currentTime, false));
                  else if (!timelineClips.length) setPlayhead(event.currentTarget.currentTime);
                }}
                onPlay={() => setIsPlaying(true)}
                onPause={() => setIsPlaying(false)}
                onEnded={() => {
                  const index = timelineClips.findIndex((clip) => clip.sourceId === selectedSource.id);
                  const next = timelineClips[index + 1];
                  if (next) {
                    playAfterSourceChangeRef.current = true;
                    seekGlobal(next.start);
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
              max={activeClip ? timelineDuration : selectedSource?.durationSeconds || 1}
              step={selectedSource ? 1 / selectedSource.frameRate : 0.04}
              value={activeClip ? Math.min(playhead, timelineDuration) : localPlayhead}
              onChange={(event) => activeClip ? seekGlobal(Number(event.target.value)) : seekFrame(Math.round(Number(event.target.value) * (selectedSource?.frameRate || 1)) + 1)}
              className="min-w-0 flex-1 accent-sky-400"
            />
            <span className="min-w-24 text-right font-mono text-[10px] text-slate-400">{formatTime(localPlayhead)}</span>
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
              <button type="button" onClick={seekTimelineStart} disabled={!timelineClips.length} title="Đưa playhead về frame đầu của toàn timeline (Home)" className="rounded border border-slate-700 px-2 py-1 text-[11px] hover:border-slate-500 disabled:opacity-40">Start Frame</button>
              <button type="button" onClick={seekTimelineEnd} disabled={!timelineClips.length} title="Đưa playhead tới frame cuối của toàn timeline" className="rounded border border-slate-700 px-2 py-1 text-[11px] hover:border-slate-500 disabled:opacity-40">End Frame</button>
              <button type="button" onClick={setCutFrom} disabled={!timelineClips.length} title="Đặt frame hiện tại trên timeline làm đầu range" className="rounded border border-amber-400/40 px-2 py-1 text-[11px] text-amber-200 hover:bg-amber-400/10 disabled:opacity-40">Cut From Frame</button>
              <button type="button" onClick={setCutTo} disabled={!timelineClips.length} title="Đặt frame hiện tại trên timeline làm cuối range" className="rounded border border-amber-400/40 px-2 py-1 text-[11px] text-amber-200 hover:bg-amber-400/10 disabled:opacity-40">Cut To Frame</button>
              <label
                className="inline-flex items-center gap-1 text-[10px] text-slate-300"
                title="Cut From lùi về keyframe trước đó; Cut To kết thúc ngay trước keyframe tiếp theo để tăng khả năng stream-copy."
              >
                <input
                  type="checkbox"
                  checked={preferKeyframeCuts}
                  onChange={(event) => setPreferKeyframeCuts(event.target.checked)}
                  className="accent-amber-400"
                  aria-label="Ưu tiên keyframe để giảm encode"
                />
                Ưu tiên keyframe
              </label>
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
                    Kéo video từ cột trái vào đây · các clip sẽ tự xếp nối tiếp, không có gap
                  </div>
                ) : (
                  timelineClips.map((clip) => {
                    const clipWidth = clip.duration * zoom;
                    return (
                      <div
                        key={clip.sourceId}
                        data-timeline-clip
                        onClick={(event) => {
                          event.stopPropagation();
                          setSelectedQueueId(null);
                          setActiveSourceId(clip.sourceId);
                          const localOffset = Math.max(0, (event.clientX - event.currentTarget.getBoundingClientRect().left) / zoom);
                          seekGlobal(clip.start + Math.min(clip.duration, localOffset));
                        }}
                        className={`absolute left-0 top-10 flex h-16 cursor-pointer items-center overflow-hidden border-y border-r text-left ${clipWidth >= 52 ? "px-2 pr-8" : clipWidth >= 20 ? "px-0.5" : "px-0"} ${activeSourceId === clip.sourceId ? "border-sky-300 bg-sky-500/25 text-sky-100" : "border-slate-600 bg-slate-700/60 text-slate-200 hover:bg-slate-600/70"}`}
                        style={{ left: `${clip.start * zoom}px`, width: `${clipWidth}px` }}
                        title={`${clip.source.fileName} · ${clip.source.frameCount} frames · ${clip.source.frameRate.toFixed(3)} fps`}
                      >
                        {clipWidth >= 20 && <Film className="h-3.5 w-3.5 shrink-0" />}
                        {clipWidth >= 72 && (
                          <>
                            <span className="truncate text-[11px] font-medium">{clip.source.fileName}</span>
                            <span className="ml-auto shrink-0 pl-1 font-mono text-[9px] opacity-70">{clip.source.frameCount}f</span>
                          </>
                        )}
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
                    <div className="absolute left-0 top-28 h-8 w-full border-y border-slate-800 bg-slate-900/40">
                      <span className="absolute left-2 top-1 z-10 rounded bg-slate-950/80 px-1 text-[9px] text-slate-500">
                        QUEUE
                      </span>
                      {queue.map((range, index) => {
                        const bounds = getJoinSplitRangeTimelineBounds(
                          getJoinSplitRangeSegments(range),
                          timelineClips.map((clip) => ({
                            sourceId: clip.sourceId,
                            start: clip.start,
                            end: clip.end,
                            frameRate: clip.source.frameRate,
                            frameCount: clip.source.frameCount,
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
              <button type="button" onClick={() => void joinTimeline()} disabled={timelineSourceIds.length < 2 || !referenceSourceId || joining || exporting} className="rounded border border-sky-400/40 px-2.5 py-1.5 text-[10px] font-semibold text-sky-200 hover:bg-sky-950/40 disabled:opacity-40">
                {joining ? "Đang ghép…" : "Join Timeline"}
              </button>
              {timelineJoinOutput && (
                <a
                  href={`${API}/exports/${encodeURIComponent(timelineJoinOutput.id)}/download`}
                  download={timelineJoinOutput.fileName}
                  className="rounded border border-sky-400/30 px-2 py-1.5 text-[10px] text-sky-200 hover:bg-sky-950/40"
                  title={timelineJoinOutput.fileName}
                >
                  Tải video ghép
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
                    sourceId: clip.sourceId,
                    start: clip.start,
                    end: clip.end,
                    frameRate: clip.source.frameRate,
                    frameCount: clip.source.frameCount,
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
