import { useEffect, useState } from "react";
import { Copy, Plus, RefreshCw, Ticket, WalletCards } from "lucide-react";
import { api } from "../../services/api";

type Overview = { users: any[]; workspaces: any[]; invites: any[]; plans: any[] };

export function CommercialAdminPanel() {
  const [data,setData]=useState<Overview>({users:[],workspaces:[],invites:[],plans:[]}); const [error,setError]=useState(""); const [code,setCode]=useState(""); const [busy,setBusy]=useState(false);
  async function load(){try{setData(await api.get<Overview>("/api/admin/overview"));setError("");}catch(err){setError(err instanceof Error?err.message:"加载失败");}}
  useEffect(()=>{void load();},[]);
  async function createInvite(){try{setBusy(true);await api.post("/api/admin/invite-codes",{code:code||undefined,name:code||"Access Invite",type:"customer",maxUses:1});setCode("");await load();}catch(err){setError(err instanceof Error?err.message:"创建失败");}finally{setBusy(false);}}
  async function createBatchInvites(){try{setBusy(true);const result=await api.post<{invites:any[]}>("/api/admin/invite-codes/batch",{count:30,type:"customer",maxUses:1,prefix:"AIGCNONG"});await navigator.clipboard.writeText(result.invites.map((invite)=>invite.code).join("\n"));await load();}catch(err){setError(err instanceof Error?err.message:"批量生成失败");}finally{setBusy(false);}}
  async function copyActiveInvites(){const codes=data.invites.filter((invite)=>invite.status==="active"&&invite.used_count<invite.max_uses).map((invite)=>invite.code);await navigator.clipboard.writeText(codes.join("\n"));}
  async function addCredits(workspaceId:string){const raw=window.prompt("增加 credits 数量","100");if(!raw)return;await api.post(`/api/admin/workspaces/${workspaceId}/credits`,{amount:Number(raw),reason:"manual admin grant"});await load();}
  return <section className="mx-auto mb-6 max-w-[1180px] rounded-[14px] border border-white/[0.09] bg-white/[0.025] p-5">
    <div className="flex items-center justify-between"><div><h2 className="text-[17px] font-semibold">账号与商业化</h2><p className="mt-1 text-[12px] text-white/38">邀请码、用户、工作空间与手动额度管理</p></div><button className="studio-secondary-button" onClick={()=>void load()}><RefreshCw size={14}/>刷新</button></div>
    {error&&<p className="mt-3 text-[12px] text-red-300">{error}</p>}
    <div className="mt-5 grid gap-4 lg:grid-cols-2">
      <div className="rounded-[10px] border border-white/[0.08] p-4">
        <div className="flex items-center justify-between gap-3">
          <h3 className="text-[13px] font-medium">邀请码</h3>
          <div className="flex gap-2">
            <button className="rounded-[8px] bg-white/[0.07] px-2.5 py-1.5 text-[11px] text-white/72 hover:bg-white/[0.1]" disabled={busy} onClick={()=>void copyActiveInvites()}><Copy size={13}/>复制全部可用</button>
            <button className="rounded-[8px] bg-cyan-300 px-2.5 py-1.5 text-[11px] font-semibold text-black hover:bg-cyan-200 disabled:opacity-50" disabled={busy} onClick={()=>void createBatchInvites()}><Ticket size={13}/>生成 30 个</button>
          </div>
        </div>
        <div className="mt-3 flex gap-2"><input className="studio-input h-9 flex-1 px-3 uppercase" value={code} onChange={(e)=>setCode(e.target.value.toUpperCase())} placeholder="留空自动生成"/><button className="studio-primary-button" disabled={busy} onClick={()=>void createInvite()}><Plus size={14}/>创建</button></div>
        <div className="mt-3 max-h-52 space-y-2 overflow-auto">{data.invites.map((invite)=><div key={invite.id} className="flex items-center gap-2 rounded-[8px] bg-white/[0.04] px-3 py-2 text-[12px]"><code className="flex-1">{invite.code}</code><span className="text-white/35">{invite.type}</span><span className="text-white/35">{invite.used_count}/{invite.max_uses}</span><button title="复制" onClick={()=>void navigator.clipboard.writeText(invite.code)}><Copy size={13}/></button></div>)}</div>
      </div>
      <div className="rounded-[10px] border border-white/[0.08] p-4"><h3 className="text-[13px] font-medium">工作空间与额度</h3><div className="mt-3 max-h-64 space-y-2 overflow-auto">{data.workspaces.map((workspace)=><div key={workspace.id} className="flex items-center gap-3 rounded-[8px] bg-white/[0.04] px-3 py-2"><WalletCards size={15} className="text-white/35"/><div className="min-w-0 flex-1"><div className="truncate text-[12px]">{workspace.name}</div><div className="text-[10px] text-white/32">{workspace.type} · {workspace.member_count} 成员</div></div><span className="text-[11px]">{workspace.credits} credits</span><button className="rounded-[6px] bg-white/[0.07] px-2 py-1 text-[10px]" onClick={()=>void addCredits(workspace.id)}>调整</button></div>)}</div></div>
    </div>
    <div className="mt-4 rounded-[10px] border border-white/[0.08] p-4"><h3 className="text-[13px] font-medium">用户（{data.users.length}）</h3><div className="mt-3 grid gap-2 md:grid-cols-2 xl:grid-cols-3">{data.users.map((user)=><div key={user.id} className="rounded-[8px] bg-white/[0.04] px-3 py-2"><div className="truncate text-[12px]">{user.email}</div><div className="mt-1 text-[10px] text-white/34">{user.role} · {user.status} · invite {user.invite_status}</div></div>)}</div></div>
  </section>;
}
