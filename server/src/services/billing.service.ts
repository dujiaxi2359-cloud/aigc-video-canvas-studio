import { getDb } from "../db/database.js";
import { createId } from "../utils/id.js";
import { now } from "../utils/time.js";
import { requireRequestContext } from "./requestContext.js";

export async function assertCreditsAvailable(cost = 1) {
  const { workspace } = requireRequestContext();
  const db = await getDb();
  const row = await db.get<{ balance: number }>("SELECT balance FROM credit_balances WHERE workspace_id = ?", workspace.id);
  if ((row?.balance ?? 0) < cost) throw new Error("INSUFFICIENT_CREDITS");
}

export async function assertWorkspaceFeature(feature: string) {
  const { workspace } = requireRequestContext();
  const db = await getDb();
  const row = await db.get<{ features_json: string }>(`SELECT p.features_json FROM workspaces w
    LEFT JOIN plans p ON p.id = COALESCE(w.plan_id, 'plan_free') WHERE w.id = ?`, workspace.id);
  const features = JSON.parse(row?.features_json || "{}");
  if (features[feature] === false) throw new Error("FEATURE_NOT_AVAILABLE");
}

export async function consumeCredits(input: { cost?: number; actionType: string; provider?: string; modelId?: string; relatedGenerationId?: string; metadata?: unknown }) {
  const cost = Math.max(0, input.cost ?? 1);
  const { workspace, user } = requireRequestContext();
  const db = await getDb();
  await db.transaction(async () => {
    const result = await db.get<{ balance: number }>("SELECT balance FROM credit_balances WHERE workspace_id = ?", workspace.id);
    if ((result?.balance ?? 0) < cost) throw new Error("INSUFFICIENT_CREDITS");
    await db.run("UPDATE credit_balances SET balance = balance - ?, updated_at = ? WHERE workspace_id = ?", cost, now(), workspace.id);
    await db.run("INSERT INTO credit_transactions (id, workspace_id, user_id, type, amount, reason, related_generation_id, created_at) VALUES (?, ?, ?, 'consume', ?, ?, ?, ?)", createId("credit_tx"), workspace.id, user.id, -cost, input.actionType, input.relatedGenerationId, now());
    await db.run("INSERT INTO usage_records (id, workspace_id, user_id, model_provider, model_id, action_type, cost_credits, metadata_json, created_at) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)", createId("usage"), workspace.id, user.id, input.provider, input.modelId, input.actionType, cost, JSON.stringify(input.metadata || {}), now());
  });
}
