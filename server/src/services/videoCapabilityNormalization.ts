import type { ModelCapabilities, ModelInputMode } from "../types/model.js";

type VideoSupportedInput = NonNullable<ModelCapabilities["supportedInputs"]>[number];

const veoInputModes: ModelInputMode[] = ["text-to-video", "image-to-video", "reference-to-video", "first-last-frame"];
const veoSupportedInputs: VideoSupportedInput[] = ["text", "image", "first_frame", "reference_image", "first_last_frame"];
const grokInputModes: ModelInputMode[] = ["text-to-video", "image-to-video", "reference-to-video", "first-last-frame", "video-to-video"];
const grokSupportedInputs: VideoSupportedInput[] = ["text", "image", "first_frame", "reference_image", "first_last_frame", "video"];
const grokRelayGenerationInputModes: ModelInputMode[] = ["text-to-video", "image-to-video", "reference-to-video", "first-last-frame"];
const grokRelayGenerationSupportedInputs: VideoSupportedInput[] = ["text", "image", "first_frame", "reference_image", "first_last_frame"];
const seedance2InputModes: ModelInputMode[] = ["text-to-video", "image-to-video", "reference-to-video", "first-last-frame", "video-to-video"];
const seedance2SupportedInputs: VideoSupportedInput[] = ["text", "image", "first_frame", "reference_image", "first_last_frame", "video"];
const kling3InputModes: ModelInputMode[] = ["text-to-video", "image-to-video", "reference-to-video", "first-last-frame"];
const kling3SupportedInputs: VideoSupportedInput[] = ["text", "image", "first_frame", "reference_image", "first_last_frame"];
const omniFastInputModes: ModelInputMode[] = ["text-to-video", "image-to-video", "reference-to-video", "first-last-frame"];
const omniFastSupportedInputs: VideoSupportedInput[] = ["text", "image", "first_frame", "reference_image", "first_last_frame"];
const omniFastV2vInputModes: ModelInputMode[] = ["video-to-video"];
const omniFastV2vSupportedInputs: VideoSupportedInput[] = ["video"];
const omniFastDurations = [10];
const omniFastResolutions = ["720p", "1080p", "4k"];
const agnesInputModes: ModelInputMode[] = ["text-to-video", "image-to-video", "reference-to-video", "first-last-frame"];
const agnesSupportedInputs: VideoSupportedInput[] = ["text", "image", "first_frame", "reference_image", "first_last_frame"];

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
  return /omni[-_]?(?:fast|flash)(?:$|\s|[-_])/.test(identity) && !/omni[-_]?fast[-_]?v2v/.test(identity);
}

function isOmniFastV2VVideoModel(modelName?: string, capabilities?: ModelCapabilities) {
  const identity = `${modelName ?? ""} ${capabilities?.modelCapability?.model ?? ""} ${capabilities?.apiFamily ?? ""}`.toLowerCase();
  return /omni[-_]?fast[-_]?v2v/.test(identity);
}

function modelIdentity(providerId?: string, modelName?: string, capabilities?: ModelCapabilities) {
  return `${providerId ?? ""} ${modelName ?? ""} ${capabilities?.provider ?? ""} ${capabilities?.modelCapability?.model ?? ""}`.toLowerCase();
}

export function isGrokLikeVideoModel(providerId?: string, modelName?: string, capabilities?: ModelCapabilities) {
  return /(?:^|\s|[-_])grok(?:\s|[-_.]|$)/.test(modelIdentity(providerId, modelName, capabilities));
}

function isDuoyuanGrokGenerationModel(modelName?: string, capabilities?: ModelCapabilities) {
  const identity = `${modelName ?? ""} ${capabilities?.modelCapability?.model ?? ""}`.toLowerCase();
  return /grok[-_.]?video[-_.]?3|grok[-_.]?1[-_.]?5[-_.]?video/.test(identity);
}

