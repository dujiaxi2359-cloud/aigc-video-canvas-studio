import type { ApiProvider, UserApiKeyConfig } from "@/lib/apiKey/apiKeyTypes";

export const userApiKeyStorageKey = "commerce_ai_api_key";
export const userBaseURLStorageKey = "commerce_ai_base_url";
export const userApiProviderStorageKey = "commerce_ai_api_provider";
export const userApiConfigVersionStorageKey = "commerce_ai_api_config_version";
export const userApiConfigMigratedStorageKey = "commerce_ai_api_config_migrated";
export const userTextModelStorageKey = "commerce_ai_text_model";
export const userImageModelStorageKey = "commerce_ai_image_model";
export const userGoogleBananaModelStorageKey = "commerce_ai_google_banana_model";
export const userAzureEndpointStorageKey = "commerce_ai_azure_endpoint";
export const userAzureDeploymentStorageKey = "commerce_ai_azure_deployment";
export const userAzureApiVersionStorageKey = "commerce_ai_azure_api_version";

export const currentApiConfigVersion = "3";
export const defaultImageModel = "gpt-image-2";
export const defaultGoogleBananaModel = "banana-pro";
export const defaultAzureApiVersion = "2025-04-01-preview";

const legacyModelStorageKeys = [
  "commerce_ai_model",
  "commerce_ai_selected_model",
  "commerce_ai_selected_image_model",
  "selectedImageModel",
  "defaultImageModel",
  "imageModel",
  "commerce_ai_group",
  "commerce_ai_channel",
  "commerce_ai_distributor",
  "group",
  "channel",
  "distributor",
];

function normalizeProvider(value: string | null): ApiProvider {
  if (value === "azure" || value === "azure-openai") return "azure";
  if (value === "banana" || value === "google-banana") return "banana";
  return "openai";
}

export function isLegacyDallEModel(value?: string | null) {
  return /^dall[\s_-]*e(?:[\s_-]*\d+)?$/i.test((value || "").trim());
}

function normalizeImageModel(value?: string | null) {
  const trimmed = (value || "").trim();
  if (!trimmed || isLegacyDallEModel(trimmed) || isAutoRoutingValue(trimmed)) return "";
  return trimmed;
}

function readLegacyImageModel() {
  for (const key of legacyModelStorageKeys) {
    const value = localStorage.getItem(key);
    if (value) return value;
  }
  return "";
}

function removeLegacyModelStorage() {
  for (const key of legacyModelStorageKeys) {
    localStorage.removeItem(key);
  }
}

function isAutoRoutingValue(value?: string | null) {
  return (value || "").trim().toLowerCase() === "auto";
}

function migrateApiConfigIfNeeded() {
  const version = localStorage.getItem(userApiConfigVersionStorageKey);
  const storedImageModel = localStorage.getItem(userImageModelStorageKey);
  const legacyImageModel = readLegacyImageModel();
  const shouldMigrate =
    version !== currentApiConfigVersion ||
    isLegacyDallEModel(storedImageModel) ||
    isLegacyDallEModel(legacyImageModel) ||
    Boolean(legacyImageModel) ||
    legacyModelStorageKeys.some((key) => isAutoRoutingValue(localStorage.getItem(key)));

  if (!shouldMigrate) {
    return { migrated: false, legacyModel: "" };
  }

  const legacyModel = storedImageModel || legacyImageModel || "";
  const hadInvalidModel =
    isLegacyDallEModel(storedImageModel) ||
    isLegacyDallEModel(legacyImageModel) ||
    isAutoRoutingValue(storedImageModel) ||
    isAutoRoutingValue(legacyImageModel) ||
    legacyModelStorageKeys.some((key) => isAutoRoutingValue(localStorage.getItem(key)));

  if (!storedImageModel || hadInvalidModel) {
    localStorage.removeItem(userImageModelStorageKey);
  }
  const azureDeployment = localStorage.getItem(userAzureDeploymentStorageKey);
  if (!azureDeployment || isLegacyDallEModel(azureDeployment) || isAutoRoutingValue(azureDeployment)) {
    localStorage.removeItem(userAzureDeploymentStorageKey);
  }
  removeLegacyModelStorage();
  localStorage.setItem(userApiConfigVersionStorageKey, currentApiConfigVersion);
  localStorage.setItem(
    userApiConfigMigratedStorageKey,
    hadInvalidModel
      ? `检测到旧图片模型或 auto 通道配置 ${legacyModel || "auto"}，已清理本机模型缓存。请在设置中心重新填写 Image Model，例如 ${defaultImageModel}，并测试连接。`
      : `检测到旧版本机接口配置，已升级为版本 ${currentApiConfigVersion}。请在设置中心重新确认模型配置。`,
  );

  return { migrated: true, legacyModel };
}

export function saveUserApiKey(config: UserApiKeyConfig) {
  localStorage.setItem(userApiConfigVersionStorageKey, currentApiConfigVersion);
  localStorage.setItem(userApiProviderStorageKey, config.provider);
  localStorage.setItem(userApiKeyStorageKey, config.apiKey.trim());
  localStorage.setItem(userBaseURLStorageKey, (config.baseURL || "").trim());
  localStorage.setItem(userTextModelStorageKey, (config.textModel || "").trim());
  localStorage.setItem(userImageModelStorageKey, normalizeImageModel(config.imageModel));
  localStorage.setItem(userGoogleBananaModelStorageKey, (config.googleBananaModel || defaultGoogleBananaModel).trim());
  localStorage.setItem(userAzureEndpointStorageKey, (config.azureEndpoint || "").trim());
  localStorage.setItem(userAzureDeploymentStorageKey, normalizeImageModel(config.azureDeployment || config.imageModel || config.googleBananaModel));
  localStorage.setItem(userAzureApiVersionStorageKey, (config.azureApiVersion || defaultAzureApiVersion).trim());
  removeLegacyModelStorage();
}

export function loadUserApiKey(): UserApiKeyConfig {
  migrateApiConfigIfNeeded();

  return {
    provider: normalizeProvider(localStorage.getItem(userApiProviderStorageKey)),
    apiKey: localStorage.getItem(userApiKeyStorageKey) || "",
    baseURL: localStorage.getItem(userBaseURLStorageKey) || "",
    textModel: localStorage.getItem(userTextModelStorageKey) || "",
    imageModel: normalizeImageModel(localStorage.getItem(userImageModelStorageKey)),
    googleBananaModel: localStorage.getItem(userGoogleBananaModelStorageKey) || defaultGoogleBananaModel,
    azureEndpoint: localStorage.getItem(userAzureEndpointStorageKey) || "",
    azureDeployment: normalizeImageModel(localStorage.getItem(userAzureDeploymentStorageKey)),
    azureApiVersion: localStorage.getItem(userAzureApiVersionStorageKey) || defaultAzureApiVersion,
  };
}

export function clearUserApiKey() {
  localStorage.removeItem(userApiConfigVersionStorageKey);
  localStorage.removeItem(userApiConfigMigratedStorageKey);
  localStorage.removeItem(userApiProviderStorageKey);
  localStorage.removeItem(userApiKeyStorageKey);
  localStorage.removeItem(userBaseURLStorageKey);
  localStorage.removeItem(userTextModelStorageKey);
  localStorage.removeItem(userImageModelStorageKey);
  localStorage.removeItem(userGoogleBananaModelStorageKey);
  localStorage.removeItem(userAzureEndpointStorageKey);
  localStorage.removeItem(userAzureDeploymentStorageKey);
  localStorage.removeItem(userAzureApiVersionStorageKey);
  removeLegacyModelStorage();
}
