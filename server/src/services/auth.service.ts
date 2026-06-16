import crypto from "node:crypto";
import dns from "node:dns";
import net from "node:net";
import nodemailer from "nodemailer";
import { getDb } from "../db/database.js";
import type { AuthUser, AuthWorkspace } from "../types/auth.js";
import { createId } from "../utils/id.js";
import { now } from "../utils/time.js";

const SESSION_TTL = 30 * 24 * 60 * 60 * 1000;
const CODE_TTL = 10 * 60 * 1000;
dns.setDefaultResultOrder("ipv4first");
type MailProfile = {
  id: string;
  host: string;
  port: number;
  from: string;
  user?: string;
  pass?: string;
};

const mailTransports = new Map<string, nodemailer.Transporter>();

function secret() {
  return process.env.AUTH_SECRET || process.env.APP_SECRET || "development-auth-secret";
}

function hash(value: string) {
  return crypto.createHmac("sha256", secret()).update(value).digest("hex");
}

function normalizeEmail(email: string) {
  const value = email.trim().toLowerCase();
  if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(value)) throw new Error("INVALID_EMAIL");
  return value;
}

function toUser(row: any): AuthUser {
  return { id: row.id, email: row.email, name: row.name || undefined, role: row.role, status: row.status, inviteStatus: row.invite_status, defaultWorkspaceId: row.default_workspace_id || undefined };
}

export async function listUserWorkspaces(userId: string): Promise<AuthWorkspace[]> {
  const db = await getDb();
  const rows = await db.all<any[]>(`SELECT w.*, wm.role AS member_role, COALESCE(cb.balance, 0) AS credits
    FROM workspace_members wm JOIN workspaces w ON w.id = wm.workspace_id
    LEFT JOIN credit_balances cb ON cb.workspace_id = w.id
    WHERE wm.user_id = ? AND wm.status = 'active' ORDER BY w.type ASC, w.created_at ASC`, userId);
  return rows.map((row) => ({ id: row.id, name: row.name, slug: row.slug, type: row.type, role: row.member_role, planId: row.plan_id || undefined, billingStatus: row.billing_status, credits: Number(row.credits || 0) }));
}

function mailProfile(id: string, prefix: string): MailProfile | undefined {
  const host = process.env[`${prefix}HOST`]?.trim();
  const from = process.env[`${prefix}FROM`]?.trim();
  const user = process.env[`${prefix}USER`]?.trim();
  const pass = process.env[`${prefix}PASS`]?.trim();
  if (!host && !from && !user && !pass) return undefined;
  if (!host || !from || (user && !pass) || (!user && pass)) throw new Error("EMAIL_NOT_CONFIGURED");
  return { id, host, port: Number(process.env[`${prefix}PORT`] || 587), from, user, pass };
}

export function configuredMailProfiles() {
  return [
    mailProfile("primary", "SMTP_"),
    mailProfile("qq", "SMTP_QQ_"),
    mailProfile("gmail", "SMTP_GMAIL_"),
    mailProfile("fallback", "SMTP_FALLBACK_")
  ].filter(Boolean) as MailProfile[];
}

function profilesForRecipient(email: string) {
  const profiles = configuredMailProfiles();
  const domain = email.split("@")[1] || "";
  const preferredProfile = domain === "gmail.com" || domain === "googlemail.com"
    ? "gmail"
    : domain === "qq.com"
      ? "qq"
      : "primary";
  const preferred = profiles.find((profile) => profile.id === preferredProfile);
  return [
    ...(preferred ? [preferred] : []),
    ...profiles.filter((profile) => profile.id !== preferredProfile)
  ];
}

async function addressesForProfile(profile: MailProfile) {
  if (net.isIP(profile.host)) return [profile.host];
  if (profile.id === "gmail") {
    const lookups = await Promise.allSettled(["1.1.1.1", "8.8.8.8"].map(async (server) => {
      const resolver = new dns.promises.Resolver();
      resolver.setServers([server]);
      return resolver.resolve4(profile.host);
    }));
    const addresses = lookups.flatMap((result) => result.status === "fulfilled" ? result.value : []);
    if (addresses.length) return [...new Set(addresses)];
  }
  return [(await dns.promises.lookup(profile.host, { family: 4 })).address];
}

function transportFor(profile: MailProfile, address: string) {
  const key = `${profile.id}:${address}:${profile.port}:${profile.user || ""}`;
  const existing = mailTransports.get(key);
  if (existing) return existing;
  const transport = nodemailer.createTransport({
    host: address,
    port: profile.port,
    secure: profile.port === 465,
    connectionTimeout: 10_000,
    greetingTimeout: 10_000,
    socketTimeout: 20_000,
    tls: { servername: profile.host },
    auth: profile.user && profile.pass ? { user: profile.user, pass: profile.pass } : undefined
  });
  mailTransports.set(key, transport);
  return transport;
}

