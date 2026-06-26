import fs from "node:fs";
import path from "node:path";
import { Readable } from "node:stream";
import { pipeline } from "node:stream/promises";
import COS from "cos-nodejs-sdk-v5";
import { createId } from "../../utils/id.js";
import { sanitizeFilename } from "../../utils/exportFiles.js";

export type StorageFileType =
  | "image"
  | "video"
  | "reference"
  | "avatar"
  | "generated_image"
  | "generated_video"
  | "cover"
  | "task_temp";

export type StorageRecordInput = {
  fileKey: string;
  bucket?: string;
  region?: string;
  fileType: StorageFileType;
  size?: number;
  mimeType?: string;
  originalName?: string;
};

type CosConfig = {
  secretId: string;
  secretKey: string;
  bucket: string;
  region: string;
  domain: string;
};

type SignedUrlCacheEntry = {
  url: string;
  expiresAt: number;
};

const STORAGE_DIRS: Record<StorageFileType, string> = {
  image: "uploads/images",
  video: "uploads/videos",
  reference: "uploads/reference",
  avatar: "users/avatars",
  generated_image: "generated/images",
  generated_video: "generated/videos",
  cover: "generated/covers",
  task_temp: "temp/tasks"
};

export function storageDirectoryForType(fileType: StorageFileType) {
  return STORAGE_DIRS[fileType] ?? STORAGE_DIRS.task_temp;
}

export function normalizeStorageFileType(fileType?: string, mimeType?: string): StorageFileType {
  const normalized = String(fileType || "").trim().toLowerCase();
  if (normalized === "images" || normalized === "upload_image" || normalized === "uploaded_image") return "image";
  if (normalized === "videos" || normalized === "upload_video" || normalized === "uploaded_video") return "video";
  if (normalized === "reference_image" || normalized === "reference") return "reference";
  if (normalized === "user_avatar" || normalized === "avatars" || normalized === "avatar") return "avatar";
  if (normalized === "ai_image" || normalized === "generated_image" || normalized === "generated-images") return "generated_image";
  if (normalized === "ai_video" || normalized === "generated_video" || normalized === "generated-videos") return "generated_video";
  if (normalized === "video_cover" || normalized === "covers" || normalized === "cover") return "cover";
  if (normalized === "temp" || normalized === "task_temp" || normalized === "task") return "task_temp";
  if (mimeType?.startsWith("image/")) return "image";
  if (mimeType?.startsWith("video/")) return "video";
  return "task_temp";
}

export function isCosConfigured() {
  return Boolean(
    (process.env.TENCENT_COS_SECRET_ID || process.env.TENCENT_SECRET_ID) &&
    (process.env.TENCENT_COS_SECRET_KEY || process.env.TENCENT_SECRET_KEY) &&
    process.env.TENCENT_COS_BUCKET &&
    process.env.TENCENT_COS_REGION
  );
}

