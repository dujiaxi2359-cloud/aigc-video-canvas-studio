import { memo, useEffect, useMemo, useRef, useState, type ChangeEvent, type CompositionEvent } from "react";
import type { NodeProps } from "reactflow";
import { ArrowUp, Camera, ImagePlus, Library, Maximize2, Palette, Plus, Sparkles, X } from "lucide-react";
import { Button } from "../common/Button";
import { Select } from "../common/Select";
import { Textarea } from "../common/Textarea";
import { MediaPreview } from "../media/MediaPreview";
import { ImageAssetEditor } from "../media/ImageAssetEditor";
import { generationApi } from "../../services/generationApi";
import { modelConfigApi } from "../../services/modelConfigApi";
import { useAssetStore } from "../../store/assetStore";
import { useCanvasStore } from "../../store/canvasStore";
import { useModelConfigStore } from "../../store/modelConfigStore";
import { absoluteUploadUrl } from "../../utils/file";
import { buildReferenceAwareImagePrompt, compactAssetIds, resolveImageNodeInputs, resolvePromptReferencedImageInputs } from "../../utils/workflowInputs";
import { dedupeModelConfigsForSelect, findCanonicalModelConfig } from "../../utils/modelConfigSelection";
import { AUTO_IMAGE_MODEL_ID, resolveImageSubmission, selectAutomaticImageModel } from "../../utils/imageModelCapability";
import { isCanvasReadyModel } from "../../utils/modelReadiness";
import { AgentAnalyzeErrorButton } from "../agent/AgentAnalyzeErrorButton";
import type { AvailableImageOptions, ImageInputMode } from "../../types/model";
import type { ImageGenerateNodeData } from "../../types/node";
import { NodeParameterPopover } from "./NodeParameterPopover";
import { CreationNodeFrame } from "./CreationNodeFrame";
import { NodeToolPanel, type NodeTool, type ReferenceMenuItem } from "./NodeToolPanel";
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

function toNumber(value: unknown) {
  const number = typeof value === "number" ? value : typeof value === "string" ? Number(value) : NaN;
  return Number.isFinite(number) && number > 0 ? number : undefined;
}

function gcd(a: number, b: number): number {
  return b === 0 ? a : gcd(b, a % b);
}

