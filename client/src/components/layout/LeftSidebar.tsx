import { CircleHelp, Clock3, Image, Plus, Settings, type LucideIcon } from "lucide-react";
import type { Page } from "../../App";

type SidebarItem = {
  page: Page;
  label: string;
  icon: LucideIcon;
  action?: "add";
};

const items: SidebarItem[] = [
  { page: "canvas", label: "添加节点", icon: Plus, action: "add" },
  { page: "assets", label: "素材库", icon: Image },
  { page: "history", label: "历史记录", icon: Clock3 },
  { page: "settings", label: "设置中心", icon: Settings },
  { page: "canvas", label: "帮助", icon: CircleHelp }
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
    <aside className="pointer-events-auto fixed left-3 top-16 z-40 flex w-[52px] flex-col items-center gap-2 rounded-[18px] border border-white/[0.08] bg-[#0a0d14]/[0.72] px-2 py-2.5 shadow-[0_12px_34px_rgba(0,0,0,0.24)] backdrop-blur-2xl">
      {items.map((item) => {
        const Icon = item.icon;
        const active = page === item.page && item.action !== "add";
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
              else onNavigate(item.page);
            }}
            className={`pointer-events-auto flex h-10 w-10 cursor-pointer items-center justify-center rounded-xl text-[#c4ccd8] transition duration-150 hover:bg-white/[0.05] hover:text-white ${
              active
                ? "bg-[linear-gradient(135deg,rgba(139,92,246,0.95),rgba(99,102,241,0.76))] text-white shadow-[0_0_22px_rgba(139,92,246,0.28),inset_0_1px_0_rgba(255,255,255,0.15)]"
                : "bg-transparent"
            }`}
          >
            <Icon size={18} strokeWidth={1.8} />
          </button>
        );
      })}
    </aside>
  );
}
