import { PanelLeftOpen } from "lucide-react";
import SubtitleResultsPanel from "./SubtitleResultsPanel";
import SubtitlesSettingsPanel from "./SubtitlesSettingsPanel";

export default function SubtitlesTab({
  activeJob,
  batchSizeChoice,
  completedSentencesCount,
  completionPercent,
  copiedMasterAudio,
  copiedSentenceIndex,
  currentMasterItem,
  customBatchSize,
  customPronunciationRules,
  displayLogs,
  dragFeedback,
  effectiveBatchSize,
  espeakStatus,
  fileInputRef,
  handleApplyPreset,
  handleCopyMasterAudio,
  handleCopySentenceAudio,
  handleDeletePreset,
  handleDragLeave,
  handleDragOver,
  handleDrop,
  handleFileUpload,
  handleJumpMaster,
  handleJumpToSentence,
  handlePlayItemAudio,
  handlePlayMasterAudio,
  handlePlayMasterFromSentence,
  handlePreviewVoice,
  handleResetJob,
  handleScrollToSentence,
  handleSeekMaster,
  handleUpdateCurrentPreset,
  isDragging,
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
  maxSpeed,
  minSpeed,
  normalizeNumbers,
  outputFormat,
  parseWarnings,
  playingItemIndex,
  presetFeedback,
  previewLoadingVoiceId,
  previewVoiceId,
  projectPresets,
  selectedPreset,
  selectedPresetId,
  selectedVoice,
  setActiveJob,
  setBatchSizeChoice,
  setCustomBatchSize,
  setIsLeftPanelExpanded,
  setIsLogsExpanded,
  setIsSeekingMaster,
  setLogFilter,
  setMasterCurrentTime,
  setMasterSeekValue,
  setMaxSpeed,
  setMinSpeed,
  setNormalizeNumbers,
  setOutputFormat,
  setShowPresetManagerModal,
  setShowPronunciationModal,
  setShowSavePresetModal,
  setShowSettingsDrawer,
  setShowSrtEditor,
  setShowStagesTracker,
  setShowVoiceModal,
  setSoundNotificationEnabled,
  setSoundOnlyWhenUnfocused,
  setSpeedPriority,
  setSrtRawText,
  setTrimEndMs,
  setTrimStartMs,
  setUploadedFileName,
  setVideoDurationStr,
  showSettingsDrawer,
  showSrtEditor,
  showStagesTracker,
  soundNotificationEnabled,
  soundOnlyWhenUnfocused,
  speedPriority,
  srtRawText,
  subtitles,
  totalSentencesCount,
  trimEndMs,
  trimStartMs,
  uploadedFileName,
  videoDurationStr,
  voices,
}) {
  return (
    <div className="flex-1 min-h-0 w-full h-full flex flex-col lg:flex-row gap-0 overflow-hidden">
      {/* ========================================================= */}
      {/* CỘT BÊN TRÁI: TOÀN BỘ SETTINGS & DỮ LIỆU ĐẦU VÀO          */}
      {/* Có thể Expand hoặc Hide (Requirement 3)                  */}
      {/* ========================================================= */}
      {isLeftPanelExpanded ? (
        <SubtitlesSettingsPanel
          activeJob={activeJob}
          batchSizeChoice={batchSizeChoice}
          customBatchSize={customBatchSize}
          customPronunciationRules={customPronunciationRules}
          dragFeedback={dragFeedback}
          effectiveBatchSize={effectiveBatchSize}
          espeakStatus={espeakStatus}
          fileInputRef={fileInputRef}
          handleApplyPreset={handleApplyPreset}
          handleDeletePreset={handleDeletePreset}
          handleDragLeave={handleDragLeave}
          handleDragOver={handleDragOver}
          handleDrop={handleDrop}
          handleFileUpload={handleFileUpload}
          handlePreviewVoice={handlePreviewVoice}
          handleUpdateCurrentPreset={handleUpdateCurrentPreset}
          isDragging={isDragging}
          maxSpeed={maxSpeed}
          minSpeed={minSpeed}
          normalizeNumbers={normalizeNumbers}
          outputFormat={outputFormat}
          parseWarnings={parseWarnings}
          presetFeedback={presetFeedback}
          previewLoadingVoiceId={previewLoadingVoiceId}
          previewVoiceId={previewVoiceId}
          projectPresets={projectPresets}
          selectedPreset={selectedPreset}
          selectedPresetId={selectedPresetId}
          selectedVoice={selectedVoice}
          setActiveJob={setActiveJob}
          setBatchSizeChoice={setBatchSizeChoice}
          setCustomBatchSize={setCustomBatchSize}
          setIsLeftPanelExpanded={setIsLeftPanelExpanded}
          setMaxSpeed={setMaxSpeed}
          setMinSpeed={setMinSpeed}
          setNormalizeNumbers={setNormalizeNumbers}
          setOutputFormat={setOutputFormat}
          setShowPresetManagerModal={setShowPresetManagerModal}
          setShowPronunciationModal={setShowPronunciationModal}
          setShowSavePresetModal={setShowSavePresetModal}
          setShowSettingsDrawer={setShowSettingsDrawer}
          setShowSrtEditor={setShowSrtEditor}
          setShowVoiceModal={setShowVoiceModal}
          setSoundNotificationEnabled={setSoundNotificationEnabled}
          setSoundOnlyWhenUnfocused={setSoundOnlyWhenUnfocused}
          setSpeedPriority={setSpeedPriority}
          setSrtRawText={setSrtRawText}
          setTrimEndMs={setTrimEndMs}
          setTrimStartMs={setTrimStartMs}
          setUploadedFileName={setUploadedFileName}
          setVideoDurationStr={setVideoDurationStr}
          showSettingsDrawer={showSettingsDrawer}
          showSrtEditor={showSrtEditor}
          soundNotificationEnabled={soundNotificationEnabled}
          soundOnlyWhenUnfocused={soundOnlyWhenUnfocused}
          speedPriority={speedPriority}
          srtRawText={srtRawText}
          subtitles={subtitles}
          trimEndMs={trimEndMs}
          trimStartMs={trimStartMs}
          uploadedFileName={uploadedFileName}
          videoDurationStr={videoDurationStr}
          voices={voices}
        />
      ) : (
        /* Collapsed Rail Toggle Button for Desktop */
        <div className="hidden lg:flex flex-col items-center shrink-0 w-9 h-full border-r border-slate-800 bg-slate-900/90 py-2">
          <button
            type="button"
            onClick={() => setIsLeftPanelExpanded(true)}
            className="w-full py-3 flex flex-col items-center gap-2 text-slate-400 hover:text-amber-400 transition-colors cursor-pointer rounded-none"
            title="Mở rộng Cột Cài Đặt (Settings)"
          >
            <PanelLeftOpen className="w-4 h-4 text-amber-400" />
            <span className="text-[10px] font-bold [writing-mode:vertical-lr] tracking-wider uppercase py-2">
              Cài Đặt
            </span>
          </button>
        </div>
      )}

      {/* ========================================================= */}
      {/* CỘT BÊN PHẢI: WORKSTATION & RESULTS                       */}
      {/* ========================================================= */}
      <SubtitleResultsPanel
        activeJob={activeJob}
        completedSentencesCount={completedSentencesCount}
        completionPercent={completionPercent}
        copiedMasterAudio={copiedMasterAudio}
        copiedSentenceIndex={copiedSentenceIndex}
        currentMasterItem={currentMasterItem}
        displayLogs={displayLogs}
        effectiveBatchSize={effectiveBatchSize}
        handleCopyMasterAudio={handleCopyMasterAudio}
        handleCopySentenceAudio={handleCopySentenceAudio}
        handleJumpMaster={handleJumpMaster}
        handleJumpToSentence={handleJumpToSentence}
        handlePlayItemAudio={handlePlayItemAudio}
        handlePlayMasterAudio={handlePlayMasterAudio}
        handlePlayMasterFromSentence={handlePlayMasterFromSentence}
        handleResetJob={handleResetJob}
        handleScrollToSentence={handleScrollToSentence}
        handleSeekMaster={handleSeekMaster}
        isLeftPanelExpanded={isLeftPanelExpanded}
        isLogsExpanded={isLogsExpanded}
        isSeekingMaster={isSeekingMaster}
        logFilter={logFilter}
        logsContainerRef={logsContainerRef}
        masterAudioRef={masterAudioRef}
        masterCurrentTime={masterCurrentTime}
        masterDuration={masterDuration}
        masterPlaying={masterPlaying}
        masterSeekValue={masterSeekValue}
        playingItemIndex={playingItemIndex}
        selectedVoice={selectedVoice}
        setActiveJob={setActiveJob}
        setIsLeftPanelExpanded={setIsLeftPanelExpanded}
        setIsLogsExpanded={setIsLogsExpanded}
        setIsSeekingMaster={setIsSeekingMaster}
        setLogFilter={setLogFilter}
        setMasterCurrentTime={setMasterCurrentTime}
        setMasterSeekValue={setMasterSeekValue}
        setShowStagesTracker={setShowStagesTracker}
        setShowVoiceModal={setShowVoiceModal}
        showStagesTracker={showStagesTracker}
        subtitles={subtitles}
        totalSentencesCount={totalSentencesCount}
      />
    </div>
  );
}
