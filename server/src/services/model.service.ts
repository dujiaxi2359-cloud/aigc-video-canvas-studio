import fs from "node:fs";
import path from "node:path";
import { createAsset } from "./asset.service.js";
import { decryptApiKey } from "./encryption.service.js";
import { addHistory } from "./history.service.js";
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
import { generateVideoWithGrok } from "./providers/grokVideo.service.js";
import { generateVideoWithKling } from "./providers/klingVideo.service.js";
import { generateImageWithOpenAI } from "./providers/openaiImage.service.js";
import { generateVideoWithSeedance } from "./providers/seedanceVideo.service.js";
import { channelSupportsImage, resolveVideoRequestConfig, shouldUseProxyVideoAdapter, validateVideoRequestConfig } from "./providers/videoRequestAdapter.js";
import { resolveProviderApiBaseUrl } from "./providers/providerBaseUrl.js";
import { isGrokLikeVideoModel, normalizeVideoCapabilities } from "./videoCapabilityNormalization.js";
import { ensureVideoAspectRatio } from "./assets/ensureVideoAspectRatio.service.js";
import { ensureImageAspectRatio } from "./assets/ensureImageAspectRatio.service.js";
import type { ImageInputMode, ModelCapabilities, ModelCatalogItem, VideoNodeContext } from "../types/model.js";
import type { OfficialVideoMode } from "../types/videoModes.js";
import { legacyInputModeToOfficialMode } from "../types/videoModes.js";
import type { ProviderGenerateResult } from "./providers/providerTypes.js";
import { isProviderError, ProviderError } from "../utils/providerErrors.js";
import { buildPayloadSummary, logOfficialPayload } from "../utils/generationPayload.js";
import { metadataToQualityAudit, readGeneratedFileMetadata } from "../utils/mediaMetadata.js";

export type GenerateTextRequest = {
  projectId?: string;
  nodeId: string;
  modelConfigId: string;
  inputText: string;
  systemPrompt?: string;
  taskType?: "prompt-polish" | "script" | "reverse-prompt" | "custom";
  imageAssetIds?: string[];
};

export type GenerateVideoRequest = {
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
  const channel = providerId ? `当前 ${providerId} 线路` : "当前上游线路";
  return `${channel}额度已耗尽或达到并发上限，请切换到其他可用通道，或到对应中转/官方后台补充额度后再试。`;
}

function isUpstreamQuotaError(text: string) {
  return /PUBLIC_ERROR_USER_QUOTA_REACHED|USER_QUOTA_REACHED|RESOURCE_EXHAUSTED|quota|credit|balance|insufficient|capacity|at capacity|exhausted|余额不足|额度不足|额度耗尽|并发上限|资源耗尽/i.test(text);
}

