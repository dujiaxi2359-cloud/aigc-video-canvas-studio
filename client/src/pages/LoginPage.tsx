import { useState } from "react";
import { ArrowRight, Check, Mail } from "lucide-react";
import { MoonLogo } from "../components/common/BrandIdentity";
import { useAuthStore } from "../store/authStore";

const emailOptions = [
  { id: "qq", label: "QQ 邮箱", suffix: "@qq.com" },
  { id: "gmail", label: "Gmail", suffix: "@gmail.com" }
] as const;

function detectEmailType(email: string) {
  const lower = email.toLowerCase();
  if (lower.endsWith("@qq.com")) return "qq";
  if (lower.endsWith("@gmail.com") || lower.endsWith("@googlemail.com")) return "gmail";
  return "qq";
}

export function LoginPage() {
  const [email, setEmail] = useState("");
  const [emailType, setEmailType] = useState<(typeof emailOptions)[number]["id"]>("qq");
  const [code, setCode] = useState("");
  const [sent, setSent] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const store = useAuthStore();

  async function send() {
    setBusy(true); setError("");
    try { await store.requestCode(email); setSent(true); }
    catch (err) { setError(err instanceof Error ? err.message : "验证码发送失败"); }
    finally { setBusy(false); }
  }

  async function verify() {
    setBusy(true); setError("");
    try { await store.verifyCode(email, code); }
    catch (err) { setError(err instanceof Error ? err.message : "登录失败"); }
    finally { setBusy(false); }
  }

  function selectEmailType(type: (typeof emailOptions)[number]["id"]) {
    setEmailType(type);
    setError("");
    if (sent) return;
    const option = emailOptions.find((item) => item.id === type);
    if (!option) return;
    const name = email.includes("@") ? email.split("@")[0] : email;
    setEmail(name ? `${name}${option.suffix}` : "");
  }

  const detectedType = email ? detectEmailType(email) : emailType;

  return <div className="grid h-screen place-items-center overflow-auto bg-[#070708] p-5 pb-16 text-white">
    <div className="pointer-events-none fixed inset-0 bg-[radial-gradient(circle_at_50%_30%,rgba(95,84,180,.13),transparent_34%)]" />
    <section className="relative w-full max-w-[520px] rounded-[20px] border border-white/[0.1] bg-[#121214] p-8 shadow-2xl shadow-black/50">
      <div className="login-brand-mark mb-6">
        <MoonLogo className="login-brand-logo" />
      </div>
      <h1 className="text-[28px] font-semibold tracking-[-0.02em]">登录 Moon｜Tv</h1>
      <div className="mt-6 grid grid-cols-2 gap-3">
        {emailOptions.map((option) => (
          <button
            key={option.id}
            type="button"
            disabled={sent}
            onClick={() => selectEmailType(option.id)}
            className={`rounded-[12px] border px-3 py-3 text-left transition disabled:cursor-not-allowed disabled:opacity-70 ${detectedType === option.id ? "border-cyan-300/55 bg-cyan-300/[0.1] text-white" : "border-white/[0.08] bg-white/[0.035] text-white/62 hover:border-white/[0.18] hover:bg-white/[0.06] hover:text-white"}`}
          >
            <span className="flex items-center justify-between text-[13px] font-semibold">
              {option.label}
              {detectedType === option.id && <Check size={14} className="text-cyan-200" />}
            </span>
          </button>
        ))}
      </div>
      <label className="mt-7 block text-[12px] text-white/55">邮箱地址</label>
      <div className="relative mt-2"><Mail className="absolute left-3 top-1/2 -translate-y-1/2 text-white/28" size={16}/><input autoFocus className="studio-input h-12 w-full pl-10 pr-3" type="email" value={email} onChange={(e)=>{setEmail(e.target.value);setEmailType(detectEmailType(e.target.value));}} placeholder="输入邮箱地址" disabled={sent}/></div>
      {sent && <><label className="mt-5 block text-[12px] text-white/55">6 位验证码</label><input className="studio-input mt-2 h-12 w-full px-4 text-[18px] tracking-[0.3em]" inputMode="numeric" maxLength={6} value={code} onChange={(e)=>setCode(e.target.value.replace(/\D/g,""))} placeholder="000000"/></>}
      {error && <p className="mt-3 text-[12px] text-red-300">{error}</p>}
      <button type="button" disabled={busy || !email || (sent && code.length !== 6)} onClick={() => void (sent ? verify() : send())} className="studio-primary-button mt-6 h-12 w-full justify-center disabled:opacity-40">{busy ? "处理中..." : sent ? "验证并登录" : "发送验证码"}<ArrowRight size={16}/></button>
    </section>
  </div>;
}
