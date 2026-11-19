import { UploadCloud } from "lucide-react";

export default function DragOverlay({
  processSubtitleFile,
  setIsWindowDragging,
}) {
  return (
    <div
      onDragOver={(e) => {
        e.preventDefault();
        e.stopPropagation();
      }}
      onDragLeave={(e) => {
        e.preventDefault();
        e.stopPropagation();
        setIsWindowDragging(false);
      }}
      onDrop={(e) => {
        e.preventDefault();
        e.stopPropagation();
        setIsWindowDragging(false);
        const files = e.dataTransfer?.files;
        if (files && files.length > 0) {
          processSubtitleFile(files[0]);
        }
      }}
      className="fixed inset-0 z-50 bg-slate-950/85 backdrop-blur-md border-4 border-dashed border-amber-400 flex flex-col items-center justify-center gap-4 animate-in fade-in duration-150 p-6 select-none"
    >
      <div className="w-20 h-20 rounded-none bg-amber-500 text-slate-950 flex items-center justify-center shadow-2xl shadow-amber-500/50 scale-110 animate-bounce">
        <UploadCloud className="w-10 h-10" />
      </div>
      <div className="text-center space-y-1.5">
        <h3 className="text-2xl font-black text-white">
          Thả tệp phụ đề vào đây
        </h3>
        <p className="text-sm text-amber-300 font-medium">
          Hỗ trợ tệp phụ đề .SRT hoặc .TXT tiếng Việt
        </p>
        <p className="text-xs text-slate-400">
          Hệ thống sẽ tự động phân tích và đồng bộ timeline ngay lập tức
        </p>
      </div>
    </div>
  );
}
