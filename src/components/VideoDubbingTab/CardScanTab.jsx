export default function CardScanTab({
  acceptCharacterCardReferenceFile,
  cancelCharacterCardOcr,
  cancelCharacterCardReferenceScan,
  characterCardDrawMode,
  characterCardOcrDuration,
  characterCardOcrError,
  characterCardOcrJob,
  characterCardOcrStartOffset,
  characterCardOcrWorker,
  characterCardReferenceError,
  characterCardReferenceFile,
  characterCardReferenceFramesToSkip,
  characterCardReferencePreviewUrl,
  characterCardReferenceScanJob,
  characterCardReferenceSimilarity,
  characterCardRegion,
  createCharacterCardsAutomatically,
  job,
  pasteCharacterCardReference,
  setCharacterCardDrawMode,
  setCharacterCardDrawStart,
  setCharacterCardOcrDuration,
  setCharacterCardOcrError,
  setCharacterCardOcrStartOffset,
  setCharacterCardReferenceError,
  setCharacterCardReferenceFile,
  setCharacterCardReferenceFramesToSkip,
  setCharacterCardReferenceScanJob,
  setCharacterCardReferenceSimilarity,
  setCharacterCardRegion,
  setCharacterCardRegionDraft,
  startCharacterCardOcrWorker,
  startCharacterCardReferenceScan,
  stopCharacterCardOcrWorker,
  videoPreviewReady,
}) {
  return (
    <div id="character-card-scan-panel" className="space-y-2">
      <div className="flex flex-wrap items-center gap-2">
        <button
          type="button"
          disabled={
            characterCardOcrWorker.status === "starting" ||
            characterCardOcrWorker.status === "ready" ||
            characterCardOcrWorker.status === "busy"
          }
          onClick={() => void startCharacterCardOcrWorker()}
          className="rounded-md border border-cyan-500/30 px-2.5 py-1.5 text-xs text-cyan-100 hover:bg-cyan-950/40 disabled:cursor-not-allowed disabled:opacity-40"
        >
          {characterCardOcrWorker.status === "starting"
            ? "Đang nạp OCR…"
            : "Giữ OCR chạy"}
        </button>
        {(characterCardOcrWorker.status === "starting" ||
          characterCardOcrWorker.status === "ready" ||
          characterCardOcrWorker.status === "busy") && (
          <button
            type="button"
            onClick={() => void stopCharacterCardOcrWorker()}
            className="rounded-md border border-rose-500/30 px-2.5 py-1.5 text-xs text-rose-200 hover:bg-rose-950/40"
          >
            Dừng OCR
          </button>
        )}
        <span className="text-[10px] text-slate-400" role="status">
          {characterCardOcrWorker.message}
        </span>
      </div>
      <p className="text-[10px] text-slate-500">
        Bật một lần để nạp model và tái sử dụng cho các lần quét tiếp theo; nhấn
        Dừng OCR để giải phóng RAM/VRAM.
      </p>
      <div className="flex flex-wrap items-center gap-2">
        <button
          type="button"
          disabled={
            !videoPreviewReady ||
            characterCardOcrJob?.status === "running" ||
            characterCardOcrJob?.status === "queued"
          }
          onClick={() => {
            setCharacterCardOcrError(null);
            setCharacterCardDrawMode((drawing) => !drawing);
            setCharacterCardDrawStart(null);
            setCharacterCardRegionDraft(null);
          }}
          className={`rounded-md border px-2.5 py-1.5 text-xs font-semibold disabled:cursor-not-allowed disabled:opacity-40 ${characterCardDrawMode ? "border-amber-300 bg-amber-300 text-slate-950" : "border-amber-500/40 text-amber-100 hover:bg-amber-950/40"}`}
        >
          {characterCardDrawMode
            ? "Đang vẽ vùng…"
            : characterCardRegion
              ? "Vẽ lại vùng card nhân vật"
              : "Vẽ vùng card nhân vật"}
        </button>
        {characterCardRegion && !characterCardDrawMode && (
          <button
            type="button"
            disabled={
              characterCardOcrJob?.status === "running" ||
              characterCardOcrJob?.status === "queued"
            }
            onClick={() => setCharacterCardRegion(null)}
            className="rounded-md border border-slate-700 px-2 py-1.5 text-xs text-slate-300 hover:bg-slate-800 disabled:opacity-40"
          >
            Xóa vùng
          </button>
        )}
        <label className="flex items-center gap-2 text-xs text-slate-300">
          Bắt đầu trước playhead (giây)
          <input
            type="number"
            min={0}
            max={60}
            step={1}
            value={characterCardOcrStartOffset}
            onChange={(event) => {
              const value = Number(event.target.value);
              if (Number.isFinite(value)) {
                setCharacterCardOcrStartOffset(
                  Math.max(0, Math.min(60, value)),
                );
              }
            }}
            className="w-16 rounded-md border border-slate-700 bg-slate-950 px-2 py-1.5 text-center text-xs text-white"
          />
        </label>
        <label className="flex items-center gap-2 text-xs text-slate-300">
          Độ dài quét (giây)
          <input
            type="number"
            min={1}
            max={60}
            step={1}
            value={characterCardOcrDuration}
            onChange={(event) => {
              const value = Number(event.target.value);
              if (Number.isFinite(value)) {
                setCharacterCardOcrDuration(Math.max(1, Math.min(60, value)));
              }
            }}
            className="w-16 rounded-md border border-slate-700 bg-slate-950 px-2 py-1.5 text-center text-xs text-white"
          />
        </label>
        {characterCardOcrJob?.status === "running" ||
        characterCardOcrJob?.status === "queued" ? (
          <button
            type="button"
            onClick={() => void cancelCharacterCardOcr()}
            className="rounded-md border border-rose-500/30 px-2.5 py-1.5 text-xs text-rose-200 hover:bg-rose-950/40"
          >
            {characterCardOcrWorker.status === "busy"
              ? "Hủy OCR · dừng worker"
              : "Hủy OCR"}
          </button>
        ) : (
          <button
            type="button"
            disabled={
              !job ||
              !characterCardRegion ||
              characterCardDrawMode ||
              characterCardOcrWorker.status === "starting" ||
              characterCardOcrWorker.status === "busy"
            }
            onClick={() => void createCharacterCardsAutomatically()}
            className="rounded-md bg-amber-300 px-2.5 py-1.5 text-xs font-bold text-slate-950 hover:bg-amber-200 disabled:cursor-not-allowed disabled:opacity-40"
          >
            Tạo card tự động
          </button>
        )}
      </div>
      <p className="text-[10px] text-slate-400">
        Khoanh vùng chứa card trên preview và dùng ảnh mẫu đã crop sát card. OCR
        bắt đầu từ N giây trước thời điểm khớp, quét M giây và tự giới hạn trong
        video.
      </p>
      {characterCardDrawMode && (
        <p className="text-[10px] text-amber-200">
          Nhấn giữ và kéo trên video để chọn vùng.
        </p>
      )}
      {characterCardOcrJob && (
        <p className="text-[10px] text-slate-300" role="status">
          {characterCardOcrJob.message}{" "}
          {characterCardOcrJob.status === "running" &&
            `${characterCardOcrJob.progressPercent}%`}
        </p>
      )}
      {characterCardOcrError && (
        <p className="text-[10px] text-rose-300" role="alert">
          {characterCardOcrError}
        </p>
      )}
      <div
        onPaste={pasteCharacterCardReference}
        tabIndex={0}
        className="space-y-3 rounded-lg border border-violet-500/25 bg-violet-950/10 p-3 outline-none focus-visible:ring-2 focus-visible:ring-violet-400"
        aria-label="Ảnh mẫu card nhân vật"
      >
        <div className="flex flex-wrap items-center justify-between gap-2">
          <div>
            <h4 className="text-xs font-semibold text-violet-100">
              Tìm card theo ảnh mẫu
            </h4>
            <p className="mt-1 text-[10px] text-slate-400">
              Dò ảnh bằng OpenCV rồi dùng OCR hiện có để lọc kết quả không có
              chữ trước khi hiển thị.
            </p>
          </div>
          <label
            className={`rounded-md border border-violet-400/40 px-2.5 py-1.5 text-xs font-semibold text-violet-100 ${characterCardReferenceScanJob?.status === "running" ? "cursor-not-allowed opacity-40" : "cursor-pointer hover:bg-violet-950/50"}`}
          >
            Chọn ảnh mẫu
            <input
              type="file"
              accept="image/png,image/jpeg,image/webp"
              className="sr-only"
              disabled={characterCardReferenceScanJob?.status === "running"}
              onChange={(event) => {
                acceptCharacterCardReferenceFile(
                  event.target.files?.[0] ?? null,
                );
                event.target.value = "";
              }}
            />
          </label>
        </div>
        {characterCardReferencePreviewUrl ? (
          <div className="flex items-center gap-3">
            <img
              src={characterCardReferencePreviewUrl}
              alt="Ảnh mẫu card nhân vật"
              className="max-h-24 max-w-48 rounded border border-slate-700 object-contain"
            />
            <div className="min-w-0 flex-1 text-[10px] text-slate-400">
              <p className="truncate">
                {characterCardReferenceFile?.name || "Ảnh dán từ clipboard"}
              </p>
              <button
                type="button"
                disabled={characterCardReferenceScanJob?.status === "running"}
                onClick={() => {
                  setCharacterCardReferenceFile(null);
                  setCharacterCardReferenceScanJob(null);
                  setCharacterCardReferenceError(null);
                }}
                className="mt-1 text-rose-200 hover:text-rose-100 disabled:cursor-not-allowed disabled:opacity-40"
              >
                Xóa ảnh mẫu
              </button>
            </div>
          </div>
        ) : (
          <p className="rounded-md border border-dashed border-slate-700 px-3 py-4 text-center text-[10px] text-slate-500">
            Dán ảnh bằng Ctrl+V tại đây hoặc chọn ảnh PNG/JPEG/WebP.
          </p>
        )}
        <div className="flex flex-wrap items-center gap-3">
          <label className="flex items-center gap-2 text-[10px] text-slate-300">
            Bỏ qua frame
            <input
              type="number"
              min={0}
              max={10000}
              step={1}
              value={characterCardReferenceFramesToSkip}
              onChange={(event) => {
                const value = Number(event.target.value);
                if (Number.isFinite(value)) {
                  setCharacterCardReferenceFramesToSkip(
                    Math.max(0, Math.min(10000, Math.round(value))),
                  );
                }
              }}
              className="w-20 rounded-md border border-slate-700 bg-slate-950 px-2 py-1.5 text-center text-xs text-white"
            />
            <span className="text-slate-500">
              (
              {(
                (characterCardReferenceFramesToSkip + 1) /
                (job?.metadata?.frameRate || 30)
              ).toFixed(2)}{" "}
              giây/mẫu)
            </span>
          </label>
          <label className="flex items-center gap-2 text-[10px] text-slate-300">
            Ngưỡng giống
            <input
              type="range"
              min={0.3}
              max={0.99}
              step={0.01}
              value={characterCardReferenceSimilarity}
              onChange={(event) =>
                setCharacterCardReferenceSimilarity(Number(event.target.value))
              }
              className="w-24 accent-violet-400"
            />
            <span className="w-9 text-right tabular-nums">
              {Math.round(characterCardReferenceSimilarity * 100)}%
            </span>
          </label>
          {characterCardReferenceScanJob?.status === "running" ? (
            <button
              type="button"
              onClick={() => void cancelCharacterCardReferenceScan()}
              className="rounded-md border border-rose-500/30 px-2.5 py-1.5 text-xs text-rose-200 hover:bg-rose-950/40"
            >
              Hủy quét
            </button>
          ) : (
            <button
              type="button"
              disabled={
                !job ||
                !characterCardRegion ||
                !characterCardReferenceFile ||
                characterCardDrawMode
              }
              onClick={() => void startCharacterCardReferenceScan()}
              className="rounded-md bg-violet-300 px-2.5 py-1.5 text-xs font-bold text-slate-950 hover:bg-violet-200 disabled:cursor-not-allowed disabled:opacity-40"
            >
              Quét toàn video
            </button>
          )}
        </div>
        {characterCardReferenceScanJob?.status === "running" && (
          <div className="space-y-1" role="status">
            <div className="flex justify-between gap-2 text-[10px] text-slate-300">
              <span>{characterCardReferenceScanJob.message}</span>
              <span>{characterCardReferenceScanJob.progressPercent}%</span>
            </div>
            <div className="h-1 overflow-hidden rounded bg-slate-800">
              <div
                className="h-full bg-violet-300 transition-[width]"
                style={{
                  width: `${characterCardReferenceScanJob.progressPercent}%`,
                }}
              />
            </div>
          </div>
        )}
        {characterCardReferenceScanJob?.status === "completed" && (
          <p className="text-[10px] text-emerald-200" role="status">
            {characterCardReferenceScanJob.message}
          </p>
        )}
        {characterCardReferenceScanJob?.status === "error" && (
          <p className="text-[10px] text-rose-300" role="alert">
            {characterCardReferenceScanJob.error ||
              characterCardReferenceScanJob.message}
          </p>
        )}
        {characterCardReferenceError && (
          <p className="text-[10px] text-rose-300" role="alert">
            {characterCardReferenceError}
          </p>
        )}
      </div>
    </div>
  );
}
