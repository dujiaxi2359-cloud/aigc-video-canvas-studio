import { useEffect, useRef } from "react";
import { Mesh, Program, Renderer, Triangle } from "ogl";

type FerrofluidBackgroundProps = {
  className?: string;
  colors?: readonly string[];
  speed?: number;
  scale?: number;
  turbulence?: number;
  glow?: number;
  opacity?: number;
};

const MAX_COLORS = 8;
const DEFAULT_COLORS = ["#f4f0e8", "#f0b75d", "#7c5cff", "#20b8d7"];

function getPerformanceProfile() {
  const nav = navigator as Navigator & { deviceMemory?: number };
  const isWindows = /Windows/i.test(navigator.userAgent);
  const isMobile = window.matchMedia("(max-width: 900px), (max-height: 720px)").matches;
  const reducedMotion = window.matchMedia("(prefers-reduced-motion: reduce)").matches;
  const cores = navigator.hardwareConcurrency || 8;
  const memory = nav.deviceMemory || 8;
  const lowPower = reducedMotion || isMobile || isWindows || cores <= 6 || memory <= 4;
  const veryLarge = window.innerWidth >= 1800 || window.innerHeight >= 1000;

  return {
    frameInterval: reducedMotion ? 1000 : lowPower ? 1000 / 24 : 1000 / 30,
    renderScale: reducedMotion ? 0.4 : lowPower ? 0.56 : veryLarge ? 0.64 : 0.72,
    pointerEveryFrame: !lowPower
  };
}

const vertex = `
attribute vec2 position;
attribute vec2 uv;
varying vec2 vUv;
void main(){vUv=uv;gl_Position=vec4(position,0.,1.);}
`;

const fragment = `
precision highp float;
uniform vec3 iResolution;
uniform vec2 iMouse;
uniform float iTime;
uniform vec3 uColor0; uniform vec3 uColor1; uniform vec3 uColor2; uniform vec3 uColor3;
uniform vec3 uColor4; uniform vec3 uColor5; uniform vec3 uColor6; uniform vec3 uColor7;
uniform int uColorCount;
uniform float uSpeed; uniform float uScale; uniform float uTurbulence; uniform float uGlow; uniform float uOpacity;
varying vec2 vUv;
#define PI 3.14159265
vec3 palette(float h){int c=uColorCount;if(c<1)c=1;int i=int(floor(clamp(h,0.,.999999)*float(c)));if(i<=0)return uColor0;if(i==1)return uColor1;if(i==2)return uColor2;if(i==3)return uColor3;if(i==4)return uColor4;if(i==5)return uColor5;if(i==6)return uColor6;return uColor7;}
float hash(vec3 p){p=fract(p*.1031);p+=dot(p,p.zyx+33.33);return fract((p.x+p.y)*p.z);}
float sinlerp(float a,float b,float w){return mix(a,b,(sin(w*PI-PI/2.)+1.)/2.);}
float vn(vec2 p,float s,float seed){vec2 c=floor(p/s),r=mod(p,s);float a=hash(vec3(c,seed)),b=hash(vec3(c.x+1.,c.y,seed)),d=hash(vec3(c.x+1.,c.y+1.,seed)),e=hash(vec3(c.x,c.y+1.,seed));return sinlerp(sinlerp(a,b,r.x/s),sinlerp(e,d,r.x/s),r.y/s);}
float dbn(vec2 p,float s,float seed){float o=s/2.;return(2.*vn(p,s,seed)+1.5*vn(p+vec2(o),s,seed+.1)+1.25*vn(p+vec2(-o,o),s,seed+.2)+vn(p+vec2(o,-o),s,seed+.3))/5.75;}
float smin(float a,float b,float k){float r=exp2(-a/k)+exp2(-b/k);return-k*log2(r);}
void main(){
  vec2 frag=vUv*iResolution.xy;float ref=700./max(uScale,.05);vec2 p=frag/iResolution.y*ref;float t=iTime;float spd=150.*uSpeed;
  vec2 dir=vec2(0.,-1.),perp=vec2(1.,0.);
  float d1=vn(p+perp*(t*spd),70.,10.)*46.*uTurbulence;
  float d2=vn(p-perp*(t*spd),130.,15.)*88.*uTurbulence;
  float a=dbn(p+d1+dir*(t*spd*.45),48.,1.);float b=dbn(p+d2-dir*(t*spd*.45),48.,0.);
  float m=smin(a,b,.11);float band=(.22-abs((m-.4)*2.))*5.;float light=clamp(band-vn(p+dir*(t*spd*.45),70.,12.)*1.25,0.,1.);
  light=pow(light,2.2)*uGlow;vec3 col=palette(clamp(.5+(a-b)*.8,0.,1.))*light;
  float vignette=smoothstep(1.18,.25,length((vUv-.5)*vec2(iResolution.x/iResolution.y,1.)));
  col*=mix(.36,1.,vignette);float alpha=clamp(max(col.r,max(col.g,col.b)),0.,1.)*uOpacity;
  gl_FragColor=vec4(col,alpha);
}
`;

