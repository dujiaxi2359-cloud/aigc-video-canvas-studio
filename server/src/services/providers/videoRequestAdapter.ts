import type { GenerateVideoRequest } from "../model.service.js";
import type { ModelCapabilities } from "../../types/model.js";
import { legacyInputModeToOfficialMode } from "../../types/videoModes.js";
import type { VideoProviderParams } from "./providerTypes.js";
import { normalizeVideoCapabilities } from "../videoCapabilityNormalization.js";

export type VideoProviderName = "doubao" | "veo" | "kling" | "sora" | "wan" | "minimax" | "agnes" | "zhipu" | "custom";
export type VideoChannel = "official" | "proxy" | "legacy_custom";
export type VideoRequestFormat = "json" | "multipart";
export type VideoAuthType = "bearer" | "api-key" | "none";
export type VideoImageTransport = "url" | "url_or_asset" | "base64_json" | "multipart_file" | "unsupported";
export type VideoTransport = "url" | "url_or_asset" | "url_or_base64_json" | "base64_json" | "multipart_file" | "unsupported";
export type VideoSupportedInput = "text" | "image" | "first_frame" | "reference_image" | "first_last_frame" | "video";
export type VideoApiFamily =
  | "openai_videos"
  | "grok_video"
  | "doubao_seedance15"
  | "aigc_video_json"
  | "omni_fast"
  | "omni_fast_v2v"
  | "seedance2_native"
  | "unified_video_create"
  | "agnes_video"
  | "zhipu_video"
  | "official_provider";

export type VideoRequestConfig = {
  provider: VideoProviderName;
  channel: VideoChannel;
  apiFamily: VideoApiFamily;
  baseUrl: string;
  createEndpoint: string;
  endpoint: string;
  finalUrl: string;
  authType: VideoAuthType;
  requestFormat: VideoRequestFormat;
  taskMode: "async";
  pollEndpoint: string;
  idField: string;
  taskIdField: string;
  statusField: string;
  resultField: string;
  supportedInputs: VideoSupportedInput[];
  imageTransport: VideoImageTransport;
  videoTransport: VideoTransport;
  imageField?: string;
  videoField?: string;
  supportedAspectRatios: string[];
  supportedDurations: number[];
  supportedResolutions: string[];
};

function cleanUrlPart(value: string) {
  return value.trim().replace(/^(?:POST|GET|PUT|PATCH|DELETE)\s+/i, "").replace(/\/+$/g, "");
}

export function joinUrl(baseUrl: string, endpoint: string) {
  const cleanBase = cleanUrlPart(baseUrl);
  const cleanEndpoint = endpoint.trim().replace(/^\/+/g, "");
  if (!cleanBase) return `/${cleanEndpoint}`;
  if (!cleanEndpoint) return cleanBase;

  try {
    const base = new URL(cleanBase);
    const basePath = base.pathname.replace(/\/+$/g, "");
    let endpointPath = cleanEndpoint;
    if (basePath.endsWith("/v1") && endpointPath.toLowerCase().startsWith("v1/")) {
      endpointPath = endpointPath.slice(3);
    }
    const normalizedEndpoint = `/${endpointPath}`.replace(/\/{2,}/g, "/").toLowerCase();
    if (basePath.toLowerCase().endsWith(normalizedEndpoint)) {
      base.pathname = basePath;
      base.search = "";
      base.hash = "";
      return base.toString();
    }
    base.pathname = `${basePath}/${endpointPath}`.replace(/\/{2,}/g, "/");
    base.search = "";
    base.hash = "";
    return base.toString();
  } catch {
    const basePath = cleanBase.replace(/\/+$/g, "");
    let endpointPath = cleanEndpoint;
    if (basePath.toLowerCase().endsWith("/v1") && endpointPath.toLowerCase().startsWith("v1/")) {
      endpointPath = endpointPath.slice(3);
    }
    const normalizedEndpoint = `/${endpointPath}`.replace(/\/{2,}/g, "/").toLowerCase();
    if (basePath.toLowerCase().endsWith(normalizedEndpoint)) return basePath;
    return `${basePath}/${endpointPath}`.replace(/([^:]\/)\/+/g, "$1");
  }
}

