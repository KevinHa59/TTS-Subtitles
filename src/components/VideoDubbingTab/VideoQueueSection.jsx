import { FileText, Film } from "lucide-react";
import AllVideosToolbar from "./AllVideosToolbar";
import VideoQueuePreviewPanel from "./VideoQueuePreviewPanel";

export default function VideoQueueSection({
  activeProject,
  allSrtDownloadTargets,
  allVideosAction,
  allVideosActionDisabled,
  allVideosJobs,
  allVideosRunning,
  allVideosTtsReady,
  downloadAllSrts,
  handleQueueDrop,
  handleSrtChange,
  handleVideoChange,
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
  runAllVideosAction,
  separationAvailability,
  setDetailRowIndex,
  setFileDetailsOpen,
  setQueueStates,
  settingsSyncMessage,
  settingsSyncRunning,
  srtDownloadMessage,
  srtInputRef,
  subtitleFiles,
  syncSettingsToAllVideos,
  videoFiles,
  videoInputRef,
}) {
  return (
    <section
      className="flex-1 min-h-0 flex flex-col overflow-hidden rounded-none border-0 bg-transparent"
      onDragOver={(event) => {
        event.preventDefault();
        event.dataTransfer.dropEffect = queueRunning ? "none" : "copy";
      }}
      onDrop={handleQueueDrop}
    >
      {/* Compact Dropzones (2 sleek buttons side-by-side) */}
      <div className="border-b border-slate-800 p-2.5 bg-slate-950/60 shrink-0">
        <div
          className="grid grid-cols-2 gap-2 p-1 border border-dashed border-slate-700/80 bg-slate-900/40 rounded-none"
          onDragEnter={(event) => {
            event.preventDefault();
            event.stopPropagation();
          }}
          onDragOver={(event) => {
            event.preventDefault();
            event.stopPropagation();
            event.dataTransfer.dropEffect = queueRunning ? "none" : "copy";
          }}
          onDrop={(event) => handleQueueDrop(event)}
        >
          <button
            type="button"
            disabled={queueRunning}
            onClick={() => videoInputRef.current?.click()}
            className="flex items-center justify-center gap-2 p-2 border border-slate-800 bg-slate-950/70 hover:bg-amber-500/10 hover:border-amber-500/50 transition-colors text-left rounded-none disabled:opacity-40 cursor-pointer"
            title="Click hoặc kéo thả tệp video (MP4, MKV, MOV...)"
          >
            <Film className="h-4 w-4 shrink-0 text-amber-400" />
            <div className="min-w-0">
              <span className="block text-xs font-bold text-slate-200 truncate">
                Thêm Video
              </span>
              <span className="block text-[10px] text-slate-500 truncate">
                MP4, MKV, MOV
              </span>
            </div>
          </button>
          <button
            type="button"
            disabled={queueRunning}
            onClick={() => openSrtBrowser()}
            className="flex items-center justify-center gap-2 p-2 border border-slate-800 bg-slate-950/70 hover:bg-cyan-500/10 hover:border-cyan-500/50 transition-colors text-left rounded-none disabled:opacity-40 cursor-pointer"
            title="Click hoặc kéo thả tệp phụ đề SRT"
          >
            <FileText className="h-4 w-4 shrink-0 text-cyan-400" />
            <div className="min-w-0">
              <span className="block text-xs font-bold text-slate-200 truncate">
                Thêm Phụ Đề
              </span>
              <span className="block text-[10px] text-slate-500 truncate">
                Tệp .SRT
              </span>
            </div>
          </button>
        </div>
      </div>

      {/* All Videos Batch Actions Toolbar (2 neat rows, zero hidden buttons) */}
      <AllVideosToolbar
        allSrtDownloadTargets={allSrtDownloadTargets}
        allVideosAction={allVideosAction}
        allVideosActionDisabled={allVideosActionDisabled}
        allVideosJobs={allVideosJobs}
        allVideosRunning={allVideosRunning}
        allVideosTtsReady={allVideosTtsReady}
        downloadAllSrts={downloadAllSrts}
        queueRowCount={queueRowCount}
        queueRunning={queueRunning}
        runAllVideosAction={runAllVideosAction}
        separationAvailability={separationAvailability}
        settingsSyncMessage={settingsSyncMessage}
        settingsSyncRunning={settingsSyncRunning}
        srtDownloadMessage={srtDownloadMessage}
        syncSettingsToAllVideos={syncSettingsToAllVideos}
        videoFiles={videoFiles}
      />

      {/* Video Items List: Responsive Cards (No cramped tables, no hidden buttons) */}
      <VideoQueuePreviewPanel
        activeProject={activeProject}
        handleQueueDrop={handleQueueDrop}
        job={job}
        openSrtBrowser={openSrtBrowser}
        previewSourceVideo={previewSourceVideo}
        previewVideoRow={previewVideoRow}
        projectJobItems={projectJobItems}
        queueRowCount={queueRowCount}
        queueRows={queueRows}
        queueRunning={queueRunning}
        queueStates={queueStates}
        removeQueuedSource={removeQueuedSource}
        renderCoverEditorButton={renderCoverEditorButton}
        renderJobProcessingBar={renderJobProcessingBar}
        renderVideoActions={renderVideoActions}
        setDetailRowIndex={setDetailRowIndex}
        setFileDetailsOpen={setFileDetailsOpen}
        setQueueStates={setQueueStates}
        settingsSyncRunning={settingsSyncRunning}
        videoInputRef={videoInputRef}
      />

      <input
        ref={videoInputRef}
        type="file"
        multiple
        accept=".mp4,.mkv,.mov,.avi,.webm,video/mp4,video/x-matroska,video/quicktime,video/x-msvideo,video/webm"
        onChange={handleVideoChange}
        className="hidden"
        aria-label="Chọn một hoặc nhiều video nguồn"
      />
      <input
        ref={srtInputRef}
        type="file"
        multiple
        accept=".srt,application/x-subrip"
        onChange={(event) => void handleSrtChange(event)}
        className="hidden"
        aria-label="Chọn một hoặc nhiều phụ đề SRT"
      />
      <div className="shrink-0 border-t border-slate-800 p-2 bg-slate-950/70">
        <p className="text-[11px] text-slate-400 leading-tight">
          Ghép video và SRT theo thứ tự hàng. Hàng đợi chạy tự động.
          {videoFiles.length !== subtitleFiles.length && (
            <span className="block mt-0.5 text-amber-300">
              ⚠ Cần số lượng video và SRT bằng nhau ({videoFiles.length} video,{" "}
              {subtitleFiles.length} SRT).
            </span>
          )}
        </p>
      </div>
    </section>
  );
}
