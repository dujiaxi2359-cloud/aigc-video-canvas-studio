import { memo, useEffect, useMemo, useRef, useState, type ChangeEvent, type CompositionEvent } from "react";
import type { NodeProps } from "reactflow";
import { Activity, AlertCircle, ArrowUp, BoxSelect, Film, Image as ImageIcon, Library, Loader2, Maximize2, Mic, Play, Plus, Sparkles } from "lucide-react";
import { Button } from "../common/Button";
import { Select } from "../common/Select";
import { Textarea } from "../common/Textarea";
import { MediaPreview } from "../media/MediaPreview";
import { generationApi } from "../../services/generationApi";
import { modelConfigApi } from "../../services/modelConfigApi";
import { useCanvasStore } from "../../store/canvasStore";
import { useModelConfigStore } from "../../store/modelConfigStore";
import { absoluteUploadUrl } from "../../utils/file";
import { compactAssetIds, resolveVideoNodeInputs } from "../../utils/workflowInputs";
import { AgentAnalyzeErrorButton } from "../agent/AgentAnalyzeErrorButton";
import type { AvailableVideoOptions, ModelConfig, VideoInputMode } from "../../types/model";
import type { VideoNodeData } from "../../types/node";
import { categoryForOfficialVideoMode, legacyInputModeToOfficialMode, officialModeToLegacyInputMode, officialVideoCategoryLabels, officialVideoModeLabels, type OfficialVideoCategory, type OfficialVideoMode } from "../../types/videoModes";
import { NodeParameterPopover } from "./NodeParameterPopover";
import { CreationNodeFrame } from "./CreationNodeFrame";
import { MediaPreviewActions } from "./MediaPreviewActions";
import { NodeToolPanel, type NodeTool } from "./NodeToolPanel";

const modeLabels: Record<VideoInputMode, string> = {
  "text-to-video": "文生视频",
  "image-to-video": "图生视频",
  "first-last-frame": "首尾帧",
  "reference-to-video": "图片参考",
  "video-to-video": "视频参考"
};

const emptyVideoModes: VideoInputMode[] = ["text-to-video"];
const emptyOfficialVideoModes: OfficialVideoMode[] = ["text_to_video"];
const emptyStrings: string[] = [];
const emptyNumbers: number[] = [];
const videoCategories: OfficialVideoCategory[] = ["text_to_video", "image_to_video", "reference_to_video", "first_last_frame_video", "video_edit", "video_extension"];
const genericCategoryInputModes: Record<OfficialVideoCategory, VideoInputMode[]> = {
  text_to_video: ["text-to-video"],
  image_to_video: ["image-to-video"],
  reference_to_video: ["reference-to-video"],
  first_last_frame_video: ["first-last-frame"],
  video_edit: ["video-to-video"],
  video_extension: []
};

function isRuntimeUsableVideoModel(model: ModelConfig) {
  if (model.providerId === "google") return /^(veo|omni)/i.test(model.modelName);
  if (model.providerId === "alibaba") {
    return [
      "happyhorse-1.0-t2v",
      "wan2.7-t2v-2026-04-25",
      "happyhorse-1.0-i2v",
      "wan2.7-i2v-2026-04-25",
      "happyhorse-1.0-r2v",
      "wan2.7-r2v",
      "happyhorse-1.0-video-edit",
      "wan2.7-videoedit"
    ].includes(model.modelName);
  }
  return ["kling", "grok", "seedance"].includes(model.providerId ?? "");
}

function modelInputModes(model: ModelConfig | undefined) {
  return model?.capabilities?.inputModes ?? emptyVideoModes;
}

function modelSupportsVideoCategory(model: ModelConfig, category: OfficialVideoCategory) {
  if (model.providerId === "google" && /^veo/i.test(model.modelName)) {
    if (category === "video_edit") return false;
    if (model.modelName === "veo-3.1-lite-generate-preview") {
      return category === "text_to_video" || category === "image_to_video" || category === "first_last_frame_video";
    }
    if (category === "video_extension") return model.modelName === "veo-3.1-generate-preview" || model.modelName === "veo-3.1-fast-generate-preview";
    return true;
  }
  if (model.providerId !== "alibaba") return genericCategoryInputModes[category].some((mode) => modelInputModes(model).includes(mode));
  if (category === "text_to_video") return ["happyhorse-1.0-t2v", "wan2.7-t2v-2026-04-25"].includes(model.modelName);
  if (category === "image_to_video") return ["happyhorse-1.0-i2v", "wan2.7-i2v-2026-04-25"].includes(model.modelName);
  if (category === "reference_to_video") return ["happyhorse-1.0-r2v", "wan2.7-r2v"].includes(model.modelName);
  if (category === "first_last_frame_video") return model.modelName === "wan2.7-i2v-2026-04-25";
  if (category === "video_edit") return ["happyhorse-1.0-video-edit", "wan2.7-videoedit"].includes(model.modelName);
  if (category === "video_extension") return model.modelName === "wan2.7-i2v-2026-04-25";
  return false;
}

