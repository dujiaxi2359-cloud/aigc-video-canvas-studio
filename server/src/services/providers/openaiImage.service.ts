import fs from "node:fs";
import { getAsset } from "../asset.service.js";
import { ensureAssetLocalFile } from "../assets/ensureAssetLocalFile.service.js";
import { saveGenerationTask } from "../generationTask.service.js";
import { downloadGeneratedFile, saveGeneratedBuffer } from "../../utils/downloadGeneratedFile.js";
import { aspectRatioToOpenAIImageSize } from "../../utils/imageAspectRatio.js";
import { extractImagePayload, summarizeImageResponseShape } from "../../utils/imageResponseExtractor.js";
import { ProviderError } from "../../utils/providerErrors.js";
import type { ImageProviderParams, ProviderGenerateResult } from "./providerTypes.js";
import {
  ensureOpenAiCompatibleConfig,
  openAiCompatibleHeaders,
  readRawResponse,
  resolveOpenAiCompatibleEndpoint,
  throwOpenAiCompatibleHttpError,
  classifyOpenAiCompatibleProviderErrorCode
} from "./openaiCompatibleProtocol.js";

type JsonRecord = Record<string, unknown>;

const OPENAI_IMAGE_PENDING_STATUSES = new Set(["created", "queued", "pending", "submitted", "running", "processing", "in_progress"]);
const OPENAI_IMAGE_FAILURE_STATUSES = new Set(["failed", "failure", "error", "cancelled", "canceled"]);

async function responseError(response: Response) {
  const text = await response.text();
  try {
    const json = JSON.parse(text) as { error?: { message?: string; type?: string; code?: string }; message?: string };
    return json.error?.message ?? json.error?.code ?? json.error?.type ?? json.message ?? text;
  } catch {
    return text;
  }
}

async function responseJson(response: Response, endpoint: string) {
  const text = await response.text();
  try {
    return JSON.parse(text) as unknown;
  } catch {
    const preview = text.replace(/\s+/g, " ").trim().slice(0, 220);
    throw openAIImageProviderError(`OPENAI_COMPAT_NON_JSON_RESPONSE endpoint=${endpoint} status=${response.status} body=${preview}`);
  }
}

function openAIImageProviderError(message: string, details?: Record<string, unknown>) {
  const errorMessage = humanOpenAIError(message);
  return new ProviderError(classifyOpenAiCompatibleProviderErrorCode(message), errorMessage, message, details);
}

