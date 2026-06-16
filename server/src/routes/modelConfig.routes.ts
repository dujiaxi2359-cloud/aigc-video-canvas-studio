import { Router } from "express";
import {
  createModelConfig,
  deleteModelConfig,
  deleteModelConfigs,
  getRuntimeModelConfig,
  listModelConfigs,
  probeOpenAiCompatibleModels,
  saveModelConfigsBulk,
  testModelConfig,
  updateModelConfig
} from "../services/modelConfig.service.js";
import { requireWorkspaceManager } from "../middleware/auth.js";

export const modelConfigRouter = Router();

modelConfigRouter.get("/", async (_req, res, next) => {
  try {
    res.json(await listModelConfigs());
  } catch (error) {
    next(error);
  }
});

function requireInternalService(req: Parameters<typeof requireWorkspaceManager>[0], res: Parameters<typeof requireWorkspaceManager>[1], next: Parameters<typeof requireWorkspaceManager>[2]) {
  const expected = process.env.INTERNAL_SERVICE_KEY || process.env.APP_SECRET;
  const provided = String(req.headers["x-internal-service-key"] || "");
  if (!expected || provided !== expected) return res.status(403).json({ errorCode: "INTERNAL_SERVICE_REQUIRED", errorMessage: "仅允许内部服务读取运行时模型配置。" });
  next();
}

modelConfigRouter.get("/runtime/:id", requireInternalService, async (req, res, next) => {
  try {
    res.json(await getRuntimeModelConfig(req.params.id));
  } catch (error) {
    next(error);
  }
});

modelConfigRouter.post("/", requireWorkspaceManager, async (req, res, next) => {
  try {
    res.status(201).json(await createModelConfig(req.body));
  } catch (error) {
    next(error);
  }
});

modelConfigRouter.post("/probe", requireWorkspaceManager, async (req, res, next) => {
  try {
    res.json(await probeOpenAiCompatibleModels(req.body));
  } catch (error) {
    next(error);
  }
});

modelConfigRouter.post("/bulk", requireWorkspaceManager, async (req, res, next) => {
  try {
    res.json(await saveModelConfigsBulk(req.body?.models, { replaceExisting: req.body?.replaceExisting === true }));
  } catch (error) {
    next(error);
  }
});

modelConfigRouter.post("/bulk-delete", requireWorkspaceManager, async (req, res, next) => {
  try {
    res.json(await deleteModelConfigs(Array.isArray(req.body?.ids) ? req.body.ids : []));
  } catch (error) {
    next(error);
  }
});

modelConfigRouter.put("/:id", requireWorkspaceManager, async (req, res, next) => {
  try {
    res.json(await updateModelConfig(req.params.id, req.body));
  } catch (error) {
    next(error);
  }
});

modelConfigRouter.delete("/:id", requireWorkspaceManager, async (req, res, next) => {
  try {
    await deleteModelConfig(req.params.id);
    res.status(204).end();
  } catch (error) {
    next(error);
  }
});

modelConfigRouter.post("/:id/test", requireWorkspaceManager, async (req, res, next) => {
  try {
    res.json(await testModelConfig(req.params.id, req.body));
  } catch (error) {
    next(error);
  }
});
