import { mediaDownloadUrl, videoPlayableUrl, type MediaUrlSource } from "./mediaUrls";

const RUNNING_STATUSES = new Set(["queued", "pending", "processing", "running", "in_progress", "submitted", "created"]);
const QUERY_BLOCKED_CODES = new Set([
  "PROVIDER_TASK_QUERY_FORBIDDEN",
  "PROVIDER_TOKEN_MODEL_SCOPE_MISMATCH",
  "POLL_ROUTE_WRONG_CREATE_ENDPOINT"
]);

export type VideoNodeStateInput = MediaUrlSource & {
  status?: string;
  generationStatus?: string;
  providerStatus?: string;
  providerTaskId?: string;
  errorCode?: string;
  errorMessage?: string | null;
  fileName?: string;
};

export type VideoTaskSyncResult = MediaUrlSource & {
  status: "success" | "processing" | "error";
  providerStatus?: string;
  providerTaskId?: string;
  progress?: number;
  errorCode?: string;
  errorMessage?: string;
};

export function deriveVideoNodeState(data: VideoNodeStateInput) {
  const playableUrl = videoPlayableUrl(data);
  const downloadUrl = mediaDownloadUrl(data);
  const hasProviderTask = Boolean(data.providerTaskId);
  const queryBlocked = hasProviderTask && QUERY_BLOCKED_CODES.has(data.errorCode || "");
  const running = data.status === "generating"
    || data.status === "processing"
    || data.generationStatus === "processing"
    || RUNNING_STATUSES.has((data.providerStatus || "").toLowerCase());
  const succeeded = Boolean(playableUrl) && (
    data.status === "success"
    || data.status === "completed"
    || data.generationStatus === "success"
  );
  const pending = !succeeded && (running || queryBlocked);
  const failed = !succeeded && !pending && (data.status === "error" || data.generationStatus === "failed");

  return {
    phase: succeeded ? "success" as const : queryBlocked ? "query_blocked" as const : pending ? "processing" as const : failed ? "error" as const : "idle" as const,
    frameStatus: succeeded ? "success" as const : pending ? "generating" as const : failed ? "error" as const : "idle" as const,
    statusLabel: succeeded ? "已完成" : queryBlocked ? "查询暂未完成" : pending ? "上游处理中" : failed ? "失败" : "未生成",
    helperText: queryBlocked
      ? "任务已创建，查询暂未完成，可稍后同步。"
      : pending
        ? "上游处理中，可稍后同步结果。"
        : undefined,
    canSync: hasProviderTask && !succeeded,
    canGenerate: !pending,
    canPlay: Boolean(playableUrl),
    canDownload: Boolean(downloadUrl),
    playableUrl,
    downloadUrl
  };
}

export function videoNodePatchFromSyncResult(current: VideoNodeStateInput, result: VideoTaskSyncResult) {
  const providerTaskId = result.providerTaskId || current.providerTaskId;
  const resultState = deriveVideoNodeState({ ...current, ...result, providerTaskId });
  if (result.status === "success" && resultState.playableUrl) {
    return {
      status: "success" as const,
      generationStatus: "success",
      providerStatus: result.providerStatus || "success",
      providerTaskId,
      progress: 100,
      videoUrl: resultState.playableUrl,
      outputUrl: resultState.playableUrl,
      previewUrl: resultState.playableUrl,
      downloadUrl: resultState.downloadUrl || resultState.playableUrl,
      providerVideoUrl: result.providerVideoUrl || resultState.playableUrl,
      errorCode: undefined,
      errorMessage: undefined,
      debugMessage: undefined
    };
  }
  if (result.status === "processing" || (providerTaskId && QUERY_BLOCKED_CODES.has(result.errorCode || ""))) {
    return {
      status: "generating" as const,
      generationStatus: "processing",
      providerStatus: result.providerStatus || (result.errorCode ? "processing_with_poll_error" : "processing"),
      providerTaskId,
      progress: result.progress,
      errorCode: result.errorCode,
      errorMessage: result.errorMessage || "上游处理中，可稍后同步结果。",
      debugMessage: undefined
    };
  }
  return {
    status: "error" as const,
    generationStatus: "failed",
    providerStatus: result.providerStatus || "failed",
    providerTaskId,
    progress: result.progress,
    errorCode: result.errorCode || "PROVIDER_RAW_ERROR",
    errorMessage: result.errorMessage || "上游视频任务失败。"
  };
}

export async function syncVideoNodeTask(
  input: {
    localTaskId: string;
    providerTaskId?: string;
    canvasNodeId: string;
    projectId?: string;
    current: VideoNodeStateInput;
  },
  syncUpstream: (input: {
    localTaskId: string;
    providerTaskId?: string;
    canvasNodeId: string;
    projectId?: string;
  }) => Promise<VideoTaskSyncResult>
) {
  const result = await syncUpstream({
    localTaskId: input.localTaskId,
    providerTaskId: input.providerTaskId,
    canvasNodeId: input.canvasNodeId,
    projectId: input.projectId
  });
  return {
    result,
    patch: videoNodePatchFromSyncResult(input.current, result)
  };
}
