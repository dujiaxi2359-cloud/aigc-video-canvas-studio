import { buildPayloadSummary } from "../utils/generationPayload.js";
import { mapVideoParams } from "../utils/videoParams.js";
import { aspectRatioToQwen20Size } from "../utils/imageAspectRatio.js";

const checks = [
  buildPayloadSummary({
    providerId: "alibaba",
    selectedModelId: "alibaba-happyhorse-1-0-t2v",
    actualModelName: "happyhorse-1.0-t2v",
    inputMode: "text_to_video",
    aspectRatio: "9:16",
    mappedSize: mapVideoParams("alibaba", "happyhorse-1.0-t2v", "text_to_video", "9:16", "1080P", 8).size,
    mappedResolution: "1080P",
    duration: 8,
    quality: "full_quality",
    qualityMode: "full_quality",
    hasImageInput: false,
    imageInputCount: 0,
    prompt: "quality parity probe",
    isMock: false,
    qualityAudit: { promptExtend: true, isFallback: false }
  }),
  buildPayloadSummary({
    providerId: "alibaba",
    selectedModelId: "alibaba-wan-2-7-i2v-official",
    actualModelName: "wan2.7-i2v-2026-04-25",
    inputMode: "image_to_video_first_frame",
    aspectRatio: "9:16",
    mappedSize: mapVideoParams("alibaba", "wan2.7-i2v-2026-04-25", "image_to_video_first_frame", "9:16", "720P", 15).size,
    mappedResolution: "720P",
    duration: 15,
    quality: "full_quality",
    qualityMode: "full_quality",
    hasImageInput: true,
    imageInputCount: 1,
    prompt: "quality parity probe",
    isMock: false,
    qualityAudit: { promptExtend: true, isFallback: false, inputImageSource: "localPath", inputImageWasCompressed: false, inputPreprocessed: true }
  }),
  buildPayloadSummary({
    providerId: "alibaba",
    selectedModelId: "alibaba-qwen-image-2-pro",
    actualModelName: "qwen-image-2.0-pro",
    inputMode: "text-to-image",
    aspectRatio: "9:16",
    mappedSize: aspectRatioToQwen20Size("9:16"),
    quality: "high",
    qualityMode: "full_quality",
    hasImageInput: false,
    imageInputCount: 0,
    prompt: "quality parity probe",
    isMock: false,
    qualityAudit: { isFallback: false }
  })
];

for (const check of checks) {
  if (check.isMock) throw new Error("quality parity check failed: mock enabled");
  if (check.isFallback) throw new Error("quality parity check failed: fallback enabled");
  console.log("[quality-parity]", JSON.stringify(check, null, 2));
}
