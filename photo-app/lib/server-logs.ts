import { createId } from "@/lib/id";

export type ServerLogLevel = "info" | "warn" | "error" | "success";

export type ServerLogEntry = {
  id: string;
  timestamp: string;
  level: ServerLogLevel;
  scope: string;
  message: string;
  detail?: string;
};

const globalForLogs = globalThis as typeof globalThis & {
  __ecommerceImageWorkflowLogs?: ServerLogEntry[];
};

const logs = globalForLogs.__ecommerceImageWorkflowLogs || [];
globalForLogs.__ecommerceImageWorkflowLogs = logs;

export function addServerLog(
  level: ServerLogLevel,
  scope: string,
  message: string,
  detail?: unknown,
) {
  const entry: ServerLogEntry = {
    id: createId("log"),
    timestamp: new Date().toISOString(),
    level,
    scope,
    message,
    detail:
      typeof detail === "string"
        ? detail
        : detail
          ? JSON.stringify(detail, null, 2)
          : undefined,
  };

  logs.unshift(entry);
  logs.splice(160);
  console[level === "success" ? "log" : level](
    `[${entry.timestamp}] [${scope}] ${message}`,
    entry.detail || "",
  );
  return entry;
}

export function getServerLogs() {
  return logs;
}

export function clearServerLogs() {
  logs.splice(0);
}
