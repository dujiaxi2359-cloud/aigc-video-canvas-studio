import crypto from "node:crypto";
import fs from "node:fs";
import { legacyInputModeToOfficialMode, type OfficialVideoMode } from "../../types/videoModes.js";
import { downloadGeneratedFile } from "../../utils/downloadGeneratedFile.js";
import { ProviderError, rawErrorMessage } from "../../utils/providerErrors.js";
import { getAsset } from "../asset.service.js";
import type { ProviderGenerateResult, VideoProviderParams } from "./providerTypes.js";

function sleep(ms: number) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

function base64Url(value: string | Buffer) {
  return Buffer.from(value).toString("base64url");
}

export function klingBearerToken(apiKey: string, timestamp = Math.floor(Date.now() / 1000)) {
  const separator = apiKey.indexOf(":");
  if (separator < 1) return apiKey;
  const accessKey = apiKey.slice(0, separator).trim();
  const secretKey = apiKey.slice(separator + 1).trim();
  if (!accessKey || !secretKey) throw new ProviderError("API_KEY_INVALID", "可灵官方 API Key 请填写为 AccessKey:SecretKey。");
  const header = base64Url(JSON.stringify({ alg: "HS256", typ: "JWT" }));
  const payload = base64Url(JSON.stringify({ iss: accessKey, exp: timestamp + 1800, nbf: timestamp - 5 }));
  const signature = crypto.createHmac("sha256", secretKey).update(`${header}.${payload}`).digest("base64url");
  return `${header}.${payload}.${signature}`;
}

async function imageBase64(assetIds?: string[]) {
  const images: string[] = [];
  for (const assetId of assetIds ?? []) {
    const asset = await getAsset(assetId);
    if (!asset?.localPath || !fs.existsSync(asset.localPath)) {
      throw new ProviderError("MISSING_INPUT_ASSET", "可灵引用的图片素材不存在。");
    }
    images.push(fs.readFileSync(asset.localPath).toString("base64"));
  }
  return images;
}

function routeForMode(mode: OfficialVideoMode) {
  if (mode === "text_to_video") return "text2video";
  if (mode === "reference_images_to_video") return "multi-image2video";
  return "image2video";
}

export function klingCreateEndpoint(apiBaseUrl: string, mode: OfficialVideoMode) {
  const base = apiBaseUrl.replace(/\/$/, "");
  if (/\/v1\/videos\/(?:text2video|image2video|multi-image2video)$/i.test(base)) return base;
  return `${base}${/\/v1$/i.test(base) ? "" : "/v1"}/videos/${routeForMode(mode)}`;
}

function record(value: unknown) {
  return value && typeof value === "object" ? value as Record<string, unknown> : {};
}

async function responseJson(response: Response) {
  const text = await response.text();
  try {
    return JSON.parse(text) as Record<string, unknown>;
  } catch {
    throw new ProviderError("PROVIDER_ERROR", `可灵接口返回了无法解析的响应（HTTP ${response.status}）。`, text.slice(0, 1000));
  }
}

function taskId(payload: Record<string, unknown>) {
  const data = record(payload.data);
  return [payload.task_id, payload.id, data.task_id, data.id].find((value) => typeof value === "string") as string | undefined;
}

function taskStatus(payload: Record<string, unknown>) {
  const data = record(payload.data);
  const value = payload.task_status ?? payload.status ?? data.task_status ?? data.status;
  return typeof value === "string" ? value.toLowerCase() : "";
}

function errorMessage(payload: Record<string, unknown>) {
  const data = record(payload.data);
  return String(payload.message ?? data.task_status_msg ?? payload.error ?? "未知错误");
}

function resultVideoUrl(payload: Record<string, unknown>) {
  const data = record(payload.data);
  const result = record(data.task_result ?? payload.task_result);
  const videos = Array.isArray(result.videos) ? result.videos : [];
  const first = record(videos[0]);
  return [first.url, result.video_url, data.video_url, payload.video_url].find(
    (value) => typeof value === "string" && /^https?:\/\//i.test(value)
  ) as string | undefined;
}

