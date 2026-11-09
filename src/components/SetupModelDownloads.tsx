import { useCallback, useEffect, useState } from "react";
import {
  AlertCircle,
  CheckCircle2,
  Download,
  LoaderCircle,
  RefreshCw,
  Trash2,
  X,
} from "lucide-react";
import type { BgmSystemStatus } from "../types/bgm";

interface WhisperModel {
  id: string;
  name: string;
  filename: string;
  sizeMb: number;
  expectedSizeMb: number;
  isDownloaded: boolean;
  description: string;
}

interface WhisperStatus {
  models: WhisperModel[];
  activeJob: {
    status: "running" | "completed" | "error" | "idle";
    progressPercent: number;
    message: string;
    error?: string;
  };
}

async function readResponse(response: Response) {
  if (!response.headers.get("content-type")?.includes("application/json")) {
    throw new Error(`Máy chủ không trả về JSON (HTTP ${response.status}).`);
  }
  const body = await response.json();
  if (!response.ok || !body.success) {
    throw new Error(body.error || body.message || "Yêu cầu không thành công.");
  }
  return body;
}

export default function SetupModelDownloads() {
  const [whisperStatus, setWhisperStatus] = useState<WhisperStatus | null>(null);
  const [bgmStatus, setBgmStatus] = useState<BgmSystemStatus | null>(null);
  const [errors, setErrors] = useState<{ whisper: string; bgm: string }>({ whisper: "", bgm: "" });
  const [busyAction, setBusyAction] = useState("");

  const refreshWhisper = useCallback(async () => {
    try {
      const body = await readResponse(await fetch("/api/system/tools-status"));
      setWhisperStatus(body as WhisperStatus);
      setErrors((current) => ({ ...current, whisper: "" }));
    } catch (reason) {
      setErrors((current) => ({
        ...current,
        whisper: reason instanceof Error ? reason.message : String(reason),
      }));
    }
  }, []);

  const refreshBgm = useCallback(async () => {
    try {
      const body = await readResponse(await fetch("/api/bgm/models/status"));
      setBgmStatus(body as BgmSystemStatus);
      setErrors((current) => ({ ...current, bgm: "" }));
    } catch (reason) {
      setErrors((current) => ({
        ...current,
        bgm: reason instanceof Error ? reason.message : String(reason),
      }));
    }
  }, []);

  useEffect(() => {
    void refreshWhisper();
    void refreshBgm();
    const timer = window.setInterval(() => {
      void refreshWhisper();
      void refreshBgm();
    }, 1200);
    return () => window.clearInterval(timer);
  }, [refreshBgm, refreshWhisper]);

  const runAction = async (id: string, action: () => Promise<void>, refresh: () => Promise<void>) => {
    setBusyAction(id);
    setErrors({ whisper: "", bgm: "" });
    try {
      await action();
      await refresh();
    } catch (reason) {
      const message = reason instanceof Error ? reason.message : String(reason);
      setErrors((current) => ({ ...current, [id.startsWith("whisper") ? "whisper" : "bgm"]: message }));
    } finally {
      setBusyAction("");
    }
  };

  const startWhisperDownload = (model: WhisperModel) => runAction(
    `whisper:${model.id}`,
    async () => {
      await readResponse(await fetch("/api/system/download-whisper-model", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ modelId: model.id }),
      }));
    },
    refreshWhisper,
  );

  const deleteWhisperModel = (model: WhisperModel) => {
    if (!window.confirm(`Xóa mô hình "${model.name}" khỏi máy để giải phóng dung lượng?`)) return;
    void runAction(
      `whisper:${model.id}`,
      async () => {
        await readResponse(await fetch(`/api/system/whisper-model/${encodeURIComponent(model.id)}`, { method: "DELETE" }));
      },
      refreshWhisper,
    );
  };

  const runBgmAction = (modelId: string, endpoint: string, method = "POST") => runAction(
    `bgm:${modelId}`,
    async () => {
      await readResponse(await fetch(endpoint, { method }));
    },
    refreshBgm,
  );

  const deleteBgmModel = (modelId: string, modelName: string) => {
    if (!window.confirm(`Xóa model ${modelName} khỏi máy để giải phóng dung lượng?`)) return;
    void runBgmAction(modelId, `/api/bgm/models/${encodeURIComponent(modelId)}`, "DELETE");
  };

  const activeWhisperJob = whisperStatus?.activeJob;

  return (
    <>
      <section className="overflow-hidden rounded-2xl border border-slate-800 bg-slate-950/35">
        <div className="flex flex-wrap items-center justify-between gap-3 border-b border-slate-800 px-4 py-3">
          <div>
            <h3 className="text-sm font-bold text-white">Whisper · Mô hình nhận diện giọng nói</h3>
            <p className="mt-1 text-[11px] text-slate-500">Tải/xóa model dùng cho nhận diện và tạo dataset giọng nói.</p>
          </div>
          <button type="button" onClick={() => void refreshWhisper()} className="rounded-lg p-2 text-slate-400 hover:bg-slate-800 hover:text-white" aria-label="Làm mới trạng thái Whisper">
            <RefreshCw className="h-3.5 w-3.5" />
          </button>
        </div>
        <div className="space-y-3 p-4">
          {errors.whisper && <div role="alert" className="flex items-start gap-2 rounded-lg border border-rose-500/30 bg-rose-950/30 p-2.5 text-[11px] text-rose-200"><AlertCircle className="mt-0.5 h-3.5 w-3.5 shrink-0" />{errors.whisper}</div>}
          {activeWhisperJob?.status === "running" && (
            <div className="rounded-xl border border-amber-500/20 bg-amber-500/5 p-3">
              <div className="mb-2 flex items-center justify-between gap-3 text-[11px] text-slate-300">
                <span className="truncate">{activeWhisperJob.message}</span>
                <span className="shrink-0 font-mono text-amber-300">{activeWhisperJob.progressPercent}%</span>
              </div>
              <div className="h-1.5 overflow-hidden rounded-full bg-slate-800"><div className="h-full bg-amber-400 transition-all" style={{ width: `${activeWhisperJob.progressPercent}%` }} /></div>
            </div>
          )}
          <div className="grid gap-2 sm:grid-cols-2">
            {whisperStatus?.models.map((model) => (
              <div key={model.id} className="rounded-xl border border-slate-800 bg-slate-900/60 p-3">
                <div className="flex items-start justify-between gap-2">
                  <div className="min-w-0">
                    <div className="flex flex-wrap items-center gap-1.5 text-xs font-semibold text-white">
                      {model.name}
                      {model.isDownloaded
                        ? <span className="inline-flex items-center gap-1 text-[10px] text-emerald-300"><CheckCircle2 className="h-3 w-3" />Đã tải · {model.sizeMb} MB</span>
                        : <span className="text-[10px] text-slate-500">Chưa tải · ~{model.expectedSizeMb} MB</span>}
                    </div>
                    <p className="mt-1 text-[10px] leading-relaxed text-slate-500">{model.description}</p>
                  </div>
                  {model.isDownloaded ? (
                    <button type="button" disabled={Boolean(busyAction) || activeWhisperJob?.status === "running"} onClick={() => deleteWhisperModel(model)} className="inline-flex shrink-0 items-center gap-1 rounded-md px-2 py-1 text-[10px] text-rose-300 hover:bg-rose-500/10 disabled:opacity-40">
                      <Trash2 className="h-3 w-3" />Xóa
                    </button>
                  ) : (
                    <button type="button" disabled={Boolean(busyAction) || activeWhisperJob?.status === "running"} onClick={() => void startWhisperDownload(model)} className="inline-flex shrink-0 items-center gap-1 rounded-md bg-amber-500/15 px-2 py-1 text-[10px] font-semibold text-amber-200 hover:bg-amber-500/25 disabled:opacity-40">
                      {activeWhisperJob?.status === "running" && activeWhisperJob.message.includes(model.id) ? <LoaderCircle className="h-3 w-3 animate-spin" /> : <Download className="h-3 w-3" />}Tải
                    </button>
                  )}
                </div>
              </div>
            ))}
            {!whisperStatus && !errors.whisper && <p className="text-[11px] text-slate-500">Đang lấy trạng thái Whisper…</p>}
          </div>
        </div>
      </section>

      <section className="overflow-hidden rounded-2xl border border-slate-800 bg-slate-950/35">
        <div className="flex flex-wrap items-center justify-between gap-3 border-b border-slate-800 px-4 py-3">
          <div>
            <h3 className="text-sm font-bold text-white">Tạo nhạc AI · MusicGen & AudioLDM</h3>
            <p className="mt-1 text-[11px] text-slate-500">Tải/xóa engine model tạo nhạc và theo dõi tiến trình tại đây.</p>
          </div>
          <button type="button" onClick={() => void refreshBgm()} className="rounded-lg p-2 text-slate-400 hover:bg-slate-800 hover:text-white" aria-label="Làm mới trạng thái model tạo nhạc">
            <RefreshCw className="h-3.5 w-3.5" />
          </button>
        </div>
        <div className="space-y-3 p-4">
          {errors.bgm && <div role="alert" className="flex items-start gap-2 rounded-lg border border-rose-500/30 bg-rose-950/30 p-2.5 text-[11px] text-rose-200"><AlertCircle className="mt-0.5 h-3.5 w-3.5 shrink-0" />{errors.bgm}</div>}
          <div className="grid gap-2 sm:grid-cols-2">
            {bgmStatus?.models.map((model) => {
              const isBusy = busyAction === `bgm:${model.id}`;
              return (
                <div key={model.id} className="rounded-xl border border-slate-800 bg-slate-900/60 p-3">
                  <div className="flex items-start justify-between gap-3">
                    <div className="min-w-0">
                      <div className="flex flex-wrap items-center gap-1.5 text-xs font-semibold text-white">
                        {model.name}
                        {model.status === "ready" ? <span className="inline-flex items-center gap-1 text-[10px] text-emerald-300"><CheckCircle2 className="h-3 w-3" />Sẵn sàng</span>
                          : model.status === "downloading" ? <span className="inline-flex items-center gap-1 text-[10px] text-purple-300"><LoaderCircle className="h-3 w-3 animate-spin" />Đang tải {model.downloadProgress}%</span>
                            : model.status === "error" ? <span className="text-[10px] text-rose-300">Tải lỗi</span>
                              : <span className="text-[10px] text-slate-500">Chưa tải · {model.sizeFormatted}</span>}
                      </div>
                      <p className="mt-1 text-[10px] leading-relaxed text-slate-500">{model.description}</p>
                      {model.status === "error" && model.error && <p className="mt-1 break-words text-[10px] text-rose-300">{model.error}</p>}
                    </div>
                    {model.status === "ready" ? (
                      <button type="button" disabled={Boolean(busyAction)} onClick={() => deleteBgmModel(model.id, model.name)} className="inline-flex shrink-0 items-center gap-1 rounded-md px-2 py-1 text-[10px] text-rose-300 hover:bg-rose-500/10 disabled:opacity-40"><Trash2 className="h-3 w-3" />Xóa</button>
                    ) : model.status === "downloading" ? (
                      <button type="button" disabled={Boolean(busyAction)} onClick={() => void runBgmAction(model.id, `/api/bgm/models/${encodeURIComponent(model.id)}/cancel`)} className="inline-flex shrink-0 items-center gap-1 rounded-md px-2 py-1 text-[10px] text-amber-200 hover:bg-amber-500/10 disabled:opacity-40"><X className="h-3 w-3" />Hủy</button>
                    ) : (
                      <button type="button" disabled={Boolean(busyAction)} onClick={() => void runBgmAction(model.id, `/api/bgm/models/${encodeURIComponent(model.id)}/download`)} className="inline-flex shrink-0 items-center gap-1 rounded-md bg-purple-500/15 px-2 py-1 text-[10px] font-semibold text-purple-200 hover:bg-purple-500/25 disabled:opacity-40">{isBusy ? <LoaderCircle className="h-3 w-3 animate-spin" /> : <Download className="h-3 w-3" />}Tải model</button>
                    )}
                  </div>
                  {model.status === "downloading" && (
                    <div className="mt-3 space-y-1">
                      <div className="flex justify-between gap-2 text-[10px] text-slate-400"><span>{(model.downloadedBytes / 1024 ** 2).toFixed(1)} / {(model.totalBytes / 1024 ** 2).toFixed(1)} MB</span><span>{model.downloadSpeedMb > 0 ? `${model.downloadSpeedMb} MB/s · ` : ""}{model.downloadProgress}%</span></div>
                      <div className="h-1.5 overflow-hidden rounded-full bg-slate-800"><div className="h-full bg-purple-400 transition-all" style={{ width: `${model.downloadProgress}%` }} /></div>
                    </div>
                  )}
                </div>
              );
            })}
            {!bgmStatus && !errors.bgm && <p className="text-[11px] text-slate-500">Đang lấy trạng thái model tạo nhạc…</p>}
          </div>
        </div>
      </section>
    </>
  );
}
