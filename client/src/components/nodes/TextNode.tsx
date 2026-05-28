import { useEffect, useRef, useState, type ChangeEvent, type CompositionEvent } from "react";
import type { NodeProps } from "reactflow";
import { Copy } from "lucide-react";
import { Button } from "../common/Button";
import { Textarea } from "../common/Textarea";
import { NodeShell } from "./NodeShell";
import { useCanvasStore } from "../../store/canvasStore";
import type { TextNodeData } from "../../types/node";

function referenceHint(sourceType?: string) {
  if (sourceType === "image") return "已引用图片素材，可用于识图描述、反推提示词或提取产品卖点。";
  if (sourceType === "video") return "已引用视频素材，可用于视频内容总结，功能待接入。";
  if (sourceType === "audio") return "已引用音频素材，可用于音频转写，功能待接入。";
  return "";
}

export function TextNode(props: NodeProps<TextNodeData>) {
  const update = useCanvasStore((state) => state.updateNodeData);
  const hint = referenceHint(props.data.referencedFrom?.sourceNodeType);
  const [localContent, setLocalContent] = useState(props.data.content || "");
  const isComposingRef = useRef(false);

  useEffect(() => {
    if (isComposingRef.current) return;
    const nextContent = props.data.content || "";
    setLocalContent((currentContent) => (currentContent === nextContent ? currentContent : nextContent));
  }, [props.data.content]);

  function handleContentChange(event: ChangeEvent<HTMLTextAreaElement>) {
    const value = event.target.value;
    setLocalContent(value);
    if (!isComposingRef.current) update(props.id, { content: value });
  }

  function handleCompositionStart() {
    isComposingRef.current = true;
  }

  function handleCompositionEnd(event: CompositionEvent<HTMLTextAreaElement>) {
    isComposingRef.current = false;
    const value = event.currentTarget.value;
    setLocalContent(value);
    update(props.id, { content: value });
  }

  return (
    <NodeShell
      {...props}
      title={props.data.title}
      badge="Prompt"
      width={300}
      footer={
        <div className="flex h-8 justify-between">
          <Button className="h-8" variant="ghost" onClick={() => navigator.clipboard.writeText(localContent)}>
            <Copy size={14} strokeWidth={1.8} /> 复制文本
          </Button>
        </div>
      }
    >
      <div className="space-y-2">
        {hint && <div className="rounded-[10px] border border-[#7c6cf6]/[0.14] bg-[#7c6cf6]/[0.08] px-2.5 py-2 text-[12px] leading-5 text-[#cfd6e1]">{hint}</div>}
        <Textarea
          className="h-[112px]"
          placeholder="输入提示词、口播文案或字幕文本"
          value={localContent}
          onChange={handleContentChange}
          onCompositionStart={handleCompositionStart}
          onCompositionEnd={handleCompositionEnd}
        />
      </div>
    </NodeShell>
  );
}
