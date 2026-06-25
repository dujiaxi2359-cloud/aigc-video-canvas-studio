import assert from "node:assert/strict";
import { normalizeImageCapabilities, resolveImageEndpointFamily } from "../services/imageCapabilityNormalization.js";
import { openAIImageRequestModel } from "../services/providers/openaiImage.service.js";
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

const gptRelay = normalizeImageCapabilities(base, "openai", "gpt-image-2-all", "GPT Image 2 All", "duoyuanx");
assert.equal(resolveImageEndpointFamily(gptRelay, "openai", "gpt-image-2-all", "GPT Image 2 All", "duoyuanx"), "openai_images_generation");
assert.equal(gptRelay.modelCapability?.model, "gpt-image-2-all");
assert.deepEqual(gptRelay.inputModes, ["text-to-image"]);
assert.deepEqual(gptRelay.imageSizes, ["1024x1024"]);
assert.equal(gptRelay.supportsImageInput, false);
assert.equal(gptRelay.supportsReferenceImage, false);

const gptRelayAlias = normalizeImageCapabilities(base, "openai", "gpt-image2-all", "GPT Image2 All", "duoyuanx");
assert.equal(resolveImageEndpointFamily(gptRelayAlias, "openai", "gpt-image2-all", "GPT Image2 All", "duoyuanx"), "openai_images_generation");
assert.deepEqual(gptRelayAlias.inputModes, ["text-to-image"]);
assert.deepEqual(gptRelayAlias.imageSizes, ["1024x1024"]);
assert.equal(gptRelayAlias.supportsImageInput, false);
assert.equal(openAIImageRequestModel("gpt-image2-all"), "gpt-image-2-all");
assert.equal(openAIImageRequestModel("gpt-image-2-all"), "gpt-image-2-all");
assert.notEqual(openAIImageRequestModel("gpt-image-2-all"), "gpt-5-3-image");

const gptRelayUpstream = normalizeImageCapabilities({
  ...base,
  capabilitySource: "upstream",
  upstreamModelId: "gpt-image-2-all",
  inputModes: ["text-to-image", "image-to-image", "image-edit"],
  imageSizes: ["1K", "2K", "4K"],
  supportsImageInput: true,
  supportsReferenceImage: true
}, "openai", "gpt-image-2-all", "GPT Image 2 All", "duoyuanx");
assert.deepEqual(gptRelayUpstream.inputModes, ["text-to-image"]);
assert.deepEqual(gptRelayUpstream.imageSizes, ["1024x1024"]);
assert.equal(gptRelayUpstream.supportsImageInput, false);

console.log("test:image-routing-rules ok");
