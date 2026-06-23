import { useEffect, useMemo, useState } from "react";
import { Check, Image, KeyRound, Loader2, MessageSquare, Plus, RefreshCw, Trash2, Video } from "lucide-react";
import { Button } from "../common/Button";
import { Input } from "../common/Input";
import { modelConfigApi } from "../../services/modelConfigApi";
import { useModelConfigStore } from "../../store/modelConfigStore";
import { fallbackModelCatalog } from "../../data/modelCatalog";
import type { ModelCapabilities, ModelCatalogItem, ModelConfig, ModelType } from "../../types/model";

type ModelCategory = "image" | "text" | "video";
const lastApiRouteStorageKey = "aigcnong-last-custom-api-route";

const categoryOrder: ModelCategory[] = ["image", "text", "video"];

const categoryMeta: Record<ModelCategory, { label: string; title: string; icon: typeof Image; activeClass: string; accentClass: string }> = {
  image: {
    label: "图片生成",
    title: "图片生成线路",
    icon: Image,
    activeClass: "border-cyan-200/30 bg-cyan-300/[0.10] text-cyan-100",
    accentClass: "bg-cyan-300"
  },
  text: {
    label: "LLM 对话",
    title: "LLM 对话线路",
    icon: MessageSquare,
    activeClass: "border-emerald-200/30 bg-emerald-300/[0.10] text-emerald-100",
    accentClass: "bg-emerald-300"
  },
  video: {
    label: "视频生成",
    title: "视频生成线路",
    icon: Video,
    activeClass: "border-violet-200/30 bg-violet-300/[0.10] text-violet-100",
    accentClass: "bg-violet-300"
  }
};

const defaultImageCapabilities: ModelCapabilities = {
  inputModes: ["text-to-image", "image-to-image", "image-edit"],
  imageAspectRatios: ["1:1", "3:4", "4:3", "9:16", "16:9", "2:3", "3:2", "21:9"],
  imageSizes: ["auto", "1024x1024", "1536x1024", "1024x1536", "1920x1080", "1080x1920"],
  imageQualities: ["auto", "standard", "high"],
  imageFormats: ["png", "jpeg", "webp"],
  supportsImageInput: true,
  supportsMultiImageInput: true,
  supportsReferenceImage: true
};

const imageRatios = ["1:1", "3:4", "4:3", "9:16", "16:9"];
const imageFormats = ["png", "jpeg", "webp"];
const openAiImageSizes = ["auto", "1024x1024", "1536x1024", "1024x1536"];
const qwenImageSizes = ["1024x1024", "1024x1536", "1536x1024"];
const grsaiImageSizes = ["1K", "2K", "4K"];
const grsaiImageRatios = ["auto", "1:1", "16:9", "9:16", "4:3", "3:4", "3:2", "2:3", "5:4", "4:5", "21:9", "9:21", "1:2", "2:1"];

const defaultTextCapabilities: ModelCapabilities = {
  inputModes: ["text"],
  modelCapability: { supportsText: true },
  contextWindow: 128000
};

const defaultVideoCapabilities: ModelCapabilities = {
  inputModes: ["text-to-video", "image-to-video", "reference-to-video", "video-to-video"],
  duration: { type: "enum", values: [4, 5, 6, 8, 10, 15] },
  aspectRatios: ["16:9", "9:16", "1:1", "3:4", "4:3", "21:9"],
  resolutions: ["480p", "720p", "1080p"],
  provider: "custom",
  channel: "proxy",
  apiFamily: "openai_videos",
  createEndpoint: "/v1/videos",
  endpoint: "/v1/videos",
  pollEndpoint: "/v1/videos/{taskId}",
  authType: "bearer",
  requestFormat: "json",
  taskMode: "async",
  idField: "id",
  taskIdField: "id",
  statusField: "status",
  resultField: "result",
  supportedInputs: ["text", "image"],
  imageTransport: "base64_json",
  supportedAspectRatios: ["16:9", "9:16", "1:1", "3:4", "4:3", "21:9"],
  supportedDurations: [4, 5, 6, 8, 10, 15],
  supportedResolutions: ["480p", "720p", "1080p"],
  supportsImageInput: true,
  supportsReferenceImage: true,
  supportsMultiImageInput: true,
  supportsVideoInput: true
};

const seedanceCapabilities: ModelCapabilities = {
  ...defaultVideoCapabilities,
  provider: "doubao",
  apiFamily: "seedance2_native",
  createEndpoint: "/v1/video/generations",
  endpoint: "/v1/video/generations",
  pollEndpoint: "/v1/video/generations/{taskId}",
  imageTransport: "url_or_asset",
  idField: "task_id",
  taskIdField: "task_id",
  duration: { type: "enum", values: [0, 4, 5, 6, 7, 8, 9, 10, 11, 12, 13, 14, 15] },
  aspectRatios: ["9:16", "16:9", "1:1", "3:4", "4:3", "21:9"],
  resolutions: ["480P", "720P", "1080P"],
  supportedAspectRatios: ["9:16", "16:9", "1:1", "3:4", "4:3", "21:9"],
  supportedDurations: [4, 5, 6, 7, 8, 9, 10, 11, 12, 13, 14, 15],
  supportedResolutions: ["480P", "720P", "1080P"],
  inputModes: ["text-to-video", "image-to-video", "first-last-frame", "reference-to-video", "video-to-video"],
  supportedInputs: ["text", "image", "first_frame", "reference_image", "first_last_frame"],
  supportsFirstLastFrame: true,
  supportsAudio: true,
  maxReferenceImages: 9,
  maxReferenceVideos: 3,
  maxReferenceAudios: 3,
  maxReferenceFiles: 12
};

const veoCapabilities: ModelCapabilities = {
  ...defaultVideoCapabilities,
  provider: "veo",
  apiFamily: "openai_videos",
  createEndpoint: "/v1/videos",
  endpoint: "/v1/videos",
  pollEndpoint: "/v1/videos/{taskId}",
  duration: { type: "enum", values: [4, 6, 8, 10] },
  aspectRatios: ["16:9", "9:16"],
  resolutions: ["720p", "1080p", "4k"],
  supportedAspectRatios: ["16:9", "9:16"],
  supportedDurations: [4, 6, 8, 10],
  supportedResolutions: ["720p", "1080p", "4k"],
  inputModes: ["text-to-video", "image-to-video", "first-last-frame", "reference-to-video", "video-to-video"],
  supportedInputs: ["text", "image", "first_frame", "reference_image", "first_last_frame"],
  supportsImageInput: true,
  supportsReferenceImage: true,
  supportsMultiImageInput: true,
  supportsFirstLastFrame: true,
  supportsAudio: true,
  maxReferenceImages: 3
};

