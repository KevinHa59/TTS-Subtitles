import React, { useState, useEffect, useRef } from "react";
import {
  X,
  Film,
  Download,
  CheckCircle2,
  AlertCircle,
  Sparkles,
  Smartphone,
  Layers,
  Clock,
  Music,
  Check,
  Play,
  RotateCcw,
  Loader2,
} from "lucide-react";
import { Story } from "../types/story";

interface VideoExportModalProps {
  isOpen: boolean;
  onClose: () => void;
  story: Story;
  customBgImage: string | null;
  masterDuration: number;
}

type ResolutionKey = "720p" | "1080p" | "2k" | "4k";

interface ResolutionOption {
  key: ResolutionKey;
  label: string;
  resText: string;
  tag: string;
  tagColor: string;
  desc: string;
  bitrateText: string;
}

const RESOLUTIONS: ResolutionOption[] = [
  {
    key: "720p",
    label: "720p HD",
    resText: "720 × 1280",
    tag: "Nhẹ & Nhanh",
    tagColor: "bg-cyan-500/10 text-cyan-400 border-cyan-500/20",
    desc: "Tối ưu xuất siêu tốc, dung lượng gọn nhẹ (~15MB/phút)",
    bitrateText: "Video 2.8 Mbps • Audio 192 kbps",
  },
  {
    key: "1080p",
    label: "1080p Full HD",
    resText: "1080 × 1920",
    tag: "Khuyên Dùng",
    tagColor: "bg-amber-500/20 text-amber-300 border-amber-500/30",
    desc: "Chuẩn sắc nét tối ưu cho TikTok, Facebook Reels, YouTube Shorts",
    bitrateText: "Video 5.0 Mbps • Audio 192 kbps",
  },
  {
    key: "2k",
    label: "2K QHD",
    resText: "1440 × 2560",
    tag: "Độ Nét Cao",
    tagColor: "bg-purple-500/15 text-purple-300 border-purple-500/30",
    desc: "Sắc nét tuyệt đối trên màn hình OLED và smartphone cao cấp",
    bitrateText: "Video 9.0 Mbps • Audio 256 kbps",
  },
  {
    key: "4k",
    label: "4K Ultra HD",
    resText: "2160 × 3840",
    tag: "Studio Đỉnh Cao",
    tagColor: "bg-rose-500/15 text-rose-300 border-rose-500/30",
    desc: "Chất lượng hình ảnh 4K sắc sảo từng chi tiết, thích hợp lưu trữ & trình chiếu",
    bitrateText: "Video 18.0 Mbps • Audio 320 kbps",
  },
];

