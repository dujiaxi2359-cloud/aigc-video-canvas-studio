import type { OfficialVideoCategory, OfficialVideoMode } from "../types/videoModes.js";
import { categoryForOfficialVideoMode } from "../types/videoModes.js";

export type VideoProviderId = "alibaba" | "google" | "seedance" | "kling" | "grok";
export type VideoFamily = "happyhorse" | "wan2.7" | "veo" | "omni" | "seedance" | "kling" | "grok";

export type VideoInputRequirement =
  | "prompt"
  | "first_frame"
  | "last_frame"
  | "reference_images"
  | "reference_video"
  | "first_clip"
  | "video"
  | "driving_audio"
  | "motion_reference";

export type VideoModeCapability = {
  mode: OfficialVideoMode;
  label: string;
  category: OfficialVideoCategory;
  requiredInputs: VideoInputRequirement[];
  supportedDurations?: number[];
  optionalInputs?: Array<"negative_prompt" | "seed" | "audio" | "style" | "camera_motion" | "cfg_scale" | "motion_strength">;
  minImages?: number;
  maxImages?: number;
  minVideos?: number;
  maxVideos?: number;
  runtimeStatus?: "verified" | "experimental" | "not_implemented";
  adapterName?: string;
};

export type VideoModelCapability = {
  providerId: VideoProviderId;
  family: VideoFamily;
  category: OfficialVideoCategory;
  modelId: string;
  modelName: string;
  displayName: string;
  officialMode: OfficialVideoMode;
  officialDocsUrl?: string;
  adapterName: string;
  runtimeStatus: "verified" | "experimental" | "not_implemented";
  qualityTier: "standard" | "full" | "fast" | "lite" | "turbo";
  supportedModes: VideoModeCapability[];
  supportedAspectRatios: string[];
  supportedDurations: number[];
  supportedResolutions: string[];
  defaultAspectRatio: string;
  defaultDuration: number;
  defaultResolution: string;
  requiredInputs: VideoInputRequirement[];
  optionalInputs: string[];
  maxImages?: number;
  maxVideos?: number;
  supportsAudio: boolean;
  supportsNegativePrompt: boolean;
  supportsPromptExtend: boolean;
  supportsSeed: boolean;
  supportsReferenceImages: boolean;
  maxReferenceImages?: number;
  resultType: "async_task" | "sync_result";
};

const range = (min: number, max: number) => Array.from({ length: max - min + 1 }, (_, index) => index + min);

function mode(input: Omit<VideoModeCapability, "category">): VideoModeCapability {
  return { ...input, category: categoryForOfficialVideoMode(input.mode) };
}

function capability(input: Omit<VideoModelCapability, "category" | "officialMode" | "requiredInputs" | "optionalInputs"> & { officialMode: OfficialVideoMode; requiredInputs?: VideoInputRequirement[]; optionalInputs?: string[] }) {
  const selectedMode = input.supportedModes.find((item) => item.mode === input.officialMode);
  return {
    ...input,
    category: categoryForOfficialVideoMode(input.officialMode),
    requiredInputs: input.requiredInputs ?? selectedMode?.requiredInputs ?? ["prompt"],
    optionalInputs: input.optionalInputs ?? selectedMode?.optionalInputs ?? []
  } satisfies VideoModelCapability;
}

const alibabaBase = {
  providerId: "alibaba" as const,
  supportedAspectRatios: ["16:9", "9:16"],
  supportedResolutions: ["720P", "1080P"],
  defaultAspectRatio: "16:9",
  defaultResolution: "1080P",
  defaultDuration: 8,
  supportsNegativePrompt: true,
  supportsPromptExtend: true,
  supportsSeed: true,
  resultType: "async_task" as const
};

const veoText = mode({ mode: "text_to_video", label: "文生视频", requiredInputs: ["prompt"] });
const veoI2v = mode({ mode: "image_to_video_first_frame", label: "图生视频", requiredInputs: ["prompt", "first_frame"], minImages: 1, maxImages: 1 });
const veoRef = mode({ mode: "reference_images_to_video", label: "参考图生视频", requiredInputs: ["prompt", "reference_images"], minImages: 1, maxImages: 3 });
const veoFirstLast = mode({ mode: "image_to_video_first_last_frame", label: "首尾帧视频", requiredInputs: ["prompt", "first_frame", "last_frame"], minImages: 2, maxImages: 2 });
const veoExtension = mode({ mode: "video_extension", label: "视频延展", requiredInputs: ["prompt", "video"], minVideos: 1, maxVideos: 1, adapterName: "googleVeoVideoExtension" });
const klingStandardDurations = [5, 10];
const klingLongDurations = [5, 10, 15];

