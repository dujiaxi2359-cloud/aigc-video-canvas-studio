import assert from "node:assert/strict";
import { AUTO_IMAGE_MODEL_ID, AUTO_IMAGE_MODEL_LABEL, resolveImageSubmission, selectAutomaticImageModel } from "../utils/imageModelCapability";
import type { ModelConfig } from "../types/model";

function model(overrides: Partial<ModelConfig>): ModelConfig {
  return {
    id: overrides.id ?? "model",
    provider: "relay",
    providerId: "relay",
    category: "image",
    displayName: overrides.displayName ?? overrides.id ?? "Model",
    apiBaseUrl: "https://relay.example/v1",
    requiresApiBaseUrl: true,
    maskedApiKey: "sk-***",
    modelName: overrides.modelName ?? overrides.id ?? "model",
    modelType: overrides.modelType ?? "text-to-image",
    enabled: overrides.enabled ?? true,
    capabilities: {
      inputModes: ["text-to-image"],
      ...(overrides.capabilities ?? {})
    },
    createdAt: 1,
    updatedAt: 1,
    ...overrides
  };
}

const text = model({ id: "txt", modelType: "text-to-image", capabilities: { inputModes: ["text-to-image"], capability: "text_to_image" } });
const edit = model({ id: "edit", modelType: "image-edit", capabilities: { inputModes: ["image-edit"], capability: "image_edit", supportsImageInput: true } });
const notReady = model({ id: "missing-key", maskedApiKey: "", modelType: "image-edit", capabilities: { inputModes: ["image-edit"], supportsImageInput: true } });

assert.equal(AUTO_IMAGE_MODEL_ID, "__auto_image_model__");
assert.equal(AUTO_IMAGE_MODEL_LABEL, "选择模型");
assert.deepEqual(selectAutomaticImageModel({ models: [text, edit], hasReferenceImages: false }), { ok: true, modelId: "txt", inputMode: "text-to-image", model: text });
assert.deepEqual(selectAutomaticImageModel({ models: [text, edit], hasReferenceImages: true }), { ok: true, modelId: "edit", inputMode: "image-edit", model: edit });
assert.equal(selectAutomaticImageModel({ models: [text, notReady], hasReferenceImages: true }).ok, false);

const blocked = resolveImageSubmission({ selectedModel: text, models: [text], inputMode: "text-to-image", hasReferenceImages: true });
assert.equal(blocked.ok, false);
assert.equal(blocked.errorCode, "IMAGE_MODEL_REFERENCE_NOT_SUPPORTED");

const switched = resolveImageSubmission({ selectedModel: text, models: [text, edit], inputMode: "text-to-image", hasReferenceImages: true });
assert.equal(switched.ok, true);
assert.equal(switched.modelId, "edit");
assert.equal(switched.inputMode, "image-edit");

console.log("Image auto model router tests passed");
