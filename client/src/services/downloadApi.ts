import { apiUrl } from "./api";
import { isRealMediaUrl } from "../utils/mediaUrls";

export function isValidDownloadUrl(url?: string) {
  return isRealMediaUrl(url);
}

function triggerUrlDownload(url: string, filename: string) {
  const anchor = document.createElement("a");
  anchor.href = url;
  anchor.download = filename;
  anchor.rel = "noopener";
  document.body.appendChild(anchor);
  anchor.click();
  anchor.remove();
}

export function downloadAssetById(assetId: string, _fallbackFilename = "aigc_asset") {
  window.location.href = apiUrl(`/api/assets/${assetId}/download`);
}

export async function downloadAsset(url: string, filename: string) {
  if (!isValidDownloadUrl(url)) {
    throw new Error("当前没有可下载的视频 URL，只有文件名，等待上游结果或 COS/CDN 转存完成。");
  }
  triggerUrlDownload(url.trim(), filename);
}
