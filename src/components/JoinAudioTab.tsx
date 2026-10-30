import { useRef, useState } from "react";
import {
  AudioLines,
  CheckCircle2,
  CircleAlert,
  FileAudio,
  LoaderCircle,
  Plus,
  Trash2,
  Upload,
  X,
} from "lucide-react";

interface JoinAudioJob {
  id: string;
  status: "uploading" | "processing" | "completed" | "failed" | "cancelled";
  stage: string;
  progressPercent: number;
  message: string;
  fileCount: number;
  uploadedCount: number;
  totalDurationSeconds?: number;
  error?: string;
  fileErrors?: string[];
  output?: {
    durationSeconds: number;
    sampleRate: number;
    channels: number;
    codec: string;
    sizeBytes: number;
  };
}

interface JoinAudioTabProps {
  onUseForWhisper: (
    jobId: string,
    output: NonNullable<JoinAudioJob["output"]>,
  ) => void;
}

function formatDuration(seconds?: number): string {
  if (!Number.isFinite(seconds)) return "Chưa xác định";
  const totalSeconds = Math.floor(seconds!);
  const hours = Math.floor(totalSeconds / 3600);
  const minutes = Math.floor((totalSeconds % 3600) / 60);
  const remainingSeconds = totalSeconds % 60;
  return hours > 0
    ? `${hours}:${String(minutes).padStart(2, "0")}:${String(remainingSeconds).padStart(2, "0")}`
    : `${minutes}:${String(remainingSeconds).padStart(2, "0")}`;
}

function formatBytes(bytes: number): string {
  if (bytes >= 1024 ** 3) return `${(bytes / 1024 ** 3).toFixed(2)} GB`;
  if (bytes >= 1024 ** 2) return `${(bytes / 1024 ** 2).toFixed(2)} MB`;
  return `${(bytes / 1024).toFixed(1)} KB`;
}

async function readResponse<T>(response: Response): Promise<T> {
  const data = await response.json();
  if (!response.ok || !data.success) {
    throw new Error(data.error || "Yêu cầu ghép audio thất bại.");
  }
  return data as T;
}

