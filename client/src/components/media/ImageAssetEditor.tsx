import { useEffect, useMemo, useRef, useState, type PointerEvent } from "react";
import { createPortal } from "react-dom";
import { Brush, Check, Loader2, RotateCcw, Scissors, Undo2, X } from "lucide-react";
import type { Asset } from "../../types/asset";

type EditorMode = "mosaic" | "cover";
type ExportQuality = "standard" | "hd";

type ImageAssetEditorProps = {
  open: boolean;
  src?: string;
  title?: string;
  uploadAsset: (file: File, input?: { name?: string }) => Promise<Asset>;
  onSaved: (asset: Asset) => void;
  onClose: () => void;
};

const cropRatios = [
  { label: "原图", value: "original" },
  { label: "9:16", value: "9:16" },
  { label: "16:9", value: "16:9" },
  { label: "1:1", value: "1:1" }
] as const;

function ratioValue(ratio: string, fallback: number) {
  if (ratio === "original") return fallback;
  const [width, height] = ratio.split(":").map(Number);
  return width && height ? width / height : fallback;
}

function centeredCrop(width: number, height: number, targetRatio: number) {
  const current = width / height;
  if (Math.abs(current - targetRatio) < 0.004) return { x: 0, y: 0, width, height };
  if (current > targetRatio) {
    const nextWidth = Math.round(height * targetRatio);
    return { x: Math.round((width - nextWidth) / 2), y: 0, width: nextWidth, height };
  }
  const nextHeight = Math.round(width / targetRatio);
  return { x: 0, y: Math.round((height - nextHeight) / 2), width, height: nextHeight };
}

function fileName(title?: string) {
  const safe = (title || "edited-image").replace(/[^\u4e00-\u9fa5a-zA-Z0-9._-]+/g, "_").slice(0, 42) || "edited-image";
  return `${safe}_edited_${Date.now()}.png`;
}

