import { Router } from "express";
import { authCookie, listUserWorkspaces, requestLoginCode, revokeSession, verifyLoginCode } from "../services/auth.service.js";
import { optionalAuth, requireLogin } from "../middleware/auth.js";

export const authRouter = Router();

authRouter.post("/request-code", async (req, res) => {
  try { res.json(await requestLoginCode(String(req.body?.email || ""), req.ip || req.socket.remoteAddress || "unknown")); }
  catch (error) {
    const code = error instanceof Error ? error.message : "AUTH_ERROR";
    const errors: Record<string, { status: number; message: string }> = {
      TOO_MANY_CODES: { status: 429, message: "验证码发送过于频繁，请稍后重试。" },
      INVALID_EMAIL: { status: 400, message: "请输入有效邮箱。" },
      EMAIL_NOT_CONFIGURED: { status: 503, message: "邮件服务尚未配置，请联系管理员。" },
      EMAIL_SEND_FAILED: { status: 502, message: "验证码邮件发送失败，请稍后重试。" }
    };
    const mapped = errors[code] || { status: 500, message: "验证码发送失败。" };
    res.status(mapped.status).json({ errorCode: code, errorMessage: mapped.message });
  }
});

authRouter.post("/verify-code", async (req, res) => {
  try {
    const result = await verifyLoginCode(String(req.body?.email || ""), String(req.body?.code || ""));
    res.cookie(authCookie.name, result.token, { httpOnly: true, sameSite: "lax", secure: process.env.NODE_ENV === "production", maxAge: authCookie.maxAge, path: "/" });
    res.json({ user: result.user, workspaces: result.workspaces, expiresAt: result.expiresAt });
  } catch { res.status(400).json({ errorCode: "INVALID_CODE", errorMessage: "验证码无效或已过期。" }); }
});

authRouter.get("/me", optionalAuth, async (req, res) => {
  if (!req.auth) return res.status(401).json({ errorCode: "AUTH_REQUIRED", errorMessage: "请先登录。" });
  res.json({ user: req.auth.user, workspaces: await listUserWorkspaces(req.auth.user.id) });
});

authRouter.post("/logout", requireLogin, async (req, res) => {
  await revokeSession(req.auth!.sessionId);
  res.clearCookie(authCookie.name, { path: "/" });
  res.status(204).end();
});
