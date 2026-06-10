import fs from "node:fs";
import path from "node:path";
import { legacyInputModeToOfficialMode } from "../../types/videoModes.js";
import { downloadGeneratedFile } from "../../utils/downloadGeneratedFile.js";
import { ProviderError, rawErrorMessage } from "../../utils/providerErrors.js";
import { getAsset } from "../asset.service.js";
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

async function assetDataUrls(assetIds?: string[]) {
  const urls: string[] = [];
  for (const assetId of assetIds ?? []) {
    const asset = await getAsset(assetId);
    if (!asset?.localPath || !fs.existsSync(asset.localPath)) {
      throw new ProviderError("MISSING_INPUT_ASSET", "Grok 引用的图片或视频素材不存在。");
    }
    urls.push(`data:${mimeType(asset.localPath, asset.mimeType)};base64,${fs.readFileSync(asset.localPath).toString("base64")}`);
  }
  return urls;
}

function baseUrl(value: string) {
  return value.replace(/\/$/, "");
}

export function grokCreateEndpoint(apiBaseUrl: string) {
  const base = baseUrl(apiBaseUrl);
  return /\/videos\/generations$/i.test(base) ? base : `${base}/videos/generations`;
}

export function grokPollEndpoint(apiBaseUrl: string, requestId: string) {
  const base = baseUrl(apiBaseUrl).replace(/\/videos\/generations$/i, "");
  return `${base}/videos/${encodeURIComponent(requestId)}`;
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
  return String(error.message ?? payload.message ?? payload.error ?? "未知错误");
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
  if (mode === "reference_images_to_video" && params.duration > 10) {
    throw new ProviderError("MODEL_PARAM_UNSUPPORTED", "Grok 参考图生视频最长支持 10 秒。");
  }

  try {
    const images = await assetDataUrls(params.imageAssetIds);
    const videos = await assetDataUrls(params.videoAssetIds);
    if (mode === "image_to_video_first_frame" && !images[0]) throw new ProviderError("MISSING_INPUT_ASSET", "Grok 图生视频需要连接一张首帧图片。");
    if (mode === "reference_images_to_video" && !images.length) throw new ProviderError("MISSING_INPUT_ASSET", "Grok 参考图生视频需要连接 1 至 7 张参考图片。");
    if (["video_edit", "video_extension"].includes(mode) && !videos[0]) throw new ProviderError("MISSING_VIDEO_INPUT", "Grok 视频编辑或延展需要连接一个视频素材。");
    const body: Record<string, unknown> = {
      model: params.modelName,
      prompt: params.prompt,
      duration: params.duration,
      aspect_ratio: params.aspectRatio,
      resolution: params.resolution.toLowerCase()
    };
    if (mode === "image_to_video_first_frame") body.image = { url: images[0] };
    if (mode === "reference_images_to_video") body.reference_images = images.map((url) => ({ url }));
    if (mode === "video_edit") body.video = { url: videos[0] };
    if (mode === "video_extension") {
      body.video = { url: videos[0] };
      body.mode = "extend";
    }

    const endpoint = grokCreateEndpoint(params.apiBaseUrl);
    const response = await fetch(endpoint, {
      method: "POST",
      headers: { Authorization: `Bearer ${params.apiKey}`, "Content-Type": "application/json" },
      body: JSON.stringify(body)
    });
    let task = await responseJson(response);
    if (!response.ok) throw new ProviderError("PROVIDER_ERROR", `Grok 视频任务创建失败：${errorMessage(task)}`, JSON.stringify(task));
    const id = requestId(task);
    if (!id) throw new ProviderError("PROVIDER_ERROR", "Grok 视频接口没有返回 request_id。", JSON.stringify(task));

    const startedAt = Date.now();
    while (!["completed", "succeeded", "success", "done"].includes(status(task))) {
      if (["failed", "error", "cancelled", "canceled"].includes(status(task))) {
        throw new ProviderError("VEO_OPERATION_FAILED", `Grok 视频任务失败：${errorMessage(task)}`, JSON.stringify(task));
      }
      if (Date.now() - startedAt > 20 * 60 * 1000) {
        throw new ProviderError("VEO_OPERATION_TIMEOUT", "Grok 视频任务超过 20 分钟仍未完成。");
      }
      await sleep(5000);
      const pollResponse = await fetch(grokPollEndpoint(params.apiBaseUrl, id), {
        headers: { Authorization: `Bearer ${params.apiKey}` }
      });
      task = await responseJson(pollResponse);
      if (!pollResponse.ok) throw new ProviderError("PROVIDER_ERROR", `Grok 视频任务查询失败：${errorMessage(task)}`, JSON.stringify(task));
    }

    const remoteUrl = videoUrl(task);
    if (!remoteUrl) throw new ProviderError("VEO_OPERATION_NO_VIDEO_IN_RESPONSE", "Grok 任务已完成，但响应中没有视频 URL。", JSON.stringify(task));
    const saved = await downloadGeneratedFile(remoteUrl, "video_grok");
    return {
      status: "success",
      outputUrl: saved.outputUrl,
      localPath: saved.localPath,
      rawResponse: task,
      payloadSummary: { endpoint, requestId: id, model: params.modelName, mode }
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
