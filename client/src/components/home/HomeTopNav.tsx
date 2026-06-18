import { useState } from "react";
import { Bell, Headphones, LogIn, LogOut, Settings, UserRound, WalletCards } from "lucide-react";
import type { Page } from "../../App";
import { useAuthStore } from "../../store/authStore";
import { BrandIdentity } from "../common/BrandIdentity";

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
  function handleNav(target: Page) {
    if (target === "photos") {
      window.location.assign("/photos");
      return;
    }
    if (target === "video") {
      onNavigate("canvas", "new");
      return;
    }
    onNavigate(target);
  }

  return (
    <header className="studio-home-nav fixed inset-x-0 top-0 z-50 flex h-[72px] items-center px-5 md:px-8">
      <button type="button" onClick={() => onNavigate("home")} className="flex items-center gap-2.5">
        <BrandIdentity />
      </button>
      <nav className="absolute left-1/2 hidden -translate-x-1/2 items-center gap-1 rounded-full border border-white/[0.07] bg-white/[0.035] p-1 md:flex">
        {links.map(([target, label]) => (
          <button key={target} type="button" onClick={() => handleNav(target)} className={`h-10 rounded-full px-4 text-[14px] transition ${page === target ? "bg-white/[0.12] font-medium text-white" : "text-white/58 hover:bg-white/[0.06] hover:text-white"}`}>{label}</button>
        ))}
      </nav>
      <div className="ml-auto flex items-center gap-1.5">
        {!auth.user && (
          <button type="button" onClick={() => onNavigate("login")} className="studio-login-button">
            <LogIn size={17} /> 登录 / 注册
          </button>
        )}
        {auth.user && (
          <>
        <button type="button" title="帮助中心" onClick={() => onNavigate("settings")} className="studio-nav-icon"><Headphones size={16} /></button>
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
        <button type="button" onClick={() => setAccountOpen((value) => !value)} className="studio-avatar-trigger" title="账号菜单">
          <span className="studio-avatar-mark"><UserRound size={18} /></span>
        </button>
        {accountOpen && <div className="studio-account-popover">
          <div className="studio-account-head">
            <span className="studio-account-avatar"><UserRound size={24} /></span>
            <strong>{auth.user?.email}</strong>
          </div>
          <div className="studio-account-divider" />
          <button type="button" onClick={() => { setAccountOpen(false); onNavigate("settings"); }}><Settings size={14}/> 用户设置</button>
          <div className="studio-account-divider" />
          {auth.workspaces.map((workspace)=><button key={workspace.id} type="button" className={workspace.id===auth.activeWorkspaceId?"is-active":""} onClick={()=>{auth.selectWorkspace(workspace.id);setAccountOpen(false);window.location.reload();}}><WalletCards size={14}/><span className="min-w-0 flex-1 truncate text-left">{workspace.name}</span><small>{workspace.type === "team" ? "团队" : "个人"}</small></button>)}
          <button type="button" onClick={()=>void auth.logout()}><LogOut size={14}/>退出登录</button>
        </div>}
        </div>
          </>
        )}
      </div>
    </header>
  );
}
