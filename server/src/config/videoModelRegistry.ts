export type VideoInterfaceKind = "official" | "relay";
export type VideoOfficialStatus = "verified" | "needs_check" | "not_official" | "unknown";
export type VideoSchemaSource = "manual" | "relay-model-list" | "relay-health-check" | "unknown";
export type VideoTaskMode = "sync" | "async";
export type VideoUnknownNumber = number | "unknown";

export type VideoModelCapabilities = {
  textToVideo?: boolean;
  imageToVideo?: boolean;
  referenceToVideo?: boolean;
  firstFrameToVideo?: boolean;
  firstLastFrameToVideo?: boolean;
  videoToVideo?: boolean;
  videoExtend?: boolean;
  multiImageReference?: boolean;
  videoReference?: boolean;
  audioReference?: boolean;
  nativeAudio?: boolean;
  lipSync?: boolean;
  cameraControl?: boolean;
  motionControl?: boolean;
  multiShot?: boolean;
  storyboard?: boolean;
  promptExtend?: boolean;
};

export type VideoInputSupport = {
  text?: boolean;
  images?: boolean;
  maxImages?: VideoUnknownNumber;
  videos?: boolean;
  maxVideos?: VideoUnknownNumber;
  audios?: boolean;
  maxAudios?: VideoUnknownNumber;
};

export type VideoOutputSupport = {
  video: true;
  audio?: boolean;
};

export type VideoBaseParameters = {
  aspectRatios?: string[];
  resolutions?: string[];
  concreteSizes?: string[];
  durations?: number[];
  durationRange?: [number, number] | null;
  fps?: number[];
  outputFormats?: string[];
  maxPromptLength?: VideoUnknownNumber;
  seed?: boolean;
  negativePrompt?: boolean;
  generateAudio?: boolean;
};

export type VideoInterfaceConfig = {
  enabled: boolean;
  label: "官方接口" | "中转接口";
  apiBaseUrl: string;
  apiKeyRef: string;
  modelId: string;
  adapter: string;
  requestMapper: string;
  responseParser: string;
  taskMode: VideoTaskMode;
  capabilityOverride?: Partial<VideoModelCapabilities> | null;
  parameterOverride?: Partial<VideoBaseParameters> | null;
  schemaSource?: VideoSchemaSource;
};

export type VideoModelRegistryEntry = {
  registryId: string;
  displayName: string;
  provider: string;
  providerLabel: string;
  modality: "video";
  defaultInterface: VideoInterfaceKind;
  selectedInterface: VideoInterfaceKind;
  officialStatus: VideoOfficialStatus;
  sourceNote: string;
  capabilities: VideoModelCapabilities;
  inputSupport: VideoInputSupport;
  outputSupport: VideoOutputSupport;
  baseParameters: VideoBaseParameters;
  interfaces: {
    official?: VideoInterfaceConfig;
    relay?: VideoInterfaceConfig;
  };
  ui: {
    tags: string[];
    recommended?: boolean;
    experimental?: boolean;
    visible?: boolean;
  };
};

const googleBase = "https://generativelanguage.googleapis.com/v1beta";
const googleVeoOfficial = (modelId: string): VideoInterfaceConfig => ({
  enabled: true,
  label: "官方接口",
  apiBaseUrl: googleBase,
  apiKeyRef: "GOOGLE_API_KEY",
  modelId,
  adapter: "googleVeoOfficialAdapter",
  requestMapper: "googleVeoRequestMapper",
  responseParser: "googleVeoResponseParser",
  taskMode: "async"
});

const openAiRelay = (modelId: string, adapter: string, parser: string): VideoInterfaceConfig => ({
  enabled: true,
  label: "中转接口",
  apiBaseUrl: "",
  apiKeyRef: "VIDEO_RELAY_API_KEY",
  modelId,
  adapter,
  requestMapper: "openAiCompatibleVideoRequestMapper",
  responseParser: parser,
  taskMode: "async",
  schemaSource: "unknown"
});

