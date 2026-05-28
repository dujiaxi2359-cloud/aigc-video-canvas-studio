import crypto from "node:crypto";

const algorithm = "aes-256-gcm";

let warned = false;

function getKey() {
  const secret = process.env.APP_SECRET;
  if (!secret || secret === "replace-with-a-long-random-secret") {
    if (!warned) {
      console.warn("APP_SECRET is not set. Using a development-only fallback secret; set APP_SECRET before real use.");
      warned = true;
    }
    return crypto.createHash("sha256").update("development-only-aigc-video-canvas-studio-secret").digest();
  }
  return crypto.createHash("sha256").update(secret).digest();
}

export function encryptApiKey(apiKey: string) {
  const iv = crypto.randomBytes(12);
  const cipher = crypto.createCipheriv(algorithm, getKey(), iv);
  const encrypted = Buffer.concat([cipher.update(apiKey, "utf8"), cipher.final()]);
  const tag = cipher.getAuthTag();
  return `${iv.toString("hex")}:${tag.toString("hex")}:${encrypted.toString("hex")}`;
}

export function decryptApiKey(encryptedApiKey: string) {
  const [ivHex, tagHex, encryptedHex] = encryptedApiKey.split(":");
  const decipher = crypto.createDecipheriv(algorithm, getKey(), Buffer.from(ivHex, "hex"));
  decipher.setAuthTag(Buffer.from(tagHex, "hex"));
  return Buffer.concat([
    decipher.update(Buffer.from(encryptedHex, "hex")),
    decipher.final()
  ]).toString("utf8");
}

export function maskApiKey(apiKey?: string) {
  if (!apiKey) return undefined;
  if (apiKey.length <= 8) return "********";
  const prefix = apiKey.startsWith("sk-") ? "sk-" : apiKey.slice(0, 3);
  const suffix = apiKey.slice(-4);
  return `${prefix}************${suffix}`;
}

export function maskEncryptedApiKey(encryptedApiKey?: string) {
  if (!encryptedApiKey) return undefined;
  try {
    return maskApiKey(decryptApiKey(encryptedApiKey));
  } catch {
    return "********";
  }
}
