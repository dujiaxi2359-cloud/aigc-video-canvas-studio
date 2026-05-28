import { getDb } from "../db/database.js";
import { createId } from "../utils/id.js";
import { now } from "../utils/time.js";
import { decryptApiKey, encryptApiKey, maskEncryptedApiKey } from "./encryption.service.js";
import { defaultCapabilities, modelCatalog } from "./modelCatalog.js";
import type { ModelCapabilities, ModelConfig } from "../types/model.js";

type ModelConfigRow = {
  id: string;
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

function toPublicModelConfig(row: ModelConfigRow): ModelConfig {
  const catalogItem = modelCatalog.find((item) => item.providerId === row.provider_id && item.name === row.model_name);
  return {
    id: row.id,
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
    capabilities: catalogItem?.capabilities ?? JSON.parse(row.capabilities_json),
    createdAt: row.created_at,
    updatedAt: row.updated_at
  };
}

export async function listModelConfigs() {
  const db = await getDb();
  const rows = await db.all<ModelConfigRow[]>("SELECT * FROM model_configs ORDER BY updated_at DESC");
  return rows.map(toPublicModelConfig);
}

export async function getInternalModelConfig(id: string) {
  const db = await getDb();
  return db.get<ModelConfigRow>("SELECT * FROM model_configs WHERE id = ?", id);
}

export async function createModelConfig(input: Partial<ModelConfig> & { apiKey?: string }) {
  const db = await getDb();
  const timestamp = now();
  const id = createId("model");
  const capabilities: ModelCapabilities = input.capabilities ?? defaultCapabilities();
  const apiKey = submittedApiKey(input.apiKey);
  await db.run(
    `INSERT INTO model_configs
     (id, provider_id, provider, category, display_name, api_base_url, requires_api_base_url, encrypted_api_key, model_name, model_type, enabled, capabilities_json, created_at, updated_at)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
    id,
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
  await db.run("DELETE FROM model_configs WHERE id = ?", id);
}

export async function testModelConfig(id: string) {
  const row = await getInternalModelConfig(id);
  if (!row) throw new Error("Model config not found");
  const apiKey = row.encrypted_api_key ? decryptApiKey(row.encrypted_api_key) : "";
  return {
    success: Boolean(row.api_base_url && row.model_name && apiKey),
    message: row.api_base_url && row.model_name && apiKey ? "模拟连接成功" : "请填写 API Base URL、Model Name 和 API Key"
  };
}
