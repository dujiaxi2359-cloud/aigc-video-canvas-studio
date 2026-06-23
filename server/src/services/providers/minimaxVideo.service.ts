import fs from "node:fs";
import path from "node:path";
import { legacyInputModeToOfficialMode, type OfficialVideoMode } from "../../types/videoModes.js";
import { downloadGeneratedVideoOrUseRemote } from "../../utils/downloadGeneratedFile.js";
import { ProviderError, rawErrorMessage } from "../../utils/providerErrors.js";
import { getAsset } from "../asset.service.js";
import { ensureAssetLocalFile } from "../assets/ensureAssetLocalFile.service.js";
import { prepareVideoFrameForAspectRatio } from "../assets/prepareVideoFrame.service.js";
import { resolveRemoteAsset } from "../assets/resolveRemoteAsset.service.js";
import { saveGenerationTask } from "../generationTask.service.js";
import { joinUrl } from "./videoRequestAdapter.js";
import type { ProviderGenerateResult, VideoProviderParams } from "./providerTypes.js";

function sleep(ms: number) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

function cleanBase(value: string) {
  return value.trim().replace(/^(?:POST|GET|PUT|PATCH|DELETE)\s+/i, "").replace(/\/+$/g, "");
}

function endpointRoot(apiBaseUrl: string) {
  return cleanBase(apiBaseUrl)
    .replace(/\/v1\/video_generation$/i, "")
    .replace(/\/v1\/query\/video_generation$/i, "")
    .replace(/\/v1\/files\/retrieve$/i, "")
    .replace(/\/v1$/i, "");
}

function unique(values: Array<string | undefined>) {
  return Array.from(new Set(values.filter(Boolean) as string[]));
}

export function minimaxCreateEndpoint(apiBaseUrl: string) {
  const base = cleanBase(apiBaseUrl);
  if (/\/v1\/video_generation$/i.test(base)) return base;
  if (/\/v1$/i.test(base)) return `${base}/video_generation`;
  return joinUrl(base, "/v1/video_generation");
}

export function minimaxCreateEndpointCandidates(apiBaseUrl: string) {
  const root = endpointRoot(apiBaseUrl);
  return unique([
    minimaxCreateEndpoint(apiBaseUrl),
    joinUrl(root, "/v1/video_generation"),
    joinUrl(root, "/video_generation"),
    joinUrl(root, "/v1/videos"),
    joinUrl(root, "/v1/video/create")
  ]);
}

export function minimaxQueryEndpoint(apiBaseUrl: string, taskId: string) {
  const base = cleanBase(apiBaseUrl);
  const endpoint = /\/v1\/query\/video_generation$/i.test(base)
    ? base
    : joinUrl(endpointRoot(apiBaseUrl), "/v1/query/video_generation");
  const url = new URL(endpoint);
  url.search = "";
  url.searchParams.set("task_id", taskId);
  return url.toString();
}

export function minimaxQueryEndpointCandidates(apiBaseUrl: string, taskId: string) {
  const root = endpointRoot(apiBaseUrl);
  const encoded = encodeURIComponent(taskId);
  return unique([
    minimaxQueryEndpoint(apiBaseUrl, taskId),
    `${joinUrl(root, "/v1/videos")}/${encoded}`,
    `${joinUrl(root, "/v1/video/query")}?id=${encoded}`,
    `${joinUrl(root, "/v1/video/generations")}/${encoded}`
  ]);
}

export function minimaxRetrieveEndpoint(apiBaseUrl: string, fileId: string) {
  const endpoint = joinUrl(endpointRoot(apiBaseUrl), "/v1/files/retrieve");
  const url = new URL(endpoint);
  url.search = "";
  url.searchParams.set("file_id", fileId);
  return url.toString();
}

function record(value: unknown) {
  return value && typeof value === "object" ? value as Record<string, unknown> : {};
}

