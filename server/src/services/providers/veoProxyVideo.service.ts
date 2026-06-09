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
    return /\/v1\/videos\/?$/i.test(new URL(apiBaseUrl).pathname);
  } catch {
    return /\/v1\/videos\/?$/i.test(apiBaseUrl);
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

function proxyModelName(mode: OfficialVideoMode) {
  return mode === "image_to_video_first_last_frame" ? "veo_3_1-fast-fl" : "veo_3_1-fast";
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
  const mode = params.videoMode ?? legacyInputModeToOfficialMode(params.inputMode, "google");
  if (!["text_to_video", "image_to_video_first_frame", "image_to_video_first_last_frame", "reference_images_to_video"].includes(mode)) {
    throw new ProviderError("MODEL_MODE_UNSUPPORTED", "当前 Veo 中转接口只支持文生视频、首帧/首尾帧和参考图生视频。");
  }

  try {
    const images = await imageDataUris(params.imageAssetIds);
    const response = await fetch(endpoint, {
      method: "POST",
      headers: {
        Authorization: `Bearer ${params.apiKey}`,
        "Content-Type": "application/json"
      },
      body: JSON.stringify({
        model: proxyModelName(mode),
        prompt: params.prompt,
        size: proxySize(params.aspectRatio, params.resolution),
        images
      })
    });
    const created = await responseJson(response);
    if (!response.ok) {
      throw new ProviderError("PROVIDER_ERROR", `Veo 中转接口创建任务失败：${errorMessage(created)}`, JSON.stringify(created));
    }

    const taskId = typeof created.id === "string" ? created.id : undefined;
    if (!taskId) {
      throw new ProviderError("PROVIDER_ERROR", "Veo 中转接口没有返回任务 id。", JSON.stringify(created));
    }

    let task = created;
    const startedAt = Date.now();
    while (task.status !== "completed") {
      if (task.status === "failed") {
        throw new ProviderError("VEO_OPERATION_FAILED", `Veo 中转任务失败：${errorMessage(task)}`, JSON.stringify(task));
      }
      if (Date.now() - startedAt > 15 * 60 * 1000) {
        throw new ProviderError("VEO_OPERATION_TIMEOUT", "Veo 中转任务超过 15 分钟仍未完成，请稍后重试。");
      }
      await sleep(5000);
      const pollResponse = await fetch(`${endpoint}/${encodeURIComponent(taskId)}`, {
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
        proxyEndpoint: endpoint,
        proxyTaskId: taskId,
        proxyModel: proxyModelName(mode)
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
