import { create } from "zustand";
import { useShallow } from "zustand/react/shallow";
import { modelConfigApi } from "../services/modelConfigApi";
import type { ModelConfig } from "../types/model";
import { dedupeModelConfigsForSelect } from "../utils/modelConfigSelection";

type State = {
  modelConfigs: ModelConfig[];
  fetchModelConfigs: () => Promise<void>;
  createModelConfig: (data: Partial<ModelConfig> & { apiKey?: string }) => Promise<void>;
  saveModelConfigsBulk: (models: Array<Partial<ModelConfig> & { apiKey?: string }>, replaceExisting?: boolean) => Promise<{ createdCount: number; updatedCount: number; deletedCount: number; savedCount: number }>;
  updateModelConfig: (id: string, data: Partial<ModelConfig> & { apiKey?: string }) => Promise<void>;
  deleteModelConfig: (id: string) => Promise<void>;
  deleteModelConfigs: (ids: string[]) => Promise<{ deletedCount: number }>;
  testModelConfig: (id: string, data?: Partial<ModelConfig> & { apiKey?: string }) => Promise<string>;
};

export const useModelConfigStore = create<State>((set, get) => ({
  modelConfigs: [],
  fetchModelConfigs: async () => set({ modelConfigs: await modelConfigApi.list() }),
  createModelConfig: async (data) => {
    await modelConfigApi.create(data);
    await get().fetchModelConfigs();
  },
  saveModelConfigsBulk: async (models, replaceExisting = false) => {
    const result = await modelConfigApi.saveBulk(models, replaceExisting);
    set({ modelConfigs: result.models });
    return { createdCount: result.createdCount, updatedCount: result.updatedCount, deletedCount: result.deletedCount, savedCount: result.savedCount };
  },
  updateModelConfig: async (id, data) => {
    await modelConfigApi.update(id, data);
    await get().fetchModelConfigs();
  },
  deleteModelConfig: async (id) => {
    await modelConfigApi.remove(id);
    await get().fetchModelConfigs();
  },
  deleteModelConfigs: async (ids) => {
    const result = await modelConfigApi.removeBulk(ids);
    await get().fetchModelConfigs();
    return { deletedCount: result.deletedCount };
  },
  testModelConfig: async (id, data) => {
    const result = await modelConfigApi.test(id, data);
    return result.message;
  }
}));

const CANVAS_VISIBLE_HEALTH = new Set<ModelConfig["healthStatus"] | undefined>([
  undefined,
  "ready",
  "running_slow",
  "untested",
  "testing"
]);

function isCanvasVisibleModel(model: ModelConfig) {
  return model.enabled && CANVAS_VISIBLE_HEALTH.has(model.healthStatus);
}

export function useAvailableVideoModels() {
  return useModelConfigStore(useShallow((state) =>
    dedupeModelConfigsForSelect(state.modelConfigs.filter((model) => isCanvasVisibleModel(model) && (model.category === "video" || (!model.category && ["text-to-video", "image-to-video", "video-to-video"].includes(model.modelType)))))
  )
  );
}

export function useAvailableImageModels() {
  return useModelConfigStore(useShallow((state) =>
    dedupeModelConfigsForSelect(state.modelConfigs.filter((model) => isCanvasVisibleModel(model) && (model.category === "image" || (!model.category && ["text-to-image", "image-to-image", "image-edit", "image"].includes(model.modelType)))))
  )
  );
}

export function useAvailableTextModels() {
  return useModelConfigStore(useShallow((state) =>
    dedupeModelConfigsForSelect(state.modelConfigs.filter((model) => isCanvasVisibleModel(model) && (model.category === "text" || (!model.category && model.modelType === "text"))))
  )
  );
}
