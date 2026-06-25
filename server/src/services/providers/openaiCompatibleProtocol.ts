import type { ModelCapabilities, ModelCapabilityKind, OpenAiCompatibleConfig, ProviderType } from "../../types/model.js";
import { ProviderError, type ProviderErrorCode } from "../../utils/providerErrors.js";

const OFFICIAL_HOSTS = [
  "api.openai.com",
  "api.x.ai",
  "generativelanguage.googleapis.com",
  "open.bigmodel.cn",
  "apihub.agnes-ai.com"
];

function hostOf(value?: string) {
  if (!value) return "";
  try {
    return new URL(value).hostname.toLowerCase();
  } catch {
    return "";
  }
}

export function isOfficialApiBaseUrl(apiBaseUrl?: string) {
  const host = hostOf(apiBaseUrl);
  if (!host) return false;
  return OFFICIAL_HOSTS.includes(host)
    || host.endsWith(".volces.com")
    || host.endsWith(".volcengineapi.com")
    || host.endsWith(".googleapis.com")
    || host.endsWith(".aliyuncs.com")
    || host.endsWith(".klingai.com")
    || host.endsWith(".minimax.io")
    || host.endsWith(".minimaxi.com");
}

export function resolveProviderType(capabilities?: ModelCapabilities, apiBaseUrl?: string): ProviderType {
  if (capabilities?.providerType) return capabilities.providerType;
  if (capabilities?.channel === "proxy" || capabilities?.channelCapability?.channel === "proxy") return "openai_compatible";
  if (capabilities?.capabilitySource === "upstream") return "openai_compatible";
  if (apiBaseUrl && !isOfficialApiBaseUrl(apiBaseUrl)) return "openai_compatible";
  return "official";
}

export function openAiCompatibleDefaults(category: "text" | "image" | "video"): OpenAiCompatibleConfig {
  if (category === "text") return { chatEndpoint: "/v1/chat/completions", authHeader: "Authorization: Bearer {apiKey}" };
  if (category === "image") {
    return {
      imageGenerationEndpoint: "/v1/images/generations",
      imageEditEndpoint: "/v1/images/edits",
      authHeader: "Authorization: Bearer {apiKey}"
    };
  }
  return {
    videoCreateEndpoint: "/v1/videos",
    videoPollEndpoint: "/v1/videos/{taskId}",
    videoPollMethod: "GET",
    videoPollBodyKey: "task_id",
    videoPollIdLocation: "path",
    authHeader: "Authorization: Bearer {apiKey}",
    pollInterval: 3000,
    maxPollAttempts: 120,
    pollTimeout: 600000,
    fallbackMode: "openai_first_then_unified"
  };
}

function normalizePath(path: string) {
  if (!path) return "";
  return path.startsWith("/") ? path : `/${path}`;
}

export function resolveOpenAiCompatibleEndpoint(input: {
  baseUrl: string;
  endpoint?: string;
  defaultEndpoint: string;
  modelId?: string;
  taskId?: string;
  queryParams?: OpenAiCompatibleConfig["queryParams"];
}) {
  const base = (input.baseUrl || "").trim().replace(/\/+$/, "");
  if (!base) throw new ProviderError("PROVIDER_ERROR", "中转 Base URL 未配置，禁止生成。");
  const rawEndpoint = (input.endpoint || input.defaultEndpoint).trim();
  const templated = rawEndpoint
    .replace(/\{modelId\}/g, encodeURIComponent(input.modelId || ""))
    .replace(/\{model\}/g, encodeURIComponent(input.modelId || ""))
    .replace(/\{taskId\}/g, encodeURIComponent(input.taskId || ""))
    .replace(/\{id\}/g, encodeURIComponent(input.taskId || ""));
  const url = /^https?:\/\//i.test(templated)
    ? new URL(templated)
    : new URL(joinOpenAiCompatibleUrl(base, templated));
  for (const [key, value] of Object.entries(input.queryParams ?? {})) {
    if (value !== undefined && value !== "") url.searchParams.set(key, String(value));
  }
  return url.toString();
}

export function joinOpenAiCompatibleUrl(baseUrl: string, endpoint: string) {
  const base = baseUrl.trim().replace(/\/+$/, "");
  const path = normalizePath(endpoint.trim());
  if (!path) return base;
  if (/\/v\d+(?:beta)?$/i.test(base) && /^\/v\d+(?:beta)?\//i.test(path)) {
    return `${base}${path.replace(/^\/v\d+(?:beta)?/i, "")}`;
  }
  if (/\/v\d+(?:beta)?\/.+$/i.test(base) && /^\/v\d+(?:beta)?\//i.test(path)) {
    return `${base}${path.replace(/^\/v\d+(?:beta)?/i, "")}`;
  }
  return `${base}${path}`;
}