function videoCapabilitiesFor(modelName: string): ModelCapabilities {
  const name = modelName.toLowerCase();
  if (/omni[-_]?fast[-_]?v2v/.test(name)) {
    return {
      ...veoCapabilities,
      apiFamily: "omni_fast_v2v",
      imageTransport: "unsupported",
      videoTransport: "url_or_base64_json",
      videoField: "video",
      inputModes: ["video-to-video"],
      supportedInputs: ["video"],
      supportsVideoInput: true,
      supportsImageInput: false,
      supportsReferenceImage: false,
      maxReferenceImages: 0,
      maxReferenceVideos: 1
    };
  }
  if (/omni[-_]?fast|omni[-_]?flash/.test(name)) {
    return {
      ...veoCapabilities,
      apiFamily: "omni_fast",
      imageTransport: "url",
      imageField: "first_image_url",
      inputModes: ["text-to-video", "image-to-video"],
      supportedInputs: ["text", "image", "first_frame"],
      supportsImageInput: true,
      supportsReferenceImage: true,
      maxReferenceImages: 1
    };
  }
  if (/doubao[-_]?seedance[-_]?1[-_]?5/.test(name)) {
    return {
      ...defaultVideoCapabilities,
      provider: "doubao",
      apiFamily: "doubao_seedance15",
      createEndpoint: "/v1/videos",
      endpoint: "/v1/videos",
      pollEndpoint: "/v1/videos/{taskId}",
      requestFormat: "multipart",
      imageTransport: "multipart_file",
      imageField: "first_frame_image",
      duration: { type: "range", min: 4, max: 11, step: 1 },
      supportedDurations: [4, 5, 6, 7, 8, 9, 10, 11],
      inputModes: ["text-to-video", "image-to-video", "first-last-frame"],
      supportedInputs: ["text", "image", "first_frame", "first_last_frame"],
      supportsImageInput: true,
      supportsFirstLastFrame: true,
      maxReferenceImages: 2
    };
  }
  if (/doubao[-_]?seedance[-_]?2[-_]?0|seedance[-_ .]?2/.test(name)) return seedanceCapabilities;
  if (/kling|可灵/.test(name)) {
    const noReference = /(?:^|[-_])noref(?:$|[-_])/.test(name);
    return {
      ...defaultVideoCapabilities,
      provider: "kling",
      apiFamily: "aigc_video_json",
      createEndpoint: "/v1/videos",
      endpoint: "/v1/videos",
      pollEndpoint: "/v1/videos/{taskId}",
      requestFormat: "json",
      imageTransport: noReference ? "unsupported" : "url_or_asset",
      imageField: "image",
      inputModes: noReference ? ["text-to-video"] : ["text-to-video", "image-to-video", "first-last-frame"],
      supportedInputs: noReference ? ["text"] : ["text", "image", "first_frame", "first_last_frame"],
      supportsImageInput: !noReference,
      supportsReferenceImage: !noReference,
      supportsFirstLastFrame: !noReference,
      maxReferenceImages: noReference ? 0 : 2
    };
  }
  if (/\/v1\/video\/create|unified|vidu/.test(name)) {
    return {
      ...defaultVideoCapabilities,
      apiFamily: "unified_video_create",
      createEndpoint: "/v1/video/create",
      endpoint: "/v1/video/create",
      pollEndpoint: "/v1/video/query?id={taskId}",
      imageTransport: "url",
      supportedInputs: ["text", "image"],
      supportsImageInput: true,
      supportsReferenceImage: true
    };
  }
  if (/veo|gemini/.test(name)) return veoCapabilities;
  return defaultVideoCapabilities;
}

function zhipuVideoCapabilitiesFor(modelName: string): ModelCapabilities {
  const name = modelName.toLowerCase();
  const isTextOnly = /viduq1[-_]?text/.test(name);
  const isImageOnly = /viduq1[-_]?image|vidu2[-_]?image/.test(name);
  const isStartEnd = /start[-_]?end/.test(name);
  const isReference = /reference/.test(name);
  const isVidu2 = /vidu2/.test(name);
  const isCogVideo3 = /cogvideox[-_]?3/.test(name);
  const inputModes = isTextOnly
    ? ["text-to-video"] as const
    : isImageOnly ? ["image-to-video"] as const
      : isStartEnd ? ["first-last-frame"] as const
        : isReference ? ["reference-to-video"] as const
          : isCogVideo3 ? ["text-to-video", "image-to-video", "first-last-frame"] as const
            : ["text-to-video", "image-to-video"] as const;
  const supportedInputs = isTextOnly
    ? ["text"] as const
    : isImageOnly ? ["image", "first_frame"] as const
      : isStartEnd ? ["image", "first_last_frame"] as const
        : isReference ? ["image", "reference_image"] as const
          : isCogVideo3 ? ["text", "image", "first_frame", "first_last_frame"] as const
            : ["text", "image", "first_frame"] as const;
  const durations = isVidu2 ? [4] : isCogVideo3 ? [5, 10] : [5];
  const resolutions = isVidu2 ? ["480p", "720p"] : isCogVideo3 ? ["720p", "1080p", "4k"] : ["1080p"];
  return {
    ...defaultVideoCapabilities,
    provider: "zhipu",
    channel: "official",
    apiFamily: "zhipu_video",
    createEndpoint: "/videos/generations",
    endpoint: "/videos/generations",
    pollEndpoint: "/async-result/{taskId}",
    requestFormat: "json",
    taskMode: "async",
    idField: "id",
    taskIdField: "id",
    statusField: "task_status",
    resultField: "",
    imageTransport: isTextOnly ? "unsupported" : "url",
    imageField: "image_url",
    inputModes: [...inputModes],
    supportedInputs: [...supportedInputs],
    duration: { type: "enum", values: durations },
    supportedDurations: durations,
    aspectRatios: ["16:9", "9:16", "1:1"],
    supportedAspectRatios: ["16:9", "9:16", "1:1"],
    resolutions,
    supportedResolutions: resolutions,
    supportsImageInput: !isTextOnly,
    supportsReferenceImage: isReference,
    supportsFirstLastFrame: isStartEnd || isCogVideo3,
    supportsMultiImageInput: isReference || isStartEnd || isCogVideo3,
    maxReferenceImages: isReference ? 3 : isStartEnd || isCogVideo3 ? 2 : isTextOnly ? 0 : 1
  };
}

function videoCapabilitiesForChannel(modelName: string, baseUrl: string): ModelCapabilities {
  const capabilities = videoCapabilitiesFor(modelName);
  if (/runapi\.co/i.test(baseUrl)) {
    return {
      ...capabilities,
      channel: "proxy",
      apiFamily: "unified_video_create",
      createEndpoint: "/v1/video/create",
      endpoint: "/v1/video/create",
      pollEndpoint: "/v1/videos/{taskId}",
      requestFormat: "json",
      imageTransport: capabilities.supportedInputs?.some((input) => ["image", "first_frame", "reference_image", "first_last_frame"].includes(input)) ? "url" : "unsupported",
      videoTransport: capabilities.supportedInputs?.includes("video") ? "url_or_base64_json" : capabilities.videoTransport
    };
  }
  return capabilities;
}

function pickChannelCapability(capabilities: ModelCapabilities): NonNullable<ModelCapabilities["channelCapability"]> {
  return {
    provider: capabilities.provider,
    channel: capabilities.channel,
    apiFamily: capabilities.apiFamily,
    endpoint: capabilities.endpoint,
    createEndpoint: capabilities.createEndpoint,
    pollEndpoint: capabilities.pollEndpoint,
    authType: capabilities.authType,
    requestFormat: capabilities.requestFormat,
    taskMode: capabilities.taskMode,
    idField: capabilities.idField,
    taskIdField: capabilities.taskIdField,
    statusField: capabilities.statusField,
    resultField: capabilities.resultField,
    supportedInputs: capabilities.supportedInputs,
    imageTransport: capabilities.imageTransport,
    videoTransport: capabilities.videoTransport,
    imageField: capabilities.imageField,
    videoField: capabilities.videoField
  };
}

function modelCapabilityFor(capabilities: ModelCapabilities, officialModelKey: string): NonNullable<ModelCapabilities["modelCapability"]> {
  const inputModes = new Set(capabilities.inputModes ?? []);
  return {
    model: officialModelKey,
    supportsText: inputModes.has("text"),
    supportsTextToImage: inputModes.has("text-to-image"),
    supportsImageToImage: inputModes.has("image-to-image"),
    supportsImageEdit: inputModes.has("image-edit"),
    supportsTextToVideo: inputModes.has("text-to-video"),
    supportsImageToVideo: inputModes.has("image-to-video") || inputModes.has("reference-to-video") || inputModes.has("first-last-frame"),
    supportsReferenceToVideo: inputModes.has("reference-to-video"),
    supportsFirstLastFrame: inputModes.has("first-last-frame") || Boolean(capabilities.supportsFirstLastFrame),
    supportsVideoToVideo: inputModes.has("video-to-video") || Boolean(capabilities.supportsVideoInput)
  };
}

function imageModelIdentity(modelName: string) {
  return modelName.toLowerCase();
}

function isQwenImageEditModel(modelName: string) {
  return /qwen[-_ .]?image[-_ .]?edit|edit[-_ .]?(?:plus|max)/.test(imageModelIdentity(modelName));
}

function isQwenImageTextModel(modelName: string) {
  const name = imageModelIdentity(modelName);
  return !isQwenImageEditModel(modelName) && /qwen[-_ .]?image|wanx|通义|万相/.test(name);
}

