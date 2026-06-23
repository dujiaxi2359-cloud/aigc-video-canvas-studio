import type { GoogleGenAIOptions } from "@google/genai";

export const defaultProviderApiBaseUrls: Record<string, string> = {
  deepseek: "https://api.deepseek.com",
  openai: "https://api.openai.com/v1",
  alibaba: "https://dashscope.aliyuncs.com/api/v1",
  google: "https://generativelanguage.googleapis.com/v1beta",
  kling: "https://api.klingai.com",
  grok: "https://api.x.ai/v1",
  seedance: "https://ark.cn-beijing.volces.com/api/v3",
  minimax: "https://api.minimaxi.com/v1",
  agnes: "https://apihub.agnes-ai.com",
  zhipu: "https://open.bigmodel.cn/api/paas/v4"
};

export function resolveProviderApiBaseUrl(providerId?: string, apiBaseUrl?: string) {
  return apiBaseUrl?.trim() || defaultProviderApiBaseUrls[providerId ?? ""] || "";
}

function splitGoogleApiBaseUrl(apiBaseUrl: string) {
  const normalized = apiBaseUrl.trim().replace(/\/$/, "");
  const match = normalized.match(/^(.*)\/(v1alpha|v1beta|v1)$/i);
  if (!match) return { baseUrl: normalized, apiVersion: "v1beta" };
  return {
    baseUrl: match[1],
    apiVersion: match[2]
  };
}

export function googleGenAIOptions(apiKey: string, apiBaseUrl?: string): GoogleGenAIOptions {
  const resolvedBaseUrl = resolveProviderApiBaseUrl("google", apiBaseUrl);
  if (!resolvedBaseUrl) return { apiKey };
  const { baseUrl, apiVersion } = splitGoogleApiBaseUrl(resolvedBaseUrl);
  return {
    apiKey,
    httpOptions: {
      baseUrl,
      apiVersion
    }
  };
}
