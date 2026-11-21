import { Film } from "lucide-react";
import Tabs from "../customs/Tabs";
import EndSceneTab from "./EndSceneTab";
import MergedVideoTab from "./MergedVideoTab";
import MixerPreviewTab from "./MixerPreviewTab";
import { useVideoDubbing } from "./VideoDubbingContext";

export default function WorkspaceColumn(props) {
  const context = useVideoDubbing();
  const { job, hasExportedVideo } = { ...context, ...props };

  return (
    <div className="h-full min-h-0 overflow-y-auto flex flex-col gap-0 divide-y divide-slate-800 min-w-0 bg-slate-950 rounded-none scrollbar-thin xl:col-start-2 xl:row-start-3">
      {job?.status === "completed" && (
        <section className="rounded-2xl border border-cyan-500/25 bg-slate-900/80">
          <div
            id="video-dubbing-mixer-panel"
            className="grid min-w-0 items-start gap-4 grid-cols-1"
          >
            <div>
              <Tabs
                tabs={[
                  {
                    id: "preview",
                    label: "Video Mixer Preview",
                    content: <MixerPreviewTab />,
                  },
                  {
                    id: "merged",
                    label: "Merged Video",
                    content:
                      hasExportedVideo && job ? (
                        <MergedVideoTab />
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
                      ),
                  },
                  {
                    id: "end-scene",
                    label: "End Scene",
                    content: <EndSceneTab />,
                  },
                ]}
              />
            </div>
          </div>
        </section>
      )}
    </div>
  );
}