async function sendLoginCode(email: string, code: string) {
  const profiles = profilesForRecipient(email);
  if (profiles.length) {
    let failed = false;
    for (const profile of profiles) {
      let addresses: string[] = [];
      try {
        addresses = await addressesForProfile(profile);
      } catch (error) {
        failed = true;
        console.error(`[auth:email-resolve-failed:${profile.id}]`, error instanceof Error ? error.message : error);
        continue;
      }

      for (const address of addresses) {
        try {
          await transportFor(profile, address).sendMail({
            from: profile.from,
            to: email,
            subject: "AIGCNONG 登录验证码",
            text: `你的登录验证码是 ${code}，10 分钟内有效。请勿将验证码转发给他人。`,
            html: `<div style="font-family:Arial,sans-serif;color:#161616;line-height:1.6"><h2>AIGCNONG 登录验证</h2><p>你的登录验证码是：</p><p style="font-size:30px;font-weight:700;letter-spacing:8px">${code}</p><p>验证码 10 分钟内有效，请勿转发给他人。</p></div>`
          });
          return { delivery: `smtp:${profile.id}` as const };
        } catch (error) {
          failed = true;
          console.error(`[auth:email-send-failed:${profile.id}:${address}]`, error instanceof Error ? error.message : error);
        }
      }
    }
    if (failed) throw new Error("EMAIL_SEND_FAILED");
  }
  if (process.env.AUTH_ALLOW_MOCK_EMAIL === "true" && process.env.NODE_ENV !== "production") {
    console.log(`[auth:mock-email] ${email} login code: ${code}`);
    return { delivery: "mock" as const };
  }
  throw new Error("EMAIL_NOT_CONFIGURED");
}

export async function requestLoginCode(rawEmail: string, ip: string) {
  const email = normalizeEmail(rawEmail);
  const db = await getDb();
  const recent = await db.get<{ count: number }>("SELECT COUNT(*) AS count FROM auth_codes WHERE email = ? AND created_at > ?", email, now() - 60_000);
  if ((recent?.count || 0) >= 3) throw new Error("TOO_MANY_CODES");
  const code = String(crypto.randomInt(100000, 999999));
  const codeId = createId("code");
  await db.run("INSERT INTO auth_codes (id, email, code_hash, attempts, expires_at, created_at) VALUES (?, ?, ?, 0, ?, ?)", codeId, email, hash(`${email}:${code}`), now() + CODE_TTL, now());
  try {
    const delivery = await sendLoginCode(email, code);
    return { ok: true, expiresIn: CODE_TTL / 1000, delivery: delivery.delivery, requestIp: ip };
  } catch (error) {
    await db.run("DELETE FROM auth_codes WHERE id = ?", codeId);
    throw error;
  }
}

export async function verifyLoginCode(rawEmail: string, code: string) {
  const email = normalizeEmail(rawEmail);
  const db = await getDb();
  const record = await db.get<any>("SELECT * FROM auth_codes WHERE email = ? AND consumed_at IS NULL ORDER BY created_at DESC LIMIT 1", email);
  if (!record || record.expires_at < now() || record.attempts >= 5) throw new Error("INVALID_CODE");
  if (!crypto.timingSafeEqual(Buffer.from(record.code_hash), Buffer.from(hash(`${email}:${code.trim()}`)))) {
    await db.run("UPDATE auth_codes SET attempts = attempts + 1 WHERE id = ?", record.id);
    throw new Error("INVALID_CODE");
  }
  await db.run("UPDATE auth_codes SET consumed_at = ? WHERE id = ?", now(), record.id);
  let userRow = await db.get<any>("SELECT * FROM users WHERE email = ?", email);
  if (!userRow) {
    const id = createId("user");
    const bootstrapAdminEmail = process.env.BOOTSTRAP_ADMIN_EMAIL?.trim().toLowerCase();
    const role = bootstrapAdminEmail && email === bootstrapAdminEmail ? "super_admin" : "user";
    await db.run("INSERT INTO users (id, email, name, role, status, invite_status, created_at, updated_at) VALUES (?, ?, ?, ?, 'pending', 'pending', ?, ?)", id, email, email.split("@")[0], role, now(), now());
    userRow = await db.get("SELECT * FROM users WHERE id = ?", id);
  }
  if (userRow.status === "blocked") throw new Error("ACCOUNT_BLOCKED");
  await db.run("UPDATE users SET last_login_at = ?, updated_at = ? WHERE id = ?", now(), now(), userRow.id);
  const token = crypto.randomBytes(32).toString("base64url");
  const sessionId = createId("session");
  await db.run("INSERT INTO sessions (id, user_id, token_hash, expires_at, created_at, last_seen_at) VALUES (?, ?, ?, ?, ?, ?)", sessionId, userRow.id, hash(token), now() + SESSION_TTL, now(), now());
  return { token, expiresAt: now() + SESSION_TTL, user: toUser(userRow), workspaces: await listUserWorkspaces(userRow.id) };
}

