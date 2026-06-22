import fs from "node:fs";
import path from "node:path";
import { GoogleGenAI } from "@google/genai";
import { getAsset } from "../asset.service.js";
import { ensureAssetLocalFile } from "../assets/ensureAssetLocalFile.service.js";
import { saveGeneratedBuffer } from "../../utils/downloadGeneratedFile.js";
import { buildPayloadSummary, logOfficialPayload } from "../../utils/generationPayload.js";
import { aspectRatioToGoogleSize, normalizeImageAspectRatio } from "../../utils/imageAspectRatio.js";
import { readGeneratedFileMetadata } from "../../utils/mediaMetadata.js";
import { ProviderError, rawErrorMessage } from "../../utils/providerErrors.js";
import { googleGenAIOptions } from "./providerBaseUrl.js";
import { generateImageWithGoogleRelay, isGoogleRelayEndpoint } from "./googleRelay.service.js";
import type { ImageProviderParams, ProviderGenerateResult } from "./providerTypes.js";

function mimeFromPath(filePath: string) {
  const ext = path.extname(filePath).toLowerCase();
  if (ext === ".jpg" || ext === ".jpeg") return "image/jpeg";
  if (ext === ".webp") return "image/webp";
  return "image/png";
}

function extensionFromMime(mimeType?: string) {
  if (mimeType === "image/jpeg") return ".jpg";
  if (mimeType === "image/webp") return ".webp";
  return ".png";
}

function classifyGoogleError(error: unknown): ProviderError {
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
    return new ProviderError("API_KEY_INVALID", "Google API Key 无效或当前模型未开通权限。", message);
  }
  return new ProviderError("PROVIDER_ERROR", "Google 图片生成失败，请检查模型权限、请求参数和 Google API 返回信息。", message);
}

function collectInlineImages(value: unknown, results: Array<{ data: string; mimeType?: string }> = []) {
  if (!value) return results;
  if (Array.isArray(value)) {
    value.forEach((item) => collectInlineImages(item, results));
    return results;
  }
  if (typeof value !== "object") return results;

  const record = value as Record<string, unknown>;
  const inlineData = (record.inlineData ?? record.inline_data) as Record<string, unknown> | undefined;
  if (inlineData && typeof inlineData.data === "string") {
    results.push({
      data: inlineData.data,
      mimeType: typeof inlineData.mimeType === "string" ? inlineData.mimeType : typeof inlineData.mime_type === "string" ? inlineData.mime_type : undefined
    });
  }
  Object.values(record).forEach((nested) => collectInlineImages(nested, results));
  return results;
}

async function imagePartsFromAssets(assetIds: string[] | undefined) {
  if (!assetIds?.length) return { parts: [], audits: [], skipped: [] };
  const parts: Array<{ inlineData: { data: string; mimeType: string } }> = [];
  const audits: Array<Record<string, unknown>> = [];
  const skipped: Array<{ assetId: string; reason: string }> = [];

  for (const assetId of assetIds.slice(0, 8)) {
    try {
      const asset = await ensureAssetLocalFile(await getAsset(assetId), "Google 图片生成引用的图片素材");
      parts.push({
        inlineData: {
          data: fs.readFileSync(asset.localPath).toString("base64"),
          mimeType: asset.mimeType || mimeFromPath(asset.localPath)
        }
      });
      const metadata = await readGeneratedFileMetadata(asset.localPath);
      audits.push({
        inputImageSource: asset.localFileSource,
        inputImageWidth: metadata.width,
        inputImageHeight: metadata.height,
        inputImageFileSize: metadata.fileSize,
        inputImageWasCompressed: false
      });
    } catch (error) {
      skipped.push({ assetId, reason: rawErrorMessage(error) });
    }
  }

  return { parts, audits, skipped };
}

async function callGeminiImage(ai: any, params: ImageProviderParams, parts: Array<Record<string, unknown>>) {
  const mappedSize = aspectRatioToGoogleSize(params.aspectRatio);
  const request = {
    model: params.modelName,
    contents: [{ role: "user", parts }],
    config: {
      responseModalities: ["IMAGE"],
      aspectRatio: normalizeImageAspectRatio(params.aspectRatio),
      imageConfig: mappedSize ? { width: mappedSize.width, height: mappedSize.height } : undefined
    }
  };

  return ai.models.generateContent(request);
}