export function isAgnesVideoModel(providerId?: string, modelName?: string, capabilities?: ModelCapabilities) {
  return /agnes|agnes_video/.test(`${providerId ?? ""} ${capabilities?.provider ?? ""} ${capabilities?.apiFamily ?? ""}`.toLowerCase());
}

export function isZhipuVideoModel(providerId?: string, modelName?: string, capabilities?: ModelCapabilities) {
  return /zhipu|bigmodel|zhipu_video/.test(`${providerId ?? ""} ${capabilities?.provider ?? ""} ${capabilities?.apiFamily ?? ""}`.toLowerCase());
}

function zhipuCapabilities(modelName: string, capabilities: ModelCapabilities): ModelCapabilities {
  const name = modelName.toLowerCase();
  const isTextOnly = /viduq1[-_]?text/.test(name);
  const isImageOnly = /viduq1[-_]?image|vidu2[-_]?image/.test(name);
  const isStartEnd = /start[-_]?end/.test(name);
  const isReference = /reference/.test(name);
  const isVidu2 = /vidu2/.test(name);
  const isCogVideo3 = /cogvideox[-_]?3/.test(name);
  const inputModes: ModelInputMode[] = isTextOnly
    ? ["text-to-video"]
    : isImageOnly
      ? ["image-to-video"]
      : isStartEnd
      ? ["first-last-frame"]
      : isReference
        ? ["reference-to-video"]
        : isCogVideo3
          ? ["text-to-video", "image-to-video", "first-last-frame"]
          : ["text-to-video", "image-to-video"];
  const supported: VideoSupportedInput[] = isTextOnly
    ? ["text"]
    : isImageOnly
      ? ["image", "first_frame"]
      : isStartEnd
      ? ["image", "first_last_frame"]
      : isReference
        ? ["image", "reference_image"]
        : isCogVideo3
          ? ["text", "image", "first_frame", "first_last_frame"]
          : ["text", "image", "first_frame"];
  const durations = isVidu2 ? [4] : isCogVideo3 ? [5, 10] : [5];
  const resolutions = isVidu2 ? ["480p", "720p"] : isCogVideo3 ? ["720p", "1080p", "4k"] : ["1080p"];
  const channelCapability = {
    ...capabilities.channelCapability,
    provider: "zhipu" as const,
    channel: "official" as const,
    apiFamily: "zhipu_video" as const,
    endpoint: "/videos/generations",
    createEndpoint: "/videos/generations",
    pollEndpoint: "/async-result/{taskId}",
    authType: "bearer" as const,
    requestFormat: "json" as const,
    taskMode: "async" as const,
    idField: "id",
    taskIdField: "id",
    statusField: "task_status",
    resultField: "",
    supportedInputs: supported,
    imageTransport: isTextOnly ? "unsupported" as const : "url" as const,
    imageField: "image_url"
  };
  return {
    ...capabilities,
    provider: "zhipu",
    channel: "official",
    apiFamily: "zhipu_video",
    createEndpoint: "/videos/generations",
    endpoint: "/videos/generations",
    pollEndpoint: "/async-result/{taskId}",
    authType: "bearer",
    requestFormat: "json",
    taskMode: "async",
    idField: "id",
    taskIdField: "id",
    statusField: "task_status",
    resultField: "",
    inputModes,
    supportedInputs: supported,
    imageTransport: isTextOnly ? "unsupported" : "url",
    imageField: "image_url",
    duration: { type: "enum", values: durations },
    supportedDurations: durations,
    aspectRatios: ["16:9", "9:16", "1:1"],
    supportedAspectRatios: ["16:9", "9:16", "1:1"],
    resolutions,
    supportedResolutions: resolutions,
    supportsImageInput: !isTextOnly,
    supportsReferenceImage: isReference,
    supportsFirstLastFrame: isStartEnd || isCogVideo3,
    supportsMultiImageInput: isReference || isStartEnd || isCogVideo3,
    maxReferenceImages: isReference ? 3 : isStartEnd || isCogVideo3 ? 2 : 1,
    channelCapability
  };
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
  if (capabilities.capabilitySource === "upstream" || capabilities.capabilitySource === "official") {
    return capabilities;
  }
  if (isAgnesVideoModel(providerId, modelName, capabilities)) {
    const channelCapability = {
      ...capabilities.channelCapability,
      provider: "agnes" as const,
      channel: "official" as const,
      apiFamily: "agnes_video" as const,
      endpoint: "/v1/videos",
      createEndpoint: "/v1/videos",
      pollEndpoint: "/agnesapi?video_id={taskId}",
      authType: "bearer" as const,
      requestFormat: "json" as const,
      taskMode: "async" as const,
      idField: "video_id",
      taskIdField: "video_id",
      statusField: "status",
      resultField: "",
      supportedInputs: agnesSupportedInputs,
      imageTransport: "url" as const,
      imageField: "image"
    };
    return {
      ...capabilities,
      provider: "agnes",
      channel: "official",
      apiFamily: "agnes_video",
      endpoint: "/v1/videos",
      createEndpoint: "/v1/videos",
      pollEndpoint: "/agnesapi?video_id={taskId}",
      authType: "bearer",
      requestFormat: "json",
      taskMode: "async",
      idField: "video_id",
      taskIdField: "video_id",
      statusField: "status",
      resultField: "",
      inputModes: agnesInputModes,
      supportedInputs: agnesSupportedInputs,
      imageTransport: "url",
      imageField: "image",
      duration: { type: "enum", values: [3, 4, 5, 6, 8, 10, 15, 18] },
      supportedDurations: [3, 4, 5, 6, 8, 10, 15, 18],
      aspectRatios: ["16:9", "9:16", "1:1", "4:3", "3:4"],
      supportedAspectRatios: ["16:9", "9:16", "1:1", "4:3", "3:4"],
      resolutions: ["480p", "720p", "1080p"],
      supportedResolutions: ["480p", "720p", "1080p"],
      supportsImageInput: true,
      supportsReferenceImage: true,
      supportsFirstLastFrame: true,
      supportsMultiImageInput: true,
      supportsVideoInput: false,
      maxReferenceImages: 8,
      channelCapability
    };
  }

  if (isZhipuVideoModel(providerId, modelName, capabilities)) {
    return zhipuCapabilities(modelName ?? capabilities.modelCapability?.model ?? "", capabilities);
  }

  if (isOmniFastV2VVideoModel(modelName, capabilities)) {
    const normalized: ModelCapabilities = {
      ...capabilities,
      apiFamily: "omni_fast_v2v",
      inputModes: omniFastV2vInputModes,
      supportedInputs: omniFastV2vSupportedInputs,
      modelCapability: {
        ...capabilities.modelCapability,
        supportsTextToVideo: false,
        supportsImageToVideo: false,
        supportsReferenceToVideo: false,
        supportsFirstLastFrame: false,
        supportsVideoToVideo: true
      },
      duration: { type: "fixed", value: 10 },
      supportedDurations: omniFastDurations,
      aspectRatios: ["16:9", "9:16"],
      supportedAspectRatios: ["16:9", "9:16"],
      resolutions: omniFastResolutions,
      supportedResolutions: omniFastResolutions,
      imageTransport: "unsupported",
      videoTransport: capabilities.videoTransport ?? "url_or_base64_json",
      videoField: "video",
      supportsVideoInput: true,
      supportsImageInput: false,
      supportsReferenceImage: false,
      supportsFirstLastFrame: false,
      supportsMultiImageInput: false,
      maxReferenceImages: 0,
      maxReferenceVideos: 1
    };
    if (capabilities.channelCapability) {
      normalized.channelCapability = {
        ...capabilities.channelCapability,
        apiFamily: "omni_fast_v2v",
        supportedInputs: omniFastV2vSupportedInputs,
        imageTransport: "unsupported",
        videoTransport: capabilities.channelCapability.videoTransport ?? "url_or_base64_json",
        videoField: capabilities.channelCapability.videoField ?? "video"
      };
    }
    return normalized;
  }

  if (isOmniFastVideoModel(modelName, capabilities)) {
    const normalized: ModelCapabilities = {
      ...capabilities,
      apiFamily: "omni_fast",
      inputModes: omniFastInputModes,
      supportedInputs: omniFastSupportedInputs,
      modelCapability: {
        ...capabilities.modelCapability,
        supportsTextToVideo: true,
        supportsImageToVideo: true,
        supportsReferenceToVideo: true,
        supportsFirstLastFrame: true,
        supportsVideoToVideo: false
      },
      duration: { type: "fixed", value: 10 },
      supportedDurations: omniFastDurations,
      aspectRatios: union(capabilities.aspectRatios, ["16:9", "9:16"]),
      supportedAspectRatios: union(capabilities.supportedAspectRatios, ["16:9", "9:16"]),
      resolutions: omniFastResolutions,
      supportedResolutions: omniFastResolutions,
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
        supportedInputs: omniFastSupportedInputs,
        imageTransport: "url",
        imageField: capabilities.channelCapability.imageField ?? "images"
      };
    }
    return normalized;
  }

  if (isKling3LikeVideoModel(providerId, modelName, capabilities) && !/(?:^|[-_])noref(?:$|[-_])/.test((modelName ?? "").toLowerCase())) {
    const normalized: ModelCapabilities = {
      ...capabilities,
      inputModes: union(capabilities.inputModes, kling3InputModes),
      supportedInputs: union(capabilities.supportedInputs, kling3SupportedInputs),
      modelCapability: {
        ...capabilities.modelCapability,
        supportsTextToVideo: true,
        supportsImageToVideo: true,
        supportsReferenceToVideo: true,
        supportsFirstLastFrame: true,
        supportsVideoToVideo: false
      },
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
    const isRelayGeneration = isDuoyuanGrokGenerationModel(modelName, capabilities);
    const inputModes = isRelayGeneration ? grokRelayGenerationInputModes : union(capabilities.inputModes, grokInputModes);
    const supportedInputs = isRelayGeneration ? grokRelayGenerationSupportedInputs : union(capabilities.supportedInputs, grokSupportedInputs);
    const normalized: ModelCapabilities = {
      ...capabilities,
      inputModes,
      supportedInputs,
      modelCapability: {
        ...capabilities.modelCapability,
        supportsTextToVideo: true,
        supportsImageToVideo: true,
        supportsReferenceToVideo: true,
        supportsFirstLastFrame: true,
        supportsVideoToVideo: !isRelayGeneration
      },
      imageTransport: capabilities.imageTransport === "unsupported" ? undefined : capabilities.imageTransport,
      videoTransport: isRelayGeneration ? undefined : capabilities.videoTransport === "unsupported" ? "multipart_file" : capabilities.videoTransport ?? "multipart_file",
      supportsImageInput: true,
      supportsReferenceImage: true,
      supportsFirstLastFrame: true,
      supportsMultiImageInput: true,
      supportsVideoInput: !isRelayGeneration,
      maxReferenceImages: capabilities.maxReferenceImages ?? 7
    };
    if (capabilities.channelCapability) {
      normalized.channelCapability = {
        ...capabilities.channelCapability,
        supportedInputs: isRelayGeneration ? grokRelayGenerationSupportedInputs : union(capabilities.channelCapability.supportedInputs, grokSupportedInputs),
        imageTransport: capabilities.channelCapability.imageTransport === "unsupported" ? undefined : capabilities.channelCapability.imageTransport,
        videoTransport: isRelayGeneration
          ? undefined
          : capabilities.channelCapability.videoTransport === "unsupported"
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
