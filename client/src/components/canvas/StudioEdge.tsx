import { memo, useState } from "react";
import { BaseEdge, EdgeLabelRenderer, type EdgeProps } from "reactflow";
import { X } from "lucide-react";
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
  const showEdgeDetails = hovered || props.selected;

  return (
    <g className={`studio-edge ${stateClass}`} onMouseEnter={() => setHovered(true)} onMouseLeave={() => setHovered(false)}>
      {props.selected && <path className="studio-edge-glow" d={edgePath} fill="none" />}
      <BaseEdge id={props.id} path={edgePath} interactionWidth={18} style={{ stroke: "transparent" }} />
      <path className="studio-edge-base" d={edgePath} fill="none" />
      {showEdgeDetails && <path className="studio-edge-flow" d={edgePath} fill="none" />}
      <EdgeLabelRenderer>
        {showEdgeDetails && (
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
