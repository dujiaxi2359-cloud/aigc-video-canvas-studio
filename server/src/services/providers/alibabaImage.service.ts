import { downloadGeneratedFile } from "../../utils/downloadGeneratedFile.js";
import { buildPayloadSummary, logOfficialPayload } from "../../utils/generationPayload.js";
import { aspectRatioToAlibabaSize, aspectRatioToQwen20Size } from "../../utils/imageAspectRatio.js";
import { ProviderError } from "../../utils/providerErrors.js";
import { buildNegativePrompt } from "../../utils/qualityPrompt.js";
import { getAsset } from "../asset.service.js";
import { resolveRemoteAsset } from "../assets/resolveRemoteAsset.service.js";
import type { ImageProviderParams, ProviderGenerateResult } from "./providerTypes.js";

async function responseError(response: Response) {
  const text = await response.text();
  try {
    const json = JSON.parse(text) as { message?: string; code?: string; error?: { message?: string; code?: string } };
    return json.error?.message ?? json.message ?? text;
  } catch {
    return text;
  }
}

function classifyAlibabaError(error: unknown): ProviderError {
  const message = error instanceof Error ? error.message : String(error);
  const lower = message.toLowerCase();
  if (lower.includes("invalid size format")) {
    return new ProviderError("PROVIDER_ERROR", "阿里 Qwen Image 的 size 参数格式错误，系统必须传 width*height。", message);
  }
  if (lower.includes("unauthorized") || lower.includes("invalid api-key") || lower.includes("invalidapikey") || lower.includes("401")) {
    return new ProviderError(
      "API_KEY_INVALID",
      "阿里百炼 API Key 无效、模型未开通或 endpoint 地域不匹配。请确认 API Key、模型和 DashScope endpoint 属于同一区域。",
      message
    );
  }
  if (lower.includes("quota") || lower.includes("balance") || lower.includes("insufficient")) {
    return new ProviderError("PROVIDER_ERROR", "阿里百炼额度不足或模型调用权限未开通，请检查百炼控制台。", message);
  }
  if (lower.includes("fetch failed") || lower.includes("network") || lower.includes("econn") || lower.includes("dns")) {
    return new ProviderError("NETWORK_ERROR", "阿里百炼网络请求失败，请检查本地网络、代理或 DashScope endpoint 是否可访问。", message);
  }
  if (lower.includes("model") && (lower.includes("not") || lower.includes("permission") || lower.includes("access"))) {
    return new ProviderError("PROVIDER_ERROR", "阿里 Qwen Image 模型不可用或没有权限。", message);
  }
  return new ProviderError("PROVIDER_ERROR", "阿里 Qwen Image 生成失败。", message);
}

function normalizeDashScopeEndpoint(apiBaseUrl?: string) {
  const base = (apiBaseUrl || "https://dashscope.aliyuncs.com/api/v1").replace(/\/$/, "");
  if (base.includes("/services/aigc/multimodal-generation/generation")) return base;
  return `${base}/services/aigc/multimodal-generation/generation`;
}

function mappedAlibabaImageSize(modelName: string, aspectRatio?: string) {
  return /qwen-image-2\.0|edit-plus|edit-max/i.test(modelName) ? aspectRatioToQwen20Size(aspectRatio) : aspectRatioToAlibabaSize(aspectRatio);
}

function findImageUrl(value: unknown): string | undefined {
  if (!value) return undefined;
  if (typeof value === "string") return /^https?:\/\//i.test(value) && /\.(png|jpe?g|webp)(\?|$)/i.test(value) ? value : undefined;
  if (Array.isArray(value)) {
    for (const item of value) {
      const found = findImageUrl(item);
      if (found) return found;
    }
    return undefined;
  }
  if (typeof value === "object") {
    const record = value as Record<string, unknown>;
    for (const key of ["url", "image", "image_url", "imageUrl", "output_url"]) {
      const found = findImageUrl(record[key]);
      if (found) return found;
    }
    for (const nested of Object.values(record)) {
      const found = findImageUrl(nested);
      if (found) return found;
    }
  }
  return undefined;
}

