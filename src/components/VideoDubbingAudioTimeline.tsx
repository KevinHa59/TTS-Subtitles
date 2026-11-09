import {
  useEffect,
  useRef,
  useState,
  type MouseEvent as ReactMouseEvent,
} from "react";
import { LoaderCircle, Minus, Plus, Scissors, Volume2, VolumeX, Waves } from "lucide-react";
import type {
  VideoDubbingMasterEditState,
  VideoDubbingMixerSettings,
  VideoDubbingMixerTrack,
} from "../types/videoDubbing";

interface AudioTrack {
  key: VideoDubbingMixerTrack;
  label: string;
  url?: string;
}

interface VideoDubbingAudioTimelineProps {
  jobId: string;
  duration: number;
  currentTime: number;
  zoom: number;
  onZoomChange: (zoom: number) => void;
  onSeek: (time: number) => void;
  vocalsAvailable: boolean;
  instrumentalAvailable: boolean;
  ttsMasterAvailable: boolean;
  ttsMasterVersion: number;
  mixerSettings: VideoDubbingMixerSettings;
  onToggleMute: (track: VideoDubbingMixerTrack) => void;
  masterEdit?: VideoDubbingMasterEditState;
  onSplitMaster: () => Promise<void>;
  onMergeMaster: () => Promise<void>;
  onMoveMasterClip: (clips: VideoDubbingMasterEditState["clips"]) => Promise<void>;
}

type TrackWaveform = {
  status: "loading" | "ready" | "missing" | "unavailable";
  peaks?: number[];
  duration?: number;
  error?: string;
};

const TRACK_HEIGHT = 64;

function formatTimelineTime(seconds: number): string {
  const wholeSeconds = Math.max(0, Math.floor(seconds));
  const hours = Math.floor(wholeSeconds / 3600);
  const minutes = Math.floor((wholeSeconds % 3600) / 60);
  const remaining = wholeSeconds % 60;
  return hours
    ? `${hours}:${String(minutes).padStart(2, "0")}:${String(remaining).padStart(2, "0")}`
    : `${minutes}:${String(remaining).padStart(2, "0")}`;
}

