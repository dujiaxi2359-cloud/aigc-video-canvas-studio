import { ModelConfigCenter } from "../components/settings/ModelConfigCenter";
import { AgentSettingsPanel } from "../components/settings/AgentSettingsPanel";
import { ArrowLeft, Bot, KeyRound, ShieldCheck, SlidersHorizontal } from "lucide-react";
import type { Page } from "../App";
import { CommercialAdminPanel } from "../components/settings/CommercialAdminPanel";
import { useI18nStore } from "../i18n";
import { useAuthStore } from "../store/authStore";
import { isLocalAdminHost } from "../utils/localAdmin";

export function SettingsPage({ onNavigate }: { onNavigate: (page: Page) => void }) {
  const user = useAuthStore((state) => state.user);
  const t = useI18nStore((state) => state.t);
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
