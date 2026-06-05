import { useEffect, useMemo, useRef, useState, type ChangeEvent, type CompositionEvent } from "react";
import type { NodeProps } from "reactflow";
import { ImagePlus, Sparkles } from "lucide-react";
import { Button } from "../common/Button";
import { Select } from "../common/Select";
import { Textarea } from "../common/Textarea";
import { NodeShell } from "./NodeShell";
import { MediaPreview } from "../media/MediaPreview";
import { generationApi } from "../../services/generationApi";
import { modelConfigApi } from "../../services/modelConfigApi";
import { useCanvasStore } from "../../store/canvasStore";
import { useModelConfigStore } from "../../store/modelConfigStore";
import { compactAssetIds, resolveImageNodeInputs } from "../../utils/workflowInputs";
import { AgentAnalyzeErrorButton } from "../agent/AgentAnalyzeErrorButton";
import type { AvailableImageOptions, ImageInputMode } from "../../types/model";
import type { ImageGenerateNodeData } from "../../types/node";

const modeLabels: Record<ImageInputMode, string> = {
  "text-to-image": "文生图",
  "image-to-image": "图生图",
  "image-edit": "图片编辑"
};

const imageAspectRatios = ["1:1", "3:4", "4:3", "9:16", "16:9"];

function aspectRatioCss(ratio?: string) {
  const [width, height] = (ratio || "1:1").split(":").map(Number);
  return `${width || 1} / ${height || 1}`;
}

function humanizeError(error: unknown) {
  const message = error instanceof Error ? error.message : "图片生成失败";
  if (/fetch failed/i.test(message)) return "网络请求失败，请检查本地服务、接口地址或第三方 API 网络连接。";
  return message;
}

function statusText(status: ImageGenerateNodeData["status"]) {
  return { idle: "未生成", generating: "生成中", success: "已完成", error: "失败" }[status];
}

function generateButtonText(status: ImageGenerateNodeData["status"]) {
  if (status === "generating") return "生成中...";
  if (status === "success") return "重新生成";
  if (status === "error") return "重试生成";
  return "生成图片";
}

function PayloadSummary({ data }: { data?: Record<string, unknown> }) {
  if (!data) return null;
  const entries = ([
    ["selectedModelId", data.selectedModelId],
    ["actualModelName", data.actualModelName],
    ["providerId", data.providerId],
    ["adapterName", data.adapterName],
    ["inputMode", data.inputMode],
    ["qualityTier", data.qualityTier],
    ["qualityMode", data.qualityMode],
    ["aspectRatio", data.aspectRatio],
    ["mappedSize", data.mappedSize],
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
    ["outputFileSize", data.outputFileSize]
  ] as Array<[string, unknown]>).filter(([, value]) => value !== undefined && value !== "");
  return (
    <details className="nodrag nopan rounded-xl border border-white/[0.06] bg-black/[0.16] px-3 py-2 text-[11px] text-[#9aa5b5]">
      <summary className="cursor-pointer select-none text-[#cfd6e1]">真实调用参数</summary>
      <div className="mt-2 grid grid-cols-2 gap-x-3 gap-y-1">
        {entries.map(([label, value]) => (
          <div key={label} className="min-w-0">
            <span className="text-[#697386]">{label}: </span>
            <span className="break-all text-[#d8dee8]">{String(value)}</span>
          </div>
        ))}
      </div>
      {data.payloadSummary ? <pre className="mt-2 max-h-28 overflow-auto rounded-lg bg-black/[0.18] p-2 text-[10px] leading-4 text-[#8f9bad]">{JSON.stringify(data.payloadSummary, null, 2)}</pre> : null}
    </details>
  );
}

