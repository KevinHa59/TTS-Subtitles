export default function TtsMasterFieldset({
  autoPipelineDemucsEnabled,
  isAutoPipelineRunning,
  job,
  maxSpeed,
  minSpeed,
  mixerSettings,
  mixerTrackAvailability,
  mixerVolumeDrafts,
  originalAudioVolumePercent,
  queueRunning,
  selectedVoiceId,
  separationAvailability,
  setAutoPipelineDemucsEnabled,
  setMaxSpeed,
  setMinSpeed,
  setMixerVolumeDrafts,
  setOriginalAudioVolumePercent,
  setSelectedVoiceId,
  setSpeedPriority,
  speedPriority,
  updateMixerSetting,
  videoFiles,
  voices,
  voicesError,
}) {
  return (
    <fieldset
      disabled={isAutoPipelineRunning || queueRunning}
      className="space-y-4 disabled:opacity-55"
    >
      <div>
        <h4 className="text-sm font-semibold text-white">TTS Master</h4>
        <p className="mt-1 text-xs text-slate-400">
          Dùng Piper hoặc VieNeu Turbo và căn cue phụ đề theo timestamp.
        </p>
      </div>
      <div className="grid grid-cols-1 gap-3 md:grid-cols-2 xl:grid-cols-4">
        <label className="space-y-1.5">
          <span className="text-xs font-medium text-slate-300">Giọng đọc</span>
          <select
            value={selectedVoiceId}
            onChange={(event) => setSelectedVoiceId(event.target.value)}
            disabled={voices.length === 0}
            className="w-full rounded-lg border border-slate-700 bg-slate-950 px-3 py-2.5 text-sm text-white focus:border-indigo-400 focus:outline-none disabled:opacity-50"
          >
            {voices.length === 0 ? (
              <option value="">Không có giọng đọc khả dụng</option>
            ) : (
              <>
                <optgroup label="Piper">
                  {voices
                    .filter((voice) => voice.engine === "piper")
                    .map((voice) => (
                      <option key={voice.id} value={voice.id}>
                        {voice.name}
                      </option>
                    ))}
                </optgroup>
                <optgroup label="VieNeu Turbo">
                  {voices
                    .filter((voice) => voice.engine === "vieneu")
                    .map((voice) => (
                      <option key={voice.id} value={voice.id}>
                        {voice.name}
                      </option>
                    ))}
                </optgroup>
              </>
            )}
          </select>
        </label>
        <label className="space-y-1.5">
          <span className="text-xs font-medium text-slate-300">
            Ưu tiên tốc độ
          </span>
          <select
            value={speedPriority}
            onChange={(event) => setSpeedPriority(event.target.value)}
            className="w-full rounded-lg border border-slate-700 bg-slate-950 px-3 py-2.5 text-sm text-white focus:border-indigo-400 focus:outline-none"
          >
            <option value="balanced">Cân bằng</option>
            <option value="strict">Khớp timestamp</option>
            <option value="natural">Ưu tiên tự nhiên</option>
          </select>
        </label>
        <label className="space-y-1.5 md:col-span-2 xl:col-span-4">
          <span className="text-xs font-medium text-slate-300">
            <span className="flex justify-between gap-2">
              <span>Tốc độ tối thiểu</span>
              <span>{minSpeed.toFixed(1)}×</span>
            </span>
          </span>
          <input
            type="range"
            min={0.5}
            max={1.5}
            step={0.1}
            value={minSpeed}
            onChange={(event) => setMinSpeed(Number(event.target.value))}
            className="w-full accent-indigo-400"
          />
        </label>
        <label className="space-y-1.5 md:col-span-2 xl:col-span-4">
          <span className="text-xs font-medium text-slate-300">
            <span className="flex justify-between gap-2">
              <span>Tốc độ tối đa</span>
              <span>{maxSpeed.toFixed(1)}×</span>
            </span>
          </span>
          <input
            type="range"
            min={1}
            max={3}
            step={0.1}
            value={maxSpeed}
            onChange={(event) => setMaxSpeed(Number(event.target.value))}
            className="w-full accent-indigo-400"
          />
        </label>
      </div>
      {voicesError && <p className="text-xs text-rose-300">{voicesError}</p>}

      <div className="border-t border-slate-800 pt-4">
        <h4 className="text-sm font-semibold text-white">Demucs</h4>
        <label className="mt-3 flex items-start gap-3 rounded-xl border border-slate-800 bg-slate-950/60 p-3 text-xs">
          <input
            type="checkbox"
            checked={autoPipelineDemucsEnabled}
            disabled={separationAvailability?.status !== "ready"}
            onChange={(event) =>
              setAutoPipelineDemucsEnabled(event.target.checked)
            }
            className="mt-0.5 accent-indigo-400"
          />
          <span>
            <span className="block font-semibold text-slate-200">
              Tự tách vocals và instrumental khi cần
            </span>
            <span className="mt-1 block text-slate-400">
              {separationAvailability?.status === "ready"
                ? `Sẵn sàng trên ${separationAvailability.device === "directml" ? "GPU DirectML" : separationAvailability.device === "cuda" ? "GPU CUDA" : "CPU"} · ${separationAvailability.model}.`
                : separationAvailability?.message ||
                  "Đang kiểm tra môi trường Demucs."}
            </span>
          </span>
        </label>
        {autoPipelineDemucsEnabled ? (
          <p className="mt-2 text-[11px] leading-relaxed text-slate-500">
            Khi bật, pipeline chỉ tiếp tục sau khi cả hai track được tạo và xác
            minh.
          </p>
        ) : (
          <label className="mt-3 block max-w-xl space-y-2 rounded-xl border border-slate-800 bg-slate-950/60 p-3 text-xs">
            <span className="flex justify-between gap-2 text-slate-300">
              <span>Audio gốc (giọng nói và nhạc chung)</span>
              <span className="font-semibold text-white">
                {originalAudioVolumePercent}%
              </span>
            </span>
            <input
              type="range"
              min={0}
              max={200}
              step={1}
              value={originalAudioVolumePercent}
              disabled={!job?.metadata?.audioCodec && videoFiles.length === 0}
              onChange={(event) =>
                setOriginalAudioVolumePercent(Number(event.target.value))
              }
              className="w-full accent-indigo-400 disabled:opacity-40"
              aria-label="Âm lượng audio gốc"
            />
            <span className="block leading-relaxed text-slate-500">
              {job?.metadata?.audioCodec
                ? "Không tách nguồn thì không thể điều chỉnh riêng thoại và nhạc."
                : job
                  ? "Video không có audio gốc."
                  : "Audio gốc sẽ được kiểm tra khi tải từng video."}
            </span>
          </label>
        )}
      </div>

      <div className="border-t border-slate-800 pt-4">
        <h4 className="text-sm font-semibold text-white">
          Mixer Preview · 3 track
        </h4>
        <div className="mt-3 grid grid-cols-1 gap-3">
          {[
            ["vocals", "Voice / Vocals"],
            ["instrumental", "Background / Instrumental"],
            ["ttsMaster", "TTS Master"],
          ].map(([track, label]) => {
            const setting = mixerSettings[track];
            const available = mixerTrackAvailability[track];
            return (
              <div
                key={track}
                className="space-y-3 rounded-xl border border-slate-800 bg-slate-950/60 p-3"
              >
                <div className="flex items-center justify-between gap-2">
                  <span className="text-xs font-semibold text-slate-200">
                    {label}
                  </span>
                  <span className="text-[10px] text-slate-500">
                    {available ? "Đã có track" : "Sẽ dùng khi có đầu ra"}
                  </span>
                </div>
                <label className="flex flex-wrap items-center gap-3 text-[11px] text-slate-400">
                  <span className="w-16 shrink-0">Âm lượng</span>
                  <input
                    type="range"
                    min={0}
                    max={200}
                    step={1}
                    value={setting.volumePercent}
                    onChange={(event) =>
                      updateMixerSetting(track, {
                        volumePercent: Number(event.target.value),
                      })
                    }
                    className="min-w-24 flex-1 accent-indigo-400"
                    aria-label={`${label} volume`}
                  />
                  <span className="flex shrink-0 items-center gap-1 text-slate-200">
                    <input
                      type="text"
                      inputMode="numeric"
                      maxLength={3}
                      value={
                        mixerVolumeDrafts[track] ??
                        String(setting.volumePercent)
                      }
                      onChange={(event) => {
                        const value = event.target.value;
                        if (!/^\d{0,3}$/.test(value)) return;
                        const boundedValue =
                          value !== "" && Number(value) > 200 ? "200" : value;
                        setMixerVolumeDrafts((current) => ({
                          ...current,
                          [track]: boundedValue,
                        }));
                        if (boundedValue !== "") {
                          updateMixerSetting(track, {
                            volumePercent: Number(boundedValue),
                          });
                        }
                      }}
                      onBlur={() =>
                        setMixerVolumeDrafts((current) => ({
                          ...current,
                          [track]: undefined,
                        }))
                      }
                      className="w-14 rounded-md border border-slate-700 bg-slate-900 px-2 py-1 text-right text-xs text-white"
                      aria-label={`${label} volume percent`}
                    />
                    <span>%</span>
                  </span>
                </label>
                <label className="inline-flex items-center gap-2 text-[11px] text-slate-300">
                  <input
                    type="checkbox"
                    checked={setting.muted}
                    onChange={(event) =>
                      updateMixerSetting(track, {
                        muted: event.target.checked,
                      })
                    }
                    className="accent-indigo-400"
                  />
                  Tắt track
                </label>
              </div>
            );
          })}
        </div>
        <p className="mt-2 text-[11px] text-slate-500">
          Có thể lưu mức âm lượng/mute trước khi các file track tồn tại; các giá
          trị này chỉ áp dụng khi pipeline được chạy.
        </p>
      </div>
    </fieldset>
  );
}
