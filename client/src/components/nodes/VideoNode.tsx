import { memo, useEffect, useMemo, useRef, useState, type ChangeEvent, type CompositionEvent } from "react";
import type { NodeProps } from "reactflow";
import { Activity, AlertCircle, ArrowUp, BoxSelect, Film, Image as ImageIcon, Library, Loader2, Maximize2, Mic, Play, Plus, Sparkles, X } from "lucide-react";
import { Button } from "../common/Button";
import { Select } from "../common/Select";
import { Textarea } from "../common/Textarea";
import { MediaPreview } from "../media/MediaPreview";
import { generationApi } from "../../services/generationApi";
import { modelConfigApi } from "../../services/modelConfigApi";
import { useCanvasStore } from "../../store/canvasStore";
import { useModelConfigStore } from "../../store/modelConfigStore";
import { absoluteUploadUrl } from "../../utils/file";
import { buildReferenceAwareVideoPrompt, compactAssetIds, resolvePromptReferencedVideoInputs, resolveVideoNodeInputs } from "../../utils/workflowInputs";
import { diagnoseVideoChannel } from "../../utils/videoChannelCapability";
import { dedupeModelConfigsForSelect, findCanonicalModelConfig } from "../../utils/modelConfigSelection";
import { AgentAnalyzeErrorButton } from "../agent/AgentAnalyzeErrorButton";
import type { AvailableVideoOptions, ModelConfig, VideoInputMode } from "../../types/model";
import type { VideoNodeData } from "../../types/node";
import { categoryForOfficialVideoMode, legacyInputModeToOfficialMode, officialModeToLegacyInputMode, officialVideoCategoryLabels, officialVideoModeLabels, type OfficialVideoCategory, type OfficialVideoMode } from "../../types/videoModes";
import { NodeParameterPopover } from "./NodeParameterPopover";
import { CreationNodeFrame } from "./CreationNodeFrame";
import { MediaPreviewActions } from "./MediaPreviewActions";
import { NodeToolPanel, type NodeTool, type ReferenceMenuItem } from "./NodeToolPanel";

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

function channelHost(apiBaseUrl?: string) {
  if (!apiBaseUrl) return "";
  try {
    return new URL(apiBaseUrl).host.replace(/^www\./, "");
  } catch {
    return apiBaseUrl.replace(/^https?:\/\//i, "").replace(/\/.*$/, "");
  }
}

function modelOptionLabel(model: ModelConfig, models: ModelConfig[]) {
  const host = channelHost(model.apiBaseUrl);
  const duplicateName = models.some((item) => item.id !== model.id && item.displayName === model.displayName);
  if (!host || !duplicateName) return model.displayName;
  return `${model.displayName} · ${host}`;
}

function modelIdentity(model?: ModelConfig) {
  if (!model) return "";
  return `${model.providerId} ${model.provider} ${model.modelName} ${model.displayName}`.toLowerCase();
}

function isSeedanceModel(model?: ModelConfig) {
  return /seedance|doubao/.test(modelIdentity(model));
}

function isKlingOmniModel(model?: ModelConfig) {
  const identity = modelIdentity(model);
  return /kling|可灵/.test(identity) && /(3[._ -]?0|v3|omni)/.test(identity);
}

function supportsUniversalReference(model?: ModelConfig) {
  return isSeedanceModel(model) || isKlingOmniModel(model);
}

function videoModeLabelForModel(model: ModelConfig | undefined, mode: OfficialVideoMode, fallback?: string) {
  if (mode === "reference_images_to_video" && supportsUniversalReference(model)) return "全能参考";
  return fallback ?? officialVideoModeLabels[mode];
}

function videoCategoryLabelForModel(model: ModelConfig | undefined, category: OfficialVideoCategory) {
  if (category === "reference_to_video" && supportsUniversalReference(model)) return "全能参考";
  return officialVideoCategoryLabels[category];
}

function isRuntimeUsableVideoModel(model: ModelConfig) {
  return model.enabled && model.category === "video" && modelInputModes(model).some((mode) =>
    ["text-to-video", "image-to-video", "first-last-frame", "reference-to-video", "video-to-video"].includes(mode)
  );
}

function modelInputModes(model: ModelConfig | undefined) {
  if (!model) return emptyVideoModes;
  const theoretical = model.capabilities.modelCapability;
  const channel = { ...model.capabilities, ...model.capabilities.channelCapability };
  const modes = new Set(channel.inputModes ?? []);
  if (theoretical?.supportsTextToVideo) modes.add("text-to-video");
  if (theoretical?.supportsImageToVideo) modes.add("image-to-video");
  if (theoretical?.supportsFirstLastFrame) modes.add("first-last-frame");
  if (theoretical?.supportsVideoToVideo) modes.add("video-to-video");
  for (const input of channel.supportedInputs ?? []) {
    if (input === "text") modes.add("text-to-video");
    if (["image", "first_frame"].includes(input)) modes.add("image-to-video");
    if (input === "reference_image") modes.add("reference-to-video");
    if (input === "first_last_frame") modes.add("first-last-frame");
    if (input === "video") modes.add("video-to-video");
  }
  return Array.from(modes) as VideoInputMode[];
}

function modelSupportsVideoCategory(model: ModelConfig, category: OfficialVideoCategory) {
  if (category === "video_extension") return modelInputModes(model).includes("video-to-video");
  return genericCategoryInputModes[category].some((mode) => modelInputModes(model).includes(mode));
}

function disabledCategoryReason(model: ModelConfig | undefined, category: OfficialVideoCategory) {
  if (!model) return undefined;
  if (!modelSupportsVideoCategory(model, category)) return "当前上游模型配置未启用这个生成方式。";
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
    if (isSeedanceModel(model)) return model.capabilities.maxReferenceImages ?? 9;
    if (model.providerId === "google") return 3;
    if (model.modelName === "happyhorse-1.0-r2v" || model.modelName === "wan2.7-r2v") return 5;
  }
  if (mode === "image_to_video_first_frame") return 1;
  if (mode === "image_to_video_first_last_frame") return 2;
  return undefined;
}

