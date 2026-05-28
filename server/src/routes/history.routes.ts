import { Router } from "express";
import { deleteHistory, listHistory } from "../services/history.service.js";

export const historyRouter = Router();

historyRouter.get("/", async (_req, res, next) => {
  try {
    res.json(await listHistory());
  } catch (error) {
    next(error);
  }
});

historyRouter.delete("/:id", async (req, res, next) => {
  try {
    await deleteHistory(req.params.id);
    res.status(204).end();
  } catch (error) {
    next(error);
  }
});
