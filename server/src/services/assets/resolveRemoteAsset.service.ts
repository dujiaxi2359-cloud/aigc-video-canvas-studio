import fs from "node:fs";
import path from "node:path";
import { ProviderError } from "../../utils/providerErrors.js";
import { readGeneratedFileMetadata } from "../../utils/mediaMetadata.js";
import { getProviderAssetStrategy, type AssetInputStrategy } from "./providerAssetStrategy.js";
import { uploadLocalFileToOss } from "./ossUpload.service.js";

export type AssetLike = {
  id?: string;
  localPath?: string;
  url?: string;
  publicUrl?: string;
  mimeType?: string;
  filename?: string;
  originalName?: string;
  projectId?: string;
};

export type ResolvedRemoteAsset = {
  type: "url" | "base64" | "multipart";
  url?: string;
  base64?: string;
  mimeType: string;
  filename: string;
  localPath?: string;
  width?: number;
  height?: number;
  fileSize?: number;
  source?: "publicUrl" | "remoteUrl" | "localPath" | "backendPublicUrl" | "oss";
  wasCompressed?: boolean;
};

type ResolveRemoteAssetOptions = {
  strategy?: Partial<AssetInputStrategy>;
};

function isLocalhostUrl(url: string) {
  try {
    const parsed = new URL(url);
    return ["localhost", "127.0.0.1", "::1"].includes(parsed.hostname);
  } catch {
    return false;
  }
}