export function getCosConfig(): CosConfig {
  const secretId = (process.env.TENCENT_COS_SECRET_ID || process.env.TENCENT_SECRET_ID)?.trim();
  const secretKey = (process.env.TENCENT_COS_SECRET_KEY || process.env.TENCENT_SECRET_KEY)?.trim();
  const bucket = process.env.TENCENT_COS_BUCKET?.trim();
  const region = process.env.TENCENT_COS_REGION?.trim();
  const domain = (process.env.TENCENT_COS_DOMAIN || "").trim().replace(/^https?:\/\//i, "").replace(/\/+$/, "");
  if (!secretId || !secretKey || !bucket || !region) throw new Error("COS_NOT_CONFIGURED");
  return { secretId, secretKey, bucket, region, domain };
}

function createCosClient() {
  const config = getCosConfig();
  return {
    cos: new COS({ SecretId: config.secretId, SecretKey: config.secretKey }),
    config
  };
}

export function normalizeCosKey(fileKey: string) {
  return String(fileKey || "").trim().replace(/^\/+/, "").replace(/\\/g, "/");
}

function falseyEnv(value?: string) {
  return /^(0|false|no|off)$/i.test(String(value || "").trim());
}

export function isCdnDeliveryEnabled() {
  if (!process.env.TENCENT_CDN_BASE_URL?.trim()) return false;
  if (falseyEnv(process.env.USE_CDN_FOR_PUBLIC_ASSETS)) return false;
  return true;
}

export function getCdnBaseUrl() {
  return (process.env.TENCENT_CDN_BASE_URL || "").trim().replace(/\/+$/, "");
}

function encodeCosKeyForUrl(fileKey: string) {
  return normalizeCosKey(fileKey).split("/").map(encodeURIComponent).join("/");
}

export function cdnUrlForCosKey(fileKey?: string | null) {
  if (!fileKey || !isCdnDeliveryEnabled()) return undefined;
  return `${getCdnBaseUrl()}/${encodeCosKeyForUrl(fileKey)}`;
}

export function publicDeliveryProviderForCosKey(fileKey?: string | null) {
  return cdnUrlForCosKey(fileKey) ? "tencent_cdn" : "tencent_cos";
}

function todayPath() {
  const date = new Date();
  const year = date.getFullYear();
  const month = String(date.getMonth() + 1).padStart(2, "0");
  const day = String(date.getDate()).padStart(2, "0");
  return `${year}/${month}/${day}`;
}

export function buildCosFileKey(input: { fileType: StorageFileType; workspaceId: string; originalName?: string }) {
  const ext = path.extname(input.originalName || "") || ".bin";
  const baseName = sanitizeFilename(path.basename(input.originalName || "asset", ext)) || "asset";
  const safeName = `${baseName}`.slice(0, 80);
  const id = createId("file");
  return `${storageDirectoryForType(input.fileType)}/${input.workspaceId}/${todayPath()}/${id}_${safeName}${ext}`;
}

export function storageAccessPath(fileKey: string, options: { disposition?: "inline" | "attachment" } = {}) {
  const params = new URLSearchParams({ key: normalizeCosKey(fileKey), redirect: "1" });
  if (options.disposition) params.set("disposition", options.disposition);
  return `/api/storage/signed-url?${params.toString()}`;
}

export function isCosLocalPath(localPath?: string | null) {
  return Boolean(localPath?.startsWith("cos://"));
}

export function cosKeyFromLocalPath(localPath?: string | null) {
  if (!isCosLocalPath(localPath)) return undefined;
  const withoutScheme = String(localPath).replace(/^cos:\/\//i, "");
  const slashIndex = withoutScheme.indexOf("/");
  if (slashIndex < 0) return undefined;
  return normalizeCosKey(withoutScheme.slice(slashIndex + 1));
}

export async function signCosUpload(input: {
  workspaceId: string;
  fileName?: string;
  fileType?: string;
  mimeType?: string;
  expiresSeconds?: number;
}) {
  const { cos, config } = createCosClient();
  const normalizedType = normalizeStorageFileType(input.fileType, input.mimeType);
  const fileKey = buildCosFileKey({ fileType: normalizedType, workspaceId: input.workspaceId, originalName: input.fileName });
  const uploadUrl = cos.getObjectUrl({
    Bucket: config.bucket,
    Region: config.region,
    Key: fileKey,
    Sign: true,
    Method: "PUT",
    Expires: input.expiresSeconds ?? 900,
    Protocol: "https:"
  });
  return {
    fileKey,
    bucket: config.bucket,
    region: config.region,
    fileType: normalizedType,
    uploadUrl,
    method: "PUT" as const,
    headers: input.mimeType ? { "Content-Type": input.mimeType } : {},
    expiresAt: Date.now() + (input.expiresSeconds ?? 900) * 1000
  };
}

export async function signedCosUrl(input: {
  fileKey: string;
  method?: "GET" | "PUT";
  expiresSeconds?: number;
  responseContentDisposition?: string;
}) {
  const { cos, config } = createCosClient();
  return cos.getObjectUrl({
    Bucket: config.bucket,
    Region: config.region,
    Key: normalizeCosKey(input.fileKey),
    Sign: true,
    Method: input.method ?? "GET",
    Expires: input.expiresSeconds ?? 900,
    Domain: config.domain || undefined,
    Protocol: "https:",
    Query: input.responseContentDisposition ? { "response-content-disposition": input.responseContentDisposition } : undefined
  });
}

const signedUrlCache = new Map<string, SignedUrlCacheEntry>();

export async function cachedSignedCosUrl(input: {
  fileKey: string;
  method?: "GET" | "PUT";
  expiresSeconds?: number;
  responseContentDisposition?: string;
}) {
  const key = normalizeCosKey(input.fileKey);
  const expiresSeconds = input.expiresSeconds ?? 1800;
  const cacheKey = [
    key,
    input.method ?? "GET",
    expiresSeconds,
    input.responseContentDisposition ?? ""
  ].join("|");
  const now = Date.now();
  const cached = signedUrlCache.get(cacheKey);
  if (cached && cached.expiresAt - now > 60_000) return cached.url;
  const url = await signedCosUrl({ ...input, fileKey: key, expiresSeconds });
  signedUrlCache.set(cacheKey, { url, expiresAt: now + expiresSeconds * 1000 });
  if (signedUrlCache.size > 2000) {
    const overflow = signedUrlCache.size - 2000;
    let removed = 0;
    for (const staleKey of signedUrlCache.keys()) {
      signedUrlCache.delete(staleKey);
      removed += 1;
      if (removed >= overflow) break;
    }
  }
  return url;
}

export async function uploadLocalFileToCos(input: {
  workspaceId: string;
  localPath: string;
  fileType: StorageFileType;
  originalName?: string;
  mimeType?: string;
}) {
  const { cos, config } = createCosClient();
  const fileKey = buildCosFileKey({ fileType: input.fileType, workspaceId: input.workspaceId, originalName: input.originalName || input.localPath });
  await cos.putObject({
    Bucket: config.bucket,
    Region: config.region,
    Key: fileKey,
    Body: fs.createReadStream(input.localPath),
    ContentLength: fs.statSync(input.localPath).size,
    ContentType: input.mimeType
  });
  return {
    fileKey,
    bucket: config.bucket,
    region: config.region,
    localPath: `cos://${config.bucket}/${fileKey}`,
    url: storageAccessPath(fileKey, { disposition: "inline" }),
    downloadUrl: storageAccessPath(fileKey, { disposition: "attachment" })
  };
}

export async function deleteCosFile(fileKey: string) {
  const { cos, config } = createCosClient();
  await cos.deleteObject({
    Bucket: config.bucket,
    Region: config.region,
    Key: normalizeCosKey(fileKey)
  });
}

export async function downloadCosFileToLocal(input: {
  fileKey: string;
  localPath: string;
  expiresSeconds?: number;
}) {
  const key = normalizeCosKey(input.fileKey);
  fs.mkdirSync(path.dirname(input.localPath), { recursive: true });
  const url = await cachedSignedCosUrl({
    fileKey: key,
    expiresSeconds: input.expiresSeconds ?? 900
  });
  const response = await fetch(url);
  if (!response.ok || !response.body) {
    throw new Error(`COS_DOWNLOAD_FAILED:${response.status}`);
  }
  await pipeline(Readable.fromWeb(response.body as unknown as Parameters<typeof Readable.fromWeb>[0]), fs.createWriteStream(input.localPath));
  return input.localPath;
}
