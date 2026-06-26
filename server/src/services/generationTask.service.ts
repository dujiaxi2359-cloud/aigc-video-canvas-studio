import { getDb } from "../db/database.js";
import { now } from "../utils/time.js";
import { requireRequestContext } from "./requestContext.js";

interface GenerationTaskRow {
  id: string;
  status: string;
  provider_status?: string;
  provider_video_url?: string;
  output_url?: string;
  cdn_url?: string;
  poster_url?: string;
  preview_url?: string;
  downloadable_url?: string;
  cos_key?: string;
  file_size?: number;
  mime_type?: string;
  completed_at?: number;
  failed_stage?: string;
  error_code?: string;
  progress: number;
  result_json?: string;
  error_message?: string;
  created_at: number;
  updated_at: number;
}

function toGenerationTask(row: GenerationTaskRow) {
  return {
    id: row.id,
    status: row.status,
    providerStatus: row.provider_status,
    providerVideoUrl: row.provider_video_url,
    outputUrl: row.output_url,
    cdnUrl: row.cdn_url,
    posterUrl: row.poster_url,
    previewUrl: row.preview_url,
    downloadableUrl: row.downloadable_url,
    cosKey: row.cos_key,
    fileSize: row.file_size,
    mimeType: row.mime_type,
    completedAt: row.completed_at,
    failedStage: row.failed_stage,
    errorCode: row.error_code,
    progress: row.progress,
    result: row.result_json ? JSON.parse(row.result_json) as unknown : undefined,
    errorMessage: row.error_message,
    createdAt: row.created_at,
    updatedAt: row.updated_at
  };
}

export async function getGenerationTask(id: string) {
  const db = await getDb();
  const row = await db.get<GenerationTaskRow>("SELECT * FROM generation_tasks WHERE id = ? AND workspace_id = ?", id, requireRequestContext().workspace.id);
  if (!row) return undefined;

  return toGenerationTask(row);
}

export async function getLatestGenerationTaskForNode(nodeId: string, since?: number) {
  const db = await getDb();
  const { workspace } = requireRequestContext();
  const createdAfter = Number.isFinite(Number(since)) ? Number(since) : now() - 60 * 60 * 1000;
  const row = await db.get<GenerationTaskRow>(
    `SELECT * FROM generation_tasks
     WHERE workspace_id = ?
       AND created_at >= ?
       AND result_json LIKE ?
     ORDER BY updated_at DESC
     LIMIT 1`,
    workspace.id,
    createdAfter,
    `%${nodeId.replace(/[%_]/g, "")}%`
  );
  return row ? toGenerationTask(row) : undefined;
}

export async function saveGenerationTask(input: {
  id: string;
  status: string;
  providerStatus?: string;
  providerVideoUrl?: string;
  outputUrl?: string;
  cdnUrl?: string;
  posterUrl?: string;
  previewUrl?: string;
  downloadableUrl?: string;
  cosKey?: string;
  fileSize?: number;
  mimeType?: string;
  completedAt?: number;
  failedStage?: string;
  errorCode?: string;
  stage?: string;
  progress?: number;
  result?: unknown;
  errorMessage?: string;
}) {
  const db = await getDb();
  const { workspace, user } = requireRequestContext();
  const timestamp = now();
  const existing = await db.get<GenerationTaskRow>("SELECT * FROM generation_tasks WHERE id = ? AND workspace_id = ?", input.id, workspace.id);
  const previousResult = existing?.result_json ? JSON.parse(existing.result_json) as unknown : undefined;
  const nextResult = input.stage
    ? { ...(input.result && typeof input.result === "object" ? input.result as Record<string, unknown> : {}), generationStage: input.stage }
    : input.result;
  const mergedResult = previousResult && nextResult && typeof previousResult === "object" && typeof nextResult === "object"
    ? { ...previousResult as Record<string, unknown>, ...nextResult as Record<string, unknown> }
    : nextResult ?? previousResult;
  await db.run(
    `INSERT INTO generation_tasks (
       id, workspace_id, user_id, status, provider_status, provider_video_url, output_url, cdn_url, poster_url, preview_url, downloadable_url, cos_key, file_size, mime_type,
       completed_at, failed_stage, error_code, progress, result_json, error_message, created_at, updated_at
     )
     VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
     ON CONFLICT(id) DO UPDATE SET
       status = excluded.status,
       provider_status = excluded.provider_status,
       provider_video_url = excluded.provider_video_url,
       output_url = excluded.output_url,
       cdn_url = excluded.cdn_url,
       poster_url = excluded.poster_url,
       preview_url = excluded.preview_url,
       downloadable_url = excluded.downloadable_url,
       cos_key = excluded.cos_key,
       file_size = excluded.file_size,
       mime_type = excluded.mime_type,
       completed_at = excluded.completed_at,
       failed_stage = excluded.failed_stage,
       error_code = excluded.error_code,
       progress = excluded.progress,
       result_json = excluded.result_json,
       error_message = excluded.error_message,
       updated_at = excluded.updated_at`,
    input.id,
    workspace.id,
    user.id,
    input.status,
    input.providerStatus ?? existing?.provider_status,
    input.providerVideoUrl ?? existing?.provider_video_url,
    input.outputUrl ?? existing?.output_url,
    input.cdnUrl ?? existing?.cdn_url,
    input.posterUrl ?? existing?.poster_url,
    input.previewUrl ?? existing?.preview_url,
    input.downloadableUrl ?? existing?.downloadable_url,
    input.cosKey ?? existing?.cos_key,
    input.fileSize ?? existing?.file_size,
    input.mimeType ?? existing?.mime_type,
    input.completedAt ?? existing?.completed_at,
    input.failedStage ?? existing?.failed_stage,
    input.errorCode ?? existing?.error_code,
    input.progress ?? existing?.progress ?? 0,
    mergedResult === undefined ? undefined : JSON.stringify(mergedResult),
    input.errorMessage ?? existing?.error_message,
    timestamp,
    timestamp
  );
}