function outputRatioFromSummary(data?: Record<string, unknown>, fallback = "1:1") {
  if (!data) return fallback;
  const nested = data.payloadSummary && typeof data.payloadSummary === "object" ? data.payloadSummary as Record<string, unknown> : undefined;
  const output = nested?.output && typeof nested.output === "object" ? nested.output as Record<string, unknown> : undefined;
  const width = toNumber(data.outputWidth) ?? toNumber(output?.width) ?? toNumber((data.transformedOutput as Record<string, unknown> | undefined)?.width);
  const height = toNumber(data.outputHeight) ?? toNumber(output?.height) ?? toNumber((data.transformedOutput as Record<string, unknown> | undefined)?.height);
  if (!width || !height) return fallback;
  const known = [
    ["1:1", 1],
    ["3:4", 3 / 4],
    ["4:3", 4 / 3],
    ["9:16", 9 / 16],
    ["16:9", 16 / 9]
  ] as const;
  const value = width / height;
  const closest = known.reduce((best, current) => Math.abs(value - current[1]) < Math.abs(value - best[1]) ? current : best, known[0]);
  if (Math.abs(value - closest[1]) < 0.035) return closest[0];
  const divisor = gcd(Math.round(width), Math.round(height));
  return `${Math.round(width / divisor)}:${Math.round(height / divisor)}`;
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

function imageReferenceLimitLabel(inputMode: ImageInputMode, modelName?: string) {
  if (inputMode === "text-to-image") return undefined;
  const identity = (modelName || "").toLowerCase();
  if (/qwen|wanx|通义|alibaba/.test(identity)) return "当前通义/阿里图片编辑链路按 1 张主图处理。";
  if (/gpt-image|openai|azure/.test(identity)) return "OpenAI 兼容图片编辑最多支持 16 张参考图。";
  return "当前模式支持连接图片素材；多图数量以上游模型能力为准。";
}

function compactName(value?: string, fallback = "图片") {
  const text = value?.trim() || fallback;
  return text.length > 18 ? `${text.slice(0, 17)}...` : text;
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
  const deleteEdges = useCanvasStore((state) => state.deleteEdges);
  const upload = useAssetStore((state) => state.uploadAsset);
  const edges = useCanvasStore((state) => state.edges);
  const nodes = useCanvasStore((state) => state.nodes);
  const allModels = useModelConfigStore((state) => state.modelConfigs);
  const rawImageModels = useMemo(() => allModels.filter((model) => model.enabled && model.category === "image"), [allModels]);
  const imageModels = useMemo(() => dedupeModelConfigsForSelect(rawImageModels).filter(isCanvasReadyModel), [rawImageModels]);
  const resolvedInputs = useMemo(() => resolveImageNodeInputs(props.id, nodes, edges), [edges, nodes, props.id]);
  const isAutoModel = !props.data.modelConfigId || props.data.modelConfigId === AUTO_IMAGE_MODEL_ID;
  const automaticSelection = useMemo(
    () => selectAutomaticImageModel({ models: imageModels, hasReferenceImages: resolvedInputs.hasImageInput }),
    [imageModels, resolvedInputs.hasImageInput]
  );
  const selectedModel = isAutoModel
    ? (automaticSelection.ok ? automaticSelection.model : undefined)
    : imageModels.find((model) => model.id === props.data.modelConfigId);
  const selectedModelIdForOptions = selectedModel?.id;
  const [options, setOptions] = useState<AvailableImageOptions | null>(null);
  const [localError, setLocalError] = useState("");
  const [localPrompt, setLocalPrompt] = useState(props.data.prompt || "");
  const [parametersOpen, setParametersOpen] = useState(false);
  const [expanded, setExpanded] = useState(false);
  const [editorOpen, setEditorOpen] = useState(false);
  const [activeTool, setActiveTool] = useState<NodeTool>(null);
  const [pendingMentionRange, setPendingMentionRange] = useState<MentionRange | null>(null);
  const isComposingRef = useRef(false);
  const promptTextareaRef = useRef<HTMLTextAreaElement | null>(null);
  const parameterAnchorRef = useRef<HTMLDivElement | null>(null);

  useEffect(() => {
    if (isAutoModel || selectedModel || !imageModels.length) return;
    const canonical = findCanonicalModelConfig(rawImageModels, props.data.modelConfigId);
    if (canonical && isCanvasReadyModel(canonical) && imageModels.some((model) => model.id === canonical.id)) {
      update(props.id, { modelConfigId: canonical.id, errorMessage: undefined });
      return;
    }
    update(props.id, { modelConfigId: AUTO_IMAGE_MODEL_ID, errorMessage: undefined });
  }, [imageModels, isAutoModel, props.data.modelConfigId, props.id, rawImageModels, selectedModel, update]);

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

  function maybeOpenReferenceMenu(textarea = promptTextareaRef.current) {
    if (isComposingRef.current || !textarea || !resolvedInputs.imageInputs.length) return;
    const range = findReferenceMentionRange(textarea.value, textarea.selectionStart ?? textarea.value.length);
    setPendingMentionRange(range);
    if (range) {
      setParametersOpen(false);
      setActiveTool("assets");
    }
  }

  useEffect(() => {
    let cancelled = false;
    if (!selectedModelIdForOptions) {
      setOptions(null);
      return;
    }
    modelConfigApi
      .imageOptions(selectedModelIdForOptions, {
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
  }, [selectedModelIdForOptions, props.data.inputMode, props.data.imageSize, props.data.imageQuality, props.data.imageFormat, props.data.aspectRatio, props.id, resolvedInputs.hasImageInput, update]);

  const availableModes = (options?.availableInputModes ?? selectedModel?.capabilities.inputModes.filter((mode) => ["text-to-image", "image-to-image", "image-edit"].includes(mode)) ?? ["text-to-image"]) as ImageInputMode[];
  const ratios = selectedModel?.capabilities.imageAspectRatios ?? imageAspectRatios;
  const qualities = options?.availableImageQualities ?? selectedModel?.capabilities.imageQualities ?? ["auto"];
  const formats = options?.availableImageFormats ?? selectedModel?.capabilities.imageFormats ?? ["png"];
  const selectedQualityTier = imageQualityTiers.includes(props.data.imageSize ?? "")
    ? props.data.imageSize!
    : tierForQuality(props.data.imageQuality, qualities);
  const displayRatio = outputRatioFromSummary(props.data.payloadSummary, props.data.aspectRatio || "1:1");
  const imageReferenceLimit = imageReferenceLimitLabel(props.data.inputMode, selectedModel?.modelName || selectedModel?.displayName);

  useEffect(() => {
    if (isAutoModel) return;
    if (!resolvedInputs.hasImageInput || props.data.inputMode !== "text-to-image" || !selectedModel) return;
    const resolution = resolveImageSubmission({
      selectedModel,
      models: imageModels,
      inputMode: props.data.inputMode,
      hasReferenceImages: true
    });
    if (!resolution.ok) {
      update(props.id, { errorCode: resolution.errorCode, errorMessage: resolution.message });
      return;
    }
    if (resolution.modelId !== props.data.modelConfigId || resolution.inputMode !== props.data.inputMode) {
      update(props.id, {
        modelConfigId: resolution.modelId,
        inputMode: resolution.inputMode,
        errorCode: undefined,
        errorMessage: resolution.message
      });
    }
  }, [imageModels, isAutoModel, props.data.inputMode, props.data.modelConfigId, props.id, resolvedInputs.hasImageInput, selectedModel, update]);

  async function generate() {
    const automatic = isAutoModel ? selectAutomaticImageModel({ models: imageModels, hasReferenceImages: resolvedInputs.hasImageInput }) : undefined;
    const activeModel = automatic?.ok ? automatic.model : selectedModel;
    if (automatic && !automatic.ok) {
      setLocalError(automatic.message);
      update(props.id, { status: "idle", errorCode: automatic.errorCode, errorMessage: automatic.message });
      return;
    }
    if (!activeModel) {
      update(props.id, { status: "error", errorMessage: "暂无可用图片模型，请先到设置中心配置 API。" });
      return;
    }
    update(props.id, { status: "generating", errorMessage: undefined });
    setLocalError("");
    try {
      const promptForRequest = localPrompt || props.data.prompt || "";
      const promptReferencedInputs = resolvePromptReferencedImageInputs(promptForRequest, resolvedInputs);
      const requestInputs = promptReferencedInputs.hasPromptReferences ? promptReferencedInputs : resolvedInputs;
      const promptForProvider = requestInputs.imageInputs.length
        ? (promptReferencedInputs.referencePrompt ?? buildReferenceAwareImagePrompt(promptForRequest, requestInputs))
        : promptForRequest;
      if (promptReferencedInputs.missingPromptReferences.length) {
        throw new Error(`提示词中的图片引用不存在：${promptReferencedInputs.missingPromptReferences.join("、")}。请使用 @素材1 或 @图片1。`);
      }
      const submission = resolveImageSubmission({
        selectedModel: activeModel,
        models: imageModels,
        inputMode: automatic?.ok ? automatic.inputMode : props.data.inputMode,
        hasReferenceImages: requestInputs.hasImageInput
      });
      if (!submission.ok) {
        setLocalError(submission.message);
        update(props.id, {
          status: "error",
          errorCode: submission.errorCode,
          errorMessage: submission.message
        });
        return;
      }
      if (!isAutoModel && (submission.modelId !== props.data.modelConfigId || submission.inputMode !== props.data.inputMode)) {
        const message = submission.message || "已切换到支持参考图的图片模式，请再次点击生成。";
        update(props.id, {
          status: "idle",
          modelConfigId: submission.modelId,
          inputMode: submission.inputMode,
          errorCode: undefined,
          errorMessage: message
        });
        setLocalError(message);
        return;
      }
      if (submission.inputMode !== "text-to-image" && !requestInputs.hasImageInput) {
        throw new Error(submission.inputMode === "image-edit" ? "图片编辑需要连接一张图片素材。" : "图生图需要连接一张图片素材。");
      }
      const result = await generationApi.image({
        nodeId: props.id,
        modelConfigId: submission.modelId,
        inputMode: submission.inputMode,
        prompt: promptForProvider,
        aspectRatio: props.data.aspectRatio ?? ratios[0],
        imageSize: props.data.imageSize,
        imageQuality: props.data.imageQuality ?? qualities[0],
        imageFormat: props.data.imageFormat ?? formats[0],
        imageAssetIds: compactAssetIds(requestInputs.imageInputs),
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

  function insertReferenceToken(token: string) {
    const textarea = promptTextareaRef.current;
    const selectionStart = textarea?.selectionStart ?? localPrompt.length;
    const selectionEnd = textarea?.selectionEnd ?? selectionStart;
    const detectedRange = findReferenceMentionRange(localPrompt, selectionStart);
    const range = pendingMentionRange ?? detectedRange;
    const replaceStart = range?.start ?? selectionStart;
    const replaceEnd = range ? Math.max(range.end, selectionEnd) : selectionEnd;
    const before = localPrompt.slice(0, replaceStart);
    const after = localPrompt.slice(replaceEnd);
    const leading = before && !/\s$/.test(before) ? " " : "";
    const trailing = after && !/^\s/.test(after) ? " " : " ";
    const next = `${before}${leading}${token}${trailing}${after}`;
    const cursor = before.length + leading.length + token.length + 1;
    setLocalPrompt(next);
    setPendingMentionRange(null);
    update(props.id, { prompt: next, errorMessage: undefined });
    window.requestAnimationFrame(() => {
      promptTextareaRef.current?.focus();
      promptTextareaRef.current?.setSelectionRange(cursor, cursor);
    });
  }

  function disconnectReference(sourceNodeId: string) {
    const edgeIds = edges.filter((edge) => edge.source === sourceNodeId && edge.target === props.id).map((edge) => edge.id);
    if (edgeIds.length) deleteEdges(edgeIds);
  }

  const preview = imageModels.length === 0 ? <div className="creation-preview-empty"><ImagePlus size={29} /><span>请先配置图片模型</span></div> : (
    <MediaPreview type="image" title={props.data.title} outputUrl={props.data.outputUrl} aspectRatio={aspectRatioCss(displayRatio)} className="creation-media-preview">
      <div className={`creation-preview-empty ${props.data.status === "error" ? "is-error" : ""}`}><ImagePlus size={28} /><span>{props.data.status === "generating" ? "正在生成图片" : props.data.status === "error" ? "图片生成失败" : "图片预览"}</span></div>
    </MediaPreview>
  );

  const referenceVisualItems = resolvedInputs.imageInputs.map((input, index) => ({
    input,
    token: `@素材${index + 1}`,
    typedToken: `@图片${index + 1}`,
    name: compactName(input.title, `图片${index + 1}`),
    previewUrl: absoluteUploadUrl(input.thumbnailUrl || input.url),
    fallbackUrl: absoluteUploadUrl(input.url)
  }));
  const referenceMenuItems: ReferenceMenuItem[] = referenceVisualItems.map((item, index) => ({
    token: item.token,
    typedToken: item.typedToken,
    label: `素材${index + 1} · 图片${index + 1}`,
    kind: "图像",
    name: item.name,
    previewUrl: item.previewUrl
  }));

  const dock = (
    <div className="creation-dock-content relative">
      <div className="creation-video-reference-bar">
        <button type="button" title="智能辅助" className={`creation-video-reference-tool ${activeTool === "styles" ? "is-active" : ""}`} onClick={() => { setParametersOpen(false); setActiveTool(activeTool === "styles" ? null : "styles"); }}><Sparkles size={17} /></button>
        <span className="creation-video-reference-divider" />
        <div className="creation-video-reference-thumbnails">
          {referenceVisualItems.map((item) => <button type="button" className="creation-video-reference-thumbnail" key={item.token} title={`${item.token} · ${item.name}`} onClick={() => insertReferenceToken(item.token)}>{item.previewUrl ? <img src={item.previewUrl} alt="" onError={(event) => { const image = event.currentTarget; if (item.fallbackUrl && image.src !== item.fallbackUrl) image.src = item.fallbackUrl; else image.style.display = "none"; }} /> : <Library size={17} />}</button>)}
          <button type="button" title="添加参考素材" className={`creation-video-reference-add ${activeTool === "assets" ? "is-active" : ""}`} onClick={() => { setParametersOpen(false); setActiveTool(activeTool === "assets" ? null : "assets"); }}><Plus size={20} /></button>
        </div>
        <button type="button" title={expanded ? "收起详情" : "展开详情"} className="creation-detail-toggle" onClick={() => setExpanded((value) => !value)}><Maximize2 size={14} /></button>
      </div>
      {referenceVisualItems.length > 0 && <div className="creation-video-reference-chips">{referenceVisualItems.map((item) => <span key={item.token} className="creation-video-reference-chip"><button type="button" className="creation-video-reference-remove" title="移除连接" onClick={() => disconnectReference(item.input.sourceNodeId)}><X size={13} /></button>{item.previewUrl ? <img src={item.previewUrl} alt="" onError={(event) => { const image = event.currentTarget; if (item.fallbackUrl && image.src !== item.fallbackUrl) image.src = item.fallbackUrl; else image.style.display = "none"; }} /> : <Library size={14} />}<button type="button" className="creation-video-reference-token" onClick={() => insertReferenceToken(item.token)}><span>图像</span><strong>{item.name}</strong></button></span>)}</div>}
      <div className="creation-dock-composer">
        <Textarea ref={promptTextareaRef} className="creation-prompt-input nodrag nopan nowheel" placeholder="描述你想生成的内容，或输入 @ 引用素材" value={localPrompt} onChange={handlePromptChange} onCompositionStart={handleCompositionStart} onCompositionEnd={handleCompositionEnd} onClick={(event) => maybeOpenReferenceMenu(event.currentTarget)} onKeyUp={(event) => maybeOpenReferenceMenu(event.currentTarget)} />
      </div>
      {(props.data.errorMessage || localError) && <button type="button" className="creation-error-line" onClick={() => setExpanded(true)}><span>{props.data.errorMessage || localError}</span><strong>诊断</strong></button>}
      <div className="creation-dock-footer">
        <div className="creation-dock-identity">
          <div className="creation-model-field"><ImagePlus size={14} /><Select className="creation-model-select" value={props.data.modelConfigId ?? AUTO_IMAGE_MODEL_ID} onChange={(event) => update(props.id, { modelConfigId: event.target.value, errorCode: undefined, errorMessage: undefined })}><option value={AUTO_IMAGE_MODEL_ID}>自动</option>{imageModels.map((model) => <option key={model.id} value={model.id}>{model.displayName}</option>)}</Select></div>
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
          <div className="creation-video-generate-cluster">
            <button type="button" className="creation-video-count-button" title="生成数量" onClick={() => update(props.id, { generateCount: (props.data.generateCount % 4) + 1 })}>{props.data.generateCount || 1}x</button>
            <button type="button" title={props.data.status === "idle" ? "生成" : generateButtonText(props.data.status)} aria-label={props.data.status === "idle" ? "生成" : generateButtonText(props.data.status)} className="creation-generate-button creation-video-generate-button" disabled={!selectedModel || props.data.status === "generating"} onClick={() => void generate()}><ArrowUp size={19} strokeWidth={2.3} /></button>
          </div>
        </div>
      </div>
      <NodeToolPanel tool={activeTool} onClose={() => setActiveTool(null)} onInsert={activeTool === "assets" ? insertReferenceToken : insertPromptContext} referenceItems={referenceMenuItems} />
      {expanded && <div className="creation-detail-panel nodrag nopan">{props.data.inputMode !== "text-to-image" && !resolvedInputs.hasImageInput && <div className="creation-detail-copy">当前模式需要连接一张图片素材。</div>}{props.data.inputMode !== "text-to-image" && resolvedInputs.hasImageInput && <div className="creation-detail-copy">已连接 {resolvedInputs.imageInputs.length} 张图片素材。{imageReferenceLimit ? ` ${imageReferenceLimit}` : ""}</div>}{options?.warningMessage && <div className="creation-detail-copy">{options.warningMessage}</div>}<PayloadSummary data={props.data.payloadSummary} />{(props.data.errorMessage || localError) && <AgentAnalyzeErrorButton nodeId={props.id} errorMessage={props.data.errorMessage || localError} nodeData={props.data as unknown as Record<string, unknown>} />}</div>}
    </div>
  );

  return (
    <>
      <CreationNodeFrame
        id={props.id}
        type={props.type}
        selected={props.selected}
        title={props.data.title || "Image"}
        ratio={displayRatio}
        status={props.data.status}
        preview={preview}
        toolbar={
          <MediaPreviewActions
            kind="image"
            url={props.data.outputUrl}
            assetId={props.data.outputAssetId}
            title={props.data.title}
            nodeId={props.id}
            onEdit={() => setEditorOpen(true)}
            onSaved={(assetId) => update(props.id, { outputAssetId: assetId })}
          />
        }
        dock={dock}
      />
      <ImageAssetEditor
        open={editorOpen}
        src={props.data.outputUrl}
        title={props.data.title || "生成图片"}
        uploadAsset={upload}
        onClose={() => setEditorOpen(false)}
        onSaved={(asset) => update(props.id, { status: "success", outputAssetId: asset.id, outputUrl: asset.url })}
      />
    </>
  );
}

export const ImageGenerateNode = memo(ImageGenerateNodeComponent);
