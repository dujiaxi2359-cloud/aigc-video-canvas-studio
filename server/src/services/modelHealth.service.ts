import { getDb } from "../db/database.js";
import { now } from "../utils/time.js";
import { extractProviderStatus, extractProviderVideoUrl, isFailedStatus, isRunningStatus, isSuccessStatus } from "../utils/videoResultExtractor.js";
import { decryptApiKey } from "./encryption.service.js";
import type { ModelCapabilities, ModelCapabilityKind } from "../types/model.js";

export type ModelHealthStatus =
  | "ready"
  | "untested"
  | "testing"
  | "running_slow"
  | "need_config"
  | "channel_unavailable"
  | "poll_endpoint_missing"
  | "result_parse_failed"
  | "return_to_canvas_issue"
  | "provider_failed"
  | "safety_blocked"
  | "quota_or_balance_error"
  | "unsupported"
  | "unknown_error";

type ModelRow = {
  id: string;
  workspace_id?: string;
  provider_id?: string;
  provider: string;
  category?: string;
  display_name: string;
  api_base_url?: string;
  encrypted_api_key?: string;
  model_name: string;
  model_type: string;
  enabled?: number;
  capabilities_json: string;
  model_health_status?: ModelHealthStatus;
  last_health_check_at?: number;
  last_success_at?: number;
  last_failure_at?: number;
  last_error_code?: string;
  last_error_message?: string;
  last_raw_response_sample?: string;
  last_provider_task_id?: string;
  last_probe_duration_ms?: number;
  capability_health_json?: string;
};

type TaskRow = {
  id: string;
  status?: string;
  provider_status?: string;
  provider_task_id?: string;
  provider_video_url?: string;
  output_url?: string;
  preview_url?: string;
  canvas_node_id?: string;
  project_id?: string;
  provider_id?: string;
  model_id?: string;
  progress?: number;
  error_code?: string;
  error_message?: string;
  result_json?: string;
  raw_create_response?: string;
  created_at?: number;
  updated_at?: number;
  completed_at?: number;
  finished_at?: number;
};

const HEALTH_COLUMNS: Array<[string, string]> = [
  ["model_health_status", "TEXT DEFAULT 'untested'"],
  ["last_health_check_at", "INTEGER"],
  ["last_success_at", "INTEGER"],
  ["last_failure_at", "INTEGER"],
  ["last_error_code", "TEXT"],
  ["last_error_message", "TEXT"],
  ["last_raw_response_sample", "TEXT"],
  ["last_provider_task_id", "TEXT"],
  ["last_probe_duration_ms", "INTEGER"],
  ["capability_health_json", "TEXT"]
];

const HEALTHY_STATUSES = new Set<ModelHealthStatus>(["ready", "running_slow", "untested"]);

function parseJson(value?: string) {
  if (!value) return undefined;
  try {
    return JSON.parse(value) as unknown;
  } catch {
    return undefined;
  }
}

function safeStringify(value: unknown, maxLength = 1600) {
  try {
    return JSON.stringify(value)?.slice(0, maxLength);
  } catch {
    return String(value).slice(0, maxLength);
  }
}

function capabilityKinds(capabilities: ModelCapabilities, row: ModelRow): ModelCapabilityKind[] {
  const kinds = new Set<ModelCapabilityKind>();
  if (capabilities.capability) kinds.add(capabilities.capability);
  for (const kind of capabilities.capabilityKinds ?? []) kinds.add(kind);
  const modelCapability = capabilities.modelCapability;
  if (modelCapability?.supportsText) kinds.add("text");
  if (modelCapability?.supportsTextToImage) kinds.add("image_generation");
  if (modelCapability?.supportsImageToImage || modelCapability?.supportsImageEdit) kinds.add("image_edit");
  if (modelCapability?.supportsTextToVideo) kinds.add("text_to_video");
  if (modelCapability?.supportsImageToVideo) kinds.add("image_to_video");
  if (modelCapability?.supportsReferenceToVideo || modelCapability?.supportsFirstLastFrame) kinds.add("reference_to_video");
  if (modelCapability?.supportsVideoToVideo) kinds.add("video_to_video");
  if (row.category === "text" || row.model_type === "text") kinds.add("text");
  if (row.category === "image" || row.model_type.includes("image")) {
    if (row.model_type.includes("edit") || row.model_type.includes("image-to-image")) kinds.add("image_edit");
    else kinds.add("image_generation");
  }
  if (row.category === "video" || row.model_type.includes("video")) {
    if (row.model_type.includes("image-to-video")) kinds.add("image_to_video");
    else if (row.model_type.includes("video-to-video")) kinds.add("video_to_video");
    else kinds.add("text_to_video");
  }
  return Array.from(kinds);
}