const seedanceBaseParameters: VideoBaseParameters = {
  aspectRatios: ["21:9", "16:9", "4:3", "1:1", "3:4", "9:16"],
  resolutions: ["480p", "720p", "1080p"],
  durationRange: [4, 15],
  fps: [24],
  outputFormats: ["mp4"],
  seed: true,
  generateAudio: true
};

const veo31BaseParameters: VideoBaseParameters = {
  aspectRatios: ["16:9", "9:16"],
  resolutions: ["720p", "1080p", "4k"],
  durations: [4, 6, 8],
  fps: [24]
};

const veo3BaseParameters: VideoBaseParameters = {
  aspectRatios: ["16:9", "9:16"],
  resolutions: ["720p", "1080p"],
  durations: [8],
  fps: [24]
};

const wan22T2VParameters: VideoBaseParameters = {
  concreteSizes: ["832*480", "480*832", "624*624", "1920*1080", "1080*1920", "1440*1440", "1632*1248", "1248*1632"],
  resolutions: ["480P", "1080P"],
  durations: [5],
  negativePrompt: true,
  seed: true
};

const grokImagineParameters: VideoBaseParameters = {
  aspectRatios: ["1:1", "16:9", "9:16", "4:3", "3:4", "3:2", "2:3"],
  resolutions: ["480p", "720p"],
  durationRange: [1, 15],
  outputFormats: ["mp4"]
};

function grokRelayParameters(registryId: string): VideoBaseParameters {
  return {
    aspectRatios: ["16:9", "9:16", "2:3", "3:2", "1:1"],
    resolutions: ["720P", "1080P"],
    ...(registryId === "grok-video-3-pro" ? { durations: [10] }
      : registryId === "grok-video-3-max" ? { durations: [15] }
        : { durationRange: [1, 15] as [number, number] }),
    outputFormats: ["mp4"],
    maxPromptLength: "unknown"
  };
}

function entry(input: VideoModelRegistryEntry): VideoModelRegistryEntry {
  return input;
}

