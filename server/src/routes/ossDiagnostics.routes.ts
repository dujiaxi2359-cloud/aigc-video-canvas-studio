import { Router } from "express";
import { testOssConnection } from "../services/assets/ossUpload.service.js";
import { getProxyInfo } from "../utils/proxy.js";
import { ProviderError } from "../utils/providerErrors.js";
import { localAdminOnly } from "../utils/localAdminRequest.js";

export const ossDiagnosticsRouter = Router();

function ossSuggestion(code: string) {
  switch (code) {
    case "OSS_CONFIG_MISSING":
      return "请检查 .env 中 OSS_ACCESS_KEY_ID、OSS_ACCESS_KEY_SECRET、OSS_BUCKET、OSS_REGION、OSS_ENDPOINT 是否已配置，并重启后端。";
    case "OSS_ACCESS_DENIED":
      return "请给 RAM 用户添加 OSS PutObject、GetObject、ListBucket 权限，并确认 Bucket Policy 允许该 RAM 用户访问。";
    case "OSS_BUCKET_NOT_FOUND":
      return "请确认 OSS_BUCKET 只填写 Bucket 名称，例如 aigc-video-temp-dujiaxi，不要填写完整 URL。";
    case "OSS_ACCESS_KEY_INVALID":
      return "请在阿里云 RAM 访问控制里复制 AccessKey ID，不要填写 RAM 用户名或 Bucket 名称。";
    case "OSS_ACCESS_KEY_DISABLED":
      return "请在 RAM 访问控制中启用该 RAM 用户和 AccessKey；如果无法启用，请新建一个可用 AccessKey，更新 .env 后重启后端。";
    case "OSS_ACCESS_KEY_SECRET_INVALID":
      return "请重新复制 AccessKey Secret；如果 Secret 已丢失，需要新建或轮换 AccessKey。";
    case "OSS_REGION_ENDPOINT_MISMATCH":
      return "请到 OSS Bucket 概览查看实际地域，并填写对应 Endpoint，例如北京为 https://oss-cn-beijing.aliyuncs.com。";
    case "OSS_ENDPOINT_INVALID":
      return "请检查 OSS_ENDPOINT 拼写，例如 https://oss-cn-beijing.aliyuncs.com。";
    case "OSS_NETWORK_ERROR":
      return "请确认 Node 后端能访问 OSS endpoint；如果使用代理/VPN，请检查后端代理配置或 TUN 模式。";
    default:
      return "请检查 OSS Bucket、Region/Endpoint、AccessKey 权限和网络连接。";
  }
}

async function handleOssHealth(_req: unknown, res: any) {
  try {
    res.json(await testOssConnection());
  } catch (error) {
    const providerError =
      error instanceof ProviderError
        ? error
        : new ProviderError(
            "OSS_UPLOAD_FAILED",
            "OSS 连接测试失败。",
            error instanceof Error ? error.message : String(error)
          );

    res.status(400).json({
      ok: false,
      code: providerError.errorCode,
      message: providerError.message,
      suggestion: ossSuggestion(providerError.errorCode),
      debugMessage: providerError.debugMessage
    });
  }
}

ossDiagnosticsRouter.use(localAdminOnly);

ossDiagnosticsRouter.get("/oss/health", handleOssHealth);
ossDiagnosticsRouter.get("/oss", handleOssHealth);

ossDiagnosticsRouter.get("/network/health", async (_req, res) => {
  const startedAt = Date.now();
  const endpoints = {
    oss:
      process.env.OSS_ENDPOINT ||
      (process.env.OSS_REGION ? `https://${process.env.OSS_REGION}.aliyuncs.com` : "https://oss-cn-beijing.aliyuncs.com"),
    dashscope: "https://dashscope.aliyuncs.com/api/v1",
    google: "https://generativelanguage.googleapis.com"
  };

  async function probe(endpoint: string) {
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), 8000);
    try {
      const response = await fetch(endpoint, { method: "GET", signal: controller.signal });
      clearTimeout(timer);
      return { ok: response.status < 500, statusCode: response.status };
    } catch (error) {
      clearTimeout(timer);
      return {
        ok: false,
        errorMessage: error instanceof Error ? error.message : String(error)
      };
    }
  }

  const [oss, dashscope, google] = await Promise.all([probe(endpoints.oss), probe(endpoints.dashscope), probe(endpoints.google)]);
  const proxy = getProxyInfo();
  res.json({
    ok: true,
    latencyMs: Date.now() - startedAt,
    usingProxy: proxy.usingProxy,
    proxyUrlMasked: proxy.proxyUrlMasked,
    ossEndpoint: endpoints.oss,
    ossReachable: oss.ok,
    oss,
    dashscopeReachable: dashscope.ok,
    dashscope,
    googleReachable: google.ok,
    google
  });
});
