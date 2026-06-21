import { Router } from "express";
import { getGenerationTask } from "../services/generationTask.service.js";
import { generateImage, generateText, generateVideo } from "../services/model.service.js";
import { isProviderError } from "../utils/providerErrors.js";
import { assertCreditsAvailable, assertWorkspaceFeature, consumeCredits } from "../services/billing.service.js";

export const generationRouter = Router();

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
    await assertWorkspaceFeature("video_generation"); await assertCreditsAvailable(1);
    const result = await generateVideo(req.body);
    if ((result as any)?.status !== "error") await consumeCredits({ actionType: "video_generation", provider: req.body?.provider, modelId: req.body?.modelId || req.body?.modelConfigId, metadata: { projectId: req.body?.projectId, nodeId: req.body?.nodeId } });
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
