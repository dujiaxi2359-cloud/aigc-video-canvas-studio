export const zhipuOfficialBaseUrl = "https://open.bigmodel.cn/api/paas/v4";

export const zhipuImageModels = [
  "glm-image",
  "cogview-4-250304",
  "cogview-4",
  "cogview-3-flash"
] as const;

export const zhipuVideoModels = [
  "cogvideox-3",
  "cogvideox-2",
  "cogvideox-flash",
  "viduq1-text",
  "viduq1-image",
  "vidu2-image",
  "viduq1-start-end",
  "vidu2-start-end",
  "vidu2-reference"
] as const;

export function isZhipuOfficialEndpoint(value?: string) {
  if (!value) return false;
  try {
    return new URL(value).hostname.toLowerCase() === "open.bigmodel.cn";
  } catch {
    return /open\.bigmodel\.cn/i.test(value);
  }
}

export function normalizeZhipuBaseUrl(value?: string) {
  const fallback = zhipuOfficialBaseUrl;
  if (!value?.trim()) return fallback;
  try {
    const url = new URL(value.trim());
    if (url.hostname.toLowerCase() !== "open.bigmodel.cn") return value.trim().replace(/\/+$/, "");
    return `${url.origin}/api/paas/v4`;
  } catch {
    return value.trim().replace(/\/+$/, "");
  }
}

export function isZhipuImageModel(modelName?: string) {
  return /^(?:glm-image|cogview(?:-|$))/i.test(modelName?.trim() ?? "");
}

export function isZhipuVideoModel(modelName?: string) {
  return /^(?:cogvideox|vidu)/i.test(modelName?.trim() ?? "");
}
