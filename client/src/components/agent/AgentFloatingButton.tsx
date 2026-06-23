import { Sparkles } from "lucide-react";
import { useAgentStore } from "../../store/agentStore";

export function AgentFloatingButton() {
  const openAgent = useAgentStore((state) => state.openAgent);
  const isOpen = useAgentStore((state) => state.isAgentOpen);
  return (
    <button
      type="button"
      onClick={() => openAgent()}
      className={`nodrag nopan fixed bottom-20 right-5 z-[9997] inline-flex h-11 items-center gap-2 rounded-full border px-4 text-[13px] font-medium backdrop-blur-[24px] transition duration-200 hover:-translate-y-0.5 ${
        isOpen
          ? "border-indigo-300/35 bg-white/[0.07] text-white shadow-[0_0_28px_rgba(99,102,241,0.22),inset_0_1px_0_rgba(255,255,255,0.08)]"
          : "border-white/[0.08] bg-white/[0.04] text-white/72 shadow-[0_16px_42px_rgba(0,0,0,0.30),inset_0_1px_0_rgba(255,255,255,0.05)] hover:border-indigo-300/35 hover:text-white hover:shadow-[0_0_26px_rgba(99,102,241,0.18),0_16px_42px_rgba(0,0,0,0.34)]"
      }`}
    >
      <Sparkles size={16} strokeWidth={1.8} />
      助手
    </button>
  );
}