function isRemoteHttpUrl(url?: string) {
  return Boolean(url && /^https?:\/\//i.test(url) && !isLocalhostUrl(url));
}

function mimeTypeFromFilename(filename?: string) {
  const ext = path.extname(filename || "").toLowerCase();
  if (ext === ".jpg" || ext === ".jpeg") return "image/jpeg";
  if (ext === ".webp") return "image/webp";
  if (ext === ".gif") return "image/gif";
  if (ext === ".mp4") return "video/mp4";
  if (ext === ".webm") return "video/webm";
  if (ext === ".mov") return "video/quicktime";
  if (ext === ".mp3") return "audio/mpeg";
  if (ext === ".wav") return "audio/wav";
  return "image/png";
}

function backendPublicBaseUrl() {
  return process.env.BACKEND_PUBLIC_BASE_URL?.replace(/\/$/, "");
}

function publicUrlFromBackendUrl(url?: string) {
  const publicBaseUrl = backendPublicBaseUrl();
  if (!url || !publicBaseUrl) return undefined;

  if (/^https?:\/\//i.test(url)) {
    try {
      const parsed = new URL(url);
      if (!isLocalhostUrl(url)) return undefined;
      return `${publicBaseUrl}${parsed.pathname}${parsed.search}`;
    } catch {
      return undefined;
    }
  }

  return `${publicBaseUrl}${url.startsWith("/") ? url : `/${url}`}`;
}

function publicUrlFromLocalPath(localPath?: string) {
  const publicBaseUrl = backendPublicBaseUrl();
  if (!localPath || !publicBaseUrl) return undefined;

  const uploadRoot = path.resolve(process.cwd(), process.env.UPLOAD_DIR ?? "./uploads");
  const absolutePath = path.resolve(localPath);
  const relativeToUpload = path.relative(uploadRoot, absolutePath);

  if (relativeToUpload && !relativeToUpload.startsWith("..") && !path.isAbsolute(relativeToUpload)) {
    const urlPath = `/uploads/${relativeToUpload.split(path.sep).map(encodeURIComponent).join("/")}`;
    return `${publicBaseUrl}${urlPath}`;
  }

  const normalized = absolutePath.replace(/\\/g, "/");
  const marker = "/uploads/";
  const markerIndex = normalized.lastIndexOf(marker);
  if (markerIndex >= 0) {
    const urlPath = normalized
      .slice(markerIndex)
      .split("/")
      .map((part, index) => (index === 0 ? "" : encodeURIComponent(part)))
      .join("/");
    return `${publicBaseUrl}${urlPath}`;
  }

  return undefined;
}

function assertLocalFile(localPath?: string) {
  if (!localPath) return;
  if (!fs.existsSync(localPath)) {
    throw new ProviderError("ASSET_FILE_NOT_FOUND", "本地素材文件不存在，请重新上传素材。", localPath);
  }
}

export function readLocalFileAsBase64(localPath: string) {
  assertLocalFile(localPath);
  return fs.readFileSync(localPath).toString("base64");
}

export function readLocalFileAsStream(localPath: string) {
  assertLocalFile(localPath);
  return fs.createReadStream(localPath);
}

function attachLocalMetadata(result: ResolvedRemoteAsset, metadata: Awaited<ReturnType<typeof readGeneratedFileMetadata>>) {
  result.width = metadata.width;
  result.height = metadata.height;
  result.fileSize = metadata.fileSize;
  result.wasCompressed = false;
  return result;
}

function assetTypeForMime(mimeType: string) {
  if (mimeType.startsWith("video/")) return "video";
  if (mimeType.startsWith("audio/")) return "audio";
  if (mimeType.startsWith("text/")) return "text";
  return "image";
}

export async function resolveRemoteAsset(
  asset: AssetLike,
  providerId: string,
  purpose: string,
  options: ResolveRemoteAssetOptions = {}
): Promise<ResolvedRemoteAsset> {
  const strategy = getProviderAssetStrategy(providerId, options.strategy);
  const filename = asset.filename || asset.originalName || (asset.localPath ? path.basename(asset.localPath) : "asset.png");
  const mimeType = asset.mimeType || mimeTypeFromFilename(filename || asset.localPath || asset.url);
  const hasPublicUrl = Boolean(asset.publicUrl);
  const hasUrl = Boolean(asset.url);
  const hasLocalPath = Boolean(asset.localPath);
  const localMetadata = asset.localPath && fs.existsSync(asset.localPath) ? await readGeneratedFileMetadata(asset.localPath) : {};

  let result: ResolvedRemoteAsset | undefined;

  if (asset.publicUrl) {
    result = { type: "url", url: asset.publicUrl, mimeType, filename, localPath: asset.localPath, source: "publicUrl" };
  } else if (isRemoteHttpUrl(asset.url)) {
    result = { type: "url", url: asset.url, mimeType, filename, localPath: asset.localPath, source: "remoteUrl" };
  } else if (asset.localPath && strategy.prefer === "base64" && strategy.supportsBase64) {
    result = { type: "base64", base64: readLocalFileAsBase64(asset.localPath), mimeType, filename, localPath: asset.localPath, source: "localPath" };
  } else if (asset.localPath && strategy.prefer === "multipart" && strategy.supportsMultipart) {
    assertLocalFile(asset.localPath);
    result = { type: "multipart", mimeType, filename, localPath: asset.localPath, source: "localPath" };
  } else if (strategy.supportsPublicUrl && publicUrlFromBackendUrl(asset.url)) {
    result = { type: "url", url: publicUrlFromBackendUrl(asset.url), mimeType, filename, localPath: asset.localPath, source: "backendPublicUrl" };
  } else if (asset.localPath && strategy.supportsPublicUrl && publicUrlFromLocalPath(asset.localPath)) {
    assertLocalFile(asset.localPath);
    result = { type: "url", url: publicUrlFromLocalPath(asset.localPath), mimeType, filename, localPath: asset.localPath, source: "backendPublicUrl" };
  } else if (asset.localPath && strategy.supportsPublicUrl) {
    const oss = await uploadLocalFileToOss({
      localPath: asset.localPath,
      mimeType,
      assetType: assetTypeForMime(mimeType),
      projectId: asset.projectId,
      assetId: asset.id
    });
    result = { type: "url", url: oss.publicUrl || oss.signedUrl, mimeType, filename, localPath: asset.localPath, source: "oss" };
  }

  if (!result && asset.localPath && strategy.supportsBase64) {
    result = { type: "base64", base64: readLocalFileAsBase64(asset.localPath), mimeType, filename, localPath: asset.localPath, source: "localPath" };
  }
  if (!result && asset.localPath && strategy.supportsMultipart) {
    assertLocalFile(asset.localPath);
    result = { type: "multipart", mimeType, filename, localPath: asset.localPath, source: "localPath" };
  }
  if (result) attachLocalMetadata(result, localMetadata);

  console.log("[resolveRemoteAsset]", {
    providerId,
    purpose,
    hasPublicUrl,
    hasUrl,
    hasLocalPath,
    strategy,
    resultType: result?.type,
    resultSource: result?.source,
    width: result?.width,
    height: result?.height,
    fileSize: result?.fileSize
  });

  if (!result) {
    throw new ProviderError(
      "PUBLIC_URL_REQUIRED",
      "当前模型需要可访问的素材 URL。请配置 BACKEND_PUBLIC_BASE_URL，或启用 OSS 临时上传。"
    );
  }
  return result;
}