function durationValues(capabilities: ModelCapabilities) {
  const duration = capabilities.duration;
  if (!duration) return [5, 8, 10];
  if (duration.type === "fixed") return [duration.value];
  if (duration.type === "enum") return duration.values;
  const values: number[] = [];
  for (let value = duration.min; value <= duration.max; value += duration.step) values.push(value);
  return values;
}

function inferProvider(providerId: string, modelName: string): VideoProviderName {
  const value = `${providerId} ${modelName}`.toLowerCase();
  if (/agnes/.test(providerId.toLowerCase())) return "agnes";
  if (/zhipu|bigmodel/.test(providerId.toLowerCase())) return "zhipu";
  if (/seedance|doubao|seedream/.test(value)) return "doubao";
  if (/veo|omni|gemini|google/.test(value)) return "veo";
  if (/kling|可灵/.test(value)) return "kling";
  if (/sora|openai/.test(value)) return "sora";
  if (/wan|通义|alibaba/.test(value)) return "wan";
  if (/minimax|hailuo|海螺/.test(value)) return "minimax";
  return "custom";
}

function isOfficialEndpoint(providerId: string, baseUrl: string) {
  if (!baseUrl) return false;
  const value = baseUrl.toLowerCase();
  if (/apihub\.agnes-ai\.com/.test(value)) return true;
  if (/open\.bigmodel\.cn/.test(value)) return true;
  if (providerId === "google") return /generativelanguage\.googleapis\.com/.test(value);
  if (providerId === "grok") return /api\.x\.ai/.test(value);
  if (providerId === "kling") return /klingai|kwaivgi|kling/.test(value) && !/\/v1(?:\/|$)/.test(value);
  if (providerId === "alibaba") return /dashscope|aliyuncs|alibaba/.test(value);
  if (providerId === "seedance") return /volc|volces|ark|bytedance|byteplus/.test(value);
  if (providerId === "minimax") return /api\.minimax\.io|api\.minimaxi\.com/.test(value);
  return false;
}

function isOpenAiCompatibleVideoEndpoint(baseUrl: string) {
  if (!baseUrl) return false;
  const value = baseUrl.toLowerCase().replace(/\/+$/g, "");
  if (/ai666\.net|cy88\.ai|runapi\.co/.test(value)) return true;
  try {
    const url = new URL(value);
    return /\/(?:v1|v1\/videos|v1\/video\/create|videos|video\/create)$/.test(url.pathname.replace(/\/+$/g, ""));
  } catch {
    return /\/(?:v1|v1\/videos|v1\/video\/create|videos|video\/create)$/.test(value);
  }
}

function inferApiFamily(channel: VideoChannel, baseUrl: string, modelName: string, capabilities: ModelCapabilities): VideoApiFamily {
  const value = `${baseUrl} ${modelName}`.toLowerCase();
  if (/apihub\.agnes-ai\.com/.test(baseUrl.toLowerCase()) || capabilities.provider === "agnes" || capabilities.apiFamily === "agnes_video") return "agnes_video";
  if (/open\.bigmodel\.cn/.test(baseUrl.toLowerCase()) || capabilities.provider === "zhipu" || capabilities.apiFamily === "zhipu_video") return "zhipu_video";
  // RunAPI exposes the unified JSON contract even when a migrated workspace
  // still carries an older `grok_video`/OpenAI capability snapshot.
  if (/runapi\.co/.test(value)) return "unified_video_create";
  if (channel === "official") return "official_provider";
  if (/grok[-_ .]?(?:imagine[-_ .]?video|video|1[-_ .]?5[-_ .]?video)/.test(value)) return "grok_video";
  if (/doubao[-_]?seedance[-_]?1[-_]?5/.test(value)) return "doubao_seedance15";
  if (/kling|可灵/.test(value)) return "aigc_video_json";
  if (/\/v1\/video\/create(?:\/|$)/.test(value)) return "unified_video_create";
  if (/\/v1\/video\/generations(?:\/|$)/.test(value)) return "seedance2_native";
  if (/omni[-_]?fast[-_]?v2v/.test(value)) return "omni_fast_v2v";
  if (/omni[-_]?fast|omni[-_]?flash/.test(value)) return "omni_fast";
  if (/doubao[-_]?seedance[-_]?2[-_]?0|seedance[-_ .]?2/.test(value)) return "seedance2_native";
  if (capabilities.apiFamily) return capabilities.apiFamily;
  return "openai_videos";
}

