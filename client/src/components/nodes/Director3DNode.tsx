import type { NodeProps } from "reactflow";
import { lazy, Suspense, useState } from "react";
import { Box, Camera, Image as ImageIcon, Layers3, Loader2, Maximize2, Sparkles } from "lucide-react";
import { BaseNodeCard } from "./BaseNodeCard";
import { Button } from "../common/Button";
import { useCanvasStore } from "../../store/canvasStore";
import type { Director3DNodeData } from "../../types/node";

const Director3DWorkspace = lazy(() => import("../director3d/Director3DWorkspace").then((module) => ({ default: module.Director3DWorkspace })));

function statusLabel(status?: Director3DNodeData["status"]) {
  if (status === "editing") return "编辑中";
  if (status === "screenshotting") return "截图中";
  if (status === "succeeded") return "已完成";
  if (status === "failed") return "失败";
  return "待编辑";
}

export function Director3DNode(props: NodeProps<Director3DNodeData>) {
  const updateNodeData = useCanvasStore((state) => state.updateNodeData);
  const [open, setOpen] = useState(false);
  const latest = props.data.screenshots?.[0];
  const preview = props.data.thumbnailUrl || props.data.outputUrl || latest?.imageUrl;

  return (
    <>
      <BaseNodeCard
        {...props}
        title={props.data.title || "3D 导演台"}
        badge="Director 3D"
        width={430}
        status={statusLabel(props.data.status)}
        inputHandles={1}
      >
        <div className="director-node-card">
          <div className="director-node-preview">
            {preview ? <img src={preview} alt="3D 导演台截图" /> : <div className="director-node-empty"><span><Layers3 size={36} /><Box size={28} /></span><strong>3D / 图层</strong></div>}
            <div className="director-node-orbit" />
          </div>
          <div className="director-node-copy">
            <div><Sparkles size={15} /> Moon 3D Director Stage</div>
            <p>{props.data.description || "在 3D 空间中搭建场景并进行多视角截图"}</p>
          </div>
          <div className="director-node-meta">
            <span><Camera size={13} /> {props.data.scene?.cameras.length ?? 1} 个机位</span>
            <span><ImageIcon size={13} /> {props.data.screenshots?.length ?? 0} 张截图</span>
          </div>
          {props.data.errorMessage && <div className="director-node-error">{props.data.errorMessage}</div>}
          <Button className="nodrag nopan mt-2 h-10 w-full rounded-full bg-cyan-300 text-slate-950 hover:bg-cyan-200" onClick={() => setOpen(true)}>
            <Maximize2 size={16} /> 打开导演台
          </Button>
        </div>
      </BaseNodeCard>
      {open && (
        <div className="director3d-overlay nodrag nopan">
          <Suspense fallback={<div className="director3d-loading"><Loader2 className="animate-spin" size={24} /> 正在打开 3D 导演台…</div>}>
            <Director3DWorkspace
              nodeId={props.id}
              data={props.data}
              onClose={() => setOpen(false)}
              onSave={(patch) => updateNodeData(props.id, patch as Record<string, unknown>)}
            />
          </Suspense>
        </div>
      )}
    </>
  );
}
