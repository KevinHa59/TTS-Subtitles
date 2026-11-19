import {
  AlertCircle,
  CheckCircle2,
  ChevronDown,
  LoaderCircle,
  Volume2,
  X,
} from "lucide-react";
import { formatDuration, formatFileSize } from "./helpers";

export default function TtsMasterGenerateSection({
  canGenerateMaster,
  cancelMaster,
  createMaster,
  hasMasterAudio,
  isAutoPipelineRunning,
  isMasterGenerating,
  job,
  masterError,
  masterGeneration,
  masterPanelExpanded,
  setMasterPanelExpanded,
}) {
  return (
    <section className="rounded-2xl border border-slate-800 bg-slate-900/80 p-4 sm:p-5 space-y-5">
      <button
        type="button"
        onClick={() => setMasterPanelExpanded((expanded) => !expanded)}
        aria-expanded={masterPanelExpanded}
        aria-controls="video-dubbing-master-panel"
        className="flex w-full items-start gap-3 text-left"
      >
        <div className="w-10 h-10 rounded-xl bg-amber-500/15 text-amber-400 border border-amber-500/25 flex items-center justify-center shrink-0">
          <Volume2 className="w-5 h-5" />
        </div>
        <div className="min-w-0 flex-1">
          <h3 className="font-semibold text-white">Tạo TTS Master</h3>
          <p className="mt-1 text-xs leading-relaxed text-slate-400">
            Dùng pipeline Đồng Bộ Phụ Đề hiện có: mô hình giọng đọc tạo từng
            câu, căn theo timestamp rồi ghép WAV mono 22,050 Hz. Nếu timeline
            vượt video, phần dư cuối track sẽ được trim.
          </p>
        </div>
        <ChevronDown
          className={`mt-2 h-4 w-4 shrink-0 text-slate-400 transition-transform ${masterPanelExpanded ? "rotate-180" : ""}`}
        />
      </button>

      {masterPanelExpanded && (
        <div id="video-dubbing-master-panel" className="space-y-5">
          {masterGeneration?.status === "generating" && (
            <div className="space-y-2 rounded-xl border border-amber-500/25 bg-amber-950/20 p-3.5">
              <div className="flex flex-wrap items-center justify-between gap-2 text-xs">
                <span className="inline-flex items-center gap-2 text-amber-200">
                  <LoaderCircle className="w-4 h-4 animate-spin" />
                  Đang tạo TTS Master
                </span>
                <span className="text-slate-300">
                  {masterGeneration.completedSentences}/
                  {masterGeneration.totalSentences} câu ·{" "}
                  {Math.round(masterGeneration.progressPercent)}%
                </span>
              </div>
              <div className="h-2 rounded-full bg-slate-800 overflow-hidden">
                <div
                  className="h-full rounded-full bg-amber-400 transition-all"
                  style={{
                    width: `${masterGeneration.progressPercent}%`,
                  }}
                />
              </div>
              <button
                type="button"
                onClick={() => void cancelMaster()}
                disabled={isAutoPipelineRunning}
                className="inline-flex items-center gap-1.5 rounded-lg border border-slate-700 bg-slate-950/70 px-2.5 py-1.5 text-xs text-slate-300 hover:text-white hover:border-slate-500 transition-colors"
              >
                <X className="w-3.5 h-3.5" />
                Hủy tạo Master
              </button>
            </div>
          )}

          {masterError && (
            <div className="flex items-start gap-2 rounded-lg border border-rose-500/30 bg-rose-950/40 p-3 text-xs text-rose-200">
              <AlertCircle className="w-4 h-4 shrink-0 text-rose-400" />
              <span>{masterError}</span>
            </div>
          )}
          {masterGeneration?.status === "failed" && masterGeneration.error && (
            <div className="flex items-start gap-2 rounded-lg border border-rose-500/30 bg-rose-950/40 p-3 text-xs text-rose-200">
              <AlertCircle className="w-4 h-4 shrink-0 text-rose-400" />
              <span>{masterGeneration.error}</span>
            </div>
          )}
          {masterGeneration?.status === "cancelled" && !isMasterGenerating && (
            <p className="text-xs text-slate-400">
              Đã hủy quá trình tạo TTS Master.
            </p>
          )}
          {masterGeneration?.status === "interrupted" && (
            <p className="rounded-lg border border-amber-500/25 bg-amber-950/20 p-3 text-xs text-amber-200">
              {masterGeneration.error || "Tác vụ TTS Master bị gián đoạn."}
            </p>
          )}

          <div className="flex flex-col sm:flex-row sm:items-center gap-3">
            <button
              type="button"
              onClick={() => void createMaster()}
              disabled={!canGenerateMaster}
              className="inline-flex items-center justify-center gap-2 rounded-xl bg-amber-500 px-4 py-2.5 text-sm font-bold text-slate-950 transition-colors hover:bg-amber-400 disabled:cursor-not-allowed disabled:bg-slate-800 disabled:text-slate-500"
            >
              {isMasterGenerating ? (
                <LoaderCircle className="w-4 h-4 animate-spin" />
              ) : (
                <Volume2 className="w-4 h-4" />
              )}
              Tạo TTS Master
            </button>
            {!canGenerateMaster && !isMasterGenerating && (
              <p className="text-xs text-slate-500">
                Cần video đã kiểm tra thành công, SRT có cue hợp lệ và một giọng
                đọc khả dụng.
              </p>
            )}
          </div>

          {hasMasterAudio &&
            masterGeneration?.durationSeconds !== undefined && (
              <div className="space-y-3 rounded-xl border border-emerald-500/25 bg-emerald-950/20 p-3.5">
                <div className="flex flex-wrap items-center gap-x-3 gap-y-1 text-xs">
                  <span className="inline-flex items-center gap-1.5 font-semibold text-emerald-300">
                    {masterGeneration.status === "completed" ? (
                      <>
                        <CheckCircle2 className="w-4 h-4" />
                        TTS Master hoàn tất
                      </>
                    ) : (
                      "Master đã hoàn tất trước đó, vẫn được giữ"
                    )}
                  </span>
                  <span className="text-slate-300">
                    Thời lượng{" "}
                    {formatDuration(masterGeneration.durationSeconds)}
                  </span>
                  {masterGeneration.sizeBytes !== undefined && (
                    <span className="text-slate-400">
                      {formatFileSize(masterGeneration.sizeBytes)}
                    </span>
                  )}
                </div>
                <audio
                  key={`${job?.id}-${masterGeneration.audioVersion || masterGeneration.sizeBytes}`}
                  controls
                  preload="metadata"
                  src={`/api/video-dubbing/jobs/${job?.id}/master-audio?v=${masterGeneration.audioVersion || masterGeneration.sizeBytes}`}
                  className="w-full"
                >
                  Trình duyệt không hỗ trợ phát WAV.
                </audio>
              </div>
            )}

          <p className="text-[11px] leading-relaxed text-slate-500">
            Tùy chọn giọng/tốc độ chỉ áp dụng cho lần tạo mới; Master đã hoàn
            tất vẫn được giữ nguyên cho đến khi tạo Master mới hoặc bỏ job
            video.
          </p>
        </div>
      )}
    </section>
  );
}
