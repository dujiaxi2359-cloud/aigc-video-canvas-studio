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
  if (normalized === "grok-video-3" || normalized === "grok-video-3-pro" || normalized === "grok-video-3-max") return normalized;
  if (/^grok-(?:1-5-)?video-(?:3-)?15s$/.test(normalized)) return "grok-video-3-max";
  if (/^grok-(?:1-5-)?video-(?:3-)?10s$/.test(normalized)) return "grok-video-3-pro";
  if (/^grok-(?:1-5-)?video-(?:3-)?6s$/.test(normalized)) return "grok-video-3";
  return modelName;
}

export function documentedGrokDuration(modelName: string, requestedDuration: number) {
  if (modelName === "grok-video-3-pro") return 10;
  if (modelName === "grok-video-3-max") return 15;
  return Math.min(15, Math.max(1, Math.round(requestedDuration || 10)));
}
