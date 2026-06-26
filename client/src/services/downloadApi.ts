import { apiUrl } from "./api";
import { assetApi } from "./assetApi";

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
  triggerUrlDownload(apiUrl(url), filename);
}
