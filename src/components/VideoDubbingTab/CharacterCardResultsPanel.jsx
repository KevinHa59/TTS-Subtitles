import { X } from "lucide-react";
import { formatDuration } from "./helpers";

import { useVideoDubbing } from "./VideoDubbingContext";

export default function CharacterCardResultsPanel(props) {
  const context = useVideoDubbing();
  const {
  characterCardOcrDuration,
  characterCardOcrError,
  characterCardOcrJob,
  characterCardOcrStartOffset,
  characterCardReferenceScanJob,
  characterCardReferenceSelectedIds,
  characterCardReferenceSimilarity,
  createCharacterCardsAutomatically,
  setCharacterCardReferenceScanJob,
  setCharacterCardReferenceSelectedIds,
} = { ...context, ...props };
  return (
    <section
      role="dialog"
      aria-modal="true"
      aria-labelledby="character-card-reference-results-title"
      className="flex max-h-[90vh] w-full max-w-4xl flex-col rounded-2xl border border-violet-500/30 bg-slate-900 shadow-2xl"
    >
      <header className="flex items-start gap-3 border-b border-slate-800 p-4">
        <div className="min-w-0 flex-1">
          <h3
            id="character-card-reference-results-title"
            className="text-sm font-bold text-white"
          >
            Kết quả tìm card theo ảnh mẫu
          </h3>
          <p className="mt-1 text-[10px] text-slate-400">
            Chọn các lần xuất hiện cần tạo card. OCR sẽ quét từ{" "}
            {characterCardOcrStartOffset} giây trước thời điểm khớp trong{" "}
            {characterCardOcrDuration} giây. Bật “Giữ OCR chạy” để tránh nạp lại
            model khi chọn nhiều khoảng.
          </p>
        </div>
        <button
          type="button"
          onClick={() => {
            setCharacterCardReferenceScanJob(null);
            setCharacterCardReferenceSelectedIds([]);
          }}
          className="rounded-md p-1 text-slate-400 hover:bg-slate-800 hover:text-white"
          aria-label="Đóng kết quả quét ảnh mẫu"
        >
          <X className="h-4 w-4" />
        </button>
      </header>
      <div className="flex flex-wrap items-center justify-between gap-2 border-b border-slate-800 px-4 py-2">
        <label className="flex items-center gap-2 text-xs text-slate-300">
          <input
            type="checkbox"
            checked={
              characterCardReferenceScanJob.results.length > 0 &&
              characterCardReferenceSelectedIds.length ===
                characterCardReferenceScanJob.results.length
            }
            onChange={(event) =>
              setCharacterCardReferenceSelectedIds(
                event.target.checked
                  ? characterCardReferenceScanJob.results.map((item) => item.id)
                  : [],
              )
            }
            className="accent-violet-400"
          />
          Chọn tất cả ({characterCardReferenceScanJob.results.length})
        </label>
        <span className="text-[10px] text-slate-500">
          Độ giống tối thiểu{" "}
          {Math.round(characterCardReferenceSimilarity * 100)}%
        </span>
      </div>
      <div className="min-h-0 flex-1 overflow-y-auto p-4">
        {characterCardReferenceScanJob.results.length ? (
          <div className="grid gap-2 sm:grid-cols-2">
            {characterCardReferenceScanJob.results.map((item) => {
              const checked = characterCardReferenceSelectedIds.includes(
                item.id,
              );
              return (
                <label
                  key={item.id}
                  className={`flex cursor-pointer gap-3 rounded-lg border p-2.5 ${checked ? "border-violet-400/60 bg-violet-950/30" : "border-slate-800 bg-slate-950/50"}`}
                >
                  <input
                    type="checkbox"
                    checked={checked}
                    onChange={(event) =>
                      setCharacterCardReferenceSelectedIds((current) =>
                        event.target.checked
                          ? [...current, item.id]
                          : current.filter((id) => id !== item.id),
                      )
                    }
                    className="mt-1 accent-violet-400"
                    aria-label={`Chọn card tại ${formatDuration(item.time)}`}
                  />
                  {item.thumbnail && (
                    <img
                      src={item.thumbnail}
                      alt=""
                      className="h-20 w-32 shrink-0 rounded bg-black object-contain"
                    />
                  )}
                  <span className="min-w-0 text-[10px] text-slate-300">
                    <span className="block font-semibold text-white">
                      {formatDuration(item.startTime)} –{" "}
                      {formatDuration(item.endTime)}
                    </span>
                    <span className="mt-1 block text-slate-400">
                      Khớp tốt nhất: {formatDuration(item.time)}
                    </span>
                    <span className="mt-1 block text-violet-200">
                      Độ giống {Math.round(item.confidence * 100)}%
                    </span>
                  </span>
                </label>
              );
            })}
          </div>
        ) : (
          <p className="py-12 text-center text-sm text-slate-400">
            Không tìm thấy kết quả phù hợp có chữ. Hãy thử giảm ngưỡng giống
            hoặc chọn ảnh mẫu rõ hơn.
          </p>
        )}
        {characterCardOcrJob?.status === "running" && (
          <p className="mt-3 text-xs text-amber-200" role="status">
            {characterCardOcrJob.message} {characterCardOcrJob.progressPercent}%
          </p>
        )}
        {characterCardOcrError && (
          <p className="mt-3 text-xs text-rose-300" role="alert">
            {characterCardOcrError}
          </p>
        )}
      </div>
      <footer className="flex flex-wrap items-center justify-between gap-2 border-t border-slate-800 p-4">
        <button
          type="button"
          onClick={() => {
            setCharacterCardReferenceScanJob(null);
            setCharacterCardReferenceSelectedIds([]);
          }}
          className="rounded-md border border-slate-700 px-3 py-2 text-xs text-slate-300 hover:bg-slate-800"
        >
          Đóng
        </button>
        <button
          type="button"
          disabled={
            !characterCardReferenceSelectedIds.length ||
            characterCardOcrJob?.status === "running" ||
            characterCardOcrJob?.status === "queued"
          }
          onClick={() => {
            const selectedOccurrences = characterCardReferenceScanJob.results
              .filter((item) =>
                characterCardReferenceSelectedIds.includes(item.id),
              )
              .map(({ startTime, endTime, time }) => ({
                startTime,
                endTime,
                time,
              }));
            void createCharacterCardsAutomatically(selectedOccurrences);
          }}
          className="rounded-md bg-violet-300 px-3 py-2 text-xs font-bold text-slate-950 hover:bg-violet-200 disabled:cursor-not-allowed disabled:opacity-40"
        >
          Tạo card từ {characterCardReferenceSelectedIds.length} kết quả đã chọn
        </button>
      </footer>
    </section>
  );
}
