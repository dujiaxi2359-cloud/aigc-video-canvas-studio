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
  if (value < 0.7) return 270;
  if (value < 1) return 340;
  if (value > 1.45) return 520;
  return 390;
}

function frameWidth(type: string | undefined, cardWidth: number, hasDock: boolean) {
  if (type === "imageGenerate") return Math.max(cardWidth, hasDock ? 640 : cardWidth);
  if (type === "image" || type === "imageAsset") return cardWidth;
  return Math.max(cardWidth, hasDock ? 640 : 520);
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
  dock?: ReactNode;
}) {
  const deleteNode = useCanvasStore((state) => state.deleteNode);
  const edges = useCanvasStore((state) => state.edges);
  const width = previewWidth(ratio);
  const containerWidth = frameWidth(type, width, Boolean(dock));
  const acceptsInput = !["image", "imageAsset", "audio", "text"].includes(type ?? "");
  const hasIncomingConnection = edges.some((edge) => edge.target === id);
  const hasOutgoingConnection = edges.some((edge) => edge.source === id);
  return (
    <div className={`creation-node ${selected ? "is-selected" : ""}`} data-node-type={type} style={{ width: containerWidth }}>
      <div className="creation-node-preview-wrap">
        <div className="creation-node-label node-floating-label drag-handle mb-2 flex cursor-grab items-center gap-1.5 active:cursor-grabbing"><span className="h-2.5 w-2.5 rounded-[3px] border border-white/20" />{title}</div>
        <div
          className="creation-preview-card drag-handle group"
          style={{ width, aspectRatio: (ratio || "16:9").replace(":", " / ") }}
          onPointerDown={(event) => {
            if ((event.target as HTMLElement).closest("button, input, textarea, select, .nodrag")) event.stopPropagation();
          }}
        >
          {acceptsInput && <Handle id="in-0" type="target" position={Position.Left} className={`studio-handle studio-handle-in ${hasIncomingConnection ? "is-connected" : ""}`} />}
          <Handle id="out" type="source" position={Position.Right} className={`studio-handle studio-handle-out ${hasOutgoingConnection ? "is-connected" : ""}`} onClick={(event) => openCreateMenu(event, id, type)} />
          {toolbar}
          <button type="button" title="删除节点" className="creation-node-delete nodrag nopan" onClick={() => deleteNode(id)}><Trash2 size={13} /></button>
          {preview}
          {status && <span className={`creation-preview-status is-${status}`}>{status === "generating" ? "生成中" : status === "success" ? "已完成" : status === "error" ? "失败" : "未生成"}</span>}
        </div>
      </div>
      {dock && (
        <div
          className="creation-dock drag-handle"
          onPointerDown={(event) => {
            if ((event.target as HTMLElement).closest("button, input, textarea, select, .nodrag")) event.stopPropagation();
          }}
        >
          {dock}
        </div>
      )}
    </div>
  );
}

export const CreationNodeFrame = memo(CreationNodeFrameComponent);