function providerTypeFor(capabilities: ModelCapabilities, row: ModelRow) {
  if (capabilities.providerType) return capabilities.providerType;
  const channel = capabilities.channelCapability?.channel ?? capabilities.channel;
  if (channel === "official") return "official";
  if (row.provider_id && /^(openai|google|alibaba|kling|seedance|azure-openai|zhipu|grsai)$/i.test(row.provider_id) && !row.api_base_url) return "official";
  return "openai_compatible";
}

function effectiveUpstreamModelId(capabilities: ModelCapabilities, row: ModelRow) {
  return capabilities.upstreamModelId
    ?? capabilities.modelCapability?.model
    ?? row.model_name;
}

function videoPollEndpoint(capabilities: ModelCapabilities) {
  return capabilities.openaiCompatibleConfig?.videoPollEndpoint
    ?? capabilities.channelCapability?.pollEndpoint
    ?? capabilities.pollEndpoint;
}

function videoCreateEndpoint(capabilities: ModelCapabilities) {
  return capabilities.openaiCompatibleConfig?.videoCreateEndpoint
    ?? capabilities.openaiCompatibleConfig?.unifiedVideoCreateEndpoint
    ?? capabilities.channelCapability?.createEndpoint
    ?? capabilities.createEndpoint
    ?? capabilities.endpoint;
}

function classifyError(text: string): { status: ModelHealthStatus; action: string } {
  if (/quota|balance|额度|余额|insufficient|billing|预扣费/i.test(text)) return { status: "quota_or_balance_error", action: "check_balance_or_quota" };
  if (/safety|policy|blocked|violate|安全|违规|敏感/i.test(text)) return { status: "safety_blocked", action: "manual_real_probe_required" };
  if (/no available|no usable|channel|platform|This token has no access|no access to model|permission|forbidden|unauthorized|权限|渠道|未开通/i.test(text)) return { status: "channel_unavailable", action: "check_provider_channel" };
  if (/unsupported|not support|不支持/i.test(text)) return { status: "unsupported", action: "do_not_show_on_canvas" };
  return { status: "provider_failed", action: "manual_real_probe_required" };
}

function taskRaw(task: TaskRow) {
  return parseJson(task.result_json) ?? parseJson(task.raw_create_response);
}

function taskHasVideoUrl(task: TaskRow) {
  return Boolean(task.provider_video_url || task.output_url || task.preview_url || extractProviderVideoUrl(taskRaw(task)));
}

function taskStatus(task: TaskRow) {
  return task.provider_status || extractProviderStatus(taskRaw(task)) || task.status || "";
}

function summarizeTasks(tasks: TaskRow[]) {
  const recent = tasks.slice(0, 20);
  const successTasks = recent.filter((task) => isSuccessStatus(task.status) || isSuccessStatus(task.provider_status) || taskHasVideoUrl(task));
  const failedTasks = recent.filter((task) => isFailedStatus(task.status) || isFailedStatus(task.provider_status) || task.error_code);
  const runningTasks = recent.filter((task) => isRunningStatus(task.status) || isRunningStatus(task.provider_status));
  const canvasMissingTasks = successTasks.filter((task) => taskHasVideoUrl(task) && !task.output_url);
  const nowValue = now();
  const slowTasks = runningTasks.filter((task) => task.created_at && nowValue - task.created_at > 20 * 60 * 1000);
  const durations = successTasks
    .map((task) => (task.finished_at ?? task.completed_at ?? task.updated_at ?? 0) - (task.created_at ?? 0))
    .filter((duration) => Number.isFinite(duration) && duration > 0);
  return {
    total: recent.length,
    successCount: successTasks.length,
    failedCount: failedTasks.length,
    runningCount: runningTasks.length,
    slowCount: slowTasks.length,
    canvasMissingCount: canvasMissingTasks.length,
    successRate24h: recent.length ? successTasks.length / recent.length : 0,
    avgDurationSec: durations.length ? Math.round(durations.reduce((sum, value) => sum + value, 0) / durations.length / 1000) : undefined,
    lastSuccessAt: successTasks[0]?.finished_at ?? successTasks[0]?.completed_at ?? successTasks[0]?.updated_at,
    lastFailureAt: failedTasks[0]?.updated_at,
    lastErrorCode: failedTasks[0]?.error_code,
    lastErrorMessage: failedTasks[0]?.error_message,
    lastProviderTaskId: recent.find((task) => task.provider_task_id)?.provider_task_id,
    lastRawResponseSample: recent[0] ? safeStringify(taskRaw(recent[0])) : undefined
  };
}

