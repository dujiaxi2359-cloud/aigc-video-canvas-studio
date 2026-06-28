import type { ImageInputMode, ModelConfig } from "../types/model";
import { isCanvasReadyModel } from "./modelReadiness";

export const AUTO_IMAGE_MODEL_ID = "__auto_image_model__";
export const AUTO_IMAGE_MODEL_LABEL = "选择模型";

function referenceMode(model: ModelConfig): ImageInputMode | undefined {
  if (model.modelType === "text-to-image" && !["image_to_image", "image_edit"].includes(model.capabilities.capability || "")) return undefined;
  const modes = model.capabilities.inputModes;
  if (model.modelType === "image-edit" || modes.includes("image-edit")) return "image-edit";
  if (model.modelType === "image-to-image" || modes.includes("image-to-image")) return "image-to-image";
  return undefined;
}

function textMode(model: ModelConfig): ImageInputMode | undefined {
  const modes = model.capabilities.inputModes;
  const capability = model.capabilities.capability;
  if (
    model.modelType === "text-to-image"
    || modes.includes("text-to-image")
    || capability === "text_to_image"
    || capability === "image_generation"
    || model.capabilities.modelCapability?.supportsTextToImage
  ) return "text-to-image";
  return undefined;
}

export function selectAutomaticImageModel(input: {
  models: ModelConfig[];
  hasReferenceImages: boolean;
}) {
  const readyModels = input.models.filter((model) => model.enabled && model.category === "image" && isCanvasReadyModel(model));
  const match = input.hasReferenceImages
    ? readyModels.find((model) => Boolean(referenceMode(model)))
    : readyModels.find((model) => Boolean(textMode(model)));
  if (!match) {
    return {
      ok: false as const,
      errorCode: input.hasReferenceImages ? "NO_READY_IMAGE_REFERENCE_MODEL" : "NO_READY_TEXT_TO_IMAGE_MODEL",
      message: input.hasReferenceImages
        ? "暂无可用参考图模型，请配置图片编辑或图生图模型。"
        : "暂无可用文生图模型，请先配置可用图片模型。"
    };
  }
  return {
    ok: true as const,
    modelId: match.id,
    inputMode: input.hasReferenceImages ? referenceMode(match)! : textMode(match)!,
    model: match
  };
}

export function resolveImageSubmission(input: {
  selectedModel: ModelConfig;
  models: ModelConfig[];
  inputMode: ImageInputMode;
  hasReferenceImages: boolean;
}) {
  if (!input.hasReferenceImages) {
    return { ok: true as const, modelId: input.selectedModel.id, inputMode: input.inputMode };
  }

  const selectedReferenceMode = referenceMode(input.selectedModel);
  if (selectedReferenceMode) {
    return {
      ok: true as const,
      modelId: input.selectedModel.id,
      inputMode: input.inputMode === "text-to-image" ? selectedReferenceMode : input.inputMode,
      autoSwitchedMode: input.inputMode === "text-to-image"
    };
  }

  const alternative = input.models.find((model) =>
    model.enabled
    && model.category === "image"
    && model.id !== input.selectedModel.id
    && Boolean(referenceMode(model))
  );
  if (alternative) {
    return {
      ok: true as const,
      modelId: alternative.id,
      inputMode: referenceMode(alternative)!,
      autoSwitchedModel: true,
      message: `当前文生图模型不支持参考图，已切换到「${alternative.displayName}」。`
    };
  }

  return {
    ok: false as const,
    errorCode: "IMAGE_MODEL_REFERENCE_NOT_SUPPORTED" as const,
    message: "当前文生图模型不支持参考图，请切换图片编辑/图生图模型或移除参考图。"
  };
}
