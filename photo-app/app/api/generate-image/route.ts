import { NextResponse } from "next/server";
import { generateImage, generateImageWithReferences } from "@/lib/image-generation";
import { buildTextPrompt } from "@/lib/prompt-builders";
import { addServerLog } from "@/lib/server-logs";
import { saveSharedHistory, type SharedHistoryItem } from "@/lib/server-history";
import {
  isWorkflowAuthResponse,
  withWorkflowAuthFromFormData,
} from "@/lib/server/withWorkflowAuth";
import { defaultImageModel, isLegacyDallEModel } from "@/lib/apiKey/userApiKey";
import { publicPrompt, redactHistoryPrompt } from "@/lib/workflow-privacy";
import { createFallbackImages, type ImageQuality, type ImageSize, type Ratio, type StyleKey } from "@/lib/workflow";

export const runtime = "nodejs";

function errorResponse(message: string, status = 400, detail?: Record<string, unknown>) {
  return NextResponse.json({ error: message, ...detail }, { status });
}

function fallbackStyle(style?: string): StyleKey {
  return ["realistic", "minimalEcommerce", "tech", "poster", "luxury"].includes(style || "")
    ? (style as StyleKey)
    : "realistic";
}

function errorStatus(error: unknown) {
  if (error && typeof error === "object") {
    const status = (error as { status?: unknown; code?: unknown }).status;
    if (typeof status === "number") return status;
    const code = (error as { code?: unknown }).code;
    if (typeof code === "number") return code;
  }
  const message = error instanceof Error ? error.message : String(error);
  const match = message.match(/\b(400|401|403|404|408|409|429|5\d\d)\b/);
  return match ? Number(match[1]) : 500;
}

function classifyGenerationError(message: string, status: number) {
  const lower = message.toLowerCase();
  if (status === 401 || lower.includes("unauthorized")) return "API Key 无效或已过期。";
  if (status === 403) return "权限不足、地区限制或模型权限未开通。";
  if (status === 404) return "模型、Deployment 或 Base URL 不存在。";
  if (status === 429 || lower.includes("rate limit")) return "请求过多、额度不足或触发限流。";
  if (status === 503 || lower.includes("available channel")) {
    const modelMatch = message.match(/model\s+([A-Za-z0-9._-]+)/i);
    const model = modelMatch?.[1] || "";
    if (isLegacyDallEModel(model)) {
      return `当前模型 ${model} 没有可用通道，请在设置中心更换为 ${defaultImageModel} 或当前接口支持的模型。`;
    }
    return message;
  }
  if (status >= 500) return "上游服务端异常。";
  if (lower.includes("api key") && lower.includes("缺失")) return message;
  if (lower.includes("base url") || lower.includes("baseurl")) return "Base URL 缺失或格式错误。";
  if (lower.includes("json")) return "JSON parse error：接口返回格式异常。";
  if (lower.includes("fetch failed") || lower.includes("network") || lower.includes("timeout")) return "Network error：网络连接失败或超时。";
  return message;
}

function generationErrorDetail(error: unknown, auth?: Awaited<ReturnType<typeof withWorkflowAuthFromFormData>>) {
  const rawMessage = error instanceof Error ? error.message : "图片生成失败，请稍后重试。";
  const status = errorStatus(error);
  const isAuthContext = auth && !isWorkflowAuthResponse(auth);
  const provider = isAuthContext ? auth.apiProvider || "openai" : "unknown";
  const model = isAuthContext
    ? auth.googleBananaModel || auth.imageModel || auth.azureDeployment || ""
    : "";
  const hasBaseURL = isAuthContext ? Boolean(auth.baseURL || auth.azureEndpoint) : false;
  const hasApiKey = isAuthContext ? Boolean(auth.apiKey) : false;

  return {
    statusCode: status,
    provider,
    model,
    hasBaseURL,
    hasApiKey,
    configSource: "browser-localStorage-formData",
    serverEnv: {
      hasOpenAIKey: Boolean(process.env.OPENAI_API_KEY),
      hasOpenAIBaseURL: Boolean(process.env.OPENAI_BASE_URL),
      hasOpenAIImageModel: Boolean(process.env.OPENAI_IMAGE_MODEL),
      hasAzureEndpoint: Boolean(process.env.AZURE_OPENAI_ENDPOINT || process.env.AZURE_OPENAI_IMAGE_ENDPOINT),
      hasAzureKey: Boolean(process.env.AZURE_OPENAI_API_KEY),
      hasBananaBaseURL: Boolean(process.env.GOOGLE_BANANA_BASE_URL || process.env.BANANA_BASE_URL),
    },
    reason: classifyGenerationError(rawMessage, status),
  };
}

function parseHistoryMeta(value: FormDataEntryValue | null) {
  if (typeof value !== "string") return null;

  try {
    const parsed = JSON.parse(value) as Partial<SharedHistoryItem>;
    return parsed.id && parsed.workflow && parsed.title ? parsed : null;
  } catch {
    return null;
  }
}

