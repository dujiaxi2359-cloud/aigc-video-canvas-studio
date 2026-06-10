import type { ModelCapabilities, ModelCatalogItem } from "../types/model.js";

const googleBase = "https://generativelanguage.googleapis.com/v1beta";
const openaiBase = "https://api.openai.com/v1";
const alibabaBase = "https://dashscope.aliyuncs.com/api/v1";
const deepseekBase = "https://api.deepseek.com";
const klingBase = "https://api.klingai.com";
const grokBase = "https://api.x.ai/v1";
const seedanceBase = "https://ark.cn-beijing.volces.com/api/v3";

function model(input: Omit<ModelCatalogItem, "requiresApiKey">): ModelCatalogItem {
  return { ...input, requiresApiKey: true };
}

function text(id: string, providerId: "deepseek" | "google", name: string, displayName: string, contextWindow = 1048576) {
  return model({
    id,
    providerId,
    provider: providerId === "deepseek" ? "DeepSeek" : "谷歌 / Gemini",
    category: "text",
    modelType: "text",
    name,
    displayName,
    defaultApiBaseUrl: providerId === "deepseek" ? deepseekBase : googleBase,
    requiresApiBaseUrl: false,
    capabilities: { inputModes: ["text"], contextWindow }
  });
}

function image(
  id: string,
  providerId: "openai" | "azure-openai" | "alibaba" | "google",
  name: string,
  displayName: string,
  modelType: "text-to-image" | "image-edit",
  capabilities: ModelCapabilities
) {
  const provider = {
    openai: "OpenAI / GPT Image",
    "azure-openai": "Azure OpenAI / Microsoft Foundry",
    alibaba: "阿里 / 通义 / 万相",
    google: "谷歌 / Gemini"
  }[providerId];
  const base = { openai: openaiBase, "azure-openai": "", alibaba: alibabaBase, google: googleBase }[providerId];

  return model({
    id,
    providerId,
    provider,
    category: "image",
    modelType,
    name,
    displayName,
    defaultApiBaseUrl: base,
    requiresApiBaseUrl: providerId === "azure-openai",
    capabilities
  });
}

function video(
  id: string,
  providerId: "google" | "alibaba" | "kling" | "grok" | "seedance",
  name: string,
  displayName: string,
  modelType: "text-to-video" | "image-to-video" | "video-to-video",
  capabilities: ModelCapabilities
) {
  const provider = {
    google: "谷歌 / Gemini",
    alibaba: "阿里 / 通义 / 万相",
    kling: "可灵 / Kling",
    grok: "Grok 视频",
    seedance: "Seedance / 火山方舟"
  }[providerId];
  const base = { google: googleBase, alibaba: alibabaBase, kling: klingBase, grok: grokBase, seedance: seedanceBase }[providerId];

  return model({
    id,
    providerId,
    provider,
    category: "video",
    modelType,
    name,
    displayName,
    defaultApiBaseUrl: base,
    requiresApiBaseUrl: false,
    capabilities
  });
}

const imageRatios = ["1:1", "3:4", "4:3", "9:16", "16:9"];
const commonImageFormats = ["png", "jpeg", "webp"];
const wanRatios = ["16:9", "9:16", "1:1"];
const wanResolutions = ["720P", "1080P"];
const klingRatios = ["16:9", "9:16", "1:1"];

const googleImageCapabilities: ModelCapabilities = {
  inputModes: ["text-to-image", "image-to-image", "image-edit"],
  imageAspectRatios: imageRatios,
  imageSizes: ["1K", "2K", "4K"],
  imageQualities: ["auto", "standard", "high"],
  imageFormats: ["png"],
  supportsImageInput: true,
  supportsMultiImageInput: true,
  supportsMask: false
};

const gptImageCapabilities: ModelCapabilities = {
  inputModes: ["text-to-image", "image-to-image", "image-edit"],
  imageAspectRatios: imageRatios,
  imageQualities: ["auto", "low", "medium", "high"],
  imageFormats: commonImageFormats,
  supportsImageInput: true,
  supportsMultiImageInput: true,
  supportsMask: true
};

