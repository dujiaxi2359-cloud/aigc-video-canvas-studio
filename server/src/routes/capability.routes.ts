import { Router } from "express";
import { getAvailableImageOptions, getAvailableVideoOptions } from "../services/modelCapability.service.js";
import { providerCatalog } from "../services/providerCatalog.js";

export const capabilityRouter = Router();

capabilityRouter.get("/model-capability-presets", (_req, res) => {
  res.json([]);
});

capabilityRouter.get("/model-catalog", (_req, res) => {
  res.json([]);
});

capabilityRouter.get("/provider-catalog", (_req, res) => {
  res.json(providerCatalog);
});

capabilityRouter.post("/model-capabilities/options", async (req, res, next) => {
  try {
    const { modelConfigId, nodeContext } = req.body;
    res.json(await getAvailableVideoOptions(modelConfigId, nodeContext));
  } catch (error) {
    next(error);
  }
});

capabilityRouter.post("/model-capabilities/image-options", async (req, res, next) => {
  try {
    const { modelConfigId, nodeContext } = req.body;
    res.json(await getAvailableImageOptions(modelConfigId, nodeContext));
  } catch (error) {
    next(error);
  }
});
