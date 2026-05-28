import { triggerBlobDownload } from "./exportApi";

const baseURL = import.meta.env.VITE_API_BASE_URL || window.location.origin;

export function downloadAssetById(assetId: string) {
  window.location.href = new URL(`/api/assets/${assetId}/download`, baseURL).toString();
}

export async function downloadAsset(url: string, filename: string) {
  const response = await fetch(new URL("/api/assets/download", baseURL), {
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
