import {
  LoaderCircle,
  Pause,
  Play,
  RefreshCw,
  RotateCcw,
  Trash2,
} from "lucide-react";
import { formatDuration } from "./helpers";

import { useVideoDubbing } from "./VideoDubbingContext";

export default function PreviewTransportControls(props) {
  const context = useVideoDubbing();
  const {
  hasPreviewTrack,
  isMasterGenerating,
  isMediaProcessing,
  job,
  playMixerPreview,
  previewCurrentTime,
  previewStatus,
  previewSubtitleCues,
  rebuildMasterFromSubtitleAudio,
  regenerateSubtitleAudio,
  restartMixerPreview,
  selectedSubtitleCue,
  selectedSubtitleCueTtsItem,
  selectedVoice,
  setSelectedSubtitleCue,
  subtitleAudioError,
  subtitleAudioInput,
  subtitleAudioMasterBusy,
  subtitleAudioRegeneratingId,
  subtitleAudioSyncing,
  updatePreviewSubtitleCues,
  updateSelectedSubtitleCue,
  videoPreviewReady,
  videoWorkspaceTab,
} = { ...context, ...props };
  return (
    <div
      className={`flex flex-wrap items-center gap-2 ${videoWorkspaceTab === "preview" ? "" : "hidden"}`}
    >
      <button
        type="button"
        onClick={() => void playMixerPreview()}
        disabled={!videoPreviewReady || isMediaProcessing}
        title={
          hasPreviewTrack
            ? "Phát preview video và các track âm thanh đang bật"
            : "Phát video preview (im lặng nếu chưa có track âm thanh)"
        }
        className="inline-flex items-center gap-2 rounded-lg border border-cyan-500/30 bg-cyan-950/30 px-3 py-2 text-xs font-semibold text-cyan-100 hover:bg-cyan-950/60 disabled:cursor-not-allowed disabled:opacity-40"
      >
        {previewStatus === "playing" ? (
          <Pause className="h-3.5 w-3.5" />
        ) : (
          <Play className="h-3.5 w-3.5" />
        )}
        {previewStatus === "playing" ? "Tạm dừng" : "Phát"}
      </button>
      <button
        type="button"
        onClick={() => void restartMixerPreview()}
        disabled={!videoPreviewReady || isMediaProcessing}
        className="inline-flex items-center gap-2 rounded-lg border border-slate-700 px-3 py-2 text-xs text-slate-300 hover:text-white disabled:opacity-40"
      >
        <RotateCcw className="h-3.5 w-3.5" />
        Phát lại từ đầu
      </button>
      <span className="text-xs tabular-nums text-slate-400">
        {formatDuration(previewCurrentTime)} /{" "}
        {formatDuration(job.metadata?.durationSeconds || 0)}
      </span>
      {selectedSubtitleCue !== null &&
        previewSubtitleCues[selectedSubtitleCue] && (
          <div className="flex flex-1 min-w-0 items-center gap-2 rounded-lg">
            <label className="flex-1 min-w-0 space-y-1 text-[10px] text-slate-400">
              Nội dung câu {selectedSubtitleCue + 1}
              <textarea
                value={previewSubtitleCues[selectedSubtitleCue].text}
                onChange={(event) =>
                  updateSelectedSubtitleCue({
                    text: event.target.value,
                  })
                }
                rows={2}
                className="w-full rounded-md border border-slate-700 bg-slate-950 px-2 text-xs text-white"
              />
              {subtitleAudioError && (
                <p
                  role="alert"
                  className="rounded-md border border-rose-500/30 bg-rose-950/20 px-2 py-1.5 text-[10px] text-rose-200 sm:col-span-2"
                >
                  {subtitleAudioError}
                </p>
              )}
            </label>

            <div className="flex shrink-0 flex-wrap items-center gap-2">
              <button
                type="button"
                onClick={() => {
                  if (selectedSubtitleCueTtsItem) {
                    void regenerateSubtitleAudio(selectedSubtitleCueTtsItem);
                  }
                }}
                disabled={
                  !selectedSubtitleCueTtsItem ||
                  !selectedVoice ||
                  subtitleAudioSyncing ||
                  Boolean(subtitleAudioRegeneratingId) ||
                  subtitleAudioMasterBusy ||
                  isMasterGenerating ||
                  isMediaProcessing
                }
                className="inline-flex items-center justify-center gap-1 rounded-md border border-violet-500/30 bg-violet-500/10 px-2 py-1.5 text-xs text-violet-200 hover:bg-violet-500/20 disabled:cursor-not-allowed disabled:opacity-40"
                title="Tạo lại TTS cho câu đang chọn"
              >
                {subtitleAudioRegeneratingId ===
                selectedSubtitleCueTtsItem?.id ? (
                  <LoaderCircle className="h-3 w-3 animate-spin" />
                ) : (
                  <RefreshCw className="h-3 w-3" />
                )}
                Tạo lại TTS
              </button>
              <button
                type="button"
                onClick={() => void rebuildMasterFromSubtitleAudio()}
                disabled={
                  !subtitleAudioInput.length ||
                  subtitleAudioSyncing ||
                  Boolean(subtitleAudioRegeneratingId) ||
                  subtitleAudioMasterBusy ||
                  isMasterGenerating ||
                  isMediaProcessing
                }
                className="inline-flex items-center justify-center gap-1 rounded-md border border-violet-500/30 px-2 py-1.5 text-xs text-violet-200 hover:bg-violet-950/30 disabled:cursor-not-allowed disabled:opacity-40"
                title="Tạo lại Master từ audio của các câu phụ đề"
              >
                {subtitleAudioMasterBusy || isMasterGenerating ? (
                  <LoaderCircle className="h-3 w-3 animate-spin" />
                ) : (
                  <RefreshCw className="h-3 w-3" />
                )}
                Tạo lại Master
              </button>
              <button
                type="button"
                onClick={() => {
                  updatePreviewSubtitleCues((cues) =>
                    cues.filter((_, index) => index !== selectedSubtitleCue),
                  );
                  setSelectedSubtitleCue(null);
                }}
                className="inline-flex items-center justify-center gap-1 rounded-md border border-rose-500/30 px-2 py-1.5 text-xs text-rose-200 hover:bg-rose-950/30"
              >
                <Trash2 className="h-3 w-3" />
                Xóa câu
              </button>
            </div>
          </div>
        )}
    </div>
  );
}
