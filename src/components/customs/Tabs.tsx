import { useState, type ReactNode } from "react";

interface TabItem {
  id: string;
  label: string;
  content: ReactNode;
  contentClassName?: string;
}

interface TabsProps {
  tabs: TabItem[];
  defaultTab?: string;
  className?: string;
}

export default function Tabs({ tabs, defaultTab, className = "" }: TabsProps) {
  const [activeTab, setActiveTab] = useState(defaultTab || tabs[0]?.id);

  if (!tabs.length) return null;

  const activeContent = tabs.find((tab) => tab.id === activeTab);
  const isFullHeight = className.includes("h-full");

  return (
    <div className={`w-full ${className}`}>
      {/* Tab Headers */}
      <div className="flex shrink-0 gap-1 rounded-xl border border-slate-800 bg-slate-950/70">
        {tabs.map((tab) => (
          <button
            key={tab.id}
            onClick={() => setActiveTab(tab.id)}
            className={`flex-1 rounded-lg px-3 py-2 text-xs font-semibold ${activeTab === tab.id ? "bg-cyan-400 text-slate-950" : "text-slate-300 hover:bg-slate-800"}`}
          >
            {tab.label}
          </button>
        ))}
      </div>

      {/* Tab Content */}
      <div
        className={`pt-1 ${
          isFullHeight
            ? "flex-1 min-h-0 " + (activeContent?.contentClassName || "overflow-y-auto")
            : ""
        }`}
      >
        {activeContent?.content}
      </div>
    </div>
  );
}
