import type { ProviderGenerateResult, TextProviderParams } from "./providerTypes.js";
import {
  ensureOpenAiCompatibleConfig,
  openAiCompatibleHeaders,
  readRawResponse,
  resolveOpenAiCompatibleEndpoint,
  throwOpenAiCompatibleHttpError
} from "./openaiCompatibleProtocol.js";

function systemPromptForTask(taskType?: string, override?: string) {
  if (override) return override;
  if (taskType === "script") return "你是专业 AIGC 短视频脚本和分镜智能体。请根据用户指令和素材上下文，输出清晰的中文分镜、时长、画面描述、可直接用于图像/视频生成的提示词、字幕和声音建议。";
  if (taskType === "reverse-prompt") return "你是多媒体提示词反推智能体。请根据用户连接的图片、视频、音频或文本上下文，反推可复用的生成提示词；如果无法直接读取媒体内容，请明确基于用户提供的素材说明和链接推理，不要编造不存在的细节。";
  if (taskType === "prompt-polish") return "你是专业 AIGC 提示词优化智能体。请把粗略想法改写为适合图像/视频生成的中文提示词，补齐主体、场景、构图、镜头、光线、风格、动作和负面约束。";
  return "你是 AIGC 创意推理助手，用于提示词、脚本、素材拆解和工作流规划。除非用户另有要求，否则用中文回答。";
}

function collectText(value: unknown): string[] {
  if (!value) return [];
  if (typeof value === "string") return [value];
  if (Array.isArray(value)) return value.flatMap(collectText);
  if (typeof value === "object") {
    const record = value as Record<string, unknown>;
    return Object.entries(record)
      .filter(([key]) => ["text", "outputText", "content", "parts", "choices", "message"].includes(key))
      .flatMap(([, nested]) => collectText(nested));
  }
  return [];
}

export async function generateTextWithOpenAICompatible(params: TextProviderParams): Promise<ProviderGenerateResult> {
  const config = ensureOpenAiCompatibleConfig(params.capabilities ?? { inputModes: ["text"] }, "text");
  const endpoint = resolveOpenAiCompatibleEndpoint({
    baseUrl: params.apiBaseUrl || "https://api.openai.com/v1",
    endpoint: config.chatEndpoint,
    defaultEndpoint: "/v1/chat/completions",
    modelId: params.modelName,
    queryParams: config.queryParams
  });
  const response = await fetch(endpoint, {
    method: "POST",
    headers: openAiCompatibleHeaders({ apiKey: params.apiKey, config }),
    body: JSON.stringify({
      model: params.modelName,
      messages: [
        { role: "system", content: systemPromptForTask(params.taskType, params.systemPrompt) },
        { role: "user", content: params.inputText || "请根据当前工作流上下文生成可用内容。" }
      ],
      stream: false
    })
  });

  if (!response.ok) {
    const { text, payload } = await readRawResponse(response);
    throwOpenAiCompatibleHttpError({ label: "文本推理 API 调用", endpoint, status: response.status, payload, text });
  }

  const json = await response.json() as { choices?: Array<{ message?: { content?: string }; text?: string }> };
  const outputText = (json.choices?.[0]?.message?.content || json.choices?.[0]?.text || collectText(json).join("\n")).trim();
  if (!outputText) throw new Error("文本推理 API 未返回文本内容");
  return { status: "success", outputText, rawResponse: json };
}
