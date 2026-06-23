import fs from "node:fs";
import { downloadGeneratedFile, saveGeneratedBuffer } from "../../utils/downloadGeneratedFile.js";
import { aspectRatioToOpenAIImageSize } from "../../utils/imageAspectRatio.js";
import { extractImagePayload, summarizeImageResponseShape } from "../../utils/imageResponseExtractor.js";
import { readGeneratedFileMetadata } from "../../utils/mediaMetadata.js";
import { ProviderError } from "../../utils/providerErrors.js";
import { getAsset } from "../asset.service.js";
import { resolveRemoteAsset, readLocalFileAsBase64 } from "../assets/resolveRemoteAsset.service.js";
import type { ImageProviderParams, ProviderGenerateResult } from "./providerTypes.js";

function configuredApiVersion() {
  return process.env.AZURE_OPENAI_API_VERSION || "preview";
}

function cleanAzureEndpoint(value?: string) {
  const clean = value?.trim().replace(/\/$/, "");
  if (!clean || clean === "-") {
    throw new ProviderError(
      "AZURE_ENDPOINT_MISSING",
      "Azure endpoint 缺失。请在模型配置里填写 Azure OpenAI / Microsoft Foundry 的资源终结点，不要填写 proxy 地址。"
    );
  }
  if (/api\.openai\.com/i.test(clean)) {
    throw new ProviderError("AZURE_ENDPOINT_INVALID", "Azure GPT Image 不能使用 api.openai.com，请填写 Azure OpenAI 资源 endpoint。");
  }
  if (/127\.0\.0\.1|localhost/i.test(clean)) {
    throw new ProviderError("AZURE_ENDPOINT_INVALID", "Azure endpoint 不能填写本地代理地址。代理请在网络设置里配置，endpoint 应是 https://xxx.openai.azure.com。");
  }
  if (!/^https?:\/\//i.test(clean)) {
    throw new ProviderError("AZURE_ENDPOINT_INVALID", "Azure endpoint 必须是完整 URL，例如 https://你的资源名.openai.azure.com。");
  }
  return clean;
}

function appendApiVersion(endpoint: string, apiVersion: string) {
  const url = new URL(endpoint);
  const current = url.searchParams.get("api-version");
  if (!current || /^2024-/i.test(current)) url.searchParams.set("api-version", apiVersion);
  return url.toString();
}

function pathForKind(kind: "generations" | "edits") {
  return kind === "generations" ? "images/generations" : "images/edits";
}

export function resolveAzureImageEndpoint(input: {
  endpoint?: string;
  deploymentName?: string;
  apiVersion?: string;
  kind: "generations" | "edits";
}) {
  const apiVersion = input.apiVersion || configuredApiVersion();
  const clean = cleanAzureEndpoint(input.endpoint);
  const kindPath = pathForKind(input.kind);

  if (clean.includes("/images/generations") || clean.includes("/images/edits")) {
    const switched = input.kind === "edits"
      ? clean.replace("/images/generations", "/images/edits")
      : clean.replace("/images/edits", "/images/generations");
    return appendApiVersion(switched, apiVersion);
  }

  if (clean.includes("/openai/deployments/")) {
    const base = clean.replace(/\/$/, "");
    return appendApiVersion(`${base}/${kindPath}`, apiVersion);
  }

  if (clean.includes("/openai/v1")) {
    return appendApiVersion(`${clean}/${kindPath}`, apiVersion);
  }

  if (!input.deploymentName?.trim()) {
    throw new ProviderError("AZURE_DEPLOYMENT_MISSING", "Azure Deployment Name / 部署名缺失，请填写 Azure AI Foundry 中的部署名称。");
  }

  return appendApiVersion(
    `${clean}/openai/deployments/${encodeURIComponent(input.deploymentName.trim())}/${kindPath}`,
    apiVersion
  );
}

function endpointUsesDeploymentPath(endpoint: string) {
  return endpoint.includes("/openai/deployments/");
}

function endpointHost(endpoint: string) {
  try {
    return new URL(endpoint).host;
  } catch {
    return endpoint;
  }
}

