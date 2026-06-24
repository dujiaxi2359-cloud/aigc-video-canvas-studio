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

const videoResultTimeoutMs = 30 * 60 * 1000;
const videoResultTimeoutMessage = "上游/中转超过 30 分钟没有返回可用视频，当前任务已停止等待。请直接重试，或切换一条可用的视频中转线路。";

function completeGeneratedOutput(node: ProjectNode, data: Record<string, unknown>) {
  if (typeof data.outputUrl !== "string" || !data.outputUrl) return data;
  if (!["video", "imageGenerate", "compose"].includes(node.type ?? "")) return data;
  if (data.status === "success") return data;
  return {
    ...data,
    status: "success",
    errorCode: undefined,
    errorMessage: undefined,
    debugMessage: undefined,
    generationStartedAt: undefined,
    clientRequestId: undefined
  };
}

function failStaleVideoGeneration(node: ProjectNode, data: Record<string, unknown>) {
  if (node.type !== "video" || data.status !== "generating" || typeof data.outputUrl === "string" && data.outputUrl) return data;
  const startedAt = typeof data.generationStartedAt === "number" ? data.generationStartedAt : Number(data.generationStartedAt);
  if (!Number.isFinite(startedAt) || now() - startedAt < videoResultTimeoutMs) return data;
  return {
    ...data,
    status: "error",
    errorCode: "UPSTREAM_RESULT_NOT_RETURNED",
    errorMessage: videoResultTimeoutMessage,
    debugMessage: "该视频节点超过 30 分钟没有成功历史或 outputUrl，已从无限生成中恢复为可重试状态。",
    generationStartedAt: undefined,
    clientRequestId: undefined
  };
}

function normalizeNodeData(node: ProjectNode, data: Record<string, unknown>) {
  return failStaleVideoGeneration(node, completeGeneratedOutput(node, data));
}

function normalizeGeneratedOutputNodes(nodes: unknown[]) {
  return nodes.map((item) => {
    if (!item || typeof item !== "object") return item;
    const node = item as ProjectNode;
    const data = node.data;
    return data ? { ...node, data: normalizeNodeData(node, data) } : node;
  });
}

async function hydrateProjectNodes(nodes: ProjectNode[], projectId?: string) {
  const assetIds = new Set<string>();
  const nodeIds = new Set<string>();
  for (const node of nodes) {
    const data = node.data;
    if (node.id && ["video", "imageGenerate", "compose"].includes(node.type ?? "")) nodeIds.add(node.id);
    for (const key of ["assetId", "outputAssetId"]) {
      const value = data?.[key];
      if (typeof value === "string" && value) assetIds.add(value);
    }
  }
  const db = await getDb();
  const nodeAssets = new Map<string, Awaited<ReturnType<typeof getAsset>>>();
  if (nodeIds.size) {
    const workspaceId = requireRequestContext().workspace.id;
    const placeholders = [...nodeIds].map(() => "?").join(",");
    const rows = await db.all(
      `SELECT id, node_id
       FROM assets
       WHERE workspace_id = ?
         AND deleted_at IS NULL
         AND node_id IN (${placeholders})
         ${projectId ? "AND (project_id = ? OR project_id IS NULL)" : ""}
       ORDER BY created_at DESC`,
      workspaceId,
      ...nodeIds,
      ...(projectId ? [projectId] : [])
    );
    for (const row of rows as Array<{ id: string; node_id: string }>) {
      if (!nodeAssets.has(row.node_id)) nodeAssets.set(row.node_id, await getAsset(row.id).catch(() => undefined));
    }
  }

  if (!assetIds.size && !nodeAssets.size) {
    return nodes.map((node) => {
      const data = node.data;
      return data ? { ...node, data: normalizeNodeData(node, data) } : node;
    });
  }

  const assetEntries = await Promise.all([...assetIds].map(async (id) => [id, await getAsset(id).catch(() => undefined)] as const));
  const assets = new Map(assetEntries.filter((entry) => entry[1]));

  return nodes.map((node) => {
    const data = node.data;
    if (!data) return node;
    const assetId = typeof data.assetId === "string" ? data.assetId : undefined;
    const outputAssetId = typeof data.outputAssetId === "string" ? data.outputAssetId : undefined;
    const nodeAsset = node.id ? nodeAssets.get(node.id) : undefined;
    const asset = (outputAssetId && assets.get(outputAssetId)) || (assetId && assets.get(assetId)) || nodeAsset;
    if (!asset) return { ...node, data: normalizeNodeData(node, data) };

    const nextData = { ...data };
    if (asset.type === "image") {
      if (!nextData.thumbnailUrl && asset.thumbnailUrl) nextData.thumbnailUrl = asset.thumbnailUrl;
      if (!nextData.url && asset.url) nextData.url = asset.url;
      if (!nextData.outputUrl && outputAssetId && asset.url) nextData.outputUrl = asset.url;
      if (!nextData.outputAssetId && node.type === "imageGenerate") nextData.outputAssetId = asset.id;
      if (!nextData.width && asset.width) nextData.width = asset.width;
      if (!nextData.height && asset.height) nextData.height = asset.height;
    }
    if (asset.type === "video") {
      if (!nextData.thumbnailUrl && asset.thumbnailUrl) nextData.thumbnailUrl = asset.thumbnailUrl;
      if (asset.url) nextData.outputUrl = asset.url;
      if (!nextData.outputAssetId) nextData.outputAssetId = asset.id;
      if (!nextData.duration && asset.duration) nextData.duration = asset.duration;
    }
    return { ...node, data: normalizeNodeData(node, nextData) };
  });
}

async function parseProject(row: any) {
  return {
    id: row.id,
    name: row.name,
    nodes: await hydrateProjectNodes(JSON.parse(row.nodes_json), row.id),
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
    JSON.stringify(normalizeGeneratedOutputNodes(input.nodes ?? [])),
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
