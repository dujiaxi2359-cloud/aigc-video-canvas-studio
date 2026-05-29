import { Router } from "express";
import { applyProxyConfig, applySmartProxyConfig, getProxyConfig, getProxyEnvironmentInfo, getProxyInfo, type ProxyMode } from "../utils/proxy.js";
import { listModelConfigs } from "../services/modelConfig.service.js";

export const diagnosticsRouter = Router();

type ProviderId = "google" | "azure-openai" | "alibaba" | "openai" | "kling" | "grok" | "seedance";

diagnosticsRouter.get("/proxy", (_req, res) => {
  res.json({
    config: getProxyConfig(),
    info: getProxyInfo(),
    environment: getProxyEnvironmentInfo()
  });
});

diagnosticsRouter.post("/proxy", async (req, res) => {
  const mode = req.body?.mode as ProxyMode;
  if (!["off", "env", "manual", "auto"].includes(mode)) {
    res.status(400).json({ status: "error", errorMessage: "代理模式无效。" });
    return;
  }

  const config = {
    mode,
    proxyUrl: req.body?.proxyUrl,
    noProxy: req.body?.noProxy
  };
  const info = mode === "auto" ? await applySmartProxyConfig(config) : applyProxyConfig(config);

  res.json({
    status: "success",
    config: getProxyConfig(),
    info,
    environment: getProxyEnvironmentInfo()
  });
});

async function endpointFor(providerId: ProviderId, apiBaseUrl?: string) {
  if (apiBaseUrl) return apiBaseUrl;
  switch (providerId) {
    case "google":
      return "https://generativelanguage.googleapis.com";
    case "azure-openai":
      return (await listModelConfigs()).find((item) => item.providerId === "azure-openai" && item.apiBaseUrl)?.apiBaseUrl ?? "";
    case "alibaba":
      return "https://dashscope.aliyuncs.com/api/v1";
    case "openai":
      return "https://api.openai.com";
    case "grok":
      return "https://api.x.ai/v1";
    case "kling":
    case "seedance":
      return apiBaseUrl ?? "";
    default:
      return "";
  }
}

function networkErrorMessage(providerId: ProviderId) {
  if (providerId === "google") return "Google API 网络请求失败，请检查后端代理是否配置、VPN 是否被 Node 后端使用、或 Google API 是否可访问。";
  if (providerId === "azure-openai") return "Azure OpenAI 网络请求失败，请检查 endpoint、代理、网络连接以及 Azure OpenAI 服务是否可访问。";
  if (providerId === "alibaba") return "DashScope 网络请求失败，请检查 endpoint 区域、代理、网络连接以及阿里百炼服务是否可访问。";
  return "第三方 API 网络请求失败，请检查后端代理、VPN 出口和服务商 endpoint。";
}

diagnosticsRouter.post("/network", async (req, res) => {
  const providerId = req.body?.providerId as ProviderId;
  const endpoint = await endpointFor(providerId, req.body?.apiBaseUrl);
  const proxy = getProxyConfig().mode === "auto" ? await applySmartProxyConfig(getProxyConfig()) : getProxyInfo();

  if (!providerId || !endpoint) {
    res.json({
      ok: false,
      providerId,
      endpoint,
      usingProxy: proxy.usingProxy,
      proxyUrlMasked: proxy.proxyUrlMasked,
      latencyMs: 0,
      errorCode: "PROVIDER_ERROR",
      errorMessage: providerId === "azure-openai" ? "Azure 网络诊断需要提供 API Base URL / Endpoint。" : "缺少 providerId 或 endpoint。"
    });
    return;
  }

  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), 12000);
  const startedAt = Date.now();

  try {
    const response = await fetch(endpoint, {
      method: "GET",
      signal: controller.signal
    });
    clearTimeout(timer);
    res.json({
      ok: response.status < 500,
      providerId,
      endpoint,
      usingProxy: proxy.usingProxy,
      proxyUrlMasked: proxy.proxyUrlMasked,
      latencyMs: Date.now() - startedAt,
      statusCode: response.status,
      errorCode: response.status >= 500 ? "NETWORK_ERROR" : undefined,
      errorMessage: response.status >= 500 ? networkErrorMessage(providerId) : undefined
    });
  } catch (error) {
    clearTimeout(timer);
    const debugMessage = error instanceof Error ? error.message : String(error);
    res.json({
      ok: false,
      providerId,
      endpoint,
      usingProxy: proxy.usingProxy,
      proxyUrlMasked: proxy.proxyUrlMasked,
      latencyMs: Date.now() - startedAt,
      errorCode: "NETWORK_ERROR",
      errorMessage: networkErrorMessage(providerId),
      debugMessage
    });
  }
});
