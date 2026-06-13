import OpenAI, { toFile } from "openai";
import {
  azureOpenAIDeployment,
  createAzureOpenAIClient,
  createOpenAIClient,
  hasAzureImageConfig,
  imageModel,
} from "@/lib/openai";
import { createId } from "@/lib/id";
import { defaultImageModel, isLegacyDallEModel } from "@/lib/apiKey/userApiKey";
import { addServerLog } from "@/lib/server-logs";
import type { ImageQuality, ImageSize } from "@/lib/workflow";

export type GeneratedImage = {
  id: string;
  index: number;
  url: string;
  exportWidth?: number;
  exportHeight?: number;
};

export type ImageGenerationResult = {
  images: GeneratedImage[];
  warning?: string;
};

type ImageGenerationClients = {
  openai?: OpenAI;
  imageModel?: string;
  unified?: {
    modelConfigId: string;
    workspaceId?: string;
    session: string;
    providerId?: string;
  };
};

function unifiedApiOrigin() {
  return (process.env.UNIFIED_API_INTERNAL_URL || "http://127.0.0.1:4000").replace(/\/$/, "");
}

async function unifiedApiFetch(path: string, init: RequestInit, unified: NonNullable<ImageGenerationClients["unified"]>) {
  const headers = new Headers(init.headers);
  headers.set("Cookie", `aigcnong_session=${encodeURIComponent(unified.session)}`);
  if (unified.workspaceId) headers.set("X-Workspace-Id", unified.workspaceId);
  return fetch(`${unifiedApiOrigin()}${path}`, { ...init, headers, cache: "no-store" });
}

async function uploadUnifiedReference(file: File, unified: NonNullable<ImageGenerationClients["unified"]>) {
  const body = new FormData();
  body.append("file", file, file.name || "reference.png");
  const response = await unifiedApiFetch("/api/assets/upload", { method: "POST", body }, unified);
  const payload = await response.json().catch(() => null) as { id?: string; errorMessage?: string } | null;
  if (!response.ok || !payload?.id) throw new Error(payload?.errorMessage || "参考图上传失败。");
  return payload.id;
}

async function generateWithUnifiedModel(input: {
  prompt: string;
  images?: File[];
  size: ImageSize;
  quality: ImageQuality;
  count: number;
  unified: NonNullable<ImageGenerationClients["unified"]>;
}): Promise<ImageGenerationResult> {
  const imageAssetIds = input.images?.length
    ? await Promise.all(input.images.map((file) => uploadUnifiedReference(file, input.unified)))
    : [];
  const [width, height] = input.size.split("x").map(Number);
  const requestedRatio = width > 0 && height > 0 ? width / height : 1;
  const supportedRatios = [
    { label: "9:16", value: 9 / 16 },
    { label: "3:4", value: 3 / 4 },
    { label: "1:1", value: 1 },
    { label: "4:3", value: 4 / 3 },
    { label: "16:9", value: 16 / 9 },
  ];
  const aspectRatio = supportedRatios.reduce((best, candidate) =>
    Math.abs(candidate.value - requestedRatio) < Math.abs(best.value - requestedRatio) ? candidate : best
  ).label;
  const imageQuality = input.unified.providerId === "openai" || input.unified.providerId === "azure-openai"
    ? input.quality
    : input.quality === "high" ? "high" : "standard";
  const images: GeneratedImage[] = [];

  for (let index = 0; index < input.count; index += 1) {
    const response = await unifiedApiFetch("/api/generate/image", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        nodeId: `photo-${Date.now()}-${index}`,
        modelConfigId: input.unified.modelConfigId,
        inputMode: imageAssetIds.length ? "image-edit" : "text-to-image",
        prompt: input.prompt,
        imageAssetIds,
        aspectRatio,
        imageQuality,
        imageFormat: "png",
        generateCount: 1,
        qualityMode: input.quality === "low" ? "fast" : input.quality === "medium" ? "balanced" : "full_quality",
      }),
    }, input.unified);
    const payload = await response.json().catch(() => null) as {
      status?: string;
      outputUrl?: string;
      errorMessage?: string;
    } | null;
    if (!response.ok || payload?.status === "error" || !payload?.outputUrl) {
      throw new Error(payload?.errorMessage || "统一图片模型生成失败。");
    }
    images.push({ id: createId("image"), index, url: payload.outputUrl });
  }

  return { images };
}

function getDefaultOpenAIClient() {
  return createOpenAIClient(300_000);
}

function getDefaultAzureOpenAIClient() {
  return hasAzureImageConfig() ? createAzureOpenAIClient(300_000) : null;
}

function sleep(ms: number) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

function errorMessage(error: unknown) {
  return error instanceof Error ? error.message : String(error);
}

function isRateLimitError(error: unknown) {
  const message = errorMessage(error).toLowerCase();
  return (
    message.includes("429") ||
    message.includes("too many requests") ||
    message.includes("rate limit") ||
    message.includes("servicing too many requests")
  );
}

