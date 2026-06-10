export type QualityTier = "standard" | "full" | "fast" | "lite" | "turbo";

export type OfficialModelCapability = {
  providerId: string;
  modelId: string;
  modelName: string;
  displayName: string;
  officialEndpointType: string;
  adapterName: string;
  runtimeStatus: "verified" | "experimental" | "not_implemented";
  qualityTier: QualityTier;
  supportedInputModes: string[];
  supportedAspectRatios: string[];
  supportedDurations?: number[];
  supportedResolutions?: string[];
  defaultQuality?: string;
  defaultResolution?: string;
  parameterMapping: Record<string, unknown>;
};

const commonVideoRatios = ["16:9", "9:16", "1:1"];
const googleVeoRatios = ["16:9", "9:16"];
const imageRatios = ["1:1", "3:4", "4:3", "9:16", "16:9"];
const klingStandardDurations = [5, 10];
const klingLongDurations = [5, 10, 15];
const klingInputModes = ["text-to-video", "image-to-video", "first-last-frame", "reference-to-video"];

function klingCapability(input: { modelId: string; modelName: string; displayName: string; qualityTier?: QualityTier; supportedInputModes?: string[]; supportedDurations?: number[] }): OfficialModelCapability {
  return {
    providerId: "kling",
    modelId: input.modelId,
    modelName: input.modelName,
    displayName: input.displayName,
    officialEndpointType: "kling.videos",
    adapterName: "klingVideo",
    runtimeStatus: "experimental",
    qualityTier: input.qualityTier ?? "full",
    supportedInputModes: input.supportedInputModes ?? klingInputModes,
    supportedAspectRatios: commonVideoRatios,
    supportedDurations: input.supportedDurations ?? klingStandardDurations,
    supportedResolutions: ["720P", "1080P"],
    defaultResolution: "1080P",
    parameterMapping: { model: "model_name", firstFrame: "image", lastFrame: "image_tail", references: "image_list" }
  };
}

