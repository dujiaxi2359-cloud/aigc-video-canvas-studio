import type { NextFunction, Request, Response } from "express";
import { authCookie, getWorkspaceForUser, sessionFromToken } from "../services/auth.service.js";
import { runWithRequestContext } from "../services/requestContext.js";
import { getDb } from "../db/database.js";
import { verifyAssetUrlSignature } from "../utils/assetAccessToken.js";

function cookieValue(req: Request, name: string) {
  const cookies = String(req.headers.cookie || "").split(";");
  for (const cookie of cookies) {
    const [key, ...value] = cookie.trim().split("=");
    if (key === name) return decodeURIComponent(value.join("="));
  }
  return undefined;
}

export async function optionalAuth(req: Request, _res: Response, next: NextFunction) {
  const session = await sessionFromToken(cookieValue(req, authCookie.name));
  if (session) req.auth = { user: session.user, sessionId: session.sessionId };
  next();
}

export async function requireLogin(req: Request, res: Response, next: NextFunction) {
  await optionalAuth(req, res, () => undefined);
  if (!req.auth) return res.status(401).json({ errorCode: "AUTH_REQUIRED", errorMessage: "请先登录。" });
  next();
}

export async function requireActiveWorkspace(req: Request, res: Response, next: NextFunction) {
  await requireLogin(req, res, () => undefined);
  if (!req.auth) return;
  if (req.auth.user.inviteStatus !== "active" || req.auth.user.status !== "active") return res.status(403).json({ errorCode: "INVITE_REQUIRED", errorMessage: "请先使用邀请码激活账号。" });
  const requestedWorkspaceId = String(req.headers["x-workspace-id"] || req.query.workspaceId || req.body?.workspaceId || "");
  const workspace = await getWorkspaceForUser(req.auth.user, requestedWorkspaceId || undefined);
  if (!workspace || (requestedWorkspaceId && workspace.id !== requestedWorkspaceId)) return res.status(403).json({ errorCode: "WORKSPACE_FORBIDDEN", errorMessage: "无权访问该工作空间。" });
  req.auth.workspace = workspace;
  runWithRequestContext({ user: req.auth.user, workspace }, next);
}

export function requireAdmin(req: Request, res: Response, next: NextFunction) {
  if (!req.auth || !["super_admin", "admin"].includes(req.auth.user.role)) return res.status(403).json({ errorCode: "ADMIN_REQUIRED", errorMessage: "需要管理员权限。" });
  next();
}

export function requireWorkspaceManager(req: Request, res: Response, next: NextFunction) {
  if (!req.auth?.workspace) return res.status(403).json({ errorCode: "WORKSPACE_REQUIRED", errorMessage: "请选择工作空间。" });
  if (["admin", "super_admin"].includes(req.auth.user.role) || ["owner", "admin"].includes(req.auth.workspace.role)) return next();
  return res.status(403).json({ errorCode: "WORKSPACE_MANAGER_REQUIRED", errorMessage: "只有空间所有者或管理员可以管理 API 配置。" });
}

export async function requireAssetFileAccess(req: Request, res: Response, next: NextFunction) {
  if (verifyAssetUrlSignature(`${req.baseUrl}${req.path}`, req.query.asset_expires, req.query.asset_signature)) return next();
  await requireLogin(req, res, () => undefined);
  if (!req.auth) return;
  const assetUrl = `${req.baseUrl}${req.path}`;
  const db = await getDb();
  const asset = await db.get<{ workspace_id?: string }>("SELECT workspace_id FROM assets WHERE deleted_at IS NULL AND (url = ? OR public_url = ? OR thumbnail_path = ?) LIMIT 1", assetUrl, assetUrl, assetUrl);
  if (!asset?.workspace_id) return res.status(404).json({ errorCode: "ASSET_NOT_FOUND", errorMessage: "素材不存在。" });
  const membership = await db.get("SELECT id FROM workspace_members WHERE workspace_id = ? AND user_id = ? AND status = 'active'", asset.workspace_id, req.auth.user.id);
  if (!membership && !["admin", "super_admin"].includes(req.auth.user.role)) return res.status(404).json({ errorCode: "ASSET_NOT_FOUND", errorMessage: "素材不存在。" });
  next();
}
