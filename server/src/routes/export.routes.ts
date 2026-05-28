import { Router } from "express";
import {
  contentTypeForFilename,
  createZipBuffer,
  extensionFromUrl,
  folderForAsset,
  inferAssetType,
  readAssetBytes,
  sanitizeFilename,
  sanitizeProjectForExport,
  type ExportAsset,
  type ZipEntry
} from "../utils/exportFiles.js";

export const exportRouter = Router();

type ProjectPackageRequest = {
  project?: Record<string, unknown>;
  assetUrls?: Array<string | ExportAsset>;
};

function attachmentName(filename?: string, fallback = "aigc_asset") {
  const safe = sanitizeFilename(filename || fallback);
  return safe.includes(".") ? safe : `${safe}.bin`;
}

async function buildAssetEntries(assetUrls: Array<string | ExportAsset>) {
  const assets: Array<ExportAsset & { filename: string; exportPath: string }> = [];
  const entries: ZipEntry[] = [];

  for (const [index, item] of assetUrls.entries()) {
    const asset: ExportAsset = typeof item === "string" ? { url: item } : item;
    if (!asset.url) continue;
    const type = inferAssetType(asset.url, asset.type);
    const ext = extensionFromUrl(asset.url, type === "image" ? ".png" : type === "audio" ? ".mp3" : ".mp4");
    const baseName = asset.filename
      ? sanitizeFilename(asset.filename.replace(/\.[^.]+$/, ""))
      : sanitizeFilename(`${type}_${asset.nodeTitle || asset.nodeId || index + 1}`);
    const filename = `${baseName}${ext}`;
    const exportPath = `project_export/${folderForAsset(type)}/${filename}`;
    const data = await readAssetBytes(asset.url);

    entries.push({ name: exportPath, data });
    assets.push({ ...asset, type, filename, exportPath });
  }

  return { assets, entries };
}

exportRouter.get("/asset", async (req, res) => {
  try {
    const url = String(req.query.url || "");
    if (!url) return res.status(400).json({ status: "error", errorMessage: "缺少下载地址。" });

    const filename = attachmentName(String(req.query.filename || ""), `aigc_asset${extensionFromUrl(url)}`);
    const data = await readAssetBytes(url);
    res.setHeader("Content-Type", contentTypeForFilename(filename));
    res.setHeader("Content-Disposition", `attachment; filename*=UTF-8''${encodeURIComponent(filename)}`);
    return res.send(data);
  } catch (error) {
    const message = error instanceof Error && error.message === "REMOTE_ASSET_DOWNLOAD_FAILED" ? "远程素材下载失败，请检查链接是否过期。" : "素材下载失败。";
    return res.status(400).json({ status: "error", errorMessage: message });
  }
});

exportRouter.post("/project-package", async (req, res) => {
  try {
    const body = req.body as ProjectPackageRequest;
    const project = sanitizeProjectForExport(body.project ?? {});
    const assetUrls = body.assetUrls ?? [];
    const exportedAt = new Date().toISOString();
    const projectName = String(project.projectName || project.name || "aigc_project");
    const { assets, entries } = await buildAssetEntries(assetUrls);

    const manifest = {
      projectName,
      exportedAt,
      assets: assets.map((asset) => ({
        nodeId: asset.nodeId,
        nodeTitle: asset.nodeTitle,
        type: asset.type,
        filename: asset.filename,
        sourceUrl: asset.url,
        exportPath: asset.exportPath
      }))
    };

    const zip = createZipBuffer([
      { name: "project_export/project.json", data: Buffer.from(JSON.stringify(project, null, 2), "utf8") },
      { name: "project_export/manifest.json", data: Buffer.from(JSON.stringify(manifest, null, 2), "utf8") },
      ...entries
    ]);

    const filename = `aigc_project_export_${sanitizeFilename(projectName)}_${Date.now()}.zip`;
    res.setHeader("Content-Type", "application/zip");
    res.setHeader("Content-Disposition", `attachment; filename*=UTF-8''${encodeURIComponent(filename)}`);
    return res.send(zip);
  } catch (error) {
    const message = error instanceof Error && error.message === "REMOTE_ASSET_DOWNLOAD_FAILED" ? "远程素材下载失败，请检查链接是否过期。" : "导出项目包失败。";
    return res.status(400).json({ status: "error", errorMessage: message });
  }
});
