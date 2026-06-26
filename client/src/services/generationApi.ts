import { api } from "./api";

export const generationApi = {
  text: (data: unknown) =>
    api.post<{ status: "success" | "error"; outputText?: string; errorCode?: string; errorMessage?: string; debugMessage?: string }>(
      "/api/generate/text",
      data
    ),
  video: (data: unknown) =>
    api.post<{ status: "success" | "succeeded" | "completed" | "complete" | "done" | "finished" | "processing" | "running" | "executing" | "queued" | "pending" | "error"; outputAssetId?: string; outputUrl?: string; videoUrl?: string; providerVideoUrl?: string; thumbnailUrl?: string; posterUrl?: string; previewUrl?: string; cdnUrl?: string; cosUrl?: string; downloadableUrl?: string; payloadSummary?: Record<string, unknown>; errorCode?: string; errorMessage?: string; debugMessage?: string }>(
      "/api/generate/video",
      data
    ),
  image: (data: unknown) =>
    api.post<{ status: "success" | "processing" | "error"; outputAssetId?: string; outputUrl?: string; thumbnailUrl?: string; previewUrl?: string; cdnUrl?: string; cosUrl?: string; downloadableUrl?: string; payloadSummary?: Record<string, unknown>; errorCode?: string; errorMessage?: string; debugMessage?: string }>(
      "/api/generate/image",
      data
    ),
  latestTask: (nodeId: string, since?: number) =>
    api.get<{ id: string; status: string; providerStatus?: string; providerTaskId?: string; progress?: number; result?: unknown; outputUrl?: string; videoUrl?: string; cdnUrl?: string; posterUrl?: string; previewUrl?: string; downloadableUrl?: string; providerVideoUrl?: string; errorMessage?: string; createdAt?: number; updatedAt?: number }>(
      "/api/generate/tasks/latest",
      { params: { nodeId, since: since ? String(since) : undefined } }
    ),
  syncLatestTask: (nodeId: string, since?: number) =>
    api.post<{ id: string; status: string; progress?: number; syncStatus?: string; outputUrl?: string; videoUrl?: string; cdnUrl?: string; posterUrl?: string; previewUrl?: string; downloadableUrl?: string; providerVideoUrl?: string; errorMessage?: string }>(
      "/api/generate/video/sync-upstream",
      { canvasNodeId: nodeId, since }
    )
};
