import { apiUrl } from "./api";
import { triggerBlobDownload } from "./exportApi";

export function downloadAssetById(assetId: string) {
  window.location.href = apiUrl(`/api/assets/${assetId}/download`);
}

export async function downloadAsset(url: string, filename: string) {
  const response = await fetch(apiUrl("/api/assets/download"), {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ url, filename })
  });

  if (!response.ok) {
    const error = await response.json().catch(() => ({ errorMessage: "导出失败。" }));
    throw new Error(error.errorMessage || "导出失败。");
  }

  const blob = await response.blob();
  triggerBlobDownload(blob, filename);
}
