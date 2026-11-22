import { LoaderCircle, Plus, Scissors, Trash2 } from "lucide-react";

import { useVideoDubbing } from "./VideoDubbingContext";

export default function SubtitleTimelineHeader(props) {
  const context = useVideoDubbing();
  const {
    activeTextTrackId,
    addTextOverlayToTrack,
    changeSubtitleTimelineZoom,
    deleteActiveTextTrack,
    endSceneEnabled,
    fitSubtitleTimelineToPanel,
    isMediaProcessing,
    job,
    masterEditBusy,
    previewSubtitleCues,
    requestMasterEdit,
    runMasterEditAction,
    saveEndSceneForCurrentVideo,
    setActiveTextTrackId,
    setSelectedSubtitleCue,
    setShowTtsMasterTimeline,
    setSubtitlesEnabled,
    setTextTracks,
    showTtsMasterTimeline,
    subtitleTimelineCursor,
    subtitleTimelineDuration,
    subtitleTimelineMinZoom,
    subtitleTimelineZoom,
    textTracks,
    updatePreviewSubtitleCues,
  } = { ...context, ...props };

  const ttsMasterAvailable = Boolean(
    job?.masterGeneration?.sizeBytes &&
    job?.masterGeneration?.durationSeconds !== undefined,
  );
  const masterEdit = job?.masterEdit;
  const hasMasterClips = Boolean(masterEdit?.clips?.length);
  return (
    <div className="flex flex-wrap items-center justify-between gap-3">
      <div className="flex items-center gap-2 text-[10px] text-slate-400">
        <span>{previewSubtitleCues.length} câu</span>
        <button
          type="button"
          disabled={!job}
          onClick={() => {
            const duration = Math.max(
              0.1,
              job?.metadata?.durationSeconds || subtitleTimelineDuration,
            );
            const startTime = Math.min(
              subtitleTimelineCursor,
              Math.max(0, duration - 0.1),
            );
            const cue = {
              startTime,
              endTime: Math.min(duration, startTime + 3),
              text: "Câu phụ đề mới",
            };
            setSelectedSubtitleCue(previewSubtitleCues.length);
            setSubtitlesEnabled(true);
            updatePreviewSubtitleCues((cues) => [...cues, cue]);
          }}
          className="inline-flex items-center gap-1 rounded-md border border-cyan-500/30 px-2 py-1 text-cyan-200 hover:bg-cyan-950/40 disabled:cursor-not-allowed disabled:opacity-40"
        >
          <Plus className="h-3 w-3" />
          Câu
        </button>
        <button
          type="button"
          onClick={() => {
            const nextNumber = textTracks.length + 1;
            const track = {
              id: `text-track-${crypto.randomUUID()}`,
              name: `TEXT ${nextNumber}`,
            };
            setTextTracks((tracks) => [...tracks, track]);
            setActiveTextTrackId(track.id);
          }}
          className="inline-flex items-center gap-1 rounded-md border border-violet-500/30 px-2 py-1 text-violet-200 hover:bg-violet-950/40"
        >
          <Plus className="h-3 w-3" />
          Timeline
        </button>
        <button
          type="button"
          disabled={!textTracks.some((track) => track.id === activeTextTrackId)}
          onClick={deleteActiveTextTrack}
          title="Xóa timeline đang chọn và các clip trên timeline đó"
          aria-label="Xóa timeline đang chọn"
          className="inline-flex items-center gap-1 rounded-md border border-rose-500/30 px-2 py-1 text-rose-200 hover:bg-rose-950/30 disabled:cursor-not-allowed disabled:opacity-40"
        >
          <Trash2 className="h-3 w-3" />
          Xóa timeline
        </button>
        <button
          type="button"
          disabled={!job || !textTracks.length}
          onClick={() => addTextOverlayToTrack()}
          className="inline-flex items-center gap-1 rounded-md border border-violet-500/30 px-2 py-1 text-violet-200 hover:bg-violet-950/40 disabled:cursor-not-allowed disabled:opacity-40"
        >
          <Plus className="h-3 w-3" />
          Text
        </button>
        <button
          type="button"
          disabled={!job || !textTracks.length}
          onClick={() => addTextOverlayToTrack("character-card")}
          className="inline-flex items-center gap-1 rounded-md border border-amber-500/30 px-2 py-1 text-amber-200 hover:bg-amber-950/40 disabled:cursor-not-allowed disabled:opacity-40"
        >
          <Plus className="h-3 w-3" />
          Card nhân vật
        </button>
        <button
          type="button"
          disabled={!job || !job.metadata || isMediaProcessing}
          onClick={() => void saveEndSceneForCurrentVideo(!endSceneEnabled)}
          className="inline-flex items-center gap-1 rounded-md border border-orange-500/30 px-2 py-1 text-orange-200 hover:bg-orange-950/30 disabled:cursor-not-allowed disabled:opacity-40"
        >
          {endSceneEnabled ? "Bỏ End Scene" : "Add End Scene"}
        </button>
        <div className="flex items-center gap-1.5 border-l border-slate-800 pl-2">
          <label
            className={`inline-flex items-center gap-1.5 rounded-md border border-slate-700/80 px-2 py-1 select-none transition-colors ${
              !ttsMasterAvailable
                ? "cursor-not-allowed opacity-40 text-slate-500"
                : "cursor-pointer text-cyan-200 hover:border-cyan-500/50 bg-slate-900/60"
            }`}
            title={
              ttsMasterAvailable
                ? "Ẩn / hiện timeline TTS Master"
                : "Chưa có TTS Master"
            }
          >
            <input
              type="checkbox"
              disabled={!ttsMasterAvailable}
              checked={Boolean(ttsMasterAvailable && showTtsMasterTimeline)}
              onChange={(event) =>
                setShowTtsMasterTimeline(event.target.checked)
              }
              className="h-3.5 w-3.5 rounded accent-cyan-400"
            />
            <span>TTS Master</span>
          </label>
          <button
            type="button"
            disabled={!ttsMasterAvailable || masterEditBusy}
            onClick={() =>
              void runMasterEditAction(() => requestMasterEdit(job.id, "split"))
            }
            className="inline-flex items-center gap-1 rounded-md border border-violet-500/40 px-2 py-1 text-violet-200 hover:bg-violet-950/40 disabled:cursor-not-allowed disabled:opacity-40"
            title="Tách TTS Master thành các clip để căn chỉnh"
          >
            {masterEditBusy ? (
              <LoaderCircle className="h-3 w-3 animate-spin" />
            ) : (
              <Scissors className="h-3 w-3" />
            )}
            Tách
          </button>
          <button
            type="button"
            disabled={!hasMasterClips || masterEditBusy}
            onClick={() =>
              void runMasterEditAction(() => requestMasterEdit(job.id, "merge"))
            }
            className="rounded-md border border-cyan-500/40 px-2 py-1 text-cyan-200 hover:bg-cyan-950/40 disabled:cursor-not-allowed disabled:opacity-40"
            title="Gộp các clip đã chỉnh thành file Master mới"
          >
            Gộp thành Master
          </button>
        </div>
      </div>
    </div>
  );
}