function disabledCategoryReason(model: ModelConfig | undefined, category: OfficialVideoCategory) {
  if (!model) return undefined;
  if (model.providerId === "google" && model.modelName === "veo-3.1-lite-generate-preview") {
    if (category === "reference_to_video") return "Veo 3.1 Lite 官方不支持 referenceImages，请切换 Veo 3.1 或 Veo 3.1 Fast。";
    if (category === "video_extension") return "Veo 3.1 Lite 官方不支持视频延展，请切换 Veo 3.1 或 Veo 3.1 Fast。";
  }
  return undefined;
}

function defaultModeForCategory(category: OfficialVideoCategory): OfficialVideoMode {
  if (category === "text_to_video") return "text_to_video";
  if (category === "image_to_video") return "image_to_video_first_frame";
  if (category === "reference_to_video") return "reference_images_to_video";
  if (category === "first_last_frame_video") return "image_to_video_first_last_frame";
  if (category === "video_edit") return "video_edit";
  return "video_extension";
}

function maxImagesForMode(model: ModelConfig | undefined, mode: OfficialVideoMode) {
  if (!model) return undefined;
  if (mode === "reference_images_to_video") {
    if (model.modelName === "omni_flash-10s") return 7;
    if (model.providerId === "grok") return 7;
    if (model.providerId === "kling") return 4;
    if (model.providerId === "seedance") return 3;
    if (model.providerId === "google") return 3;
    if (model.modelName === "happyhorse-1.0-r2v" || model.modelName === "wan2.7-r2v") return 5;
  }
  if (mode === "image_to_video_first_frame") return 1;
  if (mode === "image_to_video_first_last_frame") return 2;
  return undefined;
}

function durationOptions(model?: ModelConfig) {
  const duration = model?.capabilities.duration;
  if (!duration) return [] as number[];
  if (duration.type === "fixed") return [duration.value];
  if (duration.type === "enum") return duration.values;
  const values: number[] = [];
  for (let value = duration.min; value <= duration.max; value += duration.step) values.push(value);
  return values;
}

function isVideoOutput(url?: string) {
  return Boolean(url && /\.(mp4|webm|mov|m4v)(\?|$)/i.test(url));
}

function aspectRatioCss(ratio?: string) {
  const [width, height] = (ratio || "16:9").split(":").map(Number);
  return `${width || 16} / ${height || 9}`;
}

function humanizeError(error: unknown) {
  const message = error instanceof Error ? error.message : "视频生成失败";
  if (/fetch failed/i.test(message)) return "网络请求失败，请检查本地服务、接口地址或第三方 API 网络连接。";
  return message;
}

function generateButtonLabel(status: VideoNodeData["status"]) {
  if (status === "generating") return "生成中...";
  if (status === "success") return "重新生成";
  if (status === "error") return "重试生成";
  return "生成视频";
}

function statusText(status: VideoNodeData["status"]) {
  return { idle: "未生成", generating: "生成中", success: "已完成", error: "失败" }[status];
}

function PayloadSummary({ data }: { data?: Record<string, unknown> }) {
  if (!data) return null;
  const entries = ([
    ["selectedModelId", data.selectedModelId],
    ["actualModelName", data.actualModelName],
    ["providerId", data.providerId],
    ["adapterName", data.adapterName],
    ["inputMode", data.inputMode],
    ["videoMode", data.videoMode],
    ["qualityTier", data.qualityTier],
    ["qualityMode", data.qualityMode],
    ["configuredModel", data.configuredModel],
    ["proxyModel", data.proxyModel],
    ["relayModel", data.relayModel],
    ["relayProtocol", data.relayProtocol],
    ["resolution", data.mappedResolution],
    ["aspectRatio", data.aspectRatio],
    ["ratio", data.ratio],
    ["duration", data.duration],
    ["promptLength", data.promptLength],
    ["finalPromptLength", data.finalPromptLength],
    ["negativePromptLength", data.negativePromptLength],
    ["promptExtend", data.promptExtend],
    ["seed", data.seed],
    ["isMock", String(data.isMock)],
    ["isFallback", String(data.isFallback)],
    ["isFastModel", String(data.isFastModel)],
    ["inputImageSource", data.inputImageSource],
    ["inputImageWidth", data.inputImageWidth],
    ["inputImageHeight", data.inputImageHeight],
    ["inputImageFileSize", data.inputImageFileSize],
    ["inputImageWasCompressed", String(data.inputImageWasCompressed)],
    ["inputPreprocessed", String(data.inputPreprocessed)],
    ["outputAspectRatio", data.outputAspectRatio],
    ["outputAspectRatioTransformed", String(data.outputAspectRatioTransformed)],
    ["outputWidth", data.outputWidth],
    ["outputHeight", data.outputHeight],
    ["outputDuration", data.outputDuration],
    ["outputFileSize", data.outputFileSize]
  ] as Array<[string, unknown]>).filter(([, value]) => value !== undefined && value !== "");
  return (
    <details className="nodrag nopan rounded-xl border border-white/[0.06] bg-black/[0.16] px-3 py-2 text-[11px] text-[#9aa5b5]">
      <summary className="cursor-pointer select-none text-[#cfd6e1]">真实调用参数</summary>
      <div className="mt-2 grid grid-cols-2 gap-x-3 gap-y-1">
        {entries.map(([label, value]) => (
          <div key={String(label)} className="min-w-0">
            <span className="text-[#697386]">{label}：</span>
            <span className="break-all text-[#d8dee8]">{String(value)}</span>
          </div>
        ))}
      </div>
      {data.payloadSummary ? <pre className="mt-2 max-h-28 overflow-auto rounded-lg bg-black/[0.18] p-2 text-[10px] leading-4 text-[#8f9bad]">{JSON.stringify(data.payloadSummary, null, 2)}</pre> : null}
    </details>
  );
}