const qwenImageCapabilities: ModelCapabilities = {
  inputModes: ["text-to-image"],
  imageAspectRatios: imageRatios,
  imageQualities: ["standard", "high"],
  imageFormats: ["png"],
  supportsImageInput: false,
  supportsMultiImageInput: false,
  supportsMask: false
};

const qwenEditCapabilities: ModelCapabilities = {
  inputModes: ["image-to-image", "image-edit"],
  imageAspectRatios: imageRatios,
  imageQualities: ["standard", "high"],
  imageFormats: ["png"],
  supportsImageInput: true,
  supportsMultiImageInput: true,
  supportsMask: false
};

const veo31Capabilities: ModelCapabilities = {
  inputModes: ["text-to-video", "image-to-video", "video-to-video", "reference-to-video", "first-last-frame"],
  duration: { type: "enum", values: [4, 6, 8] },
  aspectRatios: ["16:9", "9:16"],
  resolutions: ["720p", "1080p", "4k"],
  supportsReferenceImage: true,
  supportsFirstLastFrame: true,
  supportsVideoInput: true,
  supportsAudio: true,
  constraints: [
    { when: { resolution: ["1080p", "4k"] }, forceDuration: 8, reason: "Veo 3.1 在 1080p / 4k 下固定为 8 秒" },
    { when: { inputMode: ["reference-to-video"] }, forceDuration: 8, reason: "Veo 3.1 使用参考图时固定为 8 秒" }
  ]
};