function stringAt(payload: Record<string, unknown>, pathKeys: string[]) {
  let current: unknown = payload;
  for (const key of pathKeys) current = record(current)[key];
  return typeof current === "string" ? current : undefined;
}

function firstString(payload: Record<string, unknown>, paths: string[][]) {
  return paths.map((item) => stringAt(payload, item)).find((value) => value && value.trim());
}

function taskId(payload: Record<string, unknown>) {
  return firstString(payload, [["task_id"], ["id"], ["data", "task_id"], ["data", "id"], ["result", "task_id"], ["result", "id"]]);
}

function fileId(payload: Record<string, unknown>) {
  const value = firstString(payload, [["file_id"], ["data", "file_id"], ["result", "file_id"], ["output", "file_id"]]);
  if (value) return value;
  const numeric = [payload.file_id, record(payload.data).file_id, record(payload.result).file_id].find((item) => typeof item === "number");
  return typeof numeric === "number" ? String(numeric) : undefined;
}

function status(payload: Record<string, unknown>) {
  const value = firstString(payload, [["status"], ["state"], ["data", "status"], ["data", "state"], ["result", "status"]]);
  return value?.toLowerCase() ?? "";
}

function baseRespMessage(payload: Record<string, unknown>) {
  const baseResp = record(payload.base_resp);
  return String(baseResp.status_msg ?? payload.message ?? record(payload.error).message ?? payload.error_message ?? payload.error ?? "未知错误");
}

function isFailed(payload: Record<string, unknown>) {
  const current = status(payload);
  return ["fail", "failed", "error", "cancelled", "canceled"].includes(current);
}

function isSucceeded(payload: Record<string, unknown>) {
  const current = status(payload);
  return ["success", "succeeded", "completed", "done"].includes(current);
}

