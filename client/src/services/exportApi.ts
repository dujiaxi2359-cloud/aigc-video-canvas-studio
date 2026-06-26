import type { Edge, Node } from "reactflow";
import { apiUrl } from "./api";

export type ExportAsset = {
  nodeId?: string;
  nodeTitle?: string;
  type: "image" | "video" | "audio" | "compose";
  url: string;
  filename?: string;
};

export type ExportProject = {
  projectName: string;
  version: string;
  createdAt: string;
  updatedAt: string;
  nodes: Node[];
  edges: Edge[];
  viewport?: unknown;
  settingsSnapshot?: Record<string, unknown>;
};

const sensitiveKeyPattern = /(api.?key|encrypted|authorization|secret|token|password)/i;

export function sanitizeFilename(input = "asset") {
  const cleaned = input.replace(/[\\/:*?"<>|]/g, "_").replace(/\s+/g, "_").replace(/_+/g, "_").trim();
  return cleaned || "asset";
}

export function timestamp() {
  const now = new Date();
  const pad = (value: number) => String(value).padStart(2, "0");
  return `${now.getFullYear()}${pad(now.getMonth() + 1)}${pad(now.getDate())}_${pad(now.getHours())}${pad(now.getMinutes())}${pad(now.getSeconds())}`;
}

export function extensionFromUrl(url: string, fallback = ".bin") {
  try {
    const ext = new URL(url, window.location.origin).pathname.match(/\.[a-z0-9]+$/i)?.[0];
    return ext || fallback;
  } catch {
    return url.match(/\.[a-z0-9]+$/i)?.[0] || fallback;
  }
}

export function sanitizeProjectForExport<T>(value: T): T {
  if (Array.isArray(value)) return value.map((item) => sanitizeProjectForExport(item)) as T;
  if (!value || typeof value !== "object") return value;

  const output: Record<string, unknown> = {};
  for (const [key, item] of Object.entries(value as Record<string, unknown>)) {
    if (sensitiveKeyPattern.test(key)) continue;
    output[key] = sanitizeProjectForExport(item);
  }
  return output as T;
}

async function downloadBlob(response: Response, fallbackFilename: string) {
  if (!response.ok) {
    const error = await response.json().catch(() => ({ errorMessage: "导出失败。" }));
    throw new Error(error.errorMessage || "导出失败。");
  }

  const blob = await response.blob();
  const disposition = response.headers.get("Content-Disposition") || "";
  const encodedMatch = disposition.match(/filename\*=UTF-8''([^;]+)/i);
  const plainMatch = disposition.match(/filename="?([^";]+)"?/i);
  const filename = encodedMatch ? decodeURIComponent(encodedMatch[1]) : plainMatch?.[1] || fallbackFilename;
  triggerBlobDownload(blob, filename);
}

export function triggerBlobDownload(blob: Blob, filename: string) {
  const url = URL.createObjectURL(blob);
  const anchor = document.createElement("a");
  anchor.href = url;
  anchor.download = filename;
  document.body.appendChild(anchor);
  anchor.click();
  anchor.remove();
  URL.revokeObjectURL(url);
}

export async function downloadAsset(url: string, filename: string) {
  const anchor = document.createElement("a");
  anchor.href = apiUrl(url);
  anchor.download = filename;
  anchor.rel = "noopener";
  document.body.appendChild(anchor);
  anchor.click();
  anchor.remove();
}

export function exportProjectJson(project: ExportProject) {
  const safeProject = sanitizeProjectForExport(project);
  const blob = new Blob([JSON.stringify(safeProject, null, 2)], { type: "application/json;charset=utf-8" });
  triggerBlobDownload(blob, `project_${sanitizeFilename(project.projectName)}_${timestamp()}.json`);
}

export async function exportProjectPackage(project: ExportProject, assets: ExportAsset[], filename = `aigc_project_export_${timestamp()}.zip`) {
  const response = await fetch(apiUrl("/api/export/project-package"), {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ project: sanitizeProjectForExport(project), assetUrls: assets })
  });
  await downloadBlob(response, filename);
}

export async function exportOutputAssets(project: ExportProject, assets: ExportAsset[], emptyMessage: string) {
  if (assets.length === 0) throw new Error(emptyMessage);
  if (assets.length === 1) {
    const asset = assets[0];
    await downloadAsset(asset.url, asset.filename || `aigc_asset_${timestamp()}${extensionFromUrl(asset.url)}`);
    return;
  }
  await exportProjectPackage(project, assets);
}
