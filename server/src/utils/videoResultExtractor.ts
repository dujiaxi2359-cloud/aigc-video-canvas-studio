const VIDEO_URL_PATHS = [
  ["url"],
  ["video_url"],
  ["videoUrl"],
  ["output_url"],
  ["outputUrl"],
  ["preview_url"],
  ["previewUrl"],
  ["result_url"],
  ["resultUrl"],
  ["download_url"],
  ["downloadUrl"],
  ["data", "url"],
  ["data", "video_url"],
  ["data", "videoUrl"],
  ["data", "output_url"],
  ["data", "outputUrl"],
  ["data", "preview_url"],
  ["data", "previewUrl"],
  ["data", "result_url"],
  ["data", "resultUrl"],
  ["data", "download_url"],
  ["data", "downloadUrl"],
  ["data", "content", "video_url"],
  ["data", "content", "videoUrl"],
  ["data", "content", "url"],
  ["data", "data", "content", "video_url"],
  ["data", "data", "content", "videoUrl"],
  ["data", "data", "output_url"],
  ["data", "data", "outputUrl"],
  ["data", "data", "video_url"],
  ["data", "data", "videoUrl"],
  ["content", "video_url"],
  ["content", "videoUrl"],
  ["content", "url"],
  ["result", "url"],
  ["result", "video_url"],
  ["result", "videoUrl"],
  ["result", "output_url"],
  ["result", "outputUrl"],
  ["result", "preview_url"],
  ["result", "previewUrl"],
  ["result", "result_url"],
  ["result", "resultUrl"],
  ["result", "download_url"],
  ["result", "downloadUrl"],
  ["video", "url"],
  ["video", "video_url"],
  ["videos", 0, "url"],
  ["videos", 0, "video_url"],
  ["data", "videos", 0, "url"],
  ["data", "videos", 0, "video_url"],
  ["output", 0, "url"],
  ["outputs", 0, "url"],
  ["data", "output", 0, "url"],
  ["data", "outputs", 0, "url"],
  ["data", 0, "url"]
] as const;

const TASK_ID_PATHS = [
  ["id"],
  ["task_id"],
  ["taskId"],
  ["video_id"],
  ["videoId"],
  ["request_id"],
  ["requestId"],
  ["data", "id"],
  ["data", "task_id"],
  ["data", "taskId"],
  ["result", "id"],
  ["result", "task_id"],
  ["result", "taskId"]
] as const;

const STATUS_PATHS = [
  ["status"],
  ["state"],
  ["task_status"],
  ["taskStatus"],
  ["data", "status"],
  ["data", "state"],
  ["data", "task_status"],
  ["data", "taskStatus"],
  ["result", "status"],
  ["result", "state"],
  ["result", "task_status"],
  ["result", "taskStatus"]
] as const;

const PROGRESS_PATHS = [
  ["progress"],
  ["percent"],
  ["percentage"],
  ["data", "progress"],
  ["data", "percent"],
  ["data", "percentage"],
  ["result", "progress"],
  ["result", "percent"],
  ["result", "percentage"],
  ["task", "progress"],
  ["task", "percent"],
  ["task", "percentage"]
] as const;

const SUCCESS_STATUSES = new Set(["success", "succeeded", "completed", "complete", "done", "finished", "generated", "generated_success", "task_success"]);
const RUNNING_STATUSES = new Set(["executing", "running", "processing", "queued", "pending", "in_progress", "submitted", "created", "generating", "started"]);
const FAILED_STATUSES = new Set(["failed", "failure", "error", "canceled", "cancelled", "timeout", "failed"]);

function valueAtPath(source: unknown, path: readonly (string | number)[]) {
  let current = source;
  for (const segment of path) {
    if (current === null || current === undefined) return undefined;
    if (typeof segment === "number") {
      if (!Array.isArray(current)) return undefined;
      current = current[segment];
      continue;
    }
    if (typeof current !== "object") return undefined;
    current = (current as Record<string, unknown>)[segment];
  }
  return current;
}

function firstStringAt(paths: readonly (readonly (string | number)[])[], source: unknown) {
  for (const path of paths) {
    const value = valueAtPath(source, path);
    if (typeof value === "string" && value.trim()) return value.trim();
  }
  return undefined;
}

export function extractProviderVideoUrl(source: unknown) {
  return firstStringAt(VIDEO_URL_PATHS, source);
}

export function extractProviderTaskId(source: unknown) {
  return firstStringAt(TASK_ID_PATHS, source);
}

export function extractProviderStatus(source: unknown) {
  return firstStringAt(STATUS_PATHS, source)?.toLowerCase();
}

function normalizeStatus(status?: unknown) {
  return typeof status === "string" ? status.trim().toLowerCase() : "";
}

export function isSuccessStatus(status?: unknown) {
  return SUCCESS_STATUSES.has(normalizeStatus(status));
}

export function isRunningStatus(status?: unknown) {
  return RUNNING_STATUSES.has(normalizeStatus(status));
}

export function isFailedStatus(status?: unknown) {
  return FAILED_STATUSES.has(normalizeStatus(status));
}

export function extractProviderProgress(source: unknown) {
  for (const path of PROGRESS_PATHS) {
    const value = valueAtPath(source, path);
    if (typeof value === "number" && Number.isFinite(value)) {
      const percent = value > 0 && value <= 1 ? value * 100 : value;
      return Math.max(0, Math.min(100, Math.round(percent)));
    }
    if (typeof value === "string") {
      const match = value.match(/(\d+(?:\.\d+)?)/);
      if (match?.[1]) {
        const numeric = Number(match[1]);
        const percent = numeric > 0 && numeric <= 1 && !value.includes("%") ? numeric * 100 : numeric;
        return Math.max(0, Math.min(100, Math.round(percent)));
      }
    }
  }
  return undefined;
}

export function isProviderSuccessStatus(source: unknown) {
  return isSuccessStatus(extractProviderStatus(source));
}

export function isProviderRunningStatus(source: unknown) {
  return isRunningStatus(extractProviderStatus(source));
}

export function isVideoUrl(value?: string) {
  if (!value) return false;
  if (/^https?:\/\//i.test(value) && /\.(mp4|webm|mov|m4v|m3u8)(?:[?#]|$)/i.test(value)) return true;
  return /^https?:\/\//i.test(value) && /video|download|preview|output|file|cdn/i.test(value);
}

export function sanitizeUrlForLog(url?: string) {
  if (!url) return undefined;
  try {
    const parsed = new URL(url);
    if (parsed.search) parsed.search = "?***";
    return parsed.toString();
  } catch {
    return url.replace(/\?.+$/, "?***");
  }
}