function normalizeImageError(error: unknown, provider: string, action: string) {
  const message = errorMessage(error);

  if (isRateLimitError(error)) {
    return `${provider} 图片服务当前繁忙或达到限流，请等待 30-60 秒后重试。建议先把输出数量设为 1，质量用 medium，连续生成时不要多人同时点击。原始错误：${message}`;
  }

  return `${provider} image ${action} failed: ${message}`;
}

async function withImageApiRetry<T>(
  scope: string,
  operation: () => Promise<T>,
  retryDelays = [6000, 12000, 24000],
) {
  let lastError: unknown;

  for (let attempt = 0; attempt <= retryDelays.length; attempt += 1) {
    try {
      return await operation();
    } catch (error) {
      lastError = error;

      if (!isRateLimitError(error) || attempt === retryDelays.length) {
        throw error;
      }

      const waitMs = retryDelays[attempt];
      addServerLog("warn", scope, "Image API rate limited, retrying", {
        attempt: attempt + 1,
        nextAttemptInMs: waitMs,
        error: errorMessage(error),
      });
      await sleep(waitMs);
    }
  }

  throw lastError;
}

function normalizeSizeForImageApi(size: ImageSize, quality: ImageQuality) {
  const [width, height] = size.split("x").map(Number);
  const minimumPixels = 1024 * 1024;
  const originalPixels = width * height;
  const pixelScale =
    originalPixels > 0 && originalPixels < minimumPixels
      ? Math.sqrt(minimumPixels / originalPixels)
      : 1;
  const scale = pixelScale;
  const scaledWidth = Math.ceil(width * scale);
  const scaledHeight = Math.ceil(height * scale);
  const nextWidth = Math.max(16, Math.ceil(scaledWidth / 16) * 16);
  const nextHeight = Math.max(16, Math.ceil(scaledHeight / 16) * 16);
  const normalized = `${nextWidth}x${nextHeight}` as ImageSize;

  return {
    size: normalized,
    changed: normalized !== size,
    original: size,
    reason:
      originalPixels < minimumPixels
        ? "raised-to-minimum-pixel-budget"
        : normalized !== size
          ? "rounded-to-multiple-of-16"
          : undefined,
  };
}

function normalizeImages(data: { b64_json?: string; url?: string }[] = []) {
  return data
    .map((item, index) => ({
      id: createId("image"),
      index,
      url: item.b64_json ? `data:image/png;base64,${item.b64_json}` : item.url || "",
    }))
    .filter((image) => image.url);
}

function ensureGeneratedImages(images: GeneratedImage[], provider: string) {
  if (images.length > 0) return images;

  throw new Error(
    `${provider} 接口请求已完成，但没有返回可用图片。请检查图片模型、Deployment/Base URL 是否指向 images 接口，以及代理或 Azure 返回值是否包含 b64_json 或 url。`,
  );
}

function requireUsableImageModel(model: string | undefined, provider: string) {
  const trimmed = (model || "").trim();
  if (!trimmed) {
    throw new Error(`${provider} Image Model 缺失：请在设置中心填写当前接口支持的图片模型，例如 ${defaultImageModel}。`);
  }
  if (isLegacyDallEModel(trimmed)) {
    throw new Error(`当前模型 ${trimmed} 没有可用通道，请在设置中心更换为 ${defaultImageModel} 或当前接口支持的模型。`);
  }
  if (trimmed.toLowerCase() === "auto") {
    throw new Error("当前模型/通道不能使用 auto。请在设置中心明确填写可用的 Image Model。");
  }
  return trimmed;
}

async function generateAzureImage({
  prompt,
  size,
  quality,
  count,
}: {
  prompt: string;
  size: ImageSize;
  quality: ImageQuality;
  count: number;
}) {
  const azureOpenAI = getDefaultAzureOpenAIClient();
  if (!azureOpenAI) {
    throw new Error("Azure OpenAI is not configured.");
  }

  const apiSize = normalizeSizeForImageApi(size, quality);
  const startedAt = Date.now();
  addServerLog("info", "azure.generate", "Starting Azure image generation", {
    deployment: azureOpenAIDeployment,
    size: apiSize.size,
    requestedSize: apiSize.changed ? apiSize.original : undefined,
    sizeNormalization: apiSize.reason,
    quality,
    count,
  });

  const result = await withImageApiRetry("azure.generate", () =>
    azureOpenAI.images.generate({
      model: azureOpenAIDeployment,
      prompt,
      n: count,
      size: apiSize.size,
      quality,
    } as never),
  );

  const images = normalizeImages(result.data);
  addServerLog("success", "azure.generate", "Azure image generation completed", {
    durationMs: Date.now() - startedAt,
    images: images.length,
  });
  return { images: ensureGeneratedImages(images, "Azure OpenAI") };
}

