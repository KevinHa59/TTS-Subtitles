import VideoDubbingAudioTimeline from "../VideoDubbingAudioTimeline";
import SubtitleAudioSection from "./SubtitleAudioSection";
import SubtitleTimelineSection from "./SubtitleTimelineSection";

export default function TimelineWorkspace({
  activeSubtitleAudio,
  activeSubtitleAudioFilterCount,
  activeSubtitleAudioItem,
  activeSubtitleAudioRow,
  activeTextTrackId,
  addTextOverlayToTrack,
  adjustSubtitleAudioCueTiming,
  applySelectedTextOverlayToTrack,
  changeSubtitleTimelineZoom,
  combineSubtitleAudioCueAbove,
  commitSubtitleAudioCueText,
  deleteActiveTextTrack,
  deleteSubtitleAudioCue,
  endSceneDurationSeconds,
  endSceneEnabled,
  filteredSubtitleAudioInput,
  fitSubtitleTimelineToPanel,
  isMasterGenerating,
  isMediaProcessing,
  job,
  mixerSettings,
  nextSubtitleAudioItem,
  playSubtitleAudio,
  previewSubtitleCues,
  previousSubtitleAudioItem,
  rebuildMasterFromSubtitleAudio,
  regenerateSubtitleAudioWithDraft,
  renderSubtitleTimingAdjustment,
  requestMasterEdit,
  saveEndSceneForCurrentVideo,
  seekSubtitleTimeline,
  selectedSubtitleCue,
  selectedTextOverlay,
  selectedVoice,
  setActiveTextTrackId,
  setSelectedSubtitleCue,
  setSelectedTextOverlay,
  setSubtitleAudioDrafts,
  setSubtitleAudioFilterOpen,
  setSubtitleAudioMaxCharacterCount,
  setSubtitleAudioShortFilterEnabled,
  setSubtitleAudioSimilarFilterEnabled,
  setSubtitleAudioSpecialCharactersFilterEnabled,
  setSubtitleAudioTimingStepMs,
  setSubtitlesEnabled,
  setTextOverlays,
  setTextTracks,
  setTimelineWorkspaceTab,
  startSubtitleTimelineDrag,
  subtitleAudioDrafts,
  subtitleAudioError,
  subtitleAudioFilterOpen,
  subtitleAudioInput,
  subtitleAudioItems,
  subtitleAudioMasterBusy,
  subtitleAudioMaxCharacterCount,
  subtitleAudioPlayingId,
  subtitleAudioRegeneratingId,
  subtitleAudioShortFilterEnabled,
  subtitleAudioSimilarFilterEnabled,
  subtitleAudioSpecialCharactersFilterEnabled,
  subtitleAudioSyncing,
  subtitleAudioTimingStepMs,
  subtitleFontOptions,
  subtitleTimelineCursor,
  subtitleTimelineDuration,
  subtitleTimelineItems,
  subtitleTimelineLaneEnds,
  subtitleTimelineMinZoom,
  subtitleTimelineScrollRef,
  subtitleTimelineTicks,
  subtitleTimelineTrackRef,
  subtitleTimelineWidth,
  subtitleTimelineZoom,
  textOverlays,
  textTimelineLanes,
  textTracks,
  timelineWorkspaceTab,
  updateMixerSetting,
  updatePreviewSubtitleCues,
  updateSelectedTextOverlay,
  video,
}) {
  return (
    <div className="space-y-3">
      <div
        role="tablist"
        aria-label="Timeline video dubbing"
        className="flex gap-1 rounded-xl border border-slate-800 bg-slate-950/70 p-1"
      >
        <button
          type="button"
          role="tab"
          aria-selected={timelineWorkspaceTab === "subtitle"}
          onClick={() => setTimelineWorkspaceTab("subtitle")}
          className={`flex-1 rounded-lg px-3 py-2 text-xs font-semibold ${timelineWorkspaceTab === "subtitle" ? "bg-cyan-400 text-slate-950" : "text-slate-300 hover:bg-slate-800"}`}
        >
          Timeline phụ đề
        </button>
        <button
          type="button"
          role="tab"
          aria-selected={timelineWorkspaceTab === "audio"}
          onClick={() => setTimelineWorkspaceTab("audio")}
          className={`flex-1 rounded-lg px-3 py-2 text-xs font-semibold ${timelineWorkspaceTab === "audio" ? "bg-violet-400 text-slate-950" : "text-slate-300 hover:bg-slate-800"}`}
        >
          Timeline âm thanh
        </button>
        <button
          type="button"
          role="tab"
          aria-selected={timelineWorkspaceTab === "subtitle-audio"}
          onClick={() => setTimelineWorkspaceTab("subtitle-audio")}
          className={`flex-1 rounded-lg px-3 py-2 text-xs font-semibold ${timelineWorkspaceTab === "subtitle-audio" ? "bg-violet-400 text-slate-950" : "text-slate-300 hover:bg-slate-800"}`}
        >
          Subtitle-Audio
        </button>
      </div>
      {timelineWorkspaceTab === "subtitle-audio" && (
        <SubtitleAudioSection
          activeSubtitleAudio={activeSubtitleAudio}
          activeSubtitleAudioFilterCount={activeSubtitleAudioFilterCount}
          activeSubtitleAudioItem={activeSubtitleAudioItem}
          activeSubtitleAudioRow={activeSubtitleAudioRow}
          adjustSubtitleAudioCueTiming={adjustSubtitleAudioCueTiming}
          combineSubtitleAudioCueAbove={combineSubtitleAudioCueAbove}
          commitSubtitleAudioCueText={commitSubtitleAudioCueText}
          deleteSubtitleAudioCue={deleteSubtitleAudioCue}
          filteredSubtitleAudioInput={filteredSubtitleAudioInput}
          isMasterGenerating={isMasterGenerating}
          isMediaProcessing={isMediaProcessing}
          nextSubtitleAudioItem={nextSubtitleAudioItem}
          playSubtitleAudio={playSubtitleAudio}
          previewSubtitleCues={previewSubtitleCues}
          previousSubtitleAudioItem={previousSubtitleAudioItem}
          rebuildMasterFromSubtitleAudio={rebuildMasterFromSubtitleAudio}
          regenerateSubtitleAudioWithDraft={regenerateSubtitleAudioWithDraft}
          seekSubtitleTimeline={seekSubtitleTimeline}
          selectedVoice={selectedVoice}
          setSubtitleAudioDrafts={setSubtitleAudioDrafts}
          setSubtitleAudioFilterOpen={setSubtitleAudioFilterOpen}
          setSubtitleAudioMaxCharacterCount={setSubtitleAudioMaxCharacterCount}
          setSubtitleAudioShortFilterEnabled={
            setSubtitleAudioShortFilterEnabled
          }
          setSubtitleAudioSimilarFilterEnabled={
            setSubtitleAudioSimilarFilterEnabled
          }
          setSubtitleAudioSpecialCharactersFilterEnabled={
            setSubtitleAudioSpecialCharactersFilterEnabled
          }
          setSubtitleAudioTimingStepMs={setSubtitleAudioTimingStepMs}
          subtitleAudioDrafts={subtitleAudioDrafts}
          subtitleAudioError={subtitleAudioError}
          subtitleAudioFilterOpen={subtitleAudioFilterOpen}
          subtitleAudioInput={subtitleAudioInput}
          subtitleAudioItems={subtitleAudioItems}
          subtitleAudioMasterBusy={subtitleAudioMasterBusy}
          subtitleAudioMaxCharacterCount={subtitleAudioMaxCharacterCount}
          subtitleAudioPlayingId={subtitleAudioPlayingId}
          subtitleAudioRegeneratingId={subtitleAudioRegeneratingId}
          subtitleAudioShortFilterEnabled={subtitleAudioShortFilterEnabled}
          subtitleAudioSimilarFilterEnabled={subtitleAudioSimilarFilterEnabled}
          subtitleAudioSpecialCharactersFilterEnabled={
            subtitleAudioSpecialCharactersFilterEnabled
          }
          subtitleAudioSyncing={subtitleAudioSyncing}
          subtitleAudioTimingStepMs={subtitleAudioTimingStepMs}
        />
      )}
      {timelineWorkspaceTab === "subtitle" && (
        <SubtitleTimelineSection
          activeTextTrackId={activeTextTrackId}
          addTextOverlayToTrack={addTextOverlayToTrack}
          applySelectedTextOverlayToTrack={applySelectedTextOverlayToTrack}
          changeSubtitleTimelineZoom={changeSubtitleTimelineZoom}
          deleteActiveTextTrack={deleteActiveTextTrack}
          endSceneDurationSeconds={endSceneDurationSeconds}
          endSceneEnabled={endSceneEnabled}
          fitSubtitleTimelineToPanel={fitSubtitleTimelineToPanel}
          isMediaProcessing={isMediaProcessing}
          job={job}
          previewSubtitleCues={previewSubtitleCues}
          renderSubtitleTimingAdjustment={renderSubtitleTimingAdjustment}
          saveEndSceneForCurrentVideo={saveEndSceneForCurrentVideo}
          seekSubtitleTimeline={seekSubtitleTimeline}
          selectedSubtitleCue={selectedSubtitleCue}
          selectedTextOverlay={selectedTextOverlay}
          setActiveTextTrackId={setActiveTextTrackId}
          setSelectedSubtitleCue={setSelectedSubtitleCue}
          setSelectedTextOverlay={setSelectedTextOverlay}
          setSubtitlesEnabled={setSubtitlesEnabled}
          setTextOverlays={setTextOverlays}
          setTextTracks={setTextTracks}
          startSubtitleTimelineDrag={startSubtitleTimelineDrag}
          subtitleFontOptions={subtitleFontOptions}
          subtitleTimelineCursor={subtitleTimelineCursor}
          subtitleTimelineDuration={subtitleTimelineDuration}
          subtitleTimelineItems={subtitleTimelineItems}
          subtitleTimelineLaneEnds={subtitleTimelineLaneEnds}
          subtitleTimelineMinZoom={subtitleTimelineMinZoom}
          subtitleTimelineScrollRef={subtitleTimelineScrollRef}
          subtitleTimelineTicks={subtitleTimelineTicks}
          subtitleTimelineTrackRef={subtitleTimelineTrackRef}
          subtitleTimelineWidth={subtitleTimelineWidth}
          subtitleTimelineZoom={subtitleTimelineZoom}
          textOverlays={textOverlays}
          textTimelineLanes={textTimelineLanes}
          textTracks={textTracks}
          updatePreviewSubtitleCues={updatePreviewSubtitleCues}
          updateSelectedTextOverlay={updateSelectedTextOverlay}
          video={video}
        />
      )}
      {timelineWorkspaceTab === "audio" && job && (
        <VideoDubbingAudioTimeline
          jobId={job.id}
          duration={job.metadata?.durationSeconds || 1}
          currentTime={subtitleTimelineCursor}
          zoom={subtitleTimelineZoom}
          onZoomChange={changeSubtitleTimelineZoom}
          onSeek={seekSubtitleTimeline}
          vocalsAvailable={Boolean(job.separation?.vocalsSizeBytes)}
          instrumentalAvailable={Boolean(job.separation?.instrumentalSizeBytes)}
          ttsMasterAvailable={Boolean(
            job.masterGeneration?.sizeBytes &&
            job.masterGeneration.durationSeconds !== undefined,
          )}
          ttsMasterVersion={
            job.masterGeneration?.audioVersion ||
            job.masterGeneration?.sizeBytes ||
            0
          }
          masterEdit={job.masterEdit}
          onSplitMaster={() => requestMasterEdit(job.id, "split")}
          onMergeMaster={() => requestMasterEdit(job.id, "merge")}
          onMoveMasterClip={(clips) =>
            requestMasterEdit(job.id, "clips", clips)
          }
          mixerSettings={mixerSettings}
          onToggleMute={(track) =>
            updateMixerSetting(track, {
              muted: !mixerSettings[track].muted,
            })
          }
        />
      )}
    </div>
  );
}
