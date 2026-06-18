import fs from "node:fs";
import path from "node:path";
import { ProviderError } from "../../utils/providerErrors.js";
import { readGeneratedFileMetadata } from "../../utils/mediaMetadata.js";
import { getProviderAssetStrategy, type AssetInputStrategy } from "./providerAssetStrategy.js";
import { uploadLocalFileToOss } from "./ossUpload.service.js";
import { ensureAssetLocalFile } from "./ensureAssetLocalFile.service.js";
import { signedAssetUrl } from "../../utils/assetAccessToken.js";
import { requireRequestContext } from "../requestContext.js";
import {
  cachedSignedCosUrl,
  isCosConfigured,
  isCosLocalPath,
  normalizeCosKey,
  uploadLocalFileToCos,
  type StorageFileType
} from "../storage/cosStorage.service.js";

export type AssetLike = {
  id?: string;
  localPath?: string;
  url?: string;
  publicUrl?: string;
  mimeType?: string;
  filename?: string;
  originalName?: string;
  projectId?: string;
  storageKey?: string;
  storageProvider?: string;
  storageBucket?: string;
  storageRegion?: string;
  storageFileType?: string;
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
  aspectRatio?: string;
  fileSize?: number;
  source?: "publicUrl" | "remoteUrl" | "localPath" | "backendPublicUrl" | "oss" | "cos";
  wasCompressed?: boolean;
};

type ResolveRemoteAssetOptions = {
  strategy?: Partial<AssetInputStrategy>;
};

const assetUrlProbeTimeoutMs = Number(process.env.ASSET_URL_PROBE_TIMEOUT_MS || 8000);

function isLocalhostUrl(url: string) {
  try {
    const parsed = new URL(url);
    return ["localhost", "127.0.0.1", "::1"].includes(parsed.hostname);
  } catch {
    return false;
  }
}

function isPrivateNetworkHost(hostname: string) {
  return ["localhost", "127.0.0.1", "::1", "0.0.0.0"].includes(hostname)
    || hostname.endsWith(".local")
    || /^10\./.test(hostname)
    || /^192\.168\./.test(hostname)
    || /^172\.(1[6-9]|2\d|3[0-1])\./.test(hostname)
    || /^169\.254\./.test(hostname);
}

