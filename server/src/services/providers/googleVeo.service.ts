import fs from "node:fs";
import path from "node:path";
import { GoogleGenAI, VideoGenerationReferenceType, type Image } from "@google/genai";
import { capabilityForMode, getVideoModelCapabilityOrLegacy } from "../../config/videoModelCapabilities.js";
import { getAsset } from "../asset.service.js";
import { saveGeneratedBuffer } from "../../utils/downloadGeneratedFile.js";
import { buildPayloadSummary, logOfficialPayload } from "../../utils/generationPayload.js";
import { metadataToQualityAudit, readGeneratedFileMetadata } from "../../utils/mediaMetadata.js";
import { ProviderError, rawErrorMessage } from "../../utils/providerErrors.js";
import { mapVideoParams } from "../../utils/videoParams.js";
import { legacyInputModeToOfficialMode } from "../../types/videoModes.js";
import type { OfficialVideoMode } from "../../types/videoModes.js";
import { parseVeoOperationResult, type VeoOperationParseResult } from "./googleVeo/veoOperationParser.js";
import type { ProviderGenerateResult, VideoProviderParams } from "./providerTypes.js";

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

async function assetImage(assetId: string): Promise<VeoInputImage> {
  const asset = await getAsset(assetId);
  if (!asset?.localPath || !fs.existsSync(asset.localPath)) {
    throw new ProviderError("MISSING_INPUT_ASSET", "Google Veo 引用的图片素材不存在或已被删除。");
  }

  const metadata = await readGeneratedFileMetadata(asset.localPath);
  return {
    imageBytes: fs.readFileSync(asset.localPath).toString("base64"),
    mimeType: asset.mimeType || mimeTypeFromPath(asset.localPath),
    audit: {
      assetId,
      inputImageSource: "localPath",
      inputImageWidth: metadata.width,
      inputImageHeight: metadata.height,
      inputImageFileSize: metadata.fileSize,
      originalAspectRatio: aspectRatioOf(metadata.width, metadata.height),
      modelInputAspectRatio: aspectRatioOf(metadata.width, metadata.height),
      usesOriginalFile: true,
      usesPreviewUrl: false,
      inputImageWasCompressed: false
    }
  };
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
  let file = await ai.files.get({ name: fileName });
  const startedAt = Date.now();
  while (file.state === "PROCESSING") {
    if (Date.now() - startedAt > 2 * 60 * 1000) {
      throw new ProviderError("VEO_VIDEO_DOWNLOAD_FAILED", "Google Veo 视频延展输入视频上传后处理超时，请稍后重试。");
    }
    await sleep(3000);
    file = await ai.files.get({ name: fileName });
  }
  if (file.state === "FAILED") {
    throw new ProviderError("VEO_VIDEO_DOWNLOAD_FAILED", "Google Veo 视频延展输入视频处理失败，请重新生成上一段视频后再延展。", rawErrorMessage(file.error));
  }
  return file;
}

async function assetVideoForExtension(assetId: string, ai: GoogleGenAI) {
  const asset = await getAsset(assetId);
  if (!asset?.localPath || !fs.existsSync(asset.localPath)) {
    throw new ProviderError("MISSING_VIDEO_INPUT", "Veo 视频延展引用的视频素材不存在或已被删除。");
  }
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
    const uploaded = await ai.files.upload({
      file: asset.localPath,
      config: {
        mimeType: asset.mimeType || "video/mp4",
        displayName: asset.fileName || path.basename(asset.localPath)
      }
    });
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

  try {
    const target = generatedPath("video_google_veo");
    await ai.files.download({ file: parsed.videoUri, downloadPath: target.localPath });
    await assertSavedVideo(target.localPath);
    return target;
  } catch (sdkError) {
    try {
      const response = await fetch(parsed.videoUri, {
        headers: { "x-goog-api-key": apiKey }
      });
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
          uriKind: parsed.videoUri.startsWith("http") ? "http" : "file"
        })
      );
    }
  }
}

