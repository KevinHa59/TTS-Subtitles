import {
  Captions,
  ChevronDown,
  FileText,
  Film,
  Menu,
  Settings,
  Sliders,
  Sparkles,
  Trash2,
  X,
} from "lucide-react";

export default function NavbarTopBar({
  activeTab,
  handleNavigateTab,
  mobileMenuOpen,
  moreMenuOpen,
  setMobileMenuOpen,
  setMoreMenuOpen,
  setShowAudioCleanupModal,
  setShowSetupModal,
  setShowThemeModal,
}) {
  return (
    <div className="h-10 sm:h-11 border-b border-slate-800 bg-slate-900 flex items-stretch justify-between px-3 rounded-none w-full">
      {/* Logo & Brand */}
      <div className="flex items-center gap-2.5 shrink-0 pr-3">
        <div className="w-6 h-6 rounded-none bg-gradient-to-br from-amber-500 via-orange-500 to-rose-600 flex items-center justify-center text-slate-950 font-black text-xs tracking-tighter shrink-0">
          TTS
        </div>
        <div className="flex items-center gap-2">
          <h1 className="font-bold text-xs sm:text-sm text-white tracking-tight uppercase whitespace-nowrap">
            Piper TTS Studio
          </h1>
          <span className="text-[10px] text-amber-400 font-mono font-medium hidden md:inline px-1.5 py-0.2 bg-amber-500/10 border border-amber-500/20 rounded-none">
            Desktop
          </span>
          {/* Active mode indicator badge on mobile view */}
          <span className="lg:hidden text-[10px] font-medium px-2 py-0.5 rounded-none bg-amber-500/15 text-amber-400 border border-amber-500/30 truncate max-w-[125px] sm:max-w-none">
            {activeTab === "subtitles" && "Đồng Bộ SRT"}
            {activeTab === "single" && "Đọc Đoạn Văn"}
            {activeTab === "story" && "Kể Truyện"}
            {activeTab === "bgm" && "Tạo Nhạc Nền"}
            {activeTab === "voice-clone" && "Clone Giọng"}
            {activeTab === "video-dubbing" && "Video Dubbing"}
            {activeTab === "subtitle-ocr" && "OCR Phụ Đề"}
            {activeTab === "subtitle-editor" && "Dịch & Sửa SRT"}
            {activeTab === "join-split-video" && "Join / Split Video"}
            {activeTab === "voice-effects" && "Voice Effects"}
            {activeTab === "file-transfer" && "Transfer"}
          </span>
        </div>
      </div>

      {/* Desktop Navigation (>= lg screens: docked desktop tab bar) */}
      <div className="hidden lg:flex items-stretch h-full shrink-0 flex-nowrap">
        <nav className="flex items-stretch h-full border-l border-slate-800 text-xs shrink-0 flex-nowrap">
          <button
            type="button"
            onClick={() => handleNavigateTab("subtitles")}
            className={`px-3.5 h-full border-r border-slate-800 font-semibold transition-colors flex items-center gap-1.5 whitespace-nowrap cursor-pointer rounded-none text-xs ${
              activeTab === "subtitles"
                ? "bg-slate-800 text-amber-400 border-b-2 border-b-amber-500 font-bold"
                : "text-slate-400 hover:text-white hover:bg-slate-800/50"
            }`}
          >
            <FileText className="w-3.5 h-3.5 text-amber-400" />
            <span>Đồng Bộ Phụ Đề (SRT)</span>
          </button>
          <button
            type="button"
            onClick={() => handleNavigateTab("video-dubbing")}
            className={`px-3.5 h-full border-r border-slate-800 font-semibold transition-colors flex items-center gap-1.5 whitespace-nowrap cursor-pointer rounded-none text-xs ${
              activeTab === "video-dubbing"
                ? "bg-slate-800 text-amber-400 border-b-2 border-b-amber-500 font-bold"
                : "text-slate-400 hover:text-white hover:bg-slate-800/50"
            }`}
          >
            <Film className="w-3.5 h-3.5" />
            <span>Video Dubbing</span>
          </button>
          <button
            type="button"
            onClick={() => handleNavigateTab("subtitle-ocr")}
            className={`px-3.5 h-full border-r border-slate-800 font-semibold transition-colors flex items-center gap-1.5 whitespace-nowrap cursor-pointer rounded-none text-xs ${
              activeTab === "subtitle-ocr"
                ? "bg-slate-800 text-cyan-400 border-b-2 border-b-cyan-500 font-bold"
                : "text-slate-400 hover:text-white hover:bg-slate-800/50"
            }`}
          >
            <Captions className="w-3.5 h-3.5" />
            <span>OCR Phụ Đề</span>
          </button>
          <button
            type="button"
            onClick={() => handleNavigateTab("voice-clone")}
            className={`px-3.5 h-full border-r border-slate-800 font-semibold transition-colors flex items-center gap-1.5 whitespace-nowrap cursor-pointer rounded-none text-xs ${
              activeTab === "voice-clone"
                ? "bg-slate-800 text-amber-400 border-b-2 border-b-amber-500 font-bold"
                : "text-amber-400 hover:text-amber-200 hover:bg-slate-800/50"
            }`}
            title="Trang huấn luyện và Clone giọng nói tiếng Việt bằng Google Colab (/voice-clone)"
          >
            <Sparkles className="w-3.5 h-3.5" />
            <span>Clone Giọng</span>
          </button>
          <button
            type="button"
            onClick={() => setMoreMenuOpen((open) => !open)}
            aria-expanded={moreMenuOpen}
            aria-haspopup="menu"
            className={`px-3.5 h-full border-r border-slate-800 font-semibold transition-colors flex items-center gap-1.5 whitespace-nowrap cursor-pointer rounded-none text-xs ${
              moreMenuOpen ||
              activeTab === "subtitle-editor" ||
              activeTab === "single" ||
              activeTab === "story" ||
              activeTab === "bgm" ||
              activeTab === "voice-effects" ||
              activeTab === "srt-from-text" ||
              activeTab === "join-split-video" ||
              activeTab === "file-transfer"
                ? "bg-slate-800 text-amber-400 border-b-2 border-b-amber-500 font-bold"
                : "text-slate-400 hover:text-white hover:bg-slate-800/50"
            }`}
          >
            <span>Thêm Công Cụ...</span>
            <ChevronDown
              className={`h-3 w-3 transition-transform ${moreMenuOpen ? "rotate-180" : ""}`}
            />
          </button>
        </nav>
      </div>

      {/* Desktop Quick Header Actions & Mobile Hamburger */}
      <div className="flex items-center gap-1 shrink-0">
        <button
          type="button"
          onClick={() => setShowThemeModal(true)}
          className="p-1.5 text-amber-400 hover:text-amber-300 hover:bg-slate-800 rounded-none transition-colors flex items-center gap-1 text-xs font-semibold cursor-pointer"
          title="Đổi giao diện / Theme (Desktop Dark, Zinc, Light, OLED High Contrast)"
        >
          <Sliders className="w-3.5 h-3.5" />
          <span className="hidden xl:inline text-[11px]">Theme</span>
        </button>
        <button
          type="button"
          onClick={() => setShowSetupModal(true)}
          className="p-1.5 text-slate-400 hover:text-white hover:bg-slate-800 rounded-none transition-colors hidden sm:inline-flex cursor-pointer"
          title="Cài đặt hệ thống (Setup)"
        >
          <Settings className="w-4 h-4" />
        </button>
        <button
          type="button"
          onClick={() => setShowAudioCleanupModal(true)}
          className="p-1.5 text-rose-400/80 hover:text-rose-300 hover:bg-slate-800 rounded-none transition-colors hidden sm:inline-flex cursor-pointer"
          title="Dọn dẹp audio rác"
        >
          <Trash2 className="w-4 h-4" />
        </button>
        <button
          type="button"
          onClick={() => setMobileMenuOpen((prev) => !prev)}
          aria-label="Mở menu chuyển tab và tính năng"
          className="p-1.5 text-slate-300 hover:text-white hover:bg-slate-800 lg:hidden rounded-none transition-colors"
        >
          {mobileMenuOpen ? (
            <X className="w-5 h-5 text-amber-400" />
          ) : (
            <Menu className="w-5 h-5 text-slate-200" />
          )}
        </button>
      </div>
    </div>
  );
}
