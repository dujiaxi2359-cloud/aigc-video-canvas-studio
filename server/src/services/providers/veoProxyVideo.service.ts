import fs from "node:fs";
import path from "node:path";
import { legacyInputModeToOfficialMode, type OfficialVideoMode } from "../../types/videoModes.js";
import { downloadGeneratedFile } from "../../utils/downloadGeneratedFile.js";
import { ProviderError, rawErrorMessage } from "../../utils/providerErrors.js";
import { getAsset } from "../asset.service.js";
import type { ProviderGenerateResult, VideoProviderParams } from "./providerTypes.js";

function sleep(ms: number) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

export function isVeoProxyEndpoint(apiBaseUrl?: string) {
  if (!apiBaseUrl) return false;
  try {
    return /\/v1\/videos\/?$/i.test(new URL(apiBaseUrl).pathname) || /\/v1\/video\/create\/?$/i.test(new URL(apiBaseUrl).pathname);
  } catch {
    return /\/v1\/videos\/?$/i.test(apiBaseUrl) || /\/v1\/video\/create\/?$/i.test(apiBaseUrl);
  }
}

function mimeTypeFromPath(filePath: string) {
  const extension = path.extname(filePath).toLowerCase();
  if (extension === ".png") return "image/png";
  if (extension === ".webp") return "image/webp";
  return "image/jpeg";
}

async function imageDataUris(assetIds?: string[]) {
  const images: string[] = [];
  for (const assetId of assetIds ?? []) {
    const asset = await getAsset(assetId);
    if (!asset?.localPath || !fs.existsSync(asset.localPath)) {
      throw new ProviderError("MISSING_INPUT_ASSET", "Veo 中转接口引用的图片素材不存在或已被删除。");
    }
    const mimeType = asset.mimeType || mimeTypeFromPath(asset.localPath);
    images.push(`data:${mimeType};base64,${fs.readFileSync(asset.localPath).toString("base64")}`);
  }
  return images;
}

function proxyModelName(params: VideoProviderParams, mode: OfficialVideoMode) {
  if (params.modelName === "omni_flash-10s") return params.modelName;
  return mode === "image_to_video_first_last_frame" ? "veo_3_1-fast-fl" : "veo_3_1-fast";
}

function relayProtocol(endpoint: string) {
  return /\/v1\/video\/create\/?$/i.test(new URL(endpoint).pathname) ? "unified-create-query" : "openai-videos";
}

function configuredRelayModelName(params: VideoProviderParams, mode: OfficialVideoMode, protocol: ReturnType<typeof relayProtocol>) {
  if (protocol === "unified-create-query") return params.modelName;
  return proxyModelName(params, mode);
}

function unifiedQueryEndpoint(endpoint: string, taskId: string) {
  const parsed = new URL(endpoint);
  parsed.pathname = parsed.pathname.replace(/\/create\/?$/i, "/query");
  parsed.search = "";
  parsed.searchParams.set("id", taskId);
  return parsed.toString();
}

function taskIdFromResponse(payload: Record<string, unknown>): string | undefined {
  for (const key of ["id", "task_id", "taskId"]) {
    if (typeof payload[key] === "string" && payload[key]) return payload[key] as string;
  }
  const data = payload.data;
  return data && typeof data === "object" ? taskIdFromResponse(data as Record<string, unknown>) : undefined;
}

function taskStatus(payload: Record<string, unknown>) {
  const data = payload.data;
  const value = payload.status
    ?? payload.state
    ?? (data && typeof data === "object" ? (data as Record<string, unknown>).status ?? (data as Record<string, unknown>).state : undefined);
  return typeof value === "string" ? value.toLowerCase() : "";
}

function isCompletedStatus(status: string) {
  return ["completed", "success", "succeeded", "done", "finished"].includes(status);
}

function isFailedStatus(status: string) {
  return ["failed", "failure", "error", "cancelled", "canceled"].includes(status);
}

function proxySize(aspectRatio: string, resolution: string) {
  const portrait = aspectRatio === "9:16";
  const edge = resolution.toLowerCase() === "4k"
    ? [3840, 2160]
    : resolution.toLowerCase() === "1080p"
      ? [1920, 1080]
      : [1280, 720];
  return portrait ? `${edge[1]}x${edge[0]}` : `${edge[0]}x${edge[1]}`;
}

async function responseJson(response: Response) {
  const text = await response.text();
  try {
    return JSON.parse(text) as Record<string, unknown>;
  } catch {
    throw new ProviderError("PROVIDER_ERROR", `Veo 中转接口返回了无法解析的响应（HTTP ${response.status}）。`, text.slice(0, 1000));
  }
}

function errorMessage(payload: Record<string, unknown>) {
  const error = payload.error;
  if (typeof error === "string") return error;
  if (error && typeof error === "object" && typeof (error as Record<string, unknown>).message === "string") {
    return (error as Record<string, unknown>).message as string;
  }
  return typeof payload.message === "string" ? payload.message : JSON.stringify(payload);
}

