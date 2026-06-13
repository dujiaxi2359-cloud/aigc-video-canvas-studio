import fs from "node:fs";
import path from "node:path";
import { createRequire } from "node:module";

type SqliteValue = string | number | bigint | null | Buffer;

type StatementSyncLike = {
  run: (...params: SqliteValue[]) => unknown;
  get: (...params: SqliteValue[]) => unknown;
  all: (...params: SqliteValue[]) => unknown[];
};

type DatabaseSyncLike = {
  exec: (sql: string) => void;
  prepare: (sql: string) => StatementSyncLike;
};

const require = createRequire(import.meta.url);
const { DatabaseSync } = require("node:sqlite") as {
  DatabaseSync: new (filename: string) => DatabaseSyncLike;
};

class AppDatabase {
  constructor(private readonly database: DatabaseSyncLike) {}

  async exec(sql: string) {
    this.database.exec(sql);
  }

  async run(sql: string, ...params: unknown[]) {
    this.database.prepare(sql).run(...normalizeParams(params));
  }

  async get<T = unknown>(sql: string, ...params: unknown[]) {
    return this.database.prepare(sql).get(...normalizeParams(params)) as T | undefined;
  }

  async all<T = unknown[]>(sql: string, ...params: unknown[]) {
    return this.database.prepare(sql).all(...normalizeParams(params)) as T;
  }

  async transaction<T>(callback: () => Promise<T>) {
    this.database.exec("BEGIN IMMEDIATE");
    try {
      const result = await callback();
      this.database.exec("COMMIT");
      return result;
    } catch (error) {
      this.database.exec("ROLLBACK");
      throw error;
    }
  }
}

function normalizeParams(params: unknown[]): SqliteValue[] {
  return params.map((param) => {
    if (param === undefined) return null;
    if (typeof param === "boolean") return param ? 1 : 0;
    if (typeof param === "string" || typeof param === "number" || typeof param === "bigint" || param === null || Buffer.isBuffer(param)) {
      return param;
    }
    return String(param);
  });
}

let db: AppDatabase | null = null;

function customerInviteCode() {
  return `AIGCNONG-${Math.random().toString(36).slice(2, 6).toUpperCase()}-${Math.random().toString(36).slice(2, 6).toUpperCase()}`;
}

