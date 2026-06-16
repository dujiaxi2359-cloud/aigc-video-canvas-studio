import { grokCreateEndpoint, grokPollEndpoint, grokRequestModelName, isOfficialGrokEndpoint } from "../services/providers/grokVideo.service.js";
import { klingBearerToken, klingCreateEndpoint, klingPollEndpoint, normalizeKlingPrompt } from "../services/providers/klingVideo.service.js";
import { buildProxyBody, seedanceCreateEndpoint, seedancePollEndpoint } from "../services/providers/seedanceVideo.service.js";
import { configuredRelayModelName, veoProxyCreateEndpoint } from "../services/providers/veoProxyVideo.service.js";
import { joinUrl, resolveVideoRequestConfig } from "../services/providers/videoRequestAdapter.js";
import { getVideoModelCapability } from "../config/videoModelCapabilities.js";
import { modelCatalog } from "../services/modelCatalog.js";
import { mapVideoDimensions } from "../utils/videoParams.js";

function assert(condition: unknown, message: string): asserts condition {
  if (!condition) throw new Error(message);
}

assert(
  grokCreateEndpoint("https://api.x.ai/v1") === "https://api.x.ai/v1/videos/generations",
  "Grok create endpoint should append /videos/generations"
);
assert(mapVideoDimensions("9:16", "720p").width === 720, "9:16 720p width should be 720");
assert(mapVideoDimensions("9:16", "720p").height === 1280, "9:16 720p height should be 1280");
assert(mapVideoDimensions("16:9", "720p").width === 1280, "16:9 720p width should be 1280");
assert(mapVideoDimensions("16:9", "720p").height === 720, "16:9 720p height should be 720");
assert(mapVideoDimensions("3:4", "720p").width === 960, "3:4 720p width should be 960");
assert(mapVideoDimensions("3:4", "720p").height === 1280, "3:4 720p height should be 1280");
assert(mapVideoDimensions("21:9", "720p").width === 1280, "21:9 720p width should be 1280");
assert(mapVideoDimensions("21:9", "720p").height === 549, "21:9 720p height should be rounded from the long edge");
assert(
  grokPollEndpoint("https://api.x.ai/v1", "request/1") === "https://api.x.ai/v1/videos/request%2F1",
  "Grok poll endpoint should encode request id"
);
assert(
  grokCreateEndpoint("https://relay.example/v1/videos") === "https://relay.example/v1/videos",
  "Grok full relay videos endpoint should be used as-is"
);
assert(
  grokCreateEndpoint("https://relay.example/v1") === "https://relay.example/v1/videos",
  "Grok relay base should append the OpenAI-style videos path"
);
assert(
  grokCreateEndpoint("https://relay.example") === "https://relay.example/v1/videos",
  "Grok relay root URL should append the OpenAI-style v1 videos path"
);
assert(
  grokCreateEndpoint("https://relay.example/v1/chat/completions") === "https://relay.example/v1/videos",
  "Grok relay chat-completions base should be converted to the videos path"
);
assert(
  grokPollEndpoint("https://relay.example/v1/videos", "request/1") === "https://relay.example/v1/videos/request%2F1",
  "Grok full relay videos endpoint should also be the polling base"
);
assert(
  grokCreateEndpoint("POST https://relay.example/v1/videos") === "https://relay.example/v1/videos",
  "Grok endpoint should ignore a pasted HTTP method prefix"
);
assert(isOfficialGrokEndpoint("https://api.x.ai/v1"), "xAI endpoint should use the official JSON protocol");
assert(!isOfficialGrokEndpoint("https://relay.example/v1/videos"), "Relay endpoint should use multipart protocol");
assert(
  grokRequestModelName("grok-imagine-video", "https://api.x.ai/v1") === "grok-imagine-video",
  "Official Grok endpoint should keep the official model name"
);
assert(
  grokRequestModelName("grok-imagine-video", "https://relay.example/v1") === "grok-imagine-video",
  "Relay Grok endpoint should preserve the upstream model name"
);
assert(
  grokRequestModelName("grok-1.5-video-15s", "https://relay.example/v1") === "grok-1.5-video-15s",
  "Relay Grok endpoint should keep selected relay model names"
);
assert(
  seedanceCreateEndpoint("https://relay.example/v1/video/generations") === "https://relay.example/v1/video/generations",
  "Seedance full relay endpoint should be used as-is"
);
assert(
  seedanceCreateEndpoint("https://relay.example/v1/videos") === "https://relay.example/v1/videos",
  "Seedance unified relay videos endpoint should be used as-is"
);
assert(
  joinUrl("https://ai.ai666.net/v1", "/v1/videos") === "https://ai.ai666.net/v1/videos",
  "joinUrl should not duplicate /v1 for OpenAI-compatible relay bases"
);
assert(
  joinUrl("https://ai.ai666.net/v1/videos", "/v1/videos") === "https://ai.ai666.net/v1/videos",
  "joinUrl should not duplicate a full videos endpoint"
);
assert(
  joinUrl("https://ai.ai666.net", "/v1/videos") === "https://ai.ai666.net/v1/videos",
  "joinUrl should append /v1/videos to relay root URL"
);
assert(
  seedancePollEndpoint("https://relay.example/v1/videos", "task/1") === "https://relay.example/v1/videos/task%2F1",
  "Seedance unified relay videos endpoint should also be the polling base"
);
assert(
  seedancePollEndpoint("https://ai.ai666.net/v1/video/create", "task_abc") === "https://ai.ai666.net/v1/video/query?id=task_abc",
  "Seedance unified create endpoint should poll through /v1/video/query"
);
assert(
  seedanceCreateEndpoint("https://relay.example/v1") === "https://relay.example/v1/videos",
  "Seedance relay base should append the OpenAI-compatible videos path"
);
assert(
  seedancePollEndpoint("https://relay.example/v1/videos/generations", "task/1") === "https://relay.example/v1/videos/task%2F1",
  "Seedance OpenAI-style poll endpoint should query the videos resource"
);
assert(
  seedanceCreateEndpoint("POST https://relay.example/v1/video/generations") === "https://relay.example/v1/video/generations",
  "Seedance endpoint should ignore a pasted HTTP method prefix"
);
assert(
  veoProxyCreateEndpoint("https://relay.example/v1") === "https://relay.example/v1/videos",
  "Google video relay base should append the OpenAI-compatible videos path"
);
assert(
  veoProxyCreateEndpoint("https://relay.example/v1/videos") === "https://relay.example/v1/videos",
  "Google full videos relay endpoint should be used as-is"
);
assert(
  configuredRelayModelName({ modelName: "veo_3_1" }) === "veo_3_1",
  "Veo relay requests should preserve the upstream model name"
);
const relayConfig = resolveVideoRequestConfig({
  providerId: "google",
  modelName: "veo_3_1_fast",
  apiBaseUrl: "https://ai.ai666.net/v1",
  apiKey: "sk-test-key",
  prompt: "test",
  projectId: "project",
  nodeId: "node",
  modelConfigId: "model",
  inputMode: "text-to-video",
  duration: 10,
  aspectRatio: "9:16",
  resolution: "720p",
  generateCount: 1
}, {
  inputModes: ["text-to-video", "image-to-video"],
  aspectRatios: ["16:9", "9:16"],
  resolutions: ["720p"],
  duration: { type: "enum", values: [5, 8, 10] },
  channel: "official"
});
assert(relayConfig.channel === "proxy", "OpenAI-compatible relay URL should force proxy channel even if stale config says official");
assert(relayConfig.apiFamily === "openai_videos", "Plain Veo relay model should use the OpenAI-like videos family");
assert(relayConfig.requestFormat === "json", "OpenAI-compatible relay URL should use JSON requests");
assert(relayConfig.finalUrl === "https://ai.ai666.net/v1/videos", "Relay final URL should be safely joined");
const seedance2Config = resolveVideoRequestConfig({
  providerId: "openai-video",
  modelName: "doubao-seedance-2-0-fast-260128",
  apiBaseUrl: "https://ai.ai666.net/v1",
  apiKey: "sk-test-key",
  prompt: "test",
  projectId: "project",
  nodeId: "node",
  modelConfigId: "model",
  inputMode: "image-to-video",
  imageAssetIds: ["asset"],
  duration: 5,
  aspectRatio: "9:16",
  resolution: "480p",
  generateCount: 1
}, {
  inputModes: ["text-to-video", "image-to-video", "reference-to-video"],
  aspectRatios: ["16:9", "9:16"],
  resolutions: ["480p", "720p"],
  duration: { type: "enum", values: [4, 5, 6, 8, 10, 15] },
  channel: "proxy"
});
assert(seedance2Config.apiFamily === "seedance2_native", "Seedance 2.0 relay should use the native content[] family");
assert(seedance2Config.finalUrl === "https://ai.ai666.net/v1/video/generations", "Seedance 2.0 relay should submit to /v1/video/generations");
assert(seedance2Config.taskIdField === "task_id", "Seedance 2.0 relay should read task_id");
assert(seedance2Config.imageTransport === "url_or_asset", "Seedance 2.0 relay should accept public URLs or uploaded assets");
const cy88SeedanceConfig = resolveVideoRequestConfig({
  providerId: "openai-video",
  modelName: "doubao-seedance-2-0-fast-260128",
  apiBaseUrl: "https://ai.cy88.ai/v1",
  apiKey: "sk-test-key",
  prompt: "test video prompt",
  nodeId: "node",
  modelConfigId: "model",
  inputMode: "image-to-video",
  imageAssetIds: ["asset"],
  duration: 5,
  aspectRatio: "16:9",
  resolution: "480P",
  generateCount: 1
}, {
  inputModes: ["text-to-video", "image-to-video"],
  channel: "proxy",
  apiFamily: "seedance2_native",
  createEndpoint: "/v1/video/generations",
  pollEndpoint: "/v1/video/generations/{taskId}",
  supportedInputs: ["text", "image"],
  imageTransport: "url"
});
assert(cy88SeedanceConfig.apiFamily === "seedance2_native", "cy88 Seedance 2 should use the documented native content[] family");
assert(cy88SeedanceConfig.finalUrl === "https://ai.cy88.ai/v1/video/generations", "cy88 Seedance 2 should submit to /v1/video/generations");
assert(cy88SeedanceConfig.pollEndpoint === "/v1/video/generations/{taskId}", "cy88 Seedance 2 should use native task polling");
assert(cy88SeedanceConfig.imageTransport === "url", "Explicit Seedance 2 image transport should be preserved");

