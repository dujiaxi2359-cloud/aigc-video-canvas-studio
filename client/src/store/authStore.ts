import { create } from "zustand";
import { authApi } from "../services/authApi";
import type { AuthUser, AuthWorkspace } from "../types/auth";

const workspaceKey = "aigcnong-active-workspace";

type State = {
  loading: boolean;
  user?: AuthUser;
  workspaces: AuthWorkspace[];
  activeWorkspaceId?: string;
  bootstrap: () => Promise<void>;
  requestCode: (email: string) => Promise<{ delivery: string }>;
  verifyCode: (email: string, code: string) => Promise<void>;
  verifyInvite: (code: string) => Promise<void>;
  selectWorkspace: (id: string) => void;
  logout: () => Promise<void>;
  clear: () => void;
};

function chooseWorkspace(user: AuthUser, workspaces: AuthWorkspace[]) {
  const saved = window.localStorage.getItem(workspaceKey);
  return workspaces.find((workspace) => workspace.id === saved)?.id || workspaces.find((workspace) => workspace.id === user.defaultWorkspaceId)?.id || workspaces[0]?.id;
}

export const useAuthStore = create<State>((set, get) => ({
  loading: true,
  workspaces: [],
  bootstrap: async () => {
    try {
      const payload = await authApi.me();
      const activeWorkspaceId = chooseWorkspace(payload.user, payload.workspaces);
      if (activeWorkspaceId) window.localStorage.setItem(workspaceKey, activeWorkspaceId);
      set({ ...payload, activeWorkspaceId, loading: false });
    } catch { set({ user: undefined, workspaces: [], activeWorkspaceId: undefined, loading: false }); }
  },
  requestCode: async (email) => {
    const result = await authApi.requestCode(email);
    return { delivery: result.delivery };
  },
  verifyCode: async (email, code) => {
    const payload = await authApi.verifyCode(email, code);
    const activeWorkspaceId = chooseWorkspace(payload.user, payload.workspaces);
    if (activeWorkspaceId) window.localStorage.setItem(workspaceKey, activeWorkspaceId);
    set({ ...payload, activeWorkspaceId, loading: false });
  },
  verifyInvite: async (code) => {
    const result = await authApi.verifyInvite(code);
    const payload = await authApi.me();
    const activeWorkspaceId = chooseWorkspace(payload.user, result.workspaces);
    if (activeWorkspaceId) window.localStorage.setItem(workspaceKey, activeWorkspaceId);
    set({ user: payload.user, workspaces: result.workspaces, activeWorkspaceId });
  },
  selectWorkspace: (id) => {
    if (!get().workspaces.some((workspace) => workspace.id === id)) return;
    window.localStorage.setItem(workspaceKey, id);
    set({ activeWorkspaceId: id });
    window.dispatchEvent(new CustomEvent("workspace:changed", { detail: id }));
  },
  logout: async () => {
    await authApi.logout().catch(() => undefined);
    window.localStorage.removeItem(workspaceKey);
    set({ user: undefined, workspaces: [], activeWorkspaceId: undefined });
  },
  clear: () => set({ user: undefined, workspaces: [], activeWorkspaceId: undefined, loading: false })
}));