export default function JoinAudioTab({ onUseForWhisper }: JoinAudioTabProps) {
  const [files, setFiles] = useState<File[]>([]);
  const [sortByName, setSortByName] = useState(false);
  const [targetLufs, setTargetLufs] = useState(-20);
  const [truePeakDbtp, setTruePeakDbtp] = useState(-1);
  const [job, setJob] = useState<JoinAudioJob | null>(null);
  const [uploadProgress, setUploadProgress] = useState<number | null>(null);
  const [feedback, setFeedback] = useState<{ type: "error" | "success"; message: string } | null>(null);
  const [busy, setBusy] = useState(false);
  const inputRef = useRef<HTMLInputElement | null>(null);
  const abortRef = useRef<AbortController | null>(null);
  const jobIdRef = useRef<string | null>(null);
  const isBusy = busy;
  const totalBytes = files.reduce((total, file) => total + file.size, 0);

  const addFiles = (selected: FileList | File[]) => {
    const accepted: File[] = [];
    let rejected = 0;
    for (const file of Array.from(selected)) {
      if (/\.(mp3|wav)$/i.test(file.name)) accepted.push(file);
      else rejected++;
    }
    if (accepted.length > 0) setFiles((current) => [...current, ...accepted]);
    setFeedback(
      rejected > 0
        ? { type: "error", message: `Đã bỏ qua ${rejected} tệp không phải MP3 hoặc WAV.` }
        : null,
    );
  };

  const handleStart = async () => {
    if (files.length === 0 || isBusy) return;
    setBusy(true);
    setFeedback(null);
    setJob(null);
    setUploadProgress(0);
    const controller = new AbortController();
    abortRef.current = controller;
    let createdJobId: string | null = null;
    try {
      const orderedFiles = sortByName
        ? [...files].sort((a, b) => a.name.localeCompare(b.name, undefined, { sensitivity: "base" }))
        : files;
      const created = await readResponse<{ id: string }>(
        await fetch("/api/join-audio/jobs", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            files: orderedFiles.map(({ name, size }) => ({ name, size })),
            options: { targetLufs, truePeakDbtp },
          }),
          signal: controller.signal,
        }),
      );
      createdJobId = created.id;
      jobIdRef.current = created.id;

      for (let index = 0; index < orderedFiles.length; index++) {
        await readResponse(
          await fetch(`/api/join-audio/jobs/${created.id}/files/${index}`, {
            method: "PUT",
            headers: { "Content-Type": "application/octet-stream" },
            body: orderedFiles[index],
            signal: controller.signal,
          }),
        );
        setUploadProgress(((index + 1) / orderedFiles.length) * 100);
      }

      await readResponse(
        await fetch(`/api/join-audio/jobs/${created.id}/start`, {
          method: "POST",
          signal: controller.signal,
        }),
      );
      setUploadProgress(null);

      while (!controller.signal.aborted) {
        const status = await readResponse<{ job: JoinAudioJob }>(
          await fetch(`/api/join-audio/jobs/${created.id}`, { signal: controller.signal }),
        );
        setJob(status.job);
        if (status.job.status === "completed") {
          setFeedback({ type: "success", message: "Tệp WAV đã sẵn sàng để nghe hoặc dùng với Whisper." });
          break;
        }
        if (status.job.status === "failed") {
          setFeedback({ type: "error", message: status.job.error || status.job.message });
          break;
        }
        if (status.job.status === "cancelled") break;
        await new Promise((resolve) => window.setTimeout(resolve, 700));
      }
    } catch (error) {
      if (!controller.signal.aborted) {
        setFeedback({
          type: "error",
          message: error instanceof Error ? error.message : "Không thể hoàn tất ghép audio.",
        });
      }
      if (createdJobId) {
        await fetch(`/api/join-audio/jobs/${createdJobId}/cancel`, { method: "POST" }).catch(() => undefined);
      }
    } finally {
      setBusy(false);
      setUploadProgress(null);
      abortRef.current = null;
      jobIdRef.current = null;
    }
  };

  const handleCancel = async () => {
    abortRef.current?.abort();
    const jobId = jobIdRef.current;
    if (jobId) {
      try {
        await fetch(`/api/join-audio/jobs/${jobId}/cancel`, { method: "POST" });
      } catch {
        setFeedback({ type: "error", message: "Không thể gửi yêu cầu hủy tác vụ đến máy chủ." });
      }
    }
    setJob((current) => current ? { ...current, status: "cancelled", message: "Đã hủy tác vụ." } : current);
    setBusy(false);
    setUploadProgress(null);
  };

  const handleUseForWhisper = async () => {
    if (!job || job.status !== "completed") return;
    if (job.output) onUseForWhisper(job.id, job.output);
  };

  return (
    <section className="space-y-5">
      <header className="rounded-2xl border border-sky-500/20 bg-sky-500/5 p-5">
        <h3 className="flex items-center gap-2 text-base font-bold text-white">
          <AudioLines className="h-5 w-5 text-sky-400" />
          Ghép và chuẩn hóa audio
        </h3>
        <p className="mt-1 text-xs leading-relaxed text-slate-400">
          Thêm MP3/WAV theo thứ tự mong muốn. Âm thanh được xử lý tuần tự trên máy chủ, không nạp toàn bộ nội dung vào bộ nhớ.
        </p>
      </header>

      <div
        onDragOver={(event) => {
          event.preventDefault();
          event.stopPropagation();
        }}
        onDrop={(event) => {
          event.preventDefault();
          event.stopPropagation();
          addFiles(event.dataTransfer.files);
        }}
        onClick={(event) => {
          if (event.target !== inputRef.current) inputRef.current?.click();
        }}
        className="cursor-pointer rounded-2xl border-2 border-dashed border-slate-700 bg-slate-950/60 p-8 text-center transition-colors hover:border-sky-500/60 hover:bg-slate-950"
      >
        <input
          ref={inputRef}
          type="file"
          accept=".mp3,.wav,audio/mpeg,audio/wav"
          multiple
          className="hidden"
          onChange={(event) => {
            if (event.target.files) addFiles(event.target.files);
            event.target.value = "";
          }}
        />
        <Upload className="mx-auto h-8 w-8 text-sky-400" />
        <p className="mt-3 text-sm font-semibold text-white">Kéo thả nhiều tệp vào đây</p>
        <p className="mt-1 text-xs text-slate-400">hoặc nhấp để chọn tệp .mp3 / .wav</p>
      </div>

      <div className="grid gap-3 sm:grid-cols-3">
        <div className="rounded-xl border border-slate-800 bg-slate-950/60 p-4">
          <p className="text-[11px] uppercase tracking-wide text-slate-500">Số tệp</p>
          <p className="mt-1 text-lg font-bold text-white">{files.length.toLocaleString()}</p>
        </div>
        <div className="rounded-xl border border-slate-800 bg-slate-950/60 p-4">
          <p className="text-[11px] uppercase tracking-wide text-slate-500">Tổng dung lượng</p>
          <p className="mt-1 text-lg font-bold text-white">{formatBytes(totalBytes)}</p>
        </div>
        <div className="rounded-xl border border-slate-800 bg-slate-950/60 p-4">
          <p className="text-[11px] uppercase tracking-wide text-slate-500">Tổng thời lượng</p>
          <p className="mt-1 text-lg font-bold text-white">
            {formatDuration(job?.totalDurationSeconds)}
          </p>
        </div>
      </div>

      <div className="flex flex-wrap items-center justify-between gap-3 rounded-xl border border-slate-800 bg-slate-950/50 p-3">
        <div className="flex flex-wrap gap-2">
          <button
            type="button"
            disabled={isBusy}
            onClick={() => inputRef.current?.click()}
            className="inline-flex items-center gap-2 rounded-lg border border-slate-700 px-3 py-2 text-xs font-semibold text-slate-200 hover:bg-slate-800 disabled:opacity-50"
          >
            <Plus className="h-4 w-4" /> Thêm file
          </button>
          <button
            type="button"
            disabled={isBusy || files.length === 0}
            onClick={() => {
              setFiles([]);
              setJob(null);
              setFeedback(null);
              if (inputRef.current) inputRef.current.value = "";
            }}
            className="inline-flex items-center gap-2 rounded-lg border border-slate-700 px-3 py-2 text-xs font-semibold text-slate-300 hover:border-rose-500/40 hover:text-rose-300 disabled:opacity-50"
          >
            <Trash2 className="h-4 w-4" /> Xóa danh sách
          </button>
        </div>
        <label className="flex items-center gap-2 text-xs text-slate-300">
          <input
            type="checkbox"
            checked={sortByName}
            disabled={isBusy}
            onChange={(event) => setSortByName(event.target.checked)}
            className="accent-sky-500"
          />
          Sắp xếp tên A–Z
        </label>
      </div>

      <div className="grid gap-4 rounded-2xl border border-slate-800 bg-slate-950/60 p-4 sm:grid-cols-2">
        <label className="space-y-1.5 text-xs text-slate-300">
          <span>Target loudness (LUFS)</span>
          <input
            type="number"
            min="-30"
            max="-5"
            step="0.5"
            value={targetLufs}
            disabled={isBusy}
            onChange={(event) => setTargetLufs(Number(event.target.value))}
            className="w-full rounded-lg border border-slate-700 bg-slate-900 px-3 py-2 text-white"
          />
          <span className="block text-[10px] text-slate-500">Mặc định −20 LUFS (phạm vi −30 đến −5).</span>
        </label>
        <label className="space-y-1.5 text-xs text-slate-300">
          <span>True peak (dBTP)</span>
          <input
            type="number"
            min="-9"
            max="0"
            step="0.5"
            value={truePeakDbtp}
            disabled={isBusy}
            onChange={(event) => setTruePeakDbtp(Number(event.target.value))}
            className="w-full rounded-lg border border-slate-700 bg-slate-900 px-3 py-2 text-white"
          />
          <span className="block text-[10px] text-slate-500">Mặc định −1 dBTP, giới hạn bằng FFmpeg loudnorm.</span>
        </label>
      </div>

      {feedback && (
        <div
          role="status"
          className={`flex items-start gap-2 rounded-xl border p-3 text-xs ${
            feedback.type === "error"
              ? "border-rose-500/30 bg-rose-500/10 text-rose-300"
              : "border-emerald-500/30 bg-emerald-500/10 text-emerald-300"
          }`}
        >
          {feedback.type === "error" ? <CircleAlert className="h-4 w-4 shrink-0" /> : <CheckCircle2 className="h-4 w-4 shrink-0" />}
          <span>{feedback.message}</span>
        </div>
      )}

      {job && (
        <div className="space-y-3 rounded-2xl border border-slate-800 bg-slate-950/60 p-4">
          <div className="flex items-center gap-2 text-sm font-semibold text-white">
            {job.status === "processing" || job.status === "uploading"
              ? <LoaderCircle className="h-4 w-4 animate-spin text-sky-400" />
              : job.status === "completed"
                ? <CheckCircle2 className="h-4 w-4 text-emerald-400" />
                : <CircleAlert className="h-4 w-4 text-rose-400" />}
            <span>{job.message}</span>
          </div>
          <div className="h-2 overflow-hidden rounded-full bg-slate-800">
            <div
              className="h-full rounded-full bg-sky-500 transition-all"
              style={{ width: `${job.progressPercent}%` }}
            />
          </div>
          <p className="text-[11px] text-slate-400">
            {job.stage === "uploading"
              ? `Đã tải ${job.uploadedCount} / ${job.fileCount} tệp`
              : `Tiến độ xử lý ${Math.round(job.progressPercent)}%`}
          </p>
          {job.fileErrors && job.fileErrors.length > 0 && (
            <details className="text-xs text-rose-300">
              <summary className="cursor-pointer">Xem lỗi tệp ({job.fileErrors.length}{job.fileErrors.length === 5 ? "+" : ""})</summary>
              <ul className="mt-2 list-inside list-disc space-y-1 text-[11px] text-rose-200/80">
                {job.fileErrors.map((error, index) => <li key={`${index}-${error}`}>{error}</li>)}
              </ul>
            </details>
          )}
        </div>
      )}

      {uploadProgress !== null && (
        <div className="space-y-1">
          <p className="text-[11px] text-slate-400">
            Đang tải tệp lên: {Math.round(uploadProgress)}%
          </p>
          <div className="h-2 overflow-hidden rounded-full bg-slate-800">
            <div className="h-full rounded-full bg-sky-500 transition-all" style={{ width: `${uploadProgress}%` }} />
          </div>
        </div>
      )}

      {job?.status === "completed" && job.output && (
        <div className="space-y-4 rounded-2xl border border-emerald-500/25 bg-emerald-500/5 p-4">
          <div className="flex items-center gap-2 text-sm font-bold text-white">
            <FileAudio className="h-4 w-4 text-emerald-400" /> joined-audio.wav
          </div>
          <audio controls preload="metadata" className="w-full" src={`/api/join-audio/jobs/${job.id}/output`} />
          <p className="text-xs text-slate-300">
            {formatDuration(job.output.durationSeconds)} · {job.output.sampleRate / 1000} kHz · {job.output.channels} kênh · PCM 16-bit · {formatBytes(job.output.sizeBytes)}
          </p>
          <button
            type="button"
            onClick={handleUseForWhisper}
            className="inline-flex items-center gap-2 rounded-xl bg-emerald-500 px-4 py-2.5 text-xs font-bold text-slate-950 hover:bg-emerald-400"
          >
            <AudioLines className="h-4 w-4" /> Dùng cho Whisper
          </button>
        </div>
      )}

      <div className="flex flex-wrap justify-end gap-2">
        {isBusy ? (
          <button
            type="button"
            onClick={handleCancel}
            className="inline-flex items-center gap-2 rounded-xl border border-rose-500/40 px-4 py-2.5 text-xs font-bold text-rose-300 hover:bg-rose-500/10"
          >
            <X className="h-4 w-4" /> Hủy xử lý
          </button>
        ) : (
          <button
            type="button"
            disabled={files.length === 0}
            onClick={handleStart}
            className="inline-flex items-center gap-2 rounded-xl bg-gradient-to-r from-sky-500 to-blue-600 px-5 py-2.5 text-xs font-bold text-white shadow-lg shadow-sky-500/10 disabled:cursor-not-allowed disabled:opacity-50"
          >
            <AudioLines className="h-4 w-4" /> Bắt đầu xử lý
          </button>
        )}
      </div>
    </section>
  );
}
