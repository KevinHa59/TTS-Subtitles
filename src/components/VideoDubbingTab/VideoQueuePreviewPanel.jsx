import { Download, FileText, Film, Info, Trash2 } from "lucide-react";
import { ACCEPTED_VIDEO_EXTENSIONS } from "./constants";
import { statusLabel } from "./helpers";

export default function VideoQueuePreviewPanel({
  activeProject,
  handleQueueDrop,
  job,
  openSrtBrowser,
  previewSourceVideo,
  previewVideoRow,
  projectJobItems,
  queueRowCount,
  queueRows,
  queueRunning,
  queueStates,
  removeQueuedSource,
  renderCoverEditorButton,
  renderJobProcessingBar,
  renderVideoActions,
  setDetailRowIndex,
  setFileDetailsOpen,
  setQueueStates,
  settingsSyncRunning,
  videoInputRef,
}) {
  return (
    <div className="flex-1 min-h-0 w-full overflow-y-auto p-2 space-y-2.5 scrollbar-thin">
      {/* Project Saved Jobs */}
      {projectJobItems.map((item) => {
        const cues = item.job.overlaySettings?.subtitles || [];
        const srtName =
          activeProject?.activeJobId === item.job.id
            ? activeProject.srt?.fileName
            : undefined;
        const isCurrentJob = job?.id === item.job.id;
        return (
          <div
            key={`saved-${item.job.id}`}
            onClick={(event) => previewVideoRow(event, item.job)}
            aria-current={isCurrentJob ? "true" : undefined}
            className={`p-2.5 border transition-all cursor-pointer rounded-none flex flex-col gap-2 ${
              isCurrentJob
                ? "bg-sky-950/40 border-sky-400/60 ring-1 ring-sky-400/30"
                : "bg-slate-900/50 border-slate-800 hover:bg-slate-900/80 hover:border-slate-700"
            }`}
          >
            {/* Row 1: Cover + Video Name + Badges */}
            <div className="flex items-center justify-between gap-2 min-w-0">
              <div className="flex items-center gap-2 min-w-0 flex-1">
                {renderCoverEditorButton(item.job)}
                <button
                  type="button"
                  onClick={() => void previewSourceVideo(item.job)}
                  disabled={
                    item.job.status !== "completed" ||
                    queueRunning ||
                    settingsSyncRunning
                  }
                  className="flex items-center gap-1.5 min-w-0 flex-1 text-left cursor-pointer disabled:opacity-50"
                  title={item.job.fileName}
                >
                  <Film className="h-4 w-4 shrink-0 text-amber-400" />
                  <span className="truncate text-xs font-bold text-slate-100 hover:text-white hover:underline">
                    {item.job.fileName}
                  </span>
                </button>
              </div>

              <div className="flex items-center gap-1.5 shrink-0">
                {isCurrentJob && (
                  <span className="px-1.5 py-0.5 text-[10px] font-bold bg-sky-500/20 text-sky-300 border border-sky-500/30 rounded-none">
                    Đang preview
                  </span>
                )}
                <span className="text-[10px] font-mono text-slate-400 bg-slate-950 px-1.5 py-0.5 border border-slate-800">
                  {statusLabel(item.job)}
                </span>
              </div>
            </div>

            {/* Row 2: Subtitle SRT info */}
            <div className="flex items-center justify-between gap-2 px-2 py-1.5 bg-slate-950/70 border border-slate-800/80 rounded-none text-xs">
              <div className="flex items-center gap-1.5 min-w-0 flex-1">
                <FileText
                  className={`h-3.5 w-3.5 shrink-0 ${srtName || cues.length ? "text-cyan-400" : "text-slate-600"}`}
                />
                <span
                  className="truncate text-[11px] text-slate-300"
                  title={
                    srtName ||
                    (cues.length
                      ? `Phụ đề (${cues.length} câu)`
                      : "Chưa có SRT")
                  }
                >
                  {srtName ||
                    (cues.length
                      ? `Phụ đề (${cues.length} câu)`
                      : "Chưa có file SRT")}
                </span>
              </div>
              {cues.length > 0 && (
                <span className="text-[10px] text-cyan-300 font-mono shrink-0 bg-cyan-950/40 px-1.5 py-0.2 border border-cyan-500/20">
                  {cues.length} câu
                </span>
              )}
            </div>

            {/* Progress bar if running */}
            {renderJobProcessingBar(item.job)}

            {/* Row 3: Pipeline Action Buttons (TTS, Demucs, Mix, Render, Tải SRT, Tải MP4, Cập nhật) */}
            <div className="pt-1 border-t border-slate-800/80">
              {renderVideoActions(item.job)}
            </div>
          </div>
        );
      })}

      {/* Queue Rows */}
      {Array.from({ length: Math.max(queueRowCount, 1) }, (_, index) => {
        const { video: file, subtitle } = queueRows[index] || {};
        const rowState = queueStates[index];
        const validVideo = Boolean(
          file &&
          ACCEPTED_VIDEO_EXTENSIONS.has(
            file.name.slice(file.name.lastIndexOf(".")).toLowerCase(),
          ),
        );
        const isCurrentJob = file?.job?.id && job?.id === file.job.id;
        return (
          <div
            key={`${file?.id || "no-video"}-${file?.name || ""}-${file?.size || 0}-${file?.lastModified || 0}-${subtitle?.id || "no-srt"}-${index}`}
            onClick={(event) => previewVideoRow(event, file?.job)}
            aria-current={isCurrentJob ? "true" : undefined}
            className={`p-2.5 border transition-all rounded-none flex flex-col gap-2 ${
              isCurrentJob
                ? "bg-sky-950/40 border-sky-400/60 ring-1 ring-sky-400/30"
                : "bg-slate-900/50 border-slate-800 hover:bg-slate-900/80 hover:border-slate-700"
            }`}
          >
            {/* Top: Video selector / dropzone + filename + status + info/delete */}
            <div className="flex items-center justify-between gap-2 min-w-0">
              <div className="flex items-center gap-2 min-w-0 flex-1">
                {file?.job && renderCoverEditorButton(file.job)}
                <div
                  onDragEnter={(event) => {
                    event.preventDefault();
                    event.stopPropagation();
                  }}
                  onDragOver={(event) => {
                    event.preventDefault();
                    event.stopPropagation();
                    event.dataTransfer.dropEffect = "copy";
                  }}
                  onDrop={(event) => handleQueueDrop(event, file?.job?.id)}
                  className="flex items-center min-w-0 flex-1"
                >
                  <button
                    type="button"
                    disabled={queueRunning || Boolean(file?.uploading)}
                    onClick={(event) => {
                      event.stopPropagation();
                      videoInputRef.current?.click();
                    }}
                    className="flex items-center gap-1.5 min-w-0 flex-1 text-left cursor-pointer disabled:opacity-60"
                    title={file?.name || "Chọn hoặc thả video"}
                  >
                    <Film className="h-4 w-4 shrink-0 text-amber-400" />
                    <span className="truncate text-xs font-bold text-slate-200 hover:text-white">
                      {file?.name || "Chọn hoặc thả tệp video..."}
                    </span>
                  </button>
                  <button
                    type="button"
                    color={subtitle?.fileName ? "cyan" : "slate"}
                    disabled={queueRunning || Boolean(file?.uploading)}
                    onClick={(event) => {
                      event.stopPropagation();
                      openSrtBrowser(file?.job?.id);
                    }}
                    className="px-2 py-0.5 text-[10px] font-semibold bg-cyan-500/15 text-cyan-300 hover:bg-cyan-500/25 border border-cyan-500/30 rounded-none cursor-pointer shrink-0"
                  >
                    {subtitle?.fileName ? "Đổi SRT" : "Chọn SRT"}
                  </button>
                </div>
              </div>

              <div className="flex items-center gap-1 shrink-0">
                {isCurrentJob && (
                  <span className="px-1.5 py-0.5 text-[10px] font-bold bg-sky-500/20 text-sky-300 border border-sky-500/30 rounded-none">
                    Đang preview
                  </span>
                )}
                {file?.uploading && (
                  <span className="text-[10px] text-amber-300 font-mono">
                    Đang lưu…
                  </span>
                )}
                {file?.job && !file.uploading && (
                  <span className="text-[10px] text-emerald-300 font-mono">
                    Đã lưu
                  </span>
                )}
                {file?.error && (
                  <span className="text-[10px] text-rose-300 font-mono">
                    Lỗi lưu
                  </span>
                )}
                {file && !validVideo && (
                  <span className="text-[10px] text-rose-300 font-mono">
                    Định dạng lỗi
                  </span>
                )}

                {/* Info button */}
                <button
                  type="button"
                  onClick={(e) => {
                    e.stopPropagation();
                    setDetailRowIndex(index);
                    setFileDetailsOpen(true);
                  }}
                  disabled={!file && !subtitle}
                  title="Chi tiết video nguồn"
                  aria-label="Chi tiết video nguồn"
                  className="p-1 text-slate-300 hover:text-white hover:bg-slate-800 border border-slate-700 rounded-none cursor-pointer disabled:opacity-40"
                >
                  <Info className="h-3.5 w-3.5" />
                </button>
                {/* Delete button */}
                {(file || subtitle) && (
                  <button
                    type="button"
                    disabled={queueRunning || settingsSyncRunning}
                    onClick={(e) => {
                      e.stopPropagation();
                      void removeQueuedSource(file, subtitle);
                      setQueueStates((current) =>
                        Object.fromEntries(
                          Object.entries(current)
                            .filter(([key]) => Number(key) !== index)
                            .map(([key, value]) => [
                              Number(key) > index
                                ? Number(key) - 1
                                : Number(key),
                              value,
                            ]),
                        ),
                      );
                      setDetailRowIndex((current) =>
                        current === index
                          ? null
                          : current !== null && current > index
                            ? current - 1
                            : current,
                      );
                    }}
                    title="Xóa video nguồn"
                    aria-label="Xóa video nguồn"
                    className="p-1 text-rose-300 hover:text-white hover:bg-rose-950/60 border border-rose-500/30 rounded-none cursor-pointer disabled:opacity-40"
                  >
                    <Trash2 className="h-3.5 w-3.5" />
                  </button>
                )}
              </div>
            </div>

            {/* Progress bar if running */}
            {file?.job && renderJobProcessingBar(file.job)}

            {/* Row state info */}
            {rowState && (
              <div className="flex items-center justify-between text-[10px] font-mono text-slate-400 px-1">
                <span
                  className={
                    rowState.status === "failed"
                      ? "text-rose-300"
                      : rowState.status === "completed"
                        ? "text-emerald-300"
                        : "text-slate-400"
                  }
                >
                  {rowState.status === "completed"
                    ? "Hoàn tất"
                    : rowState.status === "failed"
                      ? rowState.error || "Thất bại"
                      : rowState.status === "cancelled"
                        ? "Đã hủy"
                        : rowState.status === "queued"
                          ? "Trong hàng đợi"
                          : rowState.phase || "Đang xử lý"}
                  {rowState.status === "processing" &&
                    rowState.progressPercent !== undefined &&
                    ` · ${Math.round(rowState.progressPercent)}%`}
                </span>
                {rowState?.status === "completed" && rowState.jobId && (
                  <a
                    href={`/api/video-dubbing/jobs/${rowState.jobId}/download`}
                    download
                    title="Tải video đã export"
                    className="inline-flex items-center gap-1 text-[10px] text-emerald-300 font-bold hover:underline"
                  >
                    <Download className="h-3 w-3" />
                    <span>Tải MP4</span>
                  </a>
                )}
              </div>
            )}

            {/* Pipeline actions */}
            {file?.job && (
              <div className="pt-1 border-t border-slate-800/80">
                {renderVideoActions(file.job)}
              </div>
            )}
          </div>
        );
      })}
    </div>
  );
}