const rawModelCatalog: ModelCatalogItem[] = [
  text("deepseek-chat", "deepseek", "deepseek-chat", "DeepSeek Chat", 64000),
  text("deepseek-reasoner", "deepseek", "deepseek-reasoner", "DeepSeek Reasoner", 64000),
  text("google-gemini-3-1-pro-preview", "google", "gemini-3.1-pro-preview", "Gemini 3.1 Pro Preview"),
  text("google-gemini-3-5-flash", "google", "gemini-3.5-flash", "Gemini 3.5 Flash"),
  text("google-gemini-3-flash-preview", "google", "gemini-3-flash-preview", "Gemini 3 Flash Preview"),
  text("google-gemini-3-1-flash-lite-preview", "google", "gemini-3.1-flash-lite-preview", "Gemini 3.1 Flash-Lite Preview"),
  text("google-gemini-2-5-flash", "google", "gemini-2.5-flash", "Gemini 2.5 Flash"),

  image("google-nano-banana-2", "google", "gemini-3.1-flash-image-preview", "Nano Banana 2", "text-to-image", googleImageCapabilities),
  image("google-nano-banana-pro", "google", "gemini-3-pro-image-preview", "Nano Banana Pro", "text-to-image", googleImageCapabilities),
  image("google-nano-banana", "google", "gemini-2.5-flash-image", "Nano Banana", "text-to-image", {
    ...googleImageCapabilities,
    imageSizes: ["1K"],
    imageQualities: ["auto", "standard"]
  }),
  image("google-imagen-4", "google", "imagen-4", "Imagen 4", "text-to-image", {
    inputModes: ["text-to-image"],
    imageAspectRatios: imageRatios,
    imageSizes: ["1K", "2K"],
    imageQualities: ["auto", "standard", "high"],
    imageFormats: ["png"],
    supportsImageInput: false,
    supportsMultiImageInput: false,
    supportsMask: false
  }),

  image("openai-gpt-image-2", "openai", "gpt-image-2", "GPT Image 2", "text-to-image", gptImageCapabilities),
  image("openai-gpt-image-1-5", "openai", "gpt-image-1.5", "GPT Image 1.5", "text-to-image", gptImageCapabilities),
  image("openai-gpt-image-1", "openai", "gpt-image-1", "GPT Image 1", "text-to-image", gptImageCapabilities),
  image("openai-gpt-image-1-mini", "openai", "gpt-image-1-mini", "GPT Image 1 Mini", "text-to-image", gptImageCapabilities),
  image("azure-gpt-image-2", "azure-openai", "gpt-image-2", "Azure GPT Image 2", "text-to-image", gptImageCapabilities),

  image("alibaba-qwen-image-2-pro", "alibaba", "qwen-image-2.0-pro", "Qwen Image 2.0 Pro", "text-to-image", qwenImageCapabilities),
  image("alibaba-qwen-image-edit-plus", "alibaba", "qwen-image-edit-plus", "Qwen Image Edit Plus", "image-edit", qwenEditCapabilities),
  image("alibaba-qwen-image-edit-max", "alibaba", "qwen-image-edit-max", "Qwen Image Edit Max", "image-edit", qwenEditCapabilities),
  image("alibaba-qwen-image", "alibaba", "qwen-image", "Qwen Image", "text-to-image", qwenImageCapabilities),
  image("alibaba-qwen-image-edit", "alibaba", "qwen-image-edit", "Qwen Image Edit", "image-edit", qwenEditCapabilities),

  video("google-veo-3-1", "google", "veo-3.1-generate-preview", "Veo 3.1", "text-to-video", veo31Capabilities),
  video("google-veo-3-1-fast", "google", "veo-3.1-fast-generate-preview", "Veo 3.1 Fast", "text-to-video", {
    ...veo31Capabilities,
    constraints: [
      { when: { resolution: ["1080p", "4k"] }, forceDuration: 8, reason: "Veo 3.1 Fast 在 1080p / 4k 下固定为 8 秒" },
      { when: { inputMode: ["reference-to-video"] }, forceDuration: 8, reason: "Veo 3.1 Fast 使用参考图时固定为 8 秒" }
    ]
  }),
  video("google-veo-3-1-lite", "google", "veo-3.1-lite-generate-preview", "Veo 3.1 Lite", "text-to-video", {
    inputModes: ["text-to-video", "image-to-video", "first-last-frame"],
    duration: { type: "enum", values: [4, 6, 8] },
    aspectRatios: ["16:9", "9:16"],
    resolutions: ["720p", "1080p"],
    supportsFirstLastFrame: true,
    supportsReferenceImage: false,
    supportsAudio: true,
    constraints: [{ when: { resolution: ["1080p"] }, forceDuration: 8, reason: "Veo 3.1 Lite 在 1080p 下固定为 8 秒" }]
  }),
  video("google-veo-3", "google", "veo-3-generate-preview", "Veo 3", "text-to-video", {
    inputModes: ["text-to-video", "image-to-video"],
    duration: { type: "fixed", value: 8 },
    aspectRatios: ["16:9", "9:16"],
    resolutions: ["720p", "1080p"],
    supportsReferenceImage: true,
    supportsAudio: true
  }),
  video("google-veo-2", "google", "veo-2.0-generate-001", "Veo 2", "text-to-video", {
    inputModes: ["text-to-video", "image-to-video"],
    duration: { type: "range", min: 5, max: 8, step: 1 },
    aspectRatios: ["16:9", "9:16"],
    resolutions: ["720p"],
    supportsReferenceImage: true,
    supportsAudio: false
  }),
  video("google-omni-flash-10s", "google", "omni_flash-10s", "Google Omni Flash 10s", "text-to-video", {
    inputModes: ["text-to-video", "image-to-video", "reference-to-video"],
    duration: { type: "fixed", value: 10 },
    aspectRatios: ["16:9", "9:16"],
    resolutions: ["720p"],
    supportsReferenceImage: true,
    supportsMultiImageInput: true,
    supportsVideoInput: false,
    supportsAudio: false
  }),

  video("alibaba-wan-2-7-t2v", "alibaba", "wan2.7-t2v", "Wan 2.7 文生视频", "text-to-video", { duration: { type: "range", min: 2, max: 15, step: 1 }, aspectRatios: wanRatios, resolutions: wanResolutions, inputModes: ["text-to-video"] }),
  video("alibaba-wan-2-7-i2v", "alibaba", "wan2.7-i2v", "Wan 2.7 图生视频", "image-to-video", { duration: { type: "range", min: 2, max: 15, step: 1 }, aspectRatios: wanRatios, resolutions: wanResolutions, inputModes: ["image-to-video", "first-last-frame", "reference-to-video"], supportsReferenceImage: true, supportsFirstLastFrame: true }),
  video("alibaba-wan-2-6-t2v", "alibaba", "wan2.6-t2v", "Wan 2.6 文生视频", "text-to-video", { duration: { type: "range", min: 2, max: 15, step: 1 }, aspectRatios: wanRatios, resolutions: wanResolutions, inputModes: ["text-to-video"] }),
  video("alibaba-wan-2-6-i2v", "alibaba", "wan2.6-i2v", "Wan 2.6 图生视频", "image-to-video", { duration: { type: "range", min: 2, max: 15, step: 1 }, aspectRatios: wanRatios, resolutions: wanResolutions, inputModes: ["image-to-video", "first-last-frame", "reference-to-video"], supportsReferenceImage: true, supportsFirstLastFrame: true }),
  video("alibaba-wan-2-5-t2v", "alibaba", "wan2.5-t2v", "Wan 2.5 文生视频", "text-to-video", { duration: { type: "enum", values: [5, 10] }, aspectRatios: wanRatios, resolutions: ["480P", "720P", "1080P"], inputModes: ["text-to-video"] }),
  video("alibaba-wan-2-5-i2v", "alibaba", "wan2.5-i2v", "Wan 2.5 图生视频", "image-to-video", { duration: { type: "enum", values: [5, 10] }, aspectRatios: wanRatios, resolutions: ["480P", "720P", "1080P"], inputModes: ["image-to-video", "first-last-frame"], supportsFirstLastFrame: true }),

  video("kling-3-0", "kling", "kling-v3-omni", "可灵 Kling 3.0 Omni", "text-to-video", { inputModes: ["text-to-video", "image-to-video", "first-last-frame", "reference-to-video"], duration: { type: "enum", values: [5, 10, 15] }, aspectRatios: klingRatios, resolutions: ["720P", "1080P"], supportsReferenceImage: true, supportsMultiImageInput: true, supportsFirstLastFrame: true, supportsMotionControl: true, supportsCameraControl: true }),
  video("kling-2-6", "kling", "kling-v2-6", "可灵 Kling 2.6", "text-to-video", { inputModes: ["text-to-video", "image-to-video", "first-last-frame", "reference-to-video"], duration: { type: "enum", values: [5, 10, 15] }, aspectRatios: klingRatios, resolutions: ["720P", "1080P"], supportsReferenceImage: true, supportsMultiImageInput: true, supportsFirstLastFrame: true, supportsMotionControl: true, supportsCameraControl: true }),
  video("kling-2-5", "kling", "kling-v2-5-turbo", "可灵 Kling 2.5 Turbo", "text-to-video", { inputModes: ["text-to-video", "image-to-video", "first-last-frame"], duration: { type: "enum", values: [5, 10] }, aspectRatios: klingRatios, resolutions: ["720P", "1080P"], supportsFirstLastFrame: true, supportsMotionControl: true, supportsCameraControl: true }),
  video("kling-2-1-master", "kling", "kling-v2-1-master", "可灵 Kling 2.1 Master", "text-to-video", { inputModes: ["text-to-video", "image-to-video", "first-last-frame", "reference-to-video"], duration: { type: "enum", values: [5, 10, 15] }, aspectRatios: klingRatios, resolutions: ["720P", "1080P"], supportsReferenceImage: true, supportsMultiImageInput: true, supportsFirstLastFrame: true, supportsMotionControl: true, supportsCameraControl: true }),
  video("kling-2-1", "kling", "kling-v2-1", "可灵 Kling 2.1", "text-to-video", { inputModes: ["text-to-video", "image-to-video", "first-last-frame", "reference-to-video"], duration: { type: "enum", values: [5, 10, 15] }, aspectRatios: klingRatios, resolutions: ["720P", "1080P"], supportsReferenceImage: true, supportsMultiImageInput: true, supportsFirstLastFrame: true, supportsMotionControl: true, supportsCameraControl: true }),
  video("kling-2-master", "kling", "kling-v2-master", "可灵 Kling 2.0 Master", "text-to-video", { inputModes: ["text-to-video", "image-to-video", "first-last-frame", "reference-to-video"], duration: { type: "enum", values: [5, 10, 15] }, aspectRatios: klingRatios, resolutions: ["720P", "1080P"], supportsReferenceImage: true, supportsMultiImageInput: true, supportsFirstLastFrame: true, supportsMotionControl: true, supportsCameraControl: true }),
  video("kling-1-6", "kling", "kling-v1-6", "可灵 Kling 1.6", "text-to-video", { inputModes: ["text-to-video", "image-to-video", "first-last-frame", "reference-to-video"], duration: { type: "enum", values: [5, 10] }, aspectRatios: klingRatios, resolutions: ["720P", "1080P"], supportsReferenceImage: true, supportsMultiImageInput: true, supportsFirstLastFrame: true, supportsMotionControl: true, supportsCameraControl: true }),
  video("kling-1-5", "kling", "kling-v1-5", "可灵 Kling 1.5", "text-to-video", { inputModes: ["text-to-video", "image-to-video", "first-last-frame"], duration: { type: "enum", values: [5, 10] }, aspectRatios: klingRatios, resolutions: ["720P", "1080P"], supportsFirstLastFrame: true, supportsMotionControl: true, supportsCameraControl: true }),
  video("kling-1", "kling", "kling-v1", "可灵 Kling 1.0", "text-to-video", { inputModes: ["text-to-video", "image-to-video", "first-last-frame"], duration: { type: "enum", values: [5, 10] }, aspectRatios: klingRatios, resolutions: ["720P", "1080P"], supportsFirstLastFrame: true, supportsMotionControl: true, supportsCameraControl: true }),

  video("grok-imagine-video", "grok", "grok-imagine-video", "Grok Imagine Video", "text-to-video", { inputModes: ["text-to-video", "image-to-video", "reference-to-video", "video-to-video"], duration: { type: "range", min: 1, max: 15, step: 1 }, aspectRatios: ["16:9", "9:16", "1:1", "2:3", "3:2", "3:4", "4:3"], resolutions: ["480p", "720p"], supportsReferenceImage: true, supportsMultiImageInput: true, supportsVideoInput: true, supportsAudio: true }),

  video("seedance-2-0", "seedance", "seedance-2.0", "Seedance 2.0", "text-to-video", { inputModes: ["text-to-video", "image-to-video", "reference-to-video", "video-to-video"], duration: { type: "range", min: 2, max: 15, step: 1 }, aspectRatios: ["16:9", "9:16", "1:1"], resolutions: ["720P", "1080P"], supportsReferenceImage: true, supportsVideoInput: true, supportsCameraControl: true }),
  video("seedance-1-5-pro", "seedance", "seedance-1.5-pro", "Seedance 1.5 Pro", "text-to-video", { inputModes: ["text-to-video", "image-to-video", "reference-to-video"], duration: { type: "enum", values: [5, 10, 15] }, aspectRatios: ["16:9", "9:16", "1:1"], resolutions: ["720P", "1080P"], supportsReferenceImage: true, supportsCameraControl: true }),
  video("seedance-1-0-pro", "seedance", "seedance-1.0-pro", "Seedance 1.0 Pro", "text-to-video", { inputModes: ["text-to-video", "image-to-video"], duration: { type: "enum", values: [5, 10] }, aspectRatios: ["16:9", "9:16", "1:1"], resolutions: ["720P", "1080P"] })
];

