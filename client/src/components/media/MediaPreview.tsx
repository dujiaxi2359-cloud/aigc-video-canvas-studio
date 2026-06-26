import { useEffect, useMemo, useRef, useState } from "react";
import { Download, Maximize2, Play } from "lucide-react";
import { absoluteUploadUrl } from "../../utils/file";
import { MediaLightbox } from "./MediaLightbox";
import { useLazyResource } from "../../utils/useLazyResource";
import { imageDisplayUrl, imageOriginalUrl, mediaDownloadUrl, videoPlayableUrl, videoPosterUrl } from "../../utils/mediaUrls";

type MediaPreviewProps = {
  type: "image" | "video";
  title?: string;
  previewUrl?: string;
  originalUrl?: string;
  outputUrl?: string;
  thumbnailUrl?: string;
  posterUrl?: string;
  cdnUrl?: string;
  cosUrl?: string;
  downloadableUrl?: string;
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

export function MediaPreview({ type, title, previewUrl, originalUrl, outputUrl, thumbnailUrl, posterUrl, cdnUrl, cosUrl, downloadableUrl, aspectRatio, className = "", showInlineActions = true, onVideoMetadata, children, meta }: MediaPreviewProps) {
  const [lightboxOpen, setLightboxOpen] = useState(false);
  const [videoRequested, setVideoRequested] = useState(false);
  const [videoError, setVideoError] = useState("");
  const videoRef = useRef<HTMLVideoElement | null>(null);
  const lazy = useLazyResource<HTMLDivElement>(true);
  const allowNodeDrag = className.includes("creation-media-preview");
  const previewSrc = useMemo(() => {
    const selected = type === "image"
      ? imageDisplayUrl({ thumbnailUrl, previewUrl, cdnUrl, outputUrl, originalUrl })
      : videoPosterUrl({ posterUrl, thumbnailUrl });
    return lazy.visible ? absoluteUploadUrl(selected) : "";
  }, [cdnUrl, lazy.visible, originalUrl, outputUrl, posterUrl, previewUrl, thumbnailUrl, type]);
  const highResSrc = useMemo(() => {
    const selected = type === "image"
      ? imageOriginalUrl({ originalUrl, outputUrl, previewUrl, thumbnailUrl, cdnUrl, cosUrl })
      : videoPlayableUrl({ originalUrl, outputUrl, previewUrl, thumbnailUrl, cdnUrl, cosUrl });
    return absoluteUploadUrl(selected);
  }, [cdnUrl, cosUrl, originalUrl, outputUrl, previewUrl, thumbnailUrl, type]);
  const downloadSrc = useMemo(() => absoluteUploadUrl(mediaDownloadUrl({ downloadableUrl, originalUrl, outputUrl, previewUrl, thumbnailUrl, cdnUrl, cosUrl })), [cdnUrl, cosUrl, downloadableUrl, originalUrl, outputUrl, previewUrl, thumbnailUrl]);
  const videoSrc = type === "video" && videoRequested ? highResSrc : "";

  useEffect(() => {
    if (type !== "video") return;
    if (lazy.visible) return;
    const video = videoRef.current;
    if (video) {
      video.pause();
      video.removeAttribute("src");
      video.load();
    }
    setVideoRequested(false);
  }, [lazy.visible, type]);

  async function playVideo(event: React.MouseEvent<HTMLButtonElement>) {
    event.preventDefault();
    event.stopPropagation();
    if (!highResSrc) return;
    setVideoError("");
    setVideoRequested(true);
    window.requestAnimationFrame(() => {
      const video = videoRef.current;
      if (!video) return;
      video.load();
      void video.play().catch((error) => setVideoError(error instanceof Error ? error.message : "视频预览加载失败，请点击下载或稍后重试。"));
    });
  }

  function download(event: React.MouseEvent<HTMLButtonElement>) {
    event.preventDefault();
    event.stopPropagation();
    if (!downloadSrc) return;
    const link = document.createElement("a");
    link.href = downloadSrc;
    link.download = title || (type === "image" ? "image" : "video");
    link.rel = "noopener";
    link.click();
  }

  return (
    <>
      <div
        ref={lazy.ref}
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
          {type === "image" && previewSrc ? (
            <img src={previewSrc} alt={title || "图片预览"} draggable={false} loading="lazy" decoding="async" />
          ) : type === "video" && (previewSrc || highResSrc) ? (
            <div className="media-video-lazy">
              {videoRequested && videoSrc ? (
                <video
                  ref={videoRef}
                  src={videoSrc}
                  poster={previewSrc}
                  controls
                  preload="none"
                  draggable={false}
                  onError={() => setVideoError("视频预览加载失败，请点击下载或稍后重试。")}
                  onLoadedMetadata={(event) => {
                    const video = event.currentTarget;
                    if (video.videoWidth && video.videoHeight) {
                      onVideoMetadata?.({ width: video.videoWidth, height: video.videoHeight, duration: video.duration });
                    }
                  }}
                />
              ) : (
                <>
                  {previewSrc ? <img src={previewSrc} alt={title || "视频封面"} draggable={false} loading="lazy" decoding="async" /> : <div className="media-video-placeholder" />}
                  {highResSrc && <button type="button" className="media-video-play-button" onClick={playVideo}><Play size={20} fill="currentColor" />点击播放</button>}
                </>
              )}
              {videoError && <div className="media-video-error">{videoError}</div>}
            </div>
          ) : previewSrc ? (
            type === "image" ? (
              <img src={previewSrc} alt={title || "图片预览"} draggable={false} loading="lazy" decoding="async" />
            ) : null
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
      <MediaLightbox open={lightboxOpen} type={type} src={highResSrc} previewSrc={previewSrc} title={title} meta={meta} onClose={() => setLightboxOpen(false)} />
    </>
  );
}
