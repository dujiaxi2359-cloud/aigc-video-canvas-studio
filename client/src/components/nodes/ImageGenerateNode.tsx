import { memo, useEffect, useMemo, useRef, useState, type ChangeEvent, type CompositionEvent } from "react";
import type { NodeProps } from "reactflow";
import { ArrowUp, Camera, ImagePlus, Maximize2, Palette, Plus, Sparkles } from "lucide-react";
import { Button } from "../common/Button";
import { Select } from "../common/Select";
import { Textarea } from "../common/Textarea";
import { MediaPreview } from "../media/MediaPreview";
import { generationApi } from "../../services/generationApi";
import { modelConfigApi } from "../../services/modelConfigApi";
import { useCanvasStore } from "../../store/canvasStore";
import { useModelConfigStore } from "../../store/modelConfigStore";
import { compactAssetIds, resolveImageNodeInputs } from "../../utils/workflowInputs";
import { AgentAnalyzeErrorButton } from "../agent/AgentAnalyzeErrorButton";
import type { AvailableImageOptions, ImageInputMode } from "../../types/model";
import type { ImageGenerateNodeData } from "../../types/node";
import { NodeParameterPopover } from "./NodeParameterPopover";
import { CreationNodeFrame } from "./CreationNodeFrame";
import { NodeToolPanel, type NodeTool } from "./NodeToolPanel";
import { MediaPreviewActions } from "./MediaPreviewActions";

const modeLabels: Record<ImageInputMode, string> = {
  "text-to-image": "文生图",
  "image-to-image": "图生图",
  "image-edit": "图片编辑"
};

const imageAspectRatios = ["1:1", "3:4", "4:3", "9:16", "16:9"];
const imageQualityTiers = ["1K", "2K", "4K"];

function qualityValueForTier(tier: string, qualities: string[]) {
  if (qualities.length === 0) return "auto";
  if (tier === "1K") return qualities[0];
  if (tier === "4K") return qualities[qualities.length - 1];
  return qualities[Math.floor((qualities.length - 1) / 2)];
}

function tierForQuality(value: string | undefined, qualities: string[]) {
  const index = qualities.indexOf(value ?? "");
  if (index <= 0) return "1K";
  if (index >= qualities.length - 1) return "4K";
  return "2K";
}

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

