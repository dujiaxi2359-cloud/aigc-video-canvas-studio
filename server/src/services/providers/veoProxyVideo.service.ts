import fs from "node:fs";
import path from "node:path";
import { legacyInputModeToOfficialMode, type OfficialVideoMode } from "../../types/videoModes.js";
import { downloadGeneratedFile } from "../../utils/downloadGeneratedFile.js";
import { ProviderError, rawErrorMessage } from "../../utils/providerErrors.js";
import { mapVideoDimensions } from "../../utils/videoParams.js";
import { getAsset } from "../asset.service.js";
import { ensureAssetLocalFile } from "../assets/ensureAssetLocalFile.service.js";
import { prepareVideoFrameForAspectRatio } from "../assets/prepareVideoFrame.service.js";
import { resolveRemoteAsset } from "../assets/resolveRemoteAsset.service.js";
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

function isRunApiEndpoint(apiBaseUrl: string) {
  return /runapi\.co/i.test(apiBaseUrl);
}

function isCy88Endpoint(apiBaseUrl: string) {
  return /(?:^|\.)cy88\.ai/i.test(apiBaseUrl);
}

function isAi666Endpoint(apiBaseUrl: string) {
  return /(?:^|\.)ai666\.net/i.test(apiBaseUrl);
}

function cleanEndpoint(value: string) {
  return value.trim().replace(/^(?:POST|GET|PUT|PATCH|DELETE)\s+/i, "").replace(/\/$/, "");
}

export function veoProxyCreateEndpoint(apiBaseUrl: string) {
  const base = cleanEndpoint(apiBaseUrl);
  if (isRunApiEndpoint(base)) {
    if (/\/v1\/video\/create$/i.test(base)) return base;
    if (/\/v1$/i.test(base)) return `${base}/video/create`;
    return `${base}/v1/video/create`;
  }
  if (isCy88Endpoint(base)) {
    if (/\/v1\/video\/create$/i.test(base)) return base;
    if (/\/v1$/i.test(base)) return `${base}/video/create`;
    return `${base}/v1/video/create`;
  }
  if (/\/v1\/videos$/i.test(base) || /\/v1\/video\/create$/i.test(base)) return base;
  if (/\/v1$/i.test(base)) return `${base}/videos`;
  return `${base}/v1/videos`;
}

function endpointRoot(apiBaseUrl: string) {
  return cleanEndpoint(apiBaseUrl)
    .replace(/\/v1\/video\/create$/i, "")
    .replace(/\/v1\/video\/query$/i, "")
    .replace(/\/v1\/videos\/generations$/i, "")
    .replace(/\/v1\/video\/generations$/i, "")
    .replace(/\/v1\/videos$/i, "")
    .replace(/\/v1$/i, "");
}

function unique(items: Array<string | undefined>) {
  return Array.from(new Set(items.filter(Boolean) as string[]));
}

export function veoProxyCreateEndpointCandidates(apiBaseUrl: string) {
  const primary = veoProxyCreateEndpoint(apiBaseUrl);
  const root = endpointRoot(apiBaseUrl);
  if (isRunApiEndpoint(apiBaseUrl)) {
    return unique([
      primary,
      `${root}/v1/video/create`,
      `${root}/v1/videos`,
      `${root}/v1/videos/generations`,
      `${root}/v1/video/generations`
    ]);
  }
  if (isCy88Endpoint(apiBaseUrl)) {
    return unique([
      primary,
      `${root}/v1/video/create`,
      `${root}/v1/videos`,
      `${root}/v1/video/generations`,
      `${root}/v1/videos/generations`
    ]);
  }
  return unique([
    primary,
    `${root}/v1/videos`,
    `${root}/v1/video/create`,
    `${root}/v1/videos/generations`,
    `${root}/v1/video/generations`
  ]);
}

function mimeTypeFromPath(filePath: string) {
  const extension = path.extname(filePath).toLowerCase();
  if (extension === ".png") return "image/png";
  if (extension === ".webp") return "image/webp";
  return "image/jpeg";
}

