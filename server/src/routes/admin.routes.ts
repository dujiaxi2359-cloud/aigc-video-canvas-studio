import crypto from "node:crypto";
import { Router, type Request, type Response } from "express";
import { requireAdmin, requireLogin } from "../middleware/auth.js";
import { getDb } from "../db/database.js";
import { createId } from "../utils/id.js";
import { now } from "../utils/time.js";
import { maskEncryptedApiKey } from "../services/encryption.service.js";
import { addHistory } from "../services/history.service.js";
import { persistGeneratedVideoToCOS, updateCanvasNodeWithGeneratedVideo } from "../services/generatedVideoPersistence.service.js";
import { saveGenerationTask } from "../services/generationTask.service.js";
import { runWithRequestContext } from "../services/requestContext.js";
import { isProviderError, rawErrorMessage } from "../utils/providerErrors.js";
import { sanitizeUrlForLog } from "../utils/videoResultExtractor.js";
import type { AuthUser, AuthWorkspace } from "../types/auth.js";

export const adminRouter = Router();
adminRouter.use(requireLogin, requireAdmin);

function generateInviteCode(prefix = "AIGCNONG") {
  const part = () => crypto.randomBytes(3).toString("hex").toUpperCase();
  return `${prefix}-${part()}-${part()}`;
}

const DEFAULT_INVITE_TTL_DAYS = Math.max(1, Number(process.env.DEFAULT_INVITE_TTL_DAYS || 15));
const DEFAULT_INVITE_TTL_MS = DEFAULT_INVITE_TTL_DAYS * 24 * 60 * 60 * 1000;

function inviteExpiresAt(input: unknown) {
  if (input === null) return null;
  const value = typeof input === "string" && input.trim() === "" ? undefined : input;
  if (value === undefined) return now() + DEFAULT_INVITE_TTL_MS;
  const numeric = Number(value);
  return Number.isFinite(numeric) ? numeric : now() + DEFAULT_INVITE_TTL_MS;
}

function parseJsonObject(input: unknown) {
  if (!input || typeof input !== "string") return {};
  try {
    const parsed = JSON.parse(input);
    return parsed && typeof parsed === "object" ? parsed as Record<string, unknown> : {};
  } catch {
    return {};
  }
}

function workspaceFromRow(row: any): AuthWorkspace {
  return {
    id: row.id,
    name: row.name || "Workspace",
    slug: row.slug || row.id,
    type: row.type === "team" ? "team" : "personal",
    role: "owner",
    planId: row.plan_id || undefined,
    billingStatus: row.billing_status || "free",
    credits: Number(row.credits || 0)
  };
}

function userFromRow(row: any, fallback: AuthUser): AuthUser {
  if (!row) return fallback;
  return {
    id: row.id,
    email: row.email,
    name: row.name || undefined,
    role: row.role || "user",
    status: row.status || "active",
    inviteStatus: row.invite_status || "active",
    defaultWorkspaceId: row.default_workspace_id || undefined
  };
}

