import { getDb } from "../db/database.js";
import type { AuthUser, AuthWorkspace } from "../types/auth.js";
import { rawErrorMessage } from "../utils/providerErrors.js";
import { extractProviderVideoUrl, sanitizeUrlForLog } from "../utils/videoResultExtractor.js";
import { runWithRequestContext } from "./requestContext.js";
import { finalizeVideoResult } from "./videoTaskFinalizer.service.js";
import { syncVideoTaskUpstream } from "./model.service.js";

type ReconcileTaskRow = {
  id: string;
  workspace_id?: string;
  user_id?: string;
  status?: string;
  provider_task_id?: string;
  canvas_node_id?: string;
  project_id?: string;
  provider_id?: string;
  model_id?: string;
  provider_video_url?: string;
  output_url?: string;
  preview_url?: string;
  downloadable_url?: string;
  result_json?: string;
  updated_at?: number;
};

type ContextRow = {
  user_id: string;
  email?: string;
  name?: string;
  role?: AuthUser["role"];
  user_status?: AuthUser["status"];
  invite_status?: AuthUser["inviteStatus"];
  workspace_id: string;
  workspace_name?: string;
  slug?: string;
  type?: AuthWorkspace["type"];
  member_role?: AuthWorkspace["role"];
  billing_status?: string;
};

let reconcilerTimer: NodeJS.Timeout | undefined;
let reconcilerRunning = false;

function logReconciler(event: string, payload: Record<string, unknown>) {
  console.info(`[video-reconciler:${event}]`, JSON.stringify(payload));
}

function parseJson(value?: string) {
  if (!value) return undefined;
  try {
    return JSON.parse(value) as unknown;
  } catch {
    return undefined;
  }
}

function firstString(...values: unknown[]) {
  for (const value of values) {
    if (typeof value === "string" && value.trim()) return value.trim();
  }
  return undefined;
}

function isRunningLike(status?: string) {
  return /^(processing|running|queued|generating|pending|submitted|created|executing|in_progress)$/i.test(status ?? "");
}

async function contextForTask(task: ReconcileTaskRow) {
  if (!task.workspace_id || !task.user_id) return undefined;
  const db = await getDb();
  const row = await db.get<ContextRow>(
    `SELECT
       u.id as user_id, u.email, u.name, u.role, u.status as user_status, u.invite_status,
       w.id as workspace_id, w.name as workspace_name, w.slug, w.type, w.billing_status,
       wm.role as member_role
     FROM users u
     JOIN workspaces w ON w.id = ?
     LEFT JOIN workspace_members wm ON wm.workspace_id = w.id AND wm.user_id = u.id
     WHERE u.id = ?
     LIMIT 1`,
    task.workspace_id,
    task.user_id
  );
  if (!row) return undefined;
  return {
    user: {
      id: row.user_id,
      email: row.email || "system@moon.local",
      name: row.name,
      role: row.role || "user",
      status: row.user_status || "active",
      inviteStatus: row.invite_status || "active",
      defaultWorkspaceId: row.workspace_id
    } satisfies AuthUser,
    workspace: {
      id: row.workspace_id,
      name: row.workspace_name || "Workspace",
      slug: row.slug || row.workspace_id,
      type: row.type || "personal",
      role: row.member_role || "owner",
      billingStatus: row.billing_status || "free",
      credits: 0
    } satisfies AuthWorkspace
  };
}

async function canvasHasVideo(task: ReconcileTaskRow) {
  if (!task.project_id || !task.canvas_node_id || !task.workspace_id) return false;
  const db = await getDb();
  const project = await db.get<{ nodes_json: string }>(
    "SELECT nodes_json FROM projects WHERE id = ? AND workspace_id = ?",
    task.project_id,
    task.workspace_id
  );
  if (!project) return false;
  try {
    const nodes = JSON.parse(project.nodes_json) as Array<Record<string, unknown>>;
    const node = nodes.find((item) => item.id === task.canvas_node_id);
    const data = node?.data && typeof node.data === "object" ? node.data as Record<string, unknown> : {};
    return Boolean(data.videoUrl || data.outputUrl || data.previewUrl);
  } catch {
    return false;
  }
}

