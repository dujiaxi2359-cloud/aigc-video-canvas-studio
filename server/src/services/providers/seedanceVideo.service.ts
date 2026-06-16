import fs from "node:fs";
import path from "node:path";
import { legacyInputModeToOfficialMode } from "../../types/videoModes.js";
import { downloadGeneratedFile } from "../../utils/downloadGeneratedFile.js";
import { ProviderError, rawErrorMessage } from "../../utils/providerErrors.js";
import { mapVideoDimensions, mapVideoSize, normalizeVideoAspectRatio, normalizeVideoResolution } from "../../utils/videoParams.js";
import { getAsset } from "../asset.service.js";
import { prepareVideoFrameForAspectRatio } from "../assets/prepareVideoFrame.service.js";
import { resolveRemoteAsset } from "../assets/resolveRemoteAsset.service.js";
import { saveGenerationTask } from "../generationTask.service.js";
import type { ProviderGenerateResult, VideoProviderParams } from "./providerTypes.js";
import { joinUrl, type VideoApiFamily, type VideoImageTransport, type VideoRequestConfig, type VideoTransport } from "./videoRequestAdapter.js";

function sleep(ms: number) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

function record(value: unknown) {
  return value && typeof value === "object" ? value as Record<string, unknown> : {};
}

function stringValue(value: unknown) {
  return typeof value === "string" && value.trim() ? value.trim() : undefined;
}

function preview(value: unknown) {
  if (typeof value === "string") return value.slice(0, 2000);
  try {
    return JSON.stringify(value).slice(0, 2000);
  } catch {
    return String(value).slice(0, 2000);
  }
}

function mimeType(filePath: string, configured?: string) {
  if (configured) return configured;
  const extension = path.extname(filePath).toLowerCase();
  if (extension === ".png") return "image/png";
  if (extension === ".webp") return "image/webp";
  if (extension === ".mp4") return "video/mp4";
  if (extension === ".webm") return "video/webm";
  if (extension === ".mov") return "video/quicktime";
  if (extension === ".mp3") return "audio/mpeg";
  if (extension === ".wav") return "audio/wav";
  if (extension === ".m4a") return "audio/mp4";
  if (extension === ".aac") return "audio/aac";
  return "image/jpeg";
}

async function assetDataUrls(assetIds?: string[], aspectRatio?: string) {
  const urls: string[] = [];
  for (const assetId of assetIds ?? []) {
    const asset = await getAsset(assetId);
    if (!asset?.localPath || !fs.existsSync(asset.localPath)) {
      throw new ProviderError("MISSING_INPUT_ASSET", "Seedance 引用的图片、视频或音频素材不存在。");
    }
    const sourcePath = asset.mimeType?.startsWith("image/")
      ? (await prepareVideoFrameForAspectRatio(asset.localPath, aspectRatio, "contain_blur")).localPath
      : asset.localPath;
    urls.push(`data:${mimeType(sourcePath, asset.mimeType)};base64,${fs.readFileSync(sourcePath).toString("base64")}`);
  }
  return urls;
}

async function assetMultipartFiles(assetIds?: string[], aspectRatio?: string) {
  const files: Array<{ localPath: string; mimeType: string; filename: string }> = [];
  for (const assetId of assetIds ?? []) {
    const asset = await getAsset(assetId);
    if (!asset?.localPath || !fs.existsSync(asset.localPath)) {
      throw new ProviderError("MISSING_INPUT_ASSET", "视频中转引用的本地图片素材不存在。");
    }
    const prepared = asset.mimeType?.startsWith("image/")
      ? await prepareVideoFrameForAspectRatio(asset.localPath, aspectRatio, "contain_blur")
      : undefined;
    const localPath = prepared?.localPath ?? asset.localPath;
    files.push({
      localPath,
      mimeType: mimeType(localPath, asset.mimeType),
      filename: path.basename(localPath)
    });
  }
  return files;
}

type SeedanceProviderParams = VideoProviderParams & { imageTransport?: VideoImageTransport; videoTransport?: VideoTransport; videoRequestConfig?: VideoRequestConfig };

function proxyVideoLabel(params: SeedanceProviderParams) {
  const provider = (params.videoRequestConfig?.provider ?? params.providerId ?? "").toLowerCase();
  const model = (params.modelName ?? "").toLowerCase();
  if (provider.includes("google") || provider.includes("veo") || model.includes("veo")) return "Veo";
  if (provider.includes("grok") || provider.includes("xai") || model.includes("grok")) return "Grok";
  if (provider.includes("kling") || model.includes("kling")) return "可灵";
  if (provider.includes("wan") || provider.includes("alibaba") || model.includes("wan")) return "Wan";
  if (provider.includes("omni") || model.includes("omni")) return "Omni";
  if (provider.includes("seedance") || model.includes("seedance") || model.includes("doubao")) return "Seedance";
  return params.videoRequestConfig?.provider || params.providerId || "视频";
}

async function assetJsonReferences(assetIds: string[] | undefined, aspectRatio: string | undefined, imageTransport: VideoImageTransport | undefined) {
  if (!["url", "url_or_asset"].includes(imageTransport ?? "")) return assetDataUrls(assetIds, aspectRatio);
  const urls: string[] = [];
  for (const assetId of assetIds ?? []) {
    const asset = await getAsset(assetId);
    if (!asset?.localPath && !asset?.url && !asset?.publicUrl) {
      throw new ProviderError("MISSING_INPUT_ASSET", "中转接口引用的素材不存在或已被删除。");
    }
    const prepared = asset.localPath && asset.mimeType?.startsWith("image/")
      ? await prepareVideoFrameForAspectRatio(asset.localPath, aspectRatio, "contain_blur")
      : undefined;
    const resolved = await resolveRemoteAsset(
      {
        ...asset,
        localPath: prepared?.localPath ?? asset.localPath,
        mimeType: prepared ? mimeType(prepared.localPath, asset.mimeType) : asset.mimeType
      },
      "openai-video",
      "video-reference",
      { strategy: { supportsPublicUrl: true, supportsBase64: false, supportsMultipart: false, prefer: "publicUrl" } }
    );
    if (!resolved.url) throw new ProviderError("PUBLIC_URL_REQUIRED", "当前中转通道需要公网可访问的素材 URL。");
    urls.push(resolved.url);
  }
  return urls;
}

