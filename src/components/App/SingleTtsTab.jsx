import {
  Bookmark,
  Check,
  Copy,
  Download,
  Edit3,
  RefreshCw,
  Sparkles,
  UserCheck,
} from "lucide-react";

export default function SingleTtsTab({
  copiedSingleAudio,
  handleApplyPreset,
  handleCopySingleAudio,
  handleSingleSynthesize,
  projectPresets,
  selectedPresetId,
  selectedVoice,
  setShowPresetManagerModal,
  setShowVoiceModal,
  setSingleSilence,
  setSingleSpeed,
  setSingleText,
  singleAudioUrl,
  singleFormat,
  singleIsLoading,
  singleSilence,
  singleSpeed,
  singleText,
  voices,
}) {
  return (
    <div className="flex-1 min-h-0 w-full flex flex-col lg:flex-row items-stretch gap-0 overflow-hidden">
      <div className="flex-1 h-full overflow-y-auto p-4 border-r border-slate-800 bg-slate-900/30 space-y-4 rounded-none scrollbar-thin">
        <div className="flex items-center justify-between border-b border-slate-800 pb-2">
          <h2 className="text-sm font-bold text-white uppercase tracking-wider">
            Chuyển văn bản nhanh (Single TTS)
          </h2>
          <span className="text-xs text-slate-400 font-mono">
            {singleText.length} ký tự
          </span>
        </div>

        {/* Voice & Project Settings in Tab 2 */}
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 p-3 bg-slate-950/80 rounded-none border border-slate-800 text-xs">
          <div className="flex items-center gap-2.5">
            <div
              className={`w-7 h-7 rounded-none flex items-center justify-center font-bold text-[11px] shrink-0 ${
                selectedVoice.gender === "female"
                  ? "bg-rose-500/15 text-rose-300 border border-rose-500/30"
                  : "bg-sky-500/15 text-sky-300 border border-sky-500/30"
              }`}
            >
              {selectedVoice.gender === "female" ? "Nữ" : "Nam"}
            </div>
            <div>
              <div className="flex items-center gap-1.5">
                <span className="font-bold text-white">
                  {selectedVoice.name}
                </span>
                <span className="text-[10px] text-emerald-400 bg-emerald-500/15 px-1.5 py-0.2 rounded-none border border-emerald-500/30 font-medium">
                  Offline 100%
                </span>
              </div>
              <span className="text-[11px] text-slate-400 font-mono">
                {selectedVoice.tag}
              </span>
            </div>
          </div>

          <div className="flex items-center gap-2 flex-wrap">
            <div className="flex items-center gap-1.5 bg-slate-900 px-2 py-1 rounded-none border border-slate-800">
              <Bookmark className="w-3.5 h-3.5 text-amber-400 shrink-0" />
              <select
                value={selectedPresetId}
                onChange={(e) => handleApplyPreset(e.target.value)}
                className="bg-transparent text-xs text-slate-200 focus:outline-none cursor-pointer max-w-[150px] sm:max-w-[200px] truncate"
                title="Nạp cấu hình dự án (giọng + tốc độ)"
              >
                {projectPresets.map((p) => (
                  <option
                    key={p.id}
                    value={p.id}
                    className="bg-slate-900 text-white"
                  >
                    {p.isDefault ? "" : "★ "}
                    {p.name}
                  </option>
                ))}
              </select>
              <button
                type="button"
                onClick={() => setShowPresetManagerModal(true)}
                className="p-1 hover:bg-slate-800 text-slate-400 hover:text-amber-400 rounded-none transition-colors cursor-pointer"
                title="Quản lý cấu hình (Đổi tên, Xóa, Xuất/Nhập JSON)"
              >
                <Edit3 className="w-3 h-3" />
              </button>
            </div>

            <button
              type="button"
              onClick={() => setShowVoiceModal(true)}
              className="px-3 py-1.5 bg-slate-800 hover:bg-slate-700 text-amber-400 font-semibold rounded-none border border-slate-700 hover:border-amber-500/40 transition-colors flex items-center gap-1.5 self-start sm:self-auto cursor-pointer"
            >
              <UserCheck className="w-3.5 h-3.5" />
              <span>Đổi giọng đọc ({voices.length})</span>
            </button>
          </div>
        </div>

        <textarea
          value={singleText}
          onChange={(e) => setSingleText(e.target.value)}
          rows={5}
          placeholder="Nhập văn bản tiếng Việt..."
          className="w-full bg-slate-950 border border-slate-800 rounded-none p-4 text-sm text-slate-100 placeholder:text-slate-600 focus:outline-none focus:ring-1 focus:ring-amber-500 leading-relaxed font-sans"
        />

        <div className="grid grid-cols-1 sm:grid-cols-2 gap-4 text-xs">
          <div className="space-y-1">
            <div className="flex justify-between">
              <span className="text-slate-300">Tốc độ đọc:</span>
              <span className="text-amber-400 font-mono">
                {singleSpeed.toFixed(2)}x
              </span>
            </div>
            <input
              type="range"
              min="0.6"
              max="1.8"
              step="0.05"
              value={singleSpeed}
              onChange={(e) => setSingleSpeed(parseFloat(e.target.value))}
              className="w-full accent-amber-500 h-1.5 bg-slate-800 rounded-none cursor-pointer"
            />
          </div>

          <div className="space-y-1">
            <div className="flex justify-between">
              <span className="text-slate-300">Nghỉ ngắt câu:</span>
              <span className="text-amber-400 font-mono">
                {singleSilence.toFixed(2)}s
              </span>
            </div>
            <input
              type="range"
              min="0.0"
              max="1.0"
              step="0.05"
              value={singleSilence}
              onChange={(e) => setSingleSilence(parseFloat(e.target.value))}
              className="w-full accent-amber-500 h-1.5 bg-slate-800 rounded-none cursor-pointer"
            />
          </div>
        </div>

        <button
          type="button"
          disabled={singleIsLoading || !singleText.trim()}
          onClick={handleSingleSynthesize}
          className="w-full py-2.5 bg-amber-500 hover:bg-amber-400 text-slate-950 font-bold rounded-none text-xs flex items-center justify-center gap-2 disabled:opacity-50 cursor-pointer transition-colors"
        >
          {singleIsLoading ? (
            <>
              <RefreshCw className="w-4 h-4 animate-spin" />
              <span>Đang tạo âm thanh...</span>
            </>
          ) : (
            <>
              <Sparkles className="w-4 h-4" />
              <span>
                Tạo Giọng Đọc {selectedVoice.name} ({singleFormat.toUpperCase()}
                )
              </span>
            </>
          )}
        </button>

        {singleAudioUrl && (
          <div className="p-3 bg-slate-950 rounded-none border border-slate-800 flex flex-wrap items-center justify-between gap-3">
            <audio controls src={singleAudioUrl} className="h-8 w-64" />
            <div className="flex items-center gap-2">
              <button
                type="button"
                onClick={handleCopySingleAudio}
                className="px-3 py-1.5 bg-slate-800 hover:bg-slate-700 text-slate-200 hover:text-white font-semibold rounded-none text-xs flex items-center gap-1.5 border border-slate-700 cursor-pointer transition-colors"
                title="Sao chép file audio vào clipboard"
              >
                {copiedSingleAudio ? (
                  <>
                    <Check className="w-3.5 h-3.5 text-emerald-400 stroke-[3]" />
                    <span className="text-emerald-400 font-bold">Đã copy!</span>
                  </>
                ) : (
                  <>
                    <Copy className="w-3.5 h-3.5 text-amber-400" />
                    <span>Copy Audio</span>
                  </>
                )}
              </button>
              <a
                href={singleAudioUrl}
                download={`hoaimy-${Date.now()}.${singleFormat}`}
                className="px-3 py-1.5 bg-amber-500 hover:bg-amber-400 text-slate-950 font-semibold rounded-none text-xs flex items-center gap-1"
              >
                <Download className="w-3.5 h-3.5" />
                <span>Tải {singleFormat.toUpperCase()}</span>
              </a>
            </div>
          </div>
        )}
      </div>

      <div className="w-full lg:w-96 shrink-0 h-full overflow-y-auto p-4 bg-slate-900/60 border-l border-slate-800 space-y-3 text-xs text-slate-400 rounded-none scrollbar-thin">
        <h3 className="text-sm font-semibold text-white flex items-center justify-between">
          <span>Về Piper TTS Studio:</span>
          <span className="text-[11px] font-mono text-amber-400 font-semibold px-2 py-0.5 rounded-none bg-amber-500/10 border border-amber-500/20">
            {selectedVoice.name}
          </span>
        </h3>
        <p className="leading-relaxed">
          Piper TTS Studio chạy{" "}
          <span className="text-amber-300 font-semibold">100% Offline</span> với
          mô hình ONNX nội suy âm thanh chất lượng cao. Đang kích hoạt giọng{" "}
          <strong className="text-white">{selectedVoice.name}</strong> (
          {selectedVoice.gender === "female" ? "Nữ" : "Nam"},{" "}
          {selectedVoice.tag || "Tiếng Việt"}).
        </p>
        <div className="p-3 bg-slate-950 rounded-none border border-slate-800 text-[11px] space-y-1">
          <div className="text-slate-300 font-medium">
            Khả năng tự động đồng bộ:
          </div>
          <p>
            Khi dùng chế độ Phụ đề SRT, hệ thống tự động đo thời lượng câu và co
            giãn tốc độ (atempo) để khớp thời điểm bắt đầu và kết thúc của từng
            cảnh video.
          </p>
        </div>
      </div>
    </div>
  );
}
