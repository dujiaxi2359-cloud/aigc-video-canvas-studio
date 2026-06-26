import { apiUrl } from "./api";
import { assetApi } from "./assetApi";

export function isValidDownloadUrl(url?: string) {
  return Boolean(url && /^(https?:|blob:|data:|\/)/i.test(url.trim()));
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

export async function downloadAssetById(assetId: string, fallbackFilename = "aigc_asset") {
  const result = await assetApi.signedUrl(assetId, { purpose: "download" });
  triggerUrlDownload(result.signedUrl, fallbackFilename);
}

export async function downloadAsset(url: string, filename: string) {
  if (!isValidDownloadUrl(url)) {
    throw new Error(`当前没有可下载的视频 URL，只有文件名：${url || filename}`);
  }
  triggerUrlDownload(apiUrl(url), filename);
}
