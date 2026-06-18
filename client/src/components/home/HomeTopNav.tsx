import { useState } from "react";
import { AnimatePresence, motion } from "framer-motion";
import {
  Bell,
  ChevronDown,
  ChevronRight,
  Globe2,
  Headphones,
  HelpCircle,
  Infinity,
  LogIn,
  LogOut,
  MessageCircle,
  Settings,
  UserRound,
  WalletCards
} from "lucide-react";
import type { Page } from "../../App";
import { localeOptions, useI18nStore } from "../../i18n";
import { useAuthStore } from "../../store/authStore";
import { BrandIdentity } from "../common/BrandIdentity";

const links: Array<[Page, string]> = [
  ["home", "nav.home"],
  ["photos", "nav.photos"],
  ["video", "nav.video"],
  ["workspace", "nav.workspace"],
  ["assets", "nav.assets"],
  ["settings", "nav.settings"]
];

function accountName(email: string | undefined, name: string | undefined, fallback: string) {
  const value = name?.trim() || email?.split("@")[0]?.trim();
  return value || fallback;
}

function accountInitial(value?: string) {
  const clean = value?.trim().match(/[a-zA-Z0-9]/)?.[0];
  if (!clean) return "M";
  return clean.toUpperCase();
}

export function HomeTopNav({ page, onNavigate }: { page: Page; onNavigate: (page: Page, projectId?: string) => void }) {
  const [notificationsOpen, setNotificationsOpen] = useState(false);
  const [accountOpen, setAccountOpen] = useState(false);
  const [helpOpen, setHelpOpen] = useState(false);
  const [languageOpen, setLanguageOpen] = useState(false);
  const auth = useAuthStore();
  const locale = useI18nStore((state) => state.locale);
  const setLocale = useI18nStore((state) => state.setLocale);
  const t = useI18nStore((state) => state.t);
  const activeWorkspace = auth.workspaces.find((workspace) => workspace.id === auth.activeWorkspaceId) || auth.workspaces[0];
  const displayName = accountName(auth.user?.email, auth.user?.name, t("account.defaultName"));
  const workspaceName = activeWorkspace?.name || t("account.personalSpace", { name: displayName });
  const avatarInitial = accountInitial(auth.user?.email || displayName);
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
        {links.map(([target, labelKey]) => (
          <button key={target} type="button" onClick={() => handleNav(target)} className={`h-10 rounded-full px-4 text-[14px] transition ${page === target ? "bg-white/[0.12] font-medium text-white" : "text-white/58 hover:bg-white/[0.06] hover:text-white"}`}>{t(labelKey)}</button>
        ))}
      </nav>
      <div className="ml-auto flex items-center gap-1.5">
        {!auth.user && (
          <button type="button" onClick={() => onNavigate("login")} className="studio-login-button">
            <LogIn size={17} /> {t("account.loginRegister")}
          </button>
        )}
        {auth.user && (
          <>
            <button type="button" title={t("account.helpIconTitle")} onClick={() => onNavigate("settings")} className="studio-nav-icon"><Headphones size={16} /></button>
            <div className="relative">
              <button
                type="button"
                title={t("account.notificationTitle")}
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
                  <strong>{t("account.notificationTitle")}</strong>
                  <p>{t("account.notificationBody")}</p>
                  <button type="button" onClick={() => setNotificationsOpen(false)}>{t("account.dismiss")}</button>
                </div>
              )}
            </div>
            <div className="studio-account-shell">
              <motion.button
                type="button"
                onClick={() => {
                  setNotificationsOpen(false);
                  setAccountOpen((value) => {
                    if (value) {
                      setHelpOpen(false);
                      setLanguageOpen(false);
                    }
                    return !value;
                  });
                }}
                className={`studio-account-pill ${accountOpen ? "is-open" : ""}`}
                title={t("account.menuTitle")}
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
                          <span>{t("account.quotaTitle")}</span>
                          <small>{t("account.quotaDesc")}</small>
                        </div>
                        <Infinity size={22} />
                      </div>
                      <span className="studio-account-quota-bar" />
                    </div>

                    <div className="studio-account-divider" />
                    <div className="studio-account-menu">
                      <button type="button" className="studio-account-row" onClick={() => { setAccountOpen(false); onNavigate("account"); }}>
                        <span className="studio-account-row-icon"><UserRound size={18} /></span>
                        <span>{t("account.profile")}</span>
                      </button>
                      <button
                        type="button"
                        className={`studio-account-row ${languageOpen ? "is-active" : ""}`}
                        onClick={() => {
                          setHelpOpen(false);
                          setLanguageOpen((value) => !value);
                        }}
                      >
                        <span className="studio-account-row-icon"><Globe2 size={18} /></span>
                        <span>{localeOptions.find((option) => option.id === locale)?.label || "简体中文"}</span>
                        <ChevronDown size={18} className="studio-account-row-arrow" />
                      </button>
                      <button type="button" className="studio-account-row" onClick={() => { setAccountOpen(false); onNavigate("settings"); }}>
                        <span className="studio-account-row-icon"><Settings size={18} /></span>
                        <span>{t("account.accountSettings")}</span>
                      </button>
                    </div>

                    <div className="studio-account-divider" />
                    <div className="studio-account-menu">
                      <button
                        type="button"
                        className={`studio-account-row ${helpOpen ? "is-active" : ""}`}
                        onClick={() => {
                          setLanguageOpen(false);
                          setHelpOpen((value) => !value);
                        }}
                      >
                        <span className="studio-account-row-icon"><HelpCircle size={18} /></span>
                        <span>{t("account.helpCenter")}</span>
                        <ChevronDown size={18} className="studio-account-row-arrow" />
                      </button>
                      <button type="button" className="studio-account-row studio-account-row-danger" onClick={() => void auth.logout()}>
                        <span className="studio-account-row-icon"><LogOut size={18} /></span>
                        <span>{t("account.logout")}</span>
                      </button>
                    </div>
                    <AnimatePresence>
                      {languageOpen && (
                        <motion.div
                          className="studio-account-language-flyout"
                          initial={{ opacity: 0, x: 8, scale: 0.985 }}
                          animate={{ opacity: 1, x: 0, scale: 1 }}
                          exit={{ opacity: 0, x: 8, scale: 0.985 }}
                          transition={{ duration: 0.16, ease: [0.22, 1, 0.36, 1] }}
                        >
                          {localeOptions.map((option) => (
                            <button
                              key={option.id}
                              type="button"
                              className={`studio-account-language-row ${locale === option.id ? "is-active" : ""}`}
                              onClick={() => {
                                setLocale(option.id);
                                setLanguageOpen(false);
                              }}
                            >
                              <span>{option.label}</span>
                              {locale === option.id && <small>{t("common.current")}</small>}
                            </button>
                          ))}
                        </motion.div>
                      )}
                      {helpOpen && (
                        <motion.div
                          className="studio-account-support-flyout"
                          initial={{ opacity: 0, x: 8, scale: 0.985 }}
                          animate={{ opacity: 1, x: 0, scale: 1 }}
                          exit={{ opacity: 0, x: 8, scale: 0.985 }}
                          transition={{ duration: 0.16, ease: [0.22, 1, 0.36, 1] }}
                        >
                          <div className="studio-account-support-menu">
                            <button type="button" className="studio-account-support-row is-active">
                              <MessageCircle size={15} />
                              <span>{t("account.contact")}</span>
                              <ChevronRight size={15} />
                            </button>
                            <button type="button" className="studio-account-support-row">
                              <HelpCircle size={15} />
                              <span>{t("account.tutorial")}</span>
                            </button>
                            <button type="button" className="studio-account-support-row">
                              <Settings size={15} />
                              <span>{t("account.quickSettings")}</span>
                            </button>
                          </div>
                          <div className="studio-account-qr-card">
                            <div className="studio-account-qr-brand">
                              <img src="/account-assets/moon-tv-brand-strip.png" alt="Moon Tv" loading="lazy" decoding="async" />
                            </div>
                            <img src="/account-assets/wechat-support-qr-moon.png" alt={t("account.wechatAlt")} loading="lazy" decoding="async" />
                            <div className="studio-account-qr-copy">
                              <strong>{t("account.wechatTitle")}</strong>
                              <p>{t("account.wechatCopy")}</p>
                            </div>
                          </div>
                        </motion.div>
                      )}
                    </AnimatePresence>
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
