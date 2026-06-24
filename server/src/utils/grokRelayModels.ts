function relayHostname(apiBaseUrl: string) {
  try {
    return new URL(apiBaseUrl.trim().replace(/^(?:POST|GET|PUT|PATCH|DELETE)\s+/i, "")).hostname.toLowerCase();
  } catch {
    return apiBaseUrl.toLowerCase();
  }
}

export function isDuoyuanGrokRelay(apiBaseUrl: string) {
  const host = relayHostname(apiBaseUrl);
  return host === "ai.ai666.net" || host === "ai.cy88.ai" || /(?:^|\.)(?:ai666\.net|cy88\.ai)(?:\/|$)/i.test(host);
}

export function canonicalDuoyuanGrokModelName(modelName: string, apiBaseUrl: string) {
  if (!isDuoyuanGrokRelay(apiBaseUrl)) return modelName;
  const normalized = modelName.trim().toLowerCase().replace(/[_\s.]+/g, "-");
  if (normalized === "grok-video-3-max") return "grok-video-3-15s";
  if (normalized === "grok-video-3-pro") return "grok-video-3-10s";
  if (normalized === "grok-video-3" || /^grok-video-3-(?:6s|10s|15s)$/.test(normalized)) return normalized;
  if (/^grok-1-5-video-(?:6s|10s|15s)$/.test(normalized)) return normalized.replace("1-5", "1.5");
  return modelName;
}

export function documentedGrokDuration(modelName: string, requestedDuration: number) {
  if (/(?:^|-)6s$/.test(modelName)) return 6;
  if (/(?:^|-)10s$/.test(modelName)) return 10;
  if (/(?:^|-)15s$/.test(modelName)) return 15;
  return Math.min(15, Math.max(1, Math.round(requestedDuration || 10)));
}
