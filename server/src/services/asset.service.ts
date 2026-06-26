import fs from "node:fs";
import path from "node:path";
import sharp from "sharp";
import { getDb } from "../db/database.js";
import { createId } from "../utils/id.js";
import { now } from "../utils/time.js";
import { assetTypeFromMime } from "../utils/file.js";
import { contentTypeForFilename, sanitizeFilename } from "../utils/exportFiles.js";
import { readGeneratedFileMetadata } from "../utils/mediaMetadata.js";
import type { Asset, AssetFolder } from "../types/asset.js";
import { requireRequestContext } from "./requestContext.js";
import {
  cdnUrlForCosKey,
  deleteCosFile,
  downloadCosFileToLocal,
  isCosConfigured,
  isCosLocalPath,
  normalizeStorageFileType,
  publicDeliveryProviderForCosKey,
  storageAccessPath,
  uploadLocalFileToCos
} from "./storage/cosStorage.service.js";
import type { StorageFileType } from "./storage/cosStorage.service.js";

type AssetRow = Record<string, any>;

export type AssetQuery = {
  type?: string;
  folderId?: string | null;
  source?: string;
  projectId?: string;
  keyword?: string;
  sortBy?: string;
  sortOrder?: string;
};

export type CreateAssetInput = {
  type: Asset["type"];
  name?: string;
  source?: Asset["source"];
  folderId?: string | null;
  originalName: string;
  localPath: string;
  url: string;
  publicUrl?: string;
  downloadUrl?: string;
  cosUrl?: string;
  cdnUrl?: string;
  posterUrl?: string;
  previewUrl?: string;
  downloadableUrl?: string;
  size?: number;
  mimeType?: string;
  duration?: number;
  thumbnailUrl?: string;
  thumbnailKey?: string;
  posterKey?: string;
  previewKey?: string;
  providerId?: string;
  modelId?: string;
  nodeId?: string;
  projectId?: string;
  prompt?: string;
  negativePrompt?: string;
  generationParams?: Record<string, unknown>;
  storageProvider?: string;
  storageKey?: string;
  storageBucket?: string;
  storageRegion?: string;
  storageFileType?: string;
  originalStorageProvider?: string;
  previewStorageProvider?: string;
  publicDeliveryProvider?: string;
};

const uploadRoot = () => process.env.UPLOAD_DIR ?? "./uploads";
const assetRoot = () => path.resolve(process.cwd(), uploadRoot(), "assets");

function assetFolderForType(type: string) {
  if (type === "image") return "images";
  if (type === "video") return "videos";
  if (type === "audio") return "audios";
  if (type === "text" || type === "script") return "texts";
  return "unknown";
}

function publicAssetUrl(type: string, fileName: string) {
  return `/uploads/assets/${assetFolderForType(type)}/${path.basename(fileName)}`;
}

function publicThumbnailUrl(fileName: string) {
  return `/uploads/assets/thumbnails/${path.basename(fileName)}`;
}

function isStorageSignedAccessPath(value?: string | null) {
  return Boolean(value?.startsWith("/api/storage/signed-url"));
}

function displayUrlForStorageKey(input: { storageKey?: string; cdnUrl?: string; publicUrl?: string; url?: string; cosUrl?: string }) {
  const derivedCdnUrl = input.cdnUrl || cdnUrlForCosKey(input.storageKey);
  const derivedCosUrl = input.cosUrl || (input.storageKey ? storageAccessPath(input.storageKey, { disposition: "inline" }) : undefined);
  return {
    cdnUrl: derivedCdnUrl,
    cosUrl: derivedCosUrl,
    displayUrl: derivedCdnUrl || input.publicUrl || input.url || derivedCosUrl
  };
}

function inferTypeFromPath(localPath: string): Asset["type"] {
  const ext = path.extname(localPath).toLowerCase();
  if ([".png", ".jpg", ".jpeg", ".webp", ".gif"].includes(ext)) return "image";
  if ([".mp4", ".mov", ".webm", ".m4v"].includes(ext)) return "video";
  if ([".mp3", ".wav", ".m4a", ".aac"].includes(ext)) return "audio";
  if ([".txt", ".json", ".srt", ".ass", ".lrc"].includes(ext)) return "text";
  return "unknown";
}

