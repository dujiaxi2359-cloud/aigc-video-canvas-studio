import { grokCreateEndpoint, grokPollEndpoint, grokRequestModelName, isOfficialGrokEndpoint } from "../services/providers/grokVideo.service.js";
import { klingBearerToken, klingCreateEndpoint, klingPollEndpoint, normalizeKlingPrompt } from "../services/providers/klingVideo.service.js";
import { seedanceCreateEndpoint, seedancePollEndpoint } from "../services/providers/seedanceVideo.service.js";
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
  grokRequestModelName("grok-imagine-video", "https://relay.example/v1") === "grok-video-3",
  "Relay Grok endpoint should map official model names to the generic relay model"
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
  seedancePollEndpoint("https://relay.example/v1/videos", "task/1") === "https://relay.example/v1/videos/task%2F1",
  "Seedance unified relay videos endpoint should also be the polling base"
);
assert(
  seedanceCreateEndpoint("https://relay.example/v1") === "https://relay.example/v1/video/generations",
  "Seedance relay base should append the compatible create path"
);
assert(
  seedancePollEndpoint("https://relay.example/v1/video/generations", "task/1") === "https://relay.example/v1/video/generations/task%2F1",
  "Seedance relay poll endpoint should append encoded task id"
);
assert(
  seedanceCreateEndpoint("POST https://relay.example/v1/video/generations") === "https://relay.example/v1/video/generations",
  "Seedance endpoint should ignore a pasted HTTP method prefix"
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
assert(grokReference?.supportedDurations[0] === 3, "Grok should start at 3s duration");
assert(grokReference?.supportedDurations.at(-1) === 15, "Grok should end at 15s duration");
const grokPreview = getVideoModelCapability("grok", "grok-imagine-video-1-5-preview", "grok-imagine-video-1.5-preview", "reference_images_to_video");
assert(grokPreview?.supportedDurations.includes(10), "Grok Imagine Video 1.5 Preview should expose official-style durations");
const grokRelay = getVideoModelCapability("grok", "grok-video-3", "grok-video-3", "reference_images_to_video");
assert(grokRelay?.supportedDurations[0] === 3, "Relay Grok Video 3 should start at 3s duration");
assert(grokRelay?.supportedDurations.at(-1) === 15, "Relay Grok Video 3 should end at 15s duration");
const grokRelayPro = getVideoModelCapability("grok", "grok-video-3-pro", "grok-video-3-pro", "reference_images_to_video");
assert(grokRelayPro?.supportedDurations.join(",") === "10", "Relay Grok Video 3 Pro should be fixed at 10s");
const grokRelayMax = getVideoModelCapability("grok", "grok-video-3-max", "grok-video-3-max", "reference_images_to_video");
assert(grokRelayMax?.supportedDurations.join(",") === "15", "Relay Grok Video 3 Max should be fixed at 15s");
const grokRelay15s = getVideoModelCapability("grok", "grok-1-5-video-15s", "grok-1.5-video-15s", "reference_images_to_video");
assert(grokRelay15s?.supportedDurations.join(",") === "15", "Relay Grok 1.5 Video 15s should be fixed at 15s");

const klingReference = getVideoModelCapability("kling", "kling-3-0", "kling-v3-omni", "reference_images_to_video");
assert(klingReference?.supportedModes.some((mode) => mode.mode === "image_to_video_first_last_frame"), "Kling should expose first/last frame mode");
assert(klingReference?.maxReferenceImages === 4, "Kling reference mode should allow up to four images");
assert(klingReference?.supportedDurations.join(",") === "5,10,15", "Kling 3.0 should expose 5s, 10s, and 15s durations");

const klingLegacy = getVideoModelCapability("kling", "kling-1-6", "kling-v1-6", "image_to_video_first_frame");
assert(klingLegacy?.supportedDurations.join(",") === "5,10", "Kling 1.6 should be available with official durations");

const klingTurbo = getVideoModelCapability("kling", "kling-2-5", "kling-v2-5-turbo", "reference_images_to_video");
assert(!klingTurbo, "Kling 2.5 Turbo should not advertise reference-image mode");
const klingTurboText = getVideoModelCapability("kling", "kling-2-5", "kling-v2-5-turbo", "text_to_video");
assert(klingTurboText?.supportedDurations.join(",") === "5,10", "Kling 2.5 Turbo should stay on 5s and 10s durations");

console.log("[test:video-provider-adapters] ok");
