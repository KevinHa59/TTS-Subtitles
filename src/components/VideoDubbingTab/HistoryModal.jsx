import {
  CheckCircle2,
  FolderOpen,
  History,
  RefreshCw,
  Trash2,
} from "lucide-react";
import { statusLabel } from "./helpers";

export default function HistoryModal({
  deleteHistoryJob,
  historyError,
  historyExpanded,
  historyLoading,
  job,
  jobHistory,
  loadJobHistory,
  openHistoryJob,
  setHistoryExpanded,
}) {
  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center bg-black/75 p-3 sm:p-6"
      role="presentation"
      onMouseDown={(event) => {
        if (event.target === event.currentTarget) setHistoryExpanded(false);
      }}
    >
      <section
        role="dialog"
        aria-modal="true"
        aria-labelledby="video-dubbing-history-title"
        className="max-h-[90vh] w-full max-w-5xl space-y-3 overflow-y-auto rounded-2xl border border-slate-800 bg-slate-900 p-4 shadow-2xl sm:p-5"
      >
        <div className="flex items-center justify-between gap-3">
          <div className="flex min-w-0 items-center gap-2">
            <History className="w-4 h-4 text-amber-400" />
            <h3
              id="video-dubbing-history-title"
              className="font-semibold text-white"
            >
              Lịch sử job
            </h3>
            <span className="text-xs text-slate-500">{jobHistory.length}</span>
          </div>
          <div className="flex items-center gap-2">
            <button
              type="button"
              onClick={() => void loadJobHistory()}
              disabled={historyLoading}
              className="inline-flex items-center gap-1.5 rounded-lg border border-slate-700 bg-slate-950/70 px-2.5 py-1.5 text-xs text-slate-300 hover:text-white disabled:opacity-50"
            >
              <RefreshCw
                className={`w-3.5 h-3.5 ${historyLoading ? "animate-spin" : ""}`}
              />
              Làm mới
            </button>
            <button
              type="button"
              onClick={() => setHistoryExpanded(false)}
              className="rounded-lg border border-slate-700 px-3 py-1.5 text-xs text-slate-300 hover:text-white"
            >
              Đóng
            </button>
          </div>
        </div>
        {historyExpanded && (
          <div id="video-dubbing-job-history" className="space-y-3">
            {historyError && (
              <p className="rounded-lg border border-rose-500/30 bg-rose-950/30 p-2.5 text-xs text-rose-200">
                {historyError}
              </p>
            )}
            {jobHistory.length === 0 ? (
              <p className="rounded-xl border border-slate-800 bg-slate-950/50 p-3 text-xs text-slate-500">
                {historyLoading
                  ? "Đang tải lịch sử job…"
                  : "Chưa có job Video Dubbing được lưu."}
              </p>
            ) : (
              <ul className="space-y-2">
                {jobHistory.map((item) => {
                  const isSelected = item.job.id === job?.id;
                  const outputs = [
                    ["Video", item.outputs.sourceVideo],
                    ["TTS Master", item.outputs.masterAudio],
                    ["Vocals", item.outputs.vocals],
                    ["Instrumental", item.outputs.instrumental],
                    ["Bản phối", item.outputs.mixedAudio],
                    ["Final mix", item.outputs.finalMix],
                    ["MP4", item.outputs.exportedVideo],
                  ];
                  return (
                    <li
                      key={item.job.id}
                      className={`rounded-xl border p-3 ${
                        isSelected
                          ? "border-amber-500/40 bg-amber-950/15"
                          : "border-slate-800 bg-slate-950/50"
                      }`}
                    >
                      <div className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
                        <div className="min-w-0 flex-1">
                          <div className="flex flex-wrap items-center gap-x-2 gap-y-1">
                            <span className="truncate text-sm font-semibold text-slate-100">
                              {item.job.fileName}
                            </span>
                            <span className="rounded-full bg-slate-800 px-2 py-0.5 text-[10px] text-slate-300">
                              {statusLabel(item.job)}
                            </span>
                            <code className="text-[10px] text-slate-500">
                              {item.job.id.slice(-8)}
                            </code>
                            <span className="text-[10px] text-slate-500">
                              {new Date(item.job.createdAt).toLocaleString()}
                            </span>
                          </div>
                          <div className="mt-2 flex flex-wrap gap-1.5">
                            {outputs.map(([label, available]) => (
                              <span
                                key={label}
                                className={`inline-flex items-center gap-1 rounded-full border px-2 py-0.5 text-[10px] ${
                                  available
                                    ? "border-emerald-500/20 bg-emerald-950/20 text-emerald-300"
                                    : "border-slate-800 bg-slate-900/60 text-slate-500"
                                }`}
                              >
                                {available && (
                                  <CheckCircle2 className="h-3 w-3" />
                                )}
                                {label}
                              </span>
                            ))}
                          </div>
                          {item.warning && (
                            <p className="mt-2 text-[11px] leading-relaxed text-amber-300">
                              {item.warning}
                            </p>
                          )}
                        </div>
                        <div className="flex shrink-0 gap-2">
                          <button
                            type="button"
                            onClick={() => openHistoryJob(item)}
                            className="inline-flex items-center gap-1.5 rounded-lg border border-amber-500/30 bg-amber-950/20 px-2.5 py-1.5 text-xs font-semibold text-amber-200 hover:bg-amber-950/40"
                          >
                            <FolderOpen className="h-3.5 w-3.5" />
                            Mở job
                          </button>
                          <button
                            type="button"
                            onClick={() => void deleteHistoryJob(item)}
                            className="inline-flex items-center gap-1.5 rounded-lg border border-slate-700 bg-slate-950/70 px-2.5 py-1.5 text-xs text-slate-300 hover:border-rose-500/40 hover:text-rose-200"
                            aria-label={`Xóa job ${item.job.fileName}`}
                          >
                            <Trash2 className="h-3.5 w-3.5" />
                            Xóa
                          </button>
                        </div>
                      </div>
                    </li>
                  );
                })}
              </ul>
            )}
          </div>
        )}
      </section>
    </div>
  );
}
