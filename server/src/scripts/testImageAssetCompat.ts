import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import sharp from "sharp";
import { resolveRemoteAsset } from "../services/assets/resolveRemoteAsset.service.js";

function assert(condition: unknown, message: string): asserts condition {
  if (!condition) throw new Error(message);
}

const tmp = fs.mkdtempSync(path.join(os.tmpdir(), "image-asset-compat-"));
const input = path.join(tmp, "portrait.png");
await sharp({
  create: {
    width: 900,
    height: 1600,
    channels: 3,
    background: { r: 20, g: 30, b: 40 }
  }
}).png().toFile(input);

const resolved = await resolveRemoteAsset(
  { localPath: input, filename: "portrait.png", url: "http://localhost:4000/uploads/preview.png" },
  "google",
  "veo-reference",
  { strategy: { prefer: "base64", supportsBase64: true, supportsPublicUrl: false } }
);

assert(resolved.type === "base64", "Google-compatible image input should prefer base64 for local files");
assert(resolved.source === "localPath", "model input should use local original file");
assert(resolved.width === 900 && resolved.height === 1600, "resolved metadata should reflect the real original image");
assert(resolved.aspectRatio === "9:16", "resolved aspect ratio should be true image ratio");

console.log("test:image-asset-compat ok");

