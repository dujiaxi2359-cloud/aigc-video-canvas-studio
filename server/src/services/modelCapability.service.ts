import { getDb } from "../db/database.js";
import { requireRequestContext } from "./requestContext.js";
import { getVideoModelCapabilityOrLegacy } from "../config/videoModelCapabilities.js";
import { officialModeToLegacyInputMode, officialVideoModeLabels } from "../types/videoModes.js";
import { normalizeImageCapabilities } from "./imageCapabilityNormalization.js";
import { normalizeVideoCapabilities } from "./videoCapabilityNormalization.js";
import type {
  AvailableImageOptions,
  AvailableVideoOptions,
  DurationCapability,
  ImageNodeContext,
  ModelCapabilities,
  ModelConstraint,
  VideoNodeContext
} from "../types/model.js";

function durationsFromCapability(duration?: DurationCapability) {
  if (!duration) return [];
  if (duration.type === "fixed") return [duration.value];
  if (duration.type === "enum") return [...duration.values].sort((a, b) => a - b);
  const values: number[] = [];
  for (let value = duration.min; value <= duration.max; value += duration.step) values.push(value);
  return values;
}

function constraintMatches(constraint: ModelConstraint, context: VideoNodeContext) {
  const when = constraint.when;
  if (when.resolution && !when.resolution.includes(context.selectedResolution ?? "")) return false;
  if (when.inputMode && !when.inputMode.includes(context.inputMode)) return false;
  if (when.hasImageInput !== undefined && when.hasImageInput !== context.hasImageInput) return false;
  if (when.hasVideoInput !== undefined && when.hasVideoInput !== context.hasVideoInput) return false;
  if (when.hasReferenceImage !== undefined && when.hasReferenceImage !== context.hasReferenceImage) return false;
  if (when.hasFirstLastFrame !== undefined && when.hasFirstLastFrame !== context.hasFirstLastFrame) return false;
  return true;
}

export function calculateAvailableVideoOptions(capabilities: ModelCapabilities, nodeContext: VideoNodeContext): AvailableVideoOptions {
  const channel = { ...capabilities, ...capabilities.channelCapability };
  const inputModes = new Set(capabilities.inputModes);
  const theoretical = capabilities.modelCapability;
  if (theoretical?.supportsTextToVideo) inputModes.add("text-to-video");
  if (theoretical?.supportsImageToVideo) inputModes.add("image-to-video");
  if (theoretical?.supportsFirstLastFrame) inputModes.add("first-last-frame");
  if (theoretical?.supportsVideoToVideo) inputModes.add("video-to-video");
  for (const input of channel.supportedInputs ?? []) {
    if (input === "text") inputModes.add("text-to-video");
    if (["image", "first_frame"].includes(input)) inputModes.add("image-to-video");
    if (input === "reference_image") inputModes.add("reference-to-video");
    if (input === "first_last_frame") inputModes.add("first-last-frame");
    if (input === "video") inputModes.add("video-to-video");
  }
  let availableDurations = capabilities.supportedDurations?.length ? [...capabilities.supportedDurations] : durationsFromCapability(capabilities.duration);
  let availableResolutions = [...(capabilities.supportedResolutions ?? capabilities.resolutions ?? [])];
  let availableAspectRatios = [...(capabilities.supportedAspectRatios ?? capabilities.aspectRatios ?? [])];
  const availableInputModes = Array.from(inputModes).filter((mode) =>
    ["text-to-video", "image-to-video", "first-last-frame", "reference-to-video", "video-to-video"].includes(mode)
  );
  const lockedFields: AvailableVideoOptions["lockedFields"] = {};
  let warningMessage: string | undefined;

  if (capabilities.duration?.type === "fixed") lockedFields.duration = true;

  for (const constraint of capabilities.constraints ?? []) {
    if (!constraintMatches(constraint, nodeContext)) continue;
    warningMessage = constraint.reason;
    if (constraint.forceDuration !== undefined) {
      availableDurations = [constraint.forceDuration];
      lockedFields.duration = true;
    }
    if (constraint.allowedDurations) availableDurations = constraint.allowedDurations;
    if (constraint.disabledResolutions) availableResolutions = availableResolutions.filter((item) => !constraint.disabledResolutions!.includes(item));
    if (constraint.disabledAspectRatios) availableAspectRatios = availableAspectRatios.filter((item) => !constraint.disabledAspectRatios!.includes(item));
  }

  return {
    availableDurations,
    availableAspectRatios,
    availableResolutions,
    availableInputModes,
    lockedFields,
    warningMessage,
    normalizedSelection: {
      duration: availableDurations.includes(nodeContext.selectedDuration ?? NaN) ? nodeContext.selectedDuration : availableDurations[0],
      aspectRatio: availableAspectRatios.includes(nodeContext.selectedAspectRatio ?? "") ? nodeContext.selectedAspectRatio : availableAspectRatios[0],
      resolution: availableResolutions.includes(nodeContext.selectedResolution ?? "") ? nodeContext.selectedResolution : availableResolutions[0],
      inputMode: availableInputModes.includes(nodeContext.inputMode) ? nodeContext.inputMode : availableInputModes[0]
    }
  };
}