export function seedanceCreateEndpoint(apiBaseUrl: string) {
  const base = apiBaseUrl.trim().replace(/^(?:POST|GET|PUT|PATCH|DELETE)\s+/i, "").replace(/\/$/, "");
  if (/\/(?:v1\/video\/create|v1\/videos|video\/generations|videos\/generations|videos)$/i.test(base)) return base;
  return joinUrl(base, "/v1/videos");
}

export function seedancePollEndpoint(apiBaseUrl: string, taskId: string) {
  const createEndpoint = seedanceCreateEndpoint(apiBaseUrl);
  const encoded = encodeURIComponent(taskId);
  if (/\/v1\/video\/create$/i.test(createEndpoint)) {
    const parsed = new URL(createEndpoint);
    parsed.pathname = parsed.pathname.replace(/\/create$/i, "/query");
    parsed.search = "";
    parsed.searchParams.set("id", taskId);
    return parsed.toString();
  }
  if (/\/videos\/generations$/i.test(createEndpoint)) {
    return createEndpoint.replace(/\/generations$/i, `/${encoded}`);
  }
  return `${createEndpoint}/${encoded}`;
}

function seedanceEndpointCandidates(apiBaseUrl: string) {
  const first = seedanceCreateEndpoint(apiBaseUrl);
  const base = apiBaseUrl.trim().replace(/^(?:POST|GET|PUT|PATCH|DELETE)\s+/i, "").replace(/\/$/, "");
  if (/\/(?:v1\/video\/create|v1\/videos|video\/generations|videos\/generations|videos)$/i.test(base)) return [first];
  return Array.from(new Set([first, joinUrl(base, "/v1/video/create"), joinUrl(base, "/videos/generations"), joinUrl(base, "/video/generations")]));
}

function parseJsonCandidate(text: string): unknown | undefined {
  const trimmed = text.trim();
  if (!trimmed) return undefined;
  try {
    return JSON.parse(trimmed) as unknown;
  } catch {
    // Some relays wrap JSON in markdown fences or prepend logs.
  }
  const fenced = trimmed.match(/```(?:json)?\s*([\s\S]*?)```/i)?.[1];
  if (fenced) {
    try {
      return JSON.parse(fenced.trim()) as unknown;
    } catch {
      // Keep falling through to substring extraction.
    }
  }
  const objectStart = trimmed.indexOf("{");
  const objectEnd = trimmed.lastIndexOf("}");
  if (objectStart >= 0 && objectEnd > objectStart) {
    try {
      return JSON.parse(trimmed.slice(objectStart, objectEnd + 1)) as unknown;
    } catch {
      // Try array extraction below.
    }
  }
  const arrayStart = trimmed.indexOf("[");
  const arrayEnd = trimmed.lastIndexOf("]");
  if (arrayStart >= 0 && arrayEnd > arrayStart) {
    try {
      return JSON.parse(trimmed.slice(arrayStart, arrayEnd + 1)) as unknown;
    } catch {
      // Text is not JSON, caller will preserve it.
    }
  }
  return undefined;
}

function parseResponseText(text: string): Record<string, unknown> {
  const parsed = parseJsonCandidate(text);
  if (parsed && typeof parsed === "object") return record(parsed);

  const events: unknown[] = [];
  for (const line of text.split(/\r?\n/)) {
    const trimmed = line.trim();
    if (!trimmed.startsWith("data:")) continue;
    const data = trimmed.replace(/^data:\s*/i, "").trim();
    if (!data || data === "[DONE]") continue;
    const item = parseJsonCandidate(data);
    events.push(item ?? data);
  }
  if (events.length === 1 && events[0] && typeof events[0] === "object") {
    return { ...record(events[0]), raw_text: text };
  }
  if (events.length) return { data: events, raw_text: text };
  return text.trim() ? { raw_text: text } : {};
}

async function responsePayload(response: Response) {
  const text = await response.text();
  return parseResponseText(text);
}

function seedanceAssetBaseUrl(params: SeedanceProviderParams) {
  return (params.videoRequestConfig?.baseUrl ?? params.apiBaseUrl)
    .trim()
    .replace(/^(?:POST|GET|PUT|PATCH|DELETE)\s+/i, "")
    .replace(/\/(?:v1\/video\/generations|v1\/video\/create|v1\/videos|video\/generations|video\/create|videos)\/?$/i, "/v1")
    .replace(/\/+$/g, "");
}

function seedanceAssetEndpoint(params: SeedanceProviderParams, path: string) {
  return joinUrl(seedanceAssetBaseUrl(params), path);
}

function seedanceAuthorizationValues(apiKey: string) {
  const trimmed = apiKey.trim();
  if (/^bearer\s+/i.test(trimmed)) return [trimmed, trimmed.replace(/^bearer\s+/i, "")];
  return [`Bearer ${trimmed}`, trimmed];
}