const seedance15Config = resolveVideoRequestConfig({
  providerId: "seedance",
  modelName: "doubao-seedance-1-5-pro_480p",
  apiBaseUrl: "https://ai.cy88.ai/v1",
  apiKey: "sk-test-key",
  prompt: "test video prompt",
  nodeId: "node",
  modelConfigId: "model",
  inputMode: "image-to-video",
  imageAssetIds: ["asset"],
  duration: 5,
  aspectRatio: "16:9",
  resolution: "480P",
  generateCount: 1
}, { inputModes: ["text-to-video", "image-to-video", "first-last-frame"], channel: "proxy" });
assert(seedance15Config.apiFamily === "doubao_seedance15", "Seedance 1.5 should use its multipart family");
assert(seedance15Config.requestFormat === "multipart", "Seedance 1.5 should submit multipart form data");
assert(seedance15Config.imageTransport === "multipart_file", "Seedance 1.5 should upload frame files");
assert(seedance15Config.imageField === "first_frame_image", "Seedance 1.5 should use first_frame_image");

const klingAigcConfig = resolveVideoRequestConfig({
  providerId: "google",
  modelName: "kling-3.0-omni-720p-ref-audio",
  apiBaseUrl: "https://ai.cy88.ai/v1",
  apiKey: "sk-test-key",
  prompt: "test video prompt",
  nodeId: "node",
  modelConfigId: "model",
  inputMode: "image-to-video",
  imageAssetIds: ["asset"],
  duration: 5,
  aspectRatio: "16:9",
  resolution: "720P",
  generateCount: 1
}, { inputModes: ["text-to-video", "image-to-video"], channel: "proxy" });
assert(klingAigcConfig.apiFamily === "aigc_video_json", "Kling proxy should use the documented AIGC JSON family");
assert(klingAigcConfig.requestFormat === "json", "Kling AIGC should submit JSON");
assert(klingAigcConfig.imageTransport === "url_or_asset", "Kling reference input should use a public asset URL");
const klingAigcBody = buildProxyBody({
  providerId: "google",
  modelName: "kling-3.0-omni-720p-ref-audio",
  apiBaseUrl: "https://ai.cy88.ai/v1",
  apiKey: "sk-test-key",
  prompt: "test video prompt",
  nodeId: "node",
  modelConfigId: "model",
  inputMode: "image-to-video",
  duration: 5,
  aspectRatio: "16:9",
  resolution: "720P",
  generateCount: 1
}, {
  apiFamily: "aigc_video_json",
  mode: "image_to_video_first_frame",
  images: ["https://assets.example/frame.png"],
  videos: [],
  audios: [],
  aspectRatio: "16:9",
  resolution: "720P",
  seconds: "5"
}) as Record<string, any>;
assert(klingAigcBody.image === "https://assets.example/frame.png", "Kling AIGC should send the documented image field");
assert((klingAigcBody.metadata as any).output_config.audio_generation === "Enabled", "Kling audio variants should enable audio generation");
assert((klingAigcBody.metadata as any).output_config.aspect_ratio === "16:9", "Kling AIGC should send metadata.output_config.aspect_ratio");

