import { getDb } from "../db/database.js";
import { createId } from "../utils/id.js";
import { now } from "../utils/time.js";
import { decryptApiKey, encryptApiKey, maskEncryptedApiKey } from "./encryption.service.js";
import { defaultCapabilities } from "./modelCatalog.js";
import type { ModelCapabilities, ModelConfig } from "../types/model.js";
import { requireRequestContext } from "./requestContext.js";

type ModelConfigRow = {
  id: string;
  workspace_id?: string;
  created_by_user_id?: string;
  provider_id?: string;
  provider: string;
  category?: ModelConfig["category"];
  display_name: string;
  api_base_url: string;
  requires_api_base_url?: number;
  encrypted_api_key?: string;
  model_name: string;
  model_type: ModelConfig["modelType"];
  enabled: number;
  capabilities_json: string;
  created_at: number;
  updated_at: number;
};

function inferCategory(modelType?: ModelConfig["modelType"]): ModelConfig["category"] {
  if (modelType === "text") return "text";
  if (modelType === "text-to-image" || modelType === "image-to-image" || modelType === "image-edit" || modelType === "image") return "image";
  if (modelType === "text-to-video" || modelType === "image-to-video" || modelType === "video-to-video") return "video";
  if (modelType === "audio" || modelType === "tts") return "audio";
  return "custom";
}

function submittedApiKey(apiKey?: string) {
  const trimmed = apiKey?.trim();
  if (!trimmed) return undefined;
  return trimmed.includes("*") ? undefined : trimmed;
}

