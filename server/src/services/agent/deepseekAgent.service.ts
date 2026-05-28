import { generateTextWithDeepSeek } from "../providers/deepseek.service.js";
import { ProviderError } from "../../utils/providerErrors.js";
import type { AgentDiagnoseInput, AgentExplainErrorInput, AgentPlanInput } from "../../types/agent.js";
import type { InternalAgentModelConfig } from "./agentModelConfig.service.js";
import { decryptAgentModelKey } from "./agentModelConfig.service.js";
import { extractJsonObject, validateDiagnosticReport, validateWorkflowPlan } from "./agentJson.js";
import { diagnosticPrompt, errorExplainPrompt, jsonRepairPrompt, workflowPlannerPrompt } from "./agentPrompts.js";

async function callDeepSeek(model: InternalAgentModelConfig, inputText: string) {
  const apiKey = decryptAgentModelKey(model);
  if (!apiKey) throw new ProviderError("API_KEY_MISSING", "请先在设置中心配置 DeepSeek API Key，或使用本地规则引擎。");
  const result = await generateTextWithDeepSeek({
    modelConfigId: model.id,
    nodeId: "agent",
    inputText,
    taskType: "custom",
    systemPrompt: "你是 AIGC 工作流副驾驶。必须只输出合法 JSON，不要 Markdown，不要解释文字。",
    apiKey,
    apiBaseUrl: model.apiBaseUrl,
    modelName: model.modelName,
    providerId: model.providerId
  });
  return result.outputText ?? "";
}

export async function createWorkflowPlanWithDeepSeek(model: InternalAgentModelConfig, input: AgentPlanInput) {
  const first = await callDeepSeek(model, workflowPlannerPrompt(input.prompt, input.canvasState));
  try {
    return validateWorkflowPlan(extractJsonObject(first));
  } catch {
    const repaired = await callDeepSeek(model, jsonRepairPrompt(first, "workflowPlan"));
    return validateWorkflowPlan(extractJsonObject(repaired));
  }
}

export async function diagnoseCanvasWithDeepSeek(model: InternalAgentModelConfig, input: AgentDiagnoseInput) {
  const first = await callDeepSeek(model, diagnosticPrompt(input.canvasState));
  try {
    return validateDiagnosticReport(extractJsonObject(first));
  } catch {
    const repaired = await callDeepSeek(model, jsonRepairPrompt(first, "diagnosticReport"));
    return validateDiagnosticReport(extractJsonObject(repaired));
  }
}

export async function explainErrorWithDeepSeek(model: InternalAgentModelConfig, input: AgentExplainErrorInput) {
  const text = await callDeepSeek(model, errorExplainPrompt(input.errorMessage, input.nodeData, input.canvasState));
  return extractJsonObject(text) as { explanation: string; suggestion: string; actions: string[] };
}
