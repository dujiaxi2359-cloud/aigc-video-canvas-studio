import { useState } from "react";
import { AnimatePresence, motion } from "framer-motion";
import {
  Bell,
  BriefcaseBusiness,
  ChevronDown,
  ChevronRight,
  Gift,
  Globe2,
  Headphones,
  HelpCircle,
  Infinity,
  LogIn,
  LogOut,
  Plus,
  Settings,
  UserRound,
  WalletCards
} from "lucide-react";
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

function accountName(email?: string, name?: string) {
  const value = name?.trim() || email?.split("@")[0]?.trim();
  return value || "Moon 用户";
}

function accountInitial(value?: string) {
  const clean = value?.trim();
  if (!clean) return "M";
  return clean.slice(0, 1).toUpperCase();
}

export function HomeTopNav({ page, onNavigate }: { page: Page; onNavigate: (page: Page, projectId?: string) => void }) {
  const [notificationsOpen, setNotificationsOpen] = useState(false);
  const [accountOpen, setAccountOpen] = useState(false);
  const auth = useAuthStore();
  const activeWorkspace = auth.workspaces.find((workspace) => workspace.id === auth.activeWorkspaceId) || auth.workspaces[0];
  const displayName = accountName(auth.user?.email, auth.user?.name);
  const workspaceName = activeWorkspace?.name || `${displayName} 的个人空间`;
  const avatarInitial = accountInitial(activeWorkspace?.name || displayName || auth.user?.email);
  const planLabel = activeWorkspace?.planId?.trim() ? activeWorkspace.planId.toUpperCase() : "FREE";
  const credits = activeWorkspace?.credits ?? 0;

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
              <button
                type="button"
                title="通知"
                className={`studio-nav-icon ${notificationsOpen ? "is-active" : ""}`}
                onClick={() => {
                  setAccountOpen(false);
                  setNotificationsOpen((value) => !value);
                }}
              >
                <Bell size={16} />
              </button>
              {notificationsOpen && (
                <div className="studio-notification-popover">
                  <strong>通知中心</strong>
                  <p>暂无新的协作通知。生成任务、分享请求和项目变更会显示在这里。</p>
                  <button type="button" onClick={() => setNotificationsOpen(false)}>知道了</button>
                </div>
              )}
            </div>
            <div className="studio-account-shell">
              <motion.button
                type="button"
                onClick={() => {
                  setNotificationsOpen(false);
                  setAccountOpen((value) => !value);
                }}
                className={`studio-account-pill ${accountOpen ? "is-open" : ""}`}
                title="账号与团队"
                whileTap={{ scale: 0.985 }}
              >
                <span className="studio-account-pill-tile">{avatarInitial}</span>
                <span className="studio-account-pill-name">{workspaceName}</span>
                <ChevronDown size={16} className="studio-account-pill-chevron" aria-hidden="true" />
                <span className="studio-account-pill-avatar">{avatarInitial}</span>
              </motion.button>
              <AnimatePresence>
                {accountOpen && (
                  <motion.div
                    className="studio-account-popover studio-account-panel"
                    initial={{ opacity: 0, y: -8, scale: 0.985 }}
                    animate={{ opacity: 1, y: 0, scale: 1 }}
                    exit={{ opacity: 0, y: -6, scale: 0.985 }}
                    transition={{ duration: 0.16, ease: [0.22, 1, 0.36, 1] }}
                  >
                    <div className="studio-account-head studio-account-profile">
                      <span className="studio-account-avatar studio-account-large-avatar">{avatarInitial}</span>
                      <div className="min-w-0">
                        <strong>{displayName}</strong>
                        <span>{auth.user?.email}</span>
                      </div>
                    </div>

                    <div className="studio-account-wallet">
                      <div className="studio-account-wallet-top">
                        <span className="studio-account-wallet-brand"><WalletCards size={18} /></span>
                        <strong>{credits}</strong>
                        <em>{planLabel}</em>
                      </div>
                      <div className="studio-account-quota">
                        <div>
                          <span>无额度限制</span>
                          <small>面向创作测试空间开放</small>
                        </div>
                        <Infinity size={22} />
                      </div>
                      <span className="studio-account-quota-bar" />
                    </div>

                    <button
                      type="button"
                      className="studio-account-create-team"
                      onClick={() => {
                        setAccountOpen(false);
                        onNavigate("workspace");
                      }}
                    >
                      <Plus size={22} />
                      创建团队
                    </button>

                    <div className="studio-account-divider" />
                    <div className="studio-account-menu">
                      <button type="button" className="studio-account-row" onClick={() => { setAccountOpen(false); onNavigate("account"); }}>
                        <span className="studio-account-row-icon"><UserRound size={18} /></span>
                        <span>个人主页</span>
                      </button>
                      <button type="button" className="studio-account-row" onClick={() => { setAccountOpen(false); onNavigate("settings"); }}>
                        <span className="studio-account-row-icon"><Globe2 size={18} /></span>
                        <span>简体中文</span>
                        <ChevronRight size={18} className="studio-account-row-arrow" />
                      </button>
                      <button type="button" className="studio-account-row" onClick={() => { setAccountOpen(false); onNavigate("assets"); }}>
                        <span className="studio-account-row-icon"><Gift size={18} /></span>
                        <span>赚取 Tapies</span>
                        <ChevronRight size={18} className="studio-account-row-arrow" />
                      </button>
                      <button type="button" className="studio-account-row" onClick={() => { setAccountOpen(false); onNavigate("settings"); }}>
                        <span className="studio-account-row-icon"><Settings size={18} /></span>
                        <span>账户管理</span>
                      </button>
                    </div>

                    {auth.workspaces.length > 0 && (
                      <>
                        <div className="studio-account-divider" />
                        <div className="studio-account-workspaces">
                          {auth.workspaces.slice(0, 3).map((workspace) => (
                            <button
                              key={workspace.id}
                              type="button"
                              className={`studio-account-workspace-row ${workspace.id === auth.activeWorkspaceId ? "is-active" : ""}`}
                              onClick={() => {
                                auth.selectWorkspace(workspace.id);
                                setAccountOpen(false);
                                window.location.reload();
                              }}
                            >
                              <WalletCards size={16} />
                              <span>{workspace.name}</span>
                              <small>{workspace.type === "team" ? "团队" : "个人"}</small>
                            </button>
                          ))}
                        </div>
                      </>
                    )}

                    <div className="studio-account-divider" />
                    <div className="studio-account-menu">
                      <button type="button" className="studio-account-row" onClick={() => { setAccountOpen(false); onNavigate("workspace"); }}>
                        <span className="studio-account-row-icon"><BriefcaseBusiness size={18} /></span>
                        <span>合作中心</span>
                      </button>
                      <button type="button" className="studio-account-row" onClick={() => { setAccountOpen(false); onNavigate("settings"); }}>
                        <span className="studio-account-row-icon"><HelpCircle size={18} /></span>
                        <span>帮助中心</span>
                        <ChevronRight size={18} className="studio-account-row-arrow" />
                      </button>
                      <button type="button" className="studio-account-row studio-account-row-danger" onClick={() => void auth.logout()}>
                        <span className="studio-account-row-icon"><LogOut size={18} /></span>
                        <span>登出账号</span>
                      </button>
                    </div>
                  </motion.div>
                )}
              </AnimatePresence>
            </div>
          </>
        )}
      </div>
    </header>
  );
}
