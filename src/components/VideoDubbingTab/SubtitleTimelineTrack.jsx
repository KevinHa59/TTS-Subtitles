import { DEFAULT_TEXT_TRACK_ID } from "./constants";
import { formatDuration, formatElapsed } from "./helpers";

export default function SubtitleTimelineTrack({
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
}) {
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
              <span className="text-[9px] font-semibold text-violet-300">
                {track.name}
              </span>
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
                const position = Math.max(
                  0,
                  Math.min(1, (event.clientX - bounds.left) / bounds.width),
                );
                seekSubtitleTimeline(position * subtitleTimelineDuration);
              }}
            >
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