async function saveGeneratedHistory({
  meta,
  customerId,
  finalPrompt,
  createdAt,
  images,
}: {
  meta: Partial<SharedHistoryItem> | null;
  customerId: string;
  finalPrompt: string;
  createdAt: string;
  images: Awaited<ReturnType<typeof generateImage>>["images"];
}) {
  if (!meta?.id || !meta.workflow || !meta.title) return null;

  try {
    return await saveSharedHistory(
      {
        id: meta.id,
        workflow: meta.workflow,
        title: meta.title,
        customerId,
        outputType: meta.outputType,
        referenceThumb: meta.referenceThumb,
        productThumb: meta.productThumb,
        imageCount: images.length,
        finalPrompt,
        createdAt,
      },
      images,
    );
  } catch (error) {
    addServerLog(
      "error",
      "api.history",
      "Server-side history save failed",
      error instanceof Error ? error.message : error,
    );
    return null;
  }
}

export async function POST(request: Request) {
  const startedAt = Date.now();
  let prompt = "";
  let style = "";
  let ratio = "1:1" as Ratio;
  let size = "1024x1024" as ImageSize;
  let quality = "low" as ImageQuality;
  let count = 1;
  let authContext: Awaited<ReturnType<typeof withWorkflowAuthFromFormData>> | undefined;

  try {
    const formData = await request.formData();
    prompt = String(formData.get("prompt") || "").trim();
    style = String(formData.get("style") || "").trim();
    ratio = String(formData.get("ratio") || "1:1") as Ratio;
    size = String(formData.get("size") || "1024x1024") as ImageSize;
    quality = String(formData.get("quality") || "low") as ImageQuality;
    count = Math.min(Math.max(Number(formData.get("count") || 1), 1), 4);
    const mode = String(formData.get("mode") || "text");
    const reference = formData.get("reference");
    const historyMeta = parseHistoryMeta(formData.get("__historyMeta"));
    const auth = await withWorkflowAuthFromFormData(formData, "text-image");
    authContext = auth;
    if (isWorkflowAuthResponse(auth)) return auth;

    addServerLog("info", "api.generate-image", "Received image generation request", {
      mode,
      style,
      ratio,
      size,
      quality,
      count,
      hasReference: reference instanceof File && reference.size > 0,
      provider: auth.apiProvider,
      model: auth.googleBananaModel || auth.imageModel || auth.azureDeployment,
      hasBaseURL: Boolean(auth.baseURL || auth.azureEndpoint),
      hasApiKey: Boolean(auth.apiKey),
    });

    if (!prompt) {
      return errorResponse("请输入 prompt。");
    }

    const finalPrompt = buildTextPrompt({ prompt, style, ratio });
    const result =
      mode === "reference" && reference instanceof File && reference.size > 0
        ? await generateImageWithReferences({
            prompt: finalPrompt,
            images: [reference],
            size,
            quality,
            count,
            clients: { openai: auth.openai, imageModel: auth.imageModel || auth.googleBananaModel, unified: auth.unified },
          })
        : await generateImage({
            prompt: finalPrompt,
            size,
            quality,
            count,
            clients: { openai: auth.openai, imageModel: auth.imageModel || auth.googleBananaModel, unified: auth.unified },
          });

    const createdAt = new Date().toISOString();
    const historyItem = await saveGeneratedHistory({
      meta: historyMeta,
      customerId: auth.license.code,
      finalPrompt: publicPrompt(),
      createdAt,
      images: result.images,
    });

    return NextResponse.json({
      ...result,
      finalPrompt: publicPrompt(),
      createdAt,
      durationMs: Date.now() - startedAt,
      historyItem: redactHistoryPrompt(historyItem),
    });
  } catch (error) {
    const rawMessage =
      error instanceof Error ? error.message : "图片生成失败，请稍后重试。";
    const lower = rawMessage.toLowerCase();
    const detail = generationErrorDetail(error, authContext);
    addServerLog("error", "api.generate-image", "Image generation request failed", {
      provider: detail.provider,
      model: detail.model,
      hasBaseURL: detail.hasBaseURL,
      hasApiKey: detail.hasApiKey,
      statusCode: detail.statusCode,
      error: detail.reason,
    });

    if (
      lower.includes("fetch failed") ||
      lower.includes("connection error") ||
      lower.includes("econnreset") ||
      lower.includes("timed out") ||
      lower.includes("timeout")
    ) {
      const finalPrompt = prompt
        ? buildTextPrompt({ prompt, style, ratio })
        : "Local offline preview";

      return NextResponse.json({
        images: createFallbackImages({ prompt, style: fallbackStyle(style), ratio, size, count }),
        finalPrompt: publicPrompt(),
        createdAt: new Date().toISOString(),
        durationMs: Date.now() - startedAt,
        warning:
          "当前网络无法连接图片服务，已生成本地离线预览图。配置可用网络、OPENAI_BASE_URL 或 Azure 终结点后会自动使用真实 AI 生图。",
      });
    }

    return errorResponse(detail.reason, detail.statusCode, detail);
  }
}
