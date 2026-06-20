import crypto from "node:crypto";
import { Router } from "express";
import { requireAdmin, requireLogin } from "../middleware/auth.js";
import { getDb } from "../db/database.js";
import { createId } from "../utils/id.js";
import { now } from "../utils/time.js";
import { maskEncryptedApiKey } from "../services/encryption.service.js";

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

adminRouter.get("/overview", async (_req, res) => {
  const db = await getDb();
  const users = await db.all("SELECT id, email, name, role, status, invite_status, last_login_at, created_at FROM users ORDER BY created_at DESC");
  const workspaces = await db.all(`SELECT w.*, COALESCE(cb.balance, 0) AS credits, COUNT(wm.id) AS member_count FROM workspaces w
    LEFT JOIN workspace_members wm ON wm.workspace_id = w.id AND wm.status = 'active'
    LEFT JOIN credit_balances cb ON cb.workspace_id = w.id GROUP BY w.id ORDER BY w.created_at DESC`);
  const invites = await db.all("SELECT * FROM invite_codes ORDER BY created_at DESC");
  const plans = await db.all("SELECT * FROM plans ORDER BY created_at DESC");
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
  res.json({ users, workspaces, invites, plans, models });
});

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
