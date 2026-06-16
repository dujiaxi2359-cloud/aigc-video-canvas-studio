import fs from "node:fs";
import path from "node:path";
import { legacyInputModeToOfficialMode, type OfficialVideoMode } from "../../types/videoModes.js";
import { downloadGeneratedFile } from "../../utils/downloadGeneratedFile.js";
import { ProviderError, rawErrorMessage } from "../../utils/providerErrors.js";
import { getAsset } from "../asset.service.js";
import { prepareVideoFrameForAspectRatio } from "../assets/prepareVideoFrame.service.js";
import { saveGenerationTask } from "../generationTask.service.js";
import type { ProviderGenerateResult, VideoProviderParams } from "./providerTypes.js";

function sleep(ms: number) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

export function isVeoProxyEndpoint(apiBaseUrl?: string) {
  if (!apiBaseUrl) return false;
  if (/generativelanguage\.googleapis\.com/i.test(apiBaseUrl)) return false;
  try {
    const pathname = new URL(apiBaseUrl).pathname.replace(/\/$/, "");
    return /\/v1$/i.test(pathname) || /\/v1\/videos$/i.test(pathname) || /\/v1\/video\/create$/i.test(pathname);
  } catch {
    const value = apiBaseUrl.replace(/\/$/, "");
    return /\/v1$/i.test(value) || /\/v1\/videos$/i.test(value) || /\/v1\/video\/create$/i.test(value);
  }
}

export function veoProxyCreateEndpoint(apiBaseUrl: string) {
  const base = apiBaseUrl.trim().replace(/^(?:POST|GET|PUT|PATCH|DELETE)\s+/i, "").replace(/\/$/, "");
  if (/\/v1\/videos$/i.test(base) || /\/v1\/video\/create$/i.test(base)) return base;
  if (/\/v1$/i.test(base)) return `${base}/videos`;
  return `${base}/v1/videos`;
}

function mimeTypeFromPath(filePath: string) {
  const extension = path.extname(filePath).toLowerCase();
  if (extension === ".png") return "image/png";
  if (extension === ".webp") return "image/webp";
  return "image/jpeg";
}

async function imageDataUris(assetIds?: string[], aspectRatio?: string) {
  const images: string[] = [];
  const audits: Array<Record<string, unknown>> = [];
  for (const assetId of assetIds ?? []) {
    const asset = await getAsset(assetId);
    if (!asset?.localPath || !fs.existsSync(asset.localPath)) {
      throw new ProviderError("MISSING_INPUT_ASSET", "Veo 中转接口引用的图片素材不存在或已被删除。");
    }
    const prepared = aspectRatio
      ? await prepareVideoFrameForAspectRatio(asset.localPath, aspectRatio, "smart_crop")
      : undefined;
    const inputPath = prepared?.localPath ?? asset.localPath;
    const stat = fs.statSync(inputPath);
    const mimeType = prepared?.transformed ? "image/png" : asset.mimeType || mimeTypeFromPath(inputPath);
    images.push(`data:${mimeType};base64,${fs.readFileSync(inputPath).toString("base64")}`);
    audits.push({
      assetId,
      inputImageSource: prepared?.transformed ? "smartCropAspectRatio" : "localPath",
      requestedAspectRatio: aspectRatio,
      inputImageWidth: prepared?.width,
      inputImageHeight: prepared?.height,
      inputImageFileSize: stat.size,
      modelInputAspectRatio: prepared?.aspectRatio,
      frameFitMode: prepared?.fitMode,
      usesOriginalFile: !prepared?.transformed,
      inputImageWasCompressed: Boolean(prepared?.transformed)
    });
  }
  return { images, audits };
}

function relayProtocol(endpoint: string) {
  return /\/v1\/video\/create\/?$/i.test(new URL(endpoint).pathname) ? "unified-create-query" : "openai-videos";
}

export function configuredRelayModelName(params: Pick<VideoProviderParams, "modelName">) {
  return params.modelName;
}

function unifiedQueryEndpoint(endpoint: string, taskId: string) {
  const parsed = new URL(endpoint);
  parsed.pathname = parsed.pathname.replace(/\/create\/?$/i, "/query");
  parsed.search = "";
  parsed.searchParams.set("id", taskId);
  return parsed.toString();
}

