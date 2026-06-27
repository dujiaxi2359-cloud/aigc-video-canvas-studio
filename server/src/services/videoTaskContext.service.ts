import type { VideoRequestConfig } from "./providers/videoRequestAdapter.js";
import { extractProviderTaskId } from "../utils/videoResultExtractor.js";

export type VideoProviderType = "official" | "openai_compatible" | "legacy_supported";
export type VideoPollMethod = "GET" | "POST";

export type VideoTaskContext = {
  providerId?: string;
  providerType: VideoProviderType;
  providerName?: string;
  modelId: string;
  upstreamModelId: string;
  baseUrl: string;
  endpointProfile: string;
  createEndpoint: string;
  pollEndpoint?: string;
  pollMethod: VideoPollMethod;
  authMode: "bearer" | "custom" | "none";
  credentialId: string;
  taskId: string;
  pollUrl?: string;
  statusUrl?: string;
  resultUrl?: string;
  taskIdPath?: string;
  videoUrlPaths: string[];
  statusPaths: string[];
  createdAt: string;
  rawCreateResponse?: unknown;
};

const SECRET_KEY = /(?:api[_-]?key|authorization|token|secret|password|credential)/i;

export function redactProviderSecrets(value: unknown): unknown {
  if (Array.isArray(value)) return value.map(redactProviderSecrets);
  if (!value || typeof value !== "object") return value;
  return Object.fromEntries(Object.entries(value as Record<string, unknown>).map(([key, child]) => [
    key,
    SECRET_KEY.test(key) ? "[redacted]" : redactProviderSecrets(child)
  ]));
}

function firstString(source: unknown, keys: string[]) {
  if (!source || typeof source !== "object") return undefined;
  const record = source as Record<string, unknown>;
  for (const key of keys) {
    const value = record[key];
    if (typeof value === "string" && value.trim()) return value.trim();
  }
  const data = record.data;
  if (data && typeof data === "object" && !Array.isArray(data)) return firstString(data, keys);
  const result = record.result;
  if (result && typeof result === "object" && !Array.isArray(result)) return firstString(result, keys);
  return undefined;
}

export function buildVideoTaskContext(input: {
  providerId?: string;
  providerName?: string;
  modelId: string;
  upstreamModelId: string;
  credentialId: string;
  requestConfig: VideoRequestConfig;
  createResponse: unknown;
  providerTaskId?: string;
}): VideoTaskContext | undefined {
  const taskId = input.providerTaskId || extractProviderTaskId(input.createResponse);
  if (!taskId) return undefined;
  const channel = input.requestConfig.channel;
  return {
    providerId: input.providerId,
    providerType: channel === "official" ? "official" : channel === "proxy" ? "openai_compatible" : "legacy_supported",
    providerName: input.providerName,
    modelId: input.modelId,
    upstreamModelId: input.upstreamModelId,
    baseUrl: input.requestConfig.baseUrl,
    endpointProfile: input.requestConfig.apiFamily,
    createEndpoint: input.requestConfig.finalUrl || input.requestConfig.createEndpoint,
    pollEndpoint: input.requestConfig.pollEndpoint || undefined,
    pollMethod: "GET",
    authMode: input.requestConfig.authType === "none" ? "none" : input.requestConfig.authType === "bearer" ? "bearer" : "custom",
    credentialId: input.credentialId,
    taskId,
    pollUrl: firstString(input.createResponse, ["poll_url", "pollUrl", "query_url", "queryUrl"]),
    statusUrl: firstString(input.createResponse, ["status_url", "statusUrl"]),
    resultUrl: firstString(input.createResponse, ["result_url", "resultUrl"]),
    taskIdPath: input.requestConfig.taskIdField,
    videoUrlPaths: ["video_url", "result_url", "output_url", "url", "data.video_url", "data.result_url", "data.output_url", "data.url", "data[0].url", "result.video_url", "result.result_url", "result.output_url", "result.url", "videos[0].url", "output.video_url", "output.url"],
    statusPaths: ["status", "state", "task_status", "data.status", "data.state", "result.status", "result.state"],
    createdAt: new Date().toISOString(),
    rawCreateResponse: redactProviderSecrets(input.createResponse)
  };
}

export function providerTaskContextFromResult(result: unknown): VideoTaskContext | undefined {
  if (!result || typeof result !== "object") return undefined;
  const context = (result as Record<string, unknown>).providerTaskContext;
  return context && typeof context === "object" ? context as VideoTaskContext : undefined;
}
