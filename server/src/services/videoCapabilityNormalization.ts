import type { ModelCapabilities, ModelInputMode } from "../types/model.js";

type VideoSupportedInput = NonNullable<ModelCapabilities["supportedInputs"]>[number];

const veoInputModes: ModelInputMode[] = ["text-to-video", "image-to-video", "reference-to-video", "first-last-frame"];
const veoSupportedInputs: VideoSupportedInput[] = ["text", "image", "first_frame", "reference_image", "first_last_frame"];
const grokInputModes: ModelInputMode[] = ["text-to-video", "image-to-video", "reference-to-video", "first-last-frame", "video-to-video"];
const grokSupportedInputs: VideoSupportedInput[] = ["text", "image", "first_frame", "reference_image", "first_last_frame", "video"];
const seedance2InputModes: ModelInputMode[] = ["text-to-video", "image-to-video", "reference-to-video", "first-last-frame", "video-to-video"];
const seedance2SupportedInputs: VideoSupportedInput[] = ["text", "image", "first_frame", "reference_image", "first_last_frame", "video"];
const kling3InputModes: ModelInputMode[] = ["text-to-video", "image-to-video", "reference-to-video", "first-last-frame"];
const kling3SupportedInputs: VideoSupportedInput[] = ["text", "image", "first_frame", "reference_image", "first_last_frame"];
const omniFastInputModes: ModelInputMode[] = ["text-to-video", "image-to-video", "reference-to-video", "first-last-frame"];
const omniFastSupportedInputs: VideoSupportedInput[] = ["text", "image", "first_frame", "reference_image", "first_last_frame"];

function union<T>(base: readonly T[] | undefined, additions: readonly T[]) {
  return Array.from(new Set([...(base ?? []), ...additions]));
}

export function isVeoLikeVideoModel(providerId?: string, modelName?: string, capabilities?: ModelCapabilities) {
  const identity = `${providerId ?? ""} ${modelName ?? ""} ${capabilities?.provider ?? ""} ${capabilities?.modelCapability?.model ?? ""}`.toLowerCase();
  return /\b(?:google|gemini|veo)\b/.test(identity) || /veo[-_ .]?\d|veo_/.test(identity);
}

export function isOmniFastVideoModel(modelName?: string, capabilities?: ModelCapabilities) {
  const identity = `${modelName ?? ""} ${capabilities?.modelCapability?.model ?? ""} ${capabilities?.apiFamily ?? ""}`.toLowerCase();
  if (/omni[-_]?flash[-_]?10s/.test(identity)) return false;
  return /omni[-_]?fast(?:$|\s|[-_])/.test(identity) && !/omni[-_]?fast[-_]?v2v/.test(identity);
}

function modelIdentity(providerId?: string, modelName?: string, capabilities?: ModelCapabilities) {
  return `${providerId ?? ""} ${modelName ?? ""} ${capabilities?.provider ?? ""} ${capabilities?.modelCapability?.model ?? ""}`.toLowerCase();
}

export function isGrokLikeVideoModel(providerId?: string, modelName?: string, capabilities?: ModelCapabilities) {
  return /(?:^|\s|[-_])grok(?:\s|[-_.]|$)/.test(modelIdentity(providerId, modelName, capabilities));
}

export function isSeedance2LikeVideoModel(providerId?: string, modelName?: string, capabilities?: ModelCapabilities) {
  return /seedance[-_ .]?2(?:[-_ .]?0)?|doubao[-_]?seedance[-_]?2[-_]?0/.test(modelIdentity(providerId, modelName, capabilities));
}

function isKling3LikeVideoModel(providerId?: string, modelName?: string, capabilities?: ModelCapabilities) {
  const identity = modelIdentity(providerId, modelName, capabilities);
  return /kling|\u53ef\u7075/.test(identity) && /(3[._ -]?0|v3|omni)/.test(identity);
}