export function openAiCompatibleHeaders(input: {
  apiKey: string;
  config?: OpenAiCompatibleConfig;
  contentType?: string;
  accept?: string;
  includeContentType?: boolean;
}) {
  const headers: Record<string, string> = {};
  const auth = input.config?.authHeader;
  if (auth && typeof auth === "object") {
    for (const [key, value] of Object.entries(auth)) headers[key] = value.replace(/\{apiKey\}/g, input.apiKey);
  } else if (typeof auth === "string" && auth.includes(":")) {
    const [name, ...rest] = auth.split(":");
    headers[name.trim()] = rest.join(":").trim().replace(/\{apiKey\}/g, input.apiKey);
  } else {
    headers.Authorization = `Bearer ${input.apiKey}`;
  }
  if (input.includeContentType !== false) headers["Content-Type"] = input.contentType ?? "application/json";
  if (input.accept) headers.Accept = input.accept;
  return headers;
}

export async function readRawResponse(response: Response) {
  const text = await response.text();
  try {
    return { text, payload: text ? JSON.parse(text) : undefined };
  } catch {
    return { text, payload: text };
  }
}

export function rawMessage(payload: unknown, fallback = "") {
  if (!payload) return fallback;
  if (typeof payload === "string") return payload || fallback;
  if (typeof payload !== "object") return String(payload);
  const record = payload as Record<string, unknown>;
  const error = record.error;
  const direct = record.message ?? record.error_message ?? record.detail;
  if (typeof direct === "string") return direct;
  if (error && typeof error === "object") {
    const nested = error as Record<string, unknown>;
    for (const value of [nested.message, nested.error_message, nested.detail, nested.code, nested.type]) {
      if (typeof value === "string" && value.trim()) return value;
    }
  }
  if (typeof error === "string") return error;
  try {
    return JSON.stringify(payload);
  } catch {
    return fallback;
  }
}

export function throwOpenAiCompatibleHttpError(input: {
  label: string;
  endpoint: string;
  status: number;
  payload: unknown;
  text?: string;
}) {
  const raw = rawMessage(input.payload, input.text ?? "");
  const message = raw ? `${input.label}失败：HTTP ${input.status} · ${raw}` : `${input.label}失败：HTTP ${input.status}`;
  throw new ProviderError(classifyOpenAiCompatibleProviderErrorCode(raw || input.text || message), message, message, {
    endpoint: input.endpoint,
    status: input.status,
    rawResponse: input.payload ?? input.text
  });
}

export function classifyOpenAiCompatibleProviderErrorCode(message: string): ProviderErrorCode {
  if (/contents\s+is\s+required|contents.*required/i.test(message)) return "GEMINI_REQUEST_SCHEMA_ERROR";
  if (/unknown parameter|invalid.*parameter|invalid_request_error|bad request|request schema|schema/i.test(message)) return "REQUEST_SCHEMA_ERROR";
  if (/no available compatible accounts|compatible accounts.*not available|账号.*不可用|账户.*不可用/i.test(message)) return "PROVIDER_ACCOUNT_UNAVAILABLE";
  if (/无可用渠道|可用渠道不存在|no available channel|all channels|channel.*unavailable|所有分组.*模型|当前分组.*模型/i.test(message)) return "PROVIDER_CHANNEL_UNAVAILABLE";
  if (/no available platform found|platform.*not found|model route|route unavailable|模型.*路由|平台.*不可用/i.test(message)) return "PROVIDER_MODEL_ROUTE_UNAVAILABLE";
  return "PROVIDER_ERROR";
}

export function explicitCapabilityKinds(capabilities?: ModelCapabilities) {
  const values = new Set<ModelCapabilityKind>();
  if (!capabilities) return values;
  if (capabilities.capability) values.add(capabilities.capability);
  for (const value of capabilities.capabilityKinds ?? []) values.add(value);
  return values;
}

export function deriveCapabilityKinds(capabilities?: ModelCapabilities) {
  const values = explicitCapabilityKinds(capabilities);
  if (!capabilities) return values;
  const model = capabilities.modelCapability;
  if (model?.supportsText) values.add("text");
  if (model?.supportsTextToImage) values.add("image_generation");
  if (model?.supportsImageToImage || model?.supportsImageEdit) values.add("image_edit");
  if (model?.supportsTextToVideo) values.add("text_to_video");
  if (model?.supportsImageToVideo || model?.supportsFirstLastFrame) values.add("image_to_video");
  if (model?.supportsReferenceToVideo) values.add("reference_to_video");
  if (model?.supportsVideoToVideo) values.add("video_to_video");
  for (const mode of capabilities.inputModes ?? []) {
    if (mode === "text") values.add("text");
    if (mode === "text-to-image") values.add("image_generation");
    if (mode === "image-to-image" || mode === "image-edit") values.add("image_edit");
    if (mode === "text-to-video") values.add("text_to_video");
    if (mode === "image-to-video" || mode === "first-last-frame") values.add("image_to_video");
    if (mode === "reference-to-video") values.add("reference_to_video");
    if (mode === "video-to-video") values.add("video_to_video");
  }
  return values;
}

export function ensureOpenAiCompatibleConfig(capabilities: ModelCapabilities, category: "text" | "image" | "video") {
  return {
    ...openAiCompatibleDefaults(category),
    ...(capabilities.openaiCompatibleConfig ?? {})
  };
}
