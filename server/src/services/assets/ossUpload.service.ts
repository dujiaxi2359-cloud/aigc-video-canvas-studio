import fs from "node:fs";
import path from "node:path";
import { randomUUID } from "node:crypto";
import OSS from "ali-oss";
import { ProviderError, rawErrorMessage, type ProviderErrorCode } from "../../utils/providerErrors.js";

type OssConfig = {
  accessKeyId: string;
  accessKeySecret: string;
  bucket: string;
  region: string;
  endpoint: string;
  publicBaseUrl?: string;
  uploadDir: string;
  expiresSeconds: number;
};

export type OssUploadResult = {
  objectKey: string;
  signedUrl: string;
  publicUrl?: string;
  expiresAt: string;
};

function endpointForRegion(region: string) {
  return `https://${region}.aliyuncs.com`;
}

function stripTrailingSlash(value: string) {
  return value.replace(/\/+$/, "");
}

function isOssDisabled() {
  return process.env.OSS_DISABLED === "true";
}

function hasPartialOssConfig() {
  return Boolean(
    process.env.OSS_ACCESS_KEY_ID ||
      process.env.OSS_ACCESS_KEY_SECRET ||
      process.env.OSS_BUCKET ||
      process.env.OSS_REGION ||
      process.env.OSS_ENDPOINT ||
      process.env.OSS_PUBLIC_BASE_URL
  );
}

function maskOssConfig(config?: Partial<OssConfig>) {
  return {
    hasAccessKeyId: Boolean(process.env.OSS_ACCESS_KEY_ID),
    hasAccessKeySecret: Boolean(process.env.OSS_ACCESS_KEY_SECRET),
    bucket: config?.bucket ?? process.env.OSS_BUCKET,
    region: config?.region ?? process.env.OSS_REGION,
    endpoint: config?.endpoint ?? process.env.OSS_ENDPOINT
  };
}

export function logOssConfig() {
  const config = getOssConfig(false);
  console.log("[oss-config]", maskOssConfig(config ?? undefined));
}

function validateBucket(bucket: string) {
  if (/^https?:\/\//i.test(bucket) || bucket.includes(".aliyuncs.com") || bucket.includes("/")) {
    throw new ProviderError("OSS_CONFIG_MISSING", "OSS_BUCKET 只能填写 Bucket 名称，不要填写完整 URL 或 Endpoint。");
  }
}

function validateRegion(region: string) {
  if (!/^oss-[a-z0-9-]+$/i.test(region)) {
    throw new ProviderError("OSS_CONFIG_MISSING", "OSS_REGION 格式不正确，示例：oss-cn-beijing、oss-cn-shanghai、oss-ap-southeast-1。");
  }
}

function validateRegionEndpoint(region: string, endpoint: string) {
  const normalized = stripTrailingSlash(endpoint);
  if (!/^https:\/\/oss-[a-z0-9-]+\.aliyuncs\.com$/i.test(normalized)) {
    throw new ProviderError("OSS_ENDPOINT_INVALID", "OSS Endpoint 格式不正确，示例：https://oss-cn-beijing.aliyuncs.com。");
  }
  if (!normalized.includes(region)) {
    throw new ProviderError("OSS_REGION_ENDPOINT_MISMATCH", "OSS Bucket 所在区域与 Endpoint 不匹配，请确认 Bucket 的实际地域，并填写对应 Endpoint。");
  }
}

function getOssConfig(throwOnMissing = true): OssConfig | undefined {
  if (isOssDisabled()) return undefined;

  const accessKeyId = process.env.OSS_ACCESS_KEY_ID?.trim();
  const accessKeySecret = process.env.OSS_ACCESS_KEY_SECRET?.trim();
  const bucket = process.env.OSS_BUCKET?.trim();
  const region = process.env.OSS_REGION?.trim();
  const endpoint = stripTrailingSlash(process.env.OSS_ENDPOINT?.trim() || (region ? endpointForRegion(region) : ""));

  if (!accessKeyId || !accessKeySecret || !bucket || !region || !endpoint) {
    if (!throwOnMissing) return undefined;
    throw new ProviderError(
      "OSS_CONFIG_MISSING",
      "OSS 配置缺失，请检查 OSS_ACCESS_KEY_ID、OSS_ACCESS_KEY_SECRET、OSS_BUCKET、OSS_REGION、OSS_ENDPOINT 是否已配置，并重启后端服务。"
    );
  }

  validateBucket(bucket);
  validateRegion(region);
  validateRegionEndpoint(region, endpoint);

  if (!/^LTAI/i.test(accessKeyId)) {
    throw new ProviderError("OSS_ACCESS_KEY_INVALID", "AccessKey ID 无效，请确认复制的是阿里云 AccessKey ID，不是 RAM 用户名、Bucket 名或其他平台 Key。");
  }
  if (/^LTAI/i.test(accessKeySecret)) {
    throw new ProviderError("OSS_ACCESS_KEY_SECRET_INVALID", "AccessKey Secret 不匹配，请重新复制 Secret，不要把 AccessKey ID 填到 Secret 字段。");
  }

  return {
    accessKeyId,
    accessKeySecret,
    bucket,
    region,
    endpoint,
    publicBaseUrl: process.env.OSS_PUBLIC_BASE_URL?.replace(/\/$/, ""),
    uploadDir: process.env.OSS_UPLOAD_DIR || "aigc-assets",
    expiresSeconds: Number(process.env.OSS_EXPIRES_SECONDS || process.env.OSS_SIGNED_URL_EXPIRES || 3600)
  };
}

