import { ModelConfigCenter } from "../components/settings/ModelConfigCenter";
import { AgentSettingsPanel } from "../components/settings/AgentSettingsPanel";
import { ArrowLeft, ShieldCheck } from "lucide-react";
import type { Page } from "../App";
import { CommercialAdminPanel } from "../components/settings/CommercialAdminPanel";
import { useAuthStore } from "../store/authStore";

export function SettingsPage({ onNavigate }: { onNavigate: (page: Page) => void }) {
  const user = useAuthStore((state) => state.user);
  return (
    <div className="h-full overflow-auto bg-[linear-gradient(180deg,#0a0b0f_0%,#090a0d_100%)] p-6">
      <div className="mx-auto mb-5 flex max-w-[1180px] items-center justify-between">
        <button type="button" onClick={() => onNavigate("home")} className="studio-secondary-button"><ArrowLeft size={15} /> 返回首页</button>
        <div className="inline-flex h-9 items-center gap-2 rounded-full border border-emerald-300/15 bg-emerald-300/[0.06] px-3 text-[12px] text-emerald-100"><ShieldCheck size={15} /> API 配置仅当前账号空间使用</div>
      </div>
      <div className="mx-auto max-w-[1180px]">
        <AgentSettingsPanel />
      </div>
      {user && ["admin", "super_admin"].includes(user.role) && <CommercialAdminPanel />}
      <ModelConfigCenter />
    </div>
  );
}
