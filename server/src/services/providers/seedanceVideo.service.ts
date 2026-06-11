import fs from "node:fs";
import path from "node:path";
import { legacyInputModeToOfficialMode } from "../../types/videoModes.js";
import { downloadGeneratedFile } from "../../utils/downloadGeneratedFile.js";
import { ProviderError, rawErrorMessage } from "../../utils/providerErrors.js";
import { mapVideoDimensions, mapVideoSize, normalizeVideoAspectRatio, normalizeVideoResolution } from "../../utils/videoParams.js";
import { getAsset } from "../asset.service.js";
import { prepareVideoFrameForAspectRatio } from "../assets/prepareVideoFrame.service.js";
import { saveGenerationTask } from "../generationTask.service.js";
import type { ProviderGenerateResult, VideoProviderParams } from "./providerTypes.js";

function sleep(ms: number) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

function record(value: unknown) {
  return value && typeof value === "object" ? value as Record<string, unknown> : {};
}

function mimeType(filePath: string, configured?: string) {
  if (configured) return configured;
  const extension = path.extname(filePath).toLowerCase();
  if (extension === ".png") return "image/png";
  if (extension === ".webp") return "image/webp";
  if (extension === ".mp4") return "video/mp4";
  if (extension === ".webm") return "video/webm";
  if (extension === ".mov") return "video/quicktime";
  return "image/jpeg";
}

async function assetDataUrls(assetIds?: string[], aspectRatio?: string) {
  const urls: string[] = [];
  for (const assetId of assetIds ?? []) {
    const asset = await getAsset(assetId);
    if (!asset?.localPath || !fs.existsSync(asset.localPath)) {
      throw new ProviderError("MISSING_INPUT_ASSET", "Seedance 引用的图片或视频素材不存在。");
    }
    const sourcePath = asset.mimeType?.startsWith("image/")
      ? (await prepareVideoFrameForAspectRatio(asset.localPath, aspectRatio, "contain_blur")).localPath
      : asset.localPath;
    urls.push(`data:${mimeType(sourcePath, asset.mimeType)};base64,${fs.readFileSync(sourcePath).toString("base64")}`);
  }
  return urls;
}

export function seedanceCreateEndpoint(apiBaseUrl: string) {
  const base = apiBaseUrl.trim().replace(/^(?:POST|GET|PUT|PATCH|DELETE)\s+/i, "").replace(/\/$/, "");
  if (/\/(?:video\/generations|videos\/generations|videos)$/i.test(base)) return base;
  return `${base}/video/generations`;
}

export function seedancePollEndpoint(apiBaseUrl: string, taskId: string) {
  return `${seedanceCreateEndpoint(apiBaseUrl)}/${encodeURIComponent(taskId)}`;
}

async function responseJson(response: Response) {
  const text = await response.text();
  try {
    return JSON.parse(text) as Record<string, unknown>;
  } catch {
    throw new ProviderError("PROVIDER_ERROR", `Seedance 中转返回了无法解析的响应（HTTP ${response.status}）。`, text.slice(0, 1000));
  }
}

function taskId(payload: Record<string, unknown>) {
  const data = record(payload.data);
  const task = record(payload.task);
  return [payload.task_id, payload.request_id, payload.id, data.task_id, data.request_id, data.id, task.id]
    .find((value) => typeof value === "string") as string | undefined;
}

function taskStatus(payload: Record<string, unknown>) {
  const data = record(payload.data);
  const task = record(payload.task);
  const value = payload.status ?? payload.state ?? data.status ?? data.state ?? task.status ?? task.state;
  return typeof value === "string" ? value.toLowerCase() : "";
}

function errorMessage(payload: Record<string, unknown>) {
  const data = record(payload.data);
  const error = record(payload.error);
  return String(error.message ?? payload.message ?? data.message ?? payload.error ?? "未知错误");
}

const preferredVideoUrlKeys = [
  "video_url",
  "videoUrl",
  "video",
  "videos",
  "output_url",
  "outputUrl",
  "download_url",
  "downloadUrl",
  "preview_url",
  "previewUrl",
  "play_url",
  "playUrl",
  "media_url",
  "mediaUrl",
  "source_url",
  "sourceUrl",
  "file_url",
  "fileUrl",
  "url",
  "uri",
  "href",
  "link",
  "links",
  "data",
  "result",
  "results",
  "output",
  "outputs",
  "file",
  "files"
];

function isHttpUrl(value: string) {
  return /^https?:\/\//i.test(value.trim());
}