adminRouter.get("/overview", async (_req, res) => {
  const db = await getDb();
  const users = await db.all("SELECT id, email, name, role, status, invite_status, last_login_at, created_at FROM users ORDER BY created_at DESC");
  const workspaces = await db.all(`SELECT w.*, COALESCE(cb.balance, 0) AS credits, COUNT(wm.id) AS member_count FROM workspaces w
    LEFT JOIN workspace_members wm ON wm.workspace_id = w.id AND wm.status = 'active'
    LEFT JOIN credit_balances cb ON cb.workspace_id = w.id GROUP BY w.id ORDER BY w.created_at DESC`);
  const invites = await db.all("SELECT * FROM invite_codes ORDER BY created_at DESC");
  const plans = await db.all("SELECT * FROM plans ORDER BY created_at DESC");
  const failureRows = await db.all<any[]>(`SELECT gh.*, w.name AS workspace_name, u.email AS user_email, mc.provider AS model_provider, mc.model_name AS configured_model_name,
      gt.id AS task_id,
      gt.provider_status AS task_provider_status,
      gt.provider_video_url AS task_provider_video_url,
      gt.output_url AS task_output_url,
      gt.cos_key AS task_cos_key,
      gt.file_size AS task_file_size,
      gt.mime_type AS task_mime_type,
      gt.completed_at AS task_completed_at,
      gt.failed_stage AS task_failed_stage,
      gt.error_code AS task_error_code,
      gt.error_message AS task_error_message,
      gt.result_json AS task_result_json
    FROM generation_history gh
    LEFT JOIN workspaces w ON w.id = gh.workspace_id
    LEFT JOIN users u ON u.id = gh.user_id
    LEFT JOIN model_configs mc ON mc.id = gh.model_config_id
    LEFT JOIN generation_tasks gt ON gt.id = (
      SELECT gt2.id FROM generation_tasks gt2
      WHERE gt2.workspace_id = gh.workspace_id
        AND (
          (gh.node_id IS NOT NULL AND gt2.result_json LIKE '%' || gh.node_id || '%')
          OR (gh.project_id IS NOT NULL AND gt2.result_json LIKE '%' || gh.project_id || '%')
        )
      ORDER BY ABS(gt2.updated_at - gh.created_at) ASC
      LIMIT 1
    )
    WHERE gh.status = 'error'
    ORDER BY gh.created_at DESC
    LIMIT 80`);
  const modelRows = await db.all<any[]>(`SELECT mc.*, w.name AS workspace_name,
    (SELECT COUNT(*) FROM usage_records ur WHERE ur.model_id = mc.id) AS usage_count,
    (SELECT COUNT(*) FROM generation_history gh WHERE gh.model_config_id = mc.id AND gh.status = 'success') AS success_count,
    (SELECT COUNT(*) FROM generation_history gh WHERE gh.model_config_id = mc.id AND gh.status = 'error') AS error_count
    FROM model_configs mc
    LEFT JOIN workspaces w ON w.id = mc.workspace_id
    ORDER BY mc.updated_at DESC`);
  const models = modelRows.map((row) => ({
    id: row.id,
    workspaceId: row.workspace_id,
    workspaceName: row.workspace_name || "Legacy / Unassigned",
    providerId: row.provider_id,
    provider: row.provider,
    category: row.category,
    displayName: row.display_name,
    apiBaseUrl: row.api_base_url,
    maskedApiKey: maskEncryptedApiKey(row.encrypted_api_key),
    modelName: row.model_name,
    modelType: row.model_type,
    enabled: Boolean(row.enabled),
    usageCount: Number(row.usage_count || 0),
    successCount: Number(row.success_count || 0),
    errorCount: Number(row.error_count || 0),
    updatedAt: row.updated_at
  }));
  const failureLogs = failureRows.map((row) => {
    const taskResult = parseJsonObject(row.task_result_json);
    return {
      id: row.id,
      generationType: row.generation_type,
      workspaceName: row.workspace_name || "Legacy / Unassigned",
      userEmail: row.user_email || "未知用户",
      modelConfigId: row.model_config_id,
      modelDisplayName: row.model_display_name || row.configured_model_name || "未知模型",
      provider: row.model_provider,
      inputMode: row.input_mode,
      prompt: row.prompt,
      errorMessage: row.task_error_message || row.error_message,
      createdAt: row.created_at,
      taskId: row.task_id,
      providerStatus: row.task_provider_status,
      providerVideoUrl: row.task_provider_video_url ? sanitizeUrlForLog(row.task_provider_video_url) : undefined,
      outputUrl: row.task_output_url,
      cosObjectKey: row.task_cos_key,
      fileSize: row.task_file_size,
      mimeType: row.task_mime_type,
      completedAt: row.task_completed_at,
      failedStage: row.task_failed_stage,
      errorCode: row.task_error_code,
      chain: {
        createEndpoint: taskResult.createEndpoint,
        pollEndpoint: taskResult.pollEndpoint,
        createRawResponse: taskResult.createRawResponse,
        pollRawResponse: taskResult.pollRawResponse,
        parsedTaskId: taskResult.providerTaskId || taskResult.parsedTaskId,
        parsedVideoUrl: taskResult.parsedVideoUrl,
        providerVideoUrl: taskResult.providerVideoUrl,
        downloadStatus: taskResult.downloadStatus,
        cosUploadStatus: taskResult.cosUploadStatus,
        cosObjectKey: taskResult.cosObjectKey || row.task_cos_key,
        finalOutputUrl: taskResult.finalOutputUrl || row.task_output_url,
        failedStage: row.task_failed_stage || taskResult.failedStage,
        errorCode: row.task_error_code || taskResult.errorCode,
        errorMessage: row.task_error_message || taskResult.errorMessage || row.error_message,
        rawResponse: taskResult.rawResponse,
        rawError: taskResult.rawError
      }
    };
  });
  res.json({ users, workspaces, invites, plans, models, failureLogs });
});

