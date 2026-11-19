import { LoaderCircle, Pause, Play, RefreshCw, Trash2 } from "lucide-react";
import { formatDuration } from "./helpers";

export default function SubtitleAudioList({
  combineSubtitleAudioCueAbove,
  commitSubtitleAudioCueText,
  deleteSubtitleAudioCue,
  filteredSubtitleAudioInput,
  isMasterGenerating,
  isMediaProcessing,
  playSubtitleAudio,
  previewSubtitleCues,
  regenerateSubtitleAudioWithDraft,
  seekSubtitleTimeline,
  selectedVoice,
  setSubtitleAudioDrafts,
  subtitleAudioDrafts,
  subtitleAudioInput,
  subtitleAudioItems,
  subtitleAudioMasterBusy,
  subtitleAudioPlayingId,
  subtitleAudioRegeneratingId,
  subtitleAudioSyncing,
}) {
  return (
    <div className="max-h-[70vh] overflow-auto rounded-lg border border-slate-800">
      <div
        role="table"
        aria-label="Danh sách phụ đề và audio"
        className="w-full text-xs"
      >
        <div role="rowgroup">
          <div
            role="row"
            className="sticky top-0 z-10 grid w-full grid-cols-[3.5rem_minmax(0,1fr)_max-content_max-content] bg-slate-900 text-[10px] uppercase tracking-wider text-slate-500"
          >
            <div role="columnheader" className="px-2 py-2">
              #
            </div>
            <div role="columnheader" className="px-2 py-2">
              Phụ đề
            </div>
            <div role="columnheader" className="whitespace-nowrap px-2 py-2">
              Audio
            </div>
            <div
              role="columnheader"
              className="whitespace-nowrap px-2 py-2 text-right"
            >
              Tác vụ
            </div>
          </div>
        </div>
        <div role="rowgroup" className="divide-y divide-slate-800/80">
          {filteredSubtitleAudioInput.length ? (
            filteredSubtitleAudioInput.map((item) => {
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
                  role="row"
                  className="grid w-full grid-cols-[3.5rem_minmax(0,1fr)_max-content_max-content] text-slate-300"
                >
                  <div
                    role="cell"
                    onClick={() => seekSubtitleTimeline(item.startTime)}
                    title={`Tua preview đến câu ${item.index}`}
                    className="cursor-pointer px-2 py-1.5 font-mono text-slate-500 hover:bg-cyan-950/20"
                  >
                    {item.index}
                  </div>
                  <div
                    role="cell"
                    onClick={() => seekSubtitleTimeline(item.startTime)}
                    title={`Tua preview đến câu ${item.index}`}
                    className="min-w-0 cursor-pointer px-2 py-1 hover:bg-cyan-950/20"
                  >
                    <div className="flex min-w-0 items-center gap-2">
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
                        className="h-8 min-w-0 flex-1 rounded-md border border-slate-700 bg-slate-950 px-2 text-xs text-slate-100 outline-none focus:border-violet-400"
                      />
                      <span className="shrink-0 text-[10px] text-slate-500">
                        {formatDuration(item.startTime)} –{" "}
                        {formatDuration(item.endTime)}
                      </span>
                      {editedAfterAudio && (
                        <span
                          className="shrink-0 text-[10px] text-amber-300"
                          title="Audio vẫn dùng nội dung trước"
                        >
                          Audio cũ
                        </span>
                      )}
                    </div>
                  </div>
                  <div role="cell" className="whitespace-nowrap px-2 py-1">
                    {audio?.audioUrl ? (
                      <div className="flex items-center gap-2">
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
                          className="inline-flex h-8 w-8 shrink-0 items-center justify-center rounded-md border border-violet-500/30 bg-violet-500/10 text-violet-200 hover:bg-violet-500/20"
                        >
                          {subtitleAudioPlayingId === item.id ? (
                            <Pause className="h-3.5 w-3.5" />
                          ) : (
                            <Play className="h-3.5 w-3.5" />
                          )}
                        </button>
                        {audio.status === "failed" && (
                          <span
                            className="max-w-36 truncate text-[10px] text-rose-300"
                            title={audio.error}
                          >
                            {audio.error || "Tạo audio thất bại"}
                          </span>
                        )}
                      </div>
                    ) : (
                      <span
                        className={`inline-flex items-center gap-1.5 text-[10px] ${audio?.status === "failed" ? "text-rose-300" : "text-slate-500"}`}
                      >
                        {audio?.status === "generating" && (
                          <LoaderCircle className="h-3 w-3 animate-spin" />
                        )}
                        {audio?.status === "failed"
                          ? audio.error || "Tạo audio thất bại"
                          : audio?.status === "generating"
                            ? "Đang tạo audio…"
                            : "Chưa có audio"}
                      </span>
                    )}
                  </div>
                  <div
                    role="cell"
                    className="whitespace-nowrap px-2 py-1 text-right"
                  >
                    <div className="flex flex-nowrap justify-end gap-1">
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
                        className="inline-flex items-center gap-1 rounded-md border border-violet-500/30 bg-violet-500/10 px-1.5 py-1 text-[9px] font-semibold text-violet-200 hover:bg-violet-500/20 disabled:opacity-40"
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
                        className="rounded-md border border-amber-500/30 px-1.5 py-1 text-[9px] font-semibold text-amber-200 hover:bg-amber-950/30 disabled:cursor-not-allowed disabled:opacity-40"
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
                        className="rounded-md border border-cyan-500/30 px-1.5 py-1 text-[9px] font-semibold text-cyan-200 hover:bg-cyan-950/30 disabled:cursor-not-allowed disabled:opacity-40"
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
                        className="inline-flex items-center gap-1 rounded-md border border-rose-500/30 bg-rose-500/10 px-1.5 py-1 text-[9px] font-semibold text-rose-200 hover:bg-rose-500/20 disabled:opacity-40"
                        title={`Xóa câu ${item.index} và audio`}
                      >
                        <Trash2 className="h-3 w-3" />
                        Xóa
                      </button>
                    </div>
                  </div>
                </div>
              );
            })
          ) : (
            <div
              role="row"
              className="grid w-full grid-cols-[3.5rem_minmax(0,1fr)_max-content_max-content]"
            >
              <div
                role="cell"
                className="col-span-4 px-4 py-10 text-center text-xs text-slate-500"
              >
                {subtitleAudioInput.length
                  ? "Không có câu nào khớp bộ lọc hiện tại."
                  : "Chưa có câu phụ đề để tạo audio."}
              </div>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
