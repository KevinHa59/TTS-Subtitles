import { useEffect, useRef, useState } from "react";
import {
  AlertCircle,
  CheckCircle2,
  Download,
  LoaderCircle,
  Play,
  Save,
  Settings,
  Square,
  Trash2,
  X,
} from "lucide-react";
import SetupModelDownloads from "./SetupModelDownloads";
import GpuExecutionModePanel from "./GpuExecutionModePanel";
import WhisperGpuSetupPanel from "./WhisperGpuSetupPanel";

type TranslationConfig = {
  selectedModel: string;
  sourceLanguage: string;
  targetLanguage: string;
  genre: string;
  tone: string;
  rules: string;
};
type TranslationState = {
  engine: { installed: boolean; version: string | null; running: boolean; ready: boolean; message: string };
  models: Array<{ id: string; name: string; bytes: number; downloaded: boolean; recommendation: string }>;
  config: TranslationConfig;
  configError?: string;
  download: {
    status: "idle" | "running" | "error" | "ready" | "cancelled";
    target: string | null;
    progressPercent: number | null;
    downloadedBytes: number;
    totalBytes: number;
    message: string;
    error?: string;
  };
};
type OcrInstallState = {
  status: "not_installed" | "running" | "ready" | "error" | "cancelled";
  progressPercent: number | null;
  message: string;
  error?: string;
  runtimeReady: boolean;
  modelsReady: boolean;
};

const emptyConfig: TranslationConfig = {
  selectedModel: "qwen3-4b",
  sourceLanguage: "English",
  targetLanguage: "Vietnamese",
  genre: "",
  tone: "",
  rules: "",
};

function formatBytes(bytes: number) {
  if (bytes >= 1024 ** 3) return `${(bytes / 1024 ** 3).toFixed(2)} GB`;
  return `${(bytes / 1024 ** 2).toFixed(0)} MB`;
}

