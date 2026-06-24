import fs from "node:fs";
import path from "node:path";
import { legacyInputModeToOfficialMode } from "../../types/videoModes.js";
import { downloadGeneratedVideoOrUseRemote, saveGeneratedBuffer } from "../../utils/downloadGeneratedFile.js";
import { ProviderError, rawErrorMessage } from "../../utils/providerErrors.js";
import { mapVideoDimensions, mapVideoSize, normalizeVideoAspectRatio, normalizeVideoResolution } from "../../utils/videoParams.js";
import { getAsset } from "../asset.service.js";
import { ensureAssetLocalFile } from "../assets/ensureAssetLocalFile.service.js";
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
    const asset = await ensureAssetLocalFile(await getAsset(assetId), "Seedance 引用的图片、视频或音频素材");
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
    const asset = await ensureAssetLocalFile(await getAsset(assetId), "视频中转引用的图片素材");
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
  if (provider.includes("agnes") || model.includes("agnes")) return "Agnes";
  if (provider.includes("zhipu") || provider.includes("bigmodel") || /cogvideo|vidu/.test(model)) return "智普";
  if (provider.includes("google") || provider.includes("veo") || model.includes("veo")) return "Veo";
  if (provider.includes("grok") || provider.includes("xai") || model.includes("grok")) return "Grok";
  if (provider.includes("kling") || model.includes("kling")) return "可灵";
  if (provider.includes("wan") || provider.includes("alibaba") || model.includes("wan")) return "Wan";
  if (provider.includes("omni") || model.includes("omni")) return "Omni";
  if (provider.includes("seedance") || model.includes("seedance") || model.includes("doubao")) return "Seedance";
  return params.videoRequestConfig?.provider || params.providerId || "视频";
}

function videoRouteLabel(params: SeedanceProviderParams) {
  return `${proxyVideoLabel(params)} ${params.videoRequestConfig?.channel === "official" ? "官方接口" : "中转"}`;
}

