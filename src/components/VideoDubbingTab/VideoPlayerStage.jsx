import SubtitleOverlayRenderer from "../SubtitleOverlayRenderer";
import { getOverlayAlignment, getSubtitleTextAlignment } from "./helpers";

import { useVideoDubbing } from "./VideoDubbingContext";

export default function VideoPlayerStage(props) {
  const context = useVideoDubbing();
  const {
  activePreviewSubtitle,
  activePreviewTextItems,
  cancelCharacterCardRegionDraw,
  characterCardDrawMode,
  characterCardRegion,
  characterCardRegionDraft,
  endSceneTextOverlays,
  finishCharacterCardRegion,
  job,
  logoEnabled,
  logoPaddingPx,
  logoWidthPercent,
  moveCharacterCardRegion,
  overlayAlignment,
  previewCurrentTime,
  previewOverlayScale,
  previewStageRef,
  previewVideoRef,
  previewingEndScene,
  selectedTextOverlay,
  setPreviewError,
  setVideoPreviewReady,
  startCharacterCardRegion,
  startTextOverlayPreviewDrag,
  subtitleBackgroundColor,
  subtitleBackgroundImage,
  subtitleBackgroundMode,
  subtitleBackgroundTransparent,
  subtitleBold,
  subtitleCharacterSpacingPx,
  subtitleColor,
  subtitleFontFamily,
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
  subtitleUnderline,
  videoWorkspaceTab,
} = { ...context, ...props };
  return (
    <div
      className={`flex justify-center ${videoWorkspaceTab === "preview" ? "" : "hidden"}`}
    >
      <div
        ref={previewStageRef}
        onPointerDownCapture={startCharacterCardRegion}
        onPointerMove={moveCharacterCardRegion}
        onPointerUp={finishCharacterCardRegion}
        onPointerCancel={cancelCharacterCardRegionDraw}
        className={`relative inline-block max-w-full overflow-hidden rounded-lg bg-black ${characterCardDrawMode ? "cursor-crosshair" : ""}`}
      >
        <video
          key={job.id}
          ref={previewVideoRef}
          src={`/api/video-dubbing/jobs/${job.id}/source-video`}
          muted
          playsInline
          preload="metadata"
          onLoadedMetadata={() => setVideoPreviewReady(true)}
          onError={() => {
            setVideoPreviewReady(false);
            setPreviewError(
              "Trình duyệt không thể giải mã định dạng video này. Hãy dùng MP4 hoặc WebM tương thích để xem trước.",
            );
          }}
          className={`block h-auto max-h-[min(60vh,640px)] max-w-full rounded-lg bg-black object-contain ${previewingEndScene ? "opacity-0" : ""}`}
          aria-label="Video nguồn"
        />
        {previewingEndScene && (
          <div
            aria-hidden="true"
            className="pointer-events-none absolute inset-0 z-0 bg-black"
          />
        )}
        {job.overlaySettings?.coverEnabled &&
          !previewingEndScene &&
          job.overlaySettings?.coverFileName &&
          previewCurrentTime <
            (job.overlaySettings.coverFrameCount ?? 5) /
              (job.metadata?.frameRate || 25) && (
            <img
              src={`/api/video-dubbing/jobs/${job.id}/cover?v=${job.updatedAt}`}
              alt="Ảnh cover đầu video"
              className="pointer-events-none absolute inset-0 h-full w-full object-cover"
            />
          )}
        {logoEnabled && job.overlaySettings?.logoFileName && (
          <div
            className={`pointer-events-none absolute inset-0 flex ${previewingEndScene ? "z-10" : ""}`}
            style={{
              justifyContent: overlayAlignment.horizontal,
              alignItems: overlayAlignment.vertical,
              padding: `${logoPaddingPx * previewOverlayScale}px`,
            }}
          >
            <img
              src={`/api/video-dubbing/jobs/${job.id}/logo?v=${job.updatedAt}`}
              alt=""
              className="h-auto max-h-[40%] max-w-full object-contain"
              style={{
                width: `${logoWidthPercent}%`,
              }}
            />
          </div>
        )}
        {activePreviewSubtitle && !previewingEndScene && (
          <div
            className="pointer-events-none absolute inset-0 flex"
            style={{
              justifyContent: subtitleOverlayAlignment.horizontal,
              alignItems: subtitleOverlayAlignment.vertical,
              padding: `${subtitleMarginPx * previewOverlayScale}px`,
            }}
          >
            <SubtitleOverlayRenderer
              text={activePreviewSubtitle.text}
              scale={previewOverlayScale}
              fontSize={subtitleFontSize}
              fontFamily={subtitleFontFamily}
              fontWeight={subtitleBold}
              fontStyle={subtitleItalic}
              underline={subtitleUnderline}
              textCase={subtitleTextCase}
              outlineEnabled={subtitleOutlineEnabled}
              outlineColor={subtitleOutlineColor}
              outlineWidthPx={subtitleOutlineWidthPx}
              characterSpacingPx={subtitleCharacterSpacingPx}
              lineSpacingPx={subtitleLineSpacingPx}
              color={subtitleColor}
              backgroundMode={subtitleBackgroundMode}
              backgroundColor={subtitleBackgroundColor}
              backgroundTransparent={subtitleBackgroundTransparent}
              backgroundImage={subtitleBackgroundImage}
              paddingPx={subtitlePaddingPx}
              position={subtitlePosition}
            />
          </div>
        )}
        {activePreviewTextItems
          .filter(({ cue }) => !previewingEndScene || cue.isTitle)
          .map(({ cue, index }) => {
            const customPosition =
              Number.isFinite(cue.xPercent) && Number.isFinite(cue.yPercent);
            const selected = selectedTextOverlay === index;
            const textAlign = cue.isTitle
              ? undefined
              : (cue.textAlign ?? getSubtitleTextAlignment(cue.position));
            const horizontalTransform =
              textAlign === "left"
                ? "0%"
                : textAlign === "right"
                  ? "-100%"
                  : "-50%";
            const verticalTransform =
              customPosition || cue.position.startsWith("middle-")
                ? "-50%"
                : cue.position.startsWith("bottom-")
                  ? "-100%"
                  : "0%";
            const content = (
              <div
                onPointerDown={(event) =>
                  startTextOverlayPreviewDrag(event, index)
                }
                className={`pointer-events-auto touch-none cursor-move rounded-sm ${selected ? "outline outline-1 outline-dashed outline-violet-300/80" : ""}`}
                title="Kéo để đổi vị trí text"
              >
                <SubtitleOverlayRenderer
                  text={cue.text}
                  secondaryText={
                    cue.kind === "character-card"
                      ? (cue.characterRole ?? "")
                      : undefined
                  }
                  secondaryFontSize={cue.characterRoleFontSize}
                  scale={previewOverlayScale}
                  fontSize={cue.fontSize}
                  fontFamily={cue.fontFamily}
                  fontWeight={cue.bold}
                  fontStyle={cue.italic}
                  underline={cue.underline ?? false}
                  textCase={cue.textCase ?? "none"}
                  outlineEnabled={cue.outlineEnabled ?? false}
                  outlineColor={cue.outlineColor ?? "#000000"}
                  outlineWidthPx={cue.outlineWidthPx ?? 2}
                  characterSpacingPx={cue.characterSpacingPx ?? 0}
                  lineSpacingPx={cue.lineSpacingPx ?? 0}
                  color={cue.color}
                  backgroundMode={cue.backgroundTransparent ? "none" : "color"}
                  backgroundColor={cue.backgroundColor}
                  paddingPx={cue.paddingPx}
                  position={cue.position}
                  textAlign={textAlign}
                  wrap={false}
                />
              </div>
            );
            if (cue.isTitle) {
              return customPosition ? (
                <div
                  key={`preview-text-${index}`}
                  className="absolute z-10"
                  style={{
                    left: `${cue.xPercent}%`,
                    top: `${cue.yPercent}%`,
                    transform: "translate(-50%, -50%)",
                  }}
                >
                  {content}
                </div>
              ) : (
                <div
                  key={`preview-text-${index}`}
                  className="pointer-events-none absolute inset-0 flex"
                  style={{
                    justifyContent: getOverlayAlignment(cue.position)
                      .horizontal,
                    alignItems: getOverlayAlignment(cue.position).vertical,
                    padding: `${24 * previewOverlayScale}px`,
                  }}
                >
                  {content}
                </div>
              );
            }
            const margin = 24 * previewOverlayScale;
            return (
              <div
                key={`preview-text-${index}`}
                className="pointer-events-none absolute inset-0"
              >
                <div
                  className="absolute z-10"
                  style={{
                    left: customPosition
                      ? `${cue.xPercent}%`
                      : cue.position.endsWith("-left")
                        ? `${margin}px`
                        : cue.position.endsWith("-center")
                          ? "50%"
                          : undefined,
                    right:
                      !customPosition && cue.position.endsWith("-right")
                        ? `${margin}px`
                        : undefined,
                    top: customPosition
                      ? `${cue.yPercent}%`
                      : cue.position.startsWith("top-")
                        ? `${margin}px`
                        : cue.position.startsWith("middle-")
                          ? "50%"
                          : undefined,
                    bottom:
                      !customPosition && cue.position.startsWith("bottom-")
                        ? `${margin}px`
                        : undefined,
                    transform: `translate(${horizontalTransform}, ${verticalTransform})`,
                  }}
                >
                  {content}
                </div>
              </div>
            );
          })}
        {previewingEndScene &&
          endSceneTextOverlays.map((cue, index) => {
            const textAlign = cue.textAlign ?? "center";
            const horizontalTransform =
              textAlign === "left"
                ? "0%"
                : textAlign === "right"
                  ? "-100%"
                  : "-50%";
            const verticalTransform = cue.position.startsWith("top-")
              ? "0%"
              : cue.position.startsWith("bottom-")
                ? "-100%"
                : "-50%";
            return (
              <div
                key={`mixer-end-scene-${cue.id ?? index}`}
                className="pointer-events-none absolute z-30"
                style={{
                  left: `${cue.xPercent ?? 50}%`,
                  top: `${cue.yPercent ?? 50}%`,
                  transform: `translate(${horizontalTransform}, ${verticalTransform})`,
                }}
              >
                <SubtitleOverlayRenderer
                  text={cue.text}
                  scale={previewOverlayScale}
                  fontSize={cue.fontSize}
                  fontFamily={cue.fontFamily}
                  fontWeight={cue.bold}
                  fontStyle={cue.italic}
                  underline={cue.underline ?? false}
                  textCase={cue.textCase ?? "none"}
                  outlineEnabled={cue.outlineEnabled ?? false}
                  outlineColor={cue.outlineColor ?? "#000000"}
                  outlineWidthPx={cue.outlineWidthPx ?? 2}
                  characterSpacingPx={cue.characterSpacingPx ?? 0}
                  lineSpacingPx={cue.lineSpacingPx ?? 0}
                  color={cue.color}
                  backgroundMode={cue.backgroundTransparent ? "none" : "color"}
                  backgroundColor={cue.backgroundColor}
                  paddingPx={cue.paddingPx}
                  position={cue.position}
                  textAlign={textAlign}
                  wrap={false}
                />
              </div>
            );
          })}
        {(characterCardRegionDraft || characterCardRegion) && (
          <div
            aria-hidden="true"
            className="pointer-events-none absolute z-30 border-2 border-amber-300 bg-amber-300/10"
            style={{
              left: `${(characterCardRegionDraft || characterCardRegion).left * 100}%`,
              top: `${(characterCardRegionDraft || characterCardRegion).top * 100}%`,
              width: `${(characterCardRegionDraft || characterCardRegion).width * 100}%`,
              height: `${(characterCardRegionDraft || characterCardRegion).height * 100}%`,
            }}
          />
        )}
      </div>
    </div>
  );
}
