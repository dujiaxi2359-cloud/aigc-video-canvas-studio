import { NextResponse } from "next/server";
import type { ApiProvider } from "@/lib/apiKey/apiKeyTypes";
import { normalizeOpenAICompatibleBaseURL } from "@/lib/apiKey/openaiClientFromRequest";
import { defaultImageModel, isLegacyDallEModel } from "@/lib/apiKey/userApiKey";
import { addServerLog } from "@/lib/server-logs";

export const runtime = "nodejs";

function classifyStatus(status: number, fallback?: string) {
  if (status === 400) return fallback || "400 Bad request：请求参数不正确。";
  if (status === 401) return "401 Unauthorized：API Key 无效、缺失或已过期。";
  if (status === 403) return "403 Permission denied：权限不足、地区限制或模型权限未开通。";
  if (status === 404) return "404 Model not found：模型、Deployment 或 Base URL 不存在。";
  if (status === 429) return "429 Rate limit：请求过多或额度不足。";
  if (status === 503) return fallback || "503 Service unavailable：当前模型没有可用通道。";
  if (status >= 500) return `${status} Server error：服务端或上游接口异常。`;
  return fallback || `HTTP ${status}`;
}

function extractErrorMessage(payload: unknown, fallback: string) {
  if (!payload || typeof payload !== "object") return fallback;
  const record = payload as {
    error?: string | { message?: string; code?: string; type?: string };
    message?: string;
  };
  if (typeof record.error === "string") return record.error;
  if (record.error?.message) return record.error.message;
  if (record.message) return record.message;
  return fallback;
}

function firstUsableOpenAIImageModel(...models: Array<string | undefined>) {
  for (const model of models) {
    const trimmed = model?.trim() || "";
    if (!trimmed) continue;
    if (isLegacyDallEModel(trimmed)) continue;
    if (trimmed.toLowerCase() === "auto") continue;
    return trimmed;
  }
  return defaultImageModel;
}

async function readJsonResponse(response: Response) {
  const text = await response.text();
  if (!text) return {};

  try {
    return JSON.parse(text) as unknown;
  } catch {
    throw new Error(`JSON parse error：接口返回的不是有效 JSON。状态码 ${response.status}，内容：${text.slice(0, 180)}`);
  }
}

function classifyError(error: unknown) {
  const message = error instanceof Error ? error.message : String(error);
  const lower = message.toLowerCase();
  if (lower.includes("401") || lower.includes("unauthorized")) return classifyStatus(401);
  if (lower.includes("403")) return classifyStatus(403);
  if (lower.includes("404")) return classifyStatus(404);
  if (lower.includes("429") || lower.includes("rate limit")) return classifyStatus(429);
  if (lower.includes("503") || lower.includes("available channel")) return classifyStatus(503, message);
  if (lower.includes("500")) return classifyStatus(500);
  if (lower.includes("json parse")) return message;
  if (lower.includes("timeout") || lower.includes("timed out") || lower.includes("abort")) return "Network error：连接超时。";
  if (lower.includes("dns") || lower.includes("enotfound")) return "Network error：DNS 解析失败。";
  if (lower.includes("fetch failed") || lower.includes("network")) return "Network error：网络连接失败。";
  if (lower.includes("invalid url") || lower.includes("base")) return "Base URL 缺失或格式错误。";
  return message;
}

async function fetchWithTimeout(url: string, init: RequestInit = {}) {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), 12_000);
  try {
    return await fetch(url, { ...init, signal: controller.signal });
  } finally {
    clearTimeout(timer);
  }
}

async function assertOkJson(response: Response) {
  const payload = await readJsonResponse(response);
  if (!response.ok) {
    const upstreamMessage = extractErrorMessage(payload, response.statusText);
    throw new Error(classifyStatus(response.status, upstreamMessage));
  }
  return payload;
}