function knownRelayBase(baseUrl: string) {
  return /(?:ai\.)?(?:cy88\.ai|ai666\.net)|runapi\.co/i.test(baseUrl);
}

function defaultCreateEndpoint(channel: VideoChannel, baseUrl: string, capabilities: ModelCapabilities, apiFamily: VideoApiFamily) {
  if (apiFamily === "agnes_video") return "/v1/videos";
  if (apiFamily === "zhipu_video") return "/videos/generations";
  if (channel === "official") return "";
  const value = baseUrl.toLowerCase();
  if (/runapi\.co/.test(value)) return "/v1/video/create";
  if (knownRelayBase(baseUrl)) {
    if (apiFamily === "seedance2_native") return "/v1/video/generations";
    if (apiFamily === "unified_video_create") return "/v1/video/create";
    return "/v1/videos";
  }
  if (capabilities.createEndpoint) return capabilities.createEndpoint;
  if (capabilities.endpoint) return capabilities.endpoint;
  if (/\/v1\/video\/generations\/?$/.test(value)) return "/v1/video/generations";
  if (/\/v1\/video\/create\/?$/.test(value)) return "/v1/video/create";
  if (/\/v1\/videos\/?$/.test(value)) return "/v1/videos";
  if (apiFamily === "seedance2_native") return "/v1/video/generations";
  if (apiFamily === "unified_video_create") return "/v1/video/create";
  return "/v1/videos";
}

function defaultPollEndpoint(baseUrl: string, createEndpoint: string, capabilities: ModelCapabilities, apiFamily: VideoApiFamily) {
  if (apiFamily === "agnes_video") return "/agnesapi?video_id={taskId}";
  if (apiFamily === "zhipu_video") return "/async-result/{taskId}";
  if (/runapi\.co/i.test(baseUrl)) return "/v1/videos/{taskId}";
  if (knownRelayBase(baseUrl)) {
    if (apiFamily === "seedance2_native") return "/v1/video/generations/{taskId}";
    if (apiFamily === "unified_video_create") return "/v1/video/query?id={taskId}";
    return "/v1/videos/{taskId}";
  }
  if (capabilities.pollEndpoint) return capabilities.pollEndpoint;
  if (apiFamily === "unified_video_create" || /\/v1\/video\/create\/?$/i.test(createEndpoint)) return "/v1/video/query?id={taskId}";
  if (apiFamily === "seedance2_native") return "/v1/video/generations/{taskId}";
  return `${createEndpoint.replace(/\/+$/g, "")}/{taskId}`;
}

function defaultTaskField(apiFamily: VideoApiFamily, capabilities: ModelCapabilities) {
  if (apiFamily === "agnes_video") return capabilities.taskIdField ?? "video_id";
  return capabilities.taskIdField ?? capabilities.idField ?? (apiFamily === "seedance2_native" ? "task_id" : "id");
}

function defaultImageTransport(channel: VideoChannel, apiFamily: VideoApiFamily, capabilities: ModelCapabilities): VideoImageTransport {
  if (capabilities.imageTransport) return capabilities.imageTransport;
  if (!supportedInputs(capabilities).some((input) => ["image", "first_frame", "reference_image", "first_last_frame"].includes(input))) return "unsupported";
  if (apiFamily === "seedance2_native") return "url_or_asset";
  if (apiFamily === "agnes_video" || apiFamily === "zhipu_video") return "url";
  if (apiFamily === "grok_video") return "multipart_file";
  if (channel === "official") return "multipart_file";
  if (apiFamily === "doubao_seedance15") return "multipart_file";
  if (apiFamily === "aigc_video_json") return "url_or_asset";
  if (apiFamily === "openai_videos") return "base64_json";
  return "url";
}

