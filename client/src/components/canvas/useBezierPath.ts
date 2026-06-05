function clamp(value: number, min: number, max: number) {
  return Math.min(max, Math.max(min, value));
}

export function getStudioBezierPath({
  sourceX,
  sourceY,
  targetX,
  targetY
}: {
  sourceX: number;
  sourceY: number;
  targetX: number;
  targetY: number;
}) {
  const distanceX = targetX - sourceX;
  const distanceY = Math.abs(targetY - sourceY);
  const direction = distanceX >= 0 ? 1 : -1;
  const offset = clamp(Math.abs(distanceX) * 0.35 + distanceY * 0.08, 80, 260);
  const reverseLift = distanceX < 0 ? clamp(distanceY * 0.18, 28, 120) : 0;
  const controlSourceX = sourceX + offset * direction;
  const controlTargetX = targetX - offset * direction;
  const controlSourceY = sourceY + reverseLift;
  const controlTargetY = targetY - reverseLift;
  const edgePath = `M ${sourceX} ${sourceY} C ${controlSourceX} ${controlSourceY}, ${controlTargetX} ${controlTargetY}, ${targetX} ${targetY}`;
  const labelX = (sourceX + targetX + controlSourceX + controlTargetX) / 4;
  const labelY = (sourceY + targetY + controlSourceY + controlTargetY) / 4;

  return [edgePath, labelX, labelY] as const;
}
