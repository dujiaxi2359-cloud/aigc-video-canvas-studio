import { useEffect, useMemo, useState } from "react";
import {
  BadgeCheck,
  Building2,
  Copy,
  Database,
  KeyRound,
  Loader2,
  Mail,
  Plus,
  RefreshCw,
  ShieldCheck,
  Sparkles,
  Ticket,
  UserRound,
  WalletCards
} from "lucide-react";
import { api } from "../../services/api";

type AdminUser = {
  id: string;
  email: string;
  name?: string;
  role: string;
  status: string;
  invite_status?: string;
  last_login_at?: string;
  created_at?: string;
};

type AdminWorkspace = {
  id: string;
  name: string;
  type: string;
  credits: number;
  member_count: number;
  billing_status?: string;
  created_at?: string;
};

type AdminInvite = {
  id: string;
  code: string;
  name?: string;
  type: string;
  status: string;
  used_count: number;
  max_uses: number;
  expires_at?: string;
  created_at?: string;
};

type AdminModel = {
  id: string;
  workspaceName: string;
  provider: string;
  category: string;
  displayName?: string;
  apiBaseUrl?: string;
  maskedApiKey?: string;
  modelName: string;
  enabled: boolean;
  usageCount: number;
  successCount: number;
  errorCount: number;
  updatedAt?: string;
};

type AdminPlan = {
  id: string;
  code: string;
  name: string;
  type: string;
  status: string;
};

type Overview = {
  users: AdminUser[];
  workspaces: AdminWorkspace[];
  invites: AdminInvite[];
  plans: AdminPlan[];
  models: AdminModel[];
};

const emptyOverview: Overview = { users: [], workspaces: [], invites: [], plans: [], models: [] };

const numberFormatter = new Intl.NumberFormat("zh-CN");

function metric(value: number) {
  return numberFormatter.format(Number.isFinite(value) ? value : 0);
}

function shortDate(value?: string) {
  if (!value) return "暂无记录";
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return "暂无记录";
  return `${date.getMonth() + 1}/${date.getDate()} ${String(date.getHours()).padStart(2, "0")}:${String(date.getMinutes()).padStart(2, "0")}`;
}

function badgeClass(tone: "green" | "amber" | "red" | "gray" | "violet") {
  const map = {
    green: "border-emerald-200/15 bg-emerald-300/[0.08] text-emerald-100",
    amber: "border-amber-200/15 bg-amber-300/[0.08] text-amber-100",
    red: "border-red-200/15 bg-red-300/[0.08] text-red-100",
    gray: "border-white/[0.08] bg-white/[0.04] text-white/55",
    violet: "border-violet-200/15 bg-violet-300/[0.08] text-violet-100"
  };
  return map[tone];
}

