import { Bot } from "lucide-react";
import { useAgentStore } from "../../store/agentStore";

export function AgentAnalyzeErrorButton({ nodeId, errorMessage, nodeData }: { nodeId: string; errorMessage?: string; nodeData?: Record<string, unknown> }) {
  const explainNodeError = useAgentStore((state) => state.explainNodeError);
  if (!errorMessage) return null;
  return (
    <button
      type="button"
      onClick={(event) => {
        event.stopPropagation();
        explainNodeError(nodeId, errorMessage, nodeData);
      }}
      className="nodrag nopan nowheel inline-flex h-7 items-center gap-1.5 rounded-lg border border-indigo-300/20 bg-indigo-500/10 px-2 text-[11px] text-indigo-100/80 hover:bg-indigo-500/18 hover:text-white"
      onPointerDown={(event) => event.stopPropagation()}
      onMouseDown={(event) => event.stopPropagation()}
      onKeyDown={(event) => event.stopPropagation()}
    >
      <Bot size={12} />
      让 Agent 分析
    </button>
  );
}

