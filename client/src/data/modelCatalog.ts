import type { ModelCapabilities, ModelCatalogItem } from "../types/model";

const googleBase = "https://generativelanguage.googleapis.com/v1beta";
const openaiBase = "https://api.openai.com/v1";
const alibabaBase = "https://dashscope.aliyuncs.com/api/v1";
const deepseekBase = "https://api.deepseek.com";
const grokBase = "https://api.x.ai/v1";

function item(partial: Omit<ModelCatalogItem, "requiresApiKey">): ModelCatalogItem {
  return { ...partial, requiresApiKey: true };
}

function textModel(id: string, providerId: "deepseek" | "google", name: string, displayName: string, contextWindow = 64000): ModelCatalogItem {
  return item({
    id,
    providerId,
    provider: providerId === "deepseek" ? "DeepSeek" : "Google / Gemini",
    category: "text",
    modelType: "text",
    name,
    displayName,
    defaultApiBaseUrl: providerId === "deepseek" ? deepseekBase : googleBase,
    requiresApiBaseUrl: false,
    capabilities: { inputModes: ["text"], contextWindow }
  });
}

function imageModel(
  id: string,
  providerId: "google" | "openai" | "azure-openai" | "alibaba",
  name: string,
  displayName: string,
  modelType: "text-to-image" | "image-edit",
  capabilities: ModelCapabilities
): ModelCatalogItem {
  const providerMap = {
    google: "Google / Gemini",
    openai: "GPT / OpenAI",
    "azure-openai": "Azure OpenAI / Microsoft Foundry",
    alibaba: "Alibaba / Tongyi / Wanxiang"
  } as const;
  const baseMap = { google: googleBase, openai: openaiBase, "azure-openai": "", alibaba: alibabaBase } as const;

  return item({
    id,
    providerId,
    provider: providerMap[providerId],
    category: "image",
    modelType,
    name,
    displayName,
    defaultApiBaseUrl: baseMap[providerId],
    requiresApiBaseUrl: providerId === "azure-openai",
    capabilities
  });
}

function videoModel(
  id: string,
  providerId: "google" | "alibaba" | "kling" | "grok" | "seedance",
  name: string,
  displayName: string,
  modelType: "text-to-video" | "image-to-video" | "video-to-video",
  capabilities: ModelCapabilities
): ModelCatalogItem {
  const providerMap = {
    google: "Google / Gemini",
    alibaba: "Alibaba / Wan",
    kling: "Kling",
    grok: "Grok Video",
    seedance: "Seedance / Volcengine"
  } as const;
  const baseMap = { google: googleBase, alibaba: alibabaBase, kling: "", grok: grokBase, seedance: "" } as const;

  return item({
    id,
    providerId,
    provider: providerMap[providerId],
    category: "video",
    modelType,
    name,
    displayName,
    defaultApiBaseUrl: baseMap[providerId],
    requiresApiBaseUrl: providerId === "kling" || providerId === "seedance",
    capabilities
  });
}

const imageRatios = ["1:1", "3:4", "4:3", "9:16", "16:9"];
const imageFormats = ["png", "jpeg", "webp"];

const googleImageBase: ModelCapabilities = {
  inputModes: ["text-to-image", "image-to-image", "image-edit"],
  imageAspectRatios: imageRatios,
  imageSizes: ["1K", "2K", "4K"],
  imageQualities: ["auto", "standard", "high"],
  imageFormats: ["png"],
  supportsImageInput: true,
  supportsMultiImageInput: true,
  supportsReferenceImage: true,
  supportsMask: false,
  supportsTransparentBackground: false
};

const openaiImageBase: ModelCapabilities = {
  inputModes: ["text-to-image", "image-to-image", "image-edit"],
  imageAspectRatios: imageRatios,
  imageSizes: ["auto", "1024x1024", "1536x1024", "1024x1536"],
  imageQualities: ["auto", "low", "medium", "high"],
  imageFormats,
  supportsImageInput: true,
  supportsMultiImageInput: true,
  supportsReferenceImage: true,
  supportsMask: true,
  supportsTransparentBackground: true
};

