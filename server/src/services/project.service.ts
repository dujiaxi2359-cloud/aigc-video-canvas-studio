import { getDb } from "../db/database.js";
import { createId } from "../utils/id.js";
import { now } from "../utils/time.js";

function parseProject(row: any) {
  return {
    id: row.id,
    name: row.name,
    nodes: JSON.parse(row.nodes_json),
    edges: JSON.parse(row.edges_json),
    createdAt: row.created_at,
    updatedAt: row.updated_at
  };
}

export async function listProjects() {
  const db = await getDb();
  const rows = await db.all("SELECT * FROM projects ORDER BY updated_at DESC");
  return rows.map(parseProject);
}

export async function createProject(name = "未命名项目") {
  const db = await getDb();
  const timestamp = now();
  const id = createId("project");
  await db.run(
    "INSERT INTO projects (id, name, nodes_json, edges_json, created_at, updated_at) VALUES (?, ?, ?, ?, ?, ?)",
    id,
    name,
    "[]",
    "[]",
    timestamp,
    timestamp
  );
  return getProject(id);
}

export async function getProject(id: string) {
  const db = await getDb();
  const row = await db.get("SELECT * FROM projects WHERE id = ?", id);
  return row ? parseProject(row) : undefined;
}

export async function saveProject(id: string, input: { name?: string; nodes: unknown[]; edges: unknown[] }) {
  const db = await getDb();
  const existing = await getProject(id);
  if (!existing) throw new Error("Project not found");
  await db.run(
    "UPDATE projects SET name = ?, nodes_json = ?, edges_json = ?, updated_at = ? WHERE id = ?",
    input.name ?? existing.name,
    JSON.stringify(input.nodes ?? []),
    JSON.stringify(input.edges ?? []),
    now(),
    id
  );
  return getProject(id);
}

export async function deleteProject(id: string) {
  const db = await getDb();
  await db.run("DELETE FROM projects WHERE id = ?", id);
}
