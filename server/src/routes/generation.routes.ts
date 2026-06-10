import { Router } from "express";
import { getGenerationTask } from "../services/generationTask.service.js";
import { generateImage, generateText, generateVideo } from "../services/model.service.js";
import { isProviderError } from "../utils/providerErrors.js";

export const generationRouter = Router();

function generationError(error: unknown) {
  if (isProviderError(error)) {
    return {
      status: "error" as const,
      errorCode: error.errorCode,
      errorMessage: error.message,
      debugMessage: error.debugMessage,
      payloadSummary: error.details
    };
  }
  const message = error instanceof Error ? error.message : "生成失败";
  return {
    status: "error" as const,
    errorCode: /fetch failed/i.test(message) ? "NETWORK_ERROR" : "PROVIDER_ERROR",
    errorMessage: /fetch failed/i.test(message) ? "网络请求失败，请检查本地服务、代理、接口地址或第三方 API 网络连接是否正常。" : message,
    debugMessage: /fetch failed/i.test(message) ? message : undefined
  };
}

generationRouter.post("/video", async (req, res) => {
  try {
    res.json(await generateVideo(req.body));
  } catch (error) {
    res.json(generationError(error));
  }
});

generationRouter.post("/image", async (req, res) => {
  try {
    res.json(await generateImage(req.body));
  } catch (error) {
    res.json(generationError(error));
  }
});

generationRouter.post("/text", async (req, res) => {
  try {
    res.json(await generateText(req.body));
  } catch (error) {
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