function isLikelyVideoUrl(value: string) {
  return isHttpUrl(value) && /\.(mp4|webm|mov|m4v)(?:[?#]|$)/i.test(value);
}

function videoUrl(value: unknown, preferred = false): string | undefined {
  if (typeof value === "string") {
    if (!isHttpUrl(value)) return undefined;
    return preferred || isLikelyVideoUrl(value) || /(video|media|download|file|preview|play)/i.test(value) ? value : undefined;
  }
  if (Array.isArray(value)) {
    for (const item of value) {
      const found = videoUrl(item, preferred);
      if (found) return found;
    }
    return undefined;
  }
  if (!value || typeof value !== "object") return undefined;
  const payload = value as Record<string, unknown>;
  for (const key of preferredVideoUrlKeys) {
    if (!(key in payload)) continue;
    const found = videoUrl(payload[key], true);
    if (found) return found;
  }
  for (const nested of Object.values(payload)) {
    const found = videoUrl(nested);
    if (found) return found;
  }
  return undefined;
}

export async function generateVideoWithSeedance(params: VideoProviderParams): Promise<ProviderGenerateResult> {
  const mode = params.videoMode ?? legacyInputModeToOfficialMode(params.inputMode, "seedance");
  if (!["text_to_video", "image_to_video_first_frame", "reference_images_to_video", "video_edit"].includes(mode)) {
    throw new ProviderError("MODEL_MODE_UNSUPPORTED", "Seedance 中转当前支持文生视频、图生视频、参考图生视频和视频编辑。");
  }

  try {
    const images = await assetDataUrls(params.imageAssetIds, params.aspectRatio);
    const videos = await assetDataUrls(params.videoAssetIds);
    if (["image_to_video_first_frame", "reference_images_to_video"].includes(mode) && !images.length) {
      throw new ProviderError("MISSING_INPUT_ASSET", "Seedance 图生视频需要连接参考图片。");
    }
    if (mode === "video_edit" && !videos.length) {
      throw new ProviderError("MISSING_VIDEO_INPUT", "Seedance 视频编辑需要连接视频素材。");
    }

    const normalizedRatio = normalizeVideoAspectRatio(params.aspectRatio);
    const normalizedResolution = normalizeVideoResolution(params.resolution);
    const dimensions = mapVideoDimensions(params.aspectRatio, params.resolution);
    const body: Record<string, unknown> = {
      model: params.modelName,
      prompt: params.prompt,
      duration: params.duration,
      seconds: params.duration,
      aspect_ratio: normalizedRatio,
      aspectRatio: normalizedRatio,
      ratio: normalizedRatio,
      resolution: normalizedResolution,
      size: normalizedResolution,
      dimensions: mapVideoSize(params.aspectRatio, params.resolution),
      width: dimensions.width,
      height: dimensions.height
    };
    if (images[0]) {
      body.image = images[0];
      body.image_url = images[0];
    }
    if (mode === "reference_images_to_video") body.reference_images = images;
    if (videos[0]) {
      body.video = videos[0];
      body.video_url = videos[0];
    }

    const endpoint = seedanceCreateEndpoint(params.apiBaseUrl);
    const response = await fetch(endpoint, {
      method: "POST",
      headers: { Authorization: `Bearer ${params.apiKey}`, "Content-Type": "application/json", Accept: "application/json" },
      body: JSON.stringify(body)
    });
    let task = await responseJson(response);
    if (!response.ok) throw new ProviderError("PROVIDER_ERROR", `Seedance 中转任务创建失败：${errorMessage(task)}`, JSON.stringify(task));

    let remoteUrl = videoUrl(task);
    const id = taskId(task);
    if (!remoteUrl && !id) {
      throw new ProviderError("PROVIDER_ERROR", "Seedance 中转没有返回 task_id 或视频地址。", JSON.stringify(task));
    }

    if (id) {
      const pollEndpoint = seedancePollEndpoint(params.apiBaseUrl, id);
      await saveGenerationTask({
        id,
        status: taskStatus(task) || "submitted",
        result: { provider: "seedance", endpoint, pollEndpoint, nodeId: params.nodeId, modelName: params.modelName, response: task }
      });
      const startedAt = Date.now();
      while (!remoteUrl && !["completed", "succeeded", "success", "done", "finished"].includes(taskStatus(task))) {
        if (["failed", "error", "cancelled", "canceled"].includes(taskStatus(task))) {
          await saveGenerationTask({ id, status: "failed", result: task, errorMessage: errorMessage(task) });
          throw new ProviderError("VEO_OPERATION_FAILED", `Seedance 中转任务失败：${errorMessage(task)}`, JSON.stringify(task));
        }
        if (Date.now() - startedAt > 20 * 60 * 1000) {
          await saveGenerationTask({ id, status: "timeout", result: task, errorMessage: "Seedance 中转任务超过 20 分钟仍未完成。" });
          throw new ProviderError("VEO_OPERATION_TIMEOUT", "Seedance 中转任务超过 20 分钟仍未完成。");
        }
        await sleep(5000);
        const pollResponse = await fetch(pollEndpoint, {
          headers: { Authorization: `Bearer ${params.apiKey}`, Accept: "application/json" }
        });
        task = await responseJson(pollResponse);
        await saveGenerationTask({ id, status: taskStatus(task) || "processing", result: task });
        if (!pollResponse.ok) throw new ProviderError("PROVIDER_ERROR", `Seedance 中转任务查询失败：${errorMessage(task)}`, JSON.stringify(task));
        remoteUrl = videoUrl(task);
      }
      if (remoteUrl) await saveGenerationTask({ id, status: "success", progress: 100, result: task });
    }

    if (!remoteUrl) {
      if (id) await saveGenerationTask({ id, status: "completed_without_video_url", result: task, errorMessage: "Seedance 中转任务已完成，但响应中没有视频 URL。" });
      throw new ProviderError("VEO_OPERATION_NO_VIDEO_IN_RESPONSE", "Seedance 中转任务已完成，但响应中没有视频 URL。", JSON.stringify(task), {
        endpoint: seedanceCreateEndpoint(params.apiBaseUrl),
        taskId: id,
        configuredModel: params.modelName,
        mode,
        response: task
      });
    }
    const saved = await downloadGeneratedFile(remoteUrl, "video_seedance");
    return {
      status: "success",
      outputUrl: saved.outputUrl,
      localPath: saved.localPath,
      rawResponse: task,
      payloadSummary: { endpoint, taskId: id, model: params.modelName, mode }
    };
  } catch (error) {
    if (error instanceof ProviderError) throw error;
    const message = rawErrorMessage(error);
    if (/fetch failed|network|econn|dns|timeout/i.test(message)) {
      throw new ProviderError("NETWORK_ERROR", "Seedance 中转网络请求失败，请检查 Base URL、中转服务和后端网络。", message);
    }
    throw new ProviderError("PROVIDER_ERROR", "Seedance 中转接口调用失败。", message);
  }
}
