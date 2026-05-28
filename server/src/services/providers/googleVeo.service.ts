import fs from "node:fs";
import path from "node:path";
import { GoogleGenAI, VideoGenerationReferenceType, type Image } from "@google/genai";
import { getAsset } from "../asset.service.js";
import { downloadGeneratedFile, saveGeneratedBuffer } from "../../utils/downloadGeneratedFile.js";
import { buildPayloadSummary, logOfficialPayload } from "../../utils/generationPayload.js";
import { ProviderError, rawErrorMessage } from "../../utils/providerErrors.js";
import { mapVideoParams } from "../../utils/videoParams.js";
import { readGeneratedFileMetadata } from "../../utils/mediaMetadata.js";
import { legacyInputModeToOfficialMode } from "../../types/videoModes.js";
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

function classifyGoogleVeoError(error: unknown): ProviderError {
  const message = rawErrorMessage(error);
  const lower = message.toLowerCase();

  if (lower.includes("user location is not supported") || lower.includes("failed_precondition")) {
    return new ProviderError(
      "GOOGLE_REGION_UNSUPPORTED",
      "当前 Google API 请求地区暂不支持该模型。请检查服务器 IP / 代理出口地区、Google 项目权限，或切回之前已验证可用的模型。",
      message
    );
  }
  if (
    lower.includes("model not found") ||
    lower.includes("models/") && (lower.includes("not found") || lower.includes("not supported") || lower.includes("not available")) ||
    lower.includes("is not found for api version")
  ) {
    return new ProviderError(
      "GOOGLE_MODEL_NOT_FOUND",
      "当前 Google modelName 不存在，或不支持当前 API version / method。请检查 modelName、apiVersion，或使用 Google listModels 检测。",
      message
    );
  }
  if (lower.includes("fetch failed") || lower.includes("network") || lower.includes("econn") || lower.includes("dns")) {
    return new ProviderError("NETWORK_ERROR", "Google API 网络请求失败，请检查代理、网络连接或 Google API 是否可访问。", message);
  }
  if (lower.includes("api key") || lower.includes("unauthorized") || lower.includes("permission") || lower.includes("403") || lower.includes("401")) {
    return new ProviderError("API_KEY_INVALID", "Google API Key 无效或当前 Veo 模型未开通权限。", message);
  }
  return new ProviderError("PROVIDER_ERROR", "Google Veo 生成失败，请检查模型权限、请求参数和 Google API 返回信息。", message);
}

async function assetImage(assetId: string): Promise<Image> {
  const asset = await getAsset(assetId);
  if (!asset?.localPath || !fs.existsSync(asset.localPath)) {
    throw new ProviderError("MISSING_INPUT_ASSET", "Google Veo 引用的图片素材不存在或已被删除。");
  }
  return {
    imageBytes: fs.readFileSync(asset.localPath).toString("base64"),
    mimeType: mimeTypeFromPath(asset.localPath)
  };
}

function findGeneratedVideo(value: unknown): { videoBytes?: string; mimeType?: string; uri?: string } | undefined {
  if (!value || typeof value !== "object") return undefined;
  if (Array.isArray(value)) {
    for (const item of value) {
      const found = findGeneratedVideo(item);
      if (found) return found;
    }
    return undefined;
  }
  const record = value as Record<string, unknown>;
  const directVideo = record.video;
  if (directVideo && typeof directVideo === "object") {
    const video = directVideo as Record<string, unknown>;
    if (typeof video.videoBytes === "string" || typeof video.uri === "string") {
      return {
        videoBytes: typeof video.videoBytes === "string" ? video.videoBytes : undefined,
        mimeType: typeof video.mimeType === "string" ? video.mimeType : undefined,
        uri: typeof video.uri === "string" ? video.uri : undefined
      };
    }
  }
  if (typeof record.videoBytes === "string" || typeof record.uri === "string") {
    return {
      videoBytes: typeof record.videoBytes === "string" ? record.videoBytes : undefined,
      mimeType: typeof record.mimeType === "string" ? record.mimeType : undefined,
      uri: typeof record.uri === "string" ? record.uri : undefined
    };
  }
  for (const nested of Object.values(record)) {
    const found = findGeneratedVideo(nested);
    if (found) return found;
  }
  return undefined;
}

function countGeneratedVideos(value: unknown): number {
  if (!value || typeof value !== "object") return 0;
  const record = value as Record<string, unknown>;
  if (Array.isArray(record.generatedVideos)) return record.generatedVideos.length;
  for (const nested of Object.values(record)) {
    const count = countGeneratedVideos(nested);
    if (count) return count;
  }
  return 0;
}

