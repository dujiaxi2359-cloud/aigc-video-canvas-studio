import type { NodeProps } from "reactflow";
import { SplitSquareHorizontal } from "lucide-react";
import { Button } from "../common/Button";
import { Textarea } from "../common/Textarea";
import { NodeShell } from "./NodeShell";
import { useCanvasStore } from "../../store/canvasStore";
import type { ScriptNodeData } from "../../types/node";

export function ScriptNode(props: NodeProps<ScriptNodeData>) {
  const update = useCanvasStore((state) => state.updateNodeData);
  const firstShot = props.data.shots[0];

  return (
    <NodeShell
      {...props}
      title={props.data.title}
      badge="Script Generator"
      width={320}
      footer={
        <Button className="nodrag nopan h-8" variant="secondary">
          <SplitSquareHorizontal size={14} strokeWidth={1.8} /> 拆分分镜
        </Button>
      }
    >
      <div className="space-y-2">
        <div className="rounded-[10px] border border-white/[0.06] bg-white/[0.03] px-3 py-2 text-[12px] text-[#8b95a5]">剧本草稿 / Shot prompt</div>
        <Textarea
          className="nodrag nopan h-[118px]"
          placeholder="输入故事方向、人物关系、画面描述或镜头提示词"
          value={firstShot?.prompt ?? ""}
          onChange={(event) => {
            const next = props.data.shots.length
              ? [{ ...firstShot, prompt: event.target.value, visualDescription: event.target.value }]
              : [];
            update(props.id, { shots: next });
          }}
        />
      </div>
    </NodeShell>
  );
}
