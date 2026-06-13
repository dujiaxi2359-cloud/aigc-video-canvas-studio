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
  size?: number;
  mimeType?: string;
  duration?: number;
  thumbnailUrl?: string;
  providerId?: string;
  modelId?: string;
  nodeId?: string;
  projectId?: string;
  prompt?: string;
  negativePrompt?: string;
  generationParams?: Record<string, unknown>;
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

function inferTypeFromPath(localPath: string): Asset["type"] {
  const ext = path.extname(localPath).toLowerCase();
  if ([".png", ".jpg", ".jpeg", ".webp", ".gif"].includes(ext)) return "image";
  if ([".mp4", ".mov", ".webm", ".m4v"].includes(ext)) return "video";
  if ([".mp3", ".wav", ".m4a", ".aac"].includes(ext)) return "audio";
  if ([".txt", ".json", ".srt", ".ass", ".lrc"].includes(ext)) return "text";
  return "unknown";
}

function toAsset(row: AssetRow): Asset {
  return {
    id: row.id,
    name: row.name || row.original_name,
    type: row.type,
    source: row.source || "uploaded",
    folderId: row.folder_id ?? null,
    fileName: row.file_name || path.basename(row.local_path || row.url || row.original_name),
    originalName: row.original_name,
    localPath: row.local_path,
    url: row.url,
    publicUrl: row.public_url,
    downloadUrl: row.download_url,
    size: row.size,
    mimeType: row.mime_type,
    width: row.width,
    height: row.height,
    duration: row.duration,
    fps: row.fps,
    thumbnailUrl: row.thumbnail_path,
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

export async function createAssetFromUpload(file: Express.Multer.File, input: { folderId?: string | null; name?: string; projectId?: string } = {}) {
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
    projectId: input.projectId
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
  if ((input.source === "generated" || input.source === "imported") && localPath && fs.existsSync(localPath) && !path.resolve(localPath).startsWith(assetRoot())) {
    const stored = await copyIntoAssetStorage({ sourcePath: localPath, type, assetId: id, originalName: input.originalName });
    localPath = stored.localPath;
    url = stored.url;
  }
  const metadata = await metadataFor(localPath);
  const fileName = path.basename(localPath || url || input.originalName);
  let thumbnailUrl = input.thumbnailUrl;
  if (type === "image" && localPath && fs.existsSync(localPath)) {
    thumbnailUrl = await createImageThumbnail(localPath, id).catch(() => input.thumbnailUrl);
  }

  await db.run(
    `INSERT INTO assets (
      id, workspace_id, owner_user_id, name, type, source, folder_id, file_name, original_name, local_path, url, public_url, download_url,
      size, mime_type, width, height, duration, fps, thumbnail_path, provider_id, model_id, node_id, project_id,
      prompt, negative_prompt, generation_params_json, created_at, updated_at
    ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
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
    `/api/assets/${id}/download`,
    metadata.fileSize ?? input.size,
    input.mimeType ?? contentTypeForFilename(fileName),
    metadata.width,
    metadata.height,
    metadata.duration ?? input.duration,
    metadata.fps,
    thumbnailUrl,
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
  return toAsset(row as AssetRow);
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
  return (rows as AssetRow[]).map(toAsset);
}

export async function getAsset(id: string) {
  const db = await getDb();
  const row = await db.get("SELECT * FROM assets WHERE id = ? AND workspace_id = ? AND deleted_at IS NULL", id, requireRequestContext().workspace.id);
  return row ? toAsset(row as AssetRow) : undefined;
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
  if (physical && asset.localPath) {
    const filePath = assertManagedPath(asset.localPath);
    fs.rmSync(filePath, { force: true });
  }
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
  const localPath = assertManagedPath(asset.localPath);
  if (!fs.existsSync(localPath)) throw new Error("ASSET_FILE_MISSING");
  const ext = path.extname(asset.fileName || asset.originalName || localPath) || path.extname(localPath);
  const rawName = asset.name || asset.originalName || "asset";
  const safeBaseName = sanitizeFilename(rawName.replace(/\.[^.]+$/, ""));
  const filename = `${safeBaseName || "asset"}${ext}`;
  return {
    localPath,
    filename,
    contentType: asset.mimeType || contentTypeForFilename(filename)
  };
}
