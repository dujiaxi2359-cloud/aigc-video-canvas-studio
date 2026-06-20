import fs from "node:fs";
import path from "node:path";
import { legacyInputModeToOfficialMode } from "../../types/videoModes.js";
import { downloadGeneratedFile } from "../../utils/downloadGeneratedFile.js";
import { ProviderError, rawErrorMessage } from "../../utils/providerErrors.js";
import { mapVideoDimensions, mapVideoSize, normalizeVideoAspectRatio, normalizeVideoResolution } from "../../utils/videoParams.js";
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
  if (/\/(?:video\/generations|videos\/generations|videos)$/i.test(base)) return base;
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
  if (/\/videos\/generations$/i.test(createEndpoint)) {
    return `${createEndpoint.replace(/\/videos\/generations$/i, "")}/videos/${encodeURIComponent(requestId)}`;
  }
  return `${createEndpoint}/${encodeURIComponent(requestId)}`;
}

export function isOfficialGrokEndpoint(apiBaseUrl: string) {
  try {
    return new URL(baseUrl(apiBaseUrl)).hostname === "api.x.ai";
  } catch {
    return /api\.x\.ai/i.test(apiBaseUrl);
  }
}

export function grokRequestModelName(modelName: string, apiBaseUrl: string) {
  return modelName;
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
  return [payload.request_id, payload.id, data.request_id, data.id].find((value) => typeof value === "string") as string | undefined;
}

function status(payload: Record<string, unknown>) {
  const data = record(payload.data);
  const value = payload.status ?? payload.state ?? data.status ?? data.state;
  return typeof value === "string" ? value.toLowerCase() : "";
}

function errorMessage(payload: Record<string, unknown>) {
  const error = record(payload.error);
  const message = String(error.message ?? payload.message ?? payload.error ?? "未知错误");
  if (/orchestration-service|name or service not known|cannot connect to host|ssl:|getaddrinfo|service unavailable/i.test(message)) {
    return "Grok 中转商内部服务暂时不可达，请稍后重试或切换其他视频通道。";
  }
  return message;
}