function klingModesForDurations(supportedDurations: number[]) {
  return [
    mode({ mode: "text_to_video", label: "文生视频", requiredInputs: ["prompt"], supportedDurations, optionalInputs: ["negative_prompt", "camera_motion"] }),
    mode({ mode: "image_to_video_first_frame", label: "首帧图生视频", requiredInputs: ["prompt", "first_frame"], supportedDurations, minImages: 1, maxImages: 1 }),
    mode({ mode: "image_to_video_first_last_frame", label: "首尾帧视频", requiredInputs: ["prompt", "first_frame", "last_frame"], supportedDurations, minImages: 2, maxImages: 2 }),
    mode({ mode: "reference_images_to_video", label: "多图参考生视频", requiredInputs: ["prompt", "reference_images"], supportedDurations, minImages: 1, maxImages: 4 })
  ];
}

function klingCapability(input: {
  modelId: string;
  modelName: string;
  displayName: string;
  qualityTier?: "standard" | "full" | "fast" | "lite" | "turbo";
  supportedModes?: VideoModeCapability[];
  supportedDurations?: number[];
  supportsReferenceImages?: boolean;
  maxReferenceImages?: number;
  maxImages?: number;
}) {
  const supportedDurations = input.supportedDurations ?? klingStandardDurations;
  return capability({
    providerId: "kling",
    family: "kling",
    modelId: input.modelId,
    modelName: input.modelName,
    displayName: input.displayName,
    officialMode: "text_to_video",
    adapterName: "klingVideo",
    runtimeStatus: "experimental",
    qualityTier: input.qualityTier ?? "full",
    supportedModes: input.supportedModes ?? klingModesForDurations(supportedDurations),
    supportedAspectRatios: ["16:9", "9:16", "1:1"],
    supportedDurations,
    supportedResolutions: ["720P", "1080P"],
    defaultAspectRatio: "16:9",
    defaultDuration: 5,
    defaultResolution: "1080P",
    supportsAudio: false,
    supportsNegativePrompt: true,
    supportsPromptExtend: false,
    supportsSeed: false,
    supportsReferenceImages: input.supportsReferenceImages ?? true,
    maxReferenceImages: input.maxReferenceImages ?? (input.supportsReferenceImages === false ? undefined : 4),
    maxImages: input.maxImages ?? (input.supportsReferenceImages === false ? 2 : 4),
    resultType: "async_task"
  });
}

const grokModes = [
  mode({ mode: "text_to_video", label: "文生视频", requiredInputs: ["prompt"] }),
  mode({ mode: "image_to_video_first_frame", label: "首帧图生视频", requiredInputs: ["prompt", "first_frame"], minImages: 1, maxImages: 1 }),
  mode({ mode: "reference_images_to_video", label: "参考图生视频", requiredInputs: ["prompt", "reference_images"], minImages: 1, maxImages: 7 }),
  mode({ mode: "video_edit", label: "视频编辑", requiredInputs: ["prompt", "video"], minVideos: 1, maxVideos: 1 }),
  mode({ mode: "video_extension", label: "视频延展", requiredInputs: ["prompt", "video"], minVideos: 1, maxVideos: 1 })
];