function cleanURL(value?: string) {
  const trimmed = value?.trim() || "";
  if (!trimmed || !/^https?:\/\//i.test(trimmed)) return "";
  return trimmed.replace(/\/$/, "");
}

function parseAzureEndpoint(endpoint?: string) {
  const cleaned = cleanURL(endpoint);
  if (!cleaned || !cleaned.includes("cognitiveservices.azure.com")) return null;

  try {
    const url = new URL(cleaned);
    const deployment = url.pathname.match(/\/deployments\/([^/]+)/)?.[1] || "";
    const endpointPath = url.pathname.split("/openai/")[0] || "";
    return {
      endpoint: `${url.origin}${endpointPath}`.replace(/\/?$/, "/"),
      deployment,
      apiVersion: url.searchParams.get("api-version") || "",
    };
  } catch {
    return null;
  }
}

export async function GET() {
  return NextResponse.json({
    ok: true,
    type: "customer-key",
    message: "当前版本只使用客户自己的 Azure OpenAI 或 OpenAI 兼容接口配置。",
  });
}

export async function POST(request: Request) {
  const body = (await request.json().catch(() => ({}))) as {
    apiProvider?: ApiProvider;
    apiKey?: string;
    baseURL?: string;
    azureEndpoint?: string;
    azureDeployment?: string;
    azureApiVersion?: string;
    textModel?: string;
    imageModel?: string;
    googleBananaModel?: string;
  };

  const provider =
    body.apiProvider === "azure" || body.apiProvider === "azure-openai"
      ? "azure"
      : body.apiProvider === "banana" || body.apiProvider === "google-banana"
        ? "google-banana"
        : "openai";
  const apiKey = body.apiKey?.trim() || "";
  const requestedImageModel =
    provider === "google-banana"
      ? body.googleBananaModel?.trim() || body.imageModel?.trim() || "banana-pro"
      : firstUsableOpenAIImageModel(
          body.imageModel,
          body.azureDeployment,
          process.env.OPENAI_IMAGE_MODEL,
          defaultImageModel,
        );

  if (!requestedImageModel) {
    return NextResponse.json(
      {
        ok: false,
        error: `Image Model 缺失：请在设置中心填写当前接口支持的图片模型，例如 ${defaultImageModel}。`,
        model: "",
      },
      { status: 400 },
    );
  }

  if (provider !== "google-banana" && isLegacyDallEModel(requestedImageModel)) {
    return NextResponse.json(
      {
        ok: false,
        error: `当前模型 ${requestedImageModel} 没有可用通道，请在设置中心更换为 ${defaultImageModel} 或当前接口支持的模型。`,
        model: requestedImageModel,
      },
      { status: 400 },
    );
  }

  if (requestedImageModel.toLowerCase() === "auto") {
    return NextResponse.json(
      {
        ok: false,
        error: "当前模型/通道不能使用 auto。请在设置中心明确填写可用的 Image Model。",
        model: requestedImageModel,
      },
      { status: 400 },
    );
  }

  addServerLog("info", "api.check-openai", "Testing image provider connection", {
    provider,
    model: requestedImageModel,
    hasApiKey: Boolean(apiKey),
    hasBaseURL: Boolean(body.baseURL?.trim()),
    hasAzureEndpoint: Boolean(body.azureEndpoint?.trim()),
    hasTextModel: Boolean(body.textModel?.trim()),
  });

  if (!apiKey) {
    return NextResponse.json(
      { ok: false, error: "API Key 缺失：请先填写客户自己的 API Key。" },
      { status: 400 },
    );
  }

  if (provider === "google-banana") {
    let baseURL = "";
    try {
      baseURL = normalizeOpenAICompatibleBaseURL(body.baseURL) || "";
    } catch (error) {
      const message = classifyError(error);
      return NextResponse.json({ ok: false, error: message }, { status: 400 });
    }
    if (!baseURL) {
      return NextResponse.json(
        { ok: false, error: "Google Banana 需要填写 Base URL，模型可选择 Banana 2 或 Banana Pro。" },
        { status: 400 },
      );
    }

    try {
      const response = await fetchWithTimeout(`${baseURL}/models/${requestedImageModel}`, {
        headers: { Authorization: `Bearer ${apiKey}` },
      });
      await assertOkJson(response);
      addServerLog("success", "api.check-openai", "Banana connection test passed", {
        provider,
        model: requestedImageModel,
        hasBaseURL: true,
        status: response.status,
      });
      return NextResponse.json({
        ok: true,
        type: "google-banana",
        message: "接口连接正常",
        baseURL,
        model: requestedImageModel,
      });
    } catch (error) {
      const message = classifyError(error);
      addServerLog("error", "api.check-openai", "Banana connection test failed", {
        provider,
        model: requestedImageModel,
        hasBaseURL: true,
        error: message,
      });
      return NextResponse.json({ ok: false, error: message, baseURL, model: requestedImageModel }, { status: 502 });
    }
  }

  if (provider === "azure") {
    const parsedAzure = parseAzureEndpoint(body.azureEndpoint) || parseAzureEndpoint(body.baseURL);
    if (parsedAzure) {
      const deployment = parsedAzure.deployment || body.azureDeployment?.trim() || "";
      const apiVersion = parsedAzure.apiVersion || body.azureApiVersion?.trim() || "";
      if (!deployment) {
        return NextResponse.json(
          { ok: false, error: "客户 Azure 模式需要填写 Deployment，例如 gpt-image-2。" },
          { status: 400 },
        );
      }
      if (isLegacyDallEModel(deployment)) {
        return NextResponse.json(
          { ok: false, error: `当前模型 ${deployment} 没有可用通道，请在设置中心更换为 ${defaultImageModel} 或当前接口支持的模型。`, model: deployment },
          { status: 400 },
        );
      }
      if (deployment.toLowerCase() === "auto") {
        return NextResponse.json(
          { ok: false, error: "Azure Deployment 不能使用 auto。请在设置中心填写真实 Deployment Name。", model: deployment },
          { status: 400 },
        );
      }
      if (!apiVersion) {
        return NextResponse.json(
          { ok: false, error: "Azure API Version 缺失，请填写 API Version。" },
          { status: 400 },
        );
      }

      try {
        const endpoint = parsedAzure.endpoint.replace(/\/$/, "");
        const response = await fetchWithTimeout(
          `${endpoint}/openai/deployments/${encodeURIComponent(deployment)}?api-version=${encodeURIComponent(apiVersion)}`,
          { headers: { "api-key": apiKey } },
        );
        await assertOkJson(response);
        addServerLog("success", "api.check-openai", "Azure connection test passed", {
          provider,
          deployment,
          hasEndpoint: true,
          apiVersion,
          status: response.status,
        });

        return NextResponse.json({
          ok: true,
          type: "azure",
          message: "接口连接正常",
          endpoint: parsedAzure.endpoint,
          deployment,
          apiVersion,
          model: deployment,
        });
      } catch (error) {
        const message = classifyError(error);
        addServerLog("error", "api.check-openai", "Azure connection test failed", {
          provider,
          deployment,
          hasEndpoint: true,
          apiVersion,
          error: message,
        });

        return NextResponse.json(
          { ok: false, error: message, endpoint: parsedAzure.endpoint, model: deployment },
          { status: 502 },
        );
      }
    }

    return NextResponse.json(
      {
        ok: false,
        error:
          "Azure Endpoint 缺失或格式错误。Azure 模式请填写 https://xxx.cognitiveservices.azure.com/，OpenAI 兼容中转请切换到 OpenAI。",
      },
      { status: 400 },
    );
  }

  let baseURL = "";
  try {
    baseURL =
      normalizeOpenAICompatibleBaseURL(body.baseURL || body.azureEndpoint) ||
      "https://api.openai.com/v1";
  } catch (error) {
    const message = classifyError(error);
    return NextResponse.json({ ok: false, error: message }, { status: 400 });
  }

  try {
    const response = await fetchWithTimeout(`${baseURL}/models/${requestedImageModel}`, {
      headers: { Authorization: `Bearer ${apiKey}` },
    });
    await assertOkJson(response);

    if (body.textModel?.trim()) {
      const textResponse = await fetchWithTimeout(`${baseURL}/models/${body.textModel.trim()}`, {
        headers: { Authorization: `Bearer ${apiKey}` },
      });
      await assertOkJson(textResponse);
    }

    addServerLog("success", "api.check-openai", "OpenAI-compatible connection test passed", {
      provider,
      model: requestedImageModel,
      textModel: body.textModel?.trim() || undefined,
      hasBaseURL: true,
      status: response.status,
    });

    return NextResponse.json({
      ok: true,
      type: "openai",
      message: "接口连接正常",
      baseURL,
      model: requestedImageModel,
    });
  } catch (error) {
    const message = classifyError(error);
    addServerLog("error", "api.check-openai", "OpenAI-compatible connection test failed", {
      provider,
      model: requestedImageModel,
      textModel: body.textModel?.trim() || undefined,
      hasBaseURL: true,
      error: message,
    });

    return NextResponse.json(
      { ok: false, error: message, baseURL, model: requestedImageModel },
      { status: 502 },
    );
  }
}