function toAsset(row: AssetRow): Asset {
  const storageKey = row.storage_key as string | undefined;
  const urls = displayUrlForStorageKey({
    storageKey,
    cdnUrl: row.cdn_url,
    publicUrl: row.public_url,
    url: row.url,
    cosUrl: row.cos_url
  });
  const cosDownloadUrl = storageKey ? storageAccessPath(storageKey, { disposition: "attachment" }) : undefined;
  const thumbnailUrl = row.thumbnail_path
    || (row.thumbnail_key ? cdnUrlForCosKey(row.thumbnail_key) || storageAccessPath(row.thumbnail_key, { disposition: "inline" }) : undefined)
    || (row.type === "image" ? urls.cdnUrl || row.public_url : undefined);
  const posterUrl = row.poster_url
    || (row.poster_key ? cdnUrlForCosKey(row.poster_key) || storageAccessPath(row.poster_key, { disposition: "inline" }) : undefined);
  const previewUrl = row.preview_url
    || (row.preview_key ? cdnUrlForCosKey(row.preview_key) || storageAccessPath(row.preview_key, { disposition: "inline" }) : undefined);
  const savedDownloadableUrl = isStorageSignedAccessPath(row.downloadable_url) ? undefined : row.downloadable_url;
  const savedDownloadUrl = isStorageSignedAccessPath(row.download_url) ? undefined : row.download_url;
  const downloadableUrl = savedDownloadableUrl || urls.displayUrl || savedDownloadUrl || cosDownloadUrl;
  return {
    id: row.id,
    name: row.name || row.original_name,
    type: row.type,
    source: row.source || "uploaded",
    folderId: row.folder_id ?? null,
    fileName: row.file_name || path.basename(row.local_path || row.url || row.original_name),
    originalName: row.original_name,
    localPath: row.local_path,
    url: urls.displayUrl ?? row.url,
    outputUrl: urls.displayUrl ?? row.url,
    publicUrl: row.public_url,
    downloadUrl: downloadableUrl,
    cosUrl: urls.cosUrl,
    cdnUrl: urls.cdnUrl,
    posterUrl,
    previewUrl,
    downloadableUrl,
    size: row.size,
    mimeType: row.mime_type,
    width: row.width,
    height: row.height,
    duration: row.duration,
    fps: row.fps,
    thumbnailUrl,
    thumbnailKey: row.thumbnail_key,
    posterKey: row.poster_key,
    previewKey: row.preview_key,
    storageProvider: row.storage_provider,
    storageKey,
    storageBucket: row.storage_bucket,
    storageRegion: row.storage_region,
    storageFileType: row.storage_file_type,
    originalStorageProvider: row.original_storage_provider,
    previewStorageProvider: row.preview_storage_provider,
    publicDeliveryProvider: row.public_delivery_provider || publicDeliveryProviderForCosKey(storageKey),
    providerId: row.provider_id,
    modelId: row.model_id,
    nodeId: row.node_id,
    projectId: row.project_id,
    prompt: row.prompt,
    negativePrompt: row.negative_prompt,
    generationParams: row.generation_params_json ? JSON.parse(row.generation_params_json) : undefined,
    createdAt: row.created_at,
    updatedAt: row.updated_at
  };
}

async function hydrateCosAsset(asset: Asset): Promise<Asset> {
  if (!asset.storageKey || !isCosConfigured()) return asset;
  const displayUrl = asset.cdnUrl || asset.publicUrl || asset.url;
  return {
    ...asset,
    url: displayUrl,
    outputUrl: asset.cdnUrl || asset.outputUrl || asset.publicUrl || asset.url,
    downloadUrl: asset.downloadableUrl || asset.cdnUrl || asset.downloadUrl || asset.url,
    downloadableUrl: asset.downloadableUrl || asset.cdnUrl || asset.url,
    thumbnailUrl: asset.thumbnailUrl || (asset.type === "image" ? asset.cdnUrl || asset.publicUrl : undefined)
  };
}

