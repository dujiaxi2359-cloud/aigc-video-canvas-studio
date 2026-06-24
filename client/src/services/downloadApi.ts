import { apiUrl } from "./api";
import { triggerBlobDownload } from "./exportApi";

function activeWorkspaceHeader(): Record<string, string> {
  const workspaceId = window.localStorage.getItem("aigcnong-active-workspace");
  return workspaceId ? { "X-Workspace-Id": workspaceId } : {};
}

function filenameFromDisposition(disposition: string | null, fallback: string) {
  const value = disposition || "";
  const encodedMatch = value.match(/filename\*=UTF-8''([^;]+)/i);
  const plainMatch = value.match(/filename="?([^";]+)"?/i);
  return encodedMatch ? decodeURIComponent(encodedMatch[1]) : plainMatch?.[1] || fallback;
}

async function downloadBlobResponse(response: Response, fallbackFilename: string) {
  if (!response.ok) {
    const error = await response.json().catch(() => ({ errorMessage: "下载失败。" }));
    throw new Error(error.errorMessage || "下载失败。");
  }
  const blob = await response.blob();
  triggerBlobDownload(blob, filenameFromDisposition(response.headers.get("Content-Disposition"), fallbackFilename));
}

export async function downloadAssetById(assetId: string, fallbackFilename = "aigc_asset") {
  const response = await fetch(apiUrl(`/api/assets/${encodeURIComponent(assetId)}/download`), {
    credentials: "include",
    headers: activeWorkspaceHeader()
  });
  await downloadBlobResponse(response, fallbackFilename);
}

export async function downloadAsset(url: string, filename: string) {
  const response = await fetch(apiUrl("/api/assets/download"), {
    method: "POST",
    credentials: "include",
    headers: { "Content-Type": "application/json", ...activeWorkspaceHeader() },
    body: JSON.stringify({ url, filename })
  });

  await downloadBlobResponse(response, filename);
}
