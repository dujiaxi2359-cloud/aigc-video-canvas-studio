import { api } from "./api";
import type { AvailableImageOptions, AvailableVideoOptions, ModelCatalogItem, ModelConfig } from "../types/model";

export const modelConfigApi = {
  list: () => api.get<ModelConfig[]>("/api/model-configs"),
  create: (data: Partial<ModelConfig> & { apiKey?: string }) => api.post<ModelConfig>("/api/model-configs", data),
  update: (id: string, data: Partial<ModelConfig> & { apiKey?: string }) => api.put<ModelConfig>(`/api/model-configs/${id}`, data),
  remove: (id: string) => api.delete(`/api/model-configs/${id}`),
  test: (id: string) => api.post<{ success: boolean; message: string }>(`/api/model-configs/${id}/test`),
  presets: () => api.get("/api/model-capability-presets"),
  catalog: () => api.get<ModelCatalogItem[]>("/api/model-catalog"),
  options: (modelConfigId: string, nodeContext: unknown) =>
    api.post<AvailableVideoOptions>("/api/model-capabilities/options", { modelConfigId, nodeContext }),
  imageOptions: (modelConfigId: string, nodeContext: unknown) =>
    api.post<AvailableImageOptions>("/api/model-capabilities/image-options", { modelConfigId, nodeContext })
};
