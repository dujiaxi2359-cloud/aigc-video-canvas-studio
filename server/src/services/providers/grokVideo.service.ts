import fs from "node:fs";
import path from "node:path";
import { legacyInputModeToOfficialMode } from "../../types/videoModes.js";
import { downloadGeneratedFile, downloadGeneratedVideoOrUseRemote, saveGeneratedBuffer } from "../../utils/downloadGeneratedFile.js";
import { ProviderError, rawErrorMessage } from "../../utils/providerErrors.js";
import { documentedGrokDuration } from "../../utils/grokRelayModels.js";
import { mapVideoDimensions, normalizeVideoAspectRatio, normalizeVideoResolution } from "../../utils/videoParams.js";
import { getAsset } from "../asset.service.js";
import { ensureAssetLocalFile } from "../assets/ensureAssetLocalFile.service.js";
import { prepareVideoFrameForAspectRatio } from "../assets/prepareVideoFrame.service.js";
import { saveGenerationTask } from "../generationTask.service.js";
import type { ProviderGenerateResult, VideoProviderParams } from "./providerTypes.js";

function sleep(ms: number) {
  return new Promise((resolve) => setTimeout(resolve, ms));
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
    const asset = await ensureAssetLocalFile(await getAsset(assetId), "Grok 引用的图片或视频素材");
    const sourcePath = asset.mimeType?.startsWith("image/")
      ? (await prepareVideoFrameForAspectRatio(asset.localPath, aspectRatio, "smart_crop")).localPath
      : asset.localPath;
    urls.push(`data:${mimeType(sourcePath, asset.mimeType)};base64,${fs.readFileSync(sourcePath).toString("base64")}`);
  }
  return urls;
}

async function assetFiles(assetIds?: string[], aspectRatio?: string) {
  const files: Array<{ blob: Blob; filename: string }> = [];
  for (const assetId of assetIds ?? []) {
    const asset = await ensureAssetLocalFile(await getAsset(assetId), "Grok 引用的图片或视频素材");
    const prepared = asset.mimeType?.startsWith("image/")
      ? await prepareVideoFrameForAspectRatio(asset.localPath, aspectRatio, "smart_crop")
      : undefined;
    const sourcePath = prepared?.localPath ?? asset.localPath;
    files.push({
      blob: new Blob([fs.readFileSync(sourcePath)], { type: mimeType(sourcePath, prepared ? "image/png" : asset.mimeType) }),
      filename: prepared?.transformed ? `grok_${prepared.aspectRatio.replace(":", "x")}_${assetId}.png` : path.basename(asset.localPath)
    });
  }
  return files;
}

function baseUrl(value: string) {
  return value.trim().replace(/^(?:POST|GET|PUT|PATCH|DELETE)\s+/i, "").replace(/\/$/, "");
}

export function grokCreateEndpoint(apiBaseUrl: string) {
  const base = baseUrl(apiBaseUrl);
  if (/\/(?:video\/generations|videos\/generations|videos|video\/create)$/i.test(base)) return base;
  if (/\/chat\/completions$/i.test(base)) return base.replace(/\/chat\/completions$/i, "/videos");
  if (!isOfficialGrokEndpoint(base)) {
    try {
      const url = new URL(base);
      if (url.pathname === "" || url.pathname === "/") return `${base}/v1/videos`;
    } catch {
      // Fall through to the standard relay path.
    }
  }
  return isOfficialGrokEndpoint(base) ? `${base}/videos/generations` : `${base}/videos`;
}

export function grokPollEndpoint(apiBaseUrl: string, requestId: string) {
  const createEndpoint = grokCreateEndpoint(apiBaseUrl);
  if (/\/video\/create$/i.test(createEndpoint)) {
    return `${createEndpoint.replace(/\/video\/create$/i, "/video/query")}?id=${encodeURIComponent(requestId)}`;
  }
  if (/\/videos\/generations$/i.test(createEndpoint)) {
    return `${createEndpoint.replace(/\/videos\/generations$/i, "")}/videos/${encodeURIComponent(requestId)}`;
  }
  return `${createEndpoint}/${encodeURIComponent(requestId)}`;
}

