import { Paper, Stack, Typography } from "@mui/material";
import {
  FileVideo2,
  Maximize2,
  Minimize2,
  Pause,
  Play,
  Square,
} from "lucide-react";
import React, { useEffect, useRef } from "react";

export default function VideoPreview({
  activeCue,
  activeCueIndex,
  selectedItem,
  fileInputRef,
  previewFrameRef,
  previewFullscreen,
  videoUrl,
  videoAspectRatio,
  selectedId,
  videoRef,
  setVideoDuration,
  setVideoCurrentTime,
  setVideoPaused,
  setVideoAspectRatio,
  setShowTranslation,
  showTranslation,
  displayedText,
  toggleVideoPlayback,
  videoPaused,
  stopVideo,
  videoCurrentTime,
  videoDuration,
}) {
  const timeLabelRef = useRef(null);

  const cueTime = (seconds) => {
    const value = Math.max(
      0,
      Math.floor(Number.isFinite(seconds) ? seconds : 0),
    );
    const hours = Math.floor(value / 3600);
    const minutes = Math.floor((value % 3600) / 60);
    const remaining = value % 60;
    return hours > 0
      ? `${hours}:${String(minutes).padStart(2, "0")}:${String(remaining).padStart(2, "0")}`
      : `${minutes}:${String(remaining).padStart(2, "0")}`;
  };

  useEffect(() => {
    if (videoPaused) {
      if (timeLabelRef.current) {
        timeLabelRef.current.textContent = cueTime(videoCurrentTime);
      }
      return;
    }
    const timer = window.setInterval(() => {
      const video = videoRef?.current;
      if (video && timeLabelRef.current) {
        timeLabelRef.current.textContent = cueTime(video.currentTime);
      }
    }, 100);
    return () => window.clearInterval(timer);
  }, [videoCurrentTime, videoPaused, videoRef]);

  return (
    <Paper
      sx={{
        display: "flex",
        flexDirection: "column",
        overflow: "hidden",
        flex: 1,
        height: "100%",
        position: "relative",
      }}
    >
      {/* <div className="flex-1 min-w-0 h-full flex flex-col overflow-hidden border-r border-slate-800 bg-black"></div> */}
      {/* Video viewport */}
      <div
        ref={previewFrameRef}
        className={`flex-1 min-h-0 relative flex items-center justify-center overflow-hidden ${previewFullscreen ? "fixed inset-0 z-[100] " : ""}`}
      >
        <div
          className="relative flex max-h-full max-w-full items-center justify-center bg-black"
          style={
            previewFullscreen && videoUrl
              ? {
                  width: `min(100vw, ${videoAspectRatio * 100}vh)`,
                  aspectRatio: String(videoAspectRatio),
                }
              : { width: "100%", height: "100%" }
          }
        >
          {videoUrl ? (
            <video
              key={selectedId}
              ref={videoRef}
              src={videoUrl}
              onLoadedMetadata={(event) => {
                const { videoWidth, videoHeight } = event.currentTarget;
                setVideoDuration(event.currentTarget.duration || 0);
                setVideoCurrentTime(event.currentTarget.currentTime);
                setVideoPaused(event.currentTarget.paused);
                if (videoWidth > 0 && videoHeight > 0)
                  setVideoAspectRatio(videoWidth / videoHeight);
              }}
              className="max-h-full max-w-full object-contain"
            />
          ) : (
            <button
              type="button"
              onClick={() => fileInputRef.current?.click()}
              className="flex h-full w-full flex-col items-center justify-center gap-2 text-slate-600 hover:text-violet-300 cursor-pointer transition-colors"
            >
              <FileVideo2 className="h-10 w-10" />
              <span className="text-xs">
                Chọn video từ danh sách hoặc thêm video mới
              </span>
            </button>
          )}
          {videoUrl && displayedText && (
            <div className="pointer-events-none absolute inset-x-0 bottom-[12%] flex justify-center px-6">
              <span
                className={`max-w-[90%] whitespace-pre-line bg-black/70 px-3 py-1.5 text-center font-semibold text-white [text-shadow:0_1px_3px_#000] ${previewFullscreen ? "text-[clamp(1.5rem,3.5vw,3rem)] leading-tight" : "text-sm"}`}
              >
                {displayedText}
              </span>
            </div>
          )}
          {videoUrl && (
            <button
              type="button"
              onClick={() => void togglePreviewFullscreen()}
              aria-label={
                previewFullscreen
                  ? "Thoát toàn màn hình"
                  : "Xem video toàn màn hình"
              }
              className="absolute right-2 top-2 z-10 border border-white/20 bg-black/60 p-1.5 text-white opacity-60 transition-opacity hover:opacity-100 cursor-pointer"
            >
              {previewFullscreen ? (
                <Minimize2 className="h-3.5 w-3.5" />
              ) : (
                <Maximize2 className="h-3.5 w-3.5" />
              )}
            </button>
          )}
        </div>
      </div>

      {/* Video info strip */}
      {selectedItem && (
        <div className="px-2 shrink-0 border-t border-slate-800 flex items-center gap-2 text-[9px] text-slate-500 overflow-hidden">
          <Stack direction={"row"} gap={1} sx={{ alignItems: "center" }}>
            <div className="pr-3 flex items-center gap-2.5">
              <button
                type="button"
                onClick={toggleVideoPlayback}
                disabled={!videoUrl}
                aria-label={videoPaused ? "Phát video" : "Tạm dừng video"}
                className="inline-flex h-6 w-6 shrink-0 items-center justify-center border border-cyan-500/30 bg-cyan-500/10 text-cyan-200 hover:bg-cyan-500/20 disabled:opacity-40 cursor-pointer"
              >
                {videoPaused ? (
                  <Play className="h-3 w-3 ml-0.5" />
                ) : (
                  <Pause className="h-3 w-3" />
                )}
              </button>
              <button
                type="button"
                onClick={stopVideo}
                disabled={!videoUrl}
                aria-label="Dừng về đầu"
                className="inline-flex h-6 w-6 shrink-0 items-center justify-center border border-slate-700 bg-slate-900 text-slate-300 hover:border-slate-500 disabled:opacity-40 cursor-pointer"
              >
                <Square className="h-3 w-3 fill-current" />
              </button>
              <span
                ref={timeLabelRef}
                className="font-mono text-[11px] text-slate-300 tabular-nums shrink-0"
              >
                {cueTime(videoCurrentTime)}
              </span>
              <span className="text-slate-600 shrink-0">/</span>
              <span className="font-mono text-[11px] text-slate-500 tabular-nums shrink-0">
                {cueTime(videoDuration)}
              </span>
              {activeCue && (
                <>
                  <div className="w-px h-3.5 bg-slate-700 shrink-0" />
                  <span className="text-[9px] text-violet-300 font-mono shrink-0 hidden md:inline">
                    câu #{activeCueIndex + 1} · {cueTime(activeCue.startTime)}–
                    {cueTime(activeCue.endTime)}
                  </span>
                </>
              )}
            </div>
            <Typography sx={{ position: "absolute", top: 5, left: 5 }}>
              {selectedItem.video?.name}
            </Typography>
          </Stack>

          <div className="flex flex-row items-center gap-1 ml-auto shrink-0">
            <span>Phụ đề</span>
            <button
              type="button"
              onClick={() => setShowTranslation(false)}
              title="Phụ đề dịch"
              className={`border px-1.5 py-0.5 text-[9px] font-semibold cursor-pointer ${!showTranslation ? "border-violet-500/30 text-violet-200" : "border-slate-700 text-slate-400"}`}
            >
              Gốc
            </button>
            <button
              type="button"
              onClick={() => setShowTranslation(true)}
              title="Phụ đề gốc"
              className={`border px-1.5 py-0.5 text-[9px] font-semibold cursor-pointer ${!showTranslation ? "border-slate-700 text-slate-400" : "border-violet-500/30 text-violet-200"}`}
            >
              Dịch
            </button>
          </div>
        </div>
      )}
    </Paper>
  );
}