export async function generateVideoWithGoogleVeo(params: VideoProviderParams): Promise<ProviderGenerateResult> {
  if (!params.apiKey) throw new ProviderError("API_KEY_INVALID", "请先在设置中心配置该模型 API Key。");
  if (params.apiKey.includes("*")) throw new ProviderError("API_KEY_INVALID", "Google API Key 读取到的是 maskedKey，请在设置中心重新填写完整 API Key。");
  if (params.inputMode === "video-to-video" && params.videoMode !== "video_extension") {
    throw new ProviderError("ADAPTER_NOT_IMPLEMENTED", "Google Veo 当前 video-to-video 的视频输入参数尚未接入。");
  }

  try {
    const ai = new GoogleGenAI({ apiKey: params.apiKey });
    const officialMode = params.videoMode ?? legacyInputModeToOfficialMode(params.inputMode, "google");
    const veoParams = normalizeVeoParams(params, officialMode);
    const mapped = mapVideoParams("google", params.modelName, officialMode, params.aspectRatio, veoParams.resolution, veoParams.durationSeconds);
    const inputAudits: Array<Record<string, unknown>> = [];

    const config: Record<string, unknown> = {
      numberOfVideos: Math.max(1, params.generateCount || 1),
      aspectRatio: mapped.aspectRatio,
      resolution: mapped.resolution
    };
    if (officialMode !== "video_extension") config.durationSeconds = mapped.durationSeconds;
    const request: Record<string, unknown> = {
      model: params.modelName,
      prompt: params.prompt,
      config
    };

    if (officialMode === "image_to_video_first_frame") {
      if (!params.imageAssetIds?.length) throw new ProviderError("MISSING_INPUT_ASSET", "图生视频需要连接一张首帧图片。");
      const firstFrame = await assetImage(params.imageAssetIds[0]);
      inputAudits.push(firstFrame.audit);
      request.image = stripAudit(firstFrame);
    }

    if (officialMode === "image_to_video_first_last_frame") {
      if (!params.imageAssetIds?.length) throw new ProviderError("MISSING_INPUT_ASSET", "首尾帧模式需要连接首帧图片。");
      if (params.imageAssetIds.length < 2) throw new ProviderError("MISSING_INPUT_ASSET", "首尾帧视频需要连接首帧图和尾帧图。");
      const firstFrame = await assetImage(params.imageAssetIds[0]);
      const lastFrame = await assetImage(params.imageAssetIds[1]);
      inputAudits.push(firstFrame.audit, lastFrame.audit);
      request.image = stripAudit(firstFrame);
      config.lastFrame = stripAudit(lastFrame);
    }

    if (officialMode === "reference_images_to_video") {
      if (!params.imageAssetIds?.length) throw new ProviderError("MISSING_INPUT_ASSET", "参考图生视频需要至少一张参考图片。");
      if (params.imageAssetIds.length > 3) throw new ProviderError("MODEL_PARAM_UNSUPPORTED", "Veo 参考图生视频最多支持 3 张参考图，请减少参考图数量。");
      const images = await Promise.all(params.imageAssetIds.map((assetId) => assetImage(assetId)));
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
      negativePrompt: params.negativePrompt,
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
        usesOriginalFile: true
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
        numberOfVideos: config.numberOfVideos,
        hasInlineData: Boolean(request.image || config.lastFrame || config.referenceImages),
        referenceImageCount: Array.isArray(config.referenceImages) ? config.referenceImages.length : 0
      }
    });
    logOfficialPayload(payloadSummary);

    let operation = await ai.models.generateVideos(request as unknown as Parameters<typeof ai.models.generateVideos>[0]);
    const startedAt = Date.now();
    while (!operation.done) {
      if (Date.now() - startedAt > 10 * 60 * 1000) {
        throw new ProviderError("VEO_OPERATION_TIMEOUT", "Google Veo 视频生成任务超时，请稍后重试或检查当前模型负载。");
      }
      await sleep(10000);
      operation = await ai.operations.getVideosOperation({ operation });
    }

    const parsed = parseVeoOperationResult(operation);
    console.log("[veo-operation-summary]", {
      modelId: params.catalogModelId,
      officialMode,
      operationName: operation.name,
      done: operation.done,
      hasError: Boolean(operation.error),
      errorCode: (operation.error as { code?: unknown } | undefined)?.code,
      errorMessage: (operation.error as { message?: unknown } | undefined)?.message,
      hasResponse: Boolean(operation.response),
      responseKeys: parsed.rawSummary.responseKeys,
      generatedVideosCount: parsed.rawSummary.generatedVideosCount,
      generatedVideosShape: parsed.rawSummary.generatedVideosShape,
      parsedVideoUriExists: Boolean(parsed.videoUri),
      sourceShape: parsed.sourceShape
    });

    if (operation.error) {
      throw new ProviderError("VEO_OPERATION_FAILED", "Google Veo 生成任务失败。", rawErrorMessage(operation.error));
    }

    if (!parsed.videoObject && !parsed.videoUri && !parsed.videoBytes) {
      throw new ProviderError(
        "VEO_OPERATION_NO_VIDEO_IN_RESPONSE",
        "Google Veo 已完成请求，但返回结构中没有解析到视频文件。请检查 operation 结果结构、模型权限、区域限制或当前模式是否支持。",
        JSON.stringify(parsed.rawSummary)
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
