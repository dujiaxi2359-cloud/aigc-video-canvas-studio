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

export async function generateImageWithZhipu(params: ImageProviderParams): Promise<ProviderGenerateResult> {
  if (!params.apiKey || params.apiKey.includes("*")) {
    throw new ProviderError("API_KEY_INVALID", "请在设置中心填写完整的智普 BigModel 官方 API Key。");
  }
  if (params.inputMode !== "text-to-image" || params.imageAssetIds?.length) {
    throw new ProviderError("MODEL_MODE_UNSUPPORTED", "智普官方 GLM-Image / CogView 当前图片生成接口仅支持文生图，请移除参考图片或改用支持图生图的模型。");
  }

  const endpoint = `${normalizeZhipuBaseUrl(params.apiBaseUrl)}/images/generations`;
  const body = {
    model: params.modelName,
    prompt: params.prompt,
    quality: params.modelName.toLowerCase() === "glm-image"
      ? "hd"
      : params.imageQuality === "high" || params.imageQuality === "hd" ? "hd" : "standard",
    size: zhipuImageSize(params),
    watermark_enabled: false
  };

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

  const text = await response.text();
  let payload: unknown;
  try {
    payload = text ? JSON.parse(text) : {};
  } catch {
    throw new ProviderError("PROVIDER_ERROR", `智普官方图片接口返回了非 JSON 内容（HTTP ${response.status}）。`, text.slice(0, 300));
  }
  if (!response.ok) {
    throw new ProviderError("PROVIDER_ERROR", `智普官方图片生成失败：${errorMessage(payload)}`, text.slice(0, 500), { upstreamStatus: response.status, endpoint });
  }

  const data = payload && typeof payload === "object" ? (payload as Record<string, unknown>).data : undefined;
  const first = Array.isArray(data) && data[0] && typeof data[0] === "object" ? data[0] as Record<string, unknown> : undefined;
  const imageUrl = typeof first?.url === "string" ? first.url : "";
  if (!imageUrl) throw new ProviderError("PROVIDER_ERROR", "智普官方图片接口成功响应中没有 data[0].url。", text.slice(0, 500));

  const saved = await downloadGeneratedFile(imageUrl, "image_zhipu");
  return {
    status: "success",
    outputUrl: saved.outputUrl,
    localPath: saved.localPath,
    rawResponse: payload,
    payloadSummary: { endpoint, model: params.modelName, size: body.size, quality: body.quality }
  };
}
