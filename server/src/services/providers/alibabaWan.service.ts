import { getVideoModelCapabilityOrLegacy } from "../../config/videoModelCapabilities.js";
import { legacyInputModeToOfficialMode, type OfficialVideoMode } from "../../types/videoModes.js";
import { downloadGeneratedVideoOrUseRemote } from "../../utils/downloadGeneratedFile.js";
import { buildPayloadSummary, logOfficialPayload } from "../../utils/generationPayload.js";
import { ProviderError, rawErrorMessage } from "../../utils/providerErrors.js";
import { buildNegativePrompt } from "../../utils/qualityPrompt.js";
import { mapVideoParams } from "../../utils/videoParams.js";
import { getAsset } from "../asset.service.js";
import { ensureAssetLocalFile } from "../assets/ensureAssetLocalFile.service.js";
import { prepareVideoFrameForAspectRatio } from "../assets/prepareVideoFrame.service.js";
import { resolveRemoteAsset } from "../assets/resolveRemoteAsset.service.js";
import type { ProviderGenerateResult, VideoProviderParams } from "./providerTypes.js";

function normalizeWanEndpoint(apiBaseUrl?: string) {
  const base = (apiBaseUrl || "https://dashscope.aliyuncs.com/api/v1").replace(/\/$/, "");
  if (base.includes("/services/aigc/video-generation/video-synthesis")) return base;
  return `${base}/services/aigc/video-generation/video-synthesis`;
}

function taskEndpoint(apiBaseUrl?: string, taskId?: string) {
  const base = (apiBaseUrl || "https://dashscope.aliyuncs.com/api/v1").replace(/\/$/, "");
  const apiRoot = base.includes("/services/") ? base.slice(0, base.indexOf("/services/")) : base;
  return `${apiRoot}/tasks/${taskId}`;
}

function actualWanModelName(params: VideoProviderParams) {
  return getVideoModelCapabilityOrLegacy("alibaba", params.catalogModelId, params.modelName)?.modelName ?? params.modelName;
}

function actualWanMode(params: VideoProviderParams): OfficialVideoMode {
  return params.videoMode ?? legacyInputModeToOfficialMode(params.inputMode, "alibaba");
}

async function readProviderError(response: Response) {
  const text = await response.text();
  try {
    const json = JSON.parse(text) as { message?: string; code?: string; error?: { message?: string; code?: string } };
    return json.error?.message ?? json.message ?? text;
  } catch {
    return text;
  }
}

function classifyWanError(error: unknown): ProviderError {
  if (error instanceof ProviderError) return error;
  const message = rawErrorMessage(error);
  const lower = message.toLowerCase();
  if (lower.includes("fetch failed") || lower.includes("network") || lower.includes("econn") || lower.includes("dns") || lower.includes("timeout")) {
    return new ProviderError("NETWORK_ERROR", "DashScope Wan 网络请求失败，请检查后端代理、VPN 是否被 Node 后端使用，或 DashScope endpoint 是否可访问。", message);
  }
  if (lower.includes("unauthorized") || lower.includes("invalid api-key") || lower.includes("invalidapikey") || lower.includes("401") || lower.includes("403")) {
    return new ProviderError("API_KEY_INVALID", "阿里百炼 API Key 无效、模型未开通或 endpoint 区域不匹配。API Key、模型和 endpoint 必须同一区域。", message);
  }
  if (lower.includes("region") || lower.includes("endpoint")) {
    return new ProviderError("PROVIDER_ERROR", "阿里 Wan endpoint 区域可能与 API Key 或模型不匹配，请确认北京、新加坡或美国 endpoint 与 Key 同区域。", message);
  }
  return new ProviderError("PROVIDER_ERROR", "阿里 Wan 视频生成失败。", message);
}

