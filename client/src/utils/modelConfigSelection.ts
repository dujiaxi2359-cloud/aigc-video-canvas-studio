import type { ModelConfig } from "../types/model";

function normalizeKey(value: string) {
  return value.trim().toLowerCase().replace(/\s+/g, " ");
}

function normalizeBaseUrl(value?: string) {
  return (value ?? "").trim().toLowerCase().replace(/\/+$/g, "");
}

function channelKey(model: ModelConfig) {
  const baseUrl = normalizeBaseUrl(model.apiBaseUrl);
  if (baseUrl) return `base:${baseUrl}`;
  return `provider:${normalizeKey(model.providerId || model.provider || "unknown")}`;
}

export function modelConfigSelectionKey(model: ModelConfig) {
  const officialModel = model.capabilities?.modelCapability?.model;
  if (officialModel) return `official:${normalizeKey(officialModel)}:${channelKey(model)}`;
  if (model.displayName) return `display:${normalizeKey(model.displayName)}:${channelKey(model)}`;
  return `raw:${normalizeKey(model.modelName || model.id)}:${channelKey(model)}`;
}

function selectionPriority(model: ModelConfig) {
  const channel = { ...model.capabilities, ...model.capabilities.channelCapability };
  const inputs = channel.supportedInputs ?? [];
  const identity = `${model.modelName} ${model.displayName}`.toLowerCase();
  let score = 0;
  if (inputs.some((input) => ["image", "first_frame", "reference_image", "first_last_frame"].includes(input))) score += 100;
  if (channel.imageTransport && channel.imageTransport !== "unsupported") score += 50;
  if (/(?:^|[-_])ref(?:$|[-_])/.test(identity)) score += 20;
  if (/(?:^|[-_])audio(?:$|[-_])/.test(identity)) score += 10;
  if (/(?:^|[-_])noref(?:$|[-_])/.test(identity)) score -= 100;
  if (/(?:^|[-_])mute(?:$|[-_])/.test(identity)) score -= 5;
  return score;
}

export function dedupeModelConfigsForSelect(models: ModelConfig[]) {
  const sorted = [...models].sort((left, right) => {
    const priority = selectionPriority(right) - selectionPriority(left);
    return priority || (right.updatedAt ?? 0) - (left.updatedAt ?? 0);
  });
  const seen = new Set<string>();
  const result: ModelConfig[] = [];
  for (const model of sorted) {
    const key = modelConfigSelectionKey(model);
    if (seen.has(key)) continue;
    seen.add(key);
    result.push(model);
  }
  return result;
}

export function findCanonicalModelConfig(models: ModelConfig[], selectedId?: string) {
  if (!selectedId) return undefined;
  const selected = models.find((model) => model.id === selectedId);
  if (!selected) return undefined;
  const key = modelConfigSelectionKey(selected);
  return dedupeModelConfigsForSelect(models).find((model) => modelConfigSelectionKey(model) === key);
}
