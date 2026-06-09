import { capabilityForMode, getVideoModelCapabilityOrLegacy } from "../config/videoModelCapabilities.js";
import { normalizeVeoParams } from "../services/providers/googleVeo.service.js";
import { parseVeoOperationResult } from "../services/providers/googleVeo/veoOperationParser.js";
import { isVeoProxyEndpoint } from "../services/providers/veoProxyVideo.service.js";
import type { VideoProviderParams } from "../services/providers/providerTypes.js";
import type { OfficialVideoMode } from "../types/videoModes.js";

function assert(condition: unknown, message: string): asserts condition {
  if (!condition) throw new Error(message);
}

function params(input: Partial<VideoProviderParams> = {}): VideoProviderParams {
  return {
    nodeId: "node-test",
    modelConfigId: "model-test",
    apiKey: "test-key",
    apiBaseUrl: "",
    providerId: "google",
    catalogModelId: input.catalogModelId ?? "google-veo-3-1",
    modelName: input.modelName ?? "veo-3.1-generate-preview",
    inputMode: input.inputMode ?? "text-to-video",
    videoMode: input.videoMode,
    prompt: "test prompt",
    imageAssetIds: input.imageAssetIds,
    videoAssetIds: input.videoAssetIds,
    duration: input.duration ?? 4,
    aspectRatio: input.aspectRatio ?? "9:16",
    resolution: input.resolution ?? "720p",
    generateCount: 1,
    qualityMode: "full_quality"
  };
}

function supports(modelId: string, modelName: string, mode: OfficialVideoMode) {
  const capability = getVideoModelCapabilityOrLegacy("google", modelId, modelName, mode);
  return Boolean(capability && capabilityForMode(capability, mode));
}

const fullName = "veo-3.1-generate-preview";
const fastName = "veo-3.1-fast-generate-preview";
const liteName = "veo-3.1-lite-generate-preview";

for (const mode of ["text_to_video", "image_to_video_first_frame", "reference_images_to_video", "image_to_video_first_last_frame", "video_extension"] as OfficialVideoMode[]) {
  assert(supports("google-veo-3-1", fullName, mode), `Veo 3.1 should support ${mode}`);
  assert(supports("google-veo-3-1-fast", fastName, mode), `Veo 3.1 Fast should support ${mode}`);
}
assert(supports("google-veo-3-1-lite", liteName, "text_to_video"), "Veo 3.1 Lite should support text_to_video");
assert(supports("google-veo-3-1-lite", liteName, "image_to_video_first_frame"), "Veo 3.1 Lite should support image_to_video");
assert(supports("google-veo-3-1-lite", liteName, "image_to_video_first_last_frame"), "Veo 3.1 Lite should support first_last_frame_video");
assert(!supports("google-veo-3-1-lite", liteName, "reference_images_to_video"), "Veo 3.1 Lite should not support reference_images_to_video");
assert(!supports("google-veo-3-1-lite", liteName, "video_extension"), "Veo 3.1 Lite should not support video_extension");

let threw = false;
try {
  normalizeVeoParams(params({ videoMode: "reference_images_to_video", inputMode: "reference-to-video", imageAssetIds: ["1", "2", "3", "4"] }), "reference_images_to_video");
} catch {
  threw = true;
}
assert(threw, "referenceImages over 3 should throw");

const reference = normalizeVeoParams(params({ videoMode: "reference_images_to_video", inputMode: "reference-to-video", imageAssetIds: ["1"], duration: 4 }), "reference_images_to_video");
assert(reference.durationSeconds === 8 && reference.durationAutoAdjusted, "referenceImages should force 8s");

const highResolution = normalizeVeoParams(params({ resolution: "1080p", duration: 6 }), "text_to_video");
assert(highResolution.durationSeconds === 8 && highResolution.durationAutoAdjusted, "1080p should force 8s");

threw = false;
try {
  normalizeVeoParams(params({ catalogModelId: "google-veo-3-1-lite", modelName: liteName, resolution: "4k" }), "text_to_video");
} catch {
  threw = true;
}
assert(threw, "Lite 4k should throw");

const extension = normalizeVeoParams(params({ videoMode: "video_extension", inputMode: "video-to-video", videoAssetIds: ["v1"], resolution: "1080p", duration: 4 }), "video_extension");
assert(extension.resolution === "720p" && extension.resolutionAutoAdjusted, "extension should force 720p");

threw = false;
try {
  normalizeVeoParams(params({ videoMode: "image_to_video_first_last_frame", inputMode: "first-last-frame", imageAssetIds: ["first"] }), "image_to_video_first_last_frame");
} catch {
  threw = true;
}
assert(threw, "first-last frame should require last frame");

const parsed = parseVeoOperationResult({ response: { generatedVideos: [{ video: { uri: "files/video-1", mimeType: "video/mp4" } }] } });
assert(parsed.videoUri === "files/video-1", "generatedVideos[0].video should parse");

const image = normalizeVeoParams(params({ videoMode: "image_to_video_first_frame", inputMode: "image-to-video", imageAssetIds: ["img"] }), "image_to_video_first_frame");
assert(image.supportsCurrentMode, "image mode should be supported without previewUrl");
assert(isVeoProxyEndpoint("https://otuapi.com/v1/videos"), "OpenAI-style video relay endpoint should be recognized");
assert(isVeoProxyEndpoint("https://yunwu.ai/v1/video/create"), "Unified create/query relay endpoint should be recognized");
assert(!isVeoProxyEndpoint("https://generativelanguage.googleapis.com/v1beta"), "Google native endpoint should not be treated as a relay");
assert(process.env.ALLOW_MOCK_GENERATION !== "true" && process.env.FORCE_MOCK_GENERATION !== "true", "mock/fallback must not be enabled for capability tests");

console.log("test:veo-capabilities ok");
