import { formatDuration, formatElapsed, formatFileSize } from "./helpers";

export default function MergedVideoTab({
  isFinalMixCurrent,
  job,
  videoExport,
}) {
  return (
    <div className="space-y-3 rounded-xl border border-emerald-500/25 bg-emerald-950/20 p-3.5">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <span className="text-xs font-semibold text-emerald-300">
          {videoExport?.status === "completed" && isFinalMixCurrent
            ? "MP4 đã xuất"
            : "MP4 trước đó vẫn được giữ"}
        </span>
        <span className="text-xs text-slate-400">
          {job.exportedVideoFileName ||
            `${job.fileName.replace(/\.[^.]+$/, "")}_merged.mp4`}{" "}
          · {formatFileSize(videoExport?.sizeBytes || 0)}
          {videoExport?.durationSeconds !== undefined &&
            ` · ${formatDuration(videoExport.durationSeconds)}`}
        </span>
      </div>
      {videoExport?.status === "completed" && (
        <p className="text-xs text-slate-400">
          Thời gian export: {formatElapsed(videoExport.elapsedSeconds)}
        </p>
      )}
      <video
        key={`merged-${job.id}-${videoExport?.completedAtMs}`}
        controls
        playsInline
        preload="metadata"
        src={`/api/video-dubbing/jobs/${job.id}/exported-video?v=${videoExport?.sizeBytes || 0}-${videoExport?.completedAtMs || 0}`}
        className="max-h-[min(65vh,760px)] w-full rounded-lg bg-black"
        aria-label="Merged Video"
      />
      <a
        href={`/api/video-dubbing/jobs/${job.id}/download`}
        download={
          job.exportedVideoFileName ||
          `${job.fileName.replace(/\.[^.]+$/, "")}_merged.mp4`
        }
        className="inline-flex items-center justify-center gap-2 rounded-xl border border-emerald-500/40 px-4 py-2.5 text-sm font-bold text-emerald-200 hover:bg-emerald-950/60"
      >
        Tải MP4
      </a>
    </div>
  );
}
