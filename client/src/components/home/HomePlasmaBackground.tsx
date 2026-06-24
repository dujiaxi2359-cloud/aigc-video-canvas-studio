import { useEffect, useRef } from "react";
import { Mesh, Program, Renderer, Triangle } from "ogl";

type PlasmaDirection = "forward" | "reverse" | "pingpong";

type HomePlasmaBackgroundProps = {
  className?: string;
  color?: string;
  speed?: number;
  direction?: PlasmaDirection;
  scale?: number;
  opacity?: number;
  mouseInteractive?: boolean;
};

function hexToRgb(hex: string) {
  const result = /^#?([a-f\d]{2})([a-f\d]{2})([a-f\d]{2})$/i.exec(hex);
  if (!result) return [1, 0.82, 0.42];
  return [
    Number.parseInt(result[1], 16) / 255,
    Number.parseInt(result[2], 16) / 255,
    Number.parseInt(result[3], 16) / 255
  ];
}

const vertex = `#version 300 es
precision highp float;
in vec2 position;
in vec2 uv;
out vec2 vUv;
void main() {
  vUv = uv;
  gl_Position = vec4(position, 0.0, 1.0);
}
`;

const fragment = `#version 300 es
precision highp float;
uniform vec2 iResolution;
uniform float iTime;
uniform vec3 uCustomColor;
uniform float uUseCustomColor;
uniform float uSpeed;
uniform float uDirection;
uniform float uScale;
uniform float uOpacity;
uniform vec2 uMouse;
uniform float uMouseInteractive;
out vec4 fragColor;

void mainImage(out vec4 o, vec2 C) {
  vec2 center = iResolution.xy * 0.5;
  C = (C - center) / uScale + center;

  vec2 mouseOffset = (uMouse - center) * 0.0002;
  C += mouseOffset * length(C - center) * step(0.5, uMouseInteractive);

  float i, d, z, T = iTime * uSpeed * uDirection;
  vec3 O, p, S;

  for (vec2 r = iResolution.xy, Q; ++i < 60.; O += o.w / d * o.xyz) {
    p = z * normalize(vec3(C - .5 * r, r.y));
    p.z -= 4.;
    S = p;
    d = p.y - T;

    p.x += .4 * (1. + p.y) * sin(d + p.x * 0.1) * cos(.34 * d + p.x * 0.05);
    Q = p.xz *= mat2(cos(p.y + vec4(0, 11, 33, 0) - T));
    z += d = abs(sqrt(length(Q * Q)) - .25 * (5. + S.y)) / 3. + 8e-4;
    o = 1. + sin(S.y + p.z * .5 + S.z - length(S - p) + vec4(2, 1, 0, 8));
  }

  o.xyz = tanh(O / 1e4);
}

bool finite1(float x) { return !(isnan(x) || isinf(x)); }
vec3 sanitize(vec3 c) {
  return vec3(
    finite1(c.r) ? c.r : 0.0,
    finite1(c.g) ? c.g : 0.0,
    finite1(c.b) ? c.b : 0.0
  );
}

void main() {
  vec4 o = vec4(0.0);
  mainImage(o, gl_FragCoord.xy);
  vec3 rgb = sanitize(o.rgb);

  float intensity = (rgb.r + rgb.g + rgb.b) / 3.0;
  vec3 customColor = intensity * uCustomColor;
  vec3 finalColor = mix(rgb, customColor, step(0.5, uUseCustomColor));

  float alpha = clamp(length(finalColor) * uOpacity, 0.0, 1.0);
  fragColor = vec4(finalColor, alpha);
}`;

