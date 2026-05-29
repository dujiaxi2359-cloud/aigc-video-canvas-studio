import { apiUrl } from "../services/api";

export function absoluteUploadUrl(url?: string) {
  if (!url) return "";
  if (url.startsWith("http")) return url;
  return new URL(apiUrl(url), window.location.origin).toString();
}
