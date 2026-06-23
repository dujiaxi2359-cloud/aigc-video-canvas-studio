import assert from "node:assert/strict";
import {
  isQwenImageEditModel,
  normalizeImageCapabilities,
  qwenTextModelForEdit
} from "../services/imageCapabilityNormalization.js";
import { isOmniFastVideoModel, isVeoLikeVideoModel } from "../services/videoCapabilityNormalization.js";
import type { ModelCapabilities } from "../types/model.js";

const emptyImageCapabilities: ModelCapabilities = { inputModes: ["text-to-image"] };

const gemini = normalizeImageCapabilities(emptyImageCapabilities, "google", "gemini-3-pro-image-preview");
assert.deepEqual(gemini.imageSizes, ["1K"], "Gemini image relay must be limited to 1K when upstream only supports 1K.");
assert.equal(gemini.modelCapability?.supportsTextToImage, true);
assert.equal(gemini.modelCapability?.supportsImageEdit, true);

const qwenEdit = normalizeImageCapabilities(emptyImageCapabilities, "alibaba", "qwen-image-edit-plus-2025-10-30");
assert.equal(isQwenImageEditModel("alibaba", "qwen-image-edit-plus-2025-10-30"), true);
assert.deepEqual(qwenEdit.inputModes, ["image-to-image", "image-edit"], "Qwen edit models must not be exposed as text-to-image.");
assert.equal(qwenEdit.modelCapability?.supportsTextToImage, false);
assert.equal(qwenEdit.modelCapability?.supportsImageEdit, true);
assert.equal(qwenTextModelForEdit("qwen-image-edit-plus-2025-10-30"), "qwen-image-2.0-pro");

const qwenText = normalizeImageCapabilities(emptyImageCapabilities, "alibaba", "qwen-image-2.0-pro");
assert.deepEqual(qwenText.inputModes, ["text-to-image"], "Qwen text image model should stay text-to-image only.");
assert.equal(qwenText.supportsImageInput, false);

const zhipuGlmImage = normalizeImageCapabilities(emptyImageCapabilities, "zhipu", "glm-image", "GLM-Image", "智普 BigModel 官方");
assert.deepEqual(zhipuGlmImage.inputModes, ["text-to-image"], "Zhipu GLM-Image should use the official text-to-image API only.");
assert.deepEqual(zhipuGlmImage.imageQualities, ["hd"], "Zhipu GLM-Image only supports hd quality.");
assert(zhipuGlmImage.imageSizes?.includes("960x1728"), "Zhipu GLM-Image should expose the official portrait size.");
assert.equal(zhipuGlmImage.supportsImageInput, false);

assert.equal(isVeoLikeVideoModel("openai-video", "mimo-v2-omni", { inputModes: ["text-to-video"] }), false, "Bare omni in a non-Google model must not be treated as Veo.");
assert.equal(isOmniFastVideoModel("omni-fast", { inputModes: ["text-to-video"] }), true);

console.log("model capability classification tests passed");