async function imageInputs(assetIds?: string[], aspectRatio?: string, preferPublicUrl = false) {
  const images: string[] = [];
  const audits: Array<Record<string, unknown>> = [];
  for (const assetId of assetIds ?? []) {
    const asset = await ensureAssetLocalFile(await getAsset(assetId), "Veo 中转接口引用的图片素材");
    const prepared = aspectRatio
      ? await prepareVideoFrameForAspectRatio(asset.localPath, aspectRatio, "smart_crop")
      : undefined;
    const inputPath = prepared?.localPath ?? asset.localPath;
    const stat = fs.statSync(inputPath);
    const mimeType = prepared?.transformed ? "image/png" : asset.mimeType || mimeTypeFromPath(inputPath);
    let imageValue: string;
    let inputFileSource: string | undefined = asset.localFileSource;
    if (preferPublicUrl) {
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
          "veo-proxy",
          "video-reference",
          {
            strategy: {
              supportsBase64: false,
              supportsMultipart: false,
              supportsPublicUrl: true,
              prefer: "publicUrl"
            },
            signedUrlExpiresSeconds: 3600
          }
        );
        if (resolved.type === "url" && resolved.url) {
          imageValue = resolved.url;
          inputFileSource = resolved.source ?? inputFileSource;
        }
      } catch (error) {
        if (/runapi\.co/i.test(String(error instanceof Error ? error.message : error))) throw error;
        console.warn("[veo proxy image url fallback]", {
          assetId,
          reason: error instanceof Error ? error.message : String(error)
        });
      }
    }
    imageValue ??= `data:${mimeType};base64,${fs.readFileSync(inputPath).toString("base64")}`;
    images.push(imageValue);
    audits.push({
      assetId,
      inputImageSource: prepared?.transformed ? "smartCropAspectRatio" : "localPath",
      inputFileSource,
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

function runApiRequestSize(resolution?: string) {
  const normalized = resolution?.toLowerCase();
  if (normalized === "1080p") return "1080P";
  if (normalized === "4k") return "4K";
  return "720P";
}

function relayDuration(input: VideoProviderParams) {
  return input.duration && input.duration > 0 ? input.duration : undefined;
}

function relayDimensions(aspectRatio?: string, resolution?: string) {
  if (!aspectRatio || !resolution) return undefined;
  return mapVideoDimensions(aspectRatio, resolution);
}

function relayAspectFields(aspectRatio?: string, resolution?: string) {
  const dimensions = relayDimensions(aspectRatio, resolution);
  const orientation = aspectRatio === "9:16" || aspectRatio === "3:4" || aspectRatio === "2:5"
    ? "portrait"
    : aspectRatio === "1:1"
      ? "square"
      : aspectRatio
        ? "landscape"
        : undefined;
  return {
    ...(aspectRatio ? { aspect_ratio: aspectRatio, aspectRatio, ratio: aspectRatio } : {}),
    ...(resolution ? { resolution } : {}),
    ...(orientation ? { orientation } : {}),
    ...(dimensions ? { size: `${dimensions.width}x${dimensions.height}`, width: dimensions.width, height: dimensions.height } : {})
  };
}

function relayDurationFields(params: VideoProviderParams) {
  const duration = relayDuration(params);
  return duration ? { duration, seconds: String(duration) } : {};
}

function veoMetadataFields(aspectRatio?: string, resolution?: string, params?: VideoProviderParams) {
  return {
    metadata: {
      output_config: {
        ...(aspectRatio ? { aspect_ratio: aspectRatio, AspectRatio: aspectRatio } : {}),
        ...(resolution ? { resolution: resolution.toUpperCase(), Resolution: resolution.toUpperCase() } : {}),
        audio_generation: "Disabled"
      },
      ...(params?.duration ? { durationSeconds: params.duration, DurationSeconds: params.duration } : {})
    }
  };
}

export function buildVeoProxyBody(input: {
  endpoint: string;
  params: VideoProviderParams;
  relayModel: string;
  images: string[];
  requestAspectRatio?: string;
  requestResolution?: string;
  requestSize?: string;
  isOmni: boolean;
}) {
  const protocol = relayProtocol(input.endpoint);
  const isRunApi = isRunApiEndpoint(input.endpoint);
  if (isRunApi) {
    return {
      model: input.relayModel,
      prompt: input.params.prompt,
      images: input.images,
      ...(input.params.duration ? { duration: input.params.duration } : {}),
      enhance_prompt: input.params.promptExtend ?? true,
      enable_upsample: Boolean(input.requestResolution && input.requestResolution.toLowerCase() !== "720p"),
      ...(input.requestAspectRatio ? { aspect_ratio: input.requestAspectRatio } : {}),
      ...(input.requestResolution ? { size: runApiRequestSize(input.requestResolution) } : {})
    };
  }

  if (protocol === "unified-create-query") {
    if (isAi666Endpoint(input.endpoint) || isCy88Endpoint(input.endpoint)) {
      const dimensions = relayDimensions(input.requestAspectRatio, input.requestResolution);
      const orientation = input.requestAspectRatio === "9:16" ? "portrait" : "landscape";
      return {
        model: input.relayModel,
        prompt: input.params.prompt,
        images: input.images,
        orientation,
        ...(dimensions ? { size: `${dimensions.width}x${dimensions.height}` } : {}),
        ...(input.params.duration ? { duration: input.params.duration } : {}),
        ...(input.requestAspectRatio ? { aspect_ratio: input.requestAspectRatio } : {}),
        enable_upsample: orientation === "landscape" && Boolean(input.requestResolution && input.requestResolution.toLowerCase() !== "720p")
      };
    }
    return {
      model: input.relayModel,
      prompt: input.params.prompt,
      images: input.images,
      input_reference: input.images.length === 1 ? input.images[0] : input.images,
      ...relayAspectFields(input.requestAspectRatio, input.requestResolution),
      ...relayDurationFields(input.params),
      ...veoMetadataFields(input.requestAspectRatio, input.requestResolution, input.params),
      enhance_prompt: input.params.promptExtend ?? true,
      ...(input.requestResolution ? { enable_upsample: input.requestResolution.toLowerCase() !== "720p" } : {})
    };
  }

  return {
    model: input.relayModel,
    prompt: input.params.prompt,
    ...(input.requestSize ? { size: input.requestSize } : {}),
    ...relayAspectFields(input.requestAspectRatio, input.requestResolution),
    ...(input.requestResolution ? { resolution: input.requestResolution } : {}),
    ...relayDurationFields(input.params),
    input_reference: input.images.length === 1 ? input.images[0] : input.images,
    ...veoMetadataFields(input.requestAspectRatio, input.requestResolution, input.params),
    images: input.images
  };
}

async function createVeoProxyTask(input: {
  endpoint: string;
  params: VideoProviderParams;
  body: Record<string, unknown>;
}) {
  const response = await fetch(input.endpoint, {
    method: "POST",
    headers: {
      Authorization: `Bearer ${input.params.apiKey}`,
      "Content-Type": "application/json",
      Accept: "application/json"
    },
    body: JSON.stringify(input.body)
  });
  const text = await response.text();
  try {
    return { response, payload: JSON.parse(text) as Record<string, unknown> };
  } catch {
    return {
      response,
      payload: {
        message: `Veo 中转接口返回了无法解析的响应（HTTP ${response.status}）。`,
        raw: text.slice(0, 1000)
      }
    };
  }
}

function shouldTryNextVeoEndpoint(response: Response | undefined, payload: Record<string, unknown> | undefined, taskId?: string, directVideoUrl?: string) {
  if (directVideoUrl || taskId) return false;
  const message = payload ? errorMessage(payload) : "";
  const text = `${response?.status ?? ""} ${message} ${payload ? JSON.stringify(payload).slice(0, 1000) : ""}`;
  if (/unauthorized|forbidden|invalid api key|incorrect api key|quota|credit|balance|insufficient|no access|permission|额度|余额|无权限|未开通/i.test(text)) {
    return false;
  }
  if (response && [400, 404, 405, 415, 422, 500, 502, 503, 504].includes(response.status)) return true;
  return /invalid url|not found|cannot\s+(post|get)|method not allowed|unsupported endpoint|route|path|html|cloudflare|gateway|没有返回任务 id|task_id|task id/i.test(text);
}

function isTransientPollError(error: unknown) {
  return /fetch failed|terminated|network|econn|etimedout|timeout|socket|other side closed|und_err|dns|gateway|502|503|504/i.test(rawErrorMessage(error));
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
  const mode = params.videoMode ?? legacyInputModeToOfficialMode(params.inputMode, "google");
  const isOmni = params.modelName === "omni_flash-10s";
  if (!["text_to_video", "image_to_video_first_frame", "image_to_video_first_last_frame", "reference_images_to_video"].includes(mode)) {
    throw new ProviderError("MODEL_MODE_UNSUPPORTED", "当前 Google 中转视频接口只支持文生视频、图生视频和参考图生视频。");
  }
  if (isOmni && mode === "image_to_video_first_last_frame") {
    throw new ProviderError("MODEL_MODE_UNSUPPORTED", "Google Omni Flash 10s 暂不支持首尾帧模式。");
  }

  let activeEndpoint: string | undefined;
  let activeProxyTaskId: string | undefined;
  try {
    const requestAspectRatio = isOmni ? params.aspectRatio : params.aspectRatio ?? "16:9";
    const requestResolution = isOmni ? params.resolution : params.resolution ?? "720p";
    const useUnifiedPortraitComponents = (isAi666Endpoint(params.apiBaseUrl) || isCy88Endpoint(params.apiBaseUrl))
      && mode === "reference_images_to_video"
      && requestAspectRatio === "9:16";
    const defaultEndpointCandidates = veoProxyCreateEndpointCandidates(params.apiBaseUrl);
    const root = endpointRoot(params.apiBaseUrl);
    const endpointCandidates = useUnifiedPortraitComponents
      ? unique([`${root}/v1/video/create`, ...defaultEndpointCandidates])
      : defaultEndpointCandidates;
    let endpoint = endpointCandidates[0]!;
    let protocol = relayProtocol(endpoint);
    const configuredModel = configuredRelayModelName(params);
    let relayModel = useUnifiedPortraitComponents ? "veo3.1-fast-components" : configuredModel;
    const requestSize = requestAspectRatio && requestResolution ? proxySize(requestAspectRatio, requestResolution) : undefined;
    const { images, audits: inputImageAudits } = await imageInputs(params.imageAssetIds, requestAspectRatio, Boolean(params.imageAssetIds?.length));
    let response: Response | undefined;
    let created: Record<string, unknown> = {};
    let directVideoUrl: string | undefined;
    let taskId: string | undefined;
    const attemptedEndpoints: Array<{ endpoint: string; status?: number; message?: string }> = [];

    for (const candidate of endpointCandidates) {
      endpoint = candidate;
      activeEndpoint = endpoint;
      protocol = relayProtocol(endpoint);
      relayModel = useUnifiedPortraitComponents && protocol === "unified-create-query"
        ? "veo3.1-fast-components"
        : configuredModel;
      const body = buildVeoProxyBody({
        endpoint,
        params,
        relayModel,
        images,
        requestAspectRatio,
        requestResolution,
        requestSize,
        isOmni
      });
      const attempt = await createVeoProxyTask({ endpoint, params, body });
      response = attempt.response;
      created = attempt.payload;
      directVideoUrl = findVideoUrl(created);
      taskId = taskIdFromResponse(created);
      activeProxyTaskId = taskId;
      attemptedEndpoints.push({ endpoint, status: response.status, message: errorMessage(created).slice(0, 220) });
      if (response.ok && (directVideoUrl || taskId)) break;
      if (!shouldTryNextVeoEndpoint(response, created, taskId, directVideoUrl)) break;
      console.warn("[veo proxy endpoint fallback]", {
        endpoint,
        status: response.status,
        reason: errorMessage(created),
        next: endpointCandidates[attemptedEndpoints.length]
      });
    }

    if (!response?.ok) {
      throw new ProviderError("PROVIDER_ERROR", `Veo 中转接口创建任务失败：${errorMessage(created)}`, JSON.stringify(created), { endpoint, attemptedEndpoints });
    }

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
          attemptedEndpoints,
          proxyTaskId: taskId,
          proxyModel: relayModel,
          configuredModel: params.modelName,
          requestedAspectRatio: requestAspectRatio,
          requestedResolution: requestResolution,
          requestedDuration: params.duration,
          nativeAspectRatioRequired: requestAspectRatio === "9:16",
          inputImageCount: images.length,
          inputImages: inputImageAudits,
          directResult: true
        }
      };
    }
    if (!taskId) {
      throw new ProviderError("PROVIDER_ERROR", "Veo 中转接口没有返回任务 id。", JSON.stringify(created), { endpoint, attemptedEndpoints, response: created });
    }
    activeProxyTaskId = taskId;
    const pollUrl = protocol === "unified-create-query"
      ? unifiedQueryEndpoint(endpoint, taskId)
      : `${endpoint}/${encodeURIComponent(taskId)}`;
    await saveGenerationTask({
      id: taskId,
      status: taskStatus(created) || "submitted",
      result: {
        provider: "google-veo-proxy",
        endpoint,
        attemptedEndpoints,
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
    let transientPollFailures = 0;
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
      let pollResponse: Response;
      try {
        pollResponse = await fetch(pollUrl, {
          headers: { Authorization: `Bearer ${params.apiKey}` }
        });
      } catch (pollError) {
        if (isTransientPollError(pollError)) {
          transientPollFailures += 1;
          await saveGenerationTask({
            id: taskId,
            status: taskStatus(task) || "processing",
            result: {
              ...task,
              pollWarning: rawErrorMessage(pollError),
              transientPollFailures
            },
            errorMessage: `Veo 中转任务已提交，查询临时失败，正在重试：${rawErrorMessage(pollError)}`
          });
          continue;
        }
        throw pollError;
      }
      transientPollFailures = 0;
      const polledTask = await responseJson(pollResponse);
      task = polledTask;
      await saveGenerationTask({ id: taskId, status: taskStatus(task) || "processing", result: task });
      if (!pollResponse.ok) {
        const pollMessage = errorMessage(task);
        if (isTransientPollError(pollMessage)) continue;
        throw new ProviderError("PROVIDER_ERROR", `Veo 中转任务查询失败：${pollMessage}`, JSON.stringify(task), {
          endpoint,
          pollUrl,
          taskId,
          proxyTaskId: taskId,
          relayModel,
          relayProtocol: protocol,
          attemptedEndpoints
        });
      }
    }

    const videoUrl = findVideoUrl(task);
    if (!videoUrl) {
      await saveGenerationTask({ id: taskId, status: "completed_without_video_url", result: task, errorMessage: "Veo 中转任务已完成，但响应中没有找到视频 URL。" });
      throw new ProviderError("VEO_OPERATION_NO_VIDEO_IN_RESPONSE", "Veo 中转任务已完成，但响应中没有找到视频 URL。", JSON.stringify(task), {
        endpoint,
        taskId,
        proxyTaskId: taskId,
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
        attemptedEndpoints,
        proxyTaskId: taskId,
        proxyModel: relayModel,
        configuredModel: params.modelName,
        relayDisplayNote: protocol === "openai-videos" ? "中转后台的平台列可能显示 Omni，但实际请求 model 字段仍是 proxyModel。" : undefined,
        requestedAspectRatio: requestAspectRatio,
        requestedResolution: requestResolution,
        requestedDuration: params.duration,
        nativeAspectRatioRequired: requestAspectRatio === "9:16",
        inputImageCount: images.length,
        inputImages: inputImageAudits
      }
    };
  } catch (error) {
    if (error instanceof ProviderError) throw error;
    const message = rawErrorMessage(error);
    if (/fetch failed|network|econn|dns|timeout/i.test(message)) {
      throw new ProviderError("NETWORK_ERROR", "Veo 中转接口网络请求失败，请检查 Base URL、本地代理和中转服务状态。", message, { proxyTaskId: activeProxyTaskId, endpoint: activeEndpoint });
    }
    throw new ProviderError("PROVIDER_ERROR", "Veo 中转接口调用失败。", message, { proxyTaskId: activeProxyTaskId, endpoint: activeEndpoint });
  }
}
