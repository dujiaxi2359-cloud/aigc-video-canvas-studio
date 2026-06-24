import { getDb } from "../db/database.js";
import { now } from "../utils/time.js";
import { requireRequestContext } from "./requestContext.js";

interface GenerationTaskRow {
  id: string;
  status: string;
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
  progress?: number;
  result?: unknown;
  errorMessage?: string;
}) {
  const db = await getDb();
  const { workspace, user } = requireRequestContext();
  const timestamp = now();
  const existing = await db.get<GenerationTaskRow>("SELECT * FROM generation_tasks WHERE id = ? AND workspace_id = ?", input.id, workspace.id);
  const previousResult = existing?.result_json ? JSON.parse(existing.result_json) as unknown : undefined;
  const mergedResult = previousResult && input.result && typeof previousResult === "object" && typeof input.result === "object"
    ? { ...previousResult as Record<string, unknown>, ...input.result as Record<string, unknown> }
    : input.result ?? previousResult;
  await db.run(
    `INSERT INTO generation_tasks (id, workspace_id, user_id, status, progress, result_json, error_message, created_at, updated_at)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)
     ON CONFLICT(id) DO UPDATE SET
       status = excluded.status,
       progress = excluded.progress,
       result_json = excluded.result_json,
       error_message = excluded.error_message,
       updated_at = excluded.updated_at`,
    input.id,
    workspace.id,
    user.id,
    input.status,
    input.progress ?? existing?.progress ?? 0,
    mergedResult === undefined ? undefined : JSON.stringify(mergedResult),
    input.errorMessage ?? existing?.error_message,
    timestamp,
    timestamp
  );
}
