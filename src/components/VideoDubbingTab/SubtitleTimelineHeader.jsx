import { Plus, Trash2 } from "lucide-react";

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
  previewSubtitleCues,
  saveEndSceneForCurrentVideo,
  setActiveTextTrackId,
  setSelectedSubtitleCue,
  setSubtitlesEnabled,
  setTextTracks,
  subtitleTimelineCursor,
  subtitleTimelineDuration,
  subtitleTimelineMinZoom,
  subtitleTimelineZoom,
  textTracks,
  updatePreviewSubtitleCues,
} = { ...context, ...props };
  return (
    <div className="flex flex-wrap items-center justify-between gap-3">
      <div>
        <h4 className="text-xs font-semibold text-white">Timeline phụ đề</h4>
        <p className="mt-1 text-[10px] text-slate-500">
          Khi phát, timeline bám theo video; khi dừng, bấm timeline để di chuyển
          playhead riêng · Ctrl+C/V sao chép/dán tại playhead · Delete xóa cue ·
          Ctrl+cuộn để zoom vào playhead · Shift+Z fit toàn timeline ·
          Shift+cuộn để cuộn ngang
        </p>
      </div>
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
        <button
          type="button"
          onClick={fitSubtitleTimelineToPanel}
          title="Fit timeline vừa panel và cuộn về đầu (Shift+Z)"
          aria-label="Fit timeline vừa panel và cuộn về đầu"
          className="rounded-md border border-slate-700 px-2 py-1 text-slate-300 hover:border-cyan-500/50"
        >
          Fit
        </button>
        <label className="flex items-center gap-2">
          Zoom
          <input
            type="range"
            min={subtitleTimelineMinZoom}
            max={180}
            step="any"
            value={subtitleTimelineZoom}
            onChange={(event) =>
              changeSubtitleTimelineZoom(Number(event.target.value))
            }
            className="w-20 accent-cyan-400"
            aria-label="Zoom timeline phụ đề"
          />
        </label>
      </div>
    </div>
  );
}