function calculateOfficialVideoOptions(
  capability: NonNullable<ReturnType<typeof getVideoModelCapabilityOrLegacy>>,
  nodeContext: VideoNodeContext
): AvailableVideoOptions {
  const availableVideoModes = capability.supportedModes
    .filter((mode) => (mode.runtimeStatus ?? capability.runtimeStatus) !== "not_implemented")
    .map((mode) => mode.mode);
  const unavailableVideoModes = capability.supportedModes
    .filter((mode) => (mode.runtimeStatus ?? capability.runtimeStatus) === "not_implemented")
    .map((mode) => ({ mode: mode.mode, label: mode.label, reason: "adapter 未接入" }));
  const selectedMode = nodeContext.videoMode && availableVideoModes.includes(nodeContext.videoMode)
    ? nodeContext.videoMode
    : availableVideoModes[0];
  const selectedModeCapability = capability.supportedModes.find((mode) => mode.mode === selectedMode);
  const availableInputModes = Array.from(new Set(availableVideoModes.map(officialModeToLegacyInputMode)));
  let availableDurations = selectedModeCapability?.supportedDurations ?? capability.supportedDurations;
  let availableResolutions = capability.supportedResolutions;
  const lockedFields: AvailableVideoOptions["lockedFields"] = {};
  let warningMessage = capability.runtimeStatus === "not_implemented" ? "当前视频模型 adapter 尚未接入，不能生成。" : undefined;

  const isVeo = capability.providerId === "google" && capability.family === "veo";
  const requestedResolution = nodeContext.selectedResolution ?? capability.defaultResolution;
  if (isVeo && selectedMode === "video_extension") {
    availableResolutions = ["720p"];
    availableDurations = [8];
    lockedFields.resolution = true;
    lockedFields.duration = true;
    warningMessage = "Veo 视频延展官方只支持 720p，并按 8 秒任务处理。";
  } else if (isVeo && (selectedMode === "reference_images_to_video" || requestedResolution === "1080p" || requestedResolution === "4k")) {
    availableDurations = [8];
    lockedFields.duration = true;
    warningMessage = "当前模式官方要求 8 秒，已自动调整。";
  }

  const normalizedResolution = availableResolutions.includes(nodeContext.selectedResolution ?? "") ? nodeContext.selectedResolution : availableResolutions[0];
  const normalizedDuration = availableDurations.includes(nodeContext.selectedDuration ?? NaN) ? nodeContext.selectedDuration : availableDurations[0];

  return {
    availableDurations,
    availableAspectRatios: capability.supportedAspectRatios,
    availableResolutions,
    availableInputModes,
    availableVideoModes,
    unavailableVideoModes,
    videoModeLabels: {
      ...officialVideoModeLabels,
      ...Object.fromEntries(capability.supportedModes.map((mode) => [mode.mode, mode.label]))
    },
    lockedFields,
    warningMessage,
    normalizedSelection: {
      duration: normalizedDuration,
      aspectRatio: capability.supportedAspectRatios.includes(nodeContext.selectedAspectRatio ?? "") ? nodeContext.selectedAspectRatio : capability.defaultAspectRatio,
      resolution: normalizedResolution,
      videoMode: selectedMode,
      inputMode: selectedMode ? officialModeToLegacyInputMode(selectedMode) : availableInputModes[0]
    }
  };
}

