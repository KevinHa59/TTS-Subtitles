import { LoaderCircle, Plus, Trash2, Upload } from "lucide-react";
import { OVERLAY_POSITION_OPTIONS } from "./constants";
import TextStyleControls from "./TextStyleControls";

export default function LogoTitleTab({
  createTitleOverlay,
  isMediaProcessing,
  job,
  logoEnabled,
  logoInputRef,
  logoPaddingPx,
  logoPosition,
  logoUploading,
  logoWidthPercent,
  selectedTextOverlay,
  setLogoEnabled,
  setLogoPaddingPx,
  setLogoPosition,
  setLogoWidthPercent,
  setSelectedTextOverlay,
  setTextOverlays,
  subtitleFontOptions,
  titleOverlay,
  titleOverlayIndex,
  updateSelectedTextOverlay,
  uploadOverlayLogo,
}) {
  return (
    <div className="space-y-3">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <label className="flex items-center gap-2 text-sm font-semibold text-slate-100">
          <input
            type="checkbox"
            checked={logoEnabled}
            disabled={!job?.overlaySettings?.logoFileName || logoUploading}
            onChange={(event) => setLogoEnabled(event.target.checked)}
            className="accent-sky-400"
          />
          Bật logo
        </label>
        <input
          ref={logoInputRef}
          type="file"
          accept=".png,.jpg,.jpeg,.webp,image/png,image/jpeg,image/webp"
          className="hidden"
          onChange={(event) => {
            const file = event.target.files?.[0];
            event.target.value = "";
            if (file) void uploadOverlayLogo(file);
          }}
        />
        <button
          type="button"
          onClick={() => logoInputRef.current?.click()}
          disabled={!job || logoUploading || isMediaProcessing}
          className="inline-flex items-center gap-1.5 rounded-lg border border-slate-700 px-3 py-2 text-xs font-semibold text-slate-200 hover:border-sky-400/50 disabled:cursor-not-allowed disabled:opacity-50"
        >
          {logoUploading ? (
            <LoaderCircle className="h-3.5 w-3.5 animate-spin" />
          ) : (
            <Upload className="h-3.5 w-3.5" />
          )}
          {job?.overlaySettings?.logoFileName ? "Thay logo" : "Thêm logo"}
        </button>
      </div>
      {job?.overlaySettings?.logoFileName ? (
        <div className="flex items-center gap-3">
          <img
            src={`/api/video-dubbing/jobs/${job.id}/logo`}
            alt="Logo chèn vào video"
            className="max-h-12 max-w-24 rounded border border-slate-700 bg-slate-900 object-contain p-1"
          />
          <span className="text-xs text-slate-400">
            {job.overlaySettings.logoFileName}
          </span>
        </div>
      ) : (
        <p className="text-xs text-slate-500">
          Chọn logo PNG, JPG hoặc WebP (tối đa 20 MB).
        </p>
      )}
      <label className="block space-y-1.5 text-xs text-slate-300">
        <span className="flex justify-between gap-2">
          <span>Kích thước theo chiều rộng video</span>
          <span>{logoWidthPercent}%</span>
        </span>
        <input
          type="range"
          min="5"
          max="40"
          value={logoWidthPercent}
          onChange={(event) => setLogoWidthPercent(Number(event.target.value))}
          disabled={!job?.overlaySettings?.logoFileName}
          className="w-full accent-sky-400"
        />
      </label>
      <label className="block space-y-1.5 text-xs text-slate-300">
        <span className="flex justify-between gap-2">
          <span>Padding cách mép video</span>
          <span>{logoPaddingPx} px</span>
        </span>
        <input
          type="range"
          min="0"
          max="200"
          step="4"
          value={logoPaddingPx}
          onChange={(event) => setLogoPaddingPx(Number(event.target.value))}
          disabled={!job?.overlaySettings?.logoFileName}
          className="w-full accent-sky-400"
        />
      </label>
      <label className="flex items-center justify-between gap-3 text-xs text-slate-300">
        Vị trí logo
        <select
          value={logoPosition}
          onChange={(event) => setLogoPosition(event.target.value)}
          disabled={!job?.overlaySettings?.logoFileName}
          className="rounded-lg border border-slate-700 bg-slate-900 px-2.5 py-2 text-xs text-slate-100"
        >
          {OVERLAY_POSITION_OPTIONS.map((option) => (
            <option key={option.value} value={option.value}>
              {option.label}
            </option>
          ))}
        </select>
      </label>
      <p className="text-[11px] text-slate-500">Mặc định: trên trái.</p>
      <div className="border-t border-slate-800 pt-3">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <label className="flex items-center gap-2 text-sm font-semibold text-slate-100">
            <input
              type="checkbox"
              checked={Boolean(titleOverlay && titleOverlay.enabled !== false)}
              disabled={!titleOverlay}
              onChange={(event) => {
                if (titleOverlayIndex >= 0) {
                  setTextOverlays((items) =>
                    items.map((item, index) =>
                      index === titleOverlayIndex
                        ? {
                            ...item,
                            enabled: event.target.checked,
                          }
                        : item,
                    ),
                  );
                }
              }}
              className="accent-violet-400"
            />
            Bật tiêu đề
          </label>
          <button
            type="button"
            onClick={createTitleOverlay}
            disabled={!job || isMediaProcessing}
            className="inline-flex items-center gap-1.5 rounded-lg border border-violet-500/30 bg-violet-950/20 px-3 py-2 text-xs font-semibold text-violet-100 hover:bg-violet-950/40 disabled:cursor-not-allowed disabled:opacity-50"
          >
            <Plus className="h-3.5 w-3.5" />
            {titleOverlay ? "Chỉnh tiêu đề" : "Tạo Tiêu Đề"}
          </button>
        </div>
        <p className="mt-2 text-[11px] text-slate-500">
          Tiêu đề luôn hiển thị từ đầu đến hết video. Kéo tiêu đề trực tiếp trên
          preview để đặt cạnh logo.
        </p>
      </div>
      {titleOverlay && selectedTextOverlay === titleOverlayIndex && (
        <div className="grid gap-3 rounded-lg border border-violet-500/20 bg-violet-950/10 p-3 sm:grid-cols-2">
          <label className="space-y-1 text-[10px] text-slate-400 sm:col-span-2">
            Nội dung tiêu đề
            <textarea
              value={titleOverlay.text}
              onChange={(event) =>
                updateSelectedTextOverlay({
                  text: event.target.value,
                })
              }
              rows={2}
              className="w-full rounded-md border border-slate-700 bg-slate-950 px-2 py-1.5 text-xs text-white"
            />
          </label>
          <div className="sm:col-span-2">
            <TextStyleControls
              value={{
                fontFamily: titleOverlay.fontFamily,
                fontSize: titleOverlay.fontSize,
                bold: titleOverlay.bold,
                underline: titleOverlay.underline ?? false,
                italic: titleOverlay.italic,
                textCase: titleOverlay.textCase ?? "none",
                color: titleOverlay.color,
                outlineEnabled: titleOverlay.outlineEnabled ?? false,
                outlineColor: titleOverlay.outlineColor ?? "#000000",
                outlineWidthPx: titleOverlay.outlineWidthPx ?? 2,
                characterSpacingPx: titleOverlay.characterSpacingPx ?? 0,
                lineSpacingPx: titleOverlay.lineSpacingPx ?? 0,
              }}
              onChange={updateSelectedTextOverlay}
              fontOptions={subtitleFontOptions}
            />
          </div>
          <label className="space-y-1 text-[10px] text-slate-400">
            Vị trí neo
            <select
              value={titleOverlay.position}
              onChange={(event) =>
                updateSelectedTextOverlay({
                  position: event.target.value,
                  xPercent: undefined,
                  yPercent: undefined,
                })
              }
              className="w-full rounded-md border border-slate-700 bg-slate-950 px-2 py-1.5 text-xs text-white"
            >
              {OVERLAY_POSITION_OPTIONS.map((option) => (
                <option key={option.value} value={option.value}>
                  {option.label}
                </option>
              ))}
            </select>
          </label>
          {(titleOverlay.xPercent !== undefined ||
            titleOverlay.yPercent !== undefined) && (
            <button
              type="button"
              onClick={() =>
                updateSelectedTextOverlay({
                  xPercent: undefined,
                  yPercent: undefined,
                })
              }
              className="self-end rounded-md border border-violet-500/30 px-2 py-1.5 text-xs text-violet-200"
            >
              Đặt lại vị trí neo
            </button>
          )}
          <label className="inline-flex items-center gap-2 text-xs text-slate-300">
            <input
              type="checkbox"
              checked={titleOverlay.backgroundTransparent}
              onChange={(event) =>
                updateSelectedTextOverlay({
                  backgroundTransparent: event.target.checked,
                })
              }
              className="accent-violet-400"
            />
            Nền trong suốt
          </label>
          {!titleOverlay.backgroundTransparent && (
            <label className="space-y-1 text-[10px] text-slate-400">
              Màu nền
              <input
                type="color"
                value={titleOverlay.backgroundColor}
                onChange={(event) =>
                  updateSelectedTextOverlay({
                    backgroundColor: event.target.value,
                  })
                }
                className="h-8 w-full rounded-md border border-slate-700 bg-slate-950"
              />
            </label>
          )}
          <button
            type="button"
            onClick={() => {
              setTextOverlays((items) =>
                items.filter((_, index) => index !== titleOverlayIndex),
              );
              setSelectedTextOverlay(null);
            }}
            className="inline-flex items-center justify-center gap-1 justify-self-start rounded-md border border-rose-500/30 px-2 py-1 text-xs text-rose-200"
          >
            <Trash2 className="h-3 w-3" />
            Xóa tiêu đề
          </button>
        </div>
      )}
    </div>
  );
}
