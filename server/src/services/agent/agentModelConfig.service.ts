import { getDb } from "../../db/database.js";
import { decryptApiKey } from "../encryption.service.js";
import type { ModelCapabilities, ModelConfig } from "../../types/model.js";
import { requireRequestContext } from "../requestContext.js";

export type InternalAgentModelConfig = {
  id: string;
  providerId?: string;
  provider: string;
  category?: ModelConfig["category"];
  displayName: string;
  apiBaseUrl: string;
  encryptedApiKey?: string;
  modelName: string;
  modelType: ModelConfig["modelType"];
  enabled: boolean;
  capabilities: ModelCapabilities;
};

type ModelConfigRow = {
  id: string;
  provider_id?: string;
  provider: string;
  category?: ModelConfig["category"];
  display_name: string;
  api_base_url: string;
  encrypted_api_key?: string;
  model_name: string;
  model_type: ModelConfig["modelType"];
  enabled: number;
  capabilities_json: string;
};

function toInternal(row: ModelConfigRow): InternalAgentModelConfig {
  return {
    id: row.id,
    providerId: row.provider_id,
    provider: row.provider,
    category: row.category,
    displayName: row.display_name,
    apiBaseUrl: row.api_base_url,
    encryptedApiKey: row.encrypted_api_key,
    modelName: row.model_name,
    modelType: row.model_type,
    enabled: Boolean(row.enabled),
    capabilities: JSON.parse(row.capabilities_json) as ModelCapabilities
  };
}

export async function listEnabledTextAgentModels() {
  const db = await getDb();
  const rows = await db.all<ModelConfigRow[]>(
    `SELECT * FROM model_configs
     WHERE workspace_id = ? AND enabled = 1 AND (category = 'text' OR model_type = 'text')
     ORDER BY
       CASE
         WHEN provider_id = 'google' THEN 0
         WHEN provider_id = 'deepseek' AND model_name = 'deepseek-chat' THEN 1
         WHEN provider_id = 'deepseek' THEN 2
         ELSE 3
       END,
       updated_at DESC`,
    requireRequestContext().workspace.id
  );
  return rows.map(toInternal);
}

export async function getEnabledTextAgentModel(id?: string) {
  const models = await listEnabledTextAgentModels();
  if (!id) return models[0];
  return models.find((model) => model.id === id) ?? models[0];
}

export function decryptAgentModelKey(model: InternalAgentModelConfig) {
  return model.encryptedApiKey ? decryptApiKey(model.encryptedApiKey) : "";
}
