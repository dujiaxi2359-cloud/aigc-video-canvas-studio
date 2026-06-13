import { Router } from "express";
import { requireLogin } from "../middleware/auth.js";
import { activateInvite } from "../services/auth.service.js";

export const inviteRouter = Router();
inviteRouter.post("/verify", requireLogin, async (req, res) => {
  try { res.json({ active: true, workspaces: await activateInvite(req.auth!.user, String(req.body?.code || "")) }); }
  catch (error) {
    const code = error instanceof Error ? error.message : "INVITE_INVALID";
    const messages: Record<string, string> = { INVITE_REQUIRED: "请输入邀请码。", INVITE_INVALID: "邀请码不存在或已停用。", INVITE_EXPIRED: "邀请码已过期。", INVITE_EXHAUSTED: "邀请码使用次数已达上限。" };
    res.status(400).json({ errorCode: code, errorMessage: messages[code] || "邀请码验证失败。" });
  }
});
