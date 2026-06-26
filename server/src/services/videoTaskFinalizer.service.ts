import { saveGenerationTask } from "./generationTask.service.js";
import { updateCanvasNodeWithGeneratedVideo } from "./generatedVideoPersistence.service.js";
import { rawErrorMessage } from "../utils/providerErrors.js";
import { extractProviderVideoUrl, sanitizeUrlForLog } from "../utils/videoResultExtractor.js";

export type VideoFinalizeSource = "normal_generate" | "sync_upstream" | "reconciler" | "admin_repair" | "legacy_repair";

export type FinalizeVideoResultInput = {
  taskId?: string;
  providerTaskId?: string;
  canvasNodeId?: string;
  projectId?: string;
  providerId?: string;
  modelId?: string;
  providerResult?: unknown;
  providerVideoUrl?: string;
  outputUrl?: string;
  outputAssetId?: string;
  cdnUrl?: string;
  cosUrl?: string;
  posterUrl?: string;
  thumbnailUrl?: string;
  previewUrl?: string;
  downloadableUrl?: string;
  rawResponse?: unknown;
  source: VideoFinalizeSource;
};

function finalizerLog(event: string, payload: Record<string, unknown>) {
  console.info(`[video-finalizer:${event}]`, JSON.stringify(payload));
}

function firstString(...values: unknown[]) {
  for (const value of values) {
    if (typeof value === "string" && value.trim()) return value.trim();
  }
  return undefined;
}

export async function finalizeVideoResult(input: FinalizeVideoResultInput) {
  const taskId = input.taskId || input.providerTaskId;
  const providerTaskId = input.providerTaskId || input.taskId;
  finalizerLog("start", {
    source: input.source,
    taskId,
    providerTaskId,
    canvasNodeId: input.canvasNodeId
  });

  const videoUrl = firstString(
    input.outputUrl,
    input.providerVideoUrl,
    input.previewUrl,
    extractProviderVideoUrl(input.rawResponse),
    extractProviderVideoUrl(input.providerResult)
  );
  if (!videoUrl) {
    finalizerLog("failed", {
      source: input.source,
      taskId,
      reason: "VIDEO_RESULT_EMPTY"
    });
    return { status: "error" as const, errorCode: "VIDEO_RESULT_EMPTY" as const };
  }

  finalizerLog("url-found", {
    source: input.source,
    taskId,
    videoUrl: sanitizeUrlForLog(videoUrl)
  });

  const now = Date.now();
  await saveGenerationTask({
    id: taskId || videoUrl,
    status: "succeeded",
    providerStatus: "completed",
    providerTaskId,
    canvasNodeId: input.canvasNodeId,
    projectId: input.projectId,
    providerId: input.providerId,
    modelId: input.modelId,
    providerVideoUrl: input.providerVideoUrl || videoUrl,
    outputUrl: input.outputUrl || videoUrl,
    cdnUrl: input.cdnUrl,
    posterUrl: input.posterUrl,
    previewUrl: input.previewUrl || input.outputUrl || videoUrl,
    downloadableUrl: input.downloadableUrl || input.outputUrl || videoUrl,
    completedAt: now,
    finishedAt: now,
    progress: 100,
    result: {
      ...(input.providerResult && typeof input.providerResult === "object" ? input.providerResult as Record<string, unknown> : {}),
      rawResponse: input.rawResponse,
      providerVideoUrl: sanitizeUrlForLog(input.providerVideoUrl || videoUrl),
      outputUrl: sanitizeUrlForLog(input.outputUrl || videoUrl),
      cdnUrl: sanitizeUrlForLog(input.cdnUrl),
      cosUrl: sanitizeUrlForLog(input.cosUrl),
      posterUrl: sanitizeUrlForLog(input.posterUrl),
      previewUrl: sanitizeUrlForLog(input.previewUrl || input.outputUrl || videoUrl),
      finalizerSource: input.source,
      finalizedAt: new Date(now).toISOString()
    }
  });
  finalizerLog("task-updated", {
    taskId,
    status: "succeeded",
    outputUrl: sanitizeUrlForLog(input.outputUrl || videoUrl)
  });

  try {
    await updateCanvasNodeWithGeneratedVideo({
      projectId: input.projectId,
      nodeId: input.canvasNodeId,
      outputUrl: input.outputUrl || videoUrl,
      outputAssetId: input.outputAssetId,
      cdnUrl: input.cdnUrl,
      cosUrl: input.cosUrl,
      posterUrl: input.posterUrl,
      thumbnailUrl: input.thumbnailUrl,
      previewUrl: input.previewUrl || input.outputUrl || videoUrl,
      downloadableUrl: input.downloadableUrl || input.outputUrl || videoUrl,
      providerTaskId
    });
    finalizerLog("canvas-updated", {
      taskId,
      canvasNodeId: input.canvasNodeId,
      videoUrl: sanitizeUrlForLog(input.outputUrl || videoUrl),
      loading: false
    });
  } catch (error) {
    finalizerLog("failed", {
      source: input.source,
      taskId,
      reason: "CANVAS_UPDATE_FAILED",
      error: rawErrorMessage(error)
    });
  }

  finalizerLog("completed", {
    source: input.source,
    taskId
  });
  return {
    status: "succeeded" as const,
    providerTaskId,
    providerVideoUrl: input.providerVideoUrl || videoUrl,
    outputUrl: input.outputUrl || videoUrl,
    previewUrl: input.previewUrl || input.outputUrl || videoUrl,
    downloadableUrl: input.downloadableUrl || input.outputUrl || videoUrl,
    progress: 100
  };
}
