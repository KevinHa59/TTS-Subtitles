import { useRef, useState } from "react";
import {
  Archive,
  CheckCircle2,
  CircleAlert,
  Download,
  FileArchive,
  FolderOpen,
  Layers,
  LoaderCircle,
  Plus,
  Trash2,
  Upload,
  X,
} from "lucide-react";

export interface DatasetInfo {
  id: string;
  voiceName: string;
  createdAt: string;
  originalAudioFilename: string;
  whisperModelUsed: string;
  totalClips: number;
  totalDurationSec: number;
  clips: Array<{
    id: string;
    filename: string;
    text: string;
    startMs: number;
    endMs: number;
    durationSec: number;
  }>;
}

export interface MergeResult {
  dataset: DatasetInfo;
  zipDownloadUrl: string;
  zipFilename: string;
  totalZipsMerged: number;
  totalClips: number;
  totalDurationSec: number;
  warnings?: string[];
}

interface MergeDatasetTabProps {
  onOpenDataset: (dataset: DatasetInfo) => void;
}

function formatDuration(seconds?: number): string {
  if (!Number.isFinite(seconds) || !seconds) return "0s";
  const totalSeconds = Math.floor(seconds);
  const hours = Math.floor(totalSeconds / 3600);
  const minutes = Math.floor((totalSeconds % 3600) / 60);
  const remainingSeconds = totalSeconds % 60;
  if (hours > 0) {
    return `${hours}h ${minutes}m ${remainingSeconds}s`;
  }
  if (minutes > 0) {
    return `${minutes}m ${remainingSeconds}s`;
  }
  return `${remainingSeconds}s`;
}

function formatBytes(bytes: number): string {
  if (bytes >= 1024 ** 3) return `${(bytes / 1024 ** 3).toFixed(2)} GB`;
  if (bytes >= 1024 ** 2) return `${(bytes / 1024 ** 2).toFixed(1)} MB`;
  return `${(bytes / 1024).toFixed(0)} KB`;
}

