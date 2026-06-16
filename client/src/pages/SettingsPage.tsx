import { ModelConfigCenter } from "../components/settings/ModelConfigCenter";
import { AgentSettingsPanel } from "../components/settings/AgentSettingsPanel";
import { ArrowLeft, KeyRound, ShieldCheck, SlidersHorizontal, Sparkles, UsersRound } from "lucide-react";
import type { Page } from "../App";
import { CommercialAdminPanel } from "../components/settings/CommercialAdminPanel";
import { useAuthStore } from "../store/authStore";

export function SettingsPage({ onNavigate }: { onNavigate: (page: Page) => void }) {
  const user = useAuthStore((state) => state.user);
  const isAdmin = Boolean(user && ["admin", "super_admin"].includes(user.role));

  return (
    <div className="h-full overflow-auto bg-[#090a0d] p-6">
      <div className="mx-auto mb-5 max-w-[1180px] overflow-hidden rounded-[28px] border border-white/[0.08] bg-[linear-gradient(135deg,rgba(255,255,255,0.055),rgba(255,255,255,0.018))] shadow-[0_28px_80px_rgba(0,0,0,0.34)]">
        <div className="flex flex-col gap-5 border-b border-white/[0.08] px-5 py-5 lg:flex-row lg:items-center lg:justify-between">
          <div className="flex items-start gap-4">
            <button
              type="button"
              onClick={() => onNavigate("home")}
              className="mt-1 inline-flex h-10 w-10 shrink-0 items-center justify-center rounded-[14px] border border-white/[0.08] bg-black/25 text-white/70 hover:bg-white/[0.06] hover:text-white"
              aria-label="返回首页"
            >
              <ArrowLeft size={17} />
            </button>
            <div>
              <div className="inline-flex items-center gap-2 rounded-full border border-emerald-300/15 bg-emerald-300/[0.06] px-3 py-1 text-[12px] text-emerald-100">
                <ShieldCheck size={14} /> {isAdmin ? "管理员后台已启用" : "API 配置仅当前账号空间使用"}
              </div>
              <h1 className="mt-3 text-[28px] font-semibold tracking-[-0.03em] text-white">设置中心</h1>
              <p className="mt-2 max-w-[760px] text-[13px] leading-6 text-white/42">
                邀请码、客户额度、Agent 自动化和模型 API 接入都在这里统一管理。视频节点只读取这里保存的官方模型能力与当前通道配置。
              </p>
            </div>
          </div>
          <div className="grid gap-2 sm:grid-cols-3 lg:w-[430px]">
            {[
              { icon: UsersRound, label: "客户后台", active: isAdmin },
              { icon: Sparkles, label: "Agent 配置", active: true },
              { icon: KeyRound, label: "API 接入", active: true }
            ].map((item) => {
              const Icon = item.icon;
              return (
                <div key={item.label} className={`rounded-[16px] border px-3 py-3 ${item.active ? "border-violet-200/20 bg-violet-300/[0.08] text-white" : "border-white/[0.06] bg-black/20 text-white/32"}`}>
                  <Icon size={16} />
                  <div className="mt-2 text-[12px] font-medium">{item.label}</div>
                </div>
              );
            })}
          </div>
        </div>
        <div className="flex flex-wrap items-center gap-2 px-5 py-3 text-[12px] text-white/38">
          <SlidersHorizontal size={14} className="text-white/45" />
          <span>当前账号：{user?.email || "未登录"}</span>
          <span className="h-1 w-1 rounded-full bg-white/20" />
          <span>角色：{user?.role || "guest"}</span>
        </div>
      </div>

      {isAdmin && <CommercialAdminPanel />}
      {!isAdmin && (
        <section className="mx-auto mb-6 max-w-[1180px] rounded-[22px] border border-amber-200/15 bg-amber-300/[0.055] px-5 py-4 text-[13px] text-amber-50/80">
          <div className="font-semibold text-amber-50">客户后台需要管理员权限</div>
          <p className="mt-1 text-amber-50/55">
            当前账号角色是 {user?.role || "guest"}，所以邀请码、客户列表和额度管理会被隐藏。管理员刷新登录状态后会在这里看到完整管理者后台。
          </p>
        </section>
      )}

      <div className="mx-auto max-w-[1180px]">
        <AgentSettingsPanel />
      </div>

      <ModelConfigCenter />
    </div>
  );
}
