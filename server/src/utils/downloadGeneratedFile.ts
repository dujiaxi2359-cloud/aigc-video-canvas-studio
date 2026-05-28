import fs from "node:fs";
import path from "node:path";

const extensionByContentType: Record<string, string> = {
  "image/png": ".png",
  "image/jpeg": ".jpg",
  "image/jpg": ".jpg",
  "image/webp": ".webp",
  "video/mp4": ".mp4",
  "video/webm": ".webm",
  "video/quicktime": ".mov"
};

function generatedDir() {
  const uploadRoot = process.env.UPLOAD_DIR ?? "./uploads";
  const dir = path.resolve(process.cwd(), uploadRoot, "generated");
  fs.mkdirSync(dir, { recursive: true });
  return dir;
}

function extensionFromUrl(url: string) {
  const cleanUrl = url.split("?")[0] ?? url;
  const ext = path.extname(cleanUrl).toLowerCase();
  return ext || undefined;
}

function publicUrlFor(fileName: string) {
  return `/uploads/generated/${fileName}`;
}

export async function saveGeneratedBuffer(input: {
  buffer: Buffer;
  prefix: string;
  extension?: string;
  contentType?: string | null;
}) {
  const extension = input.extension ?? (input.contentType ? extensionByContentType[input.contentType] : undefined) ?? ".bin";
  const safeExtension = extension.startsWith(".") ? extension : `.${extension}`;
  const fileName = `${input.prefix}_${Date.now()}${safeExtension}`;
  const localPath = path.join(generatedDir(), fileName);
  fs.writeFileSync(localPath, input.buffer);
  return {
    localPath,
    outputUrl: publicUrlFor(fileName),
    size: input.buffer.length,
    originalName: fileName
  };
}

export async function downloadGeneratedFile(remoteUrl: string, prefix = "generated") {
  const response = await fetch(remoteUrl);
  if (!response.ok) {
    throw new Error(`下载生成文件失败：${response.status} ${await response.text()}`);
  }
  const contentType = response.headers.get("content-type");
  const buffer = Buffer.from(await response.arrayBuffer());
  return saveGeneratedBuffer({
    buffer,
    prefix,
    extension: extensionFromUrl(remoteUrl),
    contentType
  });
}