export async function syncProviderVideoResult(req: Request, res: Response) {
  const providerVideoUrl = String(req.body?.providerVideoUrl || "").trim();
  if (!providerVideoUrl) {
    return res.status(400).json({
      errorCode: "PROVIDER_VIDEO_URL_REQUIRED",
      errorMessage: "请输入中转后台已经生成的视频 URL。"
    });
  }

  const db = await getDb();
  const task = await db.get<any>("SELECT * FROM generation_tasks WHERE id = ?", req.params.taskId);
  if (!task) {
    return res.status(404).json({ errorCode: "GENERATION_TASK_NOT_FOUND", errorMessage: "没有找到对应生成任务。" });
  }
  if (!task.workspace_id) {
    return res.status(400).json({ errorCode: "TASK_WORKSPACE_MISSING", errorMessage: "该任务缺少工作空间信息，无法转存素材。" });
  }

  const workspaceRow = await db.get<any>(`SELECT w.*, COALESCE(cb.balance, 0) AS credits FROM workspaces w
    LEFT JOIN credit_balances cb ON cb.workspace_id = w.id
    WHERE w.id = ?`, task.workspace_id);
  if (!workspaceRow) {
    return res.status(404).json({ errorCode: "WORKSPACE_NOT_FOUND", errorMessage: "没有找到任务所属工作空间。" });
  }

  const taskUser = task.user_id ? await db.get<any>("SELECT * FROM users WHERE id = ?", task.user_id) : undefined;
  const context = {
    user: userFromRow(taskUser, req.auth!.user),
    workspace: workspaceFromRow(workspaceRow)
  };
  const taskResult = parseJsonObject(task.result_json);
  const projectId = typeof taskResult.projectId === "string" ? taskResult.projectId : undefined;
  const nodeId = typeof taskResult.nodeId === "string" ? taskResult.nodeId : undefined;
  const modelId = typeof taskResult.modelId === "string" ? taskResult.modelId : typeof taskResult.modelConfigId === "string" ? taskResult.modelConfigId : undefined;
  const providerId = typeof taskResult.provider === "string" ? taskResult.provider : undefined;

  try {
    const repaired = await runWithRequestContext(context, async () => {
      await saveGenerationTask({
        id: task.id,
        status: "processing",
        providerStatus: "succeeded",
        providerVideoUrl,
        stage: "downloading_video",
        progress: 80,
        result: {
          ...taskResult,
          providerVideoUrl: sanitizeUrlForLog(providerVideoUrl),
          manualRepair: true
        }
      });
      const persisted = await persistGeneratedVideoToCOS({
        providerVideoUrl,
        taskId: task.id,
        providerId,
        modelId,
        nodeId,
        projectId,
        prompt: typeof taskResult.prompt === "string" ? taskResult.prompt : undefined,
        negativePrompt: typeof taskResult.negativePrompt === "string" ? taskResult.negativePrompt : undefined,
        generationParams: {
          ...taskResult,
          manualRepair: true
        }
      });
      await saveGenerationTask({
        id: task.id,
        status: "processing",
        providerStatus: "succeeded",
        providerVideoUrl,
        outputUrl: persisted.cosUrl,
        cosKey: persisted.cosObjectKey,
        fileSize: persisted.fileSize,
        mimeType: persisted.mimeType,
        stage: "cos_uploaded",
        progress: 92,
        result: {
          providerVideoUrl: sanitizeUrlForLog(providerVideoUrl),
          cosUploadStatus: persisted.cosUploadStatus,
          cosObjectKey: persisted.cosObjectKey,
          finalOutputUrl: persisted.cosUrl
        }
      });
      await addHistory({
        generationType: "video",
        projectId,
        nodeId,
        modelConfigId: typeof taskResult.modelConfigId === "string" ? taskResult.modelConfigId : undefined,
        modelDisplayName: typeof taskResult.modelDisplayName === "string" ? taskResult.modelDisplayName : modelId || "手动修复视频",
        inputMode: typeof taskResult.inputMode === "string" ? taskResult.inputMode : undefined,
        prompt: typeof taskResult.prompt === "string" ? taskResult.prompt : "管理员从中转视频 URL 重新转存",
        duration: typeof taskResult.duration === "number" ? taskResult.duration : undefined,
        aspectRatio: typeof taskResult.aspectRatio === "string" ? taskResult.aspectRatio : undefined,
        resolution: typeof taskResult.resolution === "string" ? taskResult.resolution : undefined,
        status: "success",
        outputPath: persisted.localPath,
        outputUrl: persisted.cosUrl
      });
      await saveGenerationTask({
        id: task.id,
        status: "processing",
        providerStatus: "succeeded",
        providerVideoUrl,
        outputUrl: persisted.cosUrl,
        stage: "history_saved",
        progress: 96
      });
      await updateCanvasNodeWithGeneratedVideo({
        projectId,
        nodeId,
        outputUrl: persisted.cosUrl,
        outputAssetId: persisted.asset.id,
        downloadableUrl: persisted.asset.downloadUrl ?? persisted.cosUrl
      });
      await saveGenerationTask({
        id: task.id,
        status: "succeeded",
        providerStatus: "succeeded",
        providerVideoUrl,
        outputUrl: persisted.cosUrl,
        cosKey: persisted.cosObjectKey,
        fileSize: persisted.fileSize,
        mimeType: persisted.mimeType,
        completedAt: now(),
        stage: "succeeded",
        progress: 100,
        result: {
          providerVideoUrl: sanitizeUrlForLog(providerVideoUrl),
          cosUploadStatus: persisted.cosUploadStatus,
          cosObjectKey: persisted.cosObjectKey,
          finalOutputUrl: persisted.cosUrl,
          outputUrl: persisted.cosUrl,
          canvasUpdated: true,
          manualRepair: true
        }
      });
      return persisted;
    });
    return res.json({
      status: "success",
      taskId: task.id,
      outputUrl: repaired.cosUrl,
      cosObjectKey: repaired.cosObjectKey,
      fileSize: repaired.fileSize,
      mimeType: repaired.mimeType
    });
  } catch (error) {
    const details = isProviderError(error) && error.details && typeof error.details === "object"
      ? error.details as Record<string, unknown>
      : {};
    await runWithRequestContext(context, async () => saveGenerationTask({
      id: task.id,
      status: "error",
      providerStatus: "failed",
      providerVideoUrl,
      stage: "failed",
      failedStage: typeof details.failedStage === "string" ? details.failedStage : "failed",
      errorCode: isProviderError(error) ? error.errorCode : "REPAIR_VIDEO_FAILED",
      errorMessage: isProviderError(error) ? error.message : rawErrorMessage(error),
      progress: 100,
      result: {
        ...details,
        providerVideoUrl: sanitizeUrlForLog(providerVideoUrl),
        manualRepair: true,
        errorMessage: rawErrorMessage(error)
      }
    }));
    return res.status(500).json({
      errorCode: isProviderError(error) ? error.errorCode : "REPAIR_VIDEO_FAILED",
      errorMessage: isProviderError(error) ? error.message : rawErrorMessage(error),
      debugMessage: rawErrorMessage(error),
      details
    });
  }
}

