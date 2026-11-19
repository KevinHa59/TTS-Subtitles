import {
  AlertTriangle,
  CheckCircle2,
  Pause,
  Play,
  Radio,
  RefreshCw,
  UserCheck,
} from "lucide-react";

export default function VoiceSelectCard({
  espeakStatus,
  handlePreviewVoice,
  previewLoadingVoiceId,
  previewVoiceId,
  selectedVoice,
  setShowVoiceModal,
  voices,
}) {
  return (
    <div className="p-3 bg-slate-900/20 space-y-3 rounded-none">
      <div className="flex items-center justify-between">
        <span className="text-xs font-semibold uppercase tracking-wider text-slate-400 flex items-center gap-1.5">
          <Radio className="w-4 h-4 text-amber-400" />
          Giọng đọc chính thức
        </span>
        <span className="text-[11px] text-amber-400 font-medium bg-amber-400/10 px-2 py-0.5 rounded border border-amber-400/20 font-mono">
          {voices.length} giọng có sẵn
        </span>
      </div>

      {/* Selected Voice Showcase Box */}
      <div className="p-3 bg-gradient-to-br from-slate-950 via-slate-950 to-amber-950/20 border border-slate-800/90 rounded-xl space-y-2.5">
        <div className="flex items-start justify-between gap-2">
          <div className="flex items-center gap-2.5">
            <div
              className={`w-9 h-9 rounded-xl flex items-center justify-center font-bold text-xs shrink-0 shadow-md ${
                selectedVoice.gender === "female"
                  ? "bg-rose-500/15 text-rose-300 border border-rose-500/30"
                  : "bg-sky-500/15 text-sky-300 border border-sky-500/30"
              }`}
            >
              {selectedVoice.gender === "female" ? "Nữ" : "Nam"}
            </div>
            <div>
              <div className="flex items-center gap-1.5 flex-wrap">
                <span className="text-sm font-bold text-white tracking-tight">
                  {selectedVoice.name}
                </span>
                {selectedVoice.recommended && (
                  <span className="px-1.5 py-0.2 rounded text-[9px] font-bold bg-amber-500/20 text-amber-300 border border-amber-500/30">
                    Khuyên dùng
                  </span>
                )}
              </div>
              <span className="text-[11px] text-slate-400 block font-mono">
                {selectedVoice.tag}
              </span>
            </div>
          </div>
        </div>

        <p className="text-[11px] text-slate-400 leading-relaxed border-t border-slate-800/80 pt-2 line-clamp-2">
          {selectedVoice.description}
        </p>

        {/* Quick Preview Audio of Selected Voice */}
        <button
          type="button"
          onClick={() => handlePreviewVoice(selectedVoice)}
          disabled={previewLoadingVoiceId === selectedVoice.id}
          className={`w-full py-2 px-3 rounded-xl text-xs font-semibold flex items-center justify-center gap-2 transition-all cursor-pointer border ${
            previewVoiceId === selectedVoice.id
              ? "bg-amber-500 text-slate-950 font-bold border-amber-400 shadow-md shadow-amber-500/25"
              : "bg-slate-950/80 hover:bg-slate-800 text-slate-300 hover:text-white border-slate-800 hover:border-slate-700"
          }`}
          title="Nghe câu thoại mẫu của giọng đọc này"
        >
          {previewLoadingVoiceId === selectedVoice.id ? (
            <>
              <RefreshCw className="w-3.5 h-3.5 animate-spin text-amber-400" />
              <span>Đang nạp âm mẫu...</span>
            </>
          ) : previewVoiceId === selectedVoice.id ? (
            <>
              <Pause className="w-3.5 h-3.5 fill-current" />
              <span>Dừng nghe thử</span>
              <span className="flex items-center gap-0.5 ml-1">
                <span className="w-1 h-3 bg-slate-950 animate-pulse" />
                <span className="w-1 h-2 bg-slate-950 animate-pulse delay-75" />
                <span className="w-1 h-3.5 bg-slate-950 animate-pulse delay-150" />
              </span>
            </>
          ) : (
            <>
              <Play className="w-3.5 h-3.5 fill-current text-amber-400" />
              <span>Nghe thử giọng này</span>
            </>
          )}
        </button>
      </div>

      {/* Primary Action Button: Open Voice Selection Table Panel */}
      <button
        type="button"
        onClick={() => setShowVoiceModal(true)}
        className="w-full py-2.5 px-4 bg-gradient-to-r from-amber-500 via-amber-400 to-amber-500 hover:from-amber-400 hover:to-amber-300 text-slate-950 font-black rounded-xl text-xs shadow-lg shadow-amber-500/20 active:scale-95 flex items-center justify-center gap-2 transition-all cursor-pointer"
      >
        <UserCheck className="w-4 h-4 text-slate-950" />
        <span>Mở Bảng Chọn Giọng Đọc ({voices.length} giọng)</span>
      </button>

      {/* eSpeak-NG Vietnamese Accent Health Status */}
      {espeakStatus?.available ? (
        <div className="p-2.5 bg-emerald-500/10 border border-emerald-500/20 rounded-xl text-[11px] text-emerald-300 flex items-center gap-2">
          <CheckCircle2 className="w-4 h-4 shrink-0 text-emerald-400" />
          <span>eSpeak NG: Đã kết nối (Phát âm chuẩn tiếng Việt có dấu).</span>
        </div>
      ) : (
        <div className="p-2.5 bg-amber-500/10 border border-amber-500/30 rounded-xl text-[11px] text-amber-300 space-y-1">
          <div className="flex items-center gap-1.5 font-semibold text-amber-400">
            <AlertTriangle className="w-3.5 h-3.5 shrink-0" />
            <span>eSpeak NG: Chưa phát hiện trên hệ thống</span>
          </div>
          <p className="text-[10px] text-amber-200/90 leading-relaxed">
            Để đọc chuẩn tiếng Việt có dấu khi chạy local, hãy chạy file{" "}
            <code className="text-white font-mono bg-slate-950 px-1 py-0.5 rounded">
              Setup.bat
            </code>{" "}
            hoặc cài đặt qua lệnh{" "}
            <code className="text-white font-mono bg-slate-950 px-1 py-0.5 rounded">
              winget install eSpeak-NG.eSpeak-NG
            </code>
            .
          </p>
        </div>
      )}
    </div>
  );
}
