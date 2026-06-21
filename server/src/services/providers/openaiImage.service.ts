import fs from "node:fs";
import { getAsset } from "../asset.service.js";
import { ensureAssetLocalFile } from "../assets/ensureAssetLocalFile.service.js";
import { downloadGeneratedFile, saveGeneratedBuffer } from "../../utils/downloadGeneratedFile.js";
import { aspectRatioToOpenAIImageSize } from "../../utils/imageAspectRatio.js";
import { ProviderError } from "../../utils/providerErrors.js";
import type { ImageProviderParams, ProviderGenerateResult } from "./providerTypes.js";

async function responseError(response: Response) {
  const text = await response.text();
  try {
    const json = JSON.parse(text) as { error?: { message?: string; type?: string; code?: string }; message?: string };
    return json.error?.message ?? json.message ?? text;
  } catch {
    return text;
  }
}

function humanOpenAIError(message: string) {
  const lower = message.toLowerCase();
  if (isUnsupportedResponseFormatError(message)) {
    return "当前图片中转不兼容 gpt-image-2 的图片格式参数，会把 output_format 错误转成旧参数 response_format。系统已尝试自动降级；如果仍失败，请在设置中心更换支持新版图片接口的中转线路。";
  }
  if (lower.includes("incorrect api key") || lower.includes("invalid api key") || lower.includes("unauthorized") || lower.includes("401")) {
    return "OpenAI API Key 无效。请确认你填写的是 platform.openai.com 创建的 API Key，不是 ChatGPT 登录账号、不是 Azure Key、不是其他中转平台 Key。";
  }
  if (lower.includes("insufficient_quota") || lower.includes("quota") || lower.includes("billing")) {
    return "OpenAI 账号额度不足或未开通计费，请检查余额、账单和模型权限。";
  }
  if (lower.includes("model") && (lower.includes("not found") || lower.includes("does not exist") || lower.includes("access"))) {
    return `OpenAI 图片模型不可用或没有权限：${message}`;
  }
  return `OpenAI 图片生成失败：${message}`;
}

function isUnsupportedResponseFormatError(message: string) {
  return /unknown parameter/i.test(message) && /response_format/i.test(message);
}

function assertUsableApiKey(apiKey: string) {
  if (!apiKey) throw new Error("请先在设置中心配置该模型 API Key");
  if (apiKey.includes("*")) {
    throw new Error("OpenAI API Key 读取到的是 maskedKey，请在设置中心重新填写完整 API Key。");
  }
}

function imageExtension(format?: string) {
  if (format === "jpeg") return ".jpg";
  if (format === "webp") return ".webp";
  return ".png";
}

async function saveOpenAIImage(json: unknown, format?: string): Promise<ProviderGenerateResult> {
  const result = json as { data?: Array<{ b64_json?: string; url?: string }> };
  const first = result.data?.[0];
  if (!first) throw new Error("OpenAI 图片接口没有返回图片数据。");

  if (first.b64_json) {
    const saved = await saveGeneratedBuffer({
      buffer: Buffer.from(first.b64_json, "base64"),
      prefix: "image_openai",
      extension: imageExtension(format)
    });
    return { status: "success", outputUrl: saved.outputUrl, localPath: saved.localPath, rawResponse: json };
  }

  if (first.url) {
    const saved = await downloadGeneratedFile(first.url, "image_openai");
    return { status: "success", outputUrl: saved.outputUrl, localPath: saved.localPath, rawResponse: json };
  }

  throw new Error("OpenAI 图片接口没有返回 b64_json 或 url。");
}

function applySharedImageParams(body: Record<string, unknown>, params: ImageProviderParams) {
  const n = Math.max(1, params.generateCount || 1);
  body.n = n;
  const mappedSize = params.aspectRatio ? aspectRatioToOpenAIImageSize(params.aspectRatio) : params.imageSize && params.imageSize !== "auto" ? params.imageSize : undefined;
  if (mappedSize) body.size = mappedSize;
  if (params.imageQuality && params.imageQuality !== "auto") body.quality = params.imageQuality;
  if (params.imageFormat && params.imageFormat !== "auto") body.output_format = params.imageFormat;
}

