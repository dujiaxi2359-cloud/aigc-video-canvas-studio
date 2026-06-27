import fs from "node:fs";
import path from "node:path";
import { createRequire } from "node:module";
import { inferImageModelType, inferImageProvider, normalizeImageCapabilities } from "../services/imageCapabilityNormalization.js";
import type { ModelCapabilities } from "../types/model.js";

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

async function migrateAi666VideoProtocols(database: AppDatabase) {
  const rows = await database.all<Array<{ id: string; api_base_url: string; display_name: string; model_name: string; capabilities_json: string }>>(
    "SELECT id, api_base_url, display_name, model_name, capabilities_json FROM model_configs WHERE lower(api_base_url) LIKE '%ai666.net%' OR lower(api_base_url) LIKE '%cy88.ai%' OR lower(model_name) LIKE '%seedance%' OR lower(model_name) LIKE '%kling%' OR lower(model_name) LIKE '%grok%'"
  );
  for (const row of rows) {
    const name = row.model_name.toLowerCase();
    const capabilities = JSON.parse(row.capabilities_json) as Record<string, unknown>;
    const channelCapability = capabilities.channelCapability && typeof capabilities.channelCapability === "object" ? capabilities.channelCapability as Record<string, unknown> : {};
    const oldFamily = String(channelCapability.apiFamily ?? capabilities.apiFamily ?? "");
    const modelCapability = capabilities.modelCapability as Record<string, unknown> | undefined;
    const officialModel = String(modelCapability?.model ?? "");
    const hasOfficialModel = Boolean(officialModel);
    let changed = false;
    let displayName = row.display_name;
    const assign = (values: Record<string, unknown>) => {
      Object.assign(capabilities, values);
      changed = true;
    };
    const assignDisplayName = (value: string) => {
      if (displayName !== value) {
        displayName = value;
        changed = true;
      }
    };

    const isSeedance20 = /doubao[-_]?seedance[-_]?2[-_]?0/.test(name);
    const isSeedance20Fast = /doubao[-_]?seedance[-_]?2[-_]?0[-_]?fast/.test(name);
    const seedance20DisplayName = isSeedance20Fast ? "Seedance 2.0 Fast" : "Seedance 2.0";
    const seedance20ModelKey = isSeedance20Fast ? "seedance-2-0-fast" : "seedance-2-0";
    const seedance20ImageTransport = String(channelCapability.imageTransport ?? capabilities.imageTransport ?? "");
    const seedance20VideoTransport = String(channelCapability.videoTransport ?? capabilities.videoTransport ?? "");
    const seedance20ChannelInputs = Array.isArray(channelCapability.supportedInputs) ? channelCapability.supportedInputs.map(String) : [];

    if (isSeedance20 && (!oldFamily || oldFamily === "openai_chat_video" || oldFamily === "openai_videos" || !hasOfficialModel || displayName !== seedance20DisplayName || officialModel !== seedance20ModelKey || seedance20ImageTransport !== "url_or_asset" || seedance20VideoTransport !== "url_or_asset" || !seedance20ChannelInputs.includes("reference_image") || !seedance20ChannelInputs.includes("video"))) {
      assignDisplayName(seedance20DisplayName);
      assign({
        inputModes: ["text-to-video", "image-to-video", "first-last-frame", "reference-to-video", "video-to-video"],
        duration: { type: "enum", values: [0, 4, 5, 6, 7, 8, 9, 10, 11, 12, 13, 14, 15] },
        aspectRatios: ["9:16", "16:9", "1:1", "3:4", "4:3", "21:9"],
        resolutions: ["480P", "720P", "1080P"],
        supportsImageInput: true, supportsReferenceImage: true, supportsMultiImageInput: true,
        supportsFirstLastFrame: true, supportsVideoInput: true, supportsAudio: true,
        maxReferenceImages: 9, maxReferenceVideos: 3, maxReferenceAudios: 3, maxReferenceFiles: 12,
        supportedInputs: ["text", "image", "first_frame", "reference_image", "first_last_frame", "video"],
        modelCapability: { model: seedance20ModelKey, supportsTextToVideo: true, supportsImageToVideo: true, supportsFirstLastFrame: true, supportsVideoToVideo: true },
        channelCapability: {
          provider: "doubao", channel: "proxy", apiFamily: "seedance2_native",
          createEndpoint: "/v1/video/generations", endpoint: "/v1/video/generations",
          pollEndpoint: "/v1/video/generations/{taskId}", requestFormat: "json",
          imageTransport: "url_or_asset", videoTransport: "url_or_asset", idField: "task_id", taskIdField: "task_id",
          supportedInputs: ["text", "image", "first_frame", "reference_image", "first_last_frame", "video"]
        }
      });
    } else if (/(?:doubao[-_]?seedance|seedance)[-_ .]?1[-_ .]?5/.test(name) && (!oldFamily || oldFamily === "openai_videos" || oldFamily === "seedance2_native" || !hasOfficialModel || JSON.stringify(capabilities).includes("reference-to-video") || JSON.stringify(capabilities).includes("reference_image"))) {
      assignDisplayName("Seedance 1.5 Pro");
      assign({
        inputModes: ["text-to-video", "image-to-video", "first-last-frame"],
        duration: { type: "range", min: 4, max: 11, step: 1 },
        aspectRatios: ["16:9", "9:16", "1:1"],
        resolutions: ["480P", "720P", "1080P"],
        supportsImageInput: true, supportsFirstLastFrame: true, maxReferenceImages: 2,
        modelCapability: { model: "seedance-1-5-pro", supportsTextToVideo: true, supportsImageToVideo: true, supportsFirstLastFrame: true, supportsVideoToVideo: false },
        channelCapability: {
          provider: "doubao", channel: "proxy", apiFamily: "doubao_seedance15",
          createEndpoint: "/v1/videos", endpoint: "/v1/videos", pollEndpoint: "/v1/videos/{taskId}",
          requestFormat: "multipart", imageTransport: "multipart_file", imageField: "first_frame_image",
          supportedInputs: ["text", "image", "first_frame", "first_last_frame"]
        },
        supportedInputs: ["text", "image", "first_frame", "first_last_frame"],
        supportedDurations: [4, 5, 6, 7, 8, 9, 10, 11], supportsVideoInput: false
      });
    } else if (/kling|可灵/.test(name) && (!oldFamily || oldFamily === "openai_videos" || !hasOfficialModel)) {
      const noReference = /(?:^|[-_])noref(?:$|[-_])/.test(name);
      assignDisplayName("Kling 3.0 Omni");
      assign({
        inputModes: ["text-to-video", "image-to-video", "first-last-frame", "reference-to-video"],
        duration: { type: "enum", values: [5, 10, 15] },
        aspectRatios: ["16:9", "9:16", "1:1"],
        resolutions: ["720P", "1080P"],
        supportsImageInput: true, supportsReferenceImage: true, supportsMultiImageInput: true,
        supportsFirstLastFrame: true, supportsMotionControl: true, supportsCameraControl: true,
        modelCapability: { model: "kling-3-0", supportsTextToVideo: true, supportsImageToVideo: true, supportsFirstLastFrame: true, supportsVideoToVideo: false },
        channelCapability: {
          provider: "kling", channel: "proxy", apiFamily: "aigc_video_json",
          createEndpoint: "/v1/videos", endpoint: "/v1/videos", pollEndpoint: "/v1/videos/{taskId}",
          requestFormat: "json", imageTransport: noReference ? "unsupported" : "url_or_asset", imageField: "image",
          supportedInputs: noReference ? ["text"] : ["text", "image", "first_frame", "first_last_frame"]
        },
        supportedInputs: noReference ? ["text"] : ["text", "image", "first_frame", "first_last_frame"],
        maxReferenceImages: 4
      });
    }

    const grokKnownModel = /grok[-_ .]?video[-_ .]?3[-_ .]?max/.test(name) ? { displayName: "Grok Video 3 Max", model: "grok-video-3-max", duration: { type: "enum", values: [15] }, supportedDurations: [15] }
      : /grok[-_ .]?video[-_ .]?3[-_ .]?pro/.test(name) ? { displayName: "Grok Video 3 Pro", model: "grok-video-3-pro", duration: { type: "enum", values: [10] }, supportedDurations: [10] }
        : /grok[-_ .]?video[-_ .]?3/.test(name) ? { displayName: "Grok Video 3", model: "grok-video-3", duration: { type: "range", min: 1, max: 15, step: 1 }, supportedDurations: Array.from({ length: 15 }, (_, index) => index + 1) }
          : undefined;
    const grokNeedsCapabilityUpgrade = grokKnownModel && (
      !Array.isArray(capabilities.aspectRatios) || capabilities.aspectRatios.length === 0 ||
      !Array.isArray(capabilities.resolutions) || capabilities.resolutions.length === 0 ||
      !capabilities.duration
    );
    if (grokKnownModel && grokNeedsCapabilityUpgrade) {
      assignDisplayName(grokKnownModel.displayName);
      const existingChannel = capabilities.channelCapability && typeof capabilities.channelCapability === "object" ? capabilities.channelCapability as Record<string, unknown> : {};
      assign({
        inputModes: ["text-to-video", "image-to-video", "reference-to-video", "video-to-video"],
        duration: grokKnownModel.duration,
        aspectRatios: ["16:9", "9:16", "2:3", "3:2", "1:1"],
        resolutions: ["720P", "1080P"],
        supportsImageInput: true, supportsReferenceImage: true, supportsMultiImageInput: true,
        supportsVideoInput: true, supportsAudio: true,
        maxReferenceImages: 7,
        supportedDurations: grokKnownModel.supportedDurations,
        modelCapability: { model: grokKnownModel.model, supportsTextToVideo: true, supportsImageToVideo: true, supportsReferenceToVideo: true, supportsVideoToVideo: true },
        channelCapability: {
          ...existingChannel,
          provider: existingChannel.provider ?? "grok",
          channel: existingChannel.channel ?? "proxy",
          apiFamily: existingChannel.apiFamily ?? "grok_video",
          createEndpoint: existingChannel.createEndpoint ?? "/v1/videos",
          endpoint: existingChannel.endpoint ?? "/v1/videos",
          pollEndpoint: existingChannel.pollEndpoint ?? "/v1/videos/{taskId}",
          requestFormat: existingChannel.requestFormat ?? "multipart",
          imageTransport: existingChannel.imageTransport ?? "multipart_file",
          supportedInputs: Array.isArray(existingChannel.supportedInputs) && existingChannel.supportedInputs.length
            ? existingChannel.supportedInputs
            : ["text", "image", "first_frame", "reference_image", "video"]
        },
        supportedInputs: ["text", "image", "first_frame", "reference_image", "video"]
      });
    }

    const grokDisplayName = /grok[-_ .]?imagine[-_ .]?video[-_ .]?1[-_ .]?5/.test(name) ? "Grok Imagine Video 1.5 Preview"
      : /grok[-_ .]?imagine[-_ .]?1[-_ .]?0[-_ .]?video/.test(name) ? "Grok Imagine Video 1.0"
        : /grok[-_ .]?imagine[-_ .]?video/.test(name) ? "Grok Imagine Video"
          : /grok[-_ .]?video[-_ .]?3[-_ .]?max/.test(name) ? "Grok Video 3 Max"
            : /grok[-_ .]?video[-_ .]?3[-_ .]?pro/.test(name) ? "Grok Video 3 Pro"
              : /grok[-_ .]?video[-_ .]?3/.test(name) ? "Grok Video 3"
                : /grok[-_ .]?1[-_ .]?5[-_ .]?video[-_ .]?15s/.test(name) ? "Grok 1.5 Video 15s"
                  : /grok[-_ .]?1[-_ .]?5[-_ .]?video[-_ .]?10s/.test(name) ? "Grok 1.5 Video 10s"
                    : /grok[-_ .]?1[-_ .]?5[-_ .]?video[-_ .]?6s/.test(name) ? "Grok 1.5 Video 6s"
                      : "";
    if (grokDisplayName) assignDisplayName(grokDisplayName);

    if (grokDisplayName) {
      const existingChannel = capabilities.channelCapability && typeof capabilities.channelCapability === "object"
        ? capabilities.channelCapability as Record<string, unknown>
        : {};
      const isRunApiGrok = /runapi\.co/i.test(row.api_base_url);
      const isAi666Grok = /ai\.ai666\.net/i.test(row.api_base_url);
      const grokResolutions = Array.isArray(capabilities.resolutions) ? capabilities.resolutions.map((value) => String(value).toUpperCase()) : [];
      const channelInputs = Array.isArray(existingChannel.supportedInputs) ? existingChannel.supportedInputs.map(String) : [];
      const rootInputs = Array.isArray(capabilities.supportedInputs) ? capabilities.supportedInputs.map(String) : [];
      const needsReferenceRepair = !channelInputs.includes("reference_image")
        || !channelInputs.includes("first_last_frame")
        || !rootInputs.includes("reference_image")
        || (isRunApiGrok && String(existingChannel.apiFamily ?? "") !== "unified_video_create")
        || (isAi666Grok && (!grokResolutions.includes("720P") || !grokResolutions.includes("1080P") || grokResolutions.some((value) => !["720P", "1080P"].includes(value))))
        || String(existingChannel.imageTransport ?? "") === "unsupported"
        || String(existingChannel.videoTransport ?? "") === "unsupported";
      if (needsReferenceRepair) {
        const isOfficialGrok = /api\.x\.ai/i.test(row.api_base_url);
        assign({
          inputModes: ["text-to-video", "image-to-video", "reference-to-video", "first-last-frame", "video-to-video"],
          supportsImageInput: true,
          supportsReferenceImage: true,
          supportsFirstLastFrame: true,
          supportsMultiImageInput: true,
          supportsVideoInput: true,
          maxReferenceImages: Number(capabilities.maxReferenceImages ?? 7),
          ...(isAi666Grok ? {
            aspectRatios: ["16:9", "9:16", "2:3", "3:2", "1:1"],
            supportedAspectRatios: ["16:9", "9:16", "2:3", "3:2", "1:1"],
            resolutions: ["720P", "1080P"],
            supportedResolutions: ["720P", "1080P"]
          } : {}),
          supportedInputs: ["text", "image", "first_frame", "reference_image", "first_last_frame", "video"],
          channelCapability: {
            ...existingChannel,
            provider: existingChannel.provider ?? "grok",
            channel: isOfficialGrok ? "official" : "proxy",
            apiFamily: isOfficialGrok ? "official_provider" : isRunApiGrok ? "unified_video_create" : "grok_video",
            createEndpoint: isRunApiGrok ? "/v1/video/create" : existingChannel.createEndpoint ?? "/v1/videos",
            endpoint: isRunApiGrok ? "/v1/video/create" : existingChannel.endpoint ?? "/v1/videos",
            pollEndpoint: isRunApiGrok ? "/v1/videos/{taskId}" : existingChannel.pollEndpoint ?? "/v1/videos/{taskId}",
            requestFormat: isOfficialGrok || isRunApiGrok ? "json" : "multipart",
            imageTransport: isOfficialGrok ? "base64_json" : isRunApiGrok ? "url" : "multipart_file",
            videoTransport: isOfficialGrok ? "base64_json" : isRunApiGrok ? "url_or_base64_json" : "multipart_file",
            supportedInputs: ["text", "image", "first_frame", "reference_image", "first_last_frame", "video"]
          }
        });
      }
    }

    if (changed) {
      await database.run("UPDATE model_configs SET display_name = ?, capabilities_json = ?, updated_at = ? WHERE id = ?", displayName, JSON.stringify(capabilities), Date.now(), row.id);
    }
  }
}

