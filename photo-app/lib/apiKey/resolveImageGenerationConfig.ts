import type { ApiProvider, UserApiKeyConfig } from "@/lib/apiKey/apiKeyTypes";
import {
  defaultAzureApiVersion,
  defaultGoogleBananaModel,
  defaultImageModel,
  isLegacyDallEModel,
} from "@/lib/apiKey/userApiKey";
import {
  normalizeAzureEndpoint,
  normalizeOpenAICompatibleBaseURL,
  parseAzureEndpoint,
} from "@/lib/apiKey/openaiClientFromRequest";

export type ResolvedImageGenerationConfig = UserApiKeyConfig & {
  provider: ApiProvider;
  providerLabel: "OpenAI Compatible" | "Azure OpenAI" | "Google Banana";
  imageModel: string;
};

function normalizeProvider(value?: ApiProvider): ApiProvider {
  if (value === "azure" || value === "azure-openai") return "azure-openai";
  if (value === "banana" || value === "google-banana") return "google-banana";
  return "openai-compatible";
}

function requireModel(model: string, provider: string) {
  const trimmed = model.trim();
  if (!trimmed) {
    throw new Error(`${provider} Image Model 缺失：请在设置中心填写当前接口支持的图片模型，例如 ${defaultImageModel}。`);
  }
  if (isLegacyDallEModel(trimmed)) {
    throw new Error(`当前模型 ${trimmed} 没有可用通道，请在设置中心更换为 ${defaultImageModel} 或当前接口支持的模型。`);
  }
  if (trimmed.toLowerCase() === "auto") {
    throw new Error("当前模型/通道不能使用 auto。请在设置中心明确填写可用的 Image Model。");
  }
  return trimmed;
}

function firstUsableOpenAIImageModel(...models: Array<string | undefined>) {
  for (const model of models) {
    const trimmed = model?.trim() || "";
    if (!trimmed) continue;
    if (isLegacyDallEModel(trimmed)) continue;
    if (trimmed.toLowerCase() === "auto") continue;
    return trimmed;
  }
  return defaultImageModel;
}

export function resolveImageGenerationConfig(config: UserApiKeyConfig): ResolvedImageGenerationConfig {
  const provider = normalizeProvider(config.provider);
  const apiKey = config.apiKey?.trim() || "";

  if (!apiKey) {
    throw new Error("API Key 缺失：请打开设置中心填写客户自己的 API Key。");
  }

  if (provider === "azure-openai") {
    const parsed = parseAzureEndpoint(config.azureEndpoint || config.baseURL);
    const endpoint = normalizeAzureEndpoint(config.azureEndpoint || config.baseURL);
    const azureDeployment = requireModel(config.azureDeployment?.trim() || parsed.deployment || "", "Azure OpenAI");
    const azureApiVersion = config.azureApiVersion?.trim() || parsed.apiVersion || defaultAzureApiVersion;

    if (!endpoint) {
      throw new Error("Azure Endpoint 缺失：请填写 Azure OpenAI Endpoint。");
    }
    if (!azureApiVersion) {
      throw new Error("Azure API Version 缺失：请填写 API Version。");
    }

    return {
      ...config,
      provider,
      providerLabel: "Azure OpenAI",
      apiKey,
      azureEndpoint: endpoint,
      azureDeployment,
      azureApiVersion,
      imageModel: azureDeployment,
    };
  }

  if (provider === "google-banana") {
    const baseURL = normalizeOpenAICompatibleBaseURL(config.baseURL);
    const googleBananaModel = requireModel(
      config.googleBananaModel?.trim() || config.imageModel?.trim() || config.azureDeployment?.trim() || defaultGoogleBananaModel,
      "Banana",
    );

    if (!baseURL) {
      throw new Error("Banana Base URL 缺失：请填写 Banana 接口地址，或在服务器配置 GOOGLE_BANANA_BASE_URL。");
    }

    return {
      ...config,
      provider,
      providerLabel: "Google Banana",
      apiKey,
      baseURL,
      googleBananaModel,
      imageModel: googleBananaModel,
    };
  }

  const baseURL = normalizeOpenAICompatibleBaseURL(config.baseURL);
  const imageModel = requireModel(
    firstUsableOpenAIImageModel(
      config.imageModel,
      config.azureDeployment,
      process.env.OPENAI_IMAGE_MODEL,
      defaultImageModel,
    ),
    "OpenAI",
  );

  return {
    ...config,
    provider,
    providerLabel: "OpenAI Compatible",
    apiKey,
    baseURL,
    imageModel,
    azureDeployment: imageModel,
  };
}