function durationLabel(value: string | number) {
  return Number(value) === 0 ? "Auto" : `${value}s`;
}

type MentionRange = { start: number; end: number };

function findReferenceMentionRange(value: string, caret = value.length): MentionRange | null {
  const safeCaret = Math.max(0, Math.min(caret, value.length));
  const beforeCaret = value.slice(0, safeCaret);
  const at = beforeCaret.lastIndexOf("@");
  if (at < 0) return null;
  const token = beforeCaret.slice(at);
  if (!token || /\s/.test(token.slice(1))) return null;
  if (!/^@{1,2}[\p{L}\p{N}_-]*$/u.test(token)) return null;
  return { start: at, end: safeCaret };
}

function universalReferenceDescription(model: ModelConfig | undefined) {
  if (!supportsUniversalReference(model)) return undefined;
  const images = model?.capabilities.maxReferenceImages ?? (isSeedanceModel(model) ? 9 : 4);
  const videos = model?.capabilities.maxReferenceVideos ?? (isSeedanceModel(model) ? 3 : undefined);
  const audios = model?.capabilities.maxReferenceAudios ?? (isSeedanceModel(model) ? 3 : undefined);
  const parts = [`最多${images}张图`];
  if (videos) parts.push(`最多${videos}个视频`);
  if (audios) parts.push(`最多${audios}段音频`);
  return parts.join(" + ");
}

function parameterValue<T>(selected: T | undefined, available: T[]) {
  if (!available.length) return undefined;
  if (selected !== undefined && available.some((value) => String(value) === String(selected))) return selected;
  return available[0];
}

