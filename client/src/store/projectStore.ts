import { create } from "zustand";
import type { Edge, Node } from "reactflow";
import { projectApi } from "../services/projectApi";
import type { Project } from "../types/project";

type State = {
  currentProject?: Project;
  projects: Project[];
  fetchProjects: () => Promise<void>;
  createProject: (name?: string) => Promise<Project>;
  saveProject: (nodes: Node[], edges: Edge[]) => Promise<void>;
  loadProject: (id: string) => Promise<Project>;
  deleteProject: (id: string) => Promise<void>;
};

export const useProjectStore = create<State>((set, get) => ({
  projects: [],
  fetchProjects: async () => set({ projects: await projectApi.list() }),
  createProject: async (name = "未命名项目") => {
    const project = await projectApi.create(name);
    set({ currentProject: project });
    await get().fetchProjects();
    return project;
  },
  saveProject: async (nodes, edges) => {
    let project = get().currentProject;
    if (!project) project = await get().createProject("AIGC 视频工作流");
    const saved = await projectApi.save({ ...project, nodes, edges });
    set({ currentProject: saved });
    await get().fetchProjects();
  },
  loadProject: async (id) => {
    const project = await projectApi.get(id);
    set({ currentProject: project });
    return project;
  },
  deleteProject: async (id) => {
    await projectApi.remove(id);
    await get().fetchProjects();
  }
}));
