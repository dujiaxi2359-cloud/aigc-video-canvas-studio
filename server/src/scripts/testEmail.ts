import path from "node:path";
import dotenv from "dotenv";
import nodemailer from "nodemailer";
import { configuredMailProfiles } from "../services/auth.service.js";

dotenv.config({ path: path.resolve(process.cwd(), ".env") });
dotenv.config({ path: path.resolve(process.cwd(), "../.env") });

const recipient = process.argv.find((arg) => !arg.startsWith("--") && arg.includes("@"))?.trim();
const providerArg = process.argv.find((arg) => arg.startsWith("--provider="));
const provider = providerArg?.split("=")[1]?.trim().toLowerCase() || "primary";

if (!recipient || !/^\S+@\S+\.\S+$/.test(recipient)) {
  throw new Error("用法: npm run test:email -- user@example.com [--provider=primary|qq|gmail|all]");
}

const profiles = configuredMailProfiles().filter((profile) => provider === "all" || profile.id === provider);
if (!profiles.length) throw new Error(`没有找到 ${provider} 邮件配置。请检查 .env 中的 SMTP_* / SMTP_QQ_* / SMTP_GMAIL_*。`);

for (const profile of profiles) {
  const transport = nodemailer.createTransport({
    host: profile.host,
    port: profile.port,
    secure: profile.port === 465,
    auth: profile.user && profile.pass ? { user: profile.user, pass: profile.pass } : undefined
  });
  await transport.verify();
  const result = await transport.sendMail({
    from: profile.from,
    to: recipient,
    subject: `AIGCNONG 邮件服务测试成功 (${profile.id})`,
    text: `AIGCNONG 已成功连接 ${profile.id} SMTP 邮件服务。登录验证码可以正常发送。`,
    html: `<div style="font-family:Arial,sans-serif;line-height:1.6"><h2>AIGCNONG 邮件服务测试成功</h2><p>已成功连接 ${profile.id} SMTP 邮件服务，登录验证码可以正常发送。</p></div>`
  });
  console.log(`SMTP ${profile.id} verification passed. Test email sent to ${recipient}. Message ID: ${result.messageId}`);
}
