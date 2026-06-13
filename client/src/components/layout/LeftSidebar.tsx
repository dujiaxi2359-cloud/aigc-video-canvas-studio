import { CircleHelp, Clock3, FolderOpen, Grid3X3, Image, Plus, Settings, type LucideIcon } from "lucide-react";
import type { Page } from "../../App";

type SidebarItem = {
  page: Page;
  label: string;
  icon: LucideIcon;
  action?: "add" | "help";
};

const items: SidebarItem[] = [
  { page: "canvas", label: "添加节点", icon: Plus, action: "add" },
  { page: "canvas", label: "画布", icon: Grid3X3 },
  { page: "assets", label: "素材库", icon: Image },
  { page: "history", label: "历史记录", icon: Clock3 },
  { page: "settings", label: "设置中心", icon: Settings },
  { page: "workspace", label: "工作空间", icon: FolderOpen },
  { page: "canvas", label: "帮助", icon: CircleHelp, action: "help" }
];

export function LeftSidebar({
  page,
  onNavigate,
  onAddNodeClick
}: {
  page: Page;
  onNavigate: (page: Page) => void;
  onAddNodeClick?: () => void;
}) {
  return (
    <aside className="pointer-events-auto fixed left-3 top-[74px] z-40 flex w-[54px] flex-col items-center gap-2 rounded-full border border-white/[0.1] bg-[#111113]/[0.78] px-2 py-2 shadow-[0_22px_70px_rgba(0,0,0,0.45)] backdrop-blur-2xl">
      {items.map((item) => {
        const Icon = item.icon;
        const active = page === item.page && !item.action;
        return (
          <button
            key={item.label}
            title={item.label}
            type="button"
            data-sidebar-add-button={item.action === "add" ? "true" : undefined}
            onClick={(event) => {
              event.preventDefault();
              event.stopPropagation();
              if (item.action === "add") onAddNodeClick?.();
              else if (item.action === "help") window.dispatchEvent(new CustomEvent("studio:open-help"));
              else onNavigate(item.page);
            }}
            className={`pointer-events-auto relative flex h-10 w-10 cursor-pointer items-center justify-center rounded-full text-[#c4ccd8] transition duration-150 hover:bg-white/[0.08] hover:text-white ${
              active
                ? "bg-white text-black shadow-[0_0_0_5px_rgba(255,255,255,0.08)]"
                : item.action === "add"
                  ? "bg-white text-black shadow-[0_0_0_4px_rgba(255,255,255,0.08)]"
                  : "bg-transparent"
            }`}
          >
            <Icon size={18} strokeWidth={1.8} />
            {active || item.action === "add" ? <span className="absolute -right-0.5 -top-0.5 h-2 w-2 rounded-full bg-cyan-300 shadow-[0_0_12px_rgba(34,211,238,0.8)]" /> : null}
          </button>
        );
      })}
    </aside>
  );
}
