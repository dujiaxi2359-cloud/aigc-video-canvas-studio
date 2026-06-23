import { getAsset } from "../asset.service.js";
import { resolveRemoteAsset } from "../assets/resolveRemoteAsset.service.js";
import { saveGenerationTask } from "../generationTask.service.js";
import { downloadGeneratedFile } from "../../utils/downloadGeneratedFile.js";
import { ProviderError, rawErrorMessage } from "../../utils/providerErrors.js";
import type { ImageProviderParams, ProviderGenerateResult } from "./providerTypes.js";

type JsonRecord = Record<string, unknown>;

const SUCCESS_STATUSES = new Set(["completed", "complete", "succeeded", "success", "done"]);
const FAILURE_STATUSES = new Set(["failed", "failure", "error", "cancelled", "canceled"]);

export function isMidjourneyImageModel(input: {
  providerId?: string;
  modelName?: string;
  displayName?: string;
  apiBaseUrl?: string;
}) {
  return /midjourney|mid-journey|\bmj\b/i.test([
    input.providerId,
    input.modelName,
    input.displayName
  ].filter(Boolean).join(" "));
}

function midjourneyRoot(apiBaseUrl?: string) {
  const raw = (apiBaseUrl || "https://api.apimart.ai").trim().replace(/\/+$/, "");
  return raw
    .replace(/\/v1\/midjourney\/generations(?:\/imagine|\/edits)?$/i, "")
    .replace(/\/v1\/midjourney\/(?:imagine|edits)$/i, "")
    .replace(/\/mj\/submit\/(?:imagine|blend|describe)$/i, "")
    .replace(/\/v1\/midjourney$/i, "")
    .replace(/\/v1$/i, "");
}

function uniqueStrings(values: string[]) {
  return [...new Set(values.filter(Boolean))];
}

export function midjourneyCreateEndpointCandidates(apiBaseUrl: string | undefined, inputMode: ImageProviderParams["inputMode"]) {
  const root = midjourneyRoot(apiBaseUrl);
  const raw = (apiBaseUrl || "").trim().replace(/\/+$/, "");
  const suppliedEndpoint = /\/(?:v1\/midjourney\/(?:generations(?:\/imagine|\/edits)?|imagine|edits)|mj\/submit\/(?:imagine|blend|describe))$/i.test(raw)
    ? raw
    : "";
  if (inputMode === "image-edit") {
    const editEndpoint = suppliedEndpoint
      ? suppliedEndpoint
        .replace(/\/v1\/midjourney\/generations(?:\/imagine)?$/i, "/v1/midjourney/generations/edits")
        .replace(/\/v1\/midjourney\/imagine$/i, "/v1/midjourney/edits")
      : "";
    return uniqueStrings([
      editEndpoint,
      `${root}/v1/midjourney/generations/edits`,
      `${root}/v1/midjourney/generations`,
      `${root}/v1/midjourney/edits`,
      `${root}/mj/submit/imagine`
    ]);
  }
  return uniqueStrings([
    suppliedEndpoint,
    `${root}/v1/midjourney/generations`,
    `${root}/v1/midjourney/generations/imagine`,
    `${root}/v1/midjourney/imagine`,
    `${root}/mj/submit/imagine`
  ]);
}

export function midjourneyCreateEndpoint(apiBaseUrl: string | undefined, inputMode: ImageProviderParams["inputMode"]) {
  return midjourneyCreateEndpointCandidates(apiBaseUrl, inputMode)[0]!;
}

export function midjourneyPollEndpoints(apiBaseUrl: string | undefined, taskId: string) {
  const root = midjourneyRoot(apiBaseUrl);
  const encoded = encodeURIComponent(taskId);
  return [`${root}/v1/tasks/${encoded}`, `${root}/v1/midjourney/${encoded}`];
}

function asRecord(value: unknown): JsonRecord | undefined {
  return value && typeof value === "object" && !Array.isArray(value) ? value as JsonRecord : undefined;
}

