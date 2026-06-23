import { Router } from "express";
import { getGenerationTask } from "../services/generationTask.service.js";
import { generateImage, generateText, generateVideo } from "../services/model.service.js";
import { isProviderError } from "../utils/providerErrors.js";
import { assertCreditsAvailable, assertWorkspaceFeature, consumeCredits } from "../services/billing.service.js";

export const generationRouter = Router();

const VIDEO_IDEMPOTENCY_TTL_MS = 5 * 60 * 1000;
const inflightVideoRequests = new Map<string, { createdAt: number; promise: Promise<unknown> }>();

function videoIdempotencyKey(body: any) {
  const clientRequestId = typeof body?.clientRequestId === "string" ? body.clientRequestId : "";
  const nodeId = typeof body?.nodeId === "string" ? body.nodeId : "";
  const modelConfigId = typeof body?.modelConfigId === "string" ? body.modelConfigId : "";
  if (!clientRequestId || !nodeId || !modelConfigId) return "";
  return `${nodeId}:${modelConfigId}:${clientRequestId}`;
}

function rememberVideoRequest<T>(key: string, create: () => Promise<T>) {
  const now = Date.now();
  for (const [entryKey, entry] of inflightVideoRequests) {
    if (now - entry.createdAt > VIDEO_IDEMPOTENCY_TTL_MS) inflightVideoRequests.delete(entryKey);
  }
  if (!key) return create();
  const existing = inflightVideoRequests.get(key);
  if (existing) return existing.promise as Promise<T>;
  const promise = create();
  inflightVideoRequests.set(key, { createdAt: now, promise });
  promise.finally(() => {
    setTimeout(() => {
      const entry = inflightVideoRequests.get(key);
      if (entry?.promise === promise) inflightVideoRequests.delete(key);
    }, VIDEO_IDEMPOTENCY_TTL_MS);
  }).catch(() => undefined);
  return promise;
}

function isQuotaError(text: string) {
  return /PUBLIC_ERROR_USER_QUOTA_REACHED|USER_QUOTA_REACHED|RESOURCE_EXHAUSTED|token quota|quota is not enough|quota|credit|balance|insufficient|exhausted|余额不足|额度不足|额度耗尽/i.test(text);
}

function generationError(error: unknown) {
  if (isProviderError(error)) {
    const raw = `${error.message}\n${error.debugMessage ?? ""}`;
    if (isQuotaError(raw)) {
      return {
        status: "error" as const,
        errorCode: "UPSTREAM_QUOTA_EXHAUSTED",
        errorMessage: "额度不足"
      };
    }
    return {
      status: "error" as const,
      errorCode: error.errorCode,
      errorMessage: error.message,
      debugMessage: error.debugMessage,
      payloadSummary: error.details
    };
  }
  const message = error instanceof Error ? error.message : "生成失败";
  if (isQuotaError(message)) {
    return {
      status: "error" as const,
      errorCode: "UPSTREAM_QUOTA_EXHAUSTED",
      errorMessage: "额度不足"
    };
  }
  return {
    status: "error" as const,
    errorCode: /fetch failed/i.test(message) ? "NETWORK_ERROR" : "PROVIDER_ERROR",
    errorMessage: /fetch failed/i.test(message) ? "网络请求失败，请检查本地服务、代理、接口地址或第三方 API 网络连接是否正常。" : message,
    debugMessage: /fetch failed/i.test(message) ? message : undefined
  };
}

generationRouter.post("/video", async (req, res) => {
  try {
    const result = await rememberVideoRequest(videoIdempotencyKey(req.body), async () => {
      await assertWorkspaceFeature("video_generation"); await assertCreditsAvailable(1);
      const generated = await generateVideo(req.body);
      if ((generated as any)?.status !== "error") await consumeCredits({ actionType: "video_generation", provider: req.body?.provider, modelId: req.body?.modelId || req.body?.modelConfigId, metadata: { projectId: req.body?.projectId, nodeId: req.body?.nodeId } });
      return generated;
    });
    res.json(result);
  } catch (error) {
    if (error instanceof Error && error.message === "INSUFFICIENT_CREDITS") return res.status(402).json({ status: "error", errorCode: "INSUFFICIENT_CREDITS", errorMessage: "当前工作空间额度不足。" });
    res.json(generationError(error));
  }
});

generationRouter.post("/image", async (req, res) => {
  try {
    await assertWorkspaceFeature("image_generation"); await assertCreditsAvailable(1);
    const result = await generateImage(req.body);
    if ((result as any)?.status !== "error") await consumeCredits({ actionType: "image_generation", provider: req.body?.provider, modelId: req.body?.modelId || req.body?.modelConfigId, metadata: { projectId: req.body?.projectId, nodeId: req.body?.nodeId } });
    res.json(result);
  } catch (error) {
    if (error instanceof Error && error.message === "INSUFFICIENT_CREDITS") return res.status(402).json({ status: "error", errorCode: "INSUFFICIENT_CREDITS", errorMessage: "当前工作空间额度不足。" });
    res.json(generationError(error));
  }
});

generationRouter.post("/text", async (req, res) => {
  try {
    await assertWorkspaceFeature("agent"); await assertCreditsAvailable(1);
    const result = await generateText(req.body);
    if ((result as any)?.status !== "error") await consumeCredits({ actionType: "agent", provider: req.body?.provider, modelId: req.body?.modelId || req.body?.modelConfigId });
    res.json(result);
  } catch (error) {
    if (error instanceof Error && error.message === "INSUFFICIENT_CREDITS") return res.status(402).json({ status: "error", errorCode: "INSUFFICIENT_CREDITS", errorMessage: "当前工作空间额度不足。" });
    res.json(generationError(error));
  }
});

generationRouter.get("/tasks/:id", async (req, res) => {
  const task = await getGenerationTask(req.params.id);
  if (!task) {
    res.status(404).json({ status: "error", errorMessage: "未找到该生成任务。" });
    return;
  }
  res.json(task);
});
