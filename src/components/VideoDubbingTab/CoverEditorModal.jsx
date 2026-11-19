import { LoaderCircle, Upload } from "lucide-react";

export default function CoverEditorModal({
  chooseCoverFile,
  confirmCoverEditor,
  coverEditorBusy,
  coverEditorDragOver,
  coverEditorError,
  coverEditorFile,
  coverEditorFrameCount,
  coverEditorInputRef,
  coverEditorPreviewUrl,
  coverEditorTarget,
  removeCoverFromEditor,
  setCoverEditorDragOver,
  setCoverEditorError,
  setCoverEditorFile,
  setCoverEditorFrameCount,
  setCoverEditorTarget,
}) {
  return (
    <div
      className="fixed inset-0 z-[60] flex items-center justify-center bg-black/75 p-3 sm:p-6"
      role="presentation"
      onMouseDown={(event) => {
        if (event.target === event.currentTarget && !coverEditorBusy) {
          setCoverEditorTarget(null);
          setCoverEditorFile(null);
          setCoverEditorError(null);
        }
      }}
    >
      <section
        role="dialog"
        aria-modal="true"
        aria-labelledby="cover-editor-title"
        className="w-full max-w-lg space-y-4 rounded-2xl border border-slate-800 bg-slate-900 p-4 shadow-2xl sm:p-5"
      >
        <div className="flex items-start justify-between gap-3">
          <div className="min-w-0">
            <h3 id="cover-editor-title" className="font-semibold text-white">
              Cover cho video
            </h3>
            <p className="mt-1 truncate text-xs text-slate-400">
              {coverEditorTarget.fileName}
            </p>
          </div>
          <button
            type="button"
            onClick={() => {
              setCoverEditorTarget(null);
              setCoverEditorFile(null);
              setCoverEditorError(null);
            }}
            disabled={coverEditorBusy}
            className="rounded-lg border border-slate-700 px-3 py-1.5 text-xs text-slate-300 hover:text-white disabled:opacity-40"
          >
            Đóng
          </button>
        </div>
        {coverEditorError && (
          <p
            className="rounded-lg border border-rose-500/30 bg-rose-950/30 p-2.5 text-xs text-rose-200"
            role="alert"
          >
            {coverEditorError}
          </p>
        )}
        <input
          ref={coverEditorInputRef}
          type="file"
          accept=".png,.jpg,.jpeg,.webp,image/png,image/jpeg,image/webp"
          className="hidden"
          onChange={(event) => {
            chooseCoverFile(event.target.files?.[0]);
            event.target.value = "";
          }}
        />
        <div
          onDragEnter={(event) => {
            event.preventDefault();
            setCoverEditorDragOver(true);
          }}
          onDragOver={(event) => {
            event.preventDefault();
            event.dataTransfer.dropEffect = "copy";
          }}
          onDragLeave={(event) => {
            if (event.currentTarget === event.target) {
              setCoverEditorDragOver(false);
            }
          }}
          onDrop={(event) => {
            event.preventDefault();
            event.stopPropagation();
            setCoverEditorDragOver(false);
            chooseCoverFile(event.dataTransfer.files[0]);
          }}
          className={`rounded-xl border border-dashed p-4 text-center transition-colors ${
            coverEditorDragOver
              ? "border-violet-300 bg-violet-500/10"
              : "border-slate-700 bg-slate-950/50"
          }`}
        >
          {coverEditorPreviewUrl ||
          coverEditorTarget.overlaySettings?.coverFileName ? (
            <img
              src={
                coverEditorPreviewUrl ||
                `/api/video-dubbing/jobs/${coverEditorTarget.id}/cover?v=${coverEditorTarget.updatedAt}`
              }
              alt="Preview ảnh cover"
              className="mx-auto max-h-56 max-w-full rounded-lg object-contain"
            />
          ) : (
            <div className="flex h-40 flex-col items-center justify-center gap-2 text-slate-500">
              <Upload className="h-8 w-8" />
              <span className="text-xs">Kéo thả ảnh cover vào đây</span>
            </div>
          )}
          <p className="mt-3 truncate text-xs text-slate-300">
            {coverEditorFile?.name ||
              coverEditorTarget.overlaySettings?.coverFileName ||
              "PNG, JPG hoặc WebP · tối đa 20 MB"}
          </p>
          <button
            type="button"
            onClick={() => coverEditorInputRef.current?.click()}
            disabled={coverEditorBusy}
            className="mt-3 rounded-lg border border-violet-500/35 px-3 py-1.5 text-xs font-semibold text-violet-100 hover:bg-violet-950/40 disabled:opacity-40"
          >
            Chọn ảnh
          </button>
        </div>
        <label className="block space-y-2 text-xs text-slate-300">
          <span className="flex justify-between">
            <span>Số frame đầu hiển thị cover</span>
            <span>{coverEditorFrameCount} frame</span>
          </span>
          <input
            type="range"
            min="5"
            max="10"
            step="1"
            value={coverEditorFrameCount}
            onChange={(event) =>
              setCoverEditorFrameCount(Number(event.target.value))
            }
            disabled={coverEditorBusy}
            className="w-full accent-violet-400"
          />
        </label>
        <p className="text-[11px] leading-relaxed text-slate-500">
          Ảnh được căn giữa và crop phần thừa để vừa khung hình, không bị kéo
          giãn. Cài đặt này chỉ áp dụng cho video đang chọn.
        </p>
        <div className="flex flex-wrap justify-between gap-2 border-t border-slate-800 pt-3">
          {coverEditorTarget.overlaySettings?.coverFileName ? (
            <button
              type="button"
              onClick={() => void removeCoverFromEditor()}
              disabled={coverEditorBusy}
              className="rounded-lg border border-rose-500/30 px-3 py-2 text-xs text-rose-200 hover:bg-rose-950/30 disabled:opacity-40"
            >
              Xóa cover
            </button>
          ) : (
            <span />
          )}
          <div className="ml-auto flex gap-2">
            <button
              type="button"
              onClick={() => {
                setCoverEditorTarget(null);
                setCoverEditorFile(null);
                setCoverEditorError(null);
              }}
              disabled={coverEditorBusy}
              className="rounded-lg border border-slate-700 px-3 py-2 text-xs text-slate-300 hover:text-white disabled:opacity-40"
            >
              Hủy
            </button>
            <button
              type="button"
              onClick={() => void confirmCoverEditor()}
              disabled={
                coverEditorBusy ||
                (!coverEditorFile &&
                  !coverEditorTarget.overlaySettings?.coverFileName)
              }
              className="inline-flex items-center gap-2 rounded-lg bg-violet-400 px-3 py-2 text-xs font-bold text-slate-950 hover:bg-violet-300 disabled:cursor-not-allowed disabled:opacity-50"
            >
              {coverEditorBusy && (
                <LoaderCircle className="h-3.5 w-3.5 animate-spin" />
              )}
              Xác nhận
            </button>
          </div>
        </div>
      </section>
    </div>
  );
}
