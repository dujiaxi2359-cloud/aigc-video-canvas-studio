import { videoModelCapabilities } from "../config/videoModelCapabilities.js";
import { videoModelRegistry } from "../config/videoModelRegistry.js";
import { mapVideoParams } from "../utils/videoParams.js";

function assert(condition: unknown, message: string) {
  if (!condition) throw new Error(message);
}

const byId = new Map(videoModelCapabilities.map((item) => [item.modelId, item]));

const happyhorse = byId.get("alibaba-happyhorse-1-0-t2v");
assert(happyhorse?.supportedModes.length === 1 && happyhorse.supportedModes[0]?.mode === "text_to_video", "HappyHorse must only expose text_to_video.");

const wan = byId.get("alibaba-wan-2-7-i2v-official");
assert(wan, "Wan 2.7 official i2v capability is missing.");
assert(wan!.supportedModes.some((item) => item.mode === "image_to_video_first_frame"), "Wan must support first frame i2v.");
assert(wan!.supportedModes.some((item) => item.mode === "image_to_video_first_last_frame"), "Wan must support first/last frame i2v.");
assert(!wan!.supportedModes.some((item) => item.mode === "reference_images_to_video"), "Wan must not expose generic reference image mode.");

const wan916 = mapVideoParams("alibaba", "wan2.7-i2v-2026-04-25", "image_to_video_first_frame", "9:16", "720P", 8);
assert(wan916.ratio === "9:16", "Wan 9:16 ratio must stay 9:16.");
assert(wan916.size === "720*1280", "Wan 9:16 720P size must be 720*1280.");

const veo916 = mapVideoParams("google", "veo-3.1-generate-preview", "text_to_video", "9:16", "1080p", 8);
assert(veo916.aspectRatio === "9:16", "Veo 9:16 aspectRatio must stay 9:16.");

const seedance = byId.get("seedance-2-0");
assert(seedance?.supportedDurations.includes(15), "Seedance 2.0 must expose 15s duration.");
assert(seedance?.supportedDurations.includes(0), "Seedance 2.0 must expose Auto duration.");
assert(seedance?.supportedResolutions.includes("480P"), "Seedance 2.0 must expose 480P when the API account permits it.");
assert(seedance?.supportedModes.some((item) => item.mode === "reference_images_to_video" && item.label === "全能参考"), "Seedance 2.0 must expose omni reference mode.");

const registryById = new Map(videoModelRegistry.map((item) => [item.registryId, item]));
const seedanceRegistry = registryById.get("seedance-2.0");
assert(seedanceRegistry?.displayName === "Seedance 2.0", "Seedance 2.0 registry entry must use one display name.");
assert(seedanceRegistry?.interfaces.official?.responseParser === "seedanceOfficialResponseParser", "Seedance official parser must be model-specific.");
assert(seedanceRegistry?.interfaces.relay?.responseParser === "seedanceRelayResponseParser", "Seedance relay parser must be model-specific.");
assert(seedanceRegistry?.baseParameters.resolutions?.join(",") === "480p,720p,1080p", "Seedance registry must not shrink relay defaults to 720p.");
assert(seedanceRegistry?.baseParameters.durationRange?.join(",") === "4,15", "Seedance registry must expose 4-15s instead of 5/8/10s.");

const veo31 = registryById.get("veo-3.1");
assert(veo31?.interfaces.official?.responseParser === "googleVeoResponseParser", "Veo official parser must not be Seedance parser.");
assert(veo31?.baseParameters.resolutions?.includes("4k"), "Veo 3.1 registry may expose 4k.");

const veo31Lite = registryById.get("veo-3.1-lite");
assert(!veo31Lite?.baseParameters.resolutions?.includes("4k"), "Veo 3.1 Lite must not expose 4k.");

const omni = registryById.get("google-omni-flash-10s");
assert(omni?.officialStatus === "needs_check", "Google Omni Flash 10s must not be marked verified until modelId is verified.");
assert(omni?.baseParameters.resolutions?.join(",") === "720p", "Google Omni Flash 10s should expose the relay 720p profile.");
assert(omni?.baseParameters.aspectRatios?.join(",") === "16:9,9:16", "Google Omni Flash 10s should expose portrait and landscape relay ratios.");

const wan22 = registryById.get("wan-2.2-t2v-plus");
assert(wan22?.baseParameters.durations?.join(",") === "5", "Wan2.2 T2V Plus must be fixed at 5s.");
assert(wan22?.baseParameters.concreteSizes?.includes("1920*1080"), "Wan2.2 T2V Plus must use concrete size options.");

const grokRelay = registryById.get("grok-video-3");
assert(grokRelay?.officialStatus === "not_official", "Grok Video 3 relay name must not pretend to be official.");
assert(grokRelay?.baseParameters.durationRange?.join(",") === "1,15", "Grok Video 3 relay should expose ai666 documented seconds range.");
assert(grokRelay?.baseParameters.aspectRatios?.join(",") === "16:9,9:16,2:3,3:2,1:1", "Grok Video 3 relay should expose ai666 documented ratios.");
assert(grokRelay?.baseParameters.resolutions?.join(",") === "720P,1080P", "Grok Video 3 relay should expose ai666 documented resolutions.");

const klingOmni = registryById.get("kling-3.0-omni");
assert(klingOmni?.baseParameters.resolutions?.length === 0, "Kling 3.0 Omni must not hard-code 4K or 1080p.");
const kling16 = registryById.get("kling-1.6");
assert(!kling16?.capabilities.nativeAudio, "Kling 1.x must not inherit Kling 3.0 Omni native audio.");

console.log("[test:video-official] ok");