async function seedanceAssetRequest(params: SeedanceProviderParams, endpoint: string, body: Record<string, unknown>) {
  let lastPayload: Record<string, unknown> = {};
  let lastStatus = 0;
  for (const authorization of seedanceAuthorizationValues(params.apiKey)) {
    const response = await fetch(endpoint, {
      method: "POST",
      headers: {
        Authorization: authorization,
        "Content-Type": "application/json",
        Accept: "application/json"
      },
      body: JSON.stringify(body)
    });
    lastStatus = response.status;
    lastPayload = await responsePayload(response);
    if (response.ok) return lastPayload;
    if (![401, 403].includes(response.status) && !/invalid token|unauthorized|forbidden/i.test(JSON.stringify(lastPayload))) {
      break;
    }
  }
  throw new ProviderError(
    "SEEDANCE_ASSET_UPLOAD_FAILED",
    `Seedance 素材库接口调用失败：${errorMessage(lastPayload)}`,
    preview(lastPayload),
    { endpoint, upstreamStatus: lastStatus }
  );
}

function seedanceAssetGroupId(payload: Record<string, unknown>) {
  return findStringByKeys(payload, ["Id", "id", "group_id", "groupId"]);
}

function seedanceAssetId(payload: Record<string, unknown>) {
  return findStringByKeys(payload, ["Id", "id", "asset_id", "assetId"]);
}

function seedanceAssetType(type: "Image" | "Video" | "Audio") {
  return type;
}

async function createSeedanceAssetGroup(params: SeedanceProviderParams) {
  const endpoint = seedanceAssetEndpoint(params, "/v1/seedance/asset/CreateAssetGroup");
  const name = `aigc-${params.nodeId || "video"}-${Date.now()}`;
  const payload = await seedanceAssetRequest(params, endpoint, {
    Name: name,
    Description: "AIGC video reference assets"
  });
  const groupId = seedanceAssetGroupId(payload);
  if (!groupId) {
    throw new ProviderError("SEEDANCE_ASSET_UPLOAD_FAILED", "Seedance 素材库没有返回素材组 ID。", preview(payload), { endpoint, response: payload });
  }
  return groupId;
}

async function uploadSeedanceAsset(params: SeedanceProviderParams, groupId: string, url: string, type: "Image" | "Video" | "Audio", index: number) {
  const endpoint = seedanceAssetEndpoint(params, "/v1/seedance/asset/CreateAsset");
  const payload = await seedanceAssetRequest(params, endpoint, {
    GroupId: groupId,
    URL: url,
    AssetType: seedanceAssetType(type),
    Name: `${type.toLowerCase()}-${index + 1}`
  });
  const assetId = seedanceAssetId(payload);
  if (!assetId) {
    throw new ProviderError("SEEDANCE_ASSET_UPLOAD_FAILED", "Seedance 素材上传没有返回 asset ID。", preview(payload), { endpoint, response: payload });
  }
  return `asset://${assetId}`;
}

async function uploadSeedanceAssets(params: SeedanceProviderParams, urls: string[], type: "Image" | "Video" | "Audio") {
  if (!urls.length) return urls;
  const groupId = await createSeedanceAssetGroup(params);
  const uploaded: string[] = [];
  for (let index = 0; index < urls.length; index += 1) {
    uploaded.push(await uploadSeedanceAsset(params, groupId, urls[index]!, type, index));
  }
  return uploaded;
}

function seedanceAssetEndpointUnavailable(error: unknown) {
  if (!(error instanceof ProviderError)) return false;
  const details = record(error.details);
  const upstreamStatus = Number(details.upstreamStatus ?? 0);
  return [404, 405].includes(upstreamStatus) || /not found|not support|unsupported|method not allowed/i.test(`${error.message}\n${error.debugMessage ?? ""}`);
}

async function uploadSeedanceAssetsIfAvailable(params: SeedanceProviderParams, urls: string[], type: "Image" | "Video" | "Audio") {
  if (!urls.length) return urls;
  try {
    return await uploadSeedanceAssets(params, urls, type);
  } catch (error) {
    if (seedanceAssetEndpointUnavailable(error)) {
      console.warn("[seedance asset upload skipped]", {
        type,
        baseUrl: seedanceAssetBaseUrl(params),
        reason: error instanceof Error ? error.message : String(error)
      });
      return urls;
    }
    throw error;
  }
}

