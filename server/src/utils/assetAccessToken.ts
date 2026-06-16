import { createHmac, timingSafeEqual } from "node:crypto";

const defaultExpirySeconds = Number(process.env.ASSET_URL_EXPIRES_SECONDS || 30 * 60);

function signingSecret() {
  return process.env.ASSET_URL_SIGNING_SECRET || process.env.APP_SECRET || "development-asset-url-secret";
}

function signature(pathname: string, expiresAt: number) {
  return createHmac("sha256", signingSecret()).update(`${pathname}\n${expiresAt}`).digest("hex");
}

export function signedAssetUrl(url: string, expiresSeconds = defaultExpirySeconds) {
  const parsed = new URL(url);
  const expiresAt = Math.floor(Date.now() / 1000) + expiresSeconds;
  parsed.searchParams.set("asset_expires", String(expiresAt));
  parsed.searchParams.set("asset_signature", signature(parsed.pathname, expiresAt));
  return parsed.toString();
}

export function verifyAssetUrlSignature(pathname: string, expiresValue: unknown, signatureValue: unknown) {
  const expiresAt = Number(expiresValue);
  const provided = typeof signatureValue === "string" ? signatureValue : "";
  if (!Number.isSafeInteger(expiresAt) || expiresAt <= Math.floor(Date.now() / 1000) || !/^[a-f0-9]{64}$/i.test(provided)) return false;
  const expected = signature(pathname, expiresAt);
  return timingSafeEqual(Buffer.from(expected, "hex"), Buffer.from(provided, "hex"));
}
