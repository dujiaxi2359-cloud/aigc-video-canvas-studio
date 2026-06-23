import type { ImageInputMode, ModelCapabilities, ModelType } from "../types/model.js";

const imageRatios = ["1:1", "3:4", "4:3", "9:16", "16:9"];
const grsaiRatios = ["auto", "1:1", "16:9", "9:16", "4:3", "3:4", "3:2", "2:3", "5:4", "4:5", "21:9", "9:21", "1:2", "2:1"];
const openAiSizes = ["auto", "1024x1024", "1536x1024", "1024x1536"];
const openAiFormats = ["png", "jpeg", "webp"];
const qwenSizes = ["1024x1024", "1024x1536", "1536x1024"];

function identity(providerId?: string, modelName?: string, displayName?: string, provider?: string) {
  return `${providerId ?? ""} ${provider ?? ""} ${modelName ?? ""} ${displayName ?? ""}`.toLowerCase();
}

function withImageModelCapability(capabilities: ModelCapabilities, modelName: string): ModelCapabilities {
  const modes = new Set(capabilities.inputModes ?? []);
  return {
    ...capabilities,
    modelCapability: {
      ...capabilities.modelCapability,
      model: capabilities.modelCapability?.model ?? modelName,
      supportsTextToImage: modes.has("text-to-image"),
      supportsImageToImage: modes.has("image-to-image"),
      supportsImageEdit: modes.has("image-edit")
    }
  };
}

export function isQwenImageEditModel(providerId?: string, modelName?: string, displayName?: string, provider?: string) {
  const value = identity(providerId, modelName, displayName, provider);
  return /qwen[-_ .]?image[-_ .]?edit|edit[-_ .]?(?:plus|max)/.test(value);
}

export function isQwenImageTextModel(providerId?: string, modelName?: string, displayName?: string, provider?: string) {
  const value = identity(providerId, modelName, displayName, provider);
  return !isQwenImageEditModel(providerId, modelName, displayName, provider)
    && /qwen[-_ .]?image|wanx|通义|万相/.test(value);
}

export function qwenTextModelForEdit(modelName: string) {
  if (/2\.0|plus|max|2025/i.test(modelName)) return "qwen-image-2.0-pro";
  return "qwen-image";
}

export function normalizeImageCapabilities(
  capabilities: ModelCapabilities,
  providerId?: string,
  modelName?: string,
  displayName?: string,
  provider?: string
): ModelCapabilities {
  const value = identity(providerId, modelName, displayName, provider);
  const model = modelName || capabilities.modelCapability?.model || "";

  if (providerId === "zhipu" || /open\.bigmodel\.cn|glm[-_ .]?image|cogview/.test(value)) {
    const glmImage = /glm[-_ .]?image/.test(value);
    return withImageModelCapability({
      ...capabilities,
      inputModes: ["text-to-image"],
      imageAspectRatios: imageRatios,
      imageSizes: glmImage
        ? ["1280x1280", "1568x1056", "1056x1568", "1472x1088", "1088x1472", "1728x960", "960x1728"]
        : ["1024x1024", "768x1344", "864x1152", "1344x768", "1152x864", "1440x720", "720x1440"],
      imageQualities: glmImage ? ["hd"] : ["standard", "hd"],
      imageFormats: ["png"],
      supportsImageInput: false,
      supportsMultiImageInput: false,
      supportsReferenceImage: false,
      supportsMask: false,
      supportsTransparentBackground: false
    }, model);
  }

  if (providerId === "grsai" || /grsai/i.test(value)) {
    const nano2 = /nano[-_]?banana[-_]?2/i.test(value);
    return withImageModelCapability({
      ...capabilities,
      inputModes: ["text-to-image", "image-to-image", "image-edit"],
      imageAspectRatios: nano2 ? [...grsaiRatios, "1:4", "4:1", "1:8", "8:1"] : grsaiRatios,
      imageSizes: /gpt[-_]?image[-_]?2(?!.*vip)/i.test(value) ? ["1K"] : ["1K", "2K", "4K"],
      imageQualities: ["auto", "standard", "high"],
      imageFormats: ["png"],
      supportsImageInput: true,
      supportsMultiImageInput: true,
      supportsReferenceImage: true,
      supportsMask: false,
      supportsTransparentBackground: false
    }, model);
  }

  if (isQwenImageEditModel(providerId, modelName, displayName, provider)) {
    return withImageModelCapability({
      ...capabilities,
      inputModes: ["image-to-image", "image-edit"],
      imageAspectRatios: capabilities.imageAspectRatios ?? imageRatios,
      imageSizes: qwenSizes,
      imageQualities: ["standard", "high"],
      imageFormats: ["png"],
      supportsImageInput: true,
      supportsMultiImageInput: true,
      supportsReferenceImage: true,
      supportsMask: false,
      supportsTransparentBackground: false
    }, model);
  }

  if (isQwenImageTextModel(providerId, modelName, displayName, provider)) {
    return withImageModelCapability({
      ...capabilities,
      inputModes: ["text-to-image"],
      imageAspectRatios: capabilities.imageAspectRatios ?? imageRatios,
      imageSizes: qwenSizes,
      imageQualities: ["standard", "high"],
      imageFormats: ["png"],
      supportsImageInput: false,
      supportsMultiImageInput: false,
      supportsReferenceImage: false,
      supportsMask: false,
      supportsTransparentBackground: false
    }, model);
  }

  if (/gemini.*image|image.*gemini|nano[-_ .]?banana/.test(value)) {
    return withImageModelCapability({
      ...capabilities,
      inputModes: ["text-to-image", "image-to-image", "image-edit"],
      imageAspectRatios: capabilities.imageAspectRatios ?? imageRatios,
      imageSizes: ["1K"],
      imageQualities: ["auto", "standard", "high"],
      imageFormats: ["png"],
      supportsImageInput: true,
      supportsMultiImageInput: true,
      supportsReferenceImage: true,
      supportsMask: false,
      supportsTransparentBackground: false
    }, model);
  }

  if (/imagen/.test(value)) {
    return withImageModelCapability({
      ...capabilities,
      inputModes: ["text-to-image"],
      imageAspectRatios: capabilities.imageAspectRatios ?? imageRatios,
      imageSizes: capabilities.imageSizes?.length ? capabilities.imageSizes : ["1K", "2K"],
      imageQualities: ["auto", "standard", "high"],
      imageFormats: ["png"],
      supportsImageInput: false,
      supportsMultiImageInput: false,
      supportsReferenceImage: false,
      supportsMask: false,
      supportsTransparentBackground: false
    }, model);
  }

  if (/seedream|doubao[-_]?seedream/.test(value)) {
    return withImageModelCapability({
      ...capabilities,
      inputModes: ["text-to-image", "image-to-image", "image-edit"],
      imageAspectRatios: capabilities.imageAspectRatios ?? ["1:1", "3:4", "4:3", "9:16", "16:9", "2:3", "3:2", "21:9"],
      imageSizes: capabilities.imageSizes ?? ["auto", "1024x1024", "1536x1024", "1024x1536", "1920x1080", "1080x1920"],
      imageQualities: capabilities.imageQualities ?? ["auto", "standard", "high"],
      imageFormats: capabilities.imageFormats ?? openAiFormats,
      supportsImageInput: true,
      supportsMultiImageInput: true,
      supportsReferenceImage: true
    }, model);
  }

  if (/gpt[-_ .]?image|dall[-_ .]?e|openai/.test(value) || providerId === "openai" || providerId === "azure-openai") {
    return withImageModelCapability({
      ...capabilities,
      inputModes: ["text-to-image", "image-to-image", "image-edit"],
      imageAspectRatios: capabilities.imageAspectRatios ?? imageRatios,
      imageSizes: capabilities.imageSizes ?? openAiSizes,
      imageQualities: capabilities.imageQualities ?? ["auto", "low", "medium", "high"],
      imageFormats: capabilities.imageFormats ?? openAiFormats,
      supportsImageInput: true,
      supportsMultiImageInput: true,
      supportsReferenceImage: true,
      supportsMask: true,
      supportsTransparentBackground: !/gpt[-_ .]?image[-_ .]?2/.test(value)
    }, model);
  }

  if (/flux|recraft|ideogram|midjourney|jimeng|image|图像|图片/.test(value)) {
    return withImageModelCapability({
      ...capabilities,
      inputModes: capabilities.inputModes?.length ? capabilities.inputModes : ["text-to-image"],
      imageAspectRatios: capabilities.imageAspectRatios ?? imageRatios,
      imageQualities: capabilities.imageQualities ?? ["auto", "standard", "high"],
      imageFormats: capabilities.imageFormats ?? openAiFormats
    }, model);
  }

  return withImageModelCapability(capabilities, model);
}