function ImageGenerateNodeComponent(props: NodeProps<ImageGenerateNodeData>) {
  const update = useCanvasStore((state) => state.updateNodeData);
  const edges = useCanvasStore((state) => state.edges);
  const nodes = useCanvasStore((state) => state.nodes);
  const allModels = useModelConfigStore((state) => state.modelConfigs);
  const imageModels = useMemo(() => allModels.filter((model) => model.enabled && model.category === "image"), [allModels]);
  const selectedModel = imageModels.find((model) => model.id === props.data.modelConfigId);
  const [options, setOptions] = useState<AvailableImageOptions | null>(null);
  const [localError, setLocalError] = useState("");
  const [localPrompt, setLocalPrompt] = useState(props.data.prompt || "");
  const [parametersOpen, setParametersOpen] = useState(false);
  const [expanded, setExpanded] = useState(false);
  const [activeTool, setActiveTool] = useState<NodeTool>(null);
  const isComposingRef = useRef(false);
  const parameterAnchorRef = useRef<HTMLDivElement | null>(null);
  const resolvedInputs = useMemo(() => resolveImageNodeInputs(props.id, nodes, edges), [edges, nodes, props.id]);

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
  const selectedQualityTier = imageQualityTiers.includes(props.data.imageSize ?? "")
    ? props.data.imageSize!
    : tierForQuality(props.data.imageQuality, qualities);

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

  function insertPromptContext(value: string) {
    const prefix = activeTool === "styles" ? `风格：${value}` : activeTool === "camera" ? `摄影机：${value}` : `引用：${value}`;
    const next = `${localPrompt.trim()}${localPrompt.trim() ? "\n" : ""}${prefix}`;
    setLocalPrompt(next);
    update(props.id, { prompt: next });
  }

  const preview = imageModels.length === 0 ? <div className="creation-preview-empty"><ImagePlus size={29} /><span>请先配置图片模型</span></div> : (
    <MediaPreview type="image" title={props.data.title} outputUrl={props.data.outputUrl} aspectRatio={aspectRatioCss(props.data.aspectRatio)} className="creation-media-preview">
      <div className={`creation-preview-empty ${props.data.status === "error" ? "is-error" : ""}`}><ImagePlus size={28} /><span>{props.data.status === "generating" ? "正在生成图片" : props.data.status === "error" ? "图片生成失败" : "图片预览"}</span></div>
    </MediaPreview>
  );

  const dock = (
    <div className="creation-dock-content relative">
      <div className="creation-dock-header">
        <div className="creation-dock-tools">
          <button type="button" title="智能辅助" className={activeTool === "styles" ? "is-active" : ""} onClick={() => { setParametersOpen(false); setActiveTool(activeTool === "styles" ? null : "styles"); }}><Sparkles size={15} /></button>
          <button type="button" title="引用图片" className={activeTool === "assets" ? "is-active" : ""} onClick={() => { setParametersOpen(false); setActiveTool(activeTool === "assets" ? null : "assets"); }}><ImagePlus size={15} /></button>
          <span className="creation-tool-divider" />
          <button type="button" title="添加素材" className={activeTool === "assets" ? "is-active" : ""} onClick={() => { setParametersOpen(false); setActiveTool(activeTool === "assets" ? null : "assets"); }}><Plus size={17} /></button>
        </div>
        <button type="button" title={expanded ? "收起详情" : "展开详情"} className="creation-detail-toggle" onClick={() => setExpanded((value) => !value)}><Maximize2 size={14} /></button>
      </div>
      <div className="creation-dock-composer">
        {resolvedInputs.imageInputs.length > 0 && <div className="creation-reference-strip">{resolvedInputs.imageInputs.map((input, index) => <span key={`${input.sourceNodeId}-${index}`} title={`引用图片 ${index + 1}`}>{input.url ? <img src={input.url} alt="" /> : <ImagePlus size={13} />}<small>图片 {index + 1}</small></span>)}</div>}
        <Textarea className="creation-prompt-input nodrag nopan nowheel" placeholder="描述你想生成的内容，或输入 @ 引用素材" value={localPrompt} onChange={handlePromptChange} onCompositionStart={handleCompositionStart} onCompositionEnd={handleCompositionEnd} />
      </div>
      {(props.data.errorMessage || localError) && <button type="button" className="creation-error-line" onClick={() => setExpanded(true)}><span>{props.data.errorMessage || localError}</span><strong>诊断</strong></button>}
      <div className="creation-dock-footer">
        <div className="creation-dock-identity">
          <div className="creation-model-field"><ImagePlus size={14} /><Select className="creation-model-select" value={props.data.modelConfigId ?? ""} onChange={(event) => update(props.id, { modelConfigId: event.target.value })}><option value="">选择模型</option>{imageModels.map((model) => <option key={model.id} value={model.id}>{model.displayName}</option>)}</Select></div>
          <div ref={parameterAnchorRef} className={`creation-parameter-wrap nodrag nopan ${parametersOpen ? "is-open" : ""}`}>
          <button type="button" className="creation-parameter-pill" onClick={() => { setActiveTool(null); setParametersOpen((value) => !value); }}>{props.data.aspectRatio ?? ratios[0]} · {selectedQualityTier}</button>
          <NodeParameterPopover open={parametersOpen} anchorRef={parameterAnchorRef} onClose={() => setParametersOpen(false)} sections={[
            { label: "生成方式", value: props.data.inputMode, options: availableModes, format: (value) => modeLabels[value as ImageInputMode], onChange: (value) => update(props.id, { inputMode: value }) },
            { label: "比例", value: props.data.aspectRatio ?? ratios[0], options: ratios, onChange: (value) => update(props.id, { aspectRatio: value }) },
            { label: "画质", value: selectedQualityTier, options: imageQualityTiers, onChange: (value) => update(props.id, { imageSize: String(value), imageQuality: qualityValueForTier(String(value), qualities) }) }
          ]} />
          </div>
          <button type="button" className={`creation-footer-tool ${activeTool === "styles" ? "is-active" : ""}`} onClick={() => { setParametersOpen(false); setActiveTool(activeTool === "styles" ? null : "styles"); }}><Palette size={13} />风格</button>
          <button type="button" className={`creation-footer-tool ${activeTool === "camera" ? "is-active" : ""}`} onClick={() => { setParametersOpen(false); setActiveTool(activeTool === "camera" ? null : "camera"); }}><Camera size={13} />摄影机控制</button>
        </div>
        <div className="creation-dock-actions">
          <button type="button" title="生成数量" onClick={() => update(props.id, { generateCount: (props.data.generateCount % 4) + 1 })}>{props.data.generateCount || 1}x</button>
          <button type="button" title={props.data.status === "idle" ? "生成" : generateButtonText(props.data.status)} aria-label={props.data.status === "idle" ? "生成" : generateButtonText(props.data.status)} className="creation-generate-button" disabled={!selectedModel || props.data.status === "generating"} onClick={() => void generate()}><ArrowUp size={16} /></button>
        </div>
      </div>
      <NodeToolPanel tool={activeTool} onClose={() => setActiveTool(null)} onInsert={insertPromptContext} />
      {expanded && <div className="creation-detail-panel nodrag nopan">{props.data.inputMode !== "text-to-image" && !resolvedInputs.hasImageInput && <div className="creation-detail-copy">当前模式需要连接一张图片素材。</div>}{options?.warningMessage && <div className="creation-detail-copy">{options.warningMessage}</div>}<PayloadSummary data={props.data.payloadSummary} />{(props.data.errorMessage || localError) && <AgentAnalyzeErrorButton nodeId={props.id} errorMessage={props.data.errorMessage || localError} nodeData={props.data as unknown as Record<string, unknown>} />}</div>}
    </div>
  );

  return <CreationNodeFrame id={props.id} type={props.type} selected={props.selected} title={props.data.title || "Image"} ratio={props.data.aspectRatio || "1:1"} status={props.data.status} preview={preview} toolbar={<MediaPreviewActions kind="image" url={props.data.outputUrl} assetId={props.data.outputAssetId} title={props.data.title} nodeId={props.id} onSaved={(assetId) => update(props.id, { outputAssetId: assetId })} />} dock={dock} />;
}

export const ImageGenerateNode = memo(ImageGenerateNodeComponent);
