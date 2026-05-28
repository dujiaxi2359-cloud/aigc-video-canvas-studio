export function absoluteUploadUrl(url?: string) {
  if (!url) return "";
  if (url.startsWith("http")) return url;
  return `${import.meta.env.VITE_API_BASE_URL || window.location.origin}${url}`;
}
