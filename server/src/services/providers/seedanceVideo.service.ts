import fs from "node:fs";
import path from "node:path";
import { legacyInputModeToOfficialMode } from "../../types/videoModes.js";
import { downloadGeneratedFile } from "../../utils/downloadGeneratedFile.js";
import { ProviderError, rawErrorMessage } from "../../utils/providerErrors.js";
import { getAsset } from "../asset.service.js";
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

async function assetDataUrls(assetIds?: string[]) {
  const urls: string[] = [];
  for (const assetId of assetIds ?? []) {
    const asset = await getAsset(assetId);
    if (!asset?.localPath || !fs.existsSync(asset.localPath)) {
      throw new ProviderError("MISSING_INPUT_ASSET", "Seedance 引用的图片或视频素材不存在。");
    }
    urls.push(`data:${mimeType(asset.localPath, asset.mimeType)};base64,${fs.readFileSync(asset.localPath).toString("base64")}`);
  }
  return urls;
}

export function seedanceCreateEndpoint(apiBaseUrl: string) {
  const base = apiBaseUrl.replace(/\/$/, "");
  if (/\/video\/generations$/i.test(base) || /\/videos\/generations$/i.test(base)) return base;
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

function videoUrl(payload: Record<string, unknown>): string | undefined {
  const data = record(payload.data);
  const output = record(payload.output);
  const video = record(payload.video);
  const result = record(payload.result);
  const dataOutput = record(data.output);
  const candidates = [
    payload.video_url,
    payload.url,
    video.url,
    output.url,
    output.video_url,
    result.url,
    result.video_url,
    data.video_url,
    data.url,
    record(data.video).url,
    dataOutput.url,
    dataOutput.video_url
  ];
  return candidates.find((value) => typeof value === "string" && /^https?:\/\//i.test(value)) as string | undefined;
}

export async function generateVideoWithSeedance(params: VideoProviderParams): Promise<ProviderGenerateResult> {
  const mode = params.videoMode ?? legacyInputModeToOfficialMode(params.inputMode, "seedance");
  if (!["text_to_video", "image_to_video_first_frame", "reference_images_to_video", "video_edit"].includes(mode)) {
    throw new ProviderError("MODEL_MODE_UNSUPPORTED", "Seedance 中转当前支持文生视频、图生视频、参考图生视频和视频编辑。");
  }

  try {
    const images = await assetDataUrls(params.imageAssetIds);
    const videos = await assetDataUrls(params.videoAssetIds);
    if (["image_to_video_first_frame", "reference_images_to_video"].includes(mode) && !images.length) {
      throw new ProviderError("MISSING_INPUT_ASSET", "Seedance 图生视频需要连接参考图片。");
    }
    if (mode === "video_edit" && !videos.length) {
      throw new ProviderError("MISSING_VIDEO_INPUT", "Seedance 视频编辑需要连接视频素材。");
    }

    const body: Record<string, unknown> = {
      model: params.modelName,
      prompt: params.prompt,
      duration: params.duration,
      seconds: params.duration,
      aspect_ratio: params.aspectRatio,
      resolution: params.resolution.toLowerCase()
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

    if (!remoteUrl) throw new ProviderError("VEO_OPERATION_NO_VIDEO_IN_RESPONSE", "Seedance 中转任务已完成，但响应中没有视频 URL。", JSON.stringify(task));
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
