import fs from "node:fs";
import path from "node:path";
import { getDb } from "../db/database.js";
import { createAsset } from "./asset.service.js";
import { decryptApiKey } from "./encryption.service.js";
import { persistGeneratedVideoToCOS, updateCanvasNodeWithGeneratedVideo, updateCanvasNodeWithGenerationFailure, updateCanvasNodeWithVideoTaskRunning } from "./generatedVideoPersistence.service.js";
import { addHistory } from "./history.service.js";
import { finalizeVideoResult } from "./videoTaskFinalizer.service.js";
import { saveGenerationTask } from "./generationTask.service.js";
import { requireRequestContext } from "./requestContext.js";
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
import { isGeminiImageModel, isQwenImageEditModel, normalizeImageCapabilities, qwenTextModelForEdit, resolveImageEndpointFamily } from "./imageCapabilityNormalization.js";
import { channelSupportsImage, joinUrl, resolveVideoRequestConfig, shouldUseProxyVideoAdapter, validateVideoRequestConfig } from "./providers/videoRequestAdapter.js";
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
import { extractProviderProgress, extractProviderStatus, extractProviderTaskId, extractProviderVideoUrl, isFailedStatus, isProviderSuccessStatus, isRunningStatus, isSuccessStatus, sanitizeUrlForLog } from "../utils/videoResultExtractor.js";
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
  requestId?: string;
  clientRequestId?: string;
  projectId?: string;
  nodeId: string;
  modelConfigId: string;
  providerId?: string;
  selectedProviderId?: string;
  modelId?: string;
  selectedModelId?: string;
  capability?: ModelCapabilityKind;
  selectedCapability?: ModelCapabilityKind;
  nodeType?: string;
  endpointStrategy?: string;
  autoModelSelection?: boolean;
  autoVideoModelSelection?: boolean;
  videoCreateEndpoint?: string;
  videoPollEndpoint?: string;
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
  requestId?: string;
  projectId?: string;
  nodeId: string;
  modelConfigId: string;
  providerId?: string;
  modelId?: string;
  capability?: ModelCapabilityKind;
  nodeType?: string;
  endpointStrategy?: string;
  autoModelSelection?: boolean;
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

async function getGenerationContext(modelConfigId: string | undefined, type: "text" | "image" | "video") {
  if (!modelConfigId?.trim()) {
    throw new ProviderError("MODEL_NOT_SELECTED", "未选择生成模型，请先选择模型。", undefined, { type });
  }
  const model = await getInternalModelConfig(modelConfigId);
  if (!model || !model.enabled) {
    throw new ProviderError("MODEL_NOT_FOUND", "当前模型不存在或已被禁用。", undefined, { modelConfigId, type });
  }

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

function isModelCapabilityKind(value: unknown): value is ModelCapabilityKind {
  return typeof value === "string" && [
    "text",
    "image_generation",
    "image_edit",
    "text_to_video",
    "image_to_video",
    "reference_to_video",
    "video_to_video"
  ].includes(value);
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
    throw new ProviderError("CAPABILITY_MISMATCH", "模型 capability 未配置，禁止生成。请在设置中心为该模型选择文本、图片或视频能力。", undefined, {
      model: input.model.model_name,
      providerType
    });
  }
  if (!capabilityKinds.has(required)) {
    throw new ProviderError("CAPABILITY_MISMATCH", `能力不匹配：当前节点需要 ${required}，但模型只配置了 ${Array.from(capabilityKinds).join(", ")}。`, undefined, {
      model: input.model.model_name,
      providerType,
      requiredCapability: required,
      configuredCapabilities: Array.from(capabilityKinds)
    });
  }
}

function validateVideoRequest(capabilities: ModelCapabilities, input: GenerateVideoRequest, providerId?: string, modelName?: string) {
  const requiredCapability = categoryCapability({ type: "video", inputMode: input.inputMode });
  const selectedCapability = input.selectedCapability ?? input.capability;
  if (selectedCapability && selectedCapability !== requiredCapability) {
    throw new ProviderError(
      "CAPABILITY_MISMATCH",
      "当前视频模型能力与节点类型不匹配。",
      undefined,
      {
        selectedCapability,
        requiredCapability,
        nodeType: input.nodeType,
        modelConfigId: input.modelConfigId
      }
    );
  }
  if (isModelCapabilityKind(input.nodeType) && input.nodeType !== requiredCapability) {
    throw new ProviderError(
      "CAPABILITY_MISMATCH",
      "当前视频模型能力与节点类型不匹配。",
      undefined,
      {
        selectedCapability,
        requiredCapability,
        nodeType: input.nodeType,
        modelConfigId: input.modelConfigId
      }
    );
  }
  if (requiredCapability === "text_to_video" && ((input.imageAssetIds?.length ?? 0) > 0 || (input.videoAssetIds?.length ?? 0) > 0)) {
    throw new ProviderError(
      "CAPABILITY_MISMATCH",
      "当前视频模型是文生视频模型，不支持参考素材输入，请切换图生/参考/视频转视频模型或移除参考素材。",
      undefined,
      { selectedCapability, requiredCapability, imageInputCount: input.imageAssetIds?.length ?? 0, videoInputCount: input.videoAssetIds?.length ?? 0 }
    );
  }
  if (requiredCapability === "reference_to_video" && !(input.imageAssetIds?.length || input.videoAssetIds?.length || input.audioAssetIds?.length)) {
    throw new ProviderError(
      "CAPABILITY_MISMATCH",
      "当前参考视频节点需要至少连接一个参考素材。",
      undefined,
      { selectedCapability, requiredCapability, modelConfigId: input.modelConfigId }
    );
  }
  if (requiredCapability === "video_to_video" && !input.videoAssetIds?.length) {
    throw new ProviderError(
      "CAPABILITY_MISMATCH",
      "当前视频转视频节点需要连接视频素材。",
      undefined,
      { selectedCapability, requiredCapability, modelConfigId: input.modelConfigId }
    );
  }
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
  if (!options.availableInputModes.includes(input.inputMode) && !explicitlySupported) {
    throw new ProviderError(
      "CAPABILITY_MISMATCH",
      "当前视频模型能力与节点类型不匹配。",
      undefined,
      {
        selectedCapability,
        requiredCapability,
        inputMode: input.inputMode,
        availableInputModes: options.availableInputModes,
        supportedInputs: channel.supportedInputs,
        modelConfigId: input.modelConfigId
      }
    );
  }
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
  const requiredCapability = categoryCapability({ type: "image", inputMode: input.inputMode });
  if (input.capability && input.capability !== requiredCapability) {
    throw new ProviderError(
      "CAPABILITY_MISMATCH",
      "当前模型能力与节点类型不匹配。",
      undefined,
      {
        selectedCapability: input.capability,
        requiredCapability,
        nodeType: input.nodeType,
        modelConfigId: input.modelConfigId
      }
    );
  }
  if (input.nodeType && input.nodeType !== requiredCapability) {
    throw new ProviderError(
      "CAPABILITY_MISMATCH",
      "当前节点类型与模型能力不匹配。",
      undefined,
      {
        selectedCapability: input.capability,
        requiredCapability,
        nodeType: input.nodeType,
        modelConfigId: input.modelConfigId
      }
    );
  }
  if (input.inputMode === "text-to-image" && input.imageAssetIds?.length) {
    throw new ProviderError(
      "CAPABILITY_MISMATCH",
      "当前模型是文生图模型，不支持参考图输入，请切换图片编辑模型或移除参考图。",
      undefined,
      {
        selectedCapability: "image_generation",
        requiredCapability,
        nodeType: input.nodeType ?? "image_generation",
        imageInputCount: input.imageAssetIds.length,
        modelConfigId: input.modelConfigId
      }
    );
  }
  const options = calculateAvailableImageOptions(capabilities, {
    inputMode: input.inputMode,
    hasImageInput: Boolean(input.imageAssetIds?.length),
    selectedImageSize: input.imageSize,
    selectedQuality: input.imageQuality,
    selectedFormat: input.imageFormat
  });
  if (!options.availableInputModes.includes(input.inputMode)) {
    throw new ProviderError(
      "CAPABILITY_MISMATCH",
      "当前模型能力与节点类型不匹配。",
      undefined,
      {
        selectedCapability: input.capability,
        requiredCapability,
        inputMode: input.inputMode,
        availableInputModes: options.availableInputModes,
        modelConfigId: input.modelConfigId
      }
    );
  }
  if (input.inputMode !== "text-to-image" && !input.imageAssetIds?.length) {
    throw new Error(input.inputMode === "image-edit" ? "图片编辑需要连接一张图片素材" : "图生图需要连接一张图片素材");
  }
  if (input.imageSize && !options.availableImageSizes.includes(input.imageSize)) {
    input.imageSize = options.normalizedSelection.imageSize;
  }
  if (!options.availableImageQualities.includes(input.imageQuality)) {
    input.imageQuality = options.normalizedSelection.imageQuality ?? options.availableImageQualities[0] ?? "auto";
  }
  if (!options.availableImageFormats.includes(input.imageFormat)) {
    input.imageFormat = options.normalizedSelection.imageFormat ?? options.availableImageFormats[0] ?? "png";
  }
}

