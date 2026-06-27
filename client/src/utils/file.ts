import { apiUrl } from "../services/api";

export function absoluteUploadUrl(url?: string) {
  if (!url) return "";
  if (/^(?:https?:\/\/|blob:|data:)/i.test(url.trim())) return url.trim();
  if (!url.startsWith("/")) return "";
  return new URL(apiUrl(url), window.location.origin).toString();
}
