import { Download, FileText, RefreshCw } from "lucide-react";

export default function AllVideosToolbar({
  allSrtDownloadTargets,
  allVideosAction,
  allVideosActionDisabled,
  allVideosJobs,
  allVideosRunning,
  allVideosTtsReady,
  downloadAllSrts,
  queueRowCount,
  queueRunning,
  runAllVideosAction,
  separationAvailability,
  settingsSyncMessage,
  settingsSyncRunning,
  srtDownloadMessage,
  syncSettingsToAllVideos,
  videoFiles,
}) {
  return (
    <div className="border-b border-slate-800 p-2.5 bg-slate-900/70 shrink-0 space-y-2">
      <div className="flex items-center justify-between gap-2">
        <div className="flex items-center gap-1.5">
          <span className="text-xs font-bold text-white uppercase tracking-wider">
            All Videos ({allVideosJobs.length || queueRowCount || 0})
          </span>
          {allVideosRunning && (
            <span className="h-2 w-2 rounded-full bg-amber-400 animate-ping" />
          )}
        </div>
        <span className="text-[10px] text-slate-400 font-mono">Hàng loạt</span>
      </div>

      <div className="space-y-1">
        <div className="grid grid-cols-4 gap-1">
          <button
            type="button"
            onClick={() => void runAllVideosAction("tts")}
            disabled={allVideosActionDisabled || !allVideosTtsReady}
            title="Tạo riêng TTS Master cho tất cả video"
            className="px-1.5 py-1.5 rounded-none border border-indigo-400/35 bg-indigo-950/20 text-indigo-100 hover:bg-indigo-950/50 text-[11px] font-semibold flex items-center justify-center gap-1 disabled:opacity-40 cursor-pointer"
          >
            <span>TTS Tất Cả</span>
          </button>
          <button
            type="button"
            onClick={() =>
              void runAllVideosAction(
                "demucs",
                allVideosJobs.filter(
                  (item) =>
                    item.metadata?.audioCodec &&
                    item.separation?.status !== "processing",
                ),
              )
            }
            disabled={
              allVideosActionDisabled ||
              !allVideosJobs.some(
                (item) =>
                  item.metadata?.audioCodec &&
                  item.separation?.status !== "processing",
              ) ||
              separationAvailability?.status !== "ready"
            }
            title={
              separationAvailability?.status === "ready"
                ? "Tách vocals và instrumental cho tất cả video có audio"
                : separationAvailability?.message || "Demucs chưa sẵn sàng"
            }
            className="px-1.5 py-1.5 rounded-none border border-violet-400/35 bg-violet-950/20 text-violet-100 hover:bg-violet-950/50 text-[11px] font-semibold flex items-center justify-center gap-1 disabled:opacity-40 cursor-pointer"
          >
            <span>Demucs</span>
          </button>
          <button
            type="button"
            onClick={() => void runAllVideosAction("mix")}
            disabled={allVideosActionDisabled}
            title="Chỉ render final mix cho tất cả video"
            className="px-1.5 py-1.5 rounded-none border border-cyan-400/35 bg-cyan-950/20 text-cyan-100 hover:bg-cyan-950/50 text-[11px] font-semibold flex items-center justify-center gap-1 disabled:opacity-40 cursor-pointer"
          >
            <span>Mix Audio</span>
          </button>
          <button
            type="button"
            onClick={() => void runAllVideosAction("render")}
            disabled={allVideosActionDisabled}
            title="Chỉ export tất cả video"
            className="px-1.5 py-1.5 rounded-none border border-sky-400/35 bg-sky-950/20 text-sky-100 hover:bg-sky-950/50 text-[11px] font-semibold flex items-center justify-center gap-1 disabled:opacity-40 cursor-pointer"
          >
            <span>Render All</span>
          </button>
        </div>

        <div className="grid grid-cols-3 gap-1">
          <button
            type="button"
            onClick={downloadAllSrts}
            disabled={!allSrtDownloadTargets.length}
            title="Tải phụ đề đã chỉnh sửa của tất cả video trong project"
            className="px-1.5 py-1.5 rounded-none border border-emerald-500/35 bg-emerald-950/20 text-emerald-200 hover:bg-emerald-950/50 text-[11px] font-semibold flex items-center justify-center gap-1 disabled:opacity-40 cursor-pointer"
          >
            <FileText className="h-3 w-3" />
            <span>Tải Tất Cả SRT</span>
          </button>
          <button
            type="button"
            onClick={() => void runAllVideosAction("download")}
            disabled={
              allVideosActionDisabled ||
              !allVideosJobs.some(
                (item) => item.videoExport?.status === "completed",
              )
            }
            title="Tải tất cả MP4 đã export hoàn tất trong một file ZIP"
            aria-label="Download tất cả video đã export"
            className="px-1.5 py-1.5 rounded-none border border-emerald-500/35 bg-emerald-950/20 text-emerald-200 hover:bg-emerald-950/50 text-[11px] font-semibold flex items-center justify-center gap-1 disabled:opacity-40 cursor-pointer"
          >
            <Download className="h-3 w-3" />
            <span>Tải Zip Video</span>
          </button>
          <button
            type="button"
            onClick={() => void syncSettingsToAllVideos()}
            disabled={
              settingsSyncRunning ||
              queueRunning ||
              allVideosRunning ||
              videoFiles.some((item) => item.uploading) ||
              !videoFiles.some((item) => item.job?.status === "completed")
            }
            title="Lưu cài đặt preview vào tất cả job video trong danh sách, không bắt đầu xử lý"
            className="px-1.5 py-1.5 rounded-none border border-cyan-400/30 bg-cyan-950/30 text-cyan-200 hover:bg-cyan-900/40 text-[11px] font-semibold flex items-center justify-center gap-1 disabled:opacity-40 cursor-pointer"
          >
            <RefreshCw
              className={`h-3 w-3 ${settingsSyncRunning ? "animate-spin" : ""}`}
            />
            <span>{settingsSyncRunning ? "Đang lưu…" : "Đồng Bộ Cài Đặt"}</span>
          </button>
        </div>
      </div>

      {settingsSyncMessage && (
        <p className="text-[10px] text-cyan-200" role="status">
          {settingsSyncMessage}
        </p>
      )}
      {srtDownloadMessage && (
        <p className="text-[10px] text-emerald-200" role="status">
          {srtDownloadMessage}
        </p>
      )}
      {allVideosAction && (
        <div
          className="space-y-0.5 text-[10px]"
          role="status"
          aria-live="polite"
        >
          <p className="text-slate-300">
            {allVideosAction.status === "running"
              ? `Đang ${allVideosAction.action === "tts" ? "tạo TTS" : allVideosAction.action === "demucs" ? "tách Demucs" : allVideosAction.action === "mix" ? "render Mix Audio" : allVideosAction.action === "render" ? "export" : "tải"} ${allVideosAction.currentIndex}/${allVideosAction.total}${allVideosAction.currentFileName ? `: ${allVideosAction.currentFileName}` : "…"}`
              : `${allVideosAction.action === "tts" ? "TTS" : allVideosAction.action === "demucs" ? "Demucs" : allVideosAction.action === "mix" ? "Mix Audio" : allVideosAction.action === "render" ? "Render" : "Download"} hoàn tất: ${allVideosAction.completed}/${allVideosAction.total} video thành công.`}
          </p>
          {allVideosAction.errors.length > 0 && (
            <p className="text-rose-300">
              {allVideosAction.errors.slice(0, 3).join(" · ")}
              {allVideosAction.errors.length > 3
                ? ` · và ${allVideosAction.errors.length - 3} lỗi khác`
                : ""}
            </p>
          )}
        </div>
      )}
    </div>
  );
}
