import { Sparkles } from "lucide-react";
import { useAgentStore } from "../../store/agentStore";

export function AgentFloatingButton() {
  const openAgent = useAgentStore((state) => state.openAgent);
  const isOpen = useAgentStore((state) => state.isAgentOpen);
  return (
    <button
      type="button"
      onClick={() => openAgent()}
      className={`nodrag nopan fixed bottom-20 right-5 z-[9997] inline-flex h-11 items-center gap-2 rounded-full border px-4 text-[13px] font-medium backdrop-blur-[18px] transition ${
        isOpen
          ? "border-violet-300/35 bg-white/[0.07] text-white shadow-[0_0_24px_rgba(139,92,246,0.22)]"
          : "border-white/[0.08] bg-white/[0.04] text-white/70 hover:border-violet-400/35 hover:text-white hover:shadow-[0_0_24px_rgba(139,92,246,0.18)]"
      }`}
    >
      <Sparkles size={16} strokeWidth={1.8} />
      Agent
    </button>
  );
}
