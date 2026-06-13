import { Router } from "express";
import {
  createModelConfig,
  deleteModelConfig,
  listModelConfigs,
  testModelConfig,
  updateModelConfig
} from "../services/modelConfig.service.js";
import { requireAdmin } from "../middleware/auth.js";

export const modelConfigRouter = Router();

modelConfigRouter.get("/", async (_req, res, next) => {
  try {
    res.json(await listModelConfigs());
  } catch (error) {
    next(error);
  }
});

modelConfigRouter.post("/", requireAdmin, async (req, res, next) => {
  try {
    res.status(201).json(await createModelConfig(req.body));
  } catch (error) {
    next(error);
  }
});

modelConfigRouter.put("/:id", requireAdmin, async (req, res, next) => {
  try {
    res.json(await updateModelConfig(req.params.id, req.body));
  } catch (error) {
    next(error);
  }
});

modelConfigRouter.delete("/:id", requireAdmin, async (req, res, next) => {
  try {
    await deleteModelConfig(req.params.id);
    res.status(204).end();
  } catch (error) {
    next(error);
  }
});

modelConfigRouter.post("/:id/test", requireAdmin, async (req, res, next) => {
  try {
    res.json(await testModelConfig(req.params.id, req.body));
  } catch (error) {
    next(error);
  }
});