function imageCapabilitiesFor(modelName: string): ModelCapabilities {
  const name = imageModelIdentity(modelName);
  if (isQwenImageEditModel(modelName)) {
    const capabilities: ModelCapabilities = {
      inputModes: ["image-to-image", "image-edit"],
      imageAspectRatios: imageRatios,
      imageSizes: qwenImageSizes,
      imageQualities: ["standard", "high"],
      imageFormats: ["png"],
      supportsImageInput: true,
      supportsMultiImageInput: true,
      supportsReferenceImage: true,
      supportsMask: false,
      supportsTransparentBackground: false
    };
    return { ...capabilities, modelCapability: modelCapabilityFor(capabilities, modelName) };
  }
  if (isQwenImageTextModel(modelName)) {
    const capabilities: ModelCapabilities = {
      inputModes: ["text-to-image"],
      imageAspectRatios: imageRatios,
      imageSizes: qwenImageSizes,
      imageQualities: ["standard", "high"],
      imageFormats: ["png"],
      supportsImageInput: false,
      supportsMultiImageInput: false,
      supportsReferenceImage: false,
      supportsMask: false,
      supportsTransparentBackground: false
    };
    return { ...capabilities, modelCapability: modelCapabilityFor(capabilities, modelName) };
  }
  if (/gemini.*image|image.*gemini|nano[-_ .]?banana/.test(name)) {
    const capabilities: ModelCapabilities = {
      inputModes: ["text-to-image", "image-to-image", "image-edit"],
      imageAspectRatios: imageRatios,
      imageSizes: ["1K"],
      imageQualities: ["auto", "standard", "high"],
      imageFormats: ["png"],
      supportsImageInput: true,
      supportsMultiImageInput: true,
      supportsReferenceImage: true,
      supportsMask: false,
      supportsTransparentBackground: false
    };
    return { ...capabilities, modelCapability: modelCapabilityFor(capabilities, modelName) };
  }
  if (/imagen/.test(name)) {
    const capabilities: ModelCapabilities = {
      inputModes: ["text-to-image"],
      imageAspectRatios: imageRatios,
      imageSizes: ["1K", "2K"],
      imageQualities: ["auto", "standard", "high"],
      imageFormats: ["png"],
      supportsImageInput: false,
      supportsMultiImageInput: false,
      supportsReferenceImage: false,
      supportsMask: false,
      supportsTransparentBackground: false
    };
    return { ...capabilities, modelCapability: modelCapabilityFor(capabilities, modelName) };
  }
  if (/seedream|doubao[-_]?seedream/.test(name)) {
    const capabilities: ModelCapabilities = {
      ...defaultImageCapabilities,
      modelCapability: modelCapabilityFor(defaultImageCapabilities, modelName)
    };
    return capabilities;
  }
  if (/gpt[-_ .]?image|dall[-_ .]?e|openai/.test(name)) {
    const capabilities: ModelCapabilities = {
      inputModes: ["text-to-image", "image-to-image", "image-edit"],
      imageAspectRatios: imageRatios,
      imageSizes: openAiImageSizes,
      imageQualities: ["auto", "low", "medium", "high"],
      imageFormats,
      supportsImageInput: true,
      supportsMultiImageInput: true,
      supportsReferenceImage: true,
      supportsMask: true,
      supportsTransparentBackground: !/gpt[-_ .]?image[-_ .]?2/.test(name)
    };
    return { ...capabilities, modelCapability: modelCapabilityFor(capabilities, modelName) };
  }
  const capabilities: ModelCapabilities = {
    ...defaultImageCapabilities,
    inputModes: /flux|recraft|ideogram|midjourney|jimeng/.test(name) ? ["text-to-image"] : defaultImageCapabilities.inputModes
  };
  return { ...capabilities, modelCapability: modelCapabilityFor(capabilities, modelName) };
}

const officialVideoCatalog = fallbackModelCatalog.filter((item) => item.category === "video");
const officialCatalog = fallbackModelCatalog.filter((item) => item.category === "video" || item.category === "image" || item.category === "text");

const officialAliasRules: Array<{ id: string; test: RegExp }> = [
  { id: "google-veo-3-1-fast", test: /\bveo[-_ .]?3[-_ .]?1(?:[-_ .]?fast|_fast)|veo_3_1-fast/i },
  { id: "google-veo-3-1-lite", test: /\bveo[-_ .]?3[-_ .]?1[-_ .]?lite/i },
  { id: "google-veo-3-1", test: /\bveo[-_ .]?3[-_ .]?1|veo_3_1/i },
  { id: "google-veo-3", test: /\bveo[-_ .]?3\b|veo_3\b/i },
  { id: "google-veo-2", test: /\bveo[-_ .]?2\b|veo_2\b/i },
  { id: "google-omni-flash-10s", test: /\bomni[-_ .]?(?:fast|flash)\b/i },
  { id: "seedance-2-0-fast", test: /doubao[-_]?seedance[-_]?2[-_]?0[-_]?fast|seedance[-_ .]?2[-_ .]?0[-_ .]?fast/i },
  { id: "seedance-2-0", test: /doubao[-_]?seedance[-_]?2[-_]?0|seedance[-_ .]?2/i },
  { id: "seedance-1-5-pro", test: /doubao[-_]?seedance[-_]?1[-_]?5|seedance[-_ .]?1[-_ .]?5/i },
  { id: "kling-3-0", test: /kling[-_ .]?3[-_ .]?0|kling[-_ .]?v3|可灵.*3/i },
  { id: "kling-2-6", test: /kling[-_ .]?2[-_ .]?6|kling[-_ .]?v2[-_ .]?6/i },
  { id: "kling-2-5", test: /kling[-_ .]?2[-_ .]?5|kling[-_ .]?v2[-_ .]?5/i },
  { id: "kling-2-1-master", test: /kling[-_ .]?2[-_ .]?1[-_ .]?master|kling[-_ .]?v2[-_ .]?1[-_ .]?master/i },
  { id: "kling-2-1", test: /kling[-_ .]?2[-_ .]?1|kling[-_ .]?v2[-_ .]?1/i },
  { id: "kling-1-6", test: /kling[-_ .]?1[-_ .]?6|kling[-_ .]?v1[-_ .]?6/i },
  { id: "kling-1-5", test: /kling[-_ .]?1[-_ .]?5|kling[-_ .]?v1[-_ .]?5/i },
  { id: "kling-1", test: /kling[-_ .]?1(?:\b|[-_])|kling[-_ .]?v1(?:\b|[-_])/i },
  { id: "grok-imagine-video-1-5-preview", test: /grok[-_ .]?imagine[-_ .]?video[-_ .]?1[-_ .]?5/i },
  { id: "grok-imagine-video", test: /grok[-_ .]?imagine[-_ .]?video/i },
  { id: "grok-video-3-max", test: /grok[-_ .]?video[-_ .]?3[-_ .]?max/i },
  { id: "grok-video-3-pro", test: /grok[-_ .]?video[-_ .]?3[-_ .]?pro/i },
  { id: "grok-video-3", test: /grok[-_ .]?video[-_ .]?3/i },
  { id: "grok-1-5-video-15s", test: /grok[-_ .]?1[-_ .]?5[-_ .]?video[-_ .]?15s/i },
  { id: "grok-1-5-video-10s", test: /grok[-_ .]?1[-_ .]?5[-_ .]?video[-_ .]?10s/i },
  { id: "grok-1-5-video-6s", test: /grok[-_ .]?1[-_ .]?5[-_ .]?video[-_ .]?6s/i },
  { id: "alibaba-wan-2-7-i2v-official", test: /wan2?[-_ .]?7.*(?:i2v|image|图生|r2v)/i },
  { id: "alibaba-wan-2-7-t2v-official", test: /wan2?[-_ .]?7.*(?:t2v|text|文生)/i },
  { id: "alibaba-wan-2-7-videoedit", test: /wan2?[-_ .]?7.*(?:videoedit|video[-_ .]?edit|edit|编辑)/i }
];

function normalizeModelKey(value: string) {
  return value.toLowerCase().replace(/[^a-z0-9]+/g, "");
}

