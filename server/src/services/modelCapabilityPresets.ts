import { defaultCapabilities, modelCatalog } from "./modelCatalog.js";
import type { ModelCapabilities } from "../types/model.js";

export type ModelCapabilityPreset = {
  id: string;
  name: string;
  provider: string;
  capabilities: ModelCapabilities | null;
};

export const modelCapabilityPresets: ModelCapabilityPreset[] = modelCatalog.map((model) => ({
  id: model.id,
  name: model.displayName,
  provider: model.provider,
  capabilities: model.capabilities
}));

export { defaultCapabilities };
