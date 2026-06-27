export type MediaUrlSource = {
  cdnUrl?: string;
  outputUrl?: string;
  downloadUrl?: string;
  downloadableUrl?: string;
  videoUrl?: string;
  providerVideoUrl?: string;
  previewUrl?: string;
  thumbnailUrl?: string;
  posterUrl?: string;
  originalUrl?: string;
  url?: string;
};

export function isRealMediaUrl(value?: string | null) {
  return typeof value === "string" && /^(?:https?:\/\/|blob:|data:)/i.test(value.trim());
}

function firstRealMediaUrl(...values: Array<string | undefined>) {
  return values.find((value) => isRealMediaUrl(value))?.trim() || "";
}

function firstDisplayMediaUrl(...values: Array<string | undefined>) {
  return values.find((value) => isRealMediaUrl(value) || value?.startsWith("/"))?.trim() || "";
}

export function videoPlayableUrl(source: MediaUrlSource) {
  return firstRealMediaUrl(
    source.cdnUrl,
    source.outputUrl,
    source.downloadUrl,
    source.videoUrl,
    source.providerVideoUrl,
    source.previewUrl
  );
}

export function mediaDownloadUrl(source: MediaUrlSource) {
  return firstRealMediaUrl(
    source.cdnUrl,
    source.outputUrl,
    source.downloadUrl,
    source.videoUrl,
    source.providerVideoUrl,
    source.previewUrl,
    source.downloadableUrl
  );
}

export function imagePreviewUrl(source: MediaUrlSource) {
  return firstDisplayMediaUrl(
    source.thumbnailUrl,
    source.previewUrl,
    source.cdnUrl,
    source.outputUrl,
    source.originalUrl,
    source.url
  );
}

export function imageDisplayUrl(source: MediaUrlSource) {
  return imagePreviewUrl(source);
}

export function imageOriginalUrl(source: MediaUrlSource) {
  return firstDisplayMediaUrl(
    source.cdnUrl,
    source.outputUrl,
    source.originalUrl,
    source.url,
    source.previewUrl,
    source.thumbnailUrl
  );
}

export function videoPosterUrl(source: MediaUrlSource) {
  return firstDisplayMediaUrl(source.posterUrl, source.thumbnailUrl);
}
