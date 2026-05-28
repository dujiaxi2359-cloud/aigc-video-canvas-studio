import { api } from "./api";
import type { GenerationHistory } from "../types/history";

export const historyApi = {
  list: () => api.get<GenerationHistory[]>("/api/history"),
  remove: (id: string) => api.delete(`/api/history/${id}`)
};