function taskIdFromResponse(payload: Record<string, unknown>): string | undefined {
  for (const key of ["id", "task_id", "taskId", "request_id", "requestId", "generation_id", "generationId", "job_id", "jobId", "operation_id", "operationId"]) {
    if (typeof payload[key] === "string" && payload[key]) return payload[key] as string;
  }
  const data = payload.data;
  if (Array.isArray(data)) {
    for (const item of data) {
      if (item && typeof item === "object") {
        const found = taskIdFromResponse(item as Record<string, unknown>);
        if (found) return found;
      }
    }
  }
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

function urlsFromText(value: string) {
  return Array.from(value.matchAll(/https?:\/\/[^\s"'<>\\)]+/gi)).map((match) => match[0]!.replace(/[，。,.]+$/g, ""));
}

function findVideoUrl(value: unknown, preferred = false): string | undefined {
  if (typeof value === "string") {
    const trimmed = value.trim();
    if (isHttpUrl(trimmed)) {
      return preferred || isLikelyVideoUrl(trimmed) || /(video|media|download|file|preview|play|output|cdn|oss|cos|storage|signed)/i.test(trimmed) ? trimmed : undefined;
    }
    const urls = urlsFromText(trimmed);
    if (!urls.length) return undefined;
    const selected = urls.find((url) => isLikelyVideoUrl(url) || /(video|media|download|file|preview|play|output|cdn|oss|cos|storage|signed)/i.test(url));
    return selected ?? (preferred ? urls[0] : undefined);
  }
  if (Array.isArray(value)) {
    for (const item of value) {
      const found = findVideoUrl(item, preferred);
      if (found) return found;
    }
    return undefined;
  }
  if (!value || typeof value !== "object") return undefined;
  const record = value as Record<string, unknown>;
  for (const key of preferredVideoUrlKeys) {
    if (!(key in record)) continue;
    const found = findVideoUrl(record[key], true);
    if (found) return found;
  }
  for (const nested of Object.values(record)) {
    const found = findVideoUrl(nested);
    if (found) return found;
  }
  return undefined;
}

export async function generateVideoWithVeoProxy(params: VideoProviderParams): Promise<ProviderGenerateResult> {
  const endpoint = veoProxyCreateEndpoint(params.apiBaseUrl);
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
    const relayModel = configuredRelayModelName(params);
    const requestAspectRatio = isOmni ? params.aspectRatio : params.aspectRatio ?? "16:9";
    const requestResolution = isOmni ? params.resolution : params.resolution ?? "720p";
    const requestSize = requestAspectRatio && requestResolution ? proxySize(requestAspectRatio, requestResolution) : undefined;
    const { images, audits: inputImageAudits } = await imageDataUris(params.imageAssetIds, requestAspectRatio);
    const body = protocol === "unified-create-query"
      ? {
          model: relayModel,
          prompt: params.prompt,
          images,
          ...(requestAspectRatio ? { aspect_ratio: requestAspectRatio } : {}),
          ...(requestResolution ? { size: requestResolution } : {}),
          enhance_prompt: params.promptExtend ?? true,
          ...(requestResolution ? { enable_upsample: requestResolution.toLowerCase() !== "720p" } : {})
        }
      : {
          model: relayModel,
          prompt: params.prompt,
          ...(requestSize ? { size: requestSize } : {}),
          ...(requestAspectRatio ? { aspect_ratio: requestAspectRatio, aspectRatio: requestAspectRatio } : {}),
          ...(requestResolution ? { resolution: requestResolution } : {}),
          ...(params.duration ? { duration: params.duration, seconds: params.duration } : {}),
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

    const directVideoUrl = findVideoUrl(created);
    const taskId = taskIdFromResponse(created);
    if (directVideoUrl) {
      await saveGenerationTask({
        id: taskId ?? `direct_${Date.now()}_${params.nodeId}`,
        status: "success",
        progress: 100,
        result: {
          provider: "google-veo-proxy",
          endpoint,
          nodeId: params.nodeId,
          configuredModel: params.modelName,
          relayModel,
          relayProtocol: protocol,
          response: created
        }
      });
      const saved = await downloadGeneratedFile(directVideoUrl, "video_veo_proxy");
      return {
        status: "success",
        outputUrl: saved.outputUrl,
        localPath: saved.localPath,
        rawResponse: created,
        payloadSummary: {
          endpointType: "openai-compatible.videos",
          relayProtocol: protocol,
          proxyEndpoint: endpoint,
          proxyTaskId: taskId,
          proxyModel: relayModel,
          configuredModel: params.modelName,
          requestedAspectRatio: requestAspectRatio,
          requestedResolution: requestResolution,
          requestedDuration: params.duration,
          inputImageCount: images.length,
          inputImages: inputImageAudits,
          directResult: true
        }
      };
    }
    if (!taskId) {
      throw new ProviderError("PROVIDER_ERROR", "Veo 中转接口没有返回任务 id。", JSON.stringify(created));
    }
    const pollUrl = protocol === "unified-create-query"
      ? unifiedQueryEndpoint(endpoint, taskId)
      : `${endpoint}/${encodeURIComponent(taskId)}`;
    await saveGenerationTask({
      id: taskId,
      status: taskStatus(created) || "submitted",
      result: {
        provider: "google-veo-proxy",
        endpoint,
        pollUrl,
        nodeId: params.nodeId,
        configuredModel: params.modelName,
        relayModel,
        relayProtocol: protocol,
        request: {
          model: relayModel,
          promptLength: params.prompt.length,
          imageCount: images.length,
          aspectRatio: requestAspectRatio,
          resolution: requestResolution,
          duration: params.duration,
          inputImages: inputImageAudits
        },
        response: created
      }
    });

    let task = created;
    const startedAt = Date.now();
    while (!isCompletedStatus(taskStatus(task))) {
      if (isFailedStatus(taskStatus(task))) {
        await saveGenerationTask({ id: taskId, status: "failed", result: task, errorMessage: errorMessage(task) });
        throw new ProviderError("VEO_OPERATION_FAILED", `Veo 中转任务失败：${errorMessage(task)}`, JSON.stringify(task));
      }
      if (Date.now() - startedAt > 15 * 60 * 1000) {
        await saveGenerationTask({ id: taskId, status: "timeout", result: task, errorMessage: "Veo 中转任务超过 15 分钟仍未完成。" });
        throw new ProviderError("VEO_OPERATION_TIMEOUT", "Veo 中转任务超过 15 分钟仍未完成，请稍后重试。");
      }
      await sleep(5000);
      const pollResponse = await fetch(pollUrl, {
        headers: { Authorization: `Bearer ${params.apiKey}` }
      });
      task = await responseJson(pollResponse);
      await saveGenerationTask({ id: taskId, status: taskStatus(task) || "processing", result: task });
      if (!pollResponse.ok) {
        throw new ProviderError("PROVIDER_ERROR", `Veo 中转任务查询失败：${errorMessage(task)}`, JSON.stringify(task));
      }
    }

    const videoUrl = findVideoUrl(task);
    if (!videoUrl) {
      await saveGenerationTask({ id: taskId, status: "completed_without_video_url", result: task, errorMessage: "Veo 中转任务已完成，但响应中没有找到视频 URL。" });
      throw new ProviderError("VEO_OPERATION_NO_VIDEO_IN_RESPONSE", "Veo 中转任务已完成，但响应中没有找到视频 URL。", JSON.stringify(task), {
        endpoint,
        taskId,
        configuredModel: params.modelName,
        relayModel,
        relayProtocol: protocol,
        response: task
      });
    }
    await saveGenerationTask({ id: taskId, status: "success", progress: 100, result: task });
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
        proxyModel: relayModel,
        configuredModel: params.modelName,
        relayDisplayNote: protocol === "openai-videos" ? "中转后台的平台列可能显示 Omni，但实际请求 model 字段仍是 proxyModel。" : undefined,
        requestedAspectRatio: requestAspectRatio,
        requestedResolution: requestResolution,
        requestedDuration: params.duration,
        inputImageCount: images.length,
        inputImages: inputImageAudits
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