function numberValue(value: unknown) {
  if (typeof value === "number" && Number.isFinite(value)) return value;
  if (typeof value === "string" && value.trim() && Number.isFinite(Number(value))) return Number(value);
  return undefined;
}

function nestedRecord(value: unknown) {
  return value && typeof value === "object" ? value as Record<string, unknown> : undefined;
}

function formatBytes(value?: number) {
  if (!value) return undefined;
  if (value < 1024 * 1024) return `${Math.round(value / 1024)} KB`;
  return `${(value / 1024 / 1024).toFixed(1)} MB`;
}

function formatBitrate(fileSize?: number, duration?: number) {
  if (!fileSize || !duration) return undefined;
  return `${Math.round((fileSize * 8) / duration / 1000)} kbps`;
}

function ratioFromDimensions(width?: number, height?: number) {
  if (!width || !height) return undefined;
  const value = width / height;
  if (Math.abs(value - 16 / 9) < 0.04) return "16:9";
  if (Math.abs(value - 9 / 16) < 0.04) return "9:16";
  if (Math.abs(value - 1) < 0.04) return "1:1";
  return `${width}:${height}`;
}

function outputInfo(data?: Record<string, unknown>, requestedResolution?: string) {
  if (!data) return undefined;
  const transformedOutput = nestedRecord(data.transformedOutput);
  const originalOutput = nestedRecord(data.originalOutput);
  const nestedOutput = nestedRecord(data.payloadSummary)?.output;
  const output = nestedRecord(nestedOutput);
  const width = numberValue(data.outputWidth) ?? numberValue(transformedOutput?.width) ?? numberValue(output?.width);
  const height = numberValue(data.outputHeight) ?? numberValue(transformedOutput?.height) ?? numberValue(output?.height);
  const duration = numberValue(data.outputDuration) ?? numberValue(transformedOutput?.duration) ?? numberValue(output?.duration);
  const fileSize = numberValue(data.outputFileSize) ?? numberValue(transformedOutput?.fileSize) ?? numberValue(output?.fileSize);
  if (!width && !height && !fileSize) return undefined;
  const requested = String(requestedResolution ?? data.mappedResolution ?? data.resolution ?? "");
  const expectedShortEdge = requested.toLowerCase() === "1080p" ? 1080 : requested.toLowerCase() === "4k" ? 2160 : requested.toLowerCase() === "720p" ? 720 : undefined;
  const shortEdge = width && height ? Math.min(width, height) : undefined;
  const lowerThanRequested = Boolean(expectedShortEdge && shortEdge && shortEdge < expectedShortEdge - 12);
  return {
    width,
    height,
    duration,
    fileSize,
    bitrate: formatBitrate(fileSize, duration),
    fileSizeLabel: formatBytes(fileSize),
    ratio: ratioFromDimensions(width, height),
    transformed: data.outputAspectRatioTransformed === true,
    originalWidth: numberValue(originalOutput?.width),
    originalHeight: numberValue(originalOutput?.height),
    lowerThanRequested
  };
}

function stringList(value: unknown) {
  return Array.isArray(value) ? value.filter((item): item is string => typeof item === "string" && Boolean(item.trim())) : [];
}

