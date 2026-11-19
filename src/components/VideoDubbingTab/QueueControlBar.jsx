import { BookOpen, FolderOpen, Play, X } from "lucide-react";
import { formatElapsed, formatFileSize } from "./helpers";

export default function QueueControlBar({
  activeProject,
  autoPipeline,
  autoPipelineError,
  autoPipelineProgress,
  canStartQueue,
  cancelFinalMix,
  cancelMediaTask,
  concatPreflight,
  concatStatus,
  exportClockNow,
  exportQuality,
  finalMix,
  joinAfterQueue,
  joinedVideo,
  loadProjects,
  mediaError,
  openProjectFolder,
  queueRowCount,
  queueRows,
  queueRunning,
  queueStates,
  separation,
  separationBackendLabel,
  separationElapsedSeconds,
  separationHeartbeatFresh,
  separationPhaseLabel,
  setExportQuality,
  setGuideOpen,
  setProjectsExpanded,
  startQueue,
  stopQueue,
  toggleJoinAfterQueue,
  videoExport,
}) {
  return (
    <section className="px-3 py-2 shrink-0 border-b border-slate-800 bg-slate-900/60 rounded-none xl:col-span-2 xl:row-start-2 space-y-2">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <div className="flex flex-1 items-center gap-2">
          {queueRunning ? (
            <button
              type="button"
              onClick={() => void stopQueue()}
              className="inline-flex items-center gap-2 rounded-lg border border-rose-500/30 bg-rose-950/30 px-3 py-2 text-xs font-bold text-rose-100"
            >
              <X className="h-4 w-4" />
              Dừng hàng đợi
            </button>
          ) : (
            <button
              type="button"
              onClick={() => void startQueue()}
              disabled={!canStartQueue}
              className="inline-flex items-center gap-2 rounded-lg bg-indigo-400 px-3 py-2 text-xs font-bold text-slate-950 disabled:cursor-not-allowed disabled:bg-slate-800 disabled:text-slate-500"
            >
              <Play className="h-4 w-4" />
              Bắt đầu hàng đợi
            </button>
          )}
          <label
            title="Sau khi tất cả video trong hàng đợi export thành công, ghép chúng bằng stream copy không encode lại."
            className={`inline-flex items-center gap-2 rounded-lg border border-slate-700 px-3 py-2 text-xs text-slate-200 ${queueRunning || queueRows.length < 2 || concatPreflight.status === "checking" ? "cursor-not-allowed opacity-50" : "cursor-pointer hover:border-sky-500/40"}`}
          >
            <input
              type="checkbox"
              checked={joinAfterQueue}
              onChange={() => void toggleJoinAfterQueue()}
              disabled={
                queueRunning ||
                queueRows.length < 2 ||
                concatPreflight.status === "checking"
              }
              className="accent-sky-400"
            />
            Ghép nối sau khi hàng đợi xong
          </label>
          <div className="flex flex-1 items-center gap-2">
            {queueRunning && (
              <div className="space-y-2 rounded-xl border border-amber-500/25 bg-amber-950/20 p-3 text-xs text-amber-100">
                <div className="flex justify-between gap-2">
                  <span className="font-semibold">Hàng đợi đang chạy</span>
                  <span>
                    {
                      Object.values(queueStates).filter(
                        (item) => item.status === "completed",
                      ).length
                    }
                    /{queueRowCount}
                  </span>
                </div>
                <div
                  role="progressbar"
                  aria-label="Tiến trình hàng đợi video"
                  aria-valuemin={0}
                  aria-valuemax={queueRowCount}
                  aria-valuenow={
                    Object.values(queueStates).filter(
                      (item) => item.status === "completed",
                    ).length
                  }
                  className="h-2 overflow-hidden rounded-full bg-slate-800"
                >
                  <div
                    className="h-full bg-amber-400 transition-all"
                    style={{
                      width: `${queueRowCount ? (Object.values(queueStates).filter((item) => item.status === "completed").length / queueRowCount) * 100 : 0}%`,
                    }}
                  />
                </div>
              </div>
            )}
            {concatStatus !== "idle" && (
              <div
                className={`space-y-2 rounded-xl border p-3 text-xs ${concatStatus === "failed" ? "border-rose-500/25 bg-rose-950/20 text-rose-100" : "border-sky-500/25 bg-sky-950/20 text-sky-100"}`}
              >
                <div className="font-semibold">
                  {concatStatus === "running"
                    ? "Đang ghép video · stream copy"
                    : concatStatus === "completed"
                      ? "Đã ghép video · không encode lại"
                      : concatStatus === "skipped"
                        ? "Không ghép video vì hàng đợi chưa hoàn tất toàn bộ"
                        : "Không thể ghép video"}
                </div>
                {joinedVideo && concatStatus === "completed" && (
                  <a
                    href={`/api/video-dubbing/jobs/${joinedVideo.jobId}/concatenated-video?fileName=${encodeURIComponent(joinedVideo.fileName)}`}
                    className="inline-flex items-center gap-2 rounded-lg border border-sky-400/30 px-2.5 py-1.5 font-semibold text-sky-100 hover:bg-sky-900/30"
                  >
                    Tải {joinedVideo.fileName} ·{" "}
                    {formatFileSize(joinedVideo.sizeBytes)}
                  </a>
                )}
                {concatStatus === "failed" && mediaError && (
                  <p className="text-rose-200">{mediaError}</p>
                )}
              </div>
            )}
            {autoPipeline && (
              <div
                role="progressbar"
                aria-label="Tiến trình Auto Pipeline"
                aria-valuemin={0}
                aria-valuemax={100}
                aria-valuenow={autoPipelineProgress}
                aria-valuetext={
                  autoPipelineProgress === undefined &&
                  autoPipeline.phase === "separation"
                    ? `Đang tách audio, ${formatElapsed(separationElapsedSeconds)}, heartbeat ${separationHeartbeatFresh ? "đang hoạt động" : "không mới"}`
                    : undefined
                }
                className="relative isolate overflow-hidden rounded-xl border border-indigo-500/25 bg-indigo-950/20 p-3 text-xs text-indigo-100"
              >
                {/* Progress Background */}
                {autoPipeline.status === "running" && (
                  <div
                    className={`absolute inset-y-0 left-0 -z-10 bg-indigo-400/10 transition-[width] duration-500 ease-out ${
                      autoPipelineProgress === undefined
                        ? "w-1/3 animate-pulse"
                        : ""
                    }`}
                    style={
                      autoPipelineProgress === undefined
                        ? undefined
                        : { width: `${autoPipelineProgress}%` }
                    }
                  />
                )}

                {/* Header */}
                <div className="flex items-center justify-between gap-2">
                  <span className="font-semibold">
                    {autoPipeline.status === "running"
                      ? `Auto Pipeline · ${
                          autoPipeline.phase === "separation"
                            ? `tách audio · ${separationPhaseLabel}`
                            : autoPipeline.phase
                        }`
                      : `Auto Pipeline · ${autoPipeline.status}`}
                  </span>

                  {autoPipeline.status === "running" && (
                    <span className="shrink-0 text-right">
                      {autoPipelineProgress === undefined
                        ? autoPipeline.phase === "separation"
                          ? `${formatElapsed(separationElapsedSeconds)} · heartbeat ${
                              separationHeartbeatFresh
                                ? "đang hoạt động"
                                : "đang chờ"
                            }`
                          : "Đang xử lý…"
                        : `${autoPipelineProgress}%${
                            autoPipeline.phase === "separation"
                              ? ` · ${formatElapsed(separationElapsedSeconds)}`
                              : ""
                          }`}
                    </span>
                  )}
                </div>

                {/* Separation Details */}
                {autoPipeline.status === "running" &&
                  autoPipeline.phase === "separation" && (
                    <p className="mt-2 text-[11px] text-indigo-200/80">
                      Backend: {separationBackendLabel}
                      {separation?.completedSegments !== undefined &&
                      separation.totalSegments !== undefined
                        ? ` · ${separation.completedSegments}/${separation.totalSegments} đoạn`
                        : " · model chưa gửi phần trăm chi tiết"}
                    </p>
                  )}

                {/* Errors */}
                {autoPipeline.error && (
                  <p className="mt-2 text-rose-200">{autoPipeline.error}</p>
                )}

                {autoPipelineError && (
                  <p className="mt-2 text-rose-200">{autoPipelineError}</p>
                )}

                {mediaError && (
                  <p className="mt-2 text-rose-200">{mediaError}</p>
                )}
              </div>
            )}
            {finalMix && finalMix.status !== "idle" && (
              <div
                role="progressbar"
                aria-label="Tiến trình render final mix"
                aria-valuemin={0}
                aria-valuemax={100}
                aria-valuenow={finalMix.progressPercent ?? 0}
                className="relative isolate overflow-hidden rounded-xl border border-cyan-500/25 bg-cyan-950/20 p-3 text-xs text-cyan-100"
              >
                {/* Background Progress */}
                {finalMix.status === "running" && (
                  <div
                    className="absolute inset-y-0 left-0 z-[-1] bg-cyan-300/15 transition-[width] duration-500 ease-out"
                    style={{
                      width: `${finalMix.progressPercent ?? 0}%`,
                    }}
                  />
                )}

                {/* Header */}
                <div className="flex items-center justify-between gap-2">
                  <span className="font-semibold">
                    Final mix ·{" "}
                    {finalMix.status === "running"
                      ? finalMix.phase
                      : finalMix.status}
                  </span>

                  {finalMix.status === "running" && (
                    <div className="flex items-center gap-2">
                      <span>
                        {finalMix.progressPercent === undefined
                          ? "Đang xử lý…"
                          : `${finalMix.progressPercent}%`}
                      </span>

                      <button
                        type="button"
                        onClick={() => void cancelFinalMix()}
                        title="Hủy render"
                        aria-label="Hủy render"
                        className="rounded-lg border border-slate-700 px-1 text-cyan-100 transition-colors hover:border-cyan-400/50 hover:bg-cyan-400/10 hover:text-white"
                      >
                        Hủy
                      </button>
                    </div>
                  )}
                </div>

                {finalMix.error && (
                  <p className="mt-2 text-rose-200">{finalMix.error}</p>
                )}
              </div>
            )}
            {videoExport && videoExport.status !== "idle" && (
              <div className="space-y-2 rounded-xl border border-sky-500/25 bg-sky-950/20 p-3 text-xs text-sky-100">
                <div className="flex items-center justify-between gap-2">
                  <span className="font-semibold">
                    Export ·{" "}
                    {videoExport.status === "running"
                      ? videoExport.detail || videoExport.phase
                      : videoExport.status}
                  </span>
                  {videoExport.status === "running" && (
                    <span>
                      {videoExport.progressPercent === undefined
                        ? "Đang xử lý…"
                        : `${videoExport.progressPercent}%`}{" "}
                      ·{" "}
                      {formatElapsed(
                        videoExport.startedAtMs
                          ? (exportClockNow - videoExport.startedAtMs) / 1000
                          : videoExport.elapsedSeconds,
                      )}
                    </span>
                  )}
                </div>
                {videoExport.status === "running" && (
                  <div
                    role="progressbar"
                    aria-label="Tiến trình xuất video MP4"
                    aria-valuemin={0}
                    aria-valuemax={100}
                    aria-valuenow={videoExport.progressPercent}
                    className="h-2 overflow-hidden rounded-full bg-slate-800"
                  >
                    <div
                      className="h-full bg-sky-400 transition-all"
                      style={{
                        width: `${videoExport.progressPercent ?? 30}%`,
                      }}
                    />
                  </div>
                )}
                {videoExport.error && (
                  <p className="text-rose-200">{videoExport.error}</p>
                )}
                {videoExport.status === "running" && (
                  <button
                    type="button"
                    onClick={() => void cancelMediaTask("export")}
                    className="rounded-lg border border-slate-700 px-2 py-1 text-[11px]"
                  >
                    Hủy export
                  </button>
                )}
              </div>
            )}
          </div>
        </div>
        <div className="flex flex-wrap items-center gap-2">
          <label
            title="Theo nguồn dùng codec và bitrate video gốc. Low khoảng 70%, Medium 90% bitrate gốc. High giữ cấu hình chất lượng hiện tại."
            className="inline-flex items-center gap-2 rounded-lg border border-slate-700 px-2.5 py-2 text-xs text-slate-300"
          >
            Chất lượng
            <select
              value={exportQuality}
              onChange={(event) => setExportQuality(event.target.value)}
              className="rounded-md border border-slate-700 bg-slate-950 px-2 py-1 text-xs text-slate-100 focus:border-sky-400 focus:outline-none"
            >
              <option value="source">Theo nguồn</option>
              <option value="low">Low</option>
              <option value="medium">Medium</option>
              <option value="high">High</option>
            </select>
          </label>
          <button
            type="button"
            onClick={() => void openProjectFolder()}
            disabled={!activeProject}
            className="inline-flex items-center gap-2 rounded-lg border border-slate-700 px-3 py-2 text-xs font-semibold text-slate-200 hover:border-slate-500 disabled:cursor-not-allowed disabled:opacity-40"
          >
            <FolderOpen className="h-4 w-4" />
            Mở Project Folder
          </button>
          <button
            type="button"
            onClick={() => {
              setProjectsExpanded(true);
              void loadProjects();
            }}
            className="inline-flex items-center gap-2 rounded-lg border border-slate-700 px-3 py-2 text-xs font-semibold text-slate-200 hover:border-sky-400/50"
          >
            <FolderOpen className="h-4 w-4" />
            Project{activeProject ? ` · ${activeProject.name}` : ""}
          </button>
          <button
            type="button"
            onClick={() => setGuideOpen(true)}
            className="inline-flex items-center gap-2 rounded-lg border border-slate-700 px-3 py-2 text-xs font-semibold text-slate-200 hover:border-cyan-400/50"
          >
            <BookOpen className="h-4 w-4" />
            Hướng Dẫn
          </button>
        </div>
      </div>
      {concatPreflight.status !== "idle" && (
        <p
          className={`text-[10px] leading-relaxed ${concatPreflight.status === "incompatible" ? "text-rose-300" : concatPreflight.status === "compatible" ? "text-emerald-300" : "text-slate-400"}`}
        >
          {concatPreflight.message}
        </p>
      )}
    </section>
  );
}
