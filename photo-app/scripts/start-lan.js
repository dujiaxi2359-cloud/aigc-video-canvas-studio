const fs = require("node:fs");
const path = require("node:path");

const root = path.resolve(__dirname, "..");
const envPath = path.join(root, ".env.local");
const standaloneRoot = path.join(root, ".next", "standalone");
const standaloneNext = path.join(standaloneRoot, ".next");
const sourceStatic = path.join(root, ".next", "static");
const targetStatic = path.join(standaloneNext, "static");
const sourcePublic = path.join(root, "public");
const targetPublic = path.join(standaloneRoot, "public");

if (fs.existsSync(envPath)) {
  const lines = fs.readFileSync(envPath, "utf8").split(/\r?\n/);

  for (const line of lines) {
    const trimmed = line.trim();
    if (!trimmed || trimmed.startsWith("#")) continue;

    const separator = trimmed.indexOf("=");
    if (separator === -1) continue;

    const key = trimmed.slice(0, separator).trim();
    const value = trimmed.slice(separator + 1).trim();
    if (key && process.env[key] === undefined) {
      process.env[key] = value.replace(/^["']|["']$/g, "");
    }
  }
}

process.env.HOSTNAME =
  process.env.NEXT_HOSTNAME || process.env.APP_HOST || process.env.HOST || "0.0.0.0";
process.env.PORT ||= "3000";

if (fs.existsSync(sourceStatic) && !fs.existsSync(targetStatic)) {
  fs.cpSync(sourceStatic, targetStatic, { recursive: true });
}

if (fs.existsSync(sourcePublic) && !fs.existsSync(targetPublic)) {
  fs.cpSync(sourcePublic, targetPublic, { recursive: true });
}

require(path.join(standaloneRoot, "server.js"));
