import { ModelConfigCenter } from "../components/settings/ModelConfigCenter";
import { AgentSettingsPanel } from "../components/settings/AgentSettingsPanel";
import { ArrowLeft, Bot, KeyRound, Monitor, Moon, ShieldCheck, SlidersHorizontal, Sun } from "lucide-react";
import type { Page } from "../App";
import { CommercialAdminPanel } from "../components/settings/CommercialAdminPanel";
import { useI18nStore } from "../i18n";
import { useAuthStore } from "../store/authStore";
import { useThemeStore, type ThemePreference } from "../store/themeStore";
import { isLocalAdminHost } from "../utils/localAdmin";

const themeOptions: Array<{ id: ThemePreference; label: string; desc: string; icon: typeof Moon }> = [
  { id: "dark", label: "深色", desc: "Moon 经典暗色画布", icon: Moon },
  { id: "light", label: "浅色", desc: "柔和月光白，长时间创作更舒适", icon: Sun },
  { id: "system", label: "跟随系统", desc: "自动跟随 macOS / 浏览器主题", icon: Monitor }
];

export function SettingsPage({ onNavigate }: { onNavigate: (page: Page) => void }) {
  const user = useAuthStore((state) => state.user);
  const t = useI18nStore((state) => state.t);
  const themePreference = useThemeStore((state) => state.preference);
  const setThemePreference = useThemeStore((state) => state.setPreference);
  const isAdmin = isLocalAdminHost() || Boolean(user && ["admin", "super_admin"].includes(user.role));
  const roleLabel = isAdmin ? t("settings.roleAdmin") : user?.role || t("settings.roleGuest");
  function returnHome() {
    window.sessionStorage.setItem("moon.home.skipLaunch", "1");
    onNavigate("home");
  }

  return (
    <div className="settings-workspace h-full overflow-auto">
      <header className="settings-command-bar">
        <div className="mx-auto flex max-w-[1280px] items-center gap-3 px-4 py-3 md:px-6">
            <button
              type="button"
              onClick={returnHome}
              className="settings-icon-button"
              aria-label={t("settings.backAria")}
            >
              <ArrowLeft size={17} />
            </button>
            <div className="min-w-0">
              <h1 className="text-[17px] font-semibold tracking-[-0.02em] text-white">{t("settings.title")}</h1>
              <p className="truncate text-[12px] text-white/42">{t("settings.subtitle")}</p>
            </div>
            <nav className="ml-auto hidden items-center gap-1 sm:flex" aria-label={t("settings.areaAria")}>
              <a href="#agent-settings" className="settings-nav-chip"><Bot size={14} />Agent</a>
              <a href="#api-settings" className="settings-nav-chip"><KeyRound size={14} />{t("settings.api")}</a>
              {isAdmin && <a href="#admin-settings" className="settings-nav-chip"><ShieldCheck size={14} />{t("settings.admin")}</a>}
            </nav>
            <div className="settings-account-pill">
              <span className="settings-presence-dot" />
              <span className="max-w-[190px] truncate">{user?.email || t("settings.localAdmin")}</span>
            </div>
        </div>
      </header>

      <div className="mx-auto max-w-[1280px] px-4 py-5 md:px-6 md:py-7">
        <div className="mb-5 flex flex-col gap-3 border-b border-white/[0.07] pb-5 md:flex-row md:items-end md:justify-between">
          <div>
            <div className="mb-2 flex items-center gap-2 text-[12px] text-emerald-200/75">
              <span className="settings-presence-dot" /> {t("settings.online")}
            </div>
            <h2 className="text-[28px] font-semibold tracking-[-0.04em] text-white md:text-[34px]">{t("settings.engineTitle")}</h2>
            <p className="mt-2 max-w-[620px] text-[13px] leading-6 text-white/44">{t("settings.engineDesc")}</p>
          </div>
          <div className="flex items-center gap-2 text-[12px] text-white/38">
            <SlidersHorizontal size={14} /> {t("settings.role", { role: roleLabel })}
          </div>
        </div>

        <section className="settings-section settings-theme-section mb-6 p-4 md:p-5">
          <div className="flex flex-col gap-4 md:flex-row md:items-center md:justify-between">
            <div className="min-w-0">
              <div className="mb-2 flex items-center gap-2 text-[12px] text-white/48">
                <Moon size={14} /> Moon Appearance
              </div>
              <h3 className="text-[18px] font-semibold tracking-[-0.02em] text-white">主题外观</h3>
              <p className="mt-1 max-w-[560px] text-[13px] leading-6 text-white/45">
                在深色宇宙感和柔和月光白之间切换，不刷新页面，也不影响画布与生成流程。
              </p>
            </div>
            <div className="settings-theme-options">
              {themeOptions.map((option) => {
                const Icon = option.icon;
                const active = themePreference === option.id;
                return (
                  <button
                    key={option.id}
                    type="button"
                    className={`settings-theme-option ${active ? "is-active" : ""}`}
                    onClick={() => setThemePreference(option.id)}
                  >
                    <Icon size={16} />
                    <span>
                      <strong>{option.label}</strong>
                      <small>{option.desc}</small>
                    </span>
                  </button>
                );
              })}
            </div>
          </div>
        </section>

      <div id="admin-settings">{isAdmin && <CommercialAdminPanel />}</div>
      {!isAdmin && (
        <section className="mx-auto mb-6 max-w-[1180px] rounded-[22px] border border-amber-200/15 bg-amber-300/[0.055] px-5 py-4 text-[13px] text-amber-50/80">
          <div className="font-semibold text-amber-50">{t("settings.adminOnlyTitle")}</div>
          <p className="mt-1 text-amber-50/55">
            {t("settings.adminOnlyDesc", { role: user?.role || "guest" })}
          </p>
        </section>
      )}

      <div id="agent-settings">
        <AgentSettingsPanel />
      </div>

      <div id="api-settings"><ModelConfigCenter /></div>
      </div>
    </div>
  );
}
