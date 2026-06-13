export type AuthUser = {
  id: string;
  email: string;
  name?: string;
  role: "super_admin" | "admin" | "user";
  status: "pending" | "active" | "blocked";
  inviteStatus: "pending" | "active";
  defaultWorkspaceId?: string;
};

export type AuthWorkspace = {
  id: string;
  name: string;
  slug: string;
  type: "personal" | "team";
  role: "owner" | "admin" | "member" | "viewer";
  planId?: string;
  billingStatus: string;
  credits: number;
};

declare global {
  namespace Express {
    interface Request {
      auth?: { user: AuthUser; sessionId: string; workspace?: AuthWorkspace };
    }
  }
}

export {};
