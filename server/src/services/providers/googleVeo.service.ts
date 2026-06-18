import fs from "node:fs";
import path from "node:path";
import { GoogleGenAI, VideoGenerationReferenceType, type Image } from "@google/genai";
import sharp from "sharp";
import { capabilityForMode, getVideoModelCapabilityOrLegacy } from "../../config/videoModelCapabilities.js";
import { getAsset } from "../asset.service.js";
import { saveGeneratedBuffer } from "../../utils/downloadGeneratedFile.js";
import { buildPayloadSummary, logOfficialPayload } from "../../utils/generationPayload.js";
import { metadataToQualityAudit, readGeneratedFileMetadata } from "../../utils/mediaMetadata.js";
import { ProviderError, rawErrorMessage } from "../../utils/providerErrors.js";
import { withTemporaryDirectNetwork } from "../../utils/proxy.js";
import { mapVideoParams } from "../../utils/videoParams.js";
import { legacyInputModeToOfficialMode } from "../../types/videoModes.js";
import { ensureAssetLocalFile } from "../assets/ensureAssetLocalFile.service.js";
import type { OfficialVideoMode } from "../../types/videoModes.js";
import { prepareVideoFrameForAspectRatio } from "../assets/prepareVideoFrame.service.js";
import { parseVeoOperationResult, type VeoOperationParseResult } from "./googleVeo/veoOperationParser.js";
import { googleGenAIOptions } from "./providerBaseUrl.js";
import type { ProviderGenerateResult, VideoProviderParams } from "./providerTypes.js";
import { generateVideoWithVeoProxy, isVeoProxyEndpoint } from "./veoProxyVideo.service.js";
import {
  buildAudioSafePrompt,
  buildNegativePrompt as buildVeoNegativePrompt,
  buildProductOnlyPrompt,
  buildRaiSuggestion,
  detectSensitiveTerms,
  getPersonGenerationMode,
  sanitizePrompt,
  veoPersonGenerationUiHint
} from "../veo/VeoSafetyGuard.js";

function sleep(ms: number) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

function generatedPath(prefix: string, extension = ".mp4") {
  const uploadRoot = process.env.UPLOAD_DIR ?? "./uploads";
  const outputDir = path.resolve(process.cwd(), uploadRoot, "generated");
  fs.mkdirSync(outputDir, { recursive: true });
  const fileName = `${prefix}_${Date.now()}${extension}`;
  return {
    fileName,
    localPath: path.join(outputDir, fileName),
    outputUrl: `/uploads/generated/${fileName}`
  };
}

function sanitizeDebugValue(value: unknown): unknown {
  if (typeof value === "string") {
    if (value.length > 900) return `${value.slice(0, 300)}...[truncated ${value.length} chars]`;
    return value;
  }
  if (Array.isArray(value)) return value.map((item) => sanitizeDebugValue(item));
  if (value && typeof value === "object") {
    const output: Record<string, unknown> = {};
    for (const [key, child] of Object.entries(value as Record<string, unknown>)) {
      const lower = key.toLowerCase();
      if (lower.includes("apikey") || lower.includes("api_key") || lower === "key") {
        output[key] = "[redacted]";
      } else if (lower.includes("inlinedata") || lower.includes("inline_data") || lower === "bytes" || lower.includes("videobytes") || lower.includes("videobytes")) {
        output[key] = "[redacted binary]";
      } else {
        output[key] = sanitizeDebugValue(child);
      }
    }
    return output;
  }
  return value;
}

function writeVeoOperationDebugSnapshot(input: {
  reason: string;
  params: VideoProviderParams;
  officialMode: OfficialVideoMode;
  operation: unknown;
  parsed: VeoOperationParseResult;
}) {
  const debugDir = path.resolve(process.cwd(), "data/debug/veo-operations");
  fs.mkdirSync(debugDir, { recursive: true });
  const fileName = `veo_${Date.now()}_${input.params.nodeId}.json`;
  const filePath = path.join(debugDir, fileName);
  const snapshot = {
    reason: input.reason,
    createdAt: new Date().toISOString(),
    model: {
      providerId: input.params.providerId,
      catalogModelId: input.params.catalogModelId,
      modelName: input.params.modelName,
      officialMode: input.officialMode,
      inputMode: input.params.inputMode
    },
    request: {
      nodeId: input.params.nodeId,
      duration: input.params.duration,
      aspectRatio: input.params.aspectRatio,
      resolution: input.params.resolution,
      imageAssetCount: input.params.imageAssetIds?.length ?? 0,
      videoAssetCount: input.params.videoAssetIds?.length ?? 0,
      promptPreview: input.params.prompt?.slice(0, 600)
    },
    parsed: input.parsed,
    operation: sanitizeDebugValue(input.operation)
  };
  fs.writeFileSync(filePath, JSON.stringify(snapshot, null, 2));
  console.warn("[veo-operation-debug-snapshot]", filePath);
  return filePath;
}

function createVeoRequestId(nodeId: string) {
  return `veo_${Date.now()}_${nodeId}_${Math.random().toString(36).slice(2, 8)}`;
}

function writeVeoRequestLog(input: {
  requestId: string;
  modelId: string | undefined;
  originalPrompt: string;
  sanitizedPrompt: string;
  negativePrompt: string;
  personGeneration: string;
  aspectRatio: string;
  duration: number;
  raiMediaFilteredCount?: number;
  raiMediaFilteredReasons?: string[];
  hasVideo: boolean;
  fallbackUsed?: string;
}) {
  const debugDir = path.resolve(process.cwd(), "data/debug/veo-operations");
  fs.mkdirSync(debugDir, { recursive: true });
  const createdAt = new Date().toISOString();
  const snapshot = {
    requestId: input.requestId,
    modelId: input.modelId,
    originalPrompt: input.originalPrompt,
    sanitizedPrompt: input.sanitizedPrompt,
    negativePrompt: input.negativePrompt,
    personGeneration: input.personGeneration,
    aspectRatio: input.aspectRatio,
    duration: input.duration,
    raiMediaFilteredCount: input.raiMediaFilteredCount ?? 0,
    raiMediaFilteredReasons: input.raiMediaFilteredReasons ?? [],
    hasVideo: input.hasVideo,
    fallbackUsed: input.fallbackUsed ?? "none",
    createdAt
  };
  const filePath = path.join(debugDir, `${input.requestId}.request.json`);
  fs.writeFileSync(filePath, JSON.stringify(snapshot, null, 2));
  console.warn("[veo-request-log]", filePath);
  return filePath;
}