const wanRatios = ["16:9", "9:16", "1:1"];
const wanResolutions = ["720P", "1080P"];
const klingRatios = ["16:9", "9:16", "1:1"];

const rawFallbackModelCatalog: ModelCatalogItem[] = [
  textModel("deepseek-chat", "deepseek", "deepseek-chat", "DeepSeek Chat"),
  textModel("deepseek-reasoner", "deepseek", "deepseek-reasoner", "DeepSeek Reasoner"),
  textModel("google-gemini-3-1-pro-preview", "google", "gemini-3.1-pro-preview", "Gemini 3.1 Pro Preview", 1048576),
  textModel("google-gemini-3-5-flash", "google", "gemini-3.5-flash", "Gemini 3.5 Flash", 1048576),
  textModel("google-gemini-3-flash-preview", "google", "gemini-3-flash-preview", "Gemini 3 Flash Preview", 1048576),
  textModel("google-gemini-3-1-flash-lite-preview", "google", "gemini-3.1-flash-lite-preview", "Gemini 3.1 Flash-Lite Preview", 1048576),
  textModel("google-gemini-2-5-flash", "google", "gemini-2.5-flash", "Gemini 2.5 Flash", 1048576),

  imageModel("google-nano-banana-2", "google", "gemini-3.1-flash-image-preview", "Nano Banana 2", "text-to-image", googleImageBase),
  imageModel("google-nano-banana-pro", "google", "gemini-3-pro-image-preview", "Nano Banana Pro", "text-to-image", {
    ...googleImageBase,
    imageSizes: ["auto", "1024x1024", "1536x1024", "1024x1536", "2048x2048", "2048x1152", "1152x2048"],
    imageQualities: ["auto", "high"]
  }),
  imageModel("google-nano-banana", "google", "gemini-2.5-flash-image", "Nano Banana", "text-to-image", googleImageBase),
  imageModel("google-imagen-4", "google", "imagen-4", "Imagen 4", "text-to-image", {
    inputModes: ["text-to-image"],
    imageAspectRatios: imageRatios,
    imageSizes: ["auto", "1024x1024", "1536x1024", "1024x1536", "2048x2048"],
    imageQualities: ["auto", "fast", "standard", "high"],
    imageFormats: ["png"],
    supportsImageInput: false,
    supportsMultiImageInput: false,
    supportsReferenceImage: false,
    supportsMask: false,
    supportsTransparentBackground: false
  }),

  imageModel("openai-gpt-image-2", "openai", "gpt-image-2", "GPT Image 2", "text-to-image", {
    ...openaiImageBase,
    imageSizes: ["auto", "1024x1024", "1536x1024", "1024x1536", "2048x2048", "2048x1152", "3840x2160", "2160x3840"],
    supportsTransparentBackground: false
  }),
  imageModel("openai-gpt-image-1-5", "openai", "gpt-image-1.5", "GPT Image 1.5", "text-to-image", openaiImageBase),
  imageModel("openai-gpt-image-1", "openai", "gpt-image-1", "GPT Image 1", "text-to-image", openaiImageBase),
  imageModel("openai-gpt-image-1-mini", "openai", "gpt-image-1-mini", "GPT Image 1 Mini", "text-to-image", openaiImageBase),
  imageModel("azure-gpt-image-2", "azure-openai", "gpt-image-2", "Azure GPT Image 2", "text-to-image", openaiImageBase),
  imageModel("azure-gpt-image-1", "azure-openai", "gpt-image-1", "Azure GPT Image 1", "text-to-image", openaiImageBase),
  imageModel("alibaba-qwen-image-2-pro", "alibaba", "qwen-image-2.0-pro", "Qwen Image 2.0 Pro", "text-to-image", {
    inputModes: ["text-to-image"],
    imageAspectRatios: imageRatios,
    imageSizes: ["1024x1024", "1024x1536", "1536x1024"],
    imageQualities: ["standard", "high"],
    imageFormats: ["png"],
    supportsImageInput: false,
    supportsMultiImageInput: false,
    supportsMask: false
  }),
  imageModel("alibaba-qwen-image-edit-plus", "alibaba", "qwen-image-edit-plus", "Qwen Image Edit Plus", "image-edit", {
    inputModes: ["image-to-image", "image-edit"],
    imageAspectRatios: imageRatios,
    imageSizes: ["1024x1024", "1024x1536", "1536x1024"],
    imageQualities: ["standard", "high"],
    imageFormats: ["png"],
    supportsImageInput: true,
    supportsMultiImageInput: true,
    supportsMask: false
  }),
  imageModel("alibaba-qwen-image-edit-max", "alibaba", "qwen-image-edit-max", "Qwen Image Edit Max", "image-edit", {
    inputModes: ["image-to-image", "image-edit"],
    imageAspectRatios: imageRatios,
    imageSizes: ["1024x1024", "1024x1536", "1536x1024"],
    imageQualities: ["standard", "high"],
    imageFormats: ["png"],
    supportsImageInput: true,
    supportsMultiImageInput: true,
    supportsMask: false
  }),

  videoModel("google-veo-3-1", "google", "veo-3.1-generate-preview", "Veo 3.1", "text-to-video", {
    duration: { type: "enum", values: [4, 6, 8] },
    aspectRatios: ["16:9", "9:16"],
    resolutions: ["720p", "1080p", "4k"],
    inputModes: ["text-to-video", "image-to-video", "reference-to-video", "first-last-frame", "video-to-video"],
    supportsAudio: true,
    supportsReferenceImage: true,
    supportsMultiImageInput: true,
    supportsFirstLastFrame: true,
    supportsVideoInput: true,
    constraints: [
      { when: { resolution: ["1080p", "4k"] }, forceDuration: 8, reason: "Veo 3.1 uses fixed 8s at 1080p / 4k." },
      { when: { inputMode: ["reference-to-video"] }, forceDuration: 8, reason: "Veo 3.1 reference mode uses fixed 8s." }
    ]
  }),
  videoModel("google-veo-3-1-fast", "google", "veo-3.1-fast-generate-preview", "Veo 3.1 Fast", "text-to-video", {
    duration: { type: "enum", values: [4, 6, 8] },
    aspectRatios: ["16:9", "9:16"],
    resolutions: ["720p", "1080p", "4k"],
    inputModes: ["text-to-video", "image-to-video", "reference-to-video", "first-last-frame", "video-to-video"],
    supportsAudio: true,
    supportsReferenceImage: true,
    supportsMultiImageInput: true,
    supportsFirstLastFrame: true,
    supportsVideoInput: true,
    constraints: [
      { when: { resolution: ["1080p", "4k"] }, forceDuration: 8, reason: "Veo 3.1 Fast uses fixed 8s at 1080p / 4k." },
      { when: { inputMode: ["reference-to-video"] }, forceDuration: 8, reason: "Veo 3.1 Fast reference mode uses fixed 8s." }
    ]
  }),
  videoModel("google-veo-3-1-lite", "google", "veo-3.1-lite-generate-preview", "Veo 3.1 Lite", "text-to-video", {
    duration: { type: "enum", values: [4, 6, 8] },
    aspectRatios: ["16:9", "9:16"],
    resolutions: ["720p", "1080p"],
    inputModes: ["text-to-video", "image-to-video"],
    supportsAudio: true,
    supportsReferenceImage: false,
    constraints: [{ when: { resolution: ["1080p"] }, forceDuration: 8, reason: "Veo 3.1 Lite uses fixed 8s at 1080p." }]
  }),
  videoModel("google-veo-3", "google", "veo-3-generate-preview", "Veo 3", "text-to-video", {
    duration: { type: "fixed", value: 8 },
    aspectRatios: ["16:9", "9:16"],
    resolutions: ["720p", "1080p"],
    inputModes: ["text-to-video", "image-to-video"],
    supportsAudio: true
  }),
  videoModel("google-veo-2", "google", "veo-2.0-generate-001", "Veo 2", "text-to-video", {
    duration: { type: "range", min: 5, max: 8, step: 1 },
    aspectRatios: ["16:9", "9:16"],
    resolutions: ["720p"],
    inputModes: ["text-to-video", "image-to-video"],
    supportsAudio: false
  }),

  videoModel("alibaba-wan-2-7-t2v", "alibaba", "wan2.7-t2v", "Wan 2.7 Text to Video", "text-to-video", { duration: { type: "range", min: 2, max: 15, step: 1 }, aspectRatios: wanRatios, resolutions: wanResolutions, inputModes: ["text-to-video"] }),
  videoModel("alibaba-wan-2-7-i2v", "alibaba", "wan2.7-i2v", "Wan 2.7 Image to Video", "image-to-video", { duration: { type: "range", min: 2, max: 15, step: 1 }, aspectRatios: wanRatios, resolutions: wanResolutions, inputModes: ["image-to-video", "first-last-frame", "reference-to-video"], supportsReferenceImage: true, supportsFirstLastFrame: true }),
  videoModel("alibaba-wan-2-6-t2v", "alibaba", "wan2.6-t2v", "Wan 2.6 Text to Video", "text-to-video", { duration: { type: "range", min: 2, max: 15, step: 1 }, aspectRatios: wanRatios, resolutions: wanResolutions, inputModes: ["text-to-video"] }),
  videoModel("alibaba-wan-2-6-i2v", "alibaba", "wan2.6-i2v", "Wan 2.6 Image to Video", "image-to-video", { duration: { type: "range", min: 2, max: 15, step: 1 }, aspectRatios: wanRatios, resolutions: wanResolutions, inputModes: ["image-to-video", "first-last-frame", "reference-to-video"], supportsReferenceImage: true, supportsFirstLastFrame: true }),
  videoModel("alibaba-wan-2-5-t2v", "alibaba", "wan2.5-t2v", "Wan 2.5 Text to Video", "text-to-video", { duration: { type: "enum", values: [5, 10] }, aspectRatios: wanRatios, resolutions: ["480P", "720P", "1080P"], inputModes: ["text-to-video"] }),
  videoModel("alibaba-wan-2-5-i2v", "alibaba", "wan2.5-i2v", "Wan 2.5 Image to Video", "image-to-video", { duration: { type: "enum", values: [5, 10] }, aspectRatios: wanRatios, resolutions: ["480P", "720P", "1080P"], inputModes: ["image-to-video", "first-last-frame"], supportsFirstLastFrame: true }),

  videoModel("kling-3-0", "kling", "kling-3.0", "Kling 3.0", "text-to-video", { inputModes: ["text-to-video", "image-to-video", "reference-to-video", "video-to-video"], duration: { type: "range", min: 3, max: 15, step: 1 }, aspectRatios: klingRatios, resolutions: ["720P", "1080P", "4K"], supportsReferenceImage: true, supportsVideoInput: true, supportsMotionControl: true, supportsCameraControl: true }),
  videoModel("kling-2-6", "kling", "kling-2.6", "Kling 2.6", "text-to-video", { inputModes: ["text-to-video", "image-to-video", "reference-to-video", "video-to-video"], duration: { type: "range", min: 3, max: 15, step: 1 }, aspectRatios: klingRatios, resolutions: ["720P", "1080P"], supportsReferenceImage: true, supportsVideoInput: true, supportsMotionControl: true, supportsCameraControl: true }),
  videoModel("kling-2-5", "kling", "kling-2.5", "Kling 2.5", "text-to-video", { inputModes: ["text-to-video", "image-to-video", "reference-to-video"], duration: { type: "range", min: 3, max: 10, step: 1 }, aspectRatios: klingRatios, resolutions: ["720P", "1080P"], supportsReferenceImage: true, supportsMotionControl: true, supportsCameraControl: true }),

  videoModel("grok-imagine-video", "grok", "grok-imagine-video", "Grok Imagine Video", "text-to-video", { inputModes: ["text-to-video", "image-to-video"], duration: { type: "enum", values: [6, 10] }, aspectRatios: ["16:9", "9:16", "1:1"], resolutions: ["720P", "1080P"], supportsReferenceImage: true, supportsAudio: true }),
  videoModel("grok-imagine-fast", "grok", "grok-imagine-fast", "Grok Imagine Fast", "text-to-video", { inputModes: ["text-to-video", "image-to-video"], duration: { type: "enum", values: [6, 10] }, aspectRatios: ["16:9", "9:16", "1:1"], resolutions: ["720P", "1080P"], supportsReferenceImage: true, supportsAudio: true }),

  videoModel("seedance-2-0", "seedance", "seedance-2.0", "Seedance 2.0", "text-to-video", { inputModes: ["text-to-video", "image-to-video", "reference-to-video", "video-to-video"], duration: { type: "range", min: 2, max: 15, step: 1 }, aspectRatios: ["16:9", "9:16", "1:1"], resolutions: ["720P", "1080P"], supportsReferenceImage: true, supportsVideoInput: true, supportsCameraControl: true }),
  videoModel("seedance-1-5-pro", "seedance", "seedance-1.5-pro", "Seedance 1.5 Pro", "text-to-video", { inputModes: ["text-to-video", "image-to-video", "reference-to-video"], duration: { type: "enum", values: [5, 10, 15] }, aspectRatios: ["16:9", "9:16", "1:1"], resolutions: ["720P", "1080P"], supportsReferenceImage: true, supportsCameraControl: true }),
  videoModel("seedance-1-0-pro", "seedance", "seedance-1.0-pro", "Seedance 1.0 Pro", "text-to-video", { inputModes: ["text-to-video", "image-to-video"], duration: { type: "enum", values: [5, 10] }, aspectRatios: ["16:9", "9:16", "1:1"], resolutions: ["720P", "1080P"] })
];

