import fs from "node:fs";
import path from "node:path";
import { createAsset } from "./asset.service.js";
import { getDb } from "../db/database.js";
import { now } from "../utils/time.js";
import { ProviderError, rawErrorMessage } from "../utils/providerErrors.js";
import { sanitizeUrlForLog } from "../utils/videoResultExtractor.js";
import { saveGeneratedBuffer } from "../utils/downloadGeneratedFile.js";
import { contentTypeForFilename } from "../utils/exportFiles.js";
import { isCosConfigured, getCosConfig } from "./storage/cosStorage.service.js";
import { requireRequestContext } from "./requestContext.js";

type PersistGeneratedVideoInput = {
  providerVideoUrl: string;
  taskId?: string;
  userId?: string;
  workspaceId?: string;
  modelId?: string;
  providerId?: string;
  nodeId?: string;
  projectId?: string;
  prompt?: string;
  negativePrompt?: string;
  generationParams?: Record<string, unknown>;
};

function headersToObject(headers: Headers) {
  return Object.fromEntries(Array.from(headers.entries()));
}

function extensionFromContent(url: string, contentType?: string | null) {
  const ext = path.extname(url.split("?")[0] || "").toLowerCase();
  if ([".mp4", ".mov", ".webm", ".m4v"].includes(ext)) return ext;
  const normalized = contentType?.split(";")[0]?.trim().toLowerCase();
  if (normalized === "video/webm") return ".webm";
  if (normalized === "video/quicktime") return ".mov";
  return ".mp4";
}

function isVideoLike(url: string, contentType?: string | null) {
  const normalized = contentType?.split(";")[0]?.trim().toLowerCase() ?? "";
  return normalized.startsWith("video/")
    || normalized === "application/octet-stream"
    || /\.(mp4|mov|webm|m4v)(\?|$)/i.test(url);
}

async function downloadProviderVideo(providerVideoUrl: string, taskId?: string) {
  if (!providerVideoUrl) {
    throw new ProviderError(
      "PROVIDER_VIDEO_DOWNLOAD_FAILED",
      "中转已生成视频，但没有可下载的视频地址。",
      undefined,
      { failedStage: "download_video" }
    );
  }

  let response: Response;
  try {
    response = await fetch(providerVideoUrl);
  } catch (error) {
    throw new ProviderError(
      "PROVIDER_VIDEO_DOWNLOAD_FAILED",
      "中转已生成视频，但 Moon 后端无法下载该视频 URL，可能是临时链接过期、防盗链、鉴权限制或上游 CDN 拒绝服务器访问。",
      rawErrorMessage(error),
      {
        failedStage: "download_video",
        providerVideoUrl: sanitizeUrlForLog(providerVideoUrl),
        errorMessage: rawErrorMessage(error)
      }
    );
  }

  const responseHeaders = headersToObject(response.headers);
  const contentType = response.headers.get("content-type");
  const contentLength = response.headers.get("content-length");
  if (!response.ok) {
    let body = "";
    try {
      body = await response.text();
    } catch {
      body = "";
    }
    throw new ProviderError(
      "PROVIDER_VIDEO_DOWNLOAD_FAILED",
      "中转已生成视频，但 Moon 后端无法下载该视频 URL，可能是临时链接过期、防盗链、鉴权限制或上游 CDN 拒绝服务器访问。",
      body || `${response.status} ${response.statusText}`,
      {
        failedStage: "download_video",
        providerVideoUrl: sanitizeUrlForLog(providerVideoUrl),
        httpStatus: response.status,
        responseHeaders,
        contentType,
        contentLength,
        errorMessage: body || response.statusText
      }
    );
  }

  const buffer = Buffer.from(await response.arrayBuffer());
  if (!buffer.length || !isVideoLike(providerVideoUrl, contentType)) {
    throw new ProviderError(
      "PROVIDER_VIDEO_DOWNLOAD_FAILED",
      "中转已生成视频，但返回内容不是可保存的视频文件。",
      undefined,
      {
        failedStage: "download_video",
        providerVideoUrl: sanitizeUrlForLog(providerVideoUrl),
        httpStatus: response.status,
        responseHeaders,
        contentType,
        contentLength: contentLength ?? buffer.length,
        fileSize: buffer.length
      }
    );
  }

  const saved = await saveGeneratedBuffer({
    buffer,
    prefix: `provider_video_${taskId || "task"}`,
    extension: extensionFromContent(providerVideoUrl, contentType),
    contentType
  });
  return {
    ...saved,
    mimeType: contentType?.split(";")[0]?.trim() || contentTypeForFilename(saved.originalName) || "video/mp4",
    fileSize: buffer.length,
    downloadStatus: "success" as const,
    providerVideoUrl
  };
}

