import { Trash2 } from "lucide-react";
import { OVERLAY_POSITION_OPTIONS } from "./constants";
import { getSubtitleTextAlignment } from "./helpers";
import TextStyleControls from "./TextStyleControls";

export default function SelectedClipStylePanel({
  applySelectedTextOverlayToTrack,
  cue,
  cueTrackName,
  cueTrackTextCount,
  selectedTextOverlay,
  setSelectedTextOverlay,
  setTextOverlays,
  subtitleFontOptions,
  textStyleValue,
  updateSelectedTextOverlay,
  video,
}) {
  return (
    <div className="grid gap-2 rounded-lg border border-violet-500/20 bg-violet-950/10 p-3 sm:grid-cols-2 xl:grid-cols-4">
      <div className="flex flex-wrap items-center justify-between gap-2 sm:col-span-2 xl:col-span-4">
        <p className="text-[10px] text-violet-200">
          Style và vị trí chỉ áp dụng cho clip này cho đến khi nhấn Apply to All
          ({cueTrackName}).
        </p>
        <button
          type="button"
          disabled={cueTrackTextCount < 2}
          onClick={applySelectedTextOverlayToTrack}
          className="rounded-md border border-violet-400/40 px-2.5 py-1.5 text-xs font-semibold text-violet-100 hover:bg-violet-900/40 disabled:cursor-not-allowed disabled:opacity-40"
          title={`Áp dụng style và vị trí cho ${cueTrackTextCount} clip trong ${cueTrackName}`}
        >
          Apply to All
        </button>
      </div>
      <label className="space-y-1 text-[10px] text-slate-400 sm:col-span-2">
        {cue.kind === "character-card" ? "Tên nhân vật" : "Nội dung"}
        <textarea
          value={cue.text}
          onChange={(event) =>
            updateSelectedTextOverlay({
              text: event.target.value,
            })
          }
          rows={2}
          className="w-full rounded-md border border-slate-700 bg-slate-950 px-2 py-1.5 text-xs text-white"
        />
      </label>
      {cue.kind === "character-card" && (
        <>
          <label className="space-y-1 text-[10px] text-slate-400 sm:col-span-2">
            Chức vụ
            <textarea
              value={cue.characterRole ?? ""}
              onChange={(event) =>
                updateSelectedTextOverlay({
                  characterRole: event.target.value,
                })
              }
              rows={2}
              className="w-full rounded-md border border-slate-700 bg-slate-950 px-2 py-1.5 text-xs text-white"
            />
          </label>
          <label className="space-y-1 text-[10px] text-slate-400">
            Cỡ chữ chức vụ
            <div className="flex items-center gap-2">
              <input
                type="range"
                min={8}
                max={160}
                value={
                  cue.characterRoleFontSize ??
                  Math.max(8, Math.round(cue.fontSize * 0.7))
                }
                onChange={(event) =>
                  updateSelectedTextOverlay({
                    characterRoleFontSize: Number(event.target.value),
                  })
                }
                className="w-full accent-violet-400"
                aria-label="Cỡ chữ chức vụ"
              />
              <input
                type="number"
                min={8}
                max={160}
                value={
                  cue.characterRoleFontSize ??
                  Math.max(8, Math.round(cue.fontSize * 0.7))
                }
                onChange={(event) =>
                  updateSelectedTextOverlay({
                    characterRoleFontSize: Math.max(
                      8,
                      Math.min(160, Number(event.target.value) || 8),
                    ),
                  })
                }
                className="w-16 rounded-md border border-slate-700 bg-slate-950 px-2 py-1.5 text-center text-xs text-white"
              />
            </div>
          </label>
        </>
      )}
      <div className="sm:col-span-2 xl:col-span-4">
        <TextStyleControls
          value={textStyleValue}
          onChange={updateSelectedTextOverlay}
          fontOptions={subtitleFontOptions}
        />
      </div>
      <label className="inline-flex items-center gap-2 text-xs text-slate-300 sm:col-span-2 xl:col-span-4">
        <input
          type="checkbox"
          checked={cue.extendToVideoEnd ?? false}
          onChange={(event) => {
            const extendToVideoEnd = event.target.checked;
            const duration = video?.job?.metadata?.durationSeconds;
            updateSelectedTextOverlay({
              extendToVideoEnd,
              ...(extendToVideoEnd && duration
                ? {
                    startTime: Math.min(
                      cue.startTime,
                      Math.max(0, duration - 0.1),
                    ),
                    endTime: duration,
                  }
                : {}),
            });
          }}
          className="accent-violet-400"
        />
        Hiển thị đến hết video (tự căn theo thời lượng từng video trong hàng
        đợi)
      </label>
      <label className="space-y-1 text-[10px] text-slate-400">
        Vị trí neo
        <select
          value={cue.position}
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
      <label className="space-y-1 text-[10px] text-slate-400">
        Align
        <select
          value={cue.textAlign ?? getSubtitleTextAlignment(cue.position)}
          onChange={(event) =>
            updateSelectedTextOverlay({
              textAlign: event.target.value,
            })
          }
          className="w-full rounded-md border border-slate-700 bg-slate-950 px-2 py-1.5 text-xs text-white"
        >
          <option value="left">Left</option>
          <option value="center">Center</option>
          <option value="right">Right</option>
        </select>
      </label>
      {(cue.xPercent !== undefined || cue.yPercent !== undefined) && (
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
          checked={cue.backgroundTransparent}
          onChange={(event) =>
            updateSelectedTextOverlay({
              backgroundTransparent: event.target.checked,
            })
          }
          className="accent-violet-400"
        />
        Nền trong suốt
      </label>
      {!cue.backgroundTransparent && (
        <label className="space-y-1 text-[10px] text-slate-400">
          Màu nền
          <input
            type="color"
            value={cue.backgroundColor}
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
            items.filter((_, index) => index !== selectedTextOverlay),
          );
          setSelectedTextOverlay(null);
        }}
        className="inline-flex items-center justify-center gap-1 rounded-md border border-rose-500/30 px-2 py-1 text-xs text-rose-200"
      >
        <Trash2 className="h-3 w-3" />
        Xóa text
      </button>
    </div>
  );
}