function mapAspectRatioToAzureSize(aspectRatio?: string, modelName?: string, imageSize?: string) {
  return aspectRatioToOpenAIImageSize(aspectRatio, modelName, imageSize);
}

function isUnsupportedSizeError(message: string) {
  return /invalid.*size|size must be one of|unsupported.*size|invalid_value/i.test(message) && /size/i.test(message);
}

function fallbackImageSize(size?: string) {
  if (size === "2160x3840") return "1080x1920";
  if (size === "1080x1920") return "720x1280";
  if (size === "3840x2160") return "1920x1080";
  if (size === "1920x1080") return "1280x720";
  if (size === "2880x2160") return "2048x1536";
  if (size === "2048x1536") return "1365x1024";
  if (size === "2160x2880") return "1536x2048";
  if (size === "1536x2048") return "1024x1365";
  if (size === "2048x2048") return "1024x1024";
  return undefined;
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
  if (lower.includes("fetch failed") || lower.includes("network") || lower.includes("econn") || lower.includes("dns") || lower.includes("timeout")) {
    return new ProviderError("NETWORK_ERROR", "Azure OpenAI 网络请求失败，请检查 endpoint、代理、网络连接以及 Azure OpenAI 服务是否可访问。", message);
  }
  return new ProviderError("PROVIDER_ERROR", "Azure OpenAI 图片生成失败。", message);
}

async function saveAzureImage(json: unknown, format?: string): Promise<ProviderGenerateResult> {
  const image = extractImagePayload(json);
  if (!image) {
    throw new ProviderError(
      "PROVIDER_ERROR",
      "Azure OpenAI 图片接口没有返回可识别的图片字段（已检查 b64_json、url、image_url、output_url、base64 等）。",
      summarizeImageResponseShape(json)
    );
  }

  if (image.type === "base64") {
    const saved = await saveGeneratedBuffer({
      buffer: Buffer.from(image.value, "base64"),
      prefix: "image_azure_openai",
      extension: extensionFor(format),
      contentType: image.mimeType
    });
    return { status: "success", outputUrl: saved.outputUrl, localPath: saved.localPath, rawResponse: json, payloadSummary: { imageResponsePath: image.sourcePath } };
  }

  const saved = await downloadGeneratedFile(image.value, "image_azure_openai");
  return { status: "success", outputUrl: saved.outputUrl, localPath: saved.localPath, rawResponse: json, payloadSummary: { imageResponsePath: image.sourcePath } };
}