async function ensureModelHealthColumns() {
  const db = await getDb();
  const existing = await db.all<Array<{ name: string }>>("PRAGMA table_info(model_configs)");
  const names = new Set(existing.map((column) => column.name));
  for (const [name, definition] of HEALTH_COLUMNS) {
    if (!names.has(name)) await db.run(`ALTER TABLE model_configs ADD COLUMN ${name} ${definition}`);
  }
}

async function fetchModelList(row: ModelRow, apiKey: string | undefined, timeoutMs = 3500) {
  if (!row.api_base_url || !apiKey) return { available: false, error: "missing baseUrl/apiKey" };
  const base = row.api_base_url.replace(/\/+$/, "");
  const endpoint = /\/v\d+(?:beta)?$/i.test(base) ? `${base}/models` : `${base}/v1/models`;
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), timeoutMs);
  try {
    const response = await fetch(endpoint, {
      headers: { Authorization: `Bearer ${apiKey}`, Accept: "application/json" },
      signal: controller.signal
    });
    const text = await response.text();
    const json = text ? JSON.parse(text) as unknown : {};
    return { available: response.ok, status: response.status, sample: safeStringify(json), models: extractModelIds(json) };
  } catch (error) {
    return { available: false, error: error instanceof Error ? error.message : String(error) };
  } finally {
    clearTimeout(timer);
  }
}

function extractModelIds(payload: unknown): string[] {
  const output = new Set<string>();
  const visit = (value: unknown) => {
    if (Array.isArray(value)) {
      for (const item of value) visit(item);
      return;
    }
    if (!value || typeof value !== "object") return;
    const record = value as Record<string, unknown>;
    for (const key of ["id", "model", "name"]) {
      if (typeof record[key] === "string") output.add(record[key] as string);
    }
    for (const key of ["data", "models", "items", "result", "list"]) visit(record[key]);
  };
  visit(payload);
  return Array.from(output);
}

async function recentTasksForModel(row: ModelRow) {
  const db = await getDb();
  return db.all<TaskRow[]>(
    `SELECT * FROM generation_tasks
     WHERE workspace_id = ?
       AND (
         model_id IN (?, ?)
         OR provider_id = ?
         OR result_json LIKE ?
         OR raw_create_response LIKE ?
       )
     ORDER BY updated_at DESC
     LIMIT 20`,
    row.workspace_id,
    row.id,
    row.model_name,
    row.provider_id ?? "",
    `%${row.model_name}%`,
    `%${row.model_name}%`
  );
}

