import { ChevronDown } from "lucide-react";
import AutoPipelineSection from "./AutoPipelineSection";
import TtsMasterGenerateSection from "./TtsMasterGenerateSection";
import VideoQueueSection from "./VideoQueueSection";
import VoiceSeparationSection from "./VoiceSeparationSection";

export default function SettingsSidebar({
  activeProject,
  allSrtDownloadTargets,
  allVideosAction,
  allVideosActionDisabled,
  allVideosJobs,
  allVideosRunning,
  allVideosTtsReady,
  autoPipelineConfig,
  autoPipelineDemucsEnabled,
  autoPipelineExpanded,
  autoPipelineSaving,
  canGenerateMaster,
  canStartSeparation,
  cancelMaster,
  cancelSeparation,
  createMaster,
  downloadAllSrts,
  finalMix,
  handleQueueDrop,
  handleSrtChange,
  handleVideoChange,
  hasFinalMix,
  hasMasterAudio,
  isAutoPipelineRunning,
  isFinalMixCurrent,
  isMasterGenerating,
  isSeparationProcessing,
  job,
  leftPanelTab,
  masterError,
  masterGeneration,
  masterPanelExpanded,
  maxSpeed,
  minSpeed,
  mixerError,
  mixerSettings,
  mixerSettingsSaved,
  mixerTouchedRef,
  mixerTrackAvailability,
  mixerVolumeDrafts,
  openSrtBrowser,
  originalAudioVolumePercent,
  previewError,
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
  saveAutoPipelineConfig,
  selectedVoiceId,
  separation,
  separationAvailability,
  separationBackendLabel,
  separationElapsedSeconds,
  separationError,
  separationHeartbeatFresh,
  separationPanelExpanded,
  setAutoPipelineDemucsEnabled,
  setAutoPipelineExpanded,
  setDetailRowIndex,
  setFileDetailsOpen,
  setLeftPanelTab,
  setMasterPanelExpanded,
  setMaxSpeed,
  setMinSpeed,
  setMixerVolumeDrafts,
  setOriginalAudioVolumePercent,
  setQueueStates,
  setSelectedVoiceId,
  setSeparationPanelExpanded,
  setSettingsCollapsed,
  setSpeedPriority,
  settingsCollapsed,
  settingsSyncMessage,
  settingsSyncRunning,
  speedPriority,
  srtDownloadMessage,
  srtInputRef,
  startSeparation,
  subtitleFiles,
  syncSettingsToAllVideos,
  updateMixerSetting,
  videoFiles,
  videoInputRef,
  videoWorkspaceTab,
  voices,
  voicesError,
}) {
  return (
    <div
      className={`h-full min-h-0 overflow-y-auto border-r border-slate-800 bg-slate-900/40 flex flex-col divide-y divide-slate-800 rounded-none scrollbar-thin xl:col-start-1 xl:row-start-3 ${settingsCollapsed ? "min-w-0" : ""}`}
    >
      <button
        type="button"
        onClick={() => setSettingsCollapsed((value) => !value)}
        aria-expanded={!settingsCollapsed}
        className="flex shrink-0 w-full items-center justify-between gap-2 border-b border-slate-800 bg-slate-900/90 px-3 py-2 text-xs font-semibold text-slate-300 hover:border-cyan-500/40 hover:text-white rounded-none"
        title={settingsCollapsed ? "Mở rộng cài đặt" : "Thu gọn cài đặt"}
      >
        <span className={settingsCollapsed ? "xl:hidden" : ""}>
          {settingsCollapsed ? "Cài đặt" : "Thu gọn cột cài đặt"}
        </span>
        <ChevronDown
          className={`h-4 w-4 transition-transform ${settingsCollapsed ? "-rotate-90" : "rotate-90"}`}
        />
      </button>
      <div
        role="tablist"
        aria-label="Nội dung cột bên trái"
        className={
          settingsCollapsed
            ? "hidden"
            : "flex shrink-0 border-b border-slate-800 bg-slate-950/70 p-1 rounded-none gap-1"
        }
      >
        <button
          type="button"
          role="tab"
          aria-selected={leftPanelTab === "settings"}
          onClick={() => setLeftPanelTab("settings")}
          className={`flex-1 rounded-none px-3 py-1.5 text-xs font-semibold ${leftPanelTab === "settings" ? "bg-cyan-400 text-slate-950" : "text-slate-300 hover:bg-slate-800"}`}
        >
          Settings
        </button>
        <button
          type="button"
          role="tab"
          aria-selected={leftPanelTab === "sources"}
          onClick={() => setLeftPanelTab("sources")}
          className={`flex-1 rounded-none px-3 py-1.5 text-xs font-semibold ${leftPanelTab === "sources" ? "bg-cyan-400 text-slate-950" : "text-slate-300 hover:bg-slate-800"}`}
        >
          Danh sách video
        </button>
      </div>
      <div
        className={
          leftPanelTab !== "settings"
            ? "hidden"
            : settingsCollapsed
              ? "space-y-3 xl:hidden p-3"
              : "space-y-3 p-3"
        }
      >
        {(job?.status === "completed" || queueRowCount > 0) && (
          <AutoPipelineSection
            autoPipelineConfig={autoPipelineConfig}
            autoPipelineDemucsEnabled={autoPipelineDemucsEnabled}
            autoPipelineExpanded={autoPipelineExpanded}
            autoPipelineSaving={autoPipelineSaving}
            finalMix={finalMix}
            hasFinalMix={hasFinalMix}
            hasMasterAudio={hasMasterAudio}
            isAutoPipelineRunning={isAutoPipelineRunning}
            isFinalMixCurrent={isFinalMixCurrent}
            job={job}
            maxSpeed={maxSpeed}
            minSpeed={minSpeed}
            mixerError={mixerError}
            mixerSettings={mixerSettings}
            mixerSettingsSaved={mixerSettingsSaved}
            mixerTouchedRef={mixerTouchedRef}
            mixerTrackAvailability={mixerTrackAvailability}
            mixerVolumeDrafts={mixerVolumeDrafts}
            originalAudioVolumePercent={originalAudioVolumePercent}
            previewError={previewError}
            queueRunning={queueRunning}
            saveAutoPipelineConfig={saveAutoPipelineConfig}
            selectedVoiceId={selectedVoiceId}
            separationAvailability={separationAvailability}
            setAutoPipelineDemucsEnabled={setAutoPipelineDemucsEnabled}
            setAutoPipelineExpanded={setAutoPipelineExpanded}
            setMaxSpeed={setMaxSpeed}
            setMinSpeed={setMinSpeed}
            setMixerVolumeDrafts={setMixerVolumeDrafts}
            setOriginalAudioVolumePercent={setOriginalAudioVolumePercent}
            setSelectedVoiceId={setSelectedVoiceId}
            setSpeedPriority={setSpeedPriority}
            speedPriority={speedPriority}
            updateMixerSetting={updateMixerSetting}
            videoFiles={videoFiles}
            videoWorkspaceTab={videoWorkspaceTab}
            voices={voices}
            voicesError={voicesError}
          />
        )}

        <TtsMasterGenerateSection
          canGenerateMaster={canGenerateMaster}
          cancelMaster={cancelMaster}
          createMaster={createMaster}
          hasMasterAudio={hasMasterAudio}
          isAutoPipelineRunning={isAutoPipelineRunning}
          isMasterGenerating={isMasterGenerating}
          job={job}
          masterError={masterError}
          masterGeneration={masterGeneration}
          masterPanelExpanded={masterPanelExpanded}
          setMasterPanelExpanded={setMasterPanelExpanded}
        />

        {job &&
          (job.status === "completed" ||
            Boolean(
              separation?.vocalsSizeBytes || separation?.instrumentalSizeBytes,
            )) && (
            <VoiceSeparationSection
              canStartSeparation={canStartSeparation}
              cancelSeparation={cancelSeparation}
              isAutoPipelineRunning={isAutoPipelineRunning}
              isSeparationProcessing={isSeparationProcessing}
              job={job}
              separation={separation}
              separationAvailability={separationAvailability}
              separationBackendLabel={separationBackendLabel}
              separationElapsedSeconds={separationElapsedSeconds}
              separationError={separationError}
              separationHeartbeatFresh={separationHeartbeatFresh}
              separationPanelExpanded={separationPanelExpanded}
              setSeparationPanelExpanded={setSeparationPanelExpanded}
              startSeparation={startSeparation}
            />
          )}
      </div>

      {leftPanelTab === "sources" && !settingsCollapsed && (
        <VideoQueueSection
          activeProject={activeProject}
          allSrtDownloadTargets={allSrtDownloadTargets}
          allVideosAction={allVideosAction}
          allVideosActionDisabled={allVideosActionDisabled}
          allVideosJobs={allVideosJobs}
          allVideosRunning={allVideosRunning}
          allVideosTtsReady={allVideosTtsReady}
          downloadAllSrts={downloadAllSrts}
          handleQueueDrop={handleQueueDrop}
          handleSrtChange={handleSrtChange}
          handleVideoChange={handleVideoChange}
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
          runAllVideosAction={runAllVideosAction}
          separationAvailability={separationAvailability}
          setDetailRowIndex={setDetailRowIndex}
          setFileDetailsOpen={setFileDetailsOpen}
          setQueueStates={setQueueStates}
          settingsSyncMessage={settingsSyncMessage}
          settingsSyncRunning={settingsSyncRunning}
          srtDownloadMessage={srtDownloadMessage}
          srtInputRef={srtInputRef}
          subtitleFiles={subtitleFiles}
          syncSettingsToAllVideos={syncSettingsToAllVideos}
          videoFiles={videoFiles}
          videoInputRef={videoInputRef}
        />
      )}
    </div>
  );
}
