import {
  useCallback,
  useEffect,
  useMemo,
  useRef,
  useState,
  type PointerEvent as ReactPointerEvent,
  type RefObject,
} from "react";
import { CirclePlus, Minus, Plus, Waves } from "lucide-react";
import type { EditableSubtitleCue } from "../../utils/subtitleEditor";
import { Paper, Stack, Typography } from "@mui/material";

type SubtitleTimelineProps = {
  file: File | null;
  duration: number;
  currentTime: number;
  isPlaying?: boolean;
  videoRef?: RefObject<HTMLVideoElement | null>;
  fps?: number;
  onFpsChange?: (fps: number) => void;
  cues: EditableSubtitleCue[];
  selectedCueIndex: number;
  disabled?: boolean;
  onCueChange: (index: number, patch: Partial<EditableSubtitleCue>) => void;
  onCueSelect: (index: number) => void;
  onSeek: (time: number) => void;
  onAddCue: () => void;
};

type Waveform = { peaks: number[]; duration: number };
type DragState = {
  cueIndex: number;
  mode: "move" | "start" | "end";
  pointerId: number;
  startX: number;
  originalStart: number;
  originalEnd: number;
  hasMoved: boolean;
};

const CUE_DRAG_THRESHOLD_PX = 4;

function formatTimelineTime(seconds: number): string {
  const wholeSeconds = Math.max(0, Math.floor(seconds));
  const hours = Math.floor(wholeSeconds / 3600);
  const minutes = Math.floor((wholeSeconds % 3600) / 60);
  const remaining = wholeSeconds % 60;
  return hours
    ? `${hours}:${String(minutes).padStart(2, "0")}:${String(remaining).padStart(2, "0")}`
    : `${minutes}:${String(remaining).padStart(2, "0")}`;
}

function getTickInterval(pixelsPerSecond: number, duration: number): number {
  const intervals = [
    0.25, 0.5, 1, 2, 5, 10, 15, 30, 60, 120, 300, 600, 1800, 3600,
  ];
  return (
    intervals.find(
      (interval) =>
        interval * pixelsPerSecond >= 70 && duration / interval <= 1500,
    ) ?? 3600
  );
}

