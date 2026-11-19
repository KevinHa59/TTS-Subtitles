import { Bookmark, Save, X } from "lucide-react";

export default function SavePresetModal({
  effectiveBatchSize,
  handleSaveCurrentAsPreset,
  maxSpeed,
  minSpeed,
  newPresetName,
  outputFormat,
  padSilence,
  selectedVoice,
  setNewPresetName,
  setShowSavePresetModal,
  speedPriority,
}) {
  return (
    <div className="fixed inset-0 z-50 bg-black/80 backdrop-blur-md flex items-center justify-center p-4 animate-in fade-in duration-150">
      <div className="bg-slate-900 border border-slate-800 rounded-3xl max-w-md w-full p-6 space-y-5 shadow-2xl relative">
        <div className="flex items-start justify-between gap-3">
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 rounded-2xl bg-amber-500/15 text-amber-400 border border-amber-500/25 flex items-center justify-center font-bold">
              <Bookmark className="w-5 h-5" />
            </div>
            <div>
              <h3 className="text-base font-bold text-white tracking-tight">
                Lưu Cấu Hình Dự Án Mới
              </h3>
              <p className="text-xs text-slate-400">
                Lưu lại giọng đọc, tốc độ & timeline để tự động điền lần sau
              </p>
            </div>
          </div>
          <button
            type="button"
            onClick={() => {
              setShowSavePresetModal(false);
              setNewPresetName("");
            }}
            className="w-8 h-8 rounded-xl bg-slate-800 hover:bg-slate-700 text-slate-400 hover:text-white flex items-center justify-center transition-colors cursor-pointer"
            title="Đóng modal"
          >
            <X className="w-4 h-4" />
          </button>
        </div>

        {/* Form Input */}
        <form
          onSubmit={(e) => {
            e.preventDefault();
            handleSaveCurrentAsPreset(newPresetName);
          }}
          className="space-y-4"
        >
          <div>
            <label className="block text-xs font-semibold text-slate-300 mb-1.5">
              Đặt tên cấu hình dự án:
            </label>
            <input
              type="text"
              autoFocus
              value={newPresetName}
              onChange={(e) => setNewPresetName(e.target.value)}
              placeholder="Ví dụ: Phim Hành Động 1.35x, Truyện Ma Đêm Khuya..."
              className="w-full bg-slate-950 border border-slate-700 focus:border-amber-500 focus:ring-2 focus:ring-amber-500/40 rounded-xl px-3.5 py-2.5 text-xs text-white placeholder:text-slate-500 focus:outline-none transition-all font-medium"
            />
          </div>

          {/* Preview of current settings that will be saved */}
          <div className="p-3.5 bg-slate-950/80 border border-slate-800 rounded-xl space-y-2 text-xs">
            <div className="text-[11px] font-semibold text-slate-400 uppercase tracking-wider flex items-center justify-between">
              <span>Thông số sẽ lưu vào cấu hình này:</span>
              <span className="text-[10px] text-amber-400 font-mono">
                Tự động nạp
              </span>
            </div>
            <div className="space-y-1.5 text-[11px] font-mono">
              <div className="flex items-center justify-between text-slate-200">
                <span className="text-slate-400">Giọng đọc:</span>
                <span className="font-bold text-amber-400 truncate max-w-[200px]">
                  {selectedVoice.name}
                </span>
              </div>
              <div className="flex items-center justify-between text-slate-200">
                <span className="text-slate-400">Dải tốc độ:</span>
                <span className="text-emerald-400 font-bold">
                  {minSpeed.toFixed(2)}x - {maxSpeed.toFixed(2)}x
                </span>
              </div>
              <div className="flex items-center justify-between text-slate-200">
                <span className="text-slate-400">Ưu tiên timeline:</span>
                <span className="text-slate-300">
                  {speedPriority === "strict"
                    ? "Ép chặt timeline"
                    : speedPriority === "natural"
                      ? "Tự nhiên"
                      : "Cân bằng"}
                </span>
              </div>
              <div className="flex items-center justify-between text-slate-200">
                <span className="text-slate-400">Đệm khoảng lặng:</span>
                <span className="text-slate-300">
                  {padSilence ? "Bật đệm" : "Tắt"}
                </span>
              </div>
              <div className="flex items-center justify-between text-slate-200">
                <span className="text-slate-400">Xử lý song song:</span>
                <span className="text-slate-300">
                  Batch {effectiveBatchSize} câu/lần
                </span>
              </div>
              <div className="flex items-center justify-between text-slate-200">
                <span className="text-slate-400">Định dạng file:</span>
                <span className="text-slate-300 uppercase">{outputFormat}</span>
              </div>
            </div>
          </div>

          <div className="flex items-center justify-end gap-2 pt-2">
            <button
              type="button"
              onClick={() => {
                setShowSavePresetModal(false);
                setNewPresetName("");
              }}
              className="px-4 py-2 bg-slate-800 hover:bg-slate-700 text-slate-300 rounded-xl text-xs font-semibold transition-colors cursor-pointer"
            >
              Hủy bỏ
            </button>
            <button
              type="submit"
              disabled={!newPresetName.trim()}
              className="px-5 py-2 bg-amber-500 hover:bg-amber-400 disabled:opacity-50 text-slate-950 rounded-xl text-xs font-bold transition-all cursor-pointer shadow-lg shadow-amber-500/20 flex items-center gap-1.5"
            >
              <Save className="w-3.5 h-3.5" />
              <span>Lưu Cấu Hình Dự Án</span>
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}
