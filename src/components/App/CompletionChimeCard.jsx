import { BellRing, Volume2 } from "lucide-react";
import { playAiStudioCompletionChime } from "../../utils/textNormalizer";

export default function CompletionChimeCard({
  setSoundNotificationEnabled,
  setSoundOnlyWhenUnfocused,
  soundNotificationEnabled,
  soundOnlyWhenUnfocused,
}) {
  return (
    <div className="bg-slate-900/30 p-3.5 space-y-3 text-xs rounded-none">
      <div className="flex items-center justify-between">
        <span className="font-semibold uppercase tracking-wider text-slate-400 flex items-center gap-1.5">
          <BellRing className="w-4 h-4 text-amber-400" />
          Âm Báo Hoàn Thành (AI Studio)
        </span>
        <button
          type="button"
          onClick={() => playAiStudioCompletionChime()}
          className="text-[10px] text-emerald-400 hover:text-emerald-300 font-semibold bg-emerald-500/10 hover:bg-emerald-500/20 px-2 py-0.5 rounded border border-emerald-500/30 flex items-center gap-1 transition-colors cursor-pointer"
          title="Bấm để nghe thử âm thanh chuông hoàn thành AI Studio"
        >
          <Volume2 className="w-3 h-3" />
          <span>Nghe thử âm báo</span>
        </button>
      </div>

      <div className="space-y-2">
        <label className="flex items-center justify-between p-2.5 bg-slate-950/80 rounded-none border border-slate-800 cursor-pointer hover:border-slate-700 transition-colors">
          <span className="text-slate-300 font-medium text-[11px]">
            Phát chuông khi xử lý xong phụ đề
          </span>
          <input
            type="checkbox"
            checked={soundNotificationEnabled}
            onChange={(e) => setSoundNotificationEnabled(e.target.checked)}
            className="rounded-none border-slate-700 text-amber-500 focus:ring-amber-500 accent-amber-500"
          />
        </label>

        {soundNotificationEnabled && (
          <label className="flex items-center justify-between p-2.5 bg-slate-950/60 rounded-none border border-slate-800/80 cursor-pointer hover:border-slate-700 transition-colors">
            <div className="space-y-0.5">
              <span className="text-slate-300 font-medium block text-[11px]">
                Chỉ phát khi không focus (ở tab khác)
              </span>
              <span className="text-[10px] text-slate-400 block">
                Tự động nhắc bạn quay lại khi phụ đề đã tạo xong
              </span>
            </div>
            <input
              type="checkbox"
              checked={soundOnlyWhenUnfocused}
              onChange={(e) => setSoundOnlyWhenUnfocused(e.target.checked)}
              className="rounded-none border-slate-700 text-amber-500 focus:ring-amber-500 accent-amber-500"
            />
          </label>
        )}
      </div>
    </div>
  );
}
