import { useMemo, useState } from "react";
import { Download, Maximize2 } from "lucide-react";
import { absoluteUploadUrl } from "../../utils/file";
import { MediaLightbox } from "./MediaLightbox";

type MediaPreviewProps = {
  type: "image" | "video";
  title?: string;
  previewUrl?: string;
  originalUrl?: string;
  outputUrl?: string;
  thumbnailUrl?: string;
  aspectRatio?: string;
  className?: string;
  showInlineActions?: boolean;
  onVideoMetadata?: (metadata: { width: number; height: number; duration?: number }) => void;
  children?: React.ReactNode;
  meta?: Array<{ label: string; value?: string | number | null }>;
};

function ratioToCss(ratio?: string) {
  if (!ratio) return "16 / 9";
  return ratio.replace(":", " / ");
}

export function MediaPreview({ type, title, previewUrl, originalUrl, outputUrl, thumbnailUrl, aspectRatio, className = "", showInlineActions = true, onVideoMetadata, children, meta }: MediaPreviewProps) {
  const [lightboxOpen, setLightboxOpen] = useState(false);
  const allowNodeDrag = className.includes("creation-media-preview");
  const previewSrc = useMemo(() => absoluteUploadUrl(previewUrl || outputUrl || originalUrl || thumbnailUrl), [originalUrl, outputUrl, previewUrl, thumbnailUrl]);
  const highResSrc = useMemo(() => {
    const selected = type === "image"
      ? originalUrl || outputUrl || previewUrl || thumbnailUrl
      : outputUrl || originalUrl || previewUrl || thumbnailUrl;
    return absoluteUploadUrl(selected);
  }, [originalUrl, outputUrl, previewUrl, thumbnailUrl, type]);

  function download(event: React.MouseEvent<HTMLButtonElement>) {
    event.preventDefault();
    event.stopPropagation();
    if (!highResSrc) return;
    const link = document.createElement("a");
    link.href = highResSrc;
    link.download = title || (type === "image" ? "image" : "video");
    link.rel = "noopener";
    link.click();
  }

  return (
    <>
      <div
        className={`media-preview media-preview-${type} ${allowNodeDrag ? "" : "nodrag nopan"} ${className}`}
        onClick={(event) => {
          if (allowNodeDrag) return;
          if (type !== "image" || (!previewSrc && !highResSrc)) return;
          event.preventDefault();
          event.stopPropagation();
          setLightboxOpen(true);
        }}
        onDoubleClick={(event) => {
          event.preventDefault();
          event.stopPropagation();
          if (previewSrc || highResSrc) setLightboxOpen(true);
        }}
      >
        <div
          className="media-preview-frame"
          style={{ "--asset-aspect-ratio": ratioToCss(aspectRatio) } as React.CSSProperties}
        >
          {previewSrc ? (
            type === "image" ? (
              <img src={previewSrc} alt={title || "图片预览"} draggable={false} />
            ) : (
              <video
                src={previewSrc}
                controls
                draggable={false}
                onLoadedMetadata={(event) => {
                  const video = event.currentTarget;
                  if (video.videoWidth && video.videoHeight) {
                    onVideoMetadata?.({ width: video.videoWidth, height: video.videoHeight, duration: video.duration });
                  }
                }}
              />
            )
          ) : children}
        </div>
        {showInlineActions && (previewSrc || highResSrc) && (
          <div className="media-actions">
            <button type="button" className="media-action-button" title={type === "image" ? "查看原图" : "全屏查看"} onClick={(event) => { event.preventDefault(); event.stopPropagation(); setLightboxOpen(true); }}>
              <Maximize2 size={14} />
            </button>
            <button type="button" className="media-action-button" title={type === "image" ? "下载图片" : "下载视频"} onClick={download}>
              <Download size={14} />
            </button>
          </div>
        )}
      </div>
      <MediaLightbox open={lightboxOpen} type={type} src={highResSrc} title={title} meta={meta} onClose={() => setLightboxOpen(false)} />
    </>
  );
}