async function readProviderErrorDetailed(response: Response) {
  const text = await response.text();
  try {
    const json = JSON.parse(text) as {
      message?: string;
      code?: string;
      request_id?: string;
      requestId?: string;
      error?: { message?: string; code?: string; request_id?: string; requestId?: string };
    };
    const code = json.error?.code ?? json.code;
    const message = json.error?.message ?? json.message;
    const requestId = json.error?.request_id ?? json.error?.requestId ?? json.request_id ?? json.requestId;
    return JSON.stringify({ status: response.status, code, message, requestId, raw: json });
  } catch {
    return JSON.stringify({ status: response.status, message: text });
  }
}

function classifyWanErrorDetailed(error: unknown): ProviderError {
  if (error instanceof ProviderError) return error;
  const message = rawErrorMessage(error);
  const lower = message.toLowerCase();
  if (lower.includes("invalidapikey") || lower.includes("invalid api-key") || lower.includes("invalid api key") || lower.includes("401")) {
    return new ProviderError("API_KEY_INVALID", "阿里百炼 API Key 无效。请确认模型配置里的 API Key 是 DashScope / 百炼创建的 Key，并且没有填成掩码 key。", message);
  }
  if (lower.includes("accessdenied") || lower.includes("forbidden") || lower.includes("403")) {
    return new ProviderError("API_KEY_INVALID", "阿里百炼 API Key 权限不足、模型未开通，或 Key 与 DashScope endpoint 区域不匹配。请检查模型权限和地域。", message);
  }
  if (lower.includes("model") && (lower.includes("not") || lower.includes("invalid") || lower.includes("unsupported"))) {
    return new ProviderError("MODEL_PARAM_UNSUPPORTED", "当前阿里 Wan modelName 不存在或不支持当前接口，请检查模型名称、模式和 DashScope 区域。", message);
  }
  if (lower.includes("fetch failed") || lower.includes("network") || lower.includes("econn") || lower.includes("dns") || lower.includes("timeout")) {
    return new ProviderError("NETWORK_ERROR", "DashScope Wan 请求没有成功发出或连接中断。请检查 Node 后端代理 / VPN / TUN，或 DashScope endpoint 是否可访问。", message);
  }
  if (lower.includes("region") || lower.includes("endpoint")) {
    return new ProviderError("PROVIDER_ERROR", "阿里 Wan endpoint 区域可能与 API Key 或模型不匹配，请确认北京、新加坡或美国 endpoint 与 Key 同区域。", message);
  }
  return new ProviderError("PROVIDER_ERROR", "阿里 Wan 视频生成失败。", message);
}

async function wanFetch(stage: "createTask" | "pollTask", endpoint: string, init: RequestInit) {
  let lastError: unknown;
  for (let attempt = 1; attempt <= 2; attempt += 1) {
    try {
      console.log("[wan-fetch-start]", {
        stage,
        attempt,
        endpoint,
        method: init.method ?? "GET",
        hasBody: Boolean(init.body)
      });
      const response = await fetch(endpoint, init);
      console.log("[wan-fetch-response]", {
        stage,
        attempt,
        endpoint,
        status: response.status,
        ok: response.ok
      });
      return response;
    } catch (error) {
      lastError = error;
      const cause = error instanceof Error && "cause" in error ? error.cause : undefined;
      console.error("[wan-fetch-failed]", {
        stage,
        attempt,
        endpoint,
        errorName: error instanceof Error ? error.name : undefined,
        errorMessage: error instanceof Error ? error.message : String(error),
        cause
      });
      if (attempt < 2) await new Promise((resolve) => setTimeout(resolve, 1200));
    }
  }
  throw lastError;
}

function findTaskId(value: unknown): string | undefined {
  if (!value || typeof value !== "object") return undefined;
  const record = value as Record<string, unknown>;
  for (const key of ["task_id", "taskId", "id"]) {
    if (typeof record[key] === "string") return record[key] as string;
  }
  for (const nested of Object.values(record)) {
    const found = findTaskId(nested);
    if (found) return found;
  }
  return undefined;
}

