import type { ImageInputMode, ModelConfig } from "../types/model";

function referenceMode(model: ModelConfig): ImageInputMode | undefined {
  if (model.modelType === "text-to-image" && !["image_to_image", "image_edit"].includes(model.capabilities.capability || "")) return undefined;
  const modes = model.capabilities.inputModes;
  if (model.modelType === "image-edit" || modes.includes("image-edit")) return "image-edit";
  if (model.modelType === "image-to-image" || modes.includes("image-to-image")) return "image-to-image";
  return undefined;
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
