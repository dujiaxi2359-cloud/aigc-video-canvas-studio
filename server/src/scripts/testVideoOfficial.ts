import { videoModelCapabilities } from "../config/videoModelCapabilities.js";
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

console.log("[test:video-official] ok");
