import { ChevronDown, HardDrive, LoaderCircle, RefreshCw } from "lucide-react";
import TtsMasterFieldset from "./TtsMasterFieldset";

export default function AutoPipelineSection({
  autoPipelineConfig,
  autoPipelineDemucsEnabled,
  autoPipelineExpanded,
  autoPipelineSaving,
  finalMix,
  hasFinalMix,
  hasMasterAudio,
  isAutoPipelineRunning,
  isFinalMixCurrent,
  job,
  maxSpeed,
  minSpeed,
  mixerError,
  mixerSettings,
  mixerSettingsSaved,
  mixerTouchedRef,
  mixerTrackAvailability,
  mixerVolumeDrafts,
  originalAudioVolumePercent,
  previewError,
  queueRunning,
  saveAutoPipelineConfig,
  selectedVoiceId,
  separationAvailability,
  setAutoPipelineDemucsEnabled,
  setAutoPipelineExpanded,
  setMaxSpeed,
  setMinSpeed,
  setMixerVolumeDrafts,
  setOriginalAudioVolumePercent,
  setSelectedVoiceId,
  setSpeedPriority,
  speedPriority,
  updateMixerSetting,
  videoFiles,
  videoWorkspaceTab,
  voices,
  voicesError,
}) {
  return (
    <section className="overflow-hidden rounded-2xl border border-indigo-500/25 bg-slate-900/80">
      <div className="flex flex-col gap-3 p-4 sm:flex-row sm:items-center sm:justify-between sm:p-5">
        <button
          type="button"
          onClick={() => setAutoPipelineExpanded((expanded) => !expanded)}
          aria-expanded={autoPipelineExpanded}
          className="flex min-w-0 flex-1 items-center gap-3 text-left"
        >
          <span className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl border border-indigo-500/25 bg-indigo-500/15 text-indigo-300">
            <RefreshCw className="h-5 w-5" />
          </span>
          <span>
            <span className="block font-semibold text-white">
              Auto Pipeline
            </span>
            <span className="mt-1 block text-xs text-slate-400">
              Cấu hình TTS, Demucs, Mixer và xuất MP4 theo một luồng.
            </span>
          </span>
          {autoPipelineExpanded ? (
            <ChevronDown className="ml-auto h-4 w-4 shrink-0 rotate-180 text-slate-400" />
          ) : (
            <ChevronDown className="ml-auto h-4 w-4 shrink-0 text-slate-400" />
          )}
        </button>
      </div>

      {autoPipelineExpanded && (
        <div className="space-y-4 border-t border-slate-800 p-4 sm:p-5">
          <TtsMasterFieldset
            autoPipelineDemucsEnabled={autoPipelineDemucsEnabled}
            isAutoPipelineRunning={isAutoPipelineRunning}
            job={job}
            maxSpeed={maxSpeed}
            minSpeed={minSpeed}
            mixerSettings={mixerSettings}
            mixerTrackAvailability={mixerTrackAvailability}
            mixerVolumeDrafts={mixerVolumeDrafts}
            originalAudioVolumePercent={originalAudioVolumePercent}
            queueRunning={queueRunning}
            selectedVoiceId={selectedVoiceId}
            separationAvailability={separationAvailability}
            setAutoPipelineDemucsEnabled={setAutoPipelineDemucsEnabled}
            setMaxSpeed={setMaxSpeed}
            setMinSpeed={setMinSpeed}
            setMixerVolumeDrafts={setMixerVolumeDrafts}
            setOriginalAudioVolumePercent={setOriginalAudioVolumePercent}
            setSelectedVoiceId={setSelectedVoiceId}
            setSpeedPriority={setSpeedPriority}
            speedPriority={speedPriority}
            updateMixerSetting={updateMixerSetting}
            videoFiles={videoFiles}
            voices={voices}
            voicesError={voicesError}
          />

          <div
            className={`space-y-4 ${videoWorkspaceTab === "preview" ? "" : "hidden"}`}
          >
            {!hasMasterAudio && job?.metadata?.audioCodec && (
              <p className="rounded-lg border border-amber-500/25 bg-amber-950/20 p-3 text-xs text-amber-200">
                TTS Master là tùy chọn. Nếu không có track vocals hoặc
                instrumental đang bật, Mix Audio sẽ dùng audio gốc của video.
              </p>
            )}
            {mixerError && (
              <p className="rounded-lg border border-rose-500/30 bg-rose-950/30 p-3 text-xs text-rose-200">
                {mixerError}
              </p>
            )}
            {previewError && (
              <p className="rounded-lg border border-rose-500/30 bg-rose-950/30 p-3 text-xs text-rose-200">
                {previewError}
              </p>
            )}
            <div className="flex flex-wrap items-center gap-3">
              {mixerSettingsSaved ? (
                <span className="text-[11px] text-emerald-300">
                  Cấu hình mixer đã lưu cho job
                </span>
              ) : mixerTouchedRef.current ? (
                <span className="text-[11px] text-slate-400">
                  Đang lưu cấu hình mixer…
                </span>
              ) : (
                <span className="text-[11px] text-slate-400">
                  Cấu hình mặc định · thay đổi để lưu
                </span>
              )}
            </div>

            {hasFinalMix && job && (
              <div className="space-y-2 rounded-xl border border-emerald-500/25 bg-emerald-950/20 p-3.5">
                <p className="text-xs font-semibold text-emerald-300">
                  {isFinalMixCurrent
                    ? "Final mix đã xác minh"
                    : "Final mix cũ vẫn được giữ; chưa khớp mixer settings hiện tại"}
                </p>
                <audio
                  key={`${job.id}-${finalMix?.sizeBytes}`}
                  controls
                  preload="metadata"
                  src={`/api/video-dubbing/jobs/${job.id}/final-mix-audio`}
                  className="w-full"
                >
                  Trình duyệt không hỗ trợ phát WAV.
                </audio>
              </div>
            )}
          </div>

          <div className="flex flex-wrap gap-2">
            <button
              type="button"
              onClick={() => void saveAutoPipelineConfig()}
              disabled={
                !autoPipelineConfig ||
                autoPipelineSaving ||
                isAutoPipelineRunning
              }
              className="inline-flex items-center justify-center gap-2 rounded-xl border border-slate-700 px-3 py-2.5 text-xs font-semibold text-slate-200 hover:border-slate-500 disabled:cursor-not-allowed disabled:opacity-40"
            >
              {autoPipelineSaving ? (
                <LoaderCircle className="h-4 w-4 animate-spin" />
              ) : (
                <HardDrive className="h-4 w-4" />
              )}
              Lưu cấu hình
            </button>
          </div>
          {!autoPipelineConfig && (
            <p className="text-[11px] leading-relaxed text-amber-300">
              Chọn SRT có cue hợp lệ và giọng đọc để cấu hình Auto Pipeline.
            </p>
          )}
        </div>
      )}
    </section>
  );
}
