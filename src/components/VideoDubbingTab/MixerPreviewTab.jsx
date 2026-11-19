import CharacterCardResultsPanel from "./CharacterCardResultsPanel";
import OverlaySettingsPanel from "./OverlaySettingsPanel";
import PreviewTransportControls from "./PreviewTransportControls";
import TimelineWorkspace from "./TimelineWorkspace";
import VideoPlayerStage from "./VideoPlayerStage";

export default function MixerPreviewTab({
  acceptCharacterCardReferenceFile,
  activePreviewSubtitle,
  activePreviewTextItems,
  activeSubtitleAudio,
  activeSubtitleAudioFilterCount,
  activeSubtitleAudioItem,
  activeSubtitleAudioRow,
  activeTextTrackId,
  addTextOverlayToTrack,
  adjustSubtitleAudioCueTiming,
  applySelectedTextOverlayToTrack,
  cancelCharacterCardOcr,
  cancelCharacterCardReferenceScan,
  cancelCharacterCardRegionDraw,
  changeSubtitleTimelineZoom,
  characterCardDrawMode,
  characterCardOcrDuration,
  characterCardOcrError,
  characterCardOcrJob,
  characterCardOcrStartOffset,
  characterCardOcrWorker,
  characterCardReferenceError,
  characterCardReferenceFile,
  characterCardReferenceFramesToSkip,
  characterCardReferencePreviewUrl,
  characterCardReferenceScanJob,
  characterCardReferenceSelectedIds,
  characterCardReferenceSimilarity,
  characterCardRegion,
  characterCardRegionDraft,
  combineSubtitleAudioCueAbove,
  commitSubtitleAudioCueText,
  createCharacterCardsAutomatically,
  createTitleOverlay,
  deleteActiveTextTrack,
  deleteSubtitleAudioCue,
  endSceneDurationSeconds,
  endSceneEnabled,
  endSceneTextOverlays,
  filteredSubtitleAudioInput,
  finishCharacterCardRegion,
  fitSubtitleTimelineToPanel,
  flushSubtitleMarginSave,
  hasPreviewTrack,
  isMasterGenerating,
  isMediaProcessing,
  job,
  logoEnabled,
  logoInputRef,
  logoPaddingPx,
  logoPosition,
  logoUploading,
  logoWidthPercent,
  mixerSettings,
  moveCharacterCardRegion,
  nextSubtitleAudioItem,
  overlayAlignment,
  pasteCharacterCardReference,
  playMixerPreview,
  playSubtitleAudio,
  previewCurrentTime,
  previewOverlayScale,
  previewStageRef,
  previewStatus,
  previewSubtitleCues,
  previewVideoRef,
  previewingEndScene,
  previousSubtitleAudioItem,
  rebuildMasterFromSubtitleAudio,
  regenerateSubtitleAudio,
  regenerateSubtitleAudioWithDraft,
  renderSubtitleTimingAdjustment,
  requestMasterEdit,
  restartMixerPreview,
  saveEndSceneForCurrentVideo,
  scheduleSubtitleMarginSave,
  seekMixerPreview,
  seekSubtitleTimeline,
  selectedSubtitleCue,
  selectedSubtitleCueTtsItem,
  selectedTextOverlay,
  selectedVoice,
  setActiveTextTrackId,
  setCharacterCardDrawMode,
  setCharacterCardDrawStart,
  setCharacterCardOcrDuration,
  setCharacterCardOcrError,
  setCharacterCardOcrStartOffset,
  setCharacterCardReferenceError,
  setCharacterCardReferenceFile,
  setCharacterCardReferenceFramesToSkip,
  setCharacterCardReferenceScanJob,
  setCharacterCardReferenceSelectedIds,
  setCharacterCardReferenceSimilarity,
  setCharacterCardRegion,
  setCharacterCardRegionDraft,
  setLogoEnabled,
  setLogoPaddingPx,
  setLogoPosition,
  setLogoWidthPercent,
  setPreviewError,
  setSelectedSubtitleCue,
  setSelectedTextOverlay,
  setSubtitleAudioDrafts,
  setSubtitleAudioFilterOpen,
  setSubtitleAudioMaxCharacterCount,
  setSubtitleAudioShortFilterEnabled,
  setSubtitleAudioSimilarFilterEnabled,
  setSubtitleAudioSpecialCharactersFilterEnabled,
  setSubtitleAudioTimingStepMs,
  setSubtitleBackgroundColor,
  setSubtitleBackgroundImage,
  setSubtitleBackgroundMode,
  setSubtitleBackgroundPickerOpen,
  setSubtitleMarginPx,
  setSubtitlePaddingPx,
  setSubtitlePosition,
  setSubtitlesEnabled,
  setTextOverlays,
  setTextTracks,
  setTimelineWorkspaceTab,
  setVideoPreviewReady,
  srt,
  startCharacterCardOcrWorker,
  startCharacterCardReferenceScan,
  startCharacterCardRegion,
  startSubtitleTimelineDrag,
  startTextOverlayPreviewDrag,
  stopCharacterCardOcrWorker,
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
  subtitleBackgroundColor,
  subtitleBackgroundImage,
  subtitleBackgroundMode,
  subtitleBackgroundTransparent,
  subtitleBackgrounds,
  subtitleBold,
  subtitleCharacterSpacingPx,
  subtitleColor,
  subtitleFontFamily,
  subtitleFontOptions,
  subtitleFontSize,
  subtitleItalic,
  subtitleLineSpacingPx,
  subtitleMarginPx,
  subtitleOutlineColor,
  subtitleOutlineEnabled,
  subtitleOutlineWidthPx,
  subtitleOverlayAlignment,
  subtitlePaddingPx,
  subtitlePosition,
  subtitleTextCase,
  subtitleTextStyleValue,
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
  subtitleUnderline,
  subtitlesEnabled,
  textOverlays,
  textTimelineLanes,
  textTracks,
  timelineWorkspaceTab,
  titleOverlay,
  titleOverlayIndex,
  updateMixerSetting,
  updatePreviewSubtitleCues,
  updateSelectedSubtitleCue,
  updateSelectedTextOverlay,
  updateSubtitleTextStyle,
  uploadOverlayLogo,
  video,
  videoPreviewReady,
  videoWorkspaceTab,
}) {
  return (
    <div>
      <div className="grid grid-cols-[minmax(0,1fr)_350px] gap-4 w-full">
        {/* Left Column - Auto */}
        <div className="min-w-0">
          <div className="space-y-3 rounded-xl border border-slate-800 bg-black/40 p-3">
            <VideoPlayerStage
              activePreviewSubtitle={activePreviewSubtitle}
              activePreviewTextItems={activePreviewTextItems}
              cancelCharacterCardRegionDraw={cancelCharacterCardRegionDraw}
              characterCardDrawMode={characterCardDrawMode}
              characterCardRegion={characterCardRegion}
              characterCardRegionDraft={characterCardRegionDraft}
              endSceneTextOverlays={endSceneTextOverlays}
              finishCharacterCardRegion={finishCharacterCardRegion}
              job={job}
              logoEnabled={logoEnabled}
              logoPaddingPx={logoPaddingPx}
              logoWidthPercent={logoWidthPercent}
              moveCharacterCardRegion={moveCharacterCardRegion}
              overlayAlignment={overlayAlignment}
              previewCurrentTime={previewCurrentTime}
              previewOverlayScale={previewOverlayScale}
              previewStageRef={previewStageRef}
              previewVideoRef={previewVideoRef}
              previewingEndScene={previewingEndScene}
              selectedTextOverlay={selectedTextOverlay}
              setPreviewError={setPreviewError}
              setVideoPreviewReady={setVideoPreviewReady}
              startCharacterCardRegion={startCharacterCardRegion}
              startTextOverlayPreviewDrag={startTextOverlayPreviewDrag}
              subtitleBackgroundColor={subtitleBackgroundColor}
              subtitleBackgroundImage={subtitleBackgroundImage}
              subtitleBackgroundMode={subtitleBackgroundMode}
              subtitleBackgroundTransparent={subtitleBackgroundTransparent}
              subtitleBold={subtitleBold}
              subtitleCharacterSpacingPx={subtitleCharacterSpacingPx}
              subtitleColor={subtitleColor}
              subtitleFontFamily={subtitleFontFamily}
              subtitleFontSize={subtitleFontSize}
              subtitleItalic={subtitleItalic}
              subtitleLineSpacingPx={subtitleLineSpacingPx}
              subtitleMarginPx={subtitleMarginPx}
              subtitleOutlineColor={subtitleOutlineColor}
              subtitleOutlineEnabled={subtitleOutlineEnabled}
              subtitleOutlineWidthPx={subtitleOutlineWidthPx}
              subtitleOverlayAlignment={subtitleOverlayAlignment}
              subtitlePaddingPx={subtitlePaddingPx}
              subtitlePosition={subtitlePosition}
              subtitleTextCase={subtitleTextCase}
              subtitleUnderline={subtitleUnderline}
              videoWorkspaceTab={videoWorkspaceTab}
            />
            {/* {videoWorkspaceTab === "end-scene" && (
                 
                )} */}
            {/* {videoWorkspaceTab === "merged" &&
                  (hasExportedVideo && job ? (
                    <div className="space-y-3 rounded-xl border border-emerald-500/25 bg-emerald-950/20 p-3.5">
                      <div className="flex flex-wrap items-center justify-between gap-2">
                        <span className="text-xs font-semibold text-emerald-300">
                          {videoExport?.status === "completed" &&
                          isFinalMixCurrent
                            ? "MP4 đã xuất"
                            : "MP4 trước đó vẫn được giữ"}
                        </span>
                        <span className="text-xs text-slate-400">
                          {job.exportedVideoFileName ||
                            `${job.fileName.replace(/\.[^.]+$/, "")}_merged.mp4`}{" "}
                          ·{" "}
                          {formatFileSize(videoExport?.sizeBytes || 0)}
                          {videoExport?.durationSeconds !== undefined &&
                            ` · ${formatDuration(videoExport.durationSeconds)}`}
                        </span>
                      </div>
                      {videoExport?.status === "completed" && (
                        <p className="text-xs text-slate-400">
                          Thời gian export:{" "}
                          {formatElapsed(videoExport.elapsedSeconds)}
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
                  ) : (
                    <div className="flex min-h-64 flex-col items-center justify-center gap-2 rounded-lg border border-dashed border-slate-700 bg-slate-950/60 p-6 text-center">
                      <Film className="h-8 w-8 text-slate-600" />
                      <p className="text-sm font-semibold text-slate-300">
                        Chưa có video đã merge
                      </p>
                      <p className="text-xs text-slate-500">
                        Video hoàn tất sẽ xuất hiện tại tab này.
                      </p>
                    </div>
                  ))} */}
            <p
              className={`text-[10px] leading-relaxed text-slate-500 ${videoWorkspaceTab === "preview" ? "" : "hidden"}`}
            >
              Preview logo và style phụ đề sẽ cập nhật trực tiếp khi phát hoặc
              tua video.
            </p>
            <PreviewTransportControls
              hasPreviewTrack={hasPreviewTrack}
              isMasterGenerating={isMasterGenerating}
              isMediaProcessing={isMediaProcessing}
              job={job}
              playMixerPreview={playMixerPreview}
              previewCurrentTime={previewCurrentTime}
              previewStatus={previewStatus}
              previewSubtitleCues={previewSubtitleCues}
              rebuildMasterFromSubtitleAudio={rebuildMasterFromSubtitleAudio}
              regenerateSubtitleAudio={regenerateSubtitleAudio}
              restartMixerPreview={restartMixerPreview}
              selectedSubtitleCue={selectedSubtitleCue}
              selectedSubtitleCueTtsItem={selectedSubtitleCueTtsItem}
              selectedVoice={selectedVoice}
              setSelectedSubtitleCue={setSelectedSubtitleCue}
              subtitleAudioError={subtitleAudioError}
              subtitleAudioInput={subtitleAudioInput}
              subtitleAudioMasterBusy={subtitleAudioMasterBusy}
              subtitleAudioRegeneratingId={subtitleAudioRegeneratingId}
              subtitleAudioSyncing={subtitleAudioSyncing}
              updatePreviewSubtitleCues={updatePreviewSubtitleCues}
              updateSelectedSubtitleCue={updateSelectedSubtitleCue}
              videoPreviewReady={videoPreviewReady}
              videoWorkspaceTab={videoWorkspaceTab}
            />
            {job.metadata && videoWorkspaceTab === "preview" && (
              <input
                type="range"
                min={0}
                max={job.metadata.durationSeconds}
                step={0.05}
                value={Math.min(
                  previewCurrentTime,
                  job.metadata.durationSeconds,
                )}
                onChange={(event) =>
                  seekMixerPreview(Number(event.target.value))
                }
                disabled={!videoPreviewReady}
                className="w-full accent-cyan-400 disabled:opacity-40"
                aria-label="Tua video và các track mixer"
              />
            )}

            {characterCardReferenceScanJob?.status === "completed" && (
              <div className="fixed inset-0 z-[120] flex items-center justify-center bg-slate-950/80 p-3 backdrop-blur-sm sm:p-6">
                <CharacterCardResultsPanel
                  characterCardOcrDuration={characterCardOcrDuration}
                  characterCardOcrError={characterCardOcrError}
                  characterCardOcrJob={characterCardOcrJob}
                  characterCardOcrStartOffset={characterCardOcrStartOffset}
                  characterCardReferenceScanJob={characterCardReferenceScanJob}
                  characterCardReferenceSelectedIds={
                    characterCardReferenceSelectedIds
                  }
                  characterCardReferenceSimilarity={
                    characterCardReferenceSimilarity
                  }
                  createCharacterCardsAutomatically={
                    createCharacterCardsAutomatically
                  }
                  setCharacterCardReferenceScanJob={
                    setCharacterCardReferenceScanJob
                  }
                  setCharacterCardReferenceSelectedIds={
                    setCharacterCardReferenceSelectedIds
                  }
                />
              </div>
            )}
            <p
              className={`text-[10px] leading-relaxed text-slate-500 ${videoWorkspaceTab === "preview" ? "" : "hidden"}`}
            >
              Video là mốc thời gian chính; nguồn video được làm im lặng trong
              preview. Các track chưa có hoặc chưa xác minh sẽ không thể chọn.
            </p>
          </div>
        </div>

        {/* Right Column - Fixed 350px */}
        <OverlaySettingsPanel
          acceptCharacterCardReferenceFile={acceptCharacterCardReferenceFile}
          cancelCharacterCardOcr={cancelCharacterCardOcr}
          cancelCharacterCardReferenceScan={cancelCharacterCardReferenceScan}
          characterCardDrawMode={characterCardDrawMode}
          characterCardOcrDuration={characterCardOcrDuration}
          characterCardOcrError={characterCardOcrError}
          characterCardOcrJob={characterCardOcrJob}
          characterCardOcrStartOffset={characterCardOcrStartOffset}
          characterCardOcrWorker={characterCardOcrWorker}
          characterCardReferenceError={characterCardReferenceError}
          characterCardReferenceFile={characterCardReferenceFile}
          characterCardReferenceFramesToSkip={
            characterCardReferenceFramesToSkip
          }
          characterCardReferencePreviewUrl={characterCardReferencePreviewUrl}
          characterCardReferenceScanJob={characterCardReferenceScanJob}
          characterCardReferenceSimilarity={characterCardReferenceSimilarity}
          characterCardRegion={characterCardRegion}
          createCharacterCardsAutomatically={createCharacterCardsAutomatically}
          createTitleOverlay={createTitleOverlay}
          flushSubtitleMarginSave={flushSubtitleMarginSave}
          isMediaProcessing={isMediaProcessing}
          job={job}
          logoEnabled={logoEnabled}
          logoInputRef={logoInputRef}
          logoPaddingPx={logoPaddingPx}
          logoPosition={logoPosition}
          logoUploading={logoUploading}
          logoWidthPercent={logoWidthPercent}
          pasteCharacterCardReference={pasteCharacterCardReference}
          scheduleSubtitleMarginSave={scheduleSubtitleMarginSave}
          selectedTextOverlay={selectedTextOverlay}
          setCharacterCardDrawMode={setCharacterCardDrawMode}
          setCharacterCardDrawStart={setCharacterCardDrawStart}
          setCharacterCardOcrDuration={setCharacterCardOcrDuration}
          setCharacterCardOcrError={setCharacterCardOcrError}
          setCharacterCardOcrStartOffset={setCharacterCardOcrStartOffset}
          setCharacterCardReferenceError={setCharacterCardReferenceError}
          setCharacterCardReferenceFile={setCharacterCardReferenceFile}
          setCharacterCardReferenceFramesToSkip={
            setCharacterCardReferenceFramesToSkip
          }
          setCharacterCardReferenceScanJob={setCharacterCardReferenceScanJob}
          setCharacterCardReferenceSimilarity={
            setCharacterCardReferenceSimilarity
          }
          setCharacterCardRegion={setCharacterCardRegion}
          setCharacterCardRegionDraft={setCharacterCardRegionDraft}
          setLogoEnabled={setLogoEnabled}
          setLogoPaddingPx={setLogoPaddingPx}
          setLogoPosition={setLogoPosition}
          setLogoWidthPercent={setLogoWidthPercent}
          setSelectedTextOverlay={setSelectedTextOverlay}
          setSubtitleBackgroundColor={setSubtitleBackgroundColor}
          setSubtitleBackgroundImage={setSubtitleBackgroundImage}
          setSubtitleBackgroundMode={setSubtitleBackgroundMode}
          setSubtitleBackgroundPickerOpen={setSubtitleBackgroundPickerOpen}
          setSubtitleMarginPx={setSubtitleMarginPx}
          setSubtitlePaddingPx={setSubtitlePaddingPx}
          setSubtitlePosition={setSubtitlePosition}
          setSubtitlesEnabled={setSubtitlesEnabled}
          setTextOverlays={setTextOverlays}
          srt={srt}
          startCharacterCardOcrWorker={startCharacterCardOcrWorker}
          startCharacterCardReferenceScan={startCharacterCardReferenceScan}
          stopCharacterCardOcrWorker={stopCharacterCardOcrWorker}
          subtitleBackgroundColor={subtitleBackgroundColor}
          subtitleBackgroundImage={subtitleBackgroundImage}
          subtitleBackgroundMode={subtitleBackgroundMode}
          subtitleBackgrounds={subtitleBackgrounds}
          subtitleFontOptions={subtitleFontOptions}
          subtitleMarginPx={subtitleMarginPx}
          subtitlePaddingPx={subtitlePaddingPx}
          subtitlePosition={subtitlePosition}
          subtitleTextStyleValue={subtitleTextStyleValue}
          subtitlesEnabled={subtitlesEnabled}
          titleOverlay={titleOverlay}
          titleOverlayIndex={titleOverlayIndex}
          updateSelectedTextOverlay={updateSelectedTextOverlay}
          updateSubtitleTextStyle={updateSubtitleTextStyle}
          uploadOverlayLogo={uploadOverlayLogo}
          videoPreviewReady={videoPreviewReady}
        />
      </div>
      <TimelineWorkspace
        activeSubtitleAudio={activeSubtitleAudio}
        activeSubtitleAudioFilterCount={activeSubtitleAudioFilterCount}
        activeSubtitleAudioItem={activeSubtitleAudioItem}
        activeSubtitleAudioRow={activeSubtitleAudioRow}
        activeTextTrackId={activeTextTrackId}
        addTextOverlayToTrack={addTextOverlayToTrack}
        adjustSubtitleAudioCueTiming={adjustSubtitleAudioCueTiming}
        applySelectedTextOverlayToTrack={applySelectedTextOverlayToTrack}
        changeSubtitleTimelineZoom={changeSubtitleTimelineZoom}
        combineSubtitleAudioCueAbove={combineSubtitleAudioCueAbove}
        commitSubtitleAudioCueText={commitSubtitleAudioCueText}
        deleteActiveTextTrack={deleteActiveTextTrack}
        deleteSubtitleAudioCue={deleteSubtitleAudioCue}
        endSceneDurationSeconds={endSceneDurationSeconds}
        endSceneEnabled={endSceneEnabled}
        filteredSubtitleAudioInput={filteredSubtitleAudioInput}
        fitSubtitleTimelineToPanel={fitSubtitleTimelineToPanel}
        isMasterGenerating={isMasterGenerating}
        isMediaProcessing={isMediaProcessing}
        job={job}
        mixerSettings={mixerSettings}
        nextSubtitleAudioItem={nextSubtitleAudioItem}
        playSubtitleAudio={playSubtitleAudio}
        previewSubtitleCues={previewSubtitleCues}
        previousSubtitleAudioItem={previousSubtitleAudioItem}
        rebuildMasterFromSubtitleAudio={rebuildMasterFromSubtitleAudio}
        regenerateSubtitleAudioWithDraft={regenerateSubtitleAudioWithDraft}
        renderSubtitleTimingAdjustment={renderSubtitleTimingAdjustment}
        requestMasterEdit={requestMasterEdit}
        saveEndSceneForCurrentVideo={saveEndSceneForCurrentVideo}
        seekSubtitleTimeline={seekSubtitleTimeline}
        selectedSubtitleCue={selectedSubtitleCue}
        selectedTextOverlay={selectedTextOverlay}
        selectedVoice={selectedVoice}
        setActiveTextTrackId={setActiveTextTrackId}
        setSelectedSubtitleCue={setSelectedSubtitleCue}
        setSelectedTextOverlay={setSelectedTextOverlay}
        setSubtitleAudioDrafts={setSubtitleAudioDrafts}
        setSubtitleAudioFilterOpen={setSubtitleAudioFilterOpen}
        setSubtitleAudioMaxCharacterCount={setSubtitleAudioMaxCharacterCount}
        setSubtitleAudioShortFilterEnabled={setSubtitleAudioShortFilterEnabled}
        setSubtitleAudioSimilarFilterEnabled={
          setSubtitleAudioSimilarFilterEnabled
        }
        setSubtitleAudioSpecialCharactersFilterEnabled={
          setSubtitleAudioSpecialCharactersFilterEnabled
        }
        setSubtitleAudioTimingStepMs={setSubtitleAudioTimingStepMs}
        setSubtitlesEnabled={setSubtitlesEnabled}
        setTextOverlays={setTextOverlays}
        setTextTracks={setTextTracks}
        setTimelineWorkspaceTab={setTimelineWorkspaceTab}
        startSubtitleTimelineDrag={startSubtitleTimelineDrag}
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
        timelineWorkspaceTab={timelineWorkspaceTab}
        updateMixerSetting={updateMixerSetting}
        updatePreviewSubtitleCues={updatePreviewSubtitleCues}
        updateSelectedTextOverlay={updateSelectedTextOverlay}
        video={video}
      />
    </div>
  );
}