export default function SubtitleTranslationSetupModal({ open, onClose }: { open: boolean; onClose: () => void }) {
  const [state, setState] = useState<TranslationState | null>(null);
  const [ocrState, setOcrState] = useState<OcrInstallState | null>(null);
  const [config, setConfig] = useState<TranslationConfig>(emptyConfig);
  const [error, setError] = useState("");
  const [notice, setNotice] = useState("");
  const [pendingAction, setPendingAction] = useState("");
  const configLoaded = useRef(false);

  useEffect(() => {
    if (!open) return;
    let live = true;
    configLoaded.current = false;
    const poll = async () => {
      try {
        const [response, ocrResponse] = await Promise.all([
          fetch("/api/subtitle-translation/state"),
          fetch("/api/subtitle-ocr/install/status"),
        ]);
        const [body, ocrBody] = await Promise.all([response.json(), ocrResponse.json()]);
        if (!response.ok || !body.success) throw new Error(body.error || "Không lấy được trạng thái cài đặt.");
        if (!ocrResponse.ok || !ocrBody.success) throw new Error(ocrBody.error || "Không lấy được trạng thái cài OCR.");
        if (!live) return;
        const nextState = body.state as TranslationState;
        setState(nextState);
        setOcrState(ocrBody as OcrInstallState);
        if (!configLoaded.current) {
          setConfig(nextState.config);
          configLoaded.current = true;
        }
        setError(nextState.configError || "");
      } catch (reason) {
        if (live) setError(reason instanceof Error ? reason.message : String(reason));
      }
    };
    void poll();
    const timer = window.setInterval(() => { void poll(); }, 1200);
    return () => { live = false; window.clearInterval(timer); };
  }, [open]);

  const request = async (url: string, options?: RequestInit) => {
    const response = await fetch(url, options);
    const body = await response.json();
    if (!response.ok || !body.success) throw new Error(body.error || "Yêu cầu không thành công.");
    if (body.state) setState(body.state as TranslationState);
    return body;
  };

  const runAction = async (action: string, task: () => Promise<unknown>) => {
    setPendingAction(action);
    setError("");
    setNotice("");
    try {
      await task();
      setNotice("Đã cập nhật.");
    } catch (reason) {
      setError(reason instanceof Error ? reason.message : String(reason));
    } finally {
      setPendingAction("");
    }
  };

  const saveConfig = () => runAction("save", async () => {
    const body = await request("/api/subtitle-translation/config", {
      method: "PUT",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(config),
    });
    setConfig(body.config as TranslationConfig);
  });

  const download = (target: string) => runAction(target, () => request("/api/subtitle-translation/download", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ target }),
  }));

  const deleteModel = (modelId: string, modelName: string) => {
    if (!window.confirm(`Xóa model ${modelName} khỏi máy?`)) return;
    void runAction(`delete:${modelId}`, () => request(`/api/subtitle-translation/models/${modelId}`, { method: "DELETE" }));
  };

  const runOcrInstall = () => runAction("ocr-install", async () => {
    const body = await request("/api/subtitle-ocr/install", { method: "POST" });
    if (body.status) setOcrState(body.status as OcrInstallState);
  });

  const cancelOcrInstall = () => runAction("ocr-cancel", async () => {
    const body = await request("/api/subtitle-ocr/install/cancel", { method: "POST" });
    if (body.status) setOcrState(body.status as OcrInstallState);
  });

  if (!open) return null;

  const downloading = state?.download.status === "running";
  const selectedModel = state?.models.find((model) => model.id === config.selectedModel);
  const canStart = Boolean(state?.engine.installed && selectedModel?.downloaded && !state?.engine.ready);

  return (
    <div className="fixed inset-0 z-[120] flex items-center justify-center bg-slate-950/80 p-3 backdrop-blur-sm sm:p-5" onMouseDown={(event) => { if (event.target === event.currentTarget) onClose(); }}>
      <section role="dialog" aria-modal="true" aria-labelledby="subtitle-setup-title" className="flex max-h-[92vh] w-full max-w-3xl flex-col overflow-hidden rounded-2xl border border-slate-700 bg-slate-900 shadow-2xl">
        <div className="flex items-start justify-between gap-4 border-b border-slate-800 px-5 py-4">
          <div className="flex items-start gap-3">
            <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl border border-amber-400/20 bg-amber-400/10 text-amber-300"><Settings className="h-5 w-5" /></div>
            <div><h2 id="subtitle-setup-title" className="text-base font-bold text-white">Setup</h2><p className="mt-1 text-xs text-slate-400">Cài đặt được nhóm theo panel để dễ mở rộng.</p></div>
          </div>
          <button type="button" onClick={onClose} className="rounded-lg p-2 text-slate-400 transition-colors hover:bg-slate-800 hover:text-white" aria-label="Đóng Setup"><X className="h-4 w-4" /></button>
        </div>

        <div className="space-y-4 overflow-y-auto p-4 sm:p-5">
          {error && <div role="alert" className="flex items-start gap-2 rounded-xl border border-rose-500/30 bg-rose-950/30 p-3 text-xs text-rose-200"><AlertCircle className="mt-0.5 h-4 w-4 shrink-0" /><span className="whitespace-pre-wrap">{error}</span></div>}
          {notice && !error && <div className="flex items-center gap-2 rounded-xl border border-emerald-500/20 bg-emerald-500/5 p-3 text-xs text-emerald-300"><CheckCircle2 className="h-4 w-4" />{notice}</div>}

          <GpuExecutionModePanel />
          <WhisperGpuSetupPanel />

          <section className="overflow-hidden rounded-2xl border border-slate-800 bg-slate-950/35">
            <div className="flex flex-wrap items-center justify-between gap-3 border-b border-slate-800 px-4 py-3">
              <div><h3 className="text-sm font-bold text-white">Nhận diện phụ đề · PaddleOCR</h3><p className="mt-1 text-[11px] text-slate-500">PP-OCRv5 Mobile · chạy cục bộ trên CPU.</p></div>
              <span className={`inline-flex items-center gap-1.5 rounded-full border px-2.5 py-1 text-[10px] ${ocrState?.status === "ready" ? "border-emerald-500/30 bg-emerald-500/10 text-emerald-300" : ocrState?.status === "running" ? "border-cyan-500/30 bg-cyan-500/10 text-cyan-300" : ocrState?.status === "error" ? "border-rose-500/30 bg-rose-500/10 text-rose-300" : "border-slate-700 bg-slate-900 text-slate-400"}`}>
                {ocrState?.status === "ready" ? <CheckCircle2 className="h-3 w-3" /> : ocrState?.status === "running" ? <LoaderCircle className="h-3 w-3 animate-spin" /> : <Settings className="h-3 w-3" />}
                {ocrState?.status === "ready" ? "Sẵn sàng" : ocrState?.status === "running" ? "Đang cài" : ocrState?.status === "error" ? "Cài đặt gặp lỗi" : "Chưa cài đủ"}
              </span>
            </div>
            <div className="space-y-3 p-4">
              <div className="grid gap-2 text-[11px] sm:grid-cols-2">
                <div className="rounded-lg border border-slate-800 bg-slate-900/60 p-3"><span className="text-slate-400">PaddleOCR runtime</span><div className={`mt-1 font-semibold ${ocrState?.runtimeReady ? "text-emerald-300" : "text-slate-500"}`}>{ocrState?.runtimeReady ? "Đã cài" : "Chưa cài"}</div></div>
                <div className="rounded-lg border border-slate-800 bg-slate-900/60 p-3"><span className="text-slate-400">Detection + Recognition</span><div className={`mt-1 font-semibold ${ocrState?.modelsReady ? "text-emerald-300" : "text-slate-500"}`}>{ocrState?.modelsReady ? "Đã tải đủ model" : "Chưa đủ model"}</div></div>
              </div>
              {ocrState?.status === "running" && <div><div className="mb-2 flex items-center justify-between gap-3 text-[10px] text-slate-400"><span className="truncate">{ocrState.message}</span>{ocrState.progressPercent != null && <span className="shrink-0 font-mono text-cyan-300">{ocrState.progressPercent}%</span>}</div><div className="h-1.5 overflow-hidden rounded-full bg-slate-800"><div className={`h-full bg-cyan-400 transition-all ${ocrState.progressPercent == null ? "w-1/3 animate-pulse" : ""}`} style={ocrState.progressPercent == null ? undefined : { width: `${ocrState.progressPercent}%` }} /></div></div>}
              {ocrState?.status === "error" && ocrState.error && <pre className="max-h-28 overflow-auto whitespace-pre-wrap rounded-xl border border-rose-500/20 bg-rose-950/20 p-3 text-[10px] text-rose-200">{ocrState.error}</pre>}
              <div className="flex flex-wrap items-center justify-between gap-3">
                <p className="text-[10px] text-slate-500">{ocrState?.message || "Đang lấy trạng thái OCR…"}</p>
                {ocrState?.status === "running"
                  ? <button type="button" disabled={Boolean(pendingAction)} onClick={() => void cancelOcrInstall()} className="inline-flex items-center gap-1.5 rounded-lg border border-rose-500/30 bg-rose-500/10 px-3 py-2 text-[10px] font-semibold text-rose-200 disabled:opacity-50"><X className="h-3 w-3" />Hủy cài đặt</button>
                  : ocrState?.status !== "ready" && <button type="button" disabled={Boolean(pendingAction) || !ocrState} onClick={() => void runOcrInstall()} className="inline-flex items-center gap-1.5 rounded-lg bg-cyan-400 px-3 py-2 text-[10px] font-bold text-slate-950 hover:bg-cyan-300 disabled:opacity-50"><Download className="h-3 w-3" />{ocrState?.status === "error" || ocrState?.status === "cancelled" ? "Thử cài lại" : ocrState?.modelsReady ? "Cập nhật thư viện OCR" : "Tải và cài bộ nhận diện"}</button>}
              </div>
              <p className="text-[10px] leading-relaxed text-slate-500">PaddleOCR dùng môi trường Python riêng (3.10–3.12), không thay đổi Python, model hay dữ liệu project khác.</p>
            </div>
          </section>

          <SetupModelDownloads />

          <section className="overflow-hidden rounded-2xl border border-slate-800 bg-slate-950/35">
            <div className="flex flex-wrap items-center justify-between gap-3 border-b border-slate-800 px-4 py-3">
              <div><h3 className="text-sm font-bold text-white">Dịch phụ đề · Engine & model</h3><p className="mt-1 text-[11px] text-slate-500">llama.cpp Vulkan chạy cục bộ trên máy này.</p></div>
              <span className={`inline-flex items-center gap-1.5 rounded-full border px-2.5 py-1 text-[10px] ${state?.engine.ready ? "border-emerald-500/30 bg-emerald-500/10 text-emerald-300" : state?.engine.installed ? "border-cyan-500/30 bg-cyan-500/10 text-cyan-300" : "border-slate-700 bg-slate-900 text-slate-400"}`}>
                {state?.engine.ready ? <CheckCircle2 className="h-3 w-3" /> : state?.download.status === "running" ? <LoaderCircle className="h-3 w-3 animate-spin" /> : <Settings className="h-3 w-3" />}
                {state?.engine.ready ? "Engine đang chạy" : state?.engine.installed ? "Engine đã cài" : "Chưa cài engine"}
              </span>
            </div>
            <div className="space-y-4 p-4">
              <div className="flex flex-wrap items-center justify-between gap-3 rounded-xl border border-slate-800 bg-slate-900/60 p-3">
                <div className="min-w-0"><div className="text-xs font-semibold text-slate-200">llama.cpp Vulkan x64 {state?.engine.version ? `· ${state.engine.version}` : ""}</div><div className="mt-1 text-[10px] text-slate-500">{state?.engine.message || "Đang kiểm tra trạng thái…"}</div></div>
                <div className="flex shrink-0 gap-2">
                  {!state?.engine.installed && <button type="button" disabled={Boolean(pendingAction) || downloading} onClick={() => void download("engine")} className="inline-flex items-center gap-1.5 rounded-lg bg-cyan-400 px-3 py-2 text-[11px] font-bold text-slate-950 hover:bg-cyan-300 disabled:opacity-50"><Download className="h-3.5 w-3.5" />Tải engine</button>}
                  {state?.engine.ready ? <button type="button" disabled={Boolean(pendingAction)} onClick={() => void runAction("stop", () => request("/api/subtitle-translation/engine/stop", { method: "POST" }))} className="inline-flex items-center gap-1.5 rounded-lg border border-rose-500/30 bg-rose-500/10 px-3 py-2 text-[11px] font-semibold text-rose-200 hover:bg-rose-500/20"><Square className="h-3 w-3" />Dừng</button> : state?.engine.installed && <button type="button" disabled={!canStart || Boolean(pendingAction)} onClick={() => void runAction("start", () => request("/api/subtitle-translation/engine/start", { method: "POST" }))} className="inline-flex items-center gap-1.5 rounded-lg border border-cyan-500/30 bg-cyan-500/10 px-3 py-2 text-[11px] font-semibold text-cyan-200 hover:bg-cyan-500/20 disabled:opacity-40"><Play className="h-3.5 w-3.5" />Nạp model</button>}
                </div>
              </div>

              {state?.download.status === "running" && (
                <div className="rounded-xl border border-cyan-500/20 bg-cyan-500/5 p-3">
                  <div className="mb-2 flex items-center justify-between gap-2 text-[11px] text-slate-300"><span className="truncate">{state.download.message}</span><span className="shrink-0 font-mono text-cyan-300">{state.download.progressPercent == null ? `${formatBytes(state.download.downloadedBytes)}${state.download.totalBytes ? ` / ${formatBytes(state.download.totalBytes)}` : ""}` : `${state.download.progressPercent}%`}</span></div>
                  <div className="h-1.5 overflow-hidden rounded-full bg-slate-800"><div className={`h-full bg-cyan-400 transition-all ${state.download.progressPercent == null ? "w-1/4 animate-pulse" : ""}`} style={state.download.progressPercent == null ? undefined : { width: `${state.download.progressPercent}%` }} /></div>
                  <button type="button" onClick={() => void runAction("cancel", () => request("/api/subtitle-translation/download/cancel", { method: "POST" }))} className="mt-2 text-[10px] text-rose-300 hover:text-rose-200">Hủy tải xuống</button>
                </div>
              )}
              {state?.download.status === "error" && state.download.error && <pre className="max-h-28 overflow-auto whitespace-pre-wrap rounded-xl border border-rose-500/20 bg-rose-950/20 p-3 text-[10px] text-rose-200">{state.download.error}</pre>}

              <div className="grid gap-2 sm:grid-cols-3">
                {state?.models.map((model) => (
                  <div key={model.id} className={`rounded-xl border p-3 transition-colors ${config.selectedModel === model.id ? "border-cyan-500/50 bg-cyan-500/5" : "border-slate-800 bg-slate-900/50"}`}>
                    <label className="flex cursor-pointer items-start gap-2">
                      <input type="radio" name="qwen-model" checked={config.selectedModel === model.id} onChange={() => setConfig((current) => ({ ...current, selectedModel: model.id }))} className="mt-0.5 accent-cyan-400" />
                      <span className="min-w-0"><span className="block text-xs font-semibold text-white">{model.name}</span><span className="mt-1 block text-[10px] text-slate-400">{formatBytes(model.bytes)} · {model.recommendation}</span></span>
                    </label>
                    <div className="mt-3 flex items-center justify-between gap-2">
                      <span className={`text-[10px] ${model.downloaded ? "text-emerald-300" : "text-slate-500"}`}>{model.downloaded ? "Đã tải" : "Chưa tải"}</span>
                      {model.downloaded ? <button type="button" disabled={Boolean(pendingAction) || downloading} onClick={() => deleteModel(model.id, model.name)} className="inline-flex items-center gap-1 rounded-md px-2 py-1 text-[10px] text-rose-300 hover:bg-rose-500/10 disabled:opacity-50"><Trash2 className="h-3 w-3" />Xóa</button> : <button type="button" disabled={Boolean(pendingAction) || downloading} onClick={() => void download(model.id)} className="inline-flex items-center gap-1 rounded-md px-2 py-1 text-[10px] font-semibold text-cyan-300 hover:bg-cyan-500/10 disabled:opacity-40"><Download className="h-3 w-3" />Tải model</button>}
                    </div>
                  </div>
                ))}
              </div>
              <p className="text-[10px] leading-relaxed text-slate-500">Model được tải từ kho GGUF của Qwen trên Hugging Face. Qwen3 4B là lựa chọn phù hợp để bắt đầu với GPU Intel Arc 6 GB; dung lượng cần trống xấp xỉ dung lượng hiển thị.</p>
            </div>
          </section>

          <section className="overflow-hidden rounded-2xl border border-slate-800 bg-slate-950/35">
            <div className="flex items-center justify-between gap-3 border-b border-slate-800 px-4 py-3"><div><h3 className="text-sm font-bold text-white">Phong cách dịch & prompt</h3><p className="mt-1 text-[11px] text-slate-500">Thiết lập được lưu cục bộ và dùng cho các lần dịch tiếp theo.</p></div><LanguagesIcon /></div>
            <div className="grid gap-3 p-4 sm:grid-cols-2">
              <label className="space-y-1.5 text-[11px] text-slate-400">Ngôn ngữ nguồn<input value={config.sourceLanguage} onChange={(event) => setConfig((current) => ({ ...current, sourceLanguage: event.target.value }))} maxLength={80} className="w-full rounded-lg border border-slate-700 bg-slate-900 px-3 py-2 text-xs text-white outline-none focus:border-cyan-500" placeholder="English" /></label>
              <label className="space-y-1.5 text-[11px] text-slate-400">Ngôn ngữ đích<input value={config.targetLanguage} onChange={(event) => setConfig((current) => ({ ...current, targetLanguage: event.target.value }))} maxLength={80} className="w-full rounded-lg border border-slate-700 bg-slate-900 px-3 py-2 text-xs text-white outline-none focus:border-cyan-500" placeholder="Vietnamese" /></label>
              <label className="space-y-1.5 text-[11px] text-slate-400">Thể loại phim<input value={config.genre} onChange={(event) => setConfig((current) => ({ ...current, genre: event.target.value }))} maxLength={500} className="w-full rounded-lg border border-slate-700 bg-slate-900 px-3 py-2 text-xs text-white outline-none focus:border-cyan-500" placeholder="Ví dụ: phim trinh thám, hài lãng mạn…" /></label>
              <label className="space-y-1.5 text-[11px] text-slate-400">Phong cách lời thoại<input value={config.tone} onChange={(event) => setConfig((current) => ({ ...current, tone: event.target.value }))} maxLength={500} className="w-full rounded-lg border border-slate-700 bg-slate-900 px-3 py-2 text-xs text-white outline-none focus:border-cyan-500" placeholder="Ví dụ: tự nhiên, ngắn gọn, xưng hô thân mật…" /></label>
              <label className="space-y-1.5 text-[11px] text-slate-400 sm:col-span-2">Quy tắc dịch<textarea value={config.rules} onChange={(event) => setConfig((current) => ({ ...current, rules: event.target.value }))} maxLength={4000} rows={4} className="w-full resize-y rounded-lg border border-slate-700 bg-slate-900 px-3 py-2 text-xs leading-relaxed text-white outline-none focus:border-cyan-500" placeholder={"Ví dụ:\n- Giữ nguyên tên riêng.\n- Dùng đại từ phù hợp quan hệ nhân vật.\n- Ưu tiên câu ngắn, dễ đọc trên phụ đề."} /></label>
              <div className="flex items-center justify-between gap-3 sm:col-span-2">
                <p className="text-[10px] text-slate-500">Bản dịch giữ nguyên nội dung OCR gốc và mốc thời gian.</p>
                <button type="button" onClick={() => void saveConfig()} disabled={Boolean(pendingAction) || !config.sourceLanguage.trim() || !config.targetLanguage.trim()} className="inline-flex shrink-0 items-center gap-1.5 rounded-lg bg-cyan-400 px-3 py-2 text-[11px] font-bold text-slate-950 hover:bg-cyan-300 disabled:opacity-50"><Save className="h-3.5 w-3.5" />Lưu thiết lập</button>
              </div>
            </div>
          </section>
        </div>
      </section>
    </div>
  );
}

function LanguagesIcon() {
  return <span className="rounded-lg border border-cyan-400/20 bg-cyan-400/10 px-2 py-1 text-[10px] font-semibold text-cyan-300">Qwen</span>;
}
