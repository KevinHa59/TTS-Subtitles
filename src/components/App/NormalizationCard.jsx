import { BookOpen, Sliders } from "lucide-react";

export default function NormalizationCard({
  customPronunciationRules,
  normalizeNumbers,
  setNormalizeNumbers,
  setShowPronunciationModal,
}) {
  return (
    <div className="p-3 bg-slate-900/20 space-y-3 text-xs rounded-none">
      <div className="flex items-center justify-between">
        <span className="font-semibold uppercase tracking-wider text-slate-400 flex items-center gap-1.5">
          <BookOpen className="w-4 h-4 text-amber-400" />
          Chuẩn Hóa & Sửa Phát Âm
        </span>
        <button
          type="button"
          onClick={() => setShowPronunciationModal(true)}
          className="text-[10px] text-amber-400 hover:text-amber-300 font-semibold bg-amber-400/10 hover:bg-amber-400/20 px-2 py-0.5 rounded border border-amber-400/30 flex items-center gap-1 transition-colors cursor-pointer"
          title="Mở từ điển tùy chỉnh phát âm và hướng dẫn phụ âm R"
        >
          <Sliders className="w-3 h-3" />
          <span>Từ điển ({customPronunciationRules.length})</span>
        </button>
      </div>

      {/* Toggle: Sửa số có chấm hàng nghìn */}
      <label className="flex items-start gap-2.5 p-2.5 bg-slate-950/80 rounded-xl border border-slate-800 cursor-pointer hover:border-slate-700 transition-colors">
        <input
          type="checkbox"
          checked={normalizeNumbers}
          onChange={(e) => setNormalizeNumbers(e.target.checked)}
          className="mt-0.5 rounded border-slate-700 text-amber-500 focus:ring-amber-500 accent-amber-500"
        />
        <div className="space-y-0.5">
          <span className="text-slate-200 font-semibold block text-[11px]">
            Tự động sửa số có dấu chấm (5.000 ➔ 5000)
          </span>
          <p className="text-[10px] text-slate-400 leading-relaxed">
            Sửa lỗi &ldquo;5.000&rdquo; bị đọc thành &ldquo;5 không không
            không&rdquo;, đọc đúng &ldquo;năm nghìn&rdquo;, số thập phân (3.5 ➔
            3 phẩy 5) và tiền tệ (5.000đ ➔ 5000 đồng).
          </p>
        </div>
      </label>

      {/* Quick Pronunciation Note on Hoài My & letter R */}
      <div className="p-2.5 bg-slate-950/50 rounded-xl border border-slate-800/80 text-[11px] text-slate-400 space-y-1">
        <div className="flex items-center justify-between text-slate-300 font-medium">
          <span>Phát âm chữ &ldquo;R&rdquo; (Giọng Hoài My):</span>
          <span className="text-[10px] text-amber-400">Giọng Bắc</span>
        </div>
        <p className="text-[10px] leading-relaxed">
          Giọng Hoài My nói tiếng Hà Nội nên các âm &ldquo;r/d/gi&rdquo; tự
          nhiên đồng âm. Để đọc chuẩn &ldquo;R&rdquo; rung uốn lưỡi, hãy chọn
          giọng <strong>Việt Thảo (Miền Nam)</strong> hoặc mở{" "}
          <strong>Từ điển</strong> để thay thế.
        </p>
      </div>
    </div>
  );
}