function findVideoUrl(value: unknown): string | undefined {
  if (!value) return undefined;
  if (typeof value === "string") return /^https?:\/\//i.test(value) && /\.(mp4|webm|mov|m4v)(\?|$)/i.test(value) ? value : undefined;
  if (Array.isArray(value)) {
    for (const item of value) {
      const found = findVideoUrl(item);
      if (found) return found;
    }
    return undefined;
  }
  if (typeof value === "object") {
    const record = value as Record<string, unknown>;
    for (const key of ["video_url", "videoUrl", "url", "output_url", "outputUrl"]) {
      const found = findVideoUrl(record[key]);
      if (found) return found;
    }
    for (const nested of Object.values(record)) {
      const found = findVideoUrl(nested);
      if (found) return found;
    }
  }
  return undefined;
}

function taskStatus(value: unknown): string | undefined {
  if (!value || typeof value !== "object") return undefined;
  const record = value as Record<string, unknown>;
  for (const key of ["task_status", "taskStatus", "status"]) {
    if (typeof record[key] === "string") return record[key] as string;
  }
  for (const nested of Object.values(record)) {
    const found = taskStatus(nested);
    if (found) return found;
  }
  return undefined;
}

function findTaskFailureReason(value: unknown): string | undefined {
  if (!value || typeof value !== "object") return undefined;
  const record = value as Record<string, unknown>;
  for (const key of ["message", "error_message", "errorMessage", "reason", "code"]) {
    if (typeof record[key] === "string" && record[key]) return record[key] as string;
  }
  for (const nested of Object.values(record)) {
    const found = findTaskFailureReason(nested);
    if (found) return found;
  }
  return undefined;
}

async function publicAssetUrl(assetId: string, params: VideoProviderParams, index: number) {
  const loadedAsset = await getAsset(assetId);
  if (!loadedAsset) throw new ProviderError("MISSING_INPUT_ASSET", "视频生成引用的素材不存在或已被删除。");
  let asset = loadedAsset;

  let localPath = asset.localPath;
  let filename = asset.originalName;
  let transformed = false;
  const mode = actualWanMode(params);
  if (localPath && ["image_to_video_first_frame", "image_to_video_first_last_frame", "audio_driven_video"].includes(mode)) {
    asset = await ensureAssetLocalFile(asset, "Wan 引用的图片素材");
    localPath = asset.localPath;
    const prepared = await prepareVideoFrameForAspectRatio(localPath, params.aspectRatio, "smart_crop");
    localPath = prepared.localPath;
    transformed = prepared.transformed;
    if (transformed) filename = `wan_${params.aspectRatio?.replace(":", "x") ?? "frame"}_${index}.png`;
  }

  const resolved = await resolveRemoteAsset(
    { localPath, url: transformed ? undefined : asset.url, filename, storageKey: transformed ? undefined : asset.storageKey },
    "alibaba",
    "video-input",
    {
      strategy: {
        supportsBase64: false,
        supportsMultipart: false,
        supportsPublicUrl: true,
        prefer: "publicUrl"
      }
    }
  );

  if (resolved.url) {
    return {
      url: resolved.url,
      transformed,
      source: resolved.source,
      width: resolved.width,
      height: resolved.height,
      fileSize: resolved.fileSize,
      wasCompressed: resolved.wasCompressed
    };
  }
  throw new ProviderError("PUBLIC_URL_REQUIRED", "当前阿里 Wan 模型需要可访问素材 URL，请配置 OSS 临时上传或 BACKEND_PUBLIC_BASE_URL。");
}

async function publicVideoUrl(assetId: string) {
  const asset = await getAsset(assetId);
  if (!asset) throw new ProviderError("MISSING_INPUT_ASSET", "视频生成引用的视频素材不存在或已被删除。");
  const resolved = await resolveRemoteAsset(
    { localPath: asset.localPath, url: asset.url, filename: asset.originalName, storageKey: asset.storageKey },
    "alibaba",
    "video-input",
    {
      strategy: {
        supportsBase64: false,
        supportsMultipart: false,
        supportsPublicUrl: true,
        prefer: "publicUrl"
      }
    }
  );
  if (resolved.url) return resolved.url;
  throw new ProviderError("PUBLIC_URL_REQUIRED", "当前阿里视频模型需要可访问的视频 URL，请配置 OSS 临时上传或 BACKEND_PUBLIC_BASE_URL。");
}

