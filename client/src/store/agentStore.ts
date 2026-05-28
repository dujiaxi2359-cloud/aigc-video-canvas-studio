import { create } from "zustand";
import { agentApi, type AgentProvider } from "../services/agentApi";
import { useCanvasStore } from "./canvasStore";
import type { AgentDiagnosticReport, AgentWorkflowPlan } from "../types/agent";

export type AgentMessage = {
  id: string;
  role: "user" | "agent" | "system";
  content: string;
};

type AgentStatus = "idle" | "thinking" | "waiting_confirm" | "running" | "done" | "error";
type AgentMode = "manual_confirm" | "auto";

type State = {
  isAgentOpen: boolean;
  status: AgentStatus;
  mode: AgentMode;
  currentPlan?: AgentWorkflowPlan;
  diagnosticReport?: AgentDiagnosticReport;
  messages: AgentMessage[];
  provider?: AgentProvider;
  errorMessage?: string;
  draftPrompt: string;
  selectedModelConfigId?: string;
  openAgent: (prompt?: string) => void;
  closeAgent: () => void;
  setMode: (mode: AgentMode) => void;
  setDraftPrompt: (prompt: string) => void;
  setSelectedModelConfigId: (id?: string) => void;
  submitPrompt: (prompt: string) => Promise<void>;
  confirmPlan: () => void;
  cancelPlan: () => void;
  diagnoseCanvas: () => Promise<void>;
  explainNodeError: (nodeId: string, errorMessage: string, nodeData?: Record<string, unknown>) => Promise<void>;
};

function message(role: AgentMessage["role"], content: string): AgentMessage {
  return { id: `agent_msg_${Date.now()}_${Math.random().toString(16).slice(2)}`, role, content };
}

export const useAgentStore = create<State>((set, get) => ({
  isAgentOpen: false,
  status: "idle",
  mode: "manual_confirm",
  messages: [],
  draftPrompt: "",
  openAgent: (prompt) => set((state) => ({
    isAgentOpen: true,
    draftPrompt: prompt ?? state.draftPrompt
  })),
  closeAgent: () => set({ isAgentOpen: false }),
  setMode: (mode) => set({ mode }),
  setDraftPrompt: (draftPrompt) => set({ draftPrompt }),
  setSelectedModelConfigId: (selectedModelConfigId) => set({ selectedModelConfigId }),
  submitPrompt: async (prompt) => {
    const clean = prompt.trim();
    if (!clean) return;
    const { mode, selectedModelConfigId } = get();
    set((state) => ({
      status: "thinking",
      errorMessage: undefined,
      currentPlan: undefined,
      diagnosticReport: undefined,
      messages: [...state.messages, message("user", clean)]
    }));

    try {
      const canvasState = useCanvasStore.getState().getCanvasState();
      const result = await agentApi.plan({ prompt: clean, canvasState, mode, modelConfigId: selectedModelConfigId });
      if (result.status !== "success" || !result.plan) throw new Error(result.errorMessage ?? "Agent 没有返回工作流计划");
      const plan = result.plan;
      set((state) => ({
        status: mode === "auto" ? "running" : "waiting_confirm",
        currentPlan: plan,
        provider: result.provider,
        draftPrompt: "",
        messages: [...state.messages, message("agent", `${plan.title}：${plan.summary}`)]
      }));
      if (mode === "auto") get().confirmPlan();
    } catch (error) {
      const errorMessage = error instanceof Error ? error.message : "Agent 规划失败";
      set((state) => ({ status: "error", errorMessage, messages: [...state.messages, message("system", errorMessage)] }));
    }
  },
  confirmPlan: () => {
    const plan = get().currentPlan;
    if (!plan) return;
    set({ status: "running" });
    useCanvasStore.getState().applyAgentWorkflowPlan(plan);
    set((state) => ({
      status: "done",
      currentPlan: undefined,
      messages: [...state.messages, message("agent", "已按计划创建节点和连线。")]
    }));
  },
  cancelPlan: () => set((state) => ({
    status: "idle",
    currentPlan: undefined,
    messages: [...state.messages, message("system", "已取消执行该工作流计划。")]
  })),
  diagnoseCanvas: async () => {
    const { selectedModelConfigId } = get();
    set({ status: "thinking", errorMessage: undefined, diagnosticReport: undefined });
    try {
      const canvasState = useCanvasStore.getState().getCanvasState();
      const result = await agentApi.diagnose({ canvasState, modelConfigId: selectedModelConfigId });
      if (result.status !== "success" || !result.report) throw new Error(result.errorMessage ?? "Agent 诊断失败");
      const report = result.report;
      set((state) => ({
        status: "done",
        diagnosticReport: report,
        provider: result.provider,
        messages: [...state.messages, message("agent", report.summary)]
      }));
    } catch (error) {
      const errorMessage = error instanceof Error ? error.message : "Agent 诊断失败";
      set((state) => ({ status: "error", errorMessage, messages: [...state.messages, message("system", errorMessage)] }));
    }
  },
  explainNodeError: async (nodeId, errorMessage, nodeData) => {
    const { selectedModelConfigId } = get();
    set({ isAgentOpen: true, status: "thinking", errorMessage: undefined });
    try {
      const canvasState = useCanvasStore.getState().getCanvasState();
      const result = await agentApi.explainError({ nodeId, errorMessage, nodeData, canvasState, modelConfigId: selectedModelConfigId });
      if (result.status !== "success") throw new Error(result.errorMessage ?? "Agent 分析失败");
      const text = `${result.explanation ?? ""}\n\n建议：${result.suggestion ?? ""}`.trim();
      set((state) => ({
        status: "done",
        provider: result.provider,
        messages: [...state.messages, message("agent", text || "Agent 已完成分析。")]
      }));
    } catch (error) {
      const msg = error instanceof Error ? error.message : "Agent 分析失败";
      set((state) => ({ status: "error", errorMessage: msg, messages: [...state.messages, message("system", msg)] }));
    }
  }
}));
