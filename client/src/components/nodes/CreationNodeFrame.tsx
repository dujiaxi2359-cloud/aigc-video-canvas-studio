import { memo, type ReactNode } from "react";
import { Handle, Position } from "reactflow";
import { Trash2 } from "lucide-react";
import { useCanvasStore } from "../../store/canvasStore";

function openCreateMenu(event: React.MouseEvent | React.PointerEvent, id: string, type?: string) {
  event.preventDefault();
  event.stopPropagation();
  window.dispatchEvent(new CustomEvent("studio:open-connection-menu", { detail: { sourceId: id, sourceType: type, clientX: event.clientX, clientY: event.clientY } }));
}

function previewWidth(ratio?: string) {
  const [width, height] = (ratio || "16:9").split(":").map(Number);
  const value = (width || 16) / (height || 9);
  if (value < 0.7) return 206;
  if (value < 1) return 258;
  if (value > 1.45) return 390;
  return 300;
}

function CreationNodeFrameComponent({ id, type, selected, title, ratio, status, preview, toolbar, dock }: {
  id: string;
  type?: string;
  selected?: boolean;
  title: string;
  ratio?: string;
  status?: string;
  preview: ReactNode;
  toolbar?: ReactNode;
  dock: ReactNode;
}) {
  const deleteNode = useCanvasStore((state) => state.deleteNode);
  const width = previewWidth(ratio);
  return (
    <div className={`creation-node ${selected ? "is-selected" : ""}`} style={{ width: 640 }}>
      <div className="creation-node-preview-wrap">
        {toolbar}
        <div className="creation-node-label node-floating-label drag-handle mb-2 flex cursor-grab items-center gap-1.5 active:cursor-grabbing"><span className="h-2.5 w-2.5 rounded-[3px] border border-white/20" />{title}</div>
        <div
          className="creation-preview-card drag-handle group"
          style={{ width, aspectRatio: (ratio || "16:9").replace(":", " / ") }}
          onPointerDown={(event) => {
            if ((event.target as HTMLElement).closest("button, input, textarea, select, .nodrag")) event.stopPropagation();
          }}
        >
          <Handle id="in-0" type="target" position={Position.Left} className="studio-handle studio-handle-in" />
          <Handle id="out" type="source" position={Position.Right} className="studio-handle studio-handle-out" onClick={(event) => openCreateMenu(event, id, type)} />
          <button type="button" title="删除节点" className="creation-node-delete nodrag nopan" onClick={() => deleteNode(id)}><Trash2 size={13} /></button>
          {preview}
          {status && <span className={`creation-preview-status is-${status}`}>{status === "generating" ? "生成中" : status === "success" ? "已完成" : status === "error" ? "失败" : "未生成"}</span>}
        </div>
      </div>
      <div
        className="creation-dock drag-handle"
        onPointerDown={(event) => {
          if ((event.target as HTMLElement).closest("button, input, textarea, select, .nodrag")) event.stopPropagation();
        }}
      >
        {dock}
      </div>
    </div>
  );
}

export const CreationNodeFrame = memo(CreationNodeFrameComponent);