async function migrateVolcengineImageProtocols(database: AppDatabase) {
  const rows = await database.all<Array<{ id: string; provider: string; provider_id: string | null; category: string | null; model_type: string; model_name: string; capabilities_json: string }>>(
    "SELECT id, provider, provider_id, category, model_type, model_name, capabilities_json FROM model_configs WHERE lower(model_name) LIKE '%seedream%' OR lower(model_name) LIKE '%doubao-seedream%'"
  );
  for (const row of rows) {
    const capabilities = JSON.parse(row.capabilities_json) as Record<string, unknown>;
    const inputModes = Array.isArray(capabilities.inputModes) && capabilities.inputModes.length
      ? capabilities.inputModes
      : ["text-to-image", "image-to-image", "image-edit"];
    const nextCapabilities = {
      ...capabilities,
      inputModes,
      imageAspectRatios: capabilities.imageAspectRatios ?? ["1:1", "3:4", "4:3", "9:16", "16:9", "2:3", "3:2", "21:9"],
      imageSizes: capabilities.imageSizes ?? ["auto", "1024x1024", "1536x1024", "1024x1536", "1920x1080", "1080x1920"],
      imageQualities: capabilities.imageQualities ?? ["auto", "standard", "high"],
      imageFormats: capabilities.imageFormats ?? ["png", "jpeg", "webp"],
      supportsImageInput: capabilities.supportsImageInput ?? true,
      supportsMultiImageInput: capabilities.supportsMultiImageInput ?? true,
      supportsReferenceImage: capabilities.supportsReferenceImage ?? true
    };
    await database.run(
      `UPDATE model_configs
       SET provider = ?, provider_id = ?, category = ?, model_type = ?, capabilities_json = ?, updated_at = ?
       WHERE id = ?`,
      "Seedream / 火山方舟",
      "seedance",
      "image",
      row.model_type.includes("image") ? row.model_type : "text-to-image",
      JSON.stringify(nextCapabilities),
      Date.now(),
      row.id
    );
  }
}