async function generateOpenAIImage({
  prompt,
  size,
  quality,
  count,
  client = getDefaultOpenAIClient(),
  model = imageModel,
}: {
  prompt: string;
  size: ImageSize;
  quality: ImageQuality;
  count: number;
  client?: OpenAI;
  model?: string;
}) {
  const usableModel = requireUsableImageModel(model, "OpenAI");
  const apiSize = normalizeSizeForImageApi(size, quality);
  const startedAt = Date.now();
  addServerLog("info", "openai.generate", "Starting OpenAI image generation", {
    model: usableModel,
    size: apiSize.size,
    requestedSize: apiSize.changed ? apiSize.original : undefined,
    sizeNormalization: apiSize.reason,
    quality,
    count,
  });

  const result = await withImageApiRetry("openai.generate", () =>
    client.images.generate({
      model: usableModel,
      prompt,
      size: apiSize.size,
      quality,
      n: count,
    } as never),
  );

  const images = normalizeImages(result.data);
  addServerLog("success", "openai.generate", "OpenAI image generation completed", {
    durationMs: Date.now() - startedAt,
    images: images.length,
  });
  return { images: ensureGeneratedImages(images, "OpenAI") };
}

export async function generateImage({
  prompt,
  size,
  quality,
  count,
  clients,
}: {
  prompt: string;
  size: ImageSize;
  quality: ImageQuality;
  count: number;
  clients?: ImageGenerationClients;
}): Promise<ImageGenerationResult> {
  if (clients?.unified) {
    return generateWithUnifiedModel({ prompt, size, quality, count, unified: clients.unified });
  }
  if (clients?.openai) {
    return generateOpenAIImage({ prompt, size, quality, count, client: clients.openai, model: clients.imageModel });
  }

  if (hasAzureImageConfig()) {
    return generateAzureImage({ prompt, size, quality, count });
  }

  return generateOpenAIImage({ prompt, size, quality, count });
}

export async function generateImageWithReferences({
  prompt,
  images,
  size,
  quality,
  count,
  clients,
}: {
  prompt: string;
  images: File[];
  size: ImageSize;
  quality: ImageQuality;
  count: number;
  clients?: ImageGenerationClients;
}): Promise<ImageGenerationResult> {
  if (clients?.unified) {
    return generateWithUnifiedModel({ prompt, images, size, quality, count, unified: clients.unified });
  }
  if (!clients?.openai && hasAzureImageConfig()) {
    const azureOpenAI = getDefaultAzureOpenAIClient();
    if (!azureOpenAI) {
      throw new Error("Azure OpenAI is not configured.");
    }

    try {
      const apiSize = normalizeSizeForImageApi(size, quality);
      const startedAt = Date.now();
      addServerLog("info", "azure.edit", "Starting Azure image edit", {
        deployment: azureOpenAIDeployment,
        size: apiSize.size,
        requestedSize: apiSize.changed ? apiSize.original : undefined,
        sizeNormalization: apiSize.reason,
        quality,
        count,
        inputImages: images.length,
      });

      const inputFiles = await Promise.all(
        images.map(async (image) =>
          toFile(
            Buffer.from(await image.arrayBuffer()),
            image.name || "input.png",
            { type: image.type || "image/png" },
          ),
        ),
      );

      const result = await withImageApiRetry("azure.edit", () =>
        azureOpenAI.images.edit({
          model: azureOpenAIDeployment,
          prompt,
          image: inputFiles,
          size: apiSize.size,
          quality,
          n: count,
        } as never),
      );

      const outputImages = normalizeImages(result.data);
      addServerLog("success", "azure.edit", "Azure image edit completed", {
        durationMs: Date.now() - startedAt,
        images: outputImages.length,
      });
      return { images: ensureGeneratedImages(outputImages, "Azure OpenAI") };
    } catch (error) {
      addServerLog(
        "error",
        "azure.edit",
        "Azure image edit failed",
        error instanceof Error ? error.message : error,
      );
      throw new Error(
        normalizeImageError(error, "Azure OpenAI", "edit"),
      );
    }
  }

  const startedAt = Date.now();
  const apiSize = normalizeSizeForImageApi(size, quality);
  const usableModel = requireUsableImageModel(clients?.imageModel || imageModel, "OpenAI");
  addServerLog("info", "openai.edit", "Starting OpenAI image edit", {
    model: usableModel,
    size: apiSize.size,
    requestedSize: apiSize.changed ? apiSize.original : undefined,
    sizeNormalization: apiSize.reason,
    quality,
    count,
    inputImages: images.length,
  });

  const inputFiles = await Promise.all(
    images.map(async (image) =>
      toFile(Buffer.from(await image.arrayBuffer()), image.name || "input.png", {
        type: image.type || "image/png",
      }),
    ),
  );

  const result = await withImageApiRetry("openai.edit", () =>
    (clients?.openai || getDefaultOpenAIClient()).images.edit({
      model: usableModel,
      prompt,
      image: inputFiles,
      size: apiSize.size,
      quality,
      n: count,
    } as never),
  );

  const outputImages = normalizeImages(result.data);
  addServerLog("success", "openai.edit", "OpenAI image edit completed", {
    durationMs: Date.now() - startedAt,
    images: outputImages.length,
  });
  return { images: ensureGeneratedImages(outputImages, "OpenAI") };
}
