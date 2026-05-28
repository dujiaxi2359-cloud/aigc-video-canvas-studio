import { downloadGeneratedFile, saveGeneratedBuffer } from "../../utils/downloadGeneratedFile.js";
import { normalizeImageAspectRatio } from "../../utils/imageAspectRatio.js";
import { ProviderError } from "../../utils/providerErrors.js";
import { getAsset } from "../asset.service.js";
import { resolveRemoteAsset, readLocalFileAsBase64 } from "../assets/resolveRemoteAsset.service.js";
import type { ImageProviderParams, ProviderGenerateResult } from "./providerTypes.js";

function resolveAzureImageEndpoint(apiBaseUrl: string, azureApiVersion?: string) {
  const clean = apiBaseUrl.trim();
  if (clean.includes("/images/generations")) return clean;
  return `${clean.replace(/\/$/, "")}/openai/v1/images/generations?api-version=${azureApiVersion || "preview"}`;
}

function resolveAzureEditEndpoint(apiBaseUrl: string, azureApiVersion?: string) {
  const clean = apiBaseUrl.trim();
  if (clean.includes("/images/edits")) return clean;
  if (clean.includes("/images/generations")) return clean.replace("/images/generations", "/images/edits");
  return `${clean.replace(/\/$/, "")}/openai/v1/images/edits?api-version=${azureApiVersion || "preview"}`;
}

function mapAspectRatioToAzureSize(aspectRatio?: string) {
  switch (normalizeImageAspectRatio(aspectRatio)) {
    case "1:1":
      return "1024x1024";
    case "3:4":
    case "9:16":
      return "1024x1536";
    case "4:3":
    case "16:9":
      return "1536x1024";
    default:
      return "1024x1024";
  }
}

function extensionFor(format?: string) {
  if (format === "jpeg") return ".jpg";
  if (format === "webp") return ".webp";
  return ".png";
}

async function readError(response: Response) {
  const text = await response.text();
  try {
    const json = JSON.parse(text) as { error?: { message?: string; code?: string }; message?: string };
    return json.error?.message ?? json.message ?? text;
  } catch {
    return text;
  }
}

function classifyAzureError(message: string): ProviderError {
  const lower = message.toLowerCase();
  if (lower.includes("deployment") || lower.includes("not found") || lower.includes("resource not found") || lower.includes("404")) {
    return new ProviderError(
      "AZURE_DEPLOYMENT_NOT_FOUND",
      "Azure OpenAI Deployment Name / 部署名不正确，或 endpoint 路径与资源不匹配。请检查 API Base URL、API Key、Deployment Name、api-version。",
      message
    );
  }
  if (lower.includes("401") || lower.includes("403") || lower.includes("unauthorized") || lower.includes("forbidden") || lower.includes("api key")) {
    return new ProviderError(
      "API_KEY_INVALID",
      "Azure OpenAI API Key 无效，或当前 Azure 资源没有该 GPT Image 部署权限。请检查 API Base URL、API Key、Deployment Name 和 api-version。",
      message
    );
  }
  if (lower.includes("fetch failed") || lower.includes("network") || lower.includes("econn") || lower.includes("dns")) {
    return new ProviderError("NETWORK_ERROR", "Azure OpenAI 网络请求失败，请检查 endpoint、代理、网络连接以及 Azure OpenAI 服务是否可访问。", message);
  }
  return new ProviderError("PROVIDER_ERROR", "Azure OpenAI 图片生成失败。", message);
}

async function saveAzureImage(json: unknown, format?: string): Promise<ProviderGenerateResult> {
  const result = json as { data?: Array<{ b64_json?: string; url?: string }> };
  const first = result.data?.[0];
  if (!first) throw new ProviderError("PROVIDER_ERROR", "Azure OpenAI 图片接口没有返回图片数据。", JSON.stringify(json));

  if (first.b64_json) {
    const saved = await saveGeneratedBuffer({
      buffer: Buffer.from(first.b64_json, "base64"),
      prefix: "image_azure_openai",
      extension: extensionFor(format)
    });
    return { status: "success", outputUrl: saved.outputUrl, localPath: saved.localPath, rawResponse: json };
  }

  if (first.url) {
    const saved = await downloadGeneratedFile(first.url, "image_azure_openai");
    return { status: "success", outputUrl: saved.outputUrl, localPath: saved.localPath, rawResponse: json };
  }

  throw new ProviderError("PROVIDER_ERROR", "Azure OpenAI 图片接口没有返回 b64_json 或 url。", JSON.stringify(json));
}

