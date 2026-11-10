import { useState } from "react";
import { AlertCircle, Cpu, Download, LoaderCircle } from "lucide-react";

async function readJson(response: Response) {
  if (!response.headers.get("content-type")?.includes("application/json")) {
    throw new Error(`Máy chủ không trả về JSON (HTTP ${response.status}).`);
  }
  const body = await response.json();
  if (!response.ok || !body.success) {
    throw new Error(body.error || "Không thể chạy trình cài đặt Whisper GPU.");
  }
  return body;
}

export default function WhisperGpuSetupPanel() {
  const [running, setRunning] = useState(false);
  const [message, setMessage] = useState("");
  const [error, setError] = useState("");

  const install = async () => {
    setRunning(true);
    setError("");
    setMessage("");
    try {
      const body = await readJson(await fetch("/api/system/install-whisper-gpu-prerequisites", {
        method: "POST",
      }));
      setMessage(body.message || "Đã mở trình cài đặt. Xác nhận hộp thoại UAC để tiếp tục.");
    } catch (reason) {
      setError(reason instanceof Error ? reason.message : String(reason));
    } finally {
      setRunning(false);
    }
  };

  return (
    <section className="overflow-hidden rounded-2xl border border-slate-800 bg-slate-950/35">
      <div className="flex items-start gap-3 border-b border-slate-800 px-4 py-3">
        <div className="mt-0.5 rounded-lg border border-cyan-400/20 bg-cyan-400/10 p-2 text-cyan-300"><Cpu className="h-4 w-4" /></div>
        <div>
          <h3 className="text-sm font-bold text-white">Whisper · Cài thành phần GPU Vulkan</h3>
          <p className="mt-1 text-[11px] leading-relaxed text-slate-500">
            Cài Visual Studio C++ Build Tools, CMake và Vulkan SDK qua winget. Cần kết nối Internet, dung lượng ổ đĩa và quyền Administrator.
          </p>
        </div>
      </div>
      <div className="space-y-3 p-4">
        {error && <div role="alert" className="flex items-start gap-2 rounded-lg border border-rose-500/30 bg-rose-950/30 p-2.5 text-[11px] text-rose-200"><AlertCircle className="mt-0.5 h-3.5 w-3.5 shrink-0" />{error}</div>}
        {message && <p role="status" className="text-[11px] leading-relaxed text-emerald-300">{message}</p>}
        <div className="flex flex-wrap items-center justify-between gap-3">
          <p className="max-w-xl text-[10px] leading-relaxed text-slate-500">
            Windows sẽ hỏi xác nhận UAC và mở cửa sổ cài riêng. Xong xuôi, khởi động lại ứng dụng rồi vào Clone Giọng để build Whisper Vulkan. Driver AMD cần hỗ trợ Vulkan.
          </p>
          <button type="button" onClick={() => void install()} disabled={running} className="inline-flex shrink-0 items-center gap-1.5 rounded-lg bg-cyan-400 px-3 py-2 text-[10px] font-bold text-slate-950 hover:bg-cyan-300 disabled:opacity-50">
            {running ? <LoaderCircle className="h-3 w-3 animate-spin" /> : <Download className="h-3 w-3" />}
            {running ? "Đang mở…" : "Cài thành phần GPU"}
          </button>
        </div>
      </div>
    </section>
  );
}
