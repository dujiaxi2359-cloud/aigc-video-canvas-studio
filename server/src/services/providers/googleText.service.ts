import fs from "node:fs";
import path from "node:path";
import { GoogleGenAI } from "@google/genai";
import { getAsset } from "../asset.service.js";
import { ProviderError, rawErrorMessage } from "../../utils/providerErrors.js";
import { googleGenAIOptions } from "./providerBaseUrl.js";
import type { ProviderGenerateResult, TextProviderParams } from "./providerTypes.js";

function mimeFromPath(filePath: string) {
  const ext = path.extname(filePath).toLowerCase();
  if (ext === ".jpg" || ext === ".jpeg") return "image/jpeg";
  if (ext === ".webp") return "image/webp";
  return "image/png";
}

function systemPromptForTask(taskType?: string, override?: string) {
  if (override) return override;
  if (taskType === "script") return "你是专业 AIGC 短视频脚本和分镜智能体。请输出清晰的中文分镜、时长、画面描述、提示词、字幕和声音建议。";
  if (taskType === "reverse-prompt") return "你是视觉反推提示词智能体。请分析素材并生成高质量中文提示词，包含主体、风格、构图、光线、镜头、运动建议和负面提示建议。";
  if (taskType === "prompt-polish") return "你是专业 AIGC 提示词优化智能体。请把粗略想法改写为适合图像/视频生成的中文提示词。";
  return "你是简洁的 AIGC 创意助手，用于提示词、脚本和工作流规划。除非用户另有要求，否则用中文回答。";
}

function collectText(value: unknown): string[] {
  if (!value) return [];
  if (typeof value === "string") return [value];
  if (Array.isArray(value)) return value.flatMap(collectText);
  if (typeof value === "object") {
    const record = value as Record<string, unknown>;
    return Object.entries(record)
      .filter(([key]) => key === "text" || key === "outputText" || key === "content" || key === "parts" || key === "candidates")
      .flatMap(([, nested]) => collectText(nested));
  }
  return [];
}

async function imagePartsFromAssets(assetIds?: string[]) {
  const parts: Array<{ inlineData: { data: string; mimeType: string } }> = [];
  for (const assetId of assetIds ?? []) {
    const asset = await getAsset(assetId);
    if (!asset?.localPath || !fs.existsSync(asset.localPath)) continue;
    parts.push({ inlineData: { data: fs.readFileSync(asset.localPath).toString("base64"), mimeType: mimeFromPath(asset.localPath) } });
  }
  return parts;
}

function classifyGoogleTextError(error: unknown): ProviderError {
  const message = rawErrorMessage(error);
  const lower = message.toLowerCase();
  if (lower.includes("user location is not supported") || lower.includes("failed_precondition")) {
    return new ProviderError(
      "GOOGLE_REGION_UNSUPPORTED",
      "当前 Google API 请求地区暂不支持该模型。请检查服务器 IP / 代理出口地区、Google 项目权限，或切回之前已验证可用的模型。",
      message
    );
  }
  if (lower.includes("model not found") || lower.includes("not found for api version") || lower.includes("models/") && lower.includes("not found")) {
    return new ProviderError("GOOGLE_MODEL_NOT_FOUND", "当前 Google modelName 不存在，或不支持当前 API version / method。请检查 modelName、apiVersion，或使用 Google listModels 检测。", message);
  }
  if (lower.includes("fetch failed") || lower.includes("network") || lower.includes("econn") || lower.includes("dns")) {
    return new ProviderError("NETWORK_ERROR", "Google API 网络请求失败，请检查代理、网络连接或 Google API 是否可访问。", message);
  }
  if (lower.includes("api key") || lower.includes("unauthorized") || lower.includes("permission") || lower.includes("403") || lower.includes("401")) {
    return new ProviderError("API_KEY_INVALID", "Google API Key 无效，或当前 Gemini 文本模型权限未开通。", message);
  }
  return new ProviderError("PROVIDER_ERROR", "Google Gemini 文本调用失败。", message);
}

export async function generateTextWithGoogle(params: TextProviderParams): Promise<ProviderGenerateResult> {
  if (!params.apiKey) throw new ProviderError("API_KEY_INVALID", "请先在设置中心配置该模型 API Key。");

  try {
    const ai: any = new GoogleGenAI(googleGenAIOptions(params.apiKey, params.apiBaseUrl));
    const imageParts = await imagePartsFromAssets(params.imageAssetIds);
    const response = await ai.models.generateContent({
      model: params.modelName,
      contents: [
        {
          role: "user",
          parts: [{ text: params.inputText || "请根据当前工作流上下文生成可用内容。" }, ...imageParts]
        }
      ],
      config: { systemInstruction: systemPromptForTask(params.taskType, params.systemPrompt) }
    });

    const directText = typeof response.text === "function" ? response.text() : response.text;
    const outputText = (directText || collectText(response).join("\n")).trim();
    if (!outputText) throw new ProviderError("PROVIDER_ERROR", "Gemini API 未返回文本内容。", rawErrorMessage(response));
    return { status: "success", outputText, rawResponse: response };
  } catch (error) {
    if (error instanceof ProviderError) throw error;
    throw classifyGoogleTextError(error);
  }
}
