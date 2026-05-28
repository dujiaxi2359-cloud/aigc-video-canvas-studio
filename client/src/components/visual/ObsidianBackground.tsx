import { motion } from "framer-motion";
import { InteractiveGlow } from "./InteractiveGlow";
import { NoiseOverlay } from "./NoiseOverlay";

export function ObsidianBackground({ variant = "dashboard", portalGlow = false }: { variant?: "dashboard" | "canvas"; portalGlow?: boolean }) {
  return (
    <div className="pointer-events-none absolute inset-0 overflow-hidden bg-[#020203]">
      <div className="absolute inset-0 bg-[#020203]" />
      <div className="absolute -left-56 -top-56 h-[580px] w-[580px] rounded-full bg-indigo-500/[0.06] blur-[125px]" />
      <div className="absolute -right-52 -top-48 h-[560px] w-[560px] rounded-full bg-sky-400/[0.04] blur-[130px]" />
      <div className="absolute -bottom-56 -left-48 h-[580px] w-[580px] rounded-full bg-purple-900/[0.05] blur-[135px]" />
      <div className="absolute -bottom-56 -right-52 h-[620px] w-[620px] rounded-full bg-sky-500/[0.04] blur-[140px]" />
      <InteractiveGlow intensity={variant === "dashboard" ? "dashboard" : "canvas"} />
      {portalGlow && (
        <motion.div
          layoutId="portal-glow"
          className="absolute left-1/2 top-1/2 h-[980px] w-[980px] -translate-x-1/2 -translate-y-1/2 rounded-full bg-[radial-gradient(circle,rgba(99,102,241,0.13)_0%,rgba(59,130,246,0.06)_34%,transparent_70%)] blur-[100px]"
          initial={{ opacity: variant === "dashboard" ? 0.72 : 0.22, scale: variant === "dashboard" ? 1 : 1.8 }}
          animate={{ opacity: variant === "dashboard" ? 0.72 : 0.35, scale: variant === "dashboard" ? 1 : 1 }}
          exit={{ opacity: 0.35, scale: 1.8, transition: { duration: 0.65, ease: [0.22, 1, 0.36, 1] } }}
        />
      )}
      <div className="absolute inset-0 bg-[radial-gradient(circle_at_center,transparent_0%,rgba(0,0,0,0.34)_100%)]" />
      <NoiseOverlay opacity={variant === "dashboard" ? 0.024 : 0.019} />
    </div>
  );
}

