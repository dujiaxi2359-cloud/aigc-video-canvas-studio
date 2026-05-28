import { api } from "./api";
import type { AgentCanvasState, AgentDiagnosticReport, AgentWorkflowPlan } from "../types/agent";

export type AgentProvider = "gemini" | "deepseek" | "rule-based";

export const agentApi = {
  plan: (body: { prompt: string; canvasState: AgentCanvasState; mode: "manual_confirm" | "auto"; modelConfigId?: string }) =>
    api.post<{ status: "success" | "error"; plan?: AgentWorkflowPlan; provider?: AgentProvider; errorMessage?: string; warnings?: string[] }>("/api/agent/plan", body),
  diagnose: (body: { canvasState: AgentCanvasState; modelConfigId?: string }) =>
    api.post<{ status: "success" | "error"; report?: AgentDiagnosticReport; provider?: AgentProvider; errorMessage?: string; warnings?: string[] }>("/api/agent/diagnose", body),
  explainError: (body: { nodeId?: string; errorMessage: string; nodeData?: Record<string, unknown>; canvasState: AgentCanvasState; modelConfigId?: string }) =>
    api.post<{ status: "success" | "error"; explanation?: string; suggestion?: string; actions?: string[]; provider?: AgentProvider; errorMessage?: string; warnings?: string[] }>("/api/agent/explain-error", body)
};

