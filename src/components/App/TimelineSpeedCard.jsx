import { ChevronDown, Layers, Scissors, Settings } from "lucide-react";

export default function TimelineSpeedCard({
  activeJob,
  batchSizeChoice,
  customBatchSize,
  effectiveBatchSize,
  maxSpeed,
  minSpeed,
  outputFormat,
  setBatchSizeChoice,
  setCustomBatchSize,
  setMaxSpeed,
  setMinSpeed,
  setOutputFormat,
  setShowSettingsDrawer,
  setSpeedPriority,
  setTrimEndMs,
  setTrimStartMs,
  setVideoDurationStr,
  showSettingsDrawer,
  speedPriority,
  trimEndMs,
  trimStartMs,
  videoDurationStr,
}) {
  return (
    <div className="p-3 bg-slate-900/20 space-y-3 text-xs rounded-none">
      <div className="flex items-center justify-between">
        <span className="font-semibold uppercase tracking-wider text-slate-400 flex items-center gap-1.5">
          <Settings className="w-4 h-4 text-amber-400" />
          Cấu hình Timeline & Tốc độ
        </span>
        <button
          type="button"
          onClick={() => setShowSettingsDrawer(!showSettingsDrawer)}
          className="text-slate-400 hover:text-white"
        >
          <ChevronDown
            className={`w-4 h-4 transition-transform ${showSettingsDrawer ? "rotate-180" : ""}`}
          />
        </button>
      </div>

      {showSettingsDrawer && (
        <div className="space-y-4 pt-1">
          {/* Batch Size Selector */}
          <div className="p-3 bg-slate-950/80 rounded-xl border border-slate-800 space-y-2">
            <div className="flex items-center justify-between">
              <span className="text-slate-200 font-semibold flex items-center gap-1">
                <Layers className="w-3.5 h-3.5 text-amber-400" />
                Batch Size:
              </span>
              <span className="text-amber-400 font-mono font-bold">
                {effectiveBatchSize} câu song song
              </span>
            </div>
            <div className="grid grid-cols-3 gap-1 bg-slate-900 p-1 rounded-xl border border-slate-800">
              {["1", "2", "4", "8", "16", "custom"].map((opt) => (
                <button
                  key={opt}
                  type="button"
                  disabled={activeJob?.status === "running"}
                  onClick={() => setBatchSizeChoice(opt)}
                  className={`py-1 rounded-lg text-center font-medium transition-colors ${
                    batchSizeChoice === opt
                      ? "bg-amber-500 text-slate-950 font-bold shadow"
                      : "text-slate-400 hover:text-white"
                  } ${activeJob?.status === "running" ? "opacity-50 cursor-not-allowed" : ""}`}
                >
                  {opt === "1"
                    ? "1 (Tuần tự)"
                    : opt === "custom"
                      ? "Tùy chỉnh"
                      : `${opt} câu`}
                </button>
              ))}
            </div>
            {batchSizeChoice === "custom" && (
              <div className="flex items-center gap-2 pt-1">
                <span className="text-slate-400 text-[11px]">Nhập số câu:</span>
                <input
                  type="number"
                  min="1"
                  max="32"
                  value={customBatchSize}
                  onChange={(e) =>
                    setCustomBatchSize(
                      Math.max(1, Math.min(32, parseInt(e.target.value) || 1)),
                    )
                  }
                  className="w-20 bg-slate-900 border border-slate-700 rounded-lg px-2 py-0.5 text-slate-100 font-mono text-xs focus:ring-1 focus:ring-amber-500"
                />
              </div>
            )}
          </div>

          {/* Max Speed */}
          <div className="space-y-1.5">
            <div className="flex justify-between">
              <span className="text-slate-300 font-medium">
                Tốc độ tối đa (Max Speed):
              </span>
              <span className="text-amber-400 font-mono font-semibold">
                {maxSpeed.toFixed(2)}x
              </span>
            </div>
            <input
              type="range"
              min="0.9"
              max="3.0"
              step="0.05"
              value={maxSpeed}
              onChange={(e) => {
                const value = parseFloat(e.target.value);
                setMaxSpeed(value);
                setMinSpeed((current) => Math.min(current, value));
              }}
              className="w-full accent-amber-500 h-1.5 bg-slate-800 rounded cursor-pointer"
            />
            <span className="text-[10px] text-slate-400 block">
              Giới hạn tăng tốc tối đa (0.9x - 3.0x)
            </span>
          </div>

          {/* Min Speed */}
          <div className="space-y-1.5">
            <div className="flex justify-between">
              <span className="text-slate-300 font-medium">
                Tốc độ tối thiểu (Min Speed):
              </span>
              <span className="text-amber-400 font-mono font-semibold">
                {minSpeed.toFixed(2)}x
              </span>
            </div>
            <input
              type="range"
              min="0.6"
              max="1.5"
              step="0.05"
              value={minSpeed}
              onChange={(e) => {
                const value = parseFloat(e.target.value);
                setMinSpeed(value);
                setMaxSpeed((current) => Math.max(current, value));
              }}
              className="w-full accent-amber-500 h-1.5 bg-slate-800 rounded cursor-pointer"
            />
            <span className="text-[10px] text-slate-400 block">
              Giới hạn giảm tốc khi câu ngắn (0.6x - 1.5x)
            </span>
          </div>

          {/* Trim Silence (Cắt khoảng trắng đầu / đuôi câu) */}
          <div className="p-3 bg-slate-950/80 rounded-xl border border-slate-800 space-y-2.5">
            <div className="flex items-center justify-between">
              <span className="text-slate-200 font-semibold flex items-center gap-1.5 text-xs">
                <Scissors className="w-3.5 h-3.5 text-amber-400" />
                <span>Cắt khoảng trắng (Trim Audio):</span>
              </span>
              {(trimStartMs > 0 || trimEndMs > 0) && (
                <span className="text-[10px] text-amber-300 font-mono font-bold px-1.5 py-0.5 rounded bg-amber-500/15 border border-amber-500/30">
                  -{trimStartMs}ms / -{trimEndMs}ms
                </span>
              )}
            </div>

            <div className="grid grid-cols-2 gap-2 text-xs">
              {/* Trim Start */}
              <div className="space-y-1">
                <label className="text-[11px] text-slate-300 flex items-center justify-between">
                  <span>Đầu câu (ms):</span>
                  <span className="text-amber-400 font-mono font-semibold">
                    {trimStartMs}ms
                  </span>
                </label>
                <input
                  type="number"
                  min="0"
                  max="2000"
                  step="10"
                  value={trimStartMs}
                  onChange={(e) =>
                    setTrimStartMs(Math.max(0, parseInt(e.target.value) || 0))
                  }
                  className="w-full bg-slate-900 border border-slate-700 rounded-lg px-2.5 py-1 text-slate-100 font-mono text-xs focus:ring-1 focus:ring-amber-500"
                  placeholder="0"
                />
              </div>

              {/* Trim End */}
              <div className="space-y-1">
                <label className="text-[11px] text-slate-300 flex items-center justify-between">
                  <span>Cuối câu (ms):</span>
                  <span className="text-amber-400 font-mono font-semibold">
                    {trimEndMs}ms
                  </span>
                </label>
                <input
                  type="number"
                  min="0"
                  max="2000"
                  step="10"
                  value={trimEndMs}
                  onChange={(e) =>
                    setTrimEndMs(Math.max(0, parseInt(e.target.value) || 0))
                  }
                  className="w-full bg-slate-900 border border-slate-700 rounded-lg px-2.5 py-1 text-slate-100 font-mono text-xs focus:ring-1 focus:ring-amber-500"
                  placeholder="0"
                />
              </div>
            </div>

            {/* Quick preset buttons for common trim values */}
            <div className="flex items-center gap-1 pt-0.5 flex-wrap">
              <span className="text-[10px] text-slate-500">Mẫu:</span>
              <button
                type="button"
                onClick={() => {
                  setTrimStartMs(0);
                  setTrimEndMs(0);
                }}
                className={`px-1.5 py-0.5 rounded text-[10px] transition-colors cursor-pointer ${
                  trimStartMs === 0 && trimEndMs === 0
                    ? "bg-amber-500 text-slate-950 font-bold"
                    : "bg-slate-900 text-slate-400 hover:text-white"
                }`}
              >
                0ms
              </button>
              <button
                type="button"
                onClick={() => {
                  setTrimStartMs(50);
                  setTrimEndMs(80);
                }}
                className={`px-1.5 py-0.5 rounded text-[10px] transition-colors cursor-pointer ${
                  trimStartMs === 50 && trimEndMs === 80
                    ? "bg-amber-500 text-slate-950 font-bold"
                    : "bg-slate-900 text-slate-400 hover:text-white"
                }`}
              >
                50/80ms
              </button>
              <button
                type="button"
                onClick={() => {
                  setTrimStartMs(100);
                  setTrimEndMs(150);
                }}
                className={`px-1.5 py-0.5 rounded text-[10px] transition-colors cursor-pointer ${
                  trimStartMs === 100 && trimEndMs === 150
                    ? "bg-amber-500 text-slate-950 font-bold"
                    : "bg-slate-900 text-slate-400 hover:text-white"
                }`}
              >
                100/150ms
              </button>
              <button
                type="button"
                onClick={() => {
                  setTrimStartMs(150);
                  setTrimEndMs(200);
                }}
                className={`px-1.5 py-0.5 rounded text-[10px] transition-colors cursor-pointer ${
                  trimStartMs === 150 && trimEndMs === 200
                    ? "bg-amber-500 text-slate-950 font-bold"
                    : "bg-slate-900 text-slate-400 hover:text-white"
                }`}
              >
                150/200ms
              </button>
            </div>

            <span className="text-[10px] text-slate-400 block leading-tight">
              Thứ tự xử lý:{" "}
              <strong>1. TTS ➔ 2. Trim ➔ 3. Co giãn tốc độ</strong>. Cắt bỏ
              khoảng lặng thừa ở đầu và đuôi trước khi đo thời lượng để âm thanh
              dứt khoát và đúng nhịp phụ đề hơn.
            </span>
          </div>

          {/* Priority */}
          <div className="space-y-1.5">
            <span className="text-slate-300 font-medium block">
              Mức độ ưu tiên:
            </span>
            <select
              value={speedPriority}
              onChange={(e) => setSpeedPriority(e.target.value)}
              className="w-full bg-slate-950 border border-slate-700 rounded-lg p-2 text-slate-200"
            >
              <option value="balanced">Cân bằng (Khuyên dùng)</option>
              <option value="natural">
                Ưu tiên Giọng Tự Nhiên (Max 1.15x)
              </option>
              <option value="strict">Ưu tiên Khớp Timeline Tuyệt Đối</option>
            </select>
          </div>

          {/* Target Video Duration & Format */}
          <div className="space-y-1.5">
            <span className="text-slate-300 font-medium block">
              Thời lượng video (Tùy chọn):
            </span>
            <input
              type="text"
              placeholder="00:05:00 hoặc số giây"
              value={videoDurationStr}
              onChange={(e) => setVideoDurationStr(e.target.value)}
              className="w-full bg-slate-950 border border-slate-700 rounded-lg p-2 text-slate-200 placeholder:text-slate-600 font-mono"
            />
          </div>

          <div className="flex items-center justify-between pt-1 border-t border-slate-800">
            <span className="text-slate-400">Định dạng file xuất:</span>
            <div className="flex gap-1.5">
              <button
                type="button"
                onClick={() => setOutputFormat("mp3")}
                className={`px-2.5 py-1 rounded text-xs font-semibold ${
                  outputFormat === "mp3"
                    ? "bg-amber-500 text-slate-950 font-bold"
                    : "bg-slate-800 text-slate-300"
                }`}
              >
                MP3
              </button>
              <button
                type="button"
                onClick={() => setOutputFormat("wav")}
                className={`px-2.5 py-1 rounded text-xs font-semibold ${
                  outputFormat === "wav"
                    ? "bg-amber-500 text-slate-950 font-bold"
                    : "bg-slate-800 text-slate-300"
                }`}
              >
                WAV
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
