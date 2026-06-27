import assert from "node:assert/strict";
import { resolveImageSubmission } from "../utils/imageModelCapability.js";
import type { ModelConfig } from "../types/model.js";

function model(input: Partial<ModelConfig> & Pick<ModelConfig, "id" | "modelType" | "displayName">): ModelConfig {
  const inputMode = input.modelType === "image-edit" || input.modelType === "image-to-image" || input.modelType === "text-to-image"
    ? input.modelType
    : "text-to-image";
  return {
    providerId: "openai",
    provider: "OpenAI compatible",
    category: "image",
    apiBaseUrl: "https://relay.example.com/v1",
    modelName: input.id,
    enabled: true,
    capabilities: { inputModes: [inputMode] },
    createdAt: 0,
    updatedAt: 0,
    ...input
  };
}

const textModel = model({ id: "text", displayName: "Text Image", modelType: "text-to-image" });
const editModel = model({ id: "edit", displayName: "Image Editor", modelType: "image-edit" });

const noReference = resolveImageSubmission({
  selectedModel: textModel,
  models: [textModel, editModel],
  inputMode: "text-to-image",
  hasReferenceImages: false
});
assert.equal(noReference.ok, true);
assert.equal(noReference.modelId, "text");

const switched = resolveImageSubmission({
  selectedModel: textModel,
  models: [textModel, editModel],
  inputMode: "text-to-image",
  hasReferenceImages: true
});
assert.equal(switched.ok, true);
assert.equal(switched.ok && switched.modelId, "edit");
assert.equal(switched.ok && switched.inputMode, "image-edit");

const blocked = resolveImageSubmission({
  selectedModel: textModel,
  models: [textModel],
  inputMode: "text-to-image",
  hasReferenceImages: true
});
assert.equal(blocked.ok, false);
assert.equal(!blocked.ok && blocked.errorCode, "IMAGE_MODEL_REFERENCE_NOT_SUPPORTED");

console.log("Client image model capability tests passed");