function selectedImageRouting(input: {
  model: ActiveModelConfig;
  request: GenerateImageRequest;
  modelName: string;
  capabilities: ModelCapabilities;
}) {
  const actualProviderId = input.model.provider_id ?? "";
  const actualModelId = input.model.model_name || input.model.id;
  const upstreamModelId = upstreamModelName(input.model, input.capabilities, input.modelName || actualModelId);
  const actualCapability = categoryCapability({ type: "image", inputMode: input.request.inputMode });
  return {
    requestId: input.request.requestId,
    nodeId: input.request.nodeId,
    nodeType: input.request.nodeType ?? actualCapability,
    endpointStrategy: input.request.endpointStrategy ?? "selected_model_only",
    selectedProviderId: input.request.providerId ?? actualProviderId,
    selectedModelId: input.request.modelId ?? actualModelId,
    selectedModelConfigId: input.request.modelConfigId,
    selectedCapability: input.request.capability ?? actualCapability,
    actualProviderId,
    actualModelId,
    upstreamModelId,
    actualModelConfigId: input.model.id,
    actualCapability,
    actualEndpointFamily: resolveImageEndpointFamily(input.capabilities, actualProviderId, `${actualModelId} ${upstreamModelId}`, input.model.display_name, input.model.provider),
    autoModelSelection: input.request.autoModelSelection === true
  };
}

function assertSelectedImageRouting(route: ReturnType<typeof selectedImageRouting>) {
  if (route.autoModelSelection) {
    throw new ProviderError(
      "MODEL_ROUTING_MISMATCH",
      "当前阶段已关闭自动模型选择，请明确选择单个模型。",
      undefined,
      route
    );
  }
  if (route.selectedProviderId && route.selectedProviderId !== route.actualProviderId) {
    throw new ProviderError(
      "MODEL_ROUTING_MISMATCH",
      "实际调用模型与用户选择模型不一致。",
      undefined,
      route
    );
  }
  const selectedModelMatches = route.selectedModelId === route.actualModelId || route.selectedModelId === route.actualModelConfigId;
  if (route.selectedModelId && !selectedModelMatches) {
    throw new ProviderError(
      "MODEL_ROUTING_MISMATCH",
      "实际调用模型与用户选择模型不一致。",
      undefined,
      route
    );
  }
  if (route.selectedCapability !== route.actualCapability || route.nodeType !== route.actualCapability) {
    throw new ProviderError(
      "CAPABILITY_MISMATCH",
      "当前模型能力与节点类型不匹配。",
      undefined,
      route
    );
  }
  if (route.actualEndpointFamily === "unknown") {
    throw new ProviderError(
      "ADAPTER_ROUTING_MISMATCH",
      "当前图片模型缺少 endpointFamily / adapterFamily 配置，禁止生成。",
      undefined,
      route
    );
  }
}

function selectedVideoRouting(input: {
  model: ActiveModelConfig;
  request: GenerateVideoRequest;
  modelName: string;
  capabilities: ModelCapabilities;
}) {
  const actualProviderId = input.model.provider_id ?? "";
  const actualModelId = input.model.model_name || input.model.id;
  const upstreamModelId = upstreamModelName(input.model, input.capabilities, input.modelName || actualModelId);
  const actualCapability = categoryCapability({ type: "video", inputMode: input.request.inputMode });
  const videoConfig = resolveVideoRequestConfig({
    ...input.request,
    videoMode: input.request.videoMode ?? legacyInputModeToOfficialMode(input.request.inputMode, actualProviderId),
    apiKey: "",
    apiBaseUrl: apiBaseUrlFor(input.model),
    modelName: actualModelId,
    providerId: actualProviderId,
    qualityMode: input.request.qualityMode ?? "full_quality"
  }, input.capabilities);
  return {
    requestId: input.request.requestId ?? input.request.clientRequestId,
    nodeId: input.request.nodeId,
    nodeType: input.request.nodeType ?? actualCapability,
    endpointStrategy: input.request.endpointStrategy ?? "selected_model_only",
    selectedProviderId: input.request.selectedProviderId ?? input.request.providerId ?? actualProviderId,
    selectedModelId: input.request.selectedModelId ?? input.request.modelId ?? actualModelId,
    selectedModelConfigId: input.request.modelConfigId,
    selectedCapability: input.request.selectedCapability ?? input.request.capability ?? actualCapability,
    actualProviderId,
    actualModelId,
    upstreamModelId,
    actualModelConfigId: input.model.id,
    actualCapability,
    createEndpoint: input.request.videoCreateEndpoint ?? videoConfig.createEndpoint,
    pollEndpoint: input.request.videoPollEndpoint ?? videoConfig.pollEndpoint,
    apiFamily: videoConfig.apiFamily,
    autoModelSelection: input.request.autoModelSelection === true || input.request.autoVideoModelSelection === true
  };
}

function upstreamModelName(model: ActiveModelConfig, capabilities: ModelCapabilities | undefined, fallback?: string) {
  return capabilities?.upstreamModelId?.trim() || fallback?.trim() || model.model_name || model.id;
}

function assertOutboundImageModelRoute(input: {
  route: ReturnType<typeof selectedImageRouting>;
  requestBodyModel: string;
  configuredUpstreamModelId?: string;
  endpoint?: string;
}) {
  const selectedModelId = input.route.selectedModelId;
  const explicitUpstream = input.configuredUpstreamModelId?.trim();
  const expectedModel = explicitUpstream || input.route.actualModelId;
  if (!input.requestBodyModel || input.requestBodyModel !== expectedModel) {
    throw new ProviderError(
      "MODEL_ROUTING_MISMATCH",
      "实际发送给中转的模型名与用户选择模型不一致。",
      undefined,
      {
        ...input.route,
        selectedEndpointFamily: input.route.actualEndpointFamily,
        configuredUpstreamModelId: explicitUpstream,
        requestBodyModel: input.requestBodyModel,
        expectedModel,
        endpoint: input.endpoint
      }
    );
  }
  if (selectedModelId && selectedModelId !== input.route.actualModelConfigId && selectedModelId !== input.route.actualModelId) {
    throw new ProviderError(
      "MODEL_ROUTING_MISMATCH",
      "实际调用模型与用户选择模型不一致。",
      undefined,
      { ...input.route, requestBodyModel: input.requestBodyModel }
    );
  }
}

