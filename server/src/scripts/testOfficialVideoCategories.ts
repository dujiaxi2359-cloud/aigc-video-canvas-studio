import { videoModelCapabilities } from "../config/videoModelCapabilities.js";
import { buildWanBody } from "../services/providers/alibabaWan.service.js";
import { mapVideoParams } from "../utils/videoParams.js";

function models(providerId: string, category: string) {
  return videoModelCapabilities.filter((item) => item.providerId === providerId && item.category === category).map((item) => item.modelName).sort();
}

function assertEqual(actual: unknown, expected: unknown, label: string) {
  const a = JSON.stringify(actual);
  const e = JSON.stringify(expected);
  if (a !== e) throw new Error(`${label} failed: expected ${e}, got ${a}`);
}

assertEqual(models("alibaba", "text_to_video"), ["happyhorse-1.0-t2v", "wan2.7-t2v-2026-04-25"].sort(), "alibaba text_to_video");
assertEqual(models("alibaba", "image_to_video"), ["happyhorse-1.0-i2v", "wan2.7-i2v-2026-04-25"].sort(), "alibaba image_to_video");
assertEqual(models("alibaba", "reference_to_video"), ["happyhorse-1.0-r2v", "wan2.7-r2v"].sort(), "alibaba reference_to_video");
assertEqual(models("alibaba", "video_edit"), ["happyhorse-1.0-video-edit", "wan2.7-videoedit"].sort(), "alibaba video_edit");

const veoReference = videoModelCapabilities.find((item) => item.modelId === "google-veo-3-1-reference");
if (!veoReference) throw new Error("missing veo reference capability");
if (veoReference.maxReferenceImages !== 3) throw new Error("Veo reference maxImages must be 3");
if (!veoReference.requiredInputs.includes("reference_images")) throw new Error("Veo reference must require reference_images");
const veoRefMode = veoReference.supportedModes.find((item) => item.mode === "reference_images_to_video");
if (!veoRefMode || veoRefMode.maxImages !== 3) throw new Error("Veo reference mode must allow up to 3 images");

const veoFirstLast = videoModelCapabilities.find((item) => item.modelId === "google-veo-3-1-first-last");
if (!veoFirstLast?.requiredInputs.includes("last_frame")) throw new Error("Veo first-last must require last_frame");

const veoMapped = mapVideoParams("google", "veo-3.1-generate-preview", "text_to_video", "9:16", "1080p", 8);
if (veoMapped.aspectRatio !== "9:16") throw new Error("Veo 9:16 mapping failed");

const happyhorseR2v = videoModelCapabilities.find((item) => item.modelId === "alibaba-happyhorse-1-0-r2v");
if (!happyhorseR2v || happyhorseR2v.runtimeStatus === "not_implemented") throw new Error("HappyHorse r2v must be callable");
const happyhorseR2vMode = happyhorseR2v.supportedModes.find((item) => item.mode === "reference_images_to_video");
if (!happyhorseR2vMode || (happyhorseR2vMode.maxImages ?? 0) < 2) throw new Error("HappyHorse r2v must allow 2 reference images");

const wanR2v = videoModelCapabilities.find((item) => item.modelId === "alibaba-wan-2-7-r2v");
if (!wanR2v || wanR2v.runtimeStatus === "not_implemented") throw new Error("Wan r2v must be callable");
const wanR2vBody = buildWanBody(
  {
    nodeId: "test",
    modelConfigId: "test",
    inputMode: "reference-to-video",
    videoMode: "reference_images_to_video",
    prompt: "test",
    imageAssetIds: ["a", "b"],
    duration: 8,
    aspectRatio: "9:16",
    resolution: "720P",
    generateCount: 1,
    apiKey: "test",
    apiBaseUrl: "",
    modelName: "wan2.7-r2v",
    providerId: "alibaba",
    catalogModelId: "alibaba-wan-2-7-r2v"
  },
  ["https://example.com/a.png", "https://example.com/b.png"],
  [],
  []
);
const wanR2vMedia = (wanR2vBody.input as { media?: Array<{ type: string }> }).media ?? [];
assertEqual(wanR2vMedia.map((item) => item.type), ["reference_image", "reference_image"], "wan r2v media");

const wanI2vBody = buildWanBody(
  {
    nodeId: "test",
    modelConfigId: "test",
    inputMode: "first-last-frame",
    videoMode: "image_to_video_first_last_frame",
    prompt: "test",
    imageAssetIds: ["a", "b"],
    duration: 8,
    aspectRatio: "9:16",
    resolution: "720P",
    generateCount: 1,
    apiKey: "test",
    apiBaseUrl: "",
    modelName: "wan2.7-i2v-2026-04-25",
    providerId: "alibaba",
    catalogModelId: "alibaba-wan-2-7-i2v-official"
  },
  ["https://example.com/first.png", "https://example.com/last.png"],
  [],
  []
);
const wanI2vMedia = (wanI2vBody.input as { media?: Array<{ type: string }> }).media ?? [];
assertEqual(wanI2vMedia.map((item) => item.type), ["first_frame", "last_frame"], "wan i2v media");

console.log("[test:official-video-categories] ok");