const hiddenLegacyVideoModelIds = new Set([
  "alibaba-wan-2-7-t2v",
  "alibaba-wan-2-7-i2v",
  "alibaba-wan-2-6-t2v",
  "alibaba-wan-2-6-i2v",
  "alibaba-wan-2-5-t2v",
  "alibaba-wan-2-5-i2v"
]);

export const fallbackModelCatalog: ModelCatalogItem[] = [
  ...rawFallbackModelCatalog.filter((item) => !hiddenLegacyVideoModelIds.has(item.id)),
  videoModel("alibaba-happyhorse-1-0-t2v", "alibaba", "happyhorse-1.0-t2v", "HappyHorse 1.0 文生视频", "text-to-video", {
    duration: { type: "range", min: 3, max: 15, step: 1 },
    aspectRatios: ["16:9", "9:16"],
    resolutions: wanResolutions,
    inputModes: ["text-to-video"],
    supportsNegativePrompt: true,
    supportsSeed: true
  }),
  videoModel("alibaba-wan-2-7-i2v-official", "alibaba", "wan2.7-i2v-2026-04-25", "Wan 2.7 图生视频", "image-to-video", {
    duration: { type: "range", min: 2, max: 15, step: 1 },
    aspectRatios: ["16:9", "9:16"],
    resolutions: wanResolutions,
    inputModes: ["image-to-video", "first-last-frame", "video-to-video"],
    supportsFirstLastFrame: true,
    supportsVideoInput: true,
    supportsAudio: true,
    supportsSeed: true
  }),
  videoModel("alibaba-wan-2-7-videoedit", "alibaba", "wan2.7-videoedit", "Wan 2.7 视频编辑", "video-to-video", {
    duration: { type: "range", min: 2, max: 10, step: 1 },
    aspectRatios: ["16:9", "9:16"],
    resolutions: wanResolutions,
    inputModes: ["video-to-video"],
    supportsVideoInput: true,
    supportsSeed: true
  })
];
