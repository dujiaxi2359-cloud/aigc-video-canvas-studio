import { getDb } from "../db/database.js";
import { now } from "../utils/time.js";
import { requireRequestContext } from "./requestContext.js";

interface GenerationTaskRow {
  id: string;
  status: string;
  provider_status?: string;
  provider_task_id?: string;
  canvas_node_id?: string;
  project_id?: string;
  provider_id?: string;
  model_id?: string;
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
  finished_at?: number;
  failed_stage?: string;
  error_code?: string;
  storage_status?: string;
  storage_error?: string;
  raw_create_response?: string;
  repaired_at?: number;
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
    providerTaskId: row.provider_task_id,
    canvasNodeId: row.canvas_node_id,
    projectId: row.project_id,
    providerId: row.provider_id,
    modelId: row.model_id,
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
    finishedAt: row.finished_at,
    failedStage: row.failed_stage,
    errorCode: row.error_code,
    storageStatus: row.storage_status,
    storageError: row.storage_error,
    rawCreateResponse: row.raw_create_response ? JSON.parse(row.raw_create_response) as unknown : undefined,
    repairedAt: row.repaired_at,
    progress: row.progress,
    result: row.result_json ? JSON.parse(row.result_json) as unknown : undefined,
    errorMessage: row.error_message,
    createdAt: row.created_at,
    updatedAt: row.updated_at
  };
}

function isRunningTaskStatus(status: string) {
  return /^(processing|running|queued|pending|submitted|created|executing|in_progress)$/i.test(status);
}

async function syncCanvasRunningStateFromTask(input: {
  projectId?: string;
  canvasNodeId?: string;
  providerTaskId?: string;
  progress?: number;
  status: string;
}) {
  if (!input.projectId || !input.canvasNodeId || !input.providerTaskId || !isRunningTaskStatus(input.status)) return;
  const db = await getDb();
  const { workspace } = requireRequestContext();
  const project = await db.get<{ id: string; nodes_json: string }>(
    "SELECT id, nodes_json FROM projects WHERE id = ? AND workspace_id = ?",
    input.projectId,
    workspace.id
  );
  if (!project) return;
  let didUpdate = false;
  const nodes = JSON.parse(project.nodes_json) as Array<Record<string, unknown>>;
  const nextNodes = nodes.map((node) => {
    if (node.id !== input.canvasNodeId) return node;
    didUpdate = true;
    const data = (node.data && typeof node.data === "object" ? node.data as Record<string, unknown> : {});
    return {
      ...node,
      data: {
        ...data,
        status: "generating",
        generationStatus: "processing",
        providerTaskId: input.providerTaskId,
        progress: input.progress ?? data.progress ?? 0,
        loading: true,
        error: undefined,
        errorCode: undefined,
        errorMessage: undefined,
        debugMessage: undefined
      }
    };
  });
  if (!didUpdate) return;
  await db.run("UPDATE projects SET nodes_json = ?, updated_at = ? WHERE id = ? AND workspace_id = ?", JSON.stringify(nextNodes), now(), input.projectId, workspace.id);
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
       AND (canvas_node_id = ? OR result_json LIKE ?)
     ORDER BY updated_at DESC
     LIMIT 1`,
    workspace.id,
    createdAfter,
    nodeId,
    `%${nodeId.replace(/[%_]/g, "")}%`
  );
  return row ? toGenerationTask(row) : undefined;
}

export async function saveGenerationTask(input: {
  id: string;
  status: string;
  providerStatus?: string;
  providerTaskId?: string;
  canvasNodeId?: string;
  projectId?: string;
  providerId?: string;
  modelId?: string;
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
  finishedAt?: number;
  failedStage?: string;
  errorCode?: string;
  storageStatus?: string;
  storageError?: string;
  rawCreateResponse?: unknown;
  repairedAt?: number;
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
  const shouldClearStaleError = input.errorMessage === undefined
    && ["processing", "success", "succeeded", "completed"].includes(input.status)
    && Boolean(input.providerTaskId || input.providerVideoUrl || input.outputUrl);
  const nextErrorMessage = shouldClearStaleError ? null : input.errorMessage ?? existing?.error_message;
  const nextFailedStage = shouldClearStaleError ? null : input.failedStage ?? existing?.failed_stage;
  const nextErrorCode = shouldClearStaleError ? null : input.errorCode ?? existing?.error_code;
  await db.run(
    `INSERT INTO generation_tasks (
       id, workspace_id, user_id, status, provider_status, provider_task_id, canvas_node_id, project_id, provider_id, model_id,
       provider_video_url, output_url, cdn_url, poster_url, preview_url, downloadable_url, cos_key, file_size, mime_type,
       completed_at, finished_at, failed_stage, error_code, storage_status, storage_error, raw_create_response, repaired_at,
       progress, result_json, error_message, created_at, updated_at
     )
     VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
     ON CONFLICT(id) DO UPDATE SET
       status = excluded.status,
       provider_status = excluded.provider_status,
       provider_task_id = excluded.provider_task_id,
       canvas_node_id = excluded.canvas_node_id,
       project_id = excluded.project_id,
       provider_id = excluded.provider_id,
       model_id = excluded.model_id,
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
       finished_at = excluded.finished_at,
       failed_stage = excluded.failed_stage,
       error_code = excluded.error_code,
       storage_status = excluded.storage_status,
       storage_error = excluded.storage_error,
       raw_create_response = excluded.raw_create_response,
       repaired_at = excluded.repaired_at,
       progress = excluded.progress,
       result_json = excluded.result_json,
       error_message = excluded.error_message,
       updated_at = excluded.updated_at`,
    input.id,
    workspace.id,
    user.id,
    input.status,
    input.providerStatus ?? existing?.provider_status,
    input.providerTaskId ?? existing?.provider_task_id,
    input.canvasNodeId ?? existing?.canvas_node_id,
    input.projectId ?? existing?.project_id,
    input.providerId ?? existing?.provider_id,
    input.modelId ?? existing?.model_id,
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
    input.finishedAt ?? existing?.finished_at,
    nextFailedStage,
    nextErrorCode,
    input.storageStatus ?? existing?.storage_status,
    input.storageError ?? existing?.storage_error,
    input.rawCreateResponse === undefined ? existing?.raw_create_response : JSON.stringify(input.rawCreateResponse),
    input.repairedAt ?? existing?.repaired_at,
    input.progress ?? existing?.progress ?? 0,
    mergedResult === undefined ? undefined : JSON.stringify(mergedResult),
    nextErrorMessage,
    timestamp,
    timestamp
  );
  await syncCanvasRunningStateFromTask({
    projectId: input.projectId ?? existing?.project_id,
    canvasNodeId: input.canvasNodeId ?? existing?.canvas_node_id,
    providerTaskId: input.providerTaskId ?? existing?.provider_task_id,
    progress: input.progress ?? existing?.progress ?? 0,
    status: input.status
  });
}