export const videoModelRegistry = [
  entry({
    registryId: "seedance-2.0",
    displayName: "Seedance 2.0",
    provider: "bytedance",
    providerLabel: "Seedance / 火山方舟",
    modality: "video",
    defaultInterface: "official",
    selectedInterface: "official",
    officialStatus: "verified",
    sourceNote: "Seedance 2.0 standard video model. Relay inherits official parameters unless schema overrides them.",
    capabilities: {
      textToVideo: true,
      imageToVideo: true,
      referenceToVideo: true,
      firstFrameToVideo: true,
      firstLastFrameToVideo: true,
      videoToVideo: true,
      videoReference: true,
      multiImageReference: true,
      audioReference: true,
      nativeAudio: true,
      cameraControl: true,
      multiShot: true
    },
    inputSupport: { text: true, images: true, maxImages: 9, videos: true, maxVideos: 3, audios: true, maxAudios: 3 },
    outputSupport: { video: true, audio: true },
    baseParameters: seedanceBaseParameters,
    interfaces: {
      official: {
        enabled: true,
        label: "官方接口",
        apiBaseUrl: "https://ark.cn-beijing.volces.com/api/v3",
        apiKeyRef: "ARK_API_KEY",
        modelId: "seedance-2.0",
        adapter: "seedanceOfficialAdapter",
        requestMapper: "seedanceOfficialRequestMapper",
        responseParser: "seedanceOfficialResponseParser",
        taskMode: "async"
      },
      relay: openAiRelay("seedance-2.0", "seedanceRelayAdapter", "seedanceRelayResponseParser")
    },
    ui: { tags: ["文生视频", "图生视频", "首尾帧", "多模态参考", "原生音频", "480p/720p/1080p", "4-15s"], recommended: true, visible: true }
  }),
  entry({
    registryId: "seedance-2.0-fast",
    displayName: "Seedance 2.0 Fast",
    provider: "bytedance",
    providerLabel: "Seedance / 火山方舟",
    modality: "video",
    defaultInterface: "official",
    selectedInterface: "official",
    officialStatus: "verified",
    sourceNote: "Seedance 2.0 Fast video model. Relay inherits official parameters unless schema overrides them.",
    capabilities: {
      textToVideo: true,
      imageToVideo: true,
      referenceToVideo: true,
      firstFrameToVideo: true,
      firstLastFrameToVideo: true,
      videoToVideo: true,
      videoReference: true,
      multiImageReference: true,
      audioReference: true,
      nativeAudio: true,
      cameraControl: true,
      multiShot: true
    },
    inputSupport: { text: true, images: true, maxImages: 9, videos: true, maxVideos: 3, audios: true, maxAudios: 3 },
    outputSupport: { video: true, audio: true },
    baseParameters: seedanceBaseParameters,
    interfaces: {
      official: {
        enabled: true,
        label: "官方接口",
        apiBaseUrl: "https://ark.cn-beijing.volces.com/api/v3",
        apiKeyRef: "ARK_API_KEY",
        modelId: "seedance-2.0-fast",
        adapter: "seedanceOfficialAdapter",
        requestMapper: "seedanceOfficialRequestMapper",
        responseParser: "seedanceOfficialResponseParser",
        taskMode: "async"
      },
      relay: openAiRelay("seedance-2.0-fast", "seedanceRelayAdapter", "seedanceRelayResponseParser")
    },
    ui: { tags: ["文生视频", "图生视频", "首尾帧", "多模态参考", "快速", "480p/720p/1080p", "4-15s"], recommended: true, visible: true }
  }),
  entry({
    registryId: "veo-3.1",
    displayName: "Veo 3.1",
    provider: "google",
    providerLabel: "Google / Gemini",
    modality: "video",
    defaultInterface: "official",
    selectedInterface: "official",
    officialStatus: "verified",
    sourceNote: "1080p, 4k, reference image, and extension modes have model-specific locks.",
    capabilities: { textToVideo: true, imageToVideo: true, videoToVideo: true, firstLastFrameToVideo: true, videoExtend: true, multiImageReference: true, nativeAudio: true },
    inputSupport: { text: true, images: true, maxImages: 3, videos: true, maxVideos: 1 },
    outputSupport: { video: true, audio: true },
    baseParameters: veo31BaseParameters,
    interfaces: { official: googleVeoOfficial("veo-3.1-generate-preview"), relay: openAiRelay("veo-3.1-generate-preview", "googleVeoRelayAdapter", "googleVeoRelayResponseParser") },
    ui: { tags: ["文生视频", "图生视频", "首尾帧", "原生音频", "720p/1080p/4k", "4/6/8s"], visible: true }
  }),
  entry({
    registryId: "veo-3.1-fast",
    displayName: "Veo 3.1 Fast",
    provider: "google",
    providerLabel: "Google / Gemini",
    modality: "video",
    defaultInterface: "official",
    selectedInterface: "official",
    officialStatus: "verified",
    sourceNote: "Fast tier follows Veo 3.1 duration and resolution constraints; 4k display depends on interface permission.",
    capabilities: { textToVideo: true, imageToVideo: true, videoToVideo: true, firstLastFrameToVideo: true, multiImageReference: true, nativeAudio: true },
    inputSupport: { text: true, images: true, maxImages: 3, videos: true, maxVideos: 1 },
    outputSupport: { video: true, audio: true },
    baseParameters: veo31BaseParameters,
    interfaces: { official: googleVeoOfficial("veo-3.1-fast-generate-preview"), relay: openAiRelay("veo-3.1-fast-generate-preview", "googleVeoRelayAdapter", "googleVeoRelayResponseParser") },
    ui: { tags: ["文生视频", "图生视频", "首尾帧", "原生音频", "720p/1080p/4k", "4/6/8s"], visible: true }
  }),
  entry({
    registryId: "veo-3.1-lite",
    displayName: "Veo 3.1 Lite",
    provider: "google",
    providerLabel: "Google / Gemini",
    modality: "video",
    defaultInterface: "official",
    selectedInterface: "official",
    officialStatus: "verified",
    sourceNote: "Lite does not expose 4k unless a current schema explicitly adds it.",
    capabilities: { textToVideo: true, imageToVideo: true, nativeAudio: true },
    inputSupport: { text: true, images: true, maxImages: 1 },
    outputSupport: { video: true, audio: true },
    baseParameters: { aspectRatios: ["16:9", "9:16"], resolutions: ["720p", "1080p"], durations: [4, 6, 8], fps: [24] },
    interfaces: { official: googleVeoOfficial("veo-3.1-lite-generate-preview"), relay: openAiRelay("veo-3.1-lite-generate-preview", "googleVeoRelayAdapter", "googleVeoRelayResponseParser") },
    ui: { tags: ["文生视频", "图生视频", "原生音频", "720p/1080p", "4/6/8s"], visible: true }
  }),
  ...(["veo-3", "veo-3-fast"] as const).map((registryId) => entry({
    registryId,
    displayName: registryId === "veo-3-fast" ? "Veo 3 Fast" : "Veo 3",
    provider: "google",
    providerLabel: "Google / Gemini",
    modality: "video",
    defaultInterface: "official",
    selectedInterface: "official",
    officialStatus: "verified",
    sourceNote: "Veo 3 generation is fixed to 8s. 1080p is limited to 16:9.",
    capabilities: { textToVideo: true, imageToVideo: true, nativeAudio: true },
    inputSupport: { text: true, images: true, maxImages: 1 },
    outputSupport: { video: true, audio: true },
    baseParameters: veo3BaseParameters,
    interfaces: { official: googleVeoOfficial(registryId === "veo-3-fast" ? "veo-3-fast-generate-preview" : "veo-3-generate-preview"), relay: openAiRelay(registryId === "veo-3-fast" ? "veo-3-fast-generate-preview" : "veo-3-generate-preview", "googleVeoRelayAdapter", "googleVeoRelayResponseParser") },
    ui: { tags: ["文生视频", "图生视频", "原生音频", "720p/1080p", "8s"], visible: true }
  })),
  entry({
    registryId: "veo-2",
    displayName: "Veo 2",
    provider: "google",
    providerLabel: "Google / Gemini",
    modality: "video",
    defaultInterface: "official",
    selectedInterface: "official",
    officialStatus: "verified",
    sourceNote: "Silent video output; no native audio, 1080p, or 4k display.",
    capabilities: { textToVideo: true, imageToVideo: true, nativeAudio: false },
    inputSupport: { text: true, images: true, maxImages: 1 },
    outputSupport: { video: true, audio: false },
    baseParameters: { resolutions: ["720p"], fps: [24], durationRange: [5, 8] },
    interfaces: { official: googleVeoOfficial("veo-2.0-generate-001"), relay: openAiRelay("veo-2.0-generate-001", "googleVeoRelayAdapter", "googleVeoRelayResponseParser") },
    ui: { tags: ["文生视频", "图生视频", "720p", "5-8s", "静音输出"], visible: true }
  }),
  entry({
    registryId: "google-omni-flash-10s",
    displayName: "Google Omni Flash 10s",
    provider: "google",
    providerLabel: "Google / Gemini",
    modality: "video",
    defaultInterface: "relay",
    selectedInterface: "relay",
    officialStatus: "needs_check",
    sourceNote: "API modelId needs verification. If only available through relay, use relay schema.",
    capabilities: { textToVideo: true, imageToVideo: true, videoToVideo: true, multiImageReference: true, nativeAudio: true },
    inputSupport: { text: true, images: true, maxImages: 5, videos: true, maxVideos: 1 },
    outputSupport: { video: true, audio: true },
    baseParameters: { durations: [10], resolutions: ["720p"], aspectRatios: ["16:9", "9:16"] },
    interfaces: { relay: openAiRelay("omni_flash-10s", "googleOmniRelayAdapter", "googleOmniRelayResponseParser") },
    ui: { tags: ["10s", "能力以接口 schema 为准"], experimental: true, visible: true }
  }),
  entry({
    registryId: "wan-2.2-t2v-plus",
    displayName: "Wan2.2 T2V Plus",
    provider: "alibaba",
    providerLabel: "阿里 / 通义 / 万相",
    modality: "video",
    defaultInterface: "official",
    selectedInterface: "official",
    officialStatus: "verified",
    sourceNote: "T2V Plus uses concrete size and fixed 5s duration.",
    capabilities: { textToVideo: true, imageToVideo: false, promptExtend: true },
    inputSupport: { text: true, images: false, videos: false, audios: false },
    outputSupport: { video: true, audio: false },
    baseParameters: wan22T2VParameters,
    interfaces: {
      official: {
        enabled: true,
        label: "官方接口",
        apiBaseUrl: "https://dashscope.aliyuncs.com/api/v1",
        apiKeyRef: "DASHSCOPE_API_KEY",
        modelId: "wan2.2-t2v-plus",
        adapter: "wanOfficialAdapter",
        requestMapper: "wan22T2VPlusRequestMapper",
        responseParser: "wanOfficialResponseParser",
        taskMode: "async"
      },
      relay: openAiRelay("wan2.2-t2v-plus", "wanRelayAdapter", "wanRelayResponseParser")
    },
    ui: { tags: ["文生视频", "480P/1080P", "固定5s", "concrete size"], visible: true }
  }),
  entry({
    registryId: "wan-2.2-i2v",
    displayName: "Wan2.2 I2V",
    provider: "alibaba",
    providerLabel: "阿里 / 通义 / 万相",
    modality: "video",
    defaultInterface: "relay",
    selectedInterface: "relay",
    officialStatus: "needs_check",
    sourceNote: "Image count, size, duration, and resolution must come from current schema before display.",
    capabilities: { imageToVideo: true },
    inputSupport: { text: true, images: true, maxImages: "unknown" },
    outputSupport: { video: true },
    baseParameters: { durationRange: null, maxPromptLength: "unknown" },
    interfaces: { relay: openAiRelay("wan2.2-i2v", "wanRelayAdapter", "wanRelayResponseParser") },
    ui: { tags: ["图生视频", "待确认参数"], experimental: true, visible: true }
  }),
  ...["wan-2.7", "happyhorse-1.0"].map((registryId) => entry({
    registryId,
    displayName: registryId === "wan-2.7" ? "Wan2.7" : "HappyHorse 1.0",
    provider: "alibaba",
    providerLabel: "阿里 / 通义 / 万相",
    modality: "video",
    defaultInterface: "relay",
    selectedInterface: "relay",
    officialStatus: "unknown",
    sourceNote: "relay/custom video model. Capabilities must come from relay schema or manual configuration.",
    capabilities: {},
    inputSupport: { text: true, images: true, maxImages: "unknown", videos: true, maxVideos: "unknown" },
    outputSupport: { video: true },
    baseParameters: { durationRange: null },
    interfaces: { relay: openAiRelay(registryId, "wanRelayAdapter", "wanRelayResponseParser") },
    ui: { tags: ["中转模型", "能力待配置"], experimental: true, visible: true }
  })),
  entry({
    registryId: "grok-imagine-video",
    displayName: "Grok Imagine Video",
    provider: "xai",
    providerLabel: "xAI / Grok",
    modality: "video",
    defaultInterface: "official",
    selectedInterface: "official",
    officialStatus: "verified",
    sourceNote: "Async task returns request_id; done status contains video.url.",
    capabilities: { textToVideo: true, imageToVideo: true, videoToVideo: true, nativeAudio: true },
    inputSupport: { text: true, images: true, maxImages: 7, videos: true, maxVideos: 1 },
    outputSupport: { video: true, audio: true },
    baseParameters: grokImagineParameters,
    interfaces: {
      official: {
        enabled: true,
        label: "官方接口",
        apiBaseUrl: "https://api.x.ai/v1",
        apiKeyRef: "XAI_API_KEY",
        modelId: "grok-imagine-video",
        adapter: "xaiVideoOfficialAdapter",
        requestMapper: "xaiImagineVideoRequestMapper",
        responseParser: "xaiImagineVideoResponseParser",
        taskMode: "async"
      },
      relay: openAiRelay("grok-imagine-video", "xaiVideoRelayAdapter", "xaiVideoRelayResponseParser")
    },
    ui: { tags: ["文生视频", "图生视频", "480p/720p", "1-15s", "原生音频"], visible: true }
  }),
  ...["grok-video-3", "grok-video-3-pro", "grok-video-3-max", "grok-1.5-video"].map((registryId) => entry({
    registryId,
    displayName: registryId === "grok-1.5-video" ? "Grok 1.5 Video" : registryId.split("-").map((part) => part === "grok" ? "Grok" : part === "video" ? "Video" : part.toUpperCase()).join(" "),
    provider: "xai",
    providerLabel: "xAI / Grok",
    modality: "video",
    defaultInterface: "relay",
    selectedInterface: "relay",
    officialStatus: "not_official",
    sourceNote: "Relay model name. UI uses xAI Imagine parameter family unless the relay schema overrides it.",
    capabilities: { textToVideo: true, imageToVideo: true, referenceToVideo: true, videoToVideo: true, nativeAudio: true },
    inputSupport: { text: true, images: true, maxImages: 7, videos: true, maxVideos: 1 },
    outputSupport: { video: true, audio: true },
    baseParameters: grokRelayParameters(registryId),
    interfaces: { relay: openAiRelay(registryId, "xaiVideoRelayAdapter", "xaiVideoRelayResponseParser") },
    ui: { tags: ["中转模型", "9:16", "720P/1080P", registryId === "grok-video-3-pro" ? "10s" : registryId === "grok-video-3-max" ? "15s" : "1-15s"], experimental: true, visible: true }
  })),
  ...[
    ["kling-3.0-omni", "Kling 3.0 Omni"],
    ["kling-3.0", "Kling 3.0"],
    ["kling-2.6", "Kling 2.6"],
    ["kling-2.5-turbo", "Kling 2.5 Turbo"],
    ["kling-2.1-master", "Kling 2.1 Master"],
    ["kling-2.1", "Kling 2.1"],
    ["kling-2.0-master", "Kling 2.0 Master"],
    ["kling-1.6", "Kling 1.6"],
    ["kling-1.5", "Kling 1.5"],
    ["kling-1.0", "Kling 1.0"]
  ].map(([registryId, displayName]) => {
    const is30Omni = registryId === "kling-3.0-omni";
    const is30 = registryId === "kling-3.0";
    return entry({
      registryId,
      displayName,
      provider: "kling",
      providerLabel: "Kling / 可灵",
      modality: "video",
      defaultInterface: "relay",
      selectedInterface: "relay",
      officialStatus: "unknown",
      sourceNote: "Kling capabilities and resolutions must come from official schema, relay schema, or manual configuration.",
      capabilities: is30Omni
        ? { textToVideo: true, imageToVideo: true, referenceToVideo: true, videoToVideo: true, multiImageReference: true, videoReference: true, nativeAudio: true, multiShot: true, storyboard: true }
        : is30
          ? { textToVideo: true, imageToVideo: true, firstLastFrameToVideo: true, referenceToVideo: true, multiShot: true, storyboard: true, nativeAudio: true }
          : {},
      inputSupport: { text: true, images: true, maxImages: "unknown", videos: is30Omni, maxVideos: is30Omni ? "unknown" : undefined },
      outputSupport: { video: true, audio: is30Omni || is30 },
      baseParameters: is30Omni || is30 ? { durationRange: [3, 15], resolutions: [], aspectRatios: [] } : { durationRange: null, resolutions: [], aspectRatios: [] },
      interfaces: { relay: openAiRelay(registryId, "klingRelayAdapter", "klingRelayResponseParser") },
      ui: { tags: is30Omni || is30 ? ["能力以 schema 为准", "不默认显示 4K"] : ["待配置", "不继承 3.0 能力"], experimental: true, visible: true }
    });
  })
] satisfies VideoModelRegistryEntry[];

export function getVideoModelRegistryEntry(registryId?: string) {
  return videoModelRegistry.find((item) => item.registryId === registryId);
}

export function getVideoModelInterface(entry: VideoModelRegistryEntry, selectedInterface = entry.selectedInterface) {
  return entry.interfaces[selectedInterface as VideoInterfaceKind] ?? entry.interfaces[entry.defaultInterface];
}
