import fs from "node:fs";
import path from "node:path";
import { readGeneratedFileMetadata } from "../../utils/mediaMetadata.js";

const targetSizes: Record<string, { width: number; height: number }> = {
  "1:1": { width: 1024, height: 1024 },
  "3:4": { width: 1024, height: 1365 },
  "4:3": { width: 1365, height: 1024 },
  "9:16": { width: 1024, height: 1820 },
  "16:9": { width: 1820, height: 1024 }
};

function normalizeImageAspectRatio(aspectRatio?: string) {
  return targetSizes[aspectRatio ?? ""] ? aspectRatio! : "1:1";
}

function uploadUrlFor(localPath: string) {
  const uploadRoot = path.resolve(process.cwd(), process.env.UPLOAD_DIR ?? "./uploads");
  const relative = path.relative(uploadRoot, localPath).split(path.sep).join("/");
  return relative.startsWith("..") ? undefined : `/uploads/${relative}`;
}

export async function ensureImageAspectRatio(localPath: string | undefined, aspectRatio?: string) {
  if (!localPath || !fs.existsSync(localPath)) return undefined;
  const metadata = await readGeneratedFileMetadata(localPath);
  if (!metadata.width || !metadata.height) return undefined;

  const ratio = normalizeImageAspectRatio(aspectRatio);

  return {
    localPath,
    outputUrl: uploadUrlFor(localPath),
    metadata,
    transformed: false as const,
    aspectRatio: ratio,
    fitMode: "model_native" as const
  };
}
