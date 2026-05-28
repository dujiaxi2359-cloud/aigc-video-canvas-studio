import { motion } from "framer-motion";
import { ArrowRight, Sparkles } from "lucide-react";
import type { Page } from "../App";
import { useAgentStore } from "../store/agentStore";
import { ObsidianBackground } from "../components/visual/ObsidianBackground";
import { SpotlightPortalBar } from "../components/visual/SpotlightPortalBar";

export function DashboardPage({ onNavigate }: { onNavigate: (page: Page) => void }) {
  const openAgent = useAgentStore((state) => state.openAgent);
  const enterCanvas = () => onNavigate("canvas");
  const startWithAgent = (prompt: string) => {
    openAgent(prompt);
    onNavigate("canvas");
  };

  return (
    <motion.div
      className="relative flex h-full w-full items-center justify-center overflow-hidden bg-[#020203]"
      initial={{ opacity: 0, scale: 0.98, filter: "blur(16px)" }}
      animate={{ opacity: 1, scale: 1, filter: "blur(0px)" }}
      exit={{ opacity: 0, scale: 1.12, filter: "blur(36px)", transition: { duration: 0.65, ease: [0.22, 1, 0.36, 1] } }}
    >
      <ObsidianBackground variant="dashboard" portalGlow />

      <motion.section
        className="relative z-10 flex w-full max-w-[780px] flex-col items-center px-6 text-center"
        initial={{ y: 18, opacity: 0 }}
        animate={{ y: 0, opacity: 1 }}
        transition={{ duration: 0.55, ease: [0.22, 1, 0.36, 1] }}
      >
        <p className="mb-4 text-[11px] uppercase tracking-[0.38em] text-white/[0.26]">AIGC Video Canvas Studio</p>
        <h1 className="text-[clamp(42px,5vw,72px)] font-extralight leading-[0.95] tracking-[-0.04em] text-white/[0.92] [text-shadow:0_0_28px_rgba(255,255,255,0.08)]">
          今天要做点什么？
        </h1>
        <p className="mt-5 max-w-[560px] text-[14px] leading-7 text-white/[0.36]">
          输入一个视频想法、产品图脚本或分镜目标，进入画布后继续连接素材、模型与生成节点。
        </p>

        <div className="relative mt-10 w-full max-w-[640px]">
          <SpotlightPortalBar onClick={enterCanvas}>
            <span className="relative grid h-10 w-10 place-items-center rounded-2xl border border-white/[0.08] bg-white/[0.03] text-indigo-200/80">
              <Sparkles size={18} strokeWidth={1.7} />
            </span>
            <span className="relative min-w-0 flex-1">
              <span className="block text-[14px] text-white/90">描述你的工作流目标</span>
              <span className="mt-0.5 block truncate text-[13px] text-white/30">例如：把产品主图生成 15 秒竖屏电商短视频</span>
            </span>
            <span className="relative grid h-9 w-9 place-items-center rounded-full bg-indigo-500/90 text-white shadow-[0_0_20px_rgba(99,102,241,0.28)] transition group-hover:translate-x-0.5">
              <ArrowRight size={16} />
            </span>
          </SpotlightPortalBar>
        </div>

        <button type="button" onClick={enterCanvas} className="mt-6 rounded-full border border-white/[0.08] px-5 py-2 text-[13px] text-white/45 transition hover:border-indigo-400/30 hover:text-white/85">
          开启工作台
        </button>
        <div className="mt-6 flex flex-wrap justify-center gap-2">
          {[
            ["电商主图", "做一张电商主图"],
            ["产品视频", "做一个产品视频"],
            ["图生视频", "做一个图生视频"],
            ["短剧分镜", "做一组短剧分镜"],
            ["诊断画布", "诊断当前画布"]
          ].map(([label, prompt]) => (
            <button
              key={label}
              type="button"
              onClick={() => startWithAgent(prompt)}
              className="rounded-full border border-white/[0.07] bg-white/[0.02] px-4 py-2 text-[12px] text-white/42 transition hover:border-indigo-400/25 hover:text-white/75"
            >
              {label}
            </button>
          ))}
        </div>
      </motion.section>
    </motion.div>
  );
}
