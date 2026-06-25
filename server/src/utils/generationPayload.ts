import { getOfficialModelCapability, qualityTierFor } from "../config/officialModelCapabilities.js";
import { getVideoModelCapabilityOrLegacy } from "../config/videoModelCapabilities.js";
import type { OfficialVideoMode } from "../types/videoModes.js";

export type OfficialPayloadSummary = {
  providerId?: string;
  selectedModelId?: string;
  actualModelName?: string;
  upstreamModelId?: string;
  adapterName?: string;
  inputMode?: string;
  videoMode?: string;
  aspectRatio?: string;
  ratio?: string;
  mappedSize?: string;
  mappedResolution?: string;
  duration?: number;
  quality?: string;
  qualityTier?: string;
  qualityMode?: string;
  hasImageInput?: boolean;
  imageInputCount?: number;
  promptLength?: number;
  finalPromptLength?: number;
  negativePromptLength?: number;
  promptPreviewFirst100?: string;
  promptPreviewLast100?: string;
  promptExtend?: boolean;
  seed?: number | string;
  isMock: boolean;
  isFallback?: boolean;
  isFastModel?: boolean;
  inputImageSource?: string;
  inputImageWidth?: number;
  inputImageHeight?: number;
  inputImageFileSize?: number;
  inputImageWasCompressed?: boolean;
  inputPreprocessed?: boolean;
  outputWidth?: number;
  outputHeight?: number;
  outputDuration?: number;
  outputFileSize?: number;
  payloadSummary?: Record<string, unknown>;
};

function preview(value?: string, start = true) {
  if (!value) return "";
  return start ? value.slice(0, 100) : value.slice(Math.max(0, value.length - 100));
}

export function buildPayloadSummary(input: {
  providerId?: string;
  selectedModelId?: string;
  actualModelName?: string;
  upstreamModelId?: string;
  inputMode?: string;
  aspectRatio?: string;
  mappedSize?: string;
  mappedResolution?: string;
  duration?: number;
  quality?: string;
  qualityMode?: string;
  hasImageInput?: boolean;
  imageInputCount?: number;
  prompt?: string;
  finalPrompt?: string;
  negativePrompt?: string;
  isMock?: boolean;
  qualityAudit?: Record<string, unknown>;
  payloadSummary?: Record<string, unknown>;
}): OfficialPayloadSummary {
  const official = getOfficialModelCapability(input.providerId, input.selectedModelId, input.actualModelName);
  const videoMode = typeof input.qualityAudit?.videoMode === "string" ? input.qualityAudit.videoMode : undefined;
  const videoOfficial = getVideoModelCapabilityOrLegacy(input.providerId, input.selectedModelId, input.actualModelName, videoMode as OfficialVideoMode | undefined);
  const qualityTier = official?.qualityTier ?? videoOfficial?.qualityTier ?? qualityTierFor(input.providerId, input.selectedModelId, input.actualModelName);
  return {
    providerId: input.providerId,
    selectedModelId: input.selectedModelId,
    actualModelName: input.actualModelName,
    upstreamModelId: input.upstreamModelId,
    adapterName: official?.adapterName ?? videoOfficial?.adapterName,
    inputMode: input.inputMode,
    videoMode,
    aspectRatio: input.aspectRatio,
    ratio: typeof input.qualityAudit?.ratio === "string" ? input.qualityAudit.ratio : undefined,
    mappedSize: input.mappedSize,
    mappedResolution: input.mappedResolution,
    duration: input.duration,
    quality: input.quality,
    qualityTier,
    qualityMode: input.qualityMode ?? (typeof input.qualityAudit?.qualityMode === "string" ? input.qualityAudit.qualityMode : input.quality),
    hasImageInput: input.hasImageInput,
    imageInputCount: input.imageInputCount,
    promptLength: input.prompt?.length ?? 0,
    finalPromptLength: (input.finalPrompt ?? input.prompt)?.length ?? 0,
    negativePromptLength: input.negativePrompt?.length ?? (typeof input.qualityAudit?.negativePromptLength === "number" ? input.qualityAudit.negativePromptLength : undefined),
    promptPreviewFirst100: preview(input.prompt, true),
    promptPreviewLast100: preview(input.prompt, false),
    promptExtend: typeof input.qualityAudit?.promptExtend === "boolean" ? input.qualityAudit.promptExtend : undefined,
    seed: typeof input.qualityAudit?.seed === "number" || typeof input.qualityAudit?.seed === "string" ? input.qualityAudit.seed : undefined,
    isMock: Boolean(input.isMock),
    isFallback: Boolean(input.qualityAudit?.isFallback),
    isFastModel: ["fast", "lite", "turbo"].includes(qualityTier ?? ""),
    inputImageSource: typeof input.qualityAudit?.inputImageSource === "string" ? input.qualityAudit.inputImageSource : undefined,
    inputImageWidth: typeof input.qualityAudit?.inputImageWidth === "number" ? input.qualityAudit.inputImageWidth : undefined,
    inputImageHeight: typeof input.qualityAudit?.inputImageHeight === "number" ? input.qualityAudit.inputImageHeight : undefined,
    inputImageFileSize: typeof input.qualityAudit?.inputImageFileSize === "number" ? input.qualityAudit.inputImageFileSize : undefined,
    inputImageWasCompressed: typeof input.qualityAudit?.inputImageWasCompressed === "boolean" ? input.qualityAudit.inputImageWasCompressed : undefined,
    inputPreprocessed: typeof input.qualityAudit?.inputPreprocessed === "boolean" ? input.qualityAudit.inputPreprocessed : undefined,
    outputWidth: typeof input.qualityAudit?.outputWidth === "number" ? input.qualityAudit.outputWidth : undefined,
    outputHeight: typeof input.qualityAudit?.outputHeight === "number" ? input.qualityAudit.outputHeight : undefined,
    outputDuration: typeof input.qualityAudit?.outputDuration === "number" ? input.qualityAudit.outputDuration : undefined,
    outputFileSize: typeof input.qualityAudit?.outputFileSize === "number" ? input.qualityAudit.outputFileSize : undefined,
    payloadSummary: input.payloadSummary
  };
}

export function logOfficialPayload(summary: OfficialPayloadSummary) {
  console.log("[official-generate-payload]", summary);
}
