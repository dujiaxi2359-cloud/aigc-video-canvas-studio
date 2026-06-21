import type { ModelConfig } from "../types/model";

const imageInputs = new Set(["image", "first_frame", "reference_image", "first_last_frame"]);

function effectiveChannel(model: ModelConfig) {
  const channel = { ...model.capabilities, ...model.capabilities.channelCapability };
  const identity = `${model.providerId} ${model.provider} ${model.modelName} ${model.displayName}`.toLowerCase();
  if (/kling|\u53ef\u7075/.test(identity) && /(3[._ -]?0|v3|omni)/.test(identity) && !/(?:^|[-_])noref(?:$|[-_])/.test(model.modelName.toLowerCase())) {
    return {
      ...channel,
      apiFamily: channel.apiFamily ?? "aigc_video_json",
      imageTransport: channel.imageTransport === "unsupported" ? "url_or_asset" : channel.imageTransport ?? "url_or_asset",
      imageField: channel.imageField ?? "image",
      supportedInputs: Array.from(new Set([...(channel.supportedInputs ?? []), "text", "image", "first_frame", "reference_image", "first_last_frame"]))
    };
  }
  return channel;
}

function supportedInputsFor(model: ModelConfig) {
  const channel = effectiveChannel(model);
  if (channel.supportedInputs?.length) return channel.supportedInputs;
  const inputs = new Set<NonNullable<typeof channel.supportedInputs>[number]>();
  for (const mode of channel.inputModes ?? []) {
    if (mode === "text-to-video") inputs.add("text");
    if (mode === "image-to-video") { inputs.add("image"); inputs.add("first_frame"); }
    if (mode === "reference-to-video") { inputs.add("image"); inputs.add("reference_image"); }
    if (mode === "first-last-frame") inputs.add("first_last_frame");
    if (mode === "video-to-video") inputs.add("video");
  }
  return Array.from(inputs);
}

function inferredApiFamily(model: ModelConfig) {
  const channel = effectiveChannel(model);
  if (channel.apiFamily) return channel.apiFamily;
  const value = `${model.modelName} ${model.apiBaseUrl}`.toLowerCase();
  if (/omni[-_]?fast[-_]?v2v/.test(value)) return "omni_fast_v2v";
  if (/omni[-_]?fast|omni[-_]?flash/.test(value)) return "omni_fast";
  if (/doubao[-_]?seedance[-_]?1[-_]?5/.test(value)) return "doubao_seedance15";
  if (/kling|可灵/.test(value)) return "aigc_video_json";
  if (/seedance[-_ .]?2|\/v1\/video\/generations/.test(value)) return "seedance2_native";
  if (/\/v1\/video\/create/.test(value)) return "unified_video_create";
  if (/generativelanguage\.googleapis\.com|api\.x\.ai|dashscope|klingai|volces/.test(value)) return "official_provider";
  if (model.apiBaseUrl.trim()) return "openai_videos";
  return undefined;
}

export type VideoCapabilityBlockReason =
  | "supportedInputsMissingImage"
  | "imageTransportUnsupported"
  | "noPublicImageUrl"
  | "currentChannelTextOnly"
  | "noImageCapableChannel"
  | "adapterMismatch"
  | "missingApiFamily";

export function modelConfigSupportsImage(model: ModelConfig) {
  const channel = effectiveChannel(model);
  const inputs = supportedInputsFor(model);
  return inputs.some((input) => imageInputs.has(input)) && channel.imageTransport !== "unsupported";
}

export function sameVideoModel(left: ModelConfig, right: ModelConfig) {
  const leftOfficial = left.capabilities.modelCapability?.model;
  const rightOfficial = right.capabilities.modelCapability?.model;
  if (leftOfficial && rightOfficial) {
    return left.category === "video"
      && right.category === "video"
      && leftOfficial === rightOfficial;
  }
  return left.category === "video"
    && right.category === "video"
    && left.providerId === right.providerId
    && left.modelName.trim().toLowerCase() === right.modelName.trim().toLowerCase();
}

export function diagnoseVideoChannel(selected: ModelConfig | undefined, allModels: ModelConfig[], hasImageAsset: boolean) {
  const alternatives = selected
    ? allModels.filter((model) => model.id !== selected.id && model.enabled && sameVideoModel(selected, model) && modelConfigSupportsImage(model))
    : [];
  const capabilities = selected ? effectiveChannel(selected) : undefined;
  const supportedInputs = selected ? supportedInputsFor(selected) : [];
  const hasImageInput = supportedInputs.some((input) => imageInputs.has(input));
  const imageTransport = capabilities?.imageTransport;
  let whyBlocked: VideoCapabilityBlockReason | undefined;
  if (hasImageAsset && selected) {
    if (!inferredApiFamily(selected)) whyBlocked = "missingApiFamily";
    else if (!hasImageInput) whyBlocked = alternatives.length ? "currentChannelTextOnly" : "noImageCapableChannel";
    else if (!imageTransport || imageTransport === "unsupported") whyBlocked = alternatives.length ? "currentChannelTextOnly" : "imageTransportUnsupported";
  }
  return {
    selectedModel: selected?.modelName,
    selectedProvider: selected?.providerId ?? selected?.provider,
    selectedChannel: capabilities?.channel ?? "legacy_custom",
    apiFamily: selected ? inferredApiFamily(selected) : undefined,
    createEndpoint: capabilities?.createEndpoint ?? capabilities?.endpoint,
    supportedInputs,
    imageTransport,
    videoTransport: capabilities?.videoTransport,
    imageField: capabilities?.imageField,
    hasImageAsset,
    currentChannelSupportsImage: Boolean(selected && modelConfigSupportsImage(selected)),
    sameModelImageCapableChannels: alternatives.map((model) => ({ id: model.id, label: model.displayName, channel: model.capabilities.channelCapability?.channel ?? model.capabilities.channel ?? "legacy_custom" })),
    whyBlocked
  };
}