function getWaveformPeaks(audioBuffer: AudioBuffer): number[] {
  const peakCount = Math.max(1, Math.min(6000, Math.ceil(audioBuffer.duration * 8)));
  const peaks = new Array<number>(peakCount).fill(0);
  for (let channelIndex = 0; channelIndex < audioBuffer.numberOfChannels; channelIndex += 1) {
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
  return peaks;
}

export default function VideoDubbingAudioTimeline({
  jobId,
  duration,
  currentTime,
  zoom,
  onZoomChange,
  onSeek,
  vocalsAvailable,
  instrumentalAvailable,
  ttsMasterAvailable,
  ttsMasterVersion,
  mixerSettings,
  onToggleMute,
  masterEdit,
  onSplitMaster,
  onMergeMaster,
  onMoveMasterClip,
}: VideoDubbingAudioTimelineProps) {
  const scrollRef = useRef<HTMLDivElement>(null);
  const canvasRefs = useRef<Array<HTMLCanvasElement | null>>([]);
  const wheelSettingsRef = useRef({ zoom, onZoomChange });
  wheelSettingsRef.current = { zoom, onZoomChange };
  const [scrollLeft, setScrollLeft] = useState(0);
  const [viewportWidth, setViewportWidth] = useState(0);
  const [masterEditBusy, setMasterEditBusy] = useState(false);
  const [masterEditActionError, setMasterEditActionError] = useState<string | null>(null);
  const [draggingClip, setDraggingClip] = useState<{
    id: string;
    pointerX: number;
    startTime: number;
  } | null>(null);
  const [clipPositions, setClipPositions] = useState<Record<string, number>>({});
  const [waveforms, setWaveforms] = useState<Record<AudioTrack["key"], TrackWaveform>>({
    vocals: { status: "missing" },
    instrumental: { status: "missing" },
    ttsMaster: { status: "missing" },
  });

  const timelineDuration = Math.max(1, Number.isFinite(duration) ? duration : 0);
  const timelineWidth = Math.max(720, timelineDuration * zoom);
  const tickStep = Math.max(5, Math.ceil(timelineDuration / 12 / 5) * 5);
  const ticks = Array.from(
    { length: Math.floor(timelineDuration / tickStep) + 1 },
    (_, index) => index * tickStep,
  );
  const vocalsUrl = vocalsAvailable
    ? `/api/video-dubbing/jobs/${jobId}/separation/vocals`
    : undefined;
  const instrumentalUrl = instrumentalAvailable
    ? `/api/video-dubbing/jobs/${jobId}/separation/instrumental`
    : undefined;
  const ttsMasterUrl = ttsMasterAvailable
    ? masterEdit?.clips.length
      ? `/api/video-dubbing/jobs/${jobId}/master-edit/preview?v=${masterEdit.updatedAt}`
      : `/api/video-dubbing/jobs/${jobId}/master-audio?v=${ttsMasterVersion}`
    : undefined;

  useEffect(() => {
    const tracks: AudioTrack[] = [
      { key: "vocals", label: "Voice đã tách", url: vocalsUrl },
      { key: "ttsMaster", label: "TTS Master", url: ttsMasterUrl },
      { key: "instrumental", label: "Nhạc nền (instrumental)", url: instrumentalUrl },
    ];
    const controller = new AbortController();
    let disposed = false;
    let audioContext: AudioContext | null = null;
    setWaveforms({
      vocals: { status: vocalsUrl ? "loading" : "missing" },
      instrumental: { status: instrumentalUrl ? "loading" : "missing" },
      ttsMaster: { status: ttsMasterUrl ? "loading" : "missing" },
    });

    void (async () => {
      try {
        if (tracks.some((track) => track.url)) {
          if (!window.AudioContext) {
            throw new Error("Trình duyệt không hỗ trợ giải mã âm thanh.");
          }
          audioContext = new window.AudioContext();
        }
        for (const track of tracks) {
          if (!track.url || !audioContext) continue;
          try {
            const response = await fetch(track.url, {
              cache: "no-store",
              signal: controller.signal,
            });
            if (!response.ok) {
              throw new Error(`Tải audio thất bại (${response.status}).`);
            }
            const audioBuffer = await audioContext.decodeAudioData(
              await response.arrayBuffer(),
            );
            const peaks = getWaveformPeaks(audioBuffer);
            if (!disposed) {
              setWaveforms((current) => ({
                ...current,
                [track.key]: {
                  status: "ready",
                  peaks,
                  duration: audioBuffer.duration,
                },
              }));
            }
          } catch (error) {
            if (controller.signal.aborted) return;
            if (!disposed) {
              setWaveforms((current) => ({
                ...current,
                [track.key]: {
                  status: "unavailable",
                  error: error instanceof Error ? error.message : String(error),
                },
              }));
            }
          }
        }
      } catch (error) {
        if (!disposed && !controller.signal.aborted) {
          const message = error instanceof Error ? error.message : String(error);
          setWaveforms((current) => ({
            vocals:
              current.vocals.status === "loading"
                ? { status: "unavailable", error: message }
                : current.vocals,
            instrumental:
              current.instrumental.status === "loading"
                ? { status: "unavailable", error: message }
                : current.instrumental,
            ttsMaster:
              current.ttsMaster.status === "loading"
                ? { status: "unavailable", error: message }
                : current.ttsMaster,
          }));
        }
      } finally {
        if (audioContext && audioContext.state !== "closed") {
          await audioContext.close();
        }
      }
    })();

    return () => {
      disposed = true;
      controller.abort();
      if (audioContext && audioContext.state !== "closed") {
        void audioContext.close();
      }
    };
  }, [jobId, instrumentalUrl, ttsMasterUrl, vocalsUrl]);

  useEffect(() => {
    const container = scrollRef.current;
    if (!container) return;
    const observer = new ResizeObserver(() => setViewportWidth(container.clientWidth));
    observer.observe(container);
    setViewportWidth(container.clientWidth);
    return () => observer.disconnect();
  }, []);

  useEffect(() => {
    for (const [index, key] of ["vocals", "ttsMaster", "instrumental"].entries()) {
      const canvas = canvasRefs.current[index];
      if (!canvas || viewportWidth <= 0) continue;
      const pixelRatio = window.devicePixelRatio || 1;
      canvas.width = Math.round(viewportWidth * pixelRatio);
      canvas.height = Math.round(TRACK_HEIGHT * pixelRatio);
      canvas.style.width = `${viewportWidth}px`;
      canvas.style.height = `${TRACK_HEIGHT}px`;
      const context = canvas.getContext("2d");
      if (!context) continue;
      context.setTransform(pixelRatio, 0, 0, pixelRatio, 0, 0);
      context.clearRect(0, 0, viewportWidth, TRACK_HEIGHT);
      const center = TRACK_HEIGHT / 2;
      const waveform = waveforms[key as AudioTrack["key"]];
      if (waveform.status !== "ready" || !waveform.peaks?.length) continue;
      const secondsPerPixel = 1 / zoom;
      const sampleStep = (waveform.duration || timelineDuration) / waveform.peaks.length;
      context.strokeStyle =
        key === "vocals"
          ? "rgba(167, 139, 250, 0.8)"
          : key === "instrumental"
            ? "rgba(251, 191, 36, 0.8)"
            : "rgba(103, 232, 249, 0.8)";
      context.lineWidth = 1;
      context.beginPath();
      for (let x = 0; x < viewportWidth; x += 2) {
        const time = (scrollLeft + x) * secondsPerPixel;
        const sampleIndex = Math.floor(time / sampleStep);
        const peak = waveform.peaks[sampleIndex] || 0;
        const amplitude = Math.max(1, peak * (TRACK_HEIGHT * 0.46));
        context.moveTo(x + 0.5, center - amplitude);
        context.lineTo(x + 0.5, center + amplitude);
      }
      context.stroke();
    }
  }, [scrollLeft, timelineDuration, viewportWidth, waveforms, zoom]);

  useEffect(() => {
    const container = scrollRef.current;
    if (!container) return;
    const handleWheel = (event: WheelEvent) => {
      if (!event.ctrlKey && !event.shiftKey) return;
      event.preventDefault();
      event.stopPropagation();
      if (event.ctrlKey) {
        const { zoom: currentZoom, onZoomChange: setZoom } = wheelSettingsRef.current;
        const bounds = container.getBoundingClientRect();
        const pointerX = event.clientX - bounds.left;
        const anchoredTime = (container.scrollLeft + pointerX) / currentZoom;
        const nextZoom = Math.max(
          8,
          Math.min(
            180,
            Math.round(currentZoom * (event.deltaY < 0 ? 1.15 : 1 / 1.15)),
          ),
        );
        if (nextZoom === currentZoom) return;
        setZoom(nextZoom);
        window.requestAnimationFrame(() => {
          if (scrollRef.current) {
            scrollRef.current.scrollLeft = Math.max(
              0,
              anchoredTime * nextZoom - pointerX,
            );
          }
        });
        return;
      }
      container.scrollLeft += event.deltaY || event.deltaX;
    };
    container.addEventListener("wheel", handleWheel, { passive: false });
    return () => container.removeEventListener("wheel", handleWheel);
  }, []);

  const seekFromEvent = (event: ReactMouseEvent<HTMLDivElement>) => {
    const bounds = event.currentTarget.getBoundingClientRect();
    const time = (event.clientX - bounds.left) / zoom;
    onSeek(Math.max(0, Math.min(timelineDuration, time)));
  };

  const runMasterEditAction = async (action: () => Promise<void>) => {
    setMasterEditBusy(true);
    setMasterEditActionError(null);
    try {
      await action();
    } catch (error) {
      setMasterEditActionError(
        error instanceof Error ? error.message : "Không thể cập nhật TTS Master.",
      );
    } finally {
      setMasterEditBusy(false);
    }
  };

  return (
    <section className="space-y-3 rounded-xl border border-slate-800 bg-slate-950/60 p-3">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <div className="flex items-center gap-2">
            <Waves className="h-4 w-4 text-violet-300" />
            <h4 className="text-xs font-semibold text-white">Timeline âm thanh</h4>
          </div>
          <p className="mt-1 text-[10px] text-slate-500">
            Ctrl+cuộn để zoom · Shift+cuộn để cuộn ngang · bấm thước thời gian để tua preview
          </p>
        </div>
        <div className="flex items-center gap-2 text-[10px] text-slate-400">
          <button
            type="button"
            disabled={!ttsMasterAvailable || masterEditBusy}
            onClick={() => void runMasterEditAction(onSplitMaster)}
            className="inline-flex items-center gap-1 rounded-md border border-violet-500/40 px-2 py-1.5 text-violet-200 hover:bg-violet-950/40 disabled:cursor-not-allowed disabled:opacity-40"
          >
            {masterEditBusy ? <LoaderCircle className="h-3 w-3 animate-spin" /> : <Scissors className="h-3 w-3" />}
            Tách
          </button>
          <button
            type="button"
            disabled={!masterEdit?.clips.length || masterEditBusy}
            onClick={() => void runMasterEditAction(onMergeMaster)}
            className="rounded-md border border-cyan-500/40 px-2 py-1.5 text-cyan-200 hover:bg-cyan-950/40 disabled:cursor-not-allowed disabled:opacity-40"
          >
            Gộp thành Master
          </button>
          <span>{formatTimelineTime(currentTime)} / {formatTimelineTime(timelineDuration)}</span>
          <button
            type="button"
            onClick={() => onZoomChange(Math.max(8, zoom - 8))}
            disabled={zoom <= 8}
            aria-label="Thu nhỏ timeline âm thanh"
            className="rounded-md border border-slate-700 p-1.5 text-slate-300 hover:border-violet-500/50 disabled:opacity-40"
          >
            <Minus className="h-3 w-3" />
          </button>
          <span className="min-w-12 text-center font-mono">{Math.round(zoom)} px/s</span>
          <button
            type="button"
            onClick={() => onZoomChange(Math.min(180, zoom + 8))}
            disabled={zoom >= 180}
            aria-label="Phóng to timeline âm thanh"
            className="rounded-md border border-slate-700 p-1.5 text-slate-300 hover:border-violet-500/50 disabled:opacity-40"
          >
            <Plus className="h-3 w-3" />
          </button>
        </div>
        {masterEdit?.status === "failed" && masterEdit.error && (
          <p role="alert" className="rounded-md border border-rose-500/30 bg-rose-950/20 px-2 py-1.5 text-[10px] text-rose-200">
            {masterEdit.error}
          </p>
        )}
        {masterEditActionError && (
          <p role="alert" className="rounded-md border border-rose-500/30 bg-rose-950/20 px-2 py-1.5 text-[10px] text-rose-200">
            {masterEditActionError}
          </p>
        )}
        {masterEdit?.clips.length ? (
          <p className="text-[10px] text-cyan-200">
            {masterEdit.clips.length} clip đã tách · kéo clip trên track TTS Master để căn chỉnh
          </p>
        ) : null}
      </div>
      <div
        ref={scrollRef}
        onScroll={(event) => setScrollLeft(event.currentTarget.scrollLeft)}
        className="overflow-x-auto overscroll-x-contain rounded-lg border border-slate-800 bg-slate-900/50"
      >
        <div style={{ width: `${timelineWidth}px` }}>
          <div
            className="relative h-7 cursor-ew-resize border-b border-slate-700 bg-slate-950/80"
            onClick={seekFromEvent}
          >
            {ticks.map((tick) => (
              <span
                key={tick}
                className="absolute top-1 text-[9px] tabular-nums text-slate-500"
                style={{ left: `${tick * zoom}px` }}
              >
                {formatTimelineTime(tick)}
              </span>
            ))}
          </div>
          {([
            { key: "vocals", label: "Voice đã tách", color: "text-violet-200" },
            { key: "ttsMaster", label: "TTS Master", color: "text-cyan-200" },
            { key: "instrumental", label: "Nhạc nền (instrumental)", color: "text-amber-200" },
          ] as const).map((track, index) => {
            const waveform = waveforms[track.key];
            const muted = mixerSettings[track.key].muted;
            return (
              <div
                key={track.key}
                className={`relative border-b border-slate-800/80 last:border-b-0 ${muted ? "opacity-55" : ""}`}
                style={{ height: `${TRACK_HEIGHT}px` }}
              >
                <div className="sticky left-0 top-0 z-30 -mb-5 flex h-5 w-fit items-center gap-1.5 rounded bg-slate-950/90 px-1.5">
                  <button
                    type="button"
                    onClick={() => onToggleMute(track.key)}
                    aria-label={`${muted ? "Bật" : "Tắt"} track ${track.label} trong preview`}
                    aria-pressed={muted}
                    title={muted ? "Bật track trong preview" : "Tắt track trong preview"}
                    className={`${muted ? "text-slate-400" : track.color} hover:text-white`}
                  >
                    {muted ? <VolumeX className="h-3.5 w-3.5" /> : <Volume2 className="h-3.5 w-3.5" />}
                  </button>
                  <span className={`text-[9px] ${track.color}`}>{track.label}</span>
                </div>
                <canvas
                  ref={(element) => {
                    canvasRefs.current[index] = element;
                  }}
                  className="pointer-events-none sticky left-0 block"
                />
                {waveform.status === "missing" && (
                  <span className="pointer-events-none absolute inset-0 flex items-center justify-center text-[10px] text-slate-500">
                    Chưa có
                  </span>
                )}
                {waveform.status === "loading" && (
                  <span className="pointer-events-none absolute inset-0 flex items-center justify-center text-[10px] text-slate-500">
                    Đang tạo waveform…
                  </span>
                )}
                {waveform.status === "unavailable" && (
                  <span
                    title={waveform.error}
                    className="pointer-events-none absolute inset-0 flex items-center justify-center text-[10px] text-amber-300"
                  >
                    Không thể tải waveform
                  </span>
                )}
                {track.key === "ttsMaster" && masterEdit?.clips.map((clip) => {
                  const startTime = clipPositions[clip.id] ?? clip.startTime;
                  return (
                    <div
                      key={clip.id}
                      role="slider"
                      aria-label={`Clip TTS ${clip.text}`}
                      aria-valuemin={0}
                      aria-valuenow={startTime}
                      aria-valuemax={timelineDuration}
                      title={`${clip.text} · ${formatTimelineTime(startTime)}`}
                      className="absolute top-6 z-30 flex h-7 min-w-1 cursor-grab touch-none items-center overflow-hidden rounded border border-cyan-200/80 bg-cyan-500/50 px-1 text-[9px] text-white active:cursor-grabbing"
                      style={{
                        left: `${startTime * zoom}px`,
                        width: `${Math.max(8, clip.durationSeconds * zoom)}px`,
                      }}
                      onPointerDown={(event) => {
                        event.stopPropagation();
                        event.currentTarget.setPointerCapture(event.pointerId);
                        setDraggingClip({
                          id: clip.id,
                          pointerX: event.clientX,
                          startTime,
                        });
                      }}
                      onPointerMove={(event) => {
                        if (draggingClip?.id !== clip.id) return;
                        const nextStart = Math.max(
                          0,
                          draggingClip.startTime + (event.clientX - draggingClip.pointerX) / zoom,
                        );
                        setClipPositions((current) => ({ ...current, [clip.id]: nextStart }));
                      }}
                      onPointerUp={(event) => {
                        if (draggingClip?.id !== clip.id) return;
                        const nextStart = Math.max(
                          0,
                          draggingClip.startTime + (event.clientX - draggingClip.pointerX) / zoom,
                        );
                        const clips = masterEdit.clips.map((item) => ({
                          ...item,
                          startTime: item.id === clip.id ? nextStart : (clipPositions[item.id] ?? item.startTime),
                        }));
                        setClipPositions({});
                        setDraggingClip(null);
                        void runMasterEditAction(() => onMoveMasterClip(clips));
                      }}
                      onPointerCancel={() => {
                        setClipPositions({});
                        setDraggingClip(null);
                      }}
                    >
                      {clip.text}
                    </div>
                  );
                })}
                <div
                  className="absolute inset-y-0 z-20 w-0.5 bg-rose-400/90"
                  style={{ left: `${currentTime * zoom}px` }}
                />
                <div
                  className="absolute inset-0 cursor-ew-resize"
                  onClick={seekFromEvent}
                />
              </div>
            );
          })}
        </div>
      </div>
    </section>
  );
}
