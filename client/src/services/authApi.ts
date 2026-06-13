import { api } from "./api";
import type { AuthUser, AuthWorkspace } from "../types/auth";

export type AuthStatePayload = { user: AuthUser; workspaces: AuthWorkspace[] };

export const authApi = {
  requestCode: (email: string) => api.post<{ ok: boolean; delivery: string; expiresIn: number }>("/api/auth/request-code", { email }),
  verifyCode: (email: string, code: string) => api.post<AuthStatePayload>("/api/auth/verify-code", { email, code }),
  me: () => api.get<AuthStatePayload>("/api/auth/me"),
  logout: () => api.post<void>("/api/auth/logout"),
  verifyInvite: (code: string) => api.post<{ active: boolean; workspaces: AuthWorkspace[] }>("/api/invite/verify", { code })
};
