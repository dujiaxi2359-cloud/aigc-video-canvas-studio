import { downloadGeneratedFile } from "../../utils/downloadGeneratedFile.js";
import { ProviderError } from "../../utils/providerErrors.js";
import type { ImageProviderParams, ProviderGenerateResult } from "./providerTypes.js";
import { normalizeZhipuBaseUrl } from "./zhipuProtocol.js";

const glmImageSizes: Record<string, string> = {
  "1:1": "1280x1280",
  "4:3": "1472x1088",
  "3:4": "1088x1472",
  "16:9": "1728x960",
  "9:16": "960x1728"
};

const cogViewSizes: Record<string, string> = {
  "1:1": "1024x1024",
  "4:3": "1152x864",
  "3:4": "864x1152",
  "16:9": "1344x768",
  "9:16": "768x1344"
};

function zhipuImageSize(params: ImageProviderParams) {
  const requested = params.imageSize?.trim();
  if (requested && /^\d+x\d+$/i.test(requested)) return requested.toLowerCase();
  const sizes = params.modelName.toLowerCase() === "glm-image" ? glmImageSizes : cogViewSizes;
  return sizes[params.aspectRatio ?? "1:1"] ?? sizes["1:1"];
}

function errorMessage(payload: unknown) {
  if (!payload || typeof payload !== "object") return String(payload ?? "未知错误");
  const record = payload as Record<string, unknown>;
  const error = record.error && typeof record.error === "object" ? record.error as Record<string, unknown> : {};
  return String(record.message ?? record.error_message ?? error.message ?? record.error ?? "未知错误");
}

function cleanUrl(value: string) {
  return value.trim().replace(/^(?:POST|GET|PUT|PATCH|DELETE)\s+/i, "").replace(/\/+$/, "");
}

function unique(items: string[]) {
  return Array.from(new Set(items.filter(Boolean)));
}

export function zhipuImageGenerationEndpointCandidates(apiBaseUrl: string) {
  const clean = cleanUrl(apiBaseUrl);
  const base = normalizeZhipuBaseUrl(apiBaseUrl);
  const alternates = unique([
    `${base}/images/generations`,
    `${base}/async/images/generations`
  ]);
  if (/\/(?:async\/)?images\/generations$/i.test(clean)) {
    return unique([clean, ...alternates]);
  }
  return alternates;
}

function shouldTryNextImageEndpoint(response: Response, payload: unknown) {
  if (![400, 404, 405].includes(response.status)) return false;
  return /not found|route|path|endpoint|url|不存在|路径|接口/i.test(errorMessage(payload));
}

export async function generateImageWithZhipu(params: ImageProviderParams): Promise<ProviderGenerateResult> {
  if (!params.apiKey || params.apiKey.includes("*")) {
    throw new ProviderError("API_KEY_INVALID", "请在设置中心填写完整的智普 BigModel 官方 API Key。");
  }
  if (params.inputMode !== "text-to-image" || params.imageAssetIds?.length) {
    throw new ProviderError("MODEL_MODE_UNSUPPORTED", "智普官方 GLM-Image / CogView 当前图片生成接口仅支持文生图，请移除参考图片或改用支持图生图的模型。");
  }

  const body = {
    model: params.modelName,
    prompt: params.prompt,
    quality: params.modelName.toLowerCase() === "glm-image"
      ? "hd"
      : params.imageQuality === "high" || params.imageQuality === "hd" ? "hd" : "standard",
    size: zhipuImageSize(params),
    watermark_enabled: false
  };

  const endpoints = zhipuImageGenerationEndpointCandidates(params.apiBaseUrl);
  let lastEndpoint = endpoints[0]!;
  let lastText = "";
  let lastPayload: unknown = {};
  let lastStatus = 0;

  for (let index = 0; index < endpoints.length; index += 1) {
    const endpoint = endpoints[index]!;
    lastEndpoint = endpoint;
    let response: Response;
    try {
      response = await fetch(endpoint, {
        method: "POST",
        headers: {
          Authorization: `Bearer ${params.apiKey}`,
          "Content-Type": "application/json",
          Accept: "application/json"
        },
        body: JSON.stringify(body)
      });
    } catch (error) {
      throw new ProviderError("NETWORK_ERROR", "无法连接智普 BigModel 官方图片接口，请检查网络后重试。", error instanceof Error ? error.message : String(error));
    }

    lastStatus = response.status;
    lastText = await response.text();
    try {
      lastPayload = lastText ? JSON.parse(lastText) : {};
    } catch {
      if (index < endpoints.length - 1 && [400, 404, 405].includes(response.status)) continue;
      throw new ProviderError("PROVIDER_ERROR", `智普官方图片接口返回了非 JSON 内容（HTTP ${response.status}）。`, lastText.slice(0, 300), { endpoint });
    }
    if (!response.ok) {
      if (index < endpoints.length - 1 && shouldTryNextImageEndpoint(response, lastPayload)) continue;
      throw new ProviderError("PROVIDER_ERROR", `智普官方图片生成失败：${errorMessage(lastPayload)}`, lastText.slice(0, 500), { upstreamStatus: response.status, endpoint });
    }

    const data = lastPayload && typeof lastPayload === "object" ? (lastPayload as Record<string, unknown>).data : undefined;
    const first = Array.isArray(data) && data[0] && typeof data[0] === "object" ? data[0] as Record<string, unknown> : undefined;
    const imageUrl = typeof first?.url === "string" ? first.url : "";
    if (!imageUrl) throw new ProviderError("PROVIDER_ERROR", "智普官方图片接口成功响应中没有 data[0].url。", lastText.slice(0, 500), { endpoint });

    const saved = await downloadGeneratedFile(imageUrl, "image_zhipu");
    return {
      status: "success",
      outputUrl: saved.outputUrl,
      localPath: saved.localPath,
      rawResponse: lastPayload,
      payloadSummary: { endpoint, model: params.modelName, size: body.size, quality: body.quality }
    };
  }

  throw new ProviderError("PROVIDER_ERROR", `智普官方图片生成失败：${errorMessage(lastPayload)}`, lastText.slice(0, 500), { upstreamStatus: lastStatus, endpoint: lastEndpoint });
}
