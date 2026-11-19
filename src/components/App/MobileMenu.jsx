import {
  BookOpen,
  Captions,
  Code,
  FileText,
  Film,
  Music,
  Settings,
  Sparkles,
  Trash2,
  UploadCloud,
  Zap,
} from "lucide-react";

export default function MobileMenu({
  activeTab,
  handleNavigateTab,
  setMobileMenuOpen,
  setShowApiModal,
  setShowAudioCleanupModal,
  setShowSetupModal,
}) {
  return (
    <div className="relative z-40 lg:hidden border-t border-slate-800 bg-slate-900/98 backdrop-blur-xl px-4 py-4 space-y-4 shadow-2xl">
      <div>
        <div className="text-[11px] font-bold uppercase tracking-wider text-slate-400 mb-2 px-1">
          Chế độ làm việc
        </div>
        <div className="grid grid-cols-1 gap-1.5">
          <button
            type="button"
            onClick={() => {
              handleNavigateTab("subtitles");
              setMobileMenuOpen(false);
            }}
            className={`w-full flex items-center justify-between px-3.5 py-2.5 rounded-xl font-medium text-sm transition-all ${
              activeTab === "subtitles"
                ? "bg-amber-500 text-slate-950 font-bold shadow-md shadow-amber-500/20"
                : "bg-slate-950/60 text-slate-300 hover:text-white hover:bg-slate-800/60 border border-slate-800/70"
            }`}
          >
            <div className="flex items-center gap-2.5">
              <FileText
                className={`w-4 h-4 ${activeTab === "subtitles" ? "text-slate-950" : "text-amber-400"}`}
              />
              <span>Đồng Bộ Phụ Đề (SRT)</span>
            </div>
            {activeTab === "subtitles" && (
              <span className="text-[10px] font-bold px-2 py-0.5 rounded-full bg-slate-950/20 text-slate-950">
                Đang chọn
              </span>
            )}
          </button>

          <button
            type="button"
            onClick={() => {
              handleNavigateTab("video-dubbing");
              setMobileMenuOpen(false);
            }}
            className={`w-full flex items-center justify-between px-3.5 py-2.5 rounded-xl font-medium text-sm transition-all ${
              activeTab === "video-dubbing"
                ? "bg-amber-500 text-slate-950 font-bold shadow-md shadow-amber-500/20"
                : "bg-slate-950/60 text-slate-300 hover:text-white hover:bg-slate-800/60 border border-slate-800/70"
            }`}
          >
            <div className="flex items-center gap-2.5">
              <Film
                className={`w-4 h-4 ${activeTab === "video-dubbing" ? "text-slate-950" : "text-amber-400"}`}
              />
              <span>Video Dubbing</span>
            </div>
            {activeTab === "video-dubbing" && (
              <span className="text-[10px] font-bold px-2 py-0.5 rounded-full bg-slate-950/20 text-slate-950">
                Đang chọn
              </span>
            )}
          </button>

          <button
            type="button"
            onClick={() => {
              handleNavigateTab("subtitle-ocr");
              setMobileMenuOpen(false);
            }}
            className={`w-full flex items-center justify-between px-3.5 py-2.5 rounded-xl font-medium text-sm transition-all ${
              activeTab === "subtitle-ocr"
                ? "bg-cyan-400 text-slate-950 font-bold shadow-md shadow-cyan-500/20"
                : "bg-slate-950/60 text-slate-300 hover:text-white hover:bg-slate-800/60 border border-slate-800/70"
            }`}
          >
            <div className="flex items-center gap-2.5">
              <Captions
                className={`w-4 h-4 ${activeTab === "subtitle-ocr" ? "text-slate-950" : "text-cyan-300"}`}
              />
              <span>Trích xuất phụ đề cứng</span>
            </div>
            {activeTab === "subtitle-ocr" && (
              <span className="text-[10px] font-bold px-2 py-0.5 rounded-full bg-slate-950/20 text-slate-950">
                Đang chọn
              </span>
            )}
          </button>

          <button
            type="button"
            onClick={() => {
              handleNavigateTab("subtitle-editor");
              setMobileMenuOpen(false);
            }}
            className={`w-full flex items-center justify-between px-3.5 py-2.5 rounded-xl font-medium text-sm transition-all ${
              activeTab === "subtitle-editor"
                ? "bg-violet-400 text-slate-950 font-bold shadow-md shadow-violet-500/20"
                : "bg-slate-950/60 text-slate-300 hover:text-white hover:bg-slate-800/60 border border-slate-800/70"
            }`}
          >
            <div className="flex items-center gap-2.5">
              <Captions
                className={`w-4 h-4 ${activeTab === "subtitle-editor" ? "text-slate-950" : "text-violet-300"}`}
              />
              <span>Dịch & sửa phụ đề</span>
            </div>
            {activeTab === "subtitle-editor" && (
              <span className="text-[10px] font-bold px-2 py-0.5 rounded-full bg-slate-950/20 text-slate-950">
                Đang chọn
              </span>
            )}
          </button>

          <button
            type="button"
            onClick={() => {
              handleNavigateTab("single");
              setMobileMenuOpen(false);
            }}
            className={`w-full flex items-center justify-between px-3.5 py-2.5 rounded-xl font-medium text-sm transition-all ${
              activeTab === "single"
                ? "bg-amber-500 text-slate-950 font-bold shadow-md shadow-amber-500/20"
                : "bg-slate-950/60 text-slate-300 hover:text-white hover:bg-slate-800/60 border border-slate-800/70"
            }`}
          >
            <div className="flex items-center gap-2.5">
              <Zap
                className={`w-4 h-4 ${activeTab === "single" ? "text-slate-950" : "text-amber-400"}`}
              />
              <span>Đọc Đoạn Văn Nhanh</span>
            </div>
            {activeTab === "single" && (
              <span className="text-[10px] font-bold px-2 py-0.5 rounded-full bg-slate-950/20 text-slate-950">
                Đang chọn
              </span>
            )}
          </button>

          <button
            type="button"
            onClick={() => {
              handleNavigateTab("story");
              setMobileMenuOpen(false);
            }}
            className={`w-full flex items-center justify-between px-3.5 py-2.5 rounded-xl font-medium text-sm transition-all ${
              activeTab === "story"
                ? "bg-amber-500 text-slate-950 font-bold shadow-md shadow-amber-500/20"
                : "bg-slate-950/60 text-slate-300 hover:text-white hover:bg-slate-800/60 border border-slate-800/70"
            }`}
          >
            <div className="flex items-center gap-2.5">
              <BookOpen
                className={`w-4 h-4 ${activeTab === "story" ? "text-slate-950" : "text-amber-400"}`}
              />
              <span>Kể Truyện</span>
            </div>
            {activeTab === "story" && (
              <span className="text-[10px] font-bold px-2 py-0.5 rounded-full bg-slate-950/20 text-slate-950">
                Đang chọn
              </span>
            )}
          </button>

          <button
            type="button"
            onClick={() => {
              handleNavigateTab("bgm");
              setMobileMenuOpen(false);
            }}
            className={`w-full flex items-center justify-between px-3.5 py-2.5 rounded-xl font-medium text-sm transition-all ${
              activeTab === "bgm"
                ? "bg-amber-500 text-slate-950 font-bold shadow-md shadow-amber-500/20"
                : "bg-slate-950/60 text-slate-300 hover:text-white hover:bg-slate-800/60 border border-slate-800/70"
            }`}
          >
            <div className="flex items-center gap-2.5">
              <Music
                className={`w-4 h-4 ${activeTab === "bgm" ? "text-slate-950" : "text-amber-400"}`}
              />
              <span>Tạo Nhạc Nền</span>
            </div>
            {activeTab === "bgm" && (
              <span className="text-[10px] font-bold px-2 py-0.5 rounded-full bg-slate-950/20 text-slate-950">
                Đang chọn
              </span>
            )}
          </button>

          <button
            type="button"
            onClick={() => {
              handleNavigateTab("voice-clone");
              setMobileMenuOpen(false);
            }}
            className={`w-full flex items-center justify-between px-3.5 py-2.5 rounded-xl font-medium text-sm transition-all ${
              activeTab === "voice-clone"
                ? "bg-amber-500 text-slate-950 font-bold shadow-md shadow-amber-500/20"
                : "bg-slate-950/60 text-amber-300 hover:text-white hover:bg-slate-800/60 border border-amber-600/40"
            }`}
          >
            <div className="flex items-center gap-2.5">
              <Sparkles
                className={`w-4 h-4 ${activeTab === "voice-clone" ? "text-slate-950" : "text-amber-400"}`}
              />
              <span>Clone Giọng (Colab)</span>
            </div>
            {activeTab === "voice-clone" && (
              <span className="text-[10px] font-bold px-2 py-0.5 rounded-full bg-slate-950/20 text-slate-950">
                Đang chọn
              </span>
            )}
          </button>
        </div>
      </div>

      <div className="pt-3 border-t border-slate-800/80">
        <div className="text-[11px] font-bold uppercase tracking-wider text-slate-400 mb-2 px-1">
          Công cụ tiện ích
        </div>
        <div className="grid grid-cols-2 gap-2">
          <button
            type="button"
            onClick={() => {
              handleNavigateTab("file-transfer");
              setMobileMenuOpen(false);
            }}
            className="flex items-center justify-center gap-2 px-3 py-2.5 text-xs font-semibold text-cyan-200 bg-cyan-500/10 hover:bg-cyan-500/20 rounded-xl border border-cyan-500/30 transition-colors"
          >
            <UploadCloud className="w-4 h-4 text-cyan-300" />
            <span>Transfer File</span>
          </button>

          <button
            type="button"
            onClick={() => {
              setShowAudioCleanupModal(true);
              setMobileMenuOpen(false);
            }}
            className="flex items-center justify-center gap-2 px-3 py-2.5 text-xs font-semibold text-rose-300 bg-rose-950/50 hover:bg-rose-900/70 rounded-xl border border-rose-800/80 transition-colors"
          >
            <Trash2 className="w-4 h-4 text-rose-400" />
            <span>Dọn Dẹp Audio</span>
          </button>

          <button
            type="button"
            onClick={() => {
              setShowSetupModal(true);
              setMobileMenuOpen(false);
            }}
            className="flex items-center justify-center gap-2 px-3 py-2.5 text-xs font-semibold text-amber-200 bg-amber-500/10 hover:bg-amber-500/20 rounded-xl border border-amber-500/30 transition-colors"
          >
            <Settings className="w-4 h-4 text-amber-300" />
            <span>Setup</span>
          </button>

          <button
            type="button"
            onClick={() => {
              setShowApiModal(true);
              setMobileMenuOpen(false);
            }}
            className="flex items-center justify-center gap-2 px-3 py-2.5 text-xs font-medium text-slate-300 bg-slate-800/80 hover:bg-slate-700/80 rounded-xl border border-slate-700/70 transition-colors"
          >
            <Code className="w-4 h-4 text-amber-400" />
            <span>Mã Nguồn</span>
          </button>
        </div>
      </div>
    </div>
  );
}
