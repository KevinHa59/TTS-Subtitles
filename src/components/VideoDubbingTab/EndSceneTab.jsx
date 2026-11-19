import SubtitleOverlayRenderer from "../SubtitleOverlayRenderer";
import EndSceneEditorPanel from "./EndSceneEditorPanel";

export default function EndSceneTab({
  addEndSceneText,
  endSceneAspectRatio,
  endSceneDurationSeconds,
  endSceneEnabled,
  endSceneOverlayScale,
  endScenePreviewContainerRef,
  endScenePreviewSize,
  endSceneStageRef,
  endSceneTextOverlays,
  endSceneTextStyleValue,
  isMediaProcessing,
  job,
  removeSelectedEndSceneText,
  saveEndSceneForCurrentVideo,
  selectedEndSceneCue,
  selectedEndSceneTextIndex,
  setEndSceneAspectRatio,
  setEndSceneDurationSeconds,
  setEndSceneTextOverlays,
  setSelectedEndSceneTextIndex,
  startEndSceneTextDrag,
  subtitleFontOptions,
  updateEndSceneText,
  updateSelectedEndSceneStyle,
}) {
  return (
    <div className="space-y-4">
      <div className="grid min-w-0 gap-4 xl:grid-cols-[minmax(0,1.4fr)_minmax(280px,0.8fr)]">
        <div
          ref={endScenePreviewContainerRef}
          className="flex min-w-0 justify-center"
        >
          <div
            ref={endSceneStageRef}
            className="relative shrink-0 overflow-hidden rounded-lg border border-slate-700 bg-black"
            style={{
              width: `${endScenePreviewSize.width}px`,
              height: `${endScenePreviewSize.height}px`,
              maxWidth: "100%",
            }}
          >
            {endSceneTextOverlays.map((cue, index) => {
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
                  key={cue.id ?? `end-scene-text-${index}`}
                  className={`absolute z-30 touch-none ${
                    selectedEndSceneTextIndex === index
                      ? "outline outline-1 outline-dashed outline-orange-300"
                      : ""
                  }`}
                  style={{
                    left: `${cue.xPercent ?? 50}%`,
                    top: `${cue.yPercent ?? 50}%`,
                    transform: `translate(${horizontalTransform}, ${verticalTransform})`,
                  }}
                  onPointerDown={(event) => startEndSceneTextDrag(event, index)}
                >
                  <SubtitleOverlayRenderer
                    text={cue.text}
                    scale={endSceneOverlayScale}
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
                    backgroundMode={
                      cue.backgroundTransparent ? "none" : "color"
                    }
                    backgroundColor={cue.backgroundColor}
                    paddingPx={cue.paddingPx}
                    position={cue.position}
                    textAlign={textAlign}
                    wrap={false}
                  />
                </div>
              );
            })}
            {endSceneTextOverlays.length === 0 && (
              <p className="absolute inset-0 flex items-center justify-center text-xs text-slate-600">
                Màn hình đen · Chưa có text
              </p>
            )}
          </div>
        </div>
        <EndSceneEditorPanel
          addEndSceneText={addEndSceneText}
          endSceneAspectRatio={endSceneAspectRatio}
          endSceneDurationSeconds={endSceneDurationSeconds}
          endSceneEnabled={endSceneEnabled}
          endSceneTextOverlays={endSceneTextOverlays}
          endSceneTextStyleValue={endSceneTextStyleValue}
          isMediaProcessing={isMediaProcessing}
          job={job}
          removeSelectedEndSceneText={removeSelectedEndSceneText}
          saveEndSceneForCurrentVideo={saveEndSceneForCurrentVideo}
          selectedEndSceneCue={selectedEndSceneCue}
          selectedEndSceneTextIndex={selectedEndSceneTextIndex}
          setEndSceneAspectRatio={setEndSceneAspectRatio}
          setEndSceneDurationSeconds={setEndSceneDurationSeconds}
          setEndSceneTextOverlays={setEndSceneTextOverlays}
          setSelectedEndSceneTextIndex={setSelectedEndSceneTextIndex}
          subtitleFontOptions={subtitleFontOptions}
          updateEndSceneText={updateEndSceneText}
          updateSelectedEndSceneStyle={updateSelectedEndSceneStyle}
        />
      </div>
    </div>
  );
}
