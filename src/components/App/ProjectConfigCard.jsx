import {
  Bookmark,
  BookmarkCheck,
  Check,
  Edit3,
  FileJson,
  Save,
  Trash2,
} from "lucide-react";

export default function ProjectConfigCard({
  effectiveBatchSize,
  handleApplyPreset,
  handleDeletePreset,
  handleUpdateCurrentPreset,
  maxSpeed,
  minSpeed,
  outputFormat,
  presetFeedback,
  projectPresets,
  selectedPreset,
  selectedPresetId,
  selectedVoice,
  setShowPresetManagerModal,
  setShowSavePresetModal,
  speedPriority,
}) {
  return (
    <div className="p-3 bg-slate-900/20 space-y-2.5 rounded-none">
      <div className="flex items-center justify-between">
        <span className="text-xs font-semibold uppercase tracking-wider text-slate-400 flex items-center gap-1.5">
          <Bookmark className="w-4 h-4 text-amber-400" />
          Cấu hình Dự án
        </span>
        <button
          type="button"
          onClick={() => setShowPresetManagerModal(true)}
          className="text-[10px] text-amber-400 hover:text-amber-300 font-semibold bg-amber-400/10 hover:bg-amber-400/20 px-2 py-0.5 rounded border border-amber-400/30 flex items-center gap-1 transition-colors cursor-pointer"
          title="Mở bảng quản lý, đổi tên, xóa, xuất JSON & nhập JSON"
        >
          <Edit3 className="w-3 h-3" />
          <span>Quản lý</span>
        </button>
      </div>

      {/* Dropdown Selector */}
      <div className="space-y-1.5">
        <div className="flex items-center justify-between text-[11px] text-slate-300">
          <span className="font-medium">Chọn cấu hình lưu sẵn:</span>
          <span className="text-[10px] text-slate-400 font-mono">
            {selectedPreset?.isDefault ? "Mẫu chuẩn" : "Cá nhân"}
          </span>
        </div>
        <select
          value={selectedPresetId}
          onChange={(e) => handleApplyPreset(e.target.value)}
          className="w-full bg-slate-950 border border-slate-700/80 hover:border-amber-500/60 rounded-xl p-2.5 text-xs text-slate-100 font-medium focus:ring-2 focus:ring-amber-500/40 focus:outline-none transition-colors cursor-pointer"
        >
          <optgroup label="── Cấu hình mẫu hệ thống ──">
            {projectPresets
              .filter((p) => p.isDefault)
              .map((p) => (
                <option key={p.id} value={p.id}>
                  {p.name}
                </option>
              ))}
          </optgroup>
          {projectPresets.some((p) => !p.isDefault) && (
            <optgroup label="── Cấu hình cá nhân của bạn ──">
              {projectPresets
                .filter((p) => !p.isDefault)
                .map((p) => (
                  <option key={p.id} value={p.id}>
                    ★ {p.name}
                  </option>
                ))}
            </optgroup>
          )}
        </select>
      </div>

      {/* Preset Summary Strip */}
      <div className="p-2.5 bg-slate-950/70 border border-slate-800/80 rounded-xl text-[11px] space-y-1 font-mono">
        <div className="flex items-center justify-between text-slate-300">
          <span className="truncate font-semibold text-amber-400">
            {selectedVoice.name}
          </span>
          <span className="text-[10px] bg-slate-800 px-1.5 py-0.2 rounded text-slate-300 uppercase">
            {outputFormat}
          </span>
        </div>
        <div className="flex items-center justify-between text-[10px] text-slate-400 pt-1 border-t border-slate-900">
          <span>
            Tốc độ: {minSpeed.toFixed(2)}x - {maxSpeed.toFixed(2)}x
          </span>
          <span>Batch: {effectiveBatchSize}</span>
          <span>
            {speedPriority === "strict"
              ? "Timeline"
              : speedPriority === "natural"
                ? "Tự nhiên"
                : "Cân bằng"}
          </span>
        </div>
      </div>

      {/* Preset Action Buttons */}
      <div className="space-y-2 pt-0.5">
        <div className="flex items-center gap-2">
          <button
            type="button"
            onClick={() => setShowSavePresetModal(true)}
            className="flex-1 py-1.5 px-3 bg-amber-500/10 hover:bg-amber-500/20 text-amber-300 border border-amber-500/30 rounded-xl text-xs font-semibold flex items-center justify-center gap-1.5 transition-colors cursor-pointer"
            title="Lưu lại cấu hình giọng đọc, tốc độ và timeline hiện tại thành cấu hình dự án mới"
          >
            <Save className="w-3.5 h-3.5 text-amber-400" />
            <span>Lưu mới...</span>
          </button>

          {!selectedPreset?.isDefault && (
            <>
              <button
                type="button"
                onClick={handleUpdateCurrentPreset}
                className="py-1.5 px-2.5 bg-emerald-500/10 hover:bg-emerald-500/20 text-emerald-300 border border-emerald-500/30 rounded-xl text-xs font-semibold flex items-center justify-center gap-1 transition-colors cursor-pointer"
                title="Cập nhật thông số hiện tại vào cấu hình cá nhân này"
              >
                <BookmarkCheck className="w-3.5 h-3.5 text-emerald-400" />
                <span>Lưu đè</span>
              </button>
              <button
                type="button"
                onClick={() => handleDeletePreset(selectedPresetId)}
                className="p-1.5 bg-rose-500/10 hover:bg-rose-500/20 text-rose-300 border border-rose-500/30 rounded-xl transition-colors cursor-pointer"
                title="Xóa cấu hình cá nhân này"
              >
                <Trash2 className="w-3.5 h-3.5" />
              </button>
            </>
          )}
        </div>

        <button
          type="button"
          onClick={() => setShowPresetManagerModal(true)}
          className="w-full py-1.5 px-3 bg-slate-950/70 hover:bg-slate-800 text-slate-300 hover:text-white border border-slate-800 hover:border-slate-700 rounded-xl text-xs font-medium flex items-center justify-center gap-1.5 transition-colors cursor-pointer"
          title="Mở panel chỉnh sửa, đổi tên, xóa, xuất JSON (tts_studio_project_settings.json) & nhập JSON"
        >
          <FileJson className="w-3.5 h-3.5 text-amber-400" />
          <span>Quản lý / Đổi tên / Xuất & Nhập JSON</span>
        </button>
      </div>

      {presetFeedback && (
        <div className="text-[11px] text-emerald-300 font-medium px-2.5 py-1 bg-emerald-500/15 rounded-xl border border-emerald-500/30 animate-in fade-in flex items-center gap-1.5">
          <Check className="w-3 h-3 text-emerald-400 shrink-0" />
          <span>{presetFeedback}</span>
        </div>
      )}
    </div>
  );
}
