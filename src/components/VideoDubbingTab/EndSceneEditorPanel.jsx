import { Plus, Trash2 } from "lucide-react";
import { END_SCENE_ASPECT_RATIOS } from "./constants";
import TextStyleControls from "./TextStyleControls";

export default function EndSceneEditorPanel({
  addEndSceneText,
  endSceneAspectRatio,
  endSceneDurationSeconds,
  endSceneEnabled,
  endSceneTextOverlays,
  endSceneTextStyleValue,
  isMediaProcessing,
  job,
  removeSelectedEndSceneText,
  saveEndSceneForCurrentVideo,
  selectedEndSceneCue,
  selectedEndSceneTextIndex,
  setEndSceneAspectRatio,
  setEndSceneDurationSeconds,
  setEndSceneTextOverlays,
  setSelectedEndSceneTextIndex,
  subtitleFontOptions,
  updateEndSceneText,
  updateSelectedEndSceneStyle,
}) {
  return (
    <div className="min-w-0 space-y-3">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <div>
          <h4 className="text-sm font-semibold text-white">End Scene</h4>
          <p className="mt-1 text-[10px] text-slate-400">
            Style được lưu trong project; việc thêm vào timeline áp dụng riêng
            cho video này.
          </p>
        </div>
        <button
          type="button"
          disabled={!job || !job.metadata || isMediaProcessing}
          onClick={() => void saveEndSceneForCurrentVideo(!endSceneEnabled)}
          className={`rounded-md border px-2.5 py-1.5 text-xs font-semibold disabled:opacity-40 ${
            endSceneEnabled
              ? "border-orange-400/50 bg-orange-500/15 text-orange-200"
              : "border-slate-700 text-slate-300 hover:border-orange-400/50"
          }`}
        >
          {endSceneEnabled
            ? "Bỏ End Scene khỏi video"
            : "Add End Scene vào video"}
        </button>
      </div>
      <label className="flex items-center justify-between gap-3 rounded-lg border border-slate-800 bg-slate-950/60 p-2.5 text-xs text-slate-300">
        Thời lượng End Scene (giây)
        <input
          type="number"
          min={1}
          max={120}
          step={0.5}
          value={endSceneDurationSeconds}
          onChange={(event) => {
            const value = Number(event.target.value);
            if (!Number.isFinite(value) || value < 1 || value > 120) return;
            setEndSceneDurationSeconds(value);
            setEndSceneTextOverlays((items) =>
              items.map((cue) => ({
                ...cue,
                startTime: Math.min(cue.startTime, value - 0.1),
                endTime: value,
              })),
            );
          }}
          className="w-24 rounded-md border border-slate-700 bg-slate-950 px-2 py-1.5 text-right text-xs text-white"
        />
      </label>
      <label className="flex items-center justify-between gap-3 rounded-lg border border-slate-800 bg-slate-950/60 p-2.5 text-xs text-slate-300">
        Tỉ lệ khung hình preview
        <select
          value={endSceneAspectRatio}
          onChange={(event) => setEndSceneAspectRatio(event.target.value)}
          className="rounded-md border border-slate-700 bg-slate-950 px-2 py-1.5 text-xs text-white"
        >
          {END_SCENE_ASPECT_RATIOS.map((ratio) => (
            <option key={ratio} value={ratio}>
              {ratio}
            </option>
          ))}
        </select>
      </label>
      <div className="flex flex-wrap gap-2">
        <button
          type="button"
          onClick={addEndSceneText}
          className="inline-flex items-center gap-1 rounded-md border border-orange-500/30 px-2.5 py-1.5 text-xs text-orange-200 hover:bg-orange-950/30"
        >
          <Plus className="h-3 w-3" />
          Thêm text
        </button>
        <button
          type="button"
          disabled={!selectedEndSceneCue}
          onClick={removeSelectedEndSceneText}
          className="inline-flex items-center gap-1 rounded-md border border-rose-500/30 px-2.5 py-1.5 text-xs text-rose-200 hover:bg-rose-950/30 disabled:opacity-40"
        >
          <Trash2 className="h-3 w-3" />
          Xóa text
        </button>
      </div>
      <div className="max-h-28 space-y-1 overflow-y-auto rounded-lg border border-slate-800 bg-slate-950/50 p-1.5">
        {endSceneTextOverlays.map((cue, index) => (
          <button
            key={cue.id ?? index}
            type="button"
            aria-pressed={selectedEndSceneTextIndex === index}
            onClick={() => setSelectedEndSceneTextIndex(index)}
            className={`w-full truncate rounded-md px-2 py-1.5 text-left text-xs ${
              selectedEndSceneTextIndex === index
                ? "bg-orange-500/20 text-orange-100"
                : "text-slate-300 hover:bg-slate-800"
            }`}
          >
            {cue.text || `Text ${index + 1}`}
          </button>
        ))}
        {!endSceneTextOverlays.length && (
          <p className="px-2 py-2 text-[10px] text-slate-500">
            Chưa có text trong End Scene.
          </p>
        )}
      </div>
      {selectedEndSceneCue && selectedEndSceneTextIndex !== null && (
        <div className="space-y-3 rounded-lg border border-slate-800 bg-slate-950/50 p-2.5">
          <label className="block space-y-1 text-[10px] text-slate-400">
            Nội dung
            <textarea
              rows={2}
              value={selectedEndSceneCue.text}
              onChange={(event) =>
                updateEndSceneText(selectedEndSceneTextIndex, {
                  text: event.target.value,
                })
              }
              className="w-full rounded-md border border-slate-700 bg-slate-950 px-2 py-1.5 text-xs text-white"
            />
          </label>
          <TextStyleControls
            value={endSceneTextStyleValue}
            onChange={updateSelectedEndSceneStyle}
            fontOptions={subtitleFontOptions}
            disabled={!selectedEndSceneCue}
            maxFontSize={160}
          />
          <div className="grid grid-cols-2 gap-2 text-[10px] text-slate-400">
            <label className="flex items-center justify-between gap-2">
              Căn chữ
              <select
                value={selectedEndSceneCue.textAlign ?? "center"}
                onChange={(event) =>
                  updateEndSceneText(selectedEndSceneTextIndex, {
                    textAlign: event.target.value,
                  })
                }
                className="rounded border border-slate-700 bg-slate-950 px-2 py-1 text-xs text-white"
              >
                <option value="left">Trái</option>
                <option value="center">Giữa</option>
                <option value="right">Phải</option>
              </select>
            </label>
            <label className="flex items-center justify-between gap-2">
              Vị trí dọc
              <select
                value={
                  selectedEndSceneCue.position.startsWith("top-")
                    ? "top"
                    : selectedEndSceneCue.position.startsWith("bottom-")
                      ? "bottom"
                      : "middle"
                }
                onChange={(event) => {
                  const vertical = event.target.value;
                  const horizontal = selectedEndSceneCue.position.endsWith(
                    "-left",
                  )
                    ? "left"
                    : selectedEndSceneCue.position.endsWith("-right")
                      ? "right"
                      : "center";
                  updateEndSceneText(selectedEndSceneTextIndex, {
                    position: `${vertical}-${horizontal}`,
                  });
                }}
                className="rounded border border-slate-700 bg-slate-950 px-2 py-1 text-xs text-white"
              >
                <option value="top">Trên</option>
                <option value="middle">Giữa</option>
                <option value="bottom">Dưới</option>
              </select>
            </label>
            <label className="flex items-center justify-between gap-2">
              Màu nền
              <input
                type="color"
                value={selectedEndSceneCue.backgroundColor}
                disabled={selectedEndSceneCue.backgroundTransparent}
                onChange={(event) =>
                  updateEndSceneText(selectedEndSceneTextIndex, {
                    backgroundColor: event.target.value,
                  })
                }
                className="h-7 w-10 rounded border border-slate-700 bg-slate-950 disabled:opacity-40"
              />
            </label>
            <label className="flex items-center gap-2">
              <input
                type="checkbox"
                checked={selectedEndSceneCue.backgroundTransparent}
                onChange={(event) =>
                  updateEndSceneText(selectedEndSceneTextIndex, {
                    backgroundTransparent: event.target.checked,
                  })
                }
                className="accent-orange-400"
              />
              Nền trong suốt
            </label>
          </div>
        </div>
      )}
    </div>
  );
}