function grokCapability(input: { modelId: string; modelName: string; displayName: string; supportedDurations?: number[]; defaultDuration?: number; qualityTier?: "standard" | "full" | "fast" | "lite" | "turbo" }) {
  const supportedDurations = input.supportedDurations ?? range(1, 15);
  return capability({
    providerId: "grok",
    family: "grok",
    modelId: input.modelId,
    modelName: input.modelName,
    displayName: input.displayName,
    officialMode: "text_to_video",
    officialDocsUrl: "https://docs.x.ai/developers/model-capabilities/imagine",
    adapterName: "grokVideo",
    runtimeStatus: "verified",
    qualityTier: input.qualityTier ?? "standard",
    supportedModes: grokModes.map((item) => ({ ...item, supportedDurations })),
    supportedAspectRatios: ["16:9", "9:16", "1:1", "2:3", "3:2", "3:4", "4:3"],
    supportedDurations,
    supportedResolutions: ["480p", "720p"],
    defaultAspectRatio: "16:9",
    defaultDuration: input.defaultDuration ?? supportedDurations[Math.min(9, supportedDurations.length - 1)] ?? 10,
    defaultResolution: "720p",
    supportsAudio: true,
    supportsNegativePrompt: false,
    supportsPromptExtend: false,
    supportsSeed: false,
    supportsReferenceImages: true,
    maxReferenceImages: 7,
    maxImages: 7,
    maxVideos: 1,
    resultType: "async_task"
  });
}

function veoCapability(input: {
  modelId: string;
  modelName: string;
  displayName: string;
  officialMode: OfficialVideoMode;
  qualityTier?: "standard" | "full" | "fast" | "lite";
  runtimeStatus?: "verified" | "experimental" | "not_implemented";
  defaultResolution?: string;
  supportedModes?: VideoModeCapability[];
  supportedResolutions?: string[];
  supportsReferenceImages?: boolean;
  maxReferenceImages?: number;
}) {
  return capability({
    providerId: "google",
    family: "veo",
    modelId: input.modelId,
    modelName: input.modelName,
    displayName: input.displayName,
    officialMode: input.officialMode,
    adapterName: "googleVeo",
    runtimeStatus: input.runtimeStatus ?? "verified",
    qualityTier: input.qualityTier ?? "standard",
    supportedModes: input.supportedModes ?? [veoText, veoI2v, veoRef, veoFirstLast, veoExtension],
    supportedAspectRatios: ["16:9", "9:16"],
    supportedDurations: [4, 6, 8],
    supportedResolutions: input.supportedResolutions ?? ["720p", "1080p", "4k"],
    defaultAspectRatio: "16:9",
    defaultDuration: 8,
    defaultResolution: input.defaultResolution ?? "1080p",
    supportsAudio: true,
    supportsNegativePrompt: false,
    supportsPromptExtend: false,
    supportsSeed: false,
    supportsReferenceImages: input.supportsReferenceImages ?? true,
    maxReferenceImages: input.maxReferenceImages,
    resultType: "async_task"
  });
}