function mimeTypeFromPath(filePath: string) {
  const ext = path.extname(filePath).toLowerCase();
  if (ext === ".jpg" || ext === ".jpeg") return "image/jpeg";
  if (ext === ".webp") return "image/webp";
  return "image/png";
}

function aspectRatioOf(width?: number, height?: number) {
  if (!width || !height) return undefined;
  const gcd = (a: number, b: number): number => (b ? gcd(b, a % b) : a);
  const divisor = gcd(width, height);
  return `${Math.round(width / divisor)}:${Math.round(height / divisor)}`;
}

function isVeoLite(modelName: string) {
  return modelName === "veo-3.1-lite-generate-preview";
}

function isGoogleNetworkLikeError(error: unknown) {
  const lower = rawErrorMessage(error).toLowerCase();
  return (
    lower.includes("fetch failed") ||
    lower.includes("terminated") ||
    lower.includes("und_err") ||
    lower.includes("socket") ||
    lower.includes("econn") ||
    lower.includes("etimedout") ||
    lower.includes("timeout") ||
    lower.includes("network")
  );
}

async function retryGoogleNetwork<T>(label: string, fn: () => Promise<T>): Promise<T> {
  try {
    return await fn();
  } catch (error) {
    if (!isGoogleNetworkLikeError(error)) throw error;
    console.warn("[google-veo-network-retry]", {
      label,
      reason: rawErrorMessage(error).slice(0, 240)
    });
    return withTemporaryDirectNetwork(`google-veo:${label}`, fn);
  }
}

async function runVeoGenerateOperation(ai: GoogleGenAI, request: Record<string, unknown>) {
  let operation = await retryGoogleNetwork("models.generateVideos", () =>
    ai.models.generateVideos(request as unknown as Parameters<typeof ai.models.generateVideos>[0])
  );
  const startedAt = Date.now();
  while (!operation.done) {
    if (Date.now() - startedAt > 10 * 60 * 1000) {
      throw new ProviderError("VEO_OPERATION_TIMEOUT", "Google Veo 视频生成任务超时，请稍后重试或检查当前模型负载。");
    }
    await sleep(10000);
    operation = await retryGoogleNetwork("operations.getVideosOperation", () => ai.operations.getVideosOperation({ operation }));
  }
  return operation;
}

function isRaiMediaFiltered(parsed: VeoOperationParseResult) {
  return (parsed.raiMediaFilteredCount ?? 0) > 0 || Boolean(parsed.raiMediaFilteredReasons?.length);
}

function hasParsedVideo(parsed: VeoOperationParseResult) {
  return Boolean(parsed.videoObject || parsed.videoUri || parsed.videoBytes);
}

function hasAudioSafetyReason(parsed: VeoOperationParseResult) {
  return /audio|voice|speech|music|lyrics|song|口播|声音|音乐|歌词/i.test(parsed.raiMediaFilteredReasons?.join(" ") ?? "");
}

function logVeoOperationSummary(input: {
  params: VideoProviderParams;
  officialMode: OfficialVideoMode;
  operation: Awaited<ReturnType<typeof runVeoGenerateOperation>>;
  parsed: VeoOperationParseResult;
  fallbackStage?: string;
}) {
  const { params, officialMode, operation, parsed, fallbackStage } = input;
  console.log("[veo-operation-summary]", {
    modelId: params.catalogModelId,
    officialMode,
    fallbackStage,
    operationName: operation.name,
    done: operation.done,
    hasError: Boolean(operation.error),
    errorCode: (operation.error as { code?: unknown } | undefined)?.code,
    errorMessage: (operation.error as { message?: unknown } | undefined)?.message,
    hasResponse: Boolean(operation.response),
    responseKeys: parsed.rawSummary.responseKeys,
    generatedVideosCount: parsed.rawSummary.generatedVideosCount,
    generatedVideosShape: parsed.rawSummary.generatedVideosShape,
    raiMediaFilteredCount: parsed.raiMediaFilteredCount,
    parsedVideoUriExists: Boolean(parsed.videoUri),
    sourceShape: parsed.sourceShape
  });
}

function veoRaiFallbackPrompt(originalPrompt: string) {
  const base = originalPrompt.trim();
  return [
    "Create a neutral sportswear product video from the provided first frame.",
    "Preserve the visible brand logo, logo shape, logo color, logo placement, garment color, fabric texture, waistband structure, side pocket, and product details.",
    "Use simple natural movement in a gym environment. Keep the framing product-focused and neutral. Do not add new text, graphics, or logo designs.",
    "Avoid body-focused framing, try-on narrative, glamour posing, or close-ups of body areas.",
    base ? "Use the original request only as high-level product direction, without copying body-focused or try-on wording." : ""
  ].filter(Boolean).join("\n");
}

function shouldUseVeoSafetyPrompt(officialMode: OfficialVideoMode, imageCount: number, prompt: string) {
  if (process.env.VEO_SAFETY_REWRITE === "off") return false;
  if (!imageCount) return false;
  if (officialMode === "image_to_video_first_last_frame" || officialMode === "reference_images_to_video") return true;
  return /试穿|真人|女生|腰臀|胸前|裤腰|身体|身材|曲线|贴身|镜子|自拍|try.?on|body|waist|hip|chest|mirror|selfie/i.test(prompt);
}

