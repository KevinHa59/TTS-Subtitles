import {
  Check,
  Copy,
  Download,
  Music,
  Pause,
  Play,
  Quote,
  SkipBack,
  SkipForward,
  Trash2,
  Volume2,
} from "lucide-react";
import {
  formatSecondsDisplay,
  formatSecondsToSrtTime,
} from "../../utils/srtParser";

export default function MasterAudioCard({
  activeJob,
  copiedMasterAudio,
  currentMasterItem,
  handleCopyMasterAudio,
  handleJumpMaster,
  handleJumpToSentence,
  handlePlayMasterAudio,
  handleResetJob,
  handleScrollToSentence,
  handleSeekMaster,
  isSeekingMaster,
  masterAudioRef,
  masterCurrentTime,
  masterDuration,
  masterPlaying,
  masterSeekValue,
  setIsSeekingMaster,
  setMasterCurrentTime,
  setMasterSeekValue,
}) {
  return (
    <div className="shrink-0 border-b border-slate-800 bg-slate-900/60 p-3 space-y-3 rounded-none">
      <div className="flex flex-col sm:flex-row items-start sm:items-center justify-between gap-3">
        <div className="flex items-center gap-3">
          <div className="w-12 h-12 rounded-2xl bg-amber-500 text-slate-950 flex items-center justify-center font-bold shadow-lg shadow-amber-500/30">
            <Music className="w-6 h-6" />
          </div>
          <div>
            <div className="flex items-center gap-2">
              <h3 className="text-base font-bold text-white">
                File Audio Hoàn Chỉnh Đồng Bộ Timeline
              </h3>
              <span className="px-2 py-0.5 rounded text-[10px] font-bold bg-emerald-500/20 text-emerald-300 border border-emerald-500/30">
                Timeline Ready
              </span>
            </div>
            <p className="text-xs text-slate-400 mt-0.5">
              Tổng thời lượng:{" "}
              <strong className="text-white">
                {activeJob.masterAudio.duration.toFixed(2)}s
              </strong>{" "}
              · Định dạng: {activeJob.masterAudio.format.toUpperCase()} · Dung
              lượng: {(activeJob.masterAudio.sizeBytes / 1024).toFixed(1)} KB
            </p>
          </div>
        </div>

        {/* Master Download Buttons */}
        <div className="flex flex-wrap items-center gap-2">
          <a
            href={`/api/subtitles/job/${activeJob.id}/master-audio?download=1&format=mp3`}
            className="px-4 py-2.5 bg-amber-500 hover:bg-amber-400 text-slate-950 font-bold text-xs rounded-xl shadow-lg shadow-amber-500/20 flex items-center gap-1.5 transition-transform active:scale-95"
          >
            <Download className="w-4 h-4" />
            <span>Tải Master MP3</span>
          </a>
          <a
            href={`/api/subtitles/job/${activeJob.id}/master-audio?download=1&format=wav`}
            className="px-3 py-2.5 bg-slate-800 hover:bg-slate-700 text-slate-200 font-medium text-xs rounded-xl border border-slate-700 flex items-center gap-1 transition-colors"
            title="Tải WAV không nén"
          >
            <Download className="w-3.5 h-3.5 text-slate-400" />
            <span>WAV</span>
          </a>
          <button
            type="button"
            onClick={handleCopyMasterAudio}
            className="px-3.5 py-2.5 bg-slate-800 hover:bg-slate-700 text-amber-400 hover:text-amber-300 font-semibold text-xs rounded-xl border border-slate-700 hover:border-amber-500/40 flex items-center gap-1.5 transition-all active:scale-95 cursor-pointer shadow-sm"
            title="Sao chép toàn bộ Master Audio vào clipboard"
          >
            {copiedMasterAudio ? (
              <>
                <Check className="w-4 h-4 text-emerald-400 stroke-[3]" />
                <span className="text-emerald-400 font-bold">Đã copy!</span>
              </>
            ) : (
              <>
                <Copy className="w-3.5 h-3.5" />
                <span>Copy Audio</span>
              </>
            )}
          </button>
          <button
            type="button"
            onClick={handleResetJob}
            className="px-3 py-2.5 bg-slate-800 hover:bg-slate-700 text-slate-300 hover:text-white font-medium text-xs rounded-xl border border-slate-700 flex items-center gap-1.5 transition-colors cursor-pointer"
            title="Dọn dẹp tệp tạm và làm mới"
          >
            <Trash2 className="w-3.5 h-3.5 text-slate-400" />
            <span>Dọn Dẹp & Làm Mới</span>
          </button>
        </div>
      </div>

      {/* Master Audio Scrubbing Player & Live Sentence Display (Requirement 1 & 2) */}
      <div className="bg-slate-950/90 rounded-2xl p-4 sm:p-5 border border-slate-800 space-y-4 shadow-xl">
        {/* Top Row: Playback Controls + Scrubbing Slider */}
        <div className="flex flex-col sm:flex-row sm:items-center gap-4">
          {/* Nav & Play Buttons */}
          <div className="flex items-center gap-1.5 shrink-0 self-center sm:self-auto">
            <button
              type="button"
              onClick={() => handleJumpToSentence("prev")}
              className="p-2 bg-slate-900 hover:bg-slate-800 text-slate-300 hover:text-white rounded-xl border border-slate-700/80 transition-colors cursor-pointer"
              title="Nhảy về câu trước (⏮)"
            >
              <SkipBack className="w-4 h-4" />
            </button>
            <button
              type="button"
              onClick={() => handleJumpMaster(-5)}
              className="px-2.5 py-2 bg-slate-900 hover:bg-slate-800 text-slate-300 hover:text-white rounded-xl border border-slate-700/80 text-xs font-mono font-bold transition-colors cursor-pointer"
              title="Tua lùi 5 giây (⏪ -5s)"
            >
              -5s
            </button>
            <button
              type="button"
              onClick={() => handlePlayMasterAudio()}
              className="w-12 h-12 rounded-2xl bg-gradient-to-r from-amber-500 to-amber-400 hover:from-amber-400 hover:to-amber-300 text-slate-950 flex items-center justify-center shrink-0 shadow-lg shadow-amber-500/30 transition-transform active:scale-95 cursor-pointer font-bold"
              title={masterPlaying ? "Tạm dừng" : "Phát Master Audio"}
            >
              {masterPlaying ? (
                <Pause className="w-6 h-6 fill-current" />
              ) : (
                <Play className="w-6 h-6 fill-current ml-0.5" />
              )}
            </button>
            <button
              type="button"
              onClick={() => handleJumpMaster(5)}
              className="px-2.5 py-2 bg-slate-900 hover:bg-slate-800 text-slate-300 hover:text-white rounded-xl border border-slate-700/80 text-xs font-mono font-bold transition-colors cursor-pointer"
              title="Tua tới 5 giây (+5s ⏩)"
            >
              +5s
            </button>
            <button
              type="button"
              onClick={() => handleJumpToSentence("next")}
              className="p-2 bg-slate-900 hover:bg-slate-800 text-slate-300 hover:text-white rounded-xl border border-slate-700/80 transition-colors cursor-pointer"
              title="Nhảy sang câu sau (⏭)"
            >
              <SkipForward className="w-4 h-4" />
            </button>
          </div>

          {/* Scrubbing Track (Requirement 1: Kéo tới bất kỳ vị trí nào để nghe) */}
          <div className="flex-1 w-full space-y-1.5">
            <div className="relative flex items-center">
              <input
                type="range"
                min="0"
                max={masterDuration || activeJob.masterAudio.duration || 100}
                step="0.05"
                value={isSeekingMaster ? masterSeekValue : masterCurrentTime}
                onPointerDown={() => setIsSeekingMaster(true)}
                onTouchStart={() => setIsSeekingMaster(true)}
                onChange={(e) => {
                  const val = parseFloat(e.target.value);
                  setMasterSeekValue(val);
                  setMasterCurrentTime(val);
                  if (masterAudioRef.current) {
                    const audio = masterAudioRef.current;
                    const masterUrl = activeJob?.masterAudio?.url;
                    if (
                      masterUrl &&
                      (!audio.src || !audio.src.includes(masterUrl))
                    ) {
                      audio.src = masterUrl;
                    }
                    try {
                      audio.currentTime = val;
                    } catch {}
                  }
                }}
                onPointerUp={(e) => {
                  setIsSeekingMaster(false);
                  const val = parseFloat(e.currentTarget.value);
                  handleSeekMaster(val);
                }}
                onTouchEnd={() => {
                  setIsSeekingMaster(false);
                  handleSeekMaster(masterSeekValue);
                }}
                className="w-full accent-amber-500 h-2.5 bg-slate-800 hover:bg-slate-750 rounded-lg cursor-pointer transition-all"
                title="Kéo hoặc nhấn vào thanh timeline để nghe ở bất kỳ vị trí nào"
              />
            </div>
            <div className="flex justify-between items-center text-xs font-mono text-slate-400">
              <span className="text-amber-400 font-bold">
                {formatSecondsDisplay(
                  isSeekingMaster ? masterSeekValue : masterCurrentTime,
                )}
              </span>
              <span className="text-slate-500 text-[11px] hidden sm:inline">
                💡 Kéo hoặc bấm thanh để tua tới bất kỳ vị trí nào
              </span>
              <span className="text-slate-300 font-semibold">
                {formatSecondsDisplay(
                  masterDuration || activeJob.masterAudio.duration,
                )}
              </span>
            </div>
          </div>
        </div>

        {/* Requirement 2: Hiển thị câu số mấy và nội dung câu đang phát */}
        {currentMasterItem?.item && (
          <div className="border border-amber-500/30 bg-gradient-to-r from-amber-500/10 via-slate-900/90 to-amber-500/5 rounded-xl p-3.5 sm:p-4 shadow-inner space-y-2">
            {/* Subtitle Status & Meta Bar */}
            <div className="flex flex-wrap items-center justify-between gap-2">
              <div className="flex items-center gap-2">
                <span className="px-2.5 py-1 rounded-lg bg-amber-500/20 text-amber-300 border border-amber-500/40 text-xs font-bold flex items-center gap-1.5 shadow-sm">
                  <Quote className="w-3.5 h-3.5 text-amber-400" />
                  <span>
                    Câu {currentMasterItem.item.index} /{" "}
                    {activeJob.items.length}
                  </span>
                </span>

                {currentMasterItem.isSilenceGap ? (
                  <span className="px-2 py-0.5 rounded text-[11px] font-medium bg-slate-800 text-slate-400 border border-slate-700">
                    {currentMasterItem.gapLabel}
                  </span>
                ) : (
                  <span className="px-2.5 py-0.5 rounded text-[11px] font-bold bg-emerald-500/20 text-emerald-300 border border-emerald-500/30 flex items-center gap-1.5 animate-pulse">
                    <Volume2 className="w-3.5 h-3.5 text-emerald-400" />
                    <span>Đang đọc</span>
                  </span>
                )}
              </div>

              <div className="flex items-center gap-2.5 text-xs font-mono text-slate-400">
                <span className="text-slate-300">
                  [{formatSecondsToSrtTime(currentMasterItem.item.startTime)} ➔{" "}
                  {formatSecondsToSrtTime(currentMasterItem.item.endTime)}]
                </span>
                {currentMasterItem.item.appliedSpeed && (
                  <span className="px-1.5 py-0.5 rounded bg-slate-800 text-amber-300 text-[10px] font-bold border border-amber-500/20">
                    {currentMasterItem.item.appliedSpeed.toFixed(2)}x
                  </span>
                )}
                <button
                  type="button"
                  onClick={() =>
                    handleSeekMaster(currentMasterItem.item.startTime, true)
                  }
                  className="px-2 py-0.5 rounded bg-slate-800 hover:bg-slate-700 text-amber-400 hover:text-amber-300 text-[11px] font-semibold border border-slate-700 transition-colors cursor-pointer"
                  title="Nghe lại câu này từ đầu"
                >
                  ↺ Phát lại câu
                </button>
                <button
                  type="button"
                  onClick={() =>
                    handleScrollToSentence(currentMasterItem.item.index)
                  }
                  className="text-amber-400 hover:text-amber-300 underline text-[11px] cursor-pointer"
                  title="Cuộn danh sách câu bên dưới đến câu này"
                >
                  Xem trong bảng ⬇
                </button>
              </div>
            </div>

            {/* Sentence Text Display */}
            <div className="pl-3 border-l-4 border-amber-500 bg-black/40 py-2.5 px-3 rounded-r-lg">
              <p className="text-sm sm:text-base font-semibold text-white tracking-wide leading-relaxed select-text">
                "{currentMasterItem.item.text}"
              </p>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
