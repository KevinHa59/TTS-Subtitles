import { LayoutGrid, X } from "lucide-react";
import NavbarPageGrid from "./NavbarPageGrid";
import NavbarUtilities from "./NavbarUtilities";
import { NAV_PAGES } from "./navbarPages";

/**
 * Navbar dạng nút nổi (floating) góc trên bên phải, không chiếm diện tích layout.
 * Popup gồm: tiêu đề trang hiện tại → grid trang/công cụ → tiện ích.
 */
export default function Navbar({
  activeTab,
  handleNavigateTab,
  navMenuOpen,
  navRef,
  setNavMenuOpen,
  setShowApiModal,
  setShowAudioCleanupModal,
  setShowSetupModal,
  setShowThemeModal,
  theme,
  themes,
}) {
  const activePage = NAV_PAGES.find((page) => page.id === activeTab);
  const closeMenu = () => setNavMenuOpen(false);
  const run = (action) => () => {
    action();
    closeMenu();
  };

  return (
    <div
      ref={navRef}
      className="fixed right-2 top-[max(0.5rem,env(safe-area-inset-top))] z-[60] select-none"
    >
      <button
        type="button"
        onClick={() => setNavMenuOpen((open) => !open)}
        aria-label={navMenuOpen ? "Đóng menu" : "Mở menu trang và công cụ"}
        aria-haspopup="dialog"
        aria-expanded={navMenuOpen}
        title="Menu"
        className={`flex h-9 w-9 items-center justify-center rounded-full border shadow-lg backdrop-blur transition-all cursor-pointer ${
          navMenuOpen
            ? "border-amber-500/60 bg-slate-900 text-amber-400"
            : "border-slate-700 bg-slate-900/70 text-slate-300 opacity-60 hover:border-amber-500/50 hover:text-amber-400 hover:opacity-100"
        }`}
      >
        {navMenuOpen ? (
          <X className="h-4 w-4" />
        ) : (
          <LayoutGrid className="h-4 w-4" />
        )}
      </button>

      {navMenuOpen && (
        <div
          role="dialog"
          aria-label="Menu trang và công cụ"
          className="absolute right-0 top-full mt-2 max-h-[calc(100vh-4rem)] w-[min(94vw,380px)] overflow-y-auto rounded-xl border border-slate-700 bg-slate-900/95 shadow-2xl backdrop-blur"
        >
          {/* 1. Page title */}
          <div className="flex items-center gap-2.5 border-b border-slate-800 px-3 py-2.5 pr-12">
            <div className="flex h-7 w-7 shrink-0 items-center justify-center rounded-md bg-gradient-to-br from-amber-500 via-orange-500 to-rose-600 text-[10px] font-black tracking-tighter text-slate-950">
              TTS
            </div>
            <div className="min-w-0">
              <div className="text-[10px] font-medium uppercase tracking-wider text-slate-500">
                Piper TTS Studio
              </div>
              <h2 className="truncate text-sm font-bold text-white">
                {activePage?.title ?? "Piper TTS Studio"}
              </h2>
            </div>
          </div>

          {/* 2. Pages & tools grid */}
          <NavbarPageGrid
            activeTab={activeTab}
            onSelect={(id) => {
              handleNavigateTab(id);
              closeMenu();
            }}
          />

          {/* 3. Utilities */}
          <NavbarUtilities
            onOpenApi={run(() => setShowApiModal(true))}
            onOpenAudioCleanup={run(() => setShowAudioCleanupModal(true))}
            onOpenSetup={run(() => setShowSetupModal(true))}
            onOpenTheme={run(() => setShowThemeModal(true))}
            theme={theme}
            themes={themes}
          />
        </div>
      )}
    </div>
  );
}