export function normalizeVideoCapabilities(
  capabilities: ModelCapabilities,
  providerId?: string,
  modelName?: string
): ModelCapabilities {
  if (isOmniFastVideoModel(modelName, capabilities)) {
    const normalized: ModelCapabilities = {
      ...capabilities,
      apiFamily: "omni_fast",
      inputModes: union(capabilities.inputModes, omniFastInputModes),
      supportedInputs: union(capabilities.supportedInputs, omniFastSupportedInputs),
      duration: { type: "range", min: 4, max: 30, step: 1 },
      supportedDurations: Array.from({ length: 27 }, (_, index) => index + 4),
      aspectRatios: union(capabilities.aspectRatios, ["16:9", "9:16"]),
      supportedAspectRatios: union(capabilities.supportedAspectRatios, ["16:9", "9:16"]),
      resolutions: union(capabilities.resolutions, ["720p", "1080p", "2k", "4k"]),
      supportedResolutions: union(capabilities.supportedResolutions, ["720p", "1080p", "2k", "4k"]),
      imageTransport: "url",
      imageField: "first_image_url",
      supportsImageInput: true,
      supportsReferenceImage: true,
      supportsFirstLastFrame: true,
      supportsMultiImageInput: true,
      maxReferenceImages: 5
    };
    if (capabilities.channelCapability) {
      normalized.channelCapability = {
        ...capabilities.channelCapability,
        apiFamily: "omni_fast",
        supportedInputs: union(capabilities.channelCapability.supportedInputs, omniFastSupportedInputs),
        imageTransport: "url",
        imageField: "first_image_url"
      };
    }
    return normalized;
  }

  if (isKling3LikeVideoModel(providerId, modelName, capabilities) && !/(?:^|[-_])noref(?:$|[-_])/.test((modelName ?? "").toLowerCase())) {
    const normalized: ModelCapabilities = {
      ...capabilities,
      inputModes: union(capabilities.inputModes, kling3InputModes),
      supportedInputs: union(capabilities.supportedInputs, kling3SupportedInputs),
      imageTransport: capabilities.imageTransport === "unsupported" ? "url_or_asset" : capabilities.imageTransport ?? "url_or_asset",
      supportsImageInput: true,
      supportsReferenceImage: true,
      supportsFirstLastFrame: true,
      supportsMultiImageInput: true,
      supportsAudio: true,
      maxReferenceImages: capabilities.maxReferenceImages ?? 4
    };
    if (capabilities.channelCapability) {
      normalized.channelCapability = {
        ...capabilities.channelCapability,
        apiFamily: capabilities.channelCapability.apiFamily ?? "aigc_video_json",
        supportedInputs: union(capabilities.channelCapability.supportedInputs, kling3SupportedInputs),
        imageTransport: capabilities.channelCapability.imageTransport === "unsupported" ? "url_or_asset" : capabilities.channelCapability.imageTransport ?? "url_or_asset",
        imageField: capabilities.channelCapability.imageField ?? "image"
      };
    }
    return normalized;
  }

  if (isGrokLikeVideoModel(providerId, modelName, capabilities)) {
    const normalized: ModelCapabilities = {
      ...capabilities,
      inputModes: union(capabilities.inputModes, grokInputModes),
      supportedInputs: union(capabilities.supportedInputs, grokSupportedInputs),
      imageTransport: capabilities.imageTransport === "unsupported" ? undefined : capabilities.imageTransport,
      videoTransport: capabilities.videoTransport === "unsupported" ? "multipart_file" : capabilities.videoTransport ?? "multipart_file",
      supportsImageInput: true,
      supportsReferenceImage: true,
      supportsFirstLastFrame: true,
      supportsMultiImageInput: true,
      supportsVideoInput: true,
      maxReferenceImages: capabilities.maxReferenceImages ?? 7
    };
    if (capabilities.channelCapability) {
      normalized.channelCapability = {
        ...capabilities.channelCapability,
        supportedInputs: union(capabilities.channelCapability.supportedInputs, grokSupportedInputs),
        imageTransport: capabilities.channelCapability.imageTransport === "unsupported" ? undefined : capabilities.channelCapability.imageTransport,
        videoTransport: capabilities.channelCapability.videoTransport === "unsupported"
          ? "multipart_file"
          : capabilities.channelCapability.videoTransport ?? "multipart_file"
      };
    }
    return normalized;
  }

  if (isSeedance2LikeVideoModel(providerId, modelName, capabilities)) {
    const normalized: ModelCapabilities = {
      ...capabilities,
      inputModes: union(capabilities.inputModes, seedance2InputModes),
      supportedInputs: union(capabilities.supportedInputs, seedance2SupportedInputs),
      imageTransport: capabilities.imageTransport === "unsupported" ? "url_or_asset" : capabilities.imageTransport ?? "url_or_asset",
      videoTransport: capabilities.videoTransport === "unsupported" ? "url_or_asset" : capabilities.videoTransport ?? "url_or_asset",
      supportsImageInput: true,
      supportsReferenceImage: true,
      supportsFirstLastFrame: true,
      supportsMultiImageInput: true,
      supportsVideoInput: true,
      supportsAudio: true,
      maxReferenceImages: capabilities.maxReferenceImages ?? 9,
      maxReferenceVideos: capabilities.maxReferenceVideos ?? 3,
      maxReferenceAudios: capabilities.maxReferenceAudios ?? 3,
      maxReferenceFiles: capabilities.maxReferenceFiles ?? 12
    };
    if (capabilities.channelCapability) {
      normalized.channelCapability = {
        ...capabilities.channelCapability,
        supportedInputs: union(capabilities.channelCapability.supportedInputs, seedance2SupportedInputs),
        imageTransport: capabilities.channelCapability.imageTransport === "unsupported" ? "url_or_asset" : capabilities.channelCapability.imageTransport ?? "url_or_asset",
        videoTransport: capabilities.channelCapability.videoTransport === "unsupported" ? "url_or_asset" : capabilities.channelCapability.videoTransport ?? "url_or_asset"
      };
    }
    return normalized;
  }

  if (!isVeoLikeVideoModel(providerId, modelName, capabilities)) return capabilities;
  const normalized: ModelCapabilities = {
    ...capabilities,
    inputModes: union(capabilities.inputModes, veoInputModes),
    supportedInputs: union(capabilities.supportedInputs, veoSupportedInputs),
    imageTransport: capabilities.imageTransport === "unsupported" ? undefined : capabilities.imageTransport,
    supportsImageInput: true,
    supportsReferenceImage: true,
    supportsFirstLastFrame: true,
    supportsMultiImageInput: true,
    maxReferenceImages: capabilities.maxReferenceImages ?? 3
  };
  if (capabilities.channelCapability) {
    normalized.channelCapability = {
      ...capabilities.channelCapability,
      supportedInputs: union(capabilities.channelCapability.supportedInputs, veoSupportedInputs),
      imageTransport: capabilities.channelCapability.imageTransport === "unsupported" ? undefined : capabilities.channelCapability.imageTransport
    };
  }
  return normalized;
}
