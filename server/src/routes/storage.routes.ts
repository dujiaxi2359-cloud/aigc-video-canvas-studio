import { Router } from "express";
import path from "node:path";
import { createAsset, deleteCosAssetFile, getAsset } from "../services/asset.service.js";
import {
  deleteCosFile,
  getCosConfig,
  normalizeCosKey,
  normalizeStorageFileType,
  signCosUpload,
  signedCosUrl,
  storageAccessPath
} from "../services/storage/cosStorage.service.js";
import { contentTypeForFilename, sanitizeFilename } from "../utils/exportFiles.js";
import { requireRequestContext } from "../services/requestContext.js";

export const storageRouter = Router();

function assertWorkspaceKey(fileKey: string) {
  const key = normalizeCosKey(fileKey);
  const { workspace } = requireRequestContext();
  if (!key || !key.includes(`/${workspace.id}/`)) throw new Error("COS_FILE_FORBIDDEN");
  return key;
}

function assetTypeFromStorage(fileType: string) {
  const normalized = normalizeStorageFileType(fileType);
  if (normalized === "video" || normalized === "generated_video") return "video";
  if (normalized === "avatar" || normalized === "reference" || normalized === "cover" || normalized === "generated_image" || normalized === "image") return "image";
  return "unknown";
}

storageRouter.post("/sign-upload", async (req, res) => {
  try {
    const { workspace } = requireRequestContext();
    const signed = await signCosUpload({
      workspaceId: workspace.id,
      fileName: String(req.body?.fileName || req.body?.name || "asset.bin"),
      fileType: req.body?.fileType,
      mimeType: req.body?.mimeType,
      expiresSeconds: Number(req.body?.expiresSeconds || 900)
    });
    res.json(signed);
  } catch (error) {
    const code = error instanceof Error ? error.message : "COS_SIGN_FAILED";
    res.status(code === "COS_NOT_CONFIGURED" ? 503 : 400).json({
      status: "error",
      errorCode: code,
      errorMessage: code === "COS_NOT_CONFIGURED" ? "COS 尚未配置，无法生成上传签名。" : "生成 COS 上传签名失败。"
    });
  }
});

storageRouter.post("/confirm-upload", async (req, res) => {
  try {
    const key = assertWorkspaceKey(String(req.body?.fileKey || req.body?.key || ""));
    const config = getCosConfig();
    const fileType = normalizeStorageFileType(req.body?.fileType, req.body?.mimeType);
    const originalName = String(req.body?.originalName || req.body?.fileName || path.basename(key));
    const asset = await createAsset({
      type: assetTypeFromStorage(fileType),
      source: req.body?.source || "uploaded",
      name: req.body?.name || originalName.replace(/\.[^.]+$/, ""),
      folderId: req.body?.folderId ?? null,
      originalName,
      localPath: `cos://${req.body?.bucket || config.bucket}/${key}`,
      url: storageAccessPath(key, { disposition: "inline" }),
      downloadUrl: storageAccessPath(key, { disposition: "attachment" }),
      size: Number(req.body?.size || 0) || undefined,
      mimeType: req.body?.mimeType || contentTypeForFilename(originalName),
      projectId: req.body?.projectId,
      storageProvider: "tencent_cos",
      storageKey: key,
      storageBucket: String(req.body?.bucket || config.bucket),
      storageRegion: String(req.body?.region || config.region),
      storageFileType: fileType
    });
    res.status(201).json(asset);
  } catch (error) {
    const code = error instanceof Error ? error.message : "COS_CONFIRM_FAILED";
    res.status(code === "COS_FILE_FORBIDDEN" ? 403 : 400).json({
      status: "error",
      errorCode: code,
      errorMessage: code === "COS_FILE_FORBIDDEN" ? "当前工作空间无权确认这个 COS 文件。" : "确认 COS 上传失败。"
    });
  }
});

storageRouter.get("/signed-url", async (req, res) => {
  try {
    const key = assertWorkspaceKey(String(req.query.fileKey || req.query.key || ""));
    const disposition = String(req.query.disposition || "inline") === "attachment" ? "attachment" : "inline";
    const filename = sanitizeFilename(String(req.query.filename || path.basename(key)));
    const signedUrl = await signedCosUrl({
      fileKey: key,
      expiresSeconds: Number(req.query.expires || 900),
      responseContentDisposition: `${disposition}; filename*=UTF-8''${encodeURIComponent(filename)}`
    });
    if (String(req.query.redirect || "") === "1") return res.redirect(302, signedUrl);
    res.json({ url: signedUrl, fileKey: key, expiresAt: Date.now() + Number(req.query.expires || 900) * 1000 });
  } catch (error) {
    const code = error instanceof Error ? error.message : "COS_SIGNED_URL_FAILED";
    res.status(code === "COS_FILE_FORBIDDEN" ? 403 : 400).json({
      status: "error",
      errorCode: code,
      errorMessage: code === "COS_FILE_FORBIDDEN" ? "当前工作空间无权访问这个 COS 文件。" : "生成 COS 临时访问 URL 失败。"
    });
  }
});

storageRouter.delete("/file", async (req, res) => {
  try {
    const assetId = String(req.body?.assetId || req.query.assetId || "");
    if (assetId) {
      const asset = await getAsset(assetId);
      if (!asset?.storageKey) return res.status(404).json({ status: "error", errorCode: "ASSET_NOT_FOUND", errorMessage: "素材不存在或不是 COS 文件。" });
      await deleteCosAssetFile(assetId);
      return res.status(204).end();
    }
    const key = assertWorkspaceKey(String(req.body?.fileKey || req.query.fileKey || req.body?.key || req.query.key || ""));
    await deleteCosFile(key);
    res.status(204).end();
  } catch (error) {
    const code = error instanceof Error ? error.message : "COS_DELETE_FAILED";
    res.status(code === "COS_FILE_FORBIDDEN" ? 403 : 400).json({ status: "error", errorCode: code, errorMessage: "删除 COS 文件失败。" });
  }
});
