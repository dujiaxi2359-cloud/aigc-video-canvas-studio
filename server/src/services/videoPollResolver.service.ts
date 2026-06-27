import { decryptApiKey } from "./encryption.service.js";
import { getGenerationTask, saveGenerationTask } from "./generationTask.service.js";
import { getInternalModelConfig } from "./modelConfig.service.js";
import { finalizeVideoTaskResult } from "./videoTaskFinalizer.service.js";
import { providerTaskContextFromResult, redactProviderSecrets, type VideoTaskContext } from "./videoTaskContext.service.js";
import {
  updateCanvasNodeWithGenerationFailure,
  updateCanvasNodeWithGenerationProcessing
} from "./generatedVideoPersistence.service.js";
import {
  extractProviderStatus,
  extractProviderVideoUrl,
  isProviderFailedStatus,
  isProviderRunningStatus,
  isProviderSuccessStatus,
  isRealMediaUrl
} from "../utils/videoResultExtractor.js";

type StoredTask = NonNullable<Awaited<ReturnType<typeof getGenerationTask>>>;

export type VideoPollResolverDependencies = {
  loadTask: typeof getGenerationTask;
  saveTask: typeof saveGenerationTask;
  loadCredential: (credentialId: string) => Promise<string>;
  request: typeof fetch;
  finalize: typeof finalizeVideoTaskResult;
  updateCanvasProcessing: typeof updateCanvasNodeWithGenerationProcessing;
  updateCanvasFailure: typeof updateCanvasNodeWithGenerationFailure;
};

const defaultDependencies: VideoPollResolverDependencies = {
  loadTask: getGenerationTask,
  saveTask: saveGenerationTask,
  loadCredential: async (credentialId) => {
    const model = await getInternalModelConfig(credentialId);
    if (!model?.encrypted_api_key) throw new Error("API_KEY_MISSING");
    return decryptApiKey(model.encrypted_api_key);
  },
  request: fetch,
  finalize: finalizeVideoTaskResult,
  updateCanvasProcessing: updateCanvasNodeWithGenerationProcessing,
  updateCanvasFailure: updateCanvasNodeWithGenerationFailure
};

const scheduledPolls = new Set<string>();