function supportedInputs(capabilities: ModelCapabilities) {
  if (capabilities.supportedInputs?.length) return capabilities.supportedInputs;
  const result = new Set<VideoSupportedInput>();
  for (const mode of capabilities.inputModes) {
    if (mode === "text-to-video") result.add("text");
    if (mode === "image-to-video") { result.add("image"); result.add("first_frame"); }
    if (mode === "reference-to-video") { result.add("image"); result.add("reference_image"); }
    if (mode === "first-last-frame") result.add("first_last_frame");
    if (mode === "video-to-video") result.add("video");
  }
  return Array.from(result.size ? result : new Set<VideoSupportedInput>(["text"]));
}

export function channelSupportsImage(config: Pick<VideoRequestConfig, "supportedInputs" | "imageTransport">) {
  return config.supportedInputs.some((input) => ["image", "first_frame", "reference_image", "first_last_frame"].includes(input))
    && config.imageTransport !== "unsupported";
}

export function resolveVideoRequestConfig(params: VideoProviderParams, capabilities: ModelCapabilities): VideoRequestConfig {
  const normalizedCapabilities = normalizeVideoCapabilities(capabilities, params.providerId, params.modelName);
  const configuredCapabilities = { ...normalizedCapabilities, ...normalizedCapabilities.channelCapability } as ModelCapabilities;
  const effectiveCapabilities = normalizeVideoCapabilities(configuredCapabilities, params.providerId, params.modelName);
  const provider = effectiveCapabilities.provider ?? inferProvider(params.providerId ?? "", params.modelName);
  const officialEndpoint = isOfficialEndpoint(params.providerId ?? "", params.apiBaseUrl);
  const proxyEndpoint = isOpenAiCompatibleVideoEndpoint(params.apiBaseUrl);
  const forcedChannel = effectiveCapabilities.channel;
  const channel: VideoChannel = officialEndpoint ? "official" : proxyEndpoint ? "proxy" : forcedChannel ?? "legacy_custom";
  const apiFamily = inferApiFamily(channel, params.apiBaseUrl, params.modelName, effectiveCapabilities);
  const createEndpoint = defaultCreateEndpoint(channel, params.apiBaseUrl, effectiveCapabilities, apiFamily);
  const finalUrl = createEndpoint ? joinUrl(params.apiBaseUrl, createEndpoint) : params.apiBaseUrl;
  const requestFormat = ["unified_video_create", "agnes_video", "zhipu_video"].includes(apiFamily) ? "json" : effectiveCapabilities.requestFormat
    ?? (apiFamily === "doubao_seedance15" ? "multipart" : channel === "proxy" ? "json" : "multipart");
  const imageTransport = apiFamily === "unified_video_create" && /runapi\.co/i.test(params.apiBaseUrl)
    ? "url"
    : defaultImageTransport(channel, apiFamily, effectiveCapabilities);
  const taskIdField = defaultTaskField(apiFamily, effectiveCapabilities);
  return {
    provider,
    channel,
    apiFamily,
    baseUrl: params.apiBaseUrl,
    createEndpoint,
    endpoint: createEndpoint,
    finalUrl,
    authType: effectiveCapabilities.authType ?? "bearer",
    requestFormat,
    taskMode: "async",
    pollEndpoint: defaultPollEndpoint(params.apiBaseUrl, createEndpoint, effectiveCapabilities, apiFamily),
    idField: effectiveCapabilities.idField ?? taskIdField,
    taskIdField,
    statusField: effectiveCapabilities.statusField ?? "status",
    resultField: effectiveCapabilities.resultField ?? (["agnes_video", "zhipu_video"].includes(apiFamily) ? "" : "result"),
    supportedInputs: supportedInputs(effectiveCapabilities),
    imageTransport,
    videoTransport: effectiveCapabilities.videoTransport ?? (apiFamily === "omni_fast_v2v" ? "url_or_base64_json" : "unsupported"),
    imageField: effectiveCapabilities.imageField
      ?? (apiFamily === "omni_fast" ? "first_image_url" : apiFamily === "doubao_seedance15" ? "first_frame_image" : apiFamily === "aigc_video_json" ? "image" : apiFamily === "zhipu_video" ? "image_url" : apiFamily === "agnes_video" ? "image" : undefined),
    videoField: effectiveCapabilities.videoField ?? (apiFamily === "omni_fast_v2v" ? "video" : undefined),
    supportedAspectRatios: effectiveCapabilities.supportedAspectRatios ?? effectiveCapabilities.aspectRatios ?? [],
    supportedDurations: effectiveCapabilities.supportedDurations ?? durationValues(effectiveCapabilities),
    supportedResolutions: effectiveCapabilities.supportedResolutions ?? effectiveCapabilities.resolutions ?? []
  };
}