export function CommercialAdminPanel() {
  const [data, setData] = useState<Overview>(emptyOverview);
  const [error, setError] = useState("");
  const [code, setCode] = useState("");
  const [busy, setBusy] = useState("");

  async function load() {
    try {
      setBusy((current) => current || "load");
      setData(await api.get<Overview>("/api/admin/overview"));
      setError("");
    } catch (err) {
      setError(err instanceof Error ? err.message : "管理者后台加载失败");
    } finally {
      setBusy((current) => (current === "load" ? "" : current));
    }
  }

  useEffect(() => {
    void load();
  }, []);

  const stats = useMemo(() => {
    const activeInvites = data.invites.filter((invite) => invite.status === "active" && invite.used_count < invite.max_uses).length;
    const enabledModels = data.models.filter((model) => model.enabled).length;
    const failedModels = data.models.filter((model) => model.errorCount > 0).length;
    const totalCredits = data.workspaces.reduce((sum, workspace) => sum + Number(workspace.credits || 0), 0);
    const activeUsers = data.users.filter((user) => user.status === "active").length;
    const totalUsage = data.models.reduce((sum, model) => sum + Number(model.usageCount || 0), 0);
    return { activeInvites, enabledModels, failedModels, totalCredits, activeUsers, totalUsage };
  }, [data]);

  const recentUsers = data.users.slice(0, 8);
  const recentModels = data.models.slice(0, 10);

  async function createInvite() {
    try {
      setBusy("invite");
      await api.post("/api/admin/invite-codes", { code: code || undefined, name: code || "Access Invite", type: "customer", maxUses: 1 });
      setCode("");
      await load();
    } catch (err) {
      setError(err instanceof Error ? err.message : "创建邀请码失败");
    } finally {
      setBusy("");
    }
  }

  async function createBatchInvites() {
    try {
      setBusy("batch");
      const result = await api.post<{ invites: AdminInvite[] }>("/api/admin/invite-codes/batch", { count: 30, type: "customer", maxUses: 1, prefix: "AIGCNONG" });
      await navigator.clipboard.writeText(result.invites.map((invite) => invite.code).join("\n"));
      await load();
    } catch (err) {
      setError(err instanceof Error ? err.message : "批量生成失败");
    } finally {
      setBusy("");
    }
  }

  async function copyActiveInvites() {
    const codes = data.invites.filter((invite) => invite.status === "active" && invite.used_count < invite.max_uses).map((invite) => invite.code);
    await navigator.clipboard.writeText(codes.join("\n"));
  }

  async function updateInviteStatus(inviteId: string, status: "active" | "disabled") {
    try {
      setBusy(inviteId);
      await api.patch(`/api/admin/invite-codes/${inviteId}`, { status });
      await load();
    } catch (err) {
      setError(err instanceof Error ? err.message : "更新邀请码失败");
    } finally {
      setBusy("");
    }
  }

  async function addCredits(workspaceId: string) {
    const raw = window.prompt("增加或扣减 credits 数量，例如 100 或 -20", "100");
    if (!raw) return;
    await api.post(`/api/admin/workspaces/${workspaceId}/credits`, { amount: Number(raw), reason: "manual admin grant" });
    await load();
  }

  return (
    <section className="mx-auto mb-6 max-w-[1180px] overflow-hidden rounded-[26px] border border-white/[0.08] bg-[#0f1117] shadow-[0_28px_90px_rgba(0,0,0,0.38)]">
      <div className="relative overflow-hidden border-b border-white/[0.08] bg-[linear-gradient(135deg,rgba(139,92,246,0.13),rgba(20,184,166,0.055)_42%,rgba(255,255,255,0.025))] px-5 py-5">
        <div className="relative flex flex-col gap-4 lg:flex-row lg:items-center lg:justify-between">
          <div className="flex items-start gap-4">
            <span className="grid h-12 w-12 shrink-0 place-items-center rounded-[18px] border border-violet-200/20 bg-violet-400/[0.14] text-violet-100">
              <ShieldCheck size={22} />
            </span>
            <div>
              <div className="inline-flex rounded-full border border-emerald-200/15 bg-emerald-300/[0.07] px-2.5 py-1 text-[11px] font-medium text-emerald-100">
                Admin Console
              </div>
              <h2 className="mt-3 text-[24px] font-semibold tracking-[-0.02em] text-white">管理者后台</h2>
              <p className="mt-1 max-w-[720px] text-[13px] leading-6 text-white/42">
                统一管理邀请码、客户空间额度、用户状态与模型接入审计。这里是运营后台，不再和普通 API 配置混在一起。
              </p>
            </div>
          </div>
          <div className="relative flex flex-wrap gap-2">
            <button type="button" onClick={() => void copyActiveInvites()} className="inline-flex h-10 items-center gap-2 rounded-full border border-white/[0.08] bg-white/[0.04] px-4 text-[12px] text-white/70 hover:bg-white/[0.07]">
              <Copy size={14} /> 复制可用邀请码
            </button>
            <button type="button" onClick={() => void load()} disabled={busy === "load"} className="inline-flex h-10 items-center gap-2 rounded-full bg-white text-black px-4 text-[12px] font-semibold hover:bg-white/90 disabled:opacity-60">
              {busy === "load" ? <Loader2 size={14} className="animate-spin" /> : <RefreshCw size={14} />} 刷新后台
            </button>
          </div>
        </div>

        <div className="relative mt-5 grid gap-3 md:grid-cols-2 xl:grid-cols-4">
          {[
            { label: "活跃用户", value: stats.activeUsers, detail: `共 ${data.users.length} 个账号`, icon: UserRound, tone: "green" as const },
            { label: "工作空间额度", value: stats.totalCredits, detail: `${data.workspaces.length} 个空间`, icon: WalletCards, tone: "violet" as const },
            { label: "可用邀请码", value: stats.activeInvites, detail: `总计 ${data.invites.length} 条`, icon: Ticket, tone: "amber" as const },
            { label: "已启用模型", value: stats.enabledModels, detail: `${stats.failedModels} 个有失败记录`, icon: Database, tone: stats.failedModels ? "red" as const : "green" as const }
          ].map((item) => {
            const Icon = item.icon;
            return (
              <div key={item.label} className="rounded-[18px] border border-white/[0.08] bg-white/[0.045] p-4">
                <div className="flex items-center justify-between">
                  <span className={`grid h-9 w-9 place-items-center rounded-[13px] border ${badgeClass(item.tone)}`}><Icon size={17} /></span>
                  <span className="text-[11px] text-white/32">{item.detail}</span>
                </div>
                <div className="mt-4 text-[26px] font-semibold text-white">{metric(item.value)}</div>
                <div className="mt-1 text-[12px] text-white/42">{item.label}</div>
              </div>
            );
          })}
        </div>
      </div>

      {error && <div className="mx-5 mt-5 rounded-[14px] border border-red-300/15 bg-red-300/[0.08] px-4 py-3 text-[12px] text-red-100">{error}</div>}

      <div className="grid gap-4 p-5 xl:grid-cols-[1.08fr_0.92fr]">
        <div className="rounded-[20px] border border-white/[0.08] bg-black/20 p-4">
          <div className="flex flex-col gap-3 md:flex-row md:items-center md:justify-between">
            <div>
              <div className="flex items-center gap-2 text-[15px] font-semibold text-white"><Ticket size={16} /> 邀请码运营</div>
              <p className="mt-1 text-[12px] text-white/35">生成、复制、停用客户邀请码；批量生成后会自动复制到剪贴板。</p>
            </div>
            <button type="button" disabled={busy === "batch"} onClick={() => void createBatchInvites()} className="inline-flex h-10 items-center justify-center gap-2 rounded-full bg-cyan-300 px-4 text-[12px] font-semibold text-black hover:bg-cyan-200 disabled:opacity-60">
              {busy === "batch" ? <Loader2 size={14} className="animate-spin" /> : <Sparkles size={14} />} 生成 30 个
            </button>
          </div>
          <div className="mt-4 grid gap-2 md:grid-cols-[1fr_auto]">
            <input className="h-11 rounded-[13px] border border-white/[0.08] bg-black/35 px-3 text-[13px] uppercase text-white outline-none placeholder:text-white/25 focus:border-cyan-200/35" value={code} onChange={(event) => setCode(event.target.value.toUpperCase())} placeholder="留空自动生成，或输入自定义邀请码" />
            <button type="button" disabled={busy === "invite"} onClick={() => void createInvite()} className="inline-flex h-11 items-center justify-center gap-2 rounded-[13px] border border-white/[0.08] bg-white/[0.06] px-4 text-[13px] font-medium text-white hover:bg-white/[0.1] disabled:opacity-60">
              {busy === "invite" ? <Loader2 size={14} className="animate-spin" /> : <Plus size={14} />} 创建
            </button>
          </div>
          <div className="mt-4 max-h-[278px] space-y-2 overflow-auto pr-1">
            {data.invites.map((invite) => {
              const isAvailable = invite.status === "active" && invite.used_count < invite.max_uses;
              return (
                <div key={invite.id} className="grid gap-3 rounded-[14px] border border-white/[0.06] bg-white/[0.035] px-3 py-3 md:grid-cols-[1fr_auto] md:items-center">
                  <div className="min-w-0">
                    <div className="flex min-w-0 items-center gap-2">
                      <code className="truncate font-mono text-[12px] text-white">{invite.code}</code>
                      <span className={`shrink-0 rounded-full border px-2 py-0.5 text-[10px] ${badgeClass(isAvailable ? "green" : "gray")}`}>
                        {isAvailable ? "可用" : invite.status}
                      </span>
                    </div>
                    <div className="mt-1 text-[11px] text-white/34">{invite.type} · 已用 {invite.used_count}/{invite.max_uses} · {shortDate(invite.created_at)}</div>
                  </div>
                  <div className="flex items-center gap-2">
                    <button type="button" title="复制" onClick={() => void navigator.clipboard.writeText(invite.code)} className="grid h-8 w-8 place-items-center rounded-full border border-white/[0.08] text-white/55 hover:bg-white/[0.06] hover:text-white"><Copy size={13} /></button>
                    <button type="button" disabled={busy === invite.id} onClick={() => void updateInviteStatus(invite.id, isAvailable ? "disabled" : "active")} className="h-8 rounded-full border border-white/[0.08] px-3 text-[11px] text-white/55 hover:bg-white/[0.06] hover:text-white">
                      {isAvailable ? "停用" : "启用"}
                    </button>
                  </div>
                </div>
              );
            })}
            {!data.invites.length && <div className="rounded-[14px] border border-dashed border-white/[0.08] p-6 text-center text-[12px] text-white/35">暂无邀请码。</div>}
          </div>
        </div>

        <div className="rounded-[20px] border border-white/[0.08] bg-black/20 p-4">
          <div className="flex items-center justify-between">
            <div>
              <div className="flex items-center gap-2 text-[15px] font-semibold text-white"><Building2 size={16} /> 工作空间与额度</div>
              <p className="mt-1 text-[12px] text-white/35">手动调整客户空间 credits，适合售后补偿、试用加量和上线前测试。</p>
            </div>
          </div>
          <div className="mt-4 max-h-[352px] space-y-2 overflow-auto pr-1">
            {data.workspaces.map((workspace) => (
              <div key={workspace.id} className="rounded-[14px] border border-white/[0.06] bg-white/[0.035] px-3 py-3">
                <div className="flex items-center justify-between gap-3">
                  <div className="min-w-0">
                    <div className="truncate text-[13px] font-medium text-white">{workspace.name}</div>
                    <div className="mt-1 text-[11px] text-white/34">{workspace.type} · {workspace.member_count} 成员 · {shortDate(workspace.created_at)}</div>
                  </div>
                  <button type="button" onClick={() => void addCredits(workspace.id)} className="shrink-0 rounded-full border border-white/[0.08] px-3 py-1.5 text-[11px] text-white/60 hover:bg-white/[0.06] hover:text-white">调整</button>
                </div>
                <div className="mt-3 flex items-center justify-between rounded-[12px] bg-black/25 px-3 py-2">
                  <span className="text-[11px] text-white/35">当前余额</span>
                  <span className="text-[15px] font-semibold text-emerald-100">{metric(Number(workspace.credits || 0))} credits</span>
                </div>
              </div>
            ))}
            {!data.workspaces.length && <div className="rounded-[14px] border border-dashed border-white/[0.08] p-6 text-center text-[12px] text-white/35">暂无工作空间。</div>}
          </div>
        </div>
      </div>

      <div className="grid gap-4 px-5 pb-5 xl:grid-cols-[0.82fr_1.18fr]">
        <div className="rounded-[20px] border border-white/[0.08] bg-black/20 p-4">
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-2 text-[15px] font-semibold text-white"><Mail size={16} /> 用户状态</div>
            <span className="rounded-full bg-white/[0.06] px-2 py-1 text-[11px] text-white/38">{data.users.length} 个账号</span>
          </div>
          <div className="mt-4 space-y-2">
            {recentUsers.map((user) => (
              <div key={user.id} className="flex items-center gap-3 rounded-[14px] border border-white/[0.06] bg-white/[0.035] px-3 py-3">
                <span className={`grid h-9 w-9 shrink-0 place-items-center rounded-full border ${badgeClass(user.role === "super_admin" || user.role === "admin" ? "violet" : "gray")}`}>
                  <UserRound size={15} />
                </span>
                <div className="min-w-0 flex-1">
                  <div className="truncate text-[12px] font-medium text-white">{user.email}</div>
                  <div className="mt-1 text-[11px] text-white/34">{user.role} · {user.status} · 登录 {shortDate(user.last_login_at)}</div>
                </div>
                <span className={`rounded-full border px-2 py-1 text-[10px] ${badgeClass(user.invite_status === "accepted" ? "green" : "gray")}`}>{user.invite_status || "invite"}</span>
              </div>
            ))}
            {!recentUsers.length && <div className="rounded-[14px] border border-dashed border-white/[0.08] p-6 text-center text-[12px] text-white/35">暂无用户。</div>}
          </div>
        </div>

        <div className="rounded-[20px] border border-white/[0.08] bg-black/20 p-4">
          <div className="flex flex-col gap-2 md:flex-row md:items-center md:justify-between">
            <div>
              <div className="flex items-center gap-2 text-[15px] font-semibold text-white"><KeyRound size={16} /> 客户模型配置审计</div>
              <p className="mt-1 text-[12px] text-white/35">只展示脱敏 Key，用来快速判断客户是否启用、使用量与错误量。</p>
            </div>
            <span className="rounded-full bg-white/[0.06] px-2 py-1 text-[11px] text-white/38">调用 {metric(stats.totalUsage)} 次</span>
          </div>
          <div className="mt-4 overflow-x-auto">
            <table className="w-full min-w-[900px] text-left text-[11px]">
              <thead className="text-white/34">
                <tr className="border-b border-white/[0.08]">
                  <th className="pb-3 pr-4 font-medium">工作空间</th>
                  <th className="pb-3 pr-4 font-medium">模型</th>
                  <th className="pb-3 pr-4 font-medium">线路</th>
                  <th className="pb-3 pr-4 font-medium">API Key</th>
                  <th className="pb-3 pr-4 font-medium">调用</th>
                  <th className="pb-3 font-medium">状态</th>
                </tr>
              </thead>
              <tbody>
                {recentModels.map((model) => (
                  <tr key={model.id} className="border-b border-white/[0.055] last:border-0">
                    <td className="py-3 pr-4 text-white/66">{model.workspaceName}</td>
                    <td className="py-3 pr-4">
                      <div className="text-white/78">{model.displayName || model.modelName}</div>
                      <div className="mt-0.5 text-white/32">{model.category} · {model.provider}</div>
                    </td>
                    <td className="max-w-[260px] truncate py-3 pr-4 text-white/46" title={model.apiBaseUrl || "官方默认"}>{model.apiBaseUrl || "官方默认"}</td>
                    <td className="py-3 pr-4 font-mono text-white/42">{model.maskedApiKey || "未配置"}</td>
                    <td className="py-3 pr-4 text-white/55">{model.usageCount} · 成功 {model.successCount} · 失败 {model.errorCount}</td>
                    <td className="py-3">
                      <span className={`inline-flex items-center gap-1 rounded-full border px-2 py-1 text-[10px] ${badgeClass(model.enabled ? "green" : "gray")}`}>
                        {model.enabled ? <BadgeCheck size={11} /> : null}
                        {model.enabled ? "启用" : "停用"}
                      </span>
                    </td>
                  </tr>
                ))}
                {!recentModels.length && (
                  <tr>
                    <td colSpan={6} className="py-8 text-center text-white/35">暂无客户模型配置。</td>
                  </tr>
                )}
              </tbody>
            </table>
          </div>
        </div>
      </div>
    </section>
  );
}
