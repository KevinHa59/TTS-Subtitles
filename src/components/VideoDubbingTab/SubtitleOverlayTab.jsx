import { ChevronDown } from "lucide-react";
import { OVERLAY_POSITION_OPTIONS } from "./constants";
import TextStyleControls from "./TextStyleControls";

export default function SubtitleOverlayTab({
  flushSubtitleMarginSave,
  job,
  scheduleSubtitleMarginSave,
  setSubtitleBackgroundColor,
  setSubtitleBackgroundImage,
  setSubtitleBackgroundMode,
  setSubtitleBackgroundPickerOpen,
  setSubtitleMarginPx,
  setSubtitlePaddingPx,
  setSubtitlePosition,
  setSubtitlesEnabled,
  srt,
  subtitleBackgroundColor,
  subtitleBackgroundImage,
  subtitleBackgroundMode,
  subtitleBackgrounds,
  subtitleFontOptions,
  subtitleMarginPx,
  subtitlePaddingPx,
  subtitlePosition,
  subtitleTextStyleValue,
  subtitlesEnabled,
  updateSubtitleTextStyle,
}) {
  return (
    <div className="space-y-3 rounded-xl">
      <label className="flex items-center gap-2 text-sm font-semibold text-slate-100">
        <input
          type="checkbox"
          checked={subtitlesEnabled}
          disabled={
            !srt?.analysis?.items.length &&
            !job?.overlaySettings?.subtitles.length
          }
          onChange={(event) => setSubtitlesEnabled(event.target.checked)}
          className="accent-sky-400"
        />
        Chèn phụ đề SRT
      </label>
      <p className="text-xs text-slate-400">
        {srt?.analysis
          ? `${srt.fileName} · ${srt.analysis.subtitleCount} dòng`
          : job?.overlaySettings?.subtitles.length
            ? `${job.overlaySettings.subtitles.length} dòng phụ đề đã lưu`
            : "Chọn và phân tích tệp SRT ở phần phụ đề trước khi xuất."}
      </p>
      <TextStyleControls
        value={subtitleTextStyleValue}
        onChange={updateSubtitleTextStyle}
        fontOptions={subtitleFontOptions}
        minFontSize={12}
        maxFontSize={72}
        disabled={
          !srt?.analysis?.items.length &&
          !job?.overlaySettings?.subtitles.length
        }
      />
      <div className="grid gap-3 sm:grid-cols-2">
        <label className="flex items-center justify-between gap-2 text-xs text-slate-300">
          Kiểu nền phụ đề
          <select
            value={subtitleBackgroundMode}
            onChange={(event) => {
              setSubtitleBackgroundMode(event.target.value);
              if (
                event.target.value === "image" &&
                !subtitleBackgroundImage &&
                subtitleBackgrounds.length > 0
              ) {
                setSubtitleBackgroundImage(subtitleBackgrounds[0]);
              }
            }}
            disabled={
              !srt?.analysis?.items.length &&
              !job?.overlaySettings?.subtitles.length
            }
            className="min-w-0 rounded-lg border border-slate-700 bg-slate-900 px-2 py-2 text-xs text-slate-100"
          >
            <option value="none">Không nền / Trong suốt</option>
            <option value="color">Màu nền</option>
            <option value="image">Nền ảnh 3-slice</option>
          </select>
        </label>
        {subtitleBackgroundMode === "color" && (
          <label className="flex items-center justify-between gap-2 text-xs text-slate-300">
            Màu nền
            <input
              type="color"
              value={subtitleBackgroundColor}
              onChange={(event) =>
                setSubtitleBackgroundColor(event.target.value)
              }
              disabled={
                !srt?.analysis?.items.length &&
                !job?.overlaySettings?.subtitles.length
              }
              className="h-8 w-12 cursor-pointer rounded border border-slate-700 bg-slate-900 p-1 disabled:cursor-not-allowed"
            />
          </label>
        )}
        {subtitleBackgroundMode === "image" && (
          <div className="flex items-center justify-between gap-2 text-xs text-slate-300">
            <span>Ảnh nền</span>
            <button
              type="button"
              onClick={() => setSubtitleBackgroundPickerOpen(true)}
              disabled={
                (!srt?.analysis?.items.length &&
                  !job?.overlaySettings?.subtitles.length) ||
                subtitleBackgrounds.length === 0
              }
              className="flex min-w-0 items-center gap-2 rounded-lg border border-slate-700 bg-slate-900 px-2 py-2 text-xs text-slate-100 hover:border-sky-500/50 disabled:cursor-not-allowed disabled:opacity-50"
            >
              <span className="max-w-32 truncate">
                {subtitleBackgroundImage?.replace(/\.(png|webp)$/i, "") ||
                  "Chọn nền"}
              </span>
              <ChevronDown className="h-3.5 w-3.5 shrink-0 text-slate-400" />
            </button>
          </div>
        )}
      </div>
      <label className="block space-y-1.5 text-xs text-slate-300">
        <span className="flex justify-between gap-2">
          <span>Padding nền phụ đề</span>
          <span>{subtitlePaddingPx} px</span>
        </span>
        <input
          type="range"
          min="0"
          max="40"
          value={subtitlePaddingPx}
          onChange={(event) => setSubtitlePaddingPx(Number(event.target.value))}
          disabled={
            !srt?.analysis?.items.length &&
            !job?.overlaySettings?.subtitles.length
          }
          className="w-full accent-sky-400"
        />
      </label>
      <label className="block space-y-1.5 text-xs text-slate-300">
        <span className="flex justify-between gap-2">
          <span>Khoảng cách phụ đề tới mép video</span>
          <span>{subtitleMarginPx} px</span>
        </span>
        <input
          type="range"
          min="0"
          max="200"
          step="4"
          value={subtitleMarginPx}
          onChange={(event) =>
            (() => {
              const value = Number(event.target.value);
              setSubtitleMarginPx(value);
              if (job?.id) scheduleSubtitleMarginSave(job.id, value);
            })()
          }
          onPointerUp={flushSubtitleMarginSave}
          onKeyUp={flushSubtitleMarginSave}
          disabled={
            !srt?.analysis?.items.length &&
            !job?.overlaySettings?.subtitles.length
          }
          className="w-full accent-sky-400"
        />
      </label>
      <label className="flex items-center justify-between gap-3 text-xs text-slate-300">
        Vị trí phụ đề
        <select
          value={subtitlePosition}
          onChange={(event) => setSubtitlePosition(event.target.value)}
          disabled={
            !srt?.analysis?.items.length &&
            !job?.overlaySettings?.subtitles.length
          }
          className="rounded-lg border border-slate-700 bg-slate-900 px-2.5 py-2 text-xs text-slate-100"
        >
          {OVERLAY_POSITION_OPTIONS.map((option) => (
            <option key={option.value} value={option.value}>
              {option.label}
            </option>
          ))}
        </select>
      </label>
      <p className="text-[11px] text-slate-500">Mặc định: dưới giữa.</p>
    </div>
  );
}