export function inferImageProvider(input: { providerId?: string; modelName: string; displayName?: string; provider?: string }) {
  const value = identity(input.providerId, input.modelName, input.displayName, input.provider);
  if (input.providerId === "zhipu" || /open\.bigmodel\.cn|glm[-_ .]?image|cogview/.test(value)) {
    return { providerId: "zhipu", provider: "智普 BigModel 官方" };
  }
  if (isQwenImageEditModel(input.providerId, input.modelName, input.displayName, input.provider) || isQwenImageTextModel(input.providerId, input.modelName, input.displayName, input.provider)) {
    return { providerId: "alibaba", provider: "通义万相 / 阿里百炼" };
  }
  if (input.providerId === "grsai" || /grsai/i.test(value)) return { providerId: "grsai", provider: "Grsai 图片中转" };
  if (/gemini.*image|image.*gemini|nano[-_ .]?banana|imagen/.test(value)) return { providerId: "google", provider: "Gemini 图像中转" };
  if (/seedream|doubao[-_]?seedream/.test(value)) return { providerId: "seedance", provider: "Seedream / 火山方舟" };
  return { providerId: input.providerId ?? "openai", provider: input.provider ?? "OpenAI 兼容图像中转" };
}

export function inferImageModelType(input: { providerId?: string; modelName: string; displayName?: string; provider?: string; capabilities?: ModelCapabilities }): ModelType {
  if (isQwenImageEditModel(input.providerId, input.modelName, input.displayName, input.provider)) return "image-edit";
  const modes = input.capabilities?.inputModes ?? [];
  if (modes.includes("image-edit")) return "image-edit";
  if (modes.includes("image-to-image") && !modes.includes("text-to-image")) return "image-to-image";
  return "text-to-image";
}

export function normalizeImageInputMode(capabilities: ModelCapabilities, inputMode: ImageInputMode, hasImageInput: boolean): ImageInputMode {
  if (capabilities.inputModes.includes(inputMode)) return inputMode;
  if (hasImageInput && capabilities.inputModes.includes("image-to-image")) return "image-to-image";
  return capabilities.inputModes.find((mode): mode is ImageInputMode => ["text-to-image", "image-to-image", "image-edit"].includes(mode)) ?? "text-to-image";
}
