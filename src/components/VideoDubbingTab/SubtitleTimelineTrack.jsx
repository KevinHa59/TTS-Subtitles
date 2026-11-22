import { useEffect, useRef, useState } from "react";
import { DEFAULT_TEXT_TRACK_ID } from "./constants";
import { formatDuration, formatElapsed } from "./helpers";

import { useVideoDubbing } from "./VideoDubbingContext";

const vocalsPeaksCache = new Map();
const ttsPeaksCache = new Map();

function getWaveformPeaks(audioBuffer) {
  const peakCount = Math.max(
    1,
    Math.min(6000, Math.ceil(audioBuffer.duration * 8)),
  );
  const peaks = new Array(peakCount).fill(0);
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
  return peaks;
}

export default function SubtitleTimelineTrack(props) {
  const context = useVideoDubbing();
  const {
    activeTextTrackId,
    endSceneDurationSeconds,
    endSceneEnabled,
    job,
    previewSubtitleCues,
    seekSubtitleTimeline,
    selectedSubtitleCue,
    selectedTextOverlay,
    setActiveTextTrackId,
    setSelectedSubtitleCue,
    setSelectedTextOverlay,
    startSubtitleTimelineDrag,
    subtitleTimelineCursor,
    subtitleTimelineDuration,
    subtitleTimelineItems,
    subtitleTimelineLaneEnds,
    subtitleTimelineScrollRef,
    subtitleTimelineTicks,
    subtitleTimelineTrackRef,
    subtitleTimelineWidth,
    textOverlays,
    textTimelineLanes,
    textTracks,
    requestMasterEdit,
    runMasterEditAction,
    showTtsMasterTimeline,
  } = { ...context, ...props };

  const vocalsCanvasRef = useRef(null);
  const ttsMasterCanvasRef = useRef(null);
  const [scrollLeft, setScrollLeft] = useState(0);
  const [viewportWidth, setViewportWidth] = useState(0);
  const [waveform, setWaveform] = useState({ status: "missing" });
  const [ttsWaveform, setTtsWaveform] = useState({ status: "missing" });
  const [draggingClip, setDraggingClip] = useState(null);
  const [clipPositions, setClipPositions] = useState({});

  const ttsMasterAvailable = Boolean(
    job?.masterGeneration?.sizeBytes &&
      job?.masterGeneration?.durationSeconds !== undefined,
  );
  const ttsMasterVersion =
    job?.masterGeneration?.audioVersion ||
    job?.masterGeneration?.sizeBytes ||
    0;
  const masterEdit = job?.masterEdit;
  const ttsMasterUrl =
    ttsMasterAvailable && job?.id
      ? masterEdit?.clips?.length
        ? `/api/video-dubbing/jobs/${job.id}/master-edit/preview?v=${masterEdit.updatedAt}`
        : `/api/video-dubbing/jobs/${job.id}/master-audio?v=${ttsMasterVersion}`
      : undefined;

  const vocalsAvailable = Boolean(job?.separation?.vocalsSizeBytes);
  const vocalsUrl =
    vocalsAvailable && job?.id
      ? `/api/video-dubbing/jobs/${job.id}/separation/vocals`
      : undefined;

  useEffect(() => {
    if (!vocalsUrl || !job?.id) {
      setWaveform({ status: "missing" });
      return;
    }
    const cacheKey = `${job.id}_${job.separation?.vocalsSizeBytes || 0}`;
    if (vocalsPeaksCache.has(cacheKey)) {
      setWaveform(vocalsPeaksCache.get(cacheKey));
      return;
    }

    let disposed = false;
    const controller = new AbortController();
    let audioContext = null;
    setWaveform({ status: "loading" });

    void (async () => {
      try {
        if (!window.AudioContext) {
          throw new Error("Trình duyệt không hỗ trợ giải mã âm thanh.");
        }
        audioContext = new window.AudioContext();
        const response = await fetch(vocalsUrl, {
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
        const data = {
          status: "ready",
          peaks,
          duration: audioBuffer.duration,
        };
        vocalsPeaksCache.set(cacheKey, data);
        if (!disposed) {
          setWaveform(data);
        }
      } catch (error) {
        if (controller.signal.aborted) return;
        if (!disposed) {
          setWaveform({
            status: "unavailable",
            error: error instanceof Error ? error.message : String(error),
          });
        }
      } finally {
        if (audioContext && audioContext.state !== "closed") {
          void audioContext.close();
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
  }, [vocalsUrl, job?.id, job?.separation?.vocalsSizeBytes]);

  useEffect(() => {
    const container = subtitleTimelineScrollRef?.current;
    if (!container) return;
    const update = () => {
      setScrollLeft(container.scrollLeft);
      setViewportWidth(container.clientWidth);
    };
    update();
    container.addEventListener("scroll", update, { passive: true });
    const observer = new ResizeObserver(update);
    observer.observe(container);
    return () => {
      container.removeEventListener("scroll", update);
      observer.disconnect();
    };
  }, [subtitleTimelineScrollRef]);

  useEffect(() => {
    const canvas = vocalsCanvasRef.current;
    if (!canvas || viewportWidth <= 0) return;
    const pixelRatio = window.devicePixelRatio || 1;
    const trackHeight = 28;
    canvas.width = Math.round(viewportWidth * pixelRatio);
    canvas.height = Math.round(trackHeight * pixelRatio);
    canvas.style.width = `${viewportWidth}px`;
    canvas.style.height = `${trackHeight}px`;
    const context = canvas.getContext("2d");
    if (!context) return;
    context.setTransform(pixelRatio, 0, 0, pixelRatio, 0, 0);
    context.clearRect(0, 0, viewportWidth, trackHeight);

    if (
      waveform.status !== "ready" ||
      !waveform.peaks?.length ||
      subtitleTimelineWidth <= 0 ||
      subtitleTimelineDuration <= 0
    ) {
      return;
    }

    const center = trackHeight / 2;
    const sampleStep =
      (waveform.duration || subtitleTimelineDuration) / waveform.peaks.length;
    context.strokeStyle = "rgba(167, 139, 250, 0.75)";
    context.lineWidth = 1;
    context.beginPath();
    for (let x = 0; x < viewportWidth; x += 2) {
      const time =
        ((scrollLeft + x) / subtitleTimelineWidth) * subtitleTimelineDuration;
      const sampleIndex = Math.floor(time / sampleStep);
      const peak = waveform.peaks[sampleIndex] || 0;
      const amplitude = Math.max(1, peak * (trackHeight * 0.44));
      context.moveTo(x + 0.5, center - amplitude);
      context.lineTo(x + 0.5, center + amplitude);
    }
    context.stroke();
  }, [
    scrollLeft,
    viewportWidth,
    waveform,
    subtitleTimelineDuration,
    subtitleTimelineWidth,
  ]);

  useEffect(() => {
    if (!ttsMasterUrl || !job?.id || !showTtsMasterTimeline) {
      setTtsWaveform({ status: "missing" });
      return;
    }
    const cacheKey = `${job.id}_${ttsMasterVersion}_${masterEdit?.updatedAt || 0}`;
    if (ttsPeaksCache.has(cacheKey)) {
      setTtsWaveform(ttsPeaksCache.get(cacheKey));
      return;
    }

    let disposed = false;
    const controller = new AbortController();
    let audioContext = null;
    setTtsWaveform({ status: "loading" });

    void (async () => {
      try {
        if (!window.AudioContext) {
          throw new Error("Trình duyệt không hỗ trợ giải mã âm thanh.");
        }
        audioContext = new window.AudioContext();
        const response = await fetch(ttsMasterUrl, {
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
        const data = {
          status: "ready",
          peaks,
          duration: audioBuffer.duration,
        };
        ttsPeaksCache.set(cacheKey, data);
        if (!disposed) {
          setTtsWaveform(data);
        }
      } catch (error) {
        if (controller.signal.aborted) return;
        if (!disposed) {
          setTtsWaveform({
            status: "unavailable",
            error: error instanceof Error ? error.message : String(error),
          });
        }
      } finally {
        if (audioContext && audioContext.state !== "closed") {
          void audioContext.close();
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
  }, [
    ttsMasterUrl,
    job?.id,
    ttsMasterVersion,
    masterEdit?.updatedAt,
    showTtsMasterTimeline,
  ]);

  const TTS_TRACK_HEIGHT = 44;

  useEffect(() => {
    const canvas = ttsMasterCanvasRef.current;
    if (!canvas || viewportWidth <= 0 || !showTtsMasterTimeline) return;
    const pixelRatio = window.devicePixelRatio || 1;
    canvas.width = Math.round(viewportWidth * pixelRatio);
    canvas.height = Math.round(TTS_TRACK_HEIGHT * pixelRatio);
    canvas.style.width = `${viewportWidth}px`;
    canvas.style.height = `${TTS_TRACK_HEIGHT}px`;
    const context = canvas.getContext("2d");
    if (!context) return;
    context.setTransform(pixelRatio, 0, 0, pixelRatio, 0, 0);
    context.clearRect(0, 0, viewportWidth, TTS_TRACK_HEIGHT);

    if (
      ttsWaveform.status !== "ready" ||
      !ttsWaveform.peaks?.length ||
      subtitleTimelineWidth <= 0 ||
      subtitleTimelineDuration <= 0
    ) {
      return;
    }

    const center = TTS_TRACK_HEIGHT / 2;
    const sampleStep =
      (ttsWaveform.duration || subtitleTimelineDuration) /
      ttsWaveform.peaks.length;
    context.strokeStyle = "rgba(103, 232, 249, 0.8)";
    context.lineWidth = 1;
    context.beginPath();
    for (let x = 0; x < viewportWidth; x += 2) {
      const time =
        ((scrollLeft + x) / subtitleTimelineWidth) * subtitleTimelineDuration;
      const sampleIndex = Math.floor(time / sampleStep);
      const peak = ttsWaveform.peaks[sampleIndex] || 0;
      const amplitude = Math.max(1, peak * (TTS_TRACK_HEIGHT * 0.44));
      context.moveTo(x + 0.5, center - amplitude);
      context.lineTo(x + 0.5, center + amplitude);
    }
    context.stroke();
  }, [
    scrollLeft,
    viewportWidth,
    ttsWaveform,
    subtitleTimelineDuration,
    subtitleTimelineWidth,
    showTtsMasterTimeline,
  ]);
  return (
    <div
      ref={subtitleTimelineScrollRef}
      data-video-dubbing-timeline
      tabIndex={0}
      aria-label="Timeline phụ đề và card nhân vật"
      className="max-h-64 overflow-auto overscroll-contain rounded-lg border border-slate-800 bg-slate-900/50"
    >
      <div
        style={{
          width: `${subtitleTimelineWidth}px`,
        }}
      >
        <div
          className="relative h-7 cursor-crosshair border-b border-slate-700 bg-slate-950/80"
          onClick={(event) => {
            setSelectedSubtitleCue(null);
            setSelectedTextOverlay(null);
            const bounds = event.currentTarget.getBoundingClientRect();
            const position = Math.max(
              0,
              Math.min(1, (event.clientX - bounds.left) / bounds.width),
            );
            seekSubtitleTimeline(position * subtitleTimelineDuration);
          }}
        >
          {subtitleTimelineTicks.map((tick) => (
            <span
              key={tick}
              className="absolute top-1 text-[9px] tabular-nums text-slate-500"
              style={{
                left: `${(tick / subtitleTimelineDuration) * subtitleTimelineWidth}px`,
              }}
            >
              {formatElapsed(tick)}
            </span>
          ))}
        </div>
        <div
          ref={subtitleTimelineTrackRef}
          className="relative cursor-crosshair bg-slate-950/30"
          style={{
            height: `${Math.max(54, subtitleTimelineLaneEnds.length * 34 + (endSceneEnabled ? 34 : 0) + 10)}px`,
          }}
          onClick={(event) => {
            if (event.target !== event.currentTarget) return;
            setSelectedSubtitleCue(null);
            setSelectedTextOverlay(null);
            const bounds = event.currentTarget.getBoundingClientRect();
            const position = Math.max(
              0,
              Math.min(1, (event.clientX - bounds.left) / bounds.width),
            );
            seekSubtitleTimeline(position * subtitleTimelineDuration);
          }}
        >
          {subtitleTimelineTicks.map((tick) => (
            <span
              key={`grid-${tick}`}
              className="pointer-events-none absolute inset-y-0 border-l border-slate-800/80"
              style={{
                left: `${(tick / subtitleTimelineDuration) * subtitleTimelineWidth}px`,
              }}
            />
          ))}
          <span
            className="pointer-events-none absolute inset-y-0 z-20 border-l-2 border-rose-400"
            style={{
              left: `${(subtitleTimelineCursor / subtitleTimelineDuration) * subtitleTimelineWidth}px`,
            }}
          />
          {/* Nền waveform Voice đã tách cho timeline phụ đề đầu tiên (lane 0) */}
          <div
            className="pointer-events-none absolute left-0 top-[5px] z-0 overflow-hidden rounded-md border border-violet-500/25 bg-violet-950/20"
            style={{
              width: `${subtitleTimelineWidth}px`,
              height: "28px",
            }}
            title="Voice đã tách"
          >
            {waveform.status === "ready" && (
              <canvas
                ref={vocalsCanvasRef}
                className="sticky left-0 top-0 block"
                style={{ height: "28px" }}
              />
            )}
            {waveform.status === "loading" && (
              <span className="sticky left-3 top-1 text-[9px] text-violet-300/60">
                Đang tải waveform Voice đã tách…
              </span>
            )}
          </div>
          {subtitleTimelineItems.map(({ cue, index, lane }) => {
            const active =
              cue.startTime <= subtitleTimelineCursor &&
              cue.endTime >= subtitleTimelineCursor;
            const left =
              (cue.startTime / subtitleTimelineDuration) *
              subtitleTimelineWidth;
            const width = Math.max(
              14,
              ((cue.endTime - cue.startTime) / subtitleTimelineDuration) *
                subtitleTimelineWidth,
            );
            return (
              <div
                key={`${cue.startTime}-${cue.endTime}-${index}`}
                role="button"
                tabIndex={0}
                title={`${index + 1}. ${cue.text}\n${formatDuration(cue.startTime)} – ${formatDuration(cue.endTime)}`}
                onClick={(event) => {
                  event.stopPropagation();
                  setSelectedTextOverlay(null);
                  setSelectedSubtitleCue(index);
                  seekSubtitleTimeline(cue.startTime);
                }}
                onKeyDown={(event) => {
                  if (event.key === "Enter" || event.key === " ") {
                    event.preventDefault();
                    setSelectedSubtitleCue(index);
                    seekSubtitleTimeline(cue.startTime);
                  }
                }}
                onPointerDown={(event) => {
                  setSelectedTextOverlay(null);
                  startSubtitleTimelineDrag(
                    event,
                    index,
                    cue.startTime,
                    cue.endTime,
                    "move",
                  );
                }}
                className={`absolute z-10 flex h-7 select-none items-center overflow-hidden rounded-md border px-1 text-[9px] text-white shadow-sm ${previewSubtitleCues.length ? "cursor-grab active:cursor-grabbing" : "cursor-pointer"} ${selectedSubtitleCue === index ? "border-amber-200 bg-amber-500/80" : active ? "border-cyan-200 bg-cyan-500/80" : "border-cyan-500/50 bg-cyan-700/70 hover:bg-cyan-600/80"}`}
                style={{
                  left: `${left}px`,
                  top: `${5 + lane * 34}px`,
                  width: `${width}px`,
                }}
              >
                {previewSubtitleCues.length > 0 && (
                  <span
                    onClick={(event) => event.stopPropagation()}
                    onPointerDown={(event) => {
                      setSelectedTextOverlay(null);
                      startSubtitleTimelineDrag(
                        event,
                        index,
                        cue.startTime,
                        cue.endTime,
                        "start",
                      );
                    }}
                    className="absolute inset-y-0 left-0 z-20 w-1.5 cursor-ew-resize bg-cyan-100/80"
                    aria-label={`Chỉnh điểm bắt đầu câu ${index + 1}`}
                  />
                )}
                <span className="pointer-events-none truncate px-1">
                  {index + 1}. {cue.text}
                </span>
                {previewSubtitleCues.length > 0 && (
                  <span
                    onClick={(event) => event.stopPropagation()}
                    onPointerDown={(event) => {
                      setSelectedTextOverlay(null);
                      startSubtitleTimelineDrag(
                        event,
                        index,
                        cue.startTime,
                        cue.endTime,
                        "end",
                      );
                    }}
                    className="absolute inset-y-0 right-0 z-20 w-1.5 cursor-ew-resize bg-cyan-100/80"
                    aria-label={`Chỉnh điểm kết thúc câu ${index + 1}`}
                  />
                )}
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
                seekSubtitleTimeline(job.metadata.durationSeconds + 0.01);
              }}
              onKeyDown={(event) => {
                if (event.key === "Enter" || event.key === " ") {
                  event.preventDefault();
                  seekSubtitleTimeline(job.metadata.durationSeconds + 0.01);
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
        {/* Track Timeline TTS Master (nằm dưới timeline phụ đề mặc định) */}
        {showTtsMasterTimeline && ttsMasterAvailable && (
          <div
            className="relative border-t border-slate-800 bg-slate-950/40"
            style={{ height: `${TTS_TRACK_HEIGHT}px` }}
          >
            {/* Header dính bên trái */}
            <div className="sticky left-0 top-0 z-30 -mb-5 flex h-5 w-fit items-center gap-1.5 rounded bg-slate-950/90 px-1.5 border border-slate-800/80">
              <span className="text-[9px] font-semibold text-cyan-200">
                TTS Master
              </span>
              {masterEdit?.clips?.length ? (
                <span className="text-[8px] text-cyan-400/80">
                  {masterEdit.clips.length} clip
                </span>
              ) : null}
            </div>

            {/* Grid lines */}
            {subtitleTimelineTicks.map((tick) => (
              <span
                key={`grid-tts-${tick}`}
                className="pointer-events-none absolute inset-y-0 border-l border-slate-800/80"
                style={{
                  left: `${(tick / subtitleTimelineDuration) * subtitleTimelineWidth}px`,
                }}
              />
            ))}

            {/* Playhead đỏ */}
            <span
              className="pointer-events-none absolute inset-y-0 z-20 border-l-2 border-rose-400"
              style={{
                left: `${(subtitleTimelineCursor / subtitleTimelineDuration) * subtitleTimelineWidth}px`,
              }}
            />

            {/* Canvas waveform TTS Master */}
            <canvas
              ref={ttsMasterCanvasRef}
              className="pointer-events-none sticky left-0 top-0 block"
              style={{ height: `${TTS_TRACK_HEIGHT}px` }}
            />

            {/* Thông báo trạng thái nếu chưa sẵn sàng */}
            {ttsWaveform.status === "loading" && (
              <span className="pointer-events-none sticky left-24 top-1 text-[9px] text-cyan-300/60">
                Đang tải waveform TTS Master…
              </span>
            )}
            {ttsWaveform.status === "unavailable" && (
              <span
                title={ttsWaveform.error}
                className="pointer-events-none sticky left-24 top-1 text-[9px] text-amber-300"
              >
                Không thể tải waveform TTS
              </span>
            )}

            {/* Draggable TTS Master Clips (nếu đã tách clip) */}
            {masterEdit?.clips?.map((clip) => {
              const startTime = clipPositions[clip.id] ?? clip.startTime;
              const left =
                (startTime / subtitleTimelineDuration) * subtitleTimelineWidth;
              const width = Math.max(
                10,
                (clip.durationSeconds / subtitleTimelineDuration) *
                  subtitleTimelineWidth,
              );
              return (
                <div
                  key={clip.id}
                  role="slider"
                  aria-label={`Clip TTS ${clip.text}`}
                  aria-valuemin={0}
                  aria-valuenow={startTime}
                  aria-valuemax={subtitleTimelineDuration}
                  title={`${clip.text} · ${formatDuration(startTime)} – ${formatDuration(startTime + clip.durationSeconds)}`}
                  className="absolute top-4 z-30 flex h-6 min-w-1 cursor-grab touch-none items-center overflow-hidden rounded border border-cyan-200/80 bg-cyan-600/60 px-1 text-[9px] text-white active:cursor-grabbing shadow-sm select-none hover:bg-cyan-500/70"
                  style={{
                    left: `${left}px`,
                    width: `${width}px`,
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
                    const deltaX = event.clientX - draggingClip.pointerX;
                    const timeDelta =
                      (deltaX / subtitleTimelineWidth) *
                      subtitleTimelineDuration;
                    const nextStart = Math.max(
                      0,
                      draggingClip.startTime + timeDelta,
                    );
                    setClipPositions((current) => ({
                      ...current,
                      [clip.id]: nextStart,
                    }));
                  }}
                  onPointerUp={(event) => {
                    if (draggingClip?.id !== clip.id) return;
                    const deltaX = event.clientX - draggingClip.pointerX;
                    const timeDelta =
                      (deltaX / subtitleTimelineWidth) *
                      subtitleTimelineDuration;
                    const nextStart = Math.max(
                      0,
                      draggingClip.startTime + timeDelta,
                    );
                    const clips = masterEdit.clips.map((item) => ({
                      ...item,
                      startTime:
                        item.id === clip.id
                          ? nextStart
                          : (clipPositions[item.id] ?? item.startTime),
                    }));
                    setClipPositions({});
                    setDraggingClip(null);
                    void runMasterEditAction(() =>
                      requestMasterEdit(job.id, "clips", clips),
                    );
                  }}
                  onPointerCancel={() => {
                    setClipPositions({});
                    setDraggingClip(null);
                  }}
                >
                  <span className="truncate">{clip.text}</span>
                </div>
              );
            })}

            {/* Bấm vào track để tua timeline */}
            <div
              className="absolute inset-0 cursor-crosshair"
              onClick={(event) => {
                if (event.target !== event.currentTarget) return;
                const bounds = event.currentTarget.getBoundingClientRect();
                const position = Math.max(
                  0,
                  Math.min(1, (event.clientX - bounds.left) / bounds.width),
                );
                seekSubtitleTimeline(position * subtitleTimelineDuration);
              }}
            />
          </div>
        )}
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
            <div
              className="relative flex items-center"
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
                const position = Math.max(
                  0,
                  Math.min(1, (event.clientX - bounds.left) / bounds.width),
                );
                seekSubtitleTimeline(position * subtitleTimelineDuration);
              }}
            >
              <span
                className="pointer-events-none sticky left-2 z-0 inline-flex items-center text-[10px] font-bold uppercase tracking-wider text-violet-300/40 select-none"
              >
                {track.name}
              </span>
              <span
                className="pointer-events-none absolute inset-y-0 z-20 border-l-2 border-rose-400"
                style={{
                  left: `${(subtitleTimelineCursor / subtitleTimelineDuration) * subtitleTimelineWidth}px`,
                }}
              />
              {textOverlays
                .map((cue, index) => ({
                  cue,
                  index,
                }))
                .filter(
                  ({ cue }) =>
                    !cue.isTitle &&
                    (cue.trackId || DEFAULT_TEXT_TRACK_ID) === track.id,
                )
                .map(({ cue, index }) => {
                  const left =
                    (cue.startTime / subtitleTimelineDuration) *
                    subtitleTimelineWidth;
                  const width = Math.max(
                    18,
                    ((cue.endTime - cue.startTime) / subtitleTimelineDuration) *
                      subtitleTimelineWidth,
                  );
                  const lane = textTimelineLanes.lanes[index] ?? 0;
                  return (
                    <div
                      key={`text-${index}`}
                      role="button"
                      tabIndex={0}
                      title={`${cue.text}${cue.kind === "character-card" ? ` · ${cue.characterRole ?? ""}` : ""}\n${formatDuration(cue.startTime)} – ${formatDuration(cue.endTime)}`}
                      onClick={(event) => {
                        event.stopPropagation();
                        setActiveTextTrackId(track.id);
                        setSelectedSubtitleCue(null);
                        setSelectedTextOverlay(index);
                        seekSubtitleTimeline(cue.startTime);
                      }}
                      onPointerDown={(event) => {
                        setActiveTextTrackId(track.id);
                        setSelectedSubtitleCue(null);
                        startSubtitleTimelineDrag(
                          event,
                          index,
                          cue.startTime,
                          cue.endTime,
                          "move",
                          "text",
                        );
                      }}
                      className={`absolute z-10 flex h-6 select-none items-center overflow-hidden rounded-md border px-1 text-[9px] text-white ${selectedTextOverlay === index ? "border-violet-200 bg-violet-500/90" : "border-violet-400/50 bg-violet-700/75"} cursor-grab active:cursor-grabbing`}
                      style={{
                        left: `${left}px`,
                        top: `${4 + lane * 34}px`,
                        width: `${width}px`,
                      }}
                    >
                      <span
                        onClick={(event) => event.stopPropagation()}
                        onPointerDown={(event) => {
                          event.stopPropagation();
                          setActiveTextTrackId(track.id);
                          startSubtitleTimelineDrag(
                            event,
                            index,
                            cue.startTime,
                            cue.endTime,
                            "start",
                            "text",
                          );
                        }}
                        className="absolute inset-y-0 left-0 z-20 w-1.5 cursor-ew-resize bg-violet-100/80"
                      />
                      <span className="pointer-events-none truncate px-1">
                        {cue.kind === "character-card"
                          ? `${cue.text} · ${cue.characterRole ?? ""}`
                          : cue.text}
                      </span>
                      <span
                        onClick={(event) => event.stopPropagation()}
                        onPointerDown={(event) => {
                          event.stopPropagation();
                          setActiveTextTrackId(track.id);
                          startSubtitleTimelineDrag(
                            event,
                            index,
                            cue.startTime,
                            cue.endTime,
                            "end",
                            "text",
                          );
                        }}
                        className="absolute inset-y-0 right-0 z-20 w-1.5 cursor-ew-resize bg-violet-100/80"
                      />
                    </div>
                  );
                })}
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}
