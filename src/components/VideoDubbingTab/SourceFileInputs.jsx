import {
  CheckCircle2,
  FileText,
  Film,
  HardDrive,
  LoaderCircle,
  Trash2,
} from "lucide-react";

export default function SourceFileInputs({
  clearSelectedFiles,
  handleSrtChange,
  handleSrtFile,
  handleVideoChange,
  handleVideoFile,
  isBusy,
  openSrtBrowser,
  setFileDetailsOpen,
  srt,
  video,
  videoInputRef,
}) {
  return (
    <div className="hidden grid-cols-1 gap-3 md:grid-cols-3">
      <input
        type="file"
        accept=".mp4,.mkv,.mov,.avi,.webm,video/mp4,video/x-matroska,video/quicktime,video/x-msvideo,video/webm"
        onChange={handleVideoChange}
        className="hidden"
        aria-label="Chọn video nguồn"
      />
      <div
        role="button"
        tabIndex={0}
        onClick={() => !isBusy && videoInputRef.current?.click()}
        onKeyDown={(event) => {
          if (!isBusy && (event.key === "Enter" || event.key === " ")) {
            event.preventDefault();
            videoInputRef.current?.click();
          }
        }}
        onDragOver={(event) => event.preventDefault()}
        onDrop={(event) => {
          event.preventDefault();
          const file = event.dataTransfer.files[0];
          if (!isBusy && file) handleVideoFile(file);
        }}
        className={`flex min-h-24 cursor-pointer items-center gap-3 rounded-xl border border-dashed px-4 py-3 transition-colors ${
          isBusy
            ? "cursor-wait border-amber-500/30 bg-slate-950/40"
            : "border-slate-700 bg-slate-900/80 hover:border-amber-500/50 hover:bg-slate-900"
        }`}
        aria-label="Thả video vào đây hoặc chọn video"
      >
        <Film className="h-5 w-5 shrink-0 text-amber-400" />
        <span className="min-w-0">
          <span className="block truncate text-sm font-semibold text-white">
            {video?.fileName || "Chọn hoặc thả video"}
          </span>
          {!video && (
            <span className="mt-1 block text-xs text-slate-500">
              MP4 · MKV · MOV · AVI · WebM
            </span>
          )}
        </span>
        {isBusy && (
          <LoaderCircle className="ml-auto h-4 w-4 shrink-0 animate-spin text-amber-300" />
        )}
      </div>

      <input
        type="file"
        accept=".srt,application/x-subrip"
        onChange={(event) => void handleSrtChange(event)}
        className="hidden"
        aria-label="Chọn phụ đề SRT"
      />
      <div
        role="button"
        tabIndex={0}
        onClick={() => openSrtBrowser()}
        onKeyDown={(event) => {
          if (event.key === "Enter" || event.key === " ") {
            event.preventDefault();
            openSrtBrowser();
          }
        }}
        onDragOver={(event) => event.preventDefault()}
        onDrop={(event) => {
          event.preventDefault();
          const file = event.dataTransfer.files[0];
          if (file) void handleSrtFile(file);
        }}
        className="flex min-h-24 cursor-pointer items-center gap-3 rounded-xl border border-dashed border-slate-700 bg-slate-900/80 px-4 py-3 transition-colors hover:border-amber-500/50 hover:bg-slate-900"
        aria-label="Thả phụ đề SRT vào đây hoặc chọn phụ đề"
      >
        <FileText className="h-5 w-5 shrink-0 text-amber-400" />
        <span className="min-w-0">
          <span className="block truncate text-sm font-semibold text-white">
            {srt?.fileName || "Chọn hoặc thả phụ đề SRT"}
          </span>
          {!srt && (
            <span className="mt-1 block text-xs text-slate-500">
              Chỉ hỗ trợ .SRT
            </span>
          )}
        </span>
        {srt && !srt.error && (
          <CheckCircle2 className="ml-auto h-4 w-4 shrink-0 text-emerald-400" />
        )}
      </div>

      <div className="flex min-h-24 items-center justify-center gap-2 rounded-xl border border-slate-800 bg-slate-900/80 p-3">
        <button
          type="button"
          onClick={() => setFileDetailsOpen(true)}
          disabled={!video && !srt}
          className="inline-flex items-center gap-1.5 rounded-lg border border-slate-700 bg-slate-950/70 px-3 py-2 text-xs font-semibold text-slate-200 hover:border-amber-500/40 hover:text-white disabled:cursor-not-allowed disabled:opacity-40"
        >
          <HardDrive className="h-3.5 w-3.5" />
          Details
        </button>
        <button
          type="button"
          onClick={() => void clearSelectedFiles()}
          disabled={(!video && !srt) || (isBusy && !video)}
          className="inline-flex items-center gap-1.5 rounded-lg border border-rose-500/25 bg-rose-950/20 px-3 py-2 text-xs font-semibold text-rose-200 hover:border-rose-400/50 hover:bg-rose-950/40 disabled:cursor-not-allowed disabled:opacity-40"
        >
          <Trash2 className="h-3.5 w-3.5" />
          Xóa
        </button>
      </div>
    </div>
  );
}