function isPublicHttpUrl(url?: string) {
  if (!url || !/^https?:\/\//i.test(url)) return false;
  try {
    return !isPrivateNetworkHost(new URL(url).hostname);
  } catch {
    return false;
  }
}

function isRemoteHttpUrl(url?: string) {
  return isPublicHttpUrl(url);
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

function backendAssetUrl(url?: string) {
  const publicBaseUrl = backendPublicBaseUrl();
  if (!url || !publicBaseUrl) return undefined;
  try {
    const publicBase = new URL(publicBaseUrl);
    const parsed = new URL(url, publicBase);
    if (parsed.origin !== publicBase.origin || !parsed.pathname.startsWith("/uploads/")) return undefined;
    return signedAssetUrl(parsed.toString());
  } catch {
    return undefined;
  }
}

function publicUrlFromBackendUrl(url?: string) {
  const publicBaseUrl = backendPublicBaseUrl();
  if (!url || !publicBaseUrl) return undefined;

  if (/^https?:\/\//i.test(url)) {
    try {
      const parsed = new URL(url);
      if (!isLocalhostUrl(url)) return undefined;
      return signedAssetUrl(`${publicBaseUrl}${parsed.pathname}${parsed.search}`);
    } catch {
      return undefined;
    }
  }

  return signedAssetUrl(`${publicBaseUrl}${url.startsWith("/") ? url : `/${url}`}`);
}

function publicUrlFromLocalPath(localPath?: string) {
  const publicBaseUrl = backendPublicBaseUrl();
  if (!localPath || !publicBaseUrl) return undefined;

  const uploadRoot = path.resolve(process.cwd(), process.env.UPLOAD_DIR ?? "./uploads");
  const absolutePath = path.resolve(localPath);
  const relativeToUpload = path.relative(uploadRoot, absolutePath);

  if (relativeToUpload && !relativeToUpload.startsWith("..") && !path.isAbsolute(relativeToUpload)) {
    const urlPath = `/uploads/${relativeToUpload.split(path.sep).map(encodeURIComponent).join("/")}`;
    return signedAssetUrl(`${publicBaseUrl}${urlPath}`);
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
    return signedAssetUrl(`${publicBaseUrl}${urlPath}`);
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

async function ensureLocalAssetForRead(asset: AssetLike) {
  return ensureAssetLocalFile(asset, "模型引用的素材");
}

function attachLocalMetadata(result: ResolvedRemoteAsset, metadata: Awaited<ReturnType<typeof readGeneratedFileMetadata>>) {
  result.width = metadata.width;
  result.height = metadata.height;
  if (metadata.width && metadata.height) {
    const gcd = (a: number, b: number): number => (b ? gcd(b, a % b) : a);
    const divisor = gcd(metadata.width, metadata.height);
    result.aspectRatio = `${Math.round(metadata.width / divisor)}:${Math.round(metadata.height / divisor)}`;
  }
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

function storageFileTypeForMime(mimeType: string): StorageFileType {
  if (mimeType.startsWith("video/")) return "reference";
  if (mimeType.startsWith("audio/")) return "task_temp";
  if (mimeType.startsWith("image/")) return "reference";
  return "task_temp";
}

function cosKeyFromSignedPath(url?: string) {
  if (!url) return undefined;
  try {
    const parsed = new URL(url, "http://local.invalid");
    const key = parsed.searchParams.get("key") || parsed.searchParams.get("fileKey");
    return key ? normalizeCosKey(key) : undefined;
  } catch {
    return undefined;
  }
}

function cosKeyFromLocalPath(localPath?: string) {
  if (!isCosLocalPath(localPath)) return undefined;
  const withoutScheme = String(localPath).replace(/^cos:\/\//i, "");
  const slashIndex = withoutScheme.indexOf("/");
  if (slashIndex < 0) return undefined;
  return normalizeCosKey(withoutScheme.slice(slashIndex + 1));
}

function cosKeyFromAsset(asset: AssetLike) {
  return normalizeCosKey(
    asset.storageKey ||
      cosKeyFromLocalPath(asset.localPath) ||
      cosKeyFromSignedPath(asset.url) ||
      cosKeyFromSignedPath(asset.publicUrl) ||
      ""
  );
}

async function resolveCosAssetUrl(asset: AssetLike, mimeType: string, filename: string) {
  if (!isCosConfigured()) return undefined;

  const existingKey = cosKeyFromAsset(asset);
  if (existingKey) {
    return {
      type: "url" as const,
      url: await cachedSignedCosUrl({ fileKey: existingKey, expiresSeconds: 3600 }),
      mimeType,
      filename,
      localPath: asset.localPath,
      source: "cos" as const
    };
  }

  if (!asset.localPath || isCosLocalPath(asset.localPath) || !fs.existsSync(asset.localPath)) return undefined;
  const { workspace } = requireRequestContext();
  const stored = await uploadLocalFileToCos({
    workspaceId: workspace.id,
    localPath: asset.localPath,
    fileType: storageFileTypeForMime(mimeType),
    originalName: filename,
    mimeType
  });
  return {
    type: "url" as const,
    url: await cachedSignedCosUrl({ fileKey: stored.fileKey, expiresSeconds: 3600 }),
    mimeType,
    filename,
    localPath: asset.localPath,
    source: "cos" as const
  };
}

function shouldProbePublicAssetUrl() {
  return process.env.ASSET_URL_PROBE_DISABLED !== "true";
}

async function probePublicAssetUrl(url: string) {
  if (!shouldProbePublicAssetUrl()) return;
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), assetUrlProbeTimeoutMs);
  try {
    let response = await fetch(url, {
      method: "HEAD",
      redirect: "follow",
      signal: controller.signal
    });
    if (response.status === 405 || response.status === 403) {
      response = await fetch(url, {
        method: "GET",
        headers: { Range: "bytes=0-0" },
        redirect: "follow",
        signal: controller.signal
      });
    }
    if (!response.ok) {
      throw new ProviderError(
        "PUBLIC_URL_REQUIRED",
        `公网素材 URL 不可下载，状态码 ${response.status}。请更新 BACKEND_PUBLIC_BASE_URL、保持内网穿透在线，或配置 OSS 临时上传。`,
        url
      );
    }
  } catch (error) {
    if (error instanceof ProviderError) throw error;
    throw new ProviderError(
      "PUBLIC_URL_REQUIRED",
      "公网素材 URL 不可下载。请更新 BACKEND_PUBLIC_BASE_URL、保持内网穿透在线，或配置 OSS 临时上传。",
      error instanceof Error ? `${url}\n${error.message}` : url
    );
  } finally {
    clearTimeout(timer);
  }
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
  const localMetadata = asset.localPath && !isCosLocalPath(asset.localPath) && fs.existsSync(asset.localPath) ? await readGeneratedFileMetadata(asset.localPath) : {};

  let result: ResolvedRemoteAsset | undefined;

  const cosAsset = strategy.supportsPublicUrl ? await resolveCosAssetUrl(asset, mimeType, filename) : undefined;
  const signedBackendUrl = backendAssetUrl(asset.publicUrl);
  if (cosAsset) {
    result = cosAsset;
  } else if (signedBackendUrl) {
    result = { type: "url", url: signedBackendUrl, mimeType, filename, localPath: asset.localPath, source: "backendPublicUrl" };
  } else if (isPublicHttpUrl(asset.publicUrl)) {
    result = { type: "url", url: asset.publicUrl, mimeType, filename, localPath: asset.localPath, source: "publicUrl" };
  } else if (isRemoteHttpUrl(asset.url)) {
    result = { type: "url", url: asset.url, mimeType, filename, localPath: asset.localPath, source: "remoteUrl" };
  } else if ((asset.localPath || asset.storageKey) && strategy.prefer === "base64" && strategy.supportsBase64) {
    const localAsset = await ensureLocalAssetForRead(asset);
    result = { type: "base64", base64: readLocalFileAsBase64(localAsset.localPath), mimeType, filename, localPath: localAsset.localPath, source: "localPath" };
  } else if ((asset.localPath || asset.storageKey) && strategy.prefer === "multipart" && strategy.supportsMultipart) {
    const localAsset = await ensureLocalAssetForRead(asset);
    result = { type: "multipart", mimeType, filename, localPath: localAsset.localPath, source: "localPath" };
  } else if (strategy.supportsPublicUrl && publicUrlFromBackendUrl(asset.url)) {
    result = { type: "url", url: publicUrlFromBackendUrl(asset.url), mimeType, filename, localPath: asset.localPath, source: "backendPublicUrl" };
  } else if (asset.localPath && strategy.supportsPublicUrl && publicUrlFromLocalPath(asset.localPath)) {
    assertLocalFile(asset.localPath);
    result = { type: "url", url: publicUrlFromLocalPath(asset.localPath), mimeType, filename, localPath: asset.localPath, source: "backendPublicUrl" };
  } else if (asset.localPath && !isCosLocalPath(asset.localPath) && strategy.supportsPublicUrl) {
    const oss = await uploadLocalFileToOss({
      localPath: asset.localPath,
      mimeType,
      assetType: assetTypeForMime(mimeType),
      projectId: asset.projectId,
      assetId: asset.id
    });
    result = { type: "url", url: oss.publicUrl || oss.signedUrl, mimeType, filename, localPath: asset.localPath, source: "oss" };
  }

  if (!result && (asset.localPath || asset.storageKey) && strategy.supportsBase64) {
    const localAsset = await ensureLocalAssetForRead(asset);
    result = { type: "base64", base64: readLocalFileAsBase64(localAsset.localPath), mimeType, filename, localPath: localAsset.localPath, source: "localPath" };
  }
  if (!result && (asset.localPath || asset.storageKey) && strategy.supportsMultipart) {
    const localAsset = await ensureLocalAssetForRead(asset);
    result = { type: "multipart", mimeType, filename, localPath: localAsset.localPath, source: "localPath" };
  }
  if (result?.type === "url" && result.url) await probePublicAssetUrl(result.url);
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
    aspectRatio: result?.aspectRatio,
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