export function calculateAvailableImageOptions(capabilities: ModelCapabilities, nodeContext: ImageNodeContext): AvailableImageOptions {
  const availableImageSizes = Array.from(new Set(["auto", ...(capabilities.imageAspectRatios ?? capabilities.imageSizes ?? ["1:1"])]));
  const availableImageQualities = [...(capabilities.imageQualities ?? ["auto"])];
  const availableImageFormats = [...(capabilities.imageFormats ?? ["png"])];
  const inputModes = new Set(capabilities.inputModes.filter((mode) => ["text-to-image", "image-to-image", "image-edit"].includes(mode)));
  const theoretical = capabilities.modelCapability;
  if (theoretical?.supportsTextToImage) inputModes.add("text-to-image");
  if (theoretical?.supportsImageToImage) inputModes.add("image-to-image");
  if (theoretical?.supportsImageEdit) inputModes.add("image-edit");
  if (capabilities.supportsImageInput || capabilities.supportsReferenceImage || capabilities.supportsMultiImageInput) {
    inputModes.add("image-to-image");
    inputModes.add("image-edit");
  }
  if (!inputModes.size) inputModes.add("text-to-image");
  const availableInputModes = Array.from(inputModes);
  const warningMessage =
    nodeContext.inputMode === "image-edit" && !nodeContext.hasImageInput
      ? "图片编辑需要连接一张图片素材。"
      : nodeContext.inputMode === "image-to-image" && !nodeContext.hasImageInput
        ? "图生图需要连接一张图片素材。"
        : undefined;

  return {
    availableImageSizes,
    availableImageQualities,
    availableImageFormats,
    availableInputModes,
    warningMessage,
    normalizedSelection: {
      imageSize: availableImageSizes.includes(nodeContext.selectedImageSize ?? "") ? nodeContext.selectedImageSize : availableImageSizes[0],
      imageQuality: availableImageQualities.includes(nodeContext.selectedQuality ?? "") ? nodeContext.selectedQuality : availableImageQualities[0],
      imageFormat: availableImageFormats.includes(nodeContext.selectedFormat ?? "") ? nodeContext.selectedFormat : availableImageFormats[0],
      inputMode: availableInputModes.includes(nodeContext.inputMode) ? nodeContext.inputMode : availableInputModes[0]
    }
  };
}

async function getCapabilities(modelConfigId: string) {
  const db = await getDb();
  const row = await db.get<{ provider_id?: string; provider?: string; display_name?: string; model_name: string; capabilities_json: string }>(
    "SELECT provider_id, provider, display_name, model_name, capabilities_json FROM model_configs WHERE id = ? AND workspace_id = ? AND enabled = 1",
    modelConfigId,
    requireRequestContext().workspace.id
  );
  if (!row) throw new Error("Model config not found or disabled");
  return normalizeImageCapabilities(JSON.parse(row.capabilities_json) as ModelCapabilities, row.provider_id, row.model_name, row.display_name, row.provider);
}

async function getCapabilityContext(modelConfigId: string) {
  const db = await getDb();
  const row = await db.get<{ provider_id?: string; model_name: string; capabilities_json: string }>(
    "SELECT provider_id, model_name, capabilities_json FROM model_configs WHERE id = ? AND workspace_id = ? AND enabled = 1",
    modelConfigId,
    requireRequestContext().workspace.id
  );
  if (!row) throw new Error("Model config not found or disabled");
  return {
    capabilities: JSON.parse(row.capabilities_json) as ModelCapabilities,
    providerId: row.provider_id,
    modelName: row.model_name,
    catalogModelId: undefined
  };
}

export async function getAvailableVideoOptions(modelConfigId: string, nodeContext: VideoNodeContext) {
  const context = await getCapabilityContext(modelConfigId);
  return calculateAvailableVideoOptions(
    normalizeVideoCapabilities(context.capabilities, context.providerId, context.modelName),
    nodeContext
  );
}

export async function getAvailableImageOptions(modelConfigId: string, nodeContext: ImageNodeContext) {
  return calculateAvailableImageOptions(await getCapabilities(modelConfigId), nodeContext);
}