export default function SubtitleTimeline({
  file,
  duration,
  currentTime,
  isPlaying = false,
  videoRef,
  fps = 60,
  onFpsChange,
  cues,
  selectedCueIndex,
  disabled = false,
  onCueChange,
  onCueSelect,
  onSeek,
  onAddCue,
}: SubtitleTimelineProps) {
  const scrollRef = useRef<HTMLDivElement>(null);
  const waveformCanvasRef = useRef<HTMLCanvasElement>(null);
  const playheadWaveformRef = useRef<HTMLDivElement>(null);
  const playheadLanesRef = useRef<HTMLDivElement>(null);
  const liveTimeRef = useRef<number | null>(null);
  const dragRef = useRef<DragState | null>(null);
  const seekPointerIdRef = useRef<number | null>(null);
  const [waveform, setWaveform] = useState<Waveform | null>(null);
  const [waveformStatus, setWaveformStatus] = useState<
    "loading" | "ready" | "unavailable"
  >("loading");
  const [waveformError, setWaveformError] = useState("");
  const [pixelsPerSecond, setPixelsPerSecond] = useState(32);
  const [scrollLeft, setScrollLeft] = useState(0);
  const [viewportWidth, setViewportWidth] = useState(0);

  const timelineDuration = Math.max(
    cues.reduce(
      (latest, cue) => Math.max(latest, cue.endTime),
      duration > 0 && Number.isFinite(duration) ? duration : 0,
    ),
    1,
  );
  const timelineWidth = Math.max(600, timelineDuration * pixelsPerSecond);
  const tickInterval = getTickInterval(pixelsPerSecond, timelineDuration);
  const tickCount = Math.ceil(timelineDuration / tickInterval);
  const laneByCue = useMemo(() => {
    const laneEnds: number[] = [];
    const lanes = new Array<number>(cues.length).fill(0);
    const ordered = cues
      .map((cue, index) => ({ cue, index }))
      .sort((a, b) => a.cue.startTime - b.cue.startTime);
    for (const { cue, index } of ordered) {
      let lane = laneEnds.findIndex((end) => end <= cue.startTime);
      if (lane < 0) lane = laneEnds.length;
      laneEnds[lane] = cue.endTime;
      lanes[index] = lane;
    }
    return { lanes, count: Math.max(1, laneEnds.length) };
  }, [cues]);

  useEffect(() => {
    if (!file) {
      setWaveform(null);
      setWaveformStatus("unavailable");
      return;
    }
    let disposed = false;
    let audioContext: AudioContext | null = null;
    setWaveform(null);
    setWaveformStatus("loading");
    setWaveformError("");

    void (async () => {
      try {
        const AudioContextConstructor = window.AudioContext;
        if (!AudioContextConstructor)
          throw new Error("Trình duyệt không hỗ trợ giải mã âm thanh.");
        audioContext = new AudioContextConstructor();
        const audioBuffer = await audioContext.decodeAudioData(
          await file.arrayBuffer(),
        );
        const peakCount = Math.max(
          1,
          Math.min(6000, Math.ceil(audioBuffer.duration * 8)),
        );
        const peaks = new Array<number>(peakCount).fill(0);
        for (
          let channelIndex = 0;
          channelIndex < audioBuffer.numberOfChannels;
          channelIndex += 1
        ) {
          const samples = audioBuffer.getChannelData(channelIndex);
          for (let peakIndex = 0; peakIndex < peakCount; peakIndex += 1) {
            const start = Math.floor((peakIndex * samples.length) / peakCount);
            const end = Math.max(
              start + 1,
              Math.floor(((peakIndex + 1) * samples.length) / peakCount),
            );
            let peak = 0;
            for (let sampleIndex = start; sampleIndex < end; sampleIndex += 1) {
              peak = Math.max(peak, Math.abs(samples[sampleIndex]));
            }
            peaks[peakIndex] = Math.max(peaks[peakIndex], peak);
          }
        }
        if (!disposed) {
          setWaveform({ peaks, duration: audioBuffer.duration });
          setWaveformStatus("ready");
        }
      } catch (error) {
        if (!disposed) {
          setWaveformStatus("unavailable");
          setWaveformError(
            error instanceof Error ? error.message : String(error),
          );
        }
      } finally {
        if (audioContext && audioContext.state !== "closed")
          void audioContext.close();
      }
    })();

    return () => {
      disposed = true;
      if (audioContext && audioContext.state !== "closed")
        void audioContext.close();
    };
  }, [file]);

  useEffect(() => {
    const container = scrollRef.current;
    if (!container) return;
    const observer = new ResizeObserver(() =>
      setViewportWidth(container.clientWidth),
    );
    observer.observe(container);
    setViewportWidth(container.clientWidth);
    return () => observer.disconnect();
  }, []);

  const drawWaveform = useCallback(
    (targetScrollLeft: number) => {
      const canvas = waveformCanvasRef.current;
      if (!canvas || viewportWidth <= 0) return;
      const pixelRatio = window.devicePixelRatio || 1;
      const height = 62;
      const targetWidth = Math.round(viewportWidth * pixelRatio);
      const targetHeight = Math.round(height * pixelRatio);
      if (canvas.width !== targetWidth || canvas.height !== targetHeight) {
        canvas.width = targetWidth;
        canvas.height = targetHeight;
        canvas.style.width = `${viewportWidth}px`;
        canvas.style.height = `${height}px`;
      }
      const context = canvas.getContext("2d");
      if (!context) return;
      context.setTransform(pixelRatio, 0, 0, pixelRatio, 0, 0);
      context.clearRect(0, 0, viewportWidth, height);
      context.strokeStyle = "rgba(34, 211, 238, 0.75)";
      context.lineWidth = 1;
      context.beginPath();
      context.moveTo(0, height / 2);
      context.lineTo(viewportWidth, height / 2);
      context.stroke();
      if (!waveform) return;

      const firstVisibleTime = targetScrollLeft / pixelsPerSecond;
      const secondsPerPixel = 1 / pixelsPerSecond;
      const sampleStep = waveform.duration / waveform.peaks.length;
      const center = height / 2;
      context.strokeStyle = "rgba(103, 232, 249, 0.72)";
      context.beginPath();
      for (let x = 0; x < viewportWidth; x += 2) {
        const time = firstVisibleTime + x * secondsPerPixel;
        const sampleIndex = Math.floor(time / sampleStep);
        const peak = waveform.peaks[sampleIndex] || 0;
        const amplitude = Math.max(1, peak * (height * 0.46));
        context.moveTo(x + 0.5, center - amplitude);
        context.lineTo(x + 0.5, center + amplitude);
      }
      context.stroke();
    },
    [pixelsPerSecond, viewportWidth, waveform],
  );

  useEffect(() => {
    drawWaveform(scrollLeft);
  }, [drawWaveform, scrollLeft]);

  const updateScroll = () => {
    const container = scrollRef.current;
    if (!container) return;
    if (isPlaying && !dragRef.current && seekPointerIdRef.current === null) {
      return;
    }
    setScrollLeft(container.scrollLeft);
  };

  useEffect(() => {
    if (isPlaying) return;
    if (dragRef.current || seekPointerIdRef.current !== null) return;
    const container = scrollRef.current;
    if (!container || viewportWidth <= 0) return;

    const playheadX = Math.max(
      0,
      Math.min(timelineWidth, currentTime * pixelsPerSecond),
    );
    const maxScroll = Math.max(0, timelineWidth - viewportWidth);
    const targetScrollLeft = Math.max(
      0,
      Math.min(maxScroll, playheadX - viewportWidth / 2),
    );
    if (Math.abs(container.scrollLeft - targetScrollLeft) >= 1) {
      container.scrollLeft = targetScrollLeft;
      setScrollLeft(targetScrollLeft);
    }
  }, [currentTime, isPlaying, pixelsPerSecond, timelineWidth, viewportWidth]);

  useEffect(() => {
    if (!isPlaying) return;
    const video = videoRef?.current;
    const container = scrollRef.current;
    if (!video || !container || viewportWidth <= 0) return;

    let rafId = 0;
    let lastFrameAt = 0;
    let lastMediaTime = video.currentTime;
    let lastMediaPerfNow = performance.now();

    const step = (now: number) => {
      if (video.paused || video.ended) return;
      const clampedFps = Math.max(1, Math.min(120, fps || 60));
      const minInterval = 1000 / clampedFps;

      if (clampedFps >= 60 || now - lastFrameAt >= minInterval) {
        lastFrameAt = now;
        const rawTime = video.currentTime;
        let displayTime = rawTime;
        if (rawTime !== lastMediaTime) {
          lastMediaTime = rawTime;
          lastMediaPerfNow = now;
        } else {
          const deltaSec =
            ((now - lastMediaPerfNow) / 1000) * (video.playbackRate || 1);
          const maxTime =
            Number.isFinite(video.duration) && video.duration > 0
              ? video.duration
              : timelineDuration;
          displayTime = Math.min(
            maxTime,
            lastMediaTime + Math.min(Math.max(0, deltaSec), 0.35),
          );
        }

        const playheadX = Math.max(
          0,
          Math.min(timelineWidth, displayTime * pixelsPerSecond),
        );
        liveTimeRef.current = displayTime;
        const leftCss = `${playheadX}px`;
        if (playheadWaveformRef.current) {
          playheadWaveformRef.current.style.left = leftCss;
        }
        if (playheadLanesRef.current) {
          playheadLanesRef.current.style.left = leftCss;
        }

        if (!dragRef.current && seekPointerIdRef.current === null) {
          const maxScroll = Math.max(0, timelineWidth - viewportWidth);
          const targetScrollLeft = Math.max(
            0,
            Math.min(maxScroll, playheadX - viewportWidth / 2),
          );
          if (Math.abs(container.scrollLeft - targetScrollLeft) >= 1) {
            container.scrollLeft = targetScrollLeft;
            drawWaveform(targetScrollLeft);
          }
        }
      }

      rafId = window.requestAnimationFrame(step);
    };

    rafId = window.requestAnimationFrame(step);
    return () => {
      window.cancelAnimationFrame(rafId);
      liveTimeRef.current = null;
      setScrollLeft(container.scrollLeft);
    };
  }, [
    drawWaveform,
    fps,
    isPlaying,
    pixelsPerSecond,
    timelineDuration,
    timelineWidth,
    videoRef,
    viewportWidth,
  ]);

  useEffect(() => {
    const container = scrollRef.current;
    if (!container) return;
    const handleWheel = (event: WheelEvent) => {
      if (!event.ctrlKey && !event.shiftKey) return;
      event.preventDefault();
      event.stopPropagation();
      if (event.ctrlKey) {
        const bounds = container.getBoundingClientRect();
        const pointerX = event.clientX - bounds.left;
        const anchoredTime =
          (container.scrollLeft + pointerX) / pixelsPerSecond;
        const nextPixelsPerSecond = Math.max(
          8,
          Math.min(160, pixelsPerSecond + (event.deltaY < 0 ? 8 : -8)),
        );
        if (nextPixelsPerSecond === pixelsPerSecond) return;
        setPixelsPerSecond(nextPixelsPerSecond);
        window.requestAnimationFrame(() => {
          container.scrollLeft = Math.max(
            0,
            anchoredTime * nextPixelsPerSecond - pointerX,
          );
          setScrollLeft(container.scrollLeft);
        });
        return;
      }
      container.scrollLeft += event.deltaY || event.deltaX;
      setScrollLeft(container.scrollLeft);
    };
    container.addEventListener("wheel", handleWheel, { passive: false });
    return () => container.removeEventListener("wheel", handleWheel);
  }, [pixelsPerSecond]);

  const seekAtPointer = (event: ReactPointerEvent<HTMLDivElement>) => {
    const container = scrollRef.current;
    if (!container) return;
    const bounds = event.currentTarget.getBoundingClientRect();
    const time = (event.clientX - bounds.left) / pixelsPerSecond;
    onSeek(Math.max(0, Math.min(timelineDuration, time)));
  };

  const handleSeekPointerDown = (event: ReactPointerEvent<HTMLDivElement>) => {
    if (
      disabled ||
      event.button !== 0 ||
      (event.target as HTMLElement).closest("[data-cue-block]")
    )
      return;
    event.preventDefault();
    event.currentTarget.setPointerCapture(event.pointerId);
    seekPointerIdRef.current = event.pointerId;
    seekAtPointer(event);
  };

  const handleSeekPointerMove = (event: ReactPointerEvent<HTMLDivElement>) => {
    if (seekPointerIdRef.current === event.pointerId) seekAtPointer(event);
  };

  const handleSeekPointerUp = (event: ReactPointerEvent<HTMLDivElement>) => {
    if (seekPointerIdRef.current !== event.pointerId) return;
    seekPointerIdRef.current = null;
    if (event.currentTarget.hasPointerCapture(event.pointerId))
      event.currentTarget.releasePointerCapture(event.pointerId);
  };

  const handlePointerDown = (
    event: ReactPointerEvent<HTMLElement>,
    cueIndex: number,
    mode: DragState["mode"],
  ) => {
    if (disabled || event.button !== 0) return;
    const cue = cues[cueIndex];
    if (!cue) return;
    event.preventDefault();
    event.stopPropagation();
    event.currentTarget.setPointerCapture(event.pointerId);
    dragRef.current = {
      cueIndex,
      mode,
      pointerId: event.pointerId,
      startX: event.clientX,
      originalStart: cue.startTime,
      originalEnd: cue.endTime,
      hasMoved: false,
    };
    onCueSelect(cueIndex);
  };

  const handlePointerMove = (event: ReactPointerEvent<HTMLElement>) => {
    const drag = dragRef.current;
    if (!drag || drag.pointerId !== event.pointerId) return;
    if (!drag.hasMoved) {
      if (Math.abs(event.clientX - drag.startX) < CUE_DRAG_THRESHOLD_PX) return;
      drag.hasMoved = true;
    }
    const delta = (event.clientX - drag.startX) / pixelsPerSecond;
    const length = drag.originalEnd - drag.originalStart;
    if (drag.mode === "move") {
      const startTime = Math.max(
        0,
        Math.min(timelineDuration - length, drag.originalStart + delta),
      );
      onCueChange(drag.cueIndex, { startTime, endTime: startTime + length });
    } else if (drag.mode === "start") {
      onCueChange(drag.cueIndex, {
        startTime: Math.max(
          0,
          Math.min(drag.originalEnd - 0.01, drag.originalStart + delta),
        ),
      });
    } else {
      const maximumEnd = duration > 0 ? duration : Number.POSITIVE_INFINITY;
      onCueChange(drag.cueIndex, {
        endTime: Math.max(
          drag.originalStart + 0.01,
          Math.min(maximumEnd, drag.originalEnd + delta),
        ),
      });
    }
  };

  const handlePointerUp = (event: ReactPointerEvent<HTMLElement>) => {
    const drag = dragRef.current;
    if (drag?.pointerId === event.pointerId) {
      dragRef.current = null;
      if (event.currentTarget.hasPointerCapture(event.pointerId))
        event.currentTarget.releasePointerCapture(event.pointerId);
    }
  };

  const handleZoom = (change: number) => {
    setPixelsPerSecond((current) =>
      Math.max(8, Math.min(160, current + change)),
    );
  };

  return (
    <section className="overflow-hidden rounded-none border-t border-slate-800  shadow-none">
      <div className="flex flex-wrap items-center justify-between gap-2 border-b border-slate-800 px-3 py-2">
        <div className="flex items-center gap-2">
          <Waves className="h-3.5 w-3.5 text-cyan-300" />
          <h2 className="text-xs font-bold text-white">Subtitle Timeline</h2>
          <span className="text-[10px] text-slate-500">
            {cues.length} câu · kéo playhead để tua, kéo khối hoặc mép để chỉnh
            thời gian
          </span>
        </div>
        <div className="flex items-center gap-1">
          {onFpsChange && (
            <label
              className="mr-2 flex items-center gap-1 text-[10px] text-slate-400"
              title="Số frame cập nhật mỗi giây (FPS) cho playhead & timeline"
            >
              <span>FPS</span>
              <input
                type="number"
                min={1}
                max={120}
                value={fps}
                onChange={(e) => {
                  const next = Number(e.target.value);
                  if (Number.isFinite(next)) {
                    onFpsChange(Math.max(1, Math.min(120, Math.round(next))));
                  }
                }}
                aria-label="Số frame cập nhật mỗi giây"
                className="w-12 rounded-none border border-slate-700 bg-slate-950 px-1.5 py-0.5 text-center font-mono text-[10px] text-cyan-200 focus:border-cyan-400 focus:outline-none"
              />
            </label>
          )}
          <button
            type="button"
            onClick={onAddCue}
            disabled={disabled}
            aria-label="Thêm phụ đề tại thời điểm hiện tại"
            title="Thêm phụ đề tại thời điểm hiện tại"
            className="mr-1 rounded-none border border-cyan-500/30 bg-cyan-500/10 p-1 text-cyan-200 hover:border-cyan-400 hover:bg-cyan-500/20 disabled:opacity-40 cursor-pointer"
          >
            <CirclePlus className="h-3.5 w-3.5" />
          </button>
          <button
            type="button"
            onClick={() => handleZoom(-8)}
            disabled={pixelsPerSecond <= 8}
            aria-label="Thu nhỏ timeline"
            className="rounded-none border border-slate-700 p-1 text-slate-300 hover:border-cyan-500/50 disabled:opacity-40 cursor-pointer"
          >
            <Minus className="h-3 w-3" />
          </button>
          <span className="min-w-12 text-center font-mono text-[10px] text-slate-400">
            {Math.round(pixelsPerSecond)} px/s
          </span>
          <button
            type="button"
            onClick={() => handleZoom(8)}
            disabled={pixelsPerSecond >= 160}
            aria-label="Phóng to timeline"
            className="rounded-none border border-slate-700 p-1 text-slate-300 hover:border-cyan-500/50 disabled:opacity-40 cursor-pointer"
          >
            <Plus className="h-3 w-3" />
          </button>
        </div>
      </div>
      <div
        ref={scrollRef}
        onScroll={updateScroll}
        className="overflow-x-auto overscroll-x-contain scrollbar-thin"
      >
        <Stack
          sx={(theme) => {
            return {
              position: "relative",
              minHeight: "148px",
              width: `${timelineWidth}px`,
              background: theme.palette.background.default,
            };
          }}
        >
          <div
            onPointerDown={handleSeekPointerDown}
            onPointerMove={handleSeekPointerMove}
            onPointerUp={handleSeekPointerUp}
            onPointerCancel={handleSeekPointerUp}
            className="relative h-7 cursor-ew-resize touch-none border-b border-slate-800 bg-slate-900/70"
          >
            {Array.from(
              { length: tickCount + 1 },
              (_, index) => index * tickInterval,
            ).map((time) => (
              <div
                key={time}
                className="absolute inset-y-0 border-l border-slate-700/70 pl-1.5 pt-1 "
                style={{ left: `${time * pixelsPerSecond}px` }}
              >
                <Typography variant="body2">
                  {formatTimelineTime(time)}
                </Typography>
              </div>
            ))}
          </div>
          <div
            onPointerDown={handleSeekPointerDown}
            onPointerMove={handleSeekPointerMove}
            onPointerUp={handleSeekPointerUp}
            onPointerCancel={handleSeekPointerUp}
            className="relative h-[62px] cursor-ew-resize touch-none border-b border-slate-800/80"
          >
            <canvas
              ref={waveformCanvasRef}
              className="pointer-events-none sticky left-0 block"
            />
            {waveformStatus === "loading" && (
              <span className="pointer-events-none sticky left-3 top-0 text-[9px] text-slate-500">
                Đang tạo waveform…
              </span>
            )}
            {waveformStatus === "unavailable" && file && (
              <span
                title={waveformError}
                className="pointer-events-none sticky left-3 top-0 text-[9px] text-amber-400/80"
              >
                Waveform không khả dụng:{" "}
                {waveformError || "không có dữ liệu âm thanh"}
              </span>
            )}
            {(() => {
              const displayPlayheadTime =
                isPlaying && liveTimeRef.current !== null
                  ? liveTimeRef.current
                  : currentTime;
              return (
                displayPlayheadTime >= 0 &&
                displayPlayheadTime <= timelineDuration && (
                  <div
                    ref={playheadWaveformRef}
                    className="pointer-events-none absolute inset-y-0 z-10 border-l border-rose-400/80"
                    style={{ left: `${displayPlayheadTime * pixelsPerSecond}px` }}
                  />
                )
              );
            })()}
          </div>
          <div
            className="relative"
            style={{ height: `${Math.max(48, laneByCue.count * 36 + 8)}px` }}
          >
            {cues.map((cue, index) => {
              const left = Math.max(0, cue.startTime * pixelsPerSecond);
              const width = Math.max(
                6,
                (cue.endTime - cue.startTime) * pixelsPerSecond,
              );
              const lane = laneByCue.lanes[index] || 0;
              return (
                <div
                  key={index}
                  role="button"
                  tabIndex={disabled ? -1 : 0}
                  aria-label={`Phụ đề ${index + 1}: ${formatTimelineTime(cue.startTime)} đến ${formatTimelineTime(cue.endTime)}`}
                  aria-pressed={selectedCueIndex === index}
                  data-cue-block
                  onPointerDown={(event) =>
                    handlePointerDown(event, index, "move")
                  }
                  onPointerMove={handlePointerMove}
                  onPointerUp={handlePointerUp}
                  onPointerCancel={handlePointerUp}
                  onKeyDown={(event) => {
                    if (event.key === "Enter" || event.key === " ") {
                      event.preventDefault();
                      onCueSelect(index);
                    }
                  }}
                  className={`group absolute flex h-7 items-center overflow-hidden rounded-none border text-left text-[9px] select-none touch-none cursor-pointer ${disabled ? "cursor-not-allowed opacity-60" : "cursor-grab active:cursor-grabbing"} ${selectedCueIndex === index ? "z-[2] border-cyan-300 bg-cyan-500/35 text-white shadow-[0_0_10px_rgba(34,211,238,0.2)]" : "border-violet-400/50 bg-violet-600/30 text-violet-100 hover:bg-violet-500/40"}`}
                  style={{
                    left: `${left}px`,
                    top: `${lane * 36 + 4}px`,
                    width: `${width}px`,
                  }}
                  title={`${formatTimelineTime(cue.startTime)} → ${formatTimelineTime(cue.endTime)} · ${cue.text}`}
                >
                  <span
                    onPointerDown={(event) => {
                      event.stopPropagation();
                      handlePointerDown(event, index, "start");
                    }}
                    className="absolute inset-y-0 left-0 z-[3] w-1.5 cursor-ew-resize bg-cyan-200/50 hover:bg-cyan-100"
                    aria-hidden="true"
                  />
                  <span className="truncate px-2">
                    {index + 1}. {cue.text}
                  </span>
                  <span
                    onPointerDown={(event) => {
                      event.stopPropagation();
                      handlePointerDown(event, index, "end");
                    }}
                    className="absolute inset-y-0 right-0 z-[3] w-1.5 cursor-ew-resize bg-cyan-200/50 hover:bg-cyan-100"
                    aria-hidden="true"
                  />
                </div>
              );
            })}
          </div>
          {(() => {
            const displayPlayheadTime =
              isPlaying && liveTimeRef.current !== null
                ? liveTimeRef.current
                : currentTime;
            return (
              displayPlayheadTime >= 0 &&
              displayPlayheadTime <= timelineDuration && (
                <div
                  ref={playheadLanesRef}
                  className="pointer-events-none absolute inset-y-0 z-[3] border-l border-rose-400/80"
                  style={{ left: `${displayPlayheadTime * pixelsPerSecond}px` }}
                />
              )
            );
          })()}
        </Stack>
      </div>
    </section>
  );
}
