import { Check, Sliders, X } from "lucide-react";

export default function ThemeModal({
  setShowThemeModal,
  setTheme,
  theme,
  themes,
}) {
  return (
    <div className="fixed inset-0 z-50 bg-black/80 flex items-center justify-center p-4">
      <div className="bg-slate-900 border border-slate-800 rounded-none w-full max-w-md shadow-2xl overflow-hidden flex flex-col">
        <div className="flex items-center justify-between px-4 py-3 border-b border-slate-800 bg-slate-950/80">
          <div className="flex items-center gap-2">
            <Sliders className="w-4 h-4 text-amber-400" />
            <h3 className="text-sm font-bold text-white uppercase tracking-wider">
              Cài Đặt Giao Diện (Theme)
            </h3>
          </div>
          <button
            type="button"
            onClick={() => setShowThemeModal(false)}
            className="text-slate-400 hover:text-white p-1 rounded-none cursor-pointer"
          >
            <X className="w-4 h-4" />
          </button>
        </div>
        <div className="p-4 space-y-2.5">
          <p className="text-xs text-slate-400 leading-relaxed">
            Chọn phong cách giao diện Desktop phù hợp với không gian làm việc
            của bạn:
          </p>
          <div className="space-y-1.5 pt-1">
            {themes.map((t) => (
              <button
                key={t.id}
                type="button"
                onClick={() => {
                  setTheme(t.id);
                  setShowThemeModal(false);
                }}
                className={`w-full p-3 rounded-none border text-left flex items-start justify-between gap-3 transition-colors cursor-pointer ${
                  theme === t.id
                    ? "bg-amber-500/10 border-amber-500/50 text-white"
                    : "bg-slate-950/60 border-slate-800 text-slate-300 hover:bg-slate-800/60 hover:text-white"
                }`}
              >
                <div className="flex items-start gap-3">
                  <div
                    className="w-5 h-5 rounded-none border border-slate-700 shrink-0 mt-0.5"
                    style={{ backgroundColor: t.colorPreview }}
                  />
                  <div>
                    <div className="text-xs font-bold text-white flex items-center gap-1.5">
                      <span>{t.name}</span>
                      {theme === t.id && (
                        <span className="text-[10px] text-amber-400 font-mono bg-amber-500/20 px-1 rounded-none">
                          Đang dùng
                        </span>
                      )}
                    </div>
                    <p className="text-[11px] text-slate-400 mt-0.5 leading-snug">
                      {t.description}
                    </p>
                  </div>
                </div>
                {theme === t.id && (
                  <Check className="w-4 h-4 text-amber-400 shrink-0 mt-0.5" />
                )}
              </button>
            ))}
          </div>
        </div>
        <div className="px-4 py-2.5 border-t border-slate-800 bg-slate-950/50 flex justify-end">
          <button
            type="button"
            onClick={() => setShowThemeModal(false)}
            className="px-4 py-1.5 bg-slate-800 hover:bg-slate-700 text-slate-200 text-xs font-semibold rounded-none border border-slate-700 cursor-pointer"
          >
            Đóng
          </button>
        </div>
      </div>
    </div>
  );
}
