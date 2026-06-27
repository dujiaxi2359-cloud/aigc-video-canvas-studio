import { useEffect, useMemo, useRef, useState } from "react";
import { createPortal } from "react-dom";
import { Copy, Download, Maximize2, Minus, Plus, RotateCcw, X } from "lucide-react";

type MediaLightboxProps = {
  open: boolean;
  type: "image" | "video";
  assetId?: string;
  src?: string;
  previewSrc?: string;
  title?: string;
  meta?: Array<{ label: string; value?: string | number | null }>;
  onClose: () => void;
};

export function MediaLightbox({ open, type, src, previewSrc, title, meta = [], onClose }: MediaLightboxProps) {
  const [scale, setScale] = useState(1);
  const [fitToScreen, setFitToScreen] = useState(true);
  const [position, setPosition] = useState({ x: 0, y: 0 });
  const [displaySrc, setDisplaySrc] = useState("");
  const dragRef = useRef<{ x: number; y: number; originX: number; originY: number } | null>(null);
  const visibleMeta = useMemo(() => meta.filter((item) => item.value !== undefined && item.value !== null && item.value !== ""), [meta]);

  useEffect(() => {
    if (!open) return;
    setScale(1);
    setFitToScreen(true);
    setPosition({ x: 0, y: 0 });
    setDisplaySrc(previewSrc || src || "");
    function onKeyDown(event: KeyboardEvent) {
      if (event.key === "Escape") onClose();
    }
    window.addEventListener("keydown", onKeyDown);
    return () => window.removeEventListener("keydown", onKeyDown);
  }, [open, onClose, previewSrc, src]);

  useEffect(() => {
    if (!open || type !== "image" || !src || src === displaySrc) return;
    let cancelled = false;
    const image = new Image();
    image.decoding = "async";
    image.onload = () => {
      if (!cancelled) setDisplaySrc(src);
    };
    image.src = src;
    return () => {
      cancelled = true;
    };
  }, [displaySrc, open, src, type]);

  if (!open) return null;

  const canShowHighRes = Boolean(src);

  function download() {
    if (!src) return;
    const link = document.createElement("a");
    link.href = src;
    link.download = title || (type === "image" ? "image" : "video");
    link.rel = "noopener";
    link.click();
  }

  async function copyLink() {
    if (!src) return;
    await navigator.clipboard.writeText(src);
  }

  const content = (
    <div className="media-lightbox nodrag nopan" role="dialog" aria-modal="true" onMouseDown={(event) => event.target === event.currentTarget && onClose()}>
      <div className="media-lightbox-top">
        <div className="min-w-0">
          <div className="truncate text-[14px] font-semibold text-white">{title || (type === "image" ? "高清图片" : "高清视频")}</div>
          <div className="mt-1 flex max-w-[70vw] flex-wrap gap-x-3 gap-y-1 text-[11px] text-white/48">
            {visibleMeta.map((item) => <span key={item.label}>{item.label}: {item.value}</span>)}
            {!canShowHighRes && <span className="text-amber-200">当前素材只有缩略图，无法查看高清原图。</span>}
          </div>
        </div>
        <button className="media-lightbox-icon" type="button" onClick={onClose} title="关闭"><X size={17} /></button>
      </div>

      <div className="media-lightbox-stage">
        {type === "image" && displaySrc ? (
          <img
            className={`media-lightbox-image ${fitToScreen ? "is-fit" : "is-natural"}`}
            src={displaySrc}
            alt={title || "高清图片"}
            draggable={false}
            loading="eager"
            decoding="async"
            style={{ transform: `translate(${position.x}px, ${position.y}px) scale(${scale})` }}
            onWheel={(event) => {
              event.preventDefault();
              setFitToScreen(true);
              setScale((value) => Math.min(5, Math.max(0.3, value + (event.deltaY > 0 ? -0.12 : 0.12))));
            }}
            onMouseDown={(event) => {
              event.preventDefault();
              dragRef.current = { x: event.clientX, y: event.clientY, originX: position.x, originY: position.y };
            }}
            onMouseMove={(event) => {
              if (!dragRef.current) return;
              setPosition({
                x: dragRef.current.originX + event.clientX - dragRef.current.x,
                y: dragRef.current.originY + event.clientY - dragRef.current.y
              });
            }}
            onMouseUp={() => {
              dragRef.current = null;
            }}
            onMouseLeave={() => {
              dragRef.current = null;
            }}
          />
        ) : type === "video" && src ? (
          <video className="media-lightbox-video" src={src} controls autoPlay />
        ) : (
          <div className="rounded-2xl border border-white/[0.08] bg-white/[0.04] px-5 py-4 text-[13px] text-amber-100">当前素材只有缩略图，无法查看高清原图。</div>
        )}
      </div>

      <div className="media-lightbox-toolbar">
        {type === "image" && (
          <>
            <button className="media-lightbox-tool" type="button" onClick={() => setScale((value) => Math.max(0.3, value - 0.2))} title="缩小"><Minus size={15} /></button>
            <button className="media-lightbox-tool" type="button" onClick={() => { setFitToScreen(true); setScale((value) => Math.min(5, value + 0.2)); }} title="放大"><Plus size={15} /></button>
            <button className="media-lightbox-tool" type="button" onClick={() => { setFitToScreen(true); setScale(1); setPosition({ x: 0, y: 0 }); }} title="适应屏幕"><Maximize2 size={15} /></button>
            <button className="media-lightbox-tool min-w-[48px]" type="button" onClick={() => { setFitToScreen(false); setScale(1); setPosition({ x: 0, y: 0 }); }} title="100%">100%</button>
            <button className="media-lightbox-tool" type="button" onClick={() => { setFitToScreen(true); setScale(1); setPosition({ x: 0, y: 0 }); }} title="重置"><RotateCcw size={15} /></button>
          </>
        )}
        <button className="media-lightbox-tool" type="button" onClick={copyLink} disabled={!src} title="复制链接"><Copy size={15} /></button>
        <button className="media-lightbox-tool" type="button" onClick={download} disabled={!src} title="下载"><Download size={15} /></button>
        <button className="media-lightbox-tool" type="button" onClick={onClose} title="关闭"><X size={15} /></button>
      </div>
    </div>
  );

  return createPortal(content, document.body);
}
