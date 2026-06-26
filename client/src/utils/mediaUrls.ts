export type MediaUrlSource = {
  url?: string;
  originalUrl?: string;
  outputUrl?: string;
  thumbnailUrl?: string;
  posterUrl?: string;
  previewUrl?: string;
  cdnUrl?: string;
  cosUrl?: string;
  downloadUrl?: string;
  downloadableUrl?: string;
};

export function imageDisplayUrl(source: MediaUrlSource) {
  return source.thumbnailUrl || source.previewUrl || source.cdnUrl || source.outputUrl || source.url || source.originalUrl || "";
}

export function imageOriginalUrl(source: MediaUrlSource) {
  return source.cdnUrl || source.outputUrl || source.url || source.originalUrl || source.previewUrl || source.thumbnailUrl || source.cosUrl || "";
}

export function videoPosterUrl(source: MediaUrlSource) {
  return source.posterUrl || source.thumbnailUrl || "";
}

export function videoPlayableUrl(source: MediaUrlSource) {
  return source.previewUrl || source.cdnUrl || source.outputUrl || source.url || source.originalUrl || source.cosUrl || "";
}

export function mediaDownloadUrl(source: MediaUrlSource) {
  return source.downloadableUrl || source.downloadUrl || source.cdnUrl || source.outputUrl || source.url || source.originalUrl || source.cosUrl || "";
}

