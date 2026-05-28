import fs from "node:fs";
import path from "node:path";
import sharp from "sharp";
import { ProviderError } from "../../utils/providerErrors.js";
import { normalizeVideoAspectRatio } from "../../utils/videoParams.js";

const targetSizes: Record<string, { width: number; height: number }> = {
  "16:9": { width: 1280, height: 720 },
  "9:16": { width: 720, height: 1280 },
  "1:1": { width: 1024, height: 1024 }
};

function ratioDelta(width: number, height: number, aspectRatio: string) {
  const target = targetSizes[normalizeVideoAspectRatio(aspectRatio)];
  return Math.abs(width / height - target.width / target.height);
}

export async function inspectImageDimensions(localPath: string) {
  if (!fs.existsSync(localPath)) throw new ProviderError("ASSET_FILE_NOT_FOUND", "本地素材文件不存在，请重新上传图片。", localPath);
  const metadata = await sharp(localPath).metadata();
  if (!metadata.width || !metadata.height) {
    throw new ProviderError("PROVIDER_ERROR", "无法读取输入图片尺寸，请重新上传素材。", localPath);
  }
  return { width: metadata.width, height: metadata.height };
}

export async function prepareVideoFrameForAspectRatio(localPath: string, aspectRatio?: string, fitMode: "smart_crop" | "contain_blur" | "contain_black" = "smart_crop") {
  const ratio = normalizeVideoAspectRatio(aspectRatio);
  const dimensions = await inspectImageDimensions(localPath);
  if (ratioDelta(dimensions.width, dimensions.height, ratio) < 0.02) {
    return { localPath, width: dimensions.width, height: dimensions.height, transformed: false, aspectRatio: ratio, fitMode };
  }

  const target = targetSizes[ratio];
  const uploadRoot = process.env.UPLOAD_DIR ?? "./uploads";
  const outputDir = path.resolve(process.cwd(), uploadRoot, "generated", "frames");
  fs.mkdirSync(outputDir, { recursive: true });
  const outputPath = path.join(outputDir, `frame_${ratio.replace(":", "x")}_${Date.now()}.png`);

  if (fitMode === "contain_blur") {
    const blurred = await sharp(localPath).resize(target.width, target.height, { fit: "cover" }).blur(24).png().toBuffer();
    const foreground = await sharp(localPath).resize(target.width, target.height, { fit: "contain", background: { r: 0, g: 0, b: 0, alpha: 0 } }).png().toBuffer();
    await sharp(blurred).composite([{ input: foreground, gravity: "center" }]).png().toFile(outputPath);
  } else {
    await sharp(localPath)
      .resize(target.width, target.height, {
        fit: fitMode === "contain_black" ? "contain" : "cover",
        position: "attention",
        background: { r: 0, g: 0, b: 0, alpha: 1 }
      })
      .png()
      .toFile(outputPath);
  }

  return { localPath: outputPath, width: target.width, height: target.height, transformed: true, aspectRatio: ratio, fitMode };
}
