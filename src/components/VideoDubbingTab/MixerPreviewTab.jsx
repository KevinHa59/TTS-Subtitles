import CharacterCardResultsPanel from "./CharacterCardResultsPanel";
import OverlaySettingsPanel from "./OverlaySettingsPanel";
import PreviewTransportControls from "./PreviewTransportControls";
import TimelineWorkspace from "./TimelineWorkspace";
import VideoPlayerStage from "./VideoPlayerStage";
import { useVideoDubbing } from "./VideoDubbingContext";

export default function MixerPreviewTab(props) {
  const context = useVideoDubbing();
  const { characterCardReferenceScanJob } = { ...context, ...props };

  return (
    <div>
      <div className="flex w-full items-stretch ">
        {/* Left Column - Video Stage (Flex-1) */}
        <div className="relative min-w-0 flex-1">
          <div className="rounded-xl border border-slate-800 bg-black/40">
            <VideoPlayerStage />
            <PreviewTransportControls />

            {characterCardReferenceScanJob?.status === "completed" && (
              <div className="fixed inset-0 z-[120] flex items-center justify-center bg-slate-950/80 p-3 backdrop-blur-sm sm:p-6">
                <CharacterCardResultsPanel />
              </div>
            )}
          </div>
        </div>

        {/* Right Column - Fixed 400px */}
        <div className="relative w-[400px] shrink-0 overflow-hidden">
          <div className="absolute inset-0 overflow-hidden flex flex-col">
            <OverlaySettingsPanel />
          </div>
        </div>
      </div>

      {/* Subtitle & Audio Timeline Track */}
      <TimelineWorkspace />
    </div>
  );
}