async function reconcileTask(task: ReconcileTaskRow) {
  const context = await contextForTask(task);
  if (!context) return;
  const result = parseJson(task.result_json);
  const url = firstString(
    task.output_url,
    task.provider_video_url,
    task.preview_url,
    extractProviderVideoUrl(result)
  );
  const hasCanvasVideo = await canvasHasVideo(task);
  if (url && (!hasCanvasVideo || isRunningLike(task.status))) {
    logReconciler("auto-finalize", {
      taskId: task.id,
      reason: hasCanvasVideo ? "running_task_already_has_url" : "canvas_missing_video",
      videoUrl: sanitizeUrlForLog(url)
    });
    await runWithRequestContext(context, () => finalizeVideoResult({
      taskId: task.id,
      providerTaskId: task.provider_task_id || task.id,
      canvasNodeId: task.canvas_node_id,
      projectId: task.project_id,
      providerId: task.provider_id,
      modelId: task.model_id,
      providerVideoUrl: task.provider_video_url || url,
      outputUrl: task.output_url || url,
      previewUrl: task.preview_url || task.output_url || url,
      downloadableUrl: task.downloadable_url || task.output_url || url,
      providerResult: { reconciler: true, reason: hasCanvasVideo ? "running_task_already_has_url" : "canvas_missing_video" },
      rawResponse: result,
      source: "reconciler"
    }));
    return;
  }

  if (task.provider_task_id && isRunningLike(task.status)) {
    logReconciler("poll-upstream", {
      taskId: task.id,
      providerTaskId: task.provider_task_id
    });
    await runWithRequestContext(context, () => syncVideoTaskUpstream({ localTaskId: task.id }));
  }
}

export async function runVideoTaskReconcilerOnce() {
  if (reconcilerRunning) return { skipped: true };
  reconcilerRunning = true;
  try {
    const db = await getDb();
    const cutoff = Date.now() - 24 * 60 * 60 * 1000;
    const staleBefore = Date.now() - 2 * 60 * 1000;
    const rows = await db.all<ReconcileTaskRow[]>(
      `SELECT * FROM generation_tasks
       WHERE updated_at >= ?
         AND canvas_node_id IS NOT NULL
         AND (
           provider_video_url IS NOT NULL
           OR output_url IS NOT NULL
           OR preview_url IS NOT NULL
           OR (provider_task_id IS NOT NULL AND status IN ('processing','running','queued','generating','pending','submitted','created','executing','in_progress') AND updated_at <= ?)
           OR (status IN ('success','succeeded','completed') AND canvas_node_id IS NOT NULL)
         )
       ORDER BY updated_at ASC
       LIMIT 20`,
      cutoff,
      staleBefore
    );
    for (const task of rows) {
      try {
        await reconcileTask(task);
      } catch (error) {
        logReconciler("task-error", {
          taskId: task.id,
          error: rawErrorMessage(error)
        });
      }
    }
    return { checked: rows.length };
  } finally {
    reconcilerRunning = false;
  }
}

export function startVideoTaskReconciler() {
  if (process.env.VIDEO_TASK_RECONCILER_ENABLED === "false" || reconcilerTimer) return;
  const intervalMs = Math.max(10_000, Number(process.env.VIDEO_TASK_RECONCILER_INTERVAL_MS || 60_000));
  reconcilerTimer = setInterval(() => {
    void runVideoTaskReconcilerOnce().catch((error) => logReconciler("run-error", { error: rawErrorMessage(error) }));
  }, intervalMs);
  reconcilerTimer.unref?.();
  setTimeout(() => {
    void runVideoTaskReconcilerOnce().catch((error) => logReconciler("run-error", { error: rawErrorMessage(error) }));
  }, Math.min(15_000, intervalMs)).unref?.();
}
