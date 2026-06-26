import { getDb } from "../db/database.js";
import { createId } from "../utils/id.js";
import { now } from "../utils/time.js";
import { requireRequestContext } from "./requestContext.js";

function toHistory(row: any) {
  const outputUrl = row.output_asset_cdn_url || row.cdn_url || row.output_url || row.output_asset_url;
  const downloadableUrl = row.downloadable_url || row.output_asset_downloadable_url || row.output_asset_download_url || outputUrl;
  return {
    id: row.id,
    generationType: row.generation_type,
    projectId: row.project_id,
    nodeId: row.node_id,
    modelConfigId: row.model_config_id,
    modelDisplayName: row.model_display_name,
    inputMode: row.input_mode,
    prompt: row.prompt,
    duration: row.duration,
    aspectRatio: row.aspect_ratio,
    resolution: row.resolution,
    status: row.status,
    outputUrl,
    thumbnailUrl: row.thumbnail_url || row.output_asset_thumbnail_url,
    posterUrl: row.poster_url || row.output_asset_poster_url,
    previewUrl: row.preview_url || row.output_asset_preview_url,
    cdnUrl: row.output_asset_cdn_url || row.cdn_url,
    cosUrl: row.cos_url || row.output_asset_cos_url,
    downloadableUrl,
    errorMessage: row.error_message,
    outputAssetId: row.output_asset_id,
    createdAt: row.created_at
  };
}

export async function listHistory() {
  const db = await getDb();
  const rows = await db.all(
    `SELECT history.*,
      (SELECT asset.id
       FROM assets asset
       WHERE asset.workspace_id = history.workspace_id
         AND asset.node_id = history.node_id
         AND asset.deleted_at IS NULL
         AND asset.created_at <= history.created_at + 5000
       ORDER BY asset.created_at DESC
       LIMIT 1) AS output_asset_id,
      (SELECT asset.url
       FROM assets asset
       WHERE asset.workspace_id = history.workspace_id
         AND asset.node_id = history.node_id
         AND asset.deleted_at IS NULL
         AND asset.created_at <= history.created_at + 5000
       ORDER BY asset.created_at DESC
       LIMIT 1) AS output_asset_url
      ,(SELECT asset.cdn_url FROM assets asset WHERE asset.workspace_id = history.workspace_id AND asset.node_id = history.node_id AND asset.deleted_at IS NULL AND asset.created_at <= history.created_at + 5000 ORDER BY asset.created_at DESC LIMIT 1) AS output_asset_cdn_url
      ,(SELECT asset.cos_url FROM assets asset WHERE asset.workspace_id = history.workspace_id AND asset.node_id = history.node_id AND asset.deleted_at IS NULL AND asset.created_at <= history.created_at + 5000 ORDER BY asset.created_at DESC LIMIT 1) AS output_asset_cos_url
      ,(SELECT asset.thumbnail_path FROM assets asset WHERE asset.workspace_id = history.workspace_id AND asset.node_id = history.node_id AND asset.deleted_at IS NULL AND asset.created_at <= history.created_at + 5000 ORDER BY asset.created_at DESC LIMIT 1) AS output_asset_thumbnail_url
      ,(SELECT asset.poster_url FROM assets asset WHERE asset.workspace_id = history.workspace_id AND asset.node_id = history.node_id AND asset.deleted_at IS NULL AND asset.created_at <= history.created_at + 5000 ORDER BY asset.created_at DESC LIMIT 1) AS output_asset_poster_url
      ,(SELECT asset.preview_url FROM assets asset WHERE asset.workspace_id = history.workspace_id AND asset.node_id = history.node_id AND asset.deleted_at IS NULL AND asset.created_at <= history.created_at + 5000 ORDER BY asset.created_at DESC LIMIT 1) AS output_asset_preview_url
      ,(SELECT asset.downloadable_url FROM assets asset WHERE asset.workspace_id = history.workspace_id AND asset.node_id = history.node_id AND asset.deleted_at IS NULL AND asset.created_at <= history.created_at + 5000 ORDER BY asset.created_at DESC LIMIT 1) AS output_asset_downloadable_url
      ,(SELECT asset.download_url FROM assets asset WHERE asset.workspace_id = history.workspace_id AND asset.node_id = history.node_id AND asset.deleted_at IS NULL AND asset.created_at <= history.created_at + 5000 ORDER BY asset.created_at DESC LIMIT 1) AS output_asset_download_url
     FROM generation_history history
     WHERE history.workspace_id = ?
     ORDER BY history.created_at DESC`,
    requireRequestContext().workspace.id
  );
  return rows.map(toHistory);
}

export async function addHistory(input: any) {
  const db = await getDb();
  const { workspace, user } = requireRequestContext();
  const id = createId("history");
  await db.run(
    `INSERT INTO generation_history
     (id, workspace_id, user_id, generation_type, project_id, node_id, model_config_id, model_display_name, input_mode, prompt, duration,
      aspect_ratio, resolution, status, output_path, output_url, thumbnail_url, poster_url, preview_url, cdn_url, cos_url, downloadable_url, error_message, created_at)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
    id,
    workspace.id,
    user.id,
    input.generationType,
    input.projectId,
    input.nodeId,
    input.modelConfigId,
    input.modelDisplayName,
    input.inputMode,
    input.prompt,
    input.duration,
    input.aspectRatio,
    input.resolution,
    input.status,
    input.outputPath,
    input.outputUrl,
    input.thumbnailUrl,
    input.posterUrl,
    input.previewUrl,
    input.cdnUrl,
    input.cosUrl,
    input.downloadableUrl,
    input.errorMessage,
    now()
  );
  return toHistory(await db.get("SELECT * FROM generation_history WHERE id = ?", id));
}

export async function deleteHistory(id: string) {
  const db = await getDb();
  await db.run("DELETE FROM generation_history WHERE id = ? AND workspace_id = ?", id, requireRequestContext().workspace.id);
}
