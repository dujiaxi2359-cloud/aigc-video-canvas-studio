import { useCallback, useEffect, useMemo, useRef } from "react";
import { gsap } from "gsap";
import { InertiaPlugin } from "gsap/InertiaPlugin";

gsap.registerPlugin(InertiaPlugin);

type Dot = {
  cx: number;
  cy: number;
  xOffset: number;
  yOffset: number;
  moving: boolean;
};

type DotGridBackgroundProps = {
  dotSize?: number;
  gap?: number;
  baseColor?: string;
  activeColor?: string;
  proximity?: number;
  speedTrigger?: number;
  shockRadius?: number;
  shockStrength?: number;
  maxSpeed?: number;
  resistance?: number;
  returnDuration?: number;
};

function hexToRgb(hex: string) {
  const match = hex.match(/^#?([a-f\d]{2})([a-f\d]{2})([a-f\d]{2})$/i);
  if (!match) return { r: 0, g: 0, b: 0 };
  return {
    r: Number.parseInt(match[1], 16),
    g: Number.parseInt(match[2], 16),
    b: Number.parseInt(match[3], 16)
  };
}

export function DotGridBackground({
  dotSize = 2.4,
  gap = 24,
  baseColor = "#1b2427",
  activeColor = "#d6bb62",
  proximity = 145,
  speedTrigger = 720,
  shockRadius = 190,
  shockStrength = 1.8,
  maxSpeed = 4200,
  resistance = 900,
  returnDuration = 0.85
}: DotGridBackgroundProps) {
  const wrapperRef = useRef<HTMLDivElement>(null);
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const dotsRef = useRef<Dot[]>([]);
  const requestDrawRef = useRef<() => void>(() => undefined);
  const pointerRef = useRef({ x: -1000, y: -1000, lastX: 0, lastY: 0, lastTime: 0 });
  const baseRgb = useMemo(() => hexToRgb(baseColor), [baseColor]);
  const activeRgb = useMemo(() => hexToRgb(activeColor), [activeColor]);

  const buildGrid = useCallback(() => {
    const wrapper = wrapperRef.current;
    const canvas = canvasRef.current;
    if (!wrapper || !canvas) return;

    const { width, height } = wrapper.getBoundingClientRect();
    const dpr = 1;
    canvas.width = Math.max(1, Math.floor(width * dpr));
    canvas.height = Math.max(1, Math.floor(height * dpr));
    canvas.style.width = `${width}px`;
    canvas.style.height = `${height}px`;

    const cell = dotSize + gap;
    const cols = Math.floor((width + gap) / cell);
    const rows = Math.floor((height + gap) / cell);
    const gridWidth = cell * cols - gap;
    const gridHeight = cell * rows - gap;
    const startX = (width - gridWidth) / 2 + dotSize / 2;
    const startY = (height - gridHeight) / 2 + dotSize / 2;
    const dots: Dot[] = [];

    for (let row = 0; row < rows; row += 1) {
      for (let column = 0; column < cols; column += 1) {
        dots.push({
          cx: startX + column * cell,
          cy: startY + row * cell,
          xOffset: 0,
          yOffset: 0,
          moving: false
        });
      }
    }
    dotsRef.current = dots;
    requestDrawRef.current();
  }, [dotSize, gap]);

  useEffect(() => {
    buildGrid();
    const observer = new ResizeObserver(buildGrid);
    if (wrapperRef.current) observer.observe(wrapperRef.current);
    return () => observer.disconnect();
  }, [buildGrid]);

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const context = canvas.getContext("2d");
    if (!context) return;

    const dpr = 1;
    const proximitySquared = proximity * proximity;
    let frame = 0;
    let isVisible = true;

    const palette = Array.from({ length: 8 }, (_, index) => {
      const strength = index / 7;
      const red = Math.round(baseRgb.r + (activeRgb.r - baseRgb.r) * strength);
      const green = Math.round(baseRgb.g + (activeRgb.g - baseRgb.g) * strength);
      const blue = Math.round(baseRgb.b + (activeRgb.b - baseRgb.b) * strength);
      return `rgb(${red}, ${green}, ${blue})`;
    });

    const draw = () => {
      frame = 0;
      if (!isVisible || document.visibilityState !== "visible") return;
      context.setTransform(dpr, 0, 0, dpr, 0, 0);
      context.clearRect(0, 0, canvas.width / dpr, canvas.height / dpr);
      const pointer = pointerRef.current;
      const supportsPath2D = typeof Path2D !== "undefined";
      const paths = supportsPath2D ? Array.from({ length: palette.length }, () => new Path2D()) : null;

      for (const dot of dotsRef.current) {
        const dx = dot.cx - pointer.x;
        const dy = dot.cy - pointer.y;
        const distanceSquared = dx * dx + dy * dy;
        let bucket = 0;
        if (distanceSquared <= proximitySquared) {
          const strength = 1 - Math.sqrt(distanceSquared) / proximity;
          bucket = Math.min(palette.length - 1, Math.max(1, Math.round(strength * (palette.length - 1))));
        }
        const x = dot.cx + dot.xOffset;
        const y = dot.cy + dot.yOffset;
        if (paths) {
          paths[bucket].moveTo(x + dotSize / 2, y);
          paths[bucket].arc(x, y, dotSize / 2, 0, Math.PI * 2);
        } else {
          context.beginPath();
          context.fillStyle = palette[bucket];
          context.arc(x, y, dotSize / 2, 0, Math.PI * 2);
          context.fill();
        }
      }
      paths?.forEach((path, index) => {
        context.fillStyle = palette[index];
        context.fill(path);
      });
    };

    const requestDraw = () => {
      if (frame || !isVisible) return;
      frame = window.requestAnimationFrame(draw);
    };
    requestDrawRef.current = requestDraw;
    const observer = new IntersectionObserver(([entry]) => {
      isVisible = entry?.isIntersecting ?? false;
      if (isVisible) requestDraw();
    });
    const visibility = () => { if (document.visibilityState === "visible") requestDraw(); };
    if (wrapperRef.current) observer.observe(wrapperRef.current);
    document.addEventListener("visibilitychange", visibility);
    requestDraw();
    return () => {
      window.cancelAnimationFrame(frame);
      observer.disconnect();
      document.removeEventListener("visibilitychange", visibility);
      requestDrawRef.current = () => undefined;
    };
  }, [activeRgb, baseColor, baseRgb, dotSize, proximity]);

  useEffect(() => {
    if (window.matchMedia("(prefers-reduced-motion: reduce)").matches) return;
    const wrapper = wrapperRef.current;
    if (!wrapper) return;

    let lastMove = 0;
    const move = (event: PointerEvent) => {
      const now = performance.now();
      if (now - lastMove < 40) return;
      lastMove = now;

      const rect = wrapper.getBoundingClientRect();
      const pointer = pointerRef.current;
      const elapsed = pointer.lastTime ? Math.max(now - pointer.lastTime, 16) : 16;
      const deltaX = event.clientX - pointer.lastX;
      const deltaY = event.clientY - pointer.lastY;
      let velocityX = (deltaX / elapsed) * 1000;
      let velocityY = (deltaY / elapsed) * 1000;
      const speed = Math.hypot(velocityX, velocityY);

      if (speed > maxSpeed) {
        const scale = maxSpeed / speed;
        velocityX *= scale;
        velocityY *= scale;
      }

      pointer.x = event.clientX - rect.left;
      pointer.y = event.clientY - rect.top;
      pointer.lastX = event.clientX;
      pointer.lastY = event.clientY;
      pointer.lastTime = now;
      requestDrawRef.current();

      if (speed <= speedTrigger) return;
      for (const dot of dotsRef.current) {
        const distance = Math.hypot(dot.cx - pointer.x, dot.cy - pointer.y);
        if (distance >= proximity || dot.moving) continue;
        dot.moving = true;
        gsap.killTweensOf(dot);
        gsap.to(dot, {
          inertia: {
            xOffset: dot.cx - pointer.x + velocityX * 0.004,
            yOffset: dot.cy - pointer.y + velocityY * 0.004,
            resistance
          },
          onUpdate: () => requestDrawRef.current(),
          onComplete: () => {
            gsap.to(dot, {
              xOffset: 0,
              yOffset: 0,
              duration: returnDuration,
              ease: "power4.out",
              onUpdate: () => requestDrawRef.current(),
              onComplete: () => {
                dot.moving = false;
                requestDrawRef.current();
              }
            });
          }
        });
      }
    };

    const click = (event: MouseEvent) => {
      const target = event.target as HTMLElement | null;
      if (!target?.closest(".react-flow__pane")) return;
      const rect = wrapper.getBoundingClientRect();
      const clickX = event.clientX - rect.left;
      const clickY = event.clientY - rect.top;

      for (const dot of dotsRef.current) {
        const distance = Math.hypot(dot.cx - clickX, dot.cy - clickY);
        if (distance >= shockRadius || dot.moving) continue;
        const falloff = Math.max(0, 1 - distance / shockRadius);
        dot.moving = true;
        gsap.killTweensOf(dot);
        gsap.to(dot, {
          inertia: {
            xOffset: (dot.cx - clickX) * shockStrength * falloff,
            yOffset: (dot.cy - clickY) * shockStrength * falloff,
            resistance
          },
          onUpdate: () => requestDrawRef.current(),
          onComplete: () => {
            gsap.to(dot, {
              xOffset: 0,
              yOffset: 0,
              duration: returnDuration,
              ease: "power4.out",
              onUpdate: () => requestDrawRef.current(),
              onComplete: () => {
                dot.moving = false;
                requestDrawRef.current();
              }
            });
          }
        });
      }
    };

    window.addEventListener("pointermove", move, { passive: true });
    window.addEventListener("click", click);
    return () => {
      window.removeEventListener("pointermove", move);
      window.removeEventListener("click", click);
      gsap.killTweensOf(dotsRef.current);
    };
  }, [maxSpeed, proximity, resistance, returnDuration, shockRadius, shockStrength, speedTrigger]);

  return (
    <div className="canvas-dot-grid" ref={wrapperRef} aria-hidden="true">
      <canvas ref={canvasRef} />
    </div>
  );
}