export function shouldUseProxyVideoAdapter(params: VideoProviderParams, capabilities: ModelCapabilities) {
  return resolveVideoRequestConfig(params, capabilities).channel === "proxy";
}

function inputType(input: GenerateVideoRequest): VideoSupportedInput {
  if (input.inputMode === "first-last-frame") return "first_last_frame";
  if (input.videoAssetIds?.length || input.inputMode === "video-to-video") return "video";
  if (input.imageAssetIds?.length || input.inputMode === "image-to-video" || input.inputMode === "reference-to-video") return "image";
  return "text";
}

function maskKey(apiKey: string) {
  if (!apiKey) return "";
  if (apiKey.length <= 10) return `${apiKey.slice(0, 2)}***${apiKey.slice(-2)}`;
  return `${apiKey.slice(0, 6)}***${apiKey.slice(-4)}`;
}

export function validateVideoRequestConfig(params: VideoProviderParams, capabilities: ModelCapabilities) {
  const config = resolveVideoRequestConfig(params, capabilities);
  const currentInput = inputType(params);
  if (!params.modelName?.trim()) throw new Error("视频模型不存在，请先在设置中心选择或保存上游模型。");
  if (!params.prompt?.trim()) throw new Error("请输入视频生成提示词。");
  if (!config.apiFamily) throw new Error("视频接口族 apiFamily 未配置。");
  if (!config.createEndpoint && config.channel === "proxy") throw new Error("视频中转 createEndpoint 未配置。");
  if (!config.requestFormat) throw new Error("视频请求格式未配置。");
  const supportsCurrentInput = config.supportedInputs.includes(currentInput)
    || (currentInput === "image" && config.supportedInputs.some((input) => ["first_frame", "reference_image", "first_last_frame"].includes(input)));
  if (!supportsCurrentInput) throw new Error("当前通道不支持这个视频输入类型。");
  if (currentInput !== "text" && currentInput !== "video" && config.imageTransport === "unsupported") {
    throw new Error("当前通道不支持图片输入，请切换官方通道或支持图生视频的中转通道。");
  }
  if (currentInput === "video" && config.videoTransport === "unsupported") throw new Error("当前通道不支持视频输入。");
  if (config.requestFormat !== "json" && config.requestFormat !== "multipart") throw new Error("视频请求格式不正确。");
  if (config.apiFamily === "seedance2_native" && config.requestFormat !== "json") {
    throw new Error("Seedance-2 原生接口必须使用 JSON content 数组，不能使用 multipart。");
  }
  if ((config.apiFamily === "omni_fast" || config.apiFamily === "unified_video_create") && currentInput !== "text" && config.imageTransport !== "url") {
    throw new Error("当前接口族图生视频需要先上传素材并传公网 URL。");
  }
  if (config.apiFamily === "omni_fast_v2v" && !params.videoAssetIds?.length) {
    throw new Error("Omni-fast-v2v 需要连接一个公网 MP4 视频素材。");
  }

  const mode = params.videoMode ?? legacyInputModeToOfficialMode(params.inputMode, params.providerId);
  console.log("[video provider request]", {
    provider: config.provider,
    channel: config.channel,
    apiFamily: config.apiFamily,
    finalUrl: config.finalUrl,
    createEndpoint: config.createEndpoint,
    endpoint: config.endpoint,
    pollEndpoint: config.pollEndpoint,
    requestFormat: config.requestFormat,
    imageTransport: config.imageTransport,
    authType: config.authType,
    apiKey: maskKey(params.apiKey),
    model: params.modelName,
    promptLength: params.prompt.length,
    inputType: currentInput,
    mode,
    hasImages: Boolean(params.imageAssetIds?.length),
    imagesCount: params.imageAssetIds?.length ?? 0,
    aspectRatio: params.aspectRatio,
    duration: params.duration,
    resolution: params.resolution
  });
  return config;
}
