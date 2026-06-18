import { useState } from "react";
import { ArrowRight, KeyRound, LogOut } from "lucide-react";
import { useI18nStore } from "../i18n";
import { useAuthStore } from "../store/authStore";

export function InvitePage() {
  const [code, setCode] = useState(""); const [error,setError]=useState(""); const [busy,setBusy]=useState(false);
  const store = useAuthStore();
  const t = useI18nStore((state) => state.t);
  async function activate(){setBusy(true);setError("");try{await store.verifyInvite(code);}catch(err){setError(err instanceof Error?err.message:t("invite.failed"));}finally{setBusy(false);}}
  return <div className="grid h-screen place-items-center bg-[#070708] p-5 pb-16 text-white"><section className="w-full max-w-[440px] rounded-[18px] border border-white/[0.1] bg-[#121214] p-8 shadow-2xl">
    <div className="mb-6 grid h-11 w-11 place-items-center rounded-[12px] bg-white/[0.07]"><KeyRound size={20}/></div><h1 className="text-[27px] font-semibold">{t("invite.title")}</h1><p className="mt-2 text-[13px] leading-6 text-white/45">{t("invite.verifiedEmail", { email: store.user?.email })}<br/>{t("invite.desc")}</p>
    <input autoFocus className="studio-input mt-7 h-12 w-full px-4 uppercase tracking-[0.12em]" value={code} onChange={(e)=>setCode(e.target.value.toUpperCase())} placeholder={t("invite.placeholder")}/>{error&&<p className="mt-3 text-[12px] text-red-300">{error}</p>}
    <button type="button" className="studio-primary-button mt-5 h-12 w-full justify-center disabled:opacity-40" disabled={!code.trim()||busy} onClick={()=>void activate()}>{busy?t("invite.verifying"):t("invite.activate")}<ArrowRight size={16}/></button>
    <button type="button" className="mt-5 flex items-center gap-2 text-[12px] text-white/35 hover:text-white" onClick={()=>void store.logout()}><LogOut size={14}/>{t("invite.switchEmail")}</button>
  </section></div>;
}