export function ImageAssetEditor({ open, src, title, uploadAsset, onSaved, onClose }: ImageAssetEditorProps) {
  const canvasRef = useRef<HTMLCanvasElement | null>(null);
  const originalRef = useRef<ImageData | null>(null);
  const historyRef = useRef<ImageData[]>([]);
  const lastPointRef = useRef<{ x: number; y: number } | null>(null);
  const [loading, setLoading] = useState(false);
  const [saving, setSaving] = useState(false);
  const [mode, setMode] = useState<EditorMode>("mosaic");
  const [brushSize, setBrushSize] = useState(36);
  const [cropRatio, setCropRatio] = useState<(typeof cropRatios)[number]["value"]>("original");
  const [exportQuality, setExportQuality] = useState<ExportQuality>("hd");
  const [canvasSize, setCanvasSize] = useState({ width: 1, height: 1 });
  const [historyVersion, setHistoryVersion] = useState(0);

  const currentRatio = useMemo(() => canvasSize.width / canvasSize.height, [canvasSize.height, canvasSize.width]);
  const cropPreview = useMemo(() => centeredCrop(canvasSize.width, canvasSize.height, ratioValue(cropRatio, currentRatio)), [canvasSize.height, canvasSize.width, cropRatio, currentRatio]);

  useEffect(() => {
    if (!open || !src) return;
    setLoading(true);
    setSaving(false);
    setCropRatio("original");
    historyRef.current = [];
    setHistoryVersion(0);
    const image = new Image();
    image.crossOrigin = "anonymous";
    image.onload = () => {
      const canvas = canvasRef.current;
      const context = canvas?.getContext("2d", { willReadFrequently: true });
      if (!canvas || !context) return;
      const maxSide = 2400;
      const scale = Math.min(1, maxSide / Math.max(image.naturalWidth, image.naturalHeight));
      const width = Math.max(1, Math.round(image.naturalWidth * scale));
      const height = Math.max(1, Math.round(image.naturalHeight * scale));
      canvas.width = width;
      canvas.height = height;
      context.clearRect(0, 0, width, height);
      context.drawImage(image, 0, 0, width, height);
      originalRef.current = context.getImageData(0, 0, width, height);
      setCanvasSize({ width, height });
      setLoading(false);
    };
    image.onerror = () => {
      setLoading(false);
      window.dispatchEvent(new CustomEvent("studio:toast", { detail: "图片载入失败，无法编辑。" }));
    };
    image.src = src;
  }, [open, src]);

  useEffect(() => {
    if (!open) return;
    function onKeyDown(event: KeyboardEvent) {
      if (event.key === "Escape") onClose();
      if ((event.metaKey || event.ctrlKey) && event.key.toLowerCase() === "z") undo();
    }
    window.addEventListener("keydown", onKeyDown);
    return () => window.removeEventListener("keydown", onKeyDown);
  }, [open, onClose]);

  if (!open || typeof document === "undefined") return null;

  function context() {
    return canvasRef.current?.getContext("2d", { willReadFrequently: true }) ?? null;
  }

  function pointFromEvent(event: PointerEvent<HTMLCanvasElement>) {
    const canvas = canvasRef.current;
    if (!canvas) return { x: 0, y: 0 };
    const rect = canvas.getBoundingClientRect();
    return {
      x: ((event.clientX - rect.left) / rect.width) * canvas.width,
      y: ((event.clientY - rect.top) / rect.height) * canvas.height
    };
  }

  function pushHistory() {
    const canvas = canvasRef.current;
    const ctx = context();
    if (!canvas || !ctx) return;
    historyRef.current.push(ctx.getImageData(0, 0, canvas.width, canvas.height));
    if (historyRef.current.length > 10) historyRef.current.shift();
    setHistoryVersion((value) => value + 1);
  }

  function applyMosaic(x: number, y: number) {
    const canvas = canvasRef.current;
    const ctx = context();
    if (!canvas || !ctx) return;
    const radius = Math.max(8, brushSize);
    const block = Math.max(8, Math.round(radius / 3));
    const startX = Math.max(0, Math.round(x - radius));
    const startY = Math.max(0, Math.round(y - radius));
    const endX = Math.min(canvas.width, Math.round(x + radius));
    const endY = Math.min(canvas.height, Math.round(y + radius));
    for (let py = startY; py < endY; py += block) {
      for (let px = startX; px < endX; px += block) {
        const width = Math.min(block, endX - px);
        const height = Math.min(block, endY - py);
        const data = ctx.getImageData(px, py, width, height).data;
        let r = 0;
        let g = 0;
        let b = 0;
        let count = 0;
        for (let index = 0; index < data.length; index += 4) {
          r += data[index] ?? 0;
          g += data[index + 1] ?? 0;
          b += data[index + 2] ?? 0;
          count += 1;
        }
        ctx.fillStyle = `rgb(${Math.round(r / count)}, ${Math.round(g / count)}, ${Math.round(b / count)})`;
        ctx.fillRect(px, py, width, height);
      }
    }
  }

  function drawCover(from: { x: number; y: number }, to: { x: number; y: number }) {
    const ctx = context();
    if (!ctx) return;
    ctx.save();
    ctx.lineCap = "round";
    ctx.lineJoin = "round";
    ctx.strokeStyle = "rgba(8, 10, 14, 0.82)";
    ctx.lineWidth = brushSize;
    ctx.beginPath();
    ctx.moveTo(from.x, from.y);
    ctx.lineTo(to.x, to.y);
    ctx.stroke();
    ctx.restore();
  }

  function drawAt(point: { x: number; y: number }) {
    const previous = lastPointRef.current ?? point;
    if (mode === "cover") {
      drawCover(previous, point);
    } else {
      const distance = Math.hypot(point.x - previous.x, point.y - previous.y);
      const steps = Math.max(1, Math.ceil(distance / Math.max(8, brushSize / 2)));
      for (let step = 0; step <= steps; step += 1) {
        const progress = step / steps;
        applyMosaic(previous.x + (point.x - previous.x) * progress, previous.y + (point.y - previous.y) * progress);
      }
    }
    lastPointRef.current = point;
  }

  function undo() {
    const canvas = canvasRef.current;
    const ctx = context();
    const last = historyRef.current.pop();
    if (!canvas || !ctx || !last) return;
    ctx.putImageData(last, 0, 0);
    setHistoryVersion((value) => value + 1);
  }

  function reset() {
    const ctx = context();
    if (!ctx || !originalRef.current) return;
    pushHistory();
    ctx.putImageData(originalRef.current, 0, 0);
  }

  async function save() {
    const canvas = canvasRef.current;
    if (!canvas) return;
    setSaving(true);
    try {
      const targetRatio = ratioValue(cropRatio, currentRatio);
      const crop = centeredCrop(canvas.width, canvas.height, targetRatio);
      const maxExportSide = exportQuality === "hd" ? 4096 : 2400;
      const desiredScale = exportQuality === "hd" ? 2 : 1;
      const exportScale = Math.max(1, Math.min(desiredScale, maxExportSide / Math.max(crop.width, crop.height)));
      const output = document.createElement("canvas");
      output.width = Math.max(1, Math.round(crop.width * exportScale));
      output.height = Math.max(1, Math.round(crop.height * exportScale));
      const out = output.getContext("2d");
      if (!out) throw new Error("无法创建编辑画布。");
      out.imageSmoothingEnabled = true;
      out.imageSmoothingQuality = "high";
      out.drawImage(canvas, crop.x, crop.y, crop.width, crop.height, 0, 0, output.width, output.height);
      const blob = await new Promise<Blob | null>((resolve) => output.toBlob(resolve, "image/png", 0.96));
      if (!blob) throw new Error("图片导出失败。");
      const asset = await uploadAsset(new File([blob], fileName(title), { type: "image/png" }), { name: `${title || "图片素材"} · 已编辑` });
      onSaved(asset);
      onClose();
      window.dispatchEvent(new CustomEvent("studio:toast", { detail: "已保存为新素材，并回填到当前节点。" }));
    } catch (error) {
      window.dispatchEvent(new CustomEvent("studio:toast", { detail: error instanceof Error ? error.message : "保存编辑图片失败。" }));
    } finally {
      setSaving(false);
    }
  }

  return createPortal(
    <div className="image-asset-editor nodrag nopan" role="dialog" aria-modal="true" onMouseDown={(event) => event.target === event.currentTarget && onClose()}>
      <div className="image-asset-editor-panel">
        <div className="image-asset-editor-top">
          <div>
            <div className="image-asset-editor-title">图片素材编辑</div>
            <div className="image-asset-editor-subtitle">涂抹隐私、人脸、品牌或水印，可按高清尺寸保存为新素材，不覆盖原图。</div>
          </div>
          <button type="button" className="image-asset-editor-icon" onClick={onClose} title="关闭"><X size={18} /></button>
        </div>

        <div className="image-asset-editor-body">
          <div className="image-asset-editor-stage">
            {loading && <div className="image-asset-editor-loading"><Loader2 className="animate-spin" size={18} />载入图片...</div>}
            <div className="image-asset-editor-canvas-wrap" style={{ aspectRatio: `${canvasSize.width} / ${canvasSize.height}` }}>
              <canvas
                ref={canvasRef}
                className="image-asset-editor-canvas"
                onPointerDown={(event) => {
                  event.preventDefault();
                  event.currentTarget.setPointerCapture(event.pointerId);
                  pushHistory();
                  const point = pointFromEvent(event);
                  lastPointRef.current = point;
                  drawAt(point);
                }}
                onPointerMove={(event) => {
                  if (!event.currentTarget.hasPointerCapture(event.pointerId)) return;
                  drawAt(pointFromEvent(event));
                }}
                onPointerUp={(event) => {
                  event.currentTarget.releasePointerCapture(event.pointerId);
                  lastPointRef.current = null;
                }}
                onPointerCancel={(event) => {
                  if (event.currentTarget.hasPointerCapture(event.pointerId)) event.currentTarget.releasePointerCapture(event.pointerId);
                  lastPointRef.current = null;
                }}
              />
              {cropRatio !== "original" && (
                <div
                  className="image-asset-editor-crop"
                  style={{
                    left: `${(cropPreview.x / canvasSize.width) * 100}%`,
                    top: `${(cropPreview.y / canvasSize.height) * 100}%`,
                    width: `${(cropPreview.width / canvasSize.width) * 100}%`,
                    height: `${(cropPreview.height / canvasSize.height) * 100}%`
                  }}
                />
              )}
            </div>
          </div>

          <aside className="image-asset-editor-tools">
            <div className="image-asset-editor-group">
              <span>涂抹方式</span>
              <button type="button" className={mode === "mosaic" ? "is-active" : ""} onClick={() => setMode("mosaic")}><Brush size={15} />马赛克</button>
              <button type="button" className={mode === "cover" ? "is-active" : ""} onClick={() => setMode("cover")}><Brush size={15} />遮挡</button>
            </div>
            <label className="image-asset-editor-slider">
              <span>笔刷大小 {brushSize}px</span>
              <input type="range" min={12} max={120} value={brushSize} onChange={(event) => setBrushSize(Number(event.target.value))} />
            </label>
            <div className="image-asset-editor-group">
              <span><Scissors size={14} />保存比例</span>
              {cropRatios.map((ratio) => <button key={ratio.value} type="button" className={cropRatio === ratio.value ? "is-active" : ""} onClick={() => setCropRatio(ratio.value)}>{ratio.label}</button>)}
            </div>
            <div className="image-asset-editor-group">
              <span>保存清晰度</span>
              <button type="button" className={exportQuality === "hd" ? "is-active" : ""} onClick={() => setExportQuality("hd")}>高清</button>
              <button type="button" className={exportQuality === "standard" ? "is-active" : ""} onClick={() => setExportQuality("standard")}>标准</button>
              <small className="image-asset-editor-note">高清会用高质量采样导出，适合继续接入生成节点。</small>
            </div>
            <div className="image-asset-editor-actions">
              <button type="button" onClick={undo} disabled={!historyVersion || historyRef.current.length === 0}><Undo2 size={15} />撤销</button>
              <button type="button" onClick={reset}><RotateCcw size={15} />重置</button>
              <button type="button" className="is-primary" onClick={() => void save()} disabled={saving || loading}>{saving ? <Loader2 className="animate-spin" size={15} /> : <Check size={15} />}保存新素材</button>
            </div>
          </aside>
        </div>
      </div>
    </div>,
    document.body
  );
}