function responseVideoUrl(payload: unknown): string | undefined {
  if (!payload) return undefined;
  if (typeof payload === "string") return /^https?:\/\//i.test(payload) ? payload : undefined;
  if (Array.isArray(payload)) {
    for (const item of payload) {
      const found = responseVideoUrl(item);
      if (found) return found;
    }
    return undefined;
  }
  const item = record(payload);
  const direct = [
    item.video_url,
    item.output_url,
    item.download_url,
    item.url,
    record(item.video).url,
    record(item.file).download_url,
    record(item.output).url,
    record(item.result).video_url,
    record(item.result).url,
    record(item.data).video_url,
    record(item.data).url,
    record(record(item.data).video).url
  ].find((value) => typeof value === "string" && /^https?:\/\//i.test(value)) as string | undefined;
  if (direct) return direct;
  for (const value of Object.values(item)) {
    const found = responseVideoUrl(value);
    if (found) return found;
  }
  return undefined;
}

async function responseJson(response: Response, providerName: string) {
  const text = await response.text();
  try {
    return JSON.parse(text) as Record<string, unknown>;
  } catch {
    const looksLikeHtml = /^\s*<!doctype html|^\s*<html/i.test(text);
    const message = looksLikeHtml
      ? `${providerName} 接口返回了网页 HTML（HTTP ${response.status}），不是 API JSON。请检查 Base URL 是否为 MiniMax API 或兼容中转地址。`
      : `${providerName} 接口返回了无法解析的响应（HTTP ${response.status}）。`;
    throw new ProviderError("PROVIDER_ERROR", message, text.slice(0, 1000));
  }
}

function mimeTypeFromPath(filePath: string, configured?: string) {
  if (configured) return configured;
  const extension = path.extname(filePath).toLowerCase();
  if (extension === ".png") return "image/png";
  if (extension === ".webp") return "image/webp";
  return "image/jpeg";
}

async function minimaxImageUrls(assetIds?: string[], aspectRatio?: string) {
  const images: string[] = [];
  const audits: Array<Record<string, unknown>> = [];
  for (const assetId of assetIds ?? []) {
    const asset = await ensureAssetLocalFile(await getAsset(assetId), "MiniMax 引用的图片素材");
    const prepared = aspectRatio ? await prepareVideoFrameForAspectRatio(asset.localPath, aspectRatio, "smart_crop") : undefined;
    const inputPath = prepared?.localPath ?? asset.localPath;
    const mimeType = prepared?.transformed ? "image/png" : asset.mimeType || mimeTypeFromPath(inputPath);
    let value: string | undefined;
    let source: string | undefined = asset.localFileSource;
    try {
      const resolved = await resolveRemoteAsset(
        {
          id: asset.id,
          localPath: inputPath,
          url: prepared?.transformed ? undefined : asset.url,
          publicUrl: prepared?.transformed ? undefined : asset.publicUrl,
          filename: asset.originalName,
          originalName: asset.originalName,
          mimeType,
          projectId: asset.projectId,
          storageKey: prepared?.transformed ? undefined : asset.storageKey,
          storageProvider: asset.storageProvider,
          storageBucket: asset.storageBucket,
          storageRegion: asset.storageRegion,
          storageFileType: asset.storageFileType
        },
        "minimax",
        "video-frame",
        {
          strategy: { supportsBase64: true, supportsMultipart: false, supportsPublicUrl: true, prefer: "publicUrl" },
          signedUrlExpiresSeconds: Number(process.env.MINIMAX_ASSET_URL_EXPIRES_SECONDS || 7200)
        }
      );
      if (resolved.type === "url" && resolved.url) {
        value = resolved.url;
        source = resolved.source ?? source;
      } else if (resolved.type === "base64" && resolved.base64) {
        value = `data:${resolved.mimeType};base64,${resolved.base64}`;
        source = resolved.source ?? source;
      }
    } catch (error) {
      console.warn("[minimax image url fallback]", { assetId, reason: rawErrorMessage(error) });
    }
    value ??= `data:${mimeType};base64,${fs.readFileSync(inputPath).toString("base64")}`;
    images.push(value);
    audits.push({
      assetId,
      inputFileSource: source,
      requestedAspectRatio: aspectRatio,
      inputImageWidth: prepared?.width,
      inputImageHeight: prepared?.height,
      frameFitMode: prepared?.fitMode,
      usesOriginalFile: !prepared?.transformed
    });
  }
  return { images, audits };
}

function normalizeResolution(value?: string) {
  const normalized = String(value || "").trim().toUpperCase();
  if (normalized === "1080" || normalized === "1080P") return "1080P";
  if (normalized === "720" || normalized === "720P") return "720P";
  if (normalized === "512" || normalized === "512P") return "512P";
  return "768P";
}

function normalizeDuration(value?: number, resolution?: string) {
  const duration = Number(value || 6);
  if (normalizeResolution(resolution) === "1080P") return 6;
  return duration === 10 ? 10 : 6;
}

export function buildMiniMaxVideoBody(input: {
  params: VideoProviderParams;
  mode: OfficialVideoMode;
  images: string[];
}) {
  const body: Record<string, unknown> = {
    model: input.params.modelName,
    prompt: input.params.prompt,
    duration: normalizeDuration(input.params.duration, input.params.resolution),
    resolution: normalizeResolution(input.params.resolution),
    prompt_optimizer: input.params.promptExtend ?? true
  };
  if (input.mode === "image_to_video_first_frame") body.first_frame_image = input.images[0];
  if (input.mode === "image_to_video_first_last_frame") {
    body.first_frame_image = input.images[0];
    body.last_frame_image = input.images[1];
  }
  if (typeof input.params.seed === "number") body.seed = input.params.seed;
  return body;
}

async function createMiniMaxTask(input: { endpoint: string; params: VideoProviderParams; body: Record<string, unknown> }) {
  const response = await fetch(input.endpoint, {
    method: "POST",
    headers: { Authorization: `Bearer ${input.params.apiKey}`, "Content-Type": "application/json", Accept: "application/json" },
    body: JSON.stringify(input.body)
  });
  const payload = await responseJson(response, "MiniMax");
  const baseResp = record(payload.base_resp);
  if (!response.ok || (typeof baseResp.status_code === "number" && baseResp.status_code !== 0)) {
    throw new ProviderError("PROVIDER_ERROR", `MiniMax 视频任务创建失败：${baseRespMessage(payload)}`, JSON.stringify(payload));
  }
  return payload;
}

async function createWithFallback(params: VideoProviderParams, body: Record<string, unknown>) {
  let lastError: unknown;
  for (const endpoint of minimaxCreateEndpointCandidates(params.apiBaseUrl)) {
    try {
      const payload = await createMiniMaxTask({ endpoint, params, body });
      return { endpoint, payload };
    } catch (error) {
      lastError = error;
      const message = rawErrorMessage(error);
      if (/unauthorized|forbidden|invalid api key|incorrect api key|quota|credit|balance|insufficient|余额|额度|无权限/i.test(message)) throw error;
      console.warn("[minimax endpoint fallback]", { endpoint, reason: message });
    }
  }
  throw lastError instanceof Error ? lastError : new ProviderError("PROVIDER_ERROR", "MiniMax 视频任务创建失败。", String(lastError));
}

async function pollCandidate(endpoint: string, apiKey: string) {
  const response = await fetch(endpoint, { headers: { Authorization: `Bearer ${apiKey}`, Accept: "application/json" } });
  const payload = await responseJson(response, "MiniMax");
  if (!response.ok) throw new ProviderError("PROVIDER_ERROR", `MiniMax 视频任务查询失败：${baseRespMessage(payload)}`, JSON.stringify(payload));
  return payload;
}

async function retrieveVideoUrl(apiBaseUrl: string, apiKey: string, id: string) {
  const endpoint = minimaxRetrieveEndpoint(apiBaseUrl, id);
  const response = await fetch(endpoint, { headers: { Authorization: `Bearer ${apiKey}`, Accept: "application/json" } });
  const payload = await responseJson(response, "MiniMax");
  if (!response.ok) throw new ProviderError("PROVIDER_ERROR", `MiniMax 视频文件下载地址获取失败：${baseRespMessage(payload)}`, JSON.stringify(payload));
  const url = responseVideoUrl(payload);
  if (!url) throw new ProviderError("VEO_OPERATION_NO_VIDEO_IN_RESPONSE", "MiniMax 文件接口没有返回 download_url。", JSON.stringify(payload));
  return { url, payload, endpoint };
}

export async function generateVideoWithMiniMax(params: VideoProviderParams): Promise<ProviderGenerateResult> {
  const mode = params.videoMode ?? legacyInputModeToOfficialMode(params.inputMode, "minimax");
  if (!["text_to_video", "image_to_video_first_frame", "image_to_video_first_last_frame"].includes(mode)) {
    throw new ProviderError("MODEL_MODE_UNSUPPORTED", "MiniMax Hailuo 当前支持文生视频、图生视频和兼容首尾帧请求。");
  }
  if (/fast/i.test(params.modelName) && mode !== "image_to_video_first_frame") {
    throw new ProviderError("MODEL_MODE_UNSUPPORTED", "MiniMax-Hailuo-2.3-Fast 官方主要支持图生视频，请连接首帧图片后使用。");
  }
  const { images, audits } = await minimaxImageUrls(params.imageAssetIds, params.aspectRatio);
  if (mode === "image_to_video_first_frame" && !images[0]) throw new ProviderError("MISSING_INPUT_ASSET", "MiniMax 图生视频需要连接一张首帧图片。");
  if (mode === "image_to_video_first_last_frame" && images.length < 2) throw new ProviderError("MISSING_INPUT_ASSET", "MiniMax 首尾帧模式需要连接首帧和尾帧两张图片。");

  try {
    const body = buildMiniMaxVideoBody({ params, mode, images });
    const created = await createWithFallback(params, body);
    let task = created.payload;
    const directUrl = responseVideoUrl(task);
    const id = taskId(task);
    if (directUrl) {
      const saved = await downloadGeneratedVideoOrUseRemote(directUrl, "video_minimax");
      return { status: "success", outputUrl: saved.outputUrl, localPath: saved.localPath, rawResponse: task, payloadSummary: { endpoint: created.endpoint, model: params.modelName, mode, audits, archiveWarning: saved.archiveWarning } };
    }
    if (!id) throw new ProviderError("PROVIDER_ERROR", "MiniMax 视频接口没有返回 task_id。", JSON.stringify(task));

    await saveGenerationTask({
      id,
      status: status(task) || "submitted",
      result: { provider: "minimax", endpoint: created.endpoint, nodeId: params.nodeId, modelName: params.modelName, requestBody: body, response: task }
    });

    const startedAt = Date.now();
    while (!isSucceeded(task)) {
      if (isFailed(task)) {
        await saveGenerationTask({ id, status: "failed", result: task, errorMessage: baseRespMessage(task) });
        throw new ProviderError("VEO_OPERATION_FAILED", `MiniMax 视频任务失败：${baseRespMessage(task)}`, JSON.stringify(task));
      }
      if (Date.now() - startedAt > Number(process.env.MINIMAX_VIDEO_TIMEOUT_MS || 20 * 60 * 1000)) {
        await saveGenerationTask({ id, status: "timeout", result: task, errorMessage: "MiniMax 视频任务超过 20 分钟仍未完成。" });
        throw new ProviderError("VEO_OPERATION_TIMEOUT", "MiniMax 视频任务超过 20 分钟仍未完成。");
      }
      await sleep(Number(process.env.MINIMAX_VIDEO_POLL_INTERVAL_MS || 10_000));
      let polled: Record<string, unknown> | undefined;
      let lastError: unknown;
      for (const endpoint of minimaxQueryEndpointCandidates(params.apiBaseUrl, id)) {
        try {
          polled = await pollCandidate(endpoint, params.apiKey);
          break;
        } catch (error) {
          lastError = error;
          console.warn("[minimax query fallback]", { endpoint, reason: rawErrorMessage(error) });
        }
      }
      if (!polled) throw lastError instanceof Error ? lastError : new ProviderError("PROVIDER_ERROR", "MiniMax 视频任务查询失败。");
      task = polled;
      await saveGenerationTask({ id, status: status(task) || "processing", result: task });
    }

    const foundUrl = responseVideoUrl(task);
    const foundFileId = fileId(task);
    const remoteUrl = foundUrl || (foundFileId ? (await retrieveVideoUrl(params.apiBaseUrl, params.apiKey, foundFileId)).url : undefined);
    if (!remoteUrl) throw new ProviderError("VEO_OPERATION_NO_VIDEO_IN_RESPONSE", "MiniMax 任务已完成，但没有返回视频 URL 或 file_id。", JSON.stringify(task));
    await saveGenerationTask({ id, status: "success", progress: 100, result: task });
    const saved = await downloadGeneratedVideoOrUseRemote(remoteUrl, "video_minimax");
    return {
      status: "success",
      outputUrl: saved.outputUrl,
      localPath: saved.localPath,
      rawResponse: task,
      payloadSummary: { endpoint: created.endpoint, taskId: id, model: params.modelName, mode, audits, archiveWarning: saved.archiveWarning }
    };
  } catch (error) {
    if (error instanceof ProviderError) throw error;
    const message = rawErrorMessage(error);
    if (/fetch failed|network|econn|dns|timeout/i.test(message)) {
      throw new ProviderError("NETWORK_ERROR", "MiniMax 视频接口网络请求失败，请检查 Base URL、网络和上游服务状态。", message);
    }
    throw new ProviderError("PROVIDER_ERROR", "MiniMax 视频接口调用失败。", message);
  }
}
