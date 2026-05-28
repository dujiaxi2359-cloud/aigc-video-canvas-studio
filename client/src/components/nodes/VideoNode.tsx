import { useEffect, useMemo, useRef, useState, type ChangeEvent, type CompositionEvent } from "react";
import type { NodeProps } from "reactflow";
import { AlertCircle, BoxSelect, Camera, CheckCircle2, CircleDot, Clock3, Copy, Film, Image as ImageIcon, Library, Loader2, Play, Sparkles, UserRound } from "lucide-react";
import { Button } from "../common/Button";
import { Select } from "../common/Select";
import { Textarea } from "../common/Textarea";
import { NodeShell } from "./NodeShell";
import { NodeDownloadButton } from "./NodeDownloadButton";
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

const modeLabels: Record<VideoInputMode, string> = {
  "text-to-video": "文生视频",
  "image-to-video": "图生视频",
  "first-last-frame": "首尾帧",
  "reference-to-video": "图片参考",
  "video-to-video": "视频参考"
};

const tools = [
  { label: "标记", icon: CircleDot },
  { label: "运镜", icon: Camera },
  { label: "角色库", icon: UserRound },
  { label: "引用素材", icon: Library }
];

const emptyVideoModes: VideoInputMode[] = ["text-to-video"];
const emptyOfficialVideoModes: OfficialVideoMode[] = ["text_to_video"];
const emptyStrings: string[] = [];
const emptyNumbers: number[] = [];
const videoCategories: OfficialVideoCategory[] = ["text_to_video", "image_to_video", "reference_to_video", "first_last_frame_video", "video_edit", "video_extension"];

function isRuntimeUsableVideoModel(model: ModelConfig) {
  if (model.providerId === "google") return /^veo/i.test(model.modelName);
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
  return false;
}