export function buildWanBody(params: VideoProviderParams, imageUrls: string[], videoUrls: string[], audioUrls: string[]) {
  const actualModelName = actualWanModelName(params);
  const mode = actualWanMode(params);
  const mapped = mapVideoParams("alibaba", actualModelName, mode, params.aspectRatio, params.resolution, params.duration);
  const input: Record<string, unknown> = { prompt: params.prompt };
  const negativePrompt = buildNegativePrompt({ negativePrompt: params.negativePrompt, realismMode: params.realismMode });
  if (negativePrompt) input.negative_prompt = negativePrompt;

  if (actualModelName === "happyhorse-1.0-t2v" || actualModelName === "wan2.7-t2v-2026-04-25") {
    if (mode !== "text_to_video") throw new ProviderError("MODEL_MODE_UNSUPPORTED", "HappyHorse 1.0 只支持文生视频。");
  } else if (actualModelName === "wan2.7-i2v-2026-04-25" || actualModelName === "happyhorse-1.0-i2v") {
    const media: Array<{ type: "first_frame" | "last_frame" | "first_clip" | "driving_audio"; url: string }> = [];
    if (mode === "image_to_video_first_frame") media.push({ type: "first_frame", url: imageUrls[0] });
    if (actualModelName === "happyhorse-1.0-i2v" && mode !== "image_to_video_first_frame") {
      throw new ProviderError("MODEL_MODE_UNSUPPORTED", "HappyHorse 1.0 图生视频只支持首帧图生视频。");
    }
    if (mode === "image_to_video_first_last_frame") media.push({ type: "first_frame", url: imageUrls[0] }, { type: "last_frame", url: imageUrls[1] });
    if (mode === "video_continuation") media.push({ type: "first_clip", url: videoUrls[0] });
    if (mode === "audio_driven_video") media.push({ type: "first_frame", url: imageUrls[0] }, { type: "driving_audio", url: audioUrls[0] });
    if (mode === "reference_images_to_video") {
      throw new ProviderError("MODEL_MODE_UNSUPPORTED", "阿里 Wan 2.7 图生视频不支持普通图片参考模式，请使用“首帧图生视频”或“首帧 + 尾帧图生视频”。");
    }
    if (!media.length) throw new ProviderError("MODEL_MODE_UNSUPPORTED", "当前 Wan 2.7 图生视频模式未接入。");
    input.media = media;
  } else if (actualModelName === "happyhorse-1.0-r2v" || actualModelName === "wan2.7-r2v") {
    const media: Array<{ type: "reference_image" | "reference_video"; url: string }> = [];
    if (mode === "reference_images_to_video") {
      for (const url of imageUrls) media.push({ type: "reference_image", url });
    } else if (mode === "reference_video_to_video" && actualModelName === "wan2.7-r2v") {
      for (const url of videoUrls) media.push({ type: "reference_video", url });
    } else {
      throw new ProviderError("MODEL_MODE_UNSUPPORTED", "当前阿里参考生视频模型不支持该视频模式。");
    }
    if (!media.length) throw new ProviderError("MISSING_INPUT_ASSET", "参考生视频需要至少连接一张参考图或一个参考视频。");
    input.media = media;
  } else if (actualModelName === "wan2.7-videoedit") {
    throw new ProviderError("ADAPTER_NOT_IMPLEMENTED", "阿里 Wan 2.7 视频编辑的官方请求字段尚未完整接入。");
  } else {
    throw new ProviderError("ADAPTER_NOT_IMPLEMENTED", "当前阿里视频模型不是已接入的官方模型，请切换 HappyHorse 1.0 或 Wan 2.7 官方模型。");
  }

  const parameters = {
    resolution: mapped.resolution,
    ratio: mapped.ratio,
    size: mapped.size,
    duration: params.duration,
    prompt_extend: params.promptExtend ?? true,
    watermark: false,
    ...(params.seed !== undefined ? { seed: params.seed } : {})
  };

  return { model: actualModelName, input, parameters };
}

