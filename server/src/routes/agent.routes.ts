import { Router } from "express";
import { createAgentWorkflowPlan, diagnoseAgentCanvas, explainAgentNodeError } from "../services/agent/agent.service.js";
import { isProviderError } from "../utils/providerErrors.js";

export const agentRouter = Router();

function agentError(error: unknown) {
  if (isProviderError(error)) {
    return {
      status: "error" as const,
      errorCode: error.errorCode,
      errorMessage: error.message,
      debugMessage: error.debugMessage
    };
  }
  const message = error instanceof Error ? error.message : "Agent 请求失败";
  return {
    status: "error" as const,
    errorCode: /fetch failed|network/i.test(message) ? "NETWORK_ERROR" : "AGENT_ERROR",
    errorMessage: /fetch failed|network/i.test(message) ? "Agent 网络请求失败，请检查后端代理、VPN 或 provider API 是否可访问。" : message,
    debugMessage: /fetch failed|network/i.test(message) ? message : undefined
  };
}

agentRouter.post("/plan", async (req, res) => {
  try {
    res.json(await createAgentWorkflowPlan(req.body));
  } catch (error) {
    res.json(agentError(error));
  }
});

agentRouter.post("/diagnose", async (req, res) => {
  try {
    res.json(await diagnoseAgentCanvas(req.body));
  } catch (error) {
    res.json(agentError(error));
  }
});

agentRouter.post("/explain-error", async (req, res) => {
  try {
    res.json(await explainAgentNodeError(req.body));
  } catch (error) {
    res.json(agentError(error));
  }
});