function VideoNodeComponent(props: NodeProps<VideoNodeData>) {
  const update = useCanvasStore((state) => state.updateNodeData);
  const edges = useCanvasStore((state) => state.edges);
  const nodes = useCanvasStore((state) => state.nodes);
  const allModels = useModelConfigStore((state) => state.modelConfigs);
  const [videoCategory, setVideoCategory] = useState<OfficialVideoCategory>(() => categoryForOfficialVideoMode(props.data.videoMode ?? legacyInputModeToOfficialMode(props.data.inputMode)));
  const models = useMemo(
    () => allModels.filter((model) => model.enabled && model.category === "video" && isRuntimeUsableVideoModel(model) && modelSupportsVideoCategory(model, videoCategory)),
    [allModels, videoCategory]
  );
  const [dynamicOptions, setDynamicOptions] = useState<AvailableVideoOptions | null>(null);
  const [localError, setLocalError] = useState("");
  const [localPrompt, setLocalPrompt] = useState(props.data.prompt || "");
  const [parametersOpen, setParametersOpen] = useState(false);
  const [expanded, setExpanded] = useState(false);
  const [activeTool, setActiveTool] = useState<NodeTool>(null);
  const [listening, setListening] = useState(false);
  const isComposingRef = useRef(false);
  const parameterAnchorRef = useRef<HTMLDivElement | null>(null);

  const selectedModel = models.find((model) => model.id === props.data.modelConfigId);
  const staleModel = props.data.modelConfigId && !allModels.some((model) => model.id === props.data.modelConfigId && model.enabled);
  const resolvedInputs = useMemo(() => resolveVideoNodeInputs(props.id, nodes, edges), [edges, nodes, props.id]);

  useEffect(() => {
    function closeFloatingPanels(event: PointerEvent) {
      if ((event.target as HTMLElement | null)?.closest(".creation-dock, .node-parameter-popover")) return;
      setParametersOpen(false);
      setActiveTool(null);
      setExpanded(false);
    }
    function closeOnEscape(event: KeyboardEvent) {
      if (event.key !== "Escape") return;
      setParametersOpen(false);
      setActiveTool(null);
      setExpanded(false);
    }
    window.addEventListener("pointerdown", closeFloatingPanels);
    window.addEventListener("keydown", closeOnEscape);
    return () => {
      window.removeEventListener("pointerdown", closeFloatingPanels);
      window.removeEventListener("keydown", closeOnEscape);
    };
  }, []);

  useEffect(() => {
    const currentCategory = categoryForOfficialVideoMode(props.data.videoMode ?? legacyInputModeToOfficialMode(props.data.inputMode));
    if (currentCategory !== videoCategory && modelSupportsVideoCategory(selectedModel ?? ({} as ModelConfig), currentCategory)) setVideoCategory(currentCategory);
  }, [props.data.inputMode, props.data.videoMode, selectedModel, videoCategory]);

  function changeVideoCategory(category: OfficialVideoCategory) {
    const reason = disabledCategoryReason(selectedModel, category);
    if (reason) {
      setLocalError(reason);
      return;
    }
    const nextMode = defaultModeForCategory(category);
    const nextModel = allModels.find((model) => model.enabled && model.category === "video" && isRuntimeUsableVideoModel(model) && modelSupportsVideoCategory(model, category));
    setVideoCategory(category);
    update(props.id, {
      modelConfigId: nextModel?.id ?? props.data.modelConfigId,
      videoMode: nextMode,
      inputMode: officialModeToLegacyInputMode(nextMode)
    });
  }

  useEffect(() => {
    if (isComposingRef.current) return;
    const nextPrompt = props.data.prompt || "";
    setLocalPrompt((currentPrompt) => (currentPrompt === nextPrompt ? currentPrompt : nextPrompt));
  }, [props.data.prompt]);

  function handlePromptChange(event: ChangeEvent<HTMLTextAreaElement>) {
    const value = event.target.value;
    setLocalPrompt(value);
    if (!isComposingRef.current) update(props.id, { prompt: value });
  }

  function handleCompositionStart() {
    isComposingRef.current = true;
  }

  function handleCompositionEnd(event: CompositionEvent<HTMLTextAreaElement>) {
    isComposingRef.current = false;
    const value = event.currentTarget.value;
    setLocalPrompt(value);
    update(props.id, { prompt: value });
  }

  const inputContext = useMemo(
    () => ({
      inputMode: props.data.inputMode,
      videoMode: props.data.videoMode ?? legacyInputModeToOfficialMode(props.data.inputMode),
      hasImageInput: resolvedInputs.hasImageInput,
      hasVideoInput: resolvedInputs.hasVideoInput,
      hasReferenceImage: resolvedInputs.hasReferenceImage,
      hasFirstLastFrame: resolvedInputs.hasFirstLastFrame,
      selectedResolution: props.data.resolution,
      selectedAspectRatio: props.data.aspectRatio,
      selectedDuration: props.data.duration
    }),
    [props.data.aspectRatio, props.data.duration, props.data.inputMode, props.data.resolution, props.data.videoMode, resolvedInputs.hasFirstLastFrame, resolvedInputs.hasImageInput, resolvedInputs.hasReferenceImage, resolvedInputs.hasVideoInput]
  );

  useEffect(() => {
    let cancelled = false;
    if (!props.data.modelConfigId) {
      setDynamicOptions(null);
      return;
    }
    modelConfigApi
      .options(props.data.modelConfigId, inputContext)
      .then((result) => {
        if (cancelled) return;
        setDynamicOptions(result);
        const normalized = result.normalizedSelection;
        const patch: Partial<VideoNodeData> = {};
        if (normalized.inputMode && normalized.inputMode !== props.data.inputMode) patch.inputMode = normalized.inputMode as VideoInputMode;
        if (normalized.videoMode && normalized.videoMode !== props.data.videoMode) patch.videoMode = normalized.videoMode;
        if (normalized.aspectRatio && normalized.aspectRatio !== props.data.aspectRatio) patch.aspectRatio = normalized.aspectRatio;
        if (normalized.resolution && normalized.resolution !== props.data.resolution) patch.resolution = normalized.resolution;
        if (normalized.duration && normalized.duration !== props.data.duration) patch.duration = normalized.duration;
        if (Object.keys(patch).length) update(props.id, patch as Record<string, unknown>);
      })
      .catch(() => {
        if (!cancelled) setDynamicOptions(null);
      });
    return () => {
      cancelled = true;
    };
  }, [props.data.modelConfigId, inputContext, props.data.aspectRatio, props.data.duration, props.data.inputMode, props.data.resolution, props.id, update]);

  const selectedInputModes = selectedModel?.capabilities?.inputModes;
  const selectedAspectRatios = selectedModel?.capabilities?.aspectRatios;
  const selectedResolutions = selectedModel?.capabilities?.resolutions;
  const availableModes = useMemo(() => (dynamicOptions?.availableInputModes ?? selectedInputModes ?? emptyVideoModes) as VideoInputMode[], [dynamicOptions?.availableInputModes, selectedInputModes]);
  const availableVideoModes = useMemo(() => dynamicOptions?.availableVideoModes ?? availableModes.map((mode) => legacyInputModeToOfficialMode(mode)) ?? emptyOfficialVideoModes, [availableModes, dynamicOptions?.availableVideoModes]);
  const availableRatios = useMemo(() => dynamicOptions?.availableAspectRatios ?? selectedAspectRatios ?? emptyStrings, [dynamicOptions?.availableAspectRatios, selectedAspectRatios]);
  const availableResolutions = useMemo(() => dynamicOptions?.availableResolutions ?? selectedResolutions ?? emptyStrings, [dynamicOptions?.availableResolutions, selectedResolutions]);
  const availableDurations = useMemo(() => dynamicOptions?.availableDurations ?? durationOptions(selectedModel) ?? emptyNumbers, [dynamicOptions?.availableDurations, selectedModel]);
  const outputUrl = absoluteUploadUrl(props.data.outputUrl);
  const outputIsVideo = isVideoOutput(props.data.outputUrl);
  const actualOutputInfo = outputInfo(props.data.payloadSummary, props.data.resolution);
  const veoSafetyDetails = (props.data.payloadSummary ?? {}) as Record<string, unknown>;
  const isVeoRaiFiltered = props.data.errorCode === "VEO_RAI_FILTERED_NO_VIDEO" || veoSafetyDetails.type === "RAI_FILTERED";
  const veoRaiReasons = stringList(veoSafetyDetails.reasons ?? veoSafetyDetails.raiMediaFilteredReasons);
  const veoSafePrompt = typeof veoSafetyDetails.suggestion === "string" ? veoSafetyDetails.suggestion : typeof veoSafetyDetails.sanitizedPrompt === "string" ? veoSafetyDetails.sanitizedPrompt : "";
  const veoProductOnlyPrompt = typeof veoSafetyDetails.productOnlyPrompt === "string" ? veoSafetyDetails.productOnlyPrompt : "clean product-only commercial video, no human face, no voice, no dangerous action, studio lighting, realistic camera movement";

  function retryWithPrompt(prompt: string) {
    setLocalPrompt(prompt);
    update(props.id, { prompt, status: "idle", errorCode: undefined, errorMessage: undefined, debugMessage: undefined });
    void generate(prompt);
  }

  function switchOtherVideoModel() {
    const alternative = allModels.find((model) => model.enabled && model.category === "video" && model.providerId !== "google");
    if (!alternative) {
      window.alert("当前没有已启用的 Seedance / 可灵 / Wan 视频模型，请先到模型配置中心填写 API。");
      return;
    }
    update(props.id, { modelConfigId: alternative.id, errorCode: undefined, errorMessage: undefined, debugMessage: undefined });
  }

  const inputStatusItems = useMemo(() => {
    const mode = props.data.videoMode ?? legacyInputModeToOfficialMode(props.data.inputMode);
    if (mode === "reference_images_to_video") {
      const label = selectedModel?.providerId === "seedance" || selectedModel?.modelName === "kling-v3-omni" ? "全能参考素材" : "参考图片";
      return [{ icon: ImageIcon, label, connected: resolvedInputs.hasReferenceImage }];
    }
    if (mode === "image_to_video_first_last_frame") {
      return [
        { icon: ImageIcon, label: "首帧", connected: resolvedInputs.hasFirstFrame },
        { icon: ImageIcon, label: "尾帧", connected: resolvedInputs.hasLastFrame }
      ];
    }
    if (mode === "image_to_video_first_frame") return [{ icon: ImageIcon, label: "首帧图", connected: resolvedInputs.hasImageInput }];
    if (mode === "video_continuation") return [{ icon: BoxSelect, label: "续写视频", connected: resolvedInputs.hasVideoInput }];
    if (mode === "video_edit" || mode === "video_to_video") return [{ icon: BoxSelect, label: "视频输入", connected: resolvedInputs.hasVideoInput }];
    if (mode === "audio_driven_video") return [
      { icon: ImageIcon, label: "首帧图", connected: resolvedInputs.hasImageInput },
      { icon: BoxSelect, label: "驱动音频", connected: resolvedInputs.audioInputs.length > 0 }
    ];
    return [
      { icon: ImageIcon, label: "图片输入", connected: resolvedInputs.hasImageInput },
      { icon: BoxSelect, label: "视频输入", connected: resolvedInputs.hasVideoInput }
    ];
  }, [props.data.inputMode, props.data.videoMode, resolvedInputs.audioInputs.length, resolvedInputs.hasFirstFrame, resolvedInputs.hasImageInput, resolvedInputs.hasLastFrame, resolvedInputs.hasReferenceImage, resolvedInputs.hasVideoInput]);

  async function generate(promptOverride?: string) {
    if (!props.data.modelConfigId || !selectedModel) {
      update(props.id, { errorMessage: "暂无可用模型，请先到设置中心配置 API。", status: "error" });
      return;
    }
    const promptForRequest = promptOverride ?? localPrompt ?? props.data.prompt;
    update(props.id, { status: "generating", errorCode: undefined, errorMessage: undefined, debugMessage: undefined });
    setLocalError("");
    try {
      const videoMode = props.data.videoMode ?? legacyInputModeToOfficialMode(props.data.inputMode);
      const maxImages = maxImagesForMode(selectedModel, videoMode);
      if (maxImages && resolvedInputs.imageInputs.length > maxImages) throw new Error(`当前模式最多支持 ${maxImages} 张图片。你当前连接了 ${resolvedInputs.imageInputs.length} 张，请删除多余图片或切换到支持多参考图的模型。`);
      if (videoMode === "image_to_video_first_frame" && !resolvedInputs.hasImageInput) throw new Error("首帧图生视频需要连接一张首帧图片。");
      if (videoMode === "reference_images_to_video" && !resolvedInputs.hasReferenceImage) {
        const isOmniReference = selectedModel.providerId === "seedance" || selectedModel.modelName === "kling-v3-omni";
        throw new Error(isOmniReference ? "全能参考需要至少连接一张参考图片。" : "参考图生视频需要至少一张参考图片。");
      }
      if (videoMode === "image_to_video_first_last_frame" && !resolvedInputs.hasFirstFrame) throw new Error("首尾帧模式需要连接首帧图片。");
      if (videoMode === "image_to_video_first_last_frame" && !resolvedInputs.hasLastFrame) throw new Error("首尾帧模式已连接首帧，还需要一张尾帧图片。");
      if ((videoMode === "video_to_video" || videoMode === "video_edit" || videoMode === "video_continuation") && !resolvedInputs.hasVideoInput) throw new Error("当前模式需要连接视频素材。");
      if (videoMode === "audio_driven_video" && !resolvedInputs.audioInputs.length) throw new Error("音频驱动视频需要连接驱动音频。");

      const result = await generationApi.video({
        nodeId: props.id,
        modelConfigId: props.data.modelConfigId,
        inputMode: props.data.inputMode,
        videoMode,
        prompt: promptForRequest,
        imageAssetIds: compactAssetIds(resolvedInputs.imageInputs),
        videoAssetIds: compactAssetIds(resolvedInputs.videoInputs),
        audioAssetIds: compactAssetIds(resolvedInputs.audioInputs),
        duration: props.data.duration ?? availableDurations[0],
        aspectRatio: props.data.aspectRatio ?? availableRatios[0],
        resolution: props.data.resolution ?? availableResolutions[0],
        generateCount: props.data.generateCount,
        qualityMode: props.data.qualityMode ?? "full_quality",
        promptExtend: true,
        realismMode: "natural_human"
      });
      update(
        props.id,
        result.status === "success"
          ? { status: "success", outputAssetId: result.outputAssetId, outputUrl: result.outputUrl, payloadSummary: result.payloadSummary, errorCode: undefined, errorMessage: undefined, debugMessage: undefined }
          : { status: "error", errorCode: result.errorCode, errorMessage: result.errorMessage, debugMessage: result.debugMessage, payloadSummary: result.payloadSummary }
      );
    } catch (error) {
      const message = humanizeError(error);
      setLocalError(message);
      update(props.id, { status: "error", errorMessage: message });
    }
  }

  useEffect(() => {
    function handleRunNode(event: Event) {
      const nodeId = (event as CustomEvent<{ nodeId?: string }>).detail?.nodeId;
      if (nodeId === props.id && props.data.status !== "generating") void generate();
    }
    window.addEventListener("studio:run-node", handleRunNode);
    return () => window.removeEventListener("studio:run-node", handleRunNode);
  });

  function insertPromptContext(value: string) {
    const prefix = activeTool === "tags" ? `#${value}` : activeTool === "camera" ? `运镜：${value}` : activeTool === "characters" ? `角色：${value}` : `引用：${value}`;
    const next = `${localPrompt.trim()}${localPrompt.trim() ? "\n" : ""}${prefix}`;
    setLocalPrompt(next);
    update(props.id, { prompt: next });
  }

  const preview = models.length === 0 ? (
    <div className="creation-preview-empty"><Film size={29} /><span>请先配置视频模型</span></div>
  ) : (
    <MediaPreview type="video" title={props.data.title} outputUrl={outputIsVideo ? props.data.outputUrl : undefined} aspectRatio={aspectRatioCss(props.data.aspectRatio)} className="creation-media-preview">
      {props.data.status === "generating" ? <div className="creation-preview-empty"><Loader2 className="animate-spin" size={25} /><span>正在生成视频</span></div> : props.data.status === "error" ? <div className="creation-preview-empty is-error"><AlertCircle size={25} /><span>生成失败</span></div> : <div className="creation-preview-empty"><Play size={24} fill="currentColor" /><span>视频预览</span></div>}
    </MediaPreview>
  );

  const referencedInputs = [...resolvedInputs.imageInputs, ...resolvedInputs.videoInputs, ...resolvedInputs.audioInputs];
  const dock = (
    <div className="creation-dock-content relative">
      <div className="creation-dock-header">
        <div className="creation-dock-tools">
          <button type="button" title="智能辅助" className={activeTool === "tags" ? "is-active" : ""} onClick={() => { setParametersOpen(false); setActiveTool(activeTool === "tags" ? null : "tags"); }}><Sparkles size={15} /></button>
          <button type="button" title="引用图片" className={activeTool === "assets" ? "is-active" : ""} onClick={() => { setParametersOpen(false); setActiveTool(activeTool === "assets" ? null : "assets"); }}><ImageIcon size={15} /></button>
          <span className="creation-tool-swap">⇄</span>
          <button type="button" title="添加素材或能力" className={activeTool === "quick" ? "is-active" : ""} onClick={() => { setParametersOpen(false); setActiveTool(activeTool === "quick" ? null : "quick"); }}><Plus size={17} /></button>
        </div>
        <button type="button" title={expanded ? "收起详情" : "展开详情"} className="creation-detail-toggle" onClick={() => setExpanded((value) => !value)}><Maximize2 size={14} /></button>
      </div>
      <div className="creation-dock-composer">
        {referencedInputs.length > 0 && <div className="creation-reference-strip">{referencedInputs.map((input, index) => <span key={`${input.sourceNodeId}-${index}`} title={`引用素材 ${index + 1}`}>{input.url && input.mimeType?.startsWith("image") ? <img src={absoluteUploadUrl(input.url)} alt="" /> : <Library size={13} />}<small>素材 {index + 1}</small></span>)}</div>}
        <Textarea className="creation-prompt-input nodrag nopan nowheel" placeholder="描述你想生成的画面，或输入 @ 引用素材" value={localPrompt} onChange={handlePromptChange} onCompositionStart={handleCompositionStart} onCompositionEnd={handleCompositionEnd} />
      </div>
      {(props.data.errorMessage || localError) && <button type="button" className="creation-error-line" onClick={() => setExpanded(true)}><AlertCircle size={12} /><span>{props.data.errorMessage || localError}</span><strong>诊断</strong></button>}
      <div className="creation-dock-footer">
        <div className="creation-dock-identity">
          <div className="creation-model-field"><Activity size={14} /><Select className="creation-model-select" value={props.data.modelConfigId ?? ""} onChange={(event) => update(props.id, { modelConfigId: event.target.value })}><option value="">选择模型</option>{models.map((model) => <option key={model.id} value={model.id}>{model.displayName}</option>)}</Select></div>
          <div ref={parameterAnchorRef} className={`creation-parameter-wrap nodrag nopan ${parametersOpen ? "is-open" : ""}`}>
          <button type="button" className="creation-parameter-pill" onClick={() => { setActiveTool(null); setParametersOpen((value) => !value); }}>{props.data.aspectRatio ?? availableRatios[0] ?? "比例"} · {props.data.resolution ?? availableResolutions[0] ?? "清晰度"} · {props.data.duration ?? availableDurations[0] ?? "-"}s</button>
          <NodeParameterPopover open={parametersOpen} anchorRef={parameterAnchorRef} onClose={() => setParametersOpen(false)} sections={[
            { label: "生成方式", value: props.data.videoMode ?? legacyInputModeToOfficialMode(props.data.inputMode), options: availableVideoModes, format: (value) => dynamicOptions?.videoModeLabels?.[value as OfficialVideoMode] ?? officialVideoModeLabels[value as OfficialVideoMode], onChange: (value) => update(props.id, { videoMode: value, inputMode: officialModeToLegacyInputMode(value as OfficialVideoMode) }) },
            { label: "比例", value: props.data.aspectRatio ?? availableRatios[0], options: availableRatios, onChange: (value) => update(props.id, { aspectRatio: value }) },
            { label: "清晰度", value: props.data.resolution ?? availableResolutions[0], options: availableResolutions, onChange: (value) => update(props.id, { resolution: value }) },
            { label: "生成时长", value: props.data.duration ?? availableDurations[0], options: availableDurations, format: (value) => `${value}s`, onChange: (value) => update(props.id, { duration: Number(value) }) },
            { label: "生成数量", value: props.data.generateCount, options: [1, 2, 3, 4], format: (value) => `${value} 个`, onChange: (value) => update(props.id, { generateCount: Number(value) }) }
          ]} />
          </div>
        </div>
        <div className="creation-dock-actions">
          <button type="button" title="语音输入" className={listening ? "is-active" : ""} onClick={() => setListening((value) => !value)}><Mic size={14} /></button>
          <button type="button" title="生成数量" onClick={() => update(props.id, { generateCount: (props.data.generateCount % 4) + 1 })}>{props.data.generateCount || 1}x</button>
          <button type="button" title={props.data.status === "idle" ? "生成" : generateButtonLabel(props.data.status)} aria-label={props.data.status === "idle" ? "生成" : generateButtonLabel(props.data.status)} className="creation-generate-button" disabled={!selectedModel || availableVideoModes.length === 0 || props.data.status === "generating"} onClick={() => void generate()}><ArrowUp size={16} /></button>
        </div>
      </div>
      <NodeToolPanel tool={activeTool} onClose={() => setActiveTool(null)} onInsert={insertPromptContext} />
      {expanded && <div className="creation-detail-panel nodrag nopan">
        <div className="creation-detail-section"><strong>生成方式</strong><div className="flex flex-wrap gap-1.5">{videoCategories.map((category) => { const disabledReason = disabledCategoryReason(selectedModel, category); return <button key={category} disabled={Boolean(disabledReason)} title={disabledReason} className={videoCategory === category ? "is-active" : ""} onClick={() => changeVideoCategory(category)}>{officialVideoCategoryLabels[category]}</button>; })}</div></div>
        {actualOutputInfo && props.data.status === "success" && <div className="creation-detail-copy">实际输出：{actualOutputInfo.width && actualOutputInfo.height ? `${actualOutputInfo.width}×${actualOutputInfo.height}` : "未知尺寸"}{actualOutputInfo.ratio ? ` · ${actualOutputInfo.ratio}` : ""}{actualOutputInfo.duration ? ` · ${actualOutputInfo.duration.toFixed(1)}s` : ""}</div>}
        {dynamicOptions?.warningMessage && <div className="creation-detail-copy">{dynamicOptions.warningMessage}</div>}
        {staleModel && <div className="creation-detail-copy is-error">当前模型配置已失效，请重新选择模型。</div>}
        {isVeoRaiFiltered && <div className="creation-detail-copy">安全过滤：{veoRaiReasons.join("；") || "当前内容需要安全改写"}<div className="mt-2 flex gap-2"><Button className="h-7" variant="secondary" onClick={() => retryWithPrompt(veoSafePrompt || props.data.prompt)}>安全改写重试</Button><Button className="h-7" variant="ghost" onClick={switchOtherVideoModel}>切换模型</Button></div></div>}
        <PayloadSummary data={props.data.payloadSummary} />
        {(props.data.errorMessage || localError) && <AgentAnalyzeErrorButton nodeId={props.id} errorMessage={props.data.errorMessage || localError} nodeData={props.data as unknown as Record<string, unknown>} />}
      </div>}
    </div>
  );

  return <CreationNodeFrame id={props.id} type={props.type} selected={props.selected} title={props.data.title || "Video"} ratio={props.data.aspectRatio || "16:9"} status={props.data.status} preview={preview} toolbar={<MediaPreviewActions kind="video" url={outputIsVideo ? props.data.outputUrl : undefined} assetId={props.data.outputAssetId} title={props.data.title} nodeId={props.id} onSaved={(assetId) => update(props.id, { outputAssetId: assetId })} />} dock={dock} />;
}

export const VideoNode = memo(VideoNodeComponent);
