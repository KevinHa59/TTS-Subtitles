import { useEffect, useState } from "react";
import { AlertCircle, CheckCircle2, Cpu, Save } from "lucide-react";

type GpuExecutionMode = "auto" | "cpu" | "prefer-gpu";

const modes: Array<{
  id: GpuExecutionMode;
  title: string;
  description: string;
}> = [
  {
    id: "auto",
    title: "Tự động",
    description: "Để từng engine tự chọn backend phù hợp; mặc định dùng GPU nếu backend hỗ trợ.",
  },
  {
    id: "cpu",
    title: "Chỉ CPU",
    description: "Tắt tăng tốc GPU ở Whisper, dịch phụ đề và tách audio Video Dubbing.",
  },
  {
    id: "prefer-gpu",
    title: "Ưu tiên GPU",
    description: "Ưu tiên backend GPU khả dụng; nếu thiếu/hỏng thì fallback theo khả năng của engine.",
  },
];

function isGpuExecutionMode(value: unknown): value is GpuExecutionMode {
  return value === "auto" || value === "cpu" || value === "prefer-gpu";
}

async function readJson(response: Response) {
  if (!response.headers.get("content-type")?.includes("application/json")) {
    throw new Error(`Máy chủ không trả về JSON (HTTP ${response.status}).`);
  }
  const body = await response.json();
  if (!response.ok || !body.success) {
    throw new Error(body.error || "Không thể cập nhật cấu hình GPU.");
  }
  return body;
}

export default function GpuExecutionModePanel() {
  const [mode, setMode] = useState<GpuExecutionMode>("auto");
  const [savedMode, setSavedMode] = useState<GpuExecutionMode | null>(null);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState("");

  useEffect(() => {
    let active = true;
    void fetch("/api/gpu-settings")
      .then(readJson)
      .then((body) => {
        if (!active) return;
        const currentMode: unknown = body.settings?.mode;
        if (!isGpuExecutionMode(currentMode)) {
          throw new Error("Máy chủ trả về chế độ GPU không hợp lệ.");
        }
        setMode(currentMode);
        setSavedMode(currentMode);
      })
      .catch((reason: unknown) => {
        if (active) setError(reason instanceof Error ? reason.message : String(reason));
      })
      .finally(() => {
        if (active) setLoading(false);
      });
    return () => { active = false; };
  }, []);

  const save = async () => {
    setSaving(true);
    setError("");
    try {
      const body = await readJson(await fetch("/api/gpu-settings", {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ mode }),
      }));
      const savedMode: unknown = body.settings?.mode;
      if (!isGpuExecutionMode(savedMode)) {
        throw new Error("Máy chủ trả về chế độ GPU không hợp lệ.");
      }
      setMode(savedMode);
      setSavedMode(savedMode);
    } catch (reason) {
      setError(reason instanceof Error ? reason.message : String(reason));
    } finally {
      setSaving(false);
    }
  };

  return (
    <section className="overflow-hidden rounded-2xl border border-slate-800 bg-slate-950/35">
      <div className="flex items-start gap-3 border-b border-slate-800 px-4 py-3">
        <div className="mt-0.5 rounded-lg border border-cyan-400/20 bg-cyan-400/10 p-2 text-cyan-300"><Cpu className="h-4 w-4" /></div>
        <div>
          <h3 className="text-sm font-bold text-white">Chế độ xử lý GPU</h3>
          <p className="mt-1 text-[11px] text-slate-500">Thiết lập toàn cục được lưu trên máy này.</p>
        </div>
      </div>
      <div className="space-y-3 p-4">
        {error && <div role="alert" className="flex items-start gap-2 rounded-lg border border-rose-500/30 bg-rose-950/30 p-2.5 text-[11px] text-rose-200"><AlertCircle className="mt-0.5 h-3.5 w-3.5 shrink-0" />{error}</div>}
        <div className="grid gap-2 md:grid-cols-3">
          {modes.map((item) => (
            <label key={item.id} className={`cursor-pointer rounded-xl border p-3 transition-colors ${mode === item.id ? "border-cyan-500/50 bg-cyan-500/5" : "border-slate-800 bg-slate-900/50 hover:border-slate-700"}`}>
              <span className="flex items-center gap-2 text-xs font-semibold text-slate-200">
                <input type="radio" name="gpu-execution-mode" value={item.id} checked={mode === item.id} onChange={() => setMode(item.id)} disabled={loading || saving} className="accent-cyan-400" />
                {item.title}
              </span>
              <span className="mt-2 block text-[10px] leading-relaxed text-slate-500">{item.description}</span>
            </label>
          ))}
        </div>
        <div className="flex flex-wrap items-center justify-between gap-3">
          <p className="text-[10px] leading-relaxed text-slate-500">
            Áp dụng cho Whisper Vulkan, llama.cpp và tách audio. GPU/driver được chọn bởi backend riêng; OCR và tạo nhạc hiện vẫn chạy CPU. Chế độ này chưa chọn được card cụ thể.
            {" "}Tác vụ mới dùng chế độ đã lưu; nếu engine dịch phụ đề đang chạy, hãy dừng rồi nạp lại engine.
          </p>
          <button type="button" onClick={() => void save()} disabled={loading || saving || savedMode === mode} className="inline-flex shrink-0 items-center gap-1.5 rounded-lg bg-cyan-400 px-3 py-2 text-[10px] font-bold text-slate-950 hover:bg-cyan-300 disabled:cursor-not-allowed disabled:opacity-40">
            {savedMode === mode && !loading ? <CheckCircle2 className="h-3 w-3" /> : <Save className="h-3 w-3" />}
            {loading ? "Đang tải…" : saving ? "Đang lưu…" : savedMode === mode ? "Đã lưu" : "Lưu chế độ"}
          </button>
        </div>
      </div>
    </section>
  );
}