const seedance2Body = buildProxyBody({
  providerId: "seedance",
  modelName: "doubao-seedance-2-0-260128",
  apiBaseUrl: "https://ai.cy88.ai/v1",
  apiKey: "sk-test-key",
  prompt: "test video prompt",
  nodeId: "node",
  modelConfigId: "model",
  inputMode: "image-to-video",
  duration: 5,
  aspectRatio: "16:9",
  resolution: "480P",
  generateCount: 1
}, {
  apiFamily: "seedance2_native",
  mode: "image_to_video_first_frame",
  images: ["https://assets.example/frame.png"],
  videos: [],
  audios: [],
  aspectRatio: "16:9",
  resolution: "480P",
  seconds: "5"
}) as Record<string, any>;
assert(Array.isArray(seedance2Body.content), "Seedance 2 should send content[]");
assert((seedance2Body.metadata as any).duration === 5, "Seedance 2 should send metadata.duration");
assert((seedance2Body.metadata as any).ratio === "16:9", "Seedance 2 should send metadata.ratio");
assert((seedance2Body.metadata as any).resolution === "480p", "Seedance 2 should send lowercase metadata.resolution");
assert((seedance2Body.content as any[])[1]?.role === "first_frame", "Seedance 2 image-to-video should mark the image as first_frame");
assert((seedance2Body.content as any[])[1]?.image_url?.url === "https://assets.example/frame.png", "Seedance 2 should place image URL inside content[].image_url.url");
const omniConfig = resolveVideoRequestConfig({
  providerId: "openai-video",
  modelName: "omni-fast",
  apiBaseUrl: "https://ai.ai666.net/v1",
  apiKey: "sk-test-key",
  prompt: "test",
  projectId: "project",
  nodeId: "node",
  modelConfigId: "model",
  inputMode: "image-to-video",
  imageAssetIds: ["asset"],
  duration: 8,
  aspectRatio: "16:9",
  resolution: "720p",
  generateCount: 1
}, {
  inputModes: ["text-to-video", "image-to-video"],
  aspectRatios: ["16:9", "9:16"],
  resolutions: ["720p"],
  duration: { type: "enum", values: [5, 8, 10] },
  channel: "proxy"
});
assert(omniConfig.apiFamily === "omni_fast", "Omni-fast should use its own /v1/videos body family");
assert(omniConfig.finalUrl === "https://ai.ai666.net/v1/videos", "Omni-fast should still submit to /v1/videos");
assert(omniConfig.imageTransport === "url", "Omni-fast image input should use first_image_url with public URL");
assert(omniConfig.imageField === "first_image_url", "Omni-fast should keep its configured first frame field");
assert(omniConfig.supportedInputs.includes("image"), "/v1/videos must not force Omni-fast to text-only");
const configurableOpenAiVideos = resolveVideoRequestConfig({
  providerId: "grok",
  modelName: "grok-video-proxy",
  apiBaseUrl: "https://relay.example/v1/videos",
  apiKey: "sk-test-key",
  prompt: "test",
  nodeId: "node",
  modelConfigId: "model",
  inputMode: "image-to-video",
  imageAssetIds: ["asset"],
  duration: 8,
  aspectRatio: "16:9",
  resolution: "720p",
  generateCount: 1
}, {
  inputModes: ["text-to-video"],
  channelCapability: {
    channel: "proxy",
    apiFamily: "openai_videos",
    supportedInputs: ["text", "image"],
    imageTransport: "base64_json",
    imageField: "images"
  }
});
assert(configurableOpenAiVideos.supportedInputs.includes("image"), "Configured /v1/videos channels must retain image support");
assert(configurableOpenAiVideos.imageTransport === "base64_json", "Configured image transport must win over endpoint inference");
const omniV2vConfig = resolveVideoRequestConfig({
  providerId: "openai-video",
  modelName: "omni-fast-v2v",
  apiBaseUrl: "https://ai.ai666.net/v1",
  apiKey: "sk-test-key",
  prompt: "test",
  nodeId: "node",
  modelConfigId: "model",
  inputMode: "video-to-video",
  videoAssetIds: ["video"],
  duration: 8,
  aspectRatio: "16:9",
  resolution: "720p",
  generateCount: 1
}, {
  inputModes: ["video-to-video"],
  supportedInputs: ["video"],
  videoTransport: "url_or_base64_json"
});
assert(omniV2vConfig.apiFamily === "omni_fast_v2v", "Omni-fast-v2v should use its video reference family");
assert(omniV2vConfig.videoField === "video", "Omni-fast-v2v should send the video field");
assert(omniV2vConfig.videoTransport === "url_or_base64_json", "Omni-fast-v2v should preserve video transport");
const unifiedConfig = resolveVideoRequestConfig({
  providerId: "openai-video",
  modelName: "viduq2",
  apiBaseUrl: "https://ai.ai666.net/v1",
  apiKey: "sk-test-key",
  prompt: "test",
  projectId: "project",
  nodeId: "node",
  modelConfigId: "model",
  inputMode: "image-to-video",
  imageAssetIds: ["asset"],
  duration: 8,
  aspectRatio: "9:16",
  resolution: "720p",
  generateCount: 1
}, {
  inputModes: ["text-to-video", "image-to-video"],
  aspectRatios: ["16:9", "9:16"],
  resolutions: ["720p"],
  duration: { type: "enum", values: [5, 8, 10] },
  channel: "proxy",
  apiFamily: "unified_video_create",
  createEndpoint: "/v1/video/create",
  pollEndpoint: "/v1/video/query?id={taskId}",
  imageTransport: "url"
});
assert(unifiedConfig.apiFamily === "unified_video_create", "Unified video create should be explicitly configurable");
assert(unifiedConfig.finalUrl === "https://ai.ai666.net/v1/video/create", "Unified video create should submit to /v1/video/create");
assert(unifiedConfig.pollEndpoint === "/v1/video/query?id={taskId}", "Unified video create should keep its query poll endpoint");
const unifiedBody = buildProxyBody({
  providerId: "openai-video",
  modelName: "viduq2",
  apiBaseUrl: "https://ai.ai666.net/v1",
  apiKey: "sk-test-key",
  prompt: "test",
  projectId: "project",
  nodeId: "node",
  modelConfigId: "model",
  inputMode: "image-to-video",
  imageAssetIds: ["asset"],
  duration: 8,
  aspectRatio: "9:16",
  resolution: "720p",
  generateCount: 1
}, {
  apiFamily: "unified_video_create",
  mode: "image_to_video_first_frame",
  images: ["https://assets.example/frame.png"],
  videos: [],
  audios: [],
  aspectRatio: "9:16",
  resolution: "720p",
  seconds: "8"
}) as Record<string, any>;
assert(Array.isArray(unifiedBody.images), "Generic unified video create should send images");
assert(unifiedBody.images[0]?.url === "https://assets.example/frame.png", "Generic unified video create should keep object image references");
const runApiBody = buildProxyBody({
  providerId: "google",
  modelName: "veo3-pro",
  apiBaseUrl: "https://runapi.co",
  apiKey: "sk-test-key",
  prompt: "test",
  projectId: "project",
  nodeId: "node",
  modelConfigId: "model",
  inputMode: "image-to-video",
  imageAssetIds: ["asset"],
  duration: 8,
  aspectRatio: "9:16",
  resolution: "720p",
  generateCount: 1
}, {
  apiFamily: "unified_video_create",
  mode: "image_to_video_first_frame",
  images: ["https://assets.example/frame.png"],
  videos: [],
  audios: [],
  aspectRatio: "9:16",
  resolution: "720p",
  seconds: "8"
}) as Record<string, any>;
assert(runApiBody.images[0] === "https://assets.example/frame.png", "RunAPI video create should send images as string[]");
assert(runApiBody.duration === "8", "RunAPI video create should send duration");
assert(runApiBody.size === "720P", "RunAPI video create should send size");
assert(
  veoProxyCreateEndpoint("POST https://relay.example/v1/video/create") === "https://relay.example/v1/video/create",
  "Google unified video relay endpoint should ignore a pasted HTTP method prefix"
);
assert(
  klingCreateEndpoint("https://api.klingai.com", "text_to_video") === "https://api.klingai.com/v1/videos/text2video",
  "Kling text endpoint should be resolved"
);
assert(
  klingCreateEndpoint("https://relay.example/v1", "reference_images_to_video") === "https://relay.example/v1/videos/multi-image2video",
  "Kling relay base ending in /v1 should not duplicate version"
);
assert(
  klingCreateEndpoint("https://yunwu.ai/kling/v1/videos/omni-video", "reference_images_to_video") === "https://yunwu.ai/kling/v1/videos/omni-video",
  "Kling full relay endpoint should be used as-is"
);
assert(
  klingPollEndpoint("https://yunwu.ai/kling/v1/videos/omni-video", "task/1") === "https://yunwu.ai/kling/v1/videos/omni-video/task%2F1",
  "Kling full relay poll endpoint should append encoded task id"
);