function veoSafetyPrompt(originalPrompt: string, officialMode: OfficialVideoMode, imageCount: number) {
  if (!shouldUseVeoSafetyPrompt(officialMode, imageCount, originalPrompt)) return originalPrompt;
  return [
    "Create a neutral sportswear product showcase video using the provided image reference.",
    "Preserve the visible brand logo exactly: logo shape, color, placement, scale, and relationship to the garment. Do not invent new text, symbols, patterns, or logo designs.",
    "Preserve the garment color, ribbed fabric texture, waistband structure, side pocket, seams, fit, and product details from the reference image.",
    "Use a premium indoor gym environment, natural handheld social-media footage, realistic lighting, and simple neutral movement.",
    "Keep the framing product-focused and brand-focused. Avoid body-focused framing, try-on narrative, glamour posing, mirror-body emphasis, or close-ups of body areas."
  ].join("\n");
}

export function normalizeVeoParams(params: VideoProviderParams, officialMode: OfficialVideoMode) {
  const capability = getVideoModelCapabilityOrLegacy("google", params.catalogModelId, params.modelName, officialMode);
  const modeCapability = capability ? capabilityForMode(capability, officialMode) : undefined;
  if (!capability || !modeCapability) {
    throw new ProviderError("MODEL_MODE_UNSUPPORTED", "当前 Veo 模型不支持该视频模式，请切换官方支持的模式。");
  }

  const imageCount = params.imageAssetIds?.length ?? 0;
  const videoCount = params.videoAssetIds?.length ?? 0;
  if (isVeoLite(params.modelName) && officialMode === "reference_images_to_video") {
    throw new ProviderError("MODEL_MODE_UNSUPPORTED", "Veo 3.1 Lite 官方不支持 referenceImages，请切换 Veo 3.1 或 Veo 3.1 Fast。");
  }
  if (isVeoLite(params.modelName) && officialMode === "video_extension") {
    throw new ProviderError("MODEL_MODE_UNSUPPORTED", "Veo 3.1 Lite 官方不支持视频延展，请切换 Veo 3.1 或 Veo 3.1 Fast。");
  }
  if (isVeoLite(params.modelName) && params.resolution === "4k") {
    throw new ProviderError("MODEL_PARAM_UNSUPPORTED", "Veo 3.1 Lite 官方不支持 4k，请切换 720p / 1080p 或切换 Veo 3.1。");
  }
  if (officialMode === "reference_images_to_video" && imageCount > 3) {
    throw new ProviderError("MODEL_PARAM_UNSUPPORTED", "Veo 参考图生视频最多支持 3 张参考图，请减少参考图数量。");
  }
  if (officialMode === "image_to_video_first_frame" && imageCount < 1) {
    throw new ProviderError("MISSING_INPUT_ASSET", "图生视频需要连接一张首帧图片。");
  }
  if (officialMode === "reference_images_to_video" && imageCount < 1) {
    throw new ProviderError("MISSING_INPUT_ASSET", "参考图生视频需要至少一张参考图片。");
  }
  if (officialMode === "image_to_video_first_last_frame" && imageCount < 2) {
    throw new ProviderError("MISSING_INPUT_ASSET", "首尾帧视频需要连接首帧图和尾帧图。");
  }
  if (officialMode === "video_extension" && videoCount < 1) {
    throw new ProviderError("MISSING_VIDEO_INPUT", "视频延展需要连接一个来自 Veo 生成结果的视频。");
  }

  let resolution = params.resolution || capability.defaultResolution;
  let durationSeconds = params.duration || capability.defaultDuration;
  let durationAutoAdjusted = false;
  let resolutionAutoAdjusted = false;

  if (officialMode === "video_extension") {
    if (resolution !== "720p") resolutionAutoAdjusted = true;
    resolution = "720p";
    if (durationSeconds !== 8) durationAutoAdjusted = true;
    durationSeconds = 8;
  } else if (officialMode === "reference_images_to_video" || resolution === "1080p" || resolution === "4k") {
    if (durationSeconds !== 8) durationAutoAdjusted = true;
    durationSeconds = 8;
  }

  if (!capability.supportedResolutions.includes(resolution)) {
    throw new ProviderError("MODEL_PARAM_UNSUPPORTED", `当前 Veo 模型不支持 ${resolution} 分辨率。`);
  }
  if (!capability.supportedAspectRatios.includes(params.aspectRatio)) {
    throw new ProviderError("MODEL_PARAM_UNSUPPORTED", `当前 Veo 模型不支持 ${params.aspectRatio} 比例。`);
  }
  if (!capability.supportedDurations.includes(durationSeconds)) {
    throw new ProviderError("MODEL_PARAM_UNSUPPORTED", `当前 Veo 模型不支持 ${durationSeconds}s 时长。`);
  }

  return {
    capability,
    modeCapability,
    supportsCurrentMode: true,
    resolution,
    durationSeconds,
    durationAutoAdjusted,
    resolutionAutoAdjusted
  };
}

function classifyGoogleVeoError(error: unknown): ProviderError {
  if (error instanceof ProviderError) return error;
  const message = rawErrorMessage(error);
  const lower = message.toLowerCase();

  if (lower.includes("user location is not supported") || lower.includes("failed_precondition")) {
    return new ProviderError(
      "GOOGLE_REGION_UNSUPPORTED",
      "当前 Google API 请求出口地区暂不支持该模型。请检查 VPN / 代理出口地区，或切换到之前已验证可用的模型。",
      message
    );
  }
  if (
    lower.includes("model not found") ||
    (lower.includes("models/") && (lower.includes("not found") || lower.includes("not supported") || lower.includes("not available"))) ||
    lower.includes("is not found for api version")
  ) {
    return new ProviderError(
      "GOOGLE_MODEL_NOT_FOUND",
      "当前 Google modelName 或 API version 不支持该模型，请检查模型名称和接口版本。",
      message
    );
  }
  if (lower.includes("fetch failed") || lower.includes("network") || lower.includes("econn") || lower.includes("dns") || lower.includes("timeout")) {
    return new ProviderError(
      "NETWORK_ERROR",
      "Google API 网络请求失败，请检查后端代理是否配置、VPN 是否被 Node 后端使用、或 Google API 是否可访问。",
      message
    );
  }
  if (lower.includes("api key") || lower.includes("unauthorized") || lower.includes("permission") || lower.includes("403") || lower.includes("401")) {
    return new ProviderError("API_KEY_INVALID", "Google API Key 无效或当前 Veo 模型未开通权限。", message);
  }
  return new ProviderError("PROVIDER_ERROR", "Google Veo 生成失败，请检查模型权限、请求参数和 Google API 返回信息。", message);
}