adminRouter.post(["/generation-tasks/:taskId/repair-video", "/generation-tasks/:taskId/sync-provider-result"], syncProviderVideoResult);

adminRouter.post("/invite-codes", async (req, res) => {
  const db = await getDb();
  const code = String(req.body?.code || generateInviteCode()).trim().toUpperCase();
  const id = createId("invite");
  await db.run(`INSERT INTO invite_codes (id, code, name, description, type, target_workspace_id, member_role, max_uses, used_count, expires_at, status, created_by, created_at, updated_at)
    VALUES (?, ?, ?, ?, ?, ?, ?, ?, 0, ?, 'active', ?, ?, ?)`, id, code, req.body?.name || code, req.body?.description, req.body?.type || "personal", req.body?.targetWorkspaceId, req.body?.memberRole || "member", Number(req.body?.maxUses || 1), inviteExpiresAt(req.body?.expiresAt), req.auth!.user.id, now(), now());
  res.status(201).json(await db.get("SELECT * FROM invite_codes WHERE id = ?", id));
});

adminRouter.post("/invite-codes/batch", async (req, res) => {
  const db = await getDb();
  const count = Math.min(100, Math.max(1, Number(req.body?.count || 30)));
  const maxUses = Math.max(1, Number(req.body?.maxUses || 1));
  const type = String(req.body?.type || "customer");
  const prefix = String(req.body?.prefix || "AIGCNONG").replace(/[^A-Z0-9-]/gi, "").toUpperCase() || "AIGCNONG";
  const created = [];
  for (let index = 0; index < count; index += 1) {
    let code = generateInviteCode(prefix);
    while (await db.get("SELECT id FROM invite_codes WHERE code = ?", code)) code = generateInviteCode(prefix);
    const id = createId("invite");
    await db.run(`INSERT INTO invite_codes (id, code, name, description, type, target_workspace_id, member_role, max_uses, used_count, expires_at, status, created_by, created_at, updated_at)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?, 0, ?, 'active', ?, ?, ?)`, id, code, `客户邀请码 ${index + 1}`, req.body?.description, type, req.body?.targetWorkspaceId, req.body?.memberRole || "member", maxUses, inviteExpiresAt(req.body?.expiresAt), req.auth!.user.id, now(), now());
    created.push(await db.get("SELECT * FROM invite_codes WHERE id = ?", id));
  }
  res.status(201).json({ invites: created });
});