function joinUrl(baseUrl: string, endpoint: string) {
  if (/^https?:\/\//i.test(endpoint)) return endpoint;
  return `${baseUrl.replace(/\/+$/, "")}/${endpoint.replace(/^\/+/, "")}`;
}

export function materializeVideoPollUrl(context: VideoTaskContext, providerTaskId: string) {
  const preferred = context.pollUrl || context.statusUrl || context.resultUrl || context.pollEndpoint;
  if (!preferred) return undefined;
  const encoded = encodeURIComponent(providerTaskId);
  const endpoint = preferred
    .replace(/\{taskId\}|\{task_id\}|\{id\}|\{video_id\}|\{job_id\}/g, encoded);
  const pollUrl = joinUrl(context.baseUrl, endpoint);
  const createUrl = joinUrl(context.baseUrl, context.createEndpoint);
  if (pollUrl.replace(/\/+$/, "") === createUrl.replace(/\/+$/, "")) return undefined;
  return pollUrl;
}

function progressFrom(payload: unknown) {
  if (!payload || typeof payload !== "object") return undefined;
  const record = payload as Record<string, unknown>;
  const value = record.progress ?? (record.data && typeof record.data === "object" ? (record.data as Record<string, unknown>).progress : undefined);
  const parsed = typeof value === "string" ? Number.parseFloat(value) : Number(value);
  return Number.isFinite(parsed) ? Math.max(0, Math.min(100, parsed)) : undefined;
}

function responseMessage(payload: unknown) {
  if (!payload || typeof payload !== "object") return "";
  const record = payload as Record<string, unknown>;
  return [record.message, record.error, record.error_message, record.detail]
    .map((value) => typeof value === "string" ? value : value && typeof value === "object" ? JSON.stringify(value) : "")
    .filter(Boolean)
    .join(" ");
}

function contextForTask(task: StoredTask) {
  return task.providerContext && typeof task.providerContext === "object"
    ? task.providerContext as VideoTaskContext
    : providerTaskContextFromResult(task.result);
}

async function preservePollError(input: {
  task: StoredTask;
  context: VideoTaskContext;
  rawResponse: unknown;
  errorCode: string;
  errorMessage: string;
  dependencies: VideoPollResolverDependencies;
}) {
  await input.dependencies.saveTask({
    id: input.task.id,
    providerTaskId: input.task.providerTaskId,
    canvasNodeId: input.task.canvasNodeId,
    projectId: input.task.projectId,
    providerId: input.task.providerId,
    modelId: input.task.modelId,
    providerContext: input.context,
    status: "processing",
    providerStatus: "processing_with_poll_error",
    progress: input.task.progress,
    rawPollResponse: redactProviderSecrets(input.rawResponse),
    result: { pollErrorCode: input.errorCode },
    errorMessage: input.errorMessage
  });
  return {
    status: "processing" as const,
    errorCode: input.errorCode,
    errorMessage: input.errorMessage,
    providerTaskId: input.task.providerTaskId
  };
}

export async function pollVideoTaskFromSavedContext(
  localTaskId: string,
  dependencies: VideoPollResolverDependencies = defaultDependencies,
  source: "poll" | "sync" = "poll"
) {
  const task = await dependencies.loadTask(localTaskId);
  if (!task?.providerTaskId) return { status: "error" as const, errorCode: "TASK_ID_MISSING" as const };
  const context = contextForTask(task);
  if (!context) return { status: "error" as const, errorCode: "PROVIDER_ENDPOINT_MISSING" as const, providerTaskId: task.providerTaskId };
  const pollUrl = materializeVideoPollUrl(context, task.providerTaskId);
  if (!pollUrl) return { status: "error" as const, errorCode: "PROVIDER_ENDPOINT_MISSING" as const, providerTaskId: task.providerTaskId };

  const apiKey = context.authMode === "none" ? "" : await dependencies.loadCredential(context.credentialId);
  const headers: Record<string, string> = { Accept: "application/json" };
  if (context.authMode === "bearer") headers.Authorization = `Bearer ${apiKey}`;
  if (context.authMode === "custom") {
    headers["api-key"] = apiKey;
    headers["x-api-key"] = apiKey;
  }
  if (context.pollMethod === "POST") headers["Content-Type"] = "application/json";
  const response = await dependencies.request(pollUrl, {
    method: context.pollMethod,
    headers,
    body: context.pollMethod === "POST" ? JSON.stringify({ task_id: task.providerTaskId }) : undefined
  });
  const text = await response.text();
  let payload: unknown = text;
  try {
    payload = text ? JSON.parse(text) as unknown : {};
  } catch {
    payload = { message: text };
  }

  const message = responseMessage(payload);
  if (/prompt is too short|please describe the video|missing prompt|text to video requires prompt/i.test(message)) {
    return preservePollError({
      task,
      context,
      rawResponse: payload,
      errorCode: "POLL_ROUTE_WRONG_CREATE_ENDPOINT",
      errorMessage: "任务查询错误地命中了创建接口。",
      dependencies
    });
  }
  if (response.status === 401 || response.status === 403) {
    return preservePollError({
      task,
      context,
      rawResponse: payload,
      errorCode: "PROVIDER_TASK_QUERY_FORBIDDEN",
      errorMessage: "上游任务查询暂时被拒绝，可稍后重新同步。",
      dependencies
    });
  }
  if (response.status === 404) {
    await dependencies.saveTask({
      id: task.id,
      providerTaskId: task.providerTaskId,
      providerContext: context,
      status: "failed",
      providerStatus: "not_found",
      rawPollResponse: redactProviderSecrets(payload),
      result: { pollErrorCode: "PROVIDER_TASK_NOT_FOUND" },
      errorMessage: "上游任务不存在。"
    });
    return { status: "error" as const, errorCode: "PROVIDER_TASK_NOT_FOUND" as const, providerTaskId: task.providerTaskId };
  }
  if (!response.ok) {
    return preservePollError({
      task,
      context,
      rawResponse: payload,
      errorCode: "PROVIDER_RAW_ERROR",
      errorMessage: message || `上游任务查询失败（HTTP ${response.status}）。`,
      dependencies
    });
  }

  const providerStatus = extractProviderStatus(payload) || "processing";
  if (isProviderSuccessStatus(payload)) {
    const videoUrl = extractProviderVideoUrl(payload);
    if (!videoUrl || !isRealMediaUrl(videoUrl)) {
      return preservePollError({
        task,
        context,
        rawResponse: payload,
        errorCode: "PROVIDER_RESULT_EMPTY",
        errorMessage: "上游任务已完成，但没有返回真实视频 URL。",
        dependencies
      });
    }
    return dependencies.finalize({
      taskId: task.id,
      providerTaskId: task.providerTaskId,
      canvasNodeId: task.canvasNodeId,
      projectId: task.projectId,
      userId: task.userId,
      provider: task.providerId,
      model: task.modelId,
      videoUrl,
      rawResponse: payload,
      source
    });
  }
  if (isProviderFailedStatus(payload)) {
    await dependencies.saveTask({
      id: task.id,
      providerTaskId: task.providerTaskId,
      providerContext: context,
      status: "failed",
      providerStatus,
      rawPollResponse: redactProviderSecrets(payload),
      result: { pollErrorCode: "PROVIDER_RAW_ERROR" },
      errorMessage: message || "上游视频任务失败。"
    });
    await dependencies.updateCanvasFailure({
      projectId: task.projectId,
      nodeId: task.canvasNodeId,
      errorMessage: message || "上游视频任务失败。",
      errorCode: "PROVIDER_RAW_ERROR"
    });
    return { status: "error" as const, errorCode: "PROVIDER_RAW_ERROR" as const, providerTaskId: task.providerTaskId };
  }

  await dependencies.saveTask({
    id: task.id,
    providerTaskId: task.providerTaskId,
    canvasNodeId: task.canvasNodeId,
    projectId: task.projectId,
    providerId: task.providerId,
    modelId: task.modelId,
    providerContext: context,
    status: "processing",
    providerStatus: isProviderRunningStatus(payload) ? providerStatus : "processing",
    progress: progressFrom(payload) ?? task.progress,
    rawPollResponse: redactProviderSecrets(payload),
    result: { lastPollAt: new Date().toISOString() },
    errorMessage: null
  });
  await dependencies.updateCanvasProcessing({
    projectId: task.projectId,
    nodeId: task.canvasNodeId,
    providerTaskId: task.providerTaskId,
    progress: progressFrom(payload) ?? task.progress
  });
  return { status: "processing" as const, providerStatus, providerTaskId: task.providerTaskId };
}

export function scheduleVideoTaskPolling(localTaskId: string, attempt = 0) {
  if (!localTaskId || scheduledPolls.has(localTaskId)) return;
  scheduledPolls.add(localTaskId);
  const timer = setTimeout(async () => {
    try {
      const result = await pollVideoTaskFromSavedContext(localTaskId);
      scheduledPolls.delete(localTaskId);
      if (result.status === "processing" && attempt < 119) scheduleVideoTaskPolling(localTaskId, attempt + 1);
    } catch (error) {
      scheduledPolls.delete(localTaskId);
      console.warn("[video-task:auto-poll-error]", {
        localTaskId,
        error: error instanceof Error ? error.message : String(error)
      });
      if (attempt < 119) scheduleVideoTaskPolling(localTaskId, attempt + 1);
    }
  }, attempt === 0 ? 5_000 : 15_000);
  timer.unref?.();
}