export async function createWanTask(params: VideoProviderParams, imageUrls: string[], videoUrls: string[], audioUrls: string[], transformedImageCount: number) {
  const endpoint = normalizeWanEndpoint(params.apiBaseUrl);
  const body = buildWanBody(params, imageUrls, videoUrls, audioUrls);
  const actualModelName = actualWanModelName(params);
  const officialMode = actualWanMode(params);
  const mapped = mapVideoParams("alibaba", actualModelName, officialMode, params.aspectRatio, params.resolution, params.duration);
  const media = (body.input as Record<string, unknown>).media;
  const input = body.input as Record<string, unknown>;
  logOfficialPayload(
    buildPayloadSummary({
      providerId: "alibaba",
      selectedModelId: params.catalogModelId,
      actualModelName,
      inputMode: officialMode,
      aspectRatio: params.aspectRatio,
      mappedSize: mapped.size,
      mappedResolution: mapped.resolution,
      duration: params.duration,
      quality: params.qualityMode ?? "full_quality",
      qualityMode: params.qualityMode ?? "full_quality",
      hasImageInput: imageUrls.length > 0,
      imageInputCount: imageUrls.length,
      prompt: params.prompt,
      negativePrompt: typeof input.negative_prompt === "string" ? input.negative_prompt : undefined,
      isMock: false,
      qualityAudit: {
        videoMode: officialMode,
        ratio: body.parameters.ratio,
        qualityMode: params.qualityMode ?? "full_quality",
        negativePromptLength: typeof input.negative_prompt === "string" ? input.negative_prompt.length : 0,
        promptExtend: body.parameters.prompt_extend,
        seed: params.seed,
        isFallback: false,
        inputPreprocessed: transformedImageCount > 0
      },
      payloadSummary: {
        endpointType: "dashscope.video-synthesis",
        mappedAspectRatioField: "parameters.ratio",
        mediaTypes: Array.isArray(media) ? media.map((item) => (item as { type?: string }).type) : [],
        mediaCount: Array.isArray(media) ? media.length : 0,
        ratio: body.parameters.ratio,
        resolution: body.parameters.resolution,
        size: body.parameters.size,
        inputPreprocessed: transformedImageCount > 0,
        transformedImageCount
      }
    })
  );

  const response = await wanFetch("createTask", endpoint, {
    method: "POST",
    headers: {
      Authorization: `Bearer ${params.apiKey}`,
      "Content-Type": "application/json",
      "X-DashScope-Async": "enable"
    },
    body: JSON.stringify(body)
  });

  if (!response.ok) throw classifyWanErrorDetailed(await readProviderErrorDetailed(response));
  const json = await response.json();
  const taskId = findTaskId(json);
  if (!taskId) throw new ProviderError("PROVIDER_ERROR", "阿里 Wan 已返回任务创建结果，但没有找到 task_id。", rawErrorMessage(json));
  return { taskId, rawResponse: json };
}

