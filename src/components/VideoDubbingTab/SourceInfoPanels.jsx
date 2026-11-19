import SourceVideoCard from "./SourceVideoCard";
import SubtitleSrtCard from "./SubtitleSrtCard";

export default function SourceInfoPanels({
  cancelVideo,
  clearSrt,
  clearVideo,
  handleSrtChange,
  handleVideoChange,
  isBusy,
  job,
  masterGeneration,
  openSrtBrowser,
  srt,
  video,
  videoInputRef,
}) {
  return (
    <div className="hidden grid-cols-1 gap-4 xl:grid-cols-2">
      <SourceVideoCard
        cancelVideo={cancelVideo}
        clearVideo={clearVideo}
        handleVideoChange={handleVideoChange}
        isBusy={isBusy}
        job={job}
        video={video}
        videoInputRef={videoInputRef}
      />

      <SubtitleSrtCard
        clearSrt={clearSrt}
        handleSrtChange={handleSrtChange}
        job={job}
        masterGeneration={masterGeneration}
        openSrtBrowser={openSrtBrowser}
        srt={srt}
      />
    </div>
  );
}
