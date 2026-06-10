import { grokCreateEndpoint, grokPollEndpoint } from "../services/providers/grokVideo.service.js";
import { klingBearerToken, klingCreateEndpoint } from "../services/providers/klingVideo.service.js";
import { getVideoModelCapability } from "../config/videoModelCapabilities.js";
import { modelCatalog } from "../services/modelCatalog.js";

function assert(condition: unknown, message: string): asserts condition {
  if (!condition) throw new Error(message);
}

assert(
  grokCreateEndpoint("https://api.x.ai/v1") === "https://api.x.ai/v1/videos/generations",
  "Grok create endpoint should append /videos/generations"
);
assert(
  grokPollEndpoint("https://api.x.ai/v1", "request/1") === "https://api.x.ai/v1/videos/request%2F1",
  "Grok poll endpoint should encode request id"
);
assert(
  klingCreateEndpoint("https://api.klingai.com", "text_to_video") === "https://api.klingai.com/v1/videos/text2video",
  "Kling text endpoint should be resolved"
);
assert(
  klingCreateEndpoint("https://relay.example/v1", "reference_images_to_video") === "https://relay.example/v1/videos/multi-image2video",
  "Kling relay base ending in /v1 should not duplicate version"
);

const token = klingBearerToken("access-key:secret-key", 1_700_000_000);
const parts = token.split(".");
assert(parts.length === 3, "Kling AK/SK should produce a JWT");
const payload = JSON.parse(Buffer.from(parts[1]!, "base64url").toString("utf8")) as Record<string, unknown>;
assert(payload.iss === "access-key", "Kling JWT issuer should use AccessKey");
assert(klingBearerToken("relay-token") === "relay-token", "Kling relay Bearer token should pass through");
assert(!modelCatalog.some((item) => item.name === "grok-imagine-fast"), "Unpublished Grok Imagine Fast entry should be removed");

const grokReference = getVideoModelCapability("grok", "grok-imagine-video", "grok-imagine-video", "reference_images_to_video");
assert(grokReference?.supportedResolutions.join(",") === "480p,720p", "Grok should expose official 480p and 720p resolutions");
assert(grokReference?.supportedModes.some((mode) => mode.mode === "video_edit"), "Grok should support video editing");
assert(grokReference?.supportedModes.some((mode) => mode.mode === "video_extension"), "Grok should support video extension");

const klingReference = getVideoModelCapability("kling", "kling-3-0", "kling-v3-omni", "reference_images_to_video");
assert(klingReference?.supportedModes.some((mode) => mode.mode === "image_to_video_first_last_frame"), "Kling should expose first/last frame mode");
assert(klingReference?.maxReferenceImages === 4, "Kling reference mode should allow up to four images");

console.log("[test:video-provider-adapters] ok");