export const VideoExportModal: React.FC<VideoExportModalProps> = ({
  isOpen,
  onClose,
  story,
  customBgImage,
  masterDuration,
}) => {
  const [selectedRes, setSelectedRes] = useState<ResolutionKey>("1080p");
  const [isExporting, setIsExporting] = useState<boolean>(false);
  const [progress, setProgress] = useState<number>(0);
  const [statusMessage, setStatusMessage] = useState<string>("");
  const [exportError, setExportError] = useState<string | null>(null);
  const [downloadUrl, setDownloadUrl] = useState<string | null>(null);
  const [fileSizeBytes, setFileSizeBytes] = useState<number | null>(null);
  const pollIntervalRef = useRef<any>(null);

  useEffect(() => {
    return () => {
      if (pollIntervalRef.current) clearInterval(pollIntervalRef.current);
    };
  }, []);

  if (!isOpen) return null;

  const formatSecs = (secs: number) => {
    const m = Math.floor(secs / 60);
    const s = Math.floor(secs % 60);
    return `${m}:${s < 10 ? "0" : ""}${s}`;
  };

  const formatFileSize = (bytes: number) => {
    if (!bytes) return "";
    const mb = bytes / (1024 * 1024);
    return `${mb.toFixed(1)} MB`;
  };

  const handleStartExport = async () => {
    setIsExporting(true);
    setProgress(5);
    setStatusMessage("Đang chuẩn bị dữ liệu và khởi động FFmpeg...");
    setExportError(null);
    setDownloadUrl(null);
    setFileSizeBytes(null);

    try {
      const res = await fetch(`/api/stories/${story.id}/export-video`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          resolution: selectedRes,
          customBgImage: customBgImage || undefined,
        }),
      });

      const data = await res.json();
      if (!res.ok || !data.success) {
        throw new Error(data.error || "Không thể bắt đầu xuất video.");
      }

      const jobId = data.jobId;

      // Poll progress every 800ms
      pollIntervalRef.current = setInterval(async () => {
        try {
          const pollRes = await fetch(
            `/api/stories/${story.id}/export-video/progress/${jobId}`,
          );
          const pollData = await pollRes.json();
          if (pollData.success && pollData.job) {
            const job = pollData.job;
            setProgress(job.progress || 10);
            setStatusMessage(job.message || "Đang xử lý...");

            if (job.status === "completed") {
              if (pollIntervalRef.current) clearInterval(pollIntervalRef.current);
              setIsExporting(false);
              setProgress(100);
              setDownloadUrl(job.downloadUrl);
              setFileSizeBytes(job.fileSizeBytes || null);
            } else if (job.status === "failed") {
              if (pollIntervalRef.current) clearInterval(pollIntervalRef.current);
              setIsExporting(false);
              setExportError(job.error || "Xuất video thất bại.");
            }
          }
        } catch (err: any) {
          console.error("Lỗi polling export progress:", err);
        }
      }, 800);
    } catch (err: any) {
      setIsExporting(false);
      setExportError(err.message || "Đã xảy ra lỗi khi xuất video.");
    }
  };

  const handleReset = () => {
    if (pollIntervalRef.current) clearInterval(pollIntervalRef.current);
    setIsExporting(false);
    setProgress(0);
    setStatusMessage("");
    setExportError(null);
    setDownloadUrl(null);
  };

  return (
    <div
      className="fixed inset-0 z-50 bg-black/80 backdrop-blur-md flex items-center justify-center p-3 sm:p-5 overflow-y-auto"
      onClick={() => {
        if (!isExporting) onClose();
      }}
    >
      <div
        className="relative w-full max-w-2xl bg-gradient-to-b from-slate-900 via-[#0e1124] to-slate-950 border border-purple-500/30 rounded-3xl shadow-[0_25px_60px_rgba(0,0,0,0.8)] overflow-hidden p-5 sm:p-7 flex flex-col gap-5 text-white"
        onClick={(e) => e.stopPropagation()}
      >
        {/* Header with Title and Close Button */}
        <div className="flex items-start justify-between gap-3 border-b border-purple-500/20 pb-4">
          <div className="flex items-center gap-3">
            <div className="w-11 h-11 rounded-2xl bg-gradient-to-br from-purple-600 via-pink-600 to-orange-500 flex items-center justify-center shadow-lg shadow-pink-500/20 text-white shrink-0">
              <Film className="w-6 h-6" />
            </div>
            <div>
              <div className="flex items-center gap-2">
                <span className="text-[10px] uppercase font-extrabold tracking-wider px-2 py-0.5 rounded-full bg-pink-500/10 text-pink-400 border border-pink-500/20">
                  Xuất Video 9:16 MP4
                </span>
                <span className="text-xs text-slate-400">Mobile Vertical Video</span>
              </div>
              <h3 className="text-lg sm:text-xl font-bold text-white mt-0.5 truncate max-w-md">
                {story.title}
              </h3>
            </div>
          </div>

          <button
            type="button"
            onClick={onClose}
            disabled={isExporting}
            className="w-9 h-9 rounded-full bg-slate-800/80 hover:bg-slate-700 text-slate-300 hover:text-white flex items-center justify-center transition-colors disabled:opacity-40 cursor-pointer"
            title="Đóng"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        {/* Content Body */}
        {!downloadUrl ? (
          <>
            {/* Resolution Selection Cards */}
            <div className="space-y-2.5">
              <label className="text-xs font-bold uppercase tracking-wider text-slate-300 flex items-center gap-1.5">
                <Smartphone className="w-4 h-4 text-pink-400" />
                <span>Chọn Độ Phân Giải (Tỷ lệ 9:16)</span>
              </label>

              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                {RESOLUTIONS.map((res) => {
                  const isSelected = selectedRes === res.key;
                  return (
                    <div
                      key={res.key}
                      onClick={() => !isExporting && setSelectedRes(res.key)}
                      className={`relative p-3.5 rounded-2xl border transition-all cursor-pointer ${
                        isSelected
                          ? "bg-gradient-to-br from-purple-950/80 via-[#181a38] to-[#14122c] border-pink-500 shadow-lg shadow-pink-500/15"
                          : "bg-slate-900/60 hover:bg-slate-800/60 border-slate-800 hover:border-slate-700"
                      } ${isExporting ? "opacity-60 pointer-events-none" : ""}`}
                    >
                      <div className="flex items-center justify-between mb-1">
                        <div className="flex items-center gap-2">
                          <span className="font-bold text-sm text-white">{res.label}</span>
                          <span
                            className={`text-[10px] font-semibold px-2 py-0.5 rounded-full border ${res.tagColor}`}
                          >
                            {res.tag}
                          </span>
                        </div>
                        <div
                          className={`w-5 h-5 rounded-full border flex items-center justify-center ${
                            isSelected
                              ? "bg-pink-500 border-pink-400 text-white"
                              : "border-slate-700 bg-slate-950"
                          }`}
                        >
                          {isSelected && <Check className="w-3 h-3 stroke-[3]" />}
                        </div>
                      </div>

                      <div className="text-xs font-mono text-pink-300 font-semibold mb-1">
                        {res.resText}
                      </div>
                      <p className="text-[11px] text-slate-400 leading-snug">{res.desc}</p>
                      <div className="mt-2 text-[10px] text-slate-500 font-mono">
                        {res.bitrateText}
                      </div>
                    </div>
                  );
                })}
              </div>
            </div>

            {/* Video Specifications & Element Checklist */}
            <div className="p-3.5 rounded-2xl bg-slate-950/70 border border-slate-800/80 space-y-2">
              <div className="text-xs font-bold text-slate-300 flex items-center gap-1.5">
                <Sparkles className="w-3.5 h-3.5 text-amber-400" />
                <span>Chi Tiết Khung Hình Được Kết Xuất Vào MP4:</span>
              </div>

              <div className="grid grid-cols-1 sm:grid-cols-2 gap-2 text-xs text-slate-400">
                <div className="flex items-center gap-2">
                  <span className="w-1.5 h-1.5 rounded-full bg-emerald-400" />
                  <span>
                    Thời lượng video:{" "}
                    <b className="text-white font-mono">
                      {formatSecs(masterDuration || story.masterAudio?.duration || 0)}
                    </b>{" "}
                    (100% khớp Audio Master)
                  </span>
                </div>
                <div className="flex items-center gap-2">
                  <span className="w-1.5 h-1.5 rounded-full bg-emerald-400" />
                  <span>
                    Góc cạnh: <b className="text-white">Vuông góc 9:16</b> (Không bo tròn khung)
                  </span>
                </div>
                <div className="flex items-center gap-2">
                  <span className="w-1.5 h-1.5 rounded-full bg-emerald-400" />
                  <span>
                    Đĩa xoay:{" "}
                    <b className="text-white">Xoay tròn 360°</b> + 2 Cầu Tinh vân phát sáng
                  </span>
                </div>
                <div className="flex items-center gap-2">
                  <span className="w-1.5 h-1.5 rounded-full bg-emerald-400" />
                  <span>
                    Hình nền:{" "}
                    <b className="text-white">
                      {customBgImage ? "Ảnh tùy chỉnh đã chọn" : "Dạ tiệc Tinh vân mặc định"}
                    </b>
                  </span>
                </div>
                <div className="flex items-center gap-2 sm:col-span-2">
                  <span className="w-1.5 h-1.5 rounded-full bg-emerald-400" />
                  <span>
                    Thẻ Phụ đề:{" "}
                    <b className="text-white">Chỉ hiện câu đang đọc với hiệu ứng mờ dần (Fade In/Out)</b>
                  </span>
                </div>
              </div>
            </div>

            {/* Error Message if any */}
            {exportError && (
              <div className="p-3.5 rounded-2xl bg-rose-950/80 border border-rose-500/40 text-rose-200 text-xs flex items-center gap-2.5">
                <AlertCircle className="w-4 h-4 text-rose-400 shrink-0" />
                <span>{exportError}</span>
              </div>
            )}

            {/* Progress Bar when exporting */}
            {isExporting && (
              <div className="p-4 rounded-2xl bg-gradient-to-r from-purple-950/60 via-slate-900/80 to-slate-950 border border-pink-500/30 space-y-2.5 animate-pulse">
                <div className="flex items-center justify-between text-xs font-semibold">
                  <span className="flex items-center gap-2 text-pink-300">
                    <Loader2 className="w-4 h-4 animate-spin text-pink-400" />
                    <span>{statusMessage || "Đang kết xuất video MP4..."}</span>
                  </span>
                  <span className="font-mono text-white text-sm">{progress}%</span>
                </div>

                <div className="w-full bg-slate-800 rounded-full h-2.5 overflow-hidden">
                  <div
                    className="h-full bg-gradient-to-r from-purple-600 via-pink-500 to-orange-400 rounded-full transition-all duration-300"
                    style={{ width: `${progress}%` }}
                  />
                </div>
                <div className="text-[11px] text-slate-400 italic">
                  * Tiến trình đang xử lý hình ảnh vector, hiệu ứng đĩa quay và ghép luồng âm thanh master...
                </div>
              </div>
            )}

            {/* Action Buttons */}
            <div className="flex items-center justify-end gap-3 pt-2">
              <button
                type="button"
                onClick={onClose}
                disabled={isExporting}
                className="px-4 py-2.5 rounded-xl bg-slate-800 hover:bg-slate-700 text-slate-300 hover:text-white text-xs font-semibold transition-all disabled:opacity-40 cursor-pointer"
              >
                Hủy bỏ
              </button>

              <button
                type="button"
                onClick={handleStartExport}
                disabled={isExporting}
                className="flex items-center gap-2 px-6 py-2.5 rounded-xl bg-gradient-to-r from-purple-600 via-pink-600 to-orange-500 hover:from-purple-500 hover:to-orange-400 text-white text-xs font-bold shadow-lg shadow-pink-500/25 active:scale-95 transition-all disabled:opacity-50 cursor-pointer"
              >
                {isExporting ? (
                  <>
                    <Loader2 className="w-4 h-4 animate-spin" />
                    <span>Đang Xuất Video...</span>
                  </>
                ) : (
                  <>
                    <Film className="w-4 h-4" />
                    <span>Bắt Đầu Xuất Video MP4 ({selectedRes.toUpperCase()})</span>
                  </>
                )}
              </button>
            </div>
          </>
        ) : (
          /* Success & Download Screen */
          <div className="space-y-5 text-center py-4">
            <div className="w-16 h-16 rounded-full bg-emerald-500/20 border-2 border-emerald-500 text-emerald-400 mx-auto flex items-center justify-center shadow-lg shadow-emerald-500/20">
              <CheckCircle2 className="w-8 h-8" />
            </div>

            <div>
              <h4 className="text-lg font-bold text-white mb-1">
                Xuất Video MP4 {selectedRes.toUpperCase()} Thành Công!
              </h4>
              <p className="text-xs text-slate-400">
                Toàn bộ khung hình Media Player 9:16 đã được xuất hoàn tất với độ dài{" "}
                <b className="text-white font-mono">
                  {formatSecs(masterDuration || story.masterAudio?.duration || 0)}
                </b>
                {fileSizeBytes ? ` (${formatFileSize(fileSizeBytes)})` : ""}.
              </p>
            </div>

            {/* Video Player Preview */}
            <div className="w-full max-w-xs mx-auto border-2 border-slate-700 rounded-none overflow-hidden shadow-2xl bg-black">
              <video
                src={downloadUrl}
                controls
                className="w-full max-h-80 object-contain mx-auto"
                playsInline
              />
            </div>

            {/* Download and Re-export Buttons */}
            <div className="flex flex-col sm:flex-row items-center justify-center gap-3 pt-2">
              <a
                href={downloadUrl}
                download={`story-${story.id}-${selectedRes}.mp4`}
                className="w-full sm:w-auto flex items-center justify-center gap-2 px-6 py-3 rounded-xl bg-gradient-to-r from-emerald-500 to-teal-500 hover:from-emerald-400 hover:to-teal-400 text-slate-950 text-xs font-bold shadow-lg shadow-emerald-500/20 active:scale-95 transition-all"
              >
                <Download className="w-4 h-4 stroke-[2.5]" />
                <span>Tải Video MP4 Về Máy ({selectedRes.toUpperCase()})</span>
              </a>

              <button
                type="button"
                onClick={handleReset}
                className="w-full sm:w-auto flex items-center justify-center gap-1.5 px-4 py-3 rounded-xl bg-slate-800 hover:bg-slate-700 border border-slate-700 text-xs text-slate-200 hover:text-white transition-all font-semibold"
              >
                <RotateCcw className="w-3.5 h-3.5 text-pink-400" />
                <span>Xuất độ phân giải khác</span>
              </button>
            </div>
          </div>
        )}
      </div>
    </div>
  );
};