export async function generateImageWithAzureOpenAI(params: ImageProviderParams): Promise<ProviderGenerateResult> {
  if (!params.apiKey) throw new ProviderError("API_KEY_INVALID", "请先在设置中心配置 Azure OpenAI API Key。");
  if (params.apiKey.includes("*")) throw new ProviderError("API_KEY_INVALID", "Azure OpenAI API Key 读取到的是 maskedKey，请在设置中心重新填写完整 API Key。");

  const apiVersion = configuredApiVersion();
  const endpoint = resolveAzureImageEndpoint({
    endpoint: params.apiBaseUrl,
    deploymentName: params.modelName,
    apiVersion,
    kind: params.inputMode === "text-to-image" ? "generations" : "edits"
  });
  const usesDeploymentPath = endpointUsesDeploymentPath(endpoint);

  console.log("[Azure OpenAI Image] request", {
    endpointHost: endpointHost(endpoint),
    requestPath: new URL(endpoint).pathname,
    hasApiKey: Boolean(params.apiKey),
    keyLength: params.apiKey.length,
    deploymentName: params.modelName,
    apiVersion,
    usesAzureEndpoint: true,
    usesOpenAIPlatformEndpoint: false
  });

  try {
    let response: Response;
    const requestedSize = mapAspectRatioToAzureSize(params.aspectRatio, params.modelName, params.imageSize);
    if (params.inputMode === "text-to-image") {
      const body: Record<string, unknown> = {
        prompt: params.prompt,
        n: Math.max(1, params.generateCount || 1)
      };
      if (requestedSize) body.size = requestedSize;
      if (!usesDeploymentPath) body.model = params.modelName;
      if (params.imageQuality && params.imageQuality !== "auto") body.quality = params.imageQuality;
      response = await fetch(endpoint, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          "api-key": params.apiKey
        },
        body: JSON.stringify(body)
      });
      if (!response.ok) {
        const message = await readError(response);
        const fallbackSize = fallbackImageSize(requestedSize);
        if (fallbackSize && isUnsupportedSizeError(message)) {
          response = await fetch(endpoint, {
            method: "POST",
            headers: {
              "Content-Type": "application/json",
              "api-key": params.apiKey
            },
            body: JSON.stringify({ ...body, size: fallbackSize })
          });
        } else {
          throw classifyAzureError(message);
        }
      }
    } else {
      if (!params.imageAssetIds?.length) throw new ProviderError("MISSING_INPUT_ASSET", "Azure 图片编辑需要连接一张图片素材。");
      const buildForm = async (size?: string) => {
        const form = new FormData();
        if (!usesDeploymentPath) form.set("model", params.modelName);
        form.set("prompt", params.prompt);
        form.set("n", String(Math.max(1, params.generateCount || 1)));
        if (size) form.set("size", size);
        if (params.imageQuality && params.imageQuality !== "auto") form.set("quality", params.imageQuality);
        for (const assetId of params.imageAssetIds!.slice(0, 16)) {
          const asset = await getAsset(assetId);
          if (!asset) throw new ProviderError("MISSING_INPUT_ASSET", "Azure 图片编辑引用的图片素材不存在或已被删除。");
          const resolved = await resolveRemoteAsset(
            { localPath: asset.localPath, url: asset.url, filename: asset.originalName, mimeType: asset.mimeType },
            "azure-openai",
            "image-edit"
          );
          if (resolved.type !== "multipart" || !resolved.localPath || !fs.existsSync(resolved.localPath)) {
            throw new ProviderError("ADAPTER_NOT_IMPLEMENTED", "Azure 图片编辑当前需要 multipart 原图文件输入。");
          }
          const metadata = await readGeneratedFileMetadata(resolved.localPath);
          console.log("[Azure OpenAI Image] input asset", {
            assetId,
            inputImageWidth: metadata.width,
            inputImageHeight: metadata.height,
            inputImageFileSize: metadata.fileSize,
            usesPreviewUrl: false,
            usesOriginalFile: true
          });
          const blob = new Blob([Buffer.from(readLocalFileAsBase64(resolved.localPath), "base64")], { type: resolved.mimeType });
          form.append("image", blob, resolved.filename);
        }
        return form;
      };
      response = await fetch(endpoint, {
        method: "POST",
        headers: { "api-key": params.apiKey },
        body: await buildForm(requestedSize)
      });
      if (!response.ok) {
        const message = await readError(response);
        const fallbackSize = fallbackImageSize(requestedSize);
        if (fallbackSize && isUnsupportedSizeError(message)) {
          response = await fetch(endpoint, {
            method: "POST",
            headers: { "api-key": params.apiKey },
            body: await buildForm(fallbackSize)
          });
        } else {
          throw classifyAzureError(message);
        }
      }
    }

    if (!response.ok) throw classifyAzureError(await readError(response));
    const result = await saveAzureImage(await response.json(), params.imageFormat);
    return {
      ...result,
      payloadSummary: {
        ...(result.payloadSummary && typeof result.payloadSummary === "object" ? result.payloadSummary as Record<string, unknown> : {}),
        providerId: "azure-openai",
        modelId: params.catalogModelId,
        deploymentName: params.modelName,
        endpointHost: endpointHost(endpoint),
        apiVersion,
        requestPath: new URL(endpoint).pathname,
        usesAzureEndpoint: true,
        usesOpenAIPlatformEndpoint: false,
        proxyEnabled: Boolean(process.env.HTTPS_PROXY || process.env.HTTP_PROXY || process.env.ALL_PROXY || process.env.MANUAL_PROXY_URL)
      }
    };
  } catch (error) {
    if (error instanceof ProviderError) throw error;
    throw classifyAzureError(error instanceof Error ? error.message : String(error));
  }
}