async function migrateImageModelCapabilities(database: AppDatabase) {
  const rows = await database.all<Array<{ id: string; provider: string; provider_id: string | null; category: string | null; model_type: string; display_name: string; model_name: string; capabilities_json: string }>>(
    `SELECT id, provider, provider_id, category, model_type, display_name, model_name, capabilities_json
     FROM model_configs
     WHERE lower(model_name) LIKE '%gpt-image%'
        OR lower(model_name) LIKE '%dall-e%'
        OR lower(model_name) LIKE '%gemini%image%'
        OR lower(model_name) LIKE '%image%gemini%'
        OR lower(model_name) LIKE '%nano%banana%'
        OR lower(model_name) LIKE '%imagen%'
        OR lower(model_name) LIKE '%qwen-image%'
        OR lower(model_name) LIKE '%seedream%'
        OR lower(model_name) LIKE '%flux%'
        OR lower(model_name) LIKE '%recraft%'
        OR lower(model_name) LIKE '%ideogram%'
        OR lower(model_name) LIKE '%midjourney%'
        OR lower(model_name) LIKE '%jimeng%'
        OR lower(model_name) LIKE '%图像%'
        OR lower(model_name) LIKE '%图片%'`
  );
  for (const row of rows) {
    const configuredCapabilities = JSON.parse(row.capabilities_json) as ModelCapabilities;
    const inferred = inferImageProvider({
      providerId: row.provider_id ?? undefined,
      provider: row.provider,
      modelName: row.model_name,
      displayName: row.display_name
    });
    const nextCapabilities = normalizeImageCapabilities(
      configuredCapabilities,
      inferred.providerId,
      row.model_name,
      row.display_name,
      inferred.provider
    );
    const nextModelType = inferImageModelType({
      providerId: inferred.providerId,
      provider: inferred.provider,
      modelName: row.model_name,
      displayName: row.display_name,
      capabilities: nextCapabilities
    });
    await database.run(
      `UPDATE model_configs
       SET provider = ?, provider_id = ?, category = ?, model_type = ?, capabilities_json = ?, updated_at = ?
       WHERE id = ?`,
      inferred.provider,
      inferred.providerId,
      "image",
      nextModelType,
      JSON.stringify(nextCapabilities),
      Date.now(),
      row.id
    );
  }
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
  await migrateAi666VideoProtocols(db);
  await migrateVolcengineImageProtocols(db);
  await migrateImageModelCapabilities(db);
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
  await addAssetColumn("storage_provider", "ALTER TABLE assets ADD COLUMN storage_provider TEXT");
  await addAssetColumn("storage_key", "ALTER TABLE assets ADD COLUMN storage_key TEXT");
  await addAssetColumn("storage_bucket", "ALTER TABLE assets ADD COLUMN storage_bucket TEXT");
  await addAssetColumn("storage_region", "ALTER TABLE assets ADD COLUMN storage_region TEXT");
  await addAssetColumn("storage_file_type", "ALTER TABLE assets ADD COLUMN storage_file_type TEXT");
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
  await ensureColumn("generation_tasks", "provider_status", "ALTER TABLE generation_tasks ADD COLUMN provider_status TEXT");
  await ensureColumn("generation_tasks", "provider_video_url", "ALTER TABLE generation_tasks ADD COLUMN provider_video_url TEXT");
  await ensureColumn("generation_tasks", "output_url", "ALTER TABLE generation_tasks ADD COLUMN output_url TEXT");
  await ensureColumn("generation_tasks", "preview_url", "ALTER TABLE generation_tasks ADD COLUMN preview_url TEXT");
  await ensureColumn("generation_tasks", "storage_status", "ALTER TABLE generation_tasks ADD COLUMN storage_status TEXT");
  await ensureColumn("generation_tasks", "storage_key", "ALTER TABLE generation_tasks ADD COLUMN storage_key TEXT");
  await ensureColumn("generation_tasks", "storage_error", "ALTER TABLE generation_tasks ADD COLUMN storage_error TEXT");
  await ensureColumn("generation_tasks", "raw_poll_response", "ALTER TABLE generation_tasks ADD COLUMN raw_poll_response TEXT");
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