export function HomePlasmaBackground({
  className = "",
  color = "#8b5cf6",
  speed = 0.72,
  direction = "pingpong",
  scale = 0.86,
  opacity = 2.1,
  mouseInteractive = true
}: HomePlasmaBackgroundProps) {
  const containerRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const container = containerRef.current;
    if (!container) return;

    const reducedMotion = window.matchMedia("(prefers-reduced-motion: reduce)").matches;
    const useCustomColor = color ? 1 : 0;
    const customColor = color ? hexToRgb(color) : [1, 1, 1];
    const directionMultiplier = direction === "reverse" ? -1 : 1;
    let renderer: Renderer | undefined;

    try {
      renderer = new Renderer({
        webgl: 2,
        alpha: true,
        antialias: false,
        dpr: Math.min(window.devicePixelRatio || 1, 1.35),
        powerPreference: "high-performance"
      });
    } catch {
      return;
    }

    const gl = renderer.gl;
    const canvas = gl.canvas;
    canvas.className = "home-plasma-canvas";
    canvas.style.display = "block";
    canvas.style.width = "100%";
    canvas.style.height = "100%";
    container.appendChild(canvas);

    const geometry = new Triangle(gl);
    const program = new Program(gl, {
      vertex,
      fragment,
      uniforms: {
        iTime: { value: 0 },
        iResolution: { value: new Float32Array([1, 1]) },
        uCustomColor: { value: new Float32Array(customColor) },
        uUseCustomColor: { value: useCustomColor },
        uSpeed: { value: reducedMotion ? 0 : speed * 0.4 },
        uDirection: { value: directionMultiplier },
        uScale: { value: scale },
        uOpacity: { value: opacity },
        uMouse: { value: new Float32Array([0, 0]) },
        uMouseInteractive: { value: mouseInteractive && !reducedMotion ? 1 : 0 }
      }
    });
    const mesh = new Mesh(gl, { geometry, program });

    const setSize = () => {
      const rect = container.getBoundingClientRect();
      renderer?.setSize(Math.max(1, Math.floor(rect.width)), Math.max(1, Math.floor(rect.height)));
      const resolution = program.uniforms.iResolution.value as Float32Array;
      resolution[0] = gl.drawingBufferWidth;
      resolution[1] = gl.drawingBufferHeight;
    };

    const handlePointerMove = (event: PointerEvent) => {
      if (!mouseInteractive || reducedMotion) return;
      const rect = container.getBoundingClientRect();
      const mouse = program.uniforms.uMouse.value as Float32Array;
      mouse[0] = event.clientX - rect.left;
      mouse[1] = event.clientY - rect.top;
    };

    const observer = new ResizeObserver(setSize);
    observer.observe(container);
    setSize();
    window.addEventListener("pointermove", handlePointerMove, { passive: true });

    let raf = 0;
    let visible = document.visibilityState === "visible";
    let inView = true;
    let contextLost = false;
    const start = performance.now();

    const render = (now: number) => {
      if (visible && inView && !contextLost) {
        const time = (now - start) * 0.001;
        if (direction === "pingpong") {
          const duration = 10;
          const segment = time % duration;
          const isForward = Math.floor(time / duration) % 2 === 0;
          const unit = segment / duration;
          const smooth = unit * unit * (3 - 2 * unit);
          program.uniforms.uDirection.value = 1;
          program.uniforms.iTime.value = isForward ? smooth * duration : (1 - smooth) * duration;
        } else {
          program.uniforms.iTime.value = time;
        }
        renderer?.render({ scene: mesh });
      }
      raf = window.requestAnimationFrame(render);
    };

    const onVisibilityChange = () => {
      visible = document.visibilityState === "visible";
    };
    const onContextLost = (event: Event) => {
      event.preventDefault();
      contextLost = true;
      window.cancelAnimationFrame(raf);
    };
    const onContextRestored = () => {
      contextLost = false;
      raf = window.requestAnimationFrame(render);
    };
    const intersectionObserver = new IntersectionObserver(([entry]) => {
      inView = entry?.isIntersecting ?? true;
    });

    document.addEventListener("visibilitychange", onVisibilityChange);
    canvas.addEventListener("webglcontextlost", onContextLost);
    canvas.addEventListener("webglcontextrestored", onContextRestored);
    intersectionObserver.observe(container);
    raf = window.requestAnimationFrame(render);

    return () => {
      window.cancelAnimationFrame(raf);
      observer.disconnect();
      intersectionObserver.disconnect();
      window.removeEventListener("pointermove", handlePointerMove);
      document.removeEventListener("visibilitychange", onVisibilityChange);
      canvas.removeEventListener("webglcontextlost", onContextLost);
      canvas.removeEventListener("webglcontextrestored", onContextRestored);
      if (canvas.parentElement === container) container.removeChild(canvas);
      geometry.remove();
      program.remove();
      gl.getExtension("WEBGL_lose_context")?.loseContext();
    };
  }, [color, direction, mouseInteractive, opacity, scale, speed]);

  return <div ref={containerRef} className={`home-plasma-background ${className}`} aria-hidden="true" />;
}
