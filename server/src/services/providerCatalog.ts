export type ProviderCatalogItem = {
  id: "deepseek" | "openai" | "azure-openai" | "alibaba" | "google" | "kling" | "grok" | "seedance" | "minimax";
  name: string;
  displayName: string;
  defaultApiBaseUrl: string;
  requiresApiBaseUrl: boolean;
  apiKeyLabel: string;
  authType: "bearer" | "api-key" | "custom";
  categories: Array<"text" | "image" | "video">;
};

export const providerCatalog: ProviderCatalogItem[] = [
  {
    id: "deepseek",
    name: "DeepSeek",
    displayName: "DeepSeek",
    defaultApiBaseUrl: "https://api.deepseek.com",
    requiresApiBaseUrl: false,
    apiKeyLabel: "DeepSeek API Key",
    authType: "bearer",
    categories: ["text"]
  },
  {
    id: "openai",
    name: "OpenAI",
    displayName: "OpenAI / GPT Image",
    defaultApiBaseUrl: "https://api.openai.com/v1",
    requiresApiBaseUrl: false,
    apiKeyLabel: "OpenAI API Key",
    authType: "bearer",
    categories: ["image"]
  },
  {
    id: "azure-openai",
    name: "Azure OpenAI",
    displayName: "Azure OpenAI / Microsoft Foundry",
    defaultApiBaseUrl: "",
    requiresApiBaseUrl: true,
    apiKeyLabel: "Azure OpenAI API Key",
    authType: "api-key",
    categories: ["image"]
  },
  {
    id: "alibaba",
    name: "Alibaba",
    displayName: "阿里 / 通义 / 万相",
    defaultApiBaseUrl: "https://dashscope.aliyuncs.com/api/v1",
    requiresApiBaseUrl: false,
    apiKeyLabel: "阿里百炼 API Key",
    authType: "bearer",
    categories: ["image", "video"]
  },
  {
    id: "google",
    name: "Google",
    displayName: "谷歌 / Gemini",
    defaultApiBaseUrl: "https://generativelanguage.googleapis.com/v1beta",
    requiresApiBaseUrl: false,
    apiKeyLabel: "Google API Key",
    authType: "custom",
    categories: ["text", "image", "video"]
  },
  {
    id: "kling",
    name: "Kling",
    displayName: "可灵 / Kling",
    defaultApiBaseUrl: "https://api.klingai.com",
    requiresApiBaseUrl: false,
    apiKeyLabel: "AccessKey:SecretKey / 中转 Token",
    authType: "bearer",
    categories: ["video"]
  },
  {
    id: "grok",
    name: "Grok",
    displayName: "Grok 视频",
    defaultApiBaseUrl: "https://api.x.ai/v1",
    requiresApiBaseUrl: false,
    apiKeyLabel: "Grok API Key",
    authType: "bearer",
    categories: ["video"]
  },
  {
    id: "seedance",
    name: "Seedance",
    displayName: "Seedance / 火山方舟",
    defaultApiBaseUrl: "https://ark.cn-beijing.volces.com/api/v3",
    requiresApiBaseUrl: false,
    apiKeyLabel: "火山方舟 API Key",
    authType: "bearer",
    categories: ["video"]
  },
  {
    id: "minimax",
    name: "MiniMax",
    displayName: "MiniMax / Hailuo",
    defaultApiBaseUrl: "https://api.minimaxi.com/v1",
    requiresApiBaseUrl: false,
    apiKeyLabel: "MiniMax API Key / 中转 Token",
    authType: "bearer",
    categories: ["video"]
  }
];
