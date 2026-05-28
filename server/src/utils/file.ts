import path from "node:path";

export function assetTypeFromMime(mimeType: string): "image" | "video" | "audio" | "script" {
  if (mimeType.startsWith("image/")) return "image";
  if (mimeType.startsWith("video/")) return "video";
  if (mimeType.startsWith("audio/")) return "audio";
  return "script";
}

export function uploadFolderForType(type: string) {
  const map: Record<string, string> = {
    image: "images",
    video: "videos",
    audio: "audios",
    script: "scripts",
    generated: "generated",
    export: "exports"
  };
  return map[type] ?? "scripts";
}

export function toPublicUploadUrl(uploadDirName: string, fileName: string) {
  return `/uploads/${uploadDirName}/${path.basename(fileName)}`;
}
