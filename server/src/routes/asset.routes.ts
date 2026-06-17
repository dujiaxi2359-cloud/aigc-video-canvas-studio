import fs from "node:fs";
import path from "node:path";
import { Router } from "express";
import multer from "multer";
import {
  createAsset,
  createAssetFromUpload,
  createFolder,
  deleteAsset,
  deleteFolder,
  getAssetDownloadInfo,
  listAssets,
  listFolders,
  updateAsset,
  updateFolder
} from "../services/asset.service.js";
import { contentTypeForFilename, extensionFromUrl, readAssetBytes, resolveLocalUploadPath, sanitizeFilename } from "../utils/exportFiles.js";

const uploadRoot = process.env.UPLOAD_DIR ?? "./uploads";
const tempDir = path.resolve(process.cwd(), uploadRoot, "tmp");
fs.mkdirSync(tempDir, { recursive: true });

const upload = multer({ dest: tempDir });

export const assetRouter = Router();

assetRouter.get("/download", async (req, res) => {
  try {
    const url = String(req.query.url || "");
    if (!url) return res.status(400).json({ status: "error", errorCode: "DOWNLOAD_FAILED", errorMessage: "缺少下载地址。" });

    const rawFilename = String(req.query.filename || `aigc_asset${extensionFromUrl(url)}`);
    const filename = sanitizeFilename(rawFilename);
    const data = await readAssetBytes(url);

    res.setHeader("Content-Type", contentTypeForFilename(filename));
    res.setHeader("Content-Disposition", `attachment; filename*=UTF-8''${encodeURIComponent(filename)}`);
    res.send(data);
  } catch (error) {
    const message = error instanceof Error && error.message === "REMOTE_ASSET_DOWNLOAD_FAILED" ? "远程素材下载失败，请检查链接是否过期。" : "素材下载失败。";
    res.status(400).json({ status: "error", errorCode: "DOWNLOAD_FAILED", errorMessage: message });
  }
});

assetRouter.post("/download", async (req, res) => {
  try {
    const url = String(req.body?.url || "");
    if (!url) return res.status(400).json({ status: "error", errorCode: "DOWNLOAD_FAILED", errorMessage: "缺少下载地址。" });

    const rawFilename = String(req.body?.filename || `aigc_asset${extensionFromUrl(url)}`);
    const filename = sanitizeFilename(rawFilename);
    const data = await readAssetBytes(url);

    res.setHeader("Content-Type", contentTypeForFilename(filename));
    res.setHeader("Content-Disposition", `attachment; filename*=UTF-8''${encodeURIComponent(filename)}`);
    res.send(data);
  } catch (error) {
    const message = error instanceof Error && error.message === "REMOTE_ASSET_DOWNLOAD_FAILED"
      ? "远程素材下载失败，请检查链接是否过期。"
      : error instanceof Error && (error as NodeJS.ErrnoException).code === "ENOENT"
        ? "本地素材文件不存在，请重新生成或上传素材。"
        : "素材下载失败。";
    res.status(400).json({ status: "error", errorCode: "DOWNLOAD_FAILED", errorMessage: message });
  }
});

assetRouter.get("/folders", async (req, res, next) => {
  try {
    res.json(await listFolders(req.query.projectId as string | undefined));
  } catch (error) {
    next(error);
  }
});

assetRouter.post("/folders", async (req, res) => {
  try {
    res.status(201).json(await createFolder({ name: String(req.body?.name || ""), parentId: req.body?.parentId ?? null, projectId: req.body?.projectId }));
  } catch (error) {
    const code = error instanceof Error ? error.message : "FOLDER_CREATE_FAILED";
    const message = code === "FOLDER_NAME_DUPLICATED" ? "同一目录下已经有同名文件夹。" : code === "FOLDER_NAME_REQUIRED" ? "文件夹名称不能为空。" : "新建文件夹失败。";
    res.status(400).json({ status: "error", errorCode: code, errorMessage: message });
  }
});

assetRouter.patch("/folders/:id", async (req, res) => {
  try {
    const folder = await updateFolder(req.params.id, { name: req.body?.name, parentId: req.body?.parentId });
    if (!folder) return res.status(404).json({ status: "error", errorCode: "FOLDER_NOT_FOUND", errorMessage: "文件夹不存在。" });
    res.json(folder);
  } catch (error) {
    const code = error instanceof Error ? error.message : "FOLDER_UPDATE_FAILED";
    const message = code === "FOLDER_NAME_REQUIRED" ? "文件夹名称不能为空。" : "更新文件夹失败。";
    res.status(400).json({ status: "error", errorCode: code, errorMessage: message });
  }
});