function officialTemplateFor(upstreamModelName: string): ModelCatalogItem | undefined {
  const normalized = normalizeModelKey(upstreamModelName);
  const exact = officialCatalog.find((item) => normalizeModelKey(item.name) === normalized || normalizeModelKey(item.id) === normalized);
  if (exact) return exact;
  const matched = officialAliasRules.find((rule) => rule.test.test(upstreamModelName));
  return matched ? officialVideoCatalog.find((item) => item.id === matched.id) : undefined;
}

function mergeOfficialAndChannelCapabilities(official: ModelCatalogItem | undefined, upstreamModelName: string, baseUrl: string) {
  const channelCapabilities = videoCapabilitiesForChannel(upstreamModelName, baseUrl);
  const officialCapabilities = official?.capabilities ?? channelCapabilities;
  return {
    ...officialCapabilities,
    modelCapability: modelCapabilityFor(officialCapabilities, official?.id ?? upstreamModelName),
    channelCapability: pickChannelCapability(channelCapabilities)
  } satisfies ModelCapabilities;
}

function errorText(error: unknown) {
  const message = error instanceof Error ? error.message : "";
  if (/internal server error/i.test(message)) return "设置服务暂时不可用，请确认后端服务已启动并已登录当前工作空间。";
  if (/failed to fetch|network|fetch failed/i.test(message)) return "无法连接后端服务，请确认本地服务或云端 API 正常运行。";
  if (/401|unauthorized|未登录|登录/i.test(message)) return "登录会话已失效，请重新登录后再配置模型。";
  if (/403|forbidden|权限/i.test(message)) return "当前账号没有模型配置权限，请切换到工作空间管理员。";
  return message || "操作失败，请确认后端服务已启动。";
}

function normalizeBaseUrl(value: string) {
  const normalized = value.trim().replace(/\/+$/, "");
  try {
    const url = new URL(normalized);
    if (/^(?:grsaiapi\.com|grsai\.dakka\.com\.cn)$/i.test(url.hostname)) {
      if (/\/v1\/api\/(?:generate|result)$/i.test(url.pathname)) return url.origin;
      if (!url.pathname || url.pathname === "/") return url.origin;
    }
    if (url.hostname.toLowerCase() === "open.bigmodel.cn") return `${url.origin}/api/paas/v4`;
    if (url.hostname.toLowerCase() === "apihub.agnes-ai.com") return url.origin;
    if (!url.pathname || url.pathname === "/") return `${url.origin}/v1`;
  } catch {
    return normalized;
  }
  return normalized;
}

