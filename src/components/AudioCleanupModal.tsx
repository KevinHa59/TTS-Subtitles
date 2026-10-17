import React, { useState, useEffect } from "react";
import {
  Trash2,
  X,
  AlertTriangle,
  CheckCircle2,
  RefreshCw,
  HardDrive,
  FileAudio,
  ShieldCheck,
  Check,
} from "lucide-react";

interface AudioCleanupModalProps {
  isOpen: boolean;
  onClose: () => void;
  onCleaned?: (result: { deletedFiles: number; freedMB: number }) => void;
}

interface AudioStatus {
  subtitles: { files: number; bytes: number; mb: number };
  storyParagraphs: { files: number; bytes: number; mb: number };
  storyMasters: { files: number; bytes: number; mb: number };
  total: { files: number; bytes: number; mb: number };
}

export default function AudioCleanupModal({
  isOpen,
  onClose,
  onCleaned,
}: AudioCleanupModalProps) {
  const [loading, setLoading] = useState(false);
  const [cleaning, setCleaning] = useState(false);
  const [status, setStatus] = useState<AudioStatus | null>(null);
  const [result, setResult] = useState<{
    success: boolean;
    deletedFiles: number;
    freedMB: number;
    message: string;
  } | null>(null);

  // Options
  const [cleanSubtitles, setCleanSubtitles] = useState(true);
  const [cleanStoryParagraphs, setCleanStoryParagraphs] = useState(true);
  const [cleanStoryMasters, setCleanStoryMasters] = useState(false);

  useEffect(() => {
    if (isOpen) {
      setResult(null);
      fetchStatus();
    }
  }, [isOpen]);

  const fetchStatus = async () => {
    setLoading(true);
    try {
      const res = await fetch("/api/audio/status");
      const data = await res.json();
      setStatus(data);
    } catch (err) {
      console.error("Lỗi kiểm tra dung lượng audio tạm:", err);
    } finally {
      setLoading(false);
    }
  };

  const handleCleanup = async () => {
    setCleaning(true);
    try {
      const res = await fetch("/api/audio/cleanup", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          cleanSubtitles,
          cleanStoryParagraphs,
          cleanStoryMasters,
        }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || "Lỗi dọn dẹp audio");

      setResult(data);
      if (onCleaned) {
        onCleaned({ deletedFiles: data.deletedFiles, freedMB: data.freedMB });
      }
      // Refresh status after clean
      fetchStatus();
    } catch (err: any) {
      setResult({
        success: false,
        deletedFiles: 0,
        freedMB: 0,
        message: "Lỗi: " + err.message,
      });
    } finally {
      setCleaning(false);
    }
  };

  if (!isOpen) return null;

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-slate-950/80 backdrop-blur-sm animate-fadeIn">
      <div className="bg-slate-900 border border-slate-800 rounded-3xl max-w-lg w-full p-6 space-y-5 shadow-2xl relative text-slate-200">
        {/* Header */}
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-2.5">
            <div className="w-9 h-9 rounded-xl bg-rose-500/10 text-rose-400 border border-rose-500/20 flex items-center justify-center">
              <Trash2 className="w-5 h-5" />
            </div>
            <div>
              <h3 className="text-base font-bold text-white">Dọn Dẹp Audio Tạm</h3>
              <p className="text-xs text-slate-400">Giải phóng dung lượng bộ nhớ từ các tệp TTS tạm</p>
            </div>
          </div>
          <button
            type="button"
            onClick={onClose}
            className="p-1.5 rounded-lg text-slate-400 hover:text-white hover:bg-slate-800 transition-colors"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        {/* Result Message if performed */}
        {result && (
          <div
            className={`p-4 rounded-2xl border text-xs leading-relaxed flex items-start gap-3 ${
              result.success
                ? "bg-emerald-950/60 border-emerald-500/40 text-emerald-300"
                : "bg-rose-950/60 border-rose-500/40 text-rose-300"
            }`}
          >
            {result.success ? (
              <CheckCircle2 className="w-5 h-5 text-emerald-400 shrink-0 mt-0.5" />
            ) : (
              <AlertTriangle className="w-5 h-5 text-rose-400 shrink-0 mt-0.5" />
            )}
            <div>
              <p className="font-bold text-sm">{result.success ? "Dọn dẹp thành công!" : "Dọn dẹp thất bại"}</p>
              <p className="mt-0.5 text-xs opacity-90">{result.message}</p>
            </div>
          </div>
        )}

        {/* Current Disk Usage Stats */}
        <div className="bg-slate-950 border border-slate-800 rounded-2xl p-4 space-y-3">
          <div className="flex items-center justify-between text-xs">
            <span className="text-slate-400 flex items-center gap-1.5 font-medium">
              <HardDrive className="w-4 h-4 text-amber-400" />
              Tổng dung lượng tệp tạm phát hiện:
            </span>
            <span className="font-bold font-mono text-white text-sm">
              {loading ? "Đang tính..." : `${status?.total.files || 0} tệp (${status?.total.mb || 0} MB)`}
            </span>
          </div>

          <div className="grid grid-cols-2 gap-2 text-[11px] pt-1 border-t border-slate-800/80">
            <div className="p-2.5 rounded-xl bg-slate-900 border border-slate-800 space-y-1">
              <span className="text-slate-400">Audio Phụ Đề (Timeline):</span>
              <p className="font-bold font-mono text-amber-400">
                {status?.subtitles.files || 0} tệp ({status?.subtitles.mb || 0} MB)
              </p>
            </div>
            <div className="p-2.5 rounded-xl bg-slate-900 border border-slate-800 space-y-1">
              <span className="text-slate-400">Audio Đoạn Kể Truyện:</span>
              <p className="font-bold font-mono text-blue-400">
                {status?.storyParagraphs.files || 0} tệp ({status?.storyParagraphs.mb || 0} MB)
              </p>
            </div>
          </div>
        </div>

        {/* Selection Checkboxes */}
        <div className="space-y-3">
          <label className="text-xs font-bold text-slate-300 uppercase tracking-wider block">
            Chọn các hạng mục cần dọn dẹp:
          </label>

          <div className="space-y-2 text-xs">
            {/* Subtitles Audio */}
            <label className="flex items-center gap-3 p-3 rounded-xl bg-slate-950/70 border border-slate-800 cursor-pointer hover:border-slate-700 transition-colors">
              <input
                type="checkbox"
                checked={cleanSubtitles}
                onChange={(e) => setCleanSubtitles(e.target.checked)}
                className="w-4 h-4 rounded accent-amber-500"
              />
              <div className="flex-1">
                <p className="font-bold text-white">Audio tạm của Phụ Đề Timeline</p>
                <p className="text-[11px] text-slate-400">Xóa các file audio câu phụ đề trung gian trong jobs_storage</p>
              </div>
            </label>

            {/* Story Paragraphs Audio */}
            <label className="flex items-center gap-3 p-3 rounded-xl bg-slate-950/70 border border-slate-800 cursor-pointer hover:border-slate-700 transition-colors">
              <input
                type="checkbox"
                checked={cleanStoryParagraphs}
                onChange={(e) => setCleanStoryParagraphs(e.target.checked)}
                className="w-4 h-4 rounded accent-amber-500"
              />
              <div className="flex-1">
                <p className="font-bold text-white">Audio các đoạn của Kể Truyện</p>
                <p className="text-[11px] text-slate-400">Xóa các file audio riêng lẻ từng đoạn đã ghép</p>
              </div>
            </label>

            {/* Story Master Audio (Optional, disabled by default to protect user files) */}
            <label className="flex items-center gap-3 p-3 rounded-xl bg-slate-950/70 border border-slate-800 cursor-pointer hover:border-slate-700 transition-colors">
              <input
                type="checkbox"
                checked={cleanStoryMasters}
                onChange={(e) => setCleanStoryMasters(e.target.checked)}
                className="w-4 h-4 rounded accent-amber-500"
              />
              <div className="flex-1">
                <p className="font-bold text-white">Bao gồm cả file Master Audio của Truyện</p>
                <p className="text-[11px] text-slate-400">
                  Mặc định giữ lại file master thành phẩm để phát lại (chỉ chọn nếu muốn xóa sạch)
                </p>
              </div>
            </label>
          </div>
        </div>

        {/* Safety Guarantee */}
        <div className="flex items-start gap-2.5 p-3 rounded-xl bg-slate-950/40 border border-slate-800 text-[11px] text-slate-400">
          <ShieldCheck className="w-4 h-4 text-emerald-400 shrink-0 mt-0.5" />
          <span>
            <strong>Bảo đảm an toàn:</strong> Toàn bộ các mô hình giọng đọc ONNX trong <code>models/</code> và nội dung
            văn bản kịch bản truyện của bạn được bảo toàn tuyệt đối 100%.
          </span>
        </div>

        {/* Buttons */}
        <div className="flex items-center justify-end gap-3 pt-2">
          <button
            type="button"
            onClick={onClose}
            className="px-4 py-2.5 rounded-xl bg-slate-800 hover:bg-slate-700 text-xs font-semibold text-slate-300 hover:text-white transition-colors"
          >
            Đóng
          </button>

          <button
            type="button"
            onClick={handleCleanup}
            disabled={cleaning || (!cleanSubtitles && !cleanStoryParagraphs && !cleanStoryMasters)}
            className="flex items-center gap-2 px-5 py-2.5 rounded-xl bg-rose-600 hover:bg-rose-500 disabled:opacity-50 text-white text-xs font-bold shadow-lg shadow-rose-600/25 transition-all"
          >
            {cleaning ? (
              <>
                <RefreshCw className="w-3.5 h-3.5 animate-spin" />
                <span>Đang Dọn Dẹp...</span>
              </>
            ) : (
              <>
                <Trash2 className="w-3.5 h-3.5" />
                <span>Xác Nhận Dọn Dẹp</span>
              </>
            )}
          </button>
        </div>
      </div>
    </div>
  );
}
