const ratioToSize: Record<string, { width: number; height: number }> = {
  "1:1": { width: 1024, height: 1024 },
  "3:4": { width: 1024, height: 1365 },
  "4:3": { width: 1365, height: 1024 },
  "9:16": { width: 1024, height: 1820 },
  "16:9": { width: 1820, height: 1024 }
};

const qwen20RatioToSize: Record<string, { width: number; height: number }> = {
  "1:1": { width: 1280, height: 1280 },
  "3:4": { width: 1104, height: 1472 },
  "4:3": { width: 1472, height: 1104 },
  "9:16": { width: 960, height: 1696 },
  "16:9": { width: 1696, height: 960 }
};

export function isAutoImageAspectRatio(aspectRatio?: string) {
  return !aspectRatio || aspectRatio === "auto";
}

export function normalizeImageAspectRatio(aspectRatio?: string) {
  if (isAutoImageAspectRatio(aspectRatio)) return undefined;
  return ratioToSize[aspectRatio ?? ""] ? aspectRatio! : "1:1";
}

export function aspectRatioToAlibabaSize(aspectRatio?: string) {
  const normalized = normalizeImageAspectRatio(aspectRatio);
  if (!normalized) return undefined;
  const size = ratioToSize[normalized];
  return `${size.width}*${size.height}`;
}

export function aspectRatioToQwen20Size(aspectRatio?: string) {
  const normalized = normalizeImageAspectRatio(aspectRatio);
  if (!normalized) return undefined;
  const size = qwen20RatioToSize[normalized];
  return `${size.width}*${size.height}`;
}

function isGptImage2(modelName?: string) {
  return /gpt-image-2|image-2/i.test(modelName ?? "");
}

function normalizeImageTier(imageSize?: string) {
  const normalized = imageSize?.trim().toUpperCase();
  return normalized === "1K" || normalized === "2K" || normalized === "4K" ? normalized : undefined;
}

const gptImage2TierSizes: Record<string, Record<"1K" | "2K" | "4K", string>> = {
  "1:1": { "1K": "1024x1024", "2K": "2048x2048", "4K": "2048x2048" },
  "3:4": { "1K": "1024x1365", "2K": "1536x2048", "4K": "2160x2880" },
  "4:3": { "1K": "1365x1024", "2K": "2048x1536", "4K": "2880x2160" },
  "9:16": { "1K": "720x1280", "2K": "1080x1920", "4K": "2160x3840" },
  "16:9": { "1K": "1280x720", "2K": "1920x1080", "4K": "3840x2160" }
};

export function aspectRatioToOpenAIImageSize(aspectRatio?: string, modelName?: string, imageSize?: string) {
  if (isAutoImageAspectRatio(aspectRatio)) return imageSize && /^\d+x\d+$/i.test(imageSize) ? imageSize : undefined;
  if (isGptImage2(modelName)) {
    const tier = normalizeImageTier(imageSize) ?? "2K";
    const normalizedRatio = normalizeImageAspectRatio(aspectRatio) ?? "1:1";
    const tierSize = gptImage2TierSizes[normalizedRatio]?.[tier];
    if (tierSize) return tierSize;
    if (imageSize && imageSize !== "auto") {
      return imageSize;
    }
  }
  switch (normalizeImageAspectRatio(aspectRatio)) {
    case "3:4":
    case "9:16":
      return "1024x1536";
    case "4:3":
    case "16:9":
      return "1536x1024";
    case "1:1":
    default:
      return "1024x1024";
  }
}

export function aspectRatioToGoogleSize(aspectRatio?: string) {
  const normalized = normalizeImageAspectRatio(aspectRatio);
  return normalized ? ratioToSize[normalized] : undefined;
}
