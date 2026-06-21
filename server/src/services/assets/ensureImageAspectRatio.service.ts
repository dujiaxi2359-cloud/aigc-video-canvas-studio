import fs from "node:fs";
import path from "node:path";
import sharp from "sharp";
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

function ratioDelta(width: number, height: number, targetWidth: number, targetHeight: number) {
  return Math.abs(width / height - targetWidth / targetHeight);
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
  const target = targetSizes[ratio];
  if (ratioDelta(metadata.width, metadata.height, target.width, target.height) < 0.02) {
    return { localPath, outputUrl: uploadUrlFor(localPath), metadata, transformed: false, aspectRatio: ratio, fitMode: "already_matching" };
  }

  const outputDir = path.resolve(process.cwd(), process.env.UPLOAD_DIR ?? "./uploads", "generated", "images");
  fs.mkdirSync(outputDir, { recursive: true });
  const outputPath = path.join(outputDir, `image_${ratio.replace(":", "x")}_${Date.now()}.png`);

  const background = await sharp(localPath)
    .resize(target.width, target.height, {
      fit: "cover",
      position: "attention"
    })
    .blur(24)
    .png()
    .toBuffer();
  const foreground = await sharp(localPath)
    .resize(target.width, target.height, {
      fit: "contain",
      background: { r: 0, g: 0, b: 0, alpha: 0 }
    })
    .png()
    .toBuffer();

  await sharp(background)
    .composite([{ input: foreground, gravity: "center" }])
    .png({ compressionLevel: 9 })
    .toFile(outputPath);

  return {
    localPath: outputPath,
    outputUrl: uploadUrlFor(outputPath),
    metadata: await readGeneratedFileMetadata(outputPath),
    originalMetadata: metadata,
    transformed: true,
    aspectRatio: ratio,
    fitMode: "contain_blur"
  };
}
