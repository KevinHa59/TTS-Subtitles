import { Code, Settings, Sliders, Trash2 } from "lucide-react";

export default function NavbarUtilities({
  onOpenApi,
  onOpenAudioCleanup,
  onOpenSetup,
  onOpenTheme,
  theme,
  themes,
}) {
  const themeName = themes.find((t) => t.id === theme)?.name || "Đổi theme";
  const items = [
    {
      key: "theme",
      label: "Theme",
      title: `Đổi giao diện · ${themeName}`,
      Icon: Sliders,
      iconClass: "text-amber-400",
      onClick: onOpenTheme,
    },
    {
      key: "cleanup",
      label: "Dọn audio",
      title: "Dọn dẹp audio rác",
      Icon: Trash2,
      iconClass: "text-rose-400",
      onClick: onOpenAudioCleanup,
    },
    {
      key: "setup",
      label: "Setup",
      title: "Cài đặt hệ thống (Setup)",
      Icon: Settings,
      iconClass: "text-slate-300",
      onClick: onOpenSetup,
    },
    {
      key: "api",
      label: "Mã nguồn",
      title: "Mã nguồn tích hợp",
      Icon: Code,
      iconClass: "text-slate-300",
      onClick: onOpenApi,
    },
  ];
  return (
    <div className="border-t border-slate-800 p-3">
      <div className="mb-2 text-[10px] font-bold uppercase tracking-wider text-slate-500">
        Tiện ích
      </div>
      <div className="grid grid-cols-4 gap-2">
        {items.map(({ key, label, title, Icon, iconClass, onClick }) => (
          <button
            key={key}
            type="button"
            title={title}
            onClick={onClick}
            className="flex min-w-0 flex-col items-center gap-1 rounded-lg px-1 py-2 text-[10px] font-medium text-slate-300 transition-colors hover:bg-slate-800 hover:text-white cursor-pointer"
          >
            <Icon className={`h-4 w-4 shrink-0 ${iconClass}`} />
            <span className="w-full truncate text-center">{label}</span>
          </button>
        ))}
      </div>
    </div>
  );
}
