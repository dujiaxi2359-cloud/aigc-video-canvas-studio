import { getDb } from "../db/database.js";
import { createId } from "../utils/id.js";
import { now } from "../utils/time.js";
import { getAsset } from "./asset.service.js";
import { requireRequestContext } from "./requestContext.js";

type ProjectNode = {
  id?: string;
  type?: string;
  data?: Record<string, unknown>;
  [key: string]: unknown;
};

async function hydrateProjectNodes(nodes: ProjectNode[]) {
  const assetIds = new Set<string>();
  for (const node of nodes) {
    const data = node.data;
    for (const key of ["assetId", "outputAssetId"]) {
      const value = data?.[key];
      if (typeof value === "string" && value) assetIds.add(value);
    }
  }
  if (!assetIds.size) return nodes;

  const assetEntries = await Promise.all([...assetIds].map(async (id) => [id, await getAsset(id).catch(() => undefined)] as const));
  const assets = new Map(assetEntries.filter((entry) => entry[1]));

  return nodes.map((node) => {
    const data = node.data;
    if (!data) return node;
    const assetId = typeof data.assetId === "string" ? data.assetId : undefined;
    const outputAssetId = typeof data.outputAssetId === "string" ? data.outputAssetId : undefined;
    const asset = (outputAssetId && assets.get(outputAssetId)) || (assetId && assets.get(assetId));
    if (!asset) return node;

    const nextData = { ...data };
    if (asset.type === "image") {
      if (!nextData.thumbnailUrl && asset.thumbnailUrl) nextData.thumbnailUrl = asset.thumbnailUrl;
      if (!nextData.url && asset.url) nextData.url = asset.url;
      if (!nextData.outputUrl && outputAssetId && asset.url) nextData.outputUrl = asset.url;
      if (!nextData.width && asset.width) nextData.width = asset.width;
      if (!nextData.height && asset.height) nextData.height = asset.height;
    }
    if (asset.type === "video") {
      if (!nextData.thumbnailUrl && asset.thumbnailUrl) nextData.thumbnailUrl = asset.thumbnailUrl;
      if (!nextData.outputUrl && asset.url) nextData.outputUrl = asset.url;
      if (!nextData.duration && asset.duration) nextData.duration = asset.duration;
    }
    return { ...node, data: nextData };
  });
}

async function parseProject(row: any) {
  return {
    id: row.id,
    name: row.name,
    nodes: await hydrateProjectNodes(JSON.parse(row.nodes_json)),
    edges: JSON.parse(row.edges_json),
    createdAt: row.created_at,
    updatedAt: row.updated_at
  };
}

export async function listProjects() {
  const db = await getDb();
  const { workspace } = requireRequestContext();
  const rows = await db.all("SELECT * FROM projects WHERE workspace_id = ? ORDER BY updated_at DESC", workspace.id);
  return Promise.all(rows.map(parseProject));
}

export async function createProject(name = "未命名项目") {
  const db = await getDb();
  const { workspace, user } = requireRequestContext();
  const timestamp = now();
  const id = createId("project");
  await db.run(
    "INSERT INTO projects (id, workspace_id, owner_user_id, name, nodes_json, edges_json, created_at, updated_at) VALUES (?, ?, ?, ?, ?, ?, ?, ?)",
    id,
    workspace.id,
    user.id,
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
  const { workspace } = requireRequestContext();
  const row = await db.get("SELECT * FROM projects WHERE id = ? AND workspace_id = ?", id, workspace.id);
  return row ? parseProject(row) : undefined;
}

export async function saveProject(id: string, input: { name?: string; nodes: unknown[]; edges: unknown[] }) {
  const db = await getDb();
  const existing = await getProject(id);
  if (!existing) throw new Error("Project not found");
  await db.run(
    "UPDATE projects SET name = ?, nodes_json = ?, edges_json = ?, updated_at = ? WHERE id = ? AND workspace_id = ?",
    input.name ?? existing.name,
    JSON.stringify(input.nodes ?? []),
    JSON.stringify(input.edges ?? []),
    now(),
    id,
    requireRequestContext().workspace.id
  );
  return getProject(id);
}

export async function deleteProject(id: string) {
  const db = await getDb();
  await db.run("DELETE FROM projects WHERE id = ? AND workspace_id = ?", id, requireRequestContext().workspace.id);
}