const hiddenLegacyVideoModelIds = new Set([
  "alibaba-wan-2-7-t2v",
  "alibaba-wan-2-7-i2v",
  "alibaba-wan-2-6-t2v",
  "alibaba-wan-2-6-i2v",
  "alibaba-wan-2-5-t2v",
  "alibaba-wan-2-5-i2v"
]);

export const modelCatalog: ModelCatalogItem[] = [
  ...rawModelCatalog.filter((item) => !hiddenLegacyVideoModelIds.has(item.id)),
  video("alibaba-happyhorse-1-0-t2v", "alibaba", "happyhorse-1.0-t2v", "HappyHorse 1.0 文生视频", "text-to-video", {
    duration: { type: "range", min: 3, max: 15, step: 1 },
    aspectRatios: ["16:9", "9:16"],
    resolutions: wanResolutions,
    inputModes: ["text-to-video"],
    supportsNegativePrompt: true,
    supportsSeed: true
  }),
  video("alibaba-wan-2-7-i2v-official", "alibaba", "wan2.7-i2v-2026-04-25", "Wan 2.7 图生视频", "image-to-video", {
    duration: { type: "range", min: 2, max: 15, step: 1 },
    aspectRatios: ["16:9", "9:16"],
    resolutions: wanResolutions,
    inputModes: ["image-to-video", "first-last-frame", "video-to-video"],
    supportsFirstLastFrame: true,
    supportsVideoInput: true,
    supportsAudio: true,
    supportsSeed: true
  }),
  video("alibaba-wan-2-7-videoedit", "alibaba", "wan2.7-videoedit", "Wan 2.7 视频编辑", "video-to-video", {
    duration: { type: "range", min: 2, max: 10, step: 1 },
    aspectRatios: ["16:9", "9:16"],
    resolutions: wanResolutions,
    inputModes: ["video-to-video"],
    supportsVideoInput: true,
    supportsSeed: true
  })
,
  video("alibaba-wan-2-7-t2v-official", "alibaba", "wan2.7-t2v-2026-04-25", "Wan 2.7 文生视频 2026-04-25", "text-to-video", {
    duration: { type: "range", min: 2, max: 15, step: 1 },
    aspectRatios: ["16:9", "9:16"],
    resolutions: wanResolutions,
    inputModes: ["text-to-video"],
    supportsNegativePrompt: true,
    supportsSeed: true
  }),
  video("alibaba-happyhorse-1-0-i2v", "alibaba", "happyhorse-1.0-i2v", "HappyHorse 1.0 图生视频", "image-to-video", {
    duration: { type: "range", min: 3, max: 15, step: 1 },
    aspectRatios: ["16:9", "9:16"],
    resolutions: wanResolutions,
    inputModes: ["image-to-video"],
    supportsSeed: true
  }),
  video("alibaba-happyhorse-1-0-r2v", "alibaba", "happyhorse-1.0-r2v", "HappyHorse 1.0 参考生视频", "image-to-video", {
    duration: { type: "range", min: 3, max: 15, step: 1 },
    aspectRatios: ["16:9", "9:16"],
    resolutions: wanResolutions,
    inputModes: ["reference-to-video"],
    supportsReferenceImage: true,
    supportsSeed: true
  }),
  video("alibaba-wan-2-7-r2v", "alibaba", "wan2.7-r2v", "Wan 2.7 参考生视频", "image-to-video", {
    duration: { type: "range", min: 2, max: 15, step: 1 },
    aspectRatios: ["16:9", "9:16"],
    resolutions: wanResolutions,
    inputModes: ["reference-to-video", "video-to-video"],
    supportsReferenceImage: true,
    supportsVideoInput: true,
    supportsSeed: true
  }),
  video("alibaba-happyhorse-1-0-video-edit", "alibaba", "happyhorse-1.0-video-edit", "HappyHorse 1.0 视频编辑", "video-to-video", {
    duration: { type: "range", min: 2, max: 10, step: 1 },
    aspectRatios: ["16:9", "9:16"],
    resolutions: wanResolutions,
    inputModes: ["video-to-video"],
    supportsVideoInput: true,
    supportsSeed: true
  })
];

export function defaultCapabilities() {
  return {
    duration: { type: "enum" as const, values: [5] },
    aspectRatios: ["16:9"],
    resolutions: ["720P"],
    inputModes: ["text-to-video" as const]
  };
}
