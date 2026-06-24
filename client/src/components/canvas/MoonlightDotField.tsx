import { memo, useEffect, useRef } from "react";

const TWO_PI = Math.PI * 2;

type Dot = {
  ax: number;
  ay: number;
  sx: number;
  sy: number;
};

type Props = {
  dotRadius?: number;
  dotSpacing?: number;
  cursorRadius?: number;
  bulgeStrength?: number;
  glowRadius?: number;
  gradientFrom?: string;
  gradientTo?: string;
  glowColor?: string;
};

export const MoonlightDotField = memo(function MoonlightDotField({
  dotRadius = 1.95,
  dotSpacing = 14,
  cursorRadius = 480,
  bulgeStrength = 54,
  glowRadius = 170,
  gradientFrom = "rgba(139, 92, 246, 0.38)",
  gradientTo = "rgba(78, 70, 58, 0.36)",
  glowColor = "rgba(255, 255, 255, 0.88)"
}: Props) {
  const wrapperRef = useRef<HTMLDivElement>(null);
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const glowRef = useRef<SVGCircleElement>(null);
  const dotsRef = useRef<Dot[]>([]);
  const mouseRef = useRef({ x: -9999, y: -9999, prevX: -9999, prevY: -9999, speed: 0 });
  const frameRef = useRef<number>();
  const sizeRef = useRef({ w: 0, h: 0, left: 0, top: 0 });
  const engagementRef = useRef(0);
  const glowOpacityRef = useRef(0);
  const glowIdRef = useRef(`moonlight-dot-glow-${Math.random().toString(36).slice(2, 9)}`);

  useEffect(() => {
    const wrapper = wrapperRef.current;
    const canvas = canvasRef.current;
    if (!wrapper || !canvas) return;
    const context = canvas.getContext("2d", { alpha: true });
    if (!context) return;
    const host = wrapper;
    const surface = canvas;
    const ctx = context;

    const reducedMotion = window.matchMedia("(prefers-reduced-motion: reduce)").matches;
    const dpr = Math.min(window.devicePixelRatio || 1, 1.5);
    let resizeTimer = 0;
    let speedTimer = 0;

    function buildDots(width: number, height: number) {
      const step = dotRadius + dotSpacing;
      const cols = Math.floor(width / step);
      const rows = Math.floor(height / step);
      const padX = (width % step) / 2;
      const padY = (height % step) / 2;
      const dots: Dot[] = [];

      for (let row = 0; row < rows; row += 1) {
        for (let col = 0; col < cols; col += 1) {
          const ax = padX + col * step + step / 2;
          const ay = padY + row * step + step / 2;
          dots.push({ ax, ay, sx: ax, sy: ay });
        }
      }
      dotsRef.current = dots;
    }

    function resizeNow() {
      const rect = host.getBoundingClientRect();
      const width = Math.max(1, rect.width);
      const height = Math.max(1, rect.height);
      surface.width = Math.floor(width * dpr);
      surface.height = Math.floor(height * dpr);
      surface.style.width = `${width}px`;
      surface.style.height = `${height}px`;
      ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
      sizeRef.current = { w: width, h: height, left: rect.left + window.scrollX, top: rect.top + window.scrollY };
      buildDots(width, height);
    }

    function resize() {
      window.clearTimeout(resizeTimer);
      resizeTimer = window.setTimeout(resizeNow, 100);
    }

    function updateMouseSpeed() {
      const mouse = mouseRef.current;
      const dx = mouse.prevX - mouse.x;
      const dy = mouse.prevY - mouse.y;
      const distance = Math.hypot(dx, dy);
      mouse.speed += (distance - mouse.speed) * 0.48;
      if (mouse.speed < 0.001) mouse.speed = 0;
      mouse.prevX = mouse.x;
      mouse.prevY = mouse.y;
    }

    function onPointerMove(event: PointerEvent) {
      const size = sizeRef.current;
      mouseRef.current.x = event.pageX - size.left;
      mouseRef.current.y = event.pageY - size.top;
    }

    function draw() {
      const { w, h } = sizeRef.current;
      const mouse = mouseRef.current;
      const targetEngagement = reducedMotion ? 0 : Math.min(mouse.speed / 5, 1);
      engagementRef.current += (targetEngagement - engagementRef.current) * 0.06;
      if (engagementRef.current < 0.001) engagementRef.current = 0;

      const engagement = engagementRef.current;
      glowOpacityRef.current += (engagement - glowOpacityRef.current) * 0.08;
      if (glowRef.current) {
        glowRef.current.setAttribute("cx", String(mouse.x));
        glowRef.current.setAttribute("cy", String(mouse.y));
        glowRef.current.style.opacity = String(glowOpacityRef.current * 0.38);
      }

      ctx.clearRect(0, 0, w, h);
      const gradient = ctx.createLinearGradient(0, 0, w, h);
      gradient.addColorStop(0, gradientFrom);
      gradient.addColorStop(1, gradientTo);
      ctx.fillStyle = gradient;

      const radius = dotRadius / 2;
      const cursorRadiusSquared = cursorRadius * cursorRadius;
      ctx.beginPath();
      for (const dot of dotsRef.current) {
        const dx = mouse.x - dot.ax;
        const dy = mouse.y - dot.ay;
        const distanceSquared = dx * dx + dy * dy;

        if (distanceSquared < cursorRadiusSquared && engagement > 0.01) {
          const distance = Math.sqrt(distanceSquared);
          const falloff = 1 - distance / cursorRadius;
          const push = falloff * falloff * bulgeStrength * engagement;
          const angle = Math.atan2(dy, dx);
          dot.sx += (dot.ax - Math.cos(angle) * push - dot.sx) * 0.15;
          dot.sy += (dot.ay - Math.sin(angle) * push - dot.sy) * 0.15;
        } else {
          dot.sx += (dot.ax - dot.sx) * 0.1;
          dot.sy += (dot.ay - dot.sy) * 0.1;
        }

        ctx.moveTo(dot.sx + radius, dot.sy);
        ctx.arc(dot.sx, dot.sy, radius, 0, TWO_PI);
      }
      ctx.fill();
      frameRef.current = window.requestAnimationFrame(draw);
    }

    resizeNow();
    speedTimer = window.setInterval(updateMouseSpeed, 20);
    window.addEventListener("resize", resize);
    window.addEventListener("pointermove", onPointerMove, { passive: true });
    frameRef.current = window.requestAnimationFrame(draw);

    return () => {
      if (frameRef.current) window.cancelAnimationFrame(frameRef.current);
      window.clearInterval(speedTimer);
      window.clearTimeout(resizeTimer);
      window.removeEventListener("resize", resize);
      window.removeEventListener("pointermove", onPointerMove);
    };
  }, [bulgeStrength, cursorRadius, dotRadius, dotSpacing, glowColor, gradientFrom, gradientTo]);

  return (
    <div className="canvas-moonlight-dot-field" ref={wrapperRef} aria-hidden="true">
      <canvas ref={canvasRef} />
      <svg>
        <defs>
          <radialGradient id={glowIdRef.current}>
            <stop offset="0%" stopColor={glowColor} />
            <stop offset="100%" stopColor="transparent" />
          </radialGradient>
        </defs>
        <circle ref={glowRef} cx="-9999" cy="-9999" r={glowRadius} fill={`url(#${glowIdRef.current})`} />
      </svg>
    </div>
  );
});
