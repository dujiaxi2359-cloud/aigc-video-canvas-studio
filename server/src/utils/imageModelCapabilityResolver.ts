import type { ImageInputMode, ModelCapabilities, ModelType } from "../types/model.js";

export type ImageCapabilityErrorCode =
  | "IMAGE_MODEL_CONFIG_INCOMPLETE"
  | "IMAGE_MODEL_REFERENCE_NOT_SUPPORTED"
  | "IMAGE_MODEL_ROUTE_UNRESOLVED"
  | "IMAGE_MODEL_PROVIDER_MISSING"
  | "IMAGE_MODEL_CAPABILITY_MISSING";

export type ImageModelCapabilityInput = {
  providerId?: string;
  providerName?: string;
  modelId?: string;
  modelType?: ModelType;
  baseUrl?: string;
  hasApiKey?: boolean;
  capabilities?: Partial<ModelCapabilities>;
  requestType: ImageInputMode;
  hasReferenceImages: boolean;
};

function imageModes(input: ImageModelCapabilityInput) {
  const modes = new Set((input.capabilities?.inputModes ?? []).filter((mode): mode is ImageInputMode =>
    ["text-to-image", "image-to-image", "image-edit"].includes(mode)
  ));
  if (input.modelType === "text-to-image" || input.modelType === "image-to-image" || input.modelType === "image-edit") modes.add(input.modelType);
  if (input.capabilities?.modelCapability?.supportsTextToImage) modes.add("text-to-image");
  if (input.capabilities?.modelCapability?.supportsImageToImage) modes.add("image-to-image");
  if (input.capabilities?.modelCapability?.supportsImageEdit) modes.add("image-edit");
  return modes;
}

function capabilityFor(input: ImageModelCapabilityInput, modes: Set<ImageInputMode>) {
  if (input.capabilities?.capability) return input.capabilities.capability;
  if (input.modelType === "image-edit") return "image_edit" as const;
  if (input.modelType === "image-to-image") return "image_to_image" as const;
  if (input.modelType === "text-to-image") return "text_to_image" as const;
  if (modes.has("image-edit")) return "image_edit" as const;
  if (modes.has("image-to-image")) return "image_to_image" as const;
  if (modes.has("text-to-image")) return "text_to_image" as const;
  return undefined;
}

function providerTypeFor(input: ImageModelCapabilityInput) {
  if (input.capabilities?.providerType) return input.capabilities.providerType;
  if (input.capabilities?.channel === "official") return "official" as const;
  if (input.capabilities?.channel === "proxy") return "openai_compatible" as const;
  if (input.capabilities?.channel === "legacy_custom") return "legacy_supported" as const;
  return input.baseUrl ? "openai_compatible" as const : "legacy_supported" as const;
}

function adapterFamilyFor(input: ImageModelCapabilityInput, providerType: ReturnType<typeof providerTypeFor>) {
  if (input.capabilities?.adapterFamily) return input.capabilities.adapterFamily;
  if (providerType === "official") return "provider_native" as const;
  if (providerType === "openai_compatible" && input.providerId === "openai") return "openai_compatible" as const;
  return "legacy_supported" as const;
}

function endpointFamilyFor(
  input: ImageModelCapabilityInput,
  mode: ImageInputMode,
  adapterFamily: ReturnType<typeof adapterFamilyFor>
) {
  if (input.capabilities?.endpointFamily) return input.capabilities.endpointFamily;
  if (mode === "text-to-image") return adapterFamily === "openai_compatible" ? "openai_images_generation" as const : "provider_native" as const;
  if (mode === "image-edit") return adapterFamily === "openai_compatible" ? "openai_images_edits" as const : "legacy_image_edit" as const;
  if (mode === "image-to-image") return adapterFamily === "openai_compatible" ? "openai_images_edits" as const : "image_to_image" as const;
  return undefined;
}

export function resolveImageModelCapability(input: ImageModelCapabilityInput) {
  if (!input.providerId && !input.providerName) {
    return { ok: false as const, errorCode: "IMAGE_MODEL_PROVIDER_MISSING" as ImageCapabilityErrorCode, reason: "图片模型缺少 provider 配置。" };
  }
  if (!input.modelId) {
    return { ok: false as const, errorCode: "IMAGE_MODEL_CONFIG_INCOMPLETE" as ImageCapabilityErrorCode, reason: "图片模型缺少 modelId。" };
  }

  const modes = imageModes(input);
  const capability = capabilityFor(input, modes);
  if (!capability) {
    return { ok: false as const, errorCode: "IMAGE_MODEL_CAPABILITY_MISSING" as ImageCapabilityErrorCode, reason: "无法判断图片模型能力。" };
  }

  const explicitlyReferenceCapable = input.capabilities?.capability === "image_to_image"
    || input.capabilities?.capability === "image_edit";
  if (input.hasReferenceImages && input.modelType === "text-to-image" && !explicitlyReferenceCapable) {
    return {
      ok: false as const,
      errorCode: "IMAGE_MODEL_REFERENCE_NOT_SUPPORTED" as ImageCapabilityErrorCode,
      reason: "当前文生图模型不支持参考图，请切换图片编辑/图生图模型或移除参考图。"
    };
  }

  let imageMode = input.requestType;
  if (input.hasReferenceImages && imageMode === "text-to-image") {
    const modelExplicitlyTextOnly = input.modelType === "text-to-image";
    if (!modelExplicitlyTextOnly && modes.has("image-to-image")) imageMode = "image-to-image";
    else if (!modelExplicitlyTextOnly && modes.has("image-edit")) imageMode = "image-edit";
    else {
      return {
        ok: false as const,
        errorCode: "IMAGE_MODEL_REFERENCE_NOT_SUPPORTED" as ImageCapabilityErrorCode,
        reason: "当前文生图模型不支持参考图，请切换图片编辑/图生图模型或移除参考图。"
      };
    }
  }

  const canUseReferences = imageMode === "image-to-image" || imageMode === "image-edit";
  if (canUseReferences && !input.hasReferenceImages) {
    return {
      ok: false as const,
      errorCode: "IMAGE_MODEL_CONFIG_INCOMPLETE" as ImageCapabilityErrorCode,
      reason: imageMode === "image-edit" ? "图片编辑需要连接图片素材。" : "图生图需要连接图片素材。"
    };
  }
  if (!modes.has(imageMode) && input.modelType !== imageMode) {
    return {
      ok: false as const,
      errorCode: "IMAGE_MODEL_ROUTE_UNRESOLVED" as ImageCapabilityErrorCode,
      reason: `当前图片模型无法解析 ${imageMode} 路由。`
    };
  }

  const providerType = providerTypeFor(input);
  const adapterFamily = adapterFamilyFor(input, providerType);
  const endpointFamily = endpointFamilyFor(input, imageMode, adapterFamily);
  if (!endpointFamily) {
    return { ok: false as const, errorCode: "IMAGE_MODEL_ROUTE_UNRESOLVED" as ImageCapabilityErrorCode, reason: "无法解析图片模型 endpointFamily。" };
  }

  return {
    ok: true as const,
    providerType,
    adapterFamily,
    endpointFamily,
    capability,
    imageMode,
    canUseReferences,
    route: endpointFamily === "openai_images_generation"
      ? "/v1/images/generations"
      : endpointFamily === "openai_images_edits"
        ? "/v1/images/edits"
        : "legacy_adapter",
    reason: input.capabilities?.endpointFamily || input.capabilities?.adapterFamily
      ? "explicit_configuration"
      : adapterFamily === "legacy_supported"
        ? "legacy_compatibility_inferred"
        : "compatible_route_inferred"
  };
}
