import { isRealMediaUrl, sanitizeUrlForLog } from "../utils/videoResultExtractor.js";
import { updateCanvasNodeWithGenerationSuccess } from "./generatedVideoPersistence.service.js";
import { saveGenerationTask } from "./generationTask.service.js";
import { redactProviderSecrets } from "./videoTaskContext.service.js";

export type VideoTaskFinalizeSource = "generate" | "poll" | "sync" | "manual_repair";

export type FinalizeVideoTaskResultInput = {
  taskId: string;
  providerTaskId?: string;
  canvasNodeId?: string;
  projectId?: string;
  userId?: string;
  provider?: string;
  model?: string;
  providerContext?: unknown;
  videoUrl: string;
  rawResponse?: unknown;
  source: VideoTaskFinalizeSource;
  fileName?: string;
  payloadSummary?: unknown;
};

export type VideoTaskFinalizerDependencies = {
  saveTask: typeof saveGenerationTask;
  updateCanvas: typeof updateCanvasNodeWithGenerationSuccess;
};

const defaultDependencies: VideoTaskFinalizerDependencies = {
  saveTask: saveGenerationTask,
  updateCanvas: updateCanvasNodeWithGenerationSuccess
};

export async function finalizeVideoTaskResult(
  input: FinalizeVideoTaskResultInput,
  dependencies: VideoTaskFinalizerDependencies = defaultDependencies
) {
  const videoUrl = input.videoUrl.trim();
  if (!isRealMediaUrl(videoUrl)) {
    return {
      status: "error" as const,
      errorCode: "VIDEO_URL_NOT_MEDIA" as const
    };
  }

  const result = {
    ...(input.payloadSummary && typeof input.payloadSummary === "object"
      ? input.payloadSummary as Record<string, unknown>
      : {}),
    finalizerSource: input.source,
    finalizedAt: new Date().toISOString(),
    providerVideoUrl: sanitizeUrlForLog(videoUrl)
  };

  await dependencies.saveTask({
    id: input.taskId,
    userId: input.userId,
    providerTaskId: input.providerTaskId,
    canvasNodeId: input.canvasNodeId,
    projectId: input.projectId,
    providerId: input.provider,
    modelId: input.model,
    providerContext: input.providerContext === undefined ? undefined : redactProviderSecrets(input.providerContext),
    status: "success",
    providerStatus: "success",
    providerVideoUrl: videoUrl,
    outputUrl: videoUrl,
    previewUrl: videoUrl,
    progress: 100,
    rawPollResponse: input.rawResponse,
    result,
    errorMessage: null
  });

  await dependencies.updateCanvas({
    projectId: input.projectId,
    nodeId: input.canvasNodeId,
    realUrl: videoUrl,
    providerTaskId: input.providerTaskId,
    fileName: input.fileName,
    payloadSummary: input.payloadSummary
  });

  return {
    status: "success" as const,
    progress: 100,
    providerTaskId: input.providerTaskId,
    videoUrl,
    outputUrl: videoUrl,
    previewUrl: videoUrl,
    downloadUrl: videoUrl,
    providerVideoUrl: videoUrl
  };
}