function hasSeedanceAssetReferences(...groups: string[][]) {
  return groups.some((items) => items.some((item) => /^asset:\/\//i.test(item)));
}

function seedanceInvalidAssetResource(payload: Record<string, unknown>) {
  return /invalid assets resources|invalid asset|asset.*(?:invalid|not valid|not found|not ready)/i.test(JSON.stringify(payload));
}

function seedanceAssetReadyDelayMs() {
  return Math.max(0, Number(process.env.SEEDANCE_ASSET_READY_DELAY_MS || 6000));
}

function findStringByKeys(value: unknown, keys: string[], depth = 0): string | undefined {
  if (depth > 6 || !value) return undefined;
  if (Array.isArray(value)) {
    for (const item of value) {
      const found = findStringByKeys(item, keys, depth + 1);
      if (found) return found;
    }
    return undefined;
  }
  if (typeof value !== "object") return undefined;
  const payload = value as Record<string, unknown>;
  for (const key of keys) {
    const direct = stringValue(payload[key]);
    if (direct) return direct;
  }
  for (const nested of Object.values(payload)) {
    const found = findStringByKeys(nested, keys, depth + 1);
    if (found) return found;
  }
  return undefined;
}

function collectText(value: unknown, depth = 0): string[] {
  if (depth > 5 || !value) return [];
  if (typeof value === "string") return [value];
  if (Array.isArray(value)) return value.flatMap((item) => collectText(item, depth + 1));
  if (typeof value !== "object") return [];
  return Object.values(value as Record<string, unknown>).flatMap((item) => collectText(item, depth + 1));
}

function taskId(payload: Record<string, unknown>) {
  const direct = findStringByKeys(payload, [
    "task_id",
    "taskId",
    "taskID",
    "request_id",
    "requestId",
    "generation_id",
    "generationId",
    "job_id",
    "jobId",
    "operation_id",
    "operationId",
    "id"
  ]);
  if (direct) return direct;
  const text = collectText(payload).join("\n");
  return text.match(/(?:task[_\s-]?id|request[_\s-]?id|generation[_\s-]?id|job[_\s-]?id|任务\s*ID|任务号|请求\s*ID)\s*[:：=]\s*([A-Za-z0-9._:/-]{6,})/i)?.[1];
}

function configuredTaskId(payload: Record<string, unknown>, config?: VideoRequestConfig) {
  const preferred = [config?.taskIdField, config?.idField].filter(Boolean) as string[];
  if (preferred.length) {
    const direct = findStringByKeys(payload, preferred);
    if (direct) return direct;
  }
  return taskId(payload);
}

function taskStatus(payload: Record<string, unknown>) {
  const value = findStringByKeys(payload, ["status", "state", "task_status", "taskStatus", "phase"]);
  return value ? value.toLowerCase() : "";
}

function configuredStatus(payload: Record<string, unknown>, config?: VideoRequestConfig) {
  const preferred = [config?.statusField, "status", "state", "task_status", "taskStatus", "phase"].filter(Boolean) as string[];
  const value = findStringByKeys(payload, preferred);
  return value ? value.toLowerCase() : "";
}

const completedStatuses = new Set(["completed", "succeeded", "success", "done", "finished"]);
const failedStatuses = new Set(["failed", "error", "cancelled", "canceled"]);

function isCompletedStatus(status: string) {
  return completedStatuses.has(status.toLowerCase());
}

function isFailedStatus(status: string) {
  return failedStatuses.has(status.toLowerCase());
}

function progressValue(payload: Record<string, unknown>) {
  const direct = payload.progress ?? payload.percent ?? payload.percentage;
  if (typeof direct === "number" && Number.isFinite(direct)) return Math.max(0, Math.min(100, Math.round(direct)));
  if (typeof direct === "string") {
    const match = direct.match(/(\d+(?:\.\d+)?)/);
    if (match?.[1]) return Math.max(0, Math.min(100, Math.round(Number(match[1]))));
  }
  const nested = record(payload.data ?? payload.result ?? payload.output);
  if (nested !== payload && Object.keys(nested).length) return progressValue(nested);
  return undefined;
}

function configuredResult(payload: Record<string, unknown>, config?: VideoRequestConfig) {
  if (!config?.resultField) return payload;
  const result = payload[config.resultField];
  return result && typeof result === "object" ? record(result) : payload;
}

function errorMessage(payload: Record<string, unknown>) {
  const message = findStringByKeys(payload, ["message", "error_message", "errorMessage", "detail", "reason"]);
  const error = record(payload.error);
  return String(message ?? error.message ?? payload.error ?? "未知错误");
}

function assetDownloadError(payload: Record<string, unknown>) {
  return /resource download failed|image_url.*not valid|failed to (?:download|fetch).*(?:image|resource)/i.test(JSON.stringify(payload));
}

function modelAccessDenied(payload: Record<string, unknown>) {
  return /model not available for your tier|模型.*(?:套餐|分组|令牌).*(?:不可用|无权限)|available channel does not exist|可用渠道不存在/i.test(JSON.stringify(payload));
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
  "raw_text",
  "rawText",
  "content",
  "text",
  "message",
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

function videoUrl(value: unknown, preferred = false): string | undefined {
  if (typeof value === "string") {
    const parsed = parseJsonCandidate(value);
    if (parsed && parsed !== value) {
      const found = videoUrl(parsed, preferred);
      if (found) return found;
    }
    const urls = urlsFromText(value.trim());
    if (!urls.length) return undefined;
    const selected = urls.find((url) => isLikelyVideoUrl(url) || /(video|media|download|file|preview|play|output)/i.test(url));
    if (selected) return selected;
    return preferred ? urls[0] : undefined;
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

function compactObject<T extends Record<string, unknown>>(value: T): T {
  return Object.fromEntries(Object.entries(value).filter(([, item]) => item !== undefined && item !== null && item !== "")) as T;
}

function durationValue(params: SeedanceProviderParams) {
  return !params.duration || params.duration <= 0 ? "auto" : String(params.duration);
}

function orientationFor(aspectRatio: string) {
  if (aspectRatio === "9:16" || aspectRatio === "3:4") return "portrait";
  if (aspectRatio === "1:1") return "square";
  return "landscape";
}

function materializePollEndpoint(config: VideoRequestConfig | undefined, createEndpoint: string, taskIdValue: string) {
  if (!config) return seedancePollEndpoint(createEndpoint, taskIdValue);
  if (/runapi\.co/i.test(config.baseUrl)) return joinUrl(config.baseUrl, `/v1/videos/${encodeURIComponent(taskIdValue)}`);
  const encoded = encodeURIComponent(taskIdValue);
  const template = config.pollEndpoint || "";
  if (!template) return seedancePollEndpoint(createEndpoint, taskIdValue);
  const replaced = template.replace(/\{taskId\}/g, encoded);
  const [pathOnly, query = ""] = replaced.split("?");
  const finalUrl = joinUrl(config.baseUrl, pathOnly ?? "");
  const url = new URL(finalUrl);
  url.search = query;
  if (config.apiFamily === "unified_video_create" && !url.searchParams.has("id")) {
    url.searchParams.set("id", taskIdValue);
  }
  return url.toString();
}

function apiFamilyFor(params: SeedanceProviderParams): VideoApiFamily {
  return params.videoRequestConfig?.apiFamily ?? "openai_videos";
}

function configuredCreateEndpoints(params: SeedanceProviderParams) {
  return params.videoRequestConfig ? [params.videoRequestConfig.finalUrl] : seedanceEndpointCandidates(params.apiBaseUrl);
}

function requiresPublicImageUrl(apiFamily: VideoApiFamily) {
  return apiFamily === "seedance2_native" || apiFamily === "omni_fast" || apiFamily === "unified_video_create" || apiFamily === "aigc_video_json";
}

function seedanceImageRole(mode: string, index: number) {
  if (mode === "image_to_video_first_last_frame") return index === 0 ? "first_frame" : "last_frame";
  if (mode === "image_to_video_first_frame") return "first_frame";
  return "reference_image";
}

function isRunApiVideoCreate(params: SeedanceProviderParams) {
  const value = `${params.apiBaseUrl} ${params.videoRequestConfig?.baseUrl ?? ""} ${params.videoRequestConfig?.finalUrl ?? ""}`.toLowerCase();
  return /runapi\.co/.test(value);
}

type PollResult = {
  endpoint: string;
  response: Response;
  task: Record<string, unknown>;
};

function pollHeaders(params: SeedanceProviderParams, json = false) {
  return compactObject({
    Authorization: `Bearer ${params.apiKey}`,
    Accept: "application/json",
    "Content-Type": json ? "application/json" : undefined
  }) as Record<string, string>;
}

function runApiQueryEndpoint(params: SeedanceProviderParams) {
  const baseUrl = params.videoRequestConfig?.baseUrl ?? params.apiBaseUrl;
  return joinUrl(baseUrl, "/v1/video/query");
}

function runApiPollAttempts(params: SeedanceProviderParams, taskIdValue: string): Array<{ endpoint: string; init: RequestInit }> {
  const queryEndpoint = runApiQueryEndpoint(params);
  const videosEndpoint = joinUrl(params.videoRequestConfig?.baseUrl ?? params.apiBaseUrl, `/v1/videos/${encodeURIComponent(taskIdValue)}`);
  const encoded = encodeURIComponent(taskIdValue);
  return [
    {
      endpoint: videosEndpoint,
      init: { method: "GET", headers: pollHeaders(params) }
    },
    {
      endpoint: `${queryEndpoint}?id=${encoded}`,
      init: { method: "GET", headers: pollHeaders(params) }
    },
    {
      endpoint: `${queryEndpoint}?task_id=${encoded}`,
      init: { method: "GET", headers: pollHeaders(params) }
    },
    {
      endpoint: queryEndpoint,
      init: { method: "POST", headers: pollHeaders(params, true), body: JSON.stringify({ id: taskIdValue }) }
    },
    {
      endpoint: queryEndpoint,
      init: { method: "POST", headers: pollHeaders(params, true), body: JSON.stringify({ task_id: taskIdValue }) }
    }
  ];
}

function shouldTryNextPollAttempt(response: Response, payload: Record<string, unknown>) {
  if (response.ok) return false;
  const message = `${response.status} ${JSON.stringify(payload)}`;
  return /invalid url|not found|cannot\s+(?:get|post)|method not allowed|route|endpoint/i.test(message);
}

function isRetryablePollFailure(response: Response, payload: Record<string, unknown>) {
  if (response.ok) return false;
  if (![408, 409, 425, 429, 500, 502, 503, 504].includes(response.status)) return false;
  return /capacity|fully loaded|try again later|rate limit|too many|busy|queue|queued|pending|processing|timeout|temporar|upstream/i.test(JSON.stringify(payload));
}

async function fetchPollTask(params: SeedanceProviderParams, pollEndpoint: string, taskIdValue: string): Promise<PollResult> {
  if (!isRunApiVideoCreate(params)) {
    const response = await fetch(pollEndpoint, {
      headers: pollHeaders(params)
    });
    return { endpoint: pollEndpoint, response, task: await responsePayload(response) };
  }

  let last: PollResult | undefined;
  for (const attempt of runApiPollAttempts(params, taskIdValue)) {
    const response = await fetch(attempt.endpoint, attempt.init);
    const task = await responsePayload(response);
    last = { endpoint: attempt.endpoint, response, task };
    if (!shouldTryNextPollAttempt(response, task)) return last;
  }
  return last!;
}

export function buildProxyBody(params: SeedanceProviderParams, refs: {
  apiFamily: VideoApiFamily;
  mode: string;
  images: string[];
  videos: string[];
  audios: string[];
  aspectRatio: string;
  resolution: string;
  seconds: string;
}) {
  const base = {
    model: params.modelName
  };
  if (refs.apiFamily === "seedance2_native") {
    const content: Record<string, unknown>[] = [{ type: "text", text: params.prompt }];
    refs.images.forEach((url, index) => content.push({ type: "image_url", image_url: { url }, role: seedanceImageRole(refs.mode, index) }));
    for (const url of refs.videos) content.push({ type: "video_url", video_url: { url }, role: "reference_video" });
    for (const url of refs.audios) content.push({ type: "audio_url", audio_url: { url }, role: "reference_audio" });
    return {
      ...base,
      content,
      metadata: compactObject({
        duration: refs.seconds === "auto" ? -1 : Number(refs.seconds),
        ratio: refs.aspectRatio,
        resolution: refs.resolution.toLowerCase(),
        watermark: false,
        generate_audio: refs.audios.length ? true : undefined
      })
    };
  }

  if (refs.apiFamily === "aigc_video_json") {
    const model = params.modelName.toLowerCase();
    const audioGeneration = /(?:^|[-_])audio(?:$|[-_])/.test(model)
      ? "Enabled"
      : /(?:^|[-_])mute(?:$|[-_])/.test(model) ? "Disabled" : undefined;
    return compactObject({
      ...base,
      prompt: params.prompt,
      seconds: refs.seconds === "auto" ? undefined : refs.seconds,
      image: refs.images[0],
      images: refs.images.length > 1 ? refs.images : undefined,
      metadata: {
        output_config: compactObject({
          resolution: refs.resolution.toUpperCase(),
          aspect_ratio: refs.aspectRatio,
          duration: refs.seconds === "auto" ? undefined : Number(refs.seconds),
          audio_generation: audioGeneration
        }),
        last_frame_url: refs.images[1]
      }
    });
  }

  if (refs.apiFamily === "unified_video_create") {
    if (isRunApiVideoCreate(params)) {
      return compactObject({
        ...base,
        prompt: params.prompt,
        images: refs.images,
        url: refs.videos[0],
        video: refs.videos[0],
        audio: refs.audios[0],
        aspect_ratio: refs.aspectRatio,
        duration: refs.seconds === "auto" ? undefined : Number(refs.seconds),
        size: refs.resolution.toUpperCase(),
        resolution: refs.resolution,
        watermark: false
      });
    }
    return compactObject({
      ...base,
      prompt: params.prompt,
      images: refs.images.map((url) => ({ url })),
      video: refs.videos[0],
      video_url: refs.videos[0],
      audio: refs.audios[0],
      audio_url: refs.audios[0],
      orientation: orientationFor(refs.aspectRatio),
      aspect_ratio: refs.aspectRatio,
      seconds: refs.seconds === "auto" ? undefined : refs.seconds,
      resolution: refs.resolution,
      watermark: false
    });
  }

  if (refs.apiFamily === "omni_fast") {
    return compactObject({
      ...base,
      prompt: params.prompt,
      first_image_url: refs.images[0],
      seconds: refs.seconds === "auto" ? undefined : refs.seconds,
      aspect_ratio: refs.aspectRatio,
      resolution: refs.resolution
    });
  }

  if (refs.apiFamily === "omni_fast_v2v") {
    if (!refs.videos[0]) {
      throw new ProviderError("MISSING_VIDEO_INPUT", "Omni-fast-v2v 需要连接一个公网 MP4 视频素材。");
    }
    return compactObject({
      ...base,
      prompt: params.prompt,
      video: refs.videos[0],
      seconds: refs.seconds === "auto" ? undefined : refs.seconds,
      aspect_ratio: refs.aspectRatio,
      resolution: refs.resolution
    });
  }

  const body: Record<string, unknown> = compactObject({
    ...base,
    prompt: params.prompt,
    seconds: refs.seconds === "auto" ? undefined : refs.seconds,
    aspect_ratio: refs.aspectRatio,
    resolution: refs.resolution
  });
  const imageField = params.videoRequestConfig?.imageField ?? "images";
  const videoField = params.videoRequestConfig?.videoField ?? "video";
  if (refs.images.length) body[imageField] = imageField === "image" || imageField === "first_image_url" ? refs.images[0] : refs.images;
  if (refs.videos.length) body[videoField] = videoField === "videos" ? refs.videos : refs.videos[0];
  return body;
}

function buildSeedance15Multipart(params: SeedanceProviderParams, refs: {
  files: Array<{ localPath: string; mimeType: string; filename: string }>;
  aspectRatio: string;
  resolution: string;
  seconds: string;
}) {
  const form = new FormData();
  form.set("model", params.modelName);
  form.set("prompt", params.prompt);
  if (refs.seconds !== "auto") form.set("seconds", refs.seconds);
  form.set("size", mapVideoSize(refs.aspectRatio, refs.resolution));
  const fields = ["first_frame_image", "last_frame_image"];
  refs.files.slice(0, 2).forEach((file, index) => {
    form.set(fields[index]!, new Blob([fs.readFileSync(file.localPath)], { type: file.mimeType }), file.filename);
  });
  return form;
}

function maskKey(apiKey: string) {
  if (!apiKey) return "";
  if (apiKey.length <= 10) return `${apiKey.slice(0, 2)}***${apiKey.slice(-2)}`;
  return `${apiKey.slice(0, 6)}***${apiKey.slice(-4)}`;
}

export async function generateVideoWithSeedance(params: SeedanceProviderParams): Promise<ProviderGenerateResult> {
  const label = proxyVideoLabel(params);
  const mode = params.videoMode ?? legacyInputModeToOfficialMode(params.inputMode, "seedance");
  if (!["text_to_video", "image_to_video_first_frame", "image_to_video_first_last_frame", "reference_images_to_video", "video_edit", "video_extension"].includes(mode)) {
    throw new ProviderError("MODEL_MODE_UNSUPPORTED", `${label} 当前通道不支持这个视频生成模式。`);
  }

  try {
    const apiFamily = apiFamilyFor(params);
    const multipartFiles = apiFamily === "doubao_seedance15"
      ? await assetMultipartFiles(params.imageAssetIds, params.aspectRatio)
      : [];
    let images = apiFamily === "doubao_seedance15"
      ? []
      : await assetJsonReferences(params.imageAssetIds, params.aspectRatio, params.imageTransport);
    let videos = await assetJsonReferences(params.videoAssetIds, undefined, params.videoTransport === "url_or_base64_json" ? "url_or_asset" : params.imageTransport);
    let audios = await assetJsonReferences(params.audioAssetIds, undefined, params.imageTransport);
    const publicUrlImages = [...images];
    const publicUrlVideos = [...videos];
    const publicUrlAudios = [...audios];
    if (requiresPublicImageUrl(apiFamily) && !["url", "url_or_asset"].includes(params.imageTransport ?? "") && images.length) {
      throw new ProviderError("PUBLIC_URL_REQUIRED", "当前视频接口族要求图片先上传到公网 URL，不能传本地文件或 base64。");
    }
    if (apiFamily === "seedance2_native" && params.imageTransport === "url_or_asset") {
      images = await uploadSeedanceAssetsIfAvailable(params, images, "Image");
      videos = await uploadSeedanceAssetsIfAvailable(params, videos, "Video");
      audios = await uploadSeedanceAssetsIfAvailable(params, audios, "Audio");
      if (hasSeedanceAssetReferences(images, videos, audios)) {
        await sleep(seedanceAssetReadyDelayMs());
      }
    }
    const imageCount = images.length + multipartFiles.length;
    if (mode === "image_to_video_first_frame" && !imageCount) {
      throw new ProviderError("MISSING_INPUT_ASSET", `${label} 图生视频需要连接参考图片。`);
    }
    if (mode === "image_to_video_first_last_frame" && imageCount < 2) {
      throw new ProviderError("MISSING_INPUT_ASSET", `${label} 首尾帧模式需要连接首帧和尾帧两张图片。`);
    }
    if (mode === "reference_images_to_video" && imageCount + videos.length + audios.length === 0) {
      throw new ProviderError("MISSING_INPUT_ASSET", `${label} 全能参考至少需要连接一张图片、一个视频或一段音频。`);
    }
    if (["video_edit", "video_extension"].includes(mode) && !videos.length) {
      throw new ProviderError("MISSING_VIDEO_INPUT", mode === "video_extension" ? `${label} 视频延展需要连接原视频。` : `${label} 视频编辑需要连接视频素材。`);
    }

    const normalizedRatio = normalizeVideoAspectRatio(params.aspectRatio);
    const normalizedResolution = normalizeVideoResolution(params.resolution);
    const seconds = durationValue(params);
    const body: Record<string, unknown> = buildProxyBody(params, {
      apiFamily,
      mode,
      images,
      videos,
      audios,
      aspectRatio: normalizedRatio,
      resolution: normalizedResolution,
      seconds
    });
    const fallbackBody = hasSeedanceAssetReferences(images, videos, audios)
      ? buildProxyBody(params, {
        apiFamily,
        mode,
        images: publicUrlImages,
        videos: publicUrlVideos,
        audios: publicUrlAudios,
        aspectRatio: normalizedRatio,
        resolution: normalizedResolution,
        seconds
      })
      : undefined;
    const content = Array.isArray(body.content) ? body.content as unknown[] : undefined;
    console.log("[video proxy create]", {
      provider: params.videoRequestConfig?.provider ?? "custom",
      channel: params.videoRequestConfig?.channel ?? "proxy",
      apiFamily,
      finalUrl: params.videoRequestConfig?.finalUrl ?? seedanceCreateEndpoint(params.apiBaseUrl),
      createEndpoint: params.videoRequestConfig?.createEndpoint,
      pollEndpoint: params.videoRequestConfig?.pollEndpoint,
      requestFormat: params.videoRequestConfig?.requestFormat ?? "json",
      apiKey: maskKey(params.apiKey),
      model: params.modelName,
      promptLength: params.prompt.length,
      hasContentArray: Boolean(content),
      contentLength: content?.length ?? 0,
      hasImages: imageCount > 0,
      hasVideo: videos.length > 0,
      imageTransport: params.imageTransport,
      inputType: imageCount ? "image" : videos.length ? "video" : "text",
      duration: seconds,
      aspectRatio: normalizedRatio,
      resolution: normalizedResolution
    });

    let endpoint = "";
    let task: Record<string, unknown> = {};
    let remoteUrl: string | undefined;
    let id: string | undefined;
    let createError: ProviderError | undefined;
    for (const candidate of configuredCreateEndpoints(params)) {
      endpoint = candidate;
      const multipart = apiFamily === "doubao_seedance15";
      const jsonBodies = fallbackBody ? [
        { body, source: "seedance_asset" },
        { body: fallbackBody, source: "public_url_fallback" }
      ] : [{ body, source: "primary" }];
      for (const requestBody of multipart ? [{ body, source: "multipart" }] : jsonBodies) {
        const response = await fetch(endpoint, {
          method: "POST",
          headers: multipart
            ? { Authorization: `Bearer ${params.apiKey}`, Accept: "application/json" }
            : { Authorization: `Bearer ${params.apiKey}`, "Content-Type": "application/json", Accept: "application/json" },
          body: multipart
            ? buildSeedance15Multipart(params, { files: multipartFiles, aspectRatio: normalizedRatio, resolution: normalizedResolution, seconds })
            : JSON.stringify(requestBody.body)
        });
        task = await responsePayload(response);
        if (!response.ok) {
          if (modelAccessDenied(task)) {
            throw new ProviderError(
              "MODEL_ACCESS_DENIED",
              `当前 cy88 API Key 的套餐或 auto 分组没有模型「${params.modelName}」的调用权限。请在 cy88 开通该模型，或换用已授权的 API Key。`,
              preview(task),
              { endpoint, model: params.modelName, provider: "cy88", upstreamStatus: response.status }
            );
          }
          if (seedanceInvalidAssetResource(task) && requestBody.source === "seedance_asset" && fallbackBody) {
            console.warn("[seedance asset fallback]", {
              endpoint,
              model: params.modelName,
              reason: errorMessage(task)
            });
            continue;
          }
          if (assetDownloadError(task)) {
            throw new ProviderError(
              "PUBLIC_URL_REQUIRED",
              "上游无法下载图片素材。请确认公网素材域名和隧道仍然有效，然后重试。",
              preview(task),
              { endpoint, whyBlocked: "noPublicImageUrl", upstreamResponse: task }
            );
          }
          createError = new ProviderError("PROVIDER_ERROR", `${label} 中转任务创建失败：${errorMessage(task)}`, preview(task), { endpoint });
          if (params.videoRequestConfig) break;
          continue;
        }
        remoteUrl = videoUrl(configuredResult(task, params.videoRequestConfig));
        id = configuredTaskId(task, params.videoRequestConfig);
        if (remoteUrl || id) break;
        createError = new ProviderError("PROVIDER_ERROR", `${label} 中转没有返回 task_id 或视频地址。`, preview(task), { endpoint, response: task });
      }
      if (remoteUrl || id) break;
      if (params.videoRequestConfig) break;
    }

    if (createError && !remoteUrl && !id) throw createError;
    if (!remoteUrl && !id) {
      throw new ProviderError("PROVIDER_ERROR", `${label} 中转没有返回 task_id 或视频地址。`, preview(task), { endpoint, response: task });
    }

    if (id) {
      const pollEndpoint = materializePollEndpoint(params.videoRequestConfig, endpoint, id);
      await saveGenerationTask({
        id,
        status: configuredStatus(task, params.videoRequestConfig) || "submitted",
        result: {
          provider: params.videoRequestConfig?.provider ?? "seedance",
          channel: params.videoRequestConfig?.channel ?? "proxy",
          apiFamily,
          baseUrl: params.videoRequestConfig?.baseUrl ?? params.apiBaseUrl,
          createEndpoint: params.videoRequestConfig?.createEndpoint ?? endpoint,
          pollEndpoint,
          model: params.modelName,
          createdAt: new Date().toISOString(),
          endpoint,
          nodeId: params.nodeId,
          modelName: params.modelName,
          response: task
        }
      });
      const startedAt = Date.now();
      const timeoutMs = isRunApiVideoCreate(params) ? 30 * 60 * 1000 : 20 * 60 * 1000;
      const completedWithoutUrlGraceMs = 2 * 60 * 1000;
      let completedSeenAt: number | undefined;
      while (!remoteUrl) {
        const status = configuredStatus(task, params.videoRequestConfig);
        if (isFailedStatus(status)) {
          await saveGenerationTask({ id, status: "failed", result: task, errorMessage: errorMessage(task) });
          throw new ProviderError("VEO_OPERATION_FAILED", `${label} 中转任务失败：${errorMessage(task)}`, preview(task));
        }
        if (isCompletedStatus(status)) completedSeenAt ??= Date.now();
        if (completedSeenAt && Date.now() - completedSeenAt > completedWithoutUrlGraceMs) break;
        if (Date.now() - startedAt > timeoutMs) {
          const minutes = Math.round(timeoutMs / 60_000);
          await saveGenerationTask({ id, status: "timeout", result: task, errorMessage: `${label} 中转任务超过 ${minutes} 分钟仍未完成。` });
          throw new ProviderError("VEO_OPERATION_TIMEOUT", `${label} 中转任务超过 ${minutes} 分钟仍未完成。`);
        }
        await sleep(5000);
        const pollResult = await fetchPollTask(params, pollEndpoint, id);
        task = pollResult.task;
        const pollResponse = pollResult.response;
        if (!pollResponse.ok && isRetryablePollFailure(pollResponse, task)) {
          await saveGenerationTask({
            id,
            status: "processing",
            progress: progressValue(task),
            result: {
              ...task,
              pollEndpoint: pollResult.endpoint,
              retryablePollError: true,
              upstreamStatus: pollResponse.status
            }
          });
          continue;
        }
        await saveGenerationTask({
          id,
          status: configuredStatus(task, params.videoRequestConfig) || "processing",
          progress: progressValue(task),
          result: {
            ...task,
            pollEndpoint: pollResult.endpoint
          }
        });
        if (!pollResponse.ok) throw new ProviderError("PROVIDER_ERROR", `${label} 中转任务查询失败：${errorMessage(task)}`, preview(task));
        remoteUrl = videoUrl(configuredResult(task, params.videoRequestConfig));
      }
      if (remoteUrl) await saveGenerationTask({ id, status: "success", progress: 100, result: task });
    }

    if (!remoteUrl) {
      if (id) await saveGenerationTask({ id, status: "completed_without_video_url", result: task, errorMessage: `${label} 中转任务已完成，但响应中没有视频 URL。` });
      throw new ProviderError("VEO_OPERATION_NO_VIDEO_IN_RESPONSE", `${label} 中转任务已完成，但响应中没有视频 URL。`, preview(task), {
        endpoint,
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
      payloadSummary: {
        endpoint,
        taskId: id,
        model: params.modelName,
        mode,
        watermark: false,
        referenceBindingCount: params.referenceBindings?.length ?? 0
      }
    };
  } catch (error) {
    if (error instanceof ProviderError) throw error;
    const message = rawErrorMessage(error);
    if (/fetch failed|network|econn|dns|timeout/i.test(message)) {
      throw new ProviderError("NETWORK_ERROR", `${proxyVideoLabel(params)} 中转网络请求失败，请检查 Base URL、中转服务和后端网络。`, message);
    }
    throw new ProviderError("PROVIDER_ERROR", `${proxyVideoLabel(params)} 中转接口调用失败。`, message);
  }
}
