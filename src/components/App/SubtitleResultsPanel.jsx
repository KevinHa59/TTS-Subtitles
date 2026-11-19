import { PanelLeftClose, PanelLeftOpen } from "lucide-react";
import LiveLogsCard from "./LiveLogsCard";
import MasterAudioCard from "./MasterAudioCard";
import ProcessingMetricsCard from "./ProcessingMetricsCard";
import SubtitleStatusTable from "./SubtitleStatusTable";

export default function SubtitleResultsPanel({
  activeJob,
  completedSentencesCount,
  completionPercent,
  copiedMasterAudio,
  copiedSentenceIndex,
  currentMasterItem,
  displayLogs,
  effectiveBatchSize,
  handleCopyMasterAudio,
  handleCopySentenceAudio,
  handleJumpMaster,
  handleJumpToSentence,
  handlePlayItemAudio,
  handlePlayMasterAudio,
  handlePlayMasterFromSentence,
  handleResetJob,
  handleScrollToSentence,
  handleSeekMaster,
  isLeftPanelExpanded,
  isLogsExpanded,
  isSeekingMaster,
  logFilter,
  logsContainerRef,
  masterAudioRef,
  masterCurrentTime,
  masterDuration,
  masterPlaying,
  masterSeekValue,
  playingItemIndex,
  selectedVoice,
  setActiveJob,
  setIsLeftPanelExpanded,
  setIsLogsExpanded,
  setIsSeekingMaster,
  setLogFilter,
  setMasterCurrentTime,
  setMasterSeekValue,
  setShowStagesTracker,
  setShowVoiceModal,
  showStagesTracker,
  subtitles,
  totalSentencesCount,
}) {
  return (
    <section className="flex-1 min-w-0 h-full flex flex-col gap-0 overflow-hidden bg-slate-950 rounded-none">
      {/* Workspace Top Toolbar */}
      <div className="h-9 px-3 shrink-0 flex items-center justify-between border-b border-slate-800 bg-slate-900/90 rounded-none">
        <div className="flex items-center gap-2">
          <button
            type="button"
            onClick={() => setIsLeftPanelExpanded(!isLeftPanelExpanded)}
            className="inline-flex items-center gap-1.5 px-2 py-1 bg-slate-800 hover:bg-slate-700 text-slate-200 hover:text-white border border-slate-700 text-xs font-semibold transition-colors cursor-pointer rounded-none"
            title={
              isLeftPanelExpanded
                ? "Ẩn cột cài đặt bên trái"
                : "Mở rộng cột cài đặt bên trái"
            }
          >
            {isLeftPanelExpanded ? (
              <>
                <PanelLeftClose className="w-3.5 h-3.5 text-amber-400" />
                <span className="text-[11px]">Ẩn Cài Đặt</span>
              </>
            ) : (
              <>
                <PanelLeftOpen className="w-3.5 h-3.5 text-amber-400" />
                <span className="text-[11px]">Hiện Cài Đặt</span>
              </>
            )}
          </button>
          <span className="text-xs text-slate-400 font-medium hidden sm:inline border-l border-slate-800 pl-2">
            Workstation Đồng Bộ Timeline
          </span>
        </div>

        <div className="flex items-center gap-2 text-xs font-mono text-slate-400">
          <span className="bg-slate-950 px-2 py-0.5 border border-slate-800 rounded-none text-[11px]">
            Phụ đề:{" "}
            <strong className="text-amber-400">{subtitles.length}</strong> câu
          </span>
          <button
            type="button"
            onClick={() => setShowVoiceModal(true)}
            className="bg-slate-950 hover:bg-slate-800 px-2 py-0.5 border border-slate-800 hover:border-amber-500/40 hidden sm:inline-flex items-center gap-1.5 transition-colors cursor-pointer rounded-none text-[11px]"
            title="Bấm để mở bảng chọn giọng đọc"
          >
            <span className="text-slate-400">Giọng:</span>
            <strong className="text-slate-200">{selectedVoice.name}</strong>
            <span className="text-[10px] text-amber-400 bg-amber-500/15 px-1 py-0.2 border border-amber-500/30">
              Đổi
            </span>
          </button>
        </div>
      </div>

      {/* ------------------------------------------------------- */}
      {/* 1. CHI TIẾT TIẾN TRÌNH XỬ LÝ & 9 GIAI ĐOẠN              */}
      {/* (Tiến độ tổng thể, % và nút xử lý đã tách vào thanh dock đáy) */}
      {/* ------------------------------------------------------- */}
      <ProcessingMetricsCard
        activeJob={activeJob}
        effectiveBatchSize={effectiveBatchSize}
        setShowStagesTracker={setShowStagesTracker}
        showStagesTracker={showStagesTracker}
        subtitles={subtitles}
      />

      {/* ------------------------------------------------------- */}
      {/* 2. FILE AUDIO HOÀN CHỈNH ĐỒNG BỘ TIMELINE (MASTER AUDIO)*/}
      {/* ------------------------------------------------------- */}
      {activeJob?.masterAudio && (
        <MasterAudioCard
          activeJob={activeJob}
          copiedMasterAudio={copiedMasterAudio}
          currentMasterItem={currentMasterItem}
          handleCopyMasterAudio={handleCopyMasterAudio}
          handleJumpMaster={handleJumpMaster}
          handleJumpToSentence={handleJumpToSentence}
          handlePlayMasterAudio={handlePlayMasterAudio}
          handleResetJob={handleResetJob}
          handleScrollToSentence={handleScrollToSentence}
          handleSeekMaster={handleSeekMaster}
          isSeekingMaster={isSeekingMaster}
          masterAudioRef={masterAudioRef}
          masterCurrentTime={masterCurrentTime}
          masterDuration={masterDuration}
          masterPlaying={masterPlaying}
          masterSeekValue={masterSeekValue}
          setIsSeekingMaster={setIsSeekingMaster}
          setMasterCurrentTime={setMasterCurrentTime}
          setMasterSeekValue={setMasterSeekValue}
        />
      )}

      {/* ------------------------------------------------------- */}
      {/* 3. BẢNG PHÂN TÍCH PHỤ ĐỀ & TRẠNG THÁI TỪNG CÂU          */}
      {/* Scroll view + Nghe thử từng câu                         */}
      {/* ------------------------------------------------------- */}
      <SubtitleStatusTable
        activeJob={activeJob}
        copiedSentenceIndex={copiedSentenceIndex}
        currentMasterItem={currentMasterItem}
        handleCopySentenceAudio={handleCopySentenceAudio}
        handlePlayItemAudio={handlePlayItemAudio}
        handlePlayMasterFromSentence={handlePlayMasterFromSentence}
        masterPlaying={masterPlaying}
        playingItemIndex={playingItemIndex}
        subtitles={subtitles}
      />

      {/* ------------------------------------------------------- */}
      {/* 4. LIVE LOGS (Có thể Expand hoặc Close)                 */}
      {/* ------------------------------------------------------- */}
      <LiveLogsCard
        activeJob={activeJob}
        completedSentencesCount={completedSentencesCount}
        completionPercent={completionPercent}
        displayLogs={displayLogs}
        isLogsExpanded={isLogsExpanded}
        logFilter={logFilter}
        logsContainerRef={logsContainerRef}
        setActiveJob={setActiveJob}
        setIsLogsExpanded={setIsLogsExpanded}
        setLogFilter={setLogFilter}
        totalSentencesCount={totalSentencesCount}
      />
    </section>
  );
}