function nestedCandidates(payload: unknown) {
  const root = asRecord(payload);
  const data = root?.data;
  const firstData = Array.isArray(data) ? data[0] : data;
  const result = asRecord(firstData)?.result ?? root?.result;
  const output = asRecord(firstData)?.output ?? root?.output;
  return [payload, firstData, result, output].map(asRecord).filter(Boolean) as JsonRecord[];
}

export function midjourneyTaskId(payload: unknown) {
  for (const candidate of nestedCandidates(payload)) {
    const value = candidate.task_id ?? candidate.taskId ?? candidate.id;
    if (typeof value === "string" && value.trim()) return value.trim();
  }
  return undefined;
}

export function midjourneyTaskStatus(payload: unknown) {
  for (const candidate of nestedCandidates(payload)) {
    const value = candidate.status ?? candidate.state ?? candidate.task_status;
    if (typeof value === "string" && value.trim()) return value.trim().toLowerCase();
  }
  return "";
}

function stringArray(value: unknown) {
  if (!Array.isArray(value)) return [];
  return value.filter((item): item is string => typeof item === "string" && /^https?:\/\//i.test(item));
}

export function midjourneyResultUrl(payload: unknown) {
  for (const candidate of nestedCandidates(payload)) {
    const grid = candidate.grid_image_url ?? candidate.gridImageUrl;
    if (typeof grid === "string" && /^https?:\/\//i.test(grid)) return grid;
  }
  for (const candidate of nestedCandidates(payload)) {
    const urls = stringArray(candidate.image_urls ?? candidate.imageUrls ?? candidate.images);
    if (urls[0]) return urls[0];
    for (const key of ["image_url", "imageUrl", "output_url", "outputUrl", "url"] as const) {
      const value = candidate[key];
      if (typeof value === "string" && /^https?:\/\//i.test(value)) return value;
    }
  }
  return undefined;
}

function errorMessage(payload: unknown) {
  for (const candidate of nestedCandidates(payload)) {
    const error = asRecord(candidate.error);
    for (const value of [candidate.fail_reason, candidate.error_message, candidate.message, error?.message, error?.detail]) {
      if (typeof value === "string" && value.trim()) return value.trim();
    }
  }
  try {
    return JSON.stringify(payload);
  } catch {
    return String(payload);
  }
}

function applicationError(payload: unknown) {
  const root = asRecord(payload);
  const code = root?.code;
  return typeof code === "number" && code !== 0 && code !== 200;
}

async function responseJson(response: Response) {
  const text = await response.text();
  if (!text) return {};
  try {
    return JSON.parse(text) as unknown;
  } catch {
    return { message: text };
  }
}

function throwResponseError(response: Response, payload: unknown, stage: string): never {
  const detail = errorMessage(payload);
  if (response.status === 401) throw new ProviderError("API_KEY_INVALID", "Midjourney API Key 无效。", detail, payload);
  if (response.status === 402 || /quota|credit|balance|insufficient|余额|额度/i.test(detail)) {
    throw new ProviderError("UPSTREAM_QUOTA_EXHAUSTED", "额度不足", detail, payload);
  }
  if (response.status === 403) throw new ProviderError("MODEL_ACCESS_DENIED", "当前 API Key 没有 Midjourney 模型权限。", detail, payload);
  if (response.status === 422) throw new ProviderError("MODEL_PARAM_UNSUPPORTED", `Midjourney ${stage}参数不被接口接受。`, detail, payload);
  if (response.status === 429) throw new ProviderError("PROVIDER_ERROR", "Midjourney 请求过于频繁，请稍后重试。", detail, payload);
  throw new ProviderError("PROVIDER_ERROR", `Midjourney ${stage}失败：${detail}`, `${response.status} ${detail}`, payload);
}

function shouldTryNextCreateEndpoint(response: Response, payload: unknown) {
  const detail = errorMessage(payload);
  if (/quota|credit|balance|insufficient|余额|额度|unauthorized|invalid api key|incorrect api key|forbidden|permission|access denied|无权限/i.test(detail)) return false;
  if ([404, 405].includes(response.status)) return true;
  if ([400, 422].includes(response.status) && /route|path|endpoint|not found|cannot\s+(post|get)|method not allowed|unsupported.*endpoint|no route|路径|接口|不存在|不支持/i.test(detail)) return true;
  return false;
}

function sleep(ms: number) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

async function resolveImageUrls(params: ImageProviderParams) {
  const urls: string[] = [];
  for (const assetId of (params.imageAssetIds ?? []).slice(0, 16)) {
    const asset = await getAsset(assetId);
    if (!asset) throw new ProviderError("ASSET_FILE_NOT_FOUND", "Midjourney 引用的图片素材不存在，请重新上传。", assetId);
    const resolved = await resolveRemoteAsset(asset, "midjourney", "image-reference", {
      strategy: { supportsPublicUrl: true, supportsBase64: true, supportsMultipart: false, prefer: "publicUrl" },
      signedUrlExpiresSeconds: 2 * 60 * 60
    });
    if (resolved.url) urls.push(resolved.url);
    else if (resolved.base64) urls.push(`data:${resolved.mimeType};base64,${resolved.base64}`);
  }
  return urls;
}

function buildRequestBody(params: ImageProviderParams, imageUrls: string[]) {
  const prompt = imageUrls.length
    ? params.prompt.replace(/@(?:素材|图片|图像|参考图)\s*(\d+)/gi, "参考图$1")
    : params.prompt;
  const body: JsonRecord = {
    prompt,
    metadata: {
      project_id: params.projectId,
      node_id: params.nodeId,
      input_mode: params.inputMode
    }
  };
  if (imageUrls.length) body.image_urls = imageUrls;
  if (params.aspectRatio && params.aspectRatio !== "auto") body.size = params.aspectRatio;
  if (params.negativePrompt?.trim()) body.negative_prompt = params.negativePrompt.trim();
  if (typeof params.seed === "number") body.seed = params.seed;
  if (params.qualityMode === "fast") body.speed = "fast";
  if (params.generateCount > 1) body.repeat = Math.min(4, Math.max(1, params.generateCount));
  return body;
}

async function pollTask(params: ImageProviderParams, taskId: string, initial: unknown) {
  const endpoints = midjourneyPollEndpoints(params.apiBaseUrl, taskId);
  let activeEndpoint = endpoints[0]!;
  let task = initial;
  const startedAt = Date.now();

  while (!SUCCESS_STATUSES.has(midjourneyTaskStatus(task))) {
    const status = midjourneyTaskStatus(task);
    if (FAILURE_STATUSES.has(status)) {
      const message = errorMessage(task);
      await saveGenerationTask({ id: taskId, status: "failed", result: task, errorMessage: message });
      throw new ProviderError("PROVIDER_ERROR", `Midjourney 生成失败：${message}`, undefined, task);
    }
    if (Date.now() - startedAt > 30 * 60 * 1000) {
      await saveGenerationTask({ id: taskId, status: "timeout", result: task, errorMessage: "Midjourney 任务超过 30 分钟仍未完成。" });
      throw new ProviderError("VEO_OPERATION_TIMEOUT", "Midjourney 任务仍在生成中，查询超过等待时间。", undefined, {
        provider: "midjourney",
        taskId,
        taskStatus: midjourneyTaskStatus(task) || "processing",
        pendingAfterTimeout: true,
        response: task
      });
    }

    await sleep(4000);
    let response = await fetch(activeEndpoint, { headers: { Authorization: `Bearer ${params.apiKey}`, Accept: "application/json" } });
    if ((response.status === 404 || response.status === 405) && activeEndpoint === endpoints[0]) {
      activeEndpoint = endpoints[1]!;
      response = await fetch(activeEndpoint, { headers: { Authorization: `Bearer ${params.apiKey}`, Accept: "application/json" } });
    }
    task = await responseJson(response);
    if (!response.ok || applicationError(task)) {
      if (activeEndpoint === endpoints[0]) {
        activeEndpoint = endpoints[1]!;
        const fallback = await fetch(activeEndpoint, { headers: { Authorization: `Bearer ${params.apiKey}`, Accept: "application/json" } });
        task = await responseJson(fallback);
        if (!fallback.ok || applicationError(task)) throwResponseError(fallback, task, "任务查询");
      } else {
        throwResponseError(response, task, "任务查询");
      }
    }
    await saveGenerationTask({ id: taskId, status: midjourneyTaskStatus(task) || "processing", result: task });
  }
  return task;
}

export async function generateImageWithMidjourney(params: ImageProviderParams): Promise<ProviderGenerateResult> {
  if (!params.apiKey || params.apiKey.includes("*")) throw new ProviderError("API_KEY_MISSING", "请在设置中心填写完整的 Midjourney API Key。");
  if (params.inputMode !== "text-to-image" && !params.imageAssetIds?.length) {
    throw new ProviderError("MISSING_INPUT_ASSET", "Midjourney 图生图或图片编辑需要至少一张图片素材。");
  }

  try {
    const imageUrls = await resolveImageUrls(params);
    const endpoints = midjourneyCreateEndpointCandidates(params.apiBaseUrl, params.inputMode);
    const body = buildRequestBody(params, imageUrls);
    let endpoint = endpoints[0]!;
    let task: unknown = {};
    let createResponse: Response | undefined;
    for (const candidate of endpoints) {
      const response = await fetch(candidate, {
        method: "POST",
        headers: { Authorization: `Bearer ${params.apiKey}`, "Content-Type": "application/json", Accept: "application/json" },
        body: JSON.stringify(body)
      });
      task = await responseJson(response);
      createResponse = response;
      endpoint = candidate;
      if (response.ok && !applicationError(task)) break;
      if (!shouldTryNextCreateEndpoint(response, task) || candidate === endpoints[endpoints.length - 1]) {
        throwResponseError(response, task, "任务创建");
      }
      console.warn("[Midjourney Image] create endpoint rejected by relay; trying compatible path", {
        rejectedEndpoint: candidate,
        nextEndpoint: endpoints[endpoints.indexOf(candidate) + 1],
        status: response.status,
        message: errorMessage(task)
      });
    }
    if (!createResponse || !createResponse.ok || applicationError(task)) throwResponseError(createResponse!, task, "任务创建");

    const taskId = midjourneyTaskId(task);
    const immediateUrl = midjourneyResultUrl(task);
    if (!taskId && !immediateUrl) {
      throw new ProviderError("PROVIDER_ERROR", "Midjourney 接口没有返回 task_id 或图片 URL。", JSON.stringify(task), task);
    }

    if (taskId) {
      await saveGenerationTask({
        id: taskId,
        status: midjourneyTaskStatus(task) || "submitted",
        result: { provider: "midjourney", endpoint, nodeId: params.nodeId, modelName: params.modelName, response: task }
      });
      if (!immediateUrl || !SUCCESS_STATUSES.has(midjourneyTaskStatus(task))) task = await pollTask(params, taskId, task);
    }

    const remoteUrl = midjourneyResultUrl(task) ?? immediateUrl;
    if (!remoteUrl) throw new ProviderError("PROVIDER_ERROR", "Midjourney 任务已完成，但响应中没有图片 URL。", JSON.stringify(task), task);
    if (taskId) await saveGenerationTask({ id: taskId, status: "success", progress: 100, result: task });
    const saved = await downloadGeneratedFile(remoteUrl, "image_midjourney");
    return {
      status: "success",
      outputUrl: saved.outputUrl,
      localPath: saved.localPath,
      rawResponse: task,
      payloadSummary: { endpoint, taskId, model: params.modelName, inputMode: params.inputMode, imageInputCount: imageUrls.length }
    };
  } catch (error) {
    if (error instanceof ProviderError) throw error;
    const message = rawErrorMessage(error);
    if (/fetch failed|network|econn|dns|timeout/i.test(message)) {
      throw new ProviderError("NETWORK_ERROR", "Midjourney 接口网络请求失败，请检查 Base URL 和中转服务状态。", message);
    }
    throw new ProviderError("PROVIDER_ERROR", "Midjourney 图片接口调用失败。", message);
  }
}