function createOssClient(config = getOssConfig()) {
  if (!config) {
    throw new ProviderError(
      "OSS_CONFIG_MISSING",
      "OSS 配置缺失，请检查 OSS_ACCESS_KEY_ID、OSS_ACCESS_KEY_SECRET、OSS_BUCKET、OSS_REGION、OSS_ENDPOINT 是否已配置，并重启后端服务。"
    );
  }

  return new OSS({
    accessKeyId: config.accessKeyId,
    accessKeySecret: config.accessKeySecret,
    bucket: config.bucket,
    region: config.region,
    endpoint: config.endpoint,
    secure: true,
    timeout: "60s"
  });
}

function sanitizeObjectPart(value: string) {
  return value
    .replace(/[\\/:*?"<>|]/g, "_")
    .replace(/\s+/g, "_")
    .replace(/_+/g, "_")
    .slice(0, 120);
}

function assetFolderForMime(mimeType?: string, assetType?: string) {
  if (assetType === "video" || mimeType?.startsWith("video/")) return "videos";
  if (assetType === "audio" || mimeType?.startsWith("audio/")) return "audios";
  if (assetType === "text" || mimeType?.startsWith("text/") || mimeType === "application/json") return "texts";
  return "images";
}

function objectKeyFor(input: { localPath: string; mimeType?: string; assetType?: string; projectId?: string }) {
  const ext = path.extname(input.localPath) || ".bin";
  const base = sanitizeObjectPart(path.basename(input.localPath, ext) || "asset");
  const projectId = sanitizeObjectPart(input.projectId || "default-project");
  const folder = assetFolderForMime(input.mimeType, input.assetType);
  return `${process.env.OSS_UPLOAD_DIR || "aigc-assets"}/${projectId}/${folder}/${Date.now()}_${randomUUID()}_${base}${ext}`;
}

function publicUrlFor(config: OssConfig, objectKey: string) {
  if (!config.publicBaseUrl) return undefined;
  return `${config.publicBaseUrl}/${objectKey.split("/").map(encodeURIComponent).join("/")}`;
}

function codeFromOssError(error: unknown): ProviderErrorCode {
  const record = (error && typeof error === "object" ? error : {}) as Record<string, unknown>;
  const code = String(record.code || record.name || "");
  const status = Number(record.status || record.statusCode || 0);
  const message = rawErrorMessage(error).toLowerCase();

  if (code === "UserDisable" || message.includes("userdisable")) return "OSS_ACCESS_KEY_DISABLED";
  if (code === "AccessDenied" || status === 403 || message.includes("accessdenied") || message.includes("access denied")) return "OSS_ACCESS_DENIED";
  if (code === "NoSuchBucket" || status === 404 || message.includes("nosuchbucket")) return "OSS_BUCKET_NOT_FOUND";
  if (code === "InvalidAccessKeyId" || message.includes("invalidaccesskeyid")) return "OSS_ACCESS_KEY_INVALID";
  if (code === "SignatureDoesNotMatch" || message.includes("signaturedoesnotmatch")) return "OSS_ACCESS_KEY_SECRET_INVALID";
  if (message.includes("enotfound") || message.includes("getaddrinfo")) return "OSS_ENDPOINT_INVALID";
  if (message.includes("requesterror") || message.includes("timeout") || message.includes("fetch failed") || message.includes("econn") || message.includes("network")) return "OSS_NETWORK_ERROR";
  return "OSS_UPLOAD_FAILED";
}

function messageForOssCode(code: ProviderErrorCode) {
  switch (code) {
    case "OSS_ACCESS_DENIED":
      return "AccessKey 权限不足，请确认 RAM 用户具备当前 Bucket 的 PutObject、GetObject、ListBucket 权限。";
    case "OSS_BUCKET_NOT_FOUND":
      return "Bucket 不存在或 Bucket 名称填写错误。";
    case "OSS_ACCESS_KEY_INVALID":
      return "AccessKey ID 无效，请确认复制的是阿里云 AccessKey ID，不是其他平台 Key。";
    case "OSS_ACCESS_KEY_DISABLED":
      return "当前 RAM 用户或 AccessKey 已被禁用，请在阿里云 RAM 控制台启用该用户/AccessKey，或重新创建一个可用的 AccessKey。";
    case "OSS_ACCESS_KEY_SECRET_INVALID":
      return "AccessKey Secret 不匹配，请重新复制 Secret。";
    case "OSS_ENDPOINT_INVALID":
      return "OSS Endpoint 无法解析，请检查 Endpoint 拼写。";
    case "OSS_NETWORK_ERROR":
      return "本地后端无法连接 OSS，请检查网络、VPN、代理或 Endpoint 是否可访问。";
    default:
      return "OSS 临时上传失败，请检查 OSS Bucket、Region/Endpoint、AccessKey 权限和网络连接。";
  }
}

export function toOssProviderError(error: unknown) {
  if (error instanceof ProviderError) return error;
  const code = codeFromOssError(error);
  const record = (error && typeof error === "object" ? error : {}) as Record<string, unknown>;
  console.error("[oss-upload-failed]", {
    errorName: record.name,
    errorCode: record.code,
    status: record.status || record.statusCode,
    requestId: record.requestId || record.requestID,
    message: rawErrorMessage(error)
  });
  return new ProviderError(code, messageForOssCode(code), rawErrorMessage(error));
}

export async function ensureOssReady(): Promise<OssConfig> {
  const config = getOssConfig(true) as OssConfig;
  createOssClient(config);
  return config;
}

export async function uploadLocalFileToOss(input: {
  localPath: string;
  mimeType?: string;
  assetType?: string;
  projectId?: string;
  assetId?: string;
}) {
  const config = await ensureOssReady();
  if (!fs.existsSync(input.localPath)) {
    throw new ProviderError("ASSET_FILE_NOT_FOUND", "本地素材文件不存在，请重新上传素材。", input.localPath);
  }

  const fileSize = fs.statSync(input.localPath).size;
  const objectKey = objectKeyFor(input);
  console.log("[oss-upload-start]", {
    assetId: input.assetId,
    localPathExists: true,
    fileSize,
    mimeType: input.mimeType,
    bucket: config.bucket,
    region: config.region,
    endpoint: config.endpoint,
    objectKey
  });

  try {
    const client = createOssClient(config);
    await client.put(objectKey, input.localPath, {
      headers: input.mimeType ? { "Content-Type": input.mimeType } : undefined
    });
    const signedUrl = client.signatureUrl(objectKey, {
      expires: config.expiresSeconds,
      method: "GET"
    });
    const result = {
      objectKey,
      signedUrl,
      publicUrl: publicUrlFor(config, objectKey),
      expiresAt: new Date(Date.now() + config.expiresSeconds * 1000).toISOString()
    };
    console.log("[oss-upload-success]", {
      assetId: input.assetId,
      objectKey,
      hasSignedUrl: Boolean(signedUrl),
      expiresSeconds: config.expiresSeconds
    });
    return result;
  } catch (error) {
    throw toOssProviderError(error);
  }
}

export async function uploadAssetToOssIfConfigured(localPath: string, filename: string) {
  if (isOssDisabled()) return undefined;
  if (!hasPartialOssConfig()) return undefined;
  const mimeType = path.extname(filename).toLowerCase() === ".mp4" ? "video/mp4" : undefined;
  const result = await uploadLocalFileToOss({ localPath, mimeType, assetType: undefined });
  return result.publicUrl || result.signedUrl;
}

export async function testOssConnection() {
  const config = await ensureOssReady();
  const client = createOssClient(config);
  const objectKey = `${config.uploadDir}/health/oss-health-${Date.now()}-${randomUUID()}.txt`;
  try {
    await client.put(objectKey, Buffer.from("oss health ok", "utf8"), {
      headers: { "Content-Type": "text/plain; charset=utf-8" }
    });
    const signedUrl = client.signatureUrl(objectKey, {
      expires: Math.min(config.expiresSeconds, 600),
      method: "GET"
    });
    await client.delete(objectKey).catch(() => undefined);
    return {
      ok: true,
      bucket: config.bucket,
      region: config.region,
      endpoint: config.endpoint,
      canPutObject: true,
      canGetSignedUrl: Boolean(signedUrl)
    };
  } catch (error) {
    throw toOssProviderError(error);
  }
}