export function MergeDatasetTab({ onOpenDataset }: MergeDatasetTabProps) {
  const [zipFiles, setZipFiles] = useState<File[]>([]);
  const [voiceName, setVoiceName] = useState<string>("giong_tong_hop");
  const [datasetId, setDatasetId] = useState<string>("giong_tong_hop_merged");
  const [isDragging, setIsDragging] = useState<boolean>(false);
  const [isMerging, setIsMerging] = useState<boolean>(false);
  const [mergeStep, setMergeStep] = useState<string>("");
  const [progressPercent, setProgressPercent] = useState<number>(0);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);
  const [mergeResult, setMergeResult] = useState<MergeResult | null>(null);

  const fileInputRef = useRef<HTMLInputElement | null>(null);

  const handleFilesAdded = (files: FileList | File[]) => {
    const validZips = Array.from(files).filter(
      (f) => f.name.toLowerCase().endsWith(".zip") || f.type.includes("zip"),
    );
    if (validZips.length === 0) {
      setErrorMessage("Vui lòng chỉ chọn các tệp nén định dạng .zip.");
      return;
    }

    setErrorMessage(null);
    setMergeResult(null);

    setZipFiles((prev) => {
      const existingNames = new Set(prev.map((f) => f.name + f.size));
      const newlyAdded = validZips.filter(
        (f) => !existingNames.has(f.name + f.size),
      );
      const combined = [...prev, ...newlyAdded];

      // Nếu tên voiceName chưa đổi, tự động gợi ý từ tên file đầu tiên
      if (voiceName === "giong_tong_hop" && combined.length > 0) {
        let base = combined[0].name.replace(/\.zip$/i, "");
        if (base.toLowerCase().endsWith("_dataset")) {
          base = base.slice(0, -"_dataset".length);
        }
        const cleanBase = base.replace(/[^a-zA-Z0-9_-]/g, "_").toLowerCase();
        if (cleanBase) {
          setVoiceName(cleanBase);
          setDatasetId(`${cleanBase}_merged`);
        }
      }

      return combined;
    });
  };

  const handleDrop = (e: React.DragEvent<HTMLDivElement>) => {
    e.preventDefault();
    setIsDragging(false);
    if (e.dataTransfer.files && e.dataTransfer.files.length > 0) {
      handleFilesAdded(e.dataTransfer.files);
    }
  };

  const removeFile = (index: number) => {
    setZipFiles((prev) => prev.filter((_, i) => i !== index));
    setMergeResult(null);
  };

  const clearAllFiles = () => {
    setZipFiles([]);
    setMergeResult(null);
    setErrorMessage(null);
  };

  const handleStartMerge = async () => {
    if (zipFiles.length === 0) {
      setErrorMessage("Chưa có file ZIP nào được chọn.");
      return;
    }

    setIsMerging(true);
    setErrorMessage(null);
    setMergeResult(null);
    setProgressPercent(10);
    setMergeStep("Đang khởi tạo phiên ghép dữ liệu trên máy chủ...");

    try {
      // 1. Tạo session
      const sessionRes = await fetch("/api/dataset/merge-session", {
        method: "POST",
      });
      const sessionData = await sessionRes.json();
      if (!sessionRes.ok || !sessionData.success) {
        throw new Error(sessionData.error || "Không thể tạo phiên ghép.");
      }
      const sessionId: string = sessionData.sessionId;

      // 2. Upload từng file ZIP
      for (let i = 0; i < zipFiles.length; i++) {
        const file = zipFiles[i];
        const pct = Math.round(15 + ((i + 1) / zipFiles.length) * 45);
        setProgressPercent(pct);
        setMergeStep(
          `Đang tải lên file [${i + 1}/${zipFiles.length}]: ${file.name}...`,
        );

        const uploadUrl = `/api/dataset/merge-session/${sessionId}/upload?filename=${encodeURIComponent(
          file.name,
        )}`;
        const upRes = await fetch(uploadUrl, {
          method: "POST",
          headers: {
            "Content-Type": "application/octet-stream",
          },
          body: file,
        });

        const upData = await upRes.json();
        if (!upRes.ok || !upData.success) {
          throw new Error(upData.error || `Lỗi khi tải file ${file.name}`);
        }
      }

      // 3. Tiến hành merge trên server
      setProgressPercent(70);
      setMergeStep(
        "Đang giải nén, kiểm tra âm thanh PCM 22050Hz và hợp nhất metadata.csv...",
      );

      const mergeRes = await fetch(
        `/api/dataset/merge-session/${sessionId}/merge`,
        {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
          },
          body: JSON.stringify({
            voiceName: voiceName.trim() || "merged_voice",
            datasetId: datasetId.trim() || undefined,
          }),
        },
      );

      const mergeData = await mergeRes.json();
      if (!mergeRes.ok || !mergeData.success) {
        throw new Error(mergeData.error || "Lỗi khi xử lý ghép dataset.");
      }

      setProgressPercent(100);
      setMergeStep("Hoàn thành ghép dataset!");
      setMergeResult(mergeData);
    } catch (err: unknown) {
      const msg =
        err instanceof Error ? err.message : "Đã xảy ra lỗi không xác định.";
      setErrorMessage(msg);
    } finally {
      setIsMerging(false);
    }
  };

  const totalBytes = zipFiles.reduce((acc, f) => acc + f.size, 0);

  const handleDownloadZip = async () => {
    if (!mergeResult) return;
    try {
      const res = await fetch(mergeResult.zipDownloadUrl);
      if (!res.ok) throw new Error("Không thể tải file ZIP.");
      const blob = await res.blob();
      const url = URL.createObjectURL(blob);
      const a = document.createElement("a");
      a.href = url;
      a.download = mergeResult.zipFilename;
      document.body.appendChild(a);
      a.click();
      document.body.removeChild(a);
      URL.revokeObjectURL(url);
    } catch (err) {
      const msg = err instanceof Error ? err.message : "Lỗi khi tải file ZIP.";
      setErrorMessage(msg);
    }
  };

  return (
    <div className="flex-1 min-h-0 overflow-y-auto bg-slate-950 p-4">
      <div className="max-w-4xl mx-auto space-y-4">
        {/* Banner hướng dẫn */}
        <div className="border border-slate-800 bg-slate-900/60 p-3.5 flex items-start gap-3 rounded-none">
          <Layers className="w-5 h-5 text-amber-400 shrink-0 mt-0.5" />
          <div className="flex-1 text-xs text-slate-300 space-y-1">
            <h3 className="font-bold text-white text-sm">
              Ghép Nhiều Gói Dataset ZIP (Merge Datasets)
            </h3>
            <p className="text-slate-400 leading-relaxed">
              Kéo thả nhiều file <code>.zip</code> dataset từ các đợt thu âm
              khác nhau vào đây. Hệ thống sẽ giải nén, tự động re-index lại toàn
              bộ câu thoại tuần tự để <strong>tránh xung đột trùng ID</strong>,
              tổng hợp tất cả file âm thanh WAV đạt chuẩn và đóng gói lại thành{" "}
              <strong>1 dataset lớn đồng nhất</strong> sẵn sàng đưa lên Google
              Colab.
            </p>
          </div>
        </div>

        {/* Cấu hình tên dataset sau khi ghép */}
        <div className="border border-slate-800 bg-slate-900/40 p-3.5 space-y-3 rounded-none">
          <h4 className="text-xs font-bold text-white uppercase tracking-wider flex items-center gap-1.5">
            <Archive className="w-3.5 h-3.5 text-amber-400" />
            <span>Thông Tin Dataset Đích Sau Khi Ghép</span>
          </h4>

          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 text-xs">
            <div>
              <label className="block text-slate-400 font-medium mb-1">
                Tên Giọng / Voice Name
              </label>
              <input
                type="text"
                value={voiceName}
                onChange={(e) => {
                  const val = e.target.value;
                  setVoiceName(val);
                  setDatasetId(
                    `${val.replace(/[^a-zA-Z0-9_-]/g, "_").toLowerCase()}_merged`,
                  );
                }}
                disabled={isMerging}
                placeholder="VD: hoang_nam, lan_anh"
                className="w-full bg-slate-950 border border-slate-800 px-2.5 py-1.5 text-slate-100 font-medium outline-none focus:border-amber-500 rounded-none disabled:opacity-50"
              />
            </div>
            <div>
              <label className="block text-slate-400 font-medium mb-1">
                Mã Thư Mục / Dataset ID
              </label>
              <input
                type="text"
                value={datasetId}
                onChange={(e) => setDatasetId(e.target.value)}
                disabled={isMerging}
                placeholder="VD: hoang_nam_merged"
                className="w-full bg-slate-950 border border-slate-800 px-2.5 py-1.5 text-slate-100 font-mono outline-none focus:border-amber-500 rounded-none disabled:opacity-50"
              />
            </div>
          </div>
        </div>

        {/* Vùng Drag & Drop */}
        <div
          onDragOver={(e) => {
            e.preventDefault();
            setIsDragging(true);
          }}
          onDragLeave={() => setIsDragging(false)}
          onDrop={handleDrop}
          onClick={() => !isMerging && fileInputRef.current?.click()}
          className={`border-2 border-dashed p-6 text-center cursor-pointer transition-colors rounded-none ${
            isDragging
              ? "border-amber-400 bg-amber-500/10"
              : "border-slate-800 hover:border-slate-700 bg-slate-900/30"
          } ${isMerging ? "opacity-50 pointer-events-none" : ""}`}
        >
          <input
            ref={fileInputRef}
            type="file"
            multiple
            accept=".zip,application/zip"
            className="hidden"
            onChange={(e) => {
              if (e.target.files) handleFilesAdded(e.target.files);
              e.target.value = "";
            }}
          />
          <Upload className="w-8 h-8 text-amber-400 mx-auto mb-2" />
          <p className="text-sm font-semibold text-white">
            Kéo thả nhiều file dataset{" "}
            <span className="text-amber-400">.zip</span> vào đây
          </p>
          <p className="text-xs text-slate-400 mt-1">
            Hoặc bấm để duyệt và chọn nhiều file cùng lúc từ máy tính
          </p>
        </div>

        {/* Danh sách các file ZIP đã thêm */}
        {zipFiles.length > 0 && (
          <div className="border border-slate-800 bg-slate-900/40 rounded-none overflow-hidden">
            <div className="h-9 px-3 bg-slate-950/80 border-b border-slate-800 flex items-center justify-between text-xs">
              <div className="flex items-center gap-2">
                <span className="font-bold text-white">
                  Danh Sách File Dataset ZIP
                </span>
                <span className="px-1.5 py-0.5 bg-amber-500/20 text-amber-300 font-mono text-[11px] border border-amber-500/30">
                  {zipFiles.length} file · {formatBytes(totalBytes)}
                </span>
              </div>
              {!isMerging && (
                <button
                  type="button"
                  onClick={clearAllFiles}
                  className="text-slate-400 hover:text-rose-400 transition-colors flex items-center gap-1 cursor-pointer"
                >
                  <Trash2 className="w-3 h-3" />
                  <span>Xóa tất cả</span>
                </button>
              )}
            </div>

            <div className="max-h-60 overflow-y-auto divide-y divide-slate-800/60">
              {zipFiles.map((file, idx) => (
                <div
                  key={`${file.name}_${file.size}_${idx}`}
                  className="px-3 py-2 flex items-center justify-between hover:bg-slate-900/60 text-xs transition-colors"
                >
                  <div className="flex items-center gap-2.5 min-w-0">
                    <span className="font-mono text-[10px] text-slate-500 w-5 shrink-0 text-right">
                      #{idx + 1}
                    </span>
                    <FileArchive className="w-4 h-4 text-amber-400 shrink-0" />
                    <span className="truncate font-medium text-slate-200">
                      {file.name}
                    </span>
                    <span className="text-slate-500 text-[11px] font-mono shrink-0">
                      ({formatBytes(file.size)})
                    </span>
                  </div>
                  {!isMerging && (
                    <button
                      type="button"
                      onClick={(e) => {
                        e.stopPropagation();
                        removeFile(idx);
                      }}
                      className="text-slate-500 hover:text-rose-400 p-1 cursor-pointer transition-colors"
                      title="Xóa file này"
                    >
                      <X className="w-3.5 h-3.5" />
                    </button>
                  )}
                </div>
              ))}
            </div>

            {/* Thanh hành động ghép */}
            <div className="p-3 bg-slate-950/60 border-t border-slate-800 flex items-center justify-between gap-3">
              <span className="text-[11px] text-slate-400">
                Các câu thoại từ {zipFiles.length} file sẽ được ghép liên tiếp
                và đổi ID tuần tự chuẩn Piper VITS.
              </span>

              <button
                type="button"
                onClick={handleStartMerge}
                disabled={isMerging || zipFiles.length === 0}
                className="px-4 py-2 bg-gradient-to-r from-amber-500 to-amber-600 hover:from-amber-400 hover:to-amber-500 text-slate-950 font-bold text-xs flex items-center gap-2 cursor-pointer disabled:opacity-50 disabled:cursor-not-allowed transition-all rounded-none"
              >
                {isMerging ? (
                  <>
                    <LoaderCircle className="w-4 h-4 animate-spin" />
                    <span>Đang Xử Lý Ghép...</span>
                  </>
                ) : (
                  <>
                    <Layers className="w-4 h-4" />
                    <span>⚡ BẮT ĐẦU GHÉP DATASET ({zipFiles.length} TỆP)</span>
                  </>
                )}
              </button>
            </div>
          </div>
        )}

        {/* Trạng thái tiến trình */}
        {isMerging && (
          <div className="border border-amber-500/40 bg-amber-500/10 p-3.5 space-y-2 rounded-none">
            <div className="flex items-center justify-between text-xs">
              <span className="font-semibold text-amber-300 flex items-center gap-1.5">
                <LoaderCircle className="w-3.5 h-3.5 animate-spin" />
                {mergeStep}
              </span>
              <span className="font-mono text-amber-200">
                {progressPercent}%
              </span>
            </div>
            <div className="w-full bg-slate-900 h-1.5 overflow-hidden">
              <div
                className="bg-amber-400 h-full transition-all duration-300 ease-out"
                style={{ width: `${progressPercent}%` }}
              />
            </div>
          </div>
        )}

        {/* Thông báo lỗi */}
        {errorMessage && (
          <div className="border border-rose-500/40 bg-rose-500/10 p-3 flex items-start gap-2.5 rounded-none text-xs text-rose-200">
            <CircleAlert className="w-4 h-4 text-rose-400 shrink-0 mt-0.5" />
            <div className="flex-1 whitespace-pre-wrap">{errorMessage}</div>
          </div>
        )}

        {/* Kết quả sau khi ghép thành công */}
        {mergeResult && (
          <div className="border border-emerald-500/40 bg-emerald-500/10 p-4 space-y-3 rounded-none">
            <div className="flex items-center gap-2 text-emerald-300 font-bold text-sm">
              <CheckCircle2 className="w-5 h-5 text-emerald-400 shrink-0" />
              <span>Ghép Dataset Hoàn Tất Thành Công!</span>
            </div>

            <div className="grid grid-cols-1 sm:grid-cols-3 gap-2 py-1 text-xs">
              <div className="border border-emerald-500/20 bg-slate-950/60 p-2.5">
                <span className="text-slate-400 block text-[11px]">
                  Số file ZIP đã ghép
                </span>
                <span className="text-white font-bold font-mono text-sm">
                  {mergeResult.totalZipsMerged} file
                </span>
              </div>
              <div className="border border-emerald-500/20 bg-slate-950/60 p-2.5">
                <span className="text-slate-400 block text-[11px]">
                  Tổng số câu thoại
                </span>
                <span className="text-emerald-300 font-bold font-mono text-sm">
                  {mergeResult.totalClips} câu
                </span>
              </div>
              <div className="border border-emerald-500/20 bg-slate-950/60 p-2.5">
                <span className="text-slate-400 block text-[11px]">
                  Tổng thời lượng
                </span>
                <span className="text-white font-bold font-mono text-sm">
                  {formatDuration(mergeResult.totalDurationSec)}
                </span>
              </div>
            </div>

            {mergeResult.warnings && mergeResult.warnings.length > 0 && (
              <div className="text-[11px] text-amber-300/90 bg-amber-500/10 border border-amber-500/20 p-2 space-y-0.5">
                <span className="font-semibold block">Lưu ý:</span>
                {mergeResult.warnings.map((w, idx) => (
                  <p key={idx}>• {w}</p>
                ))}
              </div>
            )}

            <div className="flex flex-wrap items-center gap-2 pt-1">
              <button
                type="button"
                onClick={handleDownloadZip}
                className="inline-flex items-center gap-1.5 px-3 py-1.5 bg-emerald-500 hover:bg-emerald-400 text-slate-950 text-xs font-bold transition-colors cursor-pointer rounded-none shadow-sm"
              >
                <Download className="w-3.5 h-3.5" />
                <span>Tải Gói Dataset Đã Ghép (.zip)</span>
              </button>

              <button
                type="button"
                onClick={(e) => { e.stopPropagation(); onOpenDataset(mergeResult.dataset); }}
                className="inline-flex items-center gap-1.5 px-3 py-1.5 bg-slate-800 hover:bg-slate-700 text-slate-200 text-xs font-semibold border border-slate-700 transition-colors cursor-pointer rounded-none"
              >
                <FolderOpen className="w-3.5 h-3.5 text-amber-400" />
                <span>Mở Xem & Chỉnh Sửa Trong Tab 1</span>
              </button>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