function statusFromSafeChecks(input: {
  row: ModelRow;
  capabilities: ModelCapabilities;
  kinds: ModelCapabilityKind[];
  providerType: string;
  upstreamModelId?: string;
  tasks: ReturnType<typeof summarizeTasks>;
  modelsProbe?: Awaited<ReturnType<typeof fetchModelList>>;
}) {
  const { row, capabilities, kinds, providerType, upstreamModelId, tasks, modelsProbe } = input;
  const isVideo = kinds.some((kind) => kind.endsWith("_video"));
  if (!row.enabled) return { status: "unsupported" as ModelHealthStatus, action: "do_not_show_on_canvas", message: "模型已停用。" };
  if (!row.model_name) return { status: "need_config" as ModelHealthStatus, action: "check_model_id", message: "缺少模型 ID。" };
  if (!kinds.length) return { status: "unsupported" as ModelHealthStatus, action: "do_not_show_on_canvas", message: "缺少可用能力配置。" };
  if (providerType === "openai_compatible") {
    if (!row.api_base_url) return { status: "need_config" as ModelHealthStatus, action: "check_api_key", message: "缺少 API Base URL。" };
    if (!row.encrypted_api_key) return { status: "need_config" as ModelHealthStatus, action: "check_api_key", message: "缺少 API Key。" };
    if (!upstreamModelId) return { status: "need_config" as ModelHealthStatus, action: "check_model_id", message: "缺少 upstreamModelId/modelId。" };
    if (isVideo && !videoCreateEndpoint(capabilities)) return { status: "need_config" as ModelHealthStatus, action: "configure_poll_endpoint", message: "缺少视频创建 endpoint。" };
    if (isVideo && !videoPollEndpoint(capabilities)) return { status: "poll_endpoint_missing" as ModelHealthStatus, action: "configure_poll_endpoint", message: "缺少视频轮询 endpoint。" };
  }
  if (tasks.successCount > 0 && tasks.canvasMissingCount > 0) return { status: "return_to_canvas_issue" as ModelHealthStatus, action: "fix_result_parser", message: "历史存在 provider 成功但画布未回填。" };
  if (tasks.successCount > 0) return { status: "ready" as ModelHealthStatus, action: "ready_to_use", message: "历史任务已验证成功。" };
  if (tasks.slowCount > 0) return { status: "running_slow" as ModelHealthStatus, action: "wait_provider_queue", message: "历史任务长时间排队或运行中。" };
  if (tasks.failedCount > 0) {
    return { ...classifyError(`${tasks.lastErrorCode ?? ""}\n${tasks.lastErrorMessage ?? ""}`), message: tasks.lastErrorMessage ?? "历史任务失败。" };
  }
  if (modelsProbe?.available && upstreamModelId && modelsProbe.models?.length && !modelsProbe.models.includes(upstreamModelId)) {
    return { status: "need_config" as ModelHealthStatus, action: "check_model_id", message: "/v1/models 未发现该 upstreamModelId，且没有成功历史。" };
  }
  return { status: "untested" as ModelHealthStatus, action: isVideo ? "manual_real_probe_required" : "ready_to_use", message: "尚无历史验证。" };
}

export async function runModelHealthCheck(input: {
  providerId?: string;
  capability?: ModelCapabilityKind;
  modelIds?: string[];
  mode?: "safe" | "real";
  limit?: number;
  dryRun?: boolean;
}) {
  if (input.mode === "real") throw new Error("真实探测暂未启用：为避免自动烧钱，本轮只允许 safe 体检。");
  await ensureModelHealthColumns();
  const db = await getDb();
  const clauses = ["1=1"];
  const params: unknown[] = [];
  if (input.providerId) {
    clauses.push("provider_id = ?");
    params.push(input.providerId);
  }
  if (input.modelIds?.length) {
    clauses.push(`id IN (${input.modelIds.map(() => "?").join(",")})`);
    params.push(...input.modelIds);
  }
  const limit = Math.max(1, Math.min(200, Number(input.limit ?? 50)));
  const rows = await db.all<ModelRow[]>(`SELECT * FROM model_configs WHERE ${clauses.join(" AND ")} ORDER BY updated_at DESC LIMIT ?`, ...params, limit);
  const startedAt = now();
  const results = [];
  for (const row of rows) {
    const probeStartedAt = now();
    const capabilities = parseJson(row.capabilities_json) as ModelCapabilities | undefined ?? { inputModes: [] };
    const kinds = capabilityKinds(capabilities, row);
    if (input.capability && !kinds.includes(input.capability)) continue;
    const providerType = providerTypeFor(capabilities, row);
    const upstreamModelId = effectiveUpstreamModelId(capabilities, row);
    const tasks = summarizeTasks(await recentTasksForModel(row));
    let modelsProbe: Awaited<ReturnType<typeof fetchModelList>> | undefined;
    if (providerType === "openai_compatible" && row.api_base_url && row.encrypted_api_key) {
      try {
        modelsProbe = await fetchModelList(row, decryptApiKey(row.encrypted_api_key));
      } catch (error) {
        modelsProbe = { available: false, error: error instanceof Error ? error.message : String(error) };
      }
    }
    const decision = statusFromSafeChecks({ row, capabilities, kinds, providerType, upstreamModelId, tasks, modelsProbe });
    const capabilityHealth = {
      providerType,
      capabilityKinds: kinds,
      upstreamModelId,
      modelsListAvailable: modelsProbe?.available ?? false,
      modelListed: Boolean(upstreamModelId && modelsProbe?.models?.includes(upstreamModelId)),
      videoCreateEndpoint: videoCreateEndpoint(capabilities),
      videoPollEndpoint: videoPollEndpoint(capabilities),
      successRate24h: tasks.successRate24h,
      avgDurationSec: tasks.avgDurationSec,
      successCount: tasks.successCount,
      failedCount: tasks.failedCount,
      runningCount: tasks.runningCount,
      slowCount: tasks.slowCount,
      canvasMissingCount: tasks.canvasMissingCount,
      recommendedAction: decision.action,
      message: decision.message
    };
    const probeDuration = now() - probeStartedAt;
    if (!input.dryRun) {
      await db.run(
        `UPDATE model_configs SET
          model_health_status = ?,
          last_health_check_at = ?,
          last_success_at = ?,
          last_failure_at = ?,
          last_error_code = ?,
          last_error_message = ?,
          last_raw_response_sample = ?,
          last_provider_task_id = ?,
          last_probe_duration_ms = ?,
          capability_health_json = ?,
          updated_at = ?
        WHERE id = ?`,
        decision.status,
        now(),
        tasks.lastSuccessAt,
        tasks.lastFailureAt,
        decision.status === "ready" ? undefined : tasks.lastErrorCode,
        decision.status === "ready" ? undefined : decision.message,
        tasks.lastRawResponseSample ?? modelsProbe?.sample,
        tasks.lastProviderTaskId,
        probeDuration,
        JSON.stringify(capabilityHealth),
        now(),
        row.id
      );
    }
    results.push({
      modelId: row.id,
      providerId: row.provider_id,
      providerName: row.provider,
      displayName: row.display_name,
      modelName: row.model_name,
      upstreamModelId,
      capabilityKinds: kinds,
      healthStatus: decision.status,
      recommendedAction: decision.action,
      message: decision.message,
      lastSuccessAt: tasks.lastSuccessAt,
      lastFailureAt: tasks.lastFailureAt,
      successRate24h: tasks.successRate24h,
      avgDurationSec: tasks.avgDurationSec,
      lastErrorCode: decision.status === "ready" ? undefined : tasks.lastErrorCode,
      lastErrorMessage: decision.status === "ready" ? undefined : decision.message,
      capabilityHealth
    });
  }
  return { mode: input.mode ?? "safe", dryRun: Boolean(input.dryRun), checked: results.length, durationMs: now() - startedAt, results };
}