export async function generateVideoWithKling(params: VideoProviderParams): Promise<ProviderGenerateResult> {
  const mode = params.videoMode ?? legacyInputModeToOfficialMode(params.inputMode, "kling");
  if (!["text_to_video", "image_to_video_first_frame", "image_to_video_first_last_frame", "reference_images_to_video"].includes(mode)) {
    throw new ProviderError("MODEL_MODE_UNSUPPORTED", "可灵当前适配器支持文生视频、图生视频、首尾帧和多图参考生视频。");
  }

  try {
    const images = await imageBase64(params.imageAssetIds);
    if (mode === "image_to_video_first_frame" && !images[0]) throw new ProviderError("MISSING_INPUT_ASSET", "可灵图生视频需要连接一张首帧图片。");
    if (mode === "image_to_video_first_last_frame" && images.length < 2) throw new ProviderError("MISSING_INPUT_ASSET", "可灵首尾帧模式需要连接首帧和尾帧两张图片。");
    if (mode === "reference_images_to_video" && !images.length) throw new ProviderError("MISSING_INPUT_ASSET", "可灵多图参考模式需要连接 1 至 4 张参考图片。");
    const endpoint = klingCreateEndpoint(params.apiBaseUrl, mode);
    const body: Record<string, unknown> = {
      model_name: params.modelName,
      prompt: params.prompt,
      negative_prompt: params.negativePrompt,
      duration: String(params.duration),
      aspect_ratio: params.aspectRatio,
      mode: params.resolution.toLowerCase() === "1080p" ? "pro" : "std"
    };
    if (mode === "image_to_video_first_frame") body.image = images[0];
    if (mode === "image_to_video_first_last_frame") {
      body.image = images[0];
      body.image_tail = images[1];
    }
    if (mode === "reference_images_to_video") {
      body.image_list = images.map((image) => ({ image }));
    }

    const token = klingBearerToken(params.apiKey);
    const response = await fetch(endpoint, {
      method: "POST",
      headers: { Authorization: `Bearer ${token}`, "Content-Type": "application/json" },
      body: JSON.stringify(body)
    });
    let task = await responseJson(response);
    if (!response.ok || (typeof task.code === "number" && task.code !== 0)) {
      throw new ProviderError("PROVIDER_ERROR", `可灵视频任务创建失败：${errorMessage(task)}`, JSON.stringify(task));
    }
    const id = taskId(task);
    if (!id) throw new ProviderError("PROVIDER_ERROR", "可灵接口没有返回 task_id。", JSON.stringify(task));
    const pollEndpoint = `${endpoint}/${encodeURIComponent(id)}`;

    const startedAt = Date.now();
    while (!["succeed", "succeeded", "success", "completed", "done"].includes(taskStatus(task))) {
      if (["failed", "error", "cancelled", "canceled"].includes(taskStatus(task))) {
        throw new ProviderError("VEO_OPERATION_FAILED", `可灵视频任务失败：${errorMessage(task)}`, JSON.stringify(task));
      }
      if (Date.now() - startedAt > 20 * 60 * 1000) {
        throw new ProviderError("VEO_OPERATION_TIMEOUT", "可灵视频任务超过 20 分钟仍未完成。");
      }
      await sleep(5000);
      const pollResponse = await fetch(pollEndpoint, { headers: { Authorization: `Bearer ${klingBearerToken(params.apiKey)}` } });
      task = await responseJson(pollResponse);
      if (!pollResponse.ok) throw new ProviderError("PROVIDER_ERROR", `可灵视频任务查询失败：${errorMessage(task)}`, JSON.stringify(task));
    }

    const remoteUrl = resultVideoUrl(task);
    if (!remoteUrl) throw new ProviderError("VEO_OPERATION_NO_VIDEO_IN_RESPONSE", "可灵任务已完成，但响应中没有视频 URL。", JSON.stringify(task));
    const saved = await downloadGeneratedFile(remoteUrl, "video_kling");
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
      throw new ProviderError("NETWORK_ERROR", "可灵视频接口网络请求失败，请检查 Base URL、网络和可灵服务状态。", message);
    }
    throw new ProviderError("PROVIDER_ERROR", "可灵视频接口调用失败。", message);
  }
}
