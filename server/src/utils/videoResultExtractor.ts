const VIDEO_URL_PATHS = [
  ["url"],
  ["video_url"],
  ["videoUrl"],
  ["result_url"],
  ["resultUrl"],
  ["output_url"],
  ["outputUrl"],
  ["data", "url"],
  ["data", "video_url"],
  ["data", "videoUrl"],
  ["data", "result_url"],
  ["data", "resultUrl"],
  ["data", "output_url"],
  ["data", "outputUrl"],
  ["result", "url"],
  ["result", "video_url"],
  ["result", "videoUrl"],
  ["result", "result_url"],
  ["result", "resultUrl"],
  ["result", "output_url"],
  ["result", "outputUrl"],
  ["video", "url"],
  ["video", "video_url"],
  ["videos", 0, "url"],
  ["videos", 0, "video_url"],
  ["output", "url"],
  ["output", "video_url"],
  ["output", "videoUrl"],
  ["output", 0, "url"],
  ["outputs", 0, "url"],
  ["data", 0, "url"]
] as const;

const TASK_ID_PATHS = [
  ["id"],
  ["task_id"],
  ["taskId"],
  ["job_id"],
  ["jobId"],
  ["video_id"],
  ["videoId"],
  ["request_id"],
  ["requestId"],
  ["proxy_task_id"],
  ["proxyTaskId"],
  ["data", "id"],
  ["data", "task_id"],
  ["data", "taskId"],
  ["data", "job_id"],
  ["data", "jobId"],
  ["result", "id"],
  ["result", "task_id"],
  ["result", "taskId"],
  ["result", "job_id"],
  ["result", "jobId"],
  ["result", "proxy_task_id"],
  ["result", "proxyTaskId"]
] as const;

const STATUS_PATHS = [
  ["status"],
  ["state"],
  ["task_status"],
  ["taskStatus"],
  ["data", "status"],
  ["data", "state"],
  ["result", "status"],
  ["result", "state"]
] as const;

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

export function isRealMediaUrl(url?: string | null) {
  return typeof url === "string" && /^(?:https?:\/\/|blob:|data:)/i.test(url.trim());
}

export function extractProviderTaskId(source: unknown) {
  return firstStringAt(TASK_ID_PATHS, source);
}

export function extractProviderStatus(source: unknown) {
  return firstStringAt(STATUS_PATHS, source)?.toLowerCase();
}

export function isProviderSuccessStatus(source: unknown) {
  const status = extractProviderStatus(source);
  return Boolean(status && ["success", "succeeded", "completed", "complete", "done", "finished"].includes(status));
}

export function isProviderRunningStatus(source: unknown) {
  const status = extractProviderStatus(source);
  return Boolean(status && ["queued", "pending", "running", "processing", "in_progress", "submitted", "created"].includes(status));
}

export function isProviderFailedStatus(source: unknown) {
  const status = extractProviderStatus(source);
  return Boolean(status && ["failed", "error", "canceled", "cancelled", "timeout"].includes(status));
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
