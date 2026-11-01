import type { CSSProperties } from "react";
import type { VideoDubbingOverlayPosition } from "../types/videoDubbing";

export interface SubtitleOverlayRendererProps {
  text: string;
  scale: number;
  fontSize: number;
  fontFamily: string;
  fontWeight: boolean;
  fontStyle: boolean;
  underline?: boolean;
  textCase?: CSSProperties["textTransform"];
  outlineEnabled?: boolean;
  outlineColor?: string;
  outlineWidthPx?: number;
  characterSpacingPx?: number;
  lineSpacingPx?: number;
  color: string;
  backgroundMode: "none" | "color" | "image";
  backgroundColor: string;
  backgroundTransparent?: boolean;
  backgroundImage?: string | null;
  paddingPx: number;
  position: VideoDubbingOverlayPosition;
  assetUrlFor?: (imageName: string) => string;
}

export function getSubtitleTextAlignment(
  position: VideoDubbingOverlayPosition,
): CSSProperties["textAlign"] {
  return position.endsWith("left")
    ? "left"
    : position.endsWith("right")
      ? "right"
      : "center";
}

export default function SubtitleOverlayRenderer({
  text,
  scale,
  fontSize,
  fontFamily,
  fontWeight,
  fontStyle,
  underline = false,
  textCase = "none",
  outlineEnabled = false,
  outlineColor = "#000000",
  outlineWidthPx = 2,
  characterSpacingPx = 0,
  lineSpacingPx = 0,
  color,
  backgroundMode,
  backgroundColor,
  backgroundTransparent = false,
  backgroundImage,
  paddingPx,
  position,
  assetUrlFor,
}: SubtitleOverlayRendererProps) {
  const imageBaseUrl = assetUrlFor
    ? assetUrlFor
    : (imageName: string) =>
        `/assets/subtitle/${encodeURIComponent(imageName)}`;
  const outline = outlineEnabled ? Math.max(0, outlineWidthPx * scale) : 0;
  const diagonal = outline * Math.SQRT1_2;
  const textShadow = outline > 0
    ? [
        `${outline}px 0 ${outlineColor}`,
        `${-outline}px 0 ${outlineColor}`,
        `0 ${outline}px ${outlineColor}`,
        `0 ${-outline}px ${outlineColor}`,
        `${diagonal}px ${diagonal}px ${outlineColor}`,
        `${-diagonal}px ${diagonal}px ${outlineColor}`,
        `${diagonal}px ${-diagonal}px ${outlineColor}`,
        `${-diagonal}px ${-diagonal}px ${outlineColor}`,
      ].join(", ")
    : undefined;

  const style: CSSProperties = {
    padding: `${paddingPx * scale}px`,
    color,
    backgroundColor:
      backgroundMode === "color" && !backgroundTransparent
        ? backgroundColor
        : "transparent",
    fontFamily,
    fontSize: `${Math.max(8, fontSize * scale)}px`,
    fontWeight: fontWeight ? 700 : 400,
    fontStyle: fontStyle ? "italic" : "normal",
    lineHeight: `calc(1.2em + ${lineSpacingPx * scale}px)`,
    letterSpacing: `${characterSpacingPx * scale}px`,
    textTransform: textCase,
    textDecorationLine: underline ? "underline" : "none",
    textShadow,
    textAlign: getSubtitleTextAlignment(position),
    position: "relative",
    overflow: "visible",
    whiteSpace: "pre-line",
    maxWidth: "90%",
  };

  return (
    <span className="video-subtitle-renderer" style={style}>
      {backgroundMode === "image" && backgroundImage && (
        <>
          <img
            aria-hidden="true"
            alt=""
            src={`${imageBaseUrl(`${backgroundImage}-left.png`)}`}
            style={{
              pointerEvents: "none",
              position: "absolute",
              insetBlock: 0,
              left: 0,
              height: "100%",
              width: "auto",
              maxWidth: "none",
              transform: "translateX(-50%)",
              zIndex: 0,
            }}
          />
          <span
            aria-hidden="true"
            style={{
              pointerEvents: "none",
              position: "absolute",
              insetBlock: 0,
              insetInline: 0,
              backgroundImage: `url("${imageBaseUrl(`${backgroundImage}-center.png`)}")`,
              backgroundRepeat: "repeat-x",
              backgroundSize: "auto 100%",
              backgroundPosition: "center center",
              zIndex: 0,
            }}
          />
          <img
            aria-hidden="true"
            alt=""
            src={`${imageBaseUrl(`${backgroundImage}-right.png`)}`}
            style={{
              pointerEvents: "none",
              position: "absolute",
              insetBlock: 0,
              right: 0,
              height: "100%",
              width: "auto",
              maxWidth: "none",
              transform: "translateX(50%)",
              zIndex: 0,
            }}
          />
        </>
      )}
      <span style={{ position: "relative", zIndex: 10 }}>{text}</span>
    </span>
  );
}