function findVideoUrl(value: unknown): string | undefined {
  if (typeof value === "string") {
    return /^https?:\/\//i.test(value) && (/\.mp4(?:[?#]|$)/i.test(value) || /video/i.test(value)) ? value : undefined;
  }
  if (Array.isArray(value)) {
    for (const item of value) {
      const found = findVideoUrl(item);
      if (found) return found;
    }
    return undefined;
  }
  if (!value || typeof value !== "object") return undefined;
  const record = value as Record<string, unknown>;
  for (const key of ["video_url", "videoUrl", "output_url", "outputUrl", "url", "video"]) {
    const found = findVideoUrl(record[key]);
    if (found) return found;
  }
  for (const nested of Object.values(record)) {
    const found = findVideoUrl(nested);
    if (found) return found;
  }
  return undefined;
}

export async function generateVideoWithVeoProxy(params: VideoProviderParams): Promise<ProviderGenerateResult> {
  const endpoint = params.apiBaseUrl.replace(/\/$/, "");
  const protocol = relayProtocol(endpoint);
  const mode = params.videoMode ?? legacyInputModeToOfficialMode(params.inputMode, "google");
  const isOmni = params.modelName === "omni_flash-10s";
  if (!["text_to_video", "image_to_video_first_frame", "image_to_video_first_last_frame", "reference_images_to_video"].includes(mode)) {
    throw new ProviderError("MODEL_MODE_UNSUPPORTED", "当前 Google 中转视频接口只支持文生视频、图生视频和参考图生视频。");
  }
  if (isOmni && mode === "image_to_video_first_last_frame") {
    throw new ProviderError("MODEL_MODE_UNSUPPORTED", "Google Omni Flash 10s 暂不支持首尾帧模式。");
  }

  try {
    const images = await imageDataUris(params.imageAssetIds);
    const relayModel = configuredRelayModelName(params, mode, protocol);
    const body = protocol === "unified-create-query"
      ? {
          model: relayModel,
          prompt: params.prompt,
          images,
          aspect_ratio: params.aspectRatio,
          size: params.resolution,
          enhance_prompt: params.promptExtend ?? true,
          enable_upsample: params.resolution.toLowerCase() !== "720p"
        }
      : {
          model: relayModel,
          prompt: params.prompt,
          size: proxySize(params.aspectRatio, params.resolution),
          images
        };
    const response = await fetch(endpoint, {
      method: "POST",
      headers: {
        Authorization: `Bearer ${params.apiKey}`,
        "Content-Type": "application/json"
      },
      body: JSON.stringify(body)
    });
    const created = await responseJson(response);
    if (!response.ok) {
      throw new ProviderError("PROVIDER_ERROR", `Veo 中转接口创建任务失败：${errorMessage(created)}`, JSON.stringify(created));
    }

    const taskId = taskIdFromResponse(created);
    if (!taskId) {
      throw new ProviderError("PROVIDER_ERROR", "Veo 中转接口没有返回任务 id。", JSON.stringify(created));
    }

    let task = created;
    const startedAt = Date.now();
    while (!isCompletedStatus(taskStatus(task))) {
      if (isFailedStatus(taskStatus(task))) {
        throw new ProviderError("VEO_OPERATION_FAILED", `Veo 中转任务失败：${errorMessage(task)}`, JSON.stringify(task));
      }
      if (Date.now() - startedAt > 15 * 60 * 1000) {
        throw new ProviderError("VEO_OPERATION_TIMEOUT", "Veo 中转任务超过 15 分钟仍未完成，请稍后重试。");
      }
      await sleep(5000);
      const pollUrl = protocol === "unified-create-query"
        ? unifiedQueryEndpoint(endpoint, taskId)
        : `${endpoint}/${encodeURIComponent(taskId)}`;
      const pollResponse = await fetch(pollUrl, {
        headers: { Authorization: `Bearer ${params.apiKey}` }
      });
      task = await responseJson(pollResponse);
      if (!pollResponse.ok) {
        throw new ProviderError("PROVIDER_ERROR", `Veo 中转任务查询失败：${errorMessage(task)}`, JSON.stringify(task));
      }
    }

    const videoUrl = findVideoUrl(task);
    if (!videoUrl) {
      throw new ProviderError("VEO_OPERATION_NO_VIDEO_IN_RESPONSE", "Veo 中转任务已完成，但响应中没有找到视频 URL。", JSON.stringify(task));
    }
    const saved = await downloadGeneratedFile(videoUrl, "video_veo_proxy");
    return {
      status: "success",
      outputUrl: saved.outputUrl,
      localPath: saved.localPath,
      rawResponse: task,
      payloadSummary: {
        endpointType: "openai-compatible.videos",
        relayProtocol: protocol,
        proxyEndpoint: endpoint,
        proxyTaskId: taskId,
        proxyModel: relayModel
      }
    };
  } catch (error) {
    if (error instanceof ProviderError) throw error;
    const message = rawErrorMessage(error);
    if (/fetch failed|network|econn|dns|timeout/i.test(message)) {
      throw new ProviderError("NETWORK_ERROR", "Veo 中转接口网络请求失败，请检查 Base URL、本地代理和中转服务状态。", message);
    }
    throw new ProviderError("PROVIDER_ERROR", "Veo 中转接口调用失败。", message);
  }
}