export async function generateImageWithAzureOpenAI(params: ImageProviderParams): Promise<ProviderGenerateResult> {
  if (!params.apiKey) throw new ProviderError("API_KEY_INVALID", "请先在设置中心配置 Azure OpenAI API Key。");
  if (params.apiKey.includes("*")) throw new ProviderError("API_KEY_INVALID", "Azure OpenAI API Key 读取到的是 maskedKey，请在设置中心重新填写完整 API Key。");
  if (!params.apiBaseUrl) throw new ProviderError("PROVIDER_ERROR", "Azure GPT Image 需要填写 API Base URL，例如：https://你的资源名.openai.azure.com");

  const endpoint = params.inputMode === "text-to-image"
    ? resolveAzureImageEndpoint(params.apiBaseUrl, process.env.AZURE_OPENAI_API_VERSION)
    : resolveAzureEditEndpoint(params.apiBaseUrl, process.env.AZURE_OPENAI_API_VERSION);
  console.log("[Azure OpenAI Image] request", {
    endpoint,
    hasApiKey: Boolean(params.apiKey),
    keyPrefix: params.apiKey.slice(0, 7),
    keyLength: params.apiKey.length,
    deploymentName: params.modelName
  });

  try {
    let response: Response;
    if (params.inputMode === "text-to-image") {
      const body: Record<string, unknown> = {
        model: params.modelName,
        prompt: params.prompt,
        n: Math.max(1, params.generateCount || 1),
        size: mapAspectRatioToAzureSize(params.aspectRatio)
      };
      if (params.imageQuality && params.imageQuality !== "auto") body.quality = params.imageQuality;
      response = await fetch(endpoint, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          "api-key": params.apiKey
        },
        body: JSON.stringify(body)
      });
    } else {
      if (!params.imageAssetIds?.length) throw new ProviderError("MISSING_INPUT_ASSET", "Azure 图片编辑需要连接一张图片素材。");
      const form = new FormData();
      form.set("model", params.modelName);
      form.set("prompt", params.prompt);
      form.set("n", String(Math.max(1, params.generateCount || 1)));
      form.set("size", mapAspectRatioToAzureSize(params.aspectRatio));
      if (params.imageQuality && params.imageQuality !== "auto") form.set("quality", params.imageQuality);
      for (const assetId of params.imageAssetIds.slice(0, 16)) {
        const asset = await getAsset(assetId);
        if (!asset) throw new ProviderError("MISSING_INPUT_ASSET", "Azure 图片编辑引用的图片素材不存在或已被删除。");
        const resolved = await resolveRemoteAsset({ localPath: asset.localPath, url: asset.url, filename: asset.originalName }, "azure-openai", "image-edit");
        if (resolved.type !== "multipart" || !resolved.localPath) throw new ProviderError("ADAPTER_NOT_IMPLEMENTED", "Azure 图片编辑当前需要 multipart 文件输入。");
        const blob = new Blob([Buffer.from(readLocalFileAsBase64(resolved.localPath), "base64")], { type: resolved.mimeType });
        form.append("image", blob, resolved.filename);
      }
      response = await fetch(endpoint, {
        method: "POST",
        headers: { "api-key": params.apiKey },
        body: form
      });
    }

    if (!response.ok) throw classifyAzureError(await readError(response));
    return saveAzureImage(await response.json(), params.imageFormat);
  } catch (error) {
    if (error instanceof ProviderError) throw error;
    throw classifyAzureError(error instanceof Error ? error.message : String(error));
  }
}
