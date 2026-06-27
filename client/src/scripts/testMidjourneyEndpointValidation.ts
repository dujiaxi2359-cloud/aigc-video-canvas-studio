import assert from "node:assert/strict";
import { isCanvasReadyModel, modelMissingReadyReason } from "../utils/modelReadiness";
import type { ModelConfig } from "../types/model";

const midjourney: ModelConfig = {
  id: "mj",
  provider: "midjourney",
  providerId: "midjourney",
  category: "image",
  displayName: "Midjourney",
  apiBaseUrl: "",
  requiresApiBaseUrl: true,
  maskedApiKey: "sk-***",
  modelName: "midjourney",
  modelType: "text-to-image",
  enabled: true,
  capabilities: { inputModes: ["text-to-image"] },
  createdAt: 1,
  updatedAt: 1
};
assert.equal(isCanvasReadyModel(midjourney), false);
assert.match(modelMissingReadyReason(midjourney) ?? "", /endpoint/);

const ready = { ...midjourney, id: "ready", provider: "relay", providerId: "relay", apiBaseUrl: "https://relay.example/v1", modelName: "gpt-image-2" };
assert.equal(isCanvasReadyModel(ready), true);

console.log("Midjourney endpoint validation tests passed");