function hexToRgb(hex: string) {
  const value = hex.replace("#", "").padEnd(6, "0");
  return [0, 2, 4].map((index) => Number.parseInt(value.slice(index, index + 2), 16) / 255);
}

export function FerrofluidBackground({
  className = "",
  colors = DEFAULT_COLORS,
  speed = 0.18,
  scale = 1.5,
  turbulence = 0.82,
  glow = 2.35,
  opacity = 1
}: FerrofluidBackgroundProps) {
  const containerRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const container = containerRef.current;
    if (!container) return;
    const renderer = new Renderer({
      dpr: Math.min(1, window.devicePixelRatio || 1),
      alpha: true,
      antialias: false,
      powerPreference: "high-performance"
    });
    const gl = renderer.gl;
    const canvas = gl.canvas;
    canvas.className = "ferrofluid-canvas";
    container.appendChild(canvas);

    const source = colors.length ? colors.slice(0, MAX_COLORS) : DEFAULT_COLORS;
    const colorValues = Array.from({ length: MAX_COLORS }, (_, index) => hexToRgb(source[Math.min(index, source.length - 1)]));
    const uniforms: Record<string, { value: unknown }> = {
      iResolution: { value: [1, 1, 1] }, iMouse: { value: [0, 0] }, iTime: { value: 0 },
      uColorCount: { value: source.length }, uSpeed: { value: speed }, uScale: { value: scale },
      uTurbulence: { value: turbulence }, uGlow: { value: glow }, uOpacity: { value: opacity }
    };
    colorValues.forEach((value, index) => { uniforms[`uColor${index}`] = { value }; });
    const program = new Program(gl, { vertex, fragment, uniforms });
    const geometry = new Triangle(gl);
    const mesh = new Mesh(gl, { geometry, program });
    let profile = getPerformanceProfile();

    let resizeFrame = 0;
    const resize = () => {
      cancelAnimationFrame(resizeFrame);
      resizeFrame = requestAnimationFrame(() => {
        profile = getPerformanceProfile();
        const rect = container.getBoundingClientRect();
        const width = Math.max(1, Math.floor(rect.width * profile.renderScale));
        const height = Math.max(1, Math.floor(rect.height * profile.renderScale));
        renderer.setSize(width, height);
        canvas.style.width = `${Math.max(1, Math.floor(rect.width))}px`;
        canvas.style.height = `${Math.max(1, Math.floor(rect.height))}px`;
        uniforms.iResolution.value = [gl.drawingBufferWidth, gl.drawingBufferHeight, 1];
      });
    };
    const observer = new ResizeObserver(resize);
    observer.observe(container);
    resize();

    const target = [0, 0];
    const pointerMove = (event: PointerEvent) => {
      const rect = canvas.getBoundingClientRect();
      target[0] = event.clientX - rect.left;
      target[1] = rect.height - (event.clientY - rect.top);
    };
    window.addEventListener("pointermove", pointerMove, { passive: true });

    let raf = 0;
    let last = performance.now();
    let visible = document.visibilityState === "visible";
    let inView = true;
    const visibility = () => { visible = document.visibilityState === "visible"; };
    document.addEventListener("visibilitychange", visibility);
    const intersectionObserver = new IntersectionObserver((entries) => {
      inView = entries[0]?.isIntersecting ?? true;
    }, { threshold: 0.01 });
    intersectionObserver.observe(container);

    const render = (now: number) => {
      raf = requestAnimationFrame(render);
      if (!visible || !inView || now - last < profile.frameInterval) return;
      last = now - ((now - last) % profile.frameInterval);
      uniforms.iTime.value = now * 0.001;
      if (profile.pointerEveryFrame) {
        const mouse = uniforms.iMouse.value as number[];
        mouse[0] += (target[0] - mouse[0]) * 0.08;
        mouse[1] += (target[1] - mouse[1]) * 0.08;
      }
      try {
        renderer.render({ scene: mesh });
      } catch (error) {
        visible = false;
        console.error("Ferrofluid renderer stopped", error);
      }
    };
    raf = requestAnimationFrame(render);

    return () => {
      cancelAnimationFrame(raf);
      cancelAnimationFrame(resizeFrame);
      observer.disconnect();
      intersectionObserver.disconnect();
      window.removeEventListener("pointermove", pointerMove);
      document.removeEventListener("visibilitychange", visibility);
      if (canvas.parentElement === container) container.removeChild(canvas);
      geometry.remove();
      program.remove();
    };
  }, [colors, glow, opacity, scale, speed, turbulence]);

  return <div ref={containerRef} className={`ferrofluid-background ${className}`} aria-hidden="true" />;
}