async function fetchOpenAIImageJson(input: {
  apiBaseUrl: string;
  apiKey: string;
  body: Record<string, unknown>;
}) {
  const request = async (body: Record<string, unknown>) => fetch(`${input.apiBaseUrl}/images/generations`, {
    method: "POST",
    headers: {
      Authorization: `Bearer ${input.apiKey}`,
      "Content-Type": "application/json"
    },
    body: JSON.stringify(body)
  });

  let response = await request(input.body);
  if (response.ok) return response.json();

  const message = await responseError(response);
  if (input.body.output_format && isUnsupportedResponseFormatError(message)) {
    const fallbackBody = { ...input.body };
    delete fallbackBody.output_format;
    console.warn("[OpenAI Image] relay rejected response_format; retrying without output_format", {
      modelName: fallbackBody.model,
      endpoint: "/images/generations"
    });
    response = await request(fallbackBody);
    if (response.ok) return response.json();
    throw new Error(humanOpenAIError(await responseError(response)));
  }

  throw new Error(humanOpenAIError(message));
}

function buildImageEditForm(params: ImageProviderParams, options: { omitOutputFormat?: boolean } = {}) {
  const form = new FormData();
  form.set("model", params.modelName);
  form.set("prompt", params.prompt);
  const mappedSize = params.aspectRatio ? aspectRatioToOpenAIImageSize(params.aspectRatio) : params.imageSize && params.imageSize !== "auto" ? params.imageSize : undefined;
  if (mappedSize) form.set("size", mappedSize);
  if (params.imageQuality && params.imageQuality !== "auto") form.set("quality", params.imageQuality);
  if (!options.omitOutputFormat && params.imageFormat && params.imageFormat !== "auto") form.set("output_format", params.imageFormat);
  form.set("n", String(Math.max(1, params.generateCount || 1)));
  return form;
}

async function appendImageEditAssets(form: FormData, assetIds: string[]) {
  for (const assetId of assetIds.slice(0, 16)) {
    const asset = await ensureAssetLocalFile(await getAsset(assetId), "OpenAI 图片编辑引用的图片素材");
    const buffer = fs.readFileSync(asset.localPath);
    const blob = new Blob([buffer]);
    form.append("image", blob, asset.originalName);
  }
}

async function fetchOpenAIImageEditJson(input: {
  apiBaseUrl: string;
  apiKey: string;
  params: ImageProviderParams;
}) {
  const request = async (omitOutputFormat = false) => {
    const form = buildImageEditForm(input.params, { omitOutputFormat });
    await appendImageEditAssets(form, input.params.imageAssetIds ?? []);
    return fetch(`${input.apiBaseUrl}/images/edits`, {
      method: "POST",
      headers: { Authorization: `Bearer ${input.apiKey}` },
      body: form
    });
  };

  let response = await request(false);
  if (response.ok) return response.json();

  const message = await responseError(response);
  if (input.params.imageFormat && input.params.imageFormat !== "auto" && isUnsupportedResponseFormatError(message)) {
    console.warn("[OpenAI Image] relay rejected response_format; retrying edit without output_format", {
      modelName: input.params.modelName,
      endpoint: "/images/edits"
    });
    response = await request(true);
    if (response.ok) return response.json();
    throw new Error(humanOpenAIError(await responseError(response)));
  }

  throw new Error(humanOpenAIError(message));
}

export async function generateImageWithOpenAI(params: ImageProviderParams): Promise<ProviderGenerateResult> {
  assertUsableApiKey(params.apiKey);

  console.log("[OpenAI Image] key check", {
    hasApiKey: Boolean(params.apiKey),
    keyPrefix: params.apiKey ? params.apiKey.slice(0, 7) : null,
    keyLength: params.apiKey ? params.apiKey.length : 0,
    modelName: params.modelName
  });

  const apiBaseUrl = (params.apiBaseUrl || "https://api.openai.com/v1").replace(/\/$/, "");

  if (params.inputMode === "text-to-image") {
    const body: Record<string, unknown> = {
      model: params.modelName,
      prompt: params.prompt
    };
    applySharedImageParams(body, params);

    return saveOpenAIImage(await fetchOpenAIImageJson({ apiBaseUrl, apiKey: params.apiKey, body }), params.imageFormat);
  }

  if (!params.imageAssetIds?.length) {
    throw new ProviderError("MISSING_INPUT_ASSET", "OpenAI 图片编辑需要连接至少一张图片素材。");
  }

  return saveOpenAIImage(await fetchOpenAIImageEditJson({ apiBaseUrl, apiKey: params.apiKey, params }), params.imageFormat);
}
