import fs from "node:fs";
import path from "node:path";
import { execFile } from "node:child_process";
import { promisify } from "node:util";
import { readGeneratedFileMetadata } from "../../utils/mediaMetadata.js";
import { mapVideoDimensions, normalizeVideoAspectRatio } from "../../utils/videoParams.js";

const execFileAsync = promisify(execFile);

function ratioDelta(width: number, height: number, targetWidth: number, targetHeight: number) {
  return Math.abs(width / height - targetWidth / targetHeight);
}

function uploadUrlFor(localPath: string) {
  const uploadRoot = path.resolve(process.cwd(), process.env.UPLOAD_DIR ?? "./uploads");
  const relative = path.relative(uploadRoot, localPath).split(path.sep).join("/");
  return relative.startsWith("..") ? undefined : `/uploads/${relative}`;
}

export async function ensureVideoAspectRatio(localPath: string | undefined, aspectRatio?: string, resolution?: string) {
  if (!localPath || !fs.existsSync(localPath)) return undefined;
  const metadata = await readGeneratedFileMetadata(localPath);
  if (!metadata.width || !metadata.height) return undefined;

  const ratio = normalizeVideoAspectRatio(aspectRatio);
  const target = mapVideoDimensions(ratio, resolution);
  if (ratioDelta(metadata.width, metadata.height, target.width, target.height) < 0.02) {
    return { localPath, outputUrl: uploadUrlFor(localPath), metadata, transformed: false, aspectRatio: ratio };
  }

  const outputDir = path.resolve(process.cwd(), process.env.UPLOAD_DIR ?? "./uploads", "generated", "videos");
  fs.mkdirSync(outputDir, { recursive: true });
  const outputPath = path.join(outputDir, `video_${ratio.replace(":", "x")}_${Date.now()}.mp4`);
  const filter = [
    `[0:v]scale=${target.width}:${target.height}:force_original_aspect_ratio=increase,crop=${target.width}:${target.height},boxblur=24:1[bg]`,
    `[0:v]scale=${target.width}:${target.height}:force_original_aspect_ratio=decrease[fg]`,
    `[bg][fg]overlay=(W-w)/2:(H-h)/2,setsar=1[v]`
  ].join(";");

  await execFileAsync("ffmpeg", [
    "-y",
    "-i",
    localPath,
    "-filter_complex",
    filter,
    "-map",
    "[v]",
    "-map",
    "0:a?",
    "-c:v",
    "libx264",
    "-preset",
    "veryfast",
    "-crf",
    "18",
    "-c:a",
    "copy",
    "-movflags",
    "+faststart",
    outputPath
  ]);

  return {
    localPath: outputPath,
    outputUrl: uploadUrlFor(outputPath),
    metadata: await readGeneratedFileMetadata(outputPath),
    originalMetadata: metadata,
    transformed: true,
    aspectRatio: ratio
  };
}
