import {
  ArrowDown,
  ArrowUp,
  ArrowUpDown,
  Check,
  Pause,
  Play,
  Radio,
  RefreshCw,
  Search,
  Sparkles,
  UserCheck,
  X,
} from "lucide-react";

export default function VoiceModal({
  femaleVoicesCount,
  handleCloseVoiceModal,
  handlePreviewVoice,
  handleSelectVoice,
  handleToggleVoiceSort,
  maleVoicesCount,
  piperVoicesCount,
  previewLoadingVoiceId,
  previewVoiceId,
  recommendedVoicesCount,
  selectedVoice,
  selectedVoiceId,
  setVoiceGenderFilter,
  setVoiceSearchQuery,
  sortedVoices,
  vieneuVoicesCount,
  voiceGenderFilter,
  voiceSearchQuery,
  voiceSortOrder,
  voices,
}) {
  return (
    <div className="fixed inset-0 z-50 bg-black/80 backdrop-blur-md flex items-center justify-center p-2 sm:p-4 md:p-6 animate-in fade-in duration-200">
      <div className="bg-slate-900 border border-slate-800 rounded-2xl w-full max-w-[96vw] xl:max-w-7xl 2xl:max-w-[1440px] max-h-[92vh] flex flex-col shadow-2xl overflow-hidden relative">
        {/* Modal Header (Compact) */}
        <div className="flex items-center justify-between gap-3 px-4 py-3 sm:px-6 sm:py-3.5 border-b border-slate-800 bg-slate-950/70 shrink-0">
          <div className="flex items-center gap-2.5">
            <div className="w-8 h-8 rounded-xl bg-amber-500 text-slate-950 flex items-center justify-center font-black shadow-md shadow-amber-500/20 shrink-0">
              <Radio className="w-4 h-4" />
            </div>
            <div>
              <div className="flex items-center gap-2 flex-wrap">
                <h2 className="text-sm sm:text-base font-bold text-white tracking-tight">
                  Bảng Chọn Giọng Đọc Tiếng Việt
                </h2>
                <span className="px-2 py-0.2 rounded-full text-[11px] font-bold bg-amber-500/20 text-amber-300 border border-amber-500/30">
                  {voices.length} giọng Piper TTS
                </span>
                <span className="px-2 py-0.2 rounded-full text-[10px] font-bold bg-emerald-500/20 text-emerald-300 border border-emerald-500/30 flex items-center gap-1">
                  <span className="w-1.5 h-1.5 rounded-full bg-emerald-400 animate-pulse" />
                  100% Offline
                </span>
              </div>
              <p className="text-[11px] text-slate-400 hidden sm:block">
                Nghe thử giọng mẫu và chọn giọng phù hợp cho dự án phụ đề & lồng
                tiếng
              </p>
            </div>
          </div>

          <button
            type="button"
            onClick={handleCloseVoiceModal}
            className="w-8 h-8 rounded-lg bg-slate-800 hover:bg-slate-700 text-slate-400 hover:text-white flex items-center justify-center transition-colors cursor-pointer shrink-0 border border-slate-700/60"
            title="Đóng bảng chọn giọng đọc (ESC)"
          >
            <X className="w-4 h-4" />
          </button>
        </div>

        {/* Toolbar: Search input & Filter pills (Compact) */}
        <div className="px-4 py-2.5 sm:px-5 bg-slate-900 border-b border-slate-800 flex flex-col sm:flex-row items-stretch sm:items-center justify-between gap-2.5 shrink-0">
          {/* Search input */}
          <div className="relative flex-1 max-w-sm">
            <Search className="w-3.5 h-3.5 text-slate-400 absolute left-3 top-1/2 -translate-y-1/2 pointer-events-none" />
            <input
              type="text"
              value={voiceSearchQuery}
              onChange={(e) => setVoiceSearchQuery(e.target.value)}
              placeholder="Tìm theo tên giọng (Hoài My, Ban Mai...), tags..."
              className="w-full bg-slate-950 border border-slate-800 rounded-lg pl-8 pr-7 py-1.5 text-xs text-slate-100 placeholder:text-slate-500 focus:outline-none focus:ring-1 focus:ring-amber-500 focus:border-amber-500 transition-all font-medium"
            />
            {voiceSearchQuery && (
              <button
                type="button"
                onClick={() => setVoiceSearchQuery("")}
                className="absolute right-2.5 top-1/2 -translate-y-1/2 text-slate-400 hover:text-white text-xs cursor-pointer p-0.5"
              >
                ✕
              </button>
            )}
          </div>

          {/* Gender / Filter pills */}
          <div className="flex items-center gap-1.5 overflow-x-auto text-xs">
            <button
              type="button"
              onClick={() => setVoiceGenderFilter("all")}
              className={`px-2.5 py-1 rounded-lg font-semibold transition-all cursor-pointer text-xs ${
                voiceGenderFilter === "all"
                  ? "bg-amber-500 text-slate-950 font-bold shadow-sm shadow-amber-500/20"
                  : "bg-slate-800 text-slate-300 hover:text-white hover:bg-slate-700 border border-slate-700/60"
              }`}
            >
              Tất cả ({voices.length})
            </button>
            <button
              type="button"
              onClick={() => setVoiceGenderFilter("vieneu")}
              className={`px-2.5 py-1 rounded-lg font-semibold transition-all cursor-pointer flex items-center gap-1 text-xs ${
                voiceGenderFilter === "vieneu"
                  ? "bg-purple-600 text-white font-bold shadow-sm shadow-purple-600/30"
                  : "bg-slate-800 text-slate-300 hover:text-white hover:bg-slate-700 border border-slate-700/60"
              }`}
            >
              <span className="w-1.5 h-1.5 rounded-full bg-purple-400" />
              <span>VieNeu Turbo ({vieneuVoicesCount})</span>
            </button>
            <button
              type="button"
              onClick={() => setVoiceGenderFilter("piper")}
              className={`px-2.5 py-1 rounded-lg font-semibold transition-all cursor-pointer flex items-center gap-1 text-xs ${
                voiceGenderFilter === "piper"
                  ? "bg-sky-600 text-white font-bold shadow-sm shadow-sky-600/30"
                  : "bg-slate-800 text-slate-300 hover:text-white hover:bg-slate-700 border border-slate-700/60"
              }`}
            >
              <span className="w-1.5 h-1.5 rounded-full bg-sky-400" />
              <span>Piper ({piperVoicesCount})</span>
            </button>
            <button
              type="button"
              onClick={() => setVoiceGenderFilter("female")}
              className={`px-2.5 py-1 rounded-lg font-semibold transition-all cursor-pointer flex items-center gap-1 text-xs ${
                voiceGenderFilter === "female"
                  ? "bg-rose-500 text-white font-bold shadow-sm shadow-rose-500/20"
                  : "bg-slate-800 text-slate-300 hover:text-white hover:bg-slate-700 border border-slate-700/60"
              }`}
            >
              <span className="w-1.5 h-1.5 rounded-full bg-rose-400" />
              <span>Nữ ({femaleVoicesCount})</span>
            </button>
            <button
              type="button"
              onClick={() => setVoiceGenderFilter("male")}
              className={`px-2.5 py-1 rounded-lg font-semibold transition-all cursor-pointer flex items-center gap-1 text-xs ${
                voiceGenderFilter === "male"
                  ? "bg-sky-500 text-slate-950 font-bold shadow-sm shadow-sky-500/20"
                  : "bg-slate-800 text-slate-300 hover:text-white hover:bg-slate-700 border border-slate-700/60"
              }`}
            >
              <span className="w-1.5 h-1.5 rounded-full bg-sky-400" />
              <span>Nam ({maleVoicesCount})</span>
            </button>
            <button
              type="button"
              onClick={() => setVoiceGenderFilter("recommended")}
              className={`px-2.5 py-1 rounded-lg font-semibold transition-all cursor-pointer flex items-center gap-1 text-xs ${
                voiceGenderFilter === "recommended"
                  ? "bg-amber-400 text-slate-950 font-bold shadow-sm shadow-amber-400/20"
                  : "bg-slate-800 text-slate-300 hover:text-white hover:bg-slate-700 border border-slate-700/60"
              }`}
            >
              <Sparkles className="w-3 h-3 text-amber-400" />
              <span>Khuyên dùng ({recommendedVoicesCount})</span>
            </button>
          </div>
        </div>

        {/* Table Area (Compact single-line rows: Hiển thị 12-16 giọng cùng lúc, chỉ Tên, Giới tính, Tags, Nghe thử, Chọn dùng) */}
        <div className="flex-1 overflow-x-auto overflow-y-auto max-h-[70vh] p-1 sm:p-3 bg-slate-950/40 scrollbar-thin">
          <table className="w-full text-left text-xs border-collapse">
            <thead className="sticky top-0 z-20 bg-slate-950 shadow-sm">
              <tr className="bg-slate-950 text-slate-400 border-b border-slate-800 text-[11px] font-mono">
                <th
                  onClick={handleToggleVoiceSort}
                  className="py-2.5 px-4 sm:w-[38%] min-w-[200px] cursor-pointer hover:text-amber-300 transition-colors select-none group"
                  title="Nhấn để sắp xếp danh sách giọng theo Tên (A-Z hoặc Z-A)"
                >
                  <div className="flex items-center gap-2">
                    <span className="font-semibold text-slate-300 group-hover:text-amber-300">
                      Tên giọng đọc
                    </span>
                    {voiceSortOrder === "asc" ? (
                      <span className="inline-flex items-center gap-1 text-[10px] font-bold text-amber-400 bg-amber-500/20 px-1.5 py-0.5 rounded border border-amber-500/30">
                        <ArrowUp className="w-3 h-3" />
                        <span>A ➔ Z</span>
                      </span>
                    ) : voiceSortOrder === "desc" ? (
                      <span className="inline-flex items-center gap-1 text-[10px] font-bold text-amber-400 bg-amber-500/20 px-1.5 py-0.5 rounded border border-amber-500/30">
                        <ArrowDown className="w-3 h-3" />
                        <span>Z ➔ A</span>
                      </span>
                    ) : (
                      <span className="inline-flex items-center gap-1 text-slate-500 group-hover:text-amber-400 transition-colors text-[10px]">
                        <ArrowUpDown className="w-3 h-3" />
                        <span className="hidden sm:inline">Sắp xếp</span>
                      </span>
                    )}
                  </div>
                </th>
                <th className="py-2.5 px-4 w-28 text-center">Giới tính</th>
                <th className="py-2.5 px-4 sm:w-[28%] min-w-[150px]">
                  Tags / Phân loại
                </th>
                <th className="py-2.5 px-4 w-32 text-center">Nghe thử</th>
                <th className="py-2.5 px-4 w-32 text-center">Chọn dùng</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-800/60">
              {sortedVoices.length === 0 ? (
                <tr>
                  <td
                    colSpan={5}
                    className="py-8 text-center text-slate-500 italic"
                  >
                    Không tìm thấy giọng đọc nào phù hợp với bộ lọc tìm kiếm.
                  </td>
                </tr>
              ) : (
                sortedVoices.map((v) => {
                  const isCurrent = v.id === selectedVoiceId;
                  const isPreviewing = previewVoiceId === v.id;
                  const isLoadingPreview = previewLoadingVoiceId === v.id;
                  const isVieNeu =
                    v.id.startsWith("vieneu:") || v.engine === "vieneu";
                  return (
                    <tr
                      key={v.id}
                      className={`hover:bg-slate-800/50 transition-colors h-10 ${isCurrent ? "bg-amber-500/10" : ""}`}
                    >
                      {/* 1. Cột Tên: Tên + Badges */}
                      <td className="py-1.5 px-4 whitespace-nowrap">
                        <div className="flex items-center gap-2">
                          <span
                            className={`font-semibold text-xs sm:text-[13px] truncate max-w-[340px] sm:max-w-none ${
                              isCurrent
                                ? "text-amber-300 font-bold"
                                : "text-slate-100"
                            }`}
                          >
                            {v.name}
                          </span>
                          {isVieNeu ? (
                            <span className="px-1.5 py-0.2 rounded text-[9px] font-bold bg-purple-500/20 text-purple-300 border border-purple-500/30 shrink-0">
                              VieNeu 48kHz
                            </span>
                          ) : (
                            <span className="px-1.5 py-0.2 rounded text-[9px] font-bold bg-sky-500/15 text-sky-300 border border-sky-500/25 shrink-0">
                              Piper
                            </span>
                          )}
                          {v.recommended && (
                            <span className="px-1.5 py-0.2 rounded text-[9px] font-bold bg-amber-500/20 text-amber-300 border border-amber-500/30 shrink-0">
                              Khuyên dùng
                            </span>
                          )}
                          {v.hasLocalFile === false && isVieNeu && (
                            <span
                              className="px-1.5 py-0.2 rounded text-[9px] font-medium bg-amber-500/15 text-amber-300 border border-amber-500/30 shrink-0"
                              title="Cần đặt file mô hình vào models/vieneu/. Xem chi tiết trong file HD-VIENEU-TTS.md"
                            >
                              Cần tải model
                            </span>
                          )}
                          {isCurrent && (
                            <span className="px-1.5 py-0.2 rounded text-[9px] font-bold bg-emerald-500/20 text-emerald-300 border border-emerald-500/30 flex items-center gap-1 shrink-0">
                              <Check className="w-2.5 h-2.5" />
                              Đang chọn
                            </span>
                          )}
                        </div>
                      </td>

                      {/* 2. Cột Giới tính (Gọn gàng) */}
                      <td className="py-1.5 px-4 text-center whitespace-nowrap">
                        <span
                          className={`inline-flex items-center gap-1 px-2.5 py-0.5 rounded text-[11px] font-semibold ${
                            v.gender === "female"
                              ? "bg-rose-500/15 text-rose-300 border border-rose-500/25"
                              : "bg-sky-500/15 text-sky-300 border border-sky-500/25"
                          }`}
                        >
                          <span
                            className={`w-1.5 h-1.5 rounded-full ${
                              v.gender === "female"
                                ? "bg-rose-400"
                                : "bg-sky-400"
                            }`}
                          />
                          <span>{v.gender === "female" ? "Nữ" : "Nam"}</span>
                        </span>
                      </td>

                      {/* 3. Cột Tag (Gọn gàng, bỏ ID) */}
                      <td className="py-1.5 px-4 whitespace-nowrap">
                        <span className="inline-block px-2.5 py-0.5 rounded text-[11px] font-mono font-medium bg-slate-900 text-slate-300 border border-slate-800">
                          {v.tag}
                        </span>
                      </td>

                      {/* 4. Cột Nghe thử (Bỏ câu text) */}
                      <td className="py-1.5 px-4 text-center whitespace-nowrap">
                        <button
                          type="button"
                          onClick={() => handlePreviewVoice(v)}
                          disabled={isLoadingPreview}
                          className={`inline-flex items-center gap-1 px-3 py-1 rounded-lg text-xs font-semibold transition-all cursor-pointer ${
                            isPreviewing
                              ? "bg-amber-500 text-slate-950 font-bold shadow-sm shadow-amber-500/30 ring-1 ring-amber-400"
                              : "bg-slate-800 hover:bg-slate-700 text-slate-200 hover:text-white border border-slate-700 hover:border-amber-500/40"
                          }`}
                          title={
                            isPreviewing
                              ? "Dừng phát"
                              : "Nghe thử câu thoại mẫu"
                          }
                        >
                          {isLoadingPreview ? (
                            <>
                              <RefreshCw className="w-3 h-3 animate-spin text-amber-400" />
                              <span>Đang tạo...</span>
                            </>
                          ) : isPreviewing ? (
                            <>
                              <Pause className="w-3 h-3 fill-current text-slate-950" />
                              <span>Dừng</span>
                            </>
                          ) : (
                            <>
                              <Play className="w-3 h-3 fill-current text-amber-400 ml-0.5" />
                              <span>Nghe thử</span>
                            </>
                          )}
                        </button>
                      </td>

                      {/* 5. Cột Chọn dùng */}
                      <td className="py-1.5 px-4 text-center whitespace-nowrap">
                        {isCurrent ? (
                          <span className="inline-flex items-center gap-1 px-3 py-1 rounded-lg text-xs font-bold bg-emerald-500/20 text-emerald-300 border border-emerald-500/40 shadow-sm">
                            <Check className="w-3 h-3" />
                            <span>Đang Dùng</span>
                          </span>
                        ) : (
                          <button
                            type="button"
                            onClick={() => handleSelectVoice(v.id)}
                            className="inline-flex items-center gap-1 px-3 py-1 rounded-lg text-xs font-bold bg-amber-500 hover:bg-amber-400 text-slate-950 transition-all cursor-pointer shadow-sm shadow-amber-500/20 active:scale-95"
                          >
                            <UserCheck className="w-3 h-3" />
                            <span>Chọn dùng</span>
                          </button>
                        )}
                      </td>
                    </tr>
                  );
                })
              )}
            </tbody>
          </table>
        </div>

        {/* Modal Footer (Compact) */}
        <div className="flex flex-col sm:flex-row items-center justify-between gap-3 px-4 py-2.5 sm:px-5 bg-slate-950/80 border-t border-slate-800 shrink-0">
          <div className="flex items-center gap-2 text-xs">
            <span className="text-slate-400">Giọng đang chọn:</span>
            <span className="font-bold text-amber-400">
              {selectedVoice.name}
            </span>
            <span className="text-slate-500 font-mono">
              ({selectedVoice.tag})
            </span>
          </div>

          <button
            type="button"
            onClick={handleCloseVoiceModal}
            className="px-4 py-1.5 bg-slate-800 hover:bg-slate-700 text-slate-200 text-xs font-semibold rounded-lg transition-colors cursor-pointer border border-slate-700"
          >
            Xác nhận & Đóng
          </button>
        </div>
      </div>
    </div>
  );
}