function toFolder(row: AssetRow): AssetFolder {
  return {
    id: row.id,
    name: row.name,
    parentId: row.parent_id ?? null,
    projectId: row.project_id,
    createdAt: row.created_at,
    updatedAt: row.updated_at
  };
}

async function createImageThumbnail(localPath: string, assetId: string) {
  const thumbnailsDir = path.join(assetRoot(), "thumbnails");
  fs.mkdirSync(thumbnailsDir, { recursive: true });
  const fileName = `${assetId}.jpg`;
  const target = path.join(thumbnailsDir, fileName);
  await sharp(localPath).resize(480, 480, { fit: "inside", withoutEnlargement: true }).jpeg({ quality: 82 }).toFile(target);
  return publicThumbnailUrl(fileName);
}

function localPathForPublicUploadUrl(url?: string | null) {
  if (!url?.startsWith("/uploads/")) return undefined;
  const relative = url.replace(/^\/uploads\//, "");
  const absolute = path.resolve(process.cwd(), uploadRoot(), relative);
  const root = path.resolve(process.cwd(), uploadRoot());
  if (!absolute.startsWith(root)) return undefined;
  return absolute;
}

export async function getAssetPreviewInfo(id: string) {
  const db = await getDb();
  const row = await db.get("SELECT * FROM assets WHERE id = ? AND workspace_id = ? AND deleted_at IS NULL", id, requireRequestContext().workspace.id) as AssetRow | undefined;
  if (!row) throw new Error("ASSET_NOT_FOUND");
  if (row.type !== "image") throw new Error("ASSET_PREVIEW_UNSUPPORTED");

  const existing = localPathForPublicUploadUrl(row.thumbnail_path);
  if (existing && fs.existsSync(existing)) {
    return {
      localPath: existing,
      contentType: "image/jpeg",
      cacheSeconds: 60 * 60 * 24 * 30
    };
  }

  const thumbnailsDir = path.join(assetRoot(), "thumbnails");
  fs.mkdirSync(thumbnailsDir, { recursive: true });
  const fileName = `${id}.jpg`;
  const target = path.join(thumbnailsDir, fileName);
  if (fs.existsSync(target)) {
    const thumbnailUrl = publicThumbnailUrl(fileName);
    await db.run("UPDATE assets SET thumbnail_path = ?, updated_at = ? WHERE id = ?", thumbnailUrl, now(), id);
    return { localPath: target, contentType: "image/jpeg", cacheSeconds: 60 * 60 * 24 * 30 };
  }

  let sourcePath = row.local_path as string | undefined;
  let tempSource: string | undefined;
  if (!sourcePath || isCosLocalPath(sourcePath) || !fs.existsSync(sourcePath)) {
    if (!row.storage_key) throw new Error("ASSET_PREVIEW_SOURCE_MISSING");
    const ext = path.extname(row.file_name || row.original_name || "") || ".bin";
    tempSource = path.join(assetRoot(), "preview-cache", `${id}${ext}`);
    await downloadCosFileToLocal({ fileKey: row.storage_key, localPath: tempSource, expiresSeconds: 900 });
    sourcePath = tempSource;
  }

  try {
    await sharp(sourcePath).resize(640, 640, { fit: "inside", withoutEnlargement: true }).jpeg({ quality: 78, mozjpeg: true }).toFile(target);
    const thumbnailUrl = publicThumbnailUrl(fileName);
    await db.run("UPDATE assets SET thumbnail_path = ?, updated_at = ? WHERE id = ?", thumbnailUrl, now(), id);
    return {
      localPath: target,
      contentType: "image/jpeg",
      cacheSeconds: 60 * 60 * 24 * 30
    };
  } finally {
    if (tempSource) fs.rmSync(tempSource, { force: true });
  }
}

async function metadataFor(localPath: string) {
  if (!fs.existsSync(localPath)) return {};
  const metadata = await readGeneratedFileMetadata(localPath);
  return {
    width: metadata.width,
    height: metadata.height,
    duration: metadata.duration,
    fps: metadata.fps,
    fileSize: metadata.fileSize ?? fs.statSync(localPath).size
  };
}

async function copyIntoAssetStorage(input: { sourcePath: string; type: Asset["type"]; assetId: string; originalName: string }) {
  const ext = path.extname(input.originalName || input.sourcePath) || path.extname(input.sourcePath) || ".bin";
  const fileName = `${input.assetId}${ext}`;
  const targetDir = path.join(assetRoot(), assetFolderForType(input.type));
  fs.mkdirSync(targetDir, { recursive: true });
  const targetPath = path.join(targetDir, fileName);
  if (path.resolve(input.sourcePath) !== path.resolve(targetPath)) fs.copyFileSync(input.sourcePath, targetPath);
  return { fileName, localPath: targetPath, url: publicAssetUrl(input.type, fileName) };
}

function storageFileTypeForAsset(type: Asset["type"], source?: Asset["source"], preferred?: string): StorageFileType {
  if (preferred) return normalizeStorageFileType(preferred);
  if (source === "generated" && type === "image") return "generated_image";
  if (source === "generated" && type === "video") return "generated_video";
  if (type === "video") return "video";
  if (type === "image") return "image";
  return "task_temp";
}

export async function createAssetFromUpload(file: Express.Multer.File, input: { folderId?: string | null; name?: string; projectId?: string; storageFileType?: string } = {}) {
  const type = assetTypeFromMime(file.mimetype) as Asset["type"];
  const id = createId("asset");
  const stored = await copyIntoAssetStorage({ sourcePath: file.path, type, assetId: id, originalName: file.originalname });
  fs.rmSync(file.path, { force: true });

  return createAsset({
    id,
    type,
    source: "uploaded",
    name: input.name || file.originalname.replace(/\.[^.]+$/, ""),
    folderId: input.folderId ?? null,
    originalName: file.originalname,
    localPath: stored.localPath,
    url: stored.url,
    mimeType: file.mimetype,
    size: file.size,
    projectId: input.projectId,
    storageFileType: input.storageFileType
  });
}

export async function createAsset(input: CreateAssetInput & { id?: string }) {
  const db = await getDb();
  const { workspace, user } = requireRequestContext();
  const id = input.id ?? createId("asset");
  const timestamp = now();
  const type = input.type === "generated" ? inferTypeFromPath(input.localPath) : input.type;
  let localPath = input.localPath;
  let url = input.url;
  let downloadUrl = input.downloadUrl;
  let cosUrl = input.cosUrl;
  let cdnUrl = input.cdnUrl;
  let posterUrl = input.posterUrl;
  let previewUrl = input.previewUrl;
  let downloadableUrl = input.downloadableUrl;
  let storageProvider = input.storageProvider;
  let storageKey = input.storageKey;
  let storageBucket = input.storageBucket;
  let storageRegion = input.storageRegion;
  let storageFileType = input.storageFileType;
  if ((input.source === "generated" || input.source === "imported") && localPath && fs.existsSync(localPath) && !path.resolve(localPath).startsWith(assetRoot())) {
    const stored = await copyIntoAssetStorage({ sourcePath: localPath, type, assetId: id, originalName: input.originalName });
    localPath = stored.localPath;
    url = stored.url;
  }
  const metadata = await metadataFor(localPath);
  const localFileExists = Boolean(localPath && fs.existsSync(localPath));
  const fileName = path.basename(storageKey || localPath || url || input.originalName);
  let thumbnailUrl = input.thumbnailUrl;
  if (type === "image" && localPath && fs.existsSync(localPath)) {
    thumbnailUrl = await createImageThumbnail(localPath, id).catch(() => input.thumbnailUrl);
  }
  const targetStorageFileType = storageFileTypeForAsset(type, input.source, input.storageFileType);
  if (!storageKey && isCosConfigured() && localFileExists && ["uploaded", "generated", "imported"].includes(input.source ?? "uploaded")) {
    const stored = await uploadLocalFileToCos({
      workspaceId: workspace.id,
      localPath,
      fileType: targetStorageFileType,
      originalName: input.originalName || fileName,
      mimeType: input.mimeType ?? contentTypeForFilename(fileName)
    });
    storageProvider = "tencent_cos";
    storageKey = stored.fileKey;
    storageBucket = stored.bucket;
    storageRegion = stored.region;
    storageFileType = targetStorageFileType;
    localPath = stored.localPath;
    cosUrl = stored.url;
    cdnUrl = cdnUrlForCosKey(stored.fileKey);
    url = cdnUrl || stored.url;
    downloadUrl = stored.downloadUrl;
    downloadableUrl = downloadableUrl || cdnUrl || url;
  }
  if (storageKey) {
    cosUrl = cosUrl || storageAccessPath(storageKey, { disposition: "inline" });
    cdnUrl = cdnUrl || cdnUrlForCosKey(storageKey);
    url = cdnUrl || input.publicUrl || url || cosUrl;
    downloadUrl = downloadUrl || storageAccessPath(storageKey, { disposition: "attachment" });
    downloadableUrl = downloadableUrl || cdnUrl || url || downloadUrl;
  }

  await db.run(
    `INSERT INTO assets (
      id, workspace_id, owner_user_id, name, type, source, folder_id, file_name, original_name, local_path, url, public_url, download_url,
      cos_url, cdn_url, poster_url, preview_url, downloadable_url, thumbnail_key, poster_key, preview_key,
      original_storage_provider, preview_storage_provider, public_delivery_provider,
      size, mime_type, width, height, duration, fps, thumbnail_path, storage_provider, storage_key, storage_bucket, storage_region, storage_file_type,
      provider_id, model_id, node_id, project_id,
      prompt, negative_prompt, generation_params_json, created_at, updated_at
    ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
    id,
    workspace.id,
    user.id,
    input.name || input.originalName.replace(/\.[^.]+$/, ""),
    type,
    input.source ?? "uploaded",
    input.folderId ?? null,
    fileName,
    input.originalName,
    localPath,
    url,
    input.publicUrl,
    downloadUrl ?? `/api/assets/${id}/download`,
    cosUrl,
    cdnUrl,
    posterUrl,
    previewUrl,
    downloadableUrl,
    input.thumbnailKey,
    input.posterKey,
    input.previewKey,
    input.originalStorageProvider || storageProvider,
    input.previewStorageProvider,
    input.publicDeliveryProvider || publicDeliveryProviderForCosKey(storageKey),
    metadata.fileSize ?? input.size,
    input.mimeType ?? contentTypeForFilename(fileName),
    metadata.width,
    metadata.height,
    metadata.duration ?? input.duration,
    metadata.fps,
    thumbnailUrl,
    storageProvider,
    storageKey,
    storageBucket,
    storageRegion,
    storageFileType,
    input.providerId,
    input.modelId,
    input.nodeId,
    input.projectId,
    input.prompt,
    input.negativePrompt,
    input.generationParams ? JSON.stringify(input.generationParams) : undefined,
    timestamp,
    timestamp
  );
  const row = await db.get("SELECT * FROM assets WHERE id = ?", id);
  return hydrateCosAsset(toAsset(row as AssetRow));
}

export async function listAssets(query: AssetQuery = {}) {
  const db = await getDb();
  const where = ["deleted_at IS NULL", "workspace_id = ?"];
  const params: unknown[] = [requireRequestContext().workspace.id];
  if (query.type) {
    if (query.type === "generated") where.push("source = 'generated'");
    else {
      where.push("type = ?");
      params.push(query.type);
    }
  }
  if (query.source) {
    where.push("source = ?");
    params.push(query.source);
  }
  if (query.projectId) {
    where.push("project_id = ?");
    params.push(query.projectId);
  }
  if (query.folderId !== undefined) {
    if (query.folderId === null || query.folderId === "" || query.folderId === "root") where.push("folder_id IS NULL");
    else {
      where.push("folder_id = ?");
      params.push(query.folderId);
    }
  }
  if (query.keyword) {
    where.push("(name LIKE ? OR original_name LIKE ? OR prompt LIKE ?)");
    const keyword = `%${query.keyword}%`;
    params.push(keyword, keyword, keyword);
  }
  const allowedSorts: Record<string, string> = { name: "name", type: "type", createdAt: "created_at", updatedAt: "updated_at", size: "size" };
  const sort = allowedSorts[query.sortBy || ""] ?? "created_at";
  const order = query.sortOrder?.toLowerCase() === "asc" ? "ASC" : "DESC";
  const rows = await db.all(`SELECT * FROM assets WHERE ${where.join(" AND ")} ORDER BY ${sort} ${order}`, ...params);
  return Promise.all((rows as AssetRow[]).map((row) => hydrateCosAsset(toAsset(row))));
}

export async function getAsset(id: string) {
  const db = await getDb();
  const row = await db.get("SELECT * FROM assets WHERE id = ? AND workspace_id = ? AND deleted_at IS NULL", id, requireRequestContext().workspace.id);
  return row ? hydrateCosAsset(toAsset(row as AssetRow)) : undefined;
}

export async function updateAsset(id: string, input: { name?: string; folderId?: string | null }) {
  const db = await getDb();
  const current = await getAsset(id);
  if (!current) return undefined;
  await db.run(
    "UPDATE assets SET name = ?, folder_id = ?, updated_at = ? WHERE id = ?",
    input.name ?? current.name,
    input.folderId === undefined ? current.folderId : input.folderId,
    now(),
    id
  );
  return getAsset(id);
}

function assertManagedPath(localPath: string) {
  if (isCosLocalPath(localPath)) throw new Error("COS_ASSET_PATH");
  const absolute = path.resolve(localPath);
  const uploadAbsolute = path.resolve(process.cwd(), uploadRoot());
  if (!absolute.startsWith(uploadAbsolute)) throw new Error("UNSAFE_ASSET_PATH");
  return absolute;
}

export async function deleteAsset(id: string, physical = false) {
  const db = await getDb();
  const asset = await getAsset(id);
  if (!asset) return;
  await db.run("UPDATE assets SET deleted_at = ?, updated_at = ? WHERE id = ?", now(), now(), id);
  if (physical && asset.storageKey) {
    await deleteCosFile(asset.storageKey).catch(() => undefined);
  } else if (physical && asset.localPath) {
    const filePath = assertManagedPath(asset.localPath);
    fs.rmSync(filePath, { force: true });
  }
}

export async function deleteCosAssetFile(id: string) {
  const db = await getDb();
  const asset = await getAsset(id);
  if (!asset?.storageKey) throw new Error("ASSET_NOT_FOUND");
  await deleteCosFile(asset.storageKey);
  await db.run("UPDATE assets SET deleted_at = ?, updated_at = ? WHERE id = ?", now(), now(), id);
}

export async function listFolders(projectId?: string) {
  const db = await getDb();
  const workspaceId = requireRequestContext().workspace.id;
  const rows = projectId
    ? await db.all("SELECT * FROM asset_folders WHERE workspace_id = ? AND deleted_at IS NULL AND (project_id = ? OR project_id IS NULL) ORDER BY name ASC", workspaceId, projectId)
    : await db.all("SELECT * FROM asset_folders WHERE workspace_id = ? AND deleted_at IS NULL ORDER BY name ASC", workspaceId);
  return (rows as AssetRow[]).map(toFolder);
}

export async function createFolder(input: { name: string; parentId?: string | null; projectId?: string }) {
  const db = await getDb();
  const workspaceId = requireRequestContext().workspace.id;
  const name = sanitizeFilename(input.name).trim();
  if (!name) throw new Error("FOLDER_NAME_REQUIRED");
  const duplicate = await db.get(
    "SELECT id FROM asset_folders WHERE workspace_id = ? AND deleted_at IS NULL AND name = ? AND COALESCE(parent_id, '') = COALESCE(?, '')",
    workspaceId,
    name,
    input.parentId ?? null
  );
  if (duplicate) throw new Error("FOLDER_NAME_DUPLICATED");
  const id = createId("folder");
  const timestamp = now();
  await db.run(
    "INSERT INTO asset_folders (id, workspace_id, name, parent_id, project_id, created_at, updated_at) VALUES (?, ?, ?, ?, ?, ?, ?)",
    id,
    workspaceId,
    name,
    input.parentId ?? null,
    input.projectId,
    timestamp,
    timestamp
  );
  const row = await db.get("SELECT * FROM asset_folders WHERE id = ?", id);
  return toFolder(row as AssetRow);
}

export async function updateFolder(id: string, input: { name?: string; parentId?: string | null }) {
  const db = await getDb();
  const workspaceId = requireRequestContext().workspace.id;
  const current = await db.get<AssetRow>("SELECT * FROM asset_folders WHERE id = ? AND workspace_id = ? AND deleted_at IS NULL", id, workspaceId);
  if (!current) return undefined;
  const name = input.name ? sanitizeFilename(input.name).trim() : current.name;
  if (!name) throw new Error("FOLDER_NAME_REQUIRED");
  await db.run("UPDATE asset_folders SET name = ?, parent_id = ?, updated_at = ? WHERE id = ? AND workspace_id = ?", name, input.parentId === undefined ? current.parent_id : input.parentId, now(), id, workspaceId);
  const row = await db.get("SELECT * FROM asset_folders WHERE id = ? AND workspace_id = ?", id, workspaceId);
  return toFolder(row as AssetRow);
}

export async function deleteFolder(id: string) {
  const db = await getDb();
  const workspaceId = requireRequestContext().workspace.id;
  const childAssets = await db.get<{ count: number }>("SELECT COUNT(*) as count FROM assets WHERE workspace_id = ? AND deleted_at IS NULL AND folder_id = ?", workspaceId, id);
  const childFolders = await db.get<{ count: number }>("SELECT COUNT(*) as count FROM asset_folders WHERE workspace_id = ? AND deleted_at IS NULL AND parent_id = ?", workspaceId, id);
  if ((childAssets?.count ?? 0) > 0 || (childFolders?.count ?? 0) > 0) throw new Error("FOLDER_NOT_EMPTY");
  await db.run("UPDATE asset_folders SET deleted_at = ?, updated_at = ? WHERE id = ? AND workspace_id = ?", now(), now(), id, workspaceId);
}

export async function getAssetDownloadInfo(id: string) {
  const asset = await getAsset(id);
  if (!asset) throw new Error("ASSET_NOT_FOUND");
  const ext = path.extname(asset.fileName || asset.originalName || asset.localPath) || path.extname(asset.localPath);
  const rawName = asset.name || asset.originalName || "asset";
  const safeBaseName = sanitizeFilename(rawName.replace(/\.[^.]+$/, ""));
  const filename = `${safeBaseName || "asset"}${ext}`;
  if (asset.storageKey) {
    const cachePath = path.join(assetRoot(), "download-cache", `${asset.id}${ext || ".bin"}`);
    if (!fs.existsSync(cachePath)) {
      await downloadCosFileToLocal({ fileKey: asset.storageKey, localPath: cachePath, expiresSeconds: 900 });
    }
    return {
      localPath: cachePath,
      filename,
      contentType: asset.mimeType || contentTypeForFilename(filename)
    };
  }
  const localPath = assertManagedPath(asset.localPath);
  if (!fs.existsSync(localPath)) throw new Error("ASSET_FILE_MISSING");
  return {
    localPath,
    filename,
    contentType: asset.mimeType || contentTypeForFilename(filename)
  };
}
