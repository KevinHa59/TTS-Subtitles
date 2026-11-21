import { DEFAULT_TEXT_TRACK, DEFAULT_TEXT_TRACK_ID } from "./constants";
import SelectedClipStylePanel from "./SelectedClipStylePanel";
import SubtitleTimelineHeader from "./SubtitleTimelineHeader";
import SubtitleTimelineTrack from "./SubtitleTimelineTrack";

import { useVideoDubbing } from "./VideoDubbingContext";

export default function SubtitleTimelineSection(props) {
  const context = useVideoDubbing();
  const {
  activeTextTrackId,
  addTextOverlayToTrack,
  applySelectedTextOverlayToTrack,
  changeSubtitleTimelineZoom,
  deleteActiveTextTrack,
  endSceneDurationSeconds,
  endSceneEnabled,
  fitSubtitleTimelineToPanel,
  isMediaProcessing,
  job,
  previewSubtitleCues,
  renderSubtitleTimingAdjustment,
  saveEndSceneForCurrentVideo,
  seekSubtitleTimeline,
  selectedSubtitleCue,
  selectedTextOverlay,
  setActiveTextTrackId,
  setSelectedSubtitleCue,
  setSelectedTextOverlay,
  setSubtitlesEnabled,
  setTextOverlays,
  setTextTracks,
  startSubtitleTimelineDrag,
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
  updatePreviewSubtitleCues,
  updateSelectedTextOverlay,
  video,
} = { ...context, ...props };
  return (
    <section className="space-y-3 rounded-xl border border-slate-800 bg-slate-950/60 p-3">
      <SubtitleTimelineHeader />
      {previewSubtitleCues.length > 0 && (
        <div className="flex flex-wrap items-center gap-x-4 gap-y-2 rounded-lg border border-slate-800 bg-slate-950/50 px-2.5 py-2 text-[10px] text-slate-400">
          {renderSubtitleTimingAdjustment("start", "Bắt đầu")}
          {renderSubtitleTimingAdjustment("end", "Kết thúc")}
          {renderSubtitleTimingAdjustment("move", "Di chuyển")}
          <span className="text-slate-500">
            Chỉ kéo dài vào khoảng trống, không chồng lấn phụ đề kế bên
          </span>
        </div>
      )}
      {previewSubtitleCues.length === 0 &&
      textTracks.length === 0 &&
      !endSceneEnabled ? (
        <p className="rounded-lg border border-dashed border-slate-700 p-4 text-xs text-slate-500">
          Chọn file SRT để tạo các clip phụ đề trên timeline.
        </p>
      ) : (
        <SubtitleTimelineTrack />
      )}

      {selectedTextOverlay !== null &&
        textOverlays[selectedTextOverlay] &&
        !textOverlays[selectedTextOverlay].isTitle &&
        (() => {
          const cue = textOverlays[selectedTextOverlay];
          const textStyleValue = {
            fontFamily: cue.fontFamily,
            fontSize: cue.fontSize,
            bold: cue.bold,
            underline: cue.underline ?? false,
            italic: cue.italic,
            textCase: cue.textCase ?? "none",
            color: cue.color,
            outlineEnabled: cue.outlineEnabled ?? false,
            outlineColor: cue.outlineColor ?? "#000000",
            outlineWidthPx: cue.outlineWidthPx ?? 2,
            characterSpacingPx: cue.characterSpacingPx ?? 0,
            lineSpacingPx: cue.lineSpacingPx ?? 0,
          };
          const cueTrackId = cue.trackId || DEFAULT_TEXT_TRACK_ID;
          const cueTrackName =
            textTracks.find((track) => track.id === cueTrackId)?.name ||
            DEFAULT_TEXT_TRACK.name;
          const cueTrackTextCount = textOverlays.filter(
            (item) =>
              !item.isTitle &&
              (item.trackId || DEFAULT_TEXT_TRACK_ID) === cueTrackId,
          ).length;
          return (
            <SelectedClipStylePanel
              applySelectedTextOverlayToTrack={applySelectedTextOverlayToTrack}
              cue={cue}
              cueTrackName={cueTrackName}
              cueTrackTextCount={cueTrackTextCount}
              selectedTextOverlay={selectedTextOverlay}
              setSelectedTextOverlay={setSelectedTextOverlay}
              setTextOverlays={setTextOverlays}
              subtitleFontOptions={subtitleFontOptions}
              textStyleValue={textStyleValue}
              updateSelectedTextOverlay={updateSelectedTextOverlay}
              video={video}
            />
          );
        })()}
    </section>
  );
}
