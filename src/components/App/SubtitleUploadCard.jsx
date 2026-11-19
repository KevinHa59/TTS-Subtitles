import { Eye, EyeOff, FileText, Upload, UploadCloud } from "lucide-react";
import {
  SAMPLE_DIALOGUE_SRT,
  SAMPLE_PROMPT_SRT,
  SAMPLE_TEST_50_SRT,
} from "../../utils/sampleData";

export default function SubtitleUploadCard({
  dragFeedback,
  fileInputRef,
  handleDragLeave,
  handleDragOver,
  handleDrop,
  handleFileUpload,
  isDragging,
  setActiveJob,
  setShowSrtEditor,
  setSrtRawText,
  setUploadedFileName,
  showSrtEditor,
  srtRawText,
  subtitles,
  uploadedFileName,
}) {
  return (
    <div className="p-3 bg-slate-900/20 space-y-3 rounded-none">
      <div className="flex items-center justify-between">
        <span className="text-xs font-semibold uppercase tracking-wider text-slate-400 flex items-center gap-1.5">
          <FileText className="w-4 h-4 text-amber-400" />
          Tải tệp phụ đề & Mẫu
        </span>
        <button
          type="button"
          onClick={() => fileInputRef.current?.click()}
          className="cursor-pointer inline-flex items-center gap-1.5 px-3 py-1 bg-amber-500 hover:bg-amber-400 text-slate-950 text-xs font-bold rounded-lg shadow transition-colors"
        >
          <Upload className="w-3.5 h-3.5" />
          <span>Chọn file</span>
        </button>
      </div>

      {/* Drag and Drop Zone */}
      <div
        onDragOver={handleDragOver}
        onDragLeave={handleDragLeave}
        onDrop={handleDrop}
        onClick={() => fileInputRef.current?.click()}
        className={`relative border-2 border-dashed rounded-xl p-4 text-center transition-all cursor-pointer select-none group ${
          isDragging
            ? "border-amber-400 bg-amber-500/15 scale-[1.01] shadow-lg shadow-amber-500/20 ring-2 ring-amber-400/40"
            : "border-slate-700 hover:border-amber-500/60 hover:bg-slate-950/70 bg-slate-950/40"
        }`}
      >
        <input
          ref={fileInputRef}
          type="file"
          accept=".srt,.txt"
          onChange={handleFileUpload}
          className="hidden"
        />
        <div className="flex flex-col items-center gap-1.5">
          <div
            className={`w-9 h-9 rounded-xl flex items-center justify-center transition-transform ${
              isDragging
                ? "bg-amber-500 text-slate-950 scale-110"
                : "bg-slate-800/80 text-amber-400 group-hover:scale-105"
            }`}
          >
            <UploadCloud className="w-5 h-5" />
          </div>
          <div className="text-xs font-semibold text-white">
            {isDragging
              ? "Thả file phụ đề vào đây..."
              : "Kéo thả file .SRT hoặc .TXT vào đây"}
          </div>
          <div className="text-[11px] text-slate-400">
            hoặc{" "}
            <span className="text-amber-400 underline font-medium">
              bấm để duyệt file từ máy
            </span>
          </div>
          {dragFeedback && (
            <div className="mt-1 text-[11px] text-emerald-300 font-medium px-2.5 py-0.5 bg-emerald-500/15 rounded-lg border border-emerald-500/30 animate-pulse">
              ✓ {dragFeedback}
            </div>
          )}
        </div>
      </div>

      {/* File status badge if loaded */}
      {uploadedFileName && (
        <div className="flex items-center justify-between p-2.5 bg-amber-500/10 border border-amber-500/25 rounded-xl text-xs">
          <div className="flex items-center gap-2 min-w-0">
            <FileText className="w-4 h-4 text-amber-400 shrink-0" />
            <span className="truncate text-slate-200 font-medium text-xs">
              {uploadedFileName}
            </span>
          </div>
          <span className="text-[11px] text-amber-300 font-mono font-bold bg-amber-500/20 px-2 py-0.5 rounded border border-amber-500/30 shrink-0">
            {subtitles.length} câu
          </span>
        </div>
      )}

      {/* Preset chips */}
      <div className="space-y-1.5">
        <span className="text-slate-400 text-[11px] block">
          Dữ liệu mẫu nhanh:
        </span>
        <div className="flex flex-wrap gap-1.5 text-xs">
          <button
            type="button"
            onClick={() => {
              setSrtRawText(SAMPLE_PROMPT_SRT);
              setUploadedFileName("Mẫu Prompt (2 câu)");
              setActiveJob(null);
            }}
            className="px-2.5 py-1 bg-slate-800 hover:bg-slate-700 text-slate-300 rounded-lg text-xs transition-colors border border-slate-700/60 cursor-pointer"
          >
            Prompt (2 câu)
          </button>
          <button
            type="button"
            onClick={() => {
              setSrtRawText(SAMPLE_DIALOGUE_SRT);
              setUploadedFileName("Hội thoại Phim (8 câu)");
              setActiveJob(null);
            }}
            className="px-2.5 py-1 bg-slate-800 hover:bg-slate-700 text-slate-300 rounded-lg text-xs transition-colors border border-slate-700/60 cursor-pointer"
          >
            Hội thoại Phim (8 câu)
          </button>
          <button
            type="button"
            onClick={() => {
              setSrtRawText(SAMPLE_TEST_50_SRT);
              setUploadedFileName("Bài giảng Test (50 câu)");
              setActiveJob(null);
            }}
            className="px-2.5 py-1 bg-amber-500/10 hover:bg-amber-500/20 text-amber-300 rounded-lg text-xs transition-colors border border-amber-500/30 font-medium cursor-pointer"
            title="Kiểm thử tải lớn 50 câu"
          >
            Bài giảng (50 câu)
          </button>
        </div>
      </div>

      <div className="pt-2 border-t border-slate-800/80 flex items-center justify-between text-xs text-slate-400">
        <span>
          Đã phân tích:{" "}
          <strong className="text-white">{subtitles.length}</strong> câu
        </span>
        <button
          type="button"
          onClick={() => setShowSrtEditor(!showSrtEditor)}
          className="text-amber-400 hover:text-amber-300 flex items-center gap-1 text-[11px] font-medium"
        >
          {showSrtEditor ? (
            <EyeOff className="w-3.5 h-3.5" />
          ) : (
            <Eye className="w-3.5 h-3.5" />
          )}
          <span>{showSrtEditor ? "Đóng xem SRT" : "Xem & Sửa SRT thô"}</span>
        </button>
      </div>

      {/* Optional Raw SRT Textarea editor */}
      {showSrtEditor && (
        <div className="pt-2 space-y-1">
          <textarea
            value={srtRawText}
            onChange={(e) => {
              setSrtRawText(e.target.value.normalize("NFC"));
              setActiveJob(null);
            }}
            rows={6}
            className="w-full bg-slate-950 border border-slate-800 rounded-xl p-2.5 font-mono text-[11px] text-slate-200 leading-relaxed focus:outline-none focus:ring-1 focus:ring-amber-500"
            placeholder="Nội dung phụ đề SRT..."
          />
          <span className="text-[10px] text-slate-400 block italic">
            Tự động chuẩn hóa Unicode NFC và phân tích timeline.
          </span>
        </div>
      )}
    </div>
  );
}
