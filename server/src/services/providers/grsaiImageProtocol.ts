const grsaiHosts = new Set(["grsaiapi.com", "grsai.dakka.com.cn"]);

export const grsaiImageModels = [
  "gpt-image-2",
  "gpt-image-2-vip",
  "nano-banana",
  "nano-banana-fast",
  "nano-banana-2",
  "nano-banana-2-cl",
  "nano-banana-2-4k-cl",
  "nano-banana-pro",
  "nano-banana-pro-cl",
  "nano-banana-pro-vip",
  "nano-banana-pro-4k-vip"
] as const;

export function isGrsaiImageEndpoint(apiBaseUrl?: string) {
  if (!apiBaseUrl) return false;
  try {
    return grsaiHosts.has(new URL(apiBaseUrl).hostname.toLowerCase());
  } catch {
    return /(?:^|\.)grsaiapi\.com|(?:^|\.)grsai\.dakka\.com\.cn/i.test(apiBaseUrl);
  }
}

export function normalizeGrsaiImageBaseUrl(apiBaseUrl: string) {
  const parsed = new URL(apiBaseUrl.trim().replace(/\/+$/, ""));
  parsed.pathname = parsed.pathname
    .replace(/\/v1\/api\/(?:generate|result)$/i, "")
    .replace(/\/v1$/i, "")
    .replace(/\/+$/g, "");
  parsed.search = "";
  parsed.hash = "";
  return parsed.toString().replace(/\/+$/, "");
}

export function grsaiGenerateEndpoint(apiBaseUrl: string) {
  return `${normalizeGrsaiImageBaseUrl(apiBaseUrl)}/v1/api/generate`;
}

export function grsaiResultEndpoint(apiBaseUrl: string, taskId: string) {
  const url = new URL(`${normalizeGrsaiImageBaseUrl(apiBaseUrl)}/v1/api/result`);
  url.searchParams.set("id", taskId);
  return url.toString();
}

const grsaiVipRatioSizes: Record<string, Record<string, string>> = {
  "1:1": { "1K": "1024x1024", "2K": "2048x2048", "4K": "2880x2880" },
  "16:9": { "1K": "1280x720", "2K": "2048x1152", "4K": "3840x2160" },
  "9:16": { "1K": "720x1280", "2K": "1152x2048", "4K": "2160x3840" },
  "4:3": { "1K": "1152x864", "2K": "2304x1728", "4K": "3264x2448" },
  "3:4": { "1K": "864x1152", "2K": "1728x2304", "4K": "2448x3264" },
  "3:2": { "1K": "1536x1024", "2K": "2048x1360", "4K": "3504x2336" },
  "2:3": { "1K": "1024x1536", "2K": "1360x2048", "4K": "2336x3504" },
  "5:4": { "1K": "1120x896", "2K": "2240x1792", "4K": "3200x2560" },
  "4:5": { "1K": "896x1120", "2K": "1792x2240", "4K": "2560x3200" },
  "21:9": { "1K": "1456x624", "2K": "2912x1248", "4K": "3840x1648" },
  "9:21": { "1K": "624x1456", "2K": "1248x2912", "4K": "1648x3840" },
  "1:3": { "2K": "688x2048", "4K": "1280x3840" },
  "3:1": { "2K": "2048x688", "4K": "3840x1280" },
  "2:1": { "1K": "1536x768", "2K": "3072x1536", "4K": "3840x1920" },
  "1:2": { "1K": "768x1536", "2K": "1536x3072", "4K": "1920x3840" }
};

export function grsaiAspectValue(modelName: string, aspectRatio?: string, imageSize?: string) {
  const cleanRatio = aspectRatio?.trim();
  const cleanSize = imageSize?.trim().toUpperCase();
  if (/gpt-image-2-vip/i.test(modelName)) {
    if (cleanRatio && cleanSize && grsaiVipRatioSizes[cleanRatio]?.[cleanSize]) {
      return grsaiVipRatioSizes[cleanRatio][cleanSize];
    }
    if (cleanSize && /^\d+x\d+$/i.test(cleanSize)) return cleanSize.toLowerCase();
  }
  if (cleanRatio) return cleanRatio;
  if (cleanSize && cleanSize !== "AUTO") return cleanSize;
  return "auto";
}
