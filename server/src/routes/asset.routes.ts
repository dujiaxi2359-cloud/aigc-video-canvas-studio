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
  getAsset,
  getAssetPreviewInfo,
  listAssets,
  listFolders,
  updateAsset,
  updateFolder
} from "../services/asset.service.js";
import { contentTypeForFilename, resolveLocalUploadPath } from "../utils/exportFiles.js";
import { signedCdnUrlForCosKey } from "../services/storage/cosStorage.service.js";

const uploadRoot = process.env.UPLOAD_DIR ?? "./uploads";
const tempDir = path.resolve(process.cwd(), uploadRoot, "tmp");
fs.mkdirSync(tempDir, { recursive: true });

const upload = multer({ dest: tempDir });

export const assetRouter = Router();

function normalizeSignedUrlPurpose(value: unknown) {
  const purpose = String(value || "preview");
  return purpose === "play" || purpose === "download" ? purpose : "preview";
}

assetRouter.get("/download", async (req, res) => {
  res.status(410).json({
    status: "error",
    errorCode: "BACKEND_FILE_PROXY_DISABLED",
    errorMessage: "后端文件流代理已禁用，请使用 /api/assets/:assetId/signed-url 获取 CDN 签名 URL。"
  });
});

assetRouter.post("/download", async (req, res) => {
  res.status(410).json({
    status: "error",
    errorCode: "BACKEND_FILE_PROXY_DISABLED",
    errorMessage: "后端文件流代理已禁用，请使用 /api/assets/:assetId/signed-url 获取 CDN 签名 URL。"
  });
});

assetRouter.post("/:id/signed-url", async (req, res) => {
  try {
    const asset = await getAsset(req.params.id);
    if (!asset?.storageKey) {
      return res.status(404).json({ status: "error", errorCode: "ASSET_CDN_KEY_MISSING", errorMessage: "素材不存在或缺少 COS 对象 Key。" });
    }
    const purpose = normalizeSignedUrlPurpose(req.body?.purpose);
    const signed = signedCdnUrlForCosKey({
      fileKey: asset.storageKey,
      purpose,
      expiresSeconds: Number(req.body?.expiresIn || req.body?.expiresSeconds || 0)
    });
    res.json({
      signedUrl: signed.signedUrl,
      expiresAt: signed.expiresAt,
      deliveryProvider: signed.deliveryProvider,
      assetId: asset.id,
      purpose
    });
  } catch (error) {
    const code = error instanceof Error ? error.message : "ASSET_SIGNED_URL_FAILED";
    const status = code === "ASSET_NOT_FOUND" ? 404 : code === "CDN_NOT_CONFIGURED" || code === "CDN_AUTH_KEY_REQUIRED" ? 503 : 400;
    res.status(status).json({
      status: "error",
      errorCode: code,
      errorMessage: code === "CDN_NOT_CONFIGURED"
        ? "CDN 尚未配置，无法生成 CDN 签名访问 URL。"
        : code === "CDN_AUTH_KEY_REQUIRED"
          ? "CDN URL 鉴权已开启，但缺少鉴权 Key。"
          : "生成 CDN 签名访问 URL 失败。"
    });
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

assetRouter.get("/:id/preview", async (req, res) => {
  try {
    const info = await getAssetPreviewInfo(req.params.id);
    res.setHeader("Content-Type", info.contentType);
    res.setHeader("Cache-Control", `public, max-age=${info.cacheSeconds}, immutable`);
    fs.createReadStream(info.localPath).pipe(res);
  } catch (error) {
    const code = error instanceof Error ? error.message : "ASSET_PREVIEW_FAILED";
    const status = code === "ASSET_NOT_FOUND" ? 404 : code === "ASSET_PREVIEW_UNSUPPORTED" ? 415 : 400;
    res.status(status).json({ status: "error", errorCode: code, errorMessage: "素材预览生成失败。" });
  }
});

assetRouter.get("/:id/download", async (req, res) => {
  try {
    const asset = await getAsset(req.params.id);
    if (!asset?.storageKey) throw new Error("ASSET_CDN_KEY_MISSING");
    const signed = signedCdnUrlForCosKey({
      fileKey: asset.storageKey,
      purpose: "download",
      expiresSeconds: Number(req.query.expiresIn || req.query.expiresSeconds || 0)
    });
    res.redirect(302, signed.signedUrl);
  } catch (error) {
    const code = error instanceof Error ? error.message : "DOWNLOAD_FAILED";
    const message = code === "ASSET_NOT_FOUND" ? "素材不存在。" : code === "CDN_NOT_CONFIGURED" ? "CDN 尚未配置，无法下载。" : "生成下载签名 URL 失败。";
    res.status(code === "ASSET_NOT_FOUND" ? 404 : code === "CDN_NOT_CONFIGURED" ? 503 : 400).json({ status: "error", errorCode: code, errorMessage: message });
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