function providerErrorMeta(providerId: string | undefined, error: unknown) {
  console.error("[provider adapter error]", providerId, error);
  if (isProviderError(error)) {
    const text = `${error.message}\n${error.debugMessage ?? ""}\n${safeStringify(error.details)}`;
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
      errorMessage: "网络请求失败，请检查本地服务、代理、接口地址或第三方 API 网络连接是否正常。",
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

function catalogFor(model: NonNullable<InternalModelConfig>) {
  return modelCatalog.find((item) => item.providerId === model.provider_id && item.name === model.model_name);
}

function isOfficialProviderBaseUrl(model: NonNullable<InternalModelConfig>) {
  const providerId = model.provider_id ?? "";
  const rawBaseUrl = model.api_base_url?.trim();
  if (!rawBaseUrl) return true;
  try {
    const hostname = new URL(rawBaseUrl).hostname.toLowerCase();
    if (providerId === "openai") return hostname === "api.openai.com";
    if (providerId === "google") return hostname === "generativelanguage.googleapis.com";
    if (providerId === "azure-openai") return true;
    if (providerId === "alibaba") return hostname.endsWith("dashscope.aliyuncs.com");
    if (providerId === "grok") return hostname === "api.x.ai";
    return false;
  } catch {
    return false;
  }
}

function shouldUseCatalogCapabilities(model: NonNullable<InternalModelConfig>, catalogItem?: ModelCatalogItem) {
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
  model: NonNullable<InternalModelConfig>;
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

function apiBaseUrlFor(model: NonNullable<InternalModelConfig>) {
  return resolveProviderApiBaseUrl(model.provider_id, model.api_base_url);
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
  if (input.aspectRatio && official.supportedAspectRatios.length && !official.supportedAspectRatios.includes(input.aspectRatio)) {
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
  const outputMetadata = await readGeneratedFileMetadata(result.localPath);
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

async function enforceVideoAspectRatio(result: ProviderGenerateResult, aspectRatio?: string, resolution?: string): Promise<ProviderGenerateResult> {
  if (!aspectRatio || !resolution) return result;
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
  if (!aspectRatio) return result;
  const ensured = await ensureImageAspectRatio(result.localPath, aspectRatio);
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

export async function generateText(input: GenerateTextRequest) {
  const { model, apiKey, catalogItem, forceMock } = await getGenerationContext(input.modelConfigId, "text");
  logGenerate({ type: "text", model, catalogItem, apiKey, inputMode: "text" });

  try {
    if (forceMock) {
      return { status: "success" as const, outputText: `Mock 文本结果：${input.inputText}` };
    }
    if (!apiKey) throw new Error("请先在设置中心配置该模型 API Key");
    const providerParams = {
      ...input,
      apiKey,
      apiBaseUrl: apiBaseUrlFor(model),
      modelName: model.model_name,
      providerId: model.provider_id,
      catalogModelId: catalogItem?.id
    };

    if (model.provider_id === "deepseek") return await generateTextWithDeepSeek(providerParams);
    if (model.provider_id === "google") return await generateTextWithGoogle(providerParams);
    throw new Error("该文本模型暂未支持真实调用");
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
  const inputForGeneration: GenerateVideoRequest = { ...input };
  try {
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

    if (!apiKey) throw new Error("请先在设置中心配置该模型 API Key");
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
      qualityMode: inputForGeneration.qualityMode ?? "full_quality"
    };

    const preflightSummary = buildPayloadSummary({
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
    await assertSelectedVideoChannelSupportsAssets(model, providerParams, capabilities);
    const videoRequestConfig = validateVideoRequestConfig(providerParams, capabilities);

    let result: ProviderGenerateResult;
    if (
      isGrokLikeVideoModel(model.provider_id, model.model_name, capabilities)
      && videoRequestConfig.apiFamily !== "unified_video_create"
      && !/runapi\.co/i.test(model.api_base_url)
    ) {
      // Grok relay endpoints use their multipart input_reference/input_video
      // contract. Sending them through the generic OpenAI-video JSON adapter
      // drops reference files and can incorrectly classify the channel as text-only.
      // Match the model identity too because older workspaces may still carry
      // the historical `openai-video` provider id for Grok Imagine models.
      result = await generateVideoWithGrok(providerParams);
    } else if (shouldUseProxyVideoAdapter(providerParams, capabilities)) {
      result = await generateVideoWithSeedance({
        ...providerParams,
        apiBaseUrl: videoRequestConfig.finalUrl,
        imageTransport: videoRequestConfig.imageTransport,
        videoTransport: videoRequestConfig.videoTransport,
        videoRequestConfig
      });
    } else switch (providerId) {
      case "google":
        result = await generateVideoWithGoogleVeo(providerParams);
        break;
      case "alibaba":
        result = await generateVideoWithAlibabaWan(providerParams);
        break;
      case "kling":
        result = await generateVideoWithKling(providerParams);
        break;
      case "grok":
        result = await generateVideoWithGrok(providerParams);
        break;
      case "seedance":
        result = await generateVideoWithSeedance(providerParams);
        break;
      case "openai-video":
        result = await generateVideoWithSeedance(providerParams);
        break;
      default:
        result = await generateVideoWithSeedance(providerParams);
    }
    result = await enforceVideoAspectRatio(result, inputForGeneration.aspectRatio, inputForGeneration.resolution);

    const asset = await createGeneratedAssetFromProvider(result, `video_${inputForGeneration.nodeId}.mp4`, {
      providerId,
      modelId: model.id,
      nodeId: inputForGeneration.nodeId,
      projectId: inputForGeneration.projectId,
      prompt: inputForGeneration.prompt,
      negativePrompt: inputForGeneration.negativePrompt
    });
    const payloadSummary = await enrichPayloadSummaryWithOutput(preflightSummary, result);
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
      outputPath: asset?.localPath ?? result.localPath,
      outputUrl: asset?.url ?? result.outputUrl
    });
    return { status: "success" as const, outputAssetId: asset?.id, outputUrl: asset?.url ?? result.outputUrl, payloadSummary };
  } catch (error) {
    const meta = providerErrorMeta(model.provider_id, error);
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
      errorMessage: meta.errorMessage
    });
    return errorResponse(meta.errorMessage, meta.errorCode, meta.debugMessage, meta.payloadSummary);
  }
}

export async function generateImage(input: GenerateImageRequest) {
  const { model, apiKey, catalogItem, forceMock } = await getGenerationContext(input.modelConfigId, "image");
  logGenerate({ type: "image", model, catalogItem, apiKey, inputMode: input.inputMode });
  const configuredCapabilities = JSON.parse(model.capabilities_json) as ModelCapabilities;
  const useCatalogCapabilities = shouldUseCatalogCapabilities(model, catalogItem);
  const capabilities = useCatalogCapabilities ? catalogItem!.capabilities : configuredCapabilities;
  const inputForGeneration: GenerateImageRequest = { ...input };
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

    if (!apiKey) throw new Error("请先在设置中心配置该模型 API Key");
    const providerId = model.provider_id ?? "";
    const modelName = model.model_name ?? "";
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
      qualityMode: inputForGeneration.qualityMode ?? "full_quality"
    };

    const preflightSummary = buildPayloadSummary({
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
    switch (providerId) {
      case "openai":
        result = await generateImageWithOpenAI(providerParams);
        break;
      case "azure-openai":
        result = await generateImageWithAzureOpenAI(providerParams);
        break;
      case "alibaba":
        result = await generateImageWithAlibaba(providerParams);
        break;
      case "google":
        result = await generateImageWithGoogle(providerParams);
        break;
      default:
        throw new Error("该图片模型暂未支持真实调用");
    }
    result = await enforceImageAspectRatio(result, inputForGeneration.aspectRatio);

    const asset = await createGeneratedAssetFromProvider(result, `image_${inputForGeneration.nodeId}.png`, {
      providerId,
      modelId: useCatalogCapabilities ? catalogItem?.id : model.id,
      nodeId: inputForGeneration.nodeId,
      projectId: inputForGeneration.projectId,
      prompt: inputForGeneration.prompt,
      negativePrompt: inputForGeneration.negativePrompt
    });
    const payloadSummary = await enrichPayloadSummaryWithOutput(preflightSummary, result);
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
