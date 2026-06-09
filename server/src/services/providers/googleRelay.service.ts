import fs from "node:fs";
import path from "node:path";
import { getAsset } from "../asset.service.js";
import { downloadGeneratedFile, saveGeneratedBuffer } from "../../utils/downloadGeneratedFile.js";
import { ProviderError, rawErrorMessage } from "../../utils/providerErrors.js";
import type { ImageProviderParams, ProviderGenerateResult, TextProviderParams } from "./providerTypes.js";

export function isGoogleRelayEndpoint(apiBaseUrl?: string) {
  if (!apiBaseUrl) return false;
  try {
    return new URL(apiBaseUrl).hostname !== "generativelanguage.googleapis.com";
  } catch {
    return false;
  }
}

function relayRoot(apiBaseUrl: string) {
  const parsed = new URL(apiBaseUrl);
  return `${parsed.origin}${parsed.pathname.replace(/\/v1\/videos\/?$/i, "").replace(/\/v1beta\/?$/i, "").replace(/\/$/, "")}`;
}

function endpoint(apiBaseUrl: string, modelName: string) {
  return `${relayRoot(apiBaseUrl)}/v1beta/models/${encodeURIComponent(modelName)}:generateContent`;
}

function mimeTypeFromPath(filePath: string) {
  const extension = path.extname(filePath).toLowerCase();
  if (extension === ".png") return "image/png";
  if (extension === ".webp") return "image/webp";
  return "image/jpeg";
}

async function imageParts(assetIds?: string[]) {
  const parts: Array<Record<string, unknown>> = [];
  for (const assetId of assetIds ?? []) {
    const asset = await getAsset(assetId);
    if (!asset?.localPath || !fs.existsSync(asset.localPath)) {
      throw new ProviderError("MISSING_INPUT_ASSET", "Gemini 中转接口引用的图片素材不存在或已被删除。");
    }
    parts.push({
      inlineData: {
        mimeType: asset.mimeType || mimeTypeFromPath(asset.localPath),
        data: fs.readFileSync(asset.localPath).toString("base64")
      }
    });
  }
  return parts;
}

async function requestRelay(apiBaseUrl: string, apiKey: string, modelName: string, body: Record<string, unknown>) {
  const response = await fetch(endpoint(apiBaseUrl, modelName), {
    method: "POST",
    headers: {
      Authorization: `Bearer ${apiKey}`,
      "x-goog-api-key": apiKey,
      "Content-Type": "application/json"
    },
    body: JSON.stringify(body)
  });
  const text = await response.text();
  let payload: Record<string, unknown>;
  try {
    payload = JSON.parse(text) as Record<string, unknown>;
  } catch {
    throw new ProviderError("PROVIDER_ERROR", `Gemini 中转接口返回了无法解析的响应（HTTP ${response.status}）。`, text.slice(0, 1000));
  }
  if (!response.ok) {
    const nestedError = payload.error && typeof payload.error === "object" ? payload.error as Record<string, unknown> : undefined;
    const message = String(nestedError?.message ?? payload.message ?? text);
    throw new ProviderError(
      response.status === 401 || response.status === 403 ? "API_KEY_INVALID" : "PROVIDER_ERROR",
      `Gemini 中转接口调用失败：${message}`,
      text
    );
  }
  return payload;
}

function collectText(value: unknown): string[] {
  if (typeof value === "string") return [value];
  if (Array.isArray(value)) return value.flatMap(collectText);
  if (!value || typeof value !== "object") return [];
  const record = value as Record<string, unknown>;
  return Object.entries(record)
    .filter(([key]) => ["text", "outputText", "content", "parts", "candidates"].includes(key))
    .flatMap(([, nested]) => collectText(nested));
}

function findImage(value: unknown): { url?: string; data?: string; mimeType?: string } | undefined {
  if (Array.isArray(value)) {
    for (const item of value) {
      const found = findImage(item);
      if (found) return found;
    }
    return undefined;
  }
  if (!value || typeof value !== "object") return undefined;
  const record = value as Record<string, unknown>;
  const imageUrl = record.image_url ?? record.imageUrl;
  if (imageUrl && typeof imageUrl === "object" && typeof (imageUrl as Record<string, unknown>).url === "string") {
    return { url: (imageUrl as Record<string, unknown>).url as string };
  }
  if (typeof record.url === "string" && /^https?:\/\//i.test(record.url)) return { url: record.url };
  const inlineData = record.inlineData ?? record.inline_data;
  if (inlineData && typeof inlineData === "object") {
    const inline = inlineData as Record<string, unknown>;
    if (typeof inline.data === "string") {
      return {
        data: inline.data,
        mimeType: typeof inline.mimeType === "string" ? inline.mimeType : typeof inline.mime_type === "string" ? inline.mime_type : undefined
      };
    }
  }
  for (const nested of Object.values(record)) {
    const found = findImage(nested);
    if (found) return found;
  }
  return undefined;
}

export async function generateTextWithGoogleRelay(params: TextProviderParams): Promise<ProviderGenerateResult> {
  try {
    const parts: Array<Record<string, unknown>> = [
      { text: params.inputText || "请根据当前工作流上下文生成可用内容。" },
      ...await imageParts(params.imageAssetIds)
    ];
    const payload = await requestRelay(params.apiBaseUrl, params.apiKey, params.modelName, {
      contents: [{ role: "user", parts }],
      systemInstruction: params.systemPrompt ? { parts: [{ text: params.systemPrompt }] } : undefined
    });
    const outputText = collectText(payload).join("\n").trim();
    if (!outputText) throw new ProviderError("PROVIDER_ERROR", "Gemini 中转接口没有返回文本内容。", JSON.stringify(payload));
    return { status: "success", outputText, rawResponse: payload };
  } catch (error) {
    if (error instanceof ProviderError) throw error;
    throw new ProviderError("NETWORK_ERROR", "Gemini 中转接口网络请求失败。", rawErrorMessage(error));
  }
}

export async function generateImageWithGoogleRelay(params: ImageProviderParams): Promise<ProviderGenerateResult> {
  try {
    const parts: Array<Record<string, unknown>> = [
      ...await imageParts(params.imageAssetIds),
      { text: params.prompt }
    ];
    const payload = await requestRelay(params.apiBaseUrl, params.apiKey, params.modelName, {
      contents: [{ role: "user", parts }],
      generationConfig: {
        responseModalities: ["IMAGE"],
        imageConfig: {
          aspectRatio: params.aspectRatio,
          imageSize: params.imageSize && params.imageSize !== "auto" ? params.imageSize : undefined
        }
      }
    });
    const image = findImage(payload);
    if (image?.url) {
      const saved = await downloadGeneratedFile(image.url, "image_google_relay");
      return { status: "success", outputUrl: saved.outputUrl, localPath: saved.localPath, rawResponse: payload };
    }
    if (image?.data) {
      const saved = await saveGeneratedBuffer({
        buffer: Buffer.from(image.data, "base64"),
        prefix: "image_google_relay",
        contentType: image.mimeType
      });
      return { status: "success", outputUrl: saved.outputUrl, localPath: saved.localPath, rawResponse: payload };
    }
    throw new ProviderError("PROVIDER_ERROR", "Gemini 图片中转接口没有返回图片 URL 或图片数据。", JSON.stringify(payload));
  } catch (error) {
    if (error instanceof ProviderError) throw error;
    throw new ProviderError("NETWORK_ERROR", "Gemini 图片中转接口网络请求失败。", rawErrorMessage(error));
  }
}
