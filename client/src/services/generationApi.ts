import { api } from "./api";
import type { VideoTaskSyncResult } from "../utils/videoNodeState";

export const generationApi = {
  text: (data: unknown) =>
    api.post<{ status: "success" | "error"; outputText?: string; errorCode?: string; errorMessage?: string; debugMessage?: string }>(
      "/api/generate/text",
      data
    ),
  video: (data: unknown) =>
    api.post<{ status: "success" | "processing" | "error"; outputAssetId?: string; outputUrl?: string; payloadSummary?: Record<string, unknown>; errorCode?: string; errorMessage?: string; debugMessage?: string }>(
      "/api/generate/video",
      data
    ),
  syncVideoTask: (input: {
    localTaskId: string;
    providerTaskId?: string;
    canvasNodeId: string;
    projectId?: string;
  }) =>
    api.post<VideoTaskSyncResult>(
      `/api/generate/tasks/${encodeURIComponent(input.localTaskId)}/sync-upstream`,
      {
        providerTaskId: input.providerTaskId,
        canvasNodeId: input.canvasNodeId,
        projectId: input.projectId
      }
    ),
  image: (data: unknown) =>
    api.post<{ status: "success" | "error"; outputAssetId?: string; outputUrl?: string; payloadSummary?: Record<string, unknown>; errorCode?: string; errorMessage?: string; debugMessage?: string }>(
      "/api/generate/image",
      data
    )
};
