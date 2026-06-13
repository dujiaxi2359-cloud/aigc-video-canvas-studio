import { NextResponse } from "next/server";
import type OpenAI from "openai";
import type { ApiProvider } from "@/lib/apiKey/apiKeyTypes";
import { sanitizeApiKeyError } from "@/lib/apiKey/openaiClientFromRequest";
import { checkCredits } from "@/lib/credits/checkCredits";
import { hasFeatureAccess } from "@/lib/license/featureAccess";
import type { FeatureKey, LicenseStatus } from "@/lib/license/licenseTypes";
import { verifyLicense } from "@/lib/license/verifyLicense";
import { createImageClient } from "@/lib/providers/createImageClient";
import { cookies } from "next/headers";

export type WorkflowAuthContext = {
  license: LicenseStatus;
  unified?: {
    modelConfigId: string;
    workspaceId?: string;
    session: string;
    providerId?: string;
  };
  openai?: OpenAI;
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

export type WorkflowAuthInput = {
  modelConfigId?: string;
  workspaceId?: string;
  licenseCode?: string;
  apiProvider?: ApiProvider;
  apiKey?: string;
  baseURL?: string;
  azureEndpoint?: string;
  azureDeployment?: string;
  azureApiVersion?: string;
  textModel?: string;
  imageModel?: string;
  googleBananaModel?: string;
  featureKey: FeatureKey;
  requireApiKey?: boolean;
};

type UnifiedRuntimeModel = {
  id: string;
  providerId?: string;
  apiBaseUrl?: string;
  modelName: string;
  category?: string;
  enabled: boolean;
};

async function resolveUnifiedRuntimeModel(modelConfigId: string, workspaceId?: string) {
  const internalKey = process.env.INTERNAL_SERVICE_KEY || process.env.APP_SECRET;
  if (!internalKey) throw new Error("服务器未配置 INTERNAL_SERVICE_KEY 或 APP_SECRET。");
  const cookieStore = await cookies();
  const session = cookieStore.get("aigcnong_session")?.value;
  if (!session) throw new Error("登录会话已失效，请重新登录。");
  const apiOrigin = (process.env.UNIFIED_API_INTERNAL_URL || "http://127.0.0.1:4000").replace(/\/$/, "");
  const response = await fetch(`${apiOrigin}/api/model-configs/runtime/${encodeURIComponent(modelConfigId)}`, {
    cache: "no-store",
    headers: {
      Cookie: `aigcnong_session=${encodeURIComponent(session)}`,
      "X-Internal-Service-Key": internalKey,
      ...(workspaceId ? { "X-Workspace-Id": workspaceId } : {}),
    },
  });
  const payload = await response.json().catch(() => null) as (UnifiedRuntimeModel & { errorMessage?: string }) | null;
  if (!response.ok || !payload) throw new Error(payload?.errorMessage || "无法读取统一模型配置。");
  if (!payload.enabled || payload.category !== "image") throw new Error("请选择已启用的图片模型。");
  return { payload, session };
}

export function workflowAuthError(message: string, status = 403) {
  return NextResponse.json({ error: message }, { status });
}

export async function validateWorkflowAuth({
  modelConfigId,
  workspaceId,
  licenseCode,
  apiProvider = "openai",
  apiKey,
  baseURL,
  azureEndpoint,
  azureDeployment,
  azureApiVersion,
  textModel,
  imageModel,
  googleBananaModel,
  featureKey,
  requireApiKey = true,
}: WorkflowAuthInput): Promise<WorkflowAuthContext> {
  const license = verifyLicense(licenseCode || "");
  if (!license.valid) {
    throw new Error(license.message || "授权码无效，请先激活工具权限。");
  }

  if (!hasFeatureAccess(license, featureKey)) {
    throw new Error("当前授权套餐无权使用该工作流。");
  }

  const creditCheck = await checkCredits();
  if (!creditCheck.allowed) {
    throw new Error(creditCheck.message || "额度不足，无法使用该工作流。");
  }

  if (!requireApiKey) {
    return {
      license,
      apiProvider,
      apiKey: apiKey || "",
      baseURL: baseURL || "",
      azureEndpoint: azureEndpoint || "",
      azureDeployment: azureDeployment || "",
      azureApiVersion: azureApiVersion || "",
      textModel: textModel || "",
      imageModel: imageModel || "",
      googleBananaModel: googleBananaModel || "",
    };
  }

  if (modelConfigId) {
    const resolved = await resolveUnifiedRuntimeModel(modelConfigId, workspaceId);
    const unified = resolved.payload;
    const isAzure = unified.providerId === "azure-openai";
    const isGoogle = unified.providerId === "google";
    apiProvider = isAzure ? "azure" : isGoogle ? "banana" : "openai";
    return {
      license,
      unified: { modelConfigId, workspaceId, session: resolved.session, providerId: unified.providerId },
      apiProvider,
      apiKey: "",
      baseURL: unified.apiBaseUrl || "",
      azureEndpoint: isAzure ? unified.apiBaseUrl || "" : "",
      azureDeployment: isAzure ? unified.modelName : "",
      textModel: textModel || "",
      imageModel: unified.modelName,
      googleBananaModel: isGoogle ? unified.modelName : "",
    };
  }

  const imageClient = createImageClient({
    provider: apiProvider,
    apiKey: apiKey || "",
    baseURL: baseURL || "",
    azureEndpoint: azureEndpoint || "",
    azureDeployment: azureDeployment || "",
    azureApiVersion: azureApiVersion || "",
    textModel: textModel || "",
    imageModel: imageModel || "",
    googleBananaModel: googleBananaModel || "",
  });

  return {
    license,
    openai: imageClient.client,
    apiProvider,
    apiKey: apiKey || "",
    baseURL: baseURL || "",
    azureEndpoint: azureEndpoint || "",
    azureDeployment: azureDeployment || "",
    azureApiVersion: azureApiVersion || "",
    textModel: textModel || "",
    imageModel: imageClient.imageModel || imageModel || "",
    googleBananaModel: googleBananaModel || "",
  };
}

export async function withWorkflowAuthFromFormData(
  formData: FormData,
  featureKey: FeatureKey,
  options: { requireApiKey?: boolean } = {},
) {
  const apiKey = String(formData.get("apiKey") || "");
  try {
    return await validateWorkflowAuth({
      modelConfigId: String(formData.get("modelConfigId") || ""),
      workspaceId: String(formData.get("workspaceId") || ""),
      licenseCode: String(formData.get("licenseCode") || ""),
      apiProvider: String(formData.get("apiProvider") || "openai") as ApiProvider,
      apiKey,
      baseURL: String(formData.get("baseURL") || ""),
      azureEndpoint: String(formData.get("azureEndpoint") || ""),
      azureDeployment: String(formData.get("azureDeployment") || ""),
      azureApiVersion: String(formData.get("azureApiVersion") || ""),
      textModel: String(formData.get("textModel") || ""),
      imageModel: String(formData.get("imageModel") || ""),
      googleBananaModel: String(formData.get("googleBananaModel") || ""),
      featureKey,
      requireApiKey: options.requireApiKey,
    });
  } catch (error) {
    return workflowAuthError(
      sanitizeApiKeyError(
        error instanceof Error ? error.message : "工作流权限校验失败。",
        apiKey,
      ),
    );
  }
}

export async function withWorkflowAuthFromJson(
  body: {
    modelConfigId?: string;
    workspaceId?: string;
    licenseCode?: string;
    apiProvider?: ApiProvider;
    apiKey?: string;
    baseURL?: string;
    azureEndpoint?: string;
    azureDeployment?: string;
    azureApiVersion?: string;
    textModel?: string;
    imageModel?: string;
    googleBananaModel?: string;
  },
  featureKey: FeatureKey,
  options: { requireApiKey?: boolean } = {},
) {
  try {
    return await validateWorkflowAuth({
      modelConfigId: body.modelConfigId || "",
      workspaceId: body.workspaceId || "",
      licenseCode: body.licenseCode || "",
      apiProvider: body.apiProvider || "openai",
      apiKey: body.apiKey || "",
      baseURL: body.baseURL || "",
      azureEndpoint: body.azureEndpoint || "",
      azureDeployment: body.azureDeployment || "",
      azureApiVersion: body.azureApiVersion || "",
      textModel: body.textModel || "",
      imageModel: body.imageModel || "",
      googleBananaModel: body.googleBananaModel || "",
      featureKey,
      requireApiKey: options.requireApiKey,
    });
  } catch (error) {
    return workflowAuthError(
      sanitizeApiKeyError(
        error instanceof Error ? error.message : "工作流权限校验失败。",
        body.apiKey || "",
      ),
    );
  }
}

export function isWorkflowAuthResponse(value: unknown): value is NextResponse {
  return value instanceof NextResponse;
}
