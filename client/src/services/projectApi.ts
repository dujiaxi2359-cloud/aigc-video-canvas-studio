import { api, apiUrl } from "./api";
import type { Project } from "../types/project";

export const projectApi = {
  list: () => api.get<Project[]>("/api/projects"),
  create: (name: string) => api.post<Project>("/api/projects", { name }),
  get: (id: string) => api.get<Project>(`/api/projects/${id}`),
  save: (project: Project) => api.put<Project>(`/api/projects/${project.id}`, project),
  saveOnExit: (project: Project) => {
    const body = JSON.stringify(project);
    const url = apiUrl(`/api/projects/${project.id}/autosave`);
    if (typeof navigator !== "undefined" && navigator.sendBeacon) {
      return navigator.sendBeacon(url, new Blob([body], { type: "application/json" }));
    }
    void fetch(url, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body,
      keepalive: true
    });
    return true;
  },
  remove: (id: string) => api.delete(`/api/projects/${id}`)
};