export async function pollWanTask(params: VideoProviderParams, taskId: string) {
  const endpoint = taskEndpoint(params.apiBaseUrl, taskId);
  const startedAt = Date.now();
  let lastResponse: unknown;

  while (Date.now() - startedAt < 15 * 60 * 1000) {
    await new Promise((resolve) => setTimeout(resolve, 5000));
    const response = await wanFetch("pollTask", endpoint, { method: "GET", headers: { Authorization: `Bearer ${params.apiKey}` } });
    if (!response.ok) throw classifyWanErrorDetailed(await readProviderErrorDetailed(response));

    const json = await response.json();
    lastResponse = json;
    const status = taskStatus(json)?.toUpperCase();
    if (status && ["SUCCEEDED", "SUCCESS", "COMPLETED"].includes(status)) return json;
    if (status && ["FAILED", "ERROR", "CANCELED", "CANCELLED"].includes(status)) {
      const reason = findTaskFailureReason(json);
      throw new ProviderError("PROVIDER_ERROR", `阿里 Wan 视频生成任务失败${reason ? `：${reason}` : "。"}`, rawErrorMessage(json));
    }
  }

  throw new ProviderError("PROVIDER_ERROR", "阿里 Wan 视频生成任务超时。", rawErrorMessage(lastResponse));
}

export async function downloadWanResult(taskResult: unknown): Promise<ProviderGenerateResult> {
  const videoUrl = findVideoUrl(taskResult);
  if (!videoUrl) throw new ProviderError("PROVIDER_ERROR", "阿里 Wan 任务完成，但没有找到可下载的视频 URL。", rawErrorMessage(taskResult));
  const saved = await downloadGeneratedVideoOrUseRemote(videoUrl, "video_alibaba_wan");
  return { status: "success", outputUrl: saved.outputUrl, localPath: saved.localPath, rawResponse: taskResult, payloadSummary: { archiveWarning: saved.archiveWarning } };
}

export async function generateVideoWithAlibabaWan(params: VideoProviderParams): Promise<ProviderGenerateResult> {
  if (!params.apiKey) throw new ProviderError("API_KEY_INVALID", "请先在设置中心配置该模型 API Key。");

  try {
    const mode = actualWanMode(params);
    const imageUrls: string[] = [];
    const videoUrls: string[] = [];
    const audioUrls: string[] = [];
    let transformedImageCount = 0;
    let firstImageAudit: Record<string, unknown> = {};

    if (mode === "image_to_video_first_frame" || mode === "image_to_video_first_last_frame" || mode === "audio_driven_video" || mode === "reference_images_to_video") {
      if (!params.imageAssetIds?.length) throw new ProviderError("MISSING_INPUT_ASSET", "当前模式需要连接首帧图片。");
      if (mode === "image_to_video_first_last_frame" && params.imageAssetIds.length < 2) throw new ProviderError("MISSING_INPUT_ASSET", "已连接首帧，还需要连接尾帧图片。");
      for (const [index, assetId] of params.imageAssetIds.entries()) {
        const result = await publicAssetUrl(assetId, params, index);
        imageUrls.push(result.url);
        if (result.transformed) transformedImageCount += 1;
        if (index === 0) {
          firstImageAudit = {
            inputImageSource: result.source,
            inputImageWidth: result.width,
            inputImageHeight: result.height,
            inputImageFileSize: result.fileSize,
            inputImageWasCompressed: result.wasCompressed ?? false
          };
        }
      }
    }

    if (mode === "reference_video_to_video") {
      if (!params.videoAssetIds?.length) throw new ProviderError("MISSING_INPUT_ASSET", "参考视频生成需要连接一个参考视频素材。");
      for (const assetId of params.videoAssetIds) videoUrls.push(await publicVideoUrl(assetId));
    }

    if (mode === "video_continuation" || mode === "video_edit") throw new ProviderError("ADAPTER_NOT_IMPLEMENTED", "阿里 Wan 视频续写 / 视频编辑的素材上传与官方字段尚未完整接入。");

    const task = await createWanTask(params, imageUrls, videoUrls, audioUrls, transformedImageCount);
    const taskResult = await pollWanTask(params, task.taskId);
    const result = await downloadWanResult(taskResult);
    result.payloadSummary = {
      taskId: task.taskId,
      officialMode: mode,
      actualModelName: actualWanModelName(params),
      inputPreprocessed: transformedImageCount > 0,
      ...firstImageAudit
    };
    return result;
  } catch (error) {
    throw classifyWanErrorDetailed(error);
  }
}