adminRouter.post("/invite-codes/cancel", async (req, res) => {
  const db = await getDb();
  const code = String(req.body?.code || "").trim().toUpperCase();
  if (!code) return res.status(400).json({ errorCode: "INVITE_CODE_REQUIRED", errorMessage: "请输入要取消的邀请码。" });
  const invite = await db.get<any>("SELECT * FROM invite_codes WHERE code = ?", code);
  if (!invite) return res.status(404).json({ errorCode: "INVITE_NOT_FOUND", errorMessage: "没有找到这个邀请码。" });
  if (invite.status === "disabled") return res.json(invite);
  await db.run("UPDATE invite_codes SET status = 'disabled', updated_at = ? WHERE id = ?", now(), invite.id);
  res.json(await db.get("SELECT * FROM invite_codes WHERE id = ?", invite.id));
});

adminRouter.patch("/invite-codes/:id", async (req, res) => {
  const db = await getDb();
  await db.run("UPDATE invite_codes SET status = COALESCE(?, status), max_uses = COALESCE(?, max_uses), expires_at = COALESCE(?, expires_at), updated_at = ? WHERE id = ?", req.body?.status, req.body?.maxUses, req.body?.expiresAt, now(), req.params.id);
  res.json(await db.get("SELECT * FROM invite_codes WHERE id = ?", req.params.id));
});

