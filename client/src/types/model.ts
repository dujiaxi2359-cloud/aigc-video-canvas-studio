import type { OfficialVideoMode } from "./videoModes";

export type DurationCapability =
  | { type: "fixed"; value: number }
  | { type: "enum"; values: number[] }
  | { type: "range"; min: number; max: number; step: number };

export type ImageInputMode = "text-to-image" | "image-to-image" | "image-edit";

export type VideoInputMode =
  | "text-to-video"
  | "image-to-video"
  | "first-last-frame"
  | "reference-to-video"
  | "video-to-video";

export type TextInputMode = "text";

export type ModelInputMode = TextInputMode | ImageInputMode | VideoInputMode;

export type ModelType =
  | "text"
  | "image"
  | "text-to-image"
  | "image-to-image"
  | "image-edit"
  | "text-to-video"
  | "image-to-video"
  | "video-to-video"
  | "audio"
  | "tts";

export type ModelCapabilities = {
  duration?: DurationCapability;
  aspectRatios?: string[];
  resolutions?: string[];
  inputModes: ModelInputMode[];
  imageSizes?: string[];
  imageAspectRatios?: string[];
  imageQualities?: string[];
  imageFormats?: string[];
  supportsTransparentBackground?: boolean;
  supportsImageInput?: boolean;
  supportsMultiImageInput?: boolean;
  supportsMask?: boolean;
  supportsReferenceImage?: boolean;
  supportsFirstLastFrame?: boolean;
  supportsVideoInput?: boolean;
  supportsMotionControl?: boolean;
  contextWindow?: number;
  supportsNegativePrompt?: boolean;
  supportsSeed?: boolean;
  supportsCameraControl?: boolean;
  supportsAudio?: boolean;
  supportsWatermark?: boolean;
  constraints?: unknown[];
};

export type ModelCatalogItem = {
  id: string;
  providerId?: string;
  provider: string;
  category: "image" | "video" | "text" | "audio" | "custom";
  name: string;
  displayName: string;
  modelType: ModelType;
  defaultApiBaseUrl: string;
  requiresApiBaseUrl: boolean;
  requiresApiKey: boolean;
  capabilities: ModelCapabilities;
};

export type ModelConfig = {
  id: string;
  providerId?: string;
  provider: string;
  category?: ModelCatalogItem["category"];
  displayName: string;
  apiBaseUrl: string;
  requiresApiBaseUrl?: boolean;
  maskedApiKey?: string;
  modelName: string;
  modelType: ModelType;
  enabled: boolean;
  capabilities: ModelCapabilities;
  createdAt: number;
  updatedAt: number;
};

export type AvailableVideoOptions = {
  availableDurations: number[];
  availableAspectRatios: string[];
  availableResolutions: string[];
  availableInputModes: VideoInputMode[];
  availableVideoModes?: OfficialVideoMode[];
  videoModeLabels?: Record<string, string>;
  unavailableVideoModes?: Array<{ mode: OfficialVideoMode; label: string; reason: string }>;
  lockedFields: { duration?: boolean; resolution?: boolean; aspectRatio?: boolean; inputMode?: boolean };
  warningMessage?: string;
  normalizedSelection: {
    duration?: number;
    aspectRatio?: string;
    resolution?: string;
    inputMode?: VideoInputMode;
    videoMode?: OfficialVideoMode;
  };
};

export type AvailableImageOptions = {
  availableImageSizes: string[];
  availableImageQualities: string[];
  availableImageFormats: string[];
  availableInputModes: ImageInputMode[];
  warningMessage?: string;
  normalizedSelection: {
    imageSize?: string;
    imageQuality?: string;
    imageFormat?: string;
    inputMode?: ImageInputMode;
  };
};