function assertSelectedVideoRouting(route: ReturnType<typeof selectedVideoRouting>) {
  if (route.autoModelSelection) {
    throw new ProviderError(
      "MODEL_ROUTING_MISMATCH",
      "当前阶段已关闭视频自动模型选择，请明确选择单个视频模型。",
      undefined,
      route
    );
  }
  if (route.selectedProviderId && route.selectedProviderId !== route.actualProviderId) {
    throw new ProviderError(
      "MODEL_ROUTING_MISMATCH",
      "实际调用视频模型与用户选择模型不一致。",
      undefined,
      route
    );
  }
  const selectedModelMatches = route.selectedModelId === route.actualModelId || route.selectedModelId === route.actualModelConfigId;
  if (route.selectedModelId && !selectedModelMatches) {
    throw new ProviderError(
      "MODEL_ROUTING_MISMATCH",
      "实际调用视频模型与用户选择模型不一致。",
      undefined,
      route
    );
  }
  if (route.selectedCapability !== route.actualCapability || (isModelCapabilityKind(route.nodeType) && route.nodeType !== route.actualCapability)) {
    throw new ProviderError(
      "CAPABILITY_MISMATCH",
      "当前视频模型能力与节点类型不匹配。",
      undefined,
      route
    );
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
  const modelName = `${model.model_name ?? ""} ${providerParams.modelName ?? ""}`.trim();
  if (providerId === "grsai" || isGrsaiImageEndpoint(providerParams.apiBaseUrl)) {
    return generateImageWithGrsai(providerParams);
  }
  if (providerId === "zhipu" || isZhipuOfficialEndpoint(providerParams.apiBaseUrl)) {
    return generateImageWithZhipu(providerParams);
  }
  if (isMidjourneyImageModel({ providerId, modelName, displayName: model.display_name, apiBaseUrl: providerParams.apiBaseUrl })) {
    return generateImageWithMidjourney(providerParams);
  }
  const endpointFamily = resolveImageEndpointFamily(providerParams.capabilities, providerId, modelName, model.display_name, model.provider);
  if (endpointFamily === "gemini_generate_content" || providerId === "google" || isGeminiImageModel(providerId, modelName, model.display_name, model.provider)) {
    return generateImageWithGoogle(providerParams);
  }
  const providerType = resolveProviderType(providerParams.capabilities, providerParams.apiBaseUrl);
  if (endpointFamily === "openai_images_generation" || endpointFamily === "openai_images_edits") {
    return generateImageWithOpenAI(providerParams);
  }
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

export function hasSubmittedRemoteVideoTask(error: unknown) {
  if (!(error instanceof ProviderError)) return false;
  const details = error.details;
  if (!details || typeof details !== "object") return false;
  const record = details as Record<string, unknown>;
  return [record.proxyTaskId, record.taskId, record.task_id, record.parsedTaskId, record.providerTaskId, record.requestId, record.request_id, record.id, record.jobId, record.job_id]
    .some((value) => typeof value === "string" && value.length > 0);
}

function isTerminalSubmittedVideoError(error: unknown) {
  if (hasSubmittedRemoteVideoTask(error) && isProviderError(error)) {
    const details = error.details && typeof error.details === "object" ? error.details as Record<string, unknown> : {};
    if (details.pollAccessDenied === true) return true;
    const failedStage = String(details.failedStage ?? "");
    const status = String(details.providerStatus ?? details.status ?? details.task_status ?? "");
    if (failedStage === "polling" || details.retryablePollError === true || isRunningStatus(status)) return false;
  }
  const text = isProviderError(error)
    ? `${error.errorCode}\n${error.message}\n${error.debugMessage ?? ""}\n${safeStringify(error.details)}`
    : rawErrorMessage(error);
  return /MODEL_ACCESS_DENIED|API_KEY_INVALID|PROVIDER_ACCOUNT_UNAVAILABLE|PROVIDER_CHANNEL_UNAVAILABLE|UPSTREAM_CHANNEL_UNAVAILABLE|UPSTREAM_QUOTA_EXHAUSTED|This token has no access|no access to model|model.*no access|unauthorized|forbidden|permission|access denied|invalid api key|incorrect api key|可用渠道不存在|无可用渠道|没有.*权限|无权限|未开通/i.test(text);
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

function videoResultProgress(result: ProviderGenerateResult, fallback: number) {
  return extractProviderProgress(result.rawResponse) ?? extractProviderProgress(result.payloadSummary) ?? fallback;
}

function videoResultProviderTaskId(result: ProviderGenerateResult, request: GenerateVideoRequest) {
  const summary = providerSummary(result);
  const value = summary.taskId
    ?? summary.providerTaskId
    ?? summary.parsedTaskId
    ?? summary.task_id
    ?? summary.requestId
    ?? summary.request_id
    ?? extractProviderTaskId(result.rawResponse);
  return typeof value === "string" && value.trim() ? value.trim() : videoTaskIdFrom(result, request);
}

function logVideoTask(event: string, payload: Record<string, unknown>) {
  console.info(`[video-task:${event}]`, JSON.stringify(payload));
}

function logCustomerVideo(event: string, payload: Record<string, unknown>) {
  console.info(`[customer-video:${event}]`, JSON.stringify(payload));
}

async function markVideoTaskStage(input: {
  id?: string;
  status: string;
  stage: string;
  progress?: number;
  providerStatus?: string;
  providerTaskId?: string;
  canvasNodeId?: string;
  projectId?: string;
  providerId?: string;
  modelId?: string;
  modelConfigId?: string;
  upstreamModelId?: string;
  apiBaseUrl?: string;
  encryptedApiKeySnapshot?: string;
  capabilitiesJsonSnapshot?: string;
  providerVideoUrl?: string;
  outputUrl?: string;
  cdnUrl?: string;
  posterUrl?: string;
  previewUrl?: string;
  downloadableUrl?: string;
  cosKey?: string;
  fileSize?: number;
  mimeType?: string;
  completedAt?: number;
  finishedAt?: number;
  failedStage?: string;
  errorCode?: string;
  storageStatus?: string;
  storageError?: string;
  rawCreateResponse?: unknown;
  repairedAt?: number;
  errorMessage?: string;
  result?: Record<string, unknown>;
}) {
  if (!input.id) return;
  logVideoTask(input.stage, {
    localTaskId: input.id,
    providerTaskId: input.providerTaskId,
    canvasNodeId: input.canvasNodeId,
    providerId: input.providerId,
    modelId: input.modelId,
    modelConfigId: input.modelConfigId,
    upstreamModelId: input.upstreamModelId,
    status: input.status,
    providerStatus: input.providerStatus,
    progress: input.progress,
    hasVideoUrl: Boolean(input.providerVideoUrl || input.outputUrl)
  });
  await saveGenerationTask({
    id: input.id,
    status: input.status,
    providerStatus: input.providerStatus,
    providerTaskId: input.providerTaskId,
    canvasNodeId: input.canvasNodeId,
    projectId: input.projectId,
    providerId: input.providerId,
    modelId: input.modelId,
    modelConfigId: input.modelConfigId,
    upstreamModelId: input.upstreamModelId,
    apiBaseUrl: input.apiBaseUrl,
    encryptedApiKeySnapshot: input.encryptedApiKeySnapshot,
    capabilitiesJsonSnapshot: input.capabilitiesJsonSnapshot,
    providerVideoUrl: input.providerVideoUrl,
    outputUrl: input.outputUrl,
    cdnUrl: input.cdnUrl,
    posterUrl: input.posterUrl,
    previewUrl: input.previewUrl,
    downloadableUrl: input.downloadableUrl,
    cosKey: input.cosKey,
    fileSize: input.fileSize,
    mimeType: input.mimeType,
    completedAt: input.completedAt,
    finishedAt: input.finishedAt,
    failedStage: input.failedStage,
    errorCode: input.errorCode,
    storageStatus: input.storageStatus,
    storageError: input.storageError,
    rawCreateResponse: input.rawCreateResponse,
    repairedAt: input.repairedAt,
    errorMessage: input.errorMessage,
    progress: input.progress,
    stage: input.stage,
    result: input.result
  });
}

function stringFrom(value: unknown) {
  return typeof value === "string" && value.trim() ? value.trim() : undefined;
}

function objectFrom(value: unknown): Record<string, unknown> {
  return value && typeof value === "object" ? value as Record<string, unknown> : {};
}

function materializeGenericPollUrl(config: ReturnType<typeof validateVideoRequestConfig>, providerTaskId: string) {
  const endpointTemplate = config.pollEndpoint || "/v1/videos/{taskId}";
  const encoded = encodeURIComponent(providerTaskId);
  const replaced = endpointTemplate
    .replace(/\{taskId\}/g, encoded)
    .replace(/\{task_id\}/g, encoded)
    .replace(/\{id\}/g, encoded)
    .replace(/\{video_id\}/g, encoded)
    .replace(/\{job_id\}/g, encoded);
  if (/^https?:\/\//i.test(replaced)) return replaced;
  if (config.pollIdLocation === "query" && !/[?&](?:id|task_id|taskId|video_id|job_id)=/i.test(replaced)) {
    const separator = replaced.includes("?") ? "&" : "?";
    return joinUrl(config.baseUrl, `${replaced}${separator}${config.pollBodyKey ?? "id"}=${encoded}`);
  }
  return joinUrl(config.baseUrl, replaced);
}

async function findVideoTaskForSync(input: { localTaskId?: string; providerTaskId?: string; canvasNodeId?: string }) {
  const db = await getDb();
  const { workspace } = requireRequestContext();
  return db.get<any>(
    `SELECT * FROM generation_tasks
     WHERE workspace_id = ?
       AND (
         (? IS NOT NULL AND id = ?)
         OR (? IS NOT NULL AND provider_task_id = ?)
         OR (? IS NOT NULL AND canvas_node_id = ?)
       )
     ORDER BY updated_at DESC
     LIMIT 1`,
    workspace.id,
    input.localTaskId ?? null,
    input.localTaskId ?? null,
    input.providerTaskId ?? null,
    input.providerTaskId ?? null,
    input.canvasNodeId ?? null,
    input.canvasNodeId ?? null
  );
}

async function findModelForVideoTask(task: any, result: Record<string, unknown>) {
  const db = await getDb();
  const { workspace } = requireRequestContext();
  const candidateIds = [
    stringFrom(task.model_config_id),
    stringFrom(task.model_id),
    stringFrom(result.modelConfigId),
    stringFrom(result.model_config_id),
    stringFrom(objectFrom(result.modelConfigSnapshot).id),
    stringFrom(objectFrom(result.modelConfigSnapshot).modelConfigId)
  ].filter(Boolean) as string[];
  for (const id of candidateIds) {
    const row = await getInternalModelConfig(id);
    if (row) return row;
  }
  const snapshotCapabilities = stringFrom(task.capabilities_json_snapshot)
    ?? stringFrom(result.capabilitiesJsonSnapshot)
    ?? stringFrom(objectFrom(result.modelConfigSnapshot).capabilitiesJson);
  const snapshotApiBaseUrl = stringFrom(task.api_base_url)
    ?? stringFrom(result.apiBaseUrl)
    ?? stringFrom(objectFrom(result.modelConfigSnapshot).apiBaseUrl);
  const snapshotEncryptedKey = stringFrom(task.encrypted_api_key_snapshot)
    ?? stringFrom(result.encryptedApiKeySnapshot)
    ?? stringFrom(objectFrom(result.modelConfigSnapshot).encryptedApiKey);
  const snapshotModelConfigId = stringFrom(task.model_config_id)
    ?? stringFrom(result.modelConfigId)
    ?? stringFrom(objectFrom(result.modelConfigSnapshot).id)
    ?? stringFrom(objectFrom(result.modelConfigSnapshot).modelConfigId);
  if (snapshotCapabilities && snapshotApiBaseUrl && snapshotEncryptedKey) {
    const snapshotModelName = stringFrom(task.upstream_model_id)
      ?? stringFrom(result.upstreamModelId)
      ?? stringFrom(objectFrom(result.modelConfigSnapshot).upstreamModelId)
      ?? stringFrom(task.model_id)
      ?? stringFrom(result.modelId)
      ?? stringFrom(result.modelName)
      ?? "video-model";
    return {
      id: snapshotModelConfigId ?? stringFrom(task.model_id) ?? snapshotModelName,
      workspace_id: task.workspace_id ?? workspace.id,
      created_by_user_id: task.user_id,
      provider_id: stringFrom(task.provider_id) ?? stringFrom(result.provider) ?? "openai-video",
      provider: stringFrom(result.providerName) ?? stringFrom(result.provider) ?? "video",
      category: "video",
      display_name: stringFrom(result.displayName) ?? snapshotModelName,
      api_base_url: snapshotApiBaseUrl,
      requires_api_base_url: 1,
      encrypted_api_key: snapshotEncryptedKey,
      model_name: snapshotModelName,
      model_type: "video",
      enabled: 1,
      capabilities_json: snapshotCapabilities,
      created_at: task.created_at,
      updated_at: task.updated_at
    };
  }
  const providerId = stringFrom(task.provider_id) ?? stringFrom(result.provider);
  const modelName = stringFrom(task.model_id) ?? stringFrom(result.modelId) ?? stringFrom(result.modelName) ?? stringFrom(result.model);
  return db.get<any>(
    `SELECT * FROM model_configs
     WHERE workspace_id = ?
       AND category = 'video'
       AND (? IS NULL OR provider_id = ?)
       AND (? IS NULL OR model_name = ? OR id = ?)
     ORDER BY updated_at DESC
     LIMIT 1`,
    workspace.id,
    providerId ?? null,
    providerId ?? null,
    modelName ?? null,
    modelName ?? null,
    modelName ?? null
  );
}

export async function syncVideoTaskUpstream(input: { localTaskId?: string; providerTaskId?: string; canvasNodeId?: string }) {
  const task = await findVideoTaskForSync(input);
  if (!task) throw new ProviderError("PROVIDER_ERROR", "未找到可同步的视频任务。");
  let result: Record<string, unknown> = {};
  try {
    result = objectFrom(task.result_json ? JSON.parse(task.result_json) : undefined);
  } catch {
    result = {};
  }
  const providerTaskId = stringFrom(task.provider_task_id)
    ?? stringFrom(result.providerTaskId)
    ?? stringFrom(result.parsedTaskId)
    ?? stringFrom(result.taskId)
    ?? stringFrom(result.task_id)
    ?? stringFrom(input.providerTaskId);
  if (!providerTaskId) throw new ProviderError("PROVIDER_RESULT_EMPTY", "当前任务缺少 provider_task_id，无法同步上游结果。");
  const model = await findModelForVideoTask(task, result);
  if (!model) throw new ProviderError("MODEL_NOT_FOUND", "未找到该任务对应的视频模型配置，无法同步上游结果。");

  const capabilitiesJsonForPoll = stringFrom(task.capabilities_json_snapshot) ?? model.capabilities_json;
  const apiBaseUrlForPoll = stringFrom(task.api_base_url) ?? apiBaseUrlFor(model);
  const encryptedApiKeyForPoll = stringFrom(task.encrypted_api_key_snapshot) ?? model.encrypted_api_key;
  const upstreamModelForPoll = stringFrom(task.upstream_model_id);
  const capabilities = normalizeVideoCapabilities(JSON.parse(capabilitiesJsonForPoll) as ModelCapabilities, model.provider_id, model.model_name);
  const request: GenerateVideoRequest = {
    nodeId: stringFrom(task.canvas_node_id) ?? stringFrom(input.canvasNodeId) ?? "",
    projectId: stringFrom(task.project_id),
    modelConfigId: model.id,
    inputMode: "text-to-video",
    videoMode: "text_to_video",
    prompt: stringFrom(result.prompt)
      ?? stringFrom(result.finalPrompt)
      ?? stringFrom(objectFrom(result.request).prompt)
      ?? stringFrom(objectFrom(result.createRawResponse).prompt)
      ?? "sync upstream video task",
    duration: 5,
    aspectRatio: "16:9",
    resolution: "720p",
    generateCount: 1
  };
  const apiKey = encryptedApiKeyForPoll ? decryptApiKey(encryptedApiKeyForPoll) : "";
  const config = validateVideoRequestConfig({
    ...request,
    apiKey,
    apiBaseUrl: apiBaseUrlForPoll,
    modelName: upstreamModelForPoll ?? upstreamModelName(model, capabilities, model.model_name),
    providerId: model.provider_id,
    videoMode: "text_to_video",
    capabilities
  }, capabilities);
  logCustomerVideo("poll", {
    userId: task.user_id,
    workspaceId: task.workspace_id,
    projectId: task.project_id,
    canvasNodeId: task.canvas_node_id,
    providerId: model.provider_id,
    modelId: task.model_id,
    modelConfigId: task.model_config_id ?? model.id,
    providerTaskId,
    usesTaskKeySnapshot: Boolean(task.encrypted_api_key_snapshot),
    usesTaskBaseUrlSnapshot: Boolean(task.api_base_url),
    usesTaskCapabilitiesSnapshot: Boolean(task.capabilities_json_snapshot)
  });
  const pollUrl = materializeGenericPollUrl(config, providerTaskId);
  const headers: Record<string, string> = { Accept: "application/json", ...(config.pollHeaders ?? {}) };
  if (config.authType === "bearer" && apiKey) headers.Authorization = `Bearer ${apiKey}`;
  if (config.authType === "api-key" && apiKey) headers["x-api-key"] = apiKey;
  let body: string | undefined;
  const method = config.pollMethod ?? "GET";
  if (method === "POST") {
    headers["Content-Type"] = "application/json";
    body = JSON.stringify({ [config.pollBodyKey ?? "id"]: providerTaskId });
  }
  const response = await fetch(pollUrl, { method, headers, body });
  const text = await response.text();
  let rawResponse: unknown;
  try {
    rawResponse = text ? JSON.parse(text) : {};
  } catch {
    rawResponse = { text };
  }
  const providerStatus = extractProviderStatus(rawResponse) ?? (response.ok ? "processing" : "failed");
  const progress = extractProviderProgress(rawResponse) ?? Number(task.progress ?? 0);
  const providerVideoUrl = extractProviderVideoUrl(rawResponse);
  const localTaskId = String(task.id);
  const canvasNodeId = stringFrom(task.canvas_node_id) ?? stringFrom(input.canvasNodeId);
  const projectId = stringFrom(task.project_id);
  const syncTaskConfigSnapshot = {
    modelConfigId: stringFrom(task.model_config_id) ?? model.id,
    upstreamModelId: upstreamModelForPoll ?? upstreamModelName(model, capabilities, model.model_name),
    apiBaseUrl: apiBaseUrlForPoll,
    encryptedApiKeySnapshot: encryptedApiKeyForPoll,
    capabilitiesJsonSnapshot: capabilitiesJsonForPoll
  };
  const syncTaskModelId = stringFrom(task.model_id) ?? model.model_name ?? model.id;
  logVideoTask("sync-upstream", {
    localTaskId,
    providerTaskId,
    providerStatus,
    hasVideoUrl: Boolean(providerVideoUrl)
  });

  if ((isSuccessStatus(providerStatus) || providerVideoUrl) && providerVideoUrl) {
    const finalized = await finalizeVideoResult({
      taskId: localTaskId,
      providerTaskId,
      projectId,
      canvasNodeId,
      providerId: model.provider_id,
      modelId: syncTaskModelId,
      providerVideoUrl,
      outputUrl: providerVideoUrl,
      previewUrl: providerVideoUrl,
      downloadableUrl: providerVideoUrl,
      providerResult: { syncUpstream: true, pollUrl },
      rawResponse,
      source: "sync_upstream"
    });
    logVideoTask("provider-success", { localTaskId, providerTaskId, providerStatus, providerVideoUrl: sanitizeUrlForLog(providerVideoUrl) });
    logVideoTask("canvas-success-sync", { localTaskId, canvasNodeId, outputUrl: sanitizeUrlForLog(finalized.outputUrl) });
    logCustomerVideo("poll-success", {
      userId: task.user_id,
      workspaceId: task.workspace_id,
      projectId,
      canvasNodeId,
      providerTaskId,
      videoUrl: sanitizeUrlForLog(providerVideoUrl)
    });
    logCustomerVideo("finalize", {
      taskId: localTaskId,
      canvasNodeId,
      projectId,
      workspaceId: task.workspace_id,
      videoUrl: sanitizeUrlForLog(finalized.outputUrl)
    });
    return { status: "succeeded", providerTaskId, providerStatus, providerVideoUrl, outputUrl: providerVideoUrl, progress: 100, rawResponse };
  }

  const pollAccessDenied = isPollAccessDeniedResponse(rawResponse, response.status);
  if (!response.ok && providerTaskId && !pollAccessDenied) {
    await markVideoTaskStage({
      id: localTaskId,
      status: "processing",
      stage: "sync_upstream_retryable_poll_error",
      providerStatus,
      providerTaskId,
      canvasNodeId,
      projectId,
      providerId: model.provider_id,
      modelId: syncTaskModelId,
      ...syncTaskConfigSnapshot,
      progress,
      result: {
        rawResponse,
        syncUpstream: true,
        pollUrl,
        retryablePollError: true,
        upstreamStatus: response.status,
        pollAccessDenied: false
      },
      errorMessage: "上游任务已创建，当前轮询查询暂时失败，任务继续等待。"
    });
    await updateCanvasNodeWithVideoTaskRunning({ projectId, nodeId: canvasNodeId, providerTaskId, progress });
    return { status: "processing", providerTaskId, providerStatus, progress, rawResponse };
  }

  if (isRunningStatus(providerStatus)) {
    await markVideoTaskStage({
      id: localTaskId,
      status: "processing",
      stage: "sync_upstream_running",
      providerStatus,
      providerTaskId,
      canvasNodeId,
      projectId,
      providerId: model.provider_id,
      modelId: syncTaskModelId,
      ...syncTaskConfigSnapshot,
      progress,
      result: { rawResponse, syncUpstream: true, pollUrl }
    });
    await updateCanvasNodeWithVideoTaskRunning({ projectId, nodeId: canvasNodeId, providerTaskId, progress });
    return { status: "processing", providerTaskId, providerStatus, progress, rawResponse };
  }

  if (isFailedStatus(providerStatus) || !response.ok) {
    const errorCode = pollAccessDenied ? "MODEL_ACCESS_DENIED" : "PROVIDER_ERROR";
    const upstreamMessage = upstreamErrorMessage(rawResponse);
    const errorMessage = pollAccessDenied
      ? `中转任务查询失败：当前 API Key 无法读取该模型任务结果。${upstreamMessage ? `上游返回：${upstreamMessage}` : ""}`
      : upstreamMessage || `上游任务状态为 ${providerStatus}`;
    await markVideoTaskStage({
      id: localTaskId,
      status: "error",
      stage: "sync_upstream_failed",
      providerStatus,
      providerTaskId,
      canvasNodeId,
      projectId,
      providerId: model.provider_id,
      modelId: syncTaskModelId,
      ...syncTaskConfigSnapshot,
      failedStage: "polling",
      errorCode,
      errorMessage,
      progress: 100,
      result: { rawResponse, syncUpstream: true, pollUrl }
    });
    await updateCanvasNodeWithGenerationFailure({ projectId, nodeId: canvasNodeId, errorMessage, errorCode, failedStage: "polling" });
    return { status: "error", providerTaskId, providerStatus, progress: 100, rawResponse };
  }

  return { status: "processing", providerTaskId, providerStatus, progress, rawResponse };
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

function isPollAccessDeniedResponse(rawResponse: unknown, statusCode?: number) {
  const text = safeStringify(rawResponse);
  return statusCode === 401
    || statusCode === 403
    || /This token has no access|no access to model|model.*no access|unauthorized|forbidden|permission|access denied|invalid api key|incorrect api key|没有.*权限|无权限|未开通/i.test(text);
}

function upstreamErrorMessage(rawResponse: unknown) {
  const payload = rawResponse && typeof rawResponse === "object" ? rawResponse as Record<string, unknown> : {};
  const error = payload.error && typeof payload.error === "object" ? payload.error as Record<string, unknown> : undefined;
  const candidates = [
    error?.message,
    error?.error_message,
    payload.error_message,
    payload.message,
    payload.detail,
    payload.reason,
    payload.msg
  ];
  for (const value of candidates) {
    if (typeof value === "string" && value.trim()) return value.trim();
  }
  return undefined;
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
  let ensured: Awaited<ReturnType<typeof ensureVideoAspectRatio>>;
  try {
    ensured = await ensureVideoAspectRatio(result.localPath, aspectRatio, resolution);
  } catch (error) {
    console.warn("[video-task:aspect-ratio-transform-failed]", {
      aspectRatio,
      resolution,
      localPath: result.localPath,
      error: error instanceof Error ? error.message : String(error)
    });
    return {
      ...result,
      payloadSummary: {
        ...(result.payloadSummary && typeof result.payloadSummary === "object" ? result.payloadSummary as Record<string, unknown> : {}),
        requestedAspectRatio: normalizeVideoAspectRatio(aspectRatio),
        outputAspectRatioTransformed: false,
        outputAspectRatioFitMode: "transform_failed_keep_original",
        deliveryWarning: "上游已成功生成视频，但本地比例裁剪失败。画布保留原视频，未将任务标记失败。"
      }
    };
  }
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
      modelName: upstreamModelName(model, capabilities, model.model_name),
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
  let videoRoute: ReturnType<typeof selectedVideoRouting> | undefined;
  let providerTaskId: string | undefined;
  let providerVideoUrl: string | undefined;
  let successfulOutputUrl: string | undefined;
  let generationSucceeded = false;
  let canvasNodeUpdated = false;
  let taskMarkedSuccess = false;
  let successPayloadSummary: Record<string, unknown> | undefined;
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
        outputUrl: asset.url,
        thumbnailUrl: asset.thumbnailUrl,
        posterUrl: asset.posterUrl,
        previewUrl: asset.previewUrl,
        cdnUrl: asset.cdnUrl,
        cosUrl: asset.cosUrl,
        downloadableUrl: asset.downloadableUrl || asset.downloadUrl
      });
      return { status: "success" as const, outputAssetId: asset.id, outputUrl: asset.url, thumbnailUrl: asset.thumbnailUrl, posterUrl: asset.posterUrl, previewUrl: asset.previewUrl, cdnUrl: asset.cdnUrl, cosUrl: asset.cosUrl, downloadableUrl: asset.downloadableUrl || asset.downloadUrl };
    }

    assertModelRuntimeReady({ model, apiKey, capabilities, type: "video", inputMode: inputForGeneration.inputMode });
    const providerId = model.provider_id ?? "";
    const modelName = model.model_name ?? "";
    const upstreamModelId = upstreamModelName(model, capabilities, modelName);
    const officialVideoMode = inputForGeneration.videoMode ?? legacyInputModeToOfficialMode(inputForGeneration.inputMode, providerId);
    videoRoute = selectedVideoRouting({ model, request: inputForGeneration, modelName, capabilities });
    assertSelectedVideoRouting(videoRoute);
    const providerParams = {
      ...inputForGeneration,
      videoMode: officialVideoMode,
      apiKey,
      apiBaseUrl: apiBaseUrlFor(model),
      modelName: upstreamModelId,
      providerId,
      capabilities,
      qualityMode: inputForGeneration.qualityMode ?? "full_quality"
    };
    const videoTaskConfigSnapshot = {
      modelConfigId: model.id,
      upstreamModelId,
      apiBaseUrl: apiBaseUrlFor(model),
      encryptedApiKeySnapshot: model.encrypted_api_key,
      capabilitiesJsonSnapshot: model.capabilities_json
    };
    let activeModel = model;
    let activeInputForGeneration = inputForGeneration;
    let preflightSummary = buildPayloadSummary({
      providerId,
      selectedModelId: videoRoute.selectedModelId,
      actualModelName: modelName,
      upstreamModelId,
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
      payloadSummary: {
        stage: "preflight",
        legacyInputMode: inputForGeneration.inputMode,
        officialMode: officialVideoMode,
        routing: videoRoute,
        selectedProviderId: videoRoute.selectedProviderId,
        selectedModelId: videoRoute.selectedModelId,
        selectedCapability: videoRoute.selectedCapability,
        actualProviderId: videoRoute.actualProviderId,
        actualModelId: videoRoute.actualModelId,
        upstreamModelId: videoRoute.upstreamModelId,
        actualCapability: videoRoute.actualCapability,
        endpointStrategy: videoRoute.endpointStrategy,
        createEndpoint: videoRoute.createEndpoint,
        pollEndpoint: videoRoute.pollEndpoint
      }
    });
    logOfficialPayload(preflightSummary);

    let result: ProviderGenerateResult;
    try {
      await markVideoTaskStage({
        id: inputForGeneration.clientRequestId ?? inputForGeneration.nodeId,
        status: "processing",
        stage: "create_started",
        canvasNodeId: inputForGeneration.nodeId,
        projectId: inputForGeneration.projectId,
        providerId,
        modelId: modelName,
        ...videoTaskConfigSnapshot,
        progress: 0,
        result: {
          provider: providerId,
          modelId: modelName,
          upstreamModelId,
          capability: videoRoute.actualCapability,
          routing: videoRoute,
          nodeId: inputForGeneration.nodeId,
          projectId: inputForGeneration.projectId,
          createEndpoint: videoRoute.createEndpoint,
          pollEndpoint: videoRoute.pollEndpoint
        }
      });
      logVideoTask("create", {
        localTaskId: inputForGeneration.clientRequestId ?? inputForGeneration.nodeId,
        canvasNodeId: inputForGeneration.nodeId,
        providerId,
        modelId: modelName,
        capability: videoRoute.actualCapability
      });
      result = await callVideoProvider({ model, providerParams, capabilities });
      const createdProviderTaskId = videoResultProviderTaskId(result, inputForGeneration);
      providerTaskId = createdProviderTaskId;
      const createdProgress = videoResultProgress(result, result.status === "processing" ? 10 : 80);
      await markVideoTaskStage({
        id: createdProviderTaskId,
        status: "processing",
        stage: "create_success",
        providerStatus: result.status === "processing" ? "processing" : "succeeded",
        providerTaskId: createdProviderTaskId,
        canvasNodeId: inputForGeneration.nodeId,
        projectId: inputForGeneration.projectId,
        providerId,
        modelId: modelName,
        ...videoTaskConfigSnapshot,
        progress: createdProgress,
        rawCreateResponse: result.rawResponse,
        result: {
          provider: providerId,
          modelId: modelName,
          upstreamModelId,
          capability: videoRoute.actualCapability,
          routing: videoRoute,
          nodeId: inputForGeneration.nodeId,
          projectId: inputForGeneration.projectId,
          createRawResponse: result.rawResponse,
          parsedTaskId: createdProviderTaskId
        }
      });
      logVideoTask("provider-created", {
        localTaskId: createdProviderTaskId,
        providerTaskId: createdProviderTaskId,
        status: result.status,
        progress: createdProgress
      });
      await updateCanvasNodeWithVideoTaskRunning({
        projectId: inputForGeneration.projectId,
        nodeId: inputForGeneration.nodeId,
        providerTaskId: createdProviderTaskId,
        progress: createdProgress
      }).catch((canvasError) => console.warn("[video running canvas update failed]", rawErrorMessage(canvasError)));
      if (result.status === "processing") {
        const payloadSummary = {
          ...preflightSummary,
          ...(result.payloadSummary && typeof result.payloadSummary === "object" ? result.payloadSummary as Record<string, unknown> : {})
        };
        const pendingTaskId = createdProviderTaskId;
        await markVideoTaskStage({
          id: pendingTaskId,
          status: "processing",
          stage: "polling",
          providerStatus: "processing",
          providerTaskId: pendingTaskId,
          canvasNodeId: inputForGeneration.nodeId,
          projectId: inputForGeneration.projectId,
          providerId,
          modelId: modelName,
          ...videoTaskConfigSnapshot,
          progress: createdProgress,
          result: {
            ...payloadSummary,
            provider: providerId,
            modelId: modelName,
            upstreamModelId,
            capability: videoRoute.actualCapability,
            routing: videoRoute,
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
      throw primaryError;
    }

    const taskId = videoTaskIdFrom(result, activeInputForGeneration);
    providerTaskId = taskId;
    await markVideoTaskStage({
      id: taskId,
      status: "processing",
      stage: "provider_succeeded",
      providerStatus: "succeeded",
      providerTaskId: taskId,
      canvasNodeId: activeInputForGeneration.nodeId,
      projectId: activeInputForGeneration.projectId,
      providerId: activeModel.provider_id ?? "",
      modelId: activeModel.model_name ?? activeModel.id,
      modelConfigId: activeModel.id,
      upstreamModelId: upstreamModelName(activeModel, capabilities, activeModel.model_name),
      apiBaseUrl: apiBaseUrlFor(activeModel),
      encryptedApiKeySnapshot: activeModel.encrypted_api_key,
      capabilitiesJsonSnapshot: activeModel.capabilities_json,
      progress: 85,
      result: {
        provider: activeModel.provider_id ?? "",
        modelId: activeModel.model_name ?? activeModel.id,
        capability: videoRoute?.actualCapability ?? "video",
        routing: videoRoute,
        nodeId: activeInputForGeneration.nodeId,
        projectId: activeInputForGeneration.projectId,
        pollRawResponse: result.rawResponse,
        parsedTaskId: taskId
      }
    });
    providerVideoUrl = ensureProviderVideoUrl(result);
    const providerFallbackUrl = providerVideoUrl || result.outputUrl || "";
    successfulOutputUrl = providerFallbackUrl;
    generationSucceeded = Boolean(providerVideoUrl);
    const completedAtAfterProvider = Date.now();
    await finalizeVideoResult({
      taskId,
      providerTaskId: taskId,
      canvasNodeId: activeInputForGeneration.nodeId,
      projectId: activeInputForGeneration.projectId,
      providerId: activeModel.provider_id ?? "",
      modelId: activeModel.model_name ?? activeModel.id,
      providerVideoUrl,
      outputUrl: providerFallbackUrl,
      previewUrl: providerFallbackUrl,
      downloadableUrl: providerFallbackUrl,
      providerResult: {
        parsedTaskId: taskId,
        parsedVideoUrl: providerVideoUrl ? sanitizeUrlForLog(providerVideoUrl) : undefined,
        providerVideoUrl: providerVideoUrl ? sanitizeUrlForLog(providerVideoUrl) : undefined,
        completedAt: completedAtAfterProvider
      },
      rawResponse: result.rawResponse,
      source: "normal_generate"
    });
    taskMarkedSuccess = true;
    canvasNodeUpdated = true;
    logVideoTask("success", {
      localTaskId: taskId,
      providerTaskId: taskId,
      providerVideoUrl: sanitizeUrlForLog(providerVideoUrl),
      outputUrl: sanitizeUrlForLog(providerFallbackUrl)
    });
    logVideoTask("canvas-sync", {
      localTaskId: taskId,
      canvasNodeId: activeInputForGeneration.nodeId,
      nodeStatus: "completed",
      nodeOutputUrl: sanitizeUrlForLog(providerFallbackUrl)
    });
    successPayloadSummary = {
      ...preflightSummary,
      ...providerSummary(result),
      providerVideoUrl: sanitizeUrlForLog(providerVideoUrl),
      outputUrl: sanitizeUrlForLog(providerFallbackUrl)
    };
    let asset;
    if (result.localPath) {
      await markVideoTaskStage({
        id: taskId,
        status: "succeeded",
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
        status: "succeeded",
        stage: "downloading_video",
        providerStatus: "succeeded",
        providerTaskId: taskId,
        canvasNodeId: activeInputForGeneration.nodeId,
        projectId: activeInputForGeneration.projectId,
        providerId: activeModel.provider_id ?? "",
        modelId: activeModel.model_name ?? activeModel.id,
        providerVideoUrl,
        progress: 90
      });
      logVideoTask("storage-transfer-start", { localTaskId: taskId, providerVideoUrl: sanitizeUrlForLog(providerVideoUrl) });
      void persistGeneratedVideoToCOS({
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
      }).then(async (persisted) => {
        await markVideoTaskStage({
          id: taskId,
          status: "succeeded",
          stage: "cos_uploaded",
          providerStatus: "succeeded",
          providerTaskId: taskId,
          canvasNodeId: activeInputForGeneration.nodeId,
          projectId: activeInputForGeneration.projectId,
          providerId: activeModel.provider_id ?? "",
          modelId: activeModel.model_name ?? activeModel.id,
          providerVideoUrl,
          outputUrl: persisted.outputUrl,
          cdnUrl: persisted.cdnUrl,
          posterUrl: persisted.posterUrl,
          previewUrl: persisted.previewUrl,
          downloadableUrl: persisted.downloadableUrl,
          cosKey: persisted.cosObjectKey,
          fileSize: persisted.fileSize,
          mimeType: persisted.mimeType,
          storageStatus: "success",
          progress: 96,
          result: {
            providerVideoUrl: sanitizeUrlForLog(providerVideoUrl),
            cosUploadStatus: persisted.cosUploadStatus,
            cosObjectKey: persisted.cosObjectKey,
            finalOutputUrl: persisted.outputUrl,
            cdnUrl: persisted.cdnUrl,
            cosUrl: persisted.cosUrl
          }
        });
        await updateCanvasNodeWithGeneratedVideo({
          projectId: activeInputForGeneration.projectId,
          nodeId: activeInputForGeneration.nodeId,
          outputUrl: persisted.outputUrl,
          outputAssetId: persisted.asset.id,
          cdnUrl: persisted.cdnUrl,
          cosUrl: persisted.cosUrl,
          posterUrl: persisted.posterUrl,
          previewUrl: persisted.previewUrl,
          thumbnailUrl: persisted.asset.thumbnailUrl,
          downloadableUrl: persisted.downloadableUrl
        });
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
          outputPath: persisted.localPath,
          outputUrl: persisted.outputUrl,
          thumbnailUrl: persisted.asset.thumbnailUrl,
          posterUrl: persisted.posterUrl,
          previewUrl: persisted.previewUrl,
          cdnUrl: persisted.cdnUrl,
          cosUrl: persisted.cosUrl,
          downloadableUrl: persisted.downloadableUrl
        }).catch((historyError) => console.warn("[video async storage history failed]", rawErrorMessage(historyError)));
        await markVideoTaskStage({
          id: taskId,
          status: "succeeded",
          stage: "storage_async_completed",
          providerStatus: "succeeded",
          providerTaskId: taskId,
          canvasNodeId: activeInputForGeneration.nodeId,
          projectId: activeInputForGeneration.projectId,
          providerId: activeModel.provider_id ?? "",
          modelId: activeModel.model_name ?? activeModel.id,
          providerVideoUrl,
          outputUrl: persisted.outputUrl,
          cdnUrl: persisted.cdnUrl,
          posterUrl: persisted.posterUrl,
          previewUrl: persisted.previewUrl,
          downloadableUrl: persisted.downloadableUrl,
          cosKey: persisted.cosObjectKey,
          fileSize: persisted.fileSize,
          mimeType: persisted.mimeType,
          storageStatus: "success",
          progress: 96,
          result: {
            providerVideoUrl: sanitizeUrlForLog(providerVideoUrl),
            cosUploadStatus: persisted.cosUploadStatus,
            cosObjectKey: persisted.cosObjectKey,
            finalOutputUrl: persisted.outputUrl,
            cdnUrl: persisted.cdnUrl,
            cosUrl: persisted.cosUrl
          }
        });
        logVideoTask("storage-transfer-success", { localTaskId: taskId, cosKey: persisted.cosObjectKey, cdnUrl: persisted.cdnUrl });
      }).catch(async (storageError) => {
        await markVideoTaskStage({
          id: taskId,
          status: "succeeded",
          stage: "storage_transfer_failed",
          providerStatus: "succeeded",
          providerTaskId: taskId,
          canvasNodeId: activeInputForGeneration.nodeId,
          projectId: activeInputForGeneration.projectId,
          providerId: activeModel.provider_id ?? "",
          modelId: activeModel.model_name ?? activeModel.id,
          providerVideoUrl,
          outputUrl: providerFallbackUrl,
          previewUrl: providerFallbackUrl,
          downloadableUrl: providerFallbackUrl,
          storageStatus: "failed",
          storageError: rawErrorMessage(storageError),
          completedAt: Date.now(),
          finishedAt: Date.now(),
          progress: 100,
          result: {
            providerVideoUrl: sanitizeUrlForLog(providerVideoUrl),
            finalOutputUrl: sanitizeUrlForLog(providerFallbackUrl),
            cosUploadStatus: "failed",
            storageError: rawErrorMessage(storageError),
            storageWarning: "视频已生成成功，但 COS/CDN 转存失败，当前使用上游视频地址播放。"
          }
        });
        logVideoTask("storage-transfer-failed", { localTaskId: taskId, providerVideoUrl: sanitizeUrlForLog(providerVideoUrl), error: rawErrorMessage(storageError) });
      });
    }
    if (!asset && providerFallbackUrl) {
      const completedAt = Date.now();
      await markVideoTaskStage({
        id: taskId,
        status: "succeeded",
        stage: "succeeded",
        providerStatus: "succeeded",
        providerTaskId: taskId,
        canvasNodeId: activeInputForGeneration.nodeId,
        projectId: activeInputForGeneration.projectId,
        providerId: activeModel.provider_id ?? "",
        modelId: activeModel.model_name ?? activeModel.id,
        providerVideoUrl,
        outputUrl: providerFallbackUrl,
        previewUrl: providerFallbackUrl,
        downloadableUrl: providerFallbackUrl,
        completedAt,
        finishedAt: completedAt,
        progress: 100,
        result: {
          provider: activeModel.provider_id ?? "",
          modelId: activeModel.model_name ?? activeModel.id,
          capability: videoRoute?.actualCapability ?? "video",
          routing: videoRoute,
          parsedTaskId: taskId,
          parsedVideoUrl: sanitizeUrlForLog(providerVideoUrl),
          providerVideoUrl: sanitizeUrlForLog(providerVideoUrl),
          finalOutputUrl: sanitizeUrlForLog(providerFallbackUrl),
          outputUrl: sanitizeUrlForLog(providerFallbackUrl),
          canvasUpdated: true
        }
      });
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
        outputUrl: providerFallbackUrl,
        previewUrl: providerFallbackUrl,
        downloadableUrl: providerFallbackUrl
      }).catch((historyError) => console.warn("[video provider-url history failed]", rawErrorMessage(historyError)));
      return {
        status: "success" as const,
        outputUrl: providerFallbackUrl,
        previewUrl: providerFallbackUrl,
        downloadableUrl: providerFallbackUrl,
        payloadSummary: {
          ...preflightSummary,
          ...providerSummary(result),
          providerVideoUrl: sanitizeUrlForLog(providerVideoUrl),
          storageStatus: "pending_or_failed_provider_url_fallback"
        }
      };
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
      status: "succeeded",
      stage: "cos_uploaded",
      providerStatus: "succeeded",
      providerTaskId: taskId,
      canvasNodeId: activeInputForGeneration.nodeId,
      projectId: activeInputForGeneration.projectId,
      providerId: activeModel.provider_id ?? "",
      modelId: activeModel.model_name ?? activeModel.id,
      providerVideoUrl,
      outputUrl: finalOutputUrl,
      cdnUrl: asset.cdnUrl,
      posterUrl: asset.posterUrl,
      previewUrl: asset.previewUrl,
      downloadableUrl: asset.downloadableUrl || asset.downloadUrl || finalOutputUrl,
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
        outputUrl: finalOutputUrl,
        thumbnailUrl: asset.thumbnailUrl,
        posterUrl: asset.posterUrl,
        previewUrl: asset.previewUrl,
        cdnUrl: asset.cdnUrl,
        cosUrl: asset.cosUrl,
        downloadableUrl: asset.downloadableUrl || asset.downloadUrl || finalOutputUrl
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
      status: "succeeded",
      stage: "history_saved",
      providerStatus: "succeeded",
      providerTaskId: taskId,
      canvasNodeId: activeInputForGeneration.nodeId,
      projectId: activeInputForGeneration.projectId,
      providerId: activeModel.provider_id ?? "",
      modelId: activeModel.model_name ?? activeModel.id,
      providerVideoUrl,
      outputUrl: finalOutputUrl,
      cdnUrl: asset.cdnUrl,
      posterUrl: asset.posterUrl,
      previewUrl: asset.previewUrl,
      downloadableUrl: asset.downloadableUrl || asset.downloadUrl || finalOutputUrl,
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
        cdnUrl: asset.cdnUrl,
        cosUrl: asset.cosUrl,
        posterUrl: asset.posterUrl,
        previewUrl: asset.previewUrl,
        thumbnailUrl: asset.thumbnailUrl,
        downloadableUrl: asset.downloadableUrl || asset.downloadUrl || finalOutputUrl
      });
    } catch (canvasError) {
      throw new ProviderError(
        "CANVAS_NODE_UPDATE_FAILED",
        "视频已转存并写入历史，但画布节点状态同步失败。",
        rawErrorMessage(canvasError),
        {
          failedStage: "canvas_node_updated",
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
      status: "succeeded",
      stage: "succeeded",
      providerStatus: "succeeded",
      providerTaskId: taskId,
      canvasNodeId: activeInputForGeneration.nodeId,
      projectId: activeInputForGeneration.projectId,
      providerId: activeModel.provider_id ?? "",
      modelId: activeModel.model_name ?? activeModel.id,
      providerVideoUrl,
      outputUrl: finalOutputUrl,
      cdnUrl: asset.cdnUrl,
      posterUrl: asset.posterUrl,
      previewUrl: asset.previewUrl,
      downloadableUrl: asset.downloadableUrl || asset.downloadUrl || finalOutputUrl,
      cosKey: asset.storageKey,
      fileSize: asset.size,
      mimeType: asset.mimeType,
      completedAt,
      finishedAt: completedAt,
      storageStatus: "success",
      progress: 100,
      result: {
        provider: activeModel.provider_id ?? "",
        modelId: activeModel.model_name ?? activeModel.id,
        capability: videoRoute?.actualCapability ?? "video",
        routing: videoRoute,
        parsedTaskId: taskId,
        parsedVideoUrl: sanitizeUrlForLog(providerVideoUrl),
        providerVideoUrl: sanitizeUrlForLog(providerVideoUrl),
        cosUploadStatus: "success",
        cosObjectKey: asset.storageKey,
        finalOutputUrl,
        outputUrl: finalOutputUrl,
        cdnUrl: asset.cdnUrl,
        cosUrl: asset.cosUrl,
        downloadableUrl: asset.downloadableUrl || asset.downloadUrl || finalOutputUrl,
        canvasUpdated: true
      }
    });
    return { status: "success" as const, outputAssetId: asset.id, outputUrl: finalOutputUrl, thumbnailUrl: asset.thumbnailUrl, posterUrl: asset.posterUrl, previewUrl: asset.previewUrl, cdnUrl: asset.cdnUrl, cosUrl: asset.cosUrl, downloadableUrl: asset.downloadableUrl || asset.downloadUrl || finalOutputUrl, payloadSummary };
  } catch (error) {
    const meta = providerErrorMeta(model.provider_id, error);
    const routingSummary = videoRoute ? {
      routing: videoRoute,
      selectedProviderId: videoRoute.selectedProviderId,
      selectedModelId: videoRoute.selectedModelId,
      selectedCapability: videoRoute.selectedCapability,
      actualProviderId: videoRoute.actualProviderId,
      actualModelId: videoRoute.actualModelId,
      actualCapability: videoRoute.actualCapability,
      createEndpoint: videoRoute.createEndpoint,
      pollEndpoint: videoRoute.pollEndpoint,
      endpointStrategy: videoRoute.endpointStrategy
    } : {};
    const errorDetails = isProviderError(error) && error.details && typeof error.details === "object"
      ? error.details as Record<string, unknown>
      : {};
    const failedStage = typeof errorDetails.failedStage === "string" ? errorDetails.failedStage : "failed";
    const failedTaskId = String(errorDetails.parsedTaskId ?? errorDetails.taskId ?? input.clientRequestId ?? input.nodeId);
    if (generationSucceeded || providerVideoUrl || taskMarkedSuccess || canvasNodeUpdated) {
      const finalProviderTaskId = providerTaskId ?? failedTaskId;
      const finalOutputUrl = successfulOutputUrl ?? providerVideoUrl;
      logVideoTask("post-success-error-ignored", {
        localTaskId: finalProviderTaskId,
        providerTaskId: finalProviderTaskId,
        error: meta.errorMessage,
        failedStage
      });
      if (finalProviderTaskId && finalOutputUrl) {
        await markVideoTaskStage({
          id: finalProviderTaskId,
          status: "succeeded",
          stage: "post_success_error_ignored",
          providerStatus: "succeeded",
          providerTaskId: finalProviderTaskId,
          canvasNodeId: input.nodeId,
          projectId: input.projectId,
          providerId: model.provider_id ?? "",
          modelId: model.model_name ?? model.id,
          modelConfigId: model.id,
          upstreamModelId: upstreamModelName(model, capabilities, model.model_name),
          apiBaseUrl: apiBaseUrlFor(model),
          encryptedApiKeySnapshot: model.encrypted_api_key,
          capabilitiesJsonSnapshot: model.capabilities_json,
          providerVideoUrl,
          outputUrl: finalOutputUrl,
          previewUrl: finalOutputUrl,
          downloadableUrl: finalOutputUrl,
          progress: 100,
          storageStatus: failedStage === "upload_to_cos" || failedStage === "download_video" ? "failed" : undefined,
          storageError: failedStage === "upload_to_cos" || failedStage === "download_video" ? meta.errorMessage : undefined,
          completedAt: Date.now(),
          finishedAt: Date.now(),
          result: {
            ...errorDetails,
            ...routingSummary,
            postSuccessErrorIgnored: true,
            ignoredErrorCode: meta.errorCode,
            ignoredErrorMessage: meta.errorMessage
          }
        });
      }
      return {
        status: "success" as const,
        outputUrl: finalOutputUrl,
        previewUrl: finalOutputUrl,
        downloadableUrl: finalOutputUrl,
        payloadSummary: {
          ...(successPayloadSummary ?? {}),
          postSuccessErrorIgnored: true,
          ignoredErrorCode: meta.errorCode,
          ignoredErrorMessage: meta.errorMessage
        }
      };
    }
    if (hasSubmittedRemoteVideoTask(error) && !isTerminalSubmittedVideoError(error)) {
      const details = errorDetails;
      logVideoTask("diagnosis-ignored", {
        localTaskId: failedTaskId,
        providerTaskId: failedTaskId,
        diagnosisError: meta.errorMessage,
        reason: "provider task already created"
      });
      await markVideoTaskStage({
        id: failedTaskId,
        status: "processing",
        stage: "polling",
        providerStatus: "processing",
        providerTaskId: failedTaskId,
        canvasNodeId: input.nodeId,
        projectId: input.projectId,
        providerId: model.provider_id ?? "",
        modelId: model.model_name ?? model.id,
        modelConfigId: model.id,
        upstreamModelId: upstreamModelName(model, capabilities, model.model_name),
        apiBaseUrl: apiBaseUrlFor(model),
        encryptedApiKeySnapshot: model.encrypted_api_key,
        capabilitiesJsonSnapshot: model.capabilities_json,
        progress: 35,
        result: {
          ...details,
          ...routingSummary,
          provider: model.provider_id ?? "",
          modelId: model.model_name ?? model.id,
          capability: videoRoute?.actualCapability ?? "video",
          nodeId: input.nodeId,
          projectId: input.projectId,
          parsedTaskId: failedTaskId,
          pendingAfterPollInterruption: true
        }
      });
      await updateCanvasNodeWithVideoTaskRunning({
        projectId: input.projectId,
        nodeId: input.nodeId,
        providerTaskId: failedTaskId,
        progress: 35
      }).catch((canvasError) => console.warn("[video polling canvas update failed]", rawErrorMessage(canvasError)));
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
          ...routingSummary,
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
      providerTaskId: typeof errorDetails.providerTaskId === "string" ? errorDetails.providerTaskId : typeof errorDetails.parsedTaskId === "string" ? errorDetails.parsedTaskId : typeof errorDetails.taskId === "string" ? errorDetails.taskId : undefined,
      canvasNodeId: input.nodeId,
      projectId: input.projectId,
      providerId: model.provider_id ?? "",
      modelId: model.model_name ?? model.id,
      modelConfigId: model.id,
      upstreamModelId: upstreamModelName(model, capabilities, model.model_name),
      apiBaseUrl: apiBaseUrlFor(model),
      encryptedApiKeySnapshot: model.encrypted_api_key,
      capabilitiesJsonSnapshot: model.capabilities_json,
      failedStage,
      errorCode: meta.errorCode,
      errorMessage: meta.errorMessage,
      providerVideoUrl: typeof errorDetails.providerVideoUrl === "string" ? errorDetails.providerVideoUrl : undefined,
      outputUrl: typeof errorDetails.finalOutputUrl === "string" ? errorDetails.finalOutputUrl : undefined,
      progress: 100,
      result: {
        ...errorDetails,
        ...routingSummary,
        provider: model.provider_id ?? "",
        modelId: model.model_name ?? model.id,
        capability: videoRoute?.actualCapability ?? "video",
        nodeId: input.nodeId,
        projectId: input.projectId,
        failedStage,
        errorCode: meta.errorCode,
        errorMessage: meta.errorMessage,
        rawError: meta.debugMessage
      }
    });
    await updateCanvasNodeWithGenerationFailure({
      projectId: input.projectId,
      nodeId: input.nodeId,
      errorMessage: meta.errorMessage,
      errorCode: meta.errorCode,
      failedStage
    }).catch((canvasError) => console.warn("[video failure canvas update failed]", rawErrorMessage(canvasError)));
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
    const payloadSummary = {
      ...(meta.payloadSummary && typeof meta.payloadSummary === "object" ? meta.payloadSummary as Record<string, unknown> : {}),
      ...routingSummary
    };
    return errorResponse(meta.errorMessage, meta.errorCode, meta.debugMessage, payloadSummary);
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
  let imageRoute: ReturnType<typeof selectedImageRouting> | undefined;
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
        outputUrl: asset.url,
        thumbnailUrl: asset.thumbnailUrl,
        previewUrl: asset.previewUrl,
        cdnUrl: asset.cdnUrl,
        cosUrl: asset.cosUrl,
        downloadableUrl: asset.downloadableUrl || asset.downloadUrl
      });
      return { status: "success" as const, outputAssetId: asset.id, outputUrl: asset.url, thumbnailUrl: asset.thumbnailUrl, previewUrl: asset.previewUrl, cdnUrl: asset.cdnUrl, cosUrl: asset.cosUrl, downloadableUrl: asset.downloadableUrl || asset.downloadUrl };
    }

    const providerId = model.provider_id ?? "";
    const modelName = runtime.modelName;
    const upstreamModelId = upstreamModelName(model, capabilities, modelName);
    imageRoute = selectedImageRouting({ model, request: inputForGeneration, modelName, capabilities });
    assertSelectedImageRouting(imageRoute);
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
      modelName: upstreamModelId,
      providerId,
      catalogModelId: useCatalogCapabilities ? catalogItem?.id : undefined,
      capabilities,
      qualityMode: inputForGeneration.qualityMode ?? "full_quality"
    };
    assertOutboundImageModelRoute({
      route: imageRoute,
      requestBodyModel: providerParams.modelName,
      configuredUpstreamModelId: capabilities.upstreamModelId,
      endpoint: capabilities.openaiCompatibleConfig?.imageGenerationEndpoint
    });

    let activeModel = model;
    let activeCatalogItem = catalogItem;
    let activeUseCatalogCapabilities = useCatalogCapabilities;
    let activeInputForGeneration = inputForGeneration;
    let preflightSummary = buildPayloadSummary({
      providerId,
      selectedModelId: imageRoute.selectedModelId,
      actualModelName: modelName,
      upstreamModelId,
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
      payloadSummary: {
        stage: "preflight",
        officialCatalogValidation: useCatalogCapabilities,
        routing: imageRoute,
        selectedProviderId: imageRoute.selectedProviderId,
        selectedModelId: imageRoute.selectedModelId,
        selectedCapability: imageRoute.selectedCapability,
        actualProviderId: imageRoute.actualProviderId,
        actualModelId: imageRoute.actualModelId,
        upstreamModelId: imageRoute.upstreamModelId,
        actualCapability: imageRoute.actualCapability,
        actualEndpointFamily: imageRoute.actualEndpointFamily,
        configuredUpstreamModelId: capabilities.upstreamModelId,
        requestBodyModel: providerParams.modelName,
        endpointStrategy: imageRoute.endpointStrategy
      }
    });
    logOfficialPayload(preflightSummary);

    let result: ProviderGenerateResult;
    try {
      result = await callImageProvider({ model, providerParams });
      result = await enforceImageAspectRatio(result, inputForGeneration.aspectRatio);
    } catch (primaryError) {
      throw primaryError;
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
      outputUrl: asset?.url ?? result.outputUrl,
      thumbnailUrl: asset?.thumbnailUrl,
      previewUrl: asset?.previewUrl,
      cdnUrl: asset?.cdnUrl,
      cosUrl: asset?.cosUrl,
      downloadableUrl: asset?.downloadableUrl || asset?.downloadUrl
    });
    return { status: "success" as const, outputAssetId: asset?.id, outputUrl: asset?.url ?? result.outputUrl, thumbnailUrl: asset?.thumbnailUrl, previewUrl: asset?.previewUrl, cdnUrl: asset?.cdnUrl, cosUrl: asset?.cosUrl, downloadableUrl: asset?.downloadableUrl || asset?.downloadUrl, payloadSummary };
  } catch (error) {
    const meta = providerErrorMeta(model.provider_id, error);
    const routingSummary = imageRoute ? {
      routing: imageRoute,
      selectedProviderId: imageRoute.selectedProviderId,
      selectedModelId: imageRoute.selectedModelId,
      selectedCapability: imageRoute.selectedCapability,
      actualProviderId: imageRoute.actualProviderId,
      actualModelId: imageRoute.actualModelId,
      actualCapability: imageRoute.actualCapability,
      endpointStrategy: imageRoute.endpointStrategy
    } : {};
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
    const payloadSummary = {
      ...(meta.payloadSummary && typeof meta.payloadSummary === "object" ? meta.payloadSummary as Record<string, unknown> : {}),
      ...routingSummary
    };
    return errorResponse(meta.errorMessage, meta.errorCode, meta.debugMessage, payloadSummary);
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
