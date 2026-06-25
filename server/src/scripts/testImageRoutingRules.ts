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

const gptRelay = normalizeImageCapabilities(base, "openai", "gpt-image-2-all", "GPT Image 2 All", "duoyuanx");
assert.equal(resolveImageEndpointFamily(gptRelay, "openai", "gpt-image-2-all", "GPT Image 2 All", "duoyuanx"), "openai_images_generation");
assert.equal(gptRelay.modelCapability?.model, "gpt-image-2-all");

console.log("test:image-routing-rules ok");
