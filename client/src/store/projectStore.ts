import { create } from "zustand";
import type { Edge, Node } from "reactflow";
import { projectApi } from "../services/projectApi";
import type { Project, ProjectFolder, ProjectMeta } from "../types/project";

const legacyWorkspaceStorageKey = "aigcnong-workspace-v1";

function workspaceStorageKey() {
  if (typeof window === "undefined") return legacyWorkspaceStorageKey;
  const workspaceId = window.localStorage.getItem("aigcnong-active-workspace");
  return workspaceId ? `${legacyWorkspaceStorageKey}:${workspaceId}` : legacyWorkspaceStorageKey;
}

function readWorkspaceState(): { folders: ProjectFolder[]; projectMeta: Record<string, ProjectMeta> } {
  if (typeof window === "undefined") return { folders: [], projectMeta: {} };
  try {
    const storageKey = workspaceStorageKey();
    const storedValue = window.localStorage.getItem(storageKey)
      ?? (storageKey !== legacyWorkspaceStorageKey ? window.localStorage.getItem(legacyWorkspaceStorageKey) : null);
    const value = JSON.parse(storedValue || "{}") as Partial<{ folders: ProjectFolder[]; projectMeta: Record<string, ProjectMeta> }>;
    return { folders: value.folders ?? [], projectMeta: value.projectMeta ?? {} };
  } catch {
    return { folders: [], projectMeta: {} };
  }
}

function persistWorkspaceState(folders: ProjectFolder[], projectMeta: Record<string, ProjectMeta>) {
  if (typeof window !== "undefined") window.localStorage.setItem(workspaceStorageKey(), JSON.stringify({ folders, projectMeta }));
}

const savedWorkspace = readWorkspaceState();

type State = {
  currentProject?: Project;
  projects: Project[];
  folders: ProjectFolder[];
  projectMeta: Record<string, ProjectMeta>;
  fetchProjects: () => Promise<void>;
  createProject: (name?: string, folderId?: string) => Promise<Project>;
  saveProject: (nodes: Node[], edges: Edge[]) => Promise<void>;
  loadProject: (id: string) => Promise<Project>;
  renameProject: (id: string, name: string) => Promise<void>;
  duplicateProject: (id: string) => Promise<Project>;
  deleteProject: (id: string) => Promise<void>;
  createFolder: (name: string) => ProjectFolder;
  renameFolder: (id: string, name: string) => void;
  deleteFolder: (id: string) => void;
  moveProject: (projectId: string, folderId?: string) => void;
  toggleFavorite: (projectId: string) => void;
  setArchived: (projectId: string, archived: boolean) => void;
};

export const useProjectStore = create<State>((set, get) => ({
  projects: [],
  folders: savedWorkspace.folders,
  projectMeta: savedWorkspace.projectMeta,
  fetchProjects: async () => set({ projects: await projectApi.list() }),
  createProject: async (name = "未命名项目", folderId) => {
    const project = await projectApi.create(name);
    if (folderId) {
      const projectMeta = { ...get().projectMeta, [project.id]: { ...get().projectMeta[project.id], folderId } };
      persistWorkspaceState(get().folders, projectMeta);
      set({ currentProject: project, projectMeta });
    } else {
      set({ currentProject: project });
    }
    await get().fetchProjects();
    return project;
  },
  saveProject: async (nodes, edges) => {
    let project = get().currentProject;
    if (!project) project = await get().createProject("Moon｜Tv 视频工作流");
    const saved = await projectApi.save({ ...project, nodes, edges });
    set((state) => ({
      currentProject: saved,
      projects: state.projects.some((item) => item.id === saved.id)
        ? state.projects.map((item) => item.id === saved.id ? saved : item).sort((a, b) => b.updatedAt - a.updatedAt)
        : [saved, ...state.projects]
    }));
  },
  loadProject: async (id) => {
    const project = await projectApi.get(id);
    set({ currentProject: project });
    return project;
  },
  renameProject: async (id, name) => {
    const project = get().projects.find((item) => item.id === id) ?? (get().currentProject?.id === id ? get().currentProject : undefined);
    if (!project) return;
    const saved = await projectApi.save({ ...project, name: name.trim() || "未命名项目" });
    set((state) => ({
      currentProject: state.currentProject?.id === id ? saved : state.currentProject,
      projects: state.projects.map((item) => item.id === id ? saved : item)
    }));
  },
  duplicateProject: async (id) => {
    const source = get().projects.find((item) => item.id === id) ?? await projectApi.get(id);
    const created = await projectApi.create(`${source.name || "未命名项目"} 副本`);
    const duplicated = await projectApi.save({ ...created, nodes: source.nodes, edges: source.edges });
    const sourceMeta = get().projectMeta[id];
    if (sourceMeta) {
      const projectMeta = { ...get().projectMeta, [duplicated.id]: { ...sourceMeta, isArchived: false } };
      persistWorkspaceState(get().folders, projectMeta);
      set({ projectMeta });
    }
    await get().fetchProjects();
    return duplicated;
  },
  deleteProject: async (id) => {
    await projectApi.remove(id);
    const projectMeta = { ...get().projectMeta };
    delete projectMeta[id];
    persistWorkspaceState(get().folders, projectMeta);
    set((state) => ({
      currentProject: state.currentProject?.id === id ? undefined : state.currentProject,
      projects: state.projects.filter((project) => project.id !== id),
      projectMeta
    }));
  },
  createFolder: (name) => {
    const now = Date.now();
    const folder: ProjectFolder = { id: `folder-${now}-${Math.random().toString(36).slice(2, 7)}`, name: name.trim() || "新建文件夹", createdAt: now, updatedAt: now, sortOrder: get().folders.length };
    const folders = [...get().folders, folder];
    persistWorkspaceState(folders, get().projectMeta);
    set({ folders });
    return folder;
  },
  renameFolder: (id, name) => {
    const folders = get().folders.map((folder) => folder.id === id ? { ...folder, name: name.trim() || folder.name, updatedAt: Date.now() } : folder);
    persistWorkspaceState(folders, get().projectMeta);
    set({ folders });
  },
  deleteFolder: (id) => {
    const folders = get().folders.filter((folder) => folder.id !== id);
    const projectMeta = Object.fromEntries(Object.entries(get().projectMeta).map(([projectId, meta]) => [projectId, meta.folderId === id ? { ...meta, folderId: undefined } : meta]));
    persistWorkspaceState(folders, projectMeta);
    set({ folders, projectMeta });
  },
  moveProject: (projectId, folderId) => {
    const projectMeta = { ...get().projectMeta, [projectId]: { ...get().projectMeta[projectId], folderId } };
    persistWorkspaceState(get().folders, projectMeta);
    set({ projectMeta });
  },
  toggleFavorite: (projectId) => {
    const current = get().projectMeta[projectId];
    const projectMeta = { ...get().projectMeta, [projectId]: { ...current, isFavorite: !current?.isFavorite } };
    persistWorkspaceState(get().folders, projectMeta);
    set({ projectMeta });
  },
  setArchived: (projectId, isArchived) => {
    const projectMeta = { ...get().projectMeta, [projectId]: { ...get().projectMeta[projectId], isArchived } };
    persistWorkspaceState(get().folders, projectMeta);
    set({ projectMeta });
  }
}));