export const officialModelCapabilities: OfficialModelCapability[] = [
  {
    providerId: "google",
    modelId: "google-veo-3-1",
    modelName: "veo-3.1-generate-preview",
    displayName: "Veo 3.1",
    officialEndpointType: "gemini.generateVideos",
    adapterName: "googleVeo",
    runtimeStatus: "verified",
    qualityTier: "standard",
    supportedInputModes: ["text-to-video", "image-to-video", "video-to-video", "reference-to-video", "first-last-frame"],
    supportedAspectRatios: googleVeoRatios,
    supportedDurations: [4, 6, 8],
    supportedResolutions: ["720p", "1080p", "4k"],
    defaultResolution: "1080p",
    parameterMapping: { aspectRatio: "config.aspectRatio", duration: "config.durationSeconds", resolution: "config.resolution" }
  },
  {
    providerId: "google",
    modelId: "google-veo-3-1-fast",
    modelName: "veo-3.1-fast-generate-preview",
    displayName: "Veo 3.1 Fast",
    officialEndpointType: "gemini.generateVideos",
    adapterName: "googleVeo",
    runtimeStatus: "verified",
    qualityTier: "fast",
    supportedInputModes: ["text-to-video", "image-to-video", "video-to-video", "reference-to-video", "first-last-frame"],
    supportedAspectRatios: googleVeoRatios,
    supportedDurations: [4, 6, 8],
    supportedResolutions: ["720p", "1080p", "4k"],
    defaultResolution: "720p",
    parameterMapping: { aspectRatio: "config.aspectRatio", duration: "config.durationSeconds", resolution: "config.resolution" }
  },
  {
    providerId: "google",
    modelId: "google-veo-3-1-lite",
    modelName: "veo-3.1-lite-generate-preview",
    displayName: "Veo 3.1 Lite",
    officialEndpointType: "gemini.generateVideos",
    adapterName: "googleVeo",
    runtimeStatus: "verified",
    qualityTier: "lite",
    supportedInputModes: ["text-to-video", "image-to-video", "first-last-frame"],
    supportedAspectRatios: googleVeoRatios,
    supportedDurations: [4, 6, 8],
    supportedResolutions: ["720p", "1080p"],
    defaultResolution: "720p",
    parameterMapping: { aspectRatio: "config.aspectRatio", duration: "config.durationSeconds", resolution: "config.resolution" }
  },
  {
    providerId: "google",
    modelId: "google-omni-flash-10s",
    modelName: "omni_flash-10s",
    displayName: "Google Omni Flash 10s",
    officialEndpointType: "relay.videos",
    adapterName: "googleRelayVideo",
    runtimeStatus: "verified",
    qualityTier: "fast",
    supportedInputModes: ["text-to-video", "image-to-video", "reference-to-video"],
    supportedAspectRatios: googleVeoRatios,
    supportedDurations: [10],
    supportedResolutions: ["720p"],
    defaultResolution: "720p",
    parameterMapping: { model: "omni_flash-10s", size: "size", images: "images" }
  },
  {
    providerId: "grok",
    modelId: "grok-imagine-video",
    modelName: "grok-imagine-video",
    displayName: "Grok Imagine Video",
    officialEndpointType: "xai.videos.generations",
    adapterName: "grokVideo",
    runtimeStatus: "verified",
    qualityTier: "standard",
    supportedInputModes: ["text-to-video", "image-to-video", "reference-to-video", "video-to-video"],
    supportedAspectRatios: ["16:9", "9:16", "1:1", "2:3", "3:2", "3:4", "4:3"],
    supportedDurations: Array.from({ length: 15 }, (_, index) => index + 1),
    supportedResolutions: ["480p", "720p"],
    defaultResolution: "720p",
    parameterMapping: { prompt: "prompt", duration: "duration", aspectRatio: "aspect_ratio", resolution: "resolution" }
  },
  klingCapability({ modelId: "kling-3-0", modelName: "kling-v3-omni", displayName: "可灵 Kling 3.0 Omni", supportedDurations: klingLongDurations }),
  klingCapability({ modelId: "kling-2-6", modelName: "kling-v2-6", displayName: "可灵 Kling 2.6", supportedDurations: klingLongDurations }),
  klingCapability({ modelId: "kling-2-5", modelName: "kling-v2-5-turbo", displayName: "可灵 Kling 2.5 Turbo", qualityTier: "turbo", supportedInputModes: ["text-to-video", "image-to-video", "first-last-frame"] }),
  klingCapability({ modelId: "kling-2-1-master", modelName: "kling-v2-1-master", displayName: "可灵 Kling 2.1 Master", supportedDurations: klingLongDurations }),
  klingCapability({ modelId: "kling-2-1", modelName: "kling-v2-1", displayName: "可灵 Kling 2.1", supportedDurations: klingLongDurations }),
  klingCapability({ modelId: "kling-2-master", modelName: "kling-v2-master", displayName: "可灵 Kling 2.0 Master", supportedDurations: klingLongDurations }),
  klingCapability({ modelId: "kling-1-6", modelName: "kling-v1-6", displayName: "可灵 Kling 1.6" }),
  klingCapability({ modelId: "kling-1-5", modelName: "kling-v1-5", displayName: "可灵 Kling 1.5", supportedInputModes: ["text-to-video", "image-to-video", "first-last-frame"] }),
  klingCapability({ modelId: "kling-1", modelName: "kling-v1", displayName: "可灵 Kling 1.0", supportedInputModes: ["text-to-video", "image-to-video", "first-last-frame"] }),
  {
    providerId: "alibaba",
    modelId: "alibaba-wan-2-7-t2v",
    modelName: "wan2.7-t2v",
    displayName: "Wan 2.7 文生视频",
    officialEndpointType: "dashscope.video-synthesis",
    adapterName: "alibabaWan",
    runtimeStatus: "verified",
    qualityTier: "full",
    supportedInputModes: ["text-to-video"],
    supportedAspectRatios: commonVideoRatios,
    supportedDurations: Array.from({ length: 14 }, (_, index) => index + 2),
    supportedResolutions: ["720P", "1080P"],
    defaultResolution: "1080P",
    parameterMapping: { ratio: "parameters.ratio", resolution: "parameters.resolution", size: "parameters.size" }
  },
  {
    providerId: "alibaba",
    modelId: "alibaba-wan-2-7-i2v",
    modelName: "wan2.7-i2v",
    displayName: "Wan 2.7 图生视频",
    officialEndpointType: "dashscope.video-synthesis",
    adapterName: "alibabaWan",
    runtimeStatus: "verified",
    qualityTier: "full",
    supportedInputModes: ["image-to-video", "first-last-frame", "reference-to-video"],
    supportedAspectRatios: commonVideoRatios,
    supportedDurations: Array.from({ length: 14 }, (_, index) => index + 2),
    supportedResolutions: ["720P", "1080P"],
    defaultResolution: "1080P",
    parameterMapping: { media: "input.media", ratio: "parameters.ratio", resolution: "parameters.resolution", size: "parameters.size" }
  },
  {
    providerId: "openai",
    modelId: "openai-gpt-image-2",
    modelName: "gpt-image-2",
    displayName: "GPT Image 2",
    officialEndpointType: "images.generate/edit",
    adapterName: "openaiImage",
    runtimeStatus: "verified",
    qualityTier: "full",
    supportedInputModes: ["text-to-image", "image-to-image", "image-edit"],
    supportedAspectRatios: imageRatios,
    defaultQuality: "high",
    parameterMapping: { size: "size", quality: "quality", format: "output_format" }
  },
  {
    providerId: "azure-openai",
    modelId: "azure-gpt-image-2",
    modelName: "gpt-image-2",
    displayName: "Azure GPT Image 2",
    officialEndpointType: "azure.images.generations",
    adapterName: "azureOpenAIImage",
    runtimeStatus: "verified",
    qualityTier: "full",
    supportedInputModes: ["text-to-image", "image-to-image", "image-edit"],
    supportedAspectRatios: imageRatios,
    defaultQuality: "high",
    parameterMapping: { size: "size", quality: "quality" }
  },
  {
    providerId: "alibaba",
    modelId: "alibaba-qwen-image-2-pro",
    modelName: "qwen-image-2.0-pro",
    displayName: "Qwen Image 2.0 Pro",
    officialEndpointType: "dashscope.multimodal-generation",
    adapterName: "alibabaImage",
    runtimeStatus: "verified",
    qualityTier: "full",
    supportedInputModes: ["text-to-image"],
    supportedAspectRatios: imageRatios,
    defaultQuality: "high",
    parameterMapping: { size: "parameters.size", n: "parameters.n" }
  },
  {
    providerId: "google",
    modelId: "google-nano-banana-2",
    modelName: "gemini-3.1-flash-image-preview",
    displayName: "Nano Banana 2",
    officialEndpointType: "gemini.generateContent",
    adapterName: "googleImage",
    runtimeStatus: "verified",
    qualityTier: "full",
    supportedInputModes: ["text-to-image", "image-to-image", "image-edit"],
    supportedAspectRatios: imageRatios,
    defaultQuality: "high",
    parameterMapping: { aspectRatio: "config.imageConfig.aspectRatio", size: "config.imageConfig.size" }
  }
];

export function getOfficialModelCapability(providerId?: string, modelId?: string, modelName?: string) {
  return officialModelCapabilities.find(
    (item) =>
      item.providerId === providerId &&
      ((modelId && item.modelId === modelId) || (modelName && item.modelName === modelName))
  );
}

export function qualityTierFor(providerId?: string, modelId?: string, modelName?: string): QualityTier {
  return getOfficialModelCapability(providerId, modelId, modelName)?.qualityTier ?? (/(fast|lite|turbo)/i.test(modelName ?? "") ? "fast" : "full");
}
