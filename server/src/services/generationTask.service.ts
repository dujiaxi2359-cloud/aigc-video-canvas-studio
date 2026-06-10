import { getDb } from "../db/database.js";
import { now } from "../utils/time.js";

interface GenerationTaskRow {
  id: string;
  status: string;
  progress: number;
  result_json?: string;
  error_message?: string;
  created_at: number;
  updated_at: number;
}

export async function getGenerationTask(id: string) {
  const db = await getDb();
  const row = await db.get<GenerationTaskRow>("SELECT * FROM generation_tasks WHERE id = ?", id);
  if (!row) return undefined;

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

export async function saveGenerationTask(input: {
  id: string;
  status: string;
  progress?: number;
  result?: unknown;
  errorMessage?: string;
}) {
  const db = await getDb();
  const timestamp = now();
  await db.run(
    `INSERT INTO generation_tasks (id, status, progress, result_json, error_message, created_at, updated_at)
     VALUES (?, ?, ?, ?, ?, ?, ?)
     ON CONFLICT(id) DO UPDATE SET
       status = excluded.status,
       progress = excluded.progress,
       result_json = excluded.result_json,
       error_message = excluded.error_message,
       updated_at = excluded.updated_at`,
    input.id,
    input.status,
    input.progress ?? 0,
    input.result === undefined ? undefined : JSON.stringify(input.result),
    input.errorMessage,
    timestamp,
    timestamp
  );
}
