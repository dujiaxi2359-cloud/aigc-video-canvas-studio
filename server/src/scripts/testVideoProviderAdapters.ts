import { buildGrokRelayMultipart, grokCreateEndpoint, grokPollEndpoint, grokPollEndpointCandidates, grokRequestModelName, isAi666GrokRelay, isOfficialGrokEndpoint } from "../services/providers/grokVideo.service.js";
import { klingBearerToken, klingCreateEndpoint, klingPollEndpoint, normalizeKlingPrompt } from "../services/providers/klingVideo.service.js";
import { buildMiniMaxVideoBody, minimaxCreateEndpoint, minimaxCreateEndpointCandidates, minimaxQueryEndpoint, minimaxRetrieveEndpoint } from "../services/providers/minimaxVideo.service.js";
import { buildOpenAiVideosMultipart, buildProxyBody, buildSeedance15Multipart, isRetryableSeedancePollFailure, relayCreateEndpointCandidates, seedanceAssetUploadShouldFallback, seedanceAuthorizationValues, seedanceCreateEndpoint, seedancePollEndpoint } from "../services/providers/seedanceVideo.service.js";
import { buildVeoProxyBody, configuredRelayModelName, veoProxyCreateEndpoint, veoProxyCreateEndpointCandidates } from "../services/providers/veoProxyVideo.service.js";
import { joinUrl, resolveVideoRequestConfig } from "../services/providers/videoRequestAdapter.js";
import { getVideoModelCapability } from "../config/videoModelCapabilities.js";
import { modelCatalog } from "../services/modelCatalog.js";
import { calculateAvailableVideoOptions } from "../services/modelCapability.service.js";
import { hasSubmittedRemoteVideoTask, shouldUseVideoFallbackCandidate } from "../services/model.service.js";
import { isGrokLikeVideoModel, normalizeVideoCapabilities } from "../services/videoCapabilityNormalization.js";
import { ProviderError } from "../utils/providerErrors.js";
import { mapVideoDimensions, normalizeVideoAspectRatio } from "../utils/videoParams.js";
import { isZhipuImageModel, isZhipuOfficialEndpoint, normalizeZhipuBaseUrl, zhipuImageModels, zhipuVideoModels } from "../services/providers/zhipuProtocol.js";
import { zhipuImageGenerationEndpointCandidates } from "../services/providers/zhipuImage.service.js";

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
  hasSubmittedRemoteVideoTask(new ProviderError("NETWORK_ERROR", "poll failed", "terminated", { proxyTaskId: "task_123" })),
  "Video fallback should be blocked once an upstream task id exists"
);
assert(
  hasSubmittedRemoteVideoTask(new ProviderError("NETWORK_ERROR", "poll failed", "terminated", { taskId: "task_456" })),
  "Generic relay task ids should keep the canvas in processing state"
);
assert(
  !hasSubmittedRemoteVideoTask(new ProviderError("NETWORK_ERROR", "create failed", "fetch failed")),
  "Video fallback can still run when no upstream task was created"
);
assert(
  !shouldUseVideoFallbackCandidate(
    { provider_id: "grok", api_base_url: "https://runapi.co/v1" },
    { provider_id: "kling", api_base_url: "https://runapi.co/v1" }
  ),
  "Grok video fallback must not switch to Kling on the same relay"
);
assert(
  shouldUseVideoFallbackCandidate(
    { provider_id: "google", api_base_url: "https://ai.cy88.ai/v1" },
    { provider_id: "google", api_base_url: "https://ai.cy88.ai/v1" }
  ),
  "Video fallback can stay within the same provider and relay"
);
assert(
  !shouldUseVideoFallbackCandidate(
    {
      provider_id: "google",
      api_base_url: "https://ai.cy88.ai/v1",
      model_name: "omni-fast-v2v",
      capabilities_json: JSON.stringify({ channelCapability: { apiFamily: "omni_fast_v2v" } })
    },
    {
      provider_id: "google",
      api_base_url: "https://ai.cy88.ai/v1",
      model_name: "omni-fast",
      capabilities_json: JSON.stringify({ channelCapability: { apiFamily: "omni_fast" } })
    }
  ),
  "Omni-fast-v2v fallback must not switch to the image/text omni-fast route"
);
assert(
  !shouldUseVideoFallbackCandidate(
    {
      provider_id: "google",
      api_base_url: "https://ai.cy88.ai/v1",
      model_name: "omni-fast-v2v",
      capabilities_json: JSON.stringify({ channelCapability: { apiFamily: "omni_fast_v2v" } })
    },
    {
      provider_id: "google",
      api_base_url: "https://ai.cy88.ai/v1",
      model_name: "veo_3_1-fast",
      capabilities_json: JSON.stringify({ channelCapability: { apiFamily: "veo_proxy" } })
    }
  ),
  "Omni-fast-v2v fallback must not switch to a Veo route with different video input rules"
);
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
  grokPollEndpointCandidates("https://relay.example/v1/videos", "request/1").includes("https://relay.example/v1/video/query?id=request%2F1"),
  "Grok relay polling should fallback to unified video query when /videos/{id} reports task_not_exist"
);
assert(
  grokPollEndpointCandidates("https://relay.example/v1/video/create", "task_abc").includes("https://relay.example/v1/videos/task_abc"),
  "Grok unified create polling should fallback to OpenAI-style videos lookup"
);
assert(
  grokPollEndpointCandidates("https://api.x.ai/v1", "request/1").length === 1,
  "Official xAI polling should not try relay fallback endpoints"
);
assert(
  grokCreateEndpoint("POST https://relay.example/v1/videos") === "https://relay.example/v1/videos",
  "Grok endpoint should ignore a pasted HTTP method prefix"
);
assert(isOfficialGrokEndpoint("https://api.x.ai/v1"), "xAI endpoint should use the official JSON protocol");
assert(!isOfficialGrokEndpoint("https://relay.example/v1/videos"), "Relay endpoint should use multipart protocol");
assert(isAi666GrokRelay("https://ai.ai666.net/v1"), "ai666 must use the documented Grok relay protocol");
assert(grokCreateEndpoint("https://ai.ai666.net/v1") === "https://ai.ai666.net/v1/videos", "ai666 Grok relay should create through POST /v1/videos");
assert(grokPollEndpoint("https://ai.ai666.net/v1", "video_1") === "https://ai.ai666.net/v1/videos/video_1", "ai666 Grok relay should poll GET /v1/videos/{task_id}");
assert(grokRequestModelName("grok-1.5-video-6s", "https://ai.ai666.net/v1") === "grok-1.5-video-6s", "ai666 Grok 1.5 6s should keep the relay-documented model name");
assert(grokRequestModelName("grok-1.5-video-10s", "https://ai.ai666.net/v1") === "grok-1.5-video-10s", "ai666 Grok 1.5 10s should keep the relay-documented model name");
assert(grokRequestModelName("grok-1.5-video-15s", "https://ai.ai666.net/v1") === "grok-1.5-video-15s", "ai666 Grok 1.5 15s should keep the relay-documented model name");
assert(grokRequestModelName("grok-video-3-pro", "https://ai.cy88.ai/v1") === "grok-video-3-pro", "runtime requests must preserve the configured upstream model id");
assert(grokRequestModelName("grok-video-3-max", "https://ai.cy88.ai/v1") === "grok-video-3-max", "runtime requests must never rename an upstream model id");
assert(grokRequestModelName("grok-video-3-10s", "https://ai.cy88.ai/v1") === "grok-video-3-10s", "cy88 10s Grok config should keep the relay-documented model name");
assert(grokRequestModelName("grok-video-3-15s", "https://ai.cy88.ai/v1") === "grok-video-3-15s", "cy88 15s Grok config should keep the relay-documented model name");
const cy88GrokForm = buildGrokRelayMultipart({
  apiBaseUrl: "https://ai.cy88.ai/v1",
  modelName: grokRequestModelName("grok-video-3-15s", "https://ai.cy88.ai/v1"),
  prompt: "four-shot storyboard",
  duration: 9,
  aspectRatio: "9:16",
  resolution: "1080p",
  images: [
    { blob: new Blob(["front"], { type: "image/png" }), filename: "front.png" },
    { blob: new Blob(["product"], { type: "image/png" }), filename: "product.png" }
  ]
});
assert(cy88GrokForm.get("model") === "grok-video-3-15s", "cy88 15s model must submit the relay-documented model name");
assert(cy88GrokForm.get("seconds") === "15", "grok-video-3-15s must always submit 15 seconds");
assert(cy88GrokForm.get("size") === "1080P", "Duoyuan Grok size must use the documented 720P/1080P value");
assert(cy88GrokForm.get("aspect_ratio") === "9:16", "Duoyuan Grok must preserve the documented aspect_ratio field");
assert(cy88GrokForm.getAll("input_reference").length === 2, "Duoyuan Grok must repeat input_reference for multiple images");
assert(!cy88GrokForm.has("duration") && !cy88GrokForm.has("ratio") && !cy88GrokForm.has("dimensions"), "Duoyuan Grok multipart must not mix undocumented compatibility aliases");
assert(normalizeVideoAspectRatio("2:3") === "2:3", "ai666 documented 2:3 ratio must be preserved");
assert(normalizeVideoAspectRatio("3:2") === "3:2", "ai666 documented 3:2 ratio must be preserved");
assert(
  isGrokLikeVideoModel("openai-video", "grok-imagine-1.0-video", { inputModes: ["text-to-video"] }),
  "Historical openai-video configs must still route Grok Imagine through the Grok adapter"
);
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
assert(seedanceAuthorizationValues("sk-test")[0] === "sk-test", "Seedance asset APIs should try the documented raw sk token before Bearer");
assert(seedanceAuthorizationValues("sk-test")[1] === "Bearer sk-test", "Seedance asset APIs should keep Bearer as fallback");
assert(
  seedanceCreateEndpoint("https://relay.example/v1/videos") === "https://relay.example/v1/videos",
  "Seedance unified relay videos endpoint should be used as-is"
);
assert(
  minimaxCreateEndpoint("https://api.minimaxi.com/v1") === "https://api.minimaxi.com/v1/video_generation",
  "MiniMax official base should append /video_generation"
);
assert(
  minimaxCreateEndpoint("https://api.minimaxi.com/v1/video_generation") === "https://api.minimaxi.com/v1/video_generation",
  "MiniMax full create endpoint should be preserved"
);
assert(
  minimaxCreateEndpointCandidates("https://relay.example").includes("https://relay.example/v1/video_generation"),
  "MiniMax relay should try the official-compatible /v1/video_generation path"
);
assert(
  minimaxCreateEndpointCandidates("https://relay.example").includes("https://relay.example/v1/video/create"),
  "MiniMax relay should fallback to unified video create when the relay uses generic routes"
);
assert(
  minimaxQueryEndpoint("https://api.minimaxi.com/v1", "task/1") === "https://api.minimaxi.com/v1/query/video_generation?task_id=task%2F1",
  "MiniMax query endpoint should encode task_id"
);
assert(
  minimaxRetrieveEndpoint("https://api.minimaxi.com/v1", "176844028768320") === "https://api.minimaxi.com/v1/files/retrieve?file_id=176844028768320",
  "MiniMax retrieve endpoint should set file_id"
);
const minimaxBody = buildMiniMaxVideoBody({
  mode: "image_to_video_first_frame",
  images: ["https://cdn.example/a.png"],
  params: {
    nodeId: "n1",
    modelConfigId: "cfg",
    inputMode: "image-to-video",
    prompt: "move",
    imageAssetIds: ["asset1"],
    duration: 10,
    aspectRatio: "9:16",
    resolution: "1080P",
    generateCount: 1,
    apiKey: "sk",
    apiBaseUrl: "https://api.minimaxi.com/v1",
    modelName: "MiniMax-Hailuo-2.3-Fast",
    providerId: "minimax"
  }
});
assert(minimaxBody.duration === 6, "MiniMax 1080P requests should clamp duration to 6 seconds");
assert(minimaxBody.resolution === "1080P", "MiniMax resolution should use official upper-case enum");
assert(minimaxBody.first_frame_image === "https://cdn.example/a.png", "MiniMax image mode should send first_frame_image");
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
  isRetryableSeedancePollFailure(new Response("{}", { status: 404 }), { code: "task_not_exist", message: "task_not_exist" }),
  "Generic video relay polling should treat 404 task_not_exist as retryable instead of immediate failure"
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
  veoProxyCreateEndpoint("https://runapi.co") === "https://runapi.co/v1/video/create",
  "RunAPI Veo proxy root should use /v1/video/create"
);
assert(
  veoProxyCreateEndpoint("https://runapi.co/v1") === "https://runapi.co/v1/video/create",
  "RunAPI Veo proxy v1 base should use /v1/video/create"
);
assert(
  veoProxyCreateEndpoint("https://ai.cy88.ai/v1") === "https://ai.cy88.ai/v1/video/create",
  "cy88 Veo relay should prefer the unified create endpoint that its console reports"
);
assert(
  JSON.stringify(veoProxyCreateEndpointCandidates("https://runapi.co/v1")) === JSON.stringify([
    "https://runapi.co/v1/video/create",
    "https://runapi.co/v1/videos"
  ]),
  "RunAPI Veo proxy should only keep compatible task-create fallbacks"
);
assert(
  !veoProxyCreateEndpointCandidates("https://api.newtoken.club/v1")
    .some((endpoint) => /\/v1\/videos\/generations$/i.test(endpoint)),
  "Generic Veo relays should not try the official /v1/videos/generations endpoint"
);
assert(
  JSON.stringify(veoProxyCreateEndpointCandidates("https://api.newtoken.club/v1")) === JSON.stringify(["https://api.newtoken.club/v1/videos"]),
  "NewToken Veo docs pin task creation to /v1/videos without unified-create fallback"
);
assert(
  veoProxyCreateEndpointCandidates("https://relay.example/v1")[1] === "https://relay.example/v1/video/create",
  "Generic Veo proxy should fallback from OpenAI videos to unified create"
);
const runApiVeoProxyBody = buildVeoProxyBody({
  endpoint: "https://runapi.co/v1/video/create",
  relayModel: "veo3.1-fast",
  images: ["https://assets.example/frame.png"],
  requestAspectRatio: "9:16",
  requestResolution: "720p",
  requestSize: "720x1280",
  isOmni: false,
  params: {
    providerId: "google",
    modelName: "veo3.1-fast",
    apiBaseUrl: "https://runapi.co/v1",
    apiKey: "sk-test-key",
    prompt: "test",
    nodeId: "node",
    modelConfigId: "model",
    inputMode: "reference-to-video",
    videoMode: "reference_images_to_video",
    imageAssetIds: ["asset"],
    duration: 8,
    aspectRatio: "9:16",
    resolution: "720p",
    generateCount: 1,
    qualityMode: "full_quality"
  }
}) as Record<string, any>;
assert(runApiVeoProxyBody.duration === 8, "RunAPI Veo proxy duration should be numeric");
assert(runApiVeoProxyBody.enable_upsample === false, "RunAPI Veo proxy enable_upsample should be boolean");
assert(runApiVeoProxyBody.watermark === false, "RunAPI Veo proxy body should request watermark-free output");
assert((runApiVeoProxyBody.metadata as any).watermark === false, "RunAPI Veo proxy body should also disable watermark in metadata");
const cy88VeoProxyBody = buildVeoProxyBody({
  endpoint: "https://ai.cy88.ai/v1/video/create",
  relayModel: "veo_3_1-fast",
  images: ["https://assets.example/frame.png"],
  requestAspectRatio: "9:16",
  requestResolution: "720p",
  requestSize: "720x1280",
  isOmni: false,
  params: {
    providerId: "google",
    modelName: "veo_3_1-fast",
    apiBaseUrl: "https://ai.cy88.ai/v1",
    apiKey: "sk-test-key",
    prompt: "test",
    nodeId: "node",
    modelConfigId: "model",
    inputMode: "reference-to-video",
    videoMode: "reference_images_to_video",
    imageAssetIds: ["asset"],
    duration: 8,
    aspectRatio: "9:16",
    resolution: "720p",
    generateCount: 1,
    qualityMode: "full_quality"
  }
}) as Record<string, any>;
assert(cy88VeoProxyBody.aspect_ratio === "9:16", "cy88 Veo proxy body should include aspect_ratio");
assert(cy88VeoProxyBody.size === "720x1280", "cy88 Veo proxy body should include portrait widthxheight size");
assert(cy88VeoProxyBody.orientation === "portrait", "cy88 Veo proxy body should include documented portrait orientation");
assert(cy88VeoProxyBody.duration === 8, "cy88 Veo proxy body should include numeric duration");
assert(cy88VeoProxyBody.watermark === false, "cy88 Veo proxy body should request watermark-free output");
assert((cy88VeoProxyBody.metadata as any).watermark === false, "cy88 Veo proxy body should also disable watermark in metadata");
assert(!("ratio" in cy88VeoProxyBody) && !("seconds" in cy88VeoProxyBody), "cy88 unified body should not mix OpenAI compatibility aliases");
const ai666PortraitReferenceBody = buildVeoProxyBody({
  endpoint: "https://ai.ai666.net/v1/videos",
  relayModel: "veo_3_1-fast",
  images: ["https://assets.example/front.png", "https://assets.example/style.png"],
  requestAspectRatio: "9:16",
  requestResolution: "720p",
  requestSize: "720x1280",
  isOmni: false,
  params: {
    providerId: "google",
    modelName: "veo_3_1-fast",
    apiBaseUrl: "https://ai.ai666.net/v1",
    apiKey: "sk-test-key",
    prompt: "test",
    nodeId: "node",
    modelConfigId: "model",
    inputMode: "reference-to-video",
    videoMode: "reference_images_to_video",
    imageAssetIds: ["asset1", "asset2"],
    duration: 8,
    aspectRatio: "9:16",
    resolution: "720p",
    generateCount: 1,
    qualityMode: "full_quality"
  }
}) as Record<string, any>;
assert(ai666PortraitReferenceBody.size === "720x1280", "ai666 Veo proxy body should use documented portrait size");
assert(Array.isArray(ai666PortraitReferenceBody.input_reference), "ai666 portrait reference mode should keep multiple reference images");
assert(ai666PortraitReferenceBody.watermark === false, "ai666 Veo proxy body should request watermark-free output");
assert((ai666PortraitReferenceBody.metadata as any).watermark === false, "ai666 Veo proxy body should also disable watermark in metadata");
const ai666UnifiedPortraitBody = buildVeoProxyBody({
  endpoint: "https://ai.ai666.net/v1/video/create",
  params: {
    providerId: "google",
    modelName: "veo_3_1-fast",
    apiBaseUrl: "https://ai.ai666.net/v1",
    apiKey: "sk-test-key",
    prompt: "portrait reference test",
    nodeId: "node",
    modelConfigId: "model",
    inputMode: "reference-to-video",
    duration: 8,
    aspectRatio: "9:16",
    resolution: "720p",
    generateCount: 1
  },
  relayModel: "veo3.1-fast-components",
  images: ["https://assets.example/1.png", "https://assets.example/2.png"],
  requestAspectRatio: "9:16",
  requestResolution: "720p",
  requestSize: "720x1280",
  isOmni: false
}) as Record<string, any>;
assert(ai666UnifiedPortraitBody.model === "veo3.1-fast-components", "ai666 portrait references should use the documented components model");
assert(ai666UnifiedPortraitBody.orientation === "portrait", "ai666 unified portrait requests should send portrait orientation");
assert(ai666UnifiedPortraitBody.size === "720x1280", "ai666 unified portrait requests should send portrait dimensions");
assert(ai666UnifiedPortraitBody.aspect_ratio === "9:16", "ai666 unified portrait requests should send 9:16 aspect ratio");
assert(ai666UnifiedPortraitBody.duration === 8, "ai666 unified requests should send numeric duration");
assert(ai666UnifiedPortraitBody.enable_upsample === false, "ai666 portrait requests must not enable landscape-only upsampling");
assert(Array.isArray(ai666UnifiedPortraitBody.images) && ai666UnifiedPortraitBody.images.length === 2, "ai666 unified portrait requests should preserve reference images");
assert(ai666UnifiedPortraitBody.watermark === false, "ai666 unified requests should request watermark-free output");
assert((ai666UnifiedPortraitBody.metadata as any).watermark === false, "ai666 unified requests should also disable watermark in metadata");
assert(!("input_reference" in ai666UnifiedPortraitBody), "ai666 unified requests should not mix the OpenAI input_reference field");
const cy88UnifiedPortraitBody = buildVeoProxyBody({
  endpoint: "https://ai.cy88.ai/v1/video/create",
  params: {
    providerId: "google",
    modelName: "veo_3_1-fast",
    apiBaseUrl: "https://ai.cy88.ai/v1",
    apiKey: "sk-test-key",
    prompt: "portrait reference test",
    nodeId: "node",
    modelConfigId: "model",
    inputMode: "reference-to-video",
    duration: 8,
    aspectRatio: "9:16",
    resolution: "720p",
    generateCount: 1
  },
  relayModel: "veo3.1-fast-components",
  images: ["https://assets.example/1.png", "https://assets.example/2.png"],
  requestAspectRatio: "9:16",
  requestResolution: "720p",
  requestSize: "720x1280",
  isOmni: false
}) as Record<string, any>;
assert(cy88UnifiedPortraitBody.model === "veo3.1-fast-components", "cy88 portrait references should use the components model");
assert(cy88UnifiedPortraitBody.orientation === "portrait", "cy88 portrait references should send portrait orientation");
assert(cy88UnifiedPortraitBody.size === "720x1280", "cy88 portrait references should send portrait dimensions");
assert(cy88UnifiedPortraitBody.aspect_ratio === "9:16", "cy88 portrait references should send 9:16 aspect ratio");
assert(cy88UnifiedPortraitBody.watermark === false, "cy88 unified requests should request watermark-free output");
assert((cy88UnifiedPortraitBody.metadata as any).watermark === false, "cy88 unified requests should also disable watermark in metadata");
assert(ai666PortraitReferenceBody.images.length === 2, "ai666 portrait reference mode should preserve multi-reference images and request native 9:16 through size plus metadata");
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
const repairedCy88SeedanceConfig = resolveVideoRequestConfig({
  providerId: "seedance",
  modelName: "doubao-seedance-2-0-fast-260128",
  apiBaseUrl: "https://ai.cy88.ai/v1",
  apiKey: "sk-test-key",
  prompt: "test",
  nodeId: "node",
  modelConfigId: "model",
  inputMode: "reference-to-video",
  imageAssetIds: ["asset"],
  duration: 5,
  aspectRatio: "9:16",
  resolution: "720P",
  generateCount: 1
}, {
  inputModes: ["text-to-video"],
  channel: "proxy",
  apiFamily: "openai_videos",
  createEndpoint: "/v1/videos/generations",
  pollEndpoint: "/v1/videos/generations/{taskId}"
});
assert(repairedCy88SeedanceConfig.apiFamily === "seedance2_native", "Known Seedance 2 relay IDs must override stale OpenAI protocol metadata");
assert(repairedCy88SeedanceConfig.finalUrl === "https://ai.cy88.ai/v1/video/generations", "cy88 Seedance 2 should create through /v1/video/generations");
assert(repairedCy88SeedanceConfig.pollEndpoint === "/v1/video/generations/{taskId}", "cy88 Seedance 2 should use its native poll endpoint");

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
const seedance15Body = buildSeedance15Multipart({
  providerId: "seedance",
  modelName: "doubao-seedance-1-5-pro-251215",
  apiBaseUrl: "https://ark.cn-beijing.volces.com/api/v3",
  apiKey: "ark-test-key",
  prompt: "test video prompt",
  nodeId: "node",
  modelConfigId: "model",
  inputMode: "text-to-video",
  duration: 5,
  aspectRatio: "16:9",
  resolution: "720P",
  generateCount: 1
}, { files: [], aspectRatio: "16:9", resolution: "720P", seconds: "5" });
assert(seedance15Body.get("generate_audio") === "true", "Seedance 1.5 should request native audio by default");
assert(seedance15Body.get("audio_generation") === "Enabled", "Seedance 1.5 should send the relay-compatible audio generation flag");

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
const repairedCy88KlingConfig = resolveVideoRequestConfig({
  providerId: "kling",
  modelName: "kling-3.0-omni-720p-ref-mute",
  apiBaseUrl: "https://ai.cy88.ai/v1",
  apiKey: "sk-test-key",
  prompt: "test",
  nodeId: "node",
  modelConfigId: "model",
  inputMode: "reference-to-video",
  imageAssetIds: ["asset"],
  duration: 5,
  aspectRatio: "9:16",
  resolution: "720P",
  generateCount: 1
}, {
  inputModes: ["text-to-video"],
  channel: "proxy",
  apiFamily: "openai_videos",
  createEndpoint: "/v1/videos/generations",
  pollEndpoint: "/v1/videos/generations/{taskId}"
});
assert(repairedCy88KlingConfig.apiFamily === "aigc_video_json", "Known Kling relay IDs must override stale OpenAI protocol metadata");
assert(repairedCy88KlingConfig.finalUrl === "https://ai.cy88.ai/v1/videos", "cy88 Kling should create through the proven /v1/videos endpoint");
assert(repairedCy88KlingConfig.pollEndpoint === "/v1/videos/{taskId}", "cy88 Kling should poll through /v1/videos/{taskId}");
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
const klingGenericBody = buildProxyBody({
  providerId: "kling",
  modelName: "kling-3.0-omni",
  apiBaseUrl: "https://ai.ai666.net/v1",
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
assert(klingGenericBody.image === "https://assets.example/frame.png", "Generic Kling 3.0 Omni should send the documented image URL");
assert((klingGenericBody.metadata as any).output_config.audio_generation === "Enabled", "Generic Kling 3.0 Omni should enable native audio by default");
const normalizedKling = normalizeVideoCapabilities({
  inputModes: ["text-to-video"],
  supportedInputs: ["text"],
  imageTransport: "unsupported",
  channelCapability: { supportedInputs: ["text"], imageTransport: "unsupported" }
}, "kling", "kling-3.0-omni");
assert(normalizedKling.supportedInputs?.includes("image"), "Kling 3.0 Omni should recover image capability from stale text-only metadata");
assert(normalizedKling.channelCapability?.imageTransport === "url_or_asset", "Kling 3.0 Omni relay should send public image URLs");

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
assert((seedance2Body.metadata as any).watermark === false, "Seedance 2 should disable watermark by default");
assert((seedance2Body.metadata as any).generate_audio === true, "Seedance 2 should request native audio by default");
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
assert(omniConfig.supportedDurations.length === 1 && omniConfig.supportedDurations[0] === 10, "Omni-fast should be fixed at 10 seconds");
assert(!omniConfig.supportedDurations.includes(8) && !omniConfig.supportedDurations.includes(30), "Omni-fast must not inherit stale flexible duration ranges");
assert(omniConfig.supportedResolutions.includes("4k"), "Omni-fast should accept the documented 4k resolution");
assert(!omniConfig.supportedResolutions.includes("2k"), "Omni-fast should not inherit stale 2k resolution metadata");
const legacyOmniFlash = normalizeVideoCapabilities({
  inputModes: ["text-to-video", "image-to-video", "reference-to-video"],
  aspectRatios: ["16:9", "9:16"],
  resolutions: ["720p"],
  duration: { type: "fixed", value: 10 },
  supportsReferenceImage: true,
  supportsMultiImageInput: true
}, "google", "omni_flash-10s");
assert(legacyOmniFlash.duration?.type === "fixed" && legacyOmniFlash.duration.value === 10, "Legacy Omni Flash 10s must remain fixed at 10 seconds");
assert(!legacyOmniFlash.inputModes.includes("video-to-video"), "Legacy Omni Flash 10s must not expose video extension mode");
const omniReferenceBody = buildProxyBody({
  providerId: "google",
  modelName: "omni-flash",
  apiBaseUrl: "https://ai.ai666.net/v1/videos",
  apiKey: "sk-test-key",
  prompt: "reference test",
  nodeId: "node",
  modelConfigId: "model",
  inputMode: "reference-to-video",
  duration: 8,
  aspectRatio: "9:16",
  resolution: "4K",
  generateCount: 1
}, {
  apiFamily: "omni_fast",
  mode: "reference_images_to_video",
  images: ["https://assets.example/1.png", "https://assets.example/2.png"],
  videos: [],
  audios: [],
  aspectRatio: "9:16",
  resolution: "4K",
  seconds: "8"
}) as Record<string, any>;
assert(omniReferenceBody.model === "omni-fast", "Legacy omni-flash model names should map to the documented omni-fast model");
assert(omniReferenceBody.seconds === "8", "Omni-fast seconds must be sent as a string");
assert(omniReferenceBody.aspect_ratio === "9:16", "Omni-fast should preserve native portrait ratio");
assert(omniReferenceBody.resolution === "4k", "Omni-fast should normalize resolution to the documented lowercase value");
assert(Array.isArray(omniReferenceBody.images) && omniReferenceBody.images.length === 2, "Omni-fast reference mode should send images[]");
assert(!omniReferenceBody.first_image_url, "Omni-fast reference mode should not be downgraded to first-frame mode");
assert(omniReferenceBody.watermark === false, "Omni-fast reference mode should request watermark-free output");
assert((omniReferenceBody.metadata as any).watermark === false, "Omni-fast reference mode should also disable watermark in metadata");
const omniFirstLastBody = buildProxyBody({
  providerId: "google",
  modelName: "omni-fast",
  apiBaseUrl: "https://relay.example/v1",
  apiKey: "sk-test-key",
  prompt: "first last test",
  nodeId: "node",
  modelConfigId: "model",
  inputMode: "first-last-frame",
  duration: 8,
  aspectRatio: "16:9",
  resolution: "720p",
  generateCount: 1
}, {
  apiFamily: "omni_fast",
  mode: "image_to_video_first_last_frame",
  images: ["https://assets.example/start.png", "https://assets.example/end.png"],
  videos: [],
  audios: [],
  aspectRatio: "16:9",
  resolution: "720p",
  seconds: "8"
}) as Record<string, any>;
assert(omniFirstLastBody.first_image_url === "https://assets.example/start.png", "Omni-fast first-last mode should send first_image_url");
assert(omniFirstLastBody.last_image_url === "https://assets.example/end.png", "Omni-fast first-last mode should send last_image_url");
assert(omniFirstLastBody.watermark === false, "Omni-fast first-last mode should request watermark-free output");
assert((omniFirstLastBody.metadata as any).watermark === false, "Omni-fast first-last mode should also disable watermark in metadata");
const newtokenOmniConfig = resolveVideoRequestConfig({
  providerId: "google",
  modelName: "veo-omni-flash-vip",
  apiBaseUrl: "https://api.newtoken.club/v1",
  apiKey: "sk-test-key",
  prompt: "newtoken omni test",
  projectId: "project",
  nodeId: "node",
  modelConfigId: "model",
  inputMode: "reference-to-video",
  imageAssetIds: ["asset-1", "asset-2"],
  duration: 8,
  aspectRatio: "16:9",
  resolution: "720p",
  generateCount: 1
}, {
  inputModes: ["text-to-video", "image-to-video", "reference-to-video"],
  aspectRatios: ["16:9", "9:16"],
  resolutions: ["720p"],
  duration: { type: "enum", values: [8] },
  channel: "proxy"
});
assert(newtokenOmniConfig.channel === "proxy", "newtoken.club should be recognized as a video relay");
assert(newtokenOmniConfig.apiFamily === "omni_fast", "veo-omni-flash should use the Omni video protocol");
assert(newtokenOmniConfig.finalUrl === "https://api.newtoken.club/v1/videos", "Omni relays should create tasks with /v1/videos");
assert(newtokenOmniConfig.supportedDurations.length === 1 && newtokenOmniConfig.supportedDurations[0] === 10, "Omni relays should stay fixed at 10 seconds even with stale custom metadata");
const newtokenOmniBody = buildProxyBody({
  providerId: "google",
  modelName: "veo-omni-flash-vip",
  apiBaseUrl: "https://api.newtoken.club/v1",
  apiKey: "sk-test-key",
  prompt: "newtoken omni test",
  nodeId: "node",
  modelConfigId: "model",
  inputMode: "reference-to-video",
  duration: 10,
  aspectRatio: "16:9",
  resolution: "720p",
  generateCount: 1
}, {
  apiFamily: "omni_fast",
  mode: "reference_images_to_video",
  images: ["https://assets.example/ref-1.jpg", "https://assets.example/ref-2.jpg"],
  videos: [],
  audios: [],
  aspectRatio: "16:9",
  resolution: "720p",
  seconds: "10"
}) as Record<string, any>;
assert(newtokenOmniBody.model === "veo-omni-flash", "NewToken Omni should use the documented model id");
assert(newtokenOmniBody.duration === 10, "NewToken Omni should send numeric duration");
assert(Array.isArray(newtokenOmniBody.Ingredients_images) && newtokenOmniBody.Ingredients_images.length === 2, "NewToken Omni reference mode should send Ingredients_images exactly as documented");
assert(!("images" in newtokenOmniBody), "NewToken Omni reference mode should not send the generic images field first");
const newtokenOmniCandidates = relayCreateEndpointCandidates({
  providerId: "google",
  modelName: "veo-omni-flash-vip",
  apiBaseUrl: "https://api.newtoken.club/v1/videos/generations",
  apiKey: "sk-test-key",
  prompt: "newtoken omni test",
  nodeId: "node",
  modelConfigId: "model",
  inputMode: "reference-to-video",
  duration: 8,
  aspectRatio: "16:9",
  resolution: "720p",
  generateCount: 1,
  videoRequestConfig: {
    ...newtokenOmniConfig,
    baseUrl: "https://api.newtoken.club/v1/videos/generations",
    finalUrl: "https://api.newtoken.club/v1/videos/generations"
  }
} as never);
assert(newtokenOmniCandidates[0] === "https://api.newtoken.club/v1/videos", "Omni relay candidates should prefer /v1/videos even if an old bad endpoint was saved");
assert(!newtokenOmniCandidates.some((endpoint) => /\/v1\/videos\/generations$/i.test(endpoint)), "Omni relay candidates must not try the incompatible /v1/videos/generations path");
assert(!newtokenOmniCandidates.some((endpoint) => /\/v1\/video\/create$/i.test(endpoint)), "NewToken Omni must not fallback to /v1/video/create because its docs pin /v1/videos");
const genericOmniCandidates = relayCreateEndpointCandidates({
  providerId: "google",
  modelName: "omni-fast",
  apiBaseUrl: "https://ai.cy88.ai/v1",
  apiKey: "sk-test-key",
  prompt: "omni route cleanup",
  nodeId: "node",
  modelConfigId: "model",
  inputMode: "reference-to-video",
  duration: 10,
  aspectRatio: "9:16",
  resolution: "720p",
  generateCount: 1,
  videoRequestConfig: {
    ...newtokenOmniConfig,
    baseUrl: "https://ai.cy88.ai/v1",
    finalUrl: "https://ai.cy88.ai/v1/videos",
    apiFamily: "omni_fast"
  }
} as never);
assert(genericOmniCandidates.length === 1 && genericOmniCandidates[0] === "https://ai.cy88.ai/v1/videos", "Omni relays should only use the documented /v1/videos path");
assert(configuredRelayModelName({ modelName: "veo_3_1-fast", apiBaseUrl: "https://api.newtoken.club/v1" } as never) === "veo-3-1", "NewToken Veo should use the documented veo-3-1 model id");
const newtokenVeoBody = buildVeoProxyBody({
  endpoint: "https://api.newtoken.club/v1/videos",
  relayModel: "veo-3-1",
  images: ["https://assets.example/first-frame.jpg", "https://assets.example/last-frame.jpg"],
  requestAspectRatio: "9:16",
  requestResolution: "720p",
  requestSize: "720x1280",
  isOmni: false,
  params: {
    providerId: "google",
    modelName: "veo_3_1-fast",
    apiBaseUrl: "https://api.newtoken.club/v1",
    apiKey: "sk-test-key",
    prompt: "newtoken veo test",
    nodeId: "node",
    modelConfigId: "model",
    inputMode: "first-last-frame",
    videoMode: "image_to_video_first_last_frame",
    imageAssetIds: ["asset1", "asset2"],
    duration: 8,
    aspectRatio: "9:16",
    resolution: "720p",
    generateCount: 1
  }
}) as Record<string, any>;
assert(newtokenVeoBody.model === "veo-3-1", "NewToken Veo should use the documented body model");
assert(newtokenVeoBody.duration === 8, "NewToken Veo should send numeric duration");
assert(newtokenVeoBody.aspect_ratio === "9:16", "NewToken Veo should send aspect_ratio");
assert(Array.isArray(newtokenVeoBody.images) && newtokenVeoBody.images.length === 2, "NewToken Veo image modes should send images[]");
assert(!("input_reference" in newtokenVeoBody) && !("seconds" in newtokenVeoBody), "NewToken Veo should not mix generic relay compatibility aliases");
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
const repairedGrokReferenceConfig = resolveVideoRequestConfig({
  providerId: "grok",
  modelName: "grok-1.5-video-6s",
  apiBaseUrl: "https://ai.cy88.ai/v1",
  apiKey: "sk-test-key",
  prompt: "real person reference",
  nodeId: "node",
  modelConfigId: "model",
  inputMode: "reference-to-video",
  imageAssetIds: ["asset"],
  duration: 6,
  aspectRatio: "9:16",
  resolution: "720p",
  generateCount: 1
}, {
  inputModes: ["text-to-video"],
  channelCapability: {
    channel: "proxy",
    apiFamily: "openai_videos",
    supportedInputs: ["text"],
    imageTransport: "unsupported"
  }
});
assert(repairedGrokReferenceConfig.supportedInputs.includes("reference_image"), "Known Grok video channels should repair stale text-only reference capabilities");
assert(repairedGrokReferenceConfig.imageTransport !== "unsupported", "Known Grok video channels should restore a usable image transport");
const normalizedGrokVideo3 = normalizeVideoCapabilities({
  inputModes: ["text-to-video", "image-to-video", "reference-to-video", "video-to-video"],
  supportedInputs: ["text", "image", "reference_image", "video"],
  modelCapability: {
    model: "grok-video-3",
    supportsTextToVideo: true,
    supportsImageToVideo: true,
    supportsReferenceToVideo: true,
    supportsVideoToVideo: true
  },
  channelCapability: {
    apiFamily: "grok_video",
    supportedInputs: ["text", "image", "reference_image", "video"],
    imageTransport: "multipart_file",
    videoTransport: "multipart_file"
  } as any,
  duration: { type: "range", min: 1, max: 15, step: 1 },
  aspectRatios: ["16:9", "9:16"],
  resolutions: ["720P", "1080P"]
}, "grok", "grok-video-3");
const normalizedGrokVideo3Options = calculateAvailableVideoOptions(normalizedGrokVideo3, {
  inputMode: "video-to-video",
  videoMode: "video_to_video",
  selectedDuration: 10,
  selectedAspectRatio: "9:16",
  selectedResolution: "720P",
  hasImageInput: true,
  hasVideoInput: true,
  hasReferenceImage: true,
  hasFirstLastFrame: false
});
assert(!normalizedGrokVideo3Options.availableInputModes.includes("video-to-video"), "Duoyuan Grok Video 3 UI options must not expose undocumented video-to-video generation");
assert(normalizedGrokVideo3Options.availableInputModes.includes("reference-to-video"), "Duoyuan Grok Video 3 should keep documented multi-image reference generation");
assert(normalizedGrokVideo3Options.availableInputModes.includes("first-last-frame"), "Duoyuan Grok Video 3 should keep documented first/last-frame generation");
const normalizedGrokImagine = normalizeVideoCapabilities({
  inputModes: ["text-to-video", "reference-to-video"],
  supportedInputs: ["text", "reference_image"],
  modelCapability: {
    model: "grok-imagine-video",
    supportsTextToVideo: true,
    supportsReferenceToVideo: true,
    supportsVideoToVideo: true
  },
  channelCapability: {
    supportedInputs: ["text", "reference_image", "video"],
    imageTransport: "base64_json",
    videoTransport: "base64_json"
  } as any
}, "grok", "grok-imagine-video");
const normalizedGrokImagineOptions = calculateAvailableVideoOptions(normalizedGrokImagine, {
  inputMode: "video-to-video",
  videoMode: "video_to_video",
  hasImageInput: true,
  hasVideoInput: true,
  hasReferenceImage: true,
  hasFirstLastFrame: false
});
assert(normalizedGrokImagineOptions.availableInputModes.includes("video-to-video"), "Official-style Grok Imagine capabilities should not be restricted by Duoyuan Grok Video 3 rules");

const upstreamOwnedCapabilities = normalizeVideoCapabilities({
  capabilitySource: "upstream",
  upstreamModelId: "vendor-video-exact-id",
  inputModes: ["text-to-video"],
  supportedInputs: ["text"],
  imageTransport: "unsupported",
  modelCapability: { model: "vendor-video-exact-id", supportsTextToVideo: true }
}, "grok", "vendor-video-exact-id");
assert(upstreamOwnedCapabilities.inputModes.length === 1 && upstreamOwnedCapabilities.inputModes[0] === "text-to-video", "upstream-owned capabilities must not be widened by local model heuristics");
assert(upstreamOwnedCapabilities.modelCapability?.model === "vendor-video-exact-id", "upstream-owned model ids must remain exact");

const repairedSeedanceReferenceConfig = resolveVideoRequestConfig({
  providerId: "seedance",
  modelName: "doubao-seedance-2-0-fast-260128",
  apiBaseUrl: "https://ai.cy88.ai/v1",
  apiKey: "sk-test-key",
  prompt: "omni reference",
  nodeId: "node",
  modelConfigId: "model",
  inputMode: "video-to-video",
  videoAssetIds: ["video"],
  duration: 7,
  aspectRatio: "9:16",
  resolution: "720P",
  generateCount: 1
}, {
  inputModes: ["text-to-video", "image-to-video"],
  channelCapability: {
    channel: "proxy",
    apiFamily: "seedance2_native",
    supportedInputs: ["text", "image"],
    imageTransport: "url_or_asset",
    videoTransport: "unsupported"
  }
});
assert(repairedSeedanceReferenceConfig.supportedInputs.includes("reference_image"), "Seedance 2 should repair stale reference-image capabilities");
assert(repairedSeedanceReferenceConfig.supportedInputs.includes("video"), "Seedance 2 should restore video-reference capability");
assert(repairedSeedanceReferenceConfig.videoTransport === "url_or_asset", "Seedance 2 should send uploaded video assets by asset/public URL");
const configurableOpenAiVideosBody = buildProxyBody({
  providerId: "grok",
  modelName: "grok-video-proxy",
  apiBaseUrl: "https://relay.example/v1/videos",
  apiKey: "sk-test-key",
  prompt: "test",
  nodeId: "node",
  modelConfigId: "model",
  inputMode: "image-to-video",
  imageAssetIds: ["asset"],
  duration: 4,
  aspectRatio: "16:9",
  resolution: "480P",
  generateCount: 1,
  videoRequestConfig: configurableOpenAiVideos
}, {
  apiFamily: "openai_videos",
  mode: "reference_images_to_video",
  images: ["data:image/png;base64,abc"],
  videos: [],
  audios: [],
  aspectRatio: "16:9",
  resolution: "480P",
  seconds: "4"
}) as Record<string, any>;
assert(configurableOpenAiVideosBody.width === 854, "Configured /v1/videos body should include mapped width for relays that require dimensions");
assert(configurableOpenAiVideosBody.height === 480, "Configured /v1/videos body should include mapped height for relays that require dimensions");
assert(configurableOpenAiVideosBody.size === "854x480", "Configured /v1/videos body should include relay-compatible widthxheight size");
assert(configurableOpenAiVideosBody.dimensions === "854x480", "Configured /v1/videos body should include relay-compatible dimensions");
assert(configurableOpenAiVideosBody.duration === 4, "Configured /v1/videos body should include numeric duration");
assert(configurableOpenAiVideosBody.watermark === false, "Configured /v1/videos body should disable watermark at top level");
assert((configurableOpenAiVideosBody.metadata as any).watermark === false, "Configured /v1/videos body should disable watermark in metadata");
assert((configurableOpenAiVideosBody.metadata as any).generate_audio === true, "Configured /v1/videos body should request native audio in metadata");
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
const normalizedOmniV2v = normalizeVideoCapabilities({
  inputModes: ["text-to-video", "image-to-video", "reference-to-video", "video-to-video"],
  supportedInputs: ["text", "image", "reference_image", "video"],
  modelCapability: {
    supportsImageToVideo: true,
    supportsFirstLastFrame: true,
    supportsVideoToVideo: true
  },
  channelCapability: {
    inputModes: ["first-last-frame", "video-to-video"],
    supportedInputs: ["first_last_frame", "video"],
    videoTransport: "url_or_base64_json"
  } as any,
  duration: { type: "enum", values: [4, 6, 8, 10] },
  supportedDurations: [4, 6, 8, 10],
  videoTransport: "url_or_base64_json"
}, "openai-video", "omni-fast-v2v");
const normalizedOmniV2vOptions = calculateAvailableVideoOptions(normalizedOmniV2v, {
  inputMode: "first-last-frame",
  videoMode: "image_to_video_first_last_frame",
  selectedDuration: 8,
  selectedAspectRatio: "9:16",
  selectedResolution: "720p",
  hasImageInput: true,
  hasVideoInput: true,
  hasReferenceImage: true,
  hasFirstLastFrame: true
});
assert(omniV2vConfig.apiFamily === "omni_fast_v2v", "Omni-fast-v2v should use its video reference family");
assert(omniV2vConfig.videoField === "video", "Omni-fast-v2v should send the video field");
assert(omniV2vConfig.videoTransport === "url_or_base64_json", "Omni-fast-v2v should preserve video transport");
const normalizedOmniFast = normalizeVideoCapabilities({
  inputModes: ["text-to-video", "image-to-video", "reference-to-video", "video-to-video"],
  supportedInputs: ["text", "image", "reference_image", "video"],
  modelCapability: {
    supportsTextToVideo: true,
    supportsImageToVideo: true,
    supportsReferenceToVideo: true,
    supportsFirstLastFrame: true,
    supportsVideoToVideo: true
  },
  channelCapability: {
    apiFamily: "omni_fast",
    supportedInputs: ["text", "image", "reference_image", "video"],
    imageTransport: "url",
    videoTransport: "url_or_base64_json"
  } as any,
  duration: { type: "enum", values: [4, 8, 10] },
  supportedDurations: [4, 8, 10]
}, "openai-video", "omni-fast");
const normalizedOmniFastOptions = calculateAvailableVideoOptions(normalizedOmniFast, {
  inputMode: "video-to-video",
  videoMode: "video_to_video",
  selectedDuration: 8,
  selectedAspectRatio: "9:16",
  selectedResolution: "720p",
  hasImageInput: true,
  hasVideoInput: true,
  hasReferenceImage: true,
  hasFirstLastFrame: true
});
assert(!normalizedOmniFastOptions.availableInputModes.includes("video-to-video"), "Omni-fast UI options must not expose omni-fast-v2v-only video-to-video");
assert(normalizedOmniFastOptions.availableDurations.length === 1 && normalizedOmniFastOptions.availableDurations[0] === 10, "Omni-fast should expose only fixed 10s duration");
assert(normalizedOmniV2v.inputModes?.length === 1 && normalizedOmniV2v.inputModes[0] === "video-to-video", "Omni-fast-v2v must only expose video-to-video");
assert(normalizedOmniV2v.supportedInputs?.length === 1 && normalizedOmniV2v.supportedInputs[0] === "video", "Omni-fast-v2v must only accept video input");
assert(normalizedOmniV2v.supportedDurations?.length === 1 && normalizedOmniV2v.supportedDurations[0] === 10, "Omni-fast-v2v normalized capability should be fixed at 10 seconds");
assert(normalizedOmniV2vOptions.availableInputModes.length === 1 && normalizedOmniV2vOptions.availableInputModes[0] === "video-to-video", "Omni-fast-v2v UI options must not show first/last-frame video");
assert(normalizedOmniV2vOptions.availableVideoModes?.join(",") === "video_extension,video_edit", "Omni-fast-v2v should expose video extension/edit modes instead of generic unsupported mode");
assert(normalizedOmniV2vOptions.normalizedSelection.inputMode === "video-to-video", "Omni-fast-v2v should normalize stale first/last selections back to video-to-video");
assert(normalizedOmniV2vOptions.normalizedSelection.videoMode === "video_extension", "Omni-fast-v2v should default video input to video extension");
assert(omniV2vConfig.supportedInputs.length === 1 && omniV2vConfig.supportedInputs[0] === "video", "Omni-fast-v2v must only accept video input");
assert(omniV2vConfig.supportedDurations.length === 1 && omniV2vConfig.supportedDurations[0] === 10, "Omni-fast-v2v should be fixed at 10 seconds");
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
assert(runApiBody.duration === 8, "RunAPI video create should send numeric duration");
assert(runApiBody.size === "720P", "RunAPI video create should send size");
const runApiOmniFlashBody = buildProxyBody({
  providerId: "google",
  modelName: "omni_flash-10s",
  apiBaseUrl: "https://runapi.co/v1",
  apiKey: "sk-test-key",
  prompt: "omni flash test",
  projectId: "project",
  nodeId: "node",
  modelConfigId: "model",
  inputMode: "reference-to-video",
  imageAssetIds: ["asset"],
  duration: 10,
  aspectRatio: "9:16",
  resolution: "720p",
  generateCount: 1
}, {
  apiFamily: "unified_video_create",
  mode: "reference_images_to_video",
  images: ["https://assets.example/omni-1.png", "https://assets.example/omni-2.png"],
  videos: [],
  audios: [],
  aspectRatio: "9:16",
  resolution: "720p",
  seconds: "10"
}) as Record<string, any>;
assert(runApiOmniFlashBody.model === "omni-flash", "RunAPI Omni Flash must use the documented omni-flash model name");
assert(runApiOmniFlashBody.aspect_ratio === "9:16", "RunAPI Omni Flash should preserve the selected portrait ratio");
assert(runApiOmniFlashBody.images[0] === "https://assets.example/omni-1.png", "RunAPI Omni Flash should send reference images as URL strings");
const runApiConfig = resolveVideoRequestConfig({
  providerId: "google",
  modelName: "veo3.1-fast",
  apiBaseUrl: "https://runapi.co",
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
  duration: { type: "enum", values: [4, 6, 8] }
});
assert(runApiConfig.finalUrl === "https://runapi.co/v1/video/create", "RunAPI should submit video tasks to /v1/video/create");
assert(runApiConfig.pollEndpoint === "/v1/videos/{taskId}", "RunAPI should query video tasks through /v1/videos/{taskId}");
const soraConfig = resolveVideoRequestConfig({
  providerId: "openai-video",
  modelName: "sora-2",
  apiBaseUrl: "https://llm.guohe-sh.com/api/openai/v1",
  apiKey: "sk-test-key",
  prompt: "test",
  projectId: "project",
  nodeId: "node",
  modelConfigId: "model",
  inputMode: "text-to-video",
  duration: 4,
  aspectRatio: "9:16",
  resolution: "720p",
  generateCount: 1
}, {
  inputModes: ["text-to-video"],
  aspectRatios: ["16:9", "9:16"],
  resolutions: ["720p", "1080p"],
  duration: { type: "enum", values: [4, 8, 12] },
  provider: "sora",
  channel: "proxy",
  apiFamily: "openai_videos",
  createEndpoint: "/v1/videos",
  pollEndpoint: "/v1/videos/{taskId}",
  authType: "api-key",
  requestFormat: "multipart",
  supportedInputs: ["text"],
  imageTransport: "unsupported"
});
assert(soraConfig.finalUrl === "https://llm.guohe-sh.com/api/openai/v1/videos", "Sora 2 should submit to the documented /v1/videos endpoint");
assert(soraConfig.authType === "api-key", "Sora 2 should use the documented api-key auth header");
assert(soraConfig.requestFormat === "multipart", "Sora 2 should use multipart form data");
const soraForm = buildOpenAiVideosMultipart({
  providerId: "openai-video",
  modelName: "sora-2",
  apiBaseUrl: "https://llm.guohe-sh.com/api/openai/v1",
  apiKey: "sk-test-key",
  prompt: "A video of a cool cat on a motorcycle in the night",
  nodeId: "node",
  modelConfigId: "model",
  inputMode: "text-to-video",
  duration: 4,
  aspectRatio: "9:16",
  resolution: "720p",
  generateCount: 1,
  videoRequestConfig: soraConfig
}, {
  aspectRatio: "9:16",
  resolution: "720p",
  seconds: "4"
});
assert(soraForm.get("model") === "sora-2", "Sora 2 multipart body should send model=sora-2");
assert(soraForm.get("seconds") === "4", "Sora 2 multipart body should send seconds as a form field");
assert(soraForm.get("size") === "720x1280", "Sora 2 9:16 720p should map to size=720x1280");
assert(modelCatalog.some((item) => item.id === "openai-sora-2" && item.name === "sora-2"), "Sora 2 catalog entry should be available");
const staleRunApiGrokConfig = resolveVideoRequestConfig({
  providerId: "grok",
  modelName: "grok-video-3",
  apiBaseUrl: "https://runapi.co/v1",
  apiKey: "sk-test-key",
  prompt: "test",
  nodeId: "node",
  modelConfigId: "model",
  inputMode: "reference-to-video",
  imageAssetIds: ["asset"],
  duration: 8,
  aspectRatio: "9:16",
  resolution: "720p",
  generateCount: 1
}, {
  inputModes: ["text-to-video", "reference-to-video"],
  apiFamily: "grok_video",
  requestFormat: "multipart",
  imageTransport: "multipart_file",
  supportedInputs: ["text", "image", "reference_image"]
});
assert(staleRunApiGrokConfig.apiFamily === "unified_video_create", "RunAPI should override stale Grok apiFamily with the unified video protocol");
assert(staleRunApiGrokConfig.requestFormat === "json", "RunAPI Grok should use the unified JSON request format");
assert(staleRunApiGrokConfig.imageTransport === "url", "RunAPI Grok should pass reference images by URL");
const runApiVeoFallbackConfig = resolveVideoRequestConfig({
  providerId: "custom-video",
  modelName: "veo-3.1-fast",
  apiBaseUrl: "https://runapi.co",
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
  inputModes: ["text-to-video"],
  supportedInputs: ["text"],
  imageTransport: "unsupported",
  aspectRatios: ["16:9", "9:16"],
  resolutions: ["720p"],
  duration: { type: "enum", values: [4, 6, 8] }
});
assert(runApiVeoFallbackConfig.supportedInputs.includes("image"), "Veo-like relay models should expose image input even when old custom config was text-only");
assert(runApiVeoFallbackConfig.supportedInputs.includes("reference_image"), "Veo-like relay models should expose reference image input");
assert(runApiVeoFallbackConfig.imageTransport === "url", "Veo-like RunAPI relay should use URL image transport after normalization");
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
assert(modelCatalog.some((item) => item.name === "grok-video-3-10s"), "Relay Grok Video 3 10s model should be available");
assert(modelCatalog.some((item) => item.name === "grok-video-3-15s"), "Relay Grok Video 3 15s model should be available");
assert(modelCatalog.some((item) => item.name === "grok-1.5-video-6s"), "Relay Grok 1.5 Video 6s model should be available");
assert(modelCatalog.some((item) => item.name === "grok-1.5-video-10s"), "Relay Grok 1.5 Video 10s model should be available");
assert(modelCatalog.some((item) => item.name === "grok-1.5-video-15s"), "Relay Grok 1.5 Video 15s model should be available");
assert(modelCatalog.some((item) => item.name === "omni-fast-v2v" && item.modelType === "video-to-video"), "omni-fast-v2v relay model should be available as a video-to-video catalog entry");

const omniFastV2vConfig = resolveVideoRequestConfig({
  providerId: "openai-video",
  modelName: "omni-fast-v2v",
  apiBaseUrl: "https://duoyuanx.com",
  apiKey: "sk-test-key",
  prompt: "test",
  projectId: "project",
  nodeId: "node",
  modelConfigId: "model",
  inputMode: "video-to-video",
  videoAssetIds: ["asset"],
  duration: 10,
  aspectRatio: "9:16",
  resolution: "720p",
  generateCount: 1
}, {
  inputModes: ["video-to-video"],
  supportedInputs: ["video"],
  apiFamily: "omni_fast_v2v",
  imageTransport: "unsupported",
  videoTransport: "url_or_base64_json",
  duration: { type: "fixed", value: 10 },
  aspectRatios: ["16:9", "9:16"],
  resolutions: ["720p", "1080p", "4k"]
});
assert(omniFastV2vConfig.apiFamily === "omni_fast_v2v", "omni-fast-v2v should keep the documented v2v protocol family");
assert(omniFastV2vConfig.createEndpoint === "/v1/videos", "omni-fast-v2v should submit through POST /v1/videos");
assert(omniFastV2vConfig.supportedDurations.join(",") === "10", "omni-fast-v2v should be fixed at 10s");
assert(omniFastV2vConfig.supportedInputs.join(",") === "video", "omni-fast-v2v should only expose video input");

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
const grokRelay10s = getVideoModelCapability("grok", "grok-video-3-10s", "grok-video-3-10s", "reference_images_to_video");
assert(grokRelay10s?.supportedDurations.join(",") === "10", "Relay Grok Video 3 10s should be fixed at 10s");
const grokRelay15sFixed = getVideoModelCapability("grok", "grok-video-3-15s", "grok-video-3-15s", "reference_images_to_video");
assert(grokRelay15sFixed?.supportedDurations.join(",") === "15", "Relay Grok Video 3 15s should be fixed at 15s");
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
assert(
  !seedanceAssetUploadShouldFallback(new ProviderError("SEEDANCE_ASSET_UPLOAD_FAILED", "Seedance 素材库接口调用失败：Asset provider error", "{\"message\":\"Asset provider error\"}", { upstreamStatus: 502 })),
  "Seedance asset upload should not bypass the asset library on relay asset provider 5xx"
);
assert(
  !seedanceAssetUploadShouldFallback(new ProviderError("SEEDANCE_ASSET_UPLOAD_FAILED", "Seedance 素材库接口调用失败：Asset provider error", "{\"state\":0,\"data\":null}", { upstreamStatus: 200 })),
  "Seedance asset upload should not silently bypass the asset library when the relay returns a business failure"
);
assert(
  seedanceAssetUploadShouldFallback(new ProviderError("SEEDANCE_ASSET_UPLOAD_FAILED", "Seedance 素材库接口调用失败：not found", "{\"message\":\"not found\"}", { upstreamStatus: 404 })),
  "Seedance asset upload may fall back only when the relay does not provide an asset endpoint"
);
assert(
  seedanceAssetUploadShouldFallback(new ProviderError("SEEDANCE_ASSET_UPLOAD_FAILED", "Seedance 素材库接口调用失败：This token has no access to model seedance-asset", "{\"message\":\"This token has no access to model seedance-asset\"}", { upstreamStatus: 403 })),
  "Seedance asset upload should fall back to public URLs when the current relay key has no seedance-asset permission"
);
assert(
  seedanceAssetUploadShouldFallback(new ProviderError("SEEDANCE_ASSET_UPLOAD_FAILED", "Seedance 素材库接口调用失败：分组 auto 下模型 seedance-asset 的可用渠道不存在 (retry)", "{\"message\":\"分组 auto 下模型 seedance-asset 的可用渠道不存在 (retry)\"}", { upstreamStatus: 400 })),
  "Seedance asset upload should fall back when the relay auto group has no seedance-asset channel"
);
assert(
  seedanceAssetUploadShouldFallback(new ProviderError("SEEDANCE_ASSET_UPLOAD_FAILED", "Seedance 素材库接口调用失败：fail_to_fetch_task", "{\"model\":\"seedance-asset\",\"status_code\":502,\"code\":\"fail_to_fetch_task\"}", { upstreamStatus: 502 })),
  "Seedance asset upload should fall back when seedance-asset task fetching is unstable"
);
assert(
  isRetryableSeedancePollFailure(new Response("{}", { status: 502 }), { code: "fail_to_fetch_task", message: "fail to fetch task" }),
  "Seedance poll should keep waiting when the relay returns fail_to_fetch_task with HTTP 502"
);
assert(
  isRetryableSeedancePollFailure(new Response("{}", { status: 200 }), { status_code: 502, code: "fail_to_fetch_task", message: "fail to fetch task" }),
  "Seedance poll should keep waiting when the relay wraps fail_to_fetch_task inside a 200 JSON body"
);
assert(
  isRetryableSeedancePollFailure(new Response("{}", { status: 400 }), { message: "Panic detected, error: assignment to entry in nil map. Please contact us" }),
  "Seedance poll should keep waiting when the relay query endpoint returns a transient server panic"
);
const seedanceNativeBody = buildProxyBody({
  modelName: "doubao-seedance-2-0-260128",
  prompt: "介绍这款产品",
  apiBaseUrl: "https://duoyuanx.com/v1",
  apiKey: "sk-test"
} as never, {
  apiFamily: "seedance2_native",
  mode: "reference_images_to_video",
  images: ["asset://asset-demo"],
  videos: [],
  audios: [],
  aspectRatio: "16:9",
  resolution: "720p",
  seconds: "10"
});
const seedanceNativeRecord = seedanceNativeBody as Record<string, unknown>;
assert((seedanceNativeRecord.metadata as Record<string, unknown>).watermark === false, "Seedance 2.0 native payload should disable watermark explicitly");
assert((seedanceNativeRecord.metadata as Record<string, unknown>).generate_audio === true, "Seedance 2.0 native payload should request audio generation explicitly");
assert(Array.isArray(seedanceNativeRecord.content) && JSON.stringify(seedanceNativeRecord.content).includes("asset://asset-demo"), "Seedance 2.0 native payload should keep asset:// references");
const seedance15Multipart = buildSeedance15Multipart({
  modelName: "doubao-seedance-1-5-pro",
  prompt: "介绍这款产品",
  apiBaseUrl: "https://example.com/v1",
  apiKey: "sk-test"
} as never, {
  files: [],
  aspectRatio: "16:9",
  resolution: "720p",
  seconds: "5"
});
assert(seedance15Multipart.get("watermark") === "false", "Seedance 1.5 multipart payload should disable watermark explicitly");

const klingLegacy = getVideoModelCapability("kling", "kling-1-6", "kling-v1-6", "image_to_video_first_frame");
assert(klingLegacy?.supportedDurations.join(",") === "5,10", "Kling 1.6 should be available with official durations");

const klingTurbo = getVideoModelCapability("kling", "kling-2-5", "kling-v2-5-turbo", "reference_images_to_video");
assert(!klingTurbo, "Kling 2.5 Turbo should not advertise reference-image mode");
const klingTurboText = getVideoModelCapability("kling", "kling-2-5", "kling-v2-5-turbo", "text_to_video");
assert(klingTurboText?.supportedDurations.join(",") === "5,10", "Kling 2.5 Turbo should stay on 5s and 10s durations");

const agnesCapabilities = normalizeVideoCapabilities({ inputModes: ["text-to-video"] }, "agnes", "agnes-video-v2.0");
const agnesConfig = resolveVideoRequestConfig({
  providerId: "agnes",
  modelName: "agnes-video-v2.0",
  apiBaseUrl: "https://apihub.agnes-ai.com",
  apiKey: "test",
  prompt: "test",
  inputMode: "image-to-video",
  imageAssetIds: ["asset-1"],
  duration: 5,
  aspectRatio: "9:16",
  resolution: "720p"
} as never, agnesCapabilities);
assert(agnesConfig.apiFamily === "agnes_video", "Agnes official route should use the Agnes API family");
assert(agnesConfig.finalUrl === "https://apihub.agnes-ai.com/v1/videos", "Agnes create endpoint should match the official API");
assert(agnesConfig.pollEndpoint === "/agnesapi?video_id={taskId}", "Agnes polling should use video_id");
assert(agnesConfig.imageTransport === "url", "Agnes image inputs should use public URLs");
const agnesStaleTransportConfig = resolveVideoRequestConfig({
  providerId: "openai-video",
  modelName: "agnes-video-v2.0",
  apiBaseUrl: "https://apihub.agnes-ai.com",
  apiKey: "test",
  prompt: "test",
  inputMode: "reference-to-video",
  imageAssetIds: ["asset-1"],
  duration: 5,
  aspectRatio: "9:16",
  resolution: "720p"
} as never, normalizeVideoCapabilities({
  inputModes: ["reference-to-video"],
  imageTransport: "base64_json",
  channelCapability: { imageTransport: "base64_json" }
}, "openai-video", "agnes-video-v2.0"));
assert(agnesStaleTransportConfig.apiFamily === "agnes_video", "Agnes host/model should still infer the Agnes API family from stale relay configs");
assert(agnesStaleTransportConfig.imageTransport === "url", "Agnes official route must override stale base64 image transport");
const agnesBody = buildProxyBody({ modelName: "agnes-video-v2.0", prompt: "test", apiBaseUrl: "https://apihub.agnes-ai.com", apiKey: "test" } as never, {
  apiFamily: "agnes_video",
  mode: "reference_images_to_video",
  images: ["https://example.com/1.png", "https://example.com/2.png"],
  videos: [],
  audios: [],
  aspectRatio: "9:16",
  resolution: "720p",
  seconds: "5"
}) as Record<string, unknown>;
assert((agnesBody.extra_body as Record<string, unknown>).image instanceof Array, "Agnes multi-image input should use extra_body.image");
assert(Number(agnesBody.num_frames) <= 441 && (Number(agnesBody.num_frames) - 1) % 8 === 0, "Agnes num_frames must satisfy the official 8n+1 limit");

const zhipuCapabilities = normalizeVideoCapabilities({ inputModes: ["text-to-video"] }, "zhipu", "cogvideox-3");
const zhipuConfig = resolveVideoRequestConfig({
  providerId: "zhipu",
  modelName: "cogvideox-3",
  apiBaseUrl: "https://open.bigmodel.cn/api/paas/v4",
  apiKey: "test",
  prompt: "test",
  inputMode: "image-to-video",
  imageAssetIds: ["asset-1"],
  duration: 5,
  aspectRatio: "9:16",
  resolution: "720p"
} as never, zhipuCapabilities);
assert(zhipuConfig.apiFamily === "zhipu_video", "Zhipu official route should use the Zhipu API family");
assert(zhipuConfig.finalUrl === "https://open.bigmodel.cn/api/paas/v4/videos/generations", "Zhipu video create endpoint should match the official API");
assert(zhipuConfig.pollEndpoint === "/async-result/{taskId}", "Zhipu polling should use the official async-result endpoint");
const zhipuBody = buildProxyBody({ modelName: "cogvideox-3", prompt: "test", apiBaseUrl: "https://open.bigmodel.cn/api/paas/v4", apiKey: "test" } as never, {
  apiFamily: "zhipu_video",
  mode: "image_to_video_first_frame",
  images: ["https://example.com/1.png"],
  videos: [],
  audios: [],
  aspectRatio: "9:16",
  resolution: "720p",
  seconds: "5"
}) as Record<string, unknown>;
assert(zhipuBody.image_url === "https://example.com/1.png", "Zhipu image-to-video should use image_url");
assert(zhipuBody.size === "720x1280", "Zhipu CogVideoX portrait 720p should use 720x1280");
assert(isZhipuOfficialEndpoint("https://open.bigmodel.cn/api/paas/v4/async/images/generations"), "Zhipu full endpoints should be recognized as official");
assert(normalizeZhipuBaseUrl("https://open.bigmodel.cn/api/paas/v4/async/images/generations") === "https://open.bigmodel.cn/api/paas/v4", "Zhipu full endpoints should normalize to the official base URL");
assert(zhipuImageGenerationEndpointCandidates("https://open.bigmodel.cn/api/paas/v4")[0] === "https://open.bigmodel.cn/api/paas/v4/images/generations", "Zhipu image generation should keep the existing official endpoint first");
assert(zhipuImageGenerationEndpointCandidates("https://open.bigmodel.cn/api/paas/v4").includes("https://open.bigmodel.cn/api/paas/v4/async/images/generations"), "Zhipu image generation should add the async image path as a fallback");
assert(zhipuImageGenerationEndpointCandidates("https://open.bigmodel.cn/api/paas/v4/async/images/generations")[0] === "https://open.bigmodel.cn/api/paas/v4/async/images/generations", "Zhipu full async image endpoints should be respected when pasted");
assert(isZhipuImageModel("glm-image") && zhipuImageModels.length === 4 && zhipuVideoModels.includes("viduq2") && zhipuVideoModels.length === 10, "Zhipu official model directories should be complete");

console.log("[test:video-provider-adapters] ok");
