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
  providerType?: "official" | "openai_compatible" | "legacy_supported";
  adapterFamily?: "provider_native" | "openai_compatible" | "legacy_supported";
  endpointFamily?: "openai_images_generation" | "openai_images_edits" | "image_to_image" | "legacy_image_edit" | "provider_native";
  capability?: "text_to_image" | "image_generation" | "image_to_image" | "image_edit";
  modelCapability?: {
    model?: string;
    supportsText?: boolean;
    supportsTextToImage?: boolean;
    supportsImageToImage?: boolean;
    supportsImageEdit?: boolean;
    supportsTextToVideo?: boolean;
    supportsImageToVideo?: boolean;
    supportsReferenceToVideo?: boolean;
    supportsFirstLastFrame?: boolean;
    supportsVideoToVideo?: boolean;
  };
  channelCapability?: {
    provider?: string;
    channel?: "official" | "proxy" | "legacy_custom";
    apiFamily?: ModelCapabilities["apiFamily"];
    endpoint?: string;
    createEndpoint?: string;
    pollEndpoint?: string;
    authType?: ModelCapabilities["authType"];
    requestFormat?: ModelCapabilities["requestFormat"];
    taskMode?: ModelCapabilities["taskMode"];
    idField?: string;
    taskIdField?: string;
    statusField?: string;
    resultField?: string;
    supportedInputs?: ModelCapabilities["supportedInputs"];
    imageTransport?: ModelCapabilities["imageTransport"];
    videoTransport?: ModelCapabilities["videoTransport"];
    imageField?: string;
    videoField?: string;
  };
  duration?: DurationCapability;
  aspectRatios?: string[];
  resolutions?: string[];
  inputModes: ModelInputMode[];
  provider?: "doubao" | "veo" | "kling" | "sora" | "wan" | "minimax" | "custom";
  channel?: "official" | "proxy" | "legacy_custom";
  apiFamily?: "openai_videos" | "grok_video" | "doubao_seedance15" | "aigc_video_json" | "omni_fast" | "omni_fast_v2v" | "seedance2_native" | "unified_video_create" | "official_provider";
  endpoint?: string;
  createEndpoint?: string;
  pollEndpoint?: string;
  authType?: "bearer" | "api-key" | "none";
  requestFormat?: "json" | "multipart";
  taskMode?: "async";
  idField?: string;
  taskIdField?: string;
  statusField?: string;
  resultField?: string;
  supportedInputs?: Array<"text" | "image" | "first_frame" | "reference_image" | "first_last_frame" | "video">;
  imageTransport?: "url" | "url_or_asset" | "base64_json" | "multipart_file" | "unsupported";
  videoTransport?: "url" | "url_or_asset" | "url_or_base64_json" | "base64_json" | "multipart_file" | "unsupported";
  imageField?: string;
  videoField?: string;
  supportedAspectRatios?: string[];
  supportedDurations?: number[];
  supportedResolutions?: string[];
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
  supportsPromptExtend?: boolean;
  contextWindow?: number;
  supportsNegativePrompt?: boolean;
  supportsSeed?: boolean;
  supportsCameraControl?: boolean;
  supportsAudio?: boolean;
  maxReferenceImages?: number;
  maxReferenceVideos?: number;
  maxReferenceAudios?: number;
  maxReferenceFiles?: number;
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
  workspaceId?: string;
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
