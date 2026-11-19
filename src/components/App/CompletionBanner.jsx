import { CheckCircle2, Play, X } from "lucide-react";

export default function CompletionBanner({
  handlePlayMasterAudio,
  lastCompletedJobInfo,
  setShowCompletionBanner,
  subtitles,
}) {
  return (
    <aside
      role="status"
      aria-live="polite"
      aria-label="Thông báo hoàn tất xử lý phụ đề"
      className="fixed top-20 right-4 sm:right-6 z-50 max-w-sm sm:max-w-md w-full bg-slate-900/95 backdrop-blur-xl border border-amber-500/50 rounded-2xl p-4 shadow-2xl shadow-black/80 space-y-3 animate-in fade-in slide-in-from-top-3 duration-300 ring-1 ring-amber-500/20"
    >
      <div className="flex items-start justify-between gap-3">
        <div className="flex items-center gap-2.5">
          <div className="w-9 h-9 rounded-xl bg-emerald-500/20 text-emerald-400 border border-emerald-500/30 flex items-center justify-center shrink-0 shadow-md shadow-emerald-500/20">
            <CheckCircle2 className="w-5 h-5 animate-pulse" />
          </div>
          <div>
            <h4 className="text-xs sm:text-sm font-bold text-white tracking-tight flex items-center gap-1.5">
              <span>Hoàn tất xử lý phụ đề!</span>
              <span className="text-[10px] font-mono px-1.5 py-0.2 rounded bg-emerald-500/20 text-emerald-300 border border-emerald-500/40">
                100%
              </span>
            </h4>
            <p className="text-[11px] text-slate-400 mt-0.5">
              Đã tạo xong {lastCompletedJobInfo?.count || subtitles.length} câu
              thoại. File Master Audio đã sẵn sàng.
            </p>
          </div>
        </div>
        <button
          type="button"
          onClick={() => setShowCompletionBanner(false)}
          className="text-slate-400 hover:text-white p-1 rounded-lg hover:bg-slate-800 transition-colors cursor-pointer"
          title="Đóng thông báo"
        >
          <X className="w-4 h-4" />
        </button>
      </div>

      <div className="flex items-center gap-2 pt-1 border-t border-slate-800">
        <button
          type="button"
          onClick={() => {
            handlePlayMasterAudio();
            setShowCompletionBanner(false);
          }}
          className="flex-1 py-2 px-3 bg-amber-500 hover:bg-amber-400 text-slate-950 font-bold rounded-xl text-xs flex items-center justify-center gap-1.5 shadow-md shadow-amber-500/20 transition-all cursor-pointer"
        >
          <Play className="w-3.5 h-3.5 fill-current" />
          <span>Nghe Master Audio ngay</span>
        </button>
        <button
          type="button"
          onClick={() => setShowCompletionBanner(false)}
          className="py-2 px-3 bg-slate-800 hover:bg-slate-700 text-slate-300 hover:text-white rounded-xl text-xs font-semibold transition-colors cursor-pointer border border-slate-700"
        >
          Đóng
        </button>
      </div>
    </aside>
  );
}
