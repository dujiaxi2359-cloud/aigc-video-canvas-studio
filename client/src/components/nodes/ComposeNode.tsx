import type { NodeProps } from "reactflow";
import { Clapperboard } from "lucide-react";
import { Button } from "../common/Button";
import { NodeShell } from "./NodeShell";
import { NodeDownloadButton } from "./NodeDownloadButton";
import { useCanvasStore } from "../../store/canvasStore";
import type { ComposeNodeData } from "../../types/node";

export function ComposeNode(props: NodeProps<ComposeNodeData>) {
  const update = useCanvasStore((state) => state.updateNodeData);
  const edges = useCanvasStore((state) => state.edges);
  const nodes = useCanvasStore((state) => state.nodes);
  const incoming = edges.filter((edge) => edge.target === props.id).map((edge) => nodes.find((node) => node.id === edge.source));
  const videoCount = incoming.filter((node) => node?.type === "video").length;
  const hasAudio = incoming.some((node) => node?.type === "audio");
  const hasSubtitle = incoming.some((node) => node?.type === "text" || node?.type === "textGenerate" || node?.type === "script");

  return (
    <NodeShell
      {...props}
      title={props.data.title}
      badge="Compose"
      width={320}
      status={statusText(props.data.status)}
      inputHandles={3}
      headerActions={
        props.data.status === "success" && props.data.outputUrl ? (
          <NodeDownloadButton kind="compose" url={props.data.outputUrl} assetId={props.data.outputAssetId} title={props.data.title} tooltip="导出合成视频" label="导出合成视频" />
        ) : null
      }
    >
      <div className="rounded-xl border border-white/[0.06] bg-[linear-gradient(180deg,#232833_0%,#20242d_100%)] p-3">
        <div className="mb-3 flex items-center gap-3">
          <div className="grid h-10 w-10 place-items-center rounded-xl border border-white/[0.06] bg-white/[0.05] text-[#cfd6e1]">
            <Clapperboard size={19} strokeWidth={1.8} />
          </div>
          <div>
            <div className="text-[14px] font-semibold text-[#f3f5f7]">视频合成管线</div>
            <div className="text-[12px] text-[#7d8796]">预留 FFmpeg 合成服务</div>
          </div>
        </div>
        <div className="grid gap-1.5 text-[13px]">
          <div className="flex justify-between rounded-[10px] border border-white/[0.05] bg-black/[0.14] px-3 py-1.5 text-[#cfd6e1]"><span>视频片段</span><span>{videoCount} 个</span></div>
          <div className="flex justify-between rounded-[10px] border border-white/[0.05] bg-black/[0.14] px-3 py-1.5 text-[#cfd6e1]"><span>音频</span><span>{hasAudio ? "已连接" : "未连接"}</span></div>
          <div className="flex justify-between rounded-[10px] border border-white/[0.05] bg-black/[0.14] px-3 py-1.5 text-[#cfd6e1]"><span>字幕</span><span>{hasSubtitle ? "已连接" : "未连接"}</span></div>
        </div>
        <Button className="nodrag nopan mt-3 h-9 w-full" variant="primary" onClick={() => update(props.id, { status: "success", outputUrl: "/uploads/exports/mock-compose.json" })}>
          模拟合成
        </Button>
        {props.data.status === "success" && <div className="mt-2 text-[12px] text-emerald-300">输出状态：合成完成</div>}
      </div>
    </NodeShell>
  );
}

function statusText(status: ComposeNodeData["status"]) {
  return { idle: "未合成", composing: "合成中", success: "已完成", error: "失败" }[status];
}
