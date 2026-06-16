import { memo, useState } from "react";
import { BaseEdge, EdgeLabelRenderer, type EdgeProps } from "reactflow";
import { Plus, X } from "lucide-react";
import { useCanvasStore } from "../../store/canvasStore";
import { getStudioBezierPath } from "./useBezierPath";

function StudioEdgeComponent(props: EdgeProps) {
  const [hovered, setHovered] = useState(false);
  const deleteEdge = useCanvasStore((state) => state.deleteEdge);
  const [edgePath, labelX, labelY] = getStudioBezierPath({
    sourceX: props.sourceX,
    sourceY: props.sourceY,
    targetX: props.targetX,
    targetY: props.targetY
  });
  const stateClass = props.selected ? "is-selected" : hovered ? "is-hovered" : "";

  return (
    <g className={`studio-edge ${stateClass}`} onMouseEnter={() => setHovered(true)} onMouseLeave={() => setHovered(false)}>
      <path className="studio-edge-glow" d={edgePath} fill="none" />
      <BaseEdge id={props.id} path={edgePath} interactionWidth={18} style={{ stroke: "transparent" }} />
      <path className="studio-edge-base" d={edgePath} fill="none" />
      <path className="studio-edge-flow" d={edgePath} fill="none" />
      <EdgeLabelRenderer>
        <button
          type="button"
          className="studio-edge-add nodrag nopan absolute grid h-7 w-7 place-items-center rounded-full border border-white/[0.22] bg-[#07080a]/82 text-white/78 shadow-[0_12px_30px_rgba(0,0,0,0.42),0_0_0_6px_rgba(255,255,255,0.035)] backdrop-blur-2xl transition duration-200 hover:border-white/70 hover:bg-[#1c1d20] hover:text-white"
          style={{ transform: `translate(-50%, -50%) translate(${labelX}px, ${labelY}px)`, pointerEvents: "all" }}
          onMouseEnter={() => setHovered(true)}
          onMouseLeave={() => setHovered(false)}
          onClick={(event) => {
            event.preventDefault();
            event.stopPropagation();
            window.dispatchEvent(new CustomEvent("studio:open-connection-menu", { detail: { sourceId: props.source, clientX: event.clientX, clientY: event.clientY } }));
          }}
          title="在这条线上继续添加节点"
        >
          <Plus size={16} />
        </button>
        {(hovered || props.selected) && (
          <button
            type="button"
            className="studio-edge-delete nodrag nopan absolute grid h-6 w-6 place-items-center rounded-full border border-white/[0.12] bg-[#10131a]/80 text-white/70 shadow-[0_10px_24px_rgba(0,0,0,0.35),inset_0_1px_0_rgba(255,255,255,0.05)] backdrop-blur-2xl transition duration-200 hover:border-red-300/30 hover:bg-red-500/18 hover:text-red-100"
            style={{ transform: `translate(-50%, -50%) translate(${labelX + 28}px, ${labelY - 22}px)`, pointerEvents: "all" }}
            onMouseEnter={() => setHovered(true)}
            onMouseLeave={() => setHovered(false)}
            onClick={(event) => {
              event.preventDefault();
              event.stopPropagation();
              deleteEdge(props.id);
            }}
          >
            <X size={12} />
          </button>
        )}
      </EdgeLabelRenderer>
    </g>
  );
}

export const StudioEdge = memo(StudioEdgeComponent);