function videoUrl(payload: Record<string, unknown>): string | undefined {
  const data = record(payload.data);
  const video = record(payload.video);
  const output = record(payload.output);
  const candidates = [
    video.url,
    payload.video_url,
    payload.url,
    output.url,
    data.video_url,
    data.url,
    record(data.video).url
  ];
  return candidates.find((value) => typeof value === "string" && /^https?:\/\//i.test(value)) as string | undefined;
}

export async function generateVideoWithGrok(params: VideoProviderParams): Promise<ProviderGenerateResult> {
  const mode = params.videoMode ?? legacyInputModeToOfficialMode(params.inputMode, "grok");
  if (!["text_to_video", "image_to_video_first_frame", "reference_images_to_video", "video_edit", "video_extension"].includes(mode)) {
    throw new ProviderError("MODEL_MODE_UNSUPPORTED", "Grok 当前支持文生视频、图生视频、参考图生视频、视频编辑和视频延展。");
  }
  if (mode === "reference_images_to_video" && params.duration > 15) {
    throw new ProviderError("MODEL_PARAM_UNSUPPORTED", "Grok 参考图生视频最长支持 15 秒。");
  }

  try {
    const officialEndpoint = isOfficialGrokEndpoint(params.apiBaseUrl);
    const requestModelName = grokRequestModelName(params.modelName, params.apiBaseUrl);
    const images = officialEndpoint ? await assetDataUrls(params.imageAssetIds, params.aspectRatio) : [];
    const videos = officialEndpoint ? await assetDataUrls(params.videoAssetIds) : [];
    const relayImages = officialEndpoint ? [] : await assetFiles(params.imageAssetIds, params.aspectRatio);
    const relayVideos = officialEndpoint ? [] : await assetFiles(params.videoAssetIds);
    const imageCount = officialEndpoint ? images.length : relayImages.length;
    const videoCount = officialEndpoint ? videos.length : relayVideos.length;
    if (mode === "image_to_video_first_frame" && !imageCount) throw new ProviderError("MISSING_INPUT_ASSET", "Grok 图生视频需要连接一张首帧图片。");
    if (mode === "reference_images_to_video" && !imageCount) throw new ProviderError("MISSING_INPUT_ASSET", "Grok 参考图生视频需要连接 1 至 7 张参考图片。");
    if (["video_edit", "video_extension"].includes(mode) && !videoCount) throw new ProviderError("MISSING_VIDEO_INPUT", "Grok 视频编辑或延展需要连接一个视频素材。");
    const body: Record<string, unknown> = {
      model: requestModelName,
      prompt: params.prompt,
      duration: params.duration,
      seconds: params.duration,
      aspect_ratio: normalizeVideoAspectRatio(params.aspectRatio),
      aspectRatio: normalizeVideoAspectRatio(params.aspectRatio),
      ratio: normalizeVideoAspectRatio(params.aspectRatio),
      resolution: normalizeVideoResolution(params.resolution),
      size: normalizeVideoResolution(params.resolution),
      dimensions: mapVideoSize(params.aspectRatio, params.resolution),
      ...mapVideoDimensions(params.aspectRatio, params.resolution)
    };
    if (mode === "image_to_video_first_frame") body.image = { url: images[0] };
    if (mode === "reference_images_to_video") body.reference_images = images.map((url) => ({ url }));
    if (mode === "video_edit") body.video = { url: videos[0] };
    if (mode === "video_extension") {
      body.video = { url: videos[0] };
      body.mode = "extend";
    }

    const endpoint = grokCreateEndpoint(params.apiBaseUrl);
    let requestBody: BodyInit;
    const headers: Record<string, string> = { Authorization: `Bearer ${params.apiKey}` };
    if (officialEndpoint) {
      headers["Content-Type"] = "application/json";
      requestBody = JSON.stringify(body);
    } else {
      const form = new FormData();
      form.set("model", requestModelName);
      form.set("prompt", params.prompt);
      const normalizedRatio = normalizeVideoAspectRatio(params.aspectRatio);
      const normalizedResolution = normalizeVideoResolution(params.resolution);
      const dimensions = mapVideoDimensions(params.aspectRatio, params.resolution);
      form.set("aspect_ratio", normalizedRatio);
      form.set("aspectRatio", normalizedRatio);
      form.set("ratio", normalizedRatio);
      form.set("seconds", String(params.duration));
      form.set("duration", String(params.duration));
      form.set("size", normalizedResolution);
      form.set("resolution", normalizedResolution);
      form.set("width", String(dimensions.width));
      form.set("height", String(dimensions.height));
      form.set("dimensions", mapVideoSize(params.aspectRatio, params.resolution));
      for (const file of relayImages) form.append("input_reference", file.blob, file.filename);
      for (const file of relayVideos) form.append("input_video", file.blob, file.filename);
      if (mode === "video_extension") form.set("mode", "extend");
      requestBody = form;
    }
    const response = await fetch(endpoint, { method: "POST", headers, body: requestBody });
    let task = await responseJson(response);
    if (!response.ok) throw new ProviderError("PROVIDER_ERROR", `Grok 视频任务创建失败：${errorMessage(task)}`, JSON.stringify(task));
    const id = requestId(task);
    if (!id) throw new ProviderError("PROVIDER_ERROR", "Grok 视频接口没有返回 request_id。", JSON.stringify(task));
    const pollEndpoint = grokPollEndpoint(params.apiBaseUrl, id);
    await saveGenerationTask({
      id,
      status: status(task) || "submitted",
      result: { provider: "grok", endpoint, pollEndpoint, nodeId: params.nodeId, modelName: params.modelName, response: task }
    });

    const startedAt = Date.now();
    while (!["completed", "succeeded", "success", "done"].includes(status(task))) {
      if (["failed", "error", "cancelled", "canceled"].includes(status(task))) {
        await saveGenerationTask({ id, status: "failed", result: task, errorMessage: errorMessage(task) });
        throw new ProviderError("VEO_OPERATION_FAILED", `Grok 视频任务失败：${errorMessage(task)}`, JSON.stringify(task));
      }
      if (Date.now() - startedAt > 20 * 60 * 1000) {
        await saveGenerationTask({ id, status: "timeout", result: task, errorMessage: "Grok 视频任务超过 20 分钟仍未完成。" });
        throw new ProviderError("VEO_OPERATION_TIMEOUT", "Grok 视频任务超过 20 分钟仍未完成。");
      }
      await sleep(5000);
      const pollResponse = await fetch(pollEndpoint, {
        headers: { Authorization: `Bearer ${params.apiKey}` }
      });
      task = await responseJson(pollResponse);
      await saveGenerationTask({ id, status: status(task) || "processing", result: task });
      if (!pollResponse.ok) throw new ProviderError("PROVIDER_ERROR", `Grok 视频任务查询失败：${errorMessage(task)}`, JSON.stringify(task));
    }

    const remoteUrl = videoUrl(task);
    if (!remoteUrl) throw new ProviderError("VEO_OPERATION_NO_VIDEO_IN_RESPONSE", "Grok 任务已完成，但响应中没有视频 URL。", JSON.stringify(task));
    await saveGenerationTask({ id, status: "success", progress: 100, result: task });
    const saved = await downloadGeneratedFile(remoteUrl, "video_grok");
    return {
      status: "success",
      outputUrl: saved.outputUrl,
      localPath: saved.localPath,
      rawResponse: task,
      payloadSummary: { endpoint, requestId: id, model: requestModelName, configuredModel: params.modelName, mode, protocol: officialEndpoint ? "xai-official-json" : "relay-multipart" }
    };
  } catch (error) {
    if (error instanceof ProviderError) throw error;
    const message = rawErrorMessage(error);
    if (/fetch failed|network|econn|dns|timeout/i.test(message)) {
      throw new ProviderError("NETWORK_ERROR", "Grok 视频接口网络请求失败，请检查 Base URL、代理和 xAI 服务状态。", message);
    }
    throw new ProviderError("PROVIDER_ERROR", "Grok 视频接口调用失败。", message);
  }
}