function humanOpenAIError(message: string) {
  const lower = message.toLowerCase();
  if (/safety system|safety[_\s-]?violations|content policy|policy violation|moderation|blocked|rejected by the safety/i.test(message)) {
    const requestId = message.match(/request id\s+([a-z0-9-]+)/i)?.[1];
    return `OpenAI 官方安全审核拒绝了这次图片请求${requestId ? `（request_id: ${requestId}）` : ""}。这不是画布或前端故障，请调整提示词中的人物、隐私、暴力、敏感或高风险描述后重试。`;
  }
  if (/openai_compat_non_json_response/i.test(message) || /^<!doctype|<html/i.test(message.trim())) {
    if (/cloudflare|error 524|a timeout occurred/i.test(message)) {
      return "OpenAI 兼容图片中转返回 Cloudflare 超时页面，说明该线路上游生成耗时过长或服务不可用。请稍后重试，或在设置中心切换其它图片中转线路。";
    }
    return "OpenAI 兼容图片中转返回了 HTML 页面，不是 JSON 数据。通常是中转地址路径不对、网关/鉴权页、余额页、404/502 页面或线路被 Cloudflare 拦截。请检查该模型的 API Base URL、Key 和中转线路。";
  }
  if (isUnsupportedResponseFormatError(message)) {
    return "当前图片中转不兼容 gpt-image-2 的图片格式参数，会把 output_format 错误转成旧参数 response_format。系统已尝试自动降级；如果仍失败，请在设置中心更换支持新版图片接口的中转线路。";
  }
  if (/cloudflare.*524|error code 524|a timeout occurred|origin web server timed out/i.test(message)) {
    return "OpenAI 图片中转上游响应超时，请稍后重试或切换其它图片线路。";
  }
  if (/method not allowed|not found|\b404\b|\b405\b/i.test(message)) {
    return `OpenAI 兼容图片中转不支持当前图片接口路径或方法：${message}。系统会优先尝试其它可用图片线路；如果仍失败，请在设置中心切换到支持该输入模式的中转。`;
  }
  if (/please wait and try again later|try again later|temporarily unavailable|service busy|fully loaded/i.test(message)) {
    return "OpenAI 图片中转暂时繁忙，请稍后重试或切换其它图片线路。";
  }
  if (/^(openai_error|upstream_error|provider_error)$/i.test(message.trim())) {
    return `OpenAI 图片中转上游返回通用错误（${message.trim()}），中转没有给出更具体原因。通常是该线路上游临时失败、模型通道异常或素材转发失败；请稍后重试，或切换其它图片线路。`;
  }
  if (/无可用渠道|可用渠道不存在|所有分组.*模型|当前分组.*模型|no available channel/i.test(message)) {
    return `中转当前分组没有该模型的可用渠道：${message}`;
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

function isUnsupportedSizeError(message: string) {
  return /invalid.*size|size must be one of|unsupported.*size|invalid_value/i.test(message) && /size/i.test(message);
}

function fallbackImageSize(size?: unknown) {
  if (size === "2160x3840") return "1080x1920";
  if (size === "1080x1920") return "720x1280";
  if (size === "3840x2160") return "1920x1080";
  if (size === "1920x1080") return "1280x720";
  if (size === "2880x2160") return "2048x1536";
  if (size === "2048x1536") return "1365x1024";
  if (size === "2160x2880") return "1536x2048";
  if (size === "1536x2048") return "1024x1365";
  if (size === "2048x2048") return "1024x1024";
  return undefined;
}

function isGptImage2AllModel(modelName?: string) {
  return /gpt[-_ .]?image[-_ .]?2[-_ .]?all/i.test(modelName ?? "");
}

export function openAIImageRequestModel(modelName: string) {
  return isGptImage2AllModel(modelName) ? "gpt-image-2-all" : modelName;
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

function apiBaseHost(apiBaseUrl: string) {
  try {
    return new URL(apiBaseUrl).hostname.toLowerCase();
  } catch {
    return "";
  }
}

function isOfficialOpenAIBase(apiBaseUrl: string) {
  const host = apiBaseHost(apiBaseUrl);
  return host === "api.openai.com";
}

function shouldUseJsonImageGenerationForEdit(apiBaseUrl: string, modelName: string, capabilities?: ImageProviderParams["capabilities"]) {
  if (isOfficialOpenAIBase(apiBaseUrl)) return false;
  const config = capabilities?.openaiCompatibleConfig;
  if (config?.imageGenerationEndpoint && config.imageGenerationEndpoint === config.imageEditEndpoint) return true;
  return /gpt-image-2|grok-4-2-image|jimen|doubao-seedream/i.test(modelName);
}

function asRecord(value: unknown): JsonRecord | undefined {
  return value && typeof value === "object" && !Array.isArray(value) ? value as JsonRecord : undefined;
}

function openAIImageTaskCandidates(payload: unknown) {
  const root = asRecord(payload);
  const data = root?.data;
  const firstData = Array.isArray(data) ? data[0] : data;
  const output = asRecord(firstData)?.output ?? root?.output;
  const result = asRecord(firstData)?.result ?? root?.result;
  return [payload, firstData, output, result].map(asRecord).filter(Boolean) as JsonRecord[];
}

export function openAIImageTaskId(payload: unknown) {
  for (const candidate of openAIImageTaskCandidates(payload)) {
    const value = candidate.task_id ?? candidate.taskId ?? candidate.generation_id ?? candidate.generationId ?? candidate.request_id ?? candidate.requestId ?? candidate.id;
    if (typeof value === "string" && value.trim()) return value.trim();
  }
  return undefined;
}

export function openAIImageTaskStatus(payload: unknown) {
  for (const candidate of openAIImageTaskCandidates(payload)) {
    const value = candidate.status ?? candidate.state ?? candidate.task_status ?? candidate.taskStatus;
    if (typeof value === "string" && value.trim()) return value.trim().toLowerCase();
  }
  return "";
}

function openAIImageTaskMessage(payload: unknown) {
  for (const candidate of openAIImageTaskCandidates(payload)) {
    const error = asRecord(candidate.error);
    for (const value of [candidate.message, candidate.error_message, candidate.fail_reason, error?.message, error?.detail]) {
      if (typeof value === "string" && value.trim()) return value.trim();
    }
  }
  return "";
}

async function saveOpenAIImage(json: unknown, format: string | undefined, context: { endpoint: string; modelName: string; nodeId?: string }): Promise<ProviderGenerateResult> {
  const image = extractImagePayload(json);
  if (!image) {
    const taskId = openAIImageTaskId(json);
    const taskStatus = openAIImageTaskStatus(json);
    if (OPENAI_IMAGE_FAILURE_STATUSES.has(taskStatus)) {
      throw new ProviderError("PROVIDER_ERROR", `OpenAI 图片任务失败：${openAIImageTaskMessage(json) || taskStatus}`, undefined, json);
    }
    if (taskId && (OPENAI_IMAGE_PENDING_STATUSES.has(taskStatus) || !taskStatus)) {
      await saveGenerationTask({
        id: taskId,
        status: taskStatus || "processing",
        result: {
          provider: "openai-image",
          endpoint: context.endpoint,
          nodeId: context.nodeId,
          modelName: context.modelName,
          response: json
        }
      });
      return {
        status: "processing",
        rawResponse: json,
        payloadSummary: {
          provider: "openai-image",
          endpoint: context.endpoint,
          taskId,
          taskStatus: taskStatus || "processing",
          model: context.modelName,
          message: "上游图片任务已提交，当前仍在生成中。"
        }
      };
    }
    throw new Error(`OpenAI 图片接口没有返回可识别的图片字段（已检查 b64_json、url、image_url、output_url、base64 等）。返回结构：${summarizeImageResponseShape(json)}`);
  }

  if (image.type === "base64") {
    const saved = await saveGeneratedBuffer({
      buffer: Buffer.from(image.value, "base64"),
      prefix: "image_openai",
      extension: imageExtension(format),
      contentType: image.mimeType
    });
    return { status: "success", outputUrl: saved.outputUrl, localPath: saved.localPath, rawResponse: json, payloadSummary: { imageResponsePath: image.sourcePath } };
  }

  const saved = await downloadGeneratedFile(image.value, "image_openai");
  return { status: "success", outputUrl: saved.outputUrl, localPath: saved.localPath, rawResponse: json, payloadSummary: { imageResponsePath: image.sourcePath } };
}

function applySharedImageParams(body: Record<string, unknown>, params: ImageProviderParams) {
  const n = Math.max(1, params.generateCount || 1);
  body.n = n;
  if (isGptImage2AllModel(params.modelName)) {
    body.size = "1024x1024";
    delete body.quality;
    delete body.output_format;
    return;
  }
  const mappedSize = params.aspectRatio ? aspectRatioToOpenAIImageSize(params.aspectRatio, params.modelName, params.imageSize) : params.imageSize && params.imageSize !== "auto" ? params.imageSize : undefined;
  if (mappedSize) body.size = mappedSize;
  if (params.imageQuality && params.imageQuality !== "auto") body.quality = params.imageQuality;
  if (params.imageFormat && params.imageFormat !== "auto") body.output_format = params.imageFormat;
}

function assertOpenAIImageGenerationBody(body: Record<string, unknown>, params: ImageProviderParams) {
  const forbidden = ["image", "images", "image_url", "input_image", "mask", "contents", "parts", "inlineData", "duration", "ratio", "aspect_ratio", "video", "files"];
  const present = forbidden.filter((key) => body[key] !== undefined);
  if (params.inputMode === "text-to-image" && params.imageAssetIds?.length) present.push("imageAssetIds");
  if (present.length) {
    throw new ProviderError(
      "CAPABILITY_MISMATCH",
      "当前模型是文生图模型，不支持参考图输入，请切换 image_edit 模型或移除参考图。",
      undefined,
      { model: params.modelName, forbiddenFields: Array.from(new Set(present)) }
    );
  }
}

async function imageAssetBase64(assetIds: string[], withDataUrl = false) {
  const images: string[] = [];
  for (const assetId of assetIds.slice(0, 16)) {
    const asset = await ensureAssetLocalFile(await getAsset(assetId), "OpenAI 图片中转引用的图片素材");
    const base64 = fs.readFileSync(asset.localPath).toString("base64");
    if (withDataUrl) {
      images.push(`data:${asset.mimeType || "image/png"};base64,${base64}`);
    } else {
      images.push(base64);
    }
  }
  return images;
}

async function fetchOpenAIImageJson(input: {
  apiBaseUrl: string;
  apiKey: string;
  params: ImageProviderParams;
  body: Record<string, unknown>;
}) {
  const config = ensureOpenAiCompatibleConfig(input.params.capabilities ?? { inputModes: ["text-to-image"] }, "image");
  const endpoint = resolveOpenAiCompatibleEndpoint({
    baseUrl: input.apiBaseUrl,
    endpoint: config.imageGenerationEndpoint,
    defaultEndpoint: "/v1/images/generations",
    modelId: openAIImageRequestModel(input.params.modelName),
    queryParams: config.queryParams
  });
  const request = async (body: Record<string, unknown>) => fetch(endpoint, {
    method: "POST",
    headers: openAiCompatibleHeaders({ apiKey: input.apiKey, config }),
    body: JSON.stringify(body)
  });

  let response = await request(input.body);
  if (response.ok) return responseJson(response, endpoint);

  const message = await responseError(response);
  const fallbackSize = fallbackImageSize(input.body.size);
  if (fallbackSize && isUnsupportedSizeError(message)) {
    const fallbackBody: Record<string, unknown> = { ...input.body, size: fallbackSize };
    console.warn("[OpenAI Image] relay rejected high-resolution size; retrying with compatible size", {
      modelName: fallbackBody.model,
      endpoint,
      rejectedSize: input.body.size,
      fallbackSize
    });
    response = await request(fallbackBody);
    if (response.ok) return responseJson(response, endpoint);
    const { text, payload } = await readRawResponse(response);
    throwOpenAiCompatibleHttpError({ label: "OpenAI 兼容图片生成", endpoint, status: response.status, payload, text });
  }
  if (input.body.output_format && isUnsupportedResponseFormatError(message)) {
    const fallbackBody = { ...input.body };
    delete fallbackBody.output_format;
    console.warn("[OpenAI Image] relay rejected response_format; retrying without output_format", {
      modelName: fallbackBody.model,
      endpoint
    });
    response = await request(fallbackBody);
    if (response.ok) return responseJson(response, endpoint);
    const { text, payload } = await readRawResponse(response);
    throwOpenAiCompatibleHttpError({ label: "OpenAI 兼容图片生成", endpoint, status: response.status, payload, text });
  }

  throw openAIImageProviderError(message, {
    endpoint,
    requestBodyModel: input.body.model,
    requestBodyKeys: Object.keys(input.body)
  });
}

async function fetchOpenAICompatJsonImageEdit(input: {
  apiBaseUrl: string;
  apiKey: string;
  params: ImageProviderParams;
}) {
  const config = ensureOpenAiCompatibleConfig(input.params.capabilities ?? { inputModes: ["image-edit"] }, "image");
  const endpoint = resolveOpenAiCompatibleEndpoint({
    baseUrl: input.apiBaseUrl,
    endpoint: config.imageGenerationEndpoint,
    defaultEndpoint: "/v1/images/generations",
    modelId: input.params.modelName,
    queryParams: config.queryParams
  });
  const buildBody = async (withDataUrl = false, sizeOverride?: string) => {
    const body: Record<string, unknown> = {
      model: openAIImageRequestModel(input.params.modelName),
      prompt: input.params.prompt,
      image: await imageAssetBase64(input.params.imageAssetIds ?? [], withDataUrl)
    };
    applySharedImageParams(body, input.params);
    if (sizeOverride) body.size = sizeOverride;
    return body;
  };
  const request = async (body: Record<string, unknown>) => fetch(endpoint, {
    method: "POST",
    headers: openAiCompatibleHeaders({ apiKey: input.apiKey, config }),
    body: JSON.stringify(body)
  });

  let body = await buildBody(false);
  let response = await request(body);
  if (response.ok) return responseJson(response, endpoint);

  let message = await responseError(response);
  const requestedSize = input.params.aspectRatio ? aspectRatioToOpenAIImageSize(input.params.aspectRatio, input.params.modelName, input.params.imageSize) : input.params.imageSize;
  const fallbackSize = fallbackImageSize(requestedSize);
  if (fallbackSize && isUnsupportedSizeError(message)) {
    body = await buildBody(false, fallbackSize);
    response = await request(body);
    if (response.ok) return responseJson(response, endpoint);
    message = await responseError(response);
  }

  if (/image|base64|invalid|unsupported|format/i.test(message)) {
    const dataUrlBody = await buildBody(true, fallbackSize);
    response = await request(dataUrlBody);
    if (response.ok) return responseJson(response, endpoint);
    message = await responseError(response);
  }

  throw openAIImageProviderError(message, {
    endpoint,
    requestBodyModel: input.params.modelName,
    requestBodyKeys: Object.keys(body)
  });
}

function buildImageEditForm(params: ImageProviderParams, options: { omitOutputFormat?: boolean; sizeOverride?: string } = {}) {
  const form = new FormData();
  form.set("model", params.modelName);
  form.set("prompt", params.prompt);
  const mappedSize = options.sizeOverride ?? (params.aspectRatio ? aspectRatioToOpenAIImageSize(params.aspectRatio, params.modelName, params.imageSize) : params.imageSize && params.imageSize !== "auto" ? params.imageSize : undefined);
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
  const config = ensureOpenAiCompatibleConfig(input.params.capabilities ?? { inputModes: ["image-edit"] }, "image");
  const endpoint = resolveOpenAiCompatibleEndpoint({
    baseUrl: input.apiBaseUrl,
    endpoint: config.imageEditEndpoint,
    defaultEndpoint: "/v1/images/edits",
    modelId: input.params.modelName,
    queryParams: config.queryParams
  });
  const request = async (omitOutputFormat = false, sizeOverride?: string) => {
    const form = buildImageEditForm(input.params, { omitOutputFormat, sizeOverride });
    await appendImageEditAssets(form, input.params.imageAssetIds ?? []);
    return fetch(endpoint, {
      method: "POST",
      headers: openAiCompatibleHeaders({ apiKey: input.apiKey, config, includeContentType: false }),
      body: form
    });
  };

  let response = await request(false);
  if (response.ok) return responseJson(response, endpoint);

  const message = await responseError(response);
  const requestedSize = input.params.aspectRatio ? aspectRatioToOpenAIImageSize(input.params.aspectRatio, input.params.modelName, input.params.imageSize) : input.params.imageSize;
  const fallbackSize = fallbackImageSize(requestedSize);
  if (fallbackSize && isUnsupportedSizeError(message)) {
    console.warn("[OpenAI Image] relay rejected high-resolution edit size; retrying with compatible size", {
      modelName: input.params.modelName,
      endpoint,
      rejectedSize: requestedSize,
      fallbackSize
    });
    response = await request(false, fallbackSize);
    if (response.ok) return responseJson(response, endpoint);
    const { text, payload } = await readRawResponse(response);
    throwOpenAiCompatibleHttpError({ label: "OpenAI 兼容图片编辑", endpoint, status: response.status, payload, text });
  }
  if (input.params.imageFormat && input.params.imageFormat !== "auto" && isUnsupportedResponseFormatError(message)) {
    console.warn("[OpenAI Image] relay rejected response_format; retrying edit without output_format", {
      modelName: input.params.modelName,
      endpoint
    });
    response = await request(true);
    if (response.ok) return responseJson(response, endpoint);
    const { text, payload } = await readRawResponse(response);
    throwOpenAiCompatibleHttpError({ label: "OpenAI 兼容图片编辑", endpoint, status: response.status, payload, text });
  }

  throw openAIImageProviderError(message, {
    endpoint,
    requestBodyModel: input.params.modelName,
    requestBodyKeys: ["model", "prompt", "image", "size", "quality", "output_format", "n"]
  });
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
      model: openAIImageRequestModel(params.modelName),
      prompt: params.prompt
    };
    applySharedImageParams(body, params);
    assertOpenAIImageGenerationBody(body, params);

    return saveOpenAIImage(await fetchOpenAIImageJson({ apiBaseUrl, apiKey: params.apiKey, params, body }), params.imageFormat, {
      endpoint: "/images/generations",
      modelName: params.modelName,
      nodeId: params.nodeId
    });
  }

  if (!params.imageAssetIds?.length) {
    throw new ProviderError("MISSING_INPUT_ASSET", "OpenAI 图片编辑需要连接至少一张图片素材。");
  }

  if (shouldUseJsonImageGenerationForEdit(apiBaseUrl, params.modelName, params.capabilities)) {
    return saveOpenAIImage(await fetchOpenAICompatJsonImageEdit({ apiBaseUrl, apiKey: params.apiKey, params }), params.imageFormat, {
      endpoint: "/images/generations",
      modelName: params.modelName,
      nodeId: params.nodeId
    });
  }

  return saveOpenAIImage(await fetchOpenAIImageEditJson({ apiBaseUrl, apiKey: params.apiKey, params }), params.imageFormat, {
    endpoint: "/images/edits",
    modelName: params.modelName,
    nodeId: params.nodeId
  });
}
