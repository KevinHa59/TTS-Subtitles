import {
  BookOpen,
  Captions,
  Code,
  Music,
  Scissors,
  Settings,
  Sliders,
  Sparkles,
  Trash2,
  UploadCloud,
  Zap,
} from "lucide-react";

export default function MoreMenu({
  activeTab,
  handleNavigateTab,
  setMoreMenuOpen,
  setShowApiModal,
  setShowAudioCleanupModal,
  setShowSetupModal,
  setShowThemeModal,
  theme,
  themes,
}) {
  return (
    <div
      role="menu"
      className="absolute right-4 top-full z-50 mt-2 max-h-[calc(100dvh-5rem)] w-72 overflow-y-auto rounded-xl border border-slate-700 bg-slate-900/98 p-2 shadow-2xl shadow-black/40 backdrop-blur-xl"
    >
      <div className="px-3 pb-1 pt-1 text-[10px] font-bold uppercase tracking-wider text-slate-500">
        Công cụ
      </div>
      <button
        type="button"
        role="menuitem"
        onClick={() => {
          handleNavigateTab("subtitle-editor");
          setMoreMenuOpen(false);
        }}
        className={`flex w-full items-center gap-3 rounded-lg px-3 py-2.5 text-left text-sm font-medium transition-colors ${
          activeTab === "subtitle-editor"
            ? "bg-violet-400 text-slate-950"
            : "text-slate-200 hover:bg-slate-800 hover:text-white"
        }`}
      >
        <Captions className="h-4 w-4" />
        <span>
          Dịch & Sửa SRT
          <span
            className={`mt-0.5 block text-xs ${activeTab === "subtitle-editor" ? "text-slate-800" : "text-slate-500"}`}
          >
            Dịch và chỉnh sửa phụ đề
          </span>
        </span>
      </button>
      <button
        type="button"
        role="menuitem"
        onClick={() => {
          handleNavigateTab("single");
          setMoreMenuOpen(false);
        }}
        className={`mt-1 flex w-full items-center gap-3 rounded-lg px-3 py-2.5 text-left text-sm font-medium transition-colors ${
          activeTab === "single"
            ? "bg-amber-500 text-slate-950"
            : "text-slate-200 hover:bg-slate-800 hover:text-white"
        }`}
      >
        <Zap className="h-4 w-4" />
        <span>
          Đọc Đoạn Văn Nhanh
          <span
            className={`mt-0.5 block text-xs ${activeTab === "single" ? "text-slate-800" : "text-slate-500"}`}
          >
            Tạo giọng đọc từ văn bản
          </span>
        </span>
      </button>
      <button
        type="button"
        role="menuitem"
        onClick={() => {
          handleNavigateTab("story");
          setMoreMenuOpen(false);
        }}
        className={`mt-1 flex w-full items-center gap-3 rounded-lg px-3 py-2.5 text-left text-sm font-medium transition-colors ${
          activeTab === "story"
            ? "bg-amber-500 text-slate-950"
            : "text-slate-200 hover:bg-slate-800 hover:text-white"
        }`}
      >
        <BookOpen className="h-4 w-4" />
        <span>
          Kể Truyện
          <span
            className={`mt-0.5 block text-xs ${activeTab === "story" ? "text-slate-800" : "text-slate-500"}`}
          >
            Kể chuyện đa nhân vật
          </span>
        </span>
      </button>
      <button
        type="button"
        role="menuitem"
        onClick={() => {
          handleNavigateTab("bgm");
          setMoreMenuOpen(false);
        }}
        className={`mt-1 flex w-full items-center gap-3 rounded-lg px-3 py-2.5 text-left text-sm font-medium transition-colors ${
          activeTab === "bgm"
            ? "bg-amber-500 text-slate-950"
            : "text-slate-200 hover:bg-slate-800 hover:text-white"
        }`}
      >
        <Music className="h-4 w-4" />
        <span>
          Tạo Nhạc Nền
          <span
            className={`mt-0.5 block text-xs ${activeTab === "bgm" ? "text-slate-800" : "text-slate-500"}`}
          >
            Tạo nhạc nền và âm thanh AI
          </span>
        </span>
      </button>
      <button
        type="button"
        role="menuitem"
        onClick={() => {
          handleNavigateTab("voice-effects");
          setMoreMenuOpen(false);
        }}
        className={`flex w-full items-center gap-3 rounded-lg px-3 py-2.5 text-left text-sm font-medium transition-colors ${
          activeTab === "voice-effects"
            ? "bg-amber-500 text-slate-950"
            : "text-slate-200 hover:bg-slate-800 hover:text-white"
        }`}
      >
        <Sparkles className="h-4 w-4" />
        <span>
          Voice Effects
          <span
            className={`mt-0.5 block text-xs ${activeTab === "voice-effects" ? "text-slate-800" : "text-slate-500"}`}
          >
            Tạo và lưu preset giọng nói
          </span>
        </span>
      </button>
      <button
        type="button"
        role="menuitem"
        onClick={() => {
          handleNavigateTab("srt-from-text");
          setMoreMenuOpen(false);
        }}
        className={`mt-1 flex w-full items-center gap-3 rounded-lg px-3 py-2.5 text-left text-sm font-medium transition-colors ${
          activeTab === "srt-from-text"
            ? "bg-amber-500 text-slate-950"
            : "text-slate-200 hover:bg-slate-800 hover:text-white"
        }`}
      >
        <Captions className="h-4 w-4" />
        <span>
          SRT from Text
          <span
            className={`mt-0.5 block text-xs ${activeTab === "srt-from-text" ? "text-slate-800" : "text-slate-500"}`}
          >
            Tách văn bản thành nhiều file SRT
          </span>
        </span>
      </button>
      <button
        type="button"
        role="menuitem"
        onClick={() => {
          handleNavigateTab("join-split-video");
          setMoreMenuOpen(false);
        }}
        className={`mt-1 flex w-full items-center gap-3 rounded-lg px-3 py-2.5 text-left text-sm font-medium transition-colors ${
          activeTab === "join-split-video"
            ? "bg-amber-500 text-slate-950"
            : "text-slate-200 hover:bg-slate-800 hover:text-white"
        }`}
      >
        <Scissors className="h-4 w-4" />
        <span>
          join-split-video
          <span
            className={`mt-0.5 block text-xs ${activeTab === "join-split-video" ? "text-slate-800" : "text-slate-500"}`}
          >
            Nối, cắt và xuất video
          </span>
        </span>
      </button>
      <button
        type="button"
        role="menuitem"
        onClick={() => {
          handleNavigateTab("file-transfer");
          setMoreMenuOpen(false);
        }}
        className={`mt-1 flex w-full items-center gap-3 rounded-lg px-3 py-2.5 text-left text-sm font-medium transition-colors ${
          activeTab === "file-transfer"
            ? "bg-cyan-400 text-slate-950"
            : "text-slate-200 hover:bg-slate-800 hover:text-white"
        }`}
      >
        <UploadCloud className="h-4 w-4" />
        <span>
          Transfer File
          <span
            className={`mt-0.5 block text-xs ${activeTab === "file-transfer" ? "text-slate-800" : "text-slate-500"}`}
          >
            Gửi và nhận file qua mạng LAN
          </span>
        </span>
      </button>
      <div className="my-2 border-t border-slate-800" />
      <div className="px-3 pb-1 text-[10px] font-bold uppercase tracking-wider text-slate-500">
        Tiện ích
      </div>
      <button
        type="button"
        role="menuitem"
        onClick={() => {
          setShowThemeModal(true);
          setMoreMenuOpen(false);
        }}
        className="flex w-full items-center gap-3 rounded-none px-3 py-2.5 text-left text-sm font-medium text-amber-300 transition-colors hover:bg-slate-800 hover:text-amber-200"
      >
        <Sliders className="h-4 w-4 text-amber-400" />
        <span>
          Cài Đặt Theme
          <span className="mt-0.5 block text-xs text-slate-400">
            {themes.find((t) => t.id === theme)?.name || "Đổi theme"}
          </span>
        </span>
      </button>
      <button
        type="button"
        role="menuitem"
        onClick={() => {
          setShowAudioCleanupModal(true);
          setMoreMenuOpen(false);
        }}
        className="flex w-full items-center gap-3 rounded-lg px-3 py-2.5 text-left text-sm font-medium text-rose-300 transition-colors hover:bg-rose-950/60 hover:text-rose-200"
      >
        <Trash2 className="h-4 w-4" />
        <span>Dọn Dẹp Audio</span>
      </button>
      <button
        type="button"
        role="menuitem"
        onClick={() => {
          setShowSetupModal(true);
          setMoreMenuOpen(false);
        }}
        className="mt-1 flex w-full items-center gap-3 rounded-lg px-3 py-2.5 text-left text-sm font-medium text-slate-200 transition-colors hover:bg-slate-800 hover:text-white"
      >
        <Settings className="h-4 w-4" />
        <span>Setup</span>
      </button>
      <button
        type="button"
        role="menuitem"
        onClick={() => {
          setShowApiModal(true);
          setMoreMenuOpen(false);
        }}
        className="mt-1 flex w-full items-center gap-3 rounded-lg px-3 py-2.5 text-left text-sm font-medium text-slate-200 transition-colors hover:bg-slate-800 hover:text-white"
      >
        <Code className="h-4 w-4" />
        <span>Mã Nguồn</span>
      </button>
    </div>
  );
}
