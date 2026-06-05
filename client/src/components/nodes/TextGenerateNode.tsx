import { useEffect, useMemo, useRef, useState, type ChangeEvent, type CompositionEvent } from "react";
import type { Edge, Node, NodeProps } from "reactflow";
import { Copy, Sparkles } from "lucide-react";
import { Button } from "../common/Button";
import { Select } from "../common/Select";
import { Textarea } from "../common/Textarea";
import { NodeShell } from "./NodeShell";
import { generationApi } from "../../services/generationApi";
import { useCanvasStore } from "../../store/canvasStore";
import { useModelConfigStore } from "../../store/modelConfigStore";
import { compactAssetIds, resolveImageNodeInputs } from "../../utils/workflowInputs";
import { AgentAnalyzeErrorButton } from "../agent/AgentAnalyzeErrorButton";
import type { ScriptNodeData, TextAgentTask, TextGenerateNodeData, TextNodeData } from "../../types/node";

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
      if (node.type === "image" || node.type === "imageGenerate") return "已连接图片素材，可用于反推提示词、识图描述或提取视觉卖点。";
      if (node.type === "video") return "已连接视频素材，可用于视频内容总结或二创脚本。";
      return "";
    })
    .filter(Boolean)
    .join("\n\n");
}

export function TextGenerateNode(props: NodeProps<TextGenerateNodeData>) {
  const update = useCanvasStore((state) => state.updateNodeData);
  const edges = useCanvasStore((state) => state.edges);
  const nodes = useCanvasStore((state) => state.nodes);
  const allModels = useModelConfigStore((state) => state.modelConfigs);
  const textModels = useMemo(
    () => allModels.filter((model) => model.enabled && (model.category === "text" || (!model.category && model.modelType === "text"))),
    [allModels]
  );
  const selectedModel = textModels.find((model) => model.id === props.data.modelConfigId);
  const resolvedImageInputs = useMemo(() => resolveImageNodeInputs(props.id, nodes, edges), [edges, nodes, props.id]);
  const upstreamText = useMemo(() => incomingTextForNode(props.id, nodes, edges), [edges, nodes, props.id]);
  const [localPrompt, setLocalPrompt] = useState(props.data.prompt || "");
  const [localError, setLocalError] = useState("");
  const [copyStatus, setCopyStatus] = useState("");
  const isComposingRef = useRef(false);

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

  async function generate() {
    if (!props.data.modelConfigId || !selectedModel) {
      update(props.id, { status: "error", errorMessage: "暂无可用文本模型，请先到设置中心配置 Gemini 或 DeepSeek API。" });
      return;
    }

    update(props.id, { status: "generating", errorMessage: undefined });
    setLocalError("");

    try {
      const inputText = [localPrompt, upstreamText].filter(Boolean).join("\n\n---\n\n");
      const result = await generationApi.text({
        nodeId: props.id,
        modelConfigId: props.data.modelConfigId,
        inputText: inputText || "请根据当前工作流目标生成可用的提示词、脚本或反推提示词。",
        taskType: props.data.taskType,
        imageAssetIds: compactAssetIds(resolvedImageInputs.imageInputs)
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

  return (
    <NodeShell
      {...props}
      title={props.data.title}
      badge="Gemini Agent"
      width={380}
      status={statusText(props.data.status)}
      footer={
        <div className="nodrag nopan flex h-[42px] items-center gap-2 overflow-hidden">
          <Select className="h-8 min-w-[132px]" value={props.data.modelConfigId ?? ""} onChange={(event) => update(props.id, { modelConfigId: event.target.value })}>
            <option value="">选择模型</option>
            {textModels.map((model) => (
              <option key={model.id} value={model.id}>
                {model.displayName}
              </option>
            ))}
          </Select>
          <Select className="h-8 w-[112px]" value={props.data.taskType} onChange={(event) => update(props.id, { taskType: event.target.value as TextAgentTask })}>
            {(Object.keys(taskLabels) as TextAgentTask[]).map((task) => (
              <option key={task} value={task}>
                {taskLabels[task]}
              </option>
            ))}
          </Select>
          <Button className="ml-auto h-[34px] min-w-[74px]" variant="primary" disabled={props.data.status === "generating"} onClick={generate}>
            <Sparkles size={14} /> {buttonText(props.data.status)}
          </Button>
        </div>
      }
    >
      <div className="space-y-2.5">
        {props.data.taskType === "reverse-prompt" && !resolvedImageInputs.hasImageInput && (
          <div className="rounded-[10px] border border-amber-300/15 bg-amber-300/10 px-2.5 py-2 text-[12px] leading-5 text-amber-100">
            反推提示词建议连接图片素材或图片生成节点。
          </div>
        )}
        {upstreamText && <div className="line-clamp-3 rounded-[10px] border border-white/[0.06] bg-white/[0.04] px-2.5 py-2 text-[12px] leading-5 text-[#a2acba]">已引用上游节点内容。</div>}
        <Textarea
          className="h-[112px]"
          placeholder="输入粗略想法，例如：帮我把产品图反推成图生视频提示词，或生成 5 个短视频分镜脚本。"
          value={localPrompt}
          onChange={handlePromptChange}
          onCompositionStart={handleCompositionStart}
          onCompositionEnd={handleCompositionEnd}
        />
        {props.data.status === "success" && props.data.outputText && (
          <div className="nodrag nopan nowheel max-h-[160px] overflow-auto rounded-xl border border-white/[0.06] bg-[#0f131a] p-3 text-[12px] leading-5 text-[#d8dee8]">
            <div className="mb-2 flex items-center justify-between gap-2">
              <span className="text-[11px] font-medium text-[#7d8796]">输出结果</span>
              <Button className="h-7 px-2" variant="ghost" type="button" onClick={copyOutput}>
                <Copy size={13} /> {copyStatus || "复制"}
              </Button>
            </div>
            <pre className="whitespace-pre-wrap font-sans">{props.data.outputText}</pre>
          </div>
        )}
        {(props.data.errorMessage || localError) && <div className="text-[12px] leading-5 text-red-300">{props.data.errorMessage || localError}</div>}
        {(props.data.errorMessage || localError) && <AgentAnalyzeErrorButton nodeId={props.id} errorMessage={props.data.errorMessage || localError} nodeData={props.data as unknown as Record<string, unknown>} />}
      </div>
    </NodeShell>
  );
}
