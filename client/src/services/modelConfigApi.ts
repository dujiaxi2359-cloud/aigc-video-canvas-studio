import { api } from "./api";
import type { AvailableImageOptions, AvailableVideoOptions, ModelCatalogItem, ModelConfig } from "../types/model";

export const modelConfigApi = {
  list: () => api.get<ModelConfig[]>("/api/model-configs"),
  create: (data: Partial<ModelConfig> & { apiKey?: string }) => api.post<ModelConfig>("/api/model-configs", data),
  saveBulk: (models: Array<Partial<ModelConfig> & { apiKey?: string }>, replaceExisting = false) =>
    api.post<{ createdCount: number; updatedCount: number; deletedCount: number; savedCount: number; models: ModelConfig[] }>("/api/model-configs/bulk", { models, replaceExisting }),
  update: (id: string, data: Partial<ModelConfig> & { apiKey?: string }) => api.put<ModelConfig>(`/api/model-configs/${id}`, data),
  remove: (id: string) => api.delete(`/api/model-configs/${id}`),
  removeBulk: (ids: string[]) => api.post<{ deletedCount: number; ids: string[] }>("/api/model-configs/bulk-delete", { ids }),
  test: (id: string, data?: Partial<ModelConfig> & { apiKey?: string }) => api.post<{ success: boolean; message: string }>(`/api/model-configs/${id}/test`, data ?? {}),
  probe: (data: { apiBaseUrl: string; apiKey: string; validationPath?: string; pullModels?: boolean }) =>
    api.post<{ success: boolean; message: string; models: string[] }>("/api/model-configs/probe", data),
  presets: () => api.get("/api/model-capability-presets"),
  catalog: () => api.get<ModelCatalogItem[]>("/api/model-catalog"),
  options: (modelConfigId: string, nodeContext: unknown) =>
    api.post<AvailableVideoOptions>("/api/model-capabilities/options", { modelConfigId, nodeContext }),
  imageOptions: (modelConfigId: string, nodeContext: unknown) =>
    api.post<AvailableImageOptions>("/api/model-capabilities/image-options", { modelConfigId, nodeContext })
};
