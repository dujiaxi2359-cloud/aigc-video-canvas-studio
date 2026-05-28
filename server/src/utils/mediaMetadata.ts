import fs from "node:fs";
import { execFile } from "node:child_process";
import { promisify } from "node:util";
import sharp from "sharp";

const execFileAsync = promisify(execFile);

export type MediaMetadata = {
  width?: number;
  height?: number;
  duration?: number;
  fps?: number;
  fileSize?: number;
  format?: string;
};

export async function readImageMetadata(localPath: string): Promise<MediaMetadata> {
  const stat = fs.existsSync(localPath) ? fs.statSync(localPath) : undefined;
  const metadata = await sharp(localPath).metadata();
  return {
    width: metadata.width,
    height: metadata.height,
    format: metadata.format,
    fileSize: stat?.size
  };
}

async function readVideoMetadataWithFfprobe(localPath: string): Promise<MediaMetadata> {
  const { stdout } = await execFileAsync("ffprobe", [
    "-v",
    "error",
    "-select_streams",
    "v:0",
    "-show_entries",
    "stream=width,height,duration,r_frame_rate",
    "-of",
    "json",
    localPath
  ]);
  const parsed = JSON.parse(stdout) as {
    streams?: Array<{ width?: number; height?: number; duration?: string; r_frame_rate?: string }>;
  };
  const stream = parsed.streams?.[0];
  const [fpsNum, fpsDen] = (stream?.r_frame_rate || "").split("/").map(Number);
  return {
    width: stream?.width,
    height: stream?.height,
    duration: stream?.duration ? Number(stream.duration) : undefined,
    fps: fpsNum && fpsDen ? fpsNum / fpsDen : undefined
  };
}

export async function readGeneratedFileMetadata(localPath?: string): Promise<MediaMetadata> {
  if (!localPath || !fs.existsSync(localPath)) return {};
  const stat = fs.statSync(localPath);
  const ext = localPath.split(".").pop()?.toLowerCase();
  if (["png", "jpg", "jpeg", "webp"].includes(ext || "")) return readImageMetadata(localPath);
  if (["mp4", "webm", "mov", "m4v"].includes(ext || "")) {
    try {
      return { ...(await readVideoMetadataWithFfprobe(localPath)), fileSize: stat.size };
    } catch {
      return { fileSize: stat.size };
    }
  }
  return { fileSize: stat.size };
}

export function metadataToQualityAudit(metadata: MediaMetadata, prefix = "output") {
  return {
    [`${prefix}Width`]: metadata.width,
    [`${prefix}Height`]: metadata.height,
    [`${prefix}Duration`]: metadata.duration,
    [`${prefix}FileSize`]: metadata.fileSize
  };
}
