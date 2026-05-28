import { ProviderError, isProviderError } from "../../utils/providerErrors.js";
import type { AgentDiagnoseInput, AgentExplainErrorInput, AgentPlanInput } from "../../types/agent.js";
import { createWorkflowPlanWithDeepSeek, diagnoseCanvasWithDeepSeek, explainErrorWithDeepSeek } from "./deepseekAgent.service.js";
import { createWorkflowPlanWithGemini, diagnoseCanvasWithGemini, explainErrorWithGemini } from "./geminiAgent.service.js";
import { getEnabledTextAgentModel, listEnabledTextAgentModels, type InternalAgentModelConfig } from "./agentModelConfig.service.js";
import { createRuleBasedWorkflowPlan, diagnoseCanvasWithRules, explainErrorWithRules } from "./ruleBasedAgent.service.js";

export type AgentProviderName = "gemini" | "deepseek" | "rule-based";

function providerName(model: InternalAgentModelConfig): AgentProviderName | undefined {
  if (model.providerId === "google") return "gemini";
  if (model.providerId === "deepseek") return "deepseek";
  return undefined;
}

function normalizeAgentError(error: unknown) {
  if (isProviderError(error)) return error;
  const message = error instanceof Error ? error.message : "Agent 调用失败";
  if (/fetch failed|network|econn|dns/i.test(message)) {
    return new ProviderError("NETWORK_ERROR", "Agent 网络请求失败，请检查后端代理、VPN 或 provider API 是否可访问。", message);
  }
  return new ProviderError("PROVIDER_ERROR", message);
}

async function orderedTextModels(preferredId?: string) {
  const models = await listEnabledTextAgentModels();
  if (!preferredId) return models;
  const preferred = await getEnabledTextAgentModel(preferredId);
  if (!preferred) return models;
  return [preferred, ...models.filter((model) => model.id !== preferred.id)];
}

export async function createAgentWorkflowPlan(input: AgentPlanInput) {
  const errors: string[] = [];
  for (const model of await orderedTextModels(input.modelConfigId)) {
    const name = providerName(model);
    if (!name) continue;
    try {
      const plan = name === "gemini"
        ? await createWorkflowPlanWithGemini(model, input)
        : await createWorkflowPlanWithDeepSeek(model, input);
      return { status: "success" as const, plan, provider: name };
    } catch (error) {
      const normalized = normalizeAgentError(error);
      errors.push(`${model.displayName}: ${normalized.message}`);
      console.warn("[agent fallback]", model.providerId, normalized.errorCode, normalized.message);
    }
  }

  const plan = createRuleBasedWorkflowPlan(input);
  return {
    status: "success" as const,
    plan,
    provider: "rule-based" as const,
    warnings: errors
  };
}

export async function diagnoseAgentCanvas(input: AgentDiagnoseInput) {
  const errors: string[] = [];
  for (const model of await orderedTextModels(input.modelConfigId)) {
    const name = providerName(model);
    if (!name) continue;
    try {
      const report = name === "gemini"
        ? await diagnoseCanvasWithGemini(model, input)
        : await diagnoseCanvasWithDeepSeek(model, input);
      return { status: "success" as const, report, provider: name };
    } catch (error) {
      const normalized = normalizeAgentError(error);
      errors.push(`${model.displayName}: ${normalized.message}`);
      console.warn("[agent fallback]", model.providerId, normalized.errorCode, normalized.message);
    }
  }

  return {
    status: "success" as const,
    report: diagnoseCanvasWithRules(input.canvasState),
    provider: "rule-based" as const,
    warnings: errors
  };
}

export async function explainAgentNodeError(input: AgentExplainErrorInput) {
  const errors: string[] = [];
  for (const model of await orderedTextModels(input.modelConfigId)) {
    const name = providerName(model);
    if (!name) continue;
    try {
      const result = name === "gemini"
        ? await explainErrorWithGemini(model, input)
        : await explainErrorWithDeepSeek(model, input);
      return { status: "success" as const, ...result, provider: name };
    } catch (error) {
      const normalized = normalizeAgentError(error);
      errors.push(`${model.displayName}: ${normalized.message}`);
      console.warn("[agent fallback]", model.providerId, normalized.errorCode, normalized.message);
    }
  }

  return {
    status: "success" as const,
    ...explainErrorWithRules(input),
    provider: "rule-based" as const,
    warnings: errors
  };
}

