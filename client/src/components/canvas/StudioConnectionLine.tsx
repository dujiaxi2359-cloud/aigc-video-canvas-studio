import { memo } from "react";
import { getBezierPath, Position, type ConnectionLineComponentProps } from "reactflow";

function StudioConnectionLineComponent({ fromX, fromY, toX, toY }: ConnectionLineComponentProps) {
  const [path] = getBezierPath({
    sourceX: fromX,
    sourceY: fromY,
    sourcePosition: Position.Right,
    targetX: toX,
    targetY: toY,
    targetPosition: Position.Left,
    curvature: 0.36
  });

  return (
    <g className="studio-connection-line">
      <path className="studio-edge-glow" d={path} fill="none" />
      <path className="studio-edge-base" d={path} fill="none" />
      <path className="studio-edge-flow" d={path} fill="none" />
    </g>
  );
}

export const StudioConnectionLine = memo(StudioConnectionLineComponent);