function uniqueValues(values: Array<string | undefined>) {
  return Array.from(new Set(values.filter(Boolean) as string[]));
}

function relayApiRoot(apiBaseUrl: string) {
  const createEndpoint = grokCreateEndpoint(apiBaseUrl);
  try {
    const url = new URL(createEndpoint);
    url.search = "";
    url.hash = "";
    url.pathname = url.pathname
      .replace(/\/(?:videos\/generations|video\/generations|video\/create|videos)$/i, "")
      .replace(/\/+$/g, "");
    return url.toString().replace(/\/$/g, "");
  } catch {
    return createEndpoint
      .replace(/\/(?:videos\/generations|video\/generations|video\/create|videos)$/i, "")
      .replace(/\/+$/g, "");
  }
}

export function grokPollEndpointCandidates(apiBaseUrl: string, requestId: string) {
  const primary = grokPollEndpoint(apiBaseUrl, requestId);
  if (isOfficialGrokEndpoint(apiBaseUrl)) return [primary];

  const root = relayApiRoot(apiBaseUrl);
  const encoded = encodeURIComponent(requestId);
  return uniqueValues([
    primary,
    `${root}/video/query?id=${encoded}`,
    `${root}/videos/${encoded}`,
    `${root}/video/generations/${encoded}`,
    `${root}/videos/generations/${encoded}`
  ]);
}

export function isOfficialGrokEndpoint(apiBaseUrl: string) {
  try {
    return new URL(baseUrl(apiBaseUrl)).hostname === "api.x.ai";
  } catch {
    return /api\.x\.ai/i.test(apiBaseUrl);
  }
}

function isUnifiedGrokEndpoint(apiBaseUrl: string) {
  return /\/v1\/video\/create\/?$/i.test(baseUrl(apiBaseUrl));
}

export function grokRequestModelName(modelName: string, _apiBaseUrl: string) {
  return modelName.trim();
}

function record(value: unknown) {
  return value && typeof value === "object" ? value as Record<string, unknown> : {};
}

async function responseJson(response: Response) {
  const text = await response.text();
  try {
    return JSON.parse(text) as Record<string, unknown>;
  } catch {
    throw new ProviderError("PROVIDER_ERROR", `Grok 视频接口返回了无法解析的响应（HTTP ${response.status}）。`, text.slice(0, 1000));
  }
}

function requestId(payload: Record<string, unknown>) {
  const data = record(payload.data);
  return [payload.request_id, payload.task_id, payload.id, data.request_id, data.task_id, data.id].find((value) => typeof value === "string") as string | undefined;
}

function status(payload: Record<string, unknown>) {
  const data = record(payload.data);
  const value = payload.status ?? payload.state ?? data.status ?? data.state;
  return typeof value === "string" ? value.toLowerCase() : "";
}

function taskProgress(payload: Record<string, unknown>) {
  const data = record(payload.data);
  const value = Number(payload.progress ?? data.progress ?? 0);
  return Number.isFinite(value) ? Math.max(0, Math.min(100, value)) : 0;
}

function errorMessage(payload: Record<string, unknown>) {
  const error = record(payload.error);
  const message = String(error.message ?? payload.message ?? payload.error ?? "未知错误");
  const code = String(error.code ?? payload.code ?? "");
  if (/task_not_exist|task not exist|task does not exist|not found/i.test(`${code} ${message}`)) {
    return "Grok 中转任务查询失败：任务刚创建后查询端暂未同步，或当前中转的创建/查询协议不匹配。系统已尝试备用查询路径；仍失败时请切换同账号下其它 Grok 视频线路。";
  }
  if (/orchestration-service|name or service not known|cannot connect to host|ssl:|getaddrinfo|service unavailable/i.test(message)) {
    return "Grok 中转商内部服务暂时不可达，请稍后重试或切换其他视频通道。";
  }
  return message;
}

