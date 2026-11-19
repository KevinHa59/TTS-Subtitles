import {
  AlertCircle,
  CheckCircle2,
  Clock3,
  Film,
  HardDrive,
  LoaderCircle,
  Trash2,
  Upload,
  X,
} from "lucide-react";
import { formatFileSize, statusLabel } from "./helpers";
import MetadataGrid from "./MetadataGrid";

export default function SourceVideoCard({
  cancelVideo,
  clearVideo,
  handleVideoChange,
  isBusy,
  job,
  video,
  videoInputRef,
}) {
  return (
    <section className="rounded-2xl border border-slate-800 bg-slate-900/80 p-4 sm:p-5 space-y-4">
      <div className="flex items-center justify-between gap-3">
        <div className="flex items-center gap-2">
          <Film className="w-4 h-4 text-amber-400" />
          <h3 className="font-semibold text-white">Video nguồn</h3>
        </div>
        {video && (
          <button
            type="button"
            onClick={isBusy ? () => void cancelVideo() : clearVideo}
            className="inline-flex items-center gap-1.5 rounded-lg border border-slate-700 bg-slate-950/70 px-2.5 py-1.5 text-xs text-slate-300 hover:text-white hover:border-slate-500 transition-colors"
          >
            {isBusy ? (
              <>
                <X className="w-3.5 h-3.5" />
                Hủy
              </>
            ) : (
              <>
                <Trash2 className="w-3.5 h-3.5" />
                Đóng job
              </>
            )}
            {video.warning && (
              <p className="mt-3 rounded-lg border border-amber-500/25 bg-amber-950/20 p-3 text-xs text-amber-200">
                {video.warning}
              </p>
            )}
          </button>
        )}
      </div>

      <input
        type="file"
        accept=".mp4,.mkv,.mov,.avi,.webm,video/mp4,video/x-matroska,video/quicktime,video/x-msvideo,video/webm"
        onChange={handleVideoChange}
        className="hidden"
      />
      {!video ? (
        <button
          type="button"
          onClick={() => videoInputRef.current?.click()}
          className="w-full min-h-40 flex flex-col items-center justify-center gap-2 rounded-xl border border-dashed border-slate-700 bg-slate-950/50 text-slate-300 hover:border-amber-500/50 hover:bg-slate-950 transition-colors"
        >
          <Upload className="w-6 h-6 text-amber-400" />
          <span className="text-sm font-semibold">Chọn video từ máy tính</span>
          <span className="text-xs text-slate-500">
            MP4 · MKV · MOV · AVI · WebM
          </span>
        </button>
      ) : (
        <div className="rounded-xl border border-slate-800 bg-slate-950/70 p-3.5">
          <div className="flex items-start gap-3">
            <div className="w-9 h-9 rounded-lg bg-slate-800 text-amber-300 flex items-center justify-center shrink-0">
              <HardDrive className="w-4 h-4" />
            </div>
            <div className="min-w-0 flex-1">
              <p className="text-sm font-semibold text-white break-all">
                {video.fileName}
              </p>
              <p className="text-xs text-slate-400 mt-1">
                {formatFileSize(video.sizeBytes)}
              </p>
            </div>
          </div>

          {isBusy && (
            <div className="mt-4 space-y-2">
              <div className="flex justify-between gap-2 text-xs">
                <span className="inline-flex items-center gap-1.5 text-amber-300">
                  <LoaderCircle className="w-3.5 h-3.5 animate-spin" />
                  {statusLabel(job)}
                </span>
                <span className="text-slate-400">
                  {job?.status === "probing"
                    ? "Đang đọc metadata…"
                    : `${Math.round(video.progress)}%`}
                </span>
              </div>
              <div className="h-2 rounded-full bg-slate-800 overflow-hidden">
                <div
                  className={`h-full rounded-full bg-amber-400 transition-all ${job?.status === "probing" ? "animate-pulse" : ""}`}
                  style={{
                    width: `${job?.status === "probing" ? 100 : video.progress}%`,
                  }}
                />
              </div>
            </div>
          )}

          {job && (
            <div className="mt-3 flex items-center gap-2 text-xs">
              {job.status === "completed" ? (
                <CheckCircle2 className="w-4 h-4 text-emerald-400" />
              ) : job.status === "failed" ||
                job.status === "cancelled" ||
                job.status === "interrupted" ? (
                <AlertCircle className="w-4 h-4 text-rose-400" />
              ) : (
                <Clock3 className="w-4 h-4 text-amber-400" />
              )}
              <span
                className={
                  job.status === "completed"
                    ? "text-emerald-300"
                    : "text-slate-300"
                }
              >
                {statusLabel(job)}
              </span>
            </div>
          )}

          {video.error && (
            <div className="mt-3 flex items-start gap-2 rounded-lg border border-rose-500/30 bg-rose-950/40 p-3 text-xs text-rose-200">
              <AlertCircle className="w-4 h-4 shrink-0 text-rose-400" />
              <span>{video.error}</span>
            </div>
          )}

          {job?.status === "completed" && job.metadata && (
            <MetadataGrid metadata={job.metadata} />
          )}
          {job?.status === "failed" && job.error && !video.error && (
            <p className="mt-3 text-xs text-rose-300">{job.error}</p>
          )}
          {job?.status === "interrupted" && job.error && (
            <p className="mt-3 text-xs text-amber-300">{job.error}</p>
          )}

          {!isBusy && (
            <button
              type="button"
              onClick={() => videoInputRef.current?.click()}
              className="mt-3 inline-flex items-center gap-1.5 text-xs font-semibold text-amber-300 hover:text-amber-200"
            >
              <Upload className="w-3.5 h-3.5" />
              Chọn video khác
            </button>
          )}
        </div>
      )}
      <p className="text-[11px] leading-relaxed text-slate-500">
        Video được gửi đến backend cục bộ để kiểm tra bằng FFprobe; tệp nguồn
        trên máy không bị chỉnh sửa.
      </p>
    </section>
  );
}
