import { api } from "./api";

export const generationApi = {
  text: (data: unknown) =>
    api.post<{ status: "success" | "error"; outputText?: string; errorCode?: string; errorMessage?: string; debugMessage?: string }>(
      "/api/generate/text",
      data
    ),
  video: (data: unknown) =>
    api.post<{ status: "success" | "error"; outputAssetId?: string; outputUrl?: string; payloadSummary?: Record<string, unknown>; errorCode?: string; errorMessage?: string; debugMessage?: string }>(
      "/api/generate/video",
      data
    ),
  image: (data: unknown) =>
    api.post<{ status: "success" | "error"; outputAssetId?: string; outputUrl?: string; payloadSummary?: Record<string, unknown>; errorCode?: string; errorMessage?: string; debugMessage?: string }>(
      "/api/generate/image",
      data
    )
};
