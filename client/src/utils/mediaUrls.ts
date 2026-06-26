export type MediaUrlSource = {
  url?: string;
  originalUrl?: string;
  outputUrl?: string;
  thumbnailUrl?: string;
  posterUrl?: string;
  previewUrl?: string;
  providerVideoUrl?: string;
  cdnUrl?: string;
  cosUrl?: string;
  downloadUrl?: string;
  downloadableUrl?: string;
};

export function isDownloadableMediaUrl(value?: string) {
  return Boolean(value && /^(https?:|blob:|data:)/i.test(value.trim()));
}

function firstUsableUrl(...values: Array<string | undefined>) {
  return values.find((value) => isDownloadableMediaUrl(value)) || "";
}

export function imageDisplayUrl(source: MediaUrlSource) {
  return firstUsableUrl(source.thumbnailUrl, source.previewUrl, source.cdnUrl, source.outputUrl, source.url, source.originalUrl);
}

export function imageOriginalUrl(source: MediaUrlSource) {
  return firstUsableUrl(source.cdnUrl, source.outputUrl, source.url, source.originalUrl, source.previewUrl, source.thumbnailUrl, source.cosUrl);
}

export function videoPosterUrl(source: MediaUrlSource) {
  return source.posterUrl || source.thumbnailUrl || "";
}

export function videoPlayableUrl(source: MediaUrlSource) {
  return firstUsableUrl(source.previewUrl, source.cdnUrl, source.outputUrl, source.providerVideoUrl, source.url, source.originalUrl, source.cosUrl);
}

export function mediaDownloadUrl(source: MediaUrlSource) {
  return firstUsableUrl(source.cdnUrl, source.downloadableUrl, source.downloadUrl, source.outputUrl, source.providerVideoUrl, source.url, source.originalUrl, source.previewUrl, source.cosUrl);
}
