const VIDEO_URL_PATHS = [
  ["url"],
  ["video_url"],
  ["videoUrl"],
  ["output_url"],
  ["outputUrl"],
  ["preview_url"],
  ["previewUrl"],
  ["download_url"],
  ["downloadUrl"],
  ["data", "url"],
  ["data", "video_url"],
  ["data", "videoUrl"],
  ["data", "output_url"],
  ["data", "outputUrl"],
  ["data", "preview_url"],
  ["data", "previewUrl"],
  ["data", "download_url"],
  ["data", "downloadUrl"],
  ["result", "url"],
  ["result", "video_url"],
  ["result", "videoUrl"],
  ["result", "output_url"],
  ["result", "outputUrl"],
  ["result", "preview_url"],
  ["result", "previewUrl"],
  ["result", "download_url"],
  ["result", "downloadUrl"],
  ["video", "url"],
  ["video", "video_url"],
  ["videos", 0, "url"],
  ["videos", 0, "video_url"],
  ["output", 0, "url"],
  ["outputs", 0, "url"],
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

export function isProviderSuccessStatus(source: unknown) {
  const status = extractProviderStatus(source);
  return Boolean(status && ["success", "succeeded", "completed", "complete", "done", "finished", "generated", "generated_success", "task_success"].includes(status));
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