const token = klingBearerToken("access-key:secret-key", 1_700_000_000);
const parts = token.split(".");
assert(parts.length === 3, "Kling AK/SK should produce a JWT");
const payload = JSON.parse(Buffer.from(parts[1]!, "base64url").toString("utf8")) as Record<string, unknown>;
assert(payload.iss === "access-key", "Kling JWT issuer should use AccessKey");
assert(klingBearerToken("relay-token") === "relay-token", "Kling relay Bearer token should pass through");
assert(normalizeKlingPrompt("  a\n\n b  ") === "a b", "Kling prompt should collapse whitespace");
assert(Buffer.byteLength(normalizeKlingPrompt("汉".repeat(2600)), "utf8") <= 2400, "Kling prompt should stay within relay-safe UTF-8 byte limit");
assert(!modelCatalog.some((item) => item.name === "grok-imagine-fast"), "Unpublished Grok Imagine Fast entry should be removed");
assert(modelCatalog.some((item) => item.name === "grok-imagine-video"), "Official Grok Imagine Video model should be retained");
assert(modelCatalog.some((item) => item.name === "grok-imagine-video-1.5-preview"), "Official Grok Imagine Video 1.5 Preview model should be retained");
assert(modelCatalog.some((item) => item.name === "grok-video-3"), "Relay Grok Video 3 model should be available");
assert(modelCatalog.some((item) => item.name === "grok-video-3-pro"), "Relay Grok Video 3 Pro model should be available");
assert(modelCatalog.some((item) => item.name === "grok-video-3-max"), "Relay Grok Video 3 Max model should be available");
assert(modelCatalog.some((item) => item.name === "grok-1.5-video-6s"), "Relay Grok 1.5 Video 6s model should be available");
assert(modelCatalog.some((item) => item.name === "grok-1.5-video-10s"), "Relay Grok 1.5 Video 10s model should be available");
assert(modelCatalog.some((item) => item.name === "grok-1.5-video-15s"), "Relay Grok 1.5 Video 15s model should be available");

