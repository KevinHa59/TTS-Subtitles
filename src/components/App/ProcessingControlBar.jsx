import {
  CheckCircle2,
  Pause,
  Play,
  Radio,
  RefreshCw,
  RotateCcw,
  Square,
  Volume2,
} from "lucide-react";
import { formatSecondsDisplay } from "../../utils/srtParser";

export default function ProcessingControlBar({
  activeJob,
  completedSentencesCount,
  completionPercent,
  currentMasterItem,
  effectiveBatchSize,
  handleCancelJob,
  handlePauseResume,
  handlePlayMasterAudio,
  handleStartProcessing,
  masterCurrentTime,
  masterPlaying,
  selectedVoice,
  setShowVoiceModal,
  subtitles,
  totalSentencesCount,
  uploadedFileName,
}) {
  return (
    <div
      role="region"
      aria-label="Thanh điều khiển tiến độ và xử lý phụ đề"
      className="h-14 sm:h-16 shrink-0 border-t border-slate-800 bg-slate-900/95 px-3 flex items-center justify-between w-full z-30 select-none rounded-none"
    >
      <div className="w-full flex flex-col md:flex-row items-stretch md:items-center justify-between gap-2 sm:gap-4">
        {/* Vùng Trái: Thông tin Giọng đọc & Phụ đề & Trạng thái */}
        <div className="flex items-center justify-between md:justify-start gap-3 shrink-0">
          <div className="flex items-center gap-2.5">
            <div className="w-9 h-9 rounded-xl bg-amber-500/15 text-amber-400 border border-amber-500/25 flex items-center justify-center shrink-0">
              <Radio className="w-4 h-4" />
            </div>
            <div className="leading-tight">
              <div className="flex items-center gap-2">
                <button
                  type="button"
                  onClick={() => setShowVoiceModal(true)}
                  className="text-xs font-bold text-white hover:text-amber-300 truncate max-w-[150px] sm:max-w-[220px] transition-colors cursor-pointer text-left flex items-center gap-1.5 group"
                  title="Bấm để mở bảng chọn giọng đọc"
                >
                  <span className="truncate group-hover:underline">
                    {selectedVoice.name}
                  </span>
                  <span className="text-[10px] text-amber-400 font-semibold bg-amber-500/15 px-1.5 py-0.2 rounded border border-amber-500/30 group-hover:bg-amber-500/25 shrink-0">
                    Đổi giọng
                  </span>
                </button>
                <span
                  className={`px-2 py-0.5 rounded text-[10px] font-bold ${
                    activeJob?.status === "running"
                      ? "bg-amber-500/20 text-amber-300 border border-amber-500/30 animate-pulse"
                      : activeJob?.status === "completed"
                        ? "bg-emerald-500/20 text-emerald-300 border border-emerald-500/30"
                        : activeJob?.status === "paused"
                          ? "bg-sky-500/20 text-sky-300 border border-sky-500/30"
                          : "bg-slate-800 text-slate-300 border border-slate-700"
                  }`}
                >
                  {activeJob?.status === "running" && "Đang chạy song song"}
                  {activeJob?.status === "completed" && "Hoàn thành 100%"}
                  {activeJob?.status === "paused" && "Đang tạm dừng"}
                  {(!activeJob || activeJob?.status === "idle") && "Sẵn sàng"}
                </span>
              </div>
              <div className="text-[11px] text-slate-400 font-mono mt-0.5 flex items-center gap-2">
                <span className="text-amber-400 font-semibold">
                  {subtitles.length} câu
                </span>
                <span>·</span>
                <span>
                  Batch {activeJob?.options.batchSize ?? effectiveBatchSize}{" "}
                  câu/đợt
                </span>
                {uploadedFileName && (
                  <>
                    <span>·</span>
                    <span
                      className="truncate max-w-[120px] text-slate-300 hidden sm:inline"
                      title={uploadedFileName}
                    >
                      {uploadedFileName}
                    </span>
                  </>
                )}
              </div>
            </div>
          </div>
        </div>

        {/* Vùng Giữa: Progress Bar & Phần Trăm Hoàn Thành (Requirement 2) */}
        <div className="flex-1 min-w-0 max-w-2xl mx-auto w-full space-y-1.5 px-0 md:px-4">
          <div className="flex items-center justify-between text-xs font-mono">
            <div className="flex items-center gap-2">
              <span className="text-sm sm:text-base font-extrabold text-amber-400">
                {completionPercent}%
              </span>
              <span className="text-slate-400 text-[11px]">
                ({completedSentencesCount}/{totalSentencesCount} câu hoàn tất)
              </span>
            </div>
            <div className="text-[11px] text-slate-400">
              {activeJob?.status === "running" && (
                <span className="text-amber-400 font-medium">
                  {activeJob.overallProgress.estimatedRemainingMs !== undefined
                    ? `Còn ~${(activeJob.overallProgress.estimatedRemainingMs / 1000).toFixed(0)}s`
                    : `Đã chạy ${(activeJob.overallProgress.elapsedMs / 1000).toFixed(1)}s`}
                </span>
              )}
              {activeJob?.status === "completed" && (
                <span className="text-emerald-400 flex items-center gap-1 font-semibold">
                  <CheckCircle2 className="w-3.5 h-3.5" />
                  Master audio sẵn sàng
                </span>
              )}
              {(!activeJob || activeJob?.status === "idle") && (
                <span className="text-slate-400">Chờ bắt đầu xử lý</span>
              )}
            </div>
          </div>

          {/* Thanh Tiến Độ Hoàn Thành (Progress Bar) */}
          <div className="w-full bg-slate-900 rounded-full h-3 overflow-hidden p-0.5 border border-slate-700/80 shadow-inner relative">
            <div
              className={`h-full rounded-full transition-all duration-300 relative ${
                activeJob?.status === "completed"
                  ? "bg-gradient-to-r from-emerald-500 to-emerald-400 shadow-[0_0_14px_rgba(16,185,129,0.5)]"
                  : "bg-gradient-to-r from-amber-500 via-amber-400 to-emerald-400 shadow-[0_0_14px_rgba(245,158,11,0.5)]"
              }`}
              style={{
                width: `${Math.min(100, Math.max(0, completionPercent))}%`,
              }}
            >
              {activeJob?.status === "running" && (
                <div className="absolute inset-0 bg-white/25 animate-pulse" />
              )}
            </div>
          </div>
        </div>

        {/* Vùng Phải: Nút Bắt Đầu Xử Lý & Các Điều Khiển Phụ (Requirement 2) */}
        <div className="flex items-center justify-end gap-2 shrink-0">
          {activeJob?.status === "running" ? (
            <>
              <button
                type="button"
                onClick={handlePauseResume}
                className="px-3.5 py-2.5 bg-slate-800 hover:bg-slate-700 text-slate-200 border border-slate-700 rounded-xl text-xs font-semibold flex items-center gap-1.5 transition-colors cursor-pointer"
                title="Tạm dừng tiến trình"
              >
                <Pause className="w-4 h-4 text-amber-400" />
                <span className="hidden sm:inline">Tạm dừng</span>
              </button>
              <button
                type="button"
                onClick={handleCancelJob}
                className="px-3 py-2.5 bg-rose-500/10 hover:bg-rose-500/20 text-rose-300 border border-rose-500/30 rounded-xl text-xs font-semibold flex items-center gap-1.5 transition-colors cursor-pointer"
                title="Hủy bỏ tiến trình"
              >
                <Square className="w-3.5 h-3.5 text-rose-400 fill-current" />
                <span className="hidden sm:inline">Hủy</span>
              </button>
              <div className="px-4 py-2.5 bg-amber-500/20 border border-amber-500/40 text-amber-300 rounded-xl text-xs font-bold flex items-center gap-2 shadow-sm">
                <RefreshCw className="w-4 h-4 animate-spin text-amber-400" />
                <span>Đang xử lý ({completionPercent}%)</span>
              </div>
            </>
          ) : activeJob?.status === "paused" ? (
            <>
              <button
                type="button"
                onClick={handlePauseResume}
                className="px-4 py-2.5 bg-emerald-500 hover:bg-emerald-400 text-slate-950 font-bold rounded-xl text-xs flex items-center gap-1.5 shadow-lg shadow-emerald-500/20 transition-colors cursor-pointer"
              >
                <Play className="w-4 h-4 fill-current" />
                <span>Tiếp tục</span>
              </button>
              <button
                type="button"
                onClick={handleCancelJob}
                className="px-3.5 py-2.5 bg-slate-800 hover:bg-slate-700 text-slate-300 border border-slate-700 rounded-xl text-xs font-semibold flex items-center gap-1.5 transition-colors cursor-pointer"
              >
                <Square className="w-3.5 h-3.5 text-rose-400" />
                <span>Hủy</span>
              </button>
            </>
          ) : (
            <>
              {activeJob?.status === "completed" && activeJob.masterAudio && (
                <div className="flex items-center gap-2">
                  {masterPlaying && currentMasterItem?.item && (
                    <span className="hidden lg:inline-flex items-center gap-1.5 px-2.5 py-1.5 rounded-xl bg-amber-500/15 border border-amber-500/30 text-amber-300 text-xs font-mono font-medium max-w-[240px] truncate">
                      <Volume2 className="w-3.5 h-3.5 animate-pulse shrink-0" />
                      <span className="truncate">
                        Câu {currentMasterItem.item.index}:{" "}
                        {currentMasterItem.item.text}
                      </span>
                    </span>
                  )}
                  <button
                    type="button"
                    onClick={() => handlePlayMasterAudio()}
                    className="px-3.5 py-2.5 bg-slate-800 hover:bg-slate-700 text-emerald-300 border border-emerald-500/40 rounded-xl text-xs font-bold flex items-center gap-1.5 transition-all cursor-pointer shadow-md"
                    title="Nghe file master hoàn chỉnh"
                  >
                    {masterPlaying ? (
                      <>
                        <Pause className="w-4 h-4 fill-current" />
                        <span>
                          Dừng ({formatSecondsDisplay(masterCurrentTime)})
                        </span>
                      </>
                    ) : (
                      <>
                        <Play className="w-4 h-4 fill-current text-emerald-400" />
                        <span>Nghe Master</span>
                      </>
                    )}
                  </button>
                </div>
              )}

              {/* Nút Bắt Đầu Xử Lý Chính */}
              <button
                type="button"
                disabled={subtitles.length === 0}
                onClick={handleStartProcessing}
                className="px-5 sm:px-6 py-2.5 bg-gradient-to-r from-amber-500 to-amber-400 hover:from-amber-400 hover:to-amber-300 active:scale-95 text-slate-950 font-black rounded-xl text-xs sm:text-sm flex items-center gap-2 shadow-xl shadow-amber-500/25 disabled:opacity-40 disabled:cursor-not-allowed disabled:shadow-none transition-all cursor-pointer"
              >
                {activeJob?.status === "completed" ? (
                  <>
                    <RotateCcw className="w-4 h-4" />
                    <span>Chạy Lại ({subtitles.length} câu)</span>
                  </>
                ) : (
                  <>
                    <Play className="w-4 h-4 fill-current ml-0.5" />
                    <span>Bắt Đầu Xử Lý ({subtitles.length} câu)</span>
                  </>
                )}
              </button>
            </>
          )}
        </div>
      </div>
    </div>
  );
}
