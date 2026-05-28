import { api } from "./api";
import type { Project } from "../types/project";

export const projectApi = {
  list: () => api.get<Project[]>("/api/projects"),
  create: (name: string) => api.post<Project>("/api/projects", { name }),
  get: (id: string) => api.get<Project>(`/api/projects/${id}`),
  save: (project: Project) => api.put<Project>(`/api/projects/${project.id}`, project),
  remove: (id: string) => api.delete(`/api/projects/${id}`)
};
