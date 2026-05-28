import { useState } from "react";
import { BaseEdge, EdgeLabelRenderer, getSmoothStepPath, type EdgeProps } from "reactflow";
import { X } from "lucide-react";
import { useCanvasStore } from "../../store/canvasStore";

export function StudioEdge(props: EdgeProps) {
  const [hovered, setHovered] = useState(false);
  const deleteEdge = useCanvasStore((state) => state.deleteEdge);
  const [edgePath, labelX, labelY] = getSmoothStepPath({
    sourceX: props.sourceX,
    sourceY: props.sourceY,
    sourcePosition: props.sourcePosition,
    targetX: props.targetX,
    targetY: props.targetY,
    targetPosition: props.targetPosition,
    borderRadius: 18
  });

  const selectedStyle = props.selected
    ? {
        stroke: "#a5b4fc",
        strokeWidth: 3,
        filter: "drop-shadow(0 0 8px rgba(129,140,248,0.5))"
      }
    : {
        stroke: hovered ? "#7dd3fc" : "rgba(81,199,255,0.58)",
        strokeWidth: hovered ? 2.6 : 2,
        filter: hovered ? "drop-shadow(0 0 6px rgba(125,211,252,0.36))" : "drop-shadow(0 0 4px rgba(81,199,255,0.24))"
      };

  return (
    <g onMouseEnter={() => setHovered(true)} onMouseLeave={() => setHovered(false)}>
      <BaseEdge id={props.id} path={edgePath} style={selectedStyle} />
      <path d={edgePath} fill="none" stroke="transparent" strokeWidth={18} className="react-flow__edge-interaction" />
      <EdgeLabelRenderer>
        {(hovered || props.selected) && (
          <button
            type="button"
            className="nodrag nopan absolute grid h-6 w-6 place-items-center rounded-full border border-white/[0.12] bg-[#11141b]/95 text-white/70 shadow-[0_10px_24px_rgba(0,0,0,0.35)] backdrop-blur-xl transition hover:bg-red-500/90 hover:text-white"
            style={{ transform: `translate(-50%, -50%) translate(${labelX}px, ${labelY}px)`, pointerEvents: "all" }}
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
