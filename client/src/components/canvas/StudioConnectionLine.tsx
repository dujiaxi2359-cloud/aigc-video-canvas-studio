import type { ConnectionLineComponentProps } from "reactflow";
import { getStudioBezierPath } from "./useBezierPath";

export function StudioConnectionLine({ fromX, fromY, toX, toY }: ConnectionLineComponentProps) {
  const [path] = getStudioBezierPath({
    sourceX: fromX,
    sourceY: fromY,
    targetX: toX,
    targetY: toY
  });

  return (
    <g className="studio-connection-line">
      <path className="studio-edge-glow" d={path} fill="none" />
      <path className="studio-edge-base" d={path} fill="none" />
      <path className="studio-edge-flow" d={path} fill="none" />
    </g>
  );
}