const grokReference = getVideoModelCapability("grok", "grok-imagine-video", "grok-imagine-video", "reference_images_to_video");
assert(grokReference?.supportedResolutions.join(",") === "480p,720p", "Grok should expose official 480p and 720p resolutions");
assert(grokReference?.supportedModes.some((mode) => mode.mode === "video_edit"), "Grok should support video editing");
assert(grokReference?.supportedModes.some((mode) => mode.mode === "video_extension"), "Grok should support video extension");
assert(grokReference?.supportedDurations[0] === 1, "Grok should start at 1s duration");
assert(grokReference?.supportedDurations.at(-1) === 15, "Grok should end at 15s duration");
const grokPreview = getVideoModelCapability("grok", "grok-imagine-video-1-5-preview", "grok-imagine-video-1.5-preview", "reference_images_to_video");
assert(grokPreview?.supportedDurations.includes(10), "Grok Imagine Video 1.5 Preview should expose official-style durations");
const grokRelay = getVideoModelCapability("grok", "grok-video-3", "grok-video-3", "reference_images_to_video");
assert(grokRelay?.supportedAspectRatios.join(",") === "16:9,9:16,2:3,3:2,1:1", "Relay Grok Video 3 should follow ai666 documented aspect ratios");
assert(grokRelay?.supportedResolutions.join(",") === "720P,1080P", "Relay Grok Video 3 should expose ai666 documented resolutions");
assert(grokRelay?.supportedDurations[0] === 1, "Relay Grok Video 3 should start at 1s duration");
assert(grokRelay?.supportedDurations.at(-1) === 15, "Relay Grok Video 3 should end at 15s duration");
const grokRelayPro = getVideoModelCapability("grok", "grok-video-3-pro", "grok-video-3-pro", "reference_images_to_video");
assert(grokRelayPro?.supportedDurations.join(",") === "10", "Relay Grok Video 3 Pro should be fixed at 10s");
const grokRelayMax = getVideoModelCapability("grok", "grok-video-3-max", "grok-video-3-max", "reference_images_to_video");
assert(grokRelayMax?.supportedDurations.join(",") === "15", "Relay Grok Video 3 Max should be fixed at 15s");
const grokRelay15s = getVideoModelCapability("grok", "grok-1-5-video-15s", "grok-1.5-video-15s", "reference_images_to_video");
assert(grokRelay15s?.supportedDurations.join(",") === "15", "Relay Grok 1.5 Video 15s should be fixed at 15s");