function modelSupportsVideoCategory(model: ModelConfig, category: OfficialVideoCategory) {
  if (model.providerId === "google" && /^veo/i.test(model.modelName)) {
    if (category === "video_edit") return false;
    if (category === "video_extension") return model.modelName === "veo-3.1-generate-preview";
    return true;
  }
  if (model.providerId !== "alibaba") return false;
  if (category === "text_to_video") return ["happyhorse-1.0-t2v", "wan2.7-t2v-2026-04-25"].includes(model.modelName);
  if (category === "image_to_video") return ["happyhorse-1.0-i2v", "wan2.7-i2v-2026-04-25"].includes(model.modelName);
  if (category === "reference_to_video") return ["happyhorse-1.0-r2v", "wan2.7-r2v"].includes(model.modelName);
  if (category === "first_last_frame_video") return model.modelName === "wan2.7-i2v-2026-04-25";
  if (category === "video_edit") return ["happyhorse-1.0-video-edit", "wan2.7-videoedit"].includes(model.modelName);
  if (category === "video_extension") return model.modelName === "wan2.7-i2v-2026-04-25";
  return false;
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

export function VideoNode(props: NodeProps<VideoNodeData>) {
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
  const isComposingRef = useRef(false);

  const selectedModel = models.find((model) => model.id === props.data.modelConfigId);
  const staleModel = props.data.modelConfigId && !allModels.some((model) => model.id === props.data.modelConfigId && model.enabled);
  const resolvedInputs = useMemo(() => resolveVideoNodeInputs(props.id, nodes, edges), [edges, nodes, props.id]);

  useEffect(() => {
    const currentCategory = categoryForOfficialVideoMode(props.data.videoMode ?? legacyInputModeToOfficialMode(props.data.inputMode));
    if (currentCategory !== videoCategory && modelSupportsVideoCategory(selectedModel ?? ({} as ModelConfig), currentCategory)) setVideoCategory(currentCategory);
  }, [props.data.inputMode, props.data.videoMode, selectedModel, videoCategory]);

  function changeVideoCategory(category: OfficialVideoCategory) {
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

  const availableModes = useMemo(() => (dynamicOptions?.availableInputModes ?? selectedModel?.capabilities.inputModes ?? emptyVideoModes) as VideoInputMode[], [dynamicOptions?.availableInputModes, selectedModel?.capabilities.inputModes]);
  const availableVideoModes = useMemo(() => dynamicOptions?.availableVideoModes ?? availableModes.map((mode) => legacyInputModeToOfficialMode(mode)) ?? emptyOfficialVideoModes, [availableModes, dynamicOptions?.availableVideoModes]);
  const availableRatios = useMemo(() => dynamicOptions?.availableAspectRatios ?? selectedModel?.capabilities.aspectRatios ?? emptyStrings, [dynamicOptions?.availableAspectRatios, selectedModel?.capabilities.aspectRatios]);
  const availableResolutions = useMemo(() => dynamicOptions?.availableResolutions ?? selectedModel?.capabilities.resolutions ?? emptyStrings, [dynamicOptions?.availableResolutions, selectedModel?.capabilities.resolutions]);
  const availableDurations = useMemo(() => dynamicOptions?.availableDurations ?? durationOptions(selectedModel) ?? emptyNumbers, [dynamicOptions?.availableDurations, selectedModel]);
  const outputUrl = absoluteUploadUrl(props.data.outputUrl);
  const outputIsVideo = isVideoOutput(props.data.outputUrl);

  const inputStatusItems = useMemo(() => {
    const mode = props.data.videoMode ?? legacyInputModeToOfficialMode(props.data.inputMode);
    if (mode === "reference_images_to_video") return [{ icon: ImageIcon, label: "参考图片", connected: resolvedInputs.hasReferenceImage }];
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

  async function generate() {
    if (!props.data.modelConfigId || !selectedModel) {
      update(props.id, { errorMessage: "暂无可用模型，请先到设置中心配置 API。", status: "error" });
      return;
    }
    update(props.id, { status: "generating", errorMessage: undefined });
    setLocalError("");
    try {
      const videoMode = props.data.videoMode ?? legacyInputModeToOfficialMode(props.data.inputMode);
      const maxImages = maxImagesForMode(selectedModel, videoMode);
      if (maxImages && resolvedInputs.imageInputs.length > maxImages) throw new Error(`当前模式最多支持 ${maxImages} 张图片。你当前连接了 ${resolvedInputs.imageInputs.length} 张，请删除多余图片或切换到支持多参考图的模型。`);
      if (videoMode === "image_to_video_first_frame" && !resolvedInputs.hasImageInput) throw new Error("首帧图生视频需要连接一张首帧图片。");
      if (videoMode === "reference_images_to_video" && !resolvedInputs.hasReferenceImage) throw new Error("参考图生视频需要至少一张参考图片。");
      if (videoMode === "image_to_video_first_last_frame" && !resolvedInputs.hasFirstFrame) throw new Error("首尾帧模式需要连接首帧图片。");
      if (videoMode === "image_to_video_first_last_frame" && !resolvedInputs.hasLastFrame) throw new Error("首尾帧模式已连接首帧，还需要一张尾帧图片。");
      if ((videoMode === "video_to_video" || videoMode === "video_edit" || videoMode === "video_continuation") && !resolvedInputs.hasVideoInput) throw new Error("当前模式需要连接视频素材。");
      if (videoMode === "audio_driven_video" && !resolvedInputs.audioInputs.length) throw new Error("音频驱动视频需要连接驱动音频。");

      const result = await generationApi.video({
        nodeId: props.id,
        modelConfigId: props.data.modelConfigId,
        inputMode: props.data.inputMode,
        videoMode,
        prompt: props.data.prompt,
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
          ? { status: "success", outputAssetId: result.outputAssetId, outputUrl: result.outputUrl, payloadSummary: result.payloadSummary }
          : { status: "error", errorMessage: result.errorMessage, payloadSummary: result.payloadSummary }
      );
    } catch (error) {
      const message = humanizeError(error);
      setLocalError(message);
      update(props.id, { status: "error", errorMessage: message });
    }
  }

  return (
    <NodeShell
      {...props}
      title={props.data.title}
      badge="视频生成"
      width={500}
      status={statusText(props.data.status)}
      headerActions={
        props.data.status === "success" && props.data.outputUrl ? (
          <NodeDownloadButton kind="video" url={props.data.outputUrl} assetId={props.data.outputAssetId} title={props.data.title} tooltip="导出视频" label="导出视频" />
        ) : null
      }
      footer={
        <div className="nodrag nopan space-y-1.5">
          <div className="flex gap-1 overflow-x-auto">
            {videoCategories.map((category) => (
              <button
                key={category}
                type="button"
                onClick={(event) => {
                  event.preventDefault();
                  event.stopPropagation();
                  changeVideoCategory(category);
                }}
                className={`nodrag nopan h-7 shrink-0 rounded-full border px-2.5 text-[11px] transition ${videoCategory === category ? "border-[#8b7cf6]/40 bg-[#7c6cf6]/20 text-white" : "border-white/[0.06] bg-white/[0.025] text-[#8c97a7] hover:bg-white/[0.06] hover:text-white"}`}
              >
                {officialVideoCategoryLabels[category]}
              </button>
            ))}
          </div>
        {models.length > 0 ? (
          <div className="nodrag nopan flex h-[44px] items-center gap-1.5 overflow-hidden">
            <Select className="h-8 min-w-[112px]" value={props.data.modelConfigId ?? ""} onChange={(event) => update(props.id, { modelConfigId: event.target.value })}>
              <option value="">选择模型</option>
              {models.map((model) => <option key={model.id} value={model.id}>{model.displayName}</option>)}
            </Select>
            <Select className="h-8 w-[66px]" value={props.data.aspectRatio ?? availableRatios[0] ?? ""} onChange={(event) => update(props.id, { aspectRatio: event.target.value })}>{availableRatios.map((item) => <option key={item}>{item}</option>)}</Select>
            <Select className="h-8 w-[74px]" value={props.data.resolution ?? availableResolutions[0] ?? ""} onChange={(event) => update(props.id, { resolution: event.target.value })}>{availableResolutions.map((item) => <option key={item}>{item}</option>)}</Select>
            <Select className="h-8 w-[62px]" value={props.data.duration ?? availableDurations[0] ?? ""} onChange={(event) => update(props.id, { duration: Number(event.target.value) })}>{availableDurations.map((item) => <option key={item} value={item}>{item}s</option>)}</Select>
            <Select className="h-8 w-[58px]" value={props.data.generateCount} onChange={(event) => update(props.id, { generateCount: Number(event.target.value) })}>{[1, 2, 3, 4].map((item) => <option key={item} value={item}>{item}个</option>)}</Select>
            <Button className="ml-auto h-[34px] min-w-[86px]" variant="primary" disabled={!selectedModel || availableVideoModes.length === 0 || props.data.status === "generating"} onClick={generate}>
              <Sparkles size={14} strokeWidth={1.8} /> {generateButtonLabel(props.data.status)}
            </Button>
          </div>
        ) : <div className="text-[12px] text-amber-300">当前分类暂无已启用的官方视频模型。</div>}
        </div>
      }
    >
      {models.length === 0 ? (
        <div className="nodrag nopan flex h-[210px] flex-col items-center justify-center rounded-xl border border-dashed border-white/[0.08] bg-[linear-gradient(180deg,#232833_0%,#20242d_100%)] text-center">
          <Film className="mb-3 text-[#7b8798]" size={32} strokeWidth={1.7} />
          <div className="text-[13px] font-semibold text-[#e8edf3]">暂无可用模型，请先到设置中心配置 API。</div>
        </div>
      ) : (
        <div className="space-y-2.5">
          <div className="nodrag nopan mx-auto flex h-[210px] max-w-full items-center justify-center overflow-hidden rounded-xl border border-white/[0.06] bg-[linear-gradient(180deg,#232833_0%,#20242d_100%)]" style={{ aspectRatio: aspectRatioCss(props.data.aspectRatio) }}>
            {props.data.status === "generating" ? (
              <div className="text-center">
                <div className="mx-auto grid h-11 w-11 place-items-center rounded-full border border-white/[0.08] bg-white/[0.05] text-[#cfd6e1]">
                  <Loader2 className="animate-spin" size={22} strokeWidth={1.8} />
                </div>
                <div className="mt-2 text-[13px] font-medium text-[#e8edf3]">正在生成视频...</div>
              </div>
            ) : props.data.status === "error" ? (
              <div className="px-6 text-center">
                <div className="mx-auto grid h-11 w-11 place-items-center rounded-full border border-red-300/[0.16] bg-red-400/[0.08] text-red-200">
                  <AlertCircle size={22} strokeWidth={1.8} />
                </div>
                <div className="mt-2 text-[13px] font-semibold text-red-200">生成失败</div>
                <div className="mt-1 max-w-[360px] text-[12px] leading-5 text-[#a2acba]">{props.data.errorMessage || localError || "请重试生成。"}</div>
              </div>
            ) : props.data.status === "success" && props.data.outputUrl && outputIsVideo ? (
              <video className="nodrag nopan h-full w-full rounded-xl object-contain" controls src={outputUrl} />
            ) : props.data.status === "success" && props.data.outputUrl ? (
              <div className="mx-4 w-full max-w-[420px] rounded-xl border border-emerald-300/[0.14] bg-emerald-400/[0.07] p-4">
                <div className="flex items-center gap-2 text-[14px] font-semibold text-emerald-100">
                  <CheckCircle2 size={18} strokeWidth={1.8} /> 模拟生成完成
                </div>
                <p className="mt-2 text-[12px] leading-5 text-[#cfd6e1]">已生成一条 mock 结果，真实视频 API 接入后这里会显示视频预览。</p>
                <div className="mt-3 flex gap-2">
                  <Button className="h-8" variant="secondary" onClick={() => navigator.clipboard.writeText(outputUrl)}>
                    <Copy size={13} strokeWidth={1.8} /> 复制链接
                  </Button>
                  <Button className="h-8" variant="ghost" onClick={() => window.dispatchEvent(new CustomEvent("navigate", { detail: "history" }))}>
                    <Clock3 size={13} strokeWidth={1.8} /> 查看历史
                  </Button>
                </div>
              </div>
            ) : (
              <div className="text-center">
                <div className="mx-auto grid h-11 w-11 place-items-center rounded-full border border-white/[0.08] bg-white/[0.05] text-[#cfd6e1]">
                  <Play size={21} fill="currentColor" />
                </div>
                <div className="mt-2 text-[13px] font-medium text-[#a2acba]">视频预览区</div>
              </div>
            )}
          </div>

          <div className="nodrag nopan flex h-8 flex-wrap gap-1.5 overflow-hidden">
            {availableVideoModes.filter((mode) => categoryForOfficialVideoMode(mode) === videoCategory).map((mode) => {
              const enabled = availableVideoModes.includes(mode);
              const legacyMode = officialModeToLegacyInputMode(mode);
              if (!enabled && selectedModel) return null;
              return (
                <button
                  key={mode}
                  type="button"
                  disabled={!enabled}
                  onClick={() => update(props.id, { videoMode: mode, inputMode: legacyMode })}
                  className={`nodrag nopan h-7 rounded-full border px-2.5 text-[12px] font-medium transition ${(props.data.videoMode ?? legacyInputModeToOfficialMode(props.data.inputMode)) === mode ? "border-[#7c6cf6]/[0.22] bg-[#7c6cf6]/[0.14] text-[#f3f5f7]" : "border-transparent bg-transparent text-[#8c97a7] hover:bg-white/[0.04] hover:text-[#f3f5f7] disabled:opacity-35"}`}
                >
                  {dynamicOptions?.videoModeLabels?.[mode] ?? officialVideoModeLabels[mode]}
                </button>
              );
            })}
          </div>

          <div className="nodrag nopan rounded-xl border border-white/[0.06] bg-[#11141b] p-2">
            <div className="mb-1.5 flex flex-wrap gap-1.5">
              {tools.map((tool) => {
                const Icon = tool.icon;
                return (
                  <button key={tool.label} type="button" className="nodrag nopan inline-flex h-6 items-center gap-1.5 rounded-lg border border-white/[0.06] bg-white/[0.03] px-2 text-[11px] text-[#8b95a5] hover:bg-white/[0.05] hover:text-[#f3f5f7]">
                    <Icon size={12} strokeWidth={1.8} /> {tool.label}
                  </button>
                );
              })}
            </div>
            <Textarea
              className="nodrag nopan nowheel h-[76px]"
              placeholder="描述你想要生成的画面内容，可引用素材"
              value={localPrompt}
              onChange={handlePromptChange}
              onCompositionStart={handleCompositionStart}
              onCompositionEnd={handleCompositionEnd}
            />
          </div>

          <div className="grid grid-cols-2 gap-2 text-[12px]">
            {inputStatusItems.map((item) => {
              const Icon = item.icon;
              return (
                <div key={item.label} className="flex items-center gap-2 rounded-[10px] border border-white/[0.05] bg-black/[0.14] px-3 py-1.5 text-[#8b95a5]">
                  <Icon size={14} strokeWidth={1.8} /> {item.label}：{item.connected ? "已连接" : "未连接"}
                </div>
              );
            })}
          </div>

          <PayloadSummary data={props.data.payloadSummary} />
          {dynamicOptions?.warningMessage && <div className="text-[12px] text-amber-300">{dynamicOptions.warningMessage}</div>}
          {staleModel && <div className="text-[12px] text-red-300">当前模型配置已失效，请重新选择模型。</div>}
          {props.data.inputMode === "image-to-video" && !inputContext.hasImageInput && <div className="text-[12px] text-amber-300">图生视频需要连接一张图片素材。</div>}
          {props.data.inputMode === "reference-to-video" && !inputContext.hasReferenceImage && <div className="text-[12px] text-amber-300">图片参考模式需要至少一张参考图片。</div>}
          {props.data.inputMode === "video-to-video" && !inputContext.hasVideoInput && <div className="text-[12px] text-amber-300">视频参考模式需要连接一个视频素材。</div>}
          {props.data.inputMode === "first-last-frame" && inputContext.hasImageInput && !resolvedInputs.hasLastFrame && <div className="text-[12px] text-amber-300">已连接首帧，还需要一张尾帧图片。</div>}
          {props.data.inputMode === "first-last-frame" && !inputContext.hasImageInput && <div className="text-[12px] text-amber-300">首尾帧模式需要连接起始帧和结束帧图片。</div>}
          {(props.data.errorMessage || localError) && <div className="text-[12px] text-red-300">{props.data.errorMessage || localError}</div>}
          {(props.data.errorMessage || localError) && <AgentAnalyzeErrorButton nodeId={props.id} errorMessage={props.data.errorMessage || localError} nodeData={props.data as unknown as Record<string, unknown>} />}
        </div>
      )}
    </NodeShell>
  );
}
