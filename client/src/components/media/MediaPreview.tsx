import { useMemo, useState } from "react";
import { Download, Maximize2 } from "lucide-react";
import { absoluteUploadUrl } from "../../utils/file";
import {
  imageOriginalUrl,
  imagePreviewUrl,
  mediaDownloadUrl,
  videoPlayableUrl
} from "../../utils/mediaUrls";
import { MediaLightbox } from "./MediaLightbox";

type MediaPreviewProps = {
  type: "image" | "video";
  title?: string;
  previewUrl?: string;
  videoUrl?: string;
  providerVideoUrl?: string;
  downloadUrl?: string;
  downloadableUrl?: string;
  cdnUrl?: string;
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

export function MediaPreview({
  type,
  title,
  previewUrl,
  videoUrl,
  providerVideoUrl,
  downloadUrl,
  downloadableUrl,
  cdnUrl,
  originalUrl,
  outputUrl,
  thumbnailUrl,
  aspectRatio,
  className = "",
  showInlineActions = true,
  onVideoMetadata,
  children,
  meta
}: MediaPreviewProps) {
  const [lightboxOpen, setLightboxOpen] = useState(false);
  const allowNodeDrag = className.includes("creation-media-preview");
  const previewSrc = useMemo(() => {
    const selected = type === "image"
      ? imagePreviewUrl({ thumbnailUrl, previewUrl, cdnUrl, outputUrl, originalUrl })
      : videoPlayableUrl({ cdnUrl, outputUrl, downloadUrl, videoUrl, providerVideoUrl, previewUrl });
    return absoluteUploadUrl(selected);
  }, [cdnUrl, downloadUrl, originalUrl, outputUrl, previewUrl, providerVideoUrl, thumbnailUrl, type, videoUrl]);
  const highResSrc = useMemo(() => {
    const selected = type === "image"
      ? imageOriginalUrl({ thumbnailUrl, previewUrl, cdnUrl, outputUrl, originalUrl })
      : videoPlayableUrl({ cdnUrl, outputUrl, downloadUrl, videoUrl, providerVideoUrl, previewUrl });
    return absoluteUploadUrl(selected);
  }, [cdnUrl, downloadUrl, originalUrl, outputUrl, previewUrl, providerVideoUrl, thumbnailUrl, type, videoUrl]);
  const downloadSrc = useMemo(
    () => type === "image"
      ? absoluteUploadUrl(imageOriginalUrl({ thumbnailUrl, previewUrl, cdnUrl, outputUrl, originalUrl }))
      : mediaDownloadUrl({ cdnUrl, outputUrl, downloadUrl, downloadableUrl, videoUrl, providerVideoUrl, previewUrl }),
    [cdnUrl, downloadUrl, downloadableUrl, originalUrl, outputUrl, previewUrl, providerVideoUrl, thumbnailUrl, type, videoUrl]
  );

  function download(event: React.MouseEvent<HTMLButtonElement>) {
    event.preventDefault();
    event.stopPropagation();
    if (!downloadSrc) {
      window.dispatchEvent(new CustomEvent("studio:toast", {
        detail: "当前没有可下载的视频 URL，只有文件名，等待上游结果或 COS/CDN 转存完成。"
      }));
      return;
    }
    const link = document.createElement("a");
    link.href = downloadSrc;
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
              <img src={previewSrc} alt={title || "图片预览"} draggable={false} loading="lazy" decoding="async" />
            ) : (
              <video
                src={previewSrc}
                controls
                preload="metadata"
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
            <button type="button" className="media-action-button" title={downloadSrc ? (type === "image" ? "下载图片" : "下载视频") : "当前没有可下载的视频 URL"} disabled={!downloadSrc} onClick={download}>
              <Download size={14} />
            </button>
          </div>
        )}
      </div>
      <MediaLightbox open={lightboxOpen} type={type} src={highResSrc} previewSrc={previewSrc} title={title} meta={meta} onClose={() => setLightboxOpen(false)} />
    </>
  );
}