type VeoInputImage = Image & {
  audit: Record<string, unknown>;
};

async function assetImage(assetId: string, requestedAspectRatio?: string): Promise<VeoInputImage> {
  const asset = await ensureAssetLocalFile(await getAsset(assetId), "Google Veo 引用的图片素材");

  const originalMetadata = await readGeneratedFileMetadata(asset.localPath);
  const prepared = requestedAspectRatio
    ? await prepareVideoFrameForAspectRatio(asset.localPath, requestedAspectRatio, "smart_crop")
    : undefined;
  const inputPath = prepared?.localPath ?? asset.localPath;
  const inputMetadata = prepared?.transformed
    ? { width: prepared.width, height: prepared.height, fileSize: fs.statSync(inputPath).size }
    : originalMetadata;
  return {
    imageBytes: fs.readFileSync(inputPath).toString("base64"),
    mimeType: prepared?.transformed ? "image/png" : asset.mimeType || mimeTypeFromPath(inputPath),
    audit: {
      assetId,
      inputImageSource: prepared?.transformed ? "smartCropAspectRatio" : "localPath",
      inputImageWidth: inputMetadata.width,
      inputImageHeight: inputMetadata.height,
      inputImageFileSize: inputMetadata.fileSize,
      originalAspectRatio: aspectRatioOf(originalMetadata.width, originalMetadata.height),
      modelInputAspectRatio: aspectRatioOf(inputMetadata.width, inputMetadata.height),
      requestedAspectRatio,
      frameFitMode: prepared?.fitMode,
      usesOriginalFile: !prepared?.transformed,
      usesPreviewUrl: false,
      inputImageWasCompressed: Boolean(prepared?.transformed)
    }
  };
}

async function assetImageForRaiFallback(assetId: string): Promise<VeoInputImage> {
  try {
    const asset = await ensureAssetLocalFile(await getAsset(assetId), "Google Veo 引用的图片素材");

    const metadata = await sharp(asset.localPath).metadata();
    if (!metadata.width || !metadata.height) return assetImage(assetId);

    const cropBoxes = [
      {
        label: "upper_garment_logo",
        left: Math.round(metadata.width * 0.16),
        top: Math.round(metadata.height * 0.22),
        width: Math.round(metadata.width * 0.68),
        height: Math.round(metadata.height * 0.22)
      },
      {
        label: "waistband_logo",
        left: Math.round(metadata.width * 0.16),
        top: Math.round(metadata.height * 0.39),
        width: Math.round(metadata.width * 0.68),
        height: Math.round(metadata.height * 0.18)
      },
      {
        label: "fabric_pocket_texture",
        left: Math.round(metadata.width * 0.2),
        top: Math.round(metadata.height * 0.54),
        width: Math.round(metadata.width * 0.64),
        height: Math.round(metadata.height * 0.26)
      }
    ].map((box) => ({
      ...box,
      left: Math.max(0, Math.min(metadata.width! - 1, box.left)),
      top: Math.max(0, Math.min(metadata.height! - 1, box.top)),
      width: Math.max(1, Math.min(metadata.width! - Math.max(0, box.left), box.width)),
      height: Math.max(1, Math.min(metadata.height! - Math.max(0, box.top), box.height))
    }));
    const strips = await Promise.all(cropBoxes.map((box) =>
      sharp(asset.localPath)
        .extract({ left: box.left, top: box.top, width: box.width, height: box.height })
        .resize(900, 260, { fit: "cover", position: "center" })
        .jpeg({ quality: 92 })
        .toBuffer()
    ));
    const buffer = await sharp({
      create: {
        width: 1024,
        height: 1024,
        channels: 3,
        background: { r: 18, g: 18, b: 20 }
      }
    })
      .composite(strips.map((input, index) => ({
        input,
        left: 62,
        top: 64 + index * 310
      })))
      .jpeg({ quality: 92 })
      .toBuffer();

    return {
      imageBytes: buffer.toString("base64"),
      mimeType: "image/jpeg",
      audit: {
      assetId,
      inputImageSource: "raiFallbackProductReferenceBoard",
      inputImageWidth: 1024,
      inputImageHeight: 1024,
      inputImageFileSize: buffer.byteLength,
      originalAspectRatio: aspectRatioOf(metadata.width, metadata.height),
      modelInputAspectRatio: "1:1",
      cropBoxes,
      usesOriginalFile: false,
      usesPreviewUrl: false,
        inputImageWasCompressed: true
      }
    };
  } catch (error) {
    if (error instanceof ProviderError) throw error;
    throw new ProviderError(
      "VEO_RAI_MEDIA_FILTERED",
      "Google Veo 安全降级时生成产品裁切参考图失败，请改用单张商品局部图或上传更偏产品细节的参考图。",
      rawErrorMessage(error)
    );
  }
}

function stripAudit(image: VeoInputImage): Image {
  return {
    imageBytes: image.imageBytes,
    mimeType: image.mimeType
  };
}

function stringFromUnknown(value: unknown) {
  return typeof value === "string" && value.trim() ? value.trim() : undefined;
}

function storedVeoVideoUri(generationParams: Record<string, unknown> | undefined) {
  const nested = generationParams?.payloadSummary;
  if (nested && typeof nested === "object") {
    const summary = nested as Record<string, unknown>;
    return stringFromUnknown(summary.googleVideoUri) ?? stringFromUnknown(summary.videoUri);
  }
  return stringFromUnknown(generationParams?.googleVideoUri) ?? stringFromUnknown(generationParams?.videoUri);
}