const klingReference = getVideoModelCapability("kling", "kling-3-0", "kling-v3-omni", "reference_images_to_video");
assert(klingReference?.supportedModes.some((mode) => mode.mode === "image_to_video_first_last_frame"), "Kling should expose first/last frame mode");
assert(klingReference?.supportedModes.find((mode) => mode.mode === "reference_images_to_video")?.label === "全能参考", "Kling 3.0 Omni should expose the omni reference label");
assert(klingReference?.maxReferenceImages === 4, "Kling reference mode should allow up to four images");
assert(klingReference?.supportedDurations.join(",") === "5,10,15", "Kling 3.0 should expose 5s, 10s, and 15s durations");

const seedanceReference = getVideoModelCapability("seedance", "seedance-2-0", "seedance-2.0", "reference_images_to_video");
assert(seedanceReference?.supportedModes.find((mode) => mode.mode === "reference_images_to_video")?.label === "全能参考", "Seedance 2.0 should expose the omni reference label");
assert(seedanceReference?.runtimeStatus === "experimental", "Seedance 2.0 adapter should be available experimentally");
assert(seedanceReference?.supportedDurations.join(",") === "0,4,5,6,7,8,9,10,11,12,13,14,15", "Seedance 2.0 should expose Auto and 4-15s durations");
assert(seedanceReference?.supportedResolutions.join(",") === "480P,720P,1080P", "Seedance 2.0 should expose permission-gated resolutions");
assert(seedanceReference?.supportedAspectRatios.join(",") === "9:16,16:9,1:1,3:4,4:3,21:9", "Seedance 2.0 should expose all supported aspect ratios");
assert(seedanceReference?.supportedModes.some((mode) => mode.mode === "image_to_video_first_last_frame"), "Seedance 2.0 should expose first/last frame mode");
assert(seedanceReference?.supportedModes.some((mode) => mode.mode === "video_edit"), "Seedance 2.0 should expose video editing");
assert(seedanceReference?.supportedModes.some((mode) => mode.mode === "video_extension"), "Seedance 2.0 should expose video extension");
assert(seedanceReference?.maxReferenceImages === 9 && seedanceReference.maxReferenceVideos === 3 && seedanceReference.maxReferenceAudios === 3, "Seedance 2.0 should expose official multimodal reference limits");
assert(seedanceReference?.maxReferenceFiles === 12, "Seedance 2.0 should limit mixed references to 12 files");

const klingLegacy = getVideoModelCapability("kling", "kling-1-6", "kling-v1-6", "image_to_video_first_frame");
assert(klingLegacy?.supportedDurations.join(",") === "5,10", "Kling 1.6 should be available with official durations");

const klingTurbo = getVideoModelCapability("kling", "kling-2-5", "kling-v2-5-turbo", "reference_images_to_video");
assert(!klingTurbo, "Kling 2.5 Turbo should not advertise reference-image mode");
const klingTurboText = getVideoModelCapability("kling", "kling-2-5", "kling-v2-5-turbo", "text_to_video");
assert(klingTurboText?.supportedDurations.join(",") === "5,10", "Kling 2.5 Turbo should stay on 5s and 10s durations");

console.log("[test:video-provider-adapters] ok");