export async function getModelHealthMatrix() {
  await ensureModelHealthColumns();
  const db = await getDb();
  const rows = await db.all<ModelRow[]>("SELECT * FROM model_configs ORDER BY provider, display_name");
  const providers = new Map<string, { providerId?: string; providerName: string; providerType: string; status: ModelHealthStatus; models: unknown[] }>();
  for (const row of rows) {
    const capabilities = parseJson(row.capabilities_json) as ModelCapabilities | undefined ?? { inputModes: [] };
    const providerType = providerTypeFor(capabilities, row);
    const providerKey = `${row.workspace_id}:${row.provider_id ?? row.provider}:${providerType}`;
    const healthStatus = row.model_health_status ?? "untested";
    const capabilityHealth = parseJson(row.capability_health_json) as Record<string, unknown> | undefined;
    const provider = providers.get(providerKey) ?? {
      providerId: row.provider_id,
      providerName: row.provider,
      providerType,
      status: "ready",
      models: []
    };
    if (!HEALTHY_STATUSES.has(healthStatus)) provider.status = healthStatus;
    provider.models.push({
      modelId: row.id,
      upstreamModelId: effectiveUpstreamModelId(capabilities, row),
      displayName: row.display_name,
      modelName: row.model_name,
      capability: capabilityKinds(capabilities, row),
      healthStatus,
      lastHealthCheckAt: row.last_health_check_at,
      lastSuccessAt: row.last_success_at,
      lastFailureAt: row.last_failure_at,
      successRate24h: capabilityHealth?.successRate24h,
      avgDurationSec: capabilityHealth?.avgDurationSec,
      lastErrorCode: row.last_error_code,
      lastErrorMessage: row.last_error_message,
      recommendedAction: capabilityHealth?.recommendedAction ?? "manual_real_probe_required",
      showOnCanvas: HEALTHY_STATUSES.has(healthStatus)
    });
    providers.set(providerKey, provider);
  }
  return { providers: Array.from(providers.values()) };
}