export function ImageGenerateNode(props: NodeProps<ImageGenerateNodeData>) {
  const update = useCanvasStore((state) => state.updateNodeData);
  const edges = useCanvasStore((state) => state.edges);
  const nodes = useCanvasStore((state) => state.nodes);
  const allModels = useModelConfigStore((state) => state.modelConfigs);
  const imageModels = useMemo(() => allModels.filter((model) => model.enabled && model.category === "image"), [allModels]);
  const selectedModel = imageModels.find((model) => model.id === props.data.modelConfigId);
  const [options, setOptions] = useState<AvailableImageOptions | null>(null);
  const [localError, setLocalError] = useState("");
  const [localPrompt, setLocalPrompt] = useState(props.data.prompt || "");
  const isComposingRef = useRef(false);
  const resolvedInputs = useMemo(() => resolveImageNodeInputs(props.id, nodes, edges), [edges, nodes, props.id]);

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

  useEffect(() => {
    let cancelled = false;
    if (!props.data.modelConfigId) {
      setOptions(null);
      return;
    }
    modelConfigApi
      .imageOptions(props.data.modelConfigId, {
        inputMode: props.data.inputMode,
        hasImageInput: resolvedInputs.hasImageInput,
        selectedImageSize: props.data.aspectRatio ?? props.data.imageSize,
        selectedQuality: props.data.imageQuality,
        selectedFormat: props.data.imageFormat
      })
      .then((result) => {
        if (cancelled) return;
        setOptions(result);
        const patch: Partial<ImageGenerateNodeData> = {};
        if (result.normalizedSelection.inputMode && result.normalizedSelection.inputMode !== props.data.inputMode) patch.inputMode = result.normalizedSelection.inputMode as ImageInputMode;
        if (!props.data.aspectRatio) patch.aspectRatio = "1:1";
        if (result.normalizedSelection.imageQuality && result.normalizedSelection.imageQuality !== props.data.imageQuality) patch.imageQuality = result.normalizedSelection.imageQuality;
        if (result.normalizedSelection.imageFormat && result.normalizedSelection.imageFormat !== props.data.imageFormat) patch.imageFormat = result.normalizedSelection.imageFormat;
        if (Object.keys(patch).length) update(props.id, patch as Record<string, unknown>);
      })
      .catch(() => {
        if (!cancelled) setOptions(null);
      });
    return () => {
      cancelled = true;
    };
  }, [props.data.modelConfigId, props.data.inputMode, props.data.imageSize, props.data.imageQuality, props.data.imageFormat, props.data.aspectRatio, props.id, resolvedInputs.hasImageInput, update]);

  const availableModes = (options?.availableInputModes ?? selectedModel?.capabilities.inputModes.filter((mode) => ["text-to-image", "image-to-image", "image-edit"].includes(mode)) ?? ["text-to-image"]) as ImageInputMode[];
  const ratios = selectedModel?.capabilities.imageAspectRatios ?? imageAspectRatios;
  const qualities = options?.availableImageQualities ?? selectedModel?.capabilities.imageQualities ?? ["auto"];
  const formats = options?.availableImageFormats ?? selectedModel?.capabilities.imageFormats ?? ["png"];

  async function generate() {
    if (!props.data.modelConfigId || !selectedModel) {
      update(props.id, { status: "error", errorMessage: "暂无可用图片模型，请先到设置中心配置 API。" });
      return;
    }
    update(props.id, { status: "generating", errorMessage: undefined });
    setLocalError("");
    try {
      if (props.data.inputMode !== "text-to-image" && !resolvedInputs.hasImageInput) {
        throw new Error(props.data.inputMode === "image-edit" ? "图片编辑需要连接一张图片素材。" : "图生图需要连接一张图片素材。");
      }
      const result = await generationApi.image({
        nodeId: props.id,
        modelConfigId: props.data.modelConfigId,
        inputMode: props.data.inputMode,
        prompt: props.data.prompt,
        aspectRatio: props.data.aspectRatio ?? ratios[0],
        imageQuality: props.data.imageQuality ?? qualities[0],
        imageFormat: props.data.imageFormat ?? formats[0],
        imageAssetIds: compactAssetIds(resolvedInputs.imageInputs),
        generateCount: props.data.generateCount,
        qualityMode: props.data.qualityMode ?? "full_quality",
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

  useEffect(() => {
    function handleRunNode(event: Event) {
      const nodeId = (event as CustomEvent<{ nodeId?: string }>).detail?.nodeId;
      if (nodeId === props.id && props.data.status !== "generating") void generate();
    }
    window.addEventListener("studio:run-node", handleRunNode);
    return () => window.removeEventListener("studio:run-node", handleRunNode);
  });

  return (
    <NodeShell
      {...props}
      title={props.data.title}
      badge="Image AI"
      width={500}
      status={statusText(props.data.status)}
      footer={
        imageModels.length > 0 ? (
          <div className="nodrag nopan flex h-[44px] items-center gap-1.5 overflow-hidden">
            <Select className="h-8 min-w-[126px]" value={props.data.modelConfigId ?? ""} onChange={(event) => update(props.id, { modelConfigId: event.target.value })}>
              <option value="">选择模型</option>
              {imageModels.map((model) => <option key={model.id} value={model.id}>{model.displayName}</option>)}
            </Select>
            <Select className="h-8 w-[76px]" value={props.data.aspectRatio ?? ratios[0]} onChange={(event) => update(props.id, { aspectRatio: event.target.value, imageSize: undefined })}>{ratios.map((item) => <option key={item}>{item}</option>)}</Select>
            <Select className="h-8 w-[76px]" value={props.data.imageQuality ?? qualities[0] ?? ""} onChange={(event) => update(props.id, { imageQuality: event.target.value })}>{qualities.map((item) => <option key={item}>{item}</option>)}</Select>
            <Select className="h-8 w-[68px]" value={props.data.imageFormat ?? formats[0] ?? ""} onChange={(event) => update(props.id, { imageFormat: event.target.value })}>{formats.map((item) => <option key={item}>{item}</option>)}</Select>
            <Button className="ml-auto h-[34px] min-w-[82px]" variant="primary" disabled={!selectedModel || props.data.status === "generating"} onClick={generate}><Sparkles size={14} /> {generateButtonText(props.data.status)}</Button>
          </div>
        ) : null
      }
    >
      {imageModels.length === 0 ? (
        <div className="nodrag nopan flex h-[190px] flex-col items-center justify-center rounded-xl border border-dashed border-white/[0.08] bg-[linear-gradient(180deg,#232833_0%,#20242d_100%)] text-center">
          <ImagePlus className="mb-3 text-[#7b8798]" size={32} />
          <div className="text-[13px] font-semibold text-[#e8edf3]">暂无可用图片模型，请先到设置中心配置 API。</div>
        </div>
      ) : (
        <div className="space-y-2.5">
          <MediaPreview type="image" title={props.data.title} outputUrl={props.data.outputUrl} aspectRatio={aspectRatioCss(props.data.aspectRatio)}>
            {props.data.status === "generating" ? (
              <div className="px-6 text-center text-[12px] text-[#a2acba]">图片生成中...</div>
            ) : props.data.status === "error" ? (
              <div className="px-6 text-center text-[12px] leading-5 text-red-300">{props.data.errorMessage || localError || "图片生成失败"}</div>
            ) : (
              <ImagePlus className="text-[#7b8798]" size={34} />
            )}
          </MediaPreview>
          <div className="flex h-8 flex-wrap gap-1.5 overflow-hidden">
            {(Object.keys(modeLabels) as ImageInputMode[]).filter((mode) => availableModes.includes(mode)).map((mode) => (
              <button key={mode} type="button" onClick={() => update(props.id, { inputMode: mode })} className={`nodrag nopan h-7 rounded-full border px-2.5 text-[12px] font-medium transition ${props.data.inputMode === mode ? "border-[#7c6cf6]/[0.22] bg-[#7c6cf6]/[0.14] text-[#f3f5f7]" : "border-transparent bg-transparent text-[#8c97a7] hover:bg-white/[0.04] hover:text-[#f3f5f7]"}`}>{modeLabels[mode]}</button>
            ))}
          </div>
          <Textarea
            className="nodrag nopan nowheel h-[88px]"
            placeholder="描述要生成或修改的图片"
            value={localPrompt}
            onChange={handlePromptChange}
            onCompositionStart={handleCompositionStart}
            onCompositionEnd={handleCompositionEnd}
          />
          {props.data.inputMode !== "text-to-image" && !resolvedInputs.hasImageInput && <div className="text-[12px] text-amber-300">当前模式需要连接一张图片素材。</div>}
          {options?.warningMessage && <div className="text-[12px] text-amber-300">{options.warningMessage}</div>}
          <PayloadSummary data={props.data.payloadSummary} />
          {(props.data.errorMessage || localError) && <div className="text-[12px] text-red-300">{props.data.errorMessage || localError}</div>}
          {(props.data.errorMessage || localError) && <AgentAnalyzeErrorButton nodeId={props.id} errorMessage={props.data.errorMessage || localError} nodeData={props.data as unknown as Record<string, unknown>} />}
        </div>
      )}
    </NodeShell>
  );
}
