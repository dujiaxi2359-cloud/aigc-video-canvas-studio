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
  const database = db;
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
  return db;
}
