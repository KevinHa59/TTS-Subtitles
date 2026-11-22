import { useEffect, useRef } from "react";
import { LoaderCircle, Pause, Play, RefreshCw, Trash2 } from "lucide-react";

import { useVideoDubbing } from "./VideoDubbingContext";

export default function SubtitleAudioList(props) {
  const context = useVideoDubbing();
  const {
    activeSubtitleAudioItem,
    combineSubtitleAudioCueAbove,
    commitSubtitleAudioCueText,
    deleteSubtitleAudioCue,
    filteredSubtitleAudioInput = [],
    isMasterGenerating,
    isMediaProcessing,
    playSubtitleAudio,
    previewSubtitleCues = [],
    regenerateSubtitleAudioWithDraft,
    seekSubtitleTimeline,
    selectedVoice,
    setSubtitleAudioDrafts,
    subtitleAudioDrafts = {},
    subtitleAudioInput = [],
    subtitleAudioItems = [],
    subtitleAudioMasterBusy,
    subtitleAudioPlayingId,
    subtitleAudioRegeneratingId,
    subtitleAudioSyncing,
  } = { ...context, ...props };

  const containerRef = useRef(null);

  useEffect(() => {
    if (!activeSubtitleAudioItem?.id || !containerRef.current) return;
    const container = containerRef.current;
    const targetEl = container.querySelector(
      `[data-cue-id="${activeSubtitleAudioItem.id}"]`,
    );
    if (targetEl) {
      const containerRect = container.getBoundingClientRect();
      const targetRect = targetEl.getBoundingClientRect();
      const targetTop =
        targetRect.top - containerRect.top + container.scrollTop;
      container.scrollTo({
        top: Math.max(0, targetTop),
        behavior: "smooth",
      });
    }
  }, [activeSubtitleAudioItem?.id]);

  return (
    <div
      ref={containerRef}
      className="max-h-[70vh] overflow-y-auto rounded-lg border border-slate-800 bg-slate-950/40 divide-y divide-slate-800/80"
    >
      {filteredSubtitleAudioInput.length ? (
        filteredSubtitleAudioInput.map((item) => {
          const isActive = activeSubtitleAudioItem?.id === item.id;
          const audio = subtitleAudioItems.find(
            (entry) => entry.id === item.id,
          );
          const editedAfterAudio = Boolean(
            audio?.audioUrl && audio.generatedText !== item.text,
          );
          const subtitleItem = {
            ...item,
            targetDuration: Math.max(0.1, item.endTime - item.startTime),
            status: "pending",
          };
          const subtitleCueIndex = previewSubtitleCues.findIndex(
            (cue) => cue.id === item.id,
          );
          const combineDisabled =
            subtitleCueIndex <= 0 ||
            subtitleAudioSyncing ||
            Boolean(subtitleAudioRegeneratingId) ||
            subtitleAudioMasterBusy ||
            isMasterGenerating ||
            isMediaProcessing;
          return (
            <div
              key={item.id}
              data-cue-id={item.id}
              className={`p-2.5 space-y-2 transition-colors ${
                isActive
                  ? "bg-cyan-950/40 border-l-2 border-cyan-400"
                  : "hover:bg-slate-900/50"
              }`}
            >
              {/* Dòng 1: # số câu và input text */}
              <div className="flex items-center gap-2 min-w-0">
                <button
                  type="button"
                  onClick={() => seekSubtitleTimeline(item.startTime)}
                  title={`Tua preview đến câu ${item.index}`}
                  className={`shrink-0 h-8 min-w-[2.5rem] px-2 rounded-md font-mono text-xs font-bold transition-colors border ${
                    isActive
                      ? "bg-cyan-400 text-slate-950 border-cyan-300 shadow-sm shadow-cyan-500/20"
                      : "text-slate-300 bg-slate-900 border-slate-700/70 hover:bg-cyan-950/40 hover:text-cyan-300 hover:border-cyan-500/50"
                  }`}
                >
                  #{item.index}
                </button>
                <div className="flex min-w-0 flex-1 items-center gap-2">
                  <input
                    type="text"
                    aria-label={`Nội dung phụ đề câu ${item.index}`}
                    value={subtitleAudioDrafts[item.id] ?? item.text}
                    onChange={(event) =>
                      setSubtitleAudioDrafts((current) => ({
                        ...current,
                        [item.id]: event.target.value,
                      }))
                    }
                    onBlur={() => commitSubtitleAudioCueText(item.id)}
                    disabled={
                      subtitleAudioSyncing ||
                      Boolean(subtitleAudioRegeneratingId) ||
                      subtitleAudioMasterBusy ||
                      isMasterGenerating ||
                      isMediaProcessing
                    }
                    className="h-8 min-w-0 flex-1 rounded-md border border-slate-700 bg-slate-950 px-2.5 text-xs text-slate-100 outline-none focus:border-violet-400 disabled:opacity-60"
                  />
                  {editedAfterAudio && (
                    <span
                      className="shrink-0 rounded border border-amber-500/30 bg-amber-500/15 px-1.5 py-0.5 text-[9px] font-semibold text-amber-300"
                      title="Audio vẫn dùng nội dung trước khi sửa chữ"
                    >
                      Audio cũ
                    </span>
                  )}
                </div>
              </div>

              {/* Dòng 2: các nút chức năng bao gồm nút audio */}
              <div className="flex flex-wrap items-center gap-1.5 pt-0.5">
                {/* Nút Audio / Trạng thái Audio */}
                {audio?.audioUrl ? (
                  <button
                    type="button"
                    onClick={() => void playSubtitleAudio(audio)}
                    aria-label={
                      subtitleAudioPlayingId === item.id
                        ? `Dừng audio câu ${item.index}`
                        : `Phát audio câu ${item.index}`
                    }
                    title={
                      subtitleAudioPlayingId === item.id
                        ? "Dừng phát"
                        : "Phát audio"
                    }
                    className="inline-flex h-7 items-center gap-1.5 rounded-md border border-violet-500/30 bg-violet-500/10 px-2 text-[10px] font-semibold text-violet-200 hover:bg-violet-500/20 transition-colors"
                  >
                    {subtitleAudioPlayingId === item.id ? (
                      <>
                        <Pause className="h-3 w-3" />
                        <span>Dừng</span>
                      </>
                    ) : (
                      <>
                        <Play className="h-3 w-3" />
                        <span>Phát</span>
                      </>
                    )}
                  </button>
                ) : (
                  <span
                    className={`inline-flex items-center gap-1 text-[10px] ${
                      audio?.status === "failed"
                        ? "text-rose-300"
                        : "text-slate-400"
                    }`}
                  >
                    {audio?.status === "generating" && (
                      <LoaderCircle className="h-3 w-3 animate-spin text-cyan-400" />
                    )}
                    {audio?.status === "failed"
                      ? audio.error || "Tạo audio thất bại"
                      : audio?.status === "generating"
                        ? "Đang tạo audio…"
                        : "Chưa có audio"}
                  </span>
                )}
                {audio?.status === "failed" && audio?.audioUrl && (
                  <span
                    className="max-w-28 truncate text-[10px] text-rose-300"
                    title={audio.error}
                  >
                    {audio.error}
                  </span>
                )}

                {/* Các nút tác vụ */}
                <button
                  type="button"
                  onClick={() =>
                    regenerateSubtitleAudioWithDraft(subtitleItem)
                  }
                  disabled={
                    !selectedVoice ||
                    subtitleAudioSyncing ||
                    Boolean(subtitleAudioRegeneratingId) ||
                    subtitleAudioMasterBusy ||
                    isMasterGenerating ||
                    isMediaProcessing
                  }
                  className="inline-flex h-7 items-center gap-1 rounded-md border border-violet-500/30 bg-violet-500/10 px-2 text-[10px] font-semibold text-violet-200 hover:bg-violet-500/20 disabled:cursor-not-allowed disabled:opacity-40"
                  title={`Tạo lại audio câu ${item.index}`}
                >
                  {subtitleAudioRegeneratingId === item.id ? (
                    <LoaderCircle className="h-3 w-3 animate-spin" />
                  ) : (
                    <RefreshCw className="h-3 w-3" />
                  )}
                  Tạo lại
                </button>
                <button
                  type="button"
                  onClick={() =>
                    combineSubtitleAudioCueAbove(item.id, "merge")
                  }
                  disabled={combineDisabled}
                  className="inline-flex h-7 items-center rounded-md border border-amber-500/30 px-2 text-[10px] font-semibold text-amber-200 hover:bg-amber-950/30 disabled:cursor-not-allowed disabled:opacity-40"
                  title="Gộp với câu phía trên, giữ nội dung câu phía trên và mở rộng thời gian"
                >
                  Merge above
                </button>
                <button
                  type="button"
                  onClick={() =>
                    combineSubtitleAudioCueAbove(item.id, "join")
                  }
                  disabled={combineDisabled}
                  className="inline-flex h-7 items-center rounded-md border border-cyan-500/30 px-2 text-[10px] font-semibold text-cyan-200 hover:bg-cyan-950/30 disabled:cursor-not-allowed disabled:opacity-40"
                  title="Nối nội dung với câu phía trên và mở rộng thời gian"
                >
                  Join above
                </button>
                <button
                  type="button"
                  onClick={() => deleteSubtitleAudioCue(item.id)}
                  disabled={
                    subtitleAudioSyncing ||
                    Boolean(subtitleAudioRegeneratingId) ||
                    subtitleAudioMasterBusy ||
                    isMasterGenerating ||
                    isMediaProcessing
                  }
                  className="inline-flex h-7 items-center gap-1 rounded-md border border-rose-500/30 bg-rose-500/10 px-2 text-[10px] font-semibold text-rose-200 hover:bg-rose-500/20 disabled:cursor-not-allowed disabled:opacity-40"
                  title={`Xóa câu ${item.index} và audio`}
                >
                  <Trash2 className="h-3 w-3" />
                  Xóa
                </button>
              </div>
            </div>
          );
        })
      ) : (
        <div className="px-4 py-8 text-center text-xs text-slate-500">
          {subtitleAudioInput.length
            ? "Không có câu nào khớp bộ lọc hiện tại."
            : "Chưa có câu phụ đề để tạo audio."}
        </div>
      )}
    </div>
  );
}
