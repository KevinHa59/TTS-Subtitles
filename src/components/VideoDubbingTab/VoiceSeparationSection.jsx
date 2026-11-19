import {
  AlertCircle,
  AudioLines,
  ChevronDown,
  LoaderCircle,
  X,
} from "lucide-react";
import { formatDuration, formatElapsed, formatFileSize } from "./helpers";

export default function VoiceSeparationSection({
  canStartSeparation,
  cancelSeparation,
  isAutoPipelineRunning,
  isSeparationProcessing,
  job,
  separation,
  separationAvailability,
  separationBackendLabel,
  separationElapsedSeconds,
  separationError,
  separationHeartbeatFresh,
  separationPanelExpanded,
  setSeparationPanelExpanded,
  startSeparation,
}) {
  return (
    <section className="rounded-2xl border border-slate-800 bg-slate-900/80 p-4 sm:p-5 space-y-4">
      <button
        type="button"
        onClick={() => setSeparationPanelExpanded((expanded) => !expanded)}
        aria-expanded={separationPanelExpanded}
        aria-controls="video-dubbing-separation-panel"
        className="flex w-full items-start gap-3 text-left"
      >
        <div className="w-10 h-10 rounded-xl bg-violet-500/15 text-violet-300 border border-violet-500/25 flex items-center justify-center shrink-0">
          <AudioLines className="w-5 h-5" />
        </div>
        <div className="min-w-0">
          <h3 className="font-semibold text-white">Tách giọng và nhạc nền</h3>
          <p className="mt-1 text-xs leading-relaxed text-slate-400">
            Chạy cục bộ bằng Demucs{" "}
            {separationAvailability?.model || "htdemucs"}. Kết quả là các stem
            ước lượng, có thể còn lẫn giọng hoặc nhạc.
          </p>
        </div>
        <ChevronDown
          className={`mt-2 h-4 w-4 shrink-0 text-slate-400 transition-transform ${separationPanelExpanded ? "rotate-180" : ""}`}
        />
      </button>

      {separationPanelExpanded && (
        <div id="video-dubbing-separation-panel" className="space-y-4">
          {!separationAvailability ? (
            <p className="text-xs text-slate-400">
              Đang kiểm tra Python, model và thiết bị…
            </p>
          ) : (
            <div
              className={`rounded-xl border p-3 text-xs ${
                separationAvailability.status === "ready"
                  ? "border-emerald-500/25 bg-emerald-950/20 text-emerald-200"
                  : "border-amber-500/25 bg-amber-950/20 text-amber-200"
              }`}
            >
              <div className="font-semibold">
                {separationAvailability.status === "ready"
                  ? `Sẵn sàng · ${separationAvailability.device === "directml" ? "DirectML" : separationAvailability.device === "cuda" ? "CUDA" : "CPU"} · ${separationAvailability.model}`
                  : "Chưa sẵn sàng"}
              </div>
              <p className="mt-1 leading-relaxed">
                {separationAvailability.message}
              </p>
              {separationAvailability.status === "unavailable" && (
                <p className="mt-2 leading-relaxed">
                  Cấu hình riêng Python bằng biến
                  VIDEO_DUBBING_SEPARATION_PYTHON rồi khởi động lại ứng dụng.
                  Cần cài các dependency của backend đã chọn và tải model local;
                  nút xử lý không tự cài hoặc tải model.
                </p>
              )}
            </div>
          )}

          {job.metadata?.audioCodec === null && (
            <p className="rounded-lg border border-amber-500/25 bg-amber-950/20 p-3 text-xs text-amber-200">
              Video này không có audio gốc để tách.
            </p>
          )}
          {separationError && (
            <div className="flex items-start gap-2 rounded-lg border border-rose-500/30 bg-rose-950/40 p-3 text-xs text-rose-200">
              <AlertCircle className="w-4 h-4 shrink-0 text-rose-400" />
              <span>{separationError}</span>
            </div>
          )}
          {separation?.status === "error" && separation.error && (
            <div className="flex items-start gap-2 rounded-lg border border-rose-500/30 bg-rose-950/40 p-3 text-xs text-rose-200">
              <AlertCircle className="w-4 h-4 shrink-0 text-rose-400" />
              <span>{separation.error}</span>
            </div>
          )}
          {isSeparationProcessing && (
            <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3 rounded-xl border border-violet-500/25 bg-violet-950/20 p-3.5">
              <span className="inline-flex items-center gap-2 text-xs text-violet-200">
                <LoaderCircle className="w-4 h-4 animate-spin" />
                {separation.phase === "extracting"
                  ? "Đang trích và chuẩn hóa audio nguồn"
                  : separation.phase === "checking"
                    ? "Đang kiểm tra môi trường tách audio"
                    : separation.phase === "loading_model"
                      ? "Đang tải model Demucs từ cache cục bộ"
                      : separation.phase === "writing_outputs"
                        ? "Đang ghi các track vocals và instrumental"
                        : separation.phase === "validating"
                          ? "Đang ghi và xác minh hai track"
                          : "Demucs đang tách audio"}
              </span>
              <span className="text-xs text-violet-100">
                {separation.progressPercent === undefined
                  ? `${formatElapsed(separationElapsedSeconds)} · heartbeat ${separationHeartbeatFresh ? "đang hoạt động" : "đang chờ"}`
                  : `${separation.progressPercent}%${
                      separation.completedSegments !== undefined &&
                      separation.totalSegments !== undefined
                        ? ` · ${separation.completedSegments}/${separation.totalSegments} đoạn`
                        : ""
                    }`}
              </span>
              <div
                className="h-2 w-full overflow-hidden rounded-full bg-slate-800"
                role="progressbar"
                aria-label="Tiến trình tách audio"
                aria-valuemin={0}
                aria-valuemax={100}
                aria-valuenow={separation.progressPercent}
                aria-valuetext={
                  separation.progressPercent === undefined
                    ? "Đang xử lý, chưa xác định phần trăm"
                    : `${separation.progressPercent}%`
                }
              >
                <div
                  className={`h-full rounded-full bg-violet-400 transition-all ${
                    separation.progressPercent === undefined
                      ? "w-1/3 animate-pulse"
                      : ""
                  }`}
                  style={
                    separation.progressPercent === undefined
                      ? undefined
                      : { width: `${separation.progressPercent}%` }
                  }
                />
              </div>
              <span className="text-[11px] text-violet-200/80">
                {separationBackendLabel}
                {separation.progressPercent === undefined
                  ? " · chưa có phần trăm inference"
                  : ""}
              </span>
              <button
                type="button"
                onClick={() => void cancelSeparation()}
                disabled={isAutoPipelineRunning}
                className="inline-flex items-center justify-center gap-1.5 rounded-lg border border-slate-700 bg-slate-950/70 px-2.5 py-1.5 text-xs text-slate-300 hover:text-white hover:border-slate-500 transition-colors"
              >
                <X className="w-3.5 h-3.5" />
                Hủy tách audio
              </button>
            </div>
          )}
          {separation?.status === "cancelled" && (
            <p className="text-xs text-amber-300">
              Tác vụ tách audio đã bị hủy.
            </p>
          )}
          {separation?.status === "interrupted" && (
            <p className="rounded-lg border border-amber-500/25 bg-amber-950/20 p-3 text-xs text-amber-200">
              {separation.error ||
                "Tác vụ tách audio bị gián đoạn; có thể chạy lại."}
            </p>
          )}

          {separationAvailability?.status === "ready" &&
            Boolean(job.metadata?.audioCodec) && (
              <button
                type="button"
                onClick={() => void startSeparation()}
                disabled={!canStartSeparation}
                className="inline-flex items-center justify-center gap-2 rounded-xl bg-violet-500 px-4 py-2.5 text-sm font-bold text-white transition-colors hover:bg-violet-400 disabled:cursor-not-allowed disabled:bg-slate-800 disabled:text-slate-500"
              >
                {isSeparationProcessing ? (
                  <LoaderCircle className="w-4 h-4 animate-spin" />
                ) : (
                  <AudioLines className="w-4 h-4" />
                )}
                Tách audio nguồn
              </button>
            )}

          {(separation?.vocalsSizeBytes ||
            separation?.instrumentalSizeBytes) && (
            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              {[
                {
                  key: "vocals",
                  label: "Giọng (vocals)",
                  size: separation.vocalsSizeBytes,
                },
                {
                  key: "instrumental",
                  label: "Nhạc nền (instrumental)",
                  size: separation.instrumentalSizeBytes,
                },
              ].map((track) => (
                <div
                  key={track.key}
                  className="space-y-2 rounded-xl border border-slate-800 bg-slate-950/60 p-3"
                >
                  <div className="flex items-center justify-between gap-2 text-xs">
                    <span className="font-semibold text-slate-200">
                      {track.label}
                    </span>
                    <span className="text-slate-400">
                      {track.size ? formatFileSize(track.size) : "Không có"}
                    </span>
                  </div>
                  <audio
                    controls
                    preload="metadata"
                    src={`/api/video-dubbing/jobs/${job.id}/separation/${track.key}`}
                    className="w-full"
                  >
                    Trình duyệt không hỗ trợ phát WAV.
                  </audio>
                </div>
              ))}
            </div>
          )}
          {separation?.status === "completed" && (
            <p className="text-xs text-emerald-300">
              Đã xác minh hai track WAV ·{" "}
              {formatDuration(separation.durationSeconds || 0)} ·{" "}
              {separation.sampleRate} Hz · {separation.channels} kênh. Kết quả
              chưa được tự động đưa vào bản phối.
            </p>
          )}
        </div>
      )}
    </section>
  );
}