adminRouter.post("/workspaces/:id/credits", async (req, res) => {
  const db = await getDb();
  const amount = Number(req.body?.amount || 0);
  await db.run("INSERT INTO credit_balances (id, workspace_id, balance, updated_at) VALUES (?, ?, ?, ?) ON CONFLICT(workspace_id) DO UPDATE SET balance = balance + excluded.balance, updated_at = excluded.updated_at", createId("credits"), req.params.id, amount, now());
  await db.run("INSERT INTO credit_transactions (id, workspace_id, user_id, type, amount, reason, created_at) VALUES (?, ?, ?, 'adjust', ?, ?, ?)", createId("credit_tx"), req.params.id, req.auth!.user.id, amount, req.body?.reason || "admin adjustment", now());
  res.json(await db.get("SELECT * FROM credit_balances WHERE workspace_id = ?", req.params.id));
});

adminRouter.post("/workspaces", async (req, res) => {
  const db = await getDb();
  const id = createId("workspace");
  const slug = String(req.body?.slug || `${String(req.body?.name || "team").toLowerCase().replace(/[^a-z0-9]+/g, "-")}-${crypto.randomBytes(3).toString("hex")}`);
  await db.run("INSERT INTO workspaces (id, name, slug, type, owner_user_id, plan_id, billing_status, created_at, updated_at) VALUES (?, ?, ?, 'team', ?, ?, 'free', ?, ?)", id, req.body?.name || "新团队", slug, req.auth!.user.id, req.body?.planId || null, now(), now());
  await db.run("INSERT INTO workspace_members (id, workspace_id, user_id, role, status, joined_at, created_at, updated_at) VALUES (?, ?, ?, 'owner', 'active', ?, ?, ?)", createId("member"), id, req.auth!.user.id, now(), now(), now());
  await db.run("INSERT INTO credit_balances (id, workspace_id, balance, updated_at) VALUES (?, ?, ?, ?)", createId("credits"), id, Number(req.body?.credits || 0), now());
  res.status(201).json(await db.get("SELECT * FROM workspaces WHERE id = ?", id));
});

adminRouter.post("/plans", async (req, res) => {
  const db = await getDb();
  const id = createId("plan");
  await db.run(`INSERT INTO plans (id, code, name, type, price_monthly, price_yearly, currency, max_members, monthly_credits, storage_limit_mb, features_json, status, created_at, updated_at)
    VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, 'active', ?, ?)`, id, req.body?.code, req.body?.name, req.body?.type || "personal", Number(req.body?.priceMonthly || 0), Number(req.body?.priceYearly || 0), req.body?.currency || "CNY", Number(req.body?.maxMembers || 1), Number(req.body?.monthlyCredits || 0), Number(req.body?.storageLimitMb || 0), JSON.stringify(req.body?.features || {}), now(), now());
  res.status(201).json(await db.get("SELECT * FROM plans WHERE id = ?", id));
});

adminRouter.post("/workspaces/:id/plan", async (req, res) => {
  const db = await getDb();
  await db.run("UPDATE workspaces SET plan_id = ?, billing_status = ?, updated_at = ? WHERE id = ?", req.body?.planId || null, req.body?.billingStatus || "active", now(), req.params.id);
  res.json(await db.get("SELECT * FROM workspaces WHERE id = ?", req.params.id));
});
