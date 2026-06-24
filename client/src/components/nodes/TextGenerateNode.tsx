import { useEffect, useMemo, useRef, useState, type ChangeEvent, type CompositionEvent } from "react";
import type { Edge, Node, NodeProps } from "reactflow";
import { AlertCircle, ArrowUp, Copy, FileAudio, FileText, Image as ImageIcon, Library, Sparkles, Video } from "lucide-react";
import { Select } from "../common/Select";
import { Textarea } from "../common/Textarea";
import { CreationNodeFrame } from "./CreationNodeFrame";
import { generationApi } from "../../services/generationApi";
import { useCanvasStore } from "../../store/canvasStore";
import { useModelConfigStore } from "../../store/modelConfigStore";
import { absoluteUploadUrl } from "../../utils/file";
import { buildReferenceAwareVideoPrompt, compactAssetIds, resolvePromptReferencedVideoInputs, resolveVideoNodeInputs, type AssetInput } from "../../utils/workflowInputs";
import { dedupeModelConfigsForSelect, findCanonicalModelConfig } from "../../utils/modelConfigSelection";
import { AgentAnalyzeErrorButton } from "../agent/AgentAnalyzeErrorButton";
import type { ScriptNodeData, TextAgentTask, TextGenerateNodeData, TextNodeData } from "../../types/node";
import { NodeToolPanel, type NodeTool, type ReferenceMenuItem } from "./NodeToolPanel";

const taskLabels: Record<TextAgentTask, string> = {
  "prompt-polish": "提示词优化",
  script: "脚本 / 分镜",
  "reverse-prompt": "反推提示词",
  custom: "自定义"
};

function statusText(status: TextGenerateNodeData["status"]) {
  return { idle: "未生成", generating: "生成中", success: "已完成", error: "失败" }[status];
}

function buttonText(status: TextGenerateNodeData["status"]) {
  if (status === "generating") return "生成中...";
  if (status === "success") return "重新生成";
  if (status === "error") return "重试";
  return "生成";
}

