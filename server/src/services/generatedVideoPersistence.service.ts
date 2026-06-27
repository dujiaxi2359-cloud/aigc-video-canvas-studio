import { getDb } from "../db/database.js";
import { isRealMediaUrl } from "../utils/videoResultExtractor.js";
import { requireRequestContext } from "./requestContext.js";

type ProjectNode = {
  id?: string;
  data?: Record<string, unknown>;
  [key: string]: unknown;
};

function nodeHasSuccessfulVideo(data: Record<string, unknown>) {
  return data.status === "completed"
    || data.generationStatus === "success"
    || isRealMediaUrl(data.videoUrl as string | undefined)
    || isRealMediaUrl(data.outputUrl as string | undefined)
    || isRealMediaUrl(data.previewUrl as string | undefined)
    || isRealMediaUrl(data.providerVideoUrl as string | undefined);
}

function parseNodes(value: string): ProjectNode[] {
  try {
    const nodes = JSON.parse(value) as unknown;
    return Array.isArray(nodes) ? nodes as ProjectNode[] : [];
  } catch {
    return [];
  }
}

async function updateProjectNode(projectId: string, nodeId: string, updater: (data: Record<string, unknown>) => Record<string, unknown>) {
  const db = await getDb();
  const { workspace } = requireRequestContext();
  const row = await db.get<{ nodes_json: string }>("SELECT nodes_json FROM projects WHERE id = ? AND workspace_id = ?", projectId, workspace.id);
  if (!row) return false;
  let changed = false;
  const nodes = parseNodes(row.nodes_json).map((node) => {
    if (node.id !== nodeId) return node;
    const currentData = node.data && typeof node.data === "object" ? node.data : {};
    const nextData = updater(currentData);
    changed = true;
    return { ...node, data: nextData };
  });
  if (!changed) return false;
  await db.run("UPDATE projects SET nodes_json = ?, updated_at = ? WHERE id = ? AND workspace_id = ?", JSON.stringify(nodes), Date.now(), projectId, workspace.id);
  return true;
}

export async function updateCanvasNodeWithGenerationSuccess(input: {
  projectId?: string;
  nodeId?: string;
  realUrl: string;
  providerTaskId?: string;
  outputAssetId?: string;
  fileName?: string;
  payloadSummary?: unknown;
}) {
  if (!input.projectId || !input.nodeId || !isRealMediaUrl(input.realUrl)) return false;
  return updateProjectNode(input.projectId, input.nodeId, (data) => ({
    ...data,
    status: "completed",
    generationStatus: "success",
    loading: false,
    outputType: "video",
    videoUrl: input.realUrl,
    outputUrl: input.realUrl,
    previewUrl: input.realUrl,
    downloadUrl: input.realUrl,
    providerVideoUrl: input.realUrl,
    providerTaskId: input.providerTaskId ?? data.providerTaskId,
    outputAssetId: input.outputAssetId ?? data.outputAssetId,
    fileName: input.fileName ?? data.fileName,
    payloadSummary: input.payloadSummary ?? data.payloadSummary,
    error: null,
    errorMessage: null
  }));
}

export async function updateCanvasNodeWithGenerationFailure(input: {
  projectId?: string;
  nodeId?: string;
  errorMessage: string;
  errorCode?: string;
  diagnosticOnly?: boolean;
}) {
  if (!input.projectId || !input.nodeId) return false;
  return updateProjectNode(input.projectId, input.nodeId, (data) => {
    if (nodeHasSuccessfulVideo(data)) {
      return {
        ...data,
        diagnosticErrorMessage: input.errorMessage,
        diagnosticErrorCode: input.errorCode ?? data.diagnosticErrorCode
      };
    }
    if (input.diagnosticOnly) {
      return {
        ...data,
        diagnosticErrorMessage: input.errorMessage,
        diagnosticErrorCode: input.errorCode ?? data.diagnosticErrorCode
      };
    }
    return {
      ...data,
      status: "error",
      generationStatus: "error",
      loading: false,
      error: input.errorMessage,
      errorMessage: input.errorMessage,
      errorCode: input.errorCode ?? data.errorCode
    };
  });
}
