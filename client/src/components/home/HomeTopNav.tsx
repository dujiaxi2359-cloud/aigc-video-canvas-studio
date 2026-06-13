import { useState } from "react";
import { Bell, ChevronDown, Download, LogIn, LogOut, Settings, UserRound, WalletCards } from "lucide-react";
import type { Page } from "../../App";
import { useAuthStore } from "../../store/authStore";

const links: Array<[Page, string]> = [
  ["home", "首页"],
  ["photos", "图文创作"],
  ["video", "视频画布"],
  ["workspace", "工作空间"],
  ["assets", "素材库"],
  ["settings", "设置中心"]
];

export function HomeTopNav({ page, onNavigate }: { page: Page; onNavigate: (page: Page, projectId?: string) => void }) {
  const [notificationsOpen, setNotificationsOpen] = useState(false);
  const [accountOpen, setAccountOpen] = useState(false);
  const auth = useAuthStore();
  const activeWorkspace = auth.workspaces.find((workspace) => workspace.id === auth.activeWorkspaceId);
  return (
    <header className="studio-home-nav fixed inset-x-0 top-0 z-50 flex h-[72px] items-center px-5 md:px-8">
      <button type="button" onClick={() => onNavigate("home")} className="flex items-center gap-2.5">
        <span className="studio-brand-mark">N</span>
        <span className="hidden text-[14px] font-bold tracking-[0.08em] text-white sm:block">AIGCNONG</span>
        <Download size={15} className="hidden text-white/38 md:block" />
      </button>
      <nav className="absolute left-1/2 hidden -translate-x-1/2 items-center gap-1 rounded-full border border-white/[0.07] bg-white/[0.035] p-1 md:flex">
        {links.map(([target, label]) => (
          <button key={target} type="button" onClick={() => target === "photos" ? window.location.assign("/photos") : onNavigate(target)} className={`h-9 rounded-full px-4 text-[13px] transition ${page === target ? "bg-white/[0.12] font-medium text-white" : "text-white/48 hover:bg-white/[0.06] hover:text-white"}`}>{label}</button>
        ))}
      </nav>
      <div className="ml-auto flex items-center gap-1.5">
        {!auth.user && (
          <button type="button" onClick={() => onNavigate("login")} className="studio-secondary-button">
            <LogIn size={15} /> 登录
          </button>
        )}
        {auth.user && (
          <>
        <button type="button" title="设置中心" onClick={() => onNavigate("settings")} className="studio-nav-icon"><Settings size={16} /></button>
        <div className="relative">
          <button type="button" title="通知" className={`studio-nav-icon ${notificationsOpen ? "is-active" : ""}`} onClick={() => setNotificationsOpen((value) => !value)}><Bell size={16} /></button>
          {notificationsOpen && (
            <div className="studio-notification-popover">
              <strong>通知中心</strong>
              <p>暂无新的协作通知。生成任务、分享请求和项目变更会显示在这里。</p>
              <button type="button" onClick={() => setNotificationsOpen(false)}>知道了</button>
            </div>
          )}
        </div>
        <div className="relative">
        <button type="button" onClick={() => setAccountOpen((value) => !value)} className="flex h-10 items-center gap-2 rounded-full border border-white/[0.08] bg-white/[0.045] px-2.5 text-[12px] text-white/64">
          <span className="grid h-6 w-6 place-items-center rounded-full bg-white/[0.12] text-white"><UserRound size={13} /></span>
          <span className="hidden max-w-[150px] truncate sm:block">{activeWorkspace?.name || auth.user?.email}</span><ChevronDown size={13} />
        </button>
        {accountOpen && <div className="studio-notification-popover right-0 w-[280px]">
          <strong>{auth.user?.email}</strong><p>{activeWorkspace?.type === "team" ? "团队空间" : "个人空间"} · 剩余 {activeWorkspace?.credits ?? 0} credits</p>
          <div className="my-2 border-t border-white/[0.08]" />
          {auth.workspaces.map((workspace)=><button key={workspace.id} type="button" className={workspace.id===auth.activeWorkspaceId?"!bg-white/[0.1] !text-white":""} onClick={()=>{auth.selectWorkspace(workspace.id);setAccountOpen(false);window.location.reload();}}><WalletCards size={14}/><span className="min-w-0 flex-1 truncate text-left">{workspace.name}</span><small>{workspace.type === "team" ? "团队" : "个人"}</small></button>)}
          <button type="button" onClick={()=>void auth.logout()}><LogOut size={14}/>退出登录</button>
        </div>}
        </div>
          </>
        )}
      </div>
    </header>
  );
}
