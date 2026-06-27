import assert from "node:assert/strict";
import { resolveImageModelCapability } from "../utils/imageModelCapabilityResolver.js";

const imageToImage = resolveImageModelCapability({
  providerId: "legacy-image",
  providerName: "Legacy Image",
  modelId: "legacy-i2i",
  modelType: "image-to-image",
  capabilities: { inputModes: ["image-to-image"] },
  requestType: "image-to-image",
  hasReferenceImages: true
});
assert.equal(imageToImage.ok, true);
assert.equal(imageToImage.ok && imageToImage.adapterFamily, "legacy_supported");
assert.equal(imageToImage.ok && imageToImage.endpointFamily, "image_to_image");

const seedream = resolveImageModelCapability({
  providerId: "seedance",
  providerName: "Seedream / 火山方舟",
  modelId: "doubao-seedream-5-0-260128",
  modelType: "image-to-image",
  baseUrl: "https://ark.example.com/api/v3",
  hasApiKey: true,
  capabilities: { inputModes: ["image-to-image"] },
  requestType: "image-to-image",
  hasReferenceImages: true
});
assert.equal(seedream.ok, true);
assert.equal(seedream.ok && seedream.adapterFamily, "legacy_supported");
assert.equal(seedream.ok && seedream.endpointFamily, "image_to_image");

const openAiText = resolveImageModelCapability({
  providerId: "openai",
  providerName: "OpenAI compatible",
  modelId: "gpt-image-compatible",
  modelType: "text-to-image",
  baseUrl: "https://relay.example.com/v1",
  hasApiKey: true,
  capabilities: { inputModes: ["text-to-image"] },
  requestType: "text-to-image",
  hasReferenceImages: false
});
assert.equal(openAiText.ok, true);
assert.equal(openAiText.ok && openAiText.endpointFamily, "openai_images_generation");
assert.equal(openAiText.ok && openAiText.route, "/v1/images/generations");

const textWithReference = resolveImageModelCapability({
  providerId: "openai",
  providerName: "OpenAI compatible",
  modelId: "gpt-image-text-only",
  modelType: "text-to-image",
  baseUrl: "https://relay.example.com/v1",
  capabilities: { inputModes: ["text-to-image", "image-edit"] },
  requestType: "text-to-image",
  hasReferenceImages: true
});
assert.equal(textWithReference.ok, false);
assert.equal(!textWithReference.ok && textWithReference.errorCode, "IMAGE_MODEL_REFERENCE_NOT_SUPPORTED");

const imageEdit = resolveImageModelCapability({
  providerId: "openai",
  providerName: "OpenAI compatible",
  modelId: "image-editor",
  modelType: "image-edit",
  baseUrl: "https://relay.example.com/v1",
  capabilities: { inputModes: ["image-edit"] },
  requestType: "image-edit",
  hasReferenceImages: true
});
assert.equal(imageEdit.ok, true);
assert.equal(imageEdit.ok && imageEdit.endpointFamily, "openai_images_edits");

const legacy = resolveImageModelCapability({
  providerId: "legacy",
  providerName: "Legacy",
  modelId: "legacy-image",
  modelType: "text-to-image",
  capabilities: { inputModes: ["text-to-image"] },
  requestType: "text-to-image",
  hasReferenceImages: false
});
assert.equal(legacy.ok, true);
assert.equal(legacy.ok && legacy.adapterFamily, "legacy_supported");

assert.equal(resolveImageModelCapability({
  modelId: "missing-provider",
  modelType: "text-to-image",
  capabilities: { inputModes: ["text-to-image"] },
  requestType: "text-to-image",
  hasReferenceImages: false
}).errorCode, "IMAGE_MODEL_PROVIDER_MISSING");

assert.equal(resolveImageModelCapability({
  providerId: "unknown",
  providerName: "Unknown",
  modelId: "unknown",
  modelType: "image",
  capabilities: { inputModes: [] },
  requestType: "text-to-image",
  hasReferenceImages: false
}).errorCode, "IMAGE_MODEL_CAPABILITY_MISSING");

console.log("Image model capability resolver tests passed");
