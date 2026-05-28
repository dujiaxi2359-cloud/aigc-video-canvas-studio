import { Router } from "express";
import { createProject, deleteProject, getProject, listProjects, saveProject } from "../services/project.service.js";

export const projectRouter = Router();

projectRouter.get("/", async (_req, res, next) => {
  try {
    res.json(await listProjects());
  } catch (error) {
    next(error);
  }
});

projectRouter.post("/", async (req, res, next) => {
  try {
    res.status(201).json(await createProject(req.body?.name));
  } catch (error) {
    next(error);
  }
});

projectRouter.get("/:id", async (req, res, next) => {
  try {
    const project = await getProject(req.params.id);
    if (!project) return res.status(404).json({ error: "Project not found" });
    res.json(project);
  } catch (error) {
    next(error);
  }
});

projectRouter.put("/:id", async (req, res, next) => {
  try {
    res.json(await saveProject(req.params.id, req.body));
  } catch (error) {
    next(error);
  }
});

projectRouter.delete("/:id", async (req, res, next) => {
  try {
    await deleteProject(req.params.id);
    res.status(204).end();
  } catch (error) {
    next(error);
  }
});
