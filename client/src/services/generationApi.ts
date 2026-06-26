import { api } from "./api";

export const generationApi = {
  text: (data: unknown) =>
    api.post<{ status: "success" | "error"; outputText?: string; errorCode?: string; errorMessage?: string; debugMessage?: string }>(
      "/api/generate/text",
      data
    ),
  video: (data: unknown) =>
    api.post<{ status: "success" | "succeeded" | "processing" | "error"; outputAssetId?: string; outputUrl?: string; thumbnailUrl?: string; posterUrl?: string; previewUrl?: string; cdnUrl?: string; cosUrl?: string; downloadableUrl?: string; payloadSummary?: Record<string, unknown>; errorCode?: string; errorMessage?: string; debugMessage?: string }>(
      "/api/generate/video",
      data
    ),
  image: (data: unknown) =>
    api.post<{ status: "success" | "processing" | "error"; outputAssetId?: string; outputUrl?: string; thumbnailUrl?: string; previewUrl?: string; cdnUrl?: string; cosUrl?: string; downloadableUrl?: string; payloadSummary?: Record<string, unknown>; errorCode?: string; errorMessage?: string; debugMessage?: string }>(
      "/api/generate/image",
      data
    ),
  latestTask: (nodeId: string, since?: number) =>
    api.get<{ id: string; status: string; progress?: number; result?: unknown; outputUrl?: string; cdnUrl?: string; posterUrl?: string; previewUrl?: string; downloadableUrl?: string; providerVideoUrl?: string; errorMessage?: string; createdAt?: number; updatedAt?: number }>(
      "/api/generate/tasks/latest",
      { params: { nodeId, since: since ? String(since) : undefined } }
    )
};
