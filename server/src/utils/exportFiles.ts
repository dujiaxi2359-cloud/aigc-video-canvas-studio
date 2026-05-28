import fs from "node:fs";
import path from "node:path";

export type ExportAsset = {
  nodeId?: string;
  nodeTitle?: string;
  type?: "image" | "video" | "audio" | "compose" | string;
  url: string;
  filename?: string;
};

export type ZipEntry = {
  name: string;
  data: Buffer;
};

const sensitiveKeyPattern = /(api.?key|encrypted|authorization|secret|token|password)/i;

export function sanitizeFilename(input = "asset") {
  const cleaned = input
    .replace(/[\\/:*?"<>|]/g, "_")
    .replace(/\s+/g, "_")
    .replace(/_+/g, "_")
    .trim();
  return cleaned || "asset";
}

export function sanitizeProjectForExport<T>(value: T): T {
  if (Array.isArray(value)) return value.map((item) => sanitizeProjectForExport(item)) as T;
  if (!value || typeof value !== "object") return value;

  const output: Record<string, unknown> = {};
  for (const [key, item] of Object.entries(value as Record<string, unknown>)) {
    if (sensitiveKeyPattern.test(key)) continue;
    output[key] = sanitizeProjectForExport(item);
  }
  return output as T;
}

export function extensionFromUrl(url: string, fallback = ".bin") {
  const pathname = (() => {
    try {
      return new URL(url, "http://local").pathname;
    } catch {
      return url;
    }
  })();
  const ext = path.extname(pathname).toLowerCase();
  return ext || fallback;
}

export function inferAssetType(url: string, explicit?: string) {
  if (explicit) return explicit;
  const ext = extensionFromUrl(url);
  if (/\.(png|jpe?g|webp|gif)$/i.test(ext)) return "image";
  if (/\.(mp4|webm|mov|m4v)$/i.test(ext)) return "video";
  if (/\.(mp3|wav|m4a|aac|ogg)$/i.test(ext)) return "audio";
  return "asset";
}

export function folderForAsset(type: string) {
  if (type === "image") return "images";
  if (type === "video" || type === "compose") return "videos";
  if (type === "audio") return "audio";
  return "assets";
}

export function resolveLocalUploadPath(url: string) {
  const uploadRoot = path.resolve(process.cwd(), process.env.UPLOAD_DIR ?? "./uploads");
  let pathname = url;
  try {
    pathname = new URL(url).pathname;
  } catch {
    // Relative paths are expected for local generated assets.
  }

  const decoded = decodeURIComponent(pathname);
  if (!decoded.startsWith("/uploads/")) return null;
  const relative = decoded.replace(/^\/uploads\//, "");
  const absolute = path.resolve(uploadRoot, relative);
  if (!absolute.startsWith(uploadRoot)) return null;
  return absolute;
}

export async function readAssetBytes(url: string) {
  const localPath = resolveLocalUploadPath(url);
  if (localPath) {
    return fs.promises.readFile(localPath);
  }

  const response = await fetch(url);
  if (!response.ok) {
    throw new Error("REMOTE_ASSET_DOWNLOAD_FAILED");
  }
  return Buffer.from(await response.arrayBuffer());
}

export function contentTypeForFilename(filename: string) {
  const ext = path.extname(filename).toLowerCase();
  if (ext === ".png") return "image/png";
  if (ext === ".jpg" || ext === ".jpeg") return "image/jpeg";
  if (ext === ".webp") return "image/webp";
  if (ext === ".mp4") return "video/mp4";
  if (ext === ".webm") return "video/webm";
  if (ext === ".mov") return "video/quicktime";
  if (ext === ".mp3") return "audio/mpeg";
  if (ext === ".wav") return "audio/wav";
  if (ext === ".json") return "application/json; charset=utf-8";
  if (ext === ".zip") return "application/zip";
  return "application/octet-stream";
}

function crc32(buffer: Buffer) {
  let crc = 0xffffffff;
  for (const byte of buffer) {
    crc ^= byte;
    for (let index = 0; index < 8; index += 1) {
      crc = (crc >>> 1) ^ (0xedb88320 & -(crc & 1));
    }
  }
  return (crc ^ 0xffffffff) >>> 0;
}

function dosDateTime(date = new Date()) {
  const time = (date.getHours() << 11) | (date.getMinutes() << 5) | Math.floor(date.getSeconds() / 2);
  const dosDate = ((date.getFullYear() - 1980) << 9) | ((date.getMonth() + 1) << 5) | date.getDate();
  return { time, date: dosDate };
}

export function createZipBuffer(entries: ZipEntry[]) {
  const localParts: Buffer[] = [];
  const centralParts: Buffer[] = [];
  let offset = 0;
  const now = dosDateTime();

  for (const entry of entries) {
    const nameBuffer = Buffer.from(entry.name.replace(/\\/g, "/"), "utf8");
    const data = entry.data;
    const crc = crc32(data);

    const localHeader = Buffer.alloc(30);
    localHeader.writeUInt32LE(0x04034b50, 0);
    localHeader.writeUInt16LE(20, 4);
    localHeader.writeUInt16LE(0x0800, 6);
    localHeader.writeUInt16LE(0, 8);
    localHeader.writeUInt16LE(now.time, 10);
    localHeader.writeUInt16LE(now.date, 12);
    localHeader.writeUInt32LE(crc, 14);
    localHeader.writeUInt32LE(data.length, 18);
    localHeader.writeUInt32LE(data.length, 22);
    localHeader.writeUInt16LE(nameBuffer.length, 26);
    localHeader.writeUInt16LE(0, 28);

    localParts.push(localHeader, nameBuffer, data);

    const centralHeader = Buffer.alloc(46);
    centralHeader.writeUInt32LE(0x02014b50, 0);
    centralHeader.writeUInt16LE(20, 4);
    centralHeader.writeUInt16LE(20, 6);
    centralHeader.writeUInt16LE(0x0800, 8);
    centralHeader.writeUInt16LE(0, 10);
    centralHeader.writeUInt16LE(now.time, 12);
    centralHeader.writeUInt16LE(now.date, 14);
    centralHeader.writeUInt32LE(crc, 16);
    centralHeader.writeUInt32LE(data.length, 20);
    centralHeader.writeUInt32LE(data.length, 24);
    centralHeader.writeUInt16LE(nameBuffer.length, 28);
    centralHeader.writeUInt16LE(0, 30);
    centralHeader.writeUInt16LE(0, 32);
    centralHeader.writeUInt16LE(0, 34);
    centralHeader.writeUInt16LE(0, 36);
    centralHeader.writeUInt32LE(0, 38);
    centralHeader.writeUInt32LE(offset, 42);
    centralParts.push(centralHeader, nameBuffer);

    offset += localHeader.length + nameBuffer.length + data.length;
  }

  const centralDirectory = Buffer.concat(centralParts);
  const localFiles = Buffer.concat(localParts);
  const end = Buffer.alloc(22);
  end.writeUInt32LE(0x06054b50, 0);
  end.writeUInt16LE(0, 4);
  end.writeUInt16LE(0, 6);
  end.writeUInt16LE(entries.length, 8);
  end.writeUInt16LE(entries.length, 10);
  end.writeUInt32LE(centralDirectory.length, 12);
  end.writeUInt32LE(localFiles.length, 16);
  end.writeUInt16LE(0, 20);

  return Buffer.concat([localFiles, centralDirectory, end]);
}
