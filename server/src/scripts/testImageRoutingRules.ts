import assert from "node:assert/strict";
import { normalizeImageCapabilities, resolveImageEndpointFamily } from "../services/imageCapabilityNormalization.js";
import type { ModelCapabilities } from "../types/model.js";

const base: ModelCapabilities = {
  inputModes: ["text-to-image"],
  capability: "image_generation",
  capabilityKinds: ["image_generation"]
};

const gemini = normalizeImageCapabilities(base, "google", "gemini-2.5-flash-image", "Nano Banana", "Gemini 图像中转");
assert.equal(resolveImageEndpointFamily(gemini, "google", "gemini-2.5-flash-image", "Nano Banana", "Gemini 图像中转"), "gemini_generate_content");

const geminiRelay = normalizeImageCapabilities(base, "openai", "nano-banana", "Nano Banana", "Custom Relay");
assert.equal(resolveImageEndpointFamily(geminiRelay, "openai", "nano-banana", "Nano Banana", "Custom Relay"), "gemini_generate_content");

const configuredRelay = normalizeImageCapabilities({
  ...base,
  capabilitySource: "upstream",
  upstreamModelId: "vendor-image-model",
  endpointFamily: "openai_images_generation",
  inputModes: ["text-to-image"],
  imageSizes: ["1024x1024"],
  supportsImageInput: false
}, "openai", "vendor-image-model", "Vendor Image Model", "Custom Relay");
assert.equal(resolveImageEndpointFamily(configuredRelay, "openai", "vendor-image-model", "Vendor Image Model", "Custom Relay"), "openai_images_generation");
assert.equal(configuredRelay.upstreamModelId, "vendor-image-model");
assert.deepEqual(configuredRelay.inputModes, ["text-to-image"]);
assert.deepEqual(configuredRelay.imageSizes, ["1024x1024"]);
assert.equal(configuredRelay.supportsImageInput, false);

console.log("test:image-routing-rules ok");
