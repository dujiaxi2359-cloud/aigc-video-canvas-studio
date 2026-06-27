import type { ModelConfig } from "../types/model";

function modelIdentity(model: ModelConfig) {
  return `${model.providerId ?? ""} ${model.provider ?? ""} ${model.displayName ?? ""} ${model.modelName ?? ""}`.toLowerCase();
}

function hasConfiguredEndpoint(model: ModelConfig) {
  if (!model.requiresApiBaseUrl) return true;
  return Boolean(model.apiBaseUrl?.trim());
}

function hasConfiguredCredential(model: ModelConfig) {
  return Boolean(model.maskedApiKey?.trim());
}

export function modelMissingReadyReason(model: ModelConfig) {
  if (!model.enabled) return "模型已停用。";
  if (!model.modelName?.trim()) return "模型缺少上游模型名。";
  if (!hasConfiguredEndpoint(model)) return "模型缺少 endpoint。";
  if (!hasConfiguredCredential(model)) return "模型缺少 API Key。";
  if (/midjourney|mj/.test(modelIdentity(model)) && !model.apiBaseUrl?.trim()) return "Midjourney 缺少 endpoint。";
  return undefined;
}

export function isCanvasReadyModel(model: ModelConfig) {
  return !modelMissingReadyReason(model);
}