export async function generateVideoWithGoogleVeo(params: VideoProviderParams): Promise<ProviderGenerateResult> {
  if (!params.apiKey) throw new ProviderError("API_KEY_INVALID", "请先在设置中心配置该模型 API Key。");
  if (params.apiKey.includes("*")) throw new ProviderError("API_KEY_INVALID", "Google API Key 读取到的是 maskedKey，请在设置中心重新填写完整 API Key。");
  if (params.inputMode === "video-to-video") {
    throw new ProviderError("ADAPTER_NOT_IMPLEMENTED", "Google Veo 当前 video-to-video 的视频输入参数尚未接入。");
  }

  try {
    const ai = new GoogleGenAI({ apiKey: params.apiKey });
    const officialMode = params.videoMode ?? legacyInputModeToOfficialMode(params.inputMode, "google");
    const mapped = mapVideoParams("google", params.modelName, officialMode, params.aspectRatio, params.resolution, params.duration);
    const config: Record<string, unknown> = {
      numberOfVideos: Math.max(1, params.generateCount || 1),
      aspectRatio: mapped.aspectRatio,
      durationSeconds: mapped.durationSeconds,
      resolution: mapped.resolution
    };
    const request: Record<string, unknown> = {
      model: params.modelName,
      prompt: params.prompt,
      config
    };

    if (officialMode === "image_to_video_first_frame") {
      if (!params.imageAssetIds?.length) throw new ProviderError("MISSING_INPUT_ASSET", "图生视频需要连接一张图片素材。");
      request.image = await assetImage(params.imageAssetIds[0]);
    }

    if (officialMode === "image_to_video_first_last_frame") {
      if (!params.imageAssetIds?.length) throw new ProviderError("MISSING_INPUT_ASSET", "首尾帧模式需要连接首帧图片。");
      if (params.imageAssetIds.length < 2) throw new ProviderError("MISSING_INPUT_ASSET", "已连接首帧，还需要连接尾帧图片。");
      request.image = await assetImage(params.imageAssetIds[0]);
      config.lastFrame = await assetImage(params.imageAssetIds[1]);
    }

    if (officialMode === "reference_images_to_video") {
      if (!params.imageAssetIds?.length) throw new ProviderError("MISSING_INPUT_ASSET", "图片参考模式需要至少一张参考图片。");
      config.referenceImages = await Promise.all(
        params.imageAssetIds.slice(0, 3).map(async (assetId) => ({
          image: await assetImage(assetId),
          referenceType: VideoGenerationReferenceType.ASSET
        }))
      );
    }

    logOfficialPayload(
      buildPayloadSummary({
        providerId: "google",
        selectedModelId: params.catalogModelId,
        actualModelName: params.modelName,
        inputMode: officialMode,
        aspectRatio: params.aspectRatio,
        mappedResolution: String(mapped.resolution ?? ""),
        duration: params.duration,
        quality: "full_quality",
        hasImageInput: Boolean(params.imageAssetIds?.length),
        imageInputCount: params.imageAssetIds?.length ?? 0,
        prompt: params.prompt,
        isMock: false,
        payloadSummary: {
          endpointType: "gemini.generateVideos",
          configAspectRatio: config.aspectRatio,
          configResolution: config.resolution,
          configDurationSeconds: config.durationSeconds,
          hasInlineData: Boolean(request.image || config.lastFrame || config.referenceImages),
          referenceImageCount: Array.isArray(config.referenceImages) ? config.referenceImages.length : 0
        }
      })
    );

    let operation = await ai.models.generateVideos(request as unknown as Parameters<typeof ai.models.generateVideos>[0]);
    const startedAt = Date.now();
    while (!operation.done) {
      if (Date.now() - startedAt > 10 * 60 * 1000) throw new ProviderError("PROVIDER_ERROR", "Google Veo 视频生成任务超时。");
      await sleep(10000);
      operation = await ai.operations.getVideosOperation({ operation });
    }

    if (operation.error) {
      throw new ProviderError("PROVIDER_ERROR", "Google Veo 生成失败。", rawErrorMessage(operation.error));
    }

    console.log("[veo-operation-result]", {
      operationId: operation.name,
      done: operation.done,
      hasResponse: Boolean(operation.response),
      generatedVideosCount: countGeneratedVideos(operation.response ?? operation),
      hasVideo: Boolean(findGeneratedVideo(operation.response ?? operation)),
      errorCode: (operation.error as { code?: unknown } | undefined)?.code,
      errorMessage: (operation.error as { message?: unknown } | undefined)?.message
    });

    const video = findGeneratedVideo(operation.response ?? operation);
    if (!video) throw new ProviderError("PROVIDER_ERROR", "Google Veo 已完成请求但未返回视频文件，请检查 operation 结果解析、模型权限、区域限制或 API 返回结构。", rawErrorMessage(operation.response ?? operation));

    if (video.videoBytes) {
      const saved = await saveGeneratedBuffer({
        buffer: Buffer.from(video.videoBytes, "base64"),
        prefix: "video_google_veo",
        extension: ".mp4",
        contentType: video.mimeType
      });
      return { status: "success", outputUrl: saved.outputUrl, localPath: saved.localPath, rawResponse: operation };
    }

    if (video.uri) {
      try {
        const saved = await downloadGeneratedFile(video.uri, "video_google_veo");
        return { status: "success", outputUrl: saved.outputUrl, localPath: saved.localPath, rawResponse: operation };
      } catch {
        const target = generatedPath("video_google_veo");
        await ai.files.download({ file: video.uri, downloadPath: target.localPath });
        return { status: "success", outputUrl: target.outputUrl, localPath: target.localPath, rawResponse: operation };
      }
    }

    throw new ProviderError("PROVIDER_ERROR", "Google Veo 返回结果中没有可下载的视频地址或视频字节。", rawErrorMessage(video));
  } catch (error) {
    if (error instanceof ProviderError) throw error;
    throw classifyGoogleVeoError(error);
  }
}
