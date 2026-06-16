import { signedAssetUrl, verifyAssetUrlSignature } from "../utils/assetAccessToken.js";

function assert(condition: unknown, message: string): asserts condition {
  if (!condition) throw new Error(message);
}

const signed = new URL(signedAssetUrl("https://assets.example.com/uploads/assets/images/test.png", 60));
assert(signed.searchParams.has("asset_expires"), "Signed asset URL should include expiry");
assert(signed.searchParams.has("asset_signature"), "Signed asset URL should include signature");
assert(verifyAssetUrlSignature(signed.pathname, signed.searchParams.get("asset_expires"), signed.searchParams.get("asset_signature")), "Valid signed asset URL should verify");
assert(!verifyAssetUrlSignature("/uploads/assets/images/other.png", signed.searchParams.get("asset_expires"), signed.searchParams.get("asset_signature")), "Signature must be bound to the asset path");
assert(!verifyAssetUrlSignature(signed.pathname, "1", signed.searchParams.get("asset_signature")), "Expired asset URL should fail");

console.log("[test:asset-access-token] ok");
