import { X } from "lucide-react";
import { formatSecondsToSrtTime } from "../../utils/srtParser";
import { formatFileSize, statusLabel } from "./helpers";
import MetadataGrid from "./MetadataGrid";

export default function FileDetailsModal({
  detailJob,
  detailState,
  detailSubtitle,
  detailVideoFile,
  setDetailRowIndex,
  setFileDetailsOpen,
}) {
  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center bg-black/70 p-4"
      role="presentation"
      onMouseDown={(event) => {
        if (event.target === event.currentTarget) {
          setFileDetailsOpen(false);
          setDetailRowIndex(null);
        }
      }}
    >
      <section
        role="dialog"
        aria-modal="true"
        aria-labelledby="video-dubbing-file-details-title"
        className="max-h-[85vh] w-full max-w-2xl overflow-y-auto rounded-2xl border border-slate-700 bg-slate-900 p-5 shadow-2xl"
      >
        <div className="flex items-center justify-between gap-3">
          <h3
            id="video-dubbing-file-details-title"
            className="text-lg font-bold text-white"
          >
            Thông tin Video và SRT
          </h3>
          <button
            type="button"
            onClick={() => {
              setFileDetailsOpen(false);
              setDetailRowIndex(null);
            }}
            className="rounded-lg p-2 text-slate-400 hover:bg-slate-800 hover:text-white"
            aria-label="Đóng details"
          >
            <X className="h-4 w-4" />
          </button>
        </div>

        <div className="mt-4 space-y-4">
          <div className="rounded-xl border border-slate-800 bg-slate-950/60 p-3">
            <h4 className="text-sm font-semibold text-white">Video nguồn</h4>
            {!detailVideoFile ? (
              <p className="mt-2 text-xs text-slate-500">Chưa chọn video.</p>
            ) : (
              <>
                <p className="mt-2 break-all text-xs text-slate-300">
                  {detailVideoFile.name} ·{" "}
                  {formatFileSize(detailVideoFile.size)}
                </p>
                <p className="mt-1 text-xs text-slate-400">
                  {detailState?.phase ||
                    (detailJob ? statusLabel(detailJob) : "Đang chờ xử lý")}
                  {detailState?.progressPercent !== undefined &&
                    ` · ${Math.round(detailState.progressPercent)}%`}
                </p>
                {detailState?.error && (
                  <p className="mt-2 text-xs text-rose-300">
                    {detailState.error}
                  </p>
                )}
                {detailJob?.status === "completed" && detailJob.metadata && (
                  <MetadataGrid metadata={detailJob.metadata} />
                )}
              </>
            )}
          </div>

          <div className="rounded-xl border border-slate-800 bg-slate-950/60 p-3">
            <h4 className="text-sm font-semibold text-white">Phụ đề SRT</h4>
            {!detailSubtitle ? (
              <p className="mt-2 text-xs text-slate-500">Chưa chọn SRT.</p>
            ) : (
              <>
                <p className="mt-2 break-all text-xs text-slate-300">
                  {detailSubtitle.fileName} ·{" "}
                  {formatFileSize(detailSubtitle.sizeBytes)}
                </p>
                {detailSubtitle.error ? (
                  <p className="mt-2 text-xs text-rose-300">
                    {detailSubtitle.error}
                  </p>
                ) : detailSubtitle.analysis ? (
                  <div className="mt-3 grid grid-cols-1 gap-2 sm:grid-cols-3">
                    <div className="rounded-lg border border-slate-800 p-2">
                      <p className="text-[11px] text-slate-400">Cue hợp lệ</p>
                      <p className="mt-1 text-sm font-bold text-emerald-300">
                        {detailSubtitle.analysis.subtitleCount}
                      </p>
                    </div>
                    <div className="rounded-lg border border-slate-800 p-2">
                      <p className="text-[11px] text-slate-400">Bắt đầu</p>
                      <p className="mt-1 text-sm font-bold text-white">
                        {formatSecondsToSrtTime(
                          detailSubtitle.analysis.earliestStart,
                        )}
                      </p>
                    </div>
                    <div className="rounded-lg border border-slate-800 p-2">
                      <p className="text-[11px] text-slate-400">Kết thúc</p>
                      <p className="mt-1 text-sm font-bold text-white">
                        {formatSecondsToSrtTime(
                          detailSubtitle.analysis.latestEnd,
                        )}
                      </p>
                    </div>
                    {detailSubtitle.analysis.invalidBlockCount > 0 && (
                      <p className="text-xs text-amber-300 sm:col-span-3">
                        Bỏ qua {detailSubtitle.analysis.invalidBlockCount} block
                        không hợp lệ.
                      </p>
                    )}
                  </div>
                ) : (
                  <p className="mt-2 text-xs text-slate-400">
                    Đang phân tích nội dung SRT…
                  </p>
                )}
              </>
            )}
          </div>
        </div>

        <div className="mt-5 flex justify-end">
          <button
            type="button"
            onClick={() => {
              setFileDetailsOpen(false);
              setDetailRowIndex(null);
            }}
            className="rounded-lg bg-slate-800 px-4 py-2 text-xs font-semibold text-white hover:bg-slate-700"
          >
            Đóng
          </button>
        </div>
      </section>
    </div>
  );
}
