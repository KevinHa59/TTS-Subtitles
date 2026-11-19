import {
  Bookmark,
  Check,
  Download,
  Edit3,
  Save,
  Trash2,
  Upload,
  X,
} from "lucide-react";

export default function PresetManagerModal({
  editingPresetId,
  editingPresetName,
  handleApplyPreset,
  handleDeletePreset,
  handleExportPresets,
  handleImportPresetsFile,
  handleSaveRenamePreset,
  handleStartRenamePreset,
  importPresetsInputRef,
  projectPresets,
  selectedPresetId,
  setEditingPresetId,
  setEditingPresetName,
  setShowPresetManagerModal,
  setShowSavePresetModal,
  voices,
}) {
  return (
    <div className="fixed inset-0 z-50 bg-black/85 backdrop-blur-md flex items-center justify-center p-3 sm:p-6 animate-in fade-in duration-150">
      <div className="bg-slate-900 border border-slate-800 rounded-3xl max-w-4xl w-full max-h-[92vh] flex flex-col shadow-2xl overflow-hidden relative">
        {/* Header */}
        <div className="flex items-center justify-between gap-4 p-4 sm:p-6 border-b border-slate-800 bg-slate-950/70 shrink-0">
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 rounded-2xl bg-amber-500/15 text-amber-400 border border-amber-500/25 flex items-center justify-center font-bold shrink-0">
              <Bookmark className="w-5 h-5" />
            </div>
            <div>
              <h2 className="text-base sm:text-lg font-bold text-white tracking-tight flex items-center gap-2">
                <span>Quản Lý & Chỉnh Sửa Cấu Hình Dự Án</span>
                <span className="text-[11px] font-mono bg-slate-800 px-2 py-0.5 rounded text-amber-300 border border-slate-700">
                  {projectPresets.length} cấu hình
                </span>
              </h2>
              <p className="text-xs text-slate-400">
                Đổi tên, xóa cấu hình, xuất file JSON hoặc nhập cấu hình vào
                Studio
              </p>
            </div>
          </div>
          <button
            type="button"
            onClick={() => {
              setShowPresetManagerModal(false);
              setEditingPresetId(null);
            }}
            className="w-8 h-8 rounded-xl bg-slate-800 hover:bg-slate-700 text-slate-400 hover:text-white flex items-center justify-center transition-colors cursor-pointer"
            title="Đóng (ESC)"
          >
            <X className="w-4 h-4" />
          </button>
        </div>

        {/* Action Bar: Export & Import JSON (Requirement 2) */}
        <div className="px-4 py-3 sm:px-6 bg-slate-950/90 border-b border-slate-800 flex flex-wrap items-center justify-between gap-3 shrink-0">
          <div className="flex items-center gap-2 flex-wrap">
            {/* Export JSON Button */}
            <button
              type="button"
              onClick={handleExportPresets}
              className="px-3.5 py-2 bg-slate-800 hover:bg-slate-700 text-amber-300 hover:text-white text-xs font-semibold rounded-xl border border-slate-700 hover:border-amber-500/40 transition-colors flex items-center gap-1.5 cursor-pointer shadow-sm group"
              title="Xuất cấu hình thành tệp JSON tên 'tts_studio_project_settings.json'"
            >
              <Download className="w-3.5 h-3.5 text-amber-400 group-hover:scale-110 transition-transform" />
              <span>Xuất File JSON (tts_studio_project_settings.json)</span>
            </button>

            {/* Import JSON Button */}
            <button
              type="button"
              onClick={() => importPresetsInputRef.current?.click()}
              className="px-3.5 py-2 bg-slate-800 hover:bg-slate-700 text-slate-200 hover:text-white text-xs font-semibold rounded-xl border border-slate-700 hover:border-slate-600 transition-colors flex items-center gap-1.5 cursor-pointer shadow-sm group"
              title="Tải tệp JSON cấu hình từ máy tính vào studio"
            >
              <Upload className="w-3.5 h-3.5 text-slate-300 group-hover:scale-110 transition-transform" />
              <span>Nhập File JSON Vào Studio...</span>
            </button>
            <input
              ref={importPresetsInputRef}
              type="file"
              accept=".json,application/json"
              onChange={handleImportPresetsFile}
              className="hidden"
            />
          </div>

          {/* Add New Preset from Current Settings */}
          <button
            type="button"
            onClick={() => {
              setShowPresetManagerModal(false);
              setShowSavePresetModal(true);
            }}
            className="px-3.5 py-2 bg-amber-500 hover:bg-amber-400 text-slate-950 text-xs font-bold rounded-xl transition-all flex items-center gap-1.5 cursor-pointer shadow-md shadow-amber-500/20"
          >
            <Save className="w-3.5 h-3.5" />
            <span>+ Lưu cấu hình hiện tại</span>
          </button>
        </div>

        {/* Presets List */}
        <div className="flex-1 overflow-y-auto p-4 sm:p-6 space-y-3 max-h-[62vh]">
          <div className="space-y-2.5">
            {projectPresets.map((preset) => {
              const isSelected = preset.id === selectedPresetId;
              const isEditing = editingPresetId === preset.id;
              const voice = voices.find((v) => v.id === preset.voiceId);
              return (
                <div
                  key={preset.id}
                  className={`p-3.5 sm:p-4 rounded-2xl border transition-all ${
                    isSelected
                      ? "bg-amber-500/10 border-amber-500/40 ring-1 ring-amber-500/30"
                      : "bg-slate-950/60 border-slate-800 hover:border-slate-700"
                  }`}
                >
                  <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
                    {/* Left: Name or inline edit */}
                    <div className="flex-1 min-w-0 space-y-1">
                      {isEditing ? (
                        <div className="flex items-center gap-2 max-w-lg">
                          <input
                            type="text"
                            autoFocus
                            value={editingPresetName}
                            onChange={(e) =>
                              setEditingPresetName(e.target.value)
                            }
                            onKeyDown={(e) => {
                              if (e.key === "Enter")
                                handleSaveRenamePreset(preset.id);
                              if (e.key === "Escape") setEditingPresetId(null);
                            }}
                            className="flex-1 bg-slate-900 border border-amber-500 rounded-lg px-3 py-1.5 text-xs text-white focus:outline-none focus:ring-1 focus:ring-amber-500 font-medium"
                            placeholder="Nhập tên mới..."
                          />
                          <button
                            type="button"
                            onClick={() => handleSaveRenamePreset(preset.id)}
                            className="px-3 py-1.5 bg-amber-500 hover:bg-amber-400 text-slate-950 font-bold rounded-lg text-xs cursor-pointer shadow-sm"
                          >
                            Lưu
                          </button>
                          <button
                            type="button"
                            onClick={() => setEditingPresetId(null)}
                            className="px-2.5 py-1.5 bg-slate-800 text-slate-300 hover:text-white rounded-lg text-xs cursor-pointer"
                          >
                            Hủy
                          </button>
                        </div>
                      ) : (
                        <div className="flex items-center gap-2 flex-wrap">
                          <span className="font-bold text-white text-xs sm:text-sm">
                            {preset.name}
                          </span>
                          {preset.isDefault ? (
                            <span className="px-2 py-0.2 rounded text-[10px] font-semibold bg-slate-800 text-slate-400 border border-slate-700">
                              Mẫu chuẩn hệ thống
                            </span>
                          ) : (
                            <span className="px-2 py-0.2 rounded text-[10px] font-semibold bg-amber-500/20 text-amber-300 border border-amber-500/30">
                              Cá nhân
                            </span>
                          )}
                          {isSelected && (
                            <span className="px-2 py-0.2 rounded text-[10px] font-bold bg-emerald-500/20 text-emerald-300 border border-emerald-500/30 flex items-center gap-1">
                              <Check className="w-2.5 h-2.5" />
                              Đang kích hoạt
                            </span>
                          )}
                        </div>
                      )}

                      {/* Details Strip */}
                      <div className="text-[11px] text-slate-400 font-mono flex items-center gap-2 flex-wrap pt-0.5">
                        <span className="text-amber-400 font-semibold truncate max-w-[200px]">
                          {voice?.name || preset.voiceId}
                        </span>
                        <span>·</span>
                        <span className="text-emerald-400 font-semibold">
                          {preset.minSpeed.toFixed(2)}x -{" "}
                          {preset.maxSpeed.toFixed(2)}x
                        </span>
                        <span>·</span>
                        <span>
                          {preset.speedPriority === "strict"
                            ? "Ép timeline"
                            : preset.speedPriority === "natural"
                              ? "Tự nhiên"
                              : "Cân bằng"}
                        </span>
                        <span>·</span>
                        <span>
                          {preset.padSilence ? "Đệm silence" : "Không đệm"}
                        </span>
                        <span>·</span>
                        <span>
                          Batch{" "}
                          {preset.customBatchSize || preset.batchSizeChoice}
                        </span>
                        <span>·</span>
                        <span className="uppercase text-slate-300 bg-slate-900 px-1.5 py-0.2 rounded border border-slate-800">
                          {preset.outputFormat}
                        </span>
                      </div>
                    </div>

                    {/* Right: Actions (Dùng, Đổi tên, Xóa) */}
                    <div className="flex items-center gap-2 shrink-0 self-end sm:self-center">
                      {!isSelected ? (
                        <button
                          type="button"
                          onClick={() => {
                            handleApplyPreset(preset.id);
                          }}
                          className="px-3 py-1.5 bg-slate-800 hover:bg-slate-700 text-slate-200 hover:text-white rounded-xl text-xs font-semibold border border-slate-700 hover:border-amber-500/40 transition-colors cursor-pointer flex items-center gap-1"
                          title="Tự động nạp thông số cấu hình này vào Studio"
                        >
                          <Check className="w-3 h-3 text-amber-400" />
                          <span>Nạp cấu hình này</span>
                        </button>
                      ) : (
                        <span className="px-3 py-1.5 bg-emerald-500/15 text-emerald-300 border border-emerald-500/30 rounded-xl text-xs font-bold flex items-center gap-1">
                          <Check className="w-3 h-3" />
                          <span>Đang chọn</span>
                        </span>
                      )}

                      <button
                        type="button"
                        onClick={() => handleStartRenamePreset(preset)}
                        className="p-2 bg-slate-800 hover:bg-slate-700 text-slate-300 hover:text-white rounded-xl transition-colors border border-slate-700 cursor-pointer"
                        title="Đổi tên cấu hình này"
                      >
                        <Edit3 className="w-3.5 h-3.5" />
                      </button>

                      <button
                        type="button"
                        onClick={() => handleDeletePreset(preset.id)}
                        className="p-2 bg-rose-500/10 hover:bg-rose-500/20 text-rose-300 hover:text-rose-200 border border-rose-500/30 rounded-xl transition-colors cursor-pointer"
                        title="Xóa cấu hình này"
                      >
                        <Trash2 className="w-3.5 h-3.5" />
                      </button>
                    </div>
                  </div>
                </div>
              );
            })}
          </div>
        </div>

        {/* Footer */}
        <div className="p-4 sm:px-6 bg-slate-950/90 border-t border-slate-800 flex items-center justify-between text-xs text-slate-400 shrink-0">
          <div className="flex items-center gap-2">
            <span>File xuất mặc định:</span>
            <code className="text-amber-400 font-mono text-[11px] bg-slate-900 px-1.5 py-0.5 rounded border border-slate-800">
              tts_studio_project_settings.json
            </code>
          </div>
          <button
            type="button"
            onClick={() => {
              setShowPresetManagerModal(false);
              setEditingPresetId(null);
            }}
            className="px-5 py-2 bg-slate-800 hover:bg-slate-700 text-slate-200 text-xs font-semibold rounded-xl transition-colors cursor-pointer border border-slate-700"
          >
            Xong & Đóng
          </button>
        </div>
      </div>
    </div>
  );
}
