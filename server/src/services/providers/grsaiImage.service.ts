import fs from "node:fs";
import { getAsset } from "../asset.service.js";
import { ensureAssetLocalFile } from "../assets/ensureAssetLocalFile.service.js";
import { downloadGeneratedFile, saveGeneratedBuffer } from "../../utils/downloadGeneratedFile.js";
import { extractImagePayload, summarizeImageResponseShape } from "../../utils/imageResponseExtractor.js";
import { ProviderError } from "../../utils/providerErrors.js";
import type { ImageProviderParams, ProviderGenerateResult } from "./providerTypes.js";
import { grsaiAspectValue, grsaiGenerateEndpoint, grsaiResultEndpoint } from "./grsaiImageProtocol.js";

type GrsaiResponse = {
  id?: string;
  status?: string;
  progress?: number;
  results?: Array<{ url?: string }>;
  error?: string;
  [key: string]: unknown;
};

function sleep(ms: number) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

async function responseJson(response: Response, endpoint: string) {
  const text = await response.text();
  try {
    return JSON.parse(text) as GrsaiResponse;
  } catch {
    const preview = text.replace(/\s+/g, " ").trim().slice(0, 220);
    throw new ProviderError("PROVIDER_ERROR", "Grsai 中转返回的不是 JSON，请检查 Base URL 是否填写为官方 API 节点。", undefined, { endpoint, status: response.status, body: preview });
  }
}

async function requestJson(endpoint: string, apiKey: string, init?: RequestInit) {
  const response = await fetch(endpoint, {
    ...init,
    headers: {
      Authorization: `Bearer ${apiKey}`,
      Accept: "application/json",
      ...(init?.body ? { "Content-Type": "application/json" } : {}),
      ...init?.headers
    }
  });
  const json = await responseJson(response, endpoint);
  if (!response.ok) {
    const detail = json.error || json.message || `HTTP ${response.status}`;
    throw new ProviderError("PROVIDER_ERROR", `Grsai 中转调用失败：${detail}`, undefined, { endpoint, status: response.status, response: json });
  }
  return json;
}

async function imageAssetToBase64(assetId: string) {
  const asset = await ensureAssetLocalFile(await getAsset(assetId), "Grsai 图片中转引用的图片素材");
  const mimeType = asset.mimeType || "image/png";
  const data = fs.readFileSync(asset.localPath).toString("base64");
  return `data:${mimeType};base64,${data}`;
}

async function buildImageInputs(assetIds?: string[]) {
  if (!assetIds?.length) return [];
  return Promise.all(assetIds.slice(0, 10).map(imageAssetToBase64));
}

async function saveGrsaiImage(json: unknown): Promise<ProviderGenerateResult> {
  const image = extractImagePayload(json);
  if (!image) {
    throw new ProviderError("PROVIDER_ERROR", `Grsai 图片接口没有返回可识别的图片链接。返回结构：${summarizeImageResponseShape(json)}`, undefined, { response: json });
  }

  if (image.type === "base64") {
    const saved = await saveGeneratedBuffer({
      buffer: Buffer.from(image.value, "base64"),
      prefix: "image_grsai",
      extension: ".png",
      contentType: image.mimeType
    });
    return { status: "success", outputUrl: saved.outputUrl, localPath: saved.localPath, rawResponse: json, payloadSummary: { imageResponsePath: image.sourcePath } };
  }

  const saved = await downloadGeneratedFile(image.value, "image_grsai");
  return { status: "success", outputUrl: saved.outputUrl, localPath: saved.localPath, rawResponse: json, payloadSummary: { imageResponsePath: image.sourcePath } };
}

async function waitForResult(params: ImageProviderParams, task: GrsaiResponse) {
  if (!task.id) throw new ProviderError("PROVIDER_ERROR", "Grsai 中转返回运行中状态，但没有返回任务 ID。", undefined, { response: task });
  for (let attempt = 0; attempt < 45; attempt += 1) {
    await sleep(2000);
    const json = await requestJson(grsaiResultEndpoint(params.apiBaseUrl, task.id), params.apiKey, { method: "GET" });
    if (json.status === "succeeded") return json;
    if (json.status === "failed" || json.status === "violation") {
      throw new ProviderError("PROVIDER_ERROR", `Grsai 图片任务失败：${json.error || json.status}`, undefined, { response: json });
    }
  }
  throw new ProviderError("PROVIDER_ERROR", "Grsai 图片任务仍在生成中，请稍后重试或改用同步 json 模式。", undefined, { taskId: task.id, status: task.status });
}

export async function generateImageWithGrsai(params: ImageProviderParams): Promise<ProviderGenerateResult> {
  if (!params.apiKey || params.apiKey.includes("*")) {
    throw new Error("请先在设置中心填写 Grsai API Key。");
  }

  const body: Record<string, unknown> = {
    model: params.modelName,
    prompt: params.prompt,
    images: await buildImageInputs(params.imageAssetIds),
    aspectRatio: grsaiAspectValue(params.modelName, params.aspectRatio, params.imageSize),
    replyType: "json"
  };
  if (/nano[-_]?banana/i.test(params.modelName)) {
    body.imageSize = params.imageSize && params.imageSize !== "auto" ? params.imageSize : "1K";
  }

  const endpoint = grsaiGenerateEndpoint(params.apiBaseUrl);
  const initial = await requestJson(endpoint, params.apiKey, {
    method: "POST",
    body: JSON.stringify(body)
  });
  if (initial.status === "failed" || initial.status === "violation") {
    throw new ProviderError("PROVIDER_ERROR", `Grsai 图片任务失败：${initial.error || initial.status}`, undefined, { endpoint, request: { ...body, images: `[${(body.images as string[]).length} images]` }, response: initial });
  }
  const finalResponse = initial.status === "running" ? await waitForResult(params, initial) : initial;
  if (finalResponse.status !== "succeeded") {
    throw new ProviderError("PROVIDER_ERROR", `Grsai 图片任务状态异常：${finalResponse.status || "未知"}`, undefined, { endpoint, response: finalResponse });
  }
  return saveGrsaiImage(finalResponse);
}
