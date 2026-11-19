import {
  AlertTriangle,
  CheckCircle2,
  ChevronDown,
  Clock,
  RefreshCw,
} from "lucide-react";

export default function ProcessingMetricsCard({
  activeJob,
  effectiveBatchSize,
  setShowStagesTracker,
  showStagesTracker,
  subtitles,
}) {
  return (
    <div className="shrink-0 border-b border-slate-800 bg-slate-900/40 p-3 space-y-3 rounded-none">
      <div className="flex flex-col sm:flex-row items-start sm:items-center justify-between gap-3 border-b border-slate-800/80 pb-3">
        <div>
          <div className="flex items-center gap-2">
            <h2 className="text-base font-semibold text-white">
              Chi Tiết Xử Lý & Đo Lường Timeline
            </h2>
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
              {activeJob?.status === "completed" && "Đã hoàn thành"}
              {activeJob?.status === "paused" && "Đang tạm dừng"}
              {(!activeJob || activeJob?.status === "idle") && "Chờ bắt đầu"}
            </span>
          </div>
          <p className="text-xs text-slate-400 mt-0.5">
            Thanh tiến độ, % hoàn thành và nút bắt đầu xử lý được ghim cố định ở
            thanh đáy màn hình (Sticky Bottom Bar).
          </p>
        </div>

        <div className="flex items-center gap-2 text-xs font-mono text-slate-400 bg-slate-950 px-3 py-1.5 rounded-xl border border-slate-800">
          <span>
            Batch:{" "}
            <strong className="text-amber-400">
              {activeJob?.options.batchSize ?? effectiveBatchSize} câu/đợt
            </strong>
          </span>
        </div>
      </div>

      {/* Batch & Concurrency Metrics Strip */}
      <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-6 gap-2 pt-1 text-xs font-mono">
        <div className="bg-slate-950/70 p-2.5 rounded-xl border border-slate-800">
          <span className="text-slate-400 text-[10px] block">Tổng số câu:</span>
          <span className="text-base font-bold text-white">
            {subtitles.length}
          </span>
        </div>
        <div className="bg-slate-950/70 p-2.5 rounded-xl border border-slate-800">
          <span className="text-slate-400 text-[10px] block">
            Batch Song Song:
          </span>
          <span className="text-sm font-bold text-amber-400">
            {activeJob?.options.batchSize ?? effectiveBatchSize} câu/đợt
          </span>
        </div>
        <div className="bg-slate-950/70 p-2.5 rounded-xl border border-slate-800">
          <span className="text-emerald-400 text-[10px] block">
            Đã hoàn thành:
          </span>
          <span className="text-base font-bold text-emerald-400">
            {activeJob?.overallProgress.completed ?? 0}
          </span>
        </div>
        <div className="bg-slate-950/70 p-2.5 rounded-xl border border-slate-800">
          <span className="text-amber-400 text-[10px] block">Đang xử lý:</span>
          <span className="text-base font-bold text-amber-400">
            {activeJob?.overallProgress.running ?? 0}
          </span>
        </div>
        <div className="bg-slate-950/70 p-2.5 rounded-xl border border-slate-800">
          <span className="text-slate-400 text-[10px] block">
            Đang chờ (Queued):
          </span>
          <span className="text-base font-bold text-slate-300">
            {activeJob?.overallProgress.queued ?? subtitles.length}
          </span>
        </div>
        <div className="bg-slate-950/70 p-2.5 rounded-xl border border-slate-800">
          <span className="text-rose-400 text-[10px] block">Bị lỗi:</span>
          <span className="text-base font-bold text-rose-400">
            {activeJob?.overallProgress.failed ?? 0}
          </span>
        </div>
      </div>

      {/* Elapsed Time, Speed & ETA */}
      {activeJob && (
        <div className="flex flex-wrap items-center justify-between gap-2 text-[11px] text-slate-400 font-mono pt-1">
          <span>
            Thời gian đã chạy:{" "}
            {(activeJob.overallProgress.elapsedMs / 1000).toFixed(1)}s
          </span>
          {activeJob.overallProgress.speedItemsPerSec !== undefined && (
            <span className="text-slate-300">
              Tốc độ xử lý: ~{activeJob.overallProgress.speedItemsPerSec}{" "}
              câu/giây
            </span>
          )}
          {activeJob.overallProgress.estimatedRemainingMs !== undefined && (
            <span className="text-amber-400">
              Thời gian còn lại ước tính: ~
              {(activeJob.overallProgress.estimatedRemainingMs / 1000).toFixed(
                0,
              )}
              s
            </span>
          )}
        </div>
      )}

      {/* 9 Stages Visual Tracker (Collapsible) */}
      <div className="pt-2 border-t border-slate-800/80">
        <div className="flex items-center justify-between mb-2">
          <span className="text-[11px] uppercase tracking-wider text-slate-400 font-semibold">
            Tiến trình 9 giai đoạn xử lý:
          </span>
          <button
            type="button"
            onClick={() => setShowStagesTracker(!showStagesTracker)}
            className="text-[11px] text-slate-400 hover:text-amber-400 flex items-center gap-1"
          >
            <span>{showStagesTracker ? "Thu gọn" : "Chi tiết 9 bước"}</span>
            <ChevronDown
              className={`w-3.5 h-3.5 transition-transform ${showStagesTracker ? "rotate-180" : ""}`}
            />
          </button>
        </div>

        {showStagesTracker && (
          <div className="grid grid-cols-1 sm:grid-cols-3 gap-2 text-xs">
            {(
              activeJob?.stages || [
                {
                  id: 1,
                  name: "Upload và phân tích file phụ đề",
                  status: "completed",
                },
                {
                  id: 2,
                  name: "Khởi tạo PiperTTS và tải mô hình giọng đọc",
                  status: "pending",
                },
                {
                  id: 3,
                  name: "Tạo audio TTS cho từng câu",
                  status: "pending",
                },
                {
                  id: 4,
                  name: "Đo thời lượng audio thực tế",
                  status: "pending",
                },
                {
                  id: 5,
                  name: "Tự động điều chỉnh tốc độ đọc (atempo)",
                  status: "pending",
                },
                {
                  id: 6,
                  name: "Chuẩn hóa định dạng audio",
                  status: "pending",
                },
                {
                  id: 7,
                  name: "Ghép audio theo timeline & khoảng lặng",
                  status: "pending",
                },
                {
                  id: 8,
                  name: "Xuất file WAV/MP3 hoàn chỉnh",
                  status: "pending",
                },
                {
                  id: 9,
                  name: "Hoàn tất và cho phép tải xuống",
                  status: "pending",
                },
              ]
            ).map((st) => (
              <div
                key={st.id}
                className={`p-2.5 rounded-xl border flex items-center gap-2 transition-colors ${
                  st.status === "completed"
                    ? "bg-emerald-950/20 border-emerald-500/40 text-emerald-300"
                    : st.status === "running"
                      ? "bg-amber-950/30 border-amber-500/50 text-amber-300 shadow-sm shadow-amber-500/10"
                      : st.status === "failed"
                        ? "bg-rose-950/20 border-rose-500/40 text-rose-300"
                        : "bg-slate-950/40 border-slate-800/70 text-slate-400"
                }`}
              >
                <div className="shrink-0">
                  {st.status === "completed" && (
                    <CheckCircle2 className="w-4 h-4 text-emerald-400" />
                  )}
                  {st.status === "running" && (
                    <RefreshCw className="w-4 h-4 text-amber-400 animate-spin" />
                  )}
                  {st.status === "failed" && (
                    <AlertTriangle className="w-4 h-4 text-rose-400" />
                  )}
                  {st.status === "pending" && (
                    <Clock className="w-4 h-4 text-slate-400" />
                  )}
                </div>
                <div className="min-w-0 flex-1">
                  <div className="text-[11px] font-medium truncate">
                    {st.id}. {st.name}
                  </div>
                  {st.detail && (
                    <div className="text-[10px] text-slate-400 truncate">
                      {st.detail}
                    </div>
                  )}
                </div>
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}