function apiHost(value?: string) {
  if (!value) return "";
  try {
    return new URL(value).host.replace(/^www\./, "");
  } catch {
    return value.replace(/^https?:\/\//i, "").replace(/\/.*$/, "");
  }
}

function isGrsaiApiRoute(value?: string) {
  const host = apiHost(value).toLowerCase();
  return host === "grsaiapi.com" || host === "grsai.dakka.com.cn";
}

function isOfficialApiRoute(value?: string) {
  const host = apiHost(value).toLowerCase();
  return host === "api.openai.com"
    || host === "api.x.ai"
    || host === "generativelanguage.googleapis.com"
    || host.endsWith("aiplatform.googleapis.com")
    || host.endsWith("volces.com")
    || host.endsWith("volcengineapi.com")
    || host.endsWith("dashscope.aliyuncs.com")
    || host.includes("klingai.com")
    || host === "api.minimax.io"
    || host === "api.minimaxi.com"
    || host === "open.bigmodel.cn"
    || host === "apihub.agnes-ai.com";
}

function relayProviderLabel(baseUrl: string) {
  const host = apiHost(baseUrl);
  return host ? `${host} 中转` : "自定义中转";
}

function classifyModel(modelName: string): ModelCategory {
  const official = officialTemplateFor(modelName);
  if (official?.category === "video" || official?.category === "image" || official?.category === "text") return official.category;
  const name = modelName.toLowerCase();
  if (/^(?:glm-image|cogview)/.test(name) || /seedream|gpt-image|dall-e|imagen|image-preview|grok.*image|jimeng-(?!video)|flux|recraft|ideogram|midjourney|qwen[-_ .]?image|image|图像|图片/.test(name)) return "image";
  if (/^(?:cogvideox|vidu)/.test(name) || /seedance|kling|veo|omni[-_ .]?(?:fast|flash)|grok.*video|grok-.*video|sora|jimeng-video|hailuo|hunyuan|wan\d|qwen-video|video/.test(name)) return "video";
  return "text";
}

function inferModel(modelName: string, baseUrl = ""): Pick<ModelConfig, "provider" | "providerId" | "category" | "modelType" | "capabilities" | "displayName"> {
  const name = modelName.toLowerCase();
  const host = apiHost(baseUrl).toLowerCase();
  if (host === "open.bigmodel.cn" && /^(?:glm-image|cogview)/.test(name)) {
    const glmImage = name === "glm-image";
    const capabilities: ModelCapabilities = {
      inputModes: ["text-to-image"],
      imageAspectRatios: imageRatios,
      imageSizes: glmImage
        ? ["1280x1280", "1568x1056", "1056x1568", "1472x1088", "1088x1472", "1728x960", "960x1728"]
        : ["1024x1024", "768x1344", "864x1152", "1344x768", "1152x864", "1440x720", "720x1440"],
      imageQualities: glmImage ? ["hd"] : ["standard", "hd"],
      imageFormats: ["png"],
      supportsImageInput: false,
      supportsMultiImageInput: false,
      supportsReferenceImage: false
    };
    return {
      provider: "智普 BigModel 官方",
      providerId: "zhipu",
      category: "image",
      modelType: "text-to-image",
      capabilities: { ...capabilities, modelCapability: modelCapabilityFor(capabilities, modelName) },
      displayName: modelName
    };
  }
  if (host === "open.bigmodel.cn" && /^(?:cogvideox|vidu)/.test(name)) {
    const capabilities = zhipuVideoCapabilitiesFor(modelName);
    return {
      provider: "智普 BigModel 官方",
      providerId: "zhipu",
      category: "video",
      modelType: name.includes("text") ? "text-to-video" : "image-to-video",
      capabilities: { ...capabilities, modelCapability: modelCapabilityFor(capabilities, modelName) },
      displayName: modelName
    };
  }
  if (host === "apihub.agnes-ai.com") {
    const capabilities: ModelCapabilities = {
      ...defaultVideoCapabilities,
      provider: "agnes",
      channel: "official",
      apiFamily: "agnes_video",
      createEndpoint: "/v1/videos",
      endpoint: "/v1/videos",
      pollEndpoint: "/agnesapi?video_id={taskId}",
      requestFormat: "json",
      taskMode: "async",
      idField: "video_id",
      taskIdField: "video_id",
      statusField: "status",
      resultField: "",
      imageTransport: "url",
      imageField: "image",
      inputModes: ["text-to-video", "image-to-video", "reference-to-video", "first-last-frame"],
      supportedInputs: ["text", "image", "first_frame", "reference_image", "first_last_frame"],
      supportsImageInput: true,
      supportsReferenceImage: true,
      supportsMultiImageInput: true,
      supportsFirstLastFrame: true
    };
    return {
      provider: "Agnes AI 官方",
      providerId: "agnes",
      category: "video",
      modelType: "image-to-video",
      capabilities: { ...capabilities, modelCapability: modelCapabilityFor(capabilities, "agnes-video-v2.0") },
      displayName: "Agnes Video V2.0"
    };
  }
  if (isGrsaiApiRoute(baseUrl)) {
    const nano2 = /nano[-_ .]?banana[-_ .]?2/.test(name);
    const normalGptImage2 = /gpt[-_ .]?image[-_ .]?2$/.test(name);
    const capabilities: ModelCapabilities = {
      inputModes: ["text-to-image", "image-to-image", "image-edit"],
      imageAspectRatios: nano2 ? [...grsaiImageRatios, "1:4", "4:1", "1:8", "8:1"] : grsaiImageRatios,
      imageSizes: normalGptImage2 ? ["1K"] : grsaiImageSizes,
      imageQualities: ["auto", "standard", "high"],
      imageFormats: ["png"],
      supportsImageInput: true,
      supportsMultiImageInput: true,
      supportsReferenceImage: true,
      supportsMask: false,
      supportsTransparentBackground: false
    };
    return {
      provider: relayProviderLabel(baseUrl),
      providerId: "grsai",
      category: "image",
      modelType: "image-edit",
      capabilities: { ...capabilities, modelCapability: modelCapabilityFor(capabilities, modelName) },
      displayName: modelName
    };
  }
  const official = officialTemplateFor(modelName);
  if (official) {
    const officialRoute = isOfficialApiRoute(baseUrl);
    const capabilities = {
      ...official.capabilities,
      modelCapability: modelCapabilityFor(official.capabilities, officialRoute ? official.id : modelName)
    };
    return {
      provider: officialRoute ? official.provider : relayProviderLabel(baseUrl),
      providerId: official.providerId,
      category: official.category,
      modelType: official.modelType,
      capabilities,
      displayName: officialRoute ? official.displayName : modelName
    };
  }
  const category = classifyModel(modelName);
  if (category === "image") {
    const isGeminiImage = /gemini.*image|image.*gemini|nano[-_ .]?banana|imagen/.test(name);
    const isVolcengineImage = /seedream|doubao[-_]?seedream/.test(name);
    const isAlibabaImage = isQwenImageEditModel(modelName) || isQwenImageTextModel(modelName);
    const capabilities = imageCapabilitiesFor(modelName);
    return {
      provider: baseUrl && !isOfficialApiRoute(baseUrl) ? relayProviderLabel(baseUrl) : isAlibabaImage ? "通义万相 / 阿里百炼" : isVolcengineImage ? "Seedream / 火山方舟" : isGeminiImage ? "Gemini 图像中转" : "OpenAI 兼容图像中转",
      providerId: isAlibabaImage ? "alibaba" : isVolcengineImage ? "seedance" : isGeminiImage ? "google" : "openai",
      category,
      modelType: isQwenImageEditModel(modelName) ? "image-edit" : "text-to-image",
      capabilities,
      displayName: baseUrl && !isOfficialApiRoute(baseUrl) ? modelName : displayNameFor(modelName)
    };
  }
  if (category === "text") {
    return {
      provider: baseUrl && !isOfficialApiRoute(baseUrl) ? relayProviderLabel(baseUrl) : "OpenAI 兼容文本中转",
      providerId: "deepseek",
      category,
      modelType: "text",
      capabilities: { ...defaultTextCapabilities, modelCapability: modelCapabilityFor(defaultTextCapabilities, modelName) },
      displayName: baseUrl && !isOfficialApiRoute(baseUrl) ? modelName : displayNameFor(modelName)
    };
  }
  const capabilities = videoCapabilitiesFor(modelName);
  return {
    provider: baseUrl && !isOfficialApiRoute(baseUrl) ? relayProviderLabel(baseUrl) : "OpenAI 兼容视频中转",
    providerId: "openai-video",
    category,
    modelType: /grok|xai/.test(name) ? "text-to-video" : "image-to-video",
    capabilities: { ...capabilities, modelCapability: modelCapabilityFor(capabilities, modelName) },
    displayName: baseUrl && !isOfficialApiRoute(baseUrl) ? modelName : displayNameFor(modelName)
  };
}

function displayNameFor(modelName: string) {
  return officialTemplateFor(modelName)?.displayName ?? modelName;
}

function uniqueModels(values: string[]) {
  return Array.from(new Set(values.map((item) => item.trim()).filter(Boolean)));
}

function StatusMessage({ message, tone = "muted" }: { message: string; tone?: "muted" | "success" | "danger" }) {
  if (!message) return null;
  const color = tone === "success" ? "text-emerald-200" : tone === "danger" ? "text-red-200" : "text-white/45";
  return <div className={`text-[12px] leading-5 ${color}`}>{message}</div>;
}

type FetchedModelGroup = {
  key: string;
  label: string;
  category: ModelCategory;
  models: string[];
  official?: ModelCatalogItem;
};

type EnabledModelGroup = {
  key: string;
  label: string;
  models: ModelConfig[];
};

function groupFetchedModels(models: string[], baseUrl = ""): FetchedModelGroup[] {
  const groups = new Map<string, FetchedModelGroup>();
  for (const model of models) {
    const category = classifyModel(model);
    const official = isOfficialApiRoute(baseUrl) ? officialTemplateFor(model) : undefined;
    const key = official ? `${category}:official:${official.id}` : `${category}:raw:${model}`;
    const existing = groups.get(key);
    if (existing) {
      existing.models.push(model);
      continue;
    }
    groups.set(key, {
      key,
      label: official?.displayName ?? model,
      category,
      models: [model],
      official
    });
  }
  return Array.from(groups.values());
}

function groupSelectionState(group: FetchedModelGroup, selectedModels: Set<string>) {
  const selectedCount = group.models.filter((model) => selectedModels.has(model)).length;
  return {
    selectedCount,
    allSelected: selectedCount === group.models.length,
    partiallySelected: selectedCount > 0 && selectedCount < group.models.length
  };
}

function groupEnabledModels(models: ModelConfig[]): EnabledModelGroup[] {
  const groups = new Map<string, EnabledModelGroup>();
  for (const model of models) {
    const modelName = model.modelName || model.displayName || model.id;
    const official = officialTemplateFor(modelName);
    const modelCapability = model.capabilities?.modelCapability?.model;
    const baseLabel = official?.displayName || model.displayName || model.modelName;
    const host = apiHost(model.apiBaseUrl);
    const label = host ? `${baseLabel} · ${host}` : baseLabel;
    const channelKey = model.apiBaseUrl?.trim().replace(/\/+$/, "").toLowerCase() || model.providerId || model.provider || "default";
    const key = official ? `official:${official.id}:${channelKey}` : modelCapability ? `capability:${modelCapability}:${channelKey}` : `raw:${baseLabel}:${channelKey}`;
    const existing = groups.get(key);
    if (existing) {
      existing.models.push(model);
      continue;
    }
    groups.set(key, { key, label, models: [model] });
  }
  return Array.from(groups.values());
}

function savedApiRoutes(models: ModelConfig[]) {
  const routes = new Map<string, { baseUrl: string; host: string; count: number; updatedAt: number }>();
  for (const model of models) {
    const baseUrl = normalizeBaseUrl(model.apiBaseUrl);
    if (!baseUrl) continue;
    const key = baseUrl.toLowerCase();
    const existing = routes.get(key);
    const updatedAt = model.updatedAt ?? model.createdAt ?? 0;
    if (existing) {
      existing.count += 1;
      existing.updatedAt = Math.max(existing.updatedAt, updatedAt);
      continue;
    }
    routes.set(key, { baseUrl, host: apiHost(baseUrl) || baseUrl, count: 1, updatedAt });
  }
  return Array.from(routes.values()).sort((a, b) => b.updatedAt - a.updatedAt);
}

type CategoryDraft = {
  apiBaseUrl: string;
  apiKey: string;
  manualModel: string;
  fetchedModels: string[];
  selectedModels: Set<string>;
};

function emptyCategoryDraft(): CategoryDraft {
  return { apiBaseUrl: "", apiKey: "", manualModel: "", fetchedModels: [], selectedModels: new Set() };
}

export function ModelConfigCenter() {
  const { modelConfigs, fetchModelConfigs, saveModelConfigsBulk, deleteModelConfigs } = useModelConfigStore();
  const [activeCategory, setActiveCategory] = useState<ModelCategory>("image");
  const [categoryDrafts, setCategoryDrafts] = useState<Record<ModelCategory, CategoryDraft>>({
    image: emptyCategoryDraft(),
    text: emptyCategoryDraft(),
    video: emptyCategoryDraft()
  });
  const [busy, setBusy] = useState<"verify" | "pull" | "save" | "delete" | "">("");
  const [message, setMessage] = useState("");
  const [messageTone, setMessageTone] = useState<"muted" | "success" | "danger">("muted");

  const { apiBaseUrl, apiKey, manualModel, fetchedModels, selectedModels } = categoryDrafts[activeCategory];

  function updateCategoryDraft(category: ModelCategory, patch: Partial<CategoryDraft> | ((current: CategoryDraft) => Partial<CategoryDraft>)) {
    setCategoryDrafts((current) => {
      const categoryDraft = current[category];
      const nextPatch = typeof patch === "function" ? patch(categoryDraft) : patch;
      return { ...current, [category]: { ...categoryDraft, ...nextPatch } };
    });
  }

  function setApiBaseUrl(value: string) {
    updateCategoryDraft(activeCategory, { apiBaseUrl: value });
  }

  function setApiKey(value: string) {
    updateCategoryDraft(activeCategory, { apiKey: value });
  }

  function setManualModel(value: string) {
    updateCategoryDraft(activeCategory, { manualModel: value });
  }

  function setFetchedModels(value: string[] | ((current: string[]) => string[])) {
    updateCategoryDraft(activeCategory, (current) => ({ fetchedModels: typeof value === "function" ? value(current.fetchedModels) : value }));
  }

  function setSelectedModels(value: Set<string> | ((current: Set<string>) => Set<string>)) {
    updateCategoryDraft(activeCategory, (current) => ({ selectedModels: typeof value === "function" ? value(current.selectedModels) : value }));
  }

  useEffect(() => {
    fetchModelConfigs().catch((error) => {
      setMessage(errorText(error));
      setMessageTone("danger");
    });
  }, [fetchModelConfigs]);

  const videoConfigs = useMemo(() => modelConfigs.filter((model) => model.category === "video" || ["text-to-video", "image-to-video", "video-to-video"].includes(model.modelType)), [modelConfigs]);
  const imageConfigs = useMemo(() => modelConfigs.filter((model) => model.category === "image" || ["text-to-image", "image-to-image", "image-edit", "image"].includes(model.modelType)), [modelConfigs]);
  const textConfigs = useMemo(() => modelConfigs.filter((model) => model.category === "text" || model.modelType === "text"), [modelConfigs]);
  const activeConfigs = activeCategory === "image" ? imageConfigs : activeCategory === "text" ? textConfigs : videoConfigs;
  const apiRoutes = useMemo(() => savedApiRoutes(activeConfigs), [activeConfigs]);
  const categorizedFetchedModels = useMemo(() => ({
    image: fetchedModels.filter((model) => classifyModel(model) === "image"),
    video: fetchedModels.filter((model) => classifyModel(model) === "video"),
    text: fetchedModels.filter((model) => classifyModel(model) === "text")
  }), [fetchedModels]);
  const groupedFetchedModels = useMemo(() => ({
    image: groupFetchedModels(categorizedFetchedModels.image, apiBaseUrl),
    video: groupFetchedModels(categorizedFetchedModels.video, apiBaseUrl),
    text: groupFetchedModels(categorizedFetchedModels.text, apiBaseUrl)
  }), [apiBaseUrl, categorizedFetchedModels]);
  const savedCategoryCounts = useMemo(() => ({
    image: imageConfigs.length,
    text: textConfigs.length,
    video: videoConfigs.length
  }), [imageConfigs.length, textConfigs.length, videoConfigs.length]);
  const selectedActiveModels = useMemo(() => (
    categorizedFetchedModels[activeCategory].filter((model) => selectedModels.has(model))
  ), [activeCategory, categorizedFetchedModels, selectedModels]);
  const selectedActiveGroupCount = useMemo(() => (
    groupedFetchedModels[activeCategory].filter((group) => group.models.some((model) => selectedModels.has(model))).length
  ), [activeCategory, groupedFetchedModels, selectedModels]);
  const manualActiveModelCount = useMemo(() => (
    uniqueModels(manualModel.split(/[\n,，\s]+/)).filter((model) => classifyModel(model) === activeCategory).length
  ), [activeCategory, manualModel]);
  const saveCandidateCount = selectedActiveModels.length || manualActiveModelCount;

  function toggleModelGroup(group: FetchedModelGroup) {
    setSelectedModels((current) => {
      const next = new Set(current);
      const allSelected = group.models.every((model) => next.has(model));
      for (const model of group.models) {
        if (allSelected) next.delete(model);
        else next.add(model);
      }
      return next;
    });
  }

  function selectCategory(category: ModelCategory, selected: boolean) {
    setSelectedModels((current) => {
      const next = new Set(current);
      for (const model of categorizedFetchedModels[category]) {
        if (selected) next.add(model);
        else next.delete(model);
      }
      return next;
    });
  }

  function resetLineDraft() {
    updateCategoryDraft(activeCategory, emptyCategoryDraft());
    setMessage("");
    setMessageTone("muted");
  }

  function changeCategory(category: ModelCategory) {
    setActiveCategory(category);
    setMessage("");
    setMessageTone("muted");
  }

  function loadSavedRoute(baseUrl: string) {
    const routeModels = activeConfigs.filter((model) => normalizeBaseUrl(model.apiBaseUrl).toLowerCase() === baseUrl.toLowerCase());
    updateCategoryDraft(activeCategory, {
      apiBaseUrl: baseUrl,
      apiKey: "",
      manualModel: "",
      fetchedModels: routeModels.map((model) => model.modelName),
      selectedModels: new Set(routeModels.map((model) => model.modelName))
    });
    setMessage(routeModels.some((model) => model.maskedApiKey)
      ? "已载入该线路。API Key 已加密保存；如需增删模型，请重新输入 Key 后保存。"
      : "已载入该线路，请输入 API Key 后验证或更新模型。");
    setMessageTone("muted");
    if (typeof window !== "undefined") window.localStorage.setItem(lastApiRouteStorageKey, baseUrl);
  }

  function addManualModelsToActiveCategory() {
    const models = uniqueModels(manualModel.split(/[\n,，\s]+/));
    if (!models.length) return;
    const accepted = models.filter((model) => classifyModel(model) === activeCategory);
    const rejected = models.length - accepted.length;
    if (!accepted.length) {
      setMessage(`当前正在配置${categoryMeta[activeCategory].label}，请切换分类后再添加这些模型。`);
      setMessageTone("danger");
      return;
    }
    setFetchedModels((current) => uniqueModels([...current, ...accepted]));
    setSelectedModels((current) => new Set([...current, ...accepted]));
    setManualModel("");
    if (rejected > 0) {
      setMessage(`已添加 ${accepted.length} 个${categoryMeta[activeCategory].label}模型；${rejected} 个不属于当前分类，已跳过。`);
      setMessageTone("muted");
    }
  }

  async function deleteModelIds(ids: string[]) {
    if (!ids.length) return;
    setBusy("delete");
    try {
      const result = await deleteModelConfigs(ids);
      setMessage(`已删除 ${result.deletedCount} 个模型配置。`);
      setMessageTone("success");
    } finally {
      setBusy("");
    }
  }

  async function pullModels() {
    setBusy("pull");
    setMessage("");
    try {
      const normalizedBaseUrl = normalizeBaseUrl(apiBaseUrl);
      const result = await modelConfigApi.probe({ apiBaseUrl: normalizedBaseUrl, apiKey, validationPath: "/models", pullModels: true, category: activeCategory });
      if (typeof window !== "undefined") window.localStorage.setItem(lastApiRouteStorageKey, normalizedBaseUrl);
      setApiBaseUrl(normalizedBaseUrl);
      setMessage(result.message);
      setMessageTone(result.success ? "success" : "danger");
      if (result.models.length) {
        const categoryModels = result.models.filter((model) => classifyModel(model) === activeCategory);
        setFetchedModels(categoryModels);
        const autoSelectedModels = categoryModels.filter((model) => activeCategory !== "video" || officialTemplateFor(model));
        const skippedVideoCount = categoryModels.filter((model) => activeCategory === "video" && !officialTemplateFor(model)).length;
        setSelectedModels(new Set(autoSelectedModels));
        if (!categoryModels.length) {
          setMessage(`${result.message} 但没有识别到${categoryMeta[activeCategory].label}模型，请检查线路类型或手动添加模型 ID。`);
          setMessageTone("danger");
        }
        if (skippedVideoCount > 0) {
          setMessage(`${result.message} 已默认勾选官方可识别模型；${skippedVideoCount} 个未知视频模型需手动确认后启用。`);
        }
      }
    } catch (error) {
      setMessage(errorText(error));
      setMessageTone("danger");
    } finally {
      setBusy("");
    }
  }

  async function verifyRoute() {
    setBusy("verify");
    setMessage("");
    try {
      const normalizedBaseUrl = normalizeBaseUrl(apiBaseUrl);
      const result = await modelConfigApi.probe({ apiBaseUrl: normalizedBaseUrl, apiKey, validationPath: "/models", pullModels: false, category: activeCategory });
      setApiBaseUrl(normalizedBaseUrl);
      setMessage(result.message);
      setMessageTone(result.success ? "success" : "danger");
    } catch (error) {
      setMessage(errorText(error));
      setMessageTone("danger");
    } finally {
      setBusy("");
    }
  }

  async function saveModels() {
    const manualModels = uniqueModels(manualModel.split(/[\n,，\s]+/)).filter((model) => classifyModel(model) === activeCategory);
    const models = uniqueModels([...selectedActiveModels, ...manualModels]);
    if (!normalizeBaseUrl(apiBaseUrl) || !apiKey.trim() || models.length === 0) {
      setMessage("请填写请求地址、API Key，并至少选择或添加一个模型。");
      setMessageTone("danger");
      return;
    }
    setBusy("save");
    setMessage("");
    try {
      const payloads = models.map((modelName) => {
        const normalizedBaseUrl = normalizeBaseUrl(apiBaseUrl);
        const inferred = inferModel(modelName, normalizedBaseUrl);
        const official = officialTemplateFor(modelName);
        return {
          providerId: inferred.providerId,
          provider: inferred.provider,
          category: inferred.category,
          displayName: inferred.displayName,
          apiBaseUrl: normalizedBaseUrl,
          requiresApiBaseUrl: true,
          apiKey: apiKey.trim(),
          modelName,
          modelType: inferred.modelType as ModelType,
          enabled: true,
          capabilities: inferred.category === "video"
            ? mergeOfficialAndChannelCapabilities(isOfficialApiRoute(normalizedBaseUrl) ? official : undefined, modelName, normalizedBaseUrl)
            : inferred.capabilities
        } satisfies Partial<ModelConfig> & { apiKey?: string };
      });
      const result = await saveModelConfigsBulk(payloads, false);
      const savedRoute = normalizeBaseUrl(apiBaseUrl);
      if (typeof window !== "undefined") window.localStorage.setItem(lastApiRouteStorageKey, savedRoute);
      setApiBaseUrl(savedRoute);
      setApiKey("");
      setManualModel("");
      setFetchedModels(models);
      setSelectedModels(new Set(models));
      setMessage(`${categoryMeta[activeCategory].label}同步成功：新增 ${result.createdCount} 个、更新 ${result.updatedCount} 个。API Key 已加密保存并从输入框清空；其它中转线路已保留。`);
      setMessageTone("success");
    } catch (error) {
      setMessage(errorText(error));
      setMessageTone("danger");
    } finally {
      setBusy("");
    }
  }

  return (
    <div className="space-y-5">
      <section className="settings-section overflow-hidden">
        <div className="p-5 md:p-6">
            <div className="flex flex-wrap items-start justify-between gap-3">
              <div>
                <div className="flex items-center gap-2"><KeyRound size={17} className="text-white/65" /><h2 className="text-[20px] font-semibold text-white">API 接入</h2></div>
                <p className="mt-1 max-w-[720px] text-[13px] leading-5 text-white/48">图片、文本、视频使用独立线路与凭证。切换分类不会覆盖未保存的输入，也不会把模型保存到错误分类。</p>
              </div>
              <div className="rounded-full border border-emerald-300/15 bg-emerald-300/[0.06] px-3 py-1.5 text-[12px] text-emerald-100">
                {imageConfigs.length + videoConfigs.length + textConfigs.length} 个模型已启用
              </div>
            </div>

            <div className="mt-5 rounded-[16px] border border-white/[0.08] bg-[#111115]">
              <div className="flex items-center justify-between border-b border-white/[0.08] px-5 py-4">
                <div>
                  <div className="text-[15px] font-semibold text-white">API 配置</div>
                  <p className="mt-1 text-[12px] text-white/42">先选择能力类型，再验证地址、拉取模型并保存。</p>
                </div>
              </div>

              <div className="space-y-5 p-5">
                <div className="grid grid-cols-3 gap-1 rounded-[14px] border border-white/[0.08] bg-black/25 p-1">
                  {categoryOrder.map((category) => {
                    const meta = categoryMeta[category];
                    const Icon = meta.icon;
                    const enabledCount = savedCategoryCounts[category];
                    const pulledCount = groupedFetchedModels[category].length;
                    const active = activeCategory === category;
                    return (
                      <button
                        key={category}
                        type="button"
                        onClick={() => changeCategory(category)}
                        className={`flex h-12 items-center justify-center gap-2 rounded-[11px] text-[12px] transition duration-200 ${active ? "bg-white/[0.10] text-white shadow-[inset_0_1px_0_rgba(255,255,255,0.06)]" : "text-white/42 hover:bg-white/[0.04] hover:text-white/70"}`}
                      >
                        <Icon size={15} />
                        <span>{meta.label}</span>
                        <span className="rounded-full bg-white/[0.08] px-1.5 py-0.5 text-[10px] text-white/55">{enabledCount}</span>
                        {enabledCount > 0 && <span className={`h-1.5 w-1.5 rounded-full ${meta.accentClass}`} />}
                        {pulledCount > 0 && active && <span className="rounded-full bg-black/25 px-1.5 py-0.5 text-[10px] text-white/50">拉取 {pulledCount}</span>}
                      </button>
                    );
                  })}
                </div>

                <div className="flex flex-wrap items-center justify-between gap-3">
                  <div className="flex flex-wrap gap-2">
                    {apiRoutes.map((route, index) => {
                      const active = normalizeBaseUrl(apiBaseUrl).toLowerCase() === route.baseUrl.toLowerCase();
                      return <button key={route.baseUrl} type="button" title={route.baseUrl} onClick={() => loadSavedRoute(route.baseUrl)} className={`rounded-full border px-3 py-2 text-[12px] transition ${active ? "border-white/25 bg-white/[0.10] text-white" : "border-white/[0.08] bg-white/[0.025] text-white/48 hover:bg-white/[0.06] hover:text-white/75"}`}>线路 {index + 1}<span className="ml-2 text-[10px] text-white/35">{route.host}</span></button>;
                    })}
                    {!apiRoutes.length && <span className="py-2 text-[12px] text-white/35">当前分类还没有已保存线路</span>}
                  </div>
                  <button
                    type="button"
                    onClick={resetLineDraft}
                    className="inline-flex items-center gap-2 rounded-full border border-dashed border-white/[0.12] px-4 py-2 text-[12px] text-white/45 transition hover:border-white/[0.22] hover:bg-white/[0.04] hover:text-white/75"
                  >
                    <Plus size={14} /> 添加线路
                  </button>
                </div>

                <div className="rounded-[14px] border border-white/[0.08] bg-[#17171b] p-4 md:p-5">
                  <div className="mb-4 flex items-start justify-between gap-4">
                    <div>
                      <div className="text-[15px] font-semibold text-white">{categoryMeta[activeCategory].title}</div>
                      <p className="mt-1 text-[12px] text-white/38">本条线路使用独立的请求地址与 API Key，可同时保留多个中转。</p>
                    </div>
                    <div className="rounded-full bg-white/[0.06] px-2.5 py-1 text-[11px] text-white/45">
                      已选 {selectedActiveGroupCount} 组 · {selectedActiveModels.length} / {categorizedFetchedModels[activeCategory].length}
                    </div>
                  </div>

                  <div className="grid gap-3 lg:grid-cols-[1.25fr_1fr_auto]">
                    <label className="space-y-2">
                      <span className="text-[12px] font-medium text-white/50">请求地址</span>
                      <Input className="h-11 rounded-[11px] bg-black/35" value={apiBaseUrl} onChange={(event) => setApiBaseUrl(event.target.value)} placeholder="https://api.example.com/v1" />
                    </label>
                    <label className="space-y-2">
                      <span className="text-[12px] font-medium text-white/50">API Key</span>
                      <Input className="h-11 rounded-[11px] bg-black/35" type="password" value={apiKey} onChange={(event) => setApiKey(event.target.value)} placeholder="此线路独立 Key" />
                    </label>
                    <div className="flex items-end gap-2">
                      <Button className="h-11 rounded-full border border-white/[0.10] bg-transparent text-white/75 hover:bg-white/[0.06]" onClick={() => void verifyRoute()} disabled={busy === "verify" || !apiBaseUrl || !apiKey}>
                        {busy === "verify" ? <Loader2 size={15} className="animate-spin" /> : <Check size={15} />} 验证
                      </Button>
                      <Button className="h-11 rounded-full" onClick={() => void pullModels()} disabled={busy === "pull" || !apiBaseUrl || !apiKey}>
                        {busy === "pull" ? <Loader2 size={15} className="animate-spin" /> : <RefreshCw size={15} />} 拉取模型
                      </Button>
                    </div>
                  </div>

                  <div className="mt-4">
                    <StatusMessage message={message} tone={messageTone} />
                  </div>

                  <div className="mt-4 border-t border-white/[0.08] pt-4">
                    <div className="mb-3 flex items-center justify-between">
                      <div>
                        <div className="text-[13px] font-semibold text-white">模型列表</div>
                        <div className="mt-1 text-[11px] text-white/35">只保存当前分类模型；例如图片线路不会误保存视频或文本模型。</div>
                      </div>
                      <span className="rounded-full bg-white/[0.06] px-2 py-1 text-[11px] text-white/45">{groupedFetchedModels[activeCategory].length}</span>
                    </div>
                    {fetchedModels.length ? (
                      <div>
                        <div className="flex items-center justify-between gap-2">
                          <div className="text-[11px] text-white/30">
                            当前分类：{groupedFetchedModels[activeCategory].length} 组 · {categorizedFetchedModels[activeCategory].length} 个上游 ID
                          </div>
                          <div className="flex gap-2">
                            <button type="button" onClick={() => selectCategory(activeCategory, true)} className="rounded-full border border-white/[0.08] px-2.5 py-1 text-[11px] text-white/55 hover:bg-white/[0.06] hover:text-white">全选当前</button>
                            <button type="button" onClick={() => selectCategory(activeCategory, false)} className="rounded-full border border-white/[0.08] px-2.5 py-1 text-[11px] text-white/45 hover:bg-white/[0.06] hover:text-white">取消当前</button>
                          </div>
                        </div>
                        <div className="mt-3 flex min-h-[76px] max-h-[180px] flex-wrap content-start gap-2 overflow-auto rounded-[10px] border border-white/[0.07] bg-black/15 p-3">
                          {groupedFetchedModels[activeCategory].map((group) => {
                            const meta = categoryMeta[activeCategory];
                            const { selectedCount, allSelected, partiallySelected } = groupSelectionState(group, selectedModels);
                            return (
                              <button
                                key={group.key}
                                type="button"
                                title={group.models.join("\n")}
                                onClick={() => toggleModelGroup(group)}
                                className={`inline-flex items-center gap-2 rounded-full border px-3 py-1.5 text-[12px] transition duration-200 ${allSelected ? meta.activeClass : partiallySelected ? "border-amber-200/35 bg-amber-300/[0.08] text-amber-100" : "border-white/[0.08] bg-white/[0.03] text-white/45 hover:bg-white/[0.06] hover:text-white/65"}`}
                              >
                                <span>{group.label}</span>
                                {group.models.length > 1 && (
                                  <span className="rounded-full bg-black/25 px-1.5 py-0.5 text-[10px] text-white/55">{selectedCount}/{group.models.length}</span>
                                )}
                              </button>
                            );
                          })}
                          {!groupedFetchedModels[activeCategory].length && (
                            <div className="grid w-full place-items-center text-[12px] text-white/30">当前上游没有返回{categoryMeta[activeCategory].label}</div>
                          )}
                        </div>
                      </div>
                    ) : (
                      <p className="text-[12px] leading-6 text-white/35">还没有拉取模型。填写请求地址和 API Key 后点击“拉取模型”；也可以手动输入当前分类的上游模型 ID。</p>
                    )}
                    <div className="mt-4 flex gap-2">
                      <Input className="h-11 rounded-[11px] bg-black/35" value={manualModel} onChange={(event) => setManualModel(event.target.value)} placeholder={`手动添加${categoryMeta[activeCategory].label}上游模型 ID`} />
                      <Button className="h-11 rounded-full" onClick={addManualModelsToActiveCategory}><Plus size={15} /> 添加</Button>
                    </div>
                    <div className="mt-4 flex flex-wrap items-center justify-between gap-3">
                      <div className={`text-[12px] ${saveCandidateCount ? "text-emerald-100/70" : "text-amber-100/70"}`}>
                        {saveCandidateCount ? `将保存并启用 ${saveCandidateCount} 个${categoryMeta[activeCategory].label}模型。` : "还没有选中模型：请先勾选上方模型，或手动添加当前分类的上游模型 ID。"}
                      </div>
                      <Button
                        className={`h-10 min-w-[176px] rounded-full ${saveCandidateCount ? "bg-white text-black hover:bg-white/90" : "border-amber-200/25 bg-amber-300/10 text-amber-100 disabled:opacity-100"}`}
                        onClick={() => void saveModels()}
                        disabled={busy === "save" || saveCandidateCount === 0}
                      >
                        {busy === "save" ? <Loader2 size={15} className="animate-spin" /> : <Check size={15} />} {saveCandidateCount ? `保存并启用 ${saveCandidateCount} 个模型` : "先选择模型"}
                      </Button>
                    </div>
                  </div>
                </div>
              </div>
            </div>
          </div>
      </section>

      <section className="grid gap-4 lg:grid-cols-3">
        {([
          ["image", imageConfigs],
          ["text", textConfigs],
          ["video", videoConfigs]
        ] as Array<[ModelCategory, ModelConfig[]]>).map(([category, models]) => {
          const meta = categoryMeta[category];
          const Icon = meta.icon;
          const groups = groupEnabledModels(models);
          return (
            <div key={category} className="rounded-[18px] border border-white/[0.08] bg-white/[0.025] p-4">
              <div className="mb-3 flex items-center justify-between">
                <div className="flex items-center gap-2 text-[14px] font-semibold text-white"><Icon size={16} /> 已启用{meta.label}</div>
                <div className="flex items-center gap-2">
                  {models.length > 0 && (
                    <button type="button" onClick={() => void deleteModelIds(models.map((model) => model.id))} disabled={busy === "delete"} className="rounded-full border border-red-200/15 px-2 py-1 text-[10px] text-red-100/70 hover:bg-red-400/10 hover:text-red-100">清空本类</button>
                  )}
                  <span className="rounded-full bg-white/[0.05] px-2 py-1 text-[10px] text-white/35">{groups.length} 组 · {models.length}</span>
                </div>
              </div>
              <div className="flex min-h-9 flex-wrap gap-2">
                {groups.map((group) => (
                  <span key={group.key} title={group.models.map((model) => model.modelName).join("\n")} className="inline-flex items-center gap-2 rounded-full border border-white/[0.08] bg-white/[0.04] px-3 py-1.5 text-[12px] text-white/65">
                    {group.label}
                    {group.models.length > 1 && <span className="rounded-full bg-black/25 px-1.5 py-0.5 text-[10px] text-white/45">{group.models.length}</span>}
                    <button type="button" title="删除" onClick={() => {
                      void deleteModelIds(group.models.map((model) => model.id));
                    }} disabled={busy === "delete"} className="text-white/35 hover:text-red-200"><Trash2 size={12} /></button>
                  </span>
                ))}
                {!models.length && <span className="text-[12px] text-white/35">暂无{meta.label}。</span>}
              </div>
              {category === "image" && <p className="mt-3 text-[11px] leading-5 text-white/25">仅新增中转模型配置，不修改现有图片 adapter 与图片参数。</p>}
            </div>
          );
        })}
      </section>
    </div>
  );
}