export const videoModelCapabilities: VideoModelCapability[] = [
  capability({
    ...alibabaBase,
    family: "happyhorse",
    modelId: "alibaba-happyhorse-1-0-t2v",
    modelName: "happyhorse-1.0-t2v",
    displayName: "HappyHorse 1.0 文生视频",
    officialMode: "text_to_video",
    adapterName: "alibabaHappyHorseT2V",
    runtimeStatus: "verified",
    qualityTier: "full",
    supportedModes: [mode({ mode: "text_to_video", label: "文生视频", requiredInputs: ["prompt"], optionalInputs: ["negative_prompt", "seed"] })],
    supportedDurations: range(3, 15),
    supportsAudio: false,
    supportsReferenceImages: false
  }),
  capability({
    ...alibabaBase,
    family: "wan2.7",
    modelId: "alibaba-wan-2-7-t2v-official",
    modelName: "wan2.7-t2v-2026-04-25",
    displayName: "Wan 2.7 文生视频 2026-04-25",
    officialMode: "text_to_video",
    adapterName: "alibabaWan27T2V",
    runtimeStatus: "verified",
    qualityTier: "full",
    supportedModes: [mode({ mode: "text_to_video", label: "文生视频", requiredInputs: ["prompt"], optionalInputs: ["negative_prompt", "seed"] })],
    supportedDurations: range(2, 15),
    supportsAudio: false,
    supportsReferenceImages: false
  }),
  capability({
    ...alibabaBase,
    family: "happyhorse",
    modelId: "alibaba-happyhorse-1-0-i2v",
    modelName: "happyhorse-1.0-i2v",
    displayName: "HappyHorse 1.0 图生视频",
    officialMode: "image_to_video_first_frame",
    adapterName: "alibabaHappyHorseI2V",
    runtimeStatus: "verified",
    qualityTier: "full",
    supportedModes: [mode({ mode: "image_to_video_first_frame", label: "首帧图生视频", requiredInputs: ["prompt", "first_frame"], minImages: 1, maxImages: 1 })],
    supportedDurations: range(3, 15),
    supportsAudio: false,
    supportsReferenceImages: false,
    maxImages: 1
  }),
  capability({
    ...alibabaBase,
    family: "wan2.7",
    modelId: "alibaba-wan-2-7-i2v-official",
    modelName: "wan2.7-i2v-2026-04-25",
    displayName: "Wan 2.7 图生视频 2026-04-25",
    officialMode: "image_to_video_first_frame",
    adapterName: "alibabaWan27I2V",
    runtimeStatus: "verified",
    qualityTier: "full",
    supportedModes: [
      mode({ mode: "image_to_video_first_frame", label: "首帧图生视频", requiredInputs: ["prompt", "first_frame"], minImages: 1, maxImages: 1 }),
      mode({ mode: "image_to_video_first_last_frame", label: "首帧 + 尾帧图生视频", requiredInputs: ["prompt", "first_frame", "last_frame"], minImages: 2, maxImages: 2 }),
      mode({ mode: "video_continuation", label: "视频续写", requiredInputs: ["prompt", "first_clip"], minVideos: 1, maxVideos: 1 }),
      mode({ mode: "audio_driven_video", label: "音频驱动视频", requiredInputs: ["prompt", "first_frame", "driving_audio"], minImages: 1, maxImages: 1 })
    ],
    supportedDurations: range(2, 15),
    supportsAudio: true,
    supportsReferenceImages: false,
    maxImages: 2
  }),
  capability({
    ...alibabaBase,
    family: "happyhorse",
    modelId: "alibaba-happyhorse-1-0-r2v",
    modelName: "happyhorse-1.0-r2v",
    displayName: "HappyHorse 1.0 参考生视频",
    officialMode: "reference_images_to_video",
    adapterName: "alibabaHappyHorseR2V",
    runtimeStatus: "verified",
    qualityTier: "full",
    supportedModes: [mode({ mode: "reference_images_to_video", label: "参考生视频", requiredInputs: ["prompt", "reference_images"], minImages: 1, maxImages: 5 })],
    supportedDurations: range(3, 15),
    supportsAudio: false,
    supportsReferenceImages: true,
    maxReferenceImages: 5,
    maxImages: 5
  }),
  capability({
    ...alibabaBase,
    family: "wan2.7",
    modelId: "alibaba-wan-2-7-r2v",
    modelName: "wan2.7-r2v",
    displayName: "Wan 2.7 参考生视频",
    officialMode: "reference_images_to_video",
    adapterName: "alibabaWan27R2V",
    runtimeStatus: "verified",
    qualityTier: "full",
    supportedModes: [
      mode({ mode: "reference_images_to_video", label: "参考图生视频", requiredInputs: ["prompt", "reference_images"], minImages: 1, maxImages: 5 }),
      mode({ mode: "reference_video_to_video", label: "参考视频生成", requiredInputs: ["prompt", "reference_video"], minVideos: 1, maxVideos: 1 })
    ],
    supportedDurations: range(2, 15),
    supportsAudio: false,
    supportsReferenceImages: true,
    maxReferenceImages: 5,
    maxImages: 5,
    maxVideos: 1
  }),
  capability({
    ...alibabaBase,
    family: "happyhorse",
    modelId: "alibaba-happyhorse-1-0-video-edit",
    modelName: "happyhorse-1.0-video-edit",
    displayName: "HappyHorse 1.0 视频编辑",
    officialMode: "video_edit",
    adapterName: "alibabaHappyHorseVideoEdit",
    runtimeStatus: "not_implemented",
    qualityTier: "full",
    supportedModes: [mode({ mode: "video_edit", label: "视频编辑", requiredInputs: ["prompt", "video"], minVideos: 1, maxVideos: 1 })],
    supportedDurations: range(2, 10),
    supportsAudio: false,
    supportsReferenceImages: false,
    maxVideos: 1
  }),
  capability({
    ...alibabaBase,
    family: "wan2.7",
    modelId: "alibaba-wan-2-7-videoedit",
    modelName: "wan2.7-videoedit",
    displayName: "Wan 2.7 视频编辑",
    officialMode: "video_edit",
    adapterName: "alibabaWan27VideoEdit",
    runtimeStatus: "not_implemented",
    qualityTier: "full",
    supportedModes: [mode({ mode: "video_edit", label: "视频编辑", requiredInputs: ["prompt", "video"], minVideos: 1, maxVideos: 1 })],
    supportedDurations: range(2, 10),
    supportsAudio: false,
    supportsReferenceImages: false,
    maxVideos: 1
  }),
  veoCapability({ modelId: "google-veo-3-1", modelName: "veo-3.1-generate-preview", displayName: "Veo 3.1 文生视频", officialMode: "text_to_video", qualityTier: "standard", maxReferenceImages: 3 }),
  veoCapability({ modelId: "google-veo-3-1-i2v", modelName: "veo-3.1-generate-preview", displayName: "Veo 3.1 图生视频", officialMode: "image_to_video_first_frame", qualityTier: "standard", maxReferenceImages: 3 }),
  veoCapability({ modelId: "google-veo-3-1-reference", modelName: "veo-3.1-generate-preview", displayName: "Veo 3.1 参考图生视频", officialMode: "reference_images_to_video", qualityTier: "standard", maxReferenceImages: 3 }),
  veoCapability({ modelId: "google-veo-3-1-first-last", modelName: "veo-3.1-generate-preview", displayName: "Veo 3.1 首尾帧视频", officialMode: "image_to_video_first_last_frame", qualityTier: "standard", maxReferenceImages: 3 }),
  veoCapability({ modelId: "google-veo-3-1-extension", modelName: "veo-3.1-generate-preview", displayName: "Veo 3.1 视频延展", officialMode: "video_extension", qualityTier: "standard", maxReferenceImages: 3 }),
  veoCapability({ modelId: "google-veo-3-1-fast", modelName: "veo-3.1-fast-generate-preview", displayName: "Veo 3.1 Fast 文生视频", officialMode: "text_to_video", qualityTier: "fast", defaultResolution: "720p", maxReferenceImages: 3 }),
  veoCapability({ modelId: "google-veo-3-1-lite", modelName: "veo-3.1-lite-generate-preview", displayName: "Veo 3.1 Lite 文生视频", officialMode: "text_to_video", qualityTier: "lite", defaultResolution: "720p", supportedModes: [veoText, veoI2v, veoFirstLast], supportedResolutions: ["720p", "1080p"], supportsReferenceImages: false }),
  capability({
    providerId: "google",
    family: "omni",
    modelId: "google-omni-flash-10s",
    modelName: "omni_flash-10s",
    displayName: "Google Omni Flash 10s",
    officialMode: "text_to_video",
    adapterName: "googleRelayVideo",
    runtimeStatus: "verified",
    qualityTier: "fast",
    supportedModes: [
      mode({ mode: "text_to_video", label: "文生视频", requiredInputs: ["prompt"] }),
      mode({ mode: "image_to_video_first_frame", label: "图生视频", requiredInputs: ["prompt", "first_frame"], minImages: 1, maxImages: 1 }),
      mode({ mode: "reference_images_to_video", label: "参考图生视频", requiredInputs: ["prompt", "reference_images"], minImages: 1, maxImages: 7 })
    ],
    supportedAspectRatios: ["16:9", "9:16"],
    supportedDurations: [10],
    supportedResolutions: ["720p"],
    defaultAspectRatio: "16:9",
    defaultDuration: 10,
    defaultResolution: "720p",
    supportsAudio: false,
    supportsNegativePrompt: false,
    supportsPromptExtend: false,
    supportsSeed: false,
    supportsReferenceImages: true,
    maxReferenceImages: 7,
    maxImages: 7,
    resultType: "async_task"
  }),
  grokCapability({ modelId: "grok-imagine-video", modelName: "grok-imagine-video", displayName: "Grok Imagine Video（官方）", defaultDuration: 10 }),
  grokCapability({ modelId: "grok-video-3", modelName: "grok-video-3", displayName: "Grok Video 3", defaultDuration: 10 }),
  klingCapability({ modelId: "kling-3-0", modelName: "kling-v3-omni", displayName: "可灵 Kling 3.0 Omni", supportedDurations: klingLongDurations }),
  klingCapability({ modelId: "kling-2-6", modelName: "kling-v2-6", displayName: "可灵 Kling 2.6", supportedDurations: klingLongDurations }),
  klingCapability({ modelId: "kling-2-5", modelName: "kling-v2-5-turbo", displayName: "可灵 Kling 2.5 Turbo", qualityTier: "turbo", supportedModes: klingModesForDurations(klingStandardDurations).filter((item) => item.mode !== "reference_images_to_video"), supportsReferenceImages: false, maxImages: 2 }),
  klingCapability({ modelId: "kling-2-1-master", modelName: "kling-v2-1-master", displayName: "可灵 Kling 2.1 Master", supportedDurations: klingLongDurations }),
  klingCapability({ modelId: "kling-2-1", modelName: "kling-v2-1", displayName: "可灵 Kling 2.1", supportedDurations: klingLongDurations }),
  klingCapability({ modelId: "kling-2-master", modelName: "kling-v2-master", displayName: "可灵 Kling 2.0 Master", supportedDurations: klingLongDurations }),
  klingCapability({ modelId: "kling-1-6", modelName: "kling-v1-6", displayName: "可灵 Kling 1.6" }),
  klingCapability({ modelId: "kling-1-5", modelName: "kling-v1-5", displayName: "可灵 Kling 1.5", supportedModes: klingModesForDurations(klingStandardDurations).filter((item) => item.mode !== "reference_images_to_video"), supportsReferenceImages: false, maxImages: 2 }),
  klingCapability({ modelId: "kling-1", modelName: "kling-v1", displayName: "可灵 Kling 1.0", supportedModes: klingModesForDurations(klingStandardDurations).filter((item) => item.mode !== "reference_images_to_video"), supportsReferenceImages: false, maxImages: 2 }),
  capability({
    providerId: "seedance",
    family: "seedance",
    modelId: "seedance-2-0",
    modelName: "seedance-2.0",
    displayName: "Seedance 2.0",
    officialMode: "text_to_video",
    adapterName: "seedanceVideo",
    runtimeStatus: "not_implemented",
    qualityTier: "full",
    supportedModes: [
      mode({ mode: "text_to_video", label: "文生视频", requiredInputs: ["prompt"] }),
      mode({ mode: "image_to_video_first_frame", label: "图生视频", requiredInputs: ["prompt", "first_frame"], minImages: 1, maxImages: 1 })
    ],
    supportedAspectRatios: ["21:9", "16:9", "4:3", "1:1", "3:4", "9:16"],
    supportedDurations: range(4, 15),
    supportedResolutions: ["720P", "1080P"],
    defaultAspectRatio: "16:9",
    defaultDuration: 8,
    defaultResolution: "1080P",
    supportsAudio: true,
    supportsNegativePrompt: true,
    supportsPromptExtend: false,
    supportsSeed: true,
    supportsReferenceImages: true,
    maxReferenceImages: 3,
    resultType: "async_task"
  })
];

