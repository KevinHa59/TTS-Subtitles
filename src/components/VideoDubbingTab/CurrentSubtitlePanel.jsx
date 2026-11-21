import { LoaderCircle, Pause, Play, RefreshCw } from "lucide-react";
import { formatDuration } from "./helpers";

import { useVideoDubbing } from "./VideoDubbingContext";

export default function CurrentSubtitlePanel(props) {
  const context = useVideoDubbing();
  const {
    activeSubtitleAudio,
    activeSubtitleAudioItem,
    activeSubtitleAudioRow,
    adjustSubtitleAudioCueTiming,
    commitSubtitleAudioCueText,
    isMasterGenerating,
    isMediaProcessing,
    nextSubtitleAudioItem,
    playSubtitleAudio,
    previousSubtitleAudioItem,
    regenerateSubtitleAudioWithDraft,
    seekSubtitleTimeline,
    selectedVoice,
    setSubtitleAudioDrafts,
    setSubtitleAudioTimingStepMs,
    subtitleAudioDrafts = {},
    subtitleAudioMasterBusy,
    subtitleAudioPlayingId,
    subtitleAudioRegeneratingId,
    subtitleAudioSyncing,
    subtitleAudioTimingStepMs = 100,
  } = { ...context, ...props };
  return (
    <div className="overflow-hidden rounded-lg border border-cyan-500/30 bg-cyan-950/10">
      <div
        role="row"
        aria-label="Câu phụ đề đang nói"
        className="grid w-full grid-cols-[3.5rem_minmax(0,1fr)_max-content_max-content] text-slate-300"
      >
        <div role="cell" className="px-2 py-1.5 font-mono text-cyan-300">
          {activeSubtitleAudioItem?.index ?? "—"}
        </div>
        <div role="cell" className="min-w-0 px-2 py-1">
          <div className="flex min-w-0 items-center gap-2">
            <span className="shrink-0 rounded bg-cyan-500/10 px-1.5 py-1 text-[9px] font-semibold text-cyan-200">
              Đang nói
            </span>
            <input
              type="text"
              aria-label="Nội dung phụ đề đang nói"
              placeholder="Không có câu phụ đề tại vị trí hiện tại"
              value={
                activeSubtitleAudioItem
                  ? (subtitleAudioDrafts[activeSubtitleAudioItem.id] ??
                    activeSubtitleAudioItem.text)
                  : ""
              }
              onChange={(event) => {
                if (!activeSubtitleAudioItem) return;
                setSubtitleAudioDrafts((current) => ({
                  ...current,
                  [activeSubtitleAudioItem.id]: event.target.value,
                }));
              }}
              onBlur={() => {
                if (activeSubtitleAudioItem) {
                  commitSubtitleAudioCueText(activeSubtitleAudioItem.id);
                }
              }}
              disabled={
                !activeSubtitleAudioItem ||
                subtitleAudioSyncing ||
                Boolean(subtitleAudioRegeneratingId) ||
                subtitleAudioMasterBusy ||
                isMasterGenerating ||
                isMediaProcessing
              }
              className="h-8 min-w-0 flex-1 rounded-md border border-cyan-500/30 bg-slate-950 px-2 text-xs text-slate-100 outline-none focus:border-cyan-300 disabled:opacity-60"
            />
            {activeSubtitleAudioItem && (
              <span className="shrink-0 text-[10px] text-slate-500">
                {formatDuration(activeSubtitleAudioItem.startTime)} –{" "}
                {formatDuration(activeSubtitleAudioItem.endTime)}
              </span>
            )}
          </div>
        </div>
        <div role="cell" className="whitespace-nowrap px-2 py-1">
          <span
            className={`inline-flex items-center gap-1.5 text-[10px] ${activeSubtitleAudioRow?.status === "failed" ? "text-rose-300" : "text-slate-500"}`}
          >
            {activeSubtitleAudioRow?.status === "generating" && (
              <LoaderCircle className="h-3 w-3 animate-spin" />
            )}
            {activeSubtitleAudioRow?.status === "failed"
              ? activeSubtitleAudioRow.error || "Tạo audio thất bại"
              : activeSubtitleAudioRow?.status === "generating"
                ? "Đang tạo audio…"
                : activeSubtitleAudioRow?.audioUrl
                  ? "Đã có audio"
                  : activeSubtitleAudioItem
                    ? "Chưa có audio"
                    : "—"}
          </span>
        </div>
        <div role="cell" className="px-2 py-1" />
        <div
          role="cell"
          className="col-span-4 flex flex-wrap items-center gap-1.5 border-t border-cyan-500/15 px-2 py-1.5"
        >
          <button
            type="button"
            onClick={() =>
              previousSubtitleAudioItem &&
              seekSubtitleTimeline(previousSubtitleAudioItem.startTime)
            }
            disabled={
              !previousSubtitleAudioItem ||
              subtitleAudioSyncing ||
              isMediaProcessing
            }
            className="rounded-md border border-slate-700 px-2 py-1 text-[10px] font-semibold text-slate-200 hover:border-cyan-500/50 disabled:cursor-not-allowed disabled:opacity-40"
            title="Nhảy đến câu phụ đề trước"
          >
            Câu Trước
          </button>
          <button
            type="button"
            onClick={() =>
              nextSubtitleAudioItem &&
              seekSubtitleTimeline(nextSubtitleAudioItem.startTime)
            }
            disabled={
              !nextSubtitleAudioItem ||
              subtitleAudioSyncing ||
              isMediaProcessing
            }
            className="rounded-md border border-slate-700 px-2 py-1 text-[10px] font-semibold text-slate-200 hover:border-cyan-500/50 disabled:cursor-not-allowed disabled:opacity-40"
            title="Nhảy đến câu phụ đề sau"
          >
            Câu Sau
          </button>
          <span
            className="mx-1 h-5 border-l border-slate-700"
            aria-hidden="true"
          />
          <span
            className="text-[10px] text-slate-400"
            title="Điều chỉnh điểm bắt đầu"
          >
            Trước
          </span>
          <button
            type="button"
            onClick={() =>
              activeSubtitleAudioItem &&
              adjustSubtitleAudioCueTiming(
                activeSubtitleAudioItem.id,
                "start",
                -1,
              )
            }
            disabled={
              !activeSubtitleAudioItem ||
              subtitleAudioSyncing ||
              Boolean(subtitleAudioRegeneratingId) ||
              subtitleAudioMasterBusy ||
              isMasterGenerating ||
              isMediaProcessing
            }
            aria-label={`Mở rộng phía trước ${subtitleAudioTimingStepMs} mili giây`}
            title="Mở rộng thời gian phía trước"
            className="rounded-md border border-cyan-500/30 px-2 py-1 text-xs font-bold text-cyan-200 hover:bg-cyan-950/40 disabled:cursor-not-allowed disabled:opacity-40"
          >
            +
          </button>
          <button
            type="button"
            onClick={() =>
              activeSubtitleAudioItem &&
              adjustSubtitleAudioCueTiming(
                activeSubtitleAudioItem.id,
                "start",
                1,
              )
            }
            disabled={
              !activeSubtitleAudioItem ||
              subtitleAudioSyncing ||
              Boolean(subtitleAudioRegeneratingId) ||
              subtitleAudioMasterBusy ||
              isMasterGenerating ||
              isMediaProcessing
            }
            aria-label={`Thu gọn phía trước ${subtitleAudioTimingStepMs} mili giây`}
            title="Thu gọn thời gian phía trước"
            className="rounded-md border border-slate-700 px-2 py-1 text-xs font-bold text-slate-200 hover:bg-slate-800 disabled:cursor-not-allowed disabled:opacity-40"
          >
            −
          </button>
          <input
            type="number"
            min={1}
            step={1}
            value={subtitleAudioTimingStepMs}
            onChange={(event) => {
              const value = Number(event.target.value);
              if (Number.isFinite(value) && value >= 1) {
                setSubtitleAudioTimingStepMs(Math.round(value));
              }
            }}
            aria-label="Bước chỉnh thời gian câu đang nói (mili giây)"
            className="h-7 w-16 rounded border border-slate-700 bg-slate-950 px-1 text-center text-[10px] tabular-nums text-slate-200"
          />
          <span className="-ml-1 text-[10px] text-slate-400">ms</span>
          <span
            className="mx-1 h-5 border-l border-slate-700"
            aria-hidden="true"
          />
          <span
            className="text-[10px] text-slate-400"
            title="Điều chỉnh điểm kết thúc"
          >
            Sau
          </span>
          <button
            type="button"
            onClick={() =>
              activeSubtitleAudioItem &&
              adjustSubtitleAudioCueTiming(
                activeSubtitleAudioItem.id,
                "end",
                -1,
              )
            }
            disabled={
              !activeSubtitleAudioItem ||
              subtitleAudioSyncing ||
              Boolean(subtitleAudioRegeneratingId) ||
              subtitleAudioMasterBusy ||
              isMasterGenerating ||
              isMediaProcessing
            }
            aria-label={`Thu gọn phía sau ${subtitleAudioTimingStepMs} mili giây`}
            title="Thu gọn thời gian phía sau"
            className="rounded-md border border-slate-700 px-2 py-1 text-xs font-bold text-slate-200 hover:bg-slate-800 disabled:cursor-not-allowed disabled:opacity-40"
          >
            −
          </button>
          <button
            type="button"
            onClick={() =>
              activeSubtitleAudioItem &&
              adjustSubtitleAudioCueTiming(activeSubtitleAudioItem.id, "end", 1)
            }
            disabled={
              !activeSubtitleAudioItem ||
              subtitleAudioSyncing ||
              Boolean(subtitleAudioRegeneratingId) ||
              subtitleAudioMasterBusy ||
              isMasterGenerating ||
              isMediaProcessing
            }
            aria-label={`Mở rộng phía sau ${subtitleAudioTimingStepMs} mili giây`}
            title="Mở rộng thời gian phía sau"
            className="rounded-md border border-cyan-500/30 px-2 py-1 text-xs font-bold text-cyan-200 hover:bg-cyan-950/40 disabled:cursor-not-allowed disabled:opacity-40"
          >
            +
          </button>
          <span
            className="mx-1 h-5 border-l border-slate-700"
            aria-hidden="true"
          />
          {activeSubtitleAudioRow?.audioUrl && (
            <button
              type="button"
              onClick={() => void playSubtitleAudio(activeSubtitleAudioRow)}
              aria-label={
                subtitleAudioPlayingId === activeSubtitleAudioRow.id
                  ? "Dừng audio câu đang nói"
                  : "Phát audio câu đang nói"
              }
              title={
                subtitleAudioPlayingId === activeSubtitleAudioRow.id
                  ? "Dừng phát"
                  : "Phát audio"
              }
              className="inline-flex h-7 w-7 shrink-0 items-center justify-center rounded-md border border-violet-500/30 bg-violet-500/10 text-violet-200 hover:bg-violet-500/20"
            >
              {subtitleAudioPlayingId === activeSubtitleAudioRow.id ? (
                <Pause className="h-3.5 w-3.5" />
              ) : (
                <Play className="h-3.5 w-3.5" />
              )}
            </button>
          )}
          <button
            type="button"
            onClick={() => {
              if (activeSubtitleAudio) {
                regenerateSubtitleAudioWithDraft(activeSubtitleAudio);
              }
            }}
            disabled={
              !activeSubtitleAudio ||
              !selectedVoice ||
              subtitleAudioSyncing ||
              Boolean(subtitleAudioRegeneratingId) ||
              subtitleAudioMasterBusy ||
              isMasterGenerating ||
              isMediaProcessing
            }
            className="inline-flex items-center gap-1 rounded-md border border-violet-500/30 bg-violet-500/10 px-2 py-1 text-[10px] font-semibold text-violet-200 hover:bg-violet-500/20 disabled:cursor-not-allowed disabled:opacity-40"
            title="Tạo lại TTS cho câu đang nói"
          >
            {subtitleAudioRegeneratingId === activeSubtitleAudioItem?.id ? (
              <LoaderCircle className="h-3 w-3 animate-spin" />
            ) : (
              <RefreshCw className="h-3 w-3" />
            )}
            Tạo lại
          </button>
        </div>
      </div>
    </div>
  );
}