function isTaskNotExist(payload: Record<string, unknown>) {
  const error = record(payload.error);
  return /task_not_exist|task not exist|task does not exist|not found/i.test(String(error.code ?? payload.code ?? error.message ?? payload.message ?? payload.error ?? ""));
}

function videoUrl(payload: Record<string, unknown>): string | undefined {
  const data = record(payload.data);
  const video = record(payload.video);
  const output = record(payload.output);
  const detail = record(payload.detail);
  const candidates = [
    output.url,
    video.url,
    payload.video_url,
    payload.url,
    detail.url,
    data.video_url,
    data.url,
    record(data.video).url
  ];
  return candidates.find((value) => typeof value === "string" && /^https?:\/\//i.test(value)) as string | undefined;
}

function grokVideoSize(aspectRatio?: string, resolution?: string) {
  const dimensions = mapVideoDimensions(aspectRatio, resolution);
  return `${dimensions.width}x${dimensions.height}`;
}

export function buildGrokRelayMultipart(input: {
  apiBaseUrl: string;
  modelName: string;
  prompt: string;
  duration: number;
  aspectRatio?: string;
  resolution?: string;
  images?: Array<{ blob: Blob; filename: string }>;
  videos?: Array<{ blob: Blob; filename: string }>;
  mode?: string;
}) {
  const form = new FormData();
  const requestDuration = documentedGrokDuration(input.modelName, input.duration);
  const normalizedRatio = normalizeVideoAspectRatio(input.aspectRatio);
  const normalizedResolution = normalizeVideoResolution(input.resolution);
  const dimensions = mapVideoDimensions(input.aspectRatio, input.resolution);
  const pixelSize = grokVideoSize(input.aspectRatio, input.resolution);
  form.set("model", input.modelName);
  form.set("prompt", input.prompt);
  form.set("aspect_ratio", normalizedRatio);
  form.set("seconds", String(requestDuration));
  form.set("size", pixelSize);
  form.set("aspectRatio", normalizedRatio);
  form.set("ratio", normalizedRatio);
  form.set("duration", String(requestDuration));
  form.set("resolution", normalizedResolution);
  form.set("width", String(dimensions.width));
  form.set("height", String(dimensions.height));
  form.set("dimensions", pixelSize);
  for (const file of input.images ?? []) form.append("input_reference", file.blob, file.filename);
  for (const file of input.videos ?? []) form.append("input_video", file.blob, file.filename);
  if (input.mode === "video_extension") form.set("mode", "extend");
  return form;
}

async function downloadGrokResult(input: {
  remoteUrl?: string;
  pollEndpoint: string;
  apiKey: string;
  allowContentFallback: boolean;
}) {
  if (input.remoteUrl) {
    if (!input.allowContentFallback) return downloadGeneratedVideoOrUseRemote(input.remoteUrl, "video_grok");
    try {
      return await downloadGeneratedFile(input.remoteUrl, "video_grok");
    } catch (error) {
      if (!input.allowContentFallback) throw error;
    }
  } else if (!input.allowContentFallback) {
    throw new ProviderError("VEO_OPERATION_NO_VIDEO_IN_RESPONSE", "Grok 任务已完成，但响应中没有视频 URL。");
  }

  const contentEndpoint = `${input.pollEndpoint.replace(/\/+$/g, "")}/content`;
  const response = await fetch(contentEndpoint, { headers: { Authorization: `Bearer ${input.apiKey}` } });
  if (!response.ok) {
    throw new ProviderError(
      "VEO_OPERATION_NO_VIDEO_IN_RESPONSE",
      `Grok 任务已完成，但视频地址和内容下载接口均不可用（HTTP ${response.status}）。`,
      await response.text()
    );
  }
  const buffer = Buffer.from(await response.arrayBuffer());
  if (!buffer.length) throw new ProviderError("VEO_VIDEO_FILE_EMPTY", "Grok 内容下载接口返回了空视频文件。");
  return saveGeneratedBuffer({
    buffer,
    prefix: "video_grok",
    contentType: response.headers.get("content-type")
  });
}

async function pollGrokTask(input: {
  apiBaseUrl: string;
  apiKey: string;
  requestId: string;
  preferredEndpoint: string;
  createdAt: number;
}) {
  const endpoints = uniqueValues([input.preferredEndpoint, ...grokPollEndpointCandidates(input.apiBaseUrl, input.requestId)]);
  let lastPayload: Record<string, unknown> | undefined;
  let lastStatus = 0;
  let sawTaskNotExist = false;
  let lastNetworkError: unknown;

  for (const endpoint of endpoints) {
    let response: Response;
    try {
      response = await fetch(endpoint, {
        headers: { Authorization: `Bearer ${input.apiKey}` }
      });
    } catch (error) {
      lastNetworkError = error;
      console.warn("[Grok Video] poll transport interrupted; trying fallback endpoint", {
        requestId: input.requestId,
        endpoint,
        message: rawErrorMessage(error)
      });
      continue;
    }
    const task = await responseJson(response);
    lastPayload = task;
    lastStatus = response.status;
    if (response.ok && !isTaskNotExist(task)) {
      return { task, endpoint };
    }
    if (isTaskNotExist(task)) {
      sawTaskNotExist = true;
      console.warn("[Grok Video] task lookup missed; trying fallback poll endpoint", {
        requestId: input.requestId,
        endpoint,
        status: response.status
      });
      continue;
    }
    if (!response.ok) {
      throw new ProviderError("PROVIDER_ERROR", `Grok 视频任务查询失败：${errorMessage(task)}`, JSON.stringify(task));
    }
  }

  if (sawTaskNotExist && Date.now() - input.createdAt < 90 * 1000) {
    return { task: lastPayload ?? { status: "submitted", message: "task_not_exist" }, endpoint: input.preferredEndpoint, transientTaskMiss: true };
  }

  if (lastNetworkError && !lastPayload) throw lastNetworkError;

  throw new ProviderError(
    "PROVIDER_ERROR",
    `Grok 视频任务查询失败：${lastPayload ? errorMessage(lastPayload) : "task_not_exist"}`,
    lastPayload ? JSON.stringify({ httpStatus: lastStatus, response: lastPayload, triedPollEndpoints: endpoints }) : JSON.stringify({ triedPollEndpoints: endpoints })
  );
}

export async function generateVideoWithGrok(params: VideoProviderParams): Promise<ProviderGenerateResult> {
  const mode = params.videoMode ?? legacyInputModeToOfficialMode(params.inputMode, "grok");
  if (!["text_to_video", "image_to_video_first_frame", "image_to_video_first_last_frame", "reference_images_to_video", "video_edit", "video_extension"].includes(mode)) {
    throw new ProviderError("MODEL_MODE_UNSUPPORTED", "Grok 当前支持文生视频、图生视频、首尾帧、参考图生视频、视频编辑和视频延展。");
  }
  if (mode === "reference_images_to_video" && params.duration > 15) {
    throw new ProviderError("MODEL_PARAM_UNSUPPORTED", "Grok 参考图生视频最长支持 15 秒。");
  }

  try {
    const officialEndpoint = isOfficialGrokEndpoint(params.apiBaseUrl);
    const unifiedEndpoint = isUnifiedGrokEndpoint(params.apiBaseUrl);
    const requestModelName = grokRequestModelName(params.modelName, params.apiBaseUrl);
    const requestDuration = documentedGrokDuration(requestModelName, params.duration);
    const jsonTransport = officialEndpoint || unifiedEndpoint;
    const images = jsonTransport ? await assetDataUrls(params.imageAssetIds, params.aspectRatio) : [];
    const videos = jsonTransport ? await assetDataUrls(params.videoAssetIds) : [];
    const relayImages = jsonTransport ? [] : await assetFiles(params.imageAssetIds, params.aspectRatio);
    const relayVideos = jsonTransport ? [] : await assetFiles(params.videoAssetIds);
    const imageCount = jsonTransport ? images.length : relayImages.length;
    const videoCount = jsonTransport ? videos.length : relayVideos.length;
    if (mode === "image_to_video_first_frame" && !imageCount) throw new ProviderError("MISSING_INPUT_ASSET", "Grok 图生视频需要连接一张首帧图片。");
    if (mode === "image_to_video_first_last_frame" && imageCount < 2) throw new ProviderError("MISSING_INPUT_ASSET", "Grok 首尾帧视频需要按顺序连接两张图片。");
    if (mode === "reference_images_to_video" && !imageCount) throw new ProviderError("MISSING_INPUT_ASSET", "Grok 参考图生视频需要连接 1 至 7 张参考图片。");
    if (["video_edit", "video_extension"].includes(mode) && !videoCount) throw new ProviderError("MISSING_VIDEO_INPUT", "Grok 视频编辑或延展需要连接一个视频素材。");
    const body: Record<string, unknown> = {
      model: requestModelName,
      prompt: params.prompt,
      duration: requestDuration,
      seconds: requestDuration,
      aspect_ratio: normalizeVideoAspectRatio(params.aspectRatio),
      aspectRatio: normalizeVideoAspectRatio(params.aspectRatio),
      ratio: normalizeVideoAspectRatio(params.aspectRatio),
      resolution: normalizeVideoResolution(params.resolution),
      size: grokVideoSize(params.aspectRatio, params.resolution),
      dimensions: grokVideoSize(params.aspectRatio, params.resolution),
      ...mapVideoDimensions(params.aspectRatio, params.resolution)
    };
    if (unifiedEndpoint) body.images = images;
    if (mode === "image_to_video_first_frame" && !unifiedEndpoint) body.image = { url: images[0] };
    if (mode === "image_to_video_first_last_frame" && !unifiedEndpoint) body.reference_images = images.slice(0, 2).map((url) => ({ url }));
    if (mode === "reference_images_to_video") body.reference_images = images.map((url) => ({ url }));
    if (mode === "video_edit") body.video = { url: videos[0] };
    if (mode === "video_extension") {
      body.video = { url: videos[0] };
      body.mode = "extend";
    }

    const endpoint = grokCreateEndpoint(params.apiBaseUrl);
    let requestBody: BodyInit;
    const headers: Record<string, string> = { Authorization: `Bearer ${params.apiKey}` };
    if (jsonTransport) {
      headers["Content-Type"] = "application/json";
      requestBody = JSON.stringify(unifiedEndpoint ? {
        model: requestModelName,
        prompt: params.prompt,
        images,
        aspect_ratio: normalizeVideoAspectRatio(params.aspectRatio),
        size: grokVideoSize(params.aspectRatio, params.resolution),
        duration: requestDuration
      } : body);
    } else {
      requestBody = buildGrokRelayMultipart({
        apiBaseUrl: params.apiBaseUrl,
        modelName: requestModelName,
        prompt: params.prompt,
        duration: requestDuration,
        aspectRatio: params.aspectRatio,
        resolution: params.resolution,
        images: relayImages,
        videos: relayVideos,
        mode
      });
    }
    const response = await fetch(endpoint, { method: "POST", headers, body: requestBody });
    let task = await responseJson(response);
    if (!response.ok) throw new ProviderError("PROVIDER_ERROR", `Grok 视频任务创建失败：${errorMessage(task)}`, JSON.stringify(task));
    const id = requestId(task);
    if (!id) throw new ProviderError("PROVIDER_ERROR", "Grok 视频接口没有返回 request_id。", JSON.stringify(task));
    let pollEndpoint = grokPollEndpoint(params.apiBaseUrl, id);
    await saveGenerationTask({
      id,
      status: status(task) || "submitted",
      progress: taskProgress(task),
      result: { provider: "grok", endpoint, pollEndpoint, pollEndpointCandidates: grokPollEndpointCandidates(params.apiBaseUrl, id), nodeId: params.nodeId, modelConfigId: params.modelConfigId, projectId: params.projectId, modelName: params.modelName, response: task }
    });

    const startedAt = Date.now();
    let pollInterruptions = 0;
    while (!["completed", "succeeded", "success", "done"].includes(status(task))) {
      if (["failed", "error", "cancelled", "canceled"].includes(status(task))) {
        await saveGenerationTask({ id, status: "failed", progress: taskProgress(task), result: task, errorMessage: errorMessage(task) });
        throw new ProviderError("VEO_OPERATION_FAILED", `Grok 视频任务失败：${errorMessage(task)}`, JSON.stringify(task));
      }
      if (Date.now() - startedAt > 20 * 60 * 1000) {
        await saveGenerationTask({ id, status: "timeout", result: task, errorMessage: "Grok 视频任务超过 20 分钟仍未完成。" });
        throw new ProviderError("VEO_OPERATION_TIMEOUT", "Grok 视频任务超过 20 分钟仍未完成。");
      }
      await sleep(5000);
      try {
        const polled = await pollGrokTask({
          apiBaseUrl: params.apiBaseUrl,
          apiKey: params.apiKey,
          requestId: id,
          preferredEndpoint: pollEndpoint,
          createdAt: startedAt
        });
        task = polled.task;
        pollEndpoint = polled.endpoint;
        pollInterruptions = 0;
        await saveGenerationTask({ id, status: status(task) || "processing", progress: taskProgress(task), result: { ...task, pollEndpoint } });
      } catch (pollError) {
        const detail = rawErrorMessage(pollError);
        if (!/fetch failed|network|econn|dns|timeout|socket|other side closed/i.test(detail)) throw pollError;
        pollInterruptions += 1;
        await saveGenerationTask({
          id,
          status: "in_progress",
          progress: taskProgress(task),
          result: { ...task, pollEndpoint, pendingAfterPollInterruption: true, pollInterruptions, pollWarning: "上游任务查询连接暂时中断，系统正在继续恢复。" }
        });
        await sleep(Math.min(15_000, 3_000 + pollInterruptions * 2_000));
      }
    }

    const remoteUrl = videoUrl(task);
    await saveGenerationTask({ id, status: "success", progress: 100, result: { ...task, pollEndpoint } });
    const saved = await downloadGrokResult({
      remoteUrl,
      pollEndpoint,
      apiKey: params.apiKey,
      allowContentFallback: !officialEndpoint && !unifiedEndpoint && /\/videos\//i.test(pollEndpoint)
    });
    return {
      status: "success",
      outputUrl: saved.outputUrl,
      localPath: saved.localPath,
      rawResponse: task,
      payloadSummary: { endpoint, requestId: id, model: requestModelName, configuredModel: params.modelName, seconds: requestDuration, size: grokVideoSize(params.aspectRatio, params.resolution), mode, protocol: officialEndpoint ? "xai-official-json" : "relay-multipart" }
    };
  } catch (error) {
    if (error instanceof ProviderError) throw error;
    const message = rawErrorMessage(error);
    if (/fetch failed|network|econn|dns|timeout/i.test(message)) {
      throw new ProviderError("NETWORK_ERROR", "未能取得 Grok 上游任务回执，请稍后重试或切换线路。", message);
    }
    throw new ProviderError("PROVIDER_ERROR", "Grok 视频接口调用失败。", message);
  }
}
