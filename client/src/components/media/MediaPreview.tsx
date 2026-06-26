import { useEffect, useMemo, useRef, useState } from "react";
import { Download, Maximize2, Play } from "lucide-react";
import { absoluteUploadUrl } from "../../utils/file";
import { MediaLightbox } from "./MediaLightbox";
import { useLazyResource } from "../../utils/useLazyResource";
import { imageDisplayUrl, imageOriginalUrl, mediaDownloadUrl, videoPlayableUrl, videoPosterUrl } from "../../utils/mediaUrls";
import { assetApi } from "../../services/assetApi";

type MediaPreviewProps = {
  type: "image" | "video";
  assetId?: string;
  title?: string;
  previewUrl?: string;
  providerVideoUrl?: string;
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

export function MediaPreview({ type, assetId, title, previewUrl, providerVideoUrl, originalUrl, outputUrl, thumbnailUrl, posterUrl, cdnUrl, cosUrl, downloadableUrl, aspectRatio, className = "", showInlineActions = true, onVideoMetadata, children, meta }: MediaPreviewProps) {
  const [lightboxOpen, setLightboxOpen] = useState(false);
  const [videoRequested, setVideoRequested] = useState(false);
  const [signedPlaySrc, setSignedPlaySrc] = useState("");
  const [signedPreviewSrc, setSignedPreviewSrc] = useState("");
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
      : videoPlayableUrl({ originalUrl, outputUrl, previewUrl, providerVideoUrl, thumbnailUrl, cdnUrl, cosUrl });
    return absoluteUploadUrl(selected);
  }, [cdnUrl, cosUrl, originalUrl, outputUrl, previewUrl, providerVideoUrl, thumbnailUrl, type]);
  const downloadSrc = useMemo(() => absoluteUploadUrl(mediaDownloadUrl({ downloadableUrl, originalUrl, outputUrl, providerVideoUrl, previewUrl, thumbnailUrl, cdnUrl, cosUrl })), [cdnUrl, cosUrl, downloadableUrl, originalUrl, outputUrl, previewUrl, providerVideoUrl, thumbnailUrl]);
  const videoSrc = type === "video" && videoRequested ? signedPlaySrc || highResSrc : "";

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
    setSignedPlaySrc("");
  }, [lazy.visible, type]);

  async function getSignedUrl(purpose: "preview" | "play" | "download", fallback: string) {
    if (!assetId) return fallback;
    const result = await assetApi.signedUrl(assetId, { purpose });
    return result.signedUrl;
  }

  async function openLightbox(event?: React.MouseEvent) {
    event?.preventDefault();
    event?.stopPropagation();
    if (!previewSrc && !highResSrc) return;
    if (assetId) {
      try {
        setSignedPreviewSrc(await getSignedUrl(type === "video" ? "play" : "preview", highResSrc));
      } catch (error) {
        window.dispatchEvent(new CustomEvent("studio:toast", { detail: error instanceof Error ? error.message : "生成 CDN 签名预览 URL 失败。" }));
      }
    }
    setLightboxOpen(true);
  }

  async function playVideo(event: React.MouseEvent<HTMLButtonElement>) {
    event.preventDefault();
    event.stopPropagation();
    if (!highResSrc) return;
    setVideoError("");
    try {
      setSignedPlaySrc(await getSignedUrl("play", highResSrc));
      setVideoRequested(true);
    } catch (error) {
      setVideoError(error instanceof Error ? error.message : "生成 CDN 签名播放 URL 失败。");
      return;
    }
    window.requestAnimationFrame(() => {
      const video = videoRef.current;
      if (!video) return;
      video.load();
      void video.play().catch((error) => setVideoError(error instanceof Error ? error.message : "视频预览加载失败，请点击下载或稍后重试。"));
    });
  }

  async function download(event: React.MouseEvent<HTMLButtonElement>) {
    event.preventDefault();
    event.stopPropagation();
    if (!downloadSrc) return;
    try {
      const link = document.createElement("a");
      link.href = await getSignedUrl("download", downloadSrc);
      link.download = title || (type === "image" ? "image" : "video");
      link.rel = "noopener";
      link.click();
    } catch (error) {
      window.dispatchEvent(new CustomEvent("studio:toast", { detail: error instanceof Error ? error.message : "生成 CDN 签名下载 URL 失败。" }));
    }
  }

  return (
    <>
      <div
        ref={lazy.ref}
        className={`media-preview media-preview-${type} ${allowNodeDrag ? "" : "nodrag nopan"} ${className}`}
        onClick={(event) => {
          if (allowNodeDrag) return;
          if (type !== "image" || (!previewSrc && !highResSrc)) return;
          void openLightbox(event);
        }}
        onDoubleClick={(event) => {
          if (previewSrc || highResSrc) void openLightbox(event);
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
            <button type="button" className="media-action-button" title={type === "image" ? "查看原图" : "全屏查看"} onClick={(event) => void openLightbox(event)}>
              <Maximize2 size={14} />
            </button>
            <button type="button" className="media-action-button" title={type === "image" ? "下载图片" : "下载视频"} onClick={download}>
              <Download size={14} />
            </button>
          </div>
        )}
      </div>
      <MediaLightbox open={lightboxOpen} type={type} src={signedPreviewSrc || highResSrc} previewSrc={previewSrc} title={title} meta={meta} onClose={() => { setLightboxOpen(false); setSignedPreviewSrc(""); }} />
    </>
  );
}
