import { getDb } from "../db/database.js";
import { createId } from "../utils/id.js";
import { now } from "../utils/time.js";

function toHistory(row: any) {
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
    outputUrl: row.output_url,
    errorMessage: row.error_message,
    createdAt: row.created_at
  };
}

export async function listHistory() {
  const db = await getDb();
  const rows = await db.all("SELECT * FROM generation_history ORDER BY created_at DESC");
  return rows.map(toHistory);
}

export async function addHistory(input: any) {
  const db = await getDb();
  const id = createId("history");
  await db.run(
    `INSERT INTO generation_history
     (id, generation_type, project_id, node_id, model_config_id, model_display_name, input_mode, prompt, duration,
      aspect_ratio, resolution, status, output_path, output_url, error_message, created_at)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
    id,
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
    input.errorMessage,
    now()
  );
  return toHistory(await db.get("SELECT * FROM generation_history WHERE id = ?", id));
}

export async function deleteHistory(id: string) {
  const db = await getDb();
  await db.run("DELETE FROM generation_history WHERE id = ?", id);
}