export async function persistGeneratedVideoToCOS(input: PersistGeneratedVideoInput) {
  if (!isCosConfigured()) {
    throw new ProviderError(
      "COS_UPLOAD_FAILED",
      "视频已生成，但腾讯云 COS 未配置，无法转存生成视频。",
      "COS_NOT_CONFIGURED",
      {
        failedStage: "upload_to_cos",
        bucket: process.env.TENCENT_COS_BUCKET,
        region: process.env.TENCENT_COS_REGION,
        providerVideoUrl: sanitizeUrlForLog(input.providerVideoUrl)
      }
    );
  }

  const downloaded = await downloadProviderVideo(input.providerVideoUrl, input.taskId);
  let bucket: string | undefined;
  let region: string | undefined;
  try {
    const config = getCosConfig();
    bucket = config.bucket;
    region = config.region;
    const asset = await createAsset({
      type: "generated",
      source: "generated",
      originalName: downloaded.originalName || `video_${input.taskId || Date.now()}.mp4`,
      localPath: downloaded.localPath,
      url: downloaded.outputUrl,
      size: downloaded.fileSize,
      mimeType: downloaded.mimeType,
      providerId: input.providerId,
      modelId: input.modelId,
      nodeId: input.nodeId,
      projectId: input.projectId,
      prompt: input.prompt,
      negativePrompt: input.negativePrompt,
      generationParams: {
        ...input.generationParams,
        providerVideoUrl: sanitizeUrlForLog(input.providerVideoUrl),
        taskId: input.taskId,
        downloadStatus: downloaded.downloadStatus
      }
    });
    if (!asset.storageKey) {
      throw new Error("COS_STORAGE_KEY_MISSING");
    }
    return {
      asset,
      localPath: asset.localPath,
      cosObjectKey: asset.storageKey,
      cosUrl: asset.url,
      fileSize: asset.size ?? downloaded.fileSize,
      mimeType: asset.mimeType ?? downloaded.mimeType,
      providerVideoUrl: input.providerVideoUrl,
      downloadStatus: downloaded.downloadStatus,
      cosUploadStatus: "success" as const
    };
  } catch (error) {
    throw new ProviderError(
      "COS_UPLOAD_FAILED",
      "视频已下载，但上传腾讯云 COS 失败。",
      rawErrorMessage(error),
      {
        failedStage: "upload_to_cos",
        bucket,
        region,
        objectKey: undefined,
        fileSize: downloaded.fileSize,
        contentType: downloaded.mimeType,
        providerVideoUrl: sanitizeUrlForLog(input.providerVideoUrl),
        errorMessage: rawErrorMessage(error),
        requestId: (error as { requestId?: string })?.requestId
      }
    );
  } finally {
    if (downloaded.localPath && fs.existsSync(downloaded.localPath)) {
      fs.rmSync(downloaded.localPath, { force: true });
    }
  }
}

export async function updateCanvasNodeWithGeneratedVideo(input: {
  projectId?: string;
  nodeId?: string;
  outputUrl: string;
  outputAssetId?: string;
  downloadableUrl?: string;
}) {
  if (!input.projectId || !input.nodeId) return { updated: false };
  const db = await getDb();
  const { workspace } = requireRequestContext();
  const project = await db.get<{ id: string; nodes_json: string }>(
    "SELECT id, nodes_json FROM projects WHERE id = ? AND workspace_id = ?",
    input.projectId,
    workspace.id
  );
  if (!project) throw new ProviderError("CANVAS_NODE_UPDATE_FAILED", "COS 已转存，但没有找到对应画布项目。", undefined, { failedStage: "canvas_node_updated", projectId: input.projectId, nodeId: input.nodeId });

  let didUpdate = false;
  const nodes = JSON.parse(project.nodes_json) as Array<Record<string, unknown>>;
  const nextNodes = nodes.map((node) => {
    if (node.id !== input.nodeId) return node;
    didUpdate = true;
    const data = (node.data && typeof node.data === "object" ? node.data as Record<string, unknown> : {});
    return {
      ...node,
      data: {
        ...data,
        status: "success",
        generationStatus: "succeeded",
        outputUrl: input.outputUrl,
        previewUrl: input.outputUrl,
        downloadableUrl: input.downloadableUrl ?? input.outputUrl,
        outputAssetId: input.outputAssetId,
        loading: false,
        errorMessage: undefined
      }
    };
  });
  if (!didUpdate) throw new ProviderError("CANVAS_NODE_UPDATE_FAILED", "COS 已转存，但没有找到对应画布节点。", undefined, { failedStage: "canvas_node_updated", projectId: input.projectId, nodeId: input.nodeId });

  await db.run("UPDATE projects SET nodes_json = ?, updated_at = ? WHERE id = ? AND workspace_id = ?", JSON.stringify(nextNodes), now(), input.projectId, workspace.id);
  return { updated: true };
}

export async function updateCanvasNodeWithGenerationFailure(input: {
  projectId?: string;
  nodeId?: string;
  errorMessage: string;
  errorCode?: string;
  failedStage?: string;
}) {
  if (!input.projectId || !input.nodeId) return { updated: false };
  const db = await getDb();
  const { workspace } = requireRequestContext();
  const project = await db.get<{ id: string; nodes_json: string }>(
    "SELECT id, nodes_json FROM projects WHERE id = ? AND workspace_id = ?",
    input.projectId,
    workspace.id
  );
  if (!project) return { updated: false };

  let didUpdate = false;
  const nodes = JSON.parse(project.nodes_json) as Array<Record<string, unknown>>;
  const nextNodes = nodes.map((node) => {
    if (node.id !== input.nodeId) return node;
    didUpdate = true;
    const data = (node.data && typeof node.data === "object" ? node.data as Record<string, unknown> : {});
    return {
      ...node,
      data: {
        ...data,
        status: "error",
        generationStatus: "failed",
        loading: false,
        failedStage: input.failedStage,
        errorCode: input.errorCode,
        errorMessage: input.errorMessage
      }
    };
  });
  if (!didUpdate) return { updated: false };

  await db.run("UPDATE projects SET nodes_json = ?, updated_at = ? WHERE id = ? AND workspace_id = ?", JSON.stringify(nextNodes), now(), input.projectId, workspace.id);
  return { updated: true };
}