export function getVideoModelCapability(providerId?: string, modelId?: string, modelName?: string, officialMode?: OfficialVideoMode) {
  const candidates = videoModelCapabilities.filter(
    (item) =>
      item.providerId === providerId &&
      (!officialMode || item.officialMode === officialMode || item.supportedModes.some((mode) => mode.mode === officialMode)) &&
      ((modelId && item.modelId === modelId) || (modelName && item.modelName === modelName))
  );
  return candidates.find((item) => officialMode && item.officialMode === officialMode) ?? candidates[0];
}

export function getVideoModelCapabilityOrLegacy(providerId?: string, modelId?: string, modelName?: string, officialMode?: OfficialVideoMode) {
  const direct = getVideoModelCapability(providerId, modelId, modelName, officialMode);
  if (direct) return direct;
  if (providerId === "alibaba" && modelName === "wan2.7-i2v") return getVideoModelCapability("alibaba", "alibaba-wan-2-7-i2v-official", "wan2.7-i2v-2026-04-25", officialMode);
  if (providerId === "alibaba" && modelName === "wan2.7-t2v") return getVideoModelCapability("alibaba", "alibaba-wan-2-7-t2v-official", "wan2.7-t2v-2026-04-25", officialMode);
  return undefined;
}

export function capabilityForMode(capability: VideoModelCapability, mode: OfficialVideoMode) {
  return capability.supportedModes.find((item) => item.mode === mode);
}
