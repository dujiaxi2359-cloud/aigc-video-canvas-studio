import { create } from "zustand";
import { useShallow } from "zustand/react/shallow";
import { modelConfigApi } from "../services/modelConfigApi";
import type { ModelConfig } from "../types/model";

type State = {
  modelConfigs: ModelConfig[];
  fetchModelConfigs: () => Promise<void>;
  createModelConfig: (data: Partial<ModelConfig> & { apiKey?: string }) => Promise<void>;
  updateModelConfig: (id: string, data: Partial<ModelConfig> & { apiKey?: string }) => Promise<void>;
  deleteModelConfig: (id: string) => Promise<void>;
  testModelConfig: (id: string, data?: Partial<ModelConfig> & { apiKey?: string }) => Promise<string>;
};

export const useModelConfigStore = create<State>((set, get) => ({
  modelConfigs: [],
  fetchModelConfigs: async () => set({ modelConfigs: await modelConfigApi.list() }),
  createModelConfig: async (data) => {
    await modelConfigApi.create(data);
    await get().fetchModelConfigs();
  },
  updateModelConfig: async (id, data) => {
    await modelConfigApi.update(id, data);
    await get().fetchModelConfigs();
  },
  deleteModelConfig: async (id) => {
    await modelConfigApi.remove(id);
    await get().fetchModelConfigs();
  },
  testModelConfig: async (id, data) => {
    const result = await modelConfigApi.test(id, data);
    return result.message;
  }
}));

export function useAvailableVideoModels() {
  return useModelConfigStore(useShallow((state) =>
    state.modelConfigs.filter((model) => model.enabled && (model.category === "video" || (!model.category && ["text-to-video", "image-to-video", "video-to-video"].includes(model.modelType))))
  )
  );
}

export function useAvailableImageModels() {
  return useModelConfigStore(useShallow((state) =>
    state.modelConfigs.filter((model) => model.enabled && (model.category === "image" || (!model.category && ["text-to-image", "image-to-image", "image-edit", "image"].includes(model.modelType))))
  )
  );
}

export function useAvailableTextModels() {
  return useModelConfigStore(useShallow((state) =>
    state.modelConfigs.filter((model) => model.enabled && (model.category === "text" || (!model.category && model.modelType === "text")))
  )
  );
}
