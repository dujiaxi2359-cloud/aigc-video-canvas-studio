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

export type VideoAssetTransport = "direct_url" | "cdn_url" | "openai_content_image_url" | "provider_asset";
export type VideoAssetProvider = "seedance_asset" | "custom_asset";

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

export type ProviderType = "official" | "openai_compatible";

export type ModelCapabilityKind =
  | "text"
  | "image_generation"
  | "image_edit"
  | "text_to_video"
  | "image_to_video"
  | "reference_to_video"
  | "video_to_video";

export type ModelRuntimeStatus = "ready" | "need_config" | "failed" | "unsupported";
export type OpenAiCompatibleFallbackMode = "openai_first_then_unified";
export type EndpointFamily =
  | "openai_chat_completions"
  | "openai_images_generation"
  | "openai_images_edits"
  | "gemini_generate_content"
  | "openai_videos"
  | "openai_video_create"
  | "unified_video_create"
  | "mj_task_submit"
  | "unknown";
export type ImageEndpointFamily = Extract<EndpointFamily, "openai_images_generation" | "openai_images_edits" | "gemini_generate_content" | "unknown">;

export type OpenAiCompatibleConfig = {
  chatEndpoint?: string;
  imageGenerationEndpoint?: string;
  imageEditEndpoint?: string;
  videoCreateEndpoint?: string;
  unifiedVideoCreateEndpoint?: string;
  videoPollEndpoint?: string;
  videoPollMethod?: "GET" | "POST";
  videoPollBodyKey?: "id" | "task_id" | "taskId" | "video_id" | "job_id";
  videoPollIdLocation?: "path" | "query" | "body";
  videoPollHeaders?: Record<string, string>;
  authHeader?: string | Record<string, string>;
  queryParams?: Record<string, string | number | boolean | undefined>;
  requestTimeout?: number;
  pollInterval?: number;
  maxPollAttempts?: number;
  pollTimeout?: number;
  fallbackMode?: OpenAiCompatibleFallbackMode;
};

export type ModelCapabilities = {
  providerType?: ProviderType;
  endpointFamily?: EndpointFamily;
  capability?: ModelCapabilityKind;
  capabilityKinds?: ModelCapabilityKind[];
  modelStatus?: ModelRuntimeStatus;
  openaiCompatibleConfig?: OpenAiCompatibleConfig;
  capabilitySource?: "official" | "upstream" | "legacy_inferred";
  upstreamModelId?: string;
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
    assetTransport?: ModelCapabilities["assetTransport"];
    assetProvider?: ModelCapabilities["assetProvider"];
    assetGroupCreateEndpoint?: string;
    assetCreateEndpoint?: string;
    assetUploadAuthMode?: ModelCapabilities["assetUploadAuthMode"];
    assetUrlScheme?: string;
    assetIdPath?: string;
    tokenSource?: ModelCapabilities["tokenSource"];
    imageField?: string;
    videoField?: string;
  };
  duration?: DurationCapability;
  aspectRatios?: string[];
  resolutions?: string[];
  inputModes: ModelInputMode[];
  provider?: "doubao" | "veo" | "kling" | "sora" | "wan" | "minimax" | "agnes" | "zhipu" | "custom";
  channel?: "official" | "proxy" | "legacy_custom";
  apiFamily?: "openai_videos" | "grok_video" | "doubao_seedance15" | "aigc_video_json" | "omni_fast" | "omni_fast_v2v" | "seedance2_native" | "unified_video_create" | "agnes_video" | "zhipu_video" | "official_provider";
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
  assetTransport?: VideoAssetTransport;
  assetProvider?: VideoAssetProvider;
  assetGroupCreateEndpoint?: string;
  assetCreateEndpoint?: string;
  assetUploadAuthMode?: "bearer" | "api-key" | "none";
  assetUrlScheme?: string;
  assetIdPath?: string;
  tokenSource?: "provider.apiKey";
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
  healthStatus?:
    | "ready"
    | "untested"
    | "testing"
    | "running_slow"
    | "need_config"
    | "channel_unavailable"
    | "poll_endpoint_missing"
    | "result_parse_failed"
    | "return_to_canvas_issue"
    | "provider_failed"
    | "safety_blocked"
    | "quota_or_balance_error"
    | "unsupported"
    | "unknown_error";
  lastHealthCheckAt?: number;
  lastSuccessAt?: number;
  lastFailureAt?: number;
  lastErrorCode?: string;
  lastErrorMessage?: string;
  capabilityHealth?: Record<string, unknown>;
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
