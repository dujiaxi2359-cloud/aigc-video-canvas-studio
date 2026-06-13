import { promises as fs } from "node:fs";
import path from "node:path";
import type { GeneratedImage } from "@/lib/image-generation";

export type SharedHistoryItem = {
  id: string;
  workflow: string;
  title: string;
  finalPrompt: string;
  createdAt: string;
  customerId?: string;
  outputType?: string;
  referenceThumb?: string;
  productThumb?: string;
  imageCount?: number;
};

type HistoryIndex = {
  items: SharedHistoryItem[];
};

const historyRoot = path.join(process.cwd(), "data", "history");
const indexPath = path.join(historyRoot, "index.json");

function safeId(id: string) {
  return id.replace(/[^a-zA-Z0-9_-]/g, "");
}

export function normalizeHistoryCustomerId(value?: string | null) {
  return (value || "").trim().replace(/\s+/g, "").toUpperCase();
}

async function ensureHistoryRoot() {
  await fs.mkdir(historyRoot, { recursive: true });
}

async function readIndex(): Promise<HistoryIndex> {
  await ensureHistoryRoot();

  try {
    const raw = await fs.readFile(indexPath, "utf8");
    const parsed = JSON.parse(raw) as HistoryIndex;
    return { items: Array.isArray(parsed.items) ? parsed.items : [] };
  } catch {
    return { items: [] };
  }
}

async function writeIndex(index: HistoryIndex) {
  await ensureHistoryRoot();
  await fs.writeFile(indexPath, JSON.stringify(index, null, 2), "utf8");
}

async function writeFileEnsured(filePath: string, data: string | Buffer, encoding?: BufferEncoding) {
  await fs.mkdir(path.dirname(filePath), { recursive: true });
  await fs.writeFile(filePath, data, encoding);
}

function parseDataImage(url: string) {
  const match = url.match(/^data:(image\/[a-zA-Z0-9.+-]+);base64,(.+)$/);
  if (!match) return null;

  const extensionMap: Record<string, string> = {
    "image/jpeg": "jpg",
    "image/png": "png",
    "image/webp": "webp",
    "image/svg+xml": "svg",
  };

  return {
    mimeType: match[1],
    extension: extensionMap[match[1]] || "png",
    buffer: Buffer.from(match[2], "base64"),
  };
}

function extensionFromMimeType(mimeType: string | null) {
  const extensionMap: Record<string, string> = {
    "image/jpeg": "jpg",
    "image/png": "png",
    "image/webp": "webp",
    "image/svg+xml": "svg",
  };

  return extensionMap[mimeType || ""] || "png";
}

async function downloadRemoteImage(url: string) {
  if (!/^https?:\/\//i.test(url)) return null;

  try {
    const response = await fetch(url);
    if (!response.ok) return null;

    const mimeType = response.headers.get("content-type")?.split(";")[0]?.trim() || "image/png";
    if (!mimeType.startsWith("image/")) return null;

    return {
      mimeType,
      extension: extensionFromMimeType(mimeType),
      buffer: Buffer.from(await response.arrayBuffer()),
    };
  } catch {
    return null;
  }
}

export async function listSharedHistory() {
  const index = await readIndex();
  return index.items;
}

export async function listSharedHistoryForCustomer(customerId: string) {
  const normalizedCustomerId = normalizeHistoryCustomerId(customerId);
  if (!normalizedCustomerId) return [];

  const index = await readIndex();
  return index.items.filter(
    (item) => normalizeHistoryCustomerId(item.customerId) === normalizedCustomerId,
  );
}

export async function saveSharedHistory(
  item: SharedHistoryItem,
  images: GeneratedImage[],
) {
  await ensureHistoryRoot();

  const id = safeId(item.id);
  const itemDir = path.join(historyRoot, id);
  await fs.mkdir(itemDir, { recursive: true });

  const imageRecords = await Promise.all(
    images.map(async (image, index) => {
      const parsed = parseDataImage(image.url) || await downloadRemoteImage(image.url);
      if (!parsed) {
        return {
          id: image.id,
          index: image.index ?? index,
          url: image.url,
          exportWidth: image.exportWidth,
          exportHeight: image.exportHeight,
        };
      }

      const filename = `${index + 1}.${parsed.extension}`;
      await writeFileEnsured(path.join(itemDir, filename), parsed.buffer);
      return {
        id: image.id,
        index: image.index ?? index,
        file: filename,
        mimeType: parsed.mimeType,
        exportWidth: image.exportWidth,
        exportHeight: image.exportHeight,
      };
    }),
  );

  await writeFileEnsured(
    path.join(itemDir, "images.json"),
    JSON.stringify({ images: imageRecords }, null, 2),
    "utf8",
  );

  const index = await readIndex();
  const nextItem = {
    ...item,
    customerId: normalizeHistoryCustomerId(item.customerId),
    imageCount: images.length,
  };
  const nextItems = [nextItem, ...index.items.filter((entry) => entry.id !== item.id)].slice(
    0,
    80,
  );

  await writeIndex({ items: nextItems });
  return nextItem;
}

export async function getSharedHistoryImages(historyId: string) {
  const id = safeId(historyId);
  if (!id) return [];

  const itemDir = path.join(historyRoot, id);
  const raw = await fs.readFile(path.join(itemDir, "images.json"), "utf8");
  const parsed = JSON.parse(raw) as {
    images: Array<{
      id: string;
      index: number;
      file?: string;
      mimeType?: string;
      url?: string;
      exportWidth?: number;
      exportHeight?: number;
    }>;
  };

  return Promise.all(
    (parsed.images || []).map(async (image, index) => {
      if (image.url) {
        return {
          id: image.id || `${id}-${index}`,
          index: image.index ?? index,
          url: image.url,
          exportWidth: image.exportWidth,
          exportHeight: image.exportHeight,
        };
      }

      if (!image.file) {
        throw new Error("History image file is missing.");
      }

      const buffer = await fs.readFile(path.join(itemDir, image.file));
      return {
        id: image.id || `${id}-${index}`,
        index: image.index ?? index,
        url: `data:${image.mimeType || "image/png"};base64,${buffer.toString("base64")}`,
        exportWidth: image.exportWidth,
        exportHeight: image.exportHeight,
      };
    }),
  );
}
