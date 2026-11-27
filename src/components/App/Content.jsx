import React from "react";
import StorytellingTab from "../StorytellingTab";
import BgmGeneratorTab from "../BgmGeneratorTab";
import VoiceClonePage from "../VoiceClonePage";
import VideoDubbingTab from "../VideoDubbingTab";
import SubtitleOcrPage from "../SubtitleOcrPage";
import SubtitleEditorPage from "../SubtitleEditorPage";
import SrtFromTextPage from "../SrtFromTextPage";
import JoinSplitVideoPage from "../JoinSplitVideoPage";
import FileTransferPage from "../FileTransferPage";
import ThemePlayground from "../ThemePlayground";
import { VoiceEffectsPage } from "./constants";
import SingleTtsTab from "./SingleTtsTab";
import SubtitlesTab from "./SubtitlesTab";
import VoiceBlend from "../VoiceBlend";

export default function Content({
  activeJob,
  activeTab,
  batchSizeChoice,
  completedSentencesCount,
  completionPercent,
  copiedMasterAudio,
  copiedSentenceIndex,
  copiedSingleAudio,
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
  handleCopySingleAudio,
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
  handleSingleSynthesize,
  handleUpdateCurrentPreset,
  isDragging,
  isLeftPanelExpanded,
  isLogsExpanded,
  isSeekingMaster,
  loadVoices,
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
  setShowAudioCleanupModal,
  setShowPresetManagerModal,
  setShowPronunciationModal,
  setShowSavePresetModal,
  setShowSettingsDrawer,
  setShowSetupModal,
  setShowSrtEditor,
  setShowStagesTracker,
  setShowVoiceModal,
  setSingleSilence,
  setSingleSpeed,
  setSingleText,
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
  singleAudioUrl,
  singleFormat,
  singleIsLoading,
  singleSilence,
  singleSpeed,
  singleText,
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
    <main className="flex-1 min-h-0 w-full overflow-hidden flex flex-col p-0 m-0 max-w-none">
      {/* ========================================================= */}
      {/* TAB 1: SUBTITLE TIMELINE SYNCHRONIZATION STUDIO */}
      {/* ========================================================= */}
      {activeTab === "subtitles" && (
        <SubtitlesTab
          activeJob={activeJob}
          batchSizeChoice={batchSizeChoice}
          completedSentencesCount={completedSentencesCount}
          completionPercent={completionPercent}
          copiedMasterAudio={copiedMasterAudio}
          copiedSentenceIndex={copiedSentenceIndex}
          currentMasterItem={currentMasterItem}
          customBatchSize={customBatchSize}
          customPronunciationRules={customPronunciationRules}
          displayLogs={displayLogs}
          dragFeedback={dragFeedback}
          effectiveBatchSize={effectiveBatchSize}
          espeakStatus={espeakStatus}
          fileInputRef={fileInputRef}
          handleApplyPreset={handleApplyPreset}
          handleCopyMasterAudio={handleCopyMasterAudio}
          handleCopySentenceAudio={handleCopySentenceAudio}
          handleDeletePreset={handleDeletePreset}
          handleDragLeave={handleDragLeave}
          handleDragOver={handleDragOver}
          handleDrop={handleDrop}
          handleFileUpload={handleFileUpload}
          handleJumpMaster={handleJumpMaster}
          handleJumpToSentence={handleJumpToSentence}
          handlePlayItemAudio={handlePlayItemAudio}
          handlePlayMasterAudio={handlePlayMasterAudio}
          handlePlayMasterFromSentence={handlePlayMasterFromSentence}
          handlePreviewVoice={handlePreviewVoice}
          handleResetJob={handleResetJob}
          handleScrollToSentence={handleScrollToSentence}
          handleSeekMaster={handleSeekMaster}
          handleUpdateCurrentPreset={handleUpdateCurrentPreset}
          isDragging={isDragging}
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
          maxSpeed={maxSpeed}
          minSpeed={minSpeed}
          normalizeNumbers={normalizeNumbers}
          outputFormat={outputFormat}
          parseWarnings={parseWarnings}
          playingItemIndex={playingItemIndex}
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
          setIsLogsExpanded={setIsLogsExpanded}
          setIsSeekingMaster={setIsSeekingMaster}
          setLogFilter={setLogFilter}
          setMasterCurrentTime={setMasterCurrentTime}
          setMasterSeekValue={setMasterSeekValue}
          setMaxSpeed={setMaxSpeed}
          setMinSpeed={setMinSpeed}
          setNormalizeNumbers={setNormalizeNumbers}
          setOutputFormat={setOutputFormat}
          setShowPresetManagerModal={setShowPresetManagerModal}
          setShowPronunciationModal={setShowPronunciationModal}
          setShowSavePresetModal={setShowSavePresetModal}
          setShowSettingsDrawer={setShowSettingsDrawer}
          setShowSrtEditor={setShowSrtEditor}
          setShowStagesTracker={setShowStagesTracker}
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
          showStagesTracker={showStagesTracker}
          soundNotificationEnabled={soundNotificationEnabled}
          soundOnlyWhenUnfocused={soundOnlyWhenUnfocused}
          speedPriority={speedPriority}
          srtRawText={srtRawText}
          subtitles={subtitles}
          totalSentencesCount={totalSentencesCount}
          trimEndMs={trimEndMs}
          trimStartMs={trimStartMs}
          uploadedFileName={uploadedFileName}
          videoDurationStr={videoDurationStr}
          voices={voices}
        />
      )}

      {/* ========================================================= */}
      {/* TAB 2: SINGLE TEXT TTS STUDIO                             */}
      {/* ========================================================= */}
      {activeTab === "single" && (
        <SingleTtsTab
          copiedSingleAudio={copiedSingleAudio}
          handleApplyPreset={handleApplyPreset}
          handleCopySingleAudio={handleCopySingleAudio}
          handleSingleSynthesize={handleSingleSynthesize}
          projectPresets={projectPresets}
          selectedPresetId={selectedPresetId}
          selectedVoice={selectedVoice}
          setShowPresetManagerModal={setShowPresetManagerModal}
          setShowVoiceModal={setShowVoiceModal}
          setSingleSilence={setSingleSilence}
          setSingleSpeed={setSingleSpeed}
          setSingleText={setSingleText}
          singleAudioUrl={singleAudioUrl}
          singleFormat={singleFormat}
          singleIsLoading={singleIsLoading}
          singleSilence={singleSilence}
          singleSpeed={singleSpeed}
          singleText={singleText}
          voices={voices}
        />
      )}

      {/* ========================================================= */}
      {/* OTHER TABS (DOCKED WORKSPACE FULL HEIGHT)                 */}
      {/* ========================================================= */}
      {activeTab === "story" && (
        <div className="flex-1 min-h-0 w-full overflow-y-auto">
          <StorytellingTab
            voices={voices}
            onOpenCleanupModal={() => setShowAudioCleanupModal(true)}
          />
        </div>
      )}

      {activeTab === "bgm" && (
        <div className="flex-1 min-h-0 w-full overflow-y-auto">
          <BgmGeneratorTab
            voices={voices}
            onOpenSetup={() => setShowSetupModal(true)}
          />
        </div>
      )}

      {activeTab === "voice-clone" && (
        <div className="flex-1 min-h-0 w-full overflow-hidden flex flex-col">
          <VoiceClonePage
            onVoiceInstalled={() => loadVoices()}
            onOpenSetup={() => setShowSetupModal(true)}
          />
        </div>
      )}
      {activeTab === "subtitle-ocr" && (
        <div className="flex-1 min-h-0 w-full overflow-hidden flex flex-col">
          <SubtitleOcrPage onOpenSetup={() => setShowSetupModal(true)} />
        </div>
      )}
      {activeTab === "subtitle-editor" && (
        <div className="flex-1 min-h-0 w-full overflow-hidden flex flex-col">
          <SubtitleEditorPage onOpenSetup={() => setShowSetupModal(true)} />
        </div>
      )}
      {activeTab === "srt-from-text" && (
        <div className="flex-1 min-h-0 w-full overflow-y-auto">
          <SrtFromTextPage />
        </div>
      )}
      {activeTab === "file-transfer" && (
        <div className="flex-1 min-h-0 w-full overflow-y-auto">
          <FileTransferPage />
        </div>
      )}
      {activeTab === "theme-playground" && (
        <div className="flex-1 min-h-0 w-full overflow-hidden flex flex-col">
          <ThemePlayground />
        </div>
      )}
      {activeTab === "voice-blend" && (
        <div className="flex-1 min-h-0 w-full overflow-hidden flex flex-col">
          <VoiceBlend />
        </div>
      )}
      {activeTab === "join-split-video" && (
        <div className="flex-1 min-h-0 w-full overflow-hidden flex flex-col">
          <JoinSplitVideoPage />
        </div>
      )}
      {activeTab === "voice-effects" && (
        <div className="flex-1 min-h-0 w-full overflow-hidden flex flex-col">
          <React.Suspense
            fallback={
              <div className="p-8 text-center text-sm text-slate-400">
                Đang tải trang Voice Effects...
              </div>
            }
          >
            <VoiceEffectsPage />
          </React.Suspense>
        </div>
      )}
      <div
        className={
          activeTab === "video-dubbing"
            ? "flex-1 min-h-0 w-full overflow-hidden flex flex-col"
            : "hidden"
        }
      >
        <VideoDubbingTab />
      </div>
    </main>
  );
}