export async function sessionFromToken(token?: string) {
  if (!token) return undefined;
  const db = await getDb();
  const row = await db.get<any>(`SELECT s.id AS session_id, s.expires_at, u.* FROM sessions s JOIN users u ON u.id = s.user_id
    WHERE s.token_hash = ? AND s.revoked_at IS NULL`, hash(token));
  if (!row || row.expires_at < now() || row.status === "blocked") return undefined;
  await db.run("UPDATE sessions SET last_seen_at = ? WHERE id = ?", now(), row.session_id);
  return { sessionId: row.session_id, user: toUser(row) };
}

export async function revokeSession(sessionId: string) {
  const db = await getDb();
  await db.run("UPDATE sessions SET revoked_at = ? WHERE id = ?", now(), sessionId);
}

function workspaceSlug(email: string) {
  return `${email.split("@")[0].replace(/[^a-z0-9]+/gi, "-").toLowerCase() || "personal"}-${crypto.randomBytes(3).toString("hex")}`;
}

export async function activateInvite(user: AuthUser, rawCode: string) {
  const db = await getDb();
  if (user.inviteStatus === "active") return listUserWorkspaces(user.id);
  const code = rawCode.trim().toUpperCase();
  if (!code) throw new Error("INVITE_REQUIRED");
  await db.transaction(async () => {
    const invite = await db.get<any>("SELECT * FROM invite_codes WHERE code = ?", code);
    if (!invite || invite.status !== "active") throw new Error("INVITE_INVALID");
    if (invite.expires_at && invite.expires_at < now()) throw new Error("INVITE_EXPIRED");
    if (invite.used_count >= invite.max_uses) throw new Error("INVITE_EXHAUSTED");
    let personal = await db.get<any>("SELECT * FROM workspaces WHERE owner_user_id = ? AND type = 'personal'", user.id);
    if (!personal) {
      const workspaceId = createId("workspace");
      await db.run("INSERT INTO workspaces (id, name, slug, type, owner_user_id, billing_status, created_at, updated_at) VALUES (?, ?, ?, 'personal', ?, 'free', ?, ?)", workspaceId, `${user.email.split("@")[0]} 的个人空间`, workspaceSlug(user.email), user.id, now(), now());
      await db.run("INSERT INTO workspace_members (id, workspace_id, user_id, role, status, joined_at, created_at, updated_at) VALUES (?, ?, ?, 'owner', 'active', ?, ?, ?)", createId("member"), workspaceId, user.id, now(), now(), now());
      await db.run("INSERT INTO credit_balances (id, workspace_id, balance, updated_at) VALUES (?, ?, ?, ?)", createId("credits"), workspaceId, Number(process.env.INITIAL_FREE_CREDITS || 100), now());
      personal = { id: workspaceId };
    }
    if (invite.target_workspace_id) {
      await db.run("INSERT OR IGNORE INTO workspace_members (id, workspace_id, user_id, role, status, joined_at, created_at, updated_at) VALUES (?, ?, ?, ?, 'active', ?, ?, ?)", createId("member"), invite.target_workspace_id, user.id, invite.member_role || "member", now(), now(), now());
    }
    await db.run("INSERT INTO user_invites (id, user_id, invite_code_id, workspace_id, code, used_at, created_at) VALUES (?, ?, ?, ?, ?, ?, ?)", createId("user_invite"), user.id, invite.id, invite.target_workspace_id, code, now(), now());
    await db.run("UPDATE invite_codes SET used_count = used_count + 1, updated_at = ? WHERE id = ? AND used_count < max_uses", now(), invite.id);
    await db.run("UPDATE users SET status = 'active', invite_status = 'active', default_workspace_id = ?, updated_at = ? WHERE id = ?", personal.id, now(), user.id);
    await db.run("UPDATE projects SET workspace_id = ?, owner_user_id = ? WHERE workspace_id IS NULL", personal.id, user.id);
    await db.run("UPDATE assets SET workspace_id = ?, owner_user_id = ? WHERE workspace_id IS NULL", personal.id, user.id);
    await db.run("UPDATE asset_folders SET workspace_id = ? WHERE workspace_id IS NULL", personal.id);
    await db.run("UPDATE generation_history SET workspace_id = ?, user_id = ? WHERE workspace_id IS NULL", personal.id, user.id);
  });
  return listUserWorkspaces(user.id);
}

export async function getWorkspaceForUser(user: AuthUser, workspaceId?: string) {
  const workspaces = await listUserWorkspaces(user.id);
  return workspaces.find((workspace) => workspace.id === workspaceId) || workspaces.find((workspace) => workspace.id === user.defaultWorkspaceId) || workspaces[0];
}

export const authCookie = { name: "aigcnong_session", maxAge: SESSION_TTL };
