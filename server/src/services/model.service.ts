import fs from "node:fs";
import path from "node:path";
import { getDb } from "../db/database.js";
import { createAsset } from "./asset.service.js";
import { decryptApiKey } from "./encryption.service.js";
import { persistGeneratedVideoToCOS, updateCanvasNodeWithGeneratedVideo } from "./generatedVideoPersistence.service.js";
import { addHistory } from "./history.service.js";
import { saveGenerationTask } from "./generationTask.service.js";
import { modelCatalog } from "./modelCatalog.js";
import { getInternalModelConfig, listModelConfigs } from "./modelConfig.service.js";
import { calculateAvailableImageOptions, calculateAvailableVideoOptions } from "./modelCapability.service.js";
import { getOfficialModelCapability, qualityTierFor } from "../config/officialModelCapabilities.js";
import { generateImageWithAlibaba } from "./providers/alibabaImage.service.js";
import { generateVideoWithAlibabaWan } from "./providers/alibabaWan.service.js";
import { generateImageWithAzureOpenAI } from "./providers/azureOpenAIImage.service.js";
import { generateTextWithDeepSeek } from "./providers/deepseek.service.js";
import { generateImageWithGoogle } from "./providers/googleImage.service.js";
import { generateTextWithGoogle } from "./providers/googleText.service.js";
import { generateVideoWithGoogleVeo } from "./providers/googleVeo.service.js";
import { generateImageWithGrsai } from "./providers/grsaiImage.service.js";
import { isGrsaiImageEndpoint } from "./providers/grsaiImageProtocol.js";
import { generateVideoWithGrok } from "./providers/grokVideo.service.js";
import { generateVideoWithKling } from "./providers/klingVideo.service.js";
import { generateVideoWithMiniMax } from "./providers/minimaxVideo.service.js";
import { generateImageWithMidjourney, isMidjourneyImageModel } from "./providers/midjourneyImage.service.js";
import { generateImageWithOpenAI } from "./providers/openaiImage.service.js";
import { generateTextWithOpenAICompatible } from "./providers/openaiCompatibleText.service.js";
import { generateVideoWithSeedance } from "./providers/seedanceVideo.service.js";
import { generateImageWithZhipu } from "./providers/zhipuImage.service.js";
import { isZhipuOfficialEndpoint } from "./providers/zhipuProtocol.js";
import { isQwenImageEditModel, normalizeImageCapabilities, qwenTextModelForEdit } from "./imageCapabilityNormalization.js";
import { channelSupportsImage, resolveVideoRequestConfig, shouldUseProxyVideoAdapter, validateVideoRequestConfig } from "./providers/videoRequestAdapter.js";
import { deriveCapabilityKinds, resolveProviderType } from "./providers/openaiCompatibleProtocol.js";
import { resolveProviderApiBaseUrl } from "./providers/providerBaseUrl.js";
import { isGrokLikeVideoModel, isVeoLikeVideoModel, normalizeVideoCapabilities } from "./videoCapabilityNormalization.js";
import { ensureVideoAspectRatio } from "./assets/ensureVideoAspectRatio.service.js";
import { ensureImageAspectRatio } from "./assets/ensureImageAspectRatio.service.js";
import type { ImageInputMode, ModelCapabilities, ModelCatalogItem, VideoNodeContext } from "../types/model.js";
import type { ModelCapabilityKind } from "../types/model.js";
import type { OfficialVideoMode } from "../types/videoModes.js";
import { legacyInputModeToOfficialMode } from "../types/videoModes.js";
import type { ProviderGenerateResult } from "./providers/providerTypes.js";
import { isProviderError, ProviderError, rawErrorMessage } from "../utils/providerErrors.js";
import { extractProviderTaskId, extractProviderVideoUrl, isProviderSuccessStatus, sanitizeUrlForLog } from "../utils/videoResultExtractor.js";
import { buildPayloadSummary, logOfficialPayload } from "../utils/generationPayload.js";
import { metadataToQualityAudit, readGeneratedFileMetadata } from "../utils/mediaMetadata.js";
import { mapVideoDimensions, normalizeVideoAspectRatio } from "../utils/videoParams.js";

export type GenerateTextRequest = {
  projectId?: string;
  nodeId: string;
  modelConfigId: string;
  inputText: string;
  systemPrompt?: string;
  taskType?: "prompt-polish" | "script" | "reverse-prompt" | "custom";
  imageAssetIds?: string[];
  videoAssetIds?: string[];
  audioAssetIds?: string[];
};

export type GenerateVideoRequest = {
  clientRequestId?: string;
  projectId?: string;
  nodeId: string;
  modelConfigId: string;
  inputMode: VideoNodeContext["inputMode"];
  videoMode?: OfficialVideoMode;
  prompt: string;
  referenceBindings?: Array<{
    token?: string;
    label?: string;
    kind?: "image" | "video" | "audio";
    kindLabel?: string;
    kindIndex?: number;
    globalIndex?: number;
    sourceNodeId?: string;
    assetId?: string;
    title?: string;
  }>;
  imageAssetIds?: string[];
  videoAssetIds?: string[];
  audioAssetIds?: string[];
  duration: number;
  aspectRatio: string;
  resolution: string;
  generateCount: number;
  qualityMode?: "full_quality" | "balanced" | "fast";
  negativePrompt?: string;
  promptExtend?: boolean;
  seed?: number;
  realismMode?: "off" | "natural_human" | "commercial_human" | "cinematic_human";
};

export type GenerateImageRequest = {
  projectId?: string;
  nodeId: string;
  modelConfigId: string;
  inputMode: ImageInputMode;
  prompt: string;
  imageAssetIds?: string[];
  aspectRatio?: string;
  imageSize?: string;
  imageQuality: string;
  imageFormat: string;
  generateCount: number;
  qualityMode?: "full_quality" | "balanced" | "fast";
  negativePrompt?: string;
  promptExtend?: boolean;
  seed?: number;
  realismMode?: "off" | "natural_human" | "commercial_human" | "cinematic_human";
};

type InternalModelConfig = Awaited<ReturnType<typeof getInternalModelConfig>>;
type ActiveModelConfig = NonNullable<InternalModelConfig>;

function forceMockGeneration() {
  return process.env.ALLOW_MOCK_GENERATION === "true" || process.env.FORCE_MOCK_GENERATION === "true";
}

function safeStringify(value: unknown) {
  if (!value) return "";
  if (typeof value === "string") return value;
  try {
    return JSON.stringify(value);
  } catch {
    return String(value);
  }
}

function upstreamQuotaMessage(providerId?: string) {
  return "额度不足";
}

function isUpstreamQuotaError(text: string) {
  return /PUBLIC_ERROR_USER_QUOTA_REACHED|USER_QUOTA_REACHED|RESOURCE_EXHAUSTED|quota|credit|balance|insufficient|capacity|at capacity|exhausted|余额不足|额度不足|额度耗尽|并发上限|资源耗尽/i.test(text);
}

function isUpstreamChannelUnavailable(text: string) {
  return /无可用渠道|可用渠道不存在|所有分组.*模型|当前分组.*模型|分组.*模型.*(?:调用权限|权限)|distributor|no available channel|channel.*unavailable|model.*not available.*group/i.test(text);
}

