import { Handle, Position, type NodeProps } from "reactflow";
import { Trash2 } from "lucide-react";
import { Badge } from "../common/Badge";
import { Button } from "../common/Button";
import { useCanvasStore } from "../../store/canvasStore";

type BaseNodeCardProps = NodeProps & {
  title: string;
  badge: string;
  width?: number;
  status?: string;
  children: React.ReactNode;
  footer?: React.ReactNode;
  headerActions?: React.ReactNode;
  inputHandles?: number;
  outputHandle?: boolean;
};

function openCreateMenu(event: React.MouseEvent | React.PointerEvent, id: string, type?: string) {
  event.preventDefault();
  event.stopPropagation();
  window.dispatchEvent(
    new CustomEvent("studio:open-connection-menu", {
      detail: {
        sourceId: id,
        sourceType: type,
        clientX: event.clientX,
        clientY: event.clientY
      }
    })
  );
}

function statusTone(status?: string) {
  if (!status) return "idle";
  if (/生成中|合成中|运行|处理中|loading/i.test(status)) return "running";
  if (/完成|成功|已完成|success/i.test(status)) return "success";
  if (/失败|错误|error/i.test(status)) return "error";
  return "idle";
}

export function BaseNodeCard({
  id,
  type,
  selected,
  title,
  badge,
  width = 320,
  status,
  children,
  footer,
  headerActions,
  inputHandles = 1,
  outputHandle = true
}: BaseNodeCardProps) {
  const deleteNode = useCanvasStore((state) => state.deleteNode);
  const inputPositions = Array.from({ length: inputHandles }, (_, index) => `${((index + 1) / (inputHandles + 1)) * 100}%`);
  const tone = statusTone(status);

  return (
    <div
      style={{ width }}
      className={`studio-node-card group relative overflow-visible text-[#f3f5f7] transition duration-200 ${selected ? "is-selected" : ""} ${tone === "running" ? "is-running" : ""}`}
    >
      <div className="pointer-events-none absolute inset-0 rounded-[22px] opacity-0 transition duration-200 group-hover:opacity-100">
        <div className="absolute inset-x-8 -top-px h-px bg-[linear-gradient(90deg,transparent,rgba(125,211,252,0.34),transparent)]" />
      </div>
      {inputPositions.map((top, index) => (
        <Handle
          key={index}
          id={`in-${index}`}
          type="target"
          position={Position.Left}
          style={{ top }}
          className="studio-handle studio-handle-in"
        />
      ))}

      {outputHandle && (
        <Handle
          id="out"
          type="source"
          position={Position.Right}
          className="studio-handle studio-handle-out"
          onClick={(event) => openCreateMenu(event, id, type)}
        />
      )}

      <div className="node-drag-handle flex h-[42px] cursor-grab items-center justify-between border-b border-white/[0.055] px-3 active:cursor-grabbing">
        <div className="flex min-w-0 items-center gap-2">
          <div className="truncate text-[14px] font-semibold text-[#f3f5f7]">{title}</div>
          <Badge>{badge}</Badge>
        </div>
        <div className="nodrag nopan flex items-center gap-2">
          {status && <span className={`studio-status-badge is-${tone}`}>{status}</span>}
          {headerActions}
          <Button variant="ghost" className="nodrag nopan h-7 w-7 px-0 text-[#8b95a5]" onClick={() => deleteNode(id)} title="删除节点">
            <Trash2 size={14} strokeWidth={1.8} />
          </Button>
        </div>
      </div>

      <div className="p-3">{children}</div>
      {footer && <div className="border-t border-white/[0.05] px-3 py-2.5">{footer}</div>}
    </div>
  );
}

export const NodeShell = BaseNodeCard;
