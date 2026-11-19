import { NAV_PAGES } from "./navbarPages";

export default function NavbarPageGrid({ activeTab, onSelect }) {
  return (
    <div className="grid grid-cols-3 gap-2 p-3">
      {NAV_PAGES.map(({ id, label, desc, Icon, active }) => {
        const isActive = activeTab === id;
        return (
          <button
            key={id}
            type="button"
            title={desc}
            aria-current={isActive ? "page" : undefined}
            onClick={() => onSelect(id)}
            className={`flex min-w-0 flex-col items-center justify-center gap-1.5 rounded-lg border px-1.5 py-3 text-center text-[11px] font-semibold leading-tight transition-colors cursor-pointer ${
              isActive
                ? active
                : "border-slate-800 bg-slate-950/40 text-slate-300 hover:border-slate-600 hover:bg-slate-800 hover:text-white"
            }`}
          >
            <Icon className="h-5 w-5 shrink-0" />
            <span className="w-full break-words">{label}</span>
          </button>
        );
      })}
    </div>
  );
}