async function publicImageInput(assetId: string) {
  const asset = await getAsset(assetId);
  if (!asset) throw new ProviderError("MISSING_INPUT_ASSET", "图片素材不存在或已被删除。");
  const resolved = await resolveRemoteAsset(
    {
      localPath: asset.localPath,
      url: asset.url,
      filename: asset.originalName
    },
    "alibaba",
    "image-edit"
  );
  const audit = {
    inputImageSource: resolved.source,
    inputImageWidth: resolved.width,
    inputImageHeight: resolved.height,
    inputImageFileSize: resolved.fileSize,
    inputImageWasCompressed: resolved.wasCompressed ?? false
  };
  if (resolved.type === "base64") return { value: `data:${resolved.mimeType};base64,${resolved.base64}`, audit };
  if (resolved.url) return { value: resolved.url, audit };
  throw new ProviderError("PUBLIC_URL_REQUIRED", "当前阿里图片模型需要可访问图片 URL，请配置 BACKEND_PUBLIC_BASE_URL 或确认腾讯 COS 配置可用。");
}

export async function generateImageWithAlibaba(params: ImageProviderParams): Promise<ProviderGenerateResult> {
  if (!params.apiKey) throw new ProviderError("API_KEY_INVALID", "请先在设置中心配置该模型 API Key。");
  if (params.apiKey.includes("*")) throw new ProviderError("API_KEY_INVALID", "阿里百炼 API Key 读取到的是 maskedKey，请在设置中心重新填写完整 API Key。");

  console.log("[Alibaba Image] key check", {
    hasApiKey: Boolean(params.apiKey),
    keyPrefix: params.apiKey.slice(0, 7),
    keyLength: params.apiKey.length,
    modelName: params.modelName
  });

  const content: Array<Record<string, string>> = [];
  let inputAudit: Record<string, unknown> = {};
  if (params.inputMode === "image-edit" || params.inputMode === "image-to-image") {
    if (!params.imageAssetIds?.length) {
      throw new ProviderError("MISSING_INPUT_ASSET", params.inputMode === "image-edit" ? "图片编辑需要连接一张图片素材。" : "图生图需要连接一张图片素材。");
    }
    const imageInput = await publicImageInput(params.imageAssetIds[0]);
    content.push({ image: imageInput.value });
    inputAudit = imageInput.audit;
  }
  content.push({ text: params.prompt });
  const negativePrompt = buildNegativePrompt({ negativePrompt: params.negativePrompt, realismMode: params.realismMode });
  const mappedSize = mappedAlibabaImageSize(params.modelName, params.aspectRatio);

  const body = {
    model: params.modelName,
    input: {
      messages: [{ role: "user", content }]
    },
    parameters: {
      n: Math.max(1, params.generateCount || 1),
      watermark: false,
      ...(mappedSize ? { size: mappedSize } : {}),
      ...(negativePrompt ? { negative_prompt: negativePrompt } : {}),
      ...(params.seed !== undefined ? { seed: params.seed } : {})
    }
  };

  logOfficialPayload(
    buildPayloadSummary({
      providerId: "alibaba",
      selectedModelId: params.catalogModelId,
      actualModelName: params.modelName,
      inputMode: params.inputMode,
      aspectRatio: params.aspectRatio,
      mappedSize,
      quality: params.imageQuality,
      qualityMode: params.qualityMode ?? "full_quality",
      hasImageInput: Boolean(params.imageAssetIds?.length),
      imageInputCount: params.imageAssetIds?.length ?? 0,
      prompt: params.prompt,
      negativePrompt,
      isMock: false,
      qualityAudit: {
        qualityMode: params.qualityMode ?? "full_quality",
        negativePromptLength: negativePrompt.length,
        seed: params.seed,
        isFallback: false,
        ...inputAudit
      },
      payloadSummary: {
        endpointType: "dashscope.multimodal-generation",
        size: mappedSize,
        n: body.parameters.n,
        contentTypes: content.map((item) => Object.keys(item)[0])
      }
    })
  );

  try {
    const response = await fetch(normalizeDashScopeEndpoint(params.apiBaseUrl), {
      method: "POST",
      headers: {
        Authorization: `Bearer ${params.apiKey}`,
        "Content-Type": "application/json"
      },
      body: JSON.stringify(body)
    });

    if (!response.ok) throw classifyAlibabaError(await responseError(response));
    const json = await response.json();
    const imageUrl = findImageUrl(json);
    if (!imageUrl) throw new ProviderError("PROVIDER_ERROR", "阿里 Qwen Image 已返回结果，但没有找到可下载的图片 URL。", JSON.stringify(json));

    const saved = await downloadGeneratedFile(imageUrl, "image_alibaba");
    return {
      status: "success",
      outputUrl: saved.outputUrl,
      localPath: saved.localPath,
      rawResponse: json,
      payloadSummary: inputAudit
    };
  } catch (error) {
    if (error instanceof ProviderError) throw error;
    throw classifyAlibabaError(error);
  }
}
