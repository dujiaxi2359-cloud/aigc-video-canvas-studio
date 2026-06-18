import fs from "node:fs";
import path from "node:path";
import { ProviderError } from "../../utils/providerErrors.js";
import {
  cosKeyFromLocalPath,
  downloadCosFileToLocal,
  isCosConfigured,
  isCosLocalPath,
  normalizeCosKey
} from "../storage/cosStorage.service.js";

export type LocalFileAssetLike = {
  id?: string;
  localPath?: string;
  storageKey?: string;
  originalName?: string;
  fileName?: string;
  filename?: string;
  mimeType?: string;
};

function cacheRoot() {
  const uploadRoot = process.env.UPLOAD_DIR ?? "./uploads";
  return path.resolve(process.cwd(), uploadRoot, "temp", "cos-assets");
}

function safeExtension(asset: LocalFileAssetLike) {
  const candidate = asset.originalName || asset.fileName || asset.filename || asset.localPath || "";
  const ext = path.extname(candidate).toLowerCase();
  if (ext && /^[a-z0-9.]+$/i.test(ext) && ext.length <= 12) return ext;
  if (asset.mimeType?.startsWith("image/jpeg")) return ".jpg";
  if (asset.mimeType?.startsWith("image/png")) return ".png";
  if (asset.mimeType?.startsWith("image/webp")) return ".webp";
  if (asset.mimeType?.startsWith("video/mp4")) return ".mp4";
  if (asset.mimeType?.startsWith("video/quicktime")) return ".mov";
  if (asset.mimeType?.startsWith("audio/mpeg")) return ".mp3";
  return ".bin";
}

function keyFromAsset(asset: LocalFileAssetLike) {
  return normalizeCosKey(asset.storageKey || cosKeyFromLocalPath(asset.localPath) || "");
}

function cachePathFor(asset: LocalFileAssetLike, key: string) {
  const idPart = String(asset.id || "asset").replace(/[^a-zA-Z0-9_-]/g, "_");
  const keyPart = Buffer.from(key).toString("base64url").slice(0, 48);
  return path.join(cacheRoot(), `${idPart}_${keyPart}${safeExtension(asset)}`);
}

export async function ensureAssetLocalFile<T extends LocalFileAssetLike>(
  asset: T | undefined,
  label = "素材"
): Promise<T & { localPath: string; localFileSource: "local" | "cos-cache" | "cos" }> {
  if (!asset) {
    throw new ProviderError("MISSING_INPUT_ASSET", `${label}不存在或已被删除。`);
  }

  if (asset.localPath && !isCosLocalPath(asset.localPath) && fs.existsSync(asset.localPath)) {
    return {
      ...asset,
      localPath: asset.localPath,
      localFileSource: "local" as const
    };
  }

  const key = keyFromAsset(asset);
  if (!key) {
    throw new ProviderError("ASSET_FILE_NOT_FOUND", `${label}文件不存在，请重新上传素材。`, asset.localPath);
  }
  if (!isCosConfigured()) {
    throw new ProviderError("PROVIDER_ERROR", `${label}已在云端存储，但当前服务未配置 COS 读取环境变量。`);
  }

  const cachedPath = cachePathFor(asset, key);
  if (fs.existsSync(cachedPath) && fs.statSync(cachedPath).size > 0) {
    return {
      ...asset,
      localPath: cachedPath,
      localFileSource: "cos-cache" as const
    };
  }

  try {
    await downloadCosFileToLocal({ fileKey: key, localPath: cachedPath });
    return {
      ...asset,
      localPath: cachedPath,
      localFileSource: "cos" as const
    };
  } catch (error) {
    throw new ProviderError(
      "ASSET_FILE_NOT_FOUND",
      `${label}云端文件下载失败，请检查 COS 文件是否存在或重新上传素材。`,
      error instanceof Error ? `${key}\n${error.message}` : key
    );
  }
}