async function assetJsonReferences(assetIds: string[] | undefined, aspectRatio: string | undefined, imageTransport: VideoImageTransport | undefined) {
  if (!["url", "url_or_asset"].includes(imageTransport ?? "")) return assetDataUrls(assetIds, aspectRatio);
  const urls: string[] = [];
  for (const assetId of assetIds ?? []) {
    const loadedAsset = await getAsset(assetId);
    if (!loadedAsset?.localPath && !loadedAsset?.url && !loadedAsset?.publicUrl) {
      throw new ProviderError("MISSING_INPUT_ASSET", "中转接口引用的素材不存在或已被删除。");
    }
    let asset = loadedAsset;
    if (asset.localPath && asset.mimeType?.startsWith("image/") && aspectRatio) {
      asset = await ensureAssetLocalFile(asset, "中转接口引用的素材");
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
      {
        strategy: { supportsPublicUrl: true, supportsBase64: false, supportsMultipart: false, prefer: "publicUrl" },
        signedUrlExpiresSeconds: Number(process.env.SEEDANCE_ASSET_URL_EXPIRES_SECONDS || 86400)
      }
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

function relayEndpointRoot(value: string) {
  const endpoint = seedanceCreateEndpoint(value);
  try {
    const url = new URL(endpoint);
    url.search = "";
    url.hash = "";
    url.pathname = url.pathname
      .replace(/\/(?:v1\/video\/create|v1\/videos|video\/generations|videos\/generations|videos)$/i, "")
      .replace(/\/+$/g, "");
    return url.toString().replace(/\/$/g, "");
  } catch {
    return endpoint
      .replace(/\/(?:v1\/video\/create|v1\/videos|video\/generations|videos\/generations|videos)$/i, "")
      .replace(/\/+$/g, "");
  }
}

function endpointMatchesProtocol(endpoint: string | undefined, apiFamily: VideoApiFamily) {
  if (!endpoint) return false;
  const value = endpoint.toLowerCase().replace(/\/+$/g, "");
  if (apiFamily === "seedance2_native") return /\/(?:v1\/video\/generations|video\/generations)$/.test(value);
  if (apiFamily === "unified_video_create") return /\/v1\/video\/create$/.test(value);
  if (apiFamily === "omni_fast" || apiFamily === "omni_fast_v2v") {
    return /\/(?:v1\/videos|videos)$/.test(value);
  }
  if (apiFamily === "openai_videos") {
    return /\/(?:v1\/videos|videos|v1\/video\/create)$/.test(value);
  }
  return !/\/v1\/videos\/generations$/.test(value);
}

function protocolCreateEndpointCandidates(params: SeedanceProviderParams) {
  const apiFamily = params.videoRequestConfig?.apiFamily ?? "openai_videos";
  const baseUrl = params.videoRequestConfig?.baseUrl ?? params.apiBaseUrl;
  const root = relayEndpointRoot(baseUrl);
  const configured = params.videoRequestConfig?.finalUrl;
  const endpoints: (string | undefined)[] = [];
  if (endpointMatchesProtocol(configured, apiFamily)) endpoints.push(configured);

  if (apiFamily === "seedance2_native") {
    endpoints.push(joinUrl(root, "/v1/video/generations"), joinUrl(root, "/video/generations"));
  } else if (apiFamily === "unified_video_create") {
    endpoints.push(joinUrl(root, "/v1/video/create"), joinUrl(root, "/v1/videos"));
  } else if (apiFamily === "omni_fast" || apiFamily === "omni_fast_v2v") {
    endpoints.push(joinUrl(root, "/v1/videos"));
  } else if (apiFamily === "openai_videos") {
    endpoints.push(joinUrl(root, "/v1/videos"));
    if (!isNewTokenRelay(params)) endpoints.push(joinUrl(root, "/v1/video/create"));
  } else {
    endpoints.push(
      ...seedanceEndpointCandidates(params.apiBaseUrl),
      joinUrl(root, "/v1/videos"),
      joinUrl(root, "/v1/video/create"),
      joinUrl(root, "/v1/video/generations")
    );
  }

  return Array.from(new Set(endpoints.filter(Boolean) as string[]));
}

export function relayCreateEndpointCandidates(params: SeedanceProviderParams) {
  if (params.videoRequestConfig?.apiFamily === "agnes_video" || params.videoRequestConfig?.apiFamily === "zhipu_video") {
    return [params.videoRequestConfig.finalUrl];
  }
  return protocolCreateEndpointCandidates(params);
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

export function seedanceAuthorizationValues(apiKey: string) {
  const trimmed = apiKey.trim();
  if (/^bearer\s+/i.test(trimmed)) return [trimmed, trimmed.replace(/^bearer\s+/i, "")];
  return [trimmed, `Bearer ${trimmed}`];
}

function seedanceBusinessFailed(payload: Record<string, unknown>) {
  const state = payload.state;
  if (typeof state === "number" && state !== 1) return true;
  if (typeof state === "string" && state.trim() && !["1", "success", "ok"].includes(state.trim().toLowerCase())) return true;
  const code = payload.code;
  if (typeof code === "string" && code.trim() && !["success", "ok", "200"].includes(code.trim().toLowerCase())) return true;
  const error = payload.error;
  if (error && !(typeof error === "object" && Object.keys(error as Record<string, unknown>).length === 0)) return true;
  return false;
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
    if (response.ok && !seedanceBusinessFailed(lastPayload)) return lastPayload;
  }
  throw new ProviderError(
    "SEEDANCE_ASSET_UPLOAD_FAILED",
    `Seedance 素材库接口调用失败：${upstreamFriendlyErrorMessage("Seedance", lastPayload)}`,
    preview(lastPayload),
    { endpoint, upstreamStatus: lastStatus }
  );
}

function seedanceAssetGroupId(payload: Record<string, unknown>) {
  return findStringByKeys(payload, [
    "Id",
    "id",
    "ID",
    "GroupId",
    "group_id",
    "groupId",
    "asset_group_id",
    "assetGroupId",
    "AssetGroupId",
    "MaterialGroupId",
    "material_group_id",
    "materialGroupId"
  ]);
}

function seedanceAssetId(payload: Record<string, unknown>) {
  return findStringByKeys(payload, [
    "Id",
    "id",
    "ID",
    "AssetId",
    "asset_id",
    "assetId",
    "MaterialId",
    "material_id",
    "materialId",
    "resource_id",
    "resourceId"
  ]);
}

function seedanceAssetTaskId(payload: Record<string, unknown>) {
  return findStringByKeys(payload, ["task_id", "taskId", "TaskId", "taskID", "TaskID", "request_id", "requestId"]);
}

function seedanceAssetStatus(payload: Record<string, unknown>) {
  return findStringByKeys(payload, ["Status", "status", "State", "state", "asset_status", "assetStatus", "phase"]);
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
  const taskId = seedanceAssetTaskId(payload);
  // Seedance relay docs return both Id and task_id, then immediately use
  // asset://{Id} in /v1/video/generations. GetAsset is not part of the
  // public contract for every relay, so strict active polling is opt-in.
  if (taskId && process.env.SEEDANCE_ASSET_REQUIRE_ACTIVE === "true") {
    return `asset://${await waitForSeedanceAssetActive(params, taskId, assetId, type, index)}`;
  }
  if (!assetId) {
    throw new ProviderError("SEEDANCE_ASSET_UPLOAD_FAILED", "Seedance 素材上传没有返回 asset ID。", preview(payload), { endpoint, response: payload });
  }
  return `asset://${assetId}`;
}

async function waitForSeedanceAssetActive(params: SeedanceProviderParams, taskId: string, fallbackAssetId: string | undefined, type: "Image" | "Video" | "Audio", index: number) {
  const endpoint = seedanceAssetEndpoint(params, "/v1/seedance/asset/GetAsset");
  const attempts = Math.max(1, Number(process.env.SEEDANCE_ASSET_POLL_ATTEMPTS || 60));
  const delayMs = Math.max(250, Number(process.env.SEEDANCE_ASSET_POLL_DELAY_MS || 1500));
  let latestPayload: Record<string, unknown> = {};
  for (let attempt = 1; attempt <= attempts; attempt += 1) {
    latestPayload = await seedanceAssetRequest(params, endpoint, { task_id: taskId });
    const status = seedanceAssetStatus(latestPayload)?.toLowerCase();
    const assetId = seedanceAssetId(latestPayload) ?? fallbackAssetId;
    if (status === "active" && assetId) return assetId;
    if (status === "failed" || status === "error") {
      throw new ProviderError(
        "SEEDANCE_ASSET_UPLOAD_FAILED",
        `Seedance 素材库处理失败：第 ${index + 1} 个 ${type} 素材没有转为 Active。`,
        preview(latestPayload),
        { endpoint, taskId, response: latestPayload }
      );
    }
    await sleep(delayMs);
  }
  throw new ProviderError(
    "SEEDANCE_ASSET_UPLOAD_FAILED",
    `Seedance 素材库处理超时：第 ${index + 1} 个 ${type} 素材长时间未 Active。`,
    preview(latestPayload),
    { endpoint, taskId, response: latestPayload }
  );
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

export function seedanceAssetUploadShouldFallback(error: unknown) {
  if (seedanceAssetEndpointUnavailable(error)) return true;
  const text = error instanceof ProviderError
    ? `${error.message}\n${error.debugMessage ?? ""}\n${preview(error.details)}`
    : rawErrorMessage(error);
  if (/no access to model\s+seedance-asset|seedance-asset.*(?:no access|unauthorized|forbidden|无权限|未开通|不可用)/i.test(text)) return true;
  if (/seedance-asset.*(?:可用渠道不存在|渠道不存在|分组.*不存在|没有.*渠道)|(?:可用渠道不存在|渠道不存在).*seedance-asset/i.test(text)) return true;
  if (/seedance-asset/i.test(text) && /fail_to_fetch_task|failed?\s+to\s+fetch\s+task|task.*(?:not\s+ready|not\s+found|not\s+exist)|任务.*(?:不存在|查询失败|暂未|稍后)/i.test(text)) return true;
  return /not found|not support|unsupported|method not allowed/i.test(text);
}

async function uploadSeedanceAssetsIfAvailable(params: SeedanceProviderParams, urls: string[], type: "Image" | "Video" | "Audio") {
  if (!urls.length) return urls;
  try {
    return await uploadSeedanceAssets(params, urls, type);
  } catch (error) {
    if (seedanceAssetUploadShouldFallback(error)) {
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

function seedanceAssetProviderTransient(payload: Record<string, unknown>) {
  return /Asset provider error|fail to fetch task|asset.*(?:busy|processing|not ready|pending|timeout|temporar)|素材.*(?:处理中|未就绪|繁忙|超时)/i.test(JSON.stringify(payload));
}

function seedanceAssetReadyDelayMs() {
  return Math.max(0, Number(process.env.SEEDANCE_ASSET_READY_DELAY_MS || 1200));
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

function normalizeStatus(value: unknown) {
  return typeof value === "string" ? value.trim().toLowerCase() : "";
}

function directStatus(payload: Record<string, unknown>, keys: string[]) {
  for (const key of keys) {
    const value = normalizeStatus(payload[key]);
    if (value) return value;
  }
  return "";
}

function nestedStatus(payload: Record<string, unknown>, keys: string[]) {
  const data = record(payload.data);
  const result = record(payload.result);
  const output = record(payload.output);
  const candidates = [
    directStatus(payload, keys),
    directStatus(data, keys),
    directStatus(record(data.data), keys),
    directStatus(result, keys),
    directStatus(output, keys)
  ].filter(Boolean);
  return candidates[0] ?? "";
}

function taskStatus(payload: Record<string, unknown>) {
  return nestedStatus(payload, ["status", "state", "task_status", "taskStatus", "phase"]);
}

function configuredStatus(payload: Record<string, unknown>, config?: VideoRequestConfig) {
  const preferred = [config?.statusField, "status", "state", "task_status", "taskStatus", "phase"].filter(Boolean) as string[];
  return nestedStatus(payload, preferred);
}

const completedStatuses = new Set(["completed", "succeeded", "success", "done", "finished", "succeed"]);
const failedStatuses = new Set(["failed", "failure", "error", "cancelled", "canceled", "fail"]);

function isCompletedStatus(status: string) {
  return completedStatuses.has(status.toLowerCase());
}

function isFailedStatus(status: string) {
  return failedStatuses.has(status.toLowerCase());
}

function seedanceCreateBusinessFailed(payload: Record<string, unknown>) {
  const statusCode = Number(payload.status_code ?? payload.statusCode ?? payload.code_status ?? 0);
  if (statusCode >= 400) return true;
  const code = normalizeStatus(payload.code);
  if (!code || code === "success" || code === "ok") return false;
  return !configuredTaskId(payload) && !videoUrl(payload);
}

function isSeedanceAssetRetryableCreateFailure(payload: Record<string, unknown>) {
  return seedanceInvalidAssetResource(payload) || seedanceAssetProviderTransient(payload);
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

function decodedErrorText(value: unknown, depth = 0): string {
  if (depth > 6 || value === undefined || value === null) return "";
  if (typeof value === "string") {
    const parsed = parseJsonCandidate(value);
    if (parsed && parsed !== value) return `${value}\n${decodedErrorText(parsed, depth + 1)}`;
    return value;
  }
  if (Array.isArray(value)) return value.map((item) => decodedErrorText(item, depth + 1)).filter(Boolean).join("\n");
  if (typeof value === "object") {
    return Object.entries(value as Record<string, unknown>)
      .map(([key, item]) => `${key}: ${decodedErrorText(item, depth + 1)}`)
      .join("\n");
  }
  return String(value);
}

function upstreamFriendlyErrorMessage(label: string, payload: Record<string, unknown>) {
  const fallback = errorMessage(payload);
  const decoded = `${fallback}\n${decodedErrorText(payload)}`;
  if (/cloudflare.*524|error code 524|a timeout occurred|origin web server timed out/i.test(decoded)) {
    return `${label} 上游响应超时，请稍后重试或切换其它线路。`;
  }
  if (/please wait and try again later|try again later|temporarily unavailable|service busy|fully loaded/i.test(decoded)) {
    return `${label} 暂时繁忙，请稍后重试或切换其它线路。`;
  }
  if (/invalid params|invalid size|size must be one of|allowed values/i.test(decoded)) {
    return `${label} 参数格式不兼容，系统已按通用视频尺寸重新提交；如果仍失败，请切换支持该模型的线路。`;
  }
  if (/orchestration-service|name or service not known|cannot connect to host|ssl:|getaddrinfo|service unavailable/i.test(decoded)) {
    return `${label} 上游内部服务暂时不可达，请稍后重试或切换其他视频通道。`;
  }
  if (/InputImageSensitiveContentDetected|PrivacyInformation|may contain real person/i.test(decoded)) {
    return `${label} 上游返回了输入素材审核提示。系统已通过素材库 asset 引用提交；请保留当前素材重新提交一次，若仍失败再调整单张素材或提示词。`;
  }
  if (/content review|unsafe content|protected IP|identifiable real person|sensitive content|内容审核|敏感内容/i.test(decoded)) {
    return `${label} 上游内容审核拒绝：提示词或参考素材未通过审核。请调整素材/提示词后重试，或切换其他通道。`;
  }
  return fallback;
}

function assetDownloadError(payload: Record<string, unknown>) {
  return /resource download failed|image_url.*not valid|failed to (?:download|fetch).*(?:image|resource)/i.test(JSON.stringify(payload));
}

function modelAccessDenied(payload: Record<string, unknown>) {
  return /model not available for your tier|模型.*(?:套餐|分组|令牌).*(?:不可用|无权限)|available channel does not exist|可用渠道不存在/i.test(JSON.stringify(payload));
}

const preferredVideoUrlKeys = [
  "remixed_from_video_id",
  "video_result",
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

function relayVideoSize(aspectRatio: string, resolution: string) {
  const dimensions = mapVideoDimensions(aspectRatio, resolution);
  return `${dimensions.width}x${dimensions.height}`;
}

function zhipuVideoSize(modelName: string, aspectRatio: string, resolution: string) {
  const name = modelName.toLowerCase();
  if (/vidu2/.test(name)) return resolution.toLowerCase() === "480p" ? "480x360" : "1280x720";
  if (/vidu/.test(name)) return "1920x1080";
  if (resolution.toLowerCase() === "4k") return "3840x2160";
  if (resolution.toLowerCase() === "1080p") return aspectRatio === "9:16" ? "1080x1920" : aspectRatio === "1:1" ? "1024x1024" : "1920x1080";
  return aspectRatio === "9:16" ? "720x1280" : aspectRatio === "1:1" ? "1024x1024" : "1280x720";
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
  if (config.apiFamily === "agnes_video") {
    const base = new URL(config.baseUrl);
    return new URL(replaced, `${base.origin}/`).toString();
  }
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
  return relayCreateEndpointCandidates(params);
}

function requiresPublicImageUrl(apiFamily: VideoApiFamily) {
  return apiFamily === "seedance2_native"
    || apiFamily === "omni_fast"
    || apiFamily === "unified_video_create"
    || apiFamily === "aigc_video_json"
    || apiFamily === "agnes_video"
    || apiFamily === "zhipu_video";
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

function isNewTokenRelay(params: SeedanceProviderParams) {
  const value = `${params.apiBaseUrl} ${params.videoRequestConfig?.baseUrl ?? ""} ${params.videoRequestConfig?.finalUrl ?? ""}`.toLowerCase();
  return /newtoken\.club/.test(value);
}

function normalizeProxyVideoModelName(params: SeedanceProviderParams) {
  const model = params.modelName?.trim() || "";
  if (isNewTokenRelay(params) && /veo[-_]?omni[-_]?flash/i.test(model)) return "veo-omni-flash";
  if (/agnes[-_ .]?video/i.test(model)) return "agnes-video-v2.0";
  if (!/omni[-_]?flash|omni[-_]?fast/i.test(model)) return model;
  if (isRunApiVideoCreate(params)) return "omni-flash";
  if (/omni[-_]?flash/i.test(model)) return "omni-fast";
  return model;
}

type PollResult = {
  endpoint: string;
  response: Response;
  task: Record<string, unknown>;
};

function pollHeaders(params: SeedanceProviderParams, json = false) {
  return compactObject({
    ...authHeaders(params),
    Accept: "application/json",
    "Content-Type": json ? "application/json" : undefined
  }) as Record<string, string>;
}

function authHeaders(params: SeedanceProviderParams): Record<string, string> {
  const authType = params.videoRequestConfig?.authType ?? "bearer";
  if (authType === "none") return {};
  if (authType === "api-key") return { "api-key": params.apiKey };
  return { Authorization: `Bearer ${params.apiKey}` };
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

function genericPollAttempts(params: SeedanceProviderParams, pollEndpoint: string, taskIdValue: string): Array<{ endpoint: string; init: RequestInit }> {
  const baseUrl = params.videoRequestConfig?.baseUrl ?? params.apiBaseUrl;
  const root = relayEndpointRoot(baseUrl);
  const encoded = encodeURIComponent(taskIdValue);
  const queryEndpoint = joinUrl(root, "/v1/video/query");
  return [
    {
      endpoint: pollEndpoint,
      init: { method: "GET", headers: pollHeaders(params) }
    },
    {
      endpoint: joinUrl(root, `/v1/videos/${encoded}`),
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
      endpoint: joinUrl(root, `/v1/video/generations/${encoded}`),
      init: { method: "GET", headers: pollHeaders(params) }
    },
    {
      endpoint: joinUrl(root, `/v1/videos/generations/${encoded}`),
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
  ].filter((attempt, index, attempts) => attempts.findIndex((item) => item.endpoint === attempt.endpoint && item.init.method === attempt.init.method && item.init.body === attempt.init.body) === index);
}

function shouldTryNextPollAttempt(response: Response, payload: Record<string, unknown>) {
  if (seedanceTaskFetchPending(payload)) return true;
  if (response.ok) return false;
  const message = `${response.status} ${JSON.stringify(payload)}`;
  return /invalid url|not found|cannot\s+(?:get|post)|method not allowed|route|endpoint/i.test(message);
}

function seedanceTaskFetchPending(payload: Record<string, unknown>) {
  const text = JSON.stringify(payload);
  return /task_not_exist|fail_to_fetch_task|failed?\s+to\s+fetch\s+task|task.*(?:not\s+ready|not\s+found|not\s+exist|does\s+not\s+exist|pending)|任务.*(?:未生成|不存在|查询失败|暂未|稍后)/i.test(text);
}

export function isRetryableSeedancePollFailure(response: Response, payload: Record<string, unknown>) {
  const text = JSON.stringify(payload);
  if (/panic detected|assignment to entry in nil map|nil map|please contact us/i.test(text)) return true;
  const payloadStatus = Number(payload.status_code ?? payload.statusCode ?? payload.code_status ?? 0);
  const status = response.ok && payloadStatus ? payloadStatus : response.status;
  if (![404, 408, 409, 425, 429, 500, 502, 503, 504].includes(status)) return false;
  return seedanceTaskFetchPending(payload) || /capacity|fully loaded|try again later|rate limit|too many|busy|queue|queued|pending|processing|timeout|temporar|upstream/i.test(text);
}

function isRetryablePollNetworkError(error: unknown) {
  return /fetch failed|network|econn|dns|timeout|socket|reset|tls|terminated/i.test(rawErrorMessage(error));
}

async function fetchPollTask(params: SeedanceProviderParams, pollEndpoint: string, taskIdValue: string): Promise<PollResult> {
  let last: PollResult | undefined;
  const officialFamily = params.videoRequestConfig?.apiFamily === "agnes_video" || params.videoRequestConfig?.apiFamily === "zhipu_video";
  const attempts = officialFamily
    ? [{ endpoint: pollEndpoint, init: { method: "GET", headers: pollHeaders(params) } }]
    : isRunApiVideoCreate(params)
    ? runApiPollAttempts(params, taskIdValue)
    : genericPollAttempts(params, pollEndpoint, taskIdValue);
  for (const attempt of attempts) {
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
    model: normalizeProxyVideoModelName(params)
  };
  if (refs.apiFamily === "agnes_video") {
    const dimensions = mapVideoDimensions(refs.aspectRatio, refs.resolution);
    const seconds = refs.seconds === "auto" ? 5 : Math.max(1, Number(refs.seconds));
    const frameRate = 24;
    const numFrames = Math.min(441, Math.max(9, Math.round((seconds * frameRate - 1) / 8) * 8 + 1));
    const multiImage = refs.images.length > 1 || refs.mode === "reference_images_to_video" || refs.mode === "image_to_video_first_last_frame";
    return compactObject({
      ...base,
      prompt: params.prompt,
      image: refs.images.length === 1 && !multiImage ? refs.images[0] : undefined,
      mode: refs.mode === "image_to_video_first_last_frame" ? "keyframes" : refs.images.length ? "ti2vid" : undefined,
      width: dimensions.width,
      height: dimensions.height,
      num_frames: numFrames,
      frame_rate: frameRate,
      extra_body: multiImage ? compactObject({
        image: refs.images,
        mode: refs.mode === "image_to_video_first_last_frame" ? "keyframes" : undefined
      }) : undefined
    });
  }

  if (refs.apiFamily === "zhipu_video") {
    const name = params.modelName.toLowerCase();
    const duration = refs.seconds === "auto" ? undefined : Number(refs.seconds);
    const isVidu = /vidu/.test(name);
    const isTextVidu = /viduq1[-_]?text/.test(name);
    const isReferenceVidu = /reference/.test(name);
    const isStartEndVidu = /start[-_]?end/.test(name);
    const imageValue = isReferenceVidu || isStartEndVidu || (/cogvideox[-_]?3/.test(name) && refs.images.length > 1)
      ? refs.images.slice(0, isReferenceVidu ? 3 : 2)
      : refs.images[0];
    return compactObject({
      ...base,
      prompt: params.prompt,
      image_url: imageValue,
      quality: isVidu ? undefined : params.qualityMode === "fast" ? "speed" : "quality",
      with_audio: isTextVidu ? undefined : true,
      size: zhipuVideoSize(params.modelName, refs.aspectRatio, refs.resolution),
      fps: isVidu ? undefined : 30,
      duration,
      aspect_ratio: isTextVidu || isReferenceVidu ? refs.aspectRatio : undefined,
      style: isTextVidu ? "general" : undefined,
      movement_amplitude: isVidu ? "auto" : undefined,
      watermark_enabled: false
    });
  }
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
        generate_audio: true
      })
    };
  }

  if (refs.apiFamily === "aigc_video_json") {
    const model = params.modelName.toLowerCase();
    const kling3Omni = /kling/.test(model) && /(3[._ -]?0|v3|omni)/.test(model);
    const audioGeneration = /(?:^|[-_])audio(?:$|[-_])/.test(model) || (kling3Omni && !/(?:^|[-_])mute(?:$|[-_])/.test(model))
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
    const images = refs.images.slice(0, 5);
    if (isNewTokenRelay(params)) {
      return compactObject({
        ...base,
        prompt: params.prompt,
        duration: refs.seconds === "auto" ? undefined : Number(refs.seconds),
        aspect_ratio: refs.aspectRatio,
        Ingredients_images: refs.mode === "reference_images_to_video" ? images : undefined,
        images: refs.mode === "image_to_video_first_frame" || refs.mode === "image_to_video_first_last_frame" ? images.slice(0, refs.mode === "image_to_video_first_last_frame" ? 2 : 1) : undefined,
        watermark: false,
        metadata: {
          watermark: false
        }
      });
    }
    return compactObject({
      ...base,
      prompt: params.prompt,
      first_image_url: refs.mode === "image_to_video_first_frame" || refs.mode === "image_to_video_first_last_frame" ? images[0] : undefined,
      last_image_url: refs.mode === "image_to_video_first_last_frame" ? images[1] : undefined,
      images: refs.mode === "reference_images_to_video" ? images : undefined,
      seconds: refs.seconds === "auto" ? undefined : refs.seconds,
      aspect_ratio: refs.aspectRatio,
      resolution: refs.resolution.toLowerCase(),
      watermark: false,
      metadata: {
        watermark: false
      }
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
      resolution: refs.resolution,
      watermark: false,
      metadata: {
        watermark: false
      }
    });
  }

  const dimensions = mapVideoDimensions(refs.aspectRatio, refs.resolution);
  const size = relayVideoSize(refs.aspectRatio, refs.resolution);
  const duration = refs.seconds === "auto" ? undefined : Number(refs.seconds);
  const body: Record<string, unknown> = compactObject({
    ...base,
    prompt: params.prompt,
    seconds: refs.seconds === "auto" ? undefined : refs.seconds,
    duration,
    aspect_ratio: refs.aspectRatio,
    resolution: refs.resolution,
    width: dimensions.width,
    height: dimensions.height,
    size,
    dimensions: size,
    watermark: false,
    generate_audio: true,
    metadata: {
      watermark: false,
      generate_audio: true,
      audio_generation: "Enabled"
    }
  });
  const imageField = params.videoRequestConfig?.imageField ?? "images";
  const videoField = params.videoRequestConfig?.videoField ?? "video";
  if (refs.images.length) body[imageField] = imageField === "image" || imageField === "first_image_url" ? refs.images[0] : refs.images;
  if (refs.videos.length) body[videoField] = videoField === "videos" ? refs.videos : refs.videos[0];
  return body;
}

function protocolFallbackBodies(primaryBody: Record<string, unknown>, refs: {
  apiFamily: VideoApiFamily;
  mode: string;
  images: string[];
}) {
  if (refs.apiFamily !== "omni_fast") return [];
  if (refs.mode !== "reference_images_to_video") return [];
  if (refs.images.length < 2) return [];
  if (Array.isArray(primaryBody.Ingredients_images)) {
    const imagesFallback = compactObject({
      ...primaryBody,
      Ingredients_images: undefined,
      images: refs.images.slice(0, 5)
    }) as Record<string, unknown>;
    const firstLastFallback = compactObject({
      ...primaryBody,
      Ingredients_images: undefined,
      first_image_url: refs.images[0],
      last_image_url: refs.images[1]
    }) as Record<string, unknown>;
    return [
      { body: imagesFallback, source: "protocol_images_fallback" },
      { body: firstLastFallback, source: "protocol_first_last_fallback" }
    ];
  }
  if (!Array.isArray(primaryBody.images)) return [];
  const fallback = compactObject({
    ...primaryBody,
    images: undefined,
    first_image_url: refs.images[0],
    last_image_url: refs.images[1]
  }) as Record<string, unknown>;
  return [{ body: fallback, source: "protocol_first_last_fallback" }];
}

export function buildSeedance15Multipart(params: SeedanceProviderParams, refs: {
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
  form.set("watermark", "false");
  form.set("generate_audio", "true");
  form.set("audio_generation", "Enabled");
  const fields = ["first_frame_image", "last_frame_image"];
  refs.files.slice(0, 2).forEach((file, index) => {
    form.set(fields[index]!, new Blob([fs.readFileSync(file.localPath)], { type: file.mimeType }), file.filename);
  });
  return form;
}

export function buildOpenAiVideosMultipart(params: SeedanceProviderParams, refs: {
  aspectRatio: string;
  resolution: string;
  seconds: string;
}) {
  const form = new FormData();
  form.set("model", normalizeProxyVideoModelName(params));
  form.set("prompt", params.prompt);
  if (refs.seconds !== "auto") form.set("seconds", refs.seconds);
  form.set("size", relayVideoSize(refs.aspectRatio, refs.resolution));
  form.set("watermark", "false");
  return form;
}

function openAiVideoContentEndpoint(params: SeedanceProviderParams, taskIdValue: string) {
  const baseUrl = params.videoRequestConfig?.baseUrl ?? params.apiBaseUrl;
  const root = relayEndpointRoot(baseUrl).replace(/\/$/g, "");
  return `${root}/v1/videos/${encodeURIComponent(taskIdValue)}/content?variant=video`;
}

async function downloadOpenAiVideoContent(params: SeedanceProviderParams, taskIdValue: string) {
  const endpoint = openAiVideoContentEndpoint(params, taskIdValue);
  const response = await fetch(endpoint, { method: "GET", headers: authHeaders(params) });
  if (!response.ok) {
    throw new ProviderError("PROVIDER_ERROR", `${proxyVideoLabel(params)} 视频内容下载失败：${response.status} ${await response.text()}`, undefined, { endpoint, taskId: taskIdValue });
  }
  const contentType = response.headers.get("content-type");
  const buffer = Buffer.from(await response.arrayBuffer());
  return saveGeneratedBuffer({ buffer, prefix: "video_sora", contentType, extension: ".mp4" });
}

function maskKey(apiKey: string) {
  if (!apiKey) return "";
  if (apiKey.length <= 10) return `${apiKey.slice(0, 2)}***${apiKey.slice(-2)}`;
  return `${apiKey.slice(0, 6)}***${apiKey.slice(-4)}`;
}

export async function generateVideoWithSeedance(params: SeedanceProviderParams): Promise<ProviderGenerateResult> {
  const label = proxyVideoLabel(params);
  const routeLabel = videoRouteLabel(params);
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
    const allowPublicUrlFallback = apiFamily !== "seedance2_native";
    const fallbackBody = allowPublicUrlFallback && hasSeedanceAssetReferences(images, videos, audios)
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
      resolution: normalizedResolution,
      metadataWatermark: record(body.metadata).watermark,
      metadataGenerateAudio: record(body.metadata).generate_audio,
      metadataKeys: Object.keys(record(body.metadata))
    });

    let endpoint = "";
    let task: Record<string, unknown> = {};
    let remoteUrl: string | undefined;
    let id: string | undefined;
    let createError: ProviderError | undefined;
    for (const candidate of configuredCreateEndpoints(params)) {
      endpoint = candidate;
      const multipart = apiFamily === "doubao_seedance15" || params.videoRequestConfig?.requestFormat === "multipart";
      const bodyUsesSeedanceAssets = hasSeedanceAssetReferences(images, videos, audios);
      const primaryJsonBodies = [
        { body, source: bodyUsesSeedanceAssets ? "seedance_asset" : "primary" },
        ...protocolFallbackBodies(body, { apiFamily, mode, images })
      ];
      const jsonBodies = fallbackBody
        ? [...primaryJsonBodies, { body: fallbackBody, source: "public_url_fallback" }]
        : primaryJsonBodies;
      for (const requestBody of multipart ? [{ body, source: "multipart" }] : jsonBodies) {
        const createAttempts = requestBody.source === "seedance_asset"
          ? Math.max(1, Number(process.env.SEEDANCE_ASSET_CREATE_RETRY_ATTEMPTS || 4))
          : 1;
        const createRetryDelayMs = Math.max(500, Number(process.env.SEEDANCE_ASSET_CREATE_RETRY_DELAY_MS || 2500));
        for (let createAttempt = 1; createAttempt <= createAttempts; createAttempt += 1) {
          const response = await fetch(endpoint, {
            method: "POST",
            headers: multipart
              ? { ...authHeaders(params), Accept: "application/json" }
              : { ...authHeaders(params), "Content-Type": "application/json", Accept: "application/json" },
            body: multipart
              ? apiFamily === "doubao_seedance15"
                ? buildSeedance15Multipart(params, { files: multipartFiles, aspectRatio: normalizedRatio, resolution: normalizedResolution, seconds })
                : buildOpenAiVideosMultipart(params, { aspectRatio: normalizedRatio, resolution: normalizedResolution, seconds })
              : JSON.stringify(requestBody.body)
          });
          task = await responsePayload(response);
          const createFailed = !response.ok || seedanceCreateBusinessFailed(task);
          if (createFailed && requestBody.source === "seedance_asset" && isSeedanceAssetRetryableCreateFailure(task) && createAttempt < createAttempts) {
            console.warn("[seedance asset create retry]", {
              endpoint,
              model: params.modelName,
              attempt: createAttempt,
              attempts: createAttempts,
              reason: errorMessage(task)
            });
            await sleep(createRetryDelayMs);
            continue;
          }
          if (createFailed) {
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
              break;
            }
            if (isRetryableSeedancePollFailure(response, task)) {
              createError = new ProviderError("PROVIDER_ERROR", `${routeLabel}任务创建暂时不可查，请稍后重试。`, preview(task), { endpoint });
              break;
            }
            if (assetDownloadError(task)) {
              throw new ProviderError(
                "PUBLIC_URL_REQUIRED",
                "上游无法下载图片素材。请确认公网素材域名和隧道仍然有效，然后重试。",
                preview(task),
                { endpoint, whyBlocked: "noPublicImageUrl", upstreamResponse: task }
              );
            }
            createError = new ProviderError("PROVIDER_ERROR", `${routeLabel}任务创建失败：${upstreamFriendlyErrorMessage(routeLabel, task)}`, preview(task), { endpoint });
            break;
          }
          remoteUrl = videoUrl(configuredResult(task, params.videoRequestConfig));
          id = configuredTaskId(task, params.videoRequestConfig);
          if (remoteUrl || id) break;
          createError = new ProviderError("PROVIDER_ERROR", `${routeLabel}没有返回 task_id 或视频地址。`, preview(task), { endpoint, response: task });
          break;
        }
        if (remoteUrl || id) break;
      }
      if (remoteUrl || id) break;
    }

    if (createError && !remoteUrl && !id) throw createError;
    if (!remoteUrl && !id) {
      throw new ProviderError("PROVIDER_ERROR", `${routeLabel}没有返回 task_id 或视频地址。`, preview(task), { endpoint, response: task });
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
          const friendlyMessage = upstreamFriendlyErrorMessage(routeLabel, task);
          await saveGenerationTask({ id, status: "failed", result: task, errorMessage: friendlyMessage });
          throw new ProviderError("VEO_OPERATION_FAILED", `${routeLabel}任务失败：${friendlyMessage}`, preview(task));
        }
        if (isCompletedStatus(status)) completedSeenAt ??= Date.now();
        if (completedSeenAt && Date.now() - completedSeenAt > completedWithoutUrlGraceMs) break;
        if (Date.now() - startedAt > timeoutMs) {
          const minutes = Math.round(timeoutMs / 60_000);
          const pendingMessage = `${routeLabel}任务已提交，超过 ${minutes} 分钟仍在排队/生成中，请稍后查看任务结果。`;
          await saveGenerationTask({
            id,
            status: "processing",
            progress: progressValue(task),
            result: {
              ...task,
              pollEndpoint,
              pendingAfterTimeout: true,
              waitedMinutes: minutes
            },
            errorMessage: pendingMessage
          });
          return {
            status: "processing",
            rawResponse: task,
            payloadSummary: {
              endpoint,
              taskId: id,
              pollEndpoint,
              model: params.modelName,
              mode,
              requestedAspectRatio: normalizedRatio,
              requestedResolution: normalizedResolution,
              requestedDuration: seconds,
              pendingAfterTimeout: true,
              waitedMinutes: minutes,
              message: pendingMessage
            }
          };
        }
        await sleep(5000);
        let pollResult: PollResult;
        try {
          pollResult = await fetchPollTask(params, pollEndpoint, id);
        } catch (pollError) {
          if (isRetryablePollNetworkError(pollError)) {
            const message = rawErrorMessage(pollError);
            await saveGenerationTask({
              id,
              status: "processing",
              progress: progressValue(task),
              result: {
                ...task,
                pollEndpoint,
                retryablePollNetworkError: true,
                pollNetworkError: message
              },
              errorMessage: `${routeLabel}查询暂时失败，已继续等待上游任务返回。`
            });
            continue;
          }
          throw pollError;
        }
        task = pollResult.task;
        const pollResponse = pollResult.response;
        if (isRetryableSeedancePollFailure(pollResponse, task)) {
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
        if (!pollResponse.ok) {
          await saveGenerationTask({
            id,
            status: "processing",
            progress: progressValue(task),
            result: {
              ...task,
              pollEndpoint: pollResult.endpoint,
              retryablePollError: true,
              upstreamStatus: pollResponse.status
            },
            errorMessage: `${routeLabel}任务已创建，查询暂时失败，正在继续等待。`
          });
          continue;
        }
        remoteUrl = videoUrl(configuredResult(task, params.videoRequestConfig));
      }
      if (remoteUrl) await saveGenerationTask({ id, status: "success", progress: 100, result: task });
    }

    if (!remoteUrl) {
      if (id && apiFamily === "openai_videos" && params.videoRequestConfig?.requestFormat === "multipart") {
        const saved = await downloadOpenAiVideoContent(params, id);
        await saveGenerationTask({ id, status: "success", progress: 100, result: { ...task, contentEndpoint: openAiVideoContentEndpoint(params, id) } });
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
            requestedAspectRatio: normalizedRatio,
            requestedResolution: normalizedResolution,
            requestedDuration: seconds,
            contentEndpoint: openAiVideoContentEndpoint(params, id),
            watermark: false,
            referenceBindingCount: params.referenceBindings?.length ?? 0
          }
        };
      }
      if (id) await saveGenerationTask({ id, status: "completed_without_video_url", result: task, errorMessage: `${routeLabel}任务已完成，但响应中没有视频 URL。` });
      throw new ProviderError("VEO_OPERATION_NO_VIDEO_IN_RESPONSE", `${routeLabel}任务已完成，但响应中没有视频 URL。`, preview(task), {
        endpoint,
        taskId: id,
        configuredModel: params.modelName,
        mode,
        response: task
      });
    }
    const saved = await downloadGeneratedVideoOrUseRemote(remoteUrl, "video_seedance");
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
        requestedAspectRatio: normalizedRatio,
        requestedResolution: normalizedResolution,
        requestedDuration: seconds,
        nativeAspectRatioRequired: apiFamily === "omni_fast" && normalizedRatio === "9:16",
        archiveWarning: saved.archiveWarning,
        watermark: false,
        referenceBindingCount: params.referenceBindings?.length ?? 0
      }
    };
  } catch (error) {
    if (error instanceof ProviderError) throw error;
    const message = rawErrorMessage(error);
    if (/fetch failed|network|econn|dns|timeout/i.test(message)) {
      throw new ProviderError("NETWORK_ERROR", `${videoRouteLabel(params)}网络请求失败，请检查 API 地址、上游服务和后端网络。`, message);
    }
    throw new ProviderError("PROVIDER_ERROR", `${videoRouteLabel(params)}调用失败。`, message);
  }
}
