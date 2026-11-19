import { X } from "lucide-react";

export default function SubtitleBackgroundPickerModal({
  setSubtitleBackgroundImage,
  setSubtitleBackgroundPickerOpen,
  subtitleBackgroundImage,
  subtitleBackgroundSliceUrl,
  subtitleBackgrounds,
}) {
  return (
    <div
      className="fixed inset-0 z-[70] flex items-center justify-center bg-black/75 p-3 sm:p-6"
      role="presentation"
      onMouseDown={(event) => {
        if (event.target === event.currentTarget)
          setSubtitleBackgroundPickerOpen(false);
      }}
    >
      <section
        role="dialog"
        aria-modal="true"
        aria-labelledby="subtitle-background-picker-title"
        className="max-h-[88vh] w-full max-w-4xl space-y-4 overflow-y-auto rounded-2xl border border-slate-700 bg-slate-900 p-4 shadow-2xl sm:p-5"
      >
        <header className="flex items-center justify-between gap-3">
          <div>
            <h3
              id="subtitle-background-picker-title"
              className="font-semibold text-white"
            >
              Chọn ảnh nền phụ đề
            </h3>
            <p className="mt-1 text-xs text-slate-400">
              Preview cách ghép ba slice left, center và right.
            </p>
          </div>
          <button
            type="button"
            onClick={() => setSubtitleBackgroundPickerOpen(false)}
            className="rounded-lg border border-slate-700 p-2 text-slate-300 hover:bg-slate-800"
            aria-label="Đóng chọn ảnh nền"
          >
            <X className="h-4 w-4" />
          </button>
        </header>
        {subtitleBackgrounds.length === 0 ? (
          <p className="rounded-xl border border-slate-800 bg-slate-950/50 p-4 text-sm text-slate-400">
            Chưa tìm thấy bộ ảnh nền 3-slice hợp lệ.
          </p>
        ) : (
          <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
            {subtitleBackgrounds.map((background) => {
              const selected = subtitleBackgroundImage === background;
              return (
                <button
                  key={background}
                  type="button"
                  aria-pressed={selected}
                  onClick={() => {
                    setSubtitleBackgroundImage(background);
                    setSubtitleBackgroundPickerOpen(false);
                  }}
                  className={`rounded-xl border p-3 text-left transition-colors ${selected ? "border-sky-400/70 bg-sky-950/30" : "border-slate-700 bg-slate-950/60 hover:border-slate-500"}`}
                >
                  <div className="mx-auto flex h-20 w-full items-center justify-center overflow-hidden rounded-lg bg-slate-800">
                    <img
                      aria-hidden="true"
                      src={subtitleBackgroundSliceUrl(background, "left")}
                      alt=""
                      className="h-full w-auto shrink-0 object-contain"
                    />
                    <img
                      aria-hidden="true"
                      src={subtitleBackgroundSliceUrl(background, "center")}
                      alt=""
                      className="h-full w-auto shrink-0 object-contain"
                    />
                    <img
                      aria-hidden="true"
                      src={subtitleBackgroundSliceUrl(background, "right")}
                      alt=""
                      className="h-full w-auto shrink-0 object-contain"
                    />
                  </div>
                  <span className="mt-2 flex items-center justify-between gap-2 text-xs font-medium text-slate-200">
                    <span className="truncate">
                      {background.replace(/\.(png|webp)$/i, "")}
                    </span>
                    {selected && (
                      <span className="shrink-0 text-sky-300">Đang chọn</span>
                    )}
                  </span>
                </button>
              );
            })}
          </div>
        )}
      </section>
    </div>
  );
}
