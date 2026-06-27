import { getDb } from "../db/database.js";
import { now } from "../utils/time.js";
import { requireRequestContext } from "./requestContext.js";

interface GenerationTaskRow {
  id: string;
  user_id?: string;
  provider_task_id?: string;
  canvas_node_id?: string;
  project_id?: string;
  provider_id?: string;
  model_id?: string;
  status: string;
  provider_status?: string;
  provider_video_url?: string;
  progress: number;
  output_url?: string;
  preview_url?: string;
  storage_status?: string;
  storage_key?: string;
  storage_error?: string;
  raw_poll_response?: string;
  result_json?: string;
  error_message?: string;
  created_at: number;
  updated_at: number;
}

export async function getGenerationTask(id: string) {
  const db = await getDb();
  const row = await db.get<GenerationTaskRow>("SELECT * FROM generation_tasks WHERE id = ? AND workspace_id = ?", id, requireRequestContext().workspace.id);
  if (!row) return undefined;

  return {
    id: row.id,
    userId: row.user_id,
    providerTaskId: row.provider_task_id,
    canvasNodeId: row.canvas_node_id,
    projectId: row.project_id,
    providerId: row.provider_id,
    modelId: row.model_id,
    status: row.status,
    providerStatus: row.provider_status,
    providerVideoUrl: row.provider_video_url,
    progress: row.progress,
    outputUrl: row.output_url,
    previewUrl: row.preview_url,
    storageStatus: row.storage_status,
    storageKey: row.storage_key,
    storageError: row.storage_error,
    rawPollResponse: row.raw_poll_response ? JSON.parse(row.raw_poll_response) as unknown : undefined,
    result: row.result_json ? JSON.parse(row.result_json) as unknown : undefined,
    errorMessage: row.error_message,
    createdAt: row.created_at,
    updatedAt: row.updated_at
  };
}

export async function saveGenerationTask(input: {
  id: string;
  userId?: string;
  providerTaskId?: string;
  canvasNodeId?: string;
  projectId?: string;
  providerId?: string;
  modelId?: string;
  status: string;
  providerStatus?: string;
  providerVideoUrl?: string;
  outputUrl?: string;
  previewUrl?: string;
  storageStatus?: string;
  storageKey?: string;
  storageError?: string;
  rawPollResponse?: unknown;
  progress?: number;
  result?: unknown;
  errorMessage?: string | null;
}) {
  const db = await getDb();
  const { workspace, user } = requireRequestContext();
  const timestamp = now();
  const existing = await db.get<GenerationTaskRow>("SELECT * FROM generation_tasks WHERE id = ? AND workspace_id = ?", input.id, workspace.id);
  const previousResult = existing?.result_json ? JSON.parse(existing.result_json) as unknown : undefined;
  const mergedResult = previousResult
    && input.result
    && typeof previousResult === "object"
    && typeof input.result === "object"
    ? { ...previousResult as Record<string, unknown>, ...input.result as Record<string, unknown> }
    : input.result ?? previousResult;
  await db.run(
    `INSERT INTO generation_tasks (
       id, workspace_id, user_id, provider_task_id, canvas_node_id, project_id, provider_id, model_id,
       status, provider_status, provider_video_url, progress,
       output_url, preview_url, storage_status, storage_key, storage_error, raw_poll_response,
       result_json, error_message, created_at, updated_at
     )
     VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
     ON CONFLICT(id) DO UPDATE SET
       user_id = excluded.user_id,
       provider_task_id = excluded.provider_task_id,
       canvas_node_id = excluded.canvas_node_id,
       project_id = excluded.project_id,
       provider_id = excluded.provider_id,
       model_id = excluded.model_id,
       status = excluded.status,
       provider_status = excluded.provider_status,
       provider_video_url = excluded.provider_video_url,
       progress = excluded.progress,
       output_url = excluded.output_url,
       preview_url = excluded.preview_url,
       storage_status = excluded.storage_status,
       storage_key = excluded.storage_key,
       storage_error = excluded.storage_error,
       raw_poll_response = excluded.raw_poll_response,
       result_json = excluded.result_json,
       error_message = excluded.error_message,
       updated_at = excluded.updated_at`,
    input.id,
    workspace.id,
    input.userId ?? existing?.user_id ?? user.id,
    input.providerTaskId ?? existing?.provider_task_id,
    input.canvasNodeId ?? existing?.canvas_node_id,
    input.projectId ?? existing?.project_id,
    input.providerId ?? existing?.provider_id,
    input.modelId ?? existing?.model_id,
    input.status,
    input.providerStatus ?? existing?.provider_status,
    input.providerVideoUrl ?? existing?.provider_video_url,
    input.progress ?? existing?.progress ?? 0,
    input.outputUrl ?? existing?.output_url,
    input.previewUrl ?? existing?.preview_url,
    input.storageStatus ?? existing?.storage_status,
    input.storageKey ?? existing?.storage_key,
    input.storageError ?? existing?.storage_error,
    input.rawPollResponse === undefined ? existing?.raw_poll_response : JSON.stringify(input.rawPollResponse),
    mergedResult === undefined ? undefined : JSON.stringify(mergedResult),
    input.errorMessage === undefined ? existing?.error_message : input.errorMessage,
    timestamp,
    timestamp
  );
}