export async function generateImageWithGoogle(params: ImageProviderParams): Promise<ProviderGenerateResult> {
  if (!params.apiKey) throw new ProviderError("API_KEY_INVALID", "请先在设置中心配置该模型 API Key。");
  if (params.apiKey.includes("*")) throw new ProviderError("API_KEY_INVALID", "Google API Key 读取到的是 maskedKey，请在设置中心重新填写完整 API Key。");
  if (isGoogleRelayEndpoint(params.apiBaseUrl)) return generateImageWithGoogleRelay(params);
  if ((params.inputMode === "image-edit" || params.inputMode === "image-to-image") && !params.imageAssetIds?.length) {
    throw new ProviderError("MISSING_INPUT_ASSET", params.inputMode === "image-edit" ? "图片编辑需要连接一张图片素材。" : "图生图需要连接一张图片素材。");
  }
  if (params.modelName.toLowerCase().includes("imagen")) {
    throw new ProviderError("ADAPTER_NOT_IMPLEMENTED", "Google Imagen 真实 API 调用路径尚未完整接入。请先使用 Gemini image / Nano Banana 模型，或补齐 Imagen API 调用。");
  }

  console.log("[Google Image] key check", {
    hasApiKey: Boolean(params.apiKey),
    keyPrefix: params.apiKey.slice(0, 7),
    keyLength: params.apiKey.length,
    modelName: params.modelName
  });

  try {
    const ai: any = new GoogleGenAI(googleGenAIOptions(params.apiKey, params.apiBaseUrl));
    const inputParts = await imagePartsFromAssets(params.imageAssetIds);
    if ((params.inputMode === "image-edit" || params.inputMode === "image-to-image") && params.imageAssetIds?.length && !inputParts.parts.length) {
      throw new ProviderError(
        "MISSING_INPUT_ASSET",
        "Google 图片生成引用的图片素材都不可用，请重新连接画布上的图片节点或重新上传素材。",
        JSON.stringify(inputParts.skipped)
      );
    }
    const parts = [{ text: params.prompt }, ...inputParts.parts];
    const mappedSize = aspectRatioToGoogleSize(params.aspectRatio);
    logOfficialPayload(
      buildPayloadSummary({
        providerId: "google",
        selectedModelId: params.catalogModelId,
        actualModelName: params.modelName,
        inputMode: params.inputMode,
        aspectRatio: params.aspectRatio,
        mappedSize: mappedSize ? `${mappedSize.width}x${mappedSize.height}` : normalizeImageAspectRatio(params.aspectRatio),
        quality: params.imageQuality,
        qualityMode: params.qualityMode ?? "full_quality",
        hasImageInput: Boolean(params.imageAssetIds?.length),
        imageInputCount: params.imageAssetIds?.length ?? 0,
        prompt: params.prompt,
        isMock: false,
        qualityAudit: {
          qualityMode: params.qualityMode ?? "full_quality",
          isFallback: false,
          ...inputParts.audits[0]
        },
        payloadSummary: {
          endpointType: "gemini.generateContent",
          responseModalities: ["IMAGE"],
          imagePartCount: inputParts.parts.length
        }
      })
    );
    const response = await callGeminiImage(ai, params, parts);
    const first = collectInlineImages(response)[0];
    if (!first) throw new ProviderError("PROVIDER_ERROR", "Google 图片接口没有返回图片数据。", rawErrorMessage(response));

    const saved = await saveGeneratedBuffer({
      buffer: Buffer.from(first.data, "base64"),
      prefix: "image_google",
      extension: extensionFromMime(first.mimeType),
      contentType: first.mimeType
    });

    return { status: "success", outputUrl: saved.outputUrl, localPath: saved.localPath, rawResponse: response, payloadSummary: inputParts.audits[0] };
  } catch (error) {
    if (error instanceof ProviderError) throw error;
    throw classifyGoogleError(error);
  }
}