assetRouter.delete("/folders/:id", async (req, res) => {
  try {
    await deleteFolder(req.params.id);
    res.status(204).end();
  } catch (error) {
    const code = error instanceof Error ? error.message : "FOLDER_DELETE_FAILED";
    res.status(400).json({
      status: "error",
      errorCode: code,
      errorMessage: code === "FOLDER_NOT_EMPTY" ? "文件夹内还有素材或子文件夹，请先移动或删除后再操作。" : "删除文件夹失败。"
    });
  }
});

assetRouter.post("/upload", upload.single("file"), async (req, res, next) => {
  try {
    if (!req.file) return res.status(400).json({ status: "error", errorCode: "UPLOAD_FAILED", errorMessage: "没有选择上传文件。" });
    res.status(201).json(await createAssetFromUpload(req.file, { folderId: req.body?.folderId || null, name: req.body?.name, projectId: req.body?.projectId }));
  } catch (error) {
    next(error);
  }
});

assetRouter.post("/import-generated", async (req, res) => {
  try {
    const url = String(req.body?.url || "");
    const localPath = resolveLocalUploadPath(url);
    if (!url || !localPath) return res.status(400).json({ status: "error", errorCode: "ASSET_IMPORT_FAILED", errorMessage: "只能导入本地 /uploads 下的生成结果。" });
    if (!fs.existsSync(localPath)) return res.status(404).json({ status: "error", errorCode: "ASSET_FILE_MISSING", errorMessage: "生成结果文件不存在。" });

    const asset = await createAsset({
      type: "generated",
      source: "generated",
      name: req.body?.name,
      folderId: req.body?.folderId ?? null,
      originalName: path.basename(localPath),
      localPath,
      url,
      providerId: req.body?.providerId,
      modelId: req.body?.modelId,
      nodeId: req.body?.nodeId,
      projectId: req.body?.projectId,
      prompt: req.body?.prompt,
      negativePrompt: req.body?.negativePrompt,
      generationParams: req.body?.generationParams
    });
    res.status(201).json(asset);
  } catch (error) {
    res.status(400).json({ status: "error", errorCode: "ASSET_IMPORT_FAILED", errorMessage: "导入生成结果失败。" });
  }
});

assetRouter.get("/", async (req, res, next) => {
  try {
    res.json(await listAssets({
      type: req.query.type as string | undefined,
      folderId: req.query.folderId as string | undefined,
      source: req.query.source as string | undefined,
      projectId: req.query.projectId as string | undefined,
      keyword: req.query.keyword as string | undefined,
      sortBy: req.query.sortBy as string | undefined,
      sortOrder: req.query.sortOrder as string | undefined
    }));
  } catch (error) {
    next(error);
  }
});

assetRouter.get("/:id/download", async (req, res) => {
  try {
    const info = await getAssetDownloadInfo(req.params.id);
    if (info.redirectUrl) return res.redirect(302, info.redirectUrl);
    if (!info.localPath) throw new Error("ASSET_FILE_MISSING");
    res.setHeader("Content-Type", info.contentType);
    res.setHeader("Content-Disposition", `attachment; filename*=UTF-8''${encodeURIComponent(info.filename)}`);
    fs.createReadStream(info.localPath).pipe(res);
  } catch (error) {
    const code = error instanceof Error ? error.message : "DOWNLOAD_FAILED";
    const message = code === "ASSET_NOT_FOUND" ? "素材不存在。" : code === "ASSET_FILE_MISSING" ? "素材记录存在，但本地文件丢失。" : "下载失败。";
    res.status(code === "ASSET_NOT_FOUND" ? 404 : 400).json({ status: "error", errorCode: code, errorMessage: message });
  }
});

assetRouter.patch("/:id", async (req, res) => {
  try {
    const asset = await updateAsset(req.params.id, { name: req.body?.name, folderId: req.body?.folderId });
    if (!asset) return res.status(404).json({ status: "error", errorCode: "ASSET_NOT_FOUND", errorMessage: "素材不存在。" });
    res.json(asset);
  } catch (error) {
    res.status(400).json({ status: "error", errorCode: "ASSET_UPDATE_FAILED", errorMessage: "更新素材失败。" });
  }
});

assetRouter.delete("/:id", async (req, res, next) => {
  try {
    await deleteAsset(req.params.id, req.query.physical === "true");
    res.status(204).end();
  } catch (error) {
    next(error);
  }
});