function endpointFrom(baseUrl: string, path: string) {
  const trimmedBase = baseUrl.trim().replace(/\/+$/, "");
  const trimmedPath = path.trim();
  if (/^https?:\/\//i.test(trimmedPath)) return trimmedPath;
  const normalizedPath = trimmedPath ? (trimmedPath.startsWith("/") ? trimmedPath : `/${trimmedPath}`) : "/models";
  if (normalizedPath === "/models" && !/\/v1$/i.test(trimmedBase)) return `${trimmedBase}/v1/models`;
  return `${trimmedBase}${normalizedPath}`;
}

function videoRelayProbeFallbackMessage(status: number, endpoint: string) {
  return [
    `视频线路格式有效，但该中转未开放模型列表接口（${endpoint} 返回 HTTP ${status}）。`,
    "请手动添加上游模型 ID 后保存；生成时仍会按视频创建协议调用该线路。"
  ].join("");
}

function placeholderApiBaseUrlMessage(apiBaseUrl: string) {
  try {
    const parsed = new URL(apiBaseUrl);
    const hostname = parsed.hostname.toLowerCase();
    if (hostname === "api.yourdomain.com" || hostname.endsWith(".yourdomain.com")) {
      return "你填写的是文档里的占位域名 api.yourdomain.com，不是真实中转地址。请在 Run API 控制台复制实际 Base URL。";
    }
    if (hostname === "example.com" || hostname.endsWith(".example.com")) {
      return "你填写的是示例域名 example.com，请替换为真实中转 Base URL。";
    }
  } catch {
    return "请求地址格式不正确，请填写类似 https://真实域名/v1 的 Base URL。";
  }
  return "";
}

function extractModelId(item: unknown) {
  if (typeof item === "string") return item;
  if (!item || typeof item !== "object") return "";
  const record = item as Record<string, unknown>;
  return String(record.id ?? record.name ?? record.model ?? record.model_name ?? "").trim();
}

function extractModels(payload: unknown) {
  const candidates: unknown[] = [];
  if (Array.isArray(payload)) candidates.push(...payload);
  if (payload && typeof payload === "object") {
    const record = payload as Record<string, unknown>;
    for (const key of ["data", "models", "model_list", "items", "result"]) {
      if (Array.isArray(record[key])) candidates.push(...record[key] as unknown[]);
    }
    if (record.data && typeof record.data === "object" && !Array.isArray(record.data)) {
      const data = record.data as Record<string, unknown>;
      for (const key of ["models", "items", "list"]) {
        if (Array.isArray(data[key])) candidates.push(...data[key] as unknown[]);
      }
    }
  }
  return Array.from(new Set(candidates.map(extractModelId).filter(Boolean)));
}

function toPublicModelConfig(row: ModelConfigRow): ModelConfig {
  return {
    id: row.id,
    workspaceId: row.workspace_id,
    providerId: row.provider_id,
    provider: row.provider,
    category: row.category ?? inferCategory(row.model_type),
    displayName: row.display_name,
    apiBaseUrl: row.api_base_url,
    requiresApiBaseUrl: Boolean(row.requires_api_base_url),
    maskedApiKey: maskEncryptedApiKey(row.encrypted_api_key),
    modelName: row.model_name,
    modelType: row.model_type,
    enabled: Boolean(row.enabled),
    capabilities: JSON.parse(row.capabilities_json),
    createdAt: row.created_at,
    updatedAt: row.updated_at
  };
}

function mergeCapabilitiesWithoutOverwriting(existing: ModelCapabilities, incoming?: ModelCapabilities) {
  if (!incoming) return existing;
  const merged = { ...existing, ...incoming };
  if (existing.channelCapability || incoming.channelCapability) {
    merged.channelCapability = { ...existing.channelCapability, ...incoming.channelCapability };
  }
  for (const key of ["supportedInputs", "inputModes"] as const) {
    const current = incoming[key] ?? existing[key];
    if (current?.length) merged[key] = current as never;
  }
  return merged;
}

export async function listModelConfigs() {
  const db = await getDb();
  const { workspace } = requireRequestContext();
  const rows = await db.all<ModelConfigRow[]>("SELECT * FROM model_configs WHERE workspace_id = ? ORDER BY updated_at DESC", workspace.id);
  return rows.map(toPublicModelConfig);
}

export async function getInternalModelConfig(id: string) {
  const db = await getDb();
  const context = requireRequestContext();
  return db.get<ModelConfigRow>("SELECT * FROM model_configs WHERE id = ? AND workspace_id = ?", id, context.workspace.id);
}

export async function createModelConfig(input: Partial<ModelConfig> & { apiKey?: string }) {
  const db = await getDb();
  const timestamp = now();
  const id = createId("model");
  const { workspace, user } = requireRequestContext();
  const capabilities: ModelCapabilities = input.capabilities ?? defaultCapabilities();
  const apiKey = submittedApiKey(input.apiKey);
  await db.run(
    `INSERT INTO model_configs
     (id, workspace_id, created_by_user_id, provider_id, provider, category, display_name, api_base_url, requires_api_base_url, encrypted_api_key, model_name, model_type, enabled, capabilities_json, created_at, updated_at)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
    id,
    workspace.id,
    user.id,
    input.providerId ?? null,
    input.provider ?? "自定义 API",
    input.category ?? inferCategory(input.modelType),
    input.displayName ?? "未命名模型",
    input.apiBaseUrl ?? "",
    input.requiresApiBaseUrl ? 1 : 0,
    apiKey ? encryptApiKey(apiKey) : null,
    input.modelName ?? "mock-model",
    input.modelType ?? "text-to-video",
    input.enabled === false ? 0 : 1,
    JSON.stringify(capabilities),
    timestamp,
    timestamp
  );
  const row = await getInternalModelConfig(id);
  return toPublicModelConfig(row!);
}

export async function saveModelConfigsBulk(
  inputs: Array<Partial<ModelConfig> & { apiKey?: string }>,
  options: { replaceExisting?: boolean } = {}
) {
  if (!Array.isArray(inputs) || inputs.length === 0) throw new Error("请至少选择一个模型。");
  if (inputs.length > 500) throw new Error("单次最多保存 500 个模型。");

  const db = await getDb();
  const { workspace } = requireRequestContext();
  let createdCount = 0;
  let updatedCount = 0;
  let deletedCount = 0;
  const keptIds: string[] = [];
  const touchedBaseUrls = new Set<string>();

  await db.transaction(async () => {
    for (const input of inputs) {
      const modelName = input.modelName?.trim();
      const apiBaseUrl = input.apiBaseUrl?.trim().replace(/\/+$/, "");
      if (!modelName || !apiBaseUrl) throw new Error("模型名称和上游请求地址不能为空。");
      touchedBaseUrls.add(apiBaseUrl);

      const existing = await db.get<ModelConfigRow>(
        "SELECT * FROM model_configs WHERE workspace_id = ? AND model_name = ? AND RTRIM(api_base_url, '/') = ? ORDER BY updated_at DESC LIMIT 1",
        workspace.id,
        modelName,
        apiBaseUrl
      );
      const normalizedInput = { ...input, modelName, apiBaseUrl, enabled: true };
      if (existing) {
        await updateModelConfig(existing.id, {
          ...normalizedInput,
          capabilities: mergeCapabilitiesWithoutOverwriting(JSON.parse(existing.capabilities_json) as ModelCapabilities, input.capabilities)
        });
        keptIds.push(existing.id);
        updatedCount += 1;
      } else {
        const created = await createModelConfig(normalizedInput);
        keptIds.push(created.id);
        createdCount += 1;
      }
    }

    if (options.replaceExisting && keptIds.length && touchedBaseUrls.size) {
      const placeholders = keptIds.map(() => "?").join(", ");
      const basePlaceholders = Array.from(touchedBaseUrls).map(() => "?").join(", ");
      const obsolete = await db.get<{ count: number }>(
        `SELECT COUNT(*) AS count FROM model_configs
         WHERE workspace_id = ? AND RTRIM(api_base_url, '/') IN (${basePlaceholders}) AND id NOT IN (${placeholders})`,
        workspace.id,
        ...Array.from(touchedBaseUrls),
        ...keptIds
      );
      await db.run(
        `DELETE FROM model_configs
         WHERE workspace_id = ? AND RTRIM(api_base_url, '/') IN (${basePlaceholders}) AND id NOT IN (${placeholders})`,
        workspace.id,
        ...Array.from(touchedBaseUrls),
        ...keptIds
      );
      deletedCount = Number(obsolete?.count ?? 0);
    }
  });

  return {
    createdCount,
    updatedCount,
    deletedCount,
    savedCount: createdCount + updatedCount,
    models: await listModelConfigs()
  };
}

export async function updateModelConfig(id: string, input: Partial<ModelConfig> & { apiKey?: string }) {
  const db = await getDb();
  const existing = await getInternalModelConfig(id);
  if (!existing) throw new Error("Model config not found");
  const apiKey = submittedApiKey(input.apiKey);
  const encryptedApiKey = apiKey ? encryptApiKey(apiKey) : existing.encrypted_api_key;
  await db.run(
    `UPDATE model_configs
     SET provider_id = ?, provider = ?, category = ?, display_name = ?, api_base_url = ?, requires_api_base_url = ?,
         encrypted_api_key = ?, model_name = ?, model_type = ?, enabled = ?, capabilities_json = ?, updated_at = ?
     WHERE id = ?`,
    input.providerId ?? existing.provider_id ?? null,
    input.provider ?? existing.provider,
    input.category ?? existing.category ?? inferCategory(input.modelType ?? existing.model_type),
    input.displayName ?? existing.display_name,
    input.apiBaseUrl ?? existing.api_base_url,
    input.requiresApiBaseUrl === undefined ? existing.requires_api_base_url ?? 0 : input.requiresApiBaseUrl ? 1 : 0,
    encryptedApiKey ?? null,
    input.modelName ?? existing.model_name,
    input.modelType ?? existing.model_type,
    input.enabled === undefined ? existing.enabled : input.enabled ? 1 : 0,
    JSON.stringify(input.capabilities ?? JSON.parse(existing.capabilities_json)),
    now(),
    id
  );
  return toPublicModelConfig((await getInternalModelConfig(id))!);
}

export async function deleteModelConfig(id: string) {
  const db = await getDb();
  await db.run("DELETE FROM model_configs WHERE id = ? AND workspace_id = ?", id, requireRequestContext().workspace.id);
}

export async function deleteModelConfigs(ids: string[]) {
  const uniqueIds = Array.from(new Set((ids ?? []).map((id) => String(id).trim()).filter(Boolean)));
  if (!uniqueIds.length) return { deletedCount: 0, ids: [] as string[] };
  if (uniqueIds.length > 2000) throw new Error("单次最多删除 2000 个模型。");

  const db = await getDb();
  const { workspace } = requireRequestContext();
  let deletedCount = 0;

  await db.transaction(async () => {
    for (let offset = 0; offset < uniqueIds.length; offset += 500) {
      const chunk = uniqueIds.slice(offset, offset + 500);
      const placeholders = chunk.map(() => "?").join(", ");
      const existing = await db.get<{ count: number }>(
        `SELECT COUNT(*) AS count FROM model_configs WHERE workspace_id = ? AND id IN (${placeholders})`,
        workspace.id,
        ...chunk
      );
      await db.run(
        `DELETE FROM model_configs WHERE workspace_id = ? AND id IN (${placeholders})`,
        workspace.id,
        ...chunk
      );
      deletedCount += Number(existing?.count ?? 0);
    }
  });

  return { deletedCount, ids: uniqueIds };
}

export async function getRuntimeModelConfig(id: string) {
  const row = await getInternalModelConfig(id);
  if (!row) throw new Error("Model config not found");
  return {
    id: row.id,
    providerId: row.provider_id,
    provider: row.provider,
    category: row.category ?? inferCategory(row.model_type),
    displayName: row.display_name,
    apiBaseUrl: row.api_base_url,
    modelName: row.model_name,
    modelType: row.model_type,
    enabled: Boolean(row.enabled)
  };
}

export async function testModelConfig(id: string, input: Partial<ModelConfig> & { apiKey?: string } = {}) {
  const row = await getInternalModelConfig(id);
  if (!row) throw new Error("Model config not found");
  const apiKey = submittedApiKey(input.apiKey) ?? (row.encrypted_api_key ? decryptApiKey(row.encrypted_api_key) : "");
  const apiBaseUrl = input.apiBaseUrl?.trim() || row.api_base_url;
  const modelName = input.modelName?.trim() || row.model_name;
  const category = input.category ?? row.category ?? inferCategory(input.modelType ?? row.model_type);

  if (!apiBaseUrl || !modelName || !apiKey) {
    return { success: false, message: "请填写 API Base URL、Model Name 和 API Key。" };
  }
  if (row.provider_id === "google" && !/generativelanguage\.googleapis\.com/i.test(apiBaseUrl)) {
    const videoProtocol = /\/v1\/video\/create\/?$/i.test(apiBaseUrl)
      ? "/v1/video/create + /v1/video/query"
      : /\/v1\/?$/i.test(apiBaseUrl) || /\/v1\/videos\/?$/i.test(apiBaseUrl)
        ? "/v1/videos"
        : "自定义视频协议";
    return {
      success: true,
      message: category === "video"
        ? `中转配置格式有效：Google 视频模型将使用 Bearer Key 调用 ${videoProtocol}。Model Name 会原样传给中转商，请通过实际生成验证模型名、余额和权限。`
        : "中转配置格式有效：Gemini 将使用 Bearer Key 调用 /v1beta/models/{model}:generateContent。请通过一次实际生成验证该中转是否开放当前模型。"
    };
  }
  return {
    success: true,
    message: "官方 API 配置格式有效。请通过一次实际生成验证模型权限和额度。"
  };
}

export async function probeOpenAiCompatibleModels(input: { apiBaseUrl?: string; apiKey?: string; validationPath?: string; pullModels?: boolean; category?: ModelConfig["category"] }) {
  const apiBaseUrl = input.apiBaseUrl?.trim();
  const apiKey = submittedApiKey(input.apiKey);
  const validationPath = input.validationPath?.trim() || "/models";
  const category = input.category;
  if (!apiBaseUrl || !apiKey) {
    return { success: false, message: "请填写请求地址和 API Key。", models: [] as string[] };
  }
  const placeholderMessage = placeholderApiBaseUrlMessage(apiBaseUrl);
  if (placeholderMessage) {
    return { success: false, message: placeholderMessage, models: [] as string[] };
  }

  const endpoint = endpointFrom(apiBaseUrl, validationPath);
  let response: Response;
  try {
    response = await fetch(endpoint, {
      method: "GET",
      headers: {
        Authorization: `Bearer ${apiKey}`,
        Accept: "application/json"
      }
    });
  } catch (error) {
    const detail = error instanceof Error ? error.message : String(error);
    return {
      success: false,
      message: `无法连接到上游接口：${endpoint}。请确认 Base URL 是真实中转地址、网络可访问，且不是文档占位符。${detail ? `(${detail})` : ""}`,
      models: [] as string[]
    };
  }
  const text = await response.text();
  let payload: unknown = {};
  try {
    payload = text ? JSON.parse(text) : {};
  } catch {
    payload = text;
  }
  if (!response.ok) {
    const message = typeof payload === "object" && payload
      ? String((payload as Record<string, unknown>).error_message ?? (payload as Record<string, unknown>).message ?? (payload as Record<string, unknown>).error ?? text)
      : text;
    if (category === "video" && validationPath === "/models" && [400, 404, 405].includes(response.status)) {
      return { success: true, message: videoRelayProbeFallbackMessage(response.status, endpoint), models: [] as string[] };
    }
    return { success: false, message: `验证失败：HTTP ${response.status}${message ? ` · ${message.slice(0, 160)}` : ""}`, models: [] as string[] };
  }

  const models = input.pullModels === false ? [] : extractModels(payload);
  return {
    success: true,
    message: input.pullModels === false
      ? "地址与 API Key 验证通过。请继续拉取模型，或直接手动添加上游模型 ID。"
      : models.length
        ? `验证通过，已拉取 ${models.length} 个模型。`
        : "验证通过，但未从返回内容中识别到模型列表。",
    models
  };
}