async function waitForGoogleFileActive(ai: GoogleGenAI, fileName: string) {
  let file = await retryGoogleNetwork("files.get.initial", () => ai.files.get({ name: fileName }));
  const startedAt = Date.now();
  while (file.state === "PROCESSING") {
    if (Date.now() - startedAt > 2 * 60 * 1000) {
      throw new ProviderError("VEO_VIDEO_DOWNLOAD_FAILED", "Google Veo 视频延展输入视频上传后处理超时，请稍后重试。");
    }
    await sleep(3000);
    file = await retryGoogleNetwork("files.get.poll", () => ai.files.get({ name: fileName }));
  }
  if (file.state === "FAILED") {
    throw new ProviderError("VEO_VIDEO_DOWNLOAD_FAILED", "Google Veo 视频延展输入视频处理失败，请重新生成上一段视频后再延展。", rawErrorMessage(file.error));
  }
  return file;
}

async function assetVideoForExtension(assetId: string, ai: GoogleGenAI) {
  const asset = await ensureAssetLocalFile(await getAsset(assetId), "Veo 视频延展引用的视频素材");
  const providerId = asset.providerId;
  const modelId = asset.modelId ?? "";
  if (providerId !== "google" || !/veo/i.test(modelId)) {
    throw new ProviderError("MODEL_MODE_UNSUPPORTED", "Veo 视频延展必须使用之前 Veo 生成的视频结果，不能直接使用普通上传视频或本地 mp4。");
  }
  const metadata = await readGeneratedFileMetadata(asset.localPath);
  const storedUri = storedVeoVideoUri(asset.generationParams);
  let fileName: string | undefined;
  let videoUri = storedUri;
  let source = storedUri ? "stored_google_uri" : "uploaded_google_file";
  if (!videoUri) {
    const uploaded = await retryGoogleNetwork("files.upload.extension-video", () => ai.files.upload({
      file: asset.localPath,
      config: {
        mimeType: asset.mimeType || "video/mp4",
        displayName: asset.fileName || path.basename(asset.localPath)
      }
    }));
    const activeFile = uploaded.name ? await waitForGoogleFileActive(ai, uploaded.name) : uploaded;
    fileName = activeFile.name ?? uploaded.name;
    videoUri = activeFile.uri ?? uploaded.uri;
    if (!videoUri && fileName) videoUri = fileName;
  }
  if (!videoUri) {
    throw new ProviderError("VEO_VIDEO_DOWNLOAD_FAILED", "Google Veo 视频延展输入视频已经准备，但没有获得可传给 Google 的文件 URI。");
  }
  return {
    video: {
      uri: videoUri,
      mimeType: asset.mimeType || "video/mp4"
    },
    audit: {
      assetId,
      inputVideoSource: source,
      googleFileName: fileName,
      googleVideoUriExists: Boolean(videoUri),
      inputVideoWidth: metadata.width,
      inputVideoHeight: metadata.height,
      inputVideoDuration: metadata.duration,
      inputVideoFileSize: metadata.fileSize,
      usesOriginalFile: true,
      usesPreviewUrl: false
    }
  };
}

async function assertSavedVideo(localPath: string) {
  if (!fs.existsSync(localPath)) {
    throw new ProviderError(
      "VEO_VIDEO_DOWNLOAD_FAILED",
      "Google Veo 已返回视频结果，但下载保存失败。请检查 files.download、API Key、网络和本地写入权限。"
    );
  }
  const stat = fs.statSync(localPath);
  if (stat.size <= 0) {
    throw new ProviderError("VEO_VIDEO_FILE_EMPTY", "Google Veo 视频已保存但文件为空，请检查 Google 返回结果和本地写入权限。");
  }
}

async function downloadVeoVideoResult(input: {
  parsed: VeoOperationParseResult;
  ai: GoogleGenAI;
  apiKey: string;
}) {
  const { parsed, ai, apiKey } = input;

  if (parsed.videoBytes) {
    const saved = await saveGeneratedBuffer({
      buffer: Buffer.from(parsed.videoBytes, "base64"),
      prefix: "video_google_veo",
      extension: ".mp4",
      contentType: parsed.mimeType
    });
    await assertSavedVideo(saved.localPath);
    return saved;
  }

  if (!parsed.videoUri) {
    throw new ProviderError(
      "VEO_OPERATION_NO_VIDEO_IN_RESPONSE",
      "Google Veo 已完成请求，但返回结构中没有解析到视频文件。请检查 operation 结果结构、模型权限、区域限制或当前模式是否支持。",
      JSON.stringify(parsed.rawSummary)
    );
  }
  const videoUri = parsed.videoUri;

  try {
    const target = generatedPath("video_google_veo");
    await withTemporaryDirectNetwork("google-veo:files.download.result", () =>
      ai.files.download({ file: videoUri, downloadPath: target.localPath })
    );
    await assertSavedVideo(target.localPath);
    return target;
  } catch (sdkError) {
    try {
      const response = await withTemporaryDirectNetwork("google-veo:fetch.download.result", () =>
        fetch(videoUri, {
          headers: { "x-goog-api-key": apiKey }
        })
      );
      if (!response.ok) throw new Error(`${response.status} ${await response.text()}`);
      const saved = await saveGeneratedBuffer({
        buffer: Buffer.from(await response.arrayBuffer()),
        prefix: "video_google_veo",
        extension: ".mp4",
        contentType: response.headers.get("content-type") ?? parsed.mimeType
      });
      await assertSavedVideo(saved.localPath);
      return saved;
    } catch (fetchError) {
      throw new ProviderError(
        "VEO_VIDEO_DOWNLOAD_FAILED",
        "Google Veo 已返回视频结果，但下载保存失败。请检查 files.download、API Key、网络和本地写入权限。",
        rawErrorMessage({
          sdkError,
          fetchError,
          uriKind: videoUri.startsWith("http") ? "http" : "file"
        })
      );
    }
  }
}

