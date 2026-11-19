import { BookOpen, CheckCircle2, Info, Plus, Trash2, X } from "lucide-react";
import { normalizeVietnameseText } from "../../utils/textNormalizer";

export default function PronunciationModal({
  customPronunciationRules,
  newRuleFrom,
  newRuleTo,
  normalizeNumbers,
  previewTestText,
  setCustomPronunciationRules,
  setNewRuleFrom,
  setNewRuleTo,
  setPreviewTestText,
  setShowPronunciationModal,
}) {
  return (
    <div className="fixed inset-0 z-50 bg-black/80 backdrop-blur-md flex items-center justify-center p-3 sm:p-4 animate-in fade-in duration-200">
      <div className="bg-slate-900 border border-slate-800 rounded-2xl max-w-2xl w-full max-h-[90vh] flex flex-col shadow-2xl overflow-hidden relative">
        {/* Header */}
        <div className="p-4 sm:px-6 bg-slate-950 border-b border-slate-800 flex items-center justify-between shrink-0">
          <div className="flex items-center gap-2.5">
            <div className="w-8 h-8 rounded-xl bg-amber-500 text-slate-950 flex items-center justify-center font-bold">
              <BookOpen className="w-4 h-4" />
            </div>
            <div>
              <h3 className="font-bold text-white text-base">
                Bộ Chuẩn Hóa Phát Âm & Từ Điển Tiếng Việt
              </h3>
              <p className="text-xs text-slate-400">
                Sửa phát âm số có dấu chấm, tiền tệ, phụ âm & từ ngữ tùy chỉnh
              </p>
            </div>
          </div>
          <button
            type="button"
            onClick={() => setShowPronunciationModal(false)}
            className="text-slate-400 hover:text-white p-1 rounded-lg hover:bg-slate-800 transition-colors cursor-pointer"
          >
            <X className="w-4 h-4" />
          </button>
        </div>

        {/* Content */}
        <div className="p-4 sm:p-6 overflow-y-auto space-y-5 text-xs text-slate-300">
          {/* Card 1: Số có chấm & tiền tệ */}
          <div className="p-3.5 bg-slate-950 rounded-xl border border-slate-800 space-y-2">
            <div className="flex items-center justify-between">
              <span className="font-bold text-white text-sm flex items-center gap-1.5">
                <CheckCircle2 className="w-4 h-4 text-emerald-400" />
                1. Tự động sửa số có dấu chấm hàng nghìn
              </span>
              <span className="px-2 py-0.5 rounded text-[10px] font-bold bg-emerald-500/15 text-emerald-300 border border-emerald-500/30">
                Đã tích hợp
              </span>
            </div>
            <p className="text-slate-400 leading-relaxed text-xs">
              Khi người dùng viết{" "}
              <code className="text-amber-400 font-mono bg-slate-900 px-1 py-0.5 rounded">
                5.000
              </code>
              , eSpeak-NG thường ngắt dấu chấm và phát âm thành{" "}
              <em>&ldquo;5 không không không&rdquo;</em>. Bộ chuẩn hóa tự động
              biến đổi thành{" "}
              <code className="text-emerald-400 font-mono bg-slate-900 px-1 py-0.5 rounded">
                5000
              </code>{" "}
              để Piper phát âm chuẩn <strong>&ldquo;năm nghìn&rdquo;</strong>.
            </p>
            <div className="grid grid-cols-2 sm:grid-cols-3 gap-2 pt-1 font-mono text-[11px]">
              <div className="p-2 bg-slate-900/80 rounded border border-slate-800 text-slate-300">
                <span className="text-rose-400 line-through">5.000</span> ➔{" "}
                <span className="text-emerald-400 font-bold">5000</span> (năm
                nghìn)
              </div>
              <div className="p-2 bg-slate-900/80 rounded border border-slate-800 text-slate-300">
                <span className="text-rose-400 line-through">5.000đ</span> ➔{" "}
                <span className="text-emerald-400 font-bold">5000 đồng</span>
              </div>
              <div className="p-2 bg-slate-900/80 rounded border border-slate-800 text-slate-300">
                <span className="text-rose-400 line-through">3.5</span> ➔{" "}
                <span className="text-emerald-400 font-bold">3 phẩy 5</span>
              </div>
            </div>
          </div>

          {/* Card 2: Phát âm chữ R của giọng Hoài My */}
          <div className="p-3.5 bg-slate-950 rounded-xl border border-slate-800 space-y-2">
            <div className="flex items-center justify-between">
              <span className="font-bold text-white text-sm flex items-center gap-1.5">
                <Info className="w-4 h-4 text-amber-400" />
                2. Về giọng Hoài My và phụ âm &ldquo;R&rdquo;
              </span>
              <span className="px-2 py-0.5 rounded text-[10px] font-bold bg-amber-500/15 text-amber-300 border border-amber-500/30">
                Đặc trưng thổ ngữ
              </span>
            </div>
            <p className="text-slate-400 leading-relaxed text-xs">
              Giọng Hoài My và các giọng nữ/nam miền Bắc được huấn luyện từ
              người bản xứ Hà Nội. Trong tiếng Bắc, phụ âm <strong>r</strong>,{" "}
              <strong>d</strong>, <strong>gi</strong> đồng âm /z/ (ví dụ{" "}
              <em>&ldquo;ra vào&rdquo;</em> đọc là <em>&ldquo;da vào&rdquo;</em>
              , <em>&ldquo;rất tốt&rdquo;</em> đọc là{" "}
              <em>&ldquo;dất tốt&rdquo;</em>).
            </p>
            <div className="p-2.5 bg-amber-500/10 border border-amber-500/20 rounded-lg text-amber-200 text-xs">
              💡 <strong>Gợi ý:</strong> Nếu bạn cần phát âm chuẩn chữ{" "}
              <strong>&ldquo;R&rdquo;</strong> uốn lưỡi / rung rõ ràng (không
              đọc thành &ldquo;d&rdquo;), hãy chọn giọng{" "}
              <strong>Việt Thảo (Miền Nam)</strong> hoặc{" "}
              <strong>CSA Voice</strong> trong danh sách giọng!
            </div>
          </div>

          {/* Card 3: Từ điển quy tắc thay thế tùy chỉnh */}
          <div className="space-y-3">
            <div className="flex items-center justify-between">
              <span className="font-bold text-white text-sm">
                3. Quy tắc từ điển thay thế tùy chỉnh (
                {customPronunciationRules.length})
              </span>
              <span className="text-[11px] text-slate-400">
                Tự động lưu vào cấu hình dự án
              </span>
            </div>

            {/* Form thêm quy tắc */}
            <div className="p-3 bg-slate-950 rounded-xl border border-slate-800 flex flex-col sm:flex-row items-center gap-2">
              <input
                type="text"
                value={newRuleFrom}
                onChange={(e) => setNewRuleFrom(e.target.value)}
                placeholder="Từ gốc (vd: 5.000, AI, USA...)"
                className="w-full sm:flex-1 bg-slate-900 border border-slate-700 rounded-lg px-3 py-1.5 text-xs text-white placeholder:text-slate-500 font-mono focus:ring-1 focus:ring-amber-500"
              />
              <span className="text-slate-500 font-bold shrink-0">➔</span>
              <input
                type="text"
                value={newRuleTo}
                onChange={(e) => setNewRuleTo(e.target.value)}
                placeholder="Thay bằng (vd: năm nghìn, trí tuệ nhân tạo, Mỹ...)"
                className="w-full sm:flex-1 bg-slate-900 border border-slate-700 rounded-lg px-3 py-1.5 text-xs text-white placeholder:text-slate-500 font-mono focus:ring-1 focus:ring-amber-500"
              />
              <button
                type="button"
                onClick={() => {
                  if (!newRuleFrom.trim()) return;
                  setCustomPronunciationRules((prev) => [
                    ...prev,
                    {
                      id: `rule-${Date.now()}`,
                      from: newRuleFrom.trim(),
                      to: newRuleTo.trim(),
                      active: true,
                    },
                  ]);
                  setNewRuleFrom("");
                  setNewRuleTo("");
                }}
                className="w-full sm:w-auto px-4 py-1.5 bg-amber-500 hover:bg-amber-400 text-slate-950 font-bold rounded-lg text-xs flex items-center justify-center gap-1 shrink-0 cursor-pointer"
              >
                <Plus className="w-3.5 h-3.5" />
                <span>Thêm</span>
              </button>
            </div>

            {/* Danh sách quy tắc */}
            {customPronunciationRules.length > 0 ? (
              <div className="max-h-40 overflow-y-auto space-y-1.5 pr-1">
                {customPronunciationRules.map((r) => (
                  <div
                    key={r.id}
                    className="p-2 bg-slate-950/80 rounded-lg border border-slate-800 flex items-center justify-between gap-2 text-xs font-mono"
                  >
                    <div className="flex items-center gap-2 truncate">
                      <input
                        type="checkbox"
                        checked={r.active}
                        onChange={(e) => {
                          const checked = e.target.checked;
                          setCustomPronunciationRules((prev) =>
                            prev.map((item) =>
                              item.id === r.id
                                ? { ...item, active: checked }
                                : item,
                            ),
                          );
                        }}
                        className="rounded border-slate-700 text-amber-500 focus:ring-amber-500 accent-amber-500"
                      />
                      <span
                        className={
                          r.active
                            ? "text-amber-300 font-semibold"
                            : "text-slate-500 line-through"
                        }
                      >
                        &ldquo;{r.from}&rdquo;
                      </span>
                      <span className="text-slate-500">➔</span>
                      <span
                        className={
                          r.active ? "text-emerald-300" : "text-slate-500"
                        }
                      >
                        &ldquo;{r.to}&rdquo;
                      </span>
                    </div>
                    <button
                      type="button"
                      onClick={() => {
                        setCustomPronunciationRules((prev) =>
                          prev.filter((item) => item.id !== r.id),
                        );
                      }}
                      className="text-slate-500 hover:text-rose-400 p-1 cursor-pointer"
                      title="Xóa quy tắc này"
                    >
                      <Trash2 className="w-3.5 h-3.5" />
                    </button>
                  </div>
                ))}
              </div>
            ) : (
              <p className="text-slate-500 italic text-[11px]">
                Chưa có quy tắc thay thế thủ công nào. Bạn có thể thêm bất kỳ từ
                ngữ nào muốn đổi cách đọc ở trên.
              </p>
            )}
          </div>

          {/* Live Preview Test Box */}
          <div className="p-3.5 bg-slate-950/90 rounded-xl border border-slate-800 space-y-2">
            <span className="font-bold text-slate-300 text-xs block">
              🔍 Thử nghiệm xem trước kết quả chuẩn hóa:
            </span>
            <input
              type="text"
              value={previewTestText}
              onChange={(e) => setPreviewTestText(e.target.value)}
              className="w-full bg-slate-900 border border-slate-700 rounded-lg px-3 py-1.5 text-xs text-white placeholder:text-slate-500 font-mono"
              placeholder="Nhập câu thử nghiệm (vd: 5.000đ, 3.5kg...)"
            />
            <div className="p-2.5 bg-slate-900 rounded-lg border border-slate-800 font-mono text-xs text-emerald-300">
              <span className="text-slate-500 text-[10px] block mb-0.5">
                Kết quả sau khi chuẩn hóa trước khi đưa vào PiperTTS:
              </span>
              {normalizeVietnameseText(previewTestText, {
                normalizeNumbers,
                customRules: customPronunciationRules.filter((r) => r.active),
              })}
            </div>
          </div>
        </div>

        {/* Footer */}
        <div className="p-4 bg-slate-950 border-t border-slate-800 flex justify-end">
          <button
            type="button"
            onClick={() => setShowPronunciationModal(false)}
            className="px-5 py-2 bg-amber-500 hover:bg-amber-400 text-slate-950 text-xs font-bold rounded-xl cursor-pointer shadow"
          >
            Lưu & Đóng
          </button>
        </div>
      </div>
    </div>
  );
}
