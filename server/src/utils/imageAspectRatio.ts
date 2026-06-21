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

export function normalizeImageAspectRatio(aspectRatio?: string) {
  return ratioToSize[aspectRatio ?? ""] ? aspectRatio! : "1:1";
}

export function aspectRatioToAlibabaSize(aspectRatio?: string) {
  const size = ratioToSize[normalizeImageAspectRatio(aspectRatio)];
  return `${size.width}*${size.height}`;
}

export function aspectRatioToQwen20Size(aspectRatio?: string) {
  const size = qwen20RatioToSize[normalizeImageAspectRatio(aspectRatio)];
  return `${size.width}*${size.height}`;
}

function isGptImage2(modelName?: string) {
  return /gpt-image-2|image-2/i.test(modelName ?? "");
}

export function aspectRatioToOpenAIImageSize(aspectRatio?: string, modelName?: string) {
  if (isGptImage2(modelName)) {
    switch (normalizeImageAspectRatio(aspectRatio)) {
      case "9:16":
        return "2160x3840";
      case "16:9":
        return "3840x2160";
      case "1:1":
        return "2048x2048";
      default:
        break;
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
  return ratioToSize[normalizeImageAspectRatio(aspectRatio)];
}