function humanizeError(error: unknown) {
  const message = error instanceof Error ? error.message : "文本生成失败";
  if (/fetch failed/i.test(message)) return "网络请求失败，请检查本地后端服务或第三方 API 网络连接。";
  return message;
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

function compactName(value?: string, fallback = "素材") {
  const text = value?.trim() || fallback;
  return text.length > 18 ? `${text.slice(0, 17)}...` : text;
}

async function copyText(text: string) {
  if (navigator.clipboard?.writeText) {
    try {
      await navigator.clipboard.writeText(text);
      return true;
    } catch {
      // In LAN http contexts, Clipboard API is often blocked. Fall through.
    }
  }

  const textarea = document.createElement("textarea");
  textarea.value = text;
  textarea.setAttribute("readonly", "true");
  textarea.style.position = "fixed";
  textarea.style.left = "-9999px";
  textarea.style.top = "0";
  document.body.appendChild(textarea);
  textarea.select();
  const ok = document.execCommand("copy");
  document.body.removeChild(textarea);
  return ok;
}

function incomingTextForNode(nodeId: string, nodes: Node[], edges: Edge[]) {
  const sourceNodes = edges
    .filter((edge) => edge.target === nodeId)
    .map((edge) => nodes.find((node) => node.id === edge.source))
    .filter(Boolean) as Node[];

  return sourceNodes
    .map((node) => {
      if (node.type === "text") return (node.data as TextNodeData).content;
      if (node.type === "script") {
        const shots = (node.data as ScriptNodeData).shots ?? [];
        return shots.map((shot) => `镜头 ${shot.shotNumber}: ${shot.prompt || shot.visualDescription}`).filter(Boolean).join("\n");
      }
      if (node.type === "image" || node.type === "imageGenerate") return "已连接图片素材，可用于识图写提示词、反推画面提示词、提取视觉卖点。";
      if (node.type === "video") return "已连接视频素材，可用于反推视频提示词、拆解镜头动作、总结节奏和生成二创脚本。";
      if (node.type === "audio") return "已连接音频素材，可用于提取节奏、氛围、口播脚本或声音设计建议。";
      return "";
    })
    .filter(Boolean)
    .join("\n\n");
}

function referenceContextForTextModel(inputs: ReturnType<typeof resolveVideoNodeInputs>) {
  const rows: string[] = [];
  const push = (kind: string, input: AssetInput, index: number, globalIndex: number) => {
    const title = input.title || input.assetId || input.sourceNodeId || "未命名素材";
    const url = input.publicUrl || input.url || input.localPath || "";
    rows.push(`@素材${globalIndex} / @${kind}${index}: ${title}${input.assetId ? `，assetId=${input.assetId}` : ""}${url ? `，url=${url}` : ""}`);
  };
  let globalIndex = 1;
  inputs.imageInputs.forEach((input, index) => push("图片", input, index + 1, globalIndex++));
  inputs.videoInputs.forEach((input, index) => push("视频", input, index + 1, globalIndex++));
  inputs.audioInputs.forEach((input, index) => push("音频", input, index + 1, globalIndex++));
  if (!rows.length) return "";
  return [
    "【当前连接素材清单】",
    ...rows,
    "如果当前文本模型不能直接读取媒体内容，请基于素材名称、链接、上游文本和用户指令进行推理；不要编造无法从上下文确认的细节。"
  ].join("\n");
}

export function TextGenerateNode(props: NodeProps<TextGenerateNodeData>) {
  const update = useCanvasStore((state) => state.updateNodeData);
  const edges = useCanvasStore((state) => state.edges);
  const nodes = useCanvasStore((state) => state.nodes);
  const allModels = useModelConfigStore((state) => state.modelConfigs);
  const rawTextModels = useMemo(
    () => allModels.filter((model) => model.enabled && (model.category === "text" || (!model.category && model.modelType === "text"))),
    [allModels]
  );
  const textModels = useMemo(() => dedupeModelConfigsForSelect(rawTextModels), [rawTextModels]);
  const selectedModel = textModels.find((model) => model.id === props.data.modelConfigId);
  const resolvedReferenceInputs = useMemo(() => resolveVideoNodeInputs(props.id, nodes, edges), [edges, nodes, props.id]);
  const upstreamText = useMemo(() => incomingTextForNode(props.id, nodes, edges), [edges, nodes, props.id]);
  const [localPrompt, setLocalPrompt] = useState(props.data.prompt || "");
  const [localError, setLocalError] = useState("");
  const [copyStatus, setCopyStatus] = useState("");
  const [activeTool, setActiveTool] = useState<NodeTool>(null);
  const [expanded, setExpanded] = useState(false);
  const [pendingMentionRange, setPendingMentionRange] = useState<MentionRange | null>(null);
  const isComposingRef = useRef(false);
  const promptTextareaRef = useRef<HTMLTextAreaElement | null>(null);
  const displayTitle = !props.data.title || /^(Gemini\s*(智能体|Agent)|Agent\s*智能体)$/i.test(props.data.title.trim())
    ? "创意工作台"
    : props.data.title;

  useEffect(() => {
    if (props.data.title === displayTitle) return;
    update(props.id, { title: displayTitle });
  }, [displayTitle, props.data.title, props.id, update]);

  useEffect(() => {
    if (selectedModel || !textModels.length) return;
    const canonical = findCanonicalModelConfig(rawTextModels, props.data.modelConfigId);
    if (canonical) {
      update(props.id, { modelConfigId: canonical.id, errorMessage: undefined });
      return;
    }
    update(props.id, { modelConfigId: textModels[0].id, errorMessage: undefined });
  }, [props.data.modelConfigId, props.id, rawTextModels, selectedModel, textModels, update]);

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
    const hasReferences = resolvedReferenceInputs.imageInputs.length + resolvedReferenceInputs.videoInputs.length + resolvedReferenceInputs.audioInputs.length > 0;
    if (isComposingRef.current || !textarea || !hasReferences) return;
    const range = findReferenceMentionRange(textarea.value, textarea.selectionStart ?? textarea.value.length);
    setPendingMentionRange(range);
    if (range) setActiveTool("assets");
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
    setActiveTool(null);
    update(props.id, { prompt: next, errorMessage: undefined });
    window.requestAnimationFrame(() => {
      promptTextareaRef.current?.focus();
      promptTextareaRef.current?.setSelectionRange(cursor, cursor);
    });
  }

  async function generate() {
    if (!props.data.modelConfigId || !selectedModel) {
      update(props.id, { status: "error", errorMessage: "暂无可用文本模型，请先到设置中心配置文本生成 API。" });
      return;
    }

    update(props.id, { status: "generating", errorMessage: undefined });
    setLocalError("");

    try {
      const rawInputText = [localPrompt, referenceContextForTextModel(resolvedReferenceInputs), upstreamText].filter(Boolean).join("\n\n---\n\n");
      const promptReferencedInputs = resolvePromptReferencedVideoInputs(rawInputText, resolvedReferenceInputs);
      const requestInputs = promptReferencedInputs.hasPromptReferences ? promptReferencedInputs : resolvedReferenceInputs;
      if (promptReferencedInputs.missingPromptReferences.length) {
        throw new Error(`提示词中的素材引用不存在：${promptReferencedInputs.missingPromptReferences.join("、")}。请使用 @素材1、@图片1 或 @视频1。`);
      }
      const hasMediaInputs = requestInputs.imageInputs.length + requestInputs.videoInputs.length + requestInputs.audioInputs.length > 0;
      const inputText = hasMediaInputs
        ? (promptReferencedInputs.referencePrompt ?? buildReferenceAwareVideoPrompt(rawInputText, requestInputs))
        : rawInputText;
      const result = await generationApi.text({
        nodeId: props.id,
        modelConfigId: props.data.modelConfigId,
        inputText: inputText || "请根据当前工作流目标生成可用的提示词、脚本或反推提示词。",
        taskType: props.data.taskType,
        imageAssetIds: compactAssetIds(requestInputs.imageInputs),
        videoAssetIds: compactAssetIds(requestInputs.videoInputs),
        audioAssetIds: compactAssetIds(requestInputs.audioInputs)
      });

      update(
        props.id,
        result.status === "success"
          ? { status: "success", outputText: result.outputText, errorMessage: undefined }
          : { status: "error", errorMessage: result.errorMessage }
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

  async function copyOutput() {
    const ok = await copyText(props.data.outputText || "");
    setCopyStatus(ok ? "已复制" : "复制失败，请手动选中文本复制");
    window.setTimeout(() => setCopyStatus(""), 1600);
  }

  const allReferenceInputs = useMemo(() => [
    ...resolvedReferenceInputs.imageInputs.map((input, index) => ({ input, kind: "image" as const, kindIndex: index + 1 })),
    ...resolvedReferenceInputs.videoInputs.map((input, index) => ({ input, kind: "video" as const, kindIndex: index + 1 })),
    ...resolvedReferenceInputs.audioInputs.map((input, index) => ({ input, kind: "audio" as const, kindIndex: index + 1 }))
  ], [resolvedReferenceInputs]);
  const kindName = (kind: "image" | "video" | "audio") => kind === "image" ? "图片" : kind === "video" ? "视频" : "音频";
  const kindToken = (kind: "image" | "video" | "audio") => kind === "image" ? "图片" : kind === "video" ? "视频" : "音频";
  const previewForInput = (input: AssetInput) => absoluteUploadUrl(input.thumbnailUrl || input.url);
  const fallbackForInput = (input: AssetInput) => absoluteUploadUrl(input.url);
  const referenceVisualItems = allReferenceInputs.map(({ input, kind, kindIndex }, index) => ({
    input,
    token: `@素材${index + 1}`,
    typedToken: `@${kindToken(kind)}${kindIndex}`,
    kind,
    kindIndex,
    name: compactName(input.title, `${kindName(kind)}${kindIndex}`),
    previewUrl: previewForInput(input),
    fallbackUrl: fallbackForInput(input)
  }));
  const referenceMenuItems: ReferenceMenuItem[] = referenceVisualItems.map((item, index) => ({
    token: item.token,
    typedToken: item.typedToken,
    label: `素材${index + 1} · ${kindName(item.kind)}${item.kindIndex}`,
    kind: kindName(item.kind),
    name: item.name,
    previewUrl: item.previewUrl
  }));

  const preview = (
    <div className={`creative-workbench-preview is-${props.data.status}`}>
      <div className="creative-workbench-preview-head">
        <span className="creative-workbench-mark"><Sparkles size={17} /></span>
        <div><strong>{taskLabels[props.data.taskType]}</strong><small>生成结果会保留在这里，可继续连接图片、视频或剧本节点</small></div>
        {props.data.outputText && <button type="button" title="复制结果" onClick={copyOutput}><Copy size={14} /><span>{copyStatus || "复制"}</span></button>}
      </div>
      <div className="creative-workbench-output nodrag nopan nowheel">
        {props.data.status === "success" && props.data.outputText ? <pre>{props.data.outputText}</pre> :
          props.data.status === "generating" ? <div className="creative-workbench-empty"><Sparkles className="animate-pulse" size={24} /><strong>正在整理创作内容</strong><span>完成后会自动显示在当前节点</span></div> :
            props.data.status === "error" ? <div className="creative-workbench-empty is-error"><AlertCircle size={24} /><strong>本次生成未完成</strong><span>请在下方查看原因并重试</span></div> :
              <div className="creative-workbench-empty"><FileText size={24} /><strong>等待生成内容</strong><span>输入想法、引用素材，再选择任务类型</span></div>}
      </div>
    </div>
  );

  const dock = (
    <div className="creation-dock-content creative-workbench-dock relative">
      <div className="creation-video-reference-bar">
        <button type="button" title="引用素材" className={`creation-video-reference-tool ${activeTool === "assets" ? "is-active" : ""}`} onClick={() => setActiveTool(activeTool === "assets" ? null : "assets")}><Sparkles size={17} /></button>
        <span className="creation-video-reference-divider" />
        <div className="creation-video-reference-thumbnails">
          {referenceVisualItems.map((item) => (
            <button type="button" className="creation-video-reference-thumbnail" key={item.token} title={`${item.token} · ${item.name}`} onClick={() => insertReferenceToken(item.token)}>
              {item.previewUrl ? <img src={item.previewUrl} alt="" onError={(event) => { const image = event.currentTarget; if (item.fallbackUrl && image.src !== item.fallbackUrl) image.src = item.fallbackUrl; else image.style.display = "none"; }} /> : item.kind === "video" ? <Video size={17} /> : item.kind === "audio" ? <FileAudio size={17} /> : <ImageIcon size={17} />}
            </button>
          ))}
          <button type="button" title="添加参考素材" className={`creation-video-reference-add ${activeTool === "assets" ? "is-active" : ""}`} onClick={() => setActiveTool(activeTool === "assets" ? null : "assets")}><Library size={18} /></button>
        </div>
      </div>
      {referenceVisualItems.length > 0 && <div className="creation-video-reference-chips">{referenceVisualItems.map((item) => <span key={item.token} className="creation-video-reference-chip">{item.previewUrl ? <img src={item.previewUrl} alt="" /> : item.kind === "video" ? <Video size={14} /> : item.kind === "audio" ? <FileAudio size={14} /> : <ImageIcon size={14} />}<button type="button" className="creation-video-reference-token" onClick={() => insertReferenceToken(item.token)}><span>{kindName(item.kind)}</span><strong>{item.name}</strong></button></span>)}</div>}
      <div className="creation-dock-composer">
        <Textarea ref={promptTextareaRef} className="creation-prompt-input nodrag nopan nowheel" placeholder="输入创作目标，或输入 @ 引用连接素材" value={localPrompt} onChange={handlePromptChange} onCompositionStart={handleCompositionStart} onCompositionEnd={handleCompositionEnd} onClick={(event) => maybeOpenReferenceMenu(event.currentTarget)} onKeyUp={(event) => maybeOpenReferenceMenu(event.currentTarget)} />
      </div>
      {(props.data.errorMessage || localError) && <button type="button" className="creation-error-line" onClick={() => setExpanded(true)}><AlertCircle size={12} /><span>{props.data.errorMessage || localError}</span><strong>诊断</strong></button>}
      <div className="creation-dock-footer">
        <div className="creation-dock-identity">
          <div className="creation-model-field"><Sparkles size={14} /><Select className="creation-model-select" value={props.data.modelConfigId ?? ""} onChange={(event) => update(props.id, { modelConfigId: event.target.value })}><option value="">选择模型</option>{textModels.map((model) => <option key={model.id} value={model.id}>{model.displayName}</option>)}</Select></div>
          <Select className="creative-workbench-task-select" value={props.data.taskType} onChange={(event) => update(props.id, { taskType: event.target.value as TextAgentTask })}>{(Object.keys(taskLabels) as TextAgentTask[]).map((task) => <option key={task} value={task}>{taskLabels[task]}</option>)}</Select>
        </div>
        <div className="creation-dock-actions"><button type="button" title={buttonText(props.data.status)} aria-label={buttonText(props.data.status)} className="creation-generate-button creation-video-generate-button" disabled={!selectedModel || props.data.status === "generating"} onClick={() => void generate()}><ArrowUp size={19} strokeWidth={2.3} /></button></div>
      </div>
      <NodeToolPanel tool={activeTool} onClose={() => setActiveTool(null)} onInsert={insertReferenceToken} referenceItems={referenceMenuItems} referenceTitle="全能参考" showReferenceCommands={false} />
      {expanded && <div className="creation-detail-panel nodrag nopan">{props.data.taskType === "reverse-prompt" && !referenceVisualItems.length && <div className="creation-detail-copy">反推提示词需要连接图片、视频或音频素材。</div>}{upstreamText && <div className="creation-detail-copy">已引用上游节点内容。</div>}{(props.data.errorMessage || localError) && <AgentAnalyzeErrorButton nodeId={props.id} errorMessage={props.data.errorMessage || localError} nodeData={props.data as unknown as Record<string, unknown>} />}</div>}
    </div>
  );

  return <CreationNodeFrame id={props.id} type={props.type} selected={props.selected} title={displayTitle} ratio="16:9" status={props.data.status} preview={preview} dock={dock} />;
}
