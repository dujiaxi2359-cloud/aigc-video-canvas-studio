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

  return (
    <div
      style={{ width }}
      className={`group relative overflow-visible rounded-2xl border bg-[#151922]/[0.94] text-[#f3f5f7] shadow-[0_16px_36px_rgba(0,0,0,0.32)] transition duration-150 hover:border-white/[0.12] ${
        selected
          ? "border-[#7c6cf6]/[0.66] shadow-[0_0_0_1px_rgba(124,108,246,0.18),0_18px_38px_rgba(0,0,0,0.38)]"
          : "border-white/[0.08]"
      }`}
    >
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

      <div className="node-drag-handle flex h-[42px] cursor-grab items-center justify-between border-b border-white/[0.05] px-3 active:cursor-grabbing">
        <div className="flex min-w-0 items-center gap-2">
          <div className="truncate text-[14px] font-semibold text-[#f3f5f7]">{title}</div>
          <Badge>{badge}</Badge>
        </div>
        <div className="nodrag nopan flex items-center gap-2">
          {status && <span className="rounded-full border border-white/[0.06] bg-white/[0.04] px-2 py-0.5 text-[11px] text-[#8b95a5]">{status}</span>}
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