function parameterSummary(input: { aspectRatio?: string; resolution?: string; duration?: number; ratios: string[]; resolutions: string[]; durations: number[] }) {
  const ratio = parameterValue(input.aspectRatio, input.ratios) ?? "模型默认比例";
  const resolution = parameterValue(input.resolution, input.resolutions) ?? "模型默认清晰度";
  const duration = parameterValue(input.duration, input.durations);
  return `${ratio} · ${resolution} · ${duration === undefined ? "模型默认时长" : durationLabel(duration)}`;
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

function compactName(value?: string, fallback = "素材") {
  const text = value?.trim() || fallback;
  return text.length > 18 ? `${text.slice(0, 17)}...` : text;
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

function displayAspectRatio(nodeRatio?: string, selectedRatio?: string) {
  return selectedRatio || nodeRatio || "16:9";
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
  const deleteEdges = useCanvasStore((state) => state.deleteEdges);
  const edges = useCanvasStore((state) => state.edges);
  const nodes = useCanvasStore((state) => state.nodes);
  const allModels = useModelConfigStore((state) => state.modelConfigs);
  const [videoCategory, setVideoCategory] = useState<OfficialVideoCategory>(() => categoryForOfficialVideoMode(props.data.videoMode ?? legacyInputModeToOfficialMode(props.data.inputMode)));
  const rawModels = useMemo(
    () => allModels.filter((model) => model.enabled && model.category === "video" && isRuntimeUsableVideoModel(model) && modelSupportsVideoCategory(model, videoCategory)),
    [allModels, videoCategory]
  );
  const models = useMemo(() => dedupeModelConfigsForSelect(rawModels), [rawModels]);
  const [dynamicOptions, setDynamicOptions] = useState<AvailableVideoOptions | null>(null);
  const [localError, setLocalError] = useState("");
  const [localPrompt, setLocalPrompt] = useState(props.data.prompt || "");
  const [parametersOpen, setParametersOpen] = useState(false);
  const [expanded, setExpanded] = useState(false);
  const [activeTool, setActiveTool] = useState<NodeTool>(null);
  const [listening, setListening] = useState(false);
  const [pendingMentionRange, setPendingMentionRange] = useState<MentionRange | null>(null);
  const isComposingRef = useRef(false);
  const promptTextareaRef = useRef<HTMLTextAreaElement | null>(null);
  const parameterAnchorRef = useRef<HTMLDivElement | null>(null);

  const selectedModel = models.find((model) => model.id === props.data.modelConfigId);
  const staleModel = props.data.modelConfigId && !allModels.some((model) => model.id === props.data.modelConfigId && model.enabled);
  const resolvedInputs = useMemo(() => resolveVideoNodeInputs(props.id, nodes, edges), [edges, nodes, props.id]);
  const channelDiagnostic = useMemo(
    () => diagnoseVideoChannel(selectedModel, allModels, resolvedInputs.imageInputs.length > 0),
    [allModels, resolvedInputs.imageInputs.length, selectedModel]
  );

  useEffect(() => {
    if (selectedModel || !models.length) return;
    const canonical = findCanonicalModelConfig(rawModels, props.data.modelConfigId);
    if (canonical) {
      update(props.id, { modelConfigId: canonical.id, errorCode: undefined, errorMessage: undefined, debugMessage: undefined });
      return;
    }
    update(props.id, { modelConfigId: models[0].id, errorCode: undefined, errorMessage: undefined, debugMessage: undefined });
  }, [models, props.data.modelConfigId, props.id, rawModels, selectedModel, update]);

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
    const nextModel = dedupeModelConfigsForSelect(allModels.filter((model) => model.enabled && model.category === "video" && isRuntimeUsableVideoModel(model) && modelSupportsVideoCategory(model, category)))[0];
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
    maybeOpenReferenceMenu(event.currentTarget);
  }

  function handleCompositionStart() {
    isComposingRef.current = true;
  }

  function handleCompositionEnd(event: CompositionEvent<HTMLTextAreaElement>) {
    isComposingRef.current = false;
    const value = event.currentTarget.value;
    setLocalPrompt(value);
    update(props.id, { prompt: value });
    maybeOpenReferenceMenu(event.currentTarget);
  }

  function hasReferenceInputs() {
    return Boolean(resolvedInputs.imageInputs.length || resolvedInputs.videoInputs.length || resolvedInputs.audioInputs.length);
  }

  function maybeOpenReferenceMenu(textarea = promptTextareaRef.current) {
    if (isComposingRef.current || !textarea || !hasReferenceInputs()) return;
    const range = findReferenceMentionRange(textarea.value, textarea.selectionStart ?? textarea.value.length);
    setPendingMentionRange(range);
    if (range) {
      setParametersOpen(false);
      setActiveTool("assets");
    }
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

  useEffect(() => {
    if (!resolvedInputs.hasImageInput || !selectedModel) return;
    const currentMode = props.data.videoMode ?? legacyInputModeToOfficialMode(props.data.inputMode);
    if (currentMode !== "text_to_video" && availableVideoModes.includes(currentMode)) return;
    const nextMode = availableVideoModes.includes("reference_images_to_video")
      ? "reference_images_to_video"
      : availableVideoModes.includes("image_to_video_first_frame")
        ? "image_to_video_first_frame"
        : undefined;
    if (!nextMode || nextMode === currentMode) return;
    setVideoCategory(categoryForOfficialVideoMode(nextMode));
    update(props.id, {
      videoMode: nextMode,
      inputMode: officialModeToLegacyInputMode(nextMode),
      errorCode: undefined,
      errorMessage: undefined,
      debugMessage: undefined
    });
  }, [availableVideoModes, props.data.inputMode, props.data.videoMode, props.id, resolvedInputs.hasImageInput, selectedModel, update]);
  const selectedAspectRatio = parameterValue(props.data.aspectRatio, availableRatios);
  const selectedResolution = parameterValue(props.data.resolution, availableResolutions);
  const selectedDuration = parameterValue(props.data.duration, availableDurations);
  const selectedVideoMode = props.data.videoMode ?? legacyInputModeToOfficialMode(props.data.inputMode);
  const selectedVideoModeLabel = videoModeLabelForModel(selectedModel, selectedVideoMode, dynamicOptions?.videoModeLabels?.[selectedVideoMode]);
  const outputUrl = absoluteUploadUrl(props.data.outputUrl);
  const outputIsVideo = isVideoOutput(props.data.outputUrl);
  const displayRatio = displayAspectRatio(props.data.aspectRatio, selectedAspectRatio);
  const selectedChannelHost = channelHost(selectedModel?.apiBaseUrl);
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
      const label = supportsUniversalReference(selectedModel) ? "全能参考素材" : "参考图片";
      const connected = supportsUniversalReference(selectedModel)
        ? resolvedInputs.hasReferenceImage || resolvedInputs.hasVideoInput || resolvedInputs.audioInputs.length > 0
        : resolvedInputs.hasReferenceImage;
      return [{ icon: ImageIcon, label, connected }];
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
  }, [props.data.inputMode, props.data.videoMode, resolvedInputs.audioInputs.length, resolvedInputs.hasFirstFrame, resolvedInputs.hasImageInput, resolvedInputs.hasLastFrame, resolvedInputs.hasReferenceImage, resolvedInputs.hasVideoInput, selectedModel]);

  async function generate(promptOverride?: string) {
    if (!props.data.modelConfigId || !selectedModel) {
      update(props.id, { errorMessage: "暂无可用模型，请先到设置中心配置 API。", status: "error" });
      return;
    }
    const promptForRequest = promptOverride ?? localPrompt ?? props.data.prompt;
    update(props.id, { status: "generating", errorCode: undefined, errorMessage: undefined, debugMessage: undefined });
    setLocalError("");
    try {
      if (channelDiagnostic.whyBlocked) {
        const suggestion = channelDiagnostic.sameModelImageCapableChannels[0];
        if (suggestion) throw new Error(`当前通道不支持图生视频，可切换到「${suggestion.label}」继续生成。`);
        throw new Error("当前模型暂无图生视频能力。");
      }
      const videoMode = props.data.videoMode ?? legacyInputModeToOfficialMode(props.data.inputMode);
      const promptReferencedInputs = supportsUniversalReference(selectedModel) && videoMode === "reference_images_to_video"
        ? resolvePromptReferencedVideoInputs(promptForRequest, resolvedInputs)
        : { ...resolvedInputs, hasPromptReferences: false, missingPromptReferences: [] as string[] };
      const requestInputs = promptReferencedInputs.hasPromptReferences ? promptReferencedInputs : resolvedInputs;
      const referenceBindings = promptReferencedInputs.hasPromptReferences
        ? promptReferencedInputs.referenceBindings ?? []
        : [];
      const promptForProvider = supportsUniversalReference(selectedModel) && videoMode === "reference_images_to_video"
        ? (promptReferencedInputs.referencePrompt ?? buildReferenceAwareVideoPrompt(promptForRequest, requestInputs))
        : promptForRequest;
      if (promptReferencedInputs.missingPromptReferences.length) {
        throw new Error(`提示词中的引用不存在：${promptReferencedInputs.missingPromptReferences.join("、")}。请使用 @素材1、@图像1、@视频1 或 @音频1。`);
      }
      const maxImages = maxImagesForMode(selectedModel, videoMode);
      if (maxImages && requestInputs.imageInputs.length > maxImages) throw new Error(`当前模式最多支持 ${maxImages} 张图片。你当前引用了 ${requestInputs.imageInputs.length} 张，请删除多余图片或切换到支持多参考图的模型。`);
      const maxVideos = selectedModel.capabilities.maxReferenceVideos;
      const maxAudios = selectedModel.capabilities.maxReferenceAudios;
      const maxReferenceFiles = selectedModel.capabilities.maxReferenceFiles;
      if (maxVideos && requestInputs.videoInputs.length > maxVideos) throw new Error(`当前模型最多支持 ${maxVideos} 个参考视频。`);
      if (maxAudios && requestInputs.audioInputs.length > maxAudios) throw new Error(`当前模型最多支持 ${maxAudios} 段参考音频。`);
      if (maxReferenceFiles && requestInputs.imageInputs.length + requestInputs.videoInputs.length + requestInputs.audioInputs.length > maxReferenceFiles) throw new Error(`当前模型最多支持 ${maxReferenceFiles} 个混合参考素材。`);
      if (videoMode === "image_to_video_first_frame" && !requestInputs.hasImageInput) throw new Error("首帧图生视频需要连接一张首帧图片。");
      if (videoMode === "reference_images_to_video" && supportsUniversalReference(selectedModel) && !requestInputs.hasReferenceImage && !requestInputs.hasVideoInput && !requestInputs.audioInputs.length) {
        throw new Error("全能参考至少需要连接或 @ 引用一张图片、一个视频或一段音频。");
      }
      if (videoMode === "reference_images_to_video" && !supportsUniversalReference(selectedModel) && !requestInputs.hasReferenceImage) {
        const isOmniReference = supportsUniversalReference(selectedModel);
        throw new Error(isOmniReference ? "全能参考需要至少连接一张参考图片。" : "参考图生视频需要至少一张参考图片。");
      }
      if (videoMode === "image_to_video_first_last_frame" && !requestInputs.hasFirstFrame) throw new Error("首尾帧模式需要连接首帧图片。");
      if (videoMode === "image_to_video_first_last_frame" && !requestInputs.hasLastFrame) throw new Error("首尾帧模式已连接首帧，还需要一张尾帧图片。");
      if ((videoMode === "video_to_video" || videoMode === "video_edit" || videoMode === "video_continuation" || videoMode === "video_extension") && !requestInputs.hasVideoInput) throw new Error("当前模式需要连接视频素材。");
      if (videoMode === "audio_driven_video" && !requestInputs.audioInputs.length) throw new Error("音频驱动视频需要连接驱动音频。");

      const result = await generationApi.video({
        nodeId: props.id,
        modelConfigId: props.data.modelConfigId,
        inputMode: props.data.inputMode,
        videoMode,
        prompt: promptForProvider,
        referenceBindings,
        imageAssetIds: compactAssetIds(requestInputs.imageInputs),
        videoAssetIds: compactAssetIds(requestInputs.videoInputs),
        audioAssetIds: compactAssetIds(requestInputs.audioInputs),
        ...(selectedDuration !== undefined ? { duration: selectedDuration } : {}),
        ...(selectedAspectRatio ? { aspectRatio: selectedAspectRatio } : {}),
        ...(selectedResolution ? { resolution: selectedResolution } : {}),
        generateCount: props.data.generateCount,
        qualityMode: props.data.qualityMode ?? "full_quality",
        promptExtend: true,
        realismMode: "natural_human"
      });
      update(
        props.id,
        result.status === "success"
          ? {
            status: "success",
            outputAssetId: result.outputAssetId,
            outputUrl: result.outputUrl,
            payloadSummary: result.payloadSummary,
            aspectRatio: selectedAspectRatio ?? props.data.aspectRatio,
            resolution: selectedResolution ?? props.data.resolution,
            duration: selectedDuration ?? props.data.duration,
            errorCode: undefined,
            errorMessage: undefined,
            debugMessage: undefined
          }
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

  function insertReferenceToken(token: string) {
    const textarea = promptTextareaRef.current;
    const selectionStart = textarea?.selectionStart ?? localPrompt.length;
    const selectionEnd = textarea?.selectionEnd ?? selectionStart;
    const detectedRange = findReferenceMentionRange(localPrompt, selectionStart);
    const range = pendingMentionRange ?? detectedRange;
    let next: string;
    let cursor: number;
    if (range) {
      const before = localPrompt.slice(0, range.start);
      const after = localPrompt.slice(Math.max(range.end, selectionEnd));
      const leadingSpace = before && !/\s$/.test(before) ? " " : "";
      const trailingSpace = after && !/^\s/.test(after) ? " " : " ";
      next = `${before}${leadingSpace}${token}${trailingSpace}${after}`;
      cursor = before.length + leadingSpace.length + token.length + 1;
    } else if (selectionStart !== selectionEnd) {
      const before = localPrompt.slice(0, selectionStart);
      const after = localPrompt.slice(selectionEnd);
      const leadingSpace = before && !/\s$/.test(before) ? " " : "";
      const trailingSpace = after && !/^\s/.test(after) ? " " : " ";
      next = `${before}${leadingSpace}${token}${trailingSpace}${after}`;
      cursor = before.length + leadingSpace.length + token.length + 1;
    } else {
      const before = localPrompt.slice(0, selectionStart);
      const after = localPrompt.slice(selectionStart);
      const leadingSpace = before && !/\s$/.test(before) ? " " : "";
      const trailingSpace = after && !/^\s/.test(after) ? " " : " ";
      next = `${before}${leadingSpace}${token}${trailingSpace}${after}`;
      cursor = before.length + leadingSpace.length + token.length + 1;
    }
    setLocalPrompt(next);
    setPendingMentionRange(null);
    update(props.id, { prompt: next, errorCode: undefined, errorMessage: undefined, debugMessage: undefined });
    window.requestAnimationFrame(() => {
      promptTextareaRef.current?.focus();
      promptTextareaRef.current?.setSelectionRange(cursor, cursor);
    });
  }

  function disconnectReference(sourceNodeId: string) {
    const edgeIds = edges.filter((edge) => edge.source === sourceNodeId && edge.target === props.id).map((edge) => edge.id);
    if (edgeIds.length) deleteEdges(edgeIds);
  }

  const preview = models.length === 0 ? (
    <div className="creation-preview-empty"><Film size={29} /><span>请先配置视频模型</span></div>
  ) : (
    <MediaPreview
      type="video"
      title={props.data.title}
      outputUrl={outputIsVideo ? props.data.outputUrl : undefined}
      aspectRatio={aspectRatioCss(displayRatio)}
      className="creation-media-preview"
    >
      {props.data.status === "generating" ? <div className="creation-preview-empty"><Loader2 className="animate-spin" size={25} /><span>正在生成视频</span></div> : props.data.status === "error" ? <div className="creation-preview-empty is-error"><AlertCircle size={25} /><span>生成失败</span></div> : <div className="creation-preview-empty"><Play size={24} fill="currentColor" /><span>视频预览</span></div>}
    </MediaPreview>
  );

  const referencedInputs = [
    ...resolvedInputs.imageInputs.map((input, index) => ({ input, kind: "图像", kindIndex: index + 1, genericToken: `@素材${index + 1}`, typedToken: `@图像${index + 1}` })),
    ...resolvedInputs.videoInputs.map((input, index) => ({ input, kind: "视频", kindIndex: index + 1, genericToken: `@素材${resolvedInputs.imageInputs.length + index + 1}`, typedToken: `@视频${index + 1}` })),
    ...resolvedInputs.audioInputs.map((input, index) => ({ input, kind: "音频", kindIndex: index + 1, genericToken: `@素材${resolvedInputs.imageInputs.length + resolvedInputs.videoInputs.length + index + 1}`, typedToken: `@音频${index + 1}` }))
  ];
  const referencedImageNodeIds = new Set(resolvedInputs.imageInputs.map((input) => input.sourceNodeId));
  const referenceVisualItems = referencedInputs.map((item) => ({
    ...item,
    name: compactName(item.input.title, `${item.kind}${item.kindIndex}`),
    previewUrl: item.input.url && referencedImageNodeIds.has(item.input.sourceNodeId) ? absoluteUploadUrl(item.input.url) : undefined
  }));
  const referenceMenuItems: ReferenceMenuItem[] = referenceVisualItems.map((item) => ({
    token: item.genericToken,
    typedToken: item.typedToken,
    label: `${item.genericToken.replace("@", "")} · ${item.kind}${item.kindIndex}`,
    kind: item.kind,
    name: item.name,
    previewUrl: item.previewUrl
  }));
  const dock = (
    <div className="creation-dock-content relative">
      <div className="creation-video-reference-bar">
        <button type="button" title="智能辅助" className={`creation-video-reference-tool ${activeTool === "tags" ? "is-active" : ""}`} onClick={() => { setParametersOpen(false); setActiveTool(activeTool === "tags" ? null : "tags"); }}><Sparkles size={17} /></button>
        <span className="creation-video-reference-divider" />
        <div className="creation-video-reference-thumbnails">
          {referenceVisualItems.map((item) => (
            <button type="button" className="creation-video-reference-thumbnail" key={item.genericToken} title={`${item.genericToken} · ${item.name}`} onClick={() => insertReferenceToken(item.genericToken)}>
              {item.previewUrl ? <img src={item.previewUrl} alt="" /> : item.kind === "视频" ? <Film size={17} /> : <Library size={17} />}
            </button>
          ))}
          <button type="button" title="添加参考素材" className={`creation-video-reference-add ${activeTool === "assets" ? "is-active" : ""}`} onClick={() => { setParametersOpen(false); setActiveTool(activeTool === "assets" ? null : "assets"); }}><Plus size={20} /></button>
        </div>
        <button type="button" title={expanded ? "收起详情" : "展开详情"} className="creation-detail-toggle" onClick={() => setExpanded((value) => !value)}><Maximize2 size={14} /></button>
      </div>
      {referenceVisualItems.length > 0 && (
        <div className="creation-video-reference-chips">
          {referenceVisualItems.map((item) => (
            <span key={item.genericToken} className="creation-video-reference-chip">
              <button type="button" className="creation-video-reference-remove" title="移除连接" onClick={() => disconnectReference(item.input.sourceNodeId)}><X size={13} /></button>
              {item.previewUrl ? <img src={item.previewUrl} alt="" /> : <Library size={14} />}
              <button type="button" className="creation-video-reference-token" onClick={() => insertReferenceToken(item.genericToken)}><span>{item.kind}</span><strong>{item.name}</strong></button>
            </span>
          ))}
        </div>
      )}
      <div className="creation-dock-composer">
        <div className="creation-prompt-stack">
          <Textarea
            ref={promptTextareaRef}
            className="creation-prompt-input nodrag nopan nowheel"
            placeholder="描述你想生成的画面，或输入 @ 引用素材"
            value={localPrompt}
            onChange={handlePromptChange}
            onClick={(event) => maybeOpenReferenceMenu(event.currentTarget)}
            onKeyUp={(event) => maybeOpenReferenceMenu(event.currentTarget)}
            onCompositionStart={handleCompositionStart}
            onCompositionEnd={handleCompositionEnd}
          />
        </div>
      </div>
      {(props.data.errorMessage || localError) && <button type="button" className="creation-error-line" onClick={() => setExpanded(true)}><AlertCircle size={12} /><span>{props.data.errorMessage || localError}</span><strong>诊断</strong></button>}
      <div className="creation-dock-footer">
        <div className="creation-dock-identity">
          <div className="creation-model-field" title={selectedChannelHost ? `当前线路：${selectedChannelHost}` : undefined}><Activity size={14} /><Select className="creation-model-select" value={props.data.modelConfigId ?? ""} onChange={(event) => update(props.id, { modelConfigId: event.target.value, errorCode: undefined, errorMessage: undefined, debugMessage: undefined })}><option value="">选择模型</option>{models.map((model) => <option key={model.id} value={model.id}>{modelOptionLabel(model, models)}</option>)}</Select>{selectedChannelHost && <span className="creation-model-channel">{selectedChannelHost}</span>}</div>
          <div ref={parameterAnchorRef} className={`creation-parameter-wrap nodrag nopan ${parametersOpen ? "is-open" : ""}`}>
          <button type="button" className="creation-parameter-pill" onClick={() => { setActiveTool(null); setParametersOpen((value) => !value); }}>{selectedVideoModeLabel} · {parameterSummary({ aspectRatio: selectedAspectRatio, resolution: selectedResolution, duration: selectedDuration, ratios: availableRatios, resolutions: availableResolutions, durations: availableDurations })}</button>
          <NodeParameterPopover open={parametersOpen} anchorRef={parameterAnchorRef} onClose={() => setParametersOpen(false)} sections={[
            { label: "生成方式", description: (props.data.videoMode ?? legacyInputModeToOfficialMode(props.data.inputMode)) === "reference_images_to_video" ? universalReferenceDescription(selectedModel) : undefined, value: props.data.videoMode ?? legacyInputModeToOfficialMode(props.data.inputMode), options: availableVideoModes, format: (value) => videoModeLabelForModel(selectedModel, value as OfficialVideoMode, dynamicOptions?.videoModeLabels?.[value as OfficialVideoMode]), onChange: (value) => update(props.id, { videoMode: value, inputMode: officialModeToLegacyInputMode(value as OfficialVideoMode) }) },
            { label: "比例", value: selectedAspectRatio, options: availableRatios, onChange: (value) => update(props.id, { aspectRatio: value }) },
            { label: "清晰度", value: selectedResolution, options: availableResolutions, onChange: (value) => update(props.id, { resolution: value }) },
            { label: "生成时长", value: selectedDuration, options: availableDurations, format: durationLabel, onChange: (value) => update(props.id, { duration: Number(value) }) },
            { label: "生成数量", value: props.data.generateCount, options: [1, 2, 3, 4], format: (value) => `${value} 个`, onChange: (value) => update(props.id, { generateCount: Number(value) }) }
          ]} />
          </div>
        </div>
        <div className="creation-dock-actions">
          <button type="button" title="语音输入" className={listening ? "is-active" : ""} onClick={() => setListening((value) => !value)}><Mic size={14} /></button>
          <div className="creation-video-generate-cluster">
            <button type="button" className="creation-video-count-button" title="生成数量" onClick={() => update(props.id, { generateCount: (props.data.generateCount % 4) + 1 })}>{props.data.generateCount || 1}x</button>
            <button type="button" title={props.data.status === "idle" ? "生成" : generateButtonLabel(props.data.status)} aria-label={props.data.status === "idle" ? "生成" : generateButtonLabel(props.data.status)} className="creation-generate-button creation-video-generate-button" disabled={!selectedModel || availableVideoModes.length === 0 || props.data.status === "generating"} onClick={() => void generate()}><ArrowUp size={19} strokeWidth={2.3} /></button>
          </div>
        </div>
      </div>
      <NodeToolPanel tool={activeTool} onClose={() => setActiveTool(null)} onInsert={activeTool === "assets" ? insertReferenceToken : insertPromptContext} referenceItems={referenceMenuItems} />
      {expanded && <div className="creation-detail-panel nodrag nopan">
        <div className="creation-detail-section"><strong>生成方式</strong><div className="flex flex-wrap gap-1.5">{videoCategories.map((category) => { const disabledReason = disabledCategoryReason(selectedModel, category); return <button key={category} disabled={Boolean(disabledReason)} title={disabledReason} className={videoCategory === category ? "is-active" : ""} onClick={() => changeVideoCategory(category)}>{videoCategoryLabelForModel(selectedModel, category)}</button>; })}</div></div>
        {actualOutputInfo && props.data.status === "success" && <div className="creation-detail-copy">实际输出：{actualOutputInfo.width && actualOutputInfo.height ? `${actualOutputInfo.width}×${actualOutputInfo.height}` : "未知尺寸"}{actualOutputInfo.ratio ? ` · ${actualOutputInfo.ratio}` : ""}{actualOutputInfo.duration ? ` · ${actualOutputInfo.duration.toFixed(1)}s` : ""}</div>}
        {dynamicOptions?.warningMessage && <div className="creation-detail-copy">{dynamicOptions.warningMessage}</div>}
        {channelDiagnostic.whyBlocked && <div className="creation-detail-copy is-error">{channelDiagnostic.sameModelImageCapableChannels[0]
          ? <>当前通道不支持图生视频。<Button className="ml-2 h-7" variant="secondary" onClick={() => update(props.id, { modelConfigId: channelDiagnostic.sameModelImageCapableChannels[0].id, errorCode: undefined, errorMessage: undefined })}>切换到 {channelDiagnostic.sameModelImageCapableChannels[0].label}</Button></>
          : "当前模型暂无图生视频能力。"}</div>}
        {staleModel && <div className="creation-detail-copy is-error">当前模型配置已失效，请重新选择模型。</div>}
        {isVeoRaiFiltered && <div className="creation-detail-copy">安全过滤：{veoRaiReasons.join("；") || "当前内容需要安全改写"}<div className="mt-2 flex gap-2"><Button className="h-7" variant="secondary" onClick={() => retryWithPrompt(veoSafePrompt || props.data.prompt)}>安全改写重试</Button><Button className="h-7" variant="ghost" onClick={switchOtherVideoModel}>切换模型</Button></div></div>}
        <PayloadSummary data={props.data.payloadSummary} />
        <PayloadSummary data={channelDiagnostic as unknown as Record<string, unknown>} />
        {(props.data.errorMessage || localError) && <AgentAnalyzeErrorButton nodeId={props.id} errorMessage={props.data.errorMessage || localError} nodeData={props.data as unknown as Record<string, unknown>} />}
      </div>}
    </div>
  );

  return <CreationNodeFrame id={props.id} type={props.type} selected={props.selected} title={props.data.title || "Video"} ratio={displayRatio} status={props.data.status} preview={preview} toolbar={<MediaPreviewActions kind="video" url={outputIsVideo ? props.data.outputUrl : undefined} assetId={props.data.outputAssetId} title={props.data.title} nodeId={props.id} onSaved={(assetId) => update(props.id, { outputAssetId: assetId })} />} dock={dock} />;
}

export const VideoNode = memo(VideoNodeComponent);