export async function generateVideoWithGoogleVeo(params: VideoProviderParams): Promise<ProviderGenerateResult> {
  if (!params.apiKey) throw new ProviderError("API_KEY_INVALID", "请先在设置中心配置该模型 API Key。");
  if (params.apiKey.includes("*")) throw new ProviderError("API_KEY_INVALID", "Google API Key 读取到的是 maskedKey，请在设置中心重新填写完整 API Key。");
  if (isVeoProxyEndpoint(params.apiBaseUrl)) return generateVideoWithVeoProxy(params);
  if (params.inputMode === "video-to-video" && params.videoMode !== "video_extension") {
    throw new ProviderError("ADAPTER_NOT_IMPLEMENTED", "Google Veo 当前 video-to-video 的视频输入参数尚未接入。");
  }

  try {
    const ai = new GoogleGenAI(googleGenAIOptions(params.apiKey, params.apiBaseUrl));
    const officialMode = params.videoMode ?? legacyInputModeToOfficialMode(params.inputMode, "google");
    const veoParams = normalizeVeoParams(params, officialMode);
    const mapped = mapVideoParams("google", params.modelName, officialMode, params.aspectRatio, veoParams.resolution, veoParams.durationSeconds);
    const isOmni = params.modelName === "omni_flash-10s";
    const inputAudits: Array<Record<string, unknown>> = [];
    const imageCount = params.imageAssetIds?.length ?? 0;
    const safetyPrompt = veoSafetyPrompt(params.prompt, officialMode, imageCount);
    const requestPrompt = sanitizePrompt(safetyPrompt);
    const sensitiveMatches = detectSensitiveTerms(params.prompt);
    const promptSafetyRewritten = requestPrompt !== params.prompt;
    const veoNegativePrompt = [params.negativePrompt, buildVeoNegativePrompt("product_ad")].filter(Boolean).join(", ");
    const supportsNegativePrompt = officialMode === "text_to_video";
    const requestNegativePrompt = supportsNegativePrompt ? veoNegativePrompt : "";
    const initialPersonGeneration = getPersonGenerationMode({ prompt: requestPrompt, hasPerson: imageCount > 0 });

    const config: Record<string, unknown> = {
      numberOfVideos: Math.max(1, params.generateCount || 1),
      personGeneration: initialPersonGeneration
    };
    if (!isOmni || params.aspectRatio) config.aspectRatio = isOmni ? params.aspectRatio : mapped.aspectRatio;
    if (!isOmni || params.resolution) config.resolution = isOmni ? params.resolution : mapped.resolution;
    if (requestNegativePrompt) config.negativePrompt = requestNegativePrompt;
    if (params.seed !== undefined) config.seed = params.seed;
    if (officialMode !== "video_extension") config.durationSeconds = mapped.durationSeconds;
    const inputImageAspectRatio = typeof config.aspectRatio === "string" ? config.aspectRatio : String(mapped.aspectRatio ?? params.aspectRatio ?? "16:9");
    const request: Record<string, unknown> = {
      model: params.modelName,
      prompt: requestPrompt,
      config
    };

    if (officialMode === "image_to_video_first_frame") {
      if (!params.imageAssetIds?.length) throw new ProviderError("MISSING_INPUT_ASSET", "图生视频需要连接一张首帧图片。");
      const firstFrame = await assetImage(params.imageAssetIds[0], inputImageAspectRatio);
      inputAudits.push(firstFrame.audit);
      request.image = stripAudit(firstFrame);
    }

    if (officialMode === "image_to_video_first_last_frame") {
      if (!params.imageAssetIds?.length) throw new ProviderError("MISSING_INPUT_ASSET", "首尾帧模式需要连接首帧图片。");
      if (params.imageAssetIds.length < 2) throw new ProviderError("MISSING_INPUT_ASSET", "首尾帧视频需要连接首帧图和尾帧图。");
      const firstFrame = await assetImage(params.imageAssetIds[0], inputImageAspectRatio);
      const lastFrame = await assetImage(params.imageAssetIds[1], inputImageAspectRatio);
      inputAudits.push(firstFrame.audit, lastFrame.audit);
      request.image = stripAudit(firstFrame);
      config.lastFrame = stripAudit(lastFrame);
    }

    if (officialMode === "reference_images_to_video") {
      if (!params.imageAssetIds?.length) throw new ProviderError("MISSING_INPUT_ASSET", "参考图生视频需要至少一张参考图片。");
      if (params.imageAssetIds.length > 3) throw new ProviderError("MODEL_PARAM_UNSUPPORTED", "Veo 参考图生视频最多支持 3 张参考图，请减少参考图数量。");
      const images = await Promise.all(params.imageAssetIds.map((assetId) => assetImage(assetId, inputImageAspectRatio)));
      inputAudits.push(...images.map((image) => image.audit));
      config.referenceImages = images.map((image) => ({
        image: stripAudit(image),
        referenceType: VideoGenerationReferenceType.ASSET
      }));
    }

    if (officialMode === "video_extension") {
      if (!params.videoAssetIds?.length) throw new ProviderError("MISSING_VIDEO_INPUT", "视频延展需要连接一个来自 Veo 生成结果的视频。");
      const extensionVideo = await assetVideoForExtension(params.videoAssetIds[0], ai);
      inputAudits.push(extensionVideo.audit);
      request.video = extensionVideo.video;
      delete config.aspectRatio;
      delete config.durationSeconds;
    }

    const payloadSummary = buildPayloadSummary({
      providerId: "google",
      selectedModelId: params.catalogModelId,
      actualModelName: params.modelName,
      inputMode: officialMode,
      aspectRatio: params.aspectRatio,
      mappedResolution: String(mapped.resolution ?? ""),
      duration: params.duration,
      quality: params.qualityMode ?? "full_quality",
      qualityMode: params.qualityMode ?? "full_quality",
      hasImageInput: Boolean(params.imageAssetIds?.length),
      imageInputCount: params.imageAssetIds?.length ?? 0,
      prompt: params.prompt,
      negativePrompt: requestNegativePrompt,
      isMock: false,
      qualityAudit: {
        qualityMode: params.qualityMode ?? "full_quality",
        isFallback: false,
        inputImages: inputAudits,
        inputImageSource: inputAudits[0]?.inputImageSource,
        inputImageWidth: inputAudits[0]?.inputImageWidth,
        inputImageHeight: inputAudits[0]?.inputImageHeight,
        inputImageFileSize: inputAudits[0]?.inputImageFileSize,
        modelInputAspectRatio: inputAudits[0]?.modelInputAspectRatio,
        usesPreviewUrl: false,
        usesOriginalFile: inputAudits[0]?.usesOriginalFile
      },
      payloadSummary: {
        endpointType: "gemini.generateVideos",
        officialMode,
        selectedMode: officialMode,
        supportsCurrentMode: veoParams.supportsCurrentMode,
        qualityTier: veoParams.capability.qualityTier,
        configAspectRatio: config.aspectRatio,
        configResolution: config.resolution,
        configDurationSeconds: config.durationSeconds,
        durationAutoAdjusted: veoParams.durationAutoAdjusted,
        resolutionAutoAdjusted: veoParams.resolutionAutoAdjusted,
        promptSafetyRewritten,
        sensitiveTermMatches: sensitiveMatches,
        safetySuggestion: buildRaiSuggestion({ sanitizedPrompt: requestPrompt }),
        personGeneration: initialPersonGeneration,
        personGenerationHint: veoPersonGenerationUiHint(),
        negativePrompt: requestNegativePrompt,
        submittedPromptLength: requestPrompt.length,
        originalPromptLength: params.prompt.length,
        numberOfVideos: config.numberOfVideos,
        sampleCount: config.numberOfVideos,
        seed: params.seed,
        hasInlineData: Boolean(request.image || config.lastFrame || config.referenceImages),
        referenceImageCount: Array.isArray(config.referenceImages) ? config.referenceImages.length : 0
      }
    });
    logOfficialPayload(payloadSummary);

    let operation: Awaited<ReturnType<typeof runVeoGenerateOperation>> | undefined;
    let parsed: VeoOperationParseResult | undefined;
    let effectiveOfficialMode = officialMode;
    let raiFallbackApplied: Record<string, unknown> | undefined;
    const requestLogs: string[] = [];

    async function executeVeoAttempt(input: {
      attempt: "sanitized_prompt" | "silent_audio_safe" | "product_only";
      attemptRequest: Record<string, unknown>;
      attemptOfficialMode: OfficialVideoMode;
      sanitizedPrompt: string;
      personGeneration: string;
      fallbackUsed?: string;
    }) {
      const attemptOperation = await runVeoGenerateOperation(ai, input.attemptRequest);
      const attemptParsed = parseVeoOperationResult(attemptOperation);
      logVeoOperationSummary({ params, officialMode: input.attemptOfficialMode, operation: attemptOperation, parsed: attemptParsed, fallbackStage: input.fallbackUsed });
      const requestLogPath = writeVeoRequestLog({
        requestId: createVeoRequestId(params.nodeId),
        modelId: params.catalogModelId ?? params.modelName,
        originalPrompt: params.prompt,
        sanitizedPrompt: input.sanitizedPrompt,
        negativePrompt: requestNegativePrompt,
        personGeneration: input.personGeneration,
        aspectRatio: params.aspectRatio,
        duration: veoParams.durationSeconds,
        raiMediaFilteredCount: attemptParsed.raiMediaFilteredCount,
        raiMediaFilteredReasons: attemptParsed.raiMediaFilteredReasons,
        hasVideo: hasParsedVideo(attemptParsed),
        fallbackUsed: input.fallbackUsed ?? input.attempt
      });
      requestLogs.push(requestLogPath);
      return { attemptOperation, attemptParsed, requestLogPath };
    }

    let attempt = await executeVeoAttempt({
      attempt: "sanitized_prompt",
      attemptRequest: request,
      attemptOfficialMode: officialMode,
      sanitizedPrompt: requestPrompt,
      personGeneration: initialPersonGeneration
    });
    operation = attempt.attemptOperation;
    parsed = attempt.attemptParsed;

    if (operation.error) {
      const debugPath = writeVeoOperationDebugSnapshot({ reason: "operation_error", params, officialMode, operation, parsed });
      throw new ProviderError("VEO_OPERATION_FAILED", "Google Veo 生成任务失败。", `${rawErrorMessage(operation.error)}\nDebug snapshot: ${debugPath}`);
    }

    if (isRaiMediaFiltered(parsed) && !hasParsedVideo(parsed)) {
      const initialRaiWasAudioRelated = hasAudioSafetyReason(parsed);
      const audioSafePrompt = initialRaiWasAudioRelated
        ? `${requestPrompt}\n\n${buildAudioSafePrompt()}`
        : `${requestPrompt}\n\nNeutral product-focused commercial scene, no celebrity likeness, no minors, no dangerous action, no audio risk.`;
      const audioSafeRequest = {
        ...request,
        prompt: audioSafePrompt,
        config: { ...(request.config as Record<string, unknown>), personGeneration: initialPersonGeneration }
      };
      if (requestNegativePrompt) (audioSafeRequest.config as Record<string, unknown>).negativePrompt = requestNegativePrompt;
      attempt = await executeVeoAttempt({
        attempt: "silent_audio_safe",
        attemptRequest: audioSafeRequest,
        attemptOfficialMode: effectiveOfficialMode,
        sanitizedPrompt: audioSafePrompt,
        personGeneration: initialPersonGeneration,
        fallbackUsed: initialRaiWasAudioRelated ? "silent_audio_safe" : "safer_visual_prompt"
      });
      operation = attempt.attemptOperation;
      parsed = attempt.attemptParsed;
      raiFallbackApplied = {
        reason: "rai_media_filtered",
        firstFallback: initialRaiWasAudioRelated ? "silent_audio_safe" : "safer_visual_prompt"
      };
    }

    if (operation.error) {
      const debugPath = writeVeoOperationDebugSnapshot({ reason: "operation_error", params, officialMode: effectiveOfficialMode, operation, parsed });
      throw new ProviderError("VEO_OPERATION_FAILED", "Google Veo 生成任务失败。", `${rawErrorMessage(operation.error)}\nDebug snapshot: ${debugPath}`);
    }

    if (isRaiMediaFiltered(parsed) && !hasParsedVideo(parsed)) {
      const productOnlyPrompt = sanitizePrompt(buildProductOnlyPrompt());
      const productOnlyConfig: Record<string, unknown> = {
        numberOfVideos: Math.max(1, params.generateCount || 1),
        aspectRatio: mapped.aspectRatio,
        resolution: mapped.resolution
      };
      if (requestNegativePrompt) productOnlyConfig.negativePrompt = requestNegativePrompt;
      if (params.seed !== undefined) productOnlyConfig.seed = params.seed;
      if (officialMode !== "video_extension") productOnlyConfig.durationSeconds = mapped.durationSeconds;
      const productOnlyRequest: Record<string, unknown> = {
        model: params.modelName,
        prompt: productOnlyPrompt,
        config: productOnlyConfig
      };
      if (params.imageAssetIds?.length) {
        const croppedImage = await assetImageForRaiFallback(params.imageAssetIds[0]);
        productOnlyRequest.image = stripAudit(croppedImage);
        inputAudits.push(croppedImage.audit);
        effectiveOfficialMode = "image_to_video_first_frame";
        raiFallbackApplied = {
          ...(raiFallbackApplied ?? { reason: "rai_media_filtered" }),
          secondFallback: "product_only_reference_crop",
          productCropAudit: croppedImage.audit
        };
      } else {
        raiFallbackApplied = {
          ...(raiFallbackApplied ?? { reason: "rai_media_filtered" }),
          secondFallback: "product_only_text"
        };
      }
      attempt = await executeVeoAttempt({
        attempt: "product_only",
        attemptRequest: productOnlyRequest,
        attemptOfficialMode: effectiveOfficialMode,
        sanitizedPrompt: productOnlyPrompt,
        personGeneration: "omitted",
        fallbackUsed: String(raiFallbackApplied.secondFallback ?? "product_only")
      });
      operation = attempt.attemptOperation;
      parsed = attempt.attemptParsed;
    }

    if (operation.error) {
      const debugPath = writeVeoOperationDebugSnapshot({ reason: "operation_error", params, officialMode: effectiveOfficialMode, operation, parsed });
      throw new ProviderError("VEO_OPERATION_FAILED", "Google Veo 生成任务失败。", `${rawErrorMessage(operation.error)}\nDebug snapshot: ${debugPath}`);
    }

    if (isRaiMediaFiltered(parsed) && !hasParsedVideo(parsed)) {
      const debugPath = writeVeoOperationDebugSnapshot({ reason: "rai_filtered_no_video", params, officialMode: effectiveOfficialMode, operation, parsed });
      const reasons = parsed.raiMediaFilteredReasons ?? [];
      const suggestion = buildRaiSuggestion({ sanitizedPrompt: requestPrompt, reasons });
      const details = {
        type: "RAI_FILTERED",
        message: "Veo 安全过滤，未生成视频",
        reasons,
        suggestion,
        sanitizedPrompt: requestPrompt,
        productOnlyPrompt: buildProductOnlyPrompt(),
        negativePrompt: requestNegativePrompt,
        personGeneration: "omitted",
        raiMediaFilteredCount: parsed.raiMediaFilteredCount ?? 0,
        raiMediaFilteredReasons: reasons,
        fallbackUsed: raiFallbackApplied,
        requestLogs,
        debugPath,
        switchModelSuggestion: "切换 Seedance / 可灵 / Wan 重试"
      };
      throw new ProviderError(
        "VEO_RAI_FILTERED_NO_VIDEO",
        "Google Veo 安全过滤：当前画面或提示词可能包含真人肖像、名人相似、未成年人、危险动作、版权或音频风险。系统已为你生成安全改写版本。",
        `${reasons.join("；") || "raiMediaFilteredCount > 0"}\nDebug snapshot: ${debugPath}`,
        details
      );
    }

    if (!hasParsedVideo(parsed)) {
      const debugPath = writeVeoOperationDebugSnapshot({ reason: "empty_result_no_video_no_rai", params, officialMode: effectiveOfficialMode, operation, parsed });
      throw new ProviderError(
        "VEO_OPERATION_NO_VIDEO_IN_RESPONSE",
        "Veo 返回空结果，可能是处理失败或模型服务异常",
        `${JSON.stringify(parsed.rawSummary)}\nDebug snapshot: ${debugPath}`,
        {
          type: "EMPTY_RESULT",
          message: "Veo 返回空结果，可能是处理失败或模型服务异常",
          rawSummary: parsed.rawSummary,
          requestLogs,
          debugPath
        }
      );
    }

    const saved = await downloadVeoVideoResult({ parsed, ai, apiKey: params.apiKey });
    const outputMetadata = await readGeneratedFileMetadata(saved.localPath);
    const resultSummary = {
      ...payloadSummary,
      payloadSummary: {
        ...(payloadSummary.payloadSummary as Record<string, unknown>),
        operationName: operation.name,
        operationDone: operation.done,
        effectiveOfficialMode,
        raiFallbackApplied,
        requestLogs,
        finalRaiMediaFilteredCount: parsed.raiMediaFilteredCount ?? 0,
        finalRaiMediaFilteredReasons: parsed.raiMediaFilteredReasons ?? [],
        finalPersonGeneration: raiFallbackApplied?.secondFallback ? "omitted" : initialPersonGeneration,
        operationHasError: Boolean(operation.error),
        operationResponseKeys: parsed.rawSummary.responseKeys,
        parsedVideoUriExists: Boolean(parsed.videoUri),
        parsedSourceShape: parsed.sourceShape,
        googleVideoUri: parsed.videoUri,
        googleVideoSourceShape: parsed.sourceShape,
        downloadStatus: "success",
        localFileExists: true,
        output: outputMetadata
      },
      ...metadataToQualityAudit(outputMetadata)
    };

    return {
      status: "success",
      outputUrl: saved.outputUrl,
      localPath: saved.localPath,
      rawResponse: {
        name: operation.name,
        done: operation.done,
        responseSummary: parsed.rawSummary
      },
      payloadSummary: resultSummary
    };
  } catch (error) {
    throw classifyGoogleVeoError(error);
  }
}
