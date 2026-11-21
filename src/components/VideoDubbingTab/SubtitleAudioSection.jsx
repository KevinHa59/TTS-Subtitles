import { Filter, LoaderCircle, RefreshCw, X } from "lucide-react";
import CurrentSubtitlePanel from "./CurrentSubtitlePanel";
import SubtitleAudioList from "./SubtitleAudioList";

import { useVideoDubbing } from "./VideoDubbingContext";

export default function SubtitleAudioSection(props) {
  const context = useVideoDubbing();
  const {
    activeSubtitleAudio,
    activeSubtitleAudioFilterCount = 0,
    activeSubtitleAudioItem,
    activeSubtitleAudioRow,
    adjustSubtitleAudioCueTiming,
    combineSubtitleAudioCueAbove,
    commitSubtitleAudioCueText,
    deleteSubtitleAudioCue,
    filteredSubtitleAudioInput = [],
    isMasterGenerating,
    isMediaProcessing,
    nextSubtitleAudioItem,
    playSubtitleAudio,
    previewSubtitleCues = [],
    previousSubtitleAudioItem,
    rebuildMasterFromSubtitleAudio,
    regenerateSubtitleAudioWithDraft,
    seekSubtitleTimeline,
    selectedVoice,
    setSubtitleAudioDrafts,
    setSubtitleAudioFilterOpen = () => {},
    setSubtitleAudioMaxCharacterCount = () => {},
    setSubtitleAudioShortFilterEnabled = () => {},
    setSubtitleAudioSimilarFilterEnabled = () => {},
    setSubtitleAudioSpecialCharactersFilterEnabled = () => {},
    setSubtitleAudioTimingStepMs = () => {},
    subtitleAudioDrafts = {},
    subtitleAudioError,
    subtitleAudioFilterOpen = false,
    subtitleAudioInput = [],
    subtitleAudioItems = [],
    subtitleAudioMasterBusy,
    subtitleAudioMaxCharacterCount = 5,
    subtitleAudioPlayingId,
    subtitleAudioRegeneratingId,
    subtitleAudioShortFilterEnabled = false,
    subtitleAudioSimilarFilterEnabled = false,
    subtitleAudioSpecialCharactersFilterEnabled = false,
    subtitleAudioSyncing,
    subtitleAudioTimingStepMs = 100,
  } = { ...context, ...props };
  return (
    <section className="space-y-3 rounded-xl border border-violet-500/25 bg-slate-950/70 p-3">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <h4 className="text-xs font-semibold text-white">Âm thanh phụ đề</h4>
          <p className="mt-1 text-[10px] text-slate-400">
            Sửa chữ không tự tạo lại audio; tạo lại Master sẽ dùng audio hiện
            có.
          </p>
        </div>
        <div className="flex items-center gap-2">
          <span className="text-[10px] text-slate-400">
            {activeSubtitleAudioFilterCount
              ? `${filteredSubtitleAudioInput.length}/${subtitleAudioInput.length} câu`
              : `${subtitleAudioInput.length} câu`}
          </span>
          <div className="relative">
            <button
              type="button"
              aria-expanded={subtitleAudioFilterOpen}
              aria-haspopup="dialog"
              onClick={() => setSubtitleAudioFilterOpen((open) => !open)}
              className={`inline-flex items-center gap-1.5 rounded-lg border px-2.5 py-2 text-xs font-semibold ${activeSubtitleAudioFilterCount ? "border-cyan-400/50 bg-cyan-950/30 text-cyan-100" : "border-slate-700 text-slate-300 hover:bg-slate-800"}`}
            >
              <Filter className="h-3.5 w-3.5" />
              Lọc
              {activeSubtitleAudioFilterCount > 0 && (
                <span className="rounded-full bg-cyan-300 px-1.5 text-[10px] font-bold text-slate-950">
                  {activeSubtitleAudioFilterCount}
                </span>
              )}
            </button>
            {subtitleAudioFilterOpen && (
              <div
                role="dialog"
                aria-label="Lọc danh sách phụ đề"
                className="absolute right-0 top-full z-30 mt-2 w-[min(22rem,calc(100vw-2rem))] space-y-3 rounded-xl border border-slate-700 bg-slate-900 p-3 shadow-2xl"
              >
                <div className="flex items-center justify-between gap-2">
                  <h5 className="text-xs font-semibold text-white">
                    Lọc câu phụ đề
                  </h5>
                  <button
                    type="button"
                    onClick={() => setSubtitleAudioFilterOpen(false)}
                    className="rounded p-1 text-slate-400 hover:bg-slate-800 hover:text-white"
                    aria-label="Đóng bộ lọc"
                  >
                    <X className="h-3.5 w-3.5" />
                  </button>
                </div>
                <p className="text-[10px] text-slate-400">
                  Hiện các câu khớp với bất kỳ tiêu chí nào đang bật.
                </p>
                <label className="flex items-center gap-2 text-xs text-slate-200">
                  <input
                    type="checkbox"
                    checked={subtitleAudioShortFilterEnabled}
                    onChange={(event) =>
                      setSubtitleAudioShortFilterEnabled(event.target.checked)
                    }
                    className="accent-cyan-400"
                  />
                  Câu ngắn, tối đa {subtitleAudioMaxCharacterCount} ký tự
                </label>
                <div
                  className={`flex items-center gap-3 pl-6 ${subtitleAudioShortFilterEnabled ? "" : "opacity-50"}`}
                >
                  <span className="text-[10px] text-slate-500">0</span>
                  <input
                    type="range"
                    min={0}
                    max={20}
                    step={1}
                    value={subtitleAudioMaxCharacterCount}
                    disabled={!subtitleAudioShortFilterEnabled}
                    onChange={(event) =>
                      setSubtitleAudioMaxCharacterCount(
                        Number(event.target.value),
                      )
                    }
                    className="w-full accent-cyan-400"
                    aria-label="Số ký tự tối đa của câu ngắn"
                  />
                  <span className="w-5 text-right text-[10px] tabular-nums text-slate-400">
                    {subtitleAudioMaxCharacterCount}
                  </span>
                </div>
                <label className="flex items-center gap-2 text-xs text-slate-200">
                  <input
                    type="checkbox"
                    checked={subtitleAudioSpecialCharactersFilterEnabled}
                    onChange={(event) =>
                      setSubtitleAudioSpecialCharactersFilterEnabled(
                        event.target.checked,
                      )
                    }
                    className="accent-cyan-400"
                  />
                  Câu chỉ có ký tự đặc biệt, không có chữ hoặc số
                </label>
                <label className="flex items-center gap-2 text-xs text-slate-200">
                  <input
                    type="checkbox"
                    checked={subtitleAudioSimilarFilterEnabled}
                    onChange={(event) =>
                      setSubtitleAudioSimilarFilterEnabled(event.target.checked)
                    }
                    className="accent-cyan-400"
                  />
                  Câu liền kề giống nhau trên 80%
                </label>
                <div className="flex justify-end border-t border-slate-800 pt-2">
                  <button
                    type="button"
                    onClick={() => {
                      setSubtitleAudioShortFilterEnabled(false);
                      setSubtitleAudioSpecialCharactersFilterEnabled(false);
                      setSubtitleAudioSimilarFilterEnabled(false);
                    }}
                    disabled={!activeSubtitleAudioFilterCount}
                    className="rounded-md px-2 py-1 text-[10px] font-semibold text-cyan-200 hover:bg-slate-800 disabled:cursor-not-allowed disabled:opacity-40"
                  >
                    Xóa bộ lọc
                  </button>
                </div>
              </div>
            )}
          </div>
          <button
            type="button"
            onClick={() => void rebuildMasterFromSubtitleAudio()}
            disabled={
              !subtitleAudioInput.length ||
              subtitleAudioSyncing ||
              subtitleAudioMasterBusy ||
              Boolean(subtitleAudioRegeneratingId) ||
              isMasterGenerating ||
              isMediaProcessing
            }
            className="inline-flex items-center gap-2 rounded-lg bg-violet-400 px-3 py-2 text-xs font-bold text-slate-950 hover:bg-violet-300 disabled:cursor-not-allowed disabled:opacity-40"
          >
            {subtitleAudioMasterBusy ? (
              <LoaderCircle className="h-3.5 w-3.5 animate-spin" />
            ) : (
              <RefreshCw className="h-3.5 w-3.5" />
            )}
            Tạo lại Master
          </button>
        </div>
      </div>
      {(subtitleAudioError || subtitleAudioSyncing) && (
        <p
          role={subtitleAudioError ? "alert" : "status"}
          className={`rounded-lg border px-3 py-2 text-[11px] ${subtitleAudioError ? "border-rose-500/30 bg-rose-950/30 text-rose-200" : "border-slate-700 bg-slate-900 text-slate-400"}`}
        >
          {subtitleAudioError || "Đang đồng bộ danh sách câu phụ đề…"}
        </p>
      )}
      <CurrentSubtitlePanel />
      <SubtitleAudioList />
    </section>
  );
}
