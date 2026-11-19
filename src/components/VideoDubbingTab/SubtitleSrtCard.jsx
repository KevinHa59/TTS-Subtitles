import { AlertCircle, FileText, Trash2, Upload } from "lucide-react";
import { formatSecondsToSrtTime } from "../../utils/srtParser";
import { formatFileSize } from "./helpers";

export default function SubtitleSrtCard({
  clearSrt,
  handleSrtChange,
  job,
  masterGeneration,
  openSrtBrowser,
  srt,
}) {
  return (
    <section className="rounded-2xl border border-slate-800 bg-slate-900/80 p-4 sm:p-5 space-y-4">
      <div className="flex items-center justify-between gap-3">
        <div className="flex items-center gap-2">
          <FileText className="w-4 h-4 text-amber-400" />
          <h3 className="font-semibold text-white">Phụ đề SRT</h3>
        </div>
        {srt && (
          <button
            type="button"
            onClick={clearSrt}
            className="inline-flex items-center gap-1.5 rounded-lg border border-slate-700 bg-slate-950/70 px-2.5 py-1.5 text-xs text-slate-300 hover:text-white hover:border-slate-500 transition-colors"
          >
            <Trash2 className="w-3.5 h-3.5" />
            Bỏ SRT
          </button>
        )}
      </div>

      <input
        type="file"
        accept=".srt,application/x-subrip"
        onChange={(event) => void handleSrtChange(event)}
        className="hidden"
      />
      {!srt ? (
        <button
          type="button"
          onClick={() => openSrtBrowser()}
          className="w-full min-h-40 flex flex-col items-center justify-center gap-2 rounded-xl border border-dashed border-slate-700 bg-slate-950/50 text-slate-300 hover:border-amber-500/50 hover:bg-slate-950 transition-colors"
        >
          <Upload className="w-6 h-6 text-amber-400" />
          <span className="text-sm font-semibold">Chọn tệp phụ đề</span>
          <span className="text-xs text-slate-500">
            Chỉ hỗ trợ định dạng .SRT
          </span>
        </button>
      ) : (
        <div className="rounded-xl border border-slate-800 bg-slate-950/70 p-3.5">
          <div className="flex items-start gap-3">
            <div className="w-9 h-9 rounded-lg bg-slate-800 text-amber-300 flex items-center justify-center shrink-0">
              <FileText className="w-4 h-4" />
            </div>
            <div className="min-w-0 flex-1">
              <p className="text-sm font-semibold text-white break-all">
                {srt.fileName}
              </p>
              <p className="text-xs text-slate-400 mt-1">
                {formatFileSize(srt.sizeBytes)}
              </p>
            </div>
          </div>

          {srt.error ? (
            <div className="mt-3 flex items-start gap-2 rounded-lg border border-rose-500/30 bg-rose-950/40 p-3 text-xs text-rose-200">
              <AlertCircle className="w-4 h-4 shrink-0 text-rose-400" />
              <span>{srt.error}</span>
            </div>
          ) : srt.analysis ? (
            <div className="grid grid-cols-1 sm:grid-cols-3 gap-2 mt-4">
              <div className="rounded-xl border border-slate-800 bg-slate-900/70 p-3">
                <p className="text-[11px] text-slate-400">Subtitle hợp lệ</p>
                <p className="mt-1 text-sm font-bold text-emerald-300">
                  {srt.analysis.subtitleCount}
                </p>
              </div>
              <div className="rounded-xl border border-slate-800 bg-slate-900/70 p-3">
                <p className="text-[11px] text-slate-400">Bắt đầu sớm nhất</p>
                <p className="mt-1 text-sm font-bold text-white">
                  {formatSecondsToSrtTime(srt.analysis.earliestStart)}
                </p>
              </div>
              <div className="rounded-xl border border-slate-800 bg-slate-900/70 p-3">
                <p className="text-[11px] text-slate-400">Kết thúc muộn nhất</p>
                <p className="mt-1 text-sm font-bold text-white">
                  {formatSecondsToSrtTime(srt.analysis.latestEnd)}
                </p>
              </div>
              {srt.analysis.invalidBlockCount > 0 && (
                <div className="sm:col-span-3 flex items-start gap-2 rounded-lg border border-amber-500/30 bg-amber-950/30 p-3 text-xs text-amber-200">
                  <AlertCircle className="w-4 h-4 shrink-0 text-amber-400" />
                  <span>
                    Bỏ qua {srt.analysis.invalidBlockCount} block không hợp lệ
                    trong phần thống kê. Nội dung tệp không bị thay đổi.
                  </span>
                </div>
              )}
            </div>
          ) : null}
        </div>
      )}
      <p className="text-[11px] leading-relaxed text-slate-500">
        SRT được phân tích trong trình duyệt. Khi lưu cấu hình hoặc chạy Auto
        Pipeline, các cue được gửi tới backend cục bộ và lưu trong metadata job
        để có thể tiếp tục sau khi mở lại ứng dụng; dữ liệu không được gửi lên
        cloud.
      </p>
      {job && !srt && masterGeneration?.status !== "completed" && (
        <p className="text-[11px] leading-relaxed text-amber-300">
          File SRT không được lưu trong lịch sử job. Hãy chọn lại SRT nếu cần
          tạo TTS Master cho job này.
        </p>
      )}
    </section>
  );
}