export async function getDb() {
  if (db) return db;

  const databasePath = process.env.DATABASE_PATH ?? "./data/app.sqlite";
  const absolutePath = path.resolve(process.cwd(), databasePath);
  fs.mkdirSync(path.dirname(absolutePath), { recursive: true });

  db = new AppDatabase(new DatabaseSync(absolutePath));

  const schemaPath = path.resolve(process.cwd(), "src/db/schema.sql");
  await db.exec(fs.readFileSync(schemaPath, "utf8"));
  const historyColumns = await db.all<Array<{ name: string }>>("PRAGMA table_info(generation_history)");
  if (!historyColumns.some((column) => column.name === "generation_type")) {
    await db.exec("ALTER TABLE generation_history ADD COLUMN generation_type TEXT");
  }
  const modelColumns = await db.all<Array<{ name: string }>>("PRAGMA table_info(model_configs)");
  if (!modelColumns.some((column) => column.name === "provider_id")) {
    await db.exec("ALTER TABLE model_configs ADD COLUMN provider_id TEXT");
  }
  if (!modelColumns.some((column) => column.name === "category")) {
    await db.exec("ALTER TABLE model_configs ADD COLUMN category TEXT");
  }
  if (!modelColumns.some((column) => column.name === "requires_api_base_url")) {
    await db.exec("ALTER TABLE model_configs ADD COLUMN requires_api_base_url INTEGER DEFAULT 0");
  }
  if (!modelColumns.some((column) => column.name === "workspace_id")) {
    await db.exec("ALTER TABLE model_configs ADD COLUMN workspace_id TEXT");
  }
  if (!modelColumns.some((column) => column.name === "created_by_user_id")) {
    await db.exec("ALTER TABLE model_configs ADD COLUMN created_by_user_id TEXT");
  }
  const database = db;
  const ensureColumn = async (table: string, name: string, sql: string) => {
    const columns = await database.all<Array<{ name: string }>>(`PRAGMA table_info(${table})`);
    if (!columns.some((column) => column.name === name)) await database.exec(sql);
  };
  const assetColumns = await database.all<Array<{ name: string }>>("PRAGMA table_info(assets)");
  const addAssetColumn = async (name: string, sql: string) => {
    if (!assetColumns.some((column) => column.name === name)) await database.exec(sql);
  };
  await addAssetColumn("name", "ALTER TABLE assets ADD COLUMN name TEXT");
  await addAssetColumn("source", "ALTER TABLE assets ADD COLUMN source TEXT DEFAULT 'uploaded'");
  await addAssetColumn("folder_id", "ALTER TABLE assets ADD COLUMN folder_id TEXT");
  await addAssetColumn("file_name", "ALTER TABLE assets ADD COLUMN file_name TEXT");
  await addAssetColumn("public_url", "ALTER TABLE assets ADD COLUMN public_url TEXT");
  await addAssetColumn("download_url", "ALTER TABLE assets ADD COLUMN download_url TEXT");
  await addAssetColumn("mime_type", "ALTER TABLE assets ADD COLUMN mime_type TEXT");
  await addAssetColumn("width", "ALTER TABLE assets ADD COLUMN width INTEGER");
  await addAssetColumn("height", "ALTER TABLE assets ADD COLUMN height INTEGER");
  await addAssetColumn("fps", "ALTER TABLE assets ADD COLUMN fps REAL");
  await addAssetColumn("provider_id", "ALTER TABLE assets ADD COLUMN provider_id TEXT");
  await addAssetColumn("model_id", "ALTER TABLE assets ADD COLUMN model_id TEXT");
  await addAssetColumn("node_id", "ALTER TABLE assets ADD COLUMN node_id TEXT");
  await addAssetColumn("project_id", "ALTER TABLE assets ADD COLUMN project_id TEXT");
  await addAssetColumn("prompt", "ALTER TABLE assets ADD COLUMN prompt TEXT");
  await addAssetColumn("negative_prompt", "ALTER TABLE assets ADD COLUMN negative_prompt TEXT");
  await addAssetColumn("generation_params_json", "ALTER TABLE assets ADD COLUMN generation_params_json TEXT");
  await addAssetColumn("deleted_at", "ALTER TABLE assets ADD COLUMN deleted_at INTEGER");
  await addAssetColumn("updated_at", "ALTER TABLE assets ADD COLUMN updated_at INTEGER");
  await ensureColumn("projects", "workspace_id", "ALTER TABLE projects ADD COLUMN workspace_id TEXT");
  await ensureColumn("projects", "owner_user_id", "ALTER TABLE projects ADD COLUMN owner_user_id TEXT");
  await ensureColumn("projects", "folder_id", "ALTER TABLE projects ADD COLUMN folder_id TEXT");
  await ensureColumn("projects", "cover_asset_id", "ALTER TABLE projects ADD COLUMN cover_asset_id TEXT");
  await ensureColumn("assets", "workspace_id", "ALTER TABLE assets ADD COLUMN workspace_id TEXT");
  await ensureColumn("assets", "owner_user_id", "ALTER TABLE assets ADD COLUMN owner_user_id TEXT");
  await ensureColumn("asset_folders", "workspace_id", "ALTER TABLE asset_folders ADD COLUMN workspace_id TEXT");
  await ensureColumn("generation_history", "workspace_id", "ALTER TABLE generation_history ADD COLUMN workspace_id TEXT");
  await ensureColumn("generation_history", "user_id", "ALTER TABLE generation_history ADD COLUMN user_id TEXT");
  await ensureColumn("generation_tasks", "workspace_id", "ALTER TABLE generation_tasks ADD COLUMN workspace_id TEXT");
  await ensureColumn("generation_tasks", "user_id", "ALTER TABLE generation_tasks ADD COLUMN user_id TEXT");
  await database.exec("CREATE INDEX IF NOT EXISTS idx_projects_workspace ON projects(workspace_id); CREATE INDEX IF NOT EXISTS idx_assets_workspace ON assets(workspace_id); CREATE INDEX IF NOT EXISTS idx_asset_folders_workspace ON asset_folders(workspace_id); CREATE INDEX IF NOT EXISTS idx_history_workspace ON generation_history(workspace_id); CREATE INDEX IF NOT EXISTS idx_model_configs_workspace ON model_configs(workspace_id)");
  const timestamp = Date.now();
  await database.run(`UPDATE model_configs SET workspace_id = COALESCE(
    (SELECT default_workspace_id FROM users WHERE role IN ('super_admin', 'admin') AND default_workspace_id IS NOT NULL ORDER BY created_at ASC LIMIT 1),
    (SELECT id FROM workspaces ORDER BY created_at ASC LIMIT 1)
  ) WHERE workspace_id IS NULL`);
  await database.run("INSERT OR IGNORE INTO plans (id, code, name, type, price_monthly, price_yearly, currency, max_members, monthly_credits, storage_limit_mb, features_json, status, created_at, updated_at) VALUES ('plan_free', 'free', 'Free', 'personal', 0, 0, 'CNY', 1, 100, 1024, ?, 'active', ?, ?)", JSON.stringify({ image_generation: true, video_generation: true, agent: true, upload: true, export: true }), timestamp, timestamp);
  const bootstrapInvite = (process.env.BOOTSTRAP_INVITE_CODE || (process.env.NODE_ENV === "production" ? "" : "AIGCNONG-ACCESS")).trim().toUpperCase();
  if (bootstrapInvite) {
    await database.run("INSERT OR IGNORE INTO invite_codes (id, code, name, type, max_uses, used_count, status, created_at, updated_at) VALUES ('invite_bootstrap', ?, 'Bootstrap Access', 'internal', 1000, 0, 'active', ?, ?)", bootstrapInvite, timestamp, timestamp);
    if (process.env.NODE_ENV !== "production") console.log(`[auth] development invite code: ${bootstrapInvite}`);
  }
  const targetCustomerInvites = Number(process.env.DEFAULT_CUSTOMER_INVITE_COUNT || 30);
  if (targetCustomerInvites > 0) {
    const existing = await database.get<{ count: number }>("SELECT COUNT(*) AS count FROM invite_codes WHERE type = 'customer'");
    const missing = Math.max(0, targetCustomerInvites - Number(existing?.count || 0));
    for (let index = 0; index < missing; index += 1) {
      let code = customerInviteCode();
      while (await database.get("SELECT id FROM invite_codes WHERE code = ?", code)) code = customerInviteCode();
      await database.run(
        "INSERT INTO invite_codes (id, code, name, type, max_uses, used_count, status, created_at, updated_at) VALUES (?, ?, ?, 'customer', 1, 0, 'active', ?, ?)",
        `invite_customer_${timestamp}_${index}`,
        code,
        `客户邀请码 ${index + 1}`,
        timestamp,
        timestamp
      );
    }
  }
  return db;
}
