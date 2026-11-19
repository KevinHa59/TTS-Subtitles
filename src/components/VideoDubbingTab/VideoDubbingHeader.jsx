import { Film } from "lucide-react";

export default function VideoDubbingHeader({
  autoPipelineTtsMasterEnabled,
  setAutoPipelineTtsMasterEnabled,
}) {
  return (
    <header className="h-10 sm:h-11 px-3 shrink-0 flex items-center justify-between border-b border-slate-800 bg-slate-900/95 rounded-none xl:col-span-2 xl:row-start-1 select-none">
      <div className="flex items-center gap-2.5">
        <div className="w-6 h-6 rounded-none bg-amber-500/15 text-amber-400 border border-amber-500/25 flex items-center justify-center font-bold text-xs">
          <Film className="w-3.5 h-3.5" />
        </div>
        <div className="flex items-center gap-2">
          <h2 className="text-xs sm:text-sm font-bold text-white uppercase tracking-tight">
            Video Dubbing
          </h2>
          <span className="text-[10px] text-slate-400 hidden sm:inline font-mono">
            · Pipeline Đồng Bộ Phụ Đề
          </span>
        </div>
        <label className="flex items-center gap-2 ml-3 text-[11px] text-slate-300 cursor-pointer">
          <input
            type="checkbox"
            checked={autoPipelineTtsMasterEnabled}
            onChange={(event) =>
              setAutoPipelineTtsMasterEnabled(event.target.checked)
            }
            className="accent-indigo-400"
          />
          <span className="font-semibold text-slate-200">
            Tạo TTS Master trong Auto Pipeline
          </span>
        </label>
      </div>
      <span className="px-2 py-0.5 rounded-none text-[10px] font-bold uppercase tracking-wide bg-slate-800 text-slate-300 border border-slate-700">
        Piper & VieNeu Turbo · Demucs
      </span>
    </header>
  );
}