function upstreamChannelMessage(text: string) {
  const modelName = text.match(/模型\s*[「"']?([A-Za-z0-9._-]+)[」"']?/i)?.[1]
    ?? text.match(/model\s*[:"']+\s*([A-Za-z0-9._-]+)/i)?.[1];
  const modelPart = modelName ? `「${modelName}」` : "当前模型";
  return `通道权限问题：当前中转账号/分组没有${modelPart}的可用渠道。请在设置中心切换到已开通的线路，或让中转后台开通该模型；这不是提示词、素材或额度问题。`;
}

function isReferenceBlockedByPolicy(text: string) {
  return /Reference upload failed|image reference\s*\d+\s*blocked|previously flagged|content policy|policy violation|素材.*(?:审核|拦截|违规)|参考图.*(?:审核|拦截|违规)/i.test(text);
}

function referenceBlockedMessage(text: string) {
  const referenceIndex = text.match(/image reference\s*(\d+)\s*blocked/i)?.[1]
    ?? text.match(/参考图\s*(\d+)/i)?.[1];
  const target = referenceIndex ? `第 ${referenceIndex} 张参考图` : "参考图素材";
  return `素材审核拦截：${target}被上游内容策略拦截或曾被标记。请删除/替换这张素材后重试；这不是额度问题，也不是接口路径问题。`;
}

function isUpstreamSocketClosed(error: unknown) {
  if (!(error instanceof Error)) return false;
  const cause = (error as Error & { cause?: { code?: string; message?: string } }).cause;
  return cause?.code === "UND_ERR_SOCKET" || /other side closed|socket.*closed|connection.*reset/i.test(`${error.message}\n${cause?.message ?? ""}`);
}

function providerErrorMeta(providerId: string | undefined, error: unknown) {
  console.error("[provider adapter error]", providerId, error);
  if (isProviderError(error)) {
    const text = `${error.message}\n${error.debugMessage ?? ""}\n${safeStringify(error.details)}`;
    if (isReferenceBlockedByPolicy(text)) {
      return {
        errorCode: "UPSTREAM_REFERENCE_BLOCKED",
        errorMessage: referenceBlockedMessage(text),
        debugMessage: text,
        payloadSummary: error.details
      };
    }
    if (isUpstreamChannelUnavailable(text)) {
      return {
        errorCode: "UPSTREAM_CHANNEL_UNAVAILABLE",
        errorMessage: upstreamChannelMessage(text),
        debugMessage: text,
        payloadSummary: error.details
      };
    }
    if (isUpstreamQuotaError(text)) {
      return {
        errorCode: "UPSTREAM_QUOTA_EXHAUSTED",
        errorMessage: upstreamQuotaMessage(providerId),
        debugMessage: text,
        payloadSummary: error.details
      };
    }
    return {
      errorCode: error.errorCode,
      errorMessage: error.message,
      debugMessage: error.debugMessage,
      payloadSummary: error.details
    };
  }
  const message = error instanceof Error ? error.message : "生成失败";
  if (isReferenceBlockedByPolicy(message)) {
    return {
      errorCode: "UPSTREAM_REFERENCE_BLOCKED",
      errorMessage: referenceBlockedMessage(message),
      debugMessage: message
    };
  }
  if (isUpstreamChannelUnavailable(message)) {
    return {
      errorCode: "UPSTREAM_CHANNEL_UNAVAILABLE",
      errorMessage: upstreamChannelMessage(message),
      debugMessage: message
    };
  }
  if (isUpstreamQuotaError(message)) {
    return {
      errorCode: "UPSTREAM_QUOTA_EXHAUSTED",
      errorMessage: upstreamQuotaMessage(providerId),
      debugMessage: message
    };
  }
  if (/model not available for your tier|可用渠道不存在/i.test(message)) {
    return {
      errorCode: "MODEL_ACCESS_DENIED",
      errorMessage: "当前 API Key 的套餐或分组没有该模型的调用权限，请在上游平台开通模型或更换已授权的 API Key。",
      debugMessage: message
    };
  }
  if (/fetch failed/i.test(message)) {
    return {
      errorCode: "NETWORK_ERROR",
      errorMessage: isUpstreamSocketClosed(error)
        ? "中转服务器在接收素材时主动断开了连接，通常是中转繁忙或上传限制，不是 Base URL 配置错误。请稍后重试。"
        : "无法连接中转服务，请检查中转服务状态和网络连接。",
      debugMessage: message
    };
  }
  return {
    errorCode: "PROVIDER_ERROR",
    errorMessage: message,
    debugMessage: undefined
  };
}

function errorResponse(errorMessage: string, errorCode = "PROVIDER_ERROR", debugMessage?: string, payloadSummary?: unknown) {
  return { status: "error" as const, errorCode, errorMessage, debugMessage, payloadSummary };
}

function catalogFor(model: ActiveModelConfig) {
  return modelCatalog.find((item) => item.providerId === model.provider_id && item.name === model.model_name);
}

function isOfficialProviderBaseUrl(model: ActiveModelConfig) {
  const providerId = model.provider_id ?? "";
  const rawBaseUrl = model.api_base_url?.trim();
  if (!rawBaseUrl) return true;
  try {
    const hostname = new URL(rawBaseUrl).hostname.toLowerCase();
    if (providerId === "openai") return hostname === "api.openai.com";
    if (providerId === "google") return hostname === "generativelanguage.googleapis.com";
    if (providerId === "azure-openai") return true;
    if (providerId === "alibaba") return hostname.endsWith("dashscope.aliyuncs.com");
    if (providerId === "seedance") return hostname.endsWith("volces.com") || hostname.endsWith("volcengineapi.com");
    if (providerId === "grok") return hostname === "api.x.ai";
    return false;
  } catch {
    return false;
  }
}

function shouldUseCatalogCapabilities(model: ActiveModelConfig, catalogItem?: ModelCatalogItem) {
  if (!catalogItem) return false;
  return isOfficialProviderBaseUrl(model);
}

async function getGenerationContext(modelConfigId: string, type: "text" | "image" | "video") {
  const model = await getInternalModelConfig(modelConfigId);
  if (!model) throw new Error("模型配置不存在");
  if (!model.enabled) throw new Error("模型已禁用");

  const apiKey = model.encrypted_api_key ? decryptApiKey(model.encrypted_api_key) : "";
  const catalogItem = catalogFor(model);
  const forceMock = forceMockGeneration();

  return { model, apiKey, catalogItem, forceMock };
}

function logGenerate(input: {
  type: "text" | "image" | "video";
  model: ActiveModelConfig;
  catalogItem?: ModelCatalogItem;
  apiKey: string;
  inputMode?: string;
}) {
  console.log("[generate]", {
    type: input.type,
    providerId: input.model.provider_id,
    catalogModelId: input.catalogItem?.id,
    modelName: input.model.model_name,
    inputMode: input.inputMode,
    hasApiKey: Boolean(input.apiKey),
    apiBaseUrl: input.model.api_base_url,
    forceMock: process.env.FORCE_MOCK_GENERATION
  });
}

function apiBaseUrlFor(model: ActiveModelConfig) {
  return resolveProviderApiBaseUrl(model.provider_id, model.api_base_url);
}

function categoryCapability(input: { type: "text" | "image" | "video"; inputMode?: string }): ModelCapabilityKind {
  if (input.type === "text") return "text";
  if (input.type === "image") return input.inputMode === "text-to-image" ? "image_generation" : "image_edit";
  if (input.inputMode === "text-to-video") return "text_to_video";
  if (input.inputMode === "video-to-video") return "video_to_video";
  if (input.inputMode === "reference-to-video") return "reference_to_video";
  return "image_to_video";
}

function assertModelRuntimeReady(input: {
  model: ActiveModelConfig;
  apiKey: string;
  capabilities: ModelCapabilities;
  type: "text" | "image" | "video";
  inputMode?: string;
}) {
  const apiBaseUrl = apiBaseUrlFor(input.model);
  const providerType = resolveProviderType(input.capabilities, apiBaseUrl);
  const required = categoryCapability({ type: input.type, inputMode: input.inputMode });
  const capabilityKinds = deriveCapabilityKinds(input.capabilities);
  if (!providerType) throw new ProviderError("PROVIDER_ERROR", "模型 providerType 未配置，请在设置中心重新保存该模型。");
  if (!apiBaseUrl?.trim()) throw new ProviderError("PROVIDER_ERROR", "模型 Base URL 未配置，禁止生成。");
  if (!input.apiKey?.trim()) throw new ProviderError("API_KEY_MISSING", "请先在设置中心配置该模型 API Key。");
  if (!input.model.model_name?.trim() || input.model.model_name === "mock-model") {
    throw new ProviderError("PROVIDER_ERROR", "模型 modelId 未配置，请先保存真实上游模型 ID。");
  }
  if (input.capabilities.modelStatus && input.capabilities.modelStatus !== "ready") {
    throw new ProviderError("PROVIDER_ERROR", `模型状态为 ${input.capabilities.modelStatus}，请先完成配置后再生成。`, undefined, {
      modelStatus: input.capabilities.modelStatus,
      model: input.model.model_name
    });
  }
  if (!capabilityKinds.size) {
    throw new ProviderError("MODEL_MODE_UNSUPPORTED", "模型 capability 未配置，禁止生成。请在设置中心为该模型选择文本、图片或视频能力。", undefined, {
      model: input.model.model_name,
      providerType
    });
  }
  if (!capabilityKinds.has(required)) {
    throw new ProviderError("MODEL_MODE_UNSUPPORTED", `能力不匹配：当前节点需要 ${required}，但模型只配置了 ${Array.from(capabilityKinds).join(", ")}。`, undefined, {
      model: input.model.model_name,
      providerType,
      requiredCapability: required,
      configuredCapabilities: Array.from(capabilityKinds)
    });
  }
}

function validateVideoRequest(capabilities: ModelCapabilities, input: GenerateVideoRequest, providerId?: string, modelName?: string) {
  const effectiveCapabilities = normalizeVideoCapabilities(capabilities, providerId, modelName);
  const options = calculateAvailableVideoOptions(effectiveCapabilities, {
    inputMode: input.inputMode,
    hasImageInput: Boolean(input.imageAssetIds?.length),
    hasVideoInput: Boolean(input.videoAssetIds?.length),
    hasReferenceImage: Boolean(input.imageAssetIds?.length),
    hasFirstLastFrame: Boolean(input.imageAssetIds && input.imageAssetIds.length >= 2),
    selectedDuration: input.duration,
    selectedAspectRatio: input.aspectRatio,
    selectedResolution: input.resolution
  });
  const channel = { ...effectiveCapabilities, ...effectiveCapabilities.channelCapability };
  const requiredInput = input.inputMode === "text-to-video" ? "text"
    : input.inputMode === "first-last-frame" ? "first_last_frame"
      : input.inputMode === "video-to-video" ? "video"
        : "image";
  const explicitlySupported = channel.supportedInputs?.some((value) => value === requiredInput
    || (requiredInput === "image" && ["first_frame", "reference_image", "first_last_frame"].includes(value)));
  if (!options.availableInputModes.includes(input.inputMode) && !explicitlySupported) throw new Error("当前模型不支持该输入模式");
  if (input.duration !== undefined && options.availableDurations.length && !options.availableDurations.includes(input.duration)) throw new Error("当前模型不支持该视频时长");
  if (input.aspectRatio && options.availableAspectRatios.length && !options.availableAspectRatios.includes(input.aspectRatio)) throw new Error("当前模型不支持该画面比例");
  if (input.resolution && options.availableResolutions.length && !options.availableResolutions.includes(input.resolution)) throw new Error("当前模型不支持该分辨率");
}

function normalizeVideoRequestForCapabilities(capabilities: ModelCapabilities, input: GenerateVideoRequest, providerId?: string, modelName?: string) {
  const effectiveCapabilities = normalizeVideoCapabilities(capabilities, providerId, modelName);
  const options = calculateAvailableVideoOptions(effectiveCapabilities, {
    inputMode: input.inputMode,
    hasImageInput: Boolean(input.imageAssetIds?.length),
    hasVideoInput: Boolean(input.videoAssetIds?.length),
    hasReferenceImage: Boolean(input.imageAssetIds?.length),
    hasFirstLastFrame: Boolean(input.imageAssetIds && input.imageAssetIds.length >= 2),
    selectedDuration: input.duration,
    selectedAspectRatio: input.aspectRatio,
    selectedResolution: input.resolution
  });
  const normalized = options.normalizedSelection;
  if (normalized.duration !== undefined && input.duration !== normalized.duration) {
    console.warn("[video normalize] adjusted unsupported duration before provider call", {
      providerId,
      modelName,
      inputMode: input.inputMode,
      from: input.duration,
      to: normalized.duration,
      reason: options.warningMessage
    });
    input.duration = normalized.duration;
  }
  if (normalized.aspectRatio && input.aspectRatio !== normalized.aspectRatio) {
    console.warn("[video normalize] adjusted unsupported aspect ratio before provider call", {
      providerId,
      modelName,
      from: input.aspectRatio,
      to: normalized.aspectRatio
    });
    input.aspectRatio = normalized.aspectRatio;
  }
  if (normalized.resolution && input.resolution !== normalized.resolution) {
    console.warn("[video normalize] adjusted unsupported resolution before provider call", {
      providerId,
      modelName,
      from: input.resolution,
      to: normalized.resolution
    });
    input.resolution = normalized.resolution;
  }
  return input;
}

async function assertSelectedVideoChannelSupportsAssets(
  model: NonNullable<InternalModelConfig>,
  providerParams: Parameters<typeof resolveVideoRequestConfig>[0],
  capabilities: ModelCapabilities
) {
  if (!providerParams.imageAssetIds?.length) return;
  const current = resolveVideoRequestConfig(providerParams, capabilities);
  if (channelSupportsImage(current)) return;
  const siblings = (await listModelConfigs()).filter((candidate) =>
    candidate.enabled
    && candidate.id !== model.id
    && candidate.category === "video"
    && candidate.providerId === model.provider_id
    && candidate.modelName.trim().toLowerCase() === model.model_name.trim().toLowerCase()
  );
  const alternatives = siblings.filter((candidate) => channelSupportsImage(resolveVideoRequestConfig({
    ...providerParams,
    apiBaseUrl: candidate.apiBaseUrl,
    modelName: candidate.modelName,
    providerId: candidate.providerId
  }, candidate.capabilities)));
  const whyBlocked = alternatives.length ? "currentChannelTextOnly" : "noImageCapableChannel";
  throw new ProviderError(
    alternatives.length ? "CURRENT_CHANNEL_TEXT_ONLY" : "NO_IMAGE_CAPABLE_CHANNEL",
    alternatives.length ? `当前通道不支持图生视频，可切换到「${alternatives[0].displayName}」继续生成。` : "当前模型暂无图生视频能力。",
    undefined,
    {
      selectedModel: model.model_name,
      selectedProvider: model.provider_id,
      selectedChannel: current.channel,
      apiFamily: current.apiFamily,
      createEndpoint: current.createEndpoint,
      supportedInputs: current.supportedInputs,
      imageTransport: current.imageTransport,
      videoTransport: current.videoTransport,
      imageField: current.imageField,
      hasImageAsset: true,
      currentChannelSupportsImage: false,
      sameModelImageCapableChannels: alternatives.map((candidate) => ({ id: candidate.id, label: candidate.displayName, channel: candidate.capabilities.channel ?? "legacy_custom" })),
      whyBlocked,
      switchChannelSuggestion: alternatives[0] ? { modelConfigId: alternatives[0].id, label: alternatives[0].displayName } : undefined
    }
  );
}

function assertFullQualityModel(input: { qualityMode?: string; providerId: string; catalogModelId?: string; modelName: string }) {
  const mode = input.qualityMode ?? "full_quality";
  const tier = qualityTierFor(input.providerId, input.catalogModelId, input.modelName);
  const explicitlySelectedFastTier = /(?:fast|flash|lite|turbo)/i.test(`${input.catalogModelId ?? ""} ${input.modelName}`);
  if (mode === "full_quality" && ["fast", "lite", "turbo"].includes(tier) && !explicitlySelectedFastTier) {
    throw new Error(`当前选择的是 ${tier} 质量档模型。如需满血质量，请切换到非 Fast/Lite/Turbo 模型。`);
  }
}

function validateAgainstOfficial(input: {
  providerId: string;
  catalogModelId?: string;
  modelName: string;
  inputMode: string;
  aspectRatio?: string;
  duration?: number;
  resolution?: string;
}) {
  const official = getOfficialModelCapability(input.providerId, input.catalogModelId, input.modelName);
  if (!official) return;
  if (official.runtimeStatus === "not_implemented") throw new Error("当前模型真实 adapter 尚未完整接入。");
  if (!official.supportedInputModes.includes(input.inputMode)) throw new Error("当前官方模型不支持该输入模式。");
  if (input.aspectRatio && input.aspectRatio !== "auto" && official.supportedAspectRatios.length && !official.supportedAspectRatios.includes(input.aspectRatio)) {
    throw new Error(`当前官方模型不支持 ${input.aspectRatio} 比例。`);
  }
  if (input.duration && official.supportedDurations?.length && !official.supportedDurations.includes(input.duration)) {
    throw new Error(`当前官方模型不支持 ${input.duration}s 时长。`);
  }
  if (input.resolution && official.supportedResolutions?.length && !official.supportedResolutions.includes(input.resolution)) {
    throw new Error(`当前官方模型不支持 ${input.resolution} 分辨率。`);
  }
}

function validateImageRequest(capabilities: ModelCapabilities, input: GenerateImageRequest) {
  const options = calculateAvailableImageOptions(capabilities, {
    inputMode: input.inputMode,
    hasImageInput: Boolean(input.imageAssetIds?.length),
    selectedImageSize: input.imageSize,
    selectedQuality: input.imageQuality,
    selectedFormat: input.imageFormat
  });
  if (!options.availableInputModes.includes(input.inputMode)) throw new Error("当前模型不支持该图片输入模式");
  if (input.inputMode !== "text-to-image" && !input.imageAssetIds?.length) {
    throw new Error(input.inputMode === "image-edit" ? "图片编辑需要连接一张图片素材" : "图生图需要连接一张图片素材");
  }
  const isProductImageTier = /^(?:1K|2K|4K)$/i.test(input.imageSize ?? "");
  if (input.imageSize && !isProductImageTier && !options.availableImageSizes.includes(input.imageSize)) {
    input.imageSize = options.normalizedSelection.imageSize;
  }
  if (!options.availableImageQualities.includes(input.imageQuality)) {
    input.imageQuality = options.normalizedSelection.imageQuality ?? options.availableImageQualities[0] ?? "auto";
  }
  if (!options.availableImageFormats.includes(input.imageFormat)) {
    input.imageFormat = options.normalizedSelection.imageFormat ?? options.availableImageFormats[0] ?? "png";
  }
}

function effectiveImageRuntime(input: {
  capabilities: ModelCapabilities;
  providerId?: string;
  modelName: string;
  displayName?: string;
  provider?: string;
  request: GenerateImageRequest;
}) {
  let modelName = input.modelName;
  if (
    input.request.inputMode === "text-to-image"
    && !input.request.imageAssetIds?.length
    && isQwenImageEditModel(input.providerId, input.modelName, input.displayName, input.provider)
  ) {
    modelName = qwenTextModelForEdit(input.modelName);
  }
  return {
    modelName,
    capabilities: normalizeImageCapabilities(input.capabilities, input.providerId, modelName, input.displayName, input.provider)
  };
}

function isRetryableImageRelayError(error: unknown) {
  const text = error instanceof Error ? error.message : safeStringify(error);
  return /OpenAI 兼容图片中转返回|Cloudflare|OPENAI_COMPAT_NON_JSON_RESPONSE|HTML 页面|上游响应超时|upstream request failed|openai_error|upstream_error|provider_error|暂时繁忙|temporarily unavailable|service busy|fully loaded|method not allowed|not found|unsupported (?:endpoint|route|path)|error code 524|a timeout occurred|404|405|502|503|504/i.test(text);
}

function imageProviderPriority(providerId?: string) {
  if (providerId === "openai") return 0;
  if (providerId === "google") return 1;
  if (providerId === "seedance") return 2;
  if (providerId === "alibaba") return 3;
  if (providerId === "azure-openai") return 4;
  return 9;
}

async function listImageFallbackModels(primary: ActiveModelConfig) {
  const db = await getDb();
  const rows = await db.all<ActiveModelConfig[]>(
    `SELECT * FROM model_configs
     WHERE workspace_id = ?
       AND enabled = 1
       AND id <> ?
       AND encrypted_api_key IS NOT NULL
       AND (category = 'image' OR model_type LIKE '%image%')
       AND provider_id IN ('openai', 'google', 'seedance', 'alibaba', 'azure-openai')
     ORDER BY
       CASE WHEN provider_id = ? THEN 0 ELSE 1 END,
       CASE WHEN api_base_url = ? THEN 0 ELSE 1 END,
       updated_at DESC`,
    primary.workspace_id,
    primary.id,
    primary.provider_id,
    primary.api_base_url
  );
  return rows.sort((a, b) => imageProviderPriority(a.provider_id) - imageProviderPriority(b.provider_id));
}

async function callImageProvider(input: {
  model: ActiveModelConfig;
  providerParams: GenerateImageRequest & {
    apiKey: string;
    apiBaseUrl: string;
    modelName: string;
    providerId: string;
    catalogModelId?: string;
    capabilities?: ModelCapabilities;
    qualityMode: "full_quality" | "balanced" | "fast";
  };
}) {
  const { model, providerParams } = input;
  const providerId = model.provider_id ?? "";
  const modelName = model.model_name ?? "";
  if (providerId === "grsai" || isGrsaiImageEndpoint(providerParams.apiBaseUrl)) {
    return generateImageWithGrsai(providerParams);
  }
  if (providerId === "zhipu" || isZhipuOfficialEndpoint(providerParams.apiBaseUrl)) {
    return generateImageWithZhipu(providerParams);
  }
  if (isMidjourneyImageModel({ providerId, modelName, displayName: model.display_name, apiBaseUrl: providerParams.apiBaseUrl })) {
    return generateImageWithMidjourney(providerParams);
  }
  const providerType = resolveProviderType(providerParams.capabilities, providerParams.apiBaseUrl);
  if (providerType === "openai_compatible") {
    return generateImageWithOpenAI(providerParams);
  }
  switch (providerId) {
    case "openai":
      return generateImageWithOpenAI(providerParams);
    case "seedance":
      return generateImageWithOpenAI(providerParams);
    case "azure-openai":
      return generateImageWithAzureOpenAI(providerParams);
    case "alibaba":
      return generateImageWithAlibaba(providerParams);
    case "google":
      return generateImageWithGoogle(providerParams);
    default:
      throw new Error("该图片模型暂未支持真实调用");
  }
}

async function tryImageFallback(input: {
  primaryModel: ActiveModelConfig;
  request: GenerateImageRequest;
  primaryError: unknown;
}) {
  if (!isRetryableImageRelayError(input.primaryError)) return undefined;
  const candidates = await listImageFallbackModels(input.primaryModel);
  for (const candidate of candidates) {
    try {
      const catalogItem = catalogFor(candidate);
      const useCatalogCapabilities = shouldUseCatalogCapabilities(candidate, catalogItem);
      const configuredCapabilities = JSON.parse(candidate.capabilities_json) as ModelCapabilities;
      const candidateRequest: GenerateImageRequest = { ...input.request };
      const runtime = effectiveImageRuntime({
        capabilities: useCatalogCapabilities ? catalogItem!.capabilities : configuredCapabilities,
        providerId: candidate.provider_id,
        modelName: candidate.model_name,
        displayName: candidate.display_name,
        provider: candidate.provider,
        request: candidateRequest
      });
      const capabilities = runtime.capabilities;
      validateImageRequest(capabilities, candidateRequest);
      const apiKey = candidate.encrypted_api_key ? decryptApiKey(candidate.encrypted_api_key) : "";
      if (!apiKey) continue;
      const providerId = candidate.provider_id ?? "";
      const modelName = runtime.modelName;
      const providerParams = {
        ...candidateRequest,
        apiKey,
        apiBaseUrl: apiBaseUrlFor(candidate),
        modelName,
        providerId,
        catalogModelId: useCatalogCapabilities ? catalogItem?.id : undefined,
        capabilities,
        qualityMode: candidateRequest.qualityMode ?? "full_quality"
      };
      const preflightSummary = buildPayloadSummary({
        providerId,
        selectedModelId: useCatalogCapabilities ? catalogItem?.id : candidate.id,
        actualModelName: modelName,
        inputMode: candidateRequest.inputMode,
        aspectRatio: candidateRequest.aspectRatio,
        quality: candidateRequest.imageQuality,
        qualityMode: candidateRequest.qualityMode ?? "full_quality",
        hasImageInput: Boolean(candidateRequest.imageAssetIds?.length),
        imageInputCount: candidateRequest.imageAssetIds?.length ?? 0,
        prompt: candidateRequest.prompt,
        negativePrompt: candidateRequest.negativePrompt,
        isMock: false,
        qualityAudit: {
          qualityMode: candidateRequest.qualityMode ?? "full_quality",
          promptExtend: candidateRequest.promptExtend,
          seed: candidateRequest.seed,
          isFallback: true
        },
        payloadSummary: {
          stage: "fallback-preflight",
          fallbackFromModelConfigId: input.primaryModel.id,
          fallbackFromModel: input.primaryModel.model_name,
          fallbackFromBaseUrl: input.primaryModel.api_base_url
        }
      });
      console.warn("[image fallback] retrying with alternate model", {
        fromModelConfigId: input.primaryModel.id,
        fromModelName: input.primaryModel.model_name,
        toModelConfigId: candidate.id,
        toModelName: candidate.model_name,
        toProviderId: candidate.provider_id,
        toApiBaseUrl: candidate.api_base_url
      });
      logOfficialPayload(preflightSummary);
      let result = await callImageProvider({ model: candidate, providerParams });
      result = await enforceImageAspectRatio(result, candidateRequest.aspectRatio);
      return { model: candidate, catalogItem, useCatalogCapabilities, request: candidateRequest, result, preflightSummary };
    } catch (fallbackError) {
      console.warn("[image fallback] candidate failed", {
        modelConfigId: candidate.id,
        modelName: candidate.model_name,
        providerId: candidate.provider_id,
        message: fallbackError instanceof Error ? fallbackError.message : String(fallbackError)
      });
    }
  }
  return undefined;
}

function isRetryableVideoRelayError(error: unknown) {
  const text = error instanceof Error ? `${error.message}\n${error.stack ?? ""}` : safeStringify(error);
  return /中转接口|Invalid URL|没有返回任务 id|task_not_exist|OPENAI_COMPAT_NON_JSON_RESPONSE|HTML 页面|Cloudflare|网关|gateway|route|path|not found|method not allowed|unsupported endpoint|fetch failed|network|timeout|ECONN|502|503|504/i.test(text)
    && !/unauthorized|forbidden|invalid api key|incorrect api key|quota|credit|balance|insufficient|no access|permission|额度|余额|无权限|未开通/i.test(text);
}

export function hasSubmittedRemoteVideoTask(error: unknown) {
  if (!(error instanceof ProviderError)) return false;
  const details = error.details;
  if (!details || typeof details !== "object") return false;
  const record = details as Record<string, unknown>;
  return [record.proxyTaskId, record.taskId, record.requestId, record.id]
    .some((value) => typeof value === "string" && value.length > 0);
}

function videoProviderPriority(providerId?: string) {
  if (providerId === "google") return 0;
  if (providerId === "grok") return 1;
  if (providerId === "openai-video") return 2;
  if (providerId === "seedance") return 3;
  if (providerId === "kling") return 4;
  if (providerId === "alibaba") return 5;
  if (providerId === "minimax") return 6;
  return 9;
}

type VideoFallbackCandidateConfig = Pick<ActiveModelConfig, "provider_id" | "api_base_url"> & Partial<Pick<ActiveModelConfig, "model_name" | "capabilities_json">>;

function videoFallbackApiFamily(config: VideoFallbackCandidateConfig) {
  if (!config.model_name && !config.capabilities_json) return undefined;
  try {
    const configuredCapabilities = config.capabilities_json ? JSON.parse(config.capabilities_json) as ModelCapabilities : { inputModes: [] };
    const explicitApiFamily = configuredCapabilities.channelCapability?.apiFamily ?? configuredCapabilities.apiFamily;
    if (explicitApiFamily) return explicitApiFamily;
    const capabilities = normalizeVideoCapabilities(configuredCapabilities, config.provider_id, config.model_name);
    const normalizedApiFamily = capabilities.channelCapability?.apiFamily ?? capabilities.apiFamily;
    if (normalizedApiFamily) return normalizedApiFamily;
    return resolveVideoRequestConfig({
      nodeId: "fallback-check",
      modelConfigId: "fallback-check",
      inputMode: "text-to-video",
      videoMode: "text_to_video",
      prompt: "fallback check",
      imageAssetIds: [],
      videoAssetIds: [],
      audioAssetIds: [],
      duration: 10,
      aspectRatio: "16:9",
      resolution: "720p",
      generateCount: 1,
      apiKey: "",
      apiBaseUrl: resolveProviderApiBaseUrl(config.provider_id, config.api_base_url ?? ""),
      modelName: config.model_name ?? "",
      providerId: config.provider_id ?? "",
      qualityMode: "full_quality"
    }, capabilities).apiFamily;
  } catch {
    return undefined;
  }
}

export function shouldUseVideoFallbackCandidate(primary: VideoFallbackCandidateConfig, candidate: VideoFallbackCandidateConfig) {
  const sameRelay = (candidate.provider_id ?? "") === (primary.provider_id ?? "")
    && (candidate.api_base_url ?? "") === (primary.api_base_url ?? "");
  if (!sameRelay) return false;
  const primaryApiFamily = videoFallbackApiFamily(primary);
  const candidateApiFamily = videoFallbackApiFamily(candidate);
  if (primaryApiFamily && candidateApiFamily && primaryApiFamily !== candidateApiFamily) return false;
  return true;
}

async function listVideoFallbackModels(primary: ActiveModelConfig) {
  const db = await getDb();
  const rows = await db.all<ActiveModelConfig[]>(
    `SELECT * FROM model_configs
     WHERE workspace_id = ?
       AND enabled = 1
       AND id <> ?
       AND encrypted_api_key IS NOT NULL
       AND (category = 'video' OR model_type LIKE '%video%')
       AND provider_id = ?
       AND COALESCE(api_base_url, '') = COALESCE(?, '')
     ORDER BY
       CASE WHEN provider_id = ? THEN 0 ELSE 1 END,
       CASE WHEN api_base_url = ? THEN 0 ELSE 1 END,
       updated_at DESC`,
    primary.workspace_id,
    primary.id,
    primary.provider_id,
    primary.api_base_url,
    primary.provider_id,
    primary.api_base_url
  );
  return rows
    .filter((candidate) => shouldUseVideoFallbackCandidate(primary, candidate))
    .sort((a, b) => videoProviderPriority(a.provider_id) - videoProviderPriority(b.provider_id));
}

async function callVideoProvider(input: {
  model: ActiveModelConfig;
  providerParams: GenerateVideoRequest & {
    videoMode: OfficialVideoMode;
    apiKey: string;
    apiBaseUrl: string;
    modelName: string;
    providerId: string;
    qualityMode: "full_quality" | "balanced" | "fast";
  };
  capabilities: ModelCapabilities;
}) {
  const { model, providerParams, capabilities } = input;
  const providerId = model.provider_id ?? "";
  const providerType = resolveProviderType(capabilities, providerParams.apiBaseUrl);
  await assertSelectedVideoChannelSupportsAssets(model, providerParams, capabilities);
  const videoRequestConfig = validateVideoRequestConfig(providerParams, capabilities);
  if (providerType === "openai_compatible") {
    return generateVideoWithSeedance({
      ...providerParams,
      apiBaseUrl: videoRequestConfig.finalUrl,
      imageTransport: videoRequestConfig.imageTransport,
      videoTransport: videoRequestConfig.videoTransport,
      videoRequestConfig,
      capabilities
    });
  }
  if (
    providerId === "google"
    && videoRequestConfig.apiFamily !== "omni_fast"
    && videoRequestConfig.apiFamily !== "omni_fast_v2v"
    && isVeoLikeVideoModel(model.provider_id, model.model_name, capabilities)
  ) {
    return generateVideoWithGoogleVeo(providerParams);
  }
  if (
    isGrokLikeVideoModel(model.provider_id, model.model_name, capabilities)
    && videoRequestConfig.apiFamily !== "unified_video_create"
    && !/runapi\.co/i.test(model.api_base_url)
  ) {
    return generateVideoWithGrok(providerParams);
  }
  if (providerId === "minimax") {
    return generateVideoWithMiniMax(providerParams);
  }
  if (videoRequestConfig.apiFamily === "agnes_video" || videoRequestConfig.apiFamily === "zhipu_video") {
    return generateVideoWithSeedance({
      ...providerParams,
      apiBaseUrl: videoRequestConfig.finalUrl,
      imageTransport: videoRequestConfig.imageTransport,
      videoTransport: videoRequestConfig.videoTransport,
      videoRequestConfig
    });
  }
  if (shouldUseProxyVideoAdapter(providerParams, capabilities)) {
    return generateVideoWithSeedance({
      ...providerParams,
      apiBaseUrl: videoRequestConfig.finalUrl,
      imageTransport: videoRequestConfig.imageTransport,
      videoTransport: videoRequestConfig.videoTransport,
      videoRequestConfig
    });
  }
  switch (providerId) {
    case "google":
      return generateVideoWithGoogleVeo(providerParams);
    case "alibaba":
      return generateVideoWithAlibabaWan(providerParams);
    case "kling":
      return generateVideoWithKling(providerParams);
    case "grok":
      return generateVideoWithGrok(providerParams);
    case "minimax":
      return generateVideoWithMiniMax(providerParams);
    case "seedance":
    case "openai-video":
      return generateVideoWithSeedance(providerParams);
    default:
      return generateVideoWithSeedance(providerParams);
  }
}

async function tryVideoFallback(input: {
  primaryModel: ActiveModelConfig;
  request: GenerateVideoRequest;
  primaryError: unknown;
}) {
  if (hasSubmittedRemoteVideoTask(input.primaryError)) return undefined;
  if (!isRetryableVideoRelayError(input.primaryError)) return undefined;
  const candidates = await listVideoFallbackModels(input.primaryModel);
  for (const candidate of candidates) {
    try {
      const configuredCapabilities = JSON.parse(candidate.capabilities_json) as ModelCapabilities;
      const capabilities = normalizeVideoCapabilities(configuredCapabilities, candidate.provider_id, candidate.model_name);
      const candidateRequest: GenerateVideoRequest = { ...input.request };
      normalizeVideoRequestForCapabilities(capabilities, candidateRequest, candidate.provider_id, candidate.model_name);
      validateVideoRequest(capabilities, candidateRequest, candidate.provider_id, candidate.model_name);
      const apiKey = candidate.encrypted_api_key ? decryptApiKey(candidate.encrypted_api_key) : "";
      if (!apiKey) continue;
      const providerId = candidate.provider_id ?? "";
      const modelName = candidate.model_name ?? "";
      const officialVideoMode = candidateRequest.videoMode ?? legacyInputModeToOfficialMode(candidateRequest.inputMode, providerId);
      const providerParams = {
        ...candidateRequest,
        videoMode: officialVideoMode,
        apiKey,
        apiBaseUrl: apiBaseUrlFor(candidate),
        modelName,
        providerId,
        capabilities,
        qualityMode: candidateRequest.qualityMode ?? "full_quality"
      };
      const preflightSummary = buildPayloadSummary({
        providerId,
        selectedModelId: candidate.id,
        actualModelName: modelName,
        inputMode: officialVideoMode,
        aspectRatio: candidateRequest.aspectRatio,
        mappedResolution: candidateRequest.resolution,
        duration: candidateRequest.duration,
        quality: candidateRequest.qualityMode ?? "full_quality",
        qualityMode: candidateRequest.qualityMode ?? "full_quality",
        hasImageInput: Boolean(candidateRequest.imageAssetIds?.length),
        imageInputCount: candidateRequest.imageAssetIds?.length ?? 0,
        prompt: candidateRequest.prompt,
        negativePrompt: candidateRequest.negativePrompt,
        isMock: false,
        qualityAudit: {
          videoMode: officialVideoMode,
          qualityMode: candidateRequest.qualityMode ?? "full_quality",
          promptExtend: candidateRequest.promptExtend ?? true,
          seed: candidateRequest.seed,
          isFallback: true
        },
        payloadSummary: {
          stage: "fallback-preflight",
          fallbackFromModelConfigId: input.primaryModel.id,
          fallbackFromModel: input.primaryModel.model_name,
          fallbackFromBaseUrl: input.primaryModel.api_base_url
        }
      });
      console.warn("[video fallback] retrying with alternate model", {
        fromModelConfigId: input.primaryModel.id,
        fromModelName: input.primaryModel.model_name,
        toModelConfigId: candidate.id,
        toModelName: candidate.model_name,
        toProviderId: candidate.provider_id,
        toApiBaseUrl: candidate.api_base_url
      });
      logOfficialPayload(preflightSummary);
      let result = await callVideoProvider({ model: candidate, providerParams, capabilities });
      result = await enforceVideoAspectRatio(result, candidateRequest.aspectRatio, candidateRequest.resolution);
      return { model: candidate, request: candidateRequest, result, preflightSummary };
    } catch (fallbackError) {
      console.warn("[video fallback] candidate failed", {
        modelConfigId: candidate.id,
        modelName: candidate.model_name,
        providerId: candidate.provider_id,
        message: fallbackError instanceof Error ? fallbackError.message : String(fallbackError)
      });
    }
  }
  return undefined;
}

async function writeMockAsset(input: { nodeId: string; kind: "image" | "video"; payload: Record<string, unknown> }) {
  const uploadRoot = process.env.UPLOAD_DIR ?? "./uploads";
  const outputDir = path.resolve(process.cwd(), uploadRoot, "generated");
  fs.mkdirSync(outputDir, { recursive: true });
  if (input.kind === "video") {
    const mockVideoPath = path.resolve(process.cwd(), uploadRoot, "mock", "mock-video.mp4");
    if (fs.existsSync(mockVideoPath)) {
      const fileName = `video_${input.nodeId}_${Date.now()}.mp4`;
      const outputPath = path.join(outputDir, fileName);
      fs.copyFileSync(mockVideoPath, outputPath);
      return createAsset({
        type: "generated",
        source: "generated",
        originalName: fileName,
        localPath: outputPath,
        url: `/uploads/generated/${fileName}`,
        size: fs.statSync(outputPath).size
      });
    }
  }

  const fileName = `${input.nodeId}-${Date.now()}.json`;
  const outputPath = path.join(outputDir, fileName);
  fs.writeFileSync(outputPath, JSON.stringify({ mock: true, kind: input.kind, ...input.payload }, null, 2));
  return createAsset({
    type: "generated",
    source: "generated",
    originalName: fileName,
    localPath: outputPath,
    url: `/uploads/generated/${fileName}`,
    size: fs.statSync(outputPath).size
  });
}

async function createGeneratedAssetFromProvider(
  result: ProviderGenerateResult,
  fallbackName: string,
  context?: {
    providerId?: string;
    modelId?: string;
    nodeId?: string;
    projectId?: string;
    prompt?: string;
    negativePrompt?: string;
  }
) {
  if (!result.outputUrl || !result.localPath) return undefined;
  return createAsset({
    type: "generated",
    source: "generated",
    originalName: path.basename(result.localPath) || fallbackName,
    localPath: result.localPath,
    url: result.outputUrl,
    size: fs.existsSync(result.localPath) ? fs.statSync(result.localPath).size : undefined,
    providerId: context?.providerId,
    modelId: context?.modelId,
    nodeId: context?.nodeId,
    projectId: context?.projectId,
    prompt: context?.prompt,
    negativePrompt: context?.negativePrompt,
    generationParams: result.payloadSummary && typeof result.payloadSummary === "object" ? result.payloadSummary as Record<string, unknown> : undefined
  });
}

async function enrichPayloadSummaryWithOutput(
  preflightSummary: Record<string, unknown>,
  result: ProviderGenerateResult
) {
  const outputMetadata = result.localPath ? await readGeneratedFileMetadata(result.localPath) : {};
  const outputAudit = metadataToQualityAudit(outputMetadata);
  const providerSummary = result.payloadSummary && typeof result.payloadSummary === "object" ? result.payloadSummary as Record<string, unknown> : {};
  return {
    ...preflightSummary,
    ...providerSummary,
    ...outputAudit,
    payloadSummary: {
      ...(preflightSummary.payloadSummary && typeof preflightSummary.payloadSummary === "object" ? preflightSummary.payloadSummary as Record<string, unknown> : {}),
      ...(providerSummary.payloadSummary && typeof providerSummary.payloadSummary === "object" ? providerSummary.payloadSummary as Record<string, unknown> : {}),
      output: outputMetadata
    }
  };
}

function providerSummary(result: ProviderGenerateResult) {
  return result.payloadSummary && typeof result.payloadSummary === "object"
    ? result.payloadSummary as Record<string, unknown>
    : {};
}

function videoTaskIdFrom(result: ProviderGenerateResult, request: GenerateVideoRequest) {
  const summary = providerSummary(result);
  return String(
    summary.taskId
    ?? summary.providerTaskId
    ?? summary.parsedTaskId
    ?? extractProviderTaskId(result.rawResponse)
    ?? request.clientRequestId
    ?? request.nodeId
  );
}

async function markVideoTaskStage(input: {
  id?: string;
  status: string;
  stage: string;
  progress?: number;
  providerStatus?: string;
  providerVideoUrl?: string;
  outputUrl?: string;
  cosKey?: string;
  fileSize?: number;
  mimeType?: string;
  completedAt?: number;
  failedStage?: string;
  errorCode?: string;
  errorMessage?: string;
  result?: Record<string, unknown>;
}) {
  if (!input.id) return;
  await saveGenerationTask({
    id: input.id,
    status: input.status,
    providerStatus: input.providerStatus,
    providerVideoUrl: input.providerVideoUrl,
    outputUrl: input.outputUrl,
    cosKey: input.cosKey,
    fileSize: input.fileSize,
    mimeType: input.mimeType,
    completedAt: input.completedAt,
    failedStage: input.failedStage,
    errorCode: input.errorCode,
    errorMessage: input.errorMessage,
    progress: input.progress,
    stage: input.stage,
    result: input.result
  });
}

function ensureProviderVideoUrl(result: ProviderGenerateResult) {
  const providerVideoUrl = result.outputUrl ?? extractProviderVideoUrl(result.rawResponse);
  if (!providerVideoUrl && (result.status === "success" || isProviderSuccessStatus(result.rawResponse))) {
    throw new ProviderError(
      "PROVIDER_RESULT_EMPTY",
      "中转任务已成功，但没有解析到视频地址",
      safeStringify(result.rawResponse),
      {
        failedStage: "provider_result_parse",
        rawResponse: result.rawResponse,
        pollRawResponse: result.rawResponse,
        parsedVideoUrl: undefined
      }
    );
  }
  return providerVideoUrl;
}

async function enforceVideoAspectRatio(result: ProviderGenerateResult, aspectRatio?: string, resolution?: string): Promise<ProviderGenerateResult> {
  if (!aspectRatio || !resolution) return result;
  const payloadSummary = result.payloadSummary && typeof result.payloadSummary === "object" ? result.payloadSummary as Record<string, unknown> : {};
  if (payloadSummary.nativeAspectRatioRequired) {
    const metadata = await readGeneratedFileMetadata(result.localPath ?? "");
    const target = mapVideoDimensions(aspectRatio, resolution);
    const outputWidth = metadata.width;
    const outputHeight = metadata.height;
    const matchesNative = Boolean(outputWidth && outputHeight)
      && Math.abs((outputWidth! / outputHeight!) - (target.width / target.height)) < 0.02;
    if (!matchesNative) {
      const actualAspectRatio = outputWidth && outputHeight ? `${outputWidth}:${outputHeight}` : "unknown";
      return {
        ...result,
        payloadSummary: {
          ...payloadSummary,
          requestedAspectRatio: normalizeVideoAspectRatio(aspectRatio),
          outputAspectRatio: actualAspectRatio,
          outputAspectRatioTransformed: false,
          outputAspectRatioFitMode: "provider_original_mismatch",
          nativeAspectRatioMismatch: true,
          modelNativeOutput: metadata,
          deliveryWarning: `上游已成功生成视频，但实际比例为 ${actualAspectRatio}，与请求的 ${normalizeVideoAspectRatio(aspectRatio)} 不一致。画布保留原视频，未进行裁剪。`
        }
      };
    }
    return {
      ...result,
      payloadSummary: {
        ...payloadSummary,
        outputAspectRatio: normalizeVideoAspectRatio(aspectRatio),
        outputAspectRatioTransformed: false,
        outputAspectRatioFitMode: "native_required",
        modelNativeOutput: metadata
      }
    };
  }
  const ensured = await ensureVideoAspectRatio(result.localPath, aspectRatio, resolution);
  if (!ensured) return result;
  if (!ensured.transformed) {
    return {
      ...result,
      payloadSummary: {
        ...(result.payloadSummary && typeof result.payloadSummary === "object" ? result.payloadSummary as Record<string, unknown> : {}),
        outputAspectRatio: ensured.aspectRatio,
        outputAspectRatioTransformed: false,
        outputAspectRatioFitMode: ensured.fitMode
      }
    };
  }
  return {
    ...result,
    localPath: ensured.localPath,
    outputUrl: ensured.outputUrl ?? result.outputUrl,
    payloadSummary: {
      ...(result.payloadSummary && typeof result.payloadSummary === "object" ? result.payloadSummary as Record<string, unknown> : {}),
      outputAspectRatio: ensured.aspectRatio,
      outputAspectRatioTransformed: true,
      outputAspectRatioFitMode: ensured.fitMode,
      originalOutput: ensured.originalMetadata,
      transformedOutput: ensured.metadata
    }
  };
}

async function enforceImageAspectRatio(result: ProviderGenerateResult, aspectRatio?: string): Promise<ProviderGenerateResult> {
  if (!aspectRatio || aspectRatio === "auto") return result;
  const ensured = await ensureImageAspectRatio(result.localPath, aspectRatio);
  if (!ensured) return result;
  return {
    ...result,
    payloadSummary: {
      ...(result.payloadSummary && typeof result.payloadSummary === "object" ? result.payloadSummary as Record<string, unknown> : {}),
      outputAspectRatio: ensured.aspectRatio,
      outputAspectRatioTransformed: false,
      outputAspectRatioFitMode: ensured.fitMode,
      modelNativeOutput: ensured.metadata
    }
  };
}

export async function generateText(input: GenerateTextRequest) {
  const { model, apiKey, catalogItem, forceMock } = await getGenerationContext(input.modelConfigId, "text");
  logGenerate({ type: "text", model, catalogItem, apiKey, inputMode: "text" });
  const capabilities = JSON.parse(model.capabilities_json) as ModelCapabilities;

  try {
    if (forceMock) {
      return { status: "success" as const, outputText: `Mock 文本结果：${input.inputText}` };
    }
    assertModelRuntimeReady({ model, apiKey, capabilities, type: "text", inputMode: "text" });
    const providerParams = {
      ...input,
      apiKey,
      apiBaseUrl: apiBaseUrlFor(model),
      modelName: model.model_name,
      providerId: model.provider_id,
      catalogModelId: catalogItem?.id,
      capabilities
    };

    if (model.provider_id === "deepseek") return await generateTextWithDeepSeek(providerParams);
    if (model.provider_id === "google") return await generateTextWithGoogle(providerParams);
    return await generateTextWithOpenAICompatible(providerParams);
  } catch (error) {
    const meta = providerErrorMeta(model.provider_id, error);
    return errorResponse(meta.errorMessage, meta.errorCode, meta.debugMessage, meta.payloadSummary);
  }
}
export async function generateVideo(input: GenerateVideoRequest) {
  const { model, apiKey, catalogItem, forceMock } = await getGenerationContext(input.modelConfigId, "video");
  logGenerate({ type: "video", model, catalogItem, apiKey, inputMode: input.inputMode });
  const configuredCapabilities = JSON.parse(model.capabilities_json) as ModelCapabilities;
  const capabilities = normalizeVideoCapabilities(configuredCapabilities, model.provider_id, model.model_name);
  const inputForGeneration: GenerateVideoRequest = { ...input, generateCount: 1 };
  try {
    normalizeVideoRequestForCapabilities(capabilities, inputForGeneration, model.provider_id, model.model_name);
    validateVideoRequest(capabilities, inputForGeneration, model.provider_id, model.model_name);
    if (forceMock) {
      const asset = await writeMockAsset({
        nodeId: inputForGeneration.nodeId,
        kind: "video",
        payload: {
        message: "Mock video generation result. Set ALLOW_MOCK_GENERATION=false to use provider adapters.",
          prompt: inputForGeneration.prompt,
          duration: inputForGeneration.duration,
          aspectRatio: inputForGeneration.aspectRatio,
          resolution: inputForGeneration.resolution
        }
      });
      await addHistory({
        generationType: "video",
        projectId: inputForGeneration.projectId,
        nodeId: inputForGeneration.nodeId,
        modelConfigId: inputForGeneration.modelConfigId,
        modelDisplayName: model.display_name,
        inputMode: inputForGeneration.inputMode,
        prompt: inputForGeneration.prompt,
        duration: inputForGeneration.duration,
        aspectRatio: inputForGeneration.aspectRatio,
        resolution: inputForGeneration.resolution,
        status: "success",
        outputPath: asset.localPath,
        outputUrl: asset.url
      });
      return { status: "success" as const, outputAssetId: asset.id, outputUrl: asset.url };
    }

    assertModelRuntimeReady({ model, apiKey, capabilities, type: "video", inputMode: inputForGeneration.inputMode });
    const providerId = model.provider_id ?? "";
    const modelName = model.model_name ?? "";
    const officialVideoMode = inputForGeneration.videoMode ?? legacyInputModeToOfficialMode(inputForGeneration.inputMode, providerId);
    const providerParams = {
      ...inputForGeneration,
      videoMode: officialVideoMode,
      apiKey,
      apiBaseUrl: apiBaseUrlFor(model),
      modelName,
      providerId,
      capabilities,
      qualityMode: inputForGeneration.qualityMode ?? "full_quality"
    };

    let activeModel = model;
    let activeInputForGeneration = inputForGeneration;
    let preflightSummary = buildPayloadSummary({
      providerId,
      selectedModelId: model.id,
      actualModelName: modelName,
      inputMode: officialVideoMode,
      aspectRatio: inputForGeneration.aspectRatio,
      mappedResolution: inputForGeneration.resolution,
      duration: inputForGeneration.duration,
      quality: inputForGeneration.qualityMode ?? "full_quality",
      qualityMode: inputForGeneration.qualityMode ?? "full_quality",
      hasImageInput: Boolean(inputForGeneration.imageAssetIds?.length),
      imageInputCount: inputForGeneration.imageAssetIds?.length ?? 0,
      prompt: inputForGeneration.prompt,
      negativePrompt: inputForGeneration.negativePrompt,
      isMock: false,
      qualityAudit: {
        videoMode: officialVideoMode,
        qualityMode: inputForGeneration.qualityMode ?? "full_quality",
        promptExtend: inputForGeneration.promptExtend ?? true,
        seed: inputForGeneration.seed,
        isFallback: false
      },
      payloadSummary: { stage: "preflight", legacyInputMode: inputForGeneration.inputMode, officialMode: officialVideoMode }
    });
    logOfficialPayload(preflightSummary);

    let result: ProviderGenerateResult;
    try {
      await markVideoTaskStage({
        id: inputForGeneration.clientRequestId ?? inputForGeneration.nodeId,
        status: "processing",
        stage: "create_started",
        progress: 0,
        result: {
          provider: providerId,
          modelId: modelName,
          capability: "video",
          nodeId: inputForGeneration.nodeId,
          projectId: inputForGeneration.projectId,
          createEndpoint: "provider_adapter"
        }
      });
      result = await callVideoProvider({ model, providerParams, capabilities });
      await markVideoTaskStage({
        id: videoTaskIdFrom(result, inputForGeneration),
        status: "processing",
        stage: "create_success",
        providerStatus: result.status === "processing" ? "processing" : "succeeded",
        progress: result.status === "processing" ? 10 : 80,
        result: {
          provider: providerId,
          modelId: modelName,
          capability: "video",
          nodeId: inputForGeneration.nodeId,
          projectId: inputForGeneration.projectId,
          createRawResponse: result.rawResponse,
          parsedTaskId: videoTaskIdFrom(result, inputForGeneration)
        }
      });
      if (result.status === "processing") {
        const payloadSummary = {
          ...preflightSummary,
          ...(result.payloadSummary && typeof result.payloadSummary === "object" ? result.payloadSummary as Record<string, unknown> : {})
        };
        const pendingTaskId = videoTaskIdFrom(result, inputForGeneration);
        await markVideoTaskStage({
          id: pendingTaskId,
          status: "processing",
          stage: "polling",
          providerStatus: "processing",
          result: {
            ...payloadSummary,
            provider: providerId,
            modelId: modelName,
            capability: "video",
            nodeId: inputForGeneration.nodeId,
            projectId: inputForGeneration.projectId,
            createRawResponse: result.rawResponse
          }
        });
        await addHistory({
          generationType: "video",
          projectId: inputForGeneration.projectId,
          nodeId: inputForGeneration.nodeId,
          modelConfigId: model.id,
          modelDisplayName: model.display_name,
          inputMode: inputForGeneration.inputMode,
          prompt: inputForGeneration.prompt,
          duration: inputForGeneration.duration,
          aspectRatio: inputForGeneration.aspectRatio,
          resolution: inputForGeneration.resolution,
          status: "processing",
          errorMessage: "上游任务仍在生成中"
        });
        return { status: "processing" as const, payloadSummary };
      }
      result = await enforceVideoAspectRatio(result, inputForGeneration.aspectRatio, inputForGeneration.resolution);
    } catch (primaryError) {
      const fallback = await tryVideoFallback({ primaryModel: model, request: inputForGeneration, primaryError });
      if (!fallback) throw primaryError;
      activeModel = fallback.model;
      activeInputForGeneration = fallback.request;
      preflightSummary = fallback.preflightSummary;
      result = fallback.result;
      result.payloadSummary = {
        ...(result.payloadSummary && typeof result.payloadSummary === "object" ? result.payloadSummary as Record<string, unknown> : {}),
        fallbackFromModelConfigId: model.id,
        fallbackFromModelDisplayName: model.display_name,
        fallbackToModelConfigId: activeModel.id,
        fallbackToModelDisplayName: activeModel.display_name
      };
    }

    const taskId = videoTaskIdFrom(result, activeInputForGeneration);
    await markVideoTaskStage({
      id: taskId,
      status: "processing",
      stage: "provider_succeeded",
      providerStatus: "succeeded",
      progress: 85,
      result: {
        provider: activeModel.provider_id ?? "",
        modelId: activeModel.model_name ?? activeModel.id,
        capability: "video",
        nodeId: activeInputForGeneration.nodeId,
        projectId: activeInputForGeneration.projectId,
        pollRawResponse: result.rawResponse,
        parsedTaskId: taskId
      }
    });
    const providerVideoUrl = ensureProviderVideoUrl(result);
    await markVideoTaskStage({
      id: taskId,
      status: "processing",
      stage: "provider_result_parsed",
      providerStatus: "succeeded",
      providerVideoUrl,
      progress: 88,
      result: {
        parsedTaskId: taskId,
        parsedVideoUrl: providerVideoUrl ? sanitizeUrlForLog(providerVideoUrl) : undefined,
        providerVideoUrl: providerVideoUrl ? sanitizeUrlForLog(providerVideoUrl) : undefined
      }
    });
    let asset;
    if (result.localPath) {
      await markVideoTaskStage({
        id: taskId,
        status: "processing",
        stage: "upload_to_cos",
        providerStatus: "succeeded",
        providerVideoUrl,
        progress: 92
      });
      try {
        asset = await createGeneratedAssetFromProvider(result, `video_${activeInputForGeneration.nodeId}.mp4`, {
          providerId: activeModel.provider_id ?? "",
          modelId: activeModel.id,
          nodeId: activeInputForGeneration.nodeId,
          projectId: activeInputForGeneration.projectId,
          prompt: activeInputForGeneration.prompt,
          negativePrompt: activeInputForGeneration.negativePrompt
        });
      } catch (assetError) {
        throw new ProviderError(
          "COS_UPLOAD_FAILED",
          "视频已生成，但保存到素材库或腾讯云 COS 失败。",
          rawErrorMessage(assetError),
          {
            failedStage: "upload_to_cos",
            providerVideoUrl: sanitizeUrlForLog(providerVideoUrl),
            errorMessage: rawErrorMessage(assetError)
          }
        );
      }
    } else if (providerVideoUrl) {
      await markVideoTaskStage({
        id: taskId,
        status: "processing",
        stage: "downloading_video",
        providerStatus: "succeeded",
        providerVideoUrl,
        progress: 90
      });
      const persisted = await persistGeneratedVideoToCOS({
        providerVideoUrl,
        taskId,
        userId: undefined,
        workspaceId: undefined,
        providerId: activeModel.provider_id ?? "",
        modelId: activeModel.id,
        nodeId: activeInputForGeneration.nodeId,
        projectId: activeInputForGeneration.projectId,
        prompt: activeInputForGeneration.prompt,
        negativePrompt: activeInputForGeneration.negativePrompt,
        generationParams: providerSummary(result)
      });
      asset = persisted.asset;
      result = {
        ...result,
        outputUrl: persisted.cosUrl,
        localPath: persisted.localPath,
        payloadSummary: {
          ...providerSummary(result),
          providerVideoUrl: sanitizeUrlForLog(providerVideoUrl),
          cosObjectKey: persisted.cosObjectKey,
          fileSize: persisted.fileSize,
          mimeType: persisted.mimeType
        }
      };
      await markVideoTaskStage({
        id: taskId,
        status: "processing",
        stage: "cos_uploaded",
        providerStatus: "succeeded",
        providerVideoUrl,
        outputUrl: persisted.cosUrl,
        cosKey: persisted.cosObjectKey,
        fileSize: persisted.fileSize,
        mimeType: persisted.mimeType,
        progress: 96,
        result: {
          providerVideoUrl: sanitizeUrlForLog(providerVideoUrl),
          cosUploadStatus: persisted.cosUploadStatus,
          cosObjectKey: persisted.cosObjectKey,
          finalOutputUrl: persisted.cosUrl
        }
      });
    }
    if (!asset) {
      throw new ProviderError(
        "COS_UPLOAD_FAILED",
        "视频已生成，但没有成功创建可保存的视频资产。",
        undefined,
        { failedStage: "upload_to_cos", providerVideoUrl: sanitizeUrlForLog(providerVideoUrl) }
      );
    }
    const finalOutputUrl = asset.url ?? result.outputUrl;
    const finalLocalPath = asset.localPath ?? result.localPath;
    result = { ...result, outputUrl: finalOutputUrl, localPath: finalLocalPath };
    await markVideoTaskStage({
      id: taskId,
      status: "processing",
      stage: "cos_uploaded",
      providerStatus: "succeeded",
      providerVideoUrl,
      outputUrl: finalOutputUrl,
      cosKey: asset.storageKey,
      fileSize: asset.size,
      mimeType: asset.mimeType,
      progress: 96
    });
    const payloadSummary = await enrichPayloadSummaryWithOutput(preflightSummary, result);
    try {
      await addHistory({
        generationType: "video",
        projectId: activeInputForGeneration.projectId,
        nodeId: activeInputForGeneration.nodeId,
        modelConfigId: activeModel.id,
        modelDisplayName: activeModel.display_name,
        inputMode: activeInputForGeneration.inputMode,
        prompt: activeInputForGeneration.prompt,
        duration: activeInputForGeneration.duration,
        aspectRatio: activeInputForGeneration.aspectRatio,
        resolution: activeInputForGeneration.resolution,
        status: "success",
        outputPath: finalLocalPath,
        outputUrl: finalOutputUrl
      });
    } catch (historyError) {
      throw new ProviderError(
        "HISTORY_SAVE_FAILED",
        "视频已转存，但生成历史写入失败。",
        rawErrorMessage(historyError),
        {
          failedStage: "history_save",
          providerVideoUrl: sanitizeUrlForLog(providerVideoUrl),
          cosObjectKey: asset.storageKey,
          finalOutputUrl,
          errorMessage: rawErrorMessage(historyError)
        }
      );
    }
    await markVideoTaskStage({
      id: taskId,
      status: "processing",
      stage: "history_saved",
      providerStatus: "succeeded",
      providerVideoUrl,
      outputUrl: finalOutputUrl,
      cosKey: asset.storageKey,
      fileSize: asset.size,
      mimeType: asset.mimeType,
      progress: 98
    });
    try {
      await updateCanvasNodeWithGeneratedVideo({
        projectId: activeInputForGeneration.projectId,
        nodeId: activeInputForGeneration.nodeId,
        outputUrl: finalOutputUrl,
        outputAssetId: asset.id,
        downloadableUrl: asset.downloadUrl ?? finalOutputUrl
      });
    } catch (canvasError) {
      throw new ProviderError(
        "CANVAS_UPDATE_FAILED",
        "视频已转存并写入历史，但画布节点状态同步失败。",
        rawErrorMessage(canvasError),
        {
          failedStage: "canvas_update",
          providerVideoUrl: sanitizeUrlForLog(providerVideoUrl),
          cosObjectKey: asset.storageKey,
          finalOutputUrl,
          errorMessage: rawErrorMessage(canvasError)
        }
      );
    }
    const completedAt = Date.now();
    await markVideoTaskStage({
      id: taskId,
      status: "success",
      stage: "canvas_updated",
      providerStatus: "succeeded",
      providerVideoUrl,
      outputUrl: finalOutputUrl,
      cosKey: asset.storageKey,
      fileSize: asset.size,
      mimeType: asset.mimeType,
      completedAt,
      progress: 100,
      result: {
        provider: activeModel.provider_id ?? "",
        modelId: activeModel.model_name ?? activeModel.id,
        capability: "video",
        parsedTaskId: taskId,
        parsedVideoUrl: sanitizeUrlForLog(providerVideoUrl),
        providerVideoUrl: sanitizeUrlForLog(providerVideoUrl),
        cosUploadStatus: "success",
        cosObjectKey: asset.storageKey,
        finalOutputUrl,
        canvasUpdated: true
      }
    });
    return { status: "success" as const, outputAssetId: asset.id, outputUrl: finalOutputUrl, payloadSummary };
  } catch (error) {
    const meta = providerErrorMeta(model.provider_id, error);
    const errorDetails = isProviderError(error) && error.details && typeof error.details === "object"
      ? error.details as Record<string, unknown>
      : {};
    const failedStage = typeof errorDetails.failedStage === "string" ? errorDetails.failedStage : "failed";
    const failedTaskId = String(errorDetails.parsedTaskId ?? errorDetails.taskId ?? input.clientRequestId ?? input.nodeId);
    if (hasSubmittedRemoteVideoTask(error)) {
      const details = errorDetails;
      await markVideoTaskStage({
        id: failedTaskId,
        status: "processing",
        stage: "polling",
        providerStatus: "processing",
        progress: 35,
        result: {
          ...details,
          provider: model.provider_id ?? "",
          modelId: model.model_name ?? model.id,
          capability: "video",
          nodeId: input.nodeId,
          projectId: input.projectId,
          parsedTaskId: failedTaskId,
          pendingAfterPollInterruption: true
        }
      });
      await addHistory({
        generationType: "video",
        projectId: input.projectId,
        nodeId: input.nodeId,
        modelConfigId: input.modelConfigId,
        modelDisplayName: model.display_name,
        inputMode: input.inputMode,
        prompt: input.prompt,
        duration: input.duration,
        aspectRatio: input.aspectRatio,
        resolution: input.resolution,
        status: "processing",
        errorMessage: "上游任务已创建，仍在排队或生成中。"
      });
      return {
        status: "processing" as const,
        payloadSummary: {
          ...details,
          pendingAfterPollInterruption: true,
          message: "上游任务已创建，仍在排队或生成中。"
        }
      };
    }
    await markVideoTaskStage({
      id: failedTaskId,
      status: "error",
      stage: "failed",
      providerStatus: typeof errorDetails.providerStatus === "string" ? errorDetails.providerStatus : "failed",
      failedStage,
      errorCode: meta.errorCode,
      errorMessage: meta.errorMessage,
      providerVideoUrl: typeof errorDetails.providerVideoUrl === "string" ? errorDetails.providerVideoUrl : undefined,
      outputUrl: typeof errorDetails.finalOutputUrl === "string" ? errorDetails.finalOutputUrl : undefined,
      progress: 100,
      result: {
        ...errorDetails,
        provider: model.provider_id ?? "",
        modelId: model.model_name ?? model.id,
        capability: "video",
        nodeId: input.nodeId,
        projectId: input.projectId,
        failedStage,
        errorCode: meta.errorCode,
        errorMessage: meta.errorMessage,
        rawError: meta.debugMessage
      }
    });
    await addHistory({
      generationType: "video",
      projectId: input.projectId,
      nodeId: input.nodeId,
      modelConfigId: input.modelConfigId,
      modelDisplayName: model.display_name,
      inputMode: input.inputMode,
      prompt: input.prompt,
      duration: input.duration,
      aspectRatio: input.aspectRatio,
      resolution: input.resolution,
      status: "error",
      errorMessage: `${meta.errorMessage}${failedStage !== "failed" ? `（阶段：${failedStage}）` : ""}${meta.errorCode ? ` [${meta.errorCode}]` : ""}`
    });
    return errorResponse(meta.errorMessage, meta.errorCode, meta.debugMessage, meta.payloadSummary);
  }
}

export async function generateImage(input: GenerateImageRequest) {
  const { model, apiKey, catalogItem, forceMock } = await getGenerationContext(input.modelConfigId, "image");
  logGenerate({ type: "image", model, catalogItem, apiKey, inputMode: input.inputMode });
  const configuredCapabilities = JSON.parse(model.capabilities_json) as ModelCapabilities;
  const useCatalogCapabilities = shouldUseCatalogCapabilities(model, catalogItem);
  const inputForGeneration: GenerateImageRequest = { ...input };
  const runtime = effectiveImageRuntime({
    capabilities: useCatalogCapabilities ? catalogItem!.capabilities : configuredCapabilities,
    providerId: model.provider_id,
    modelName: model.model_name,
    displayName: model.display_name,
    provider: model.provider,
    request: inputForGeneration
  });
  const capabilities = runtime.capabilities;
  try {
    validateImageRequest(capabilities, inputForGeneration);
    if (forceMock) {
      const asset = await writeMockAsset({
        nodeId: inputForGeneration.nodeId,
        kind: "image",
        payload: {
        message: "Mock image generation result. Set ALLOW_MOCK_GENERATION=false to use provider adapters.",
          prompt: inputForGeneration.prompt,
          aspectRatio: inputForGeneration.aspectRatio,
          imageSize: inputForGeneration.imageSize,
          imageQuality: inputForGeneration.imageQuality,
          imageFormat: inputForGeneration.imageFormat
        }
      });
      await addHistory({
        generationType: "image",
        projectId: inputForGeneration.projectId,
        nodeId: inputForGeneration.nodeId,
        modelConfigId: inputForGeneration.modelConfigId,
        modelDisplayName: model.display_name,
        inputMode: inputForGeneration.inputMode,
        prompt: inputForGeneration.prompt,
        resolution: inputForGeneration.aspectRatio ?? inputForGeneration.imageSize,
        aspectRatio: inputForGeneration.aspectRatio,
        status: "success",
        outputPath: asset.localPath,
        outputUrl: asset.url
      });
      return { status: "success" as const, outputAssetId: asset.id, outputUrl: asset.url };
    }

    const providerId = model.provider_id ?? "";
    const modelName = runtime.modelName;
    assertModelRuntimeReady({ model, apiKey, capabilities, type: "image", inputMode: inputForGeneration.inputMode });
    if (useCatalogCapabilities) {
      assertFullQualityModel({ qualityMode: inputForGeneration.qualityMode, providerId, catalogModelId: catalogItem?.id, modelName });
      validateAgainstOfficial({
        providerId,
        catalogModelId: catalogItem?.id,
        modelName,
        inputMode: inputForGeneration.inputMode,
        aspectRatio: inputForGeneration.aspectRatio
      });
    }
    const providerParams = {
      ...inputForGeneration,
      apiKey,
      apiBaseUrl: apiBaseUrlFor(model),
      modelName,
      providerId,
      catalogModelId: useCatalogCapabilities ? catalogItem?.id : undefined,
      capabilities,
      qualityMode: inputForGeneration.qualityMode ?? "full_quality"
    };

    let activeModel = model;
    let activeCatalogItem = catalogItem;
    let activeUseCatalogCapabilities = useCatalogCapabilities;
    let activeInputForGeneration = inputForGeneration;
    let preflightSummary = buildPayloadSummary({
      providerId,
      selectedModelId: useCatalogCapabilities ? catalogItem?.id : model.id,
      actualModelName: modelName,
      inputMode: inputForGeneration.inputMode,
      aspectRatio: inputForGeneration.aspectRatio,
      quality: inputForGeneration.imageQuality,
      qualityMode: inputForGeneration.qualityMode ?? "full_quality",
      hasImageInput: Boolean(inputForGeneration.imageAssetIds?.length),
      imageInputCount: inputForGeneration.imageAssetIds?.length ?? 0,
      prompt: inputForGeneration.prompt,
      negativePrompt: inputForGeneration.negativePrompt,
      isMock: false,
      qualityAudit: {
        qualityMode: inputForGeneration.qualityMode ?? "full_quality",
        promptExtend: inputForGeneration.promptExtend,
        seed: inputForGeneration.seed,
        isFallback: false
      },
      payloadSummary: { stage: "preflight", officialCatalogValidation: useCatalogCapabilities }
    });
    logOfficialPayload(preflightSummary);

    let result: ProviderGenerateResult;
    try {
      result = await callImageProvider({ model, providerParams });
      result = await enforceImageAspectRatio(result, inputForGeneration.aspectRatio);
    } catch (primaryError) {
      const fallback = await tryImageFallback({ primaryModel: model, request: inputForGeneration, primaryError });
      if (!fallback) throw primaryError;
      activeModel = fallback.model;
      activeCatalogItem = fallback.catalogItem;
      activeUseCatalogCapabilities = fallback.useCatalogCapabilities;
      activeInputForGeneration = fallback.request;
      preflightSummary = fallback.preflightSummary;
      result = fallback.result;
      result.payloadSummary = {
        ...(result.payloadSummary && typeof result.payloadSummary === "object" ? result.payloadSummary as Record<string, unknown> : {}),
        fallbackFromModelConfigId: model.id,
        fallbackFromModelDisplayName: model.display_name,
        fallbackToModelConfigId: activeModel.id,
        fallbackToModelDisplayName: activeModel.display_name
      }
    }

    const asset = await createGeneratedAssetFromProvider(result, `image_${activeInputForGeneration.nodeId}.png`, {
      providerId: activeModel.provider_id ?? "",
      modelId: activeUseCatalogCapabilities ? activeCatalogItem?.id : activeModel.id,
      nodeId: activeInputForGeneration.nodeId,
      projectId: activeInputForGeneration.projectId,
      prompt: activeInputForGeneration.prompt,
      negativePrompt: activeInputForGeneration.negativePrompt
    });
    const payloadSummary = await enrichPayloadSummaryWithOutput(preflightSummary, result);
    await addHistory({
      generationType: "image",
      projectId: activeInputForGeneration.projectId,
      nodeId: activeInputForGeneration.nodeId,
      modelConfigId: activeModel.id,
      modelDisplayName: activeModel.display_name,
      inputMode: activeInputForGeneration.inputMode,
      prompt: activeInputForGeneration.prompt,
      resolution: activeInputForGeneration.aspectRatio ?? activeInputForGeneration.imageSize,
      aspectRatio: activeInputForGeneration.aspectRatio,
      status: "success",
      outputPath: asset?.localPath ?? result.localPath,
      outputUrl: asset?.url ?? result.outputUrl
    });
    return { status: "success" as const, outputAssetId: asset?.id, outputUrl: asset?.url ?? result.outputUrl, payloadSummary };
  } catch (error) {
    const meta = providerErrorMeta(model.provider_id, error);
    await addHistory({
      generationType: "image",
      projectId: input.projectId,
      nodeId: input.nodeId,
      modelConfigId: input.modelConfigId,
      modelDisplayName: model.display_name,
      inputMode: input.inputMode,
      prompt: input.prompt,
      status: "error",
      errorMessage: meta.errorMessage
    });
    return errorResponse(meta.errorMessage, meta.errorCode, meta.debugMessage, meta.payloadSummary);
  }
}

export async function generateWithVeo() {
  throw new Error("Google Veo 真实调用入口已迁移到 generateVideoWithGoogleVeo。");
}

export async function generateWithWan() {
  throw new Error("阿里 Wan 真实调用入口已迁移到 generateVideoWithAlibabaWan。");
}

export async function generateWithSeedance() {
  throw new Error("Seedance 真实调用入口已迁移到 generateVideoWithSeedance。");
}

export async function generateWithKling() {
  throw new Error("可灵真实调用入口已迁移到 generateVideoWithKling。");
}

export async function generateWithOpenAICompatible() {
  throw new Error("OpenAI-compatible 真实调用入口尚未接入。");
}

export async function generateWithCustomApi() {
  throw new Error("自定义 API 真实调用入口尚未接入。");
}
