import type { ProviderGenerateResult, TextProviderParams } from "./providerTypes.js";

function systemPromptForTask(taskType?: string, override?: string) {
  if (override) return override;
  if (taskType === "script") return "你是专业 AIGC 短视频脚本和分镜智能体。请输出清晰的中文分镜、时长、画面描述、提示词、字幕和声音建议。";
  if (taskType === "reverse-prompt") return "你是素材提示词反推智能体。请根据用户连接的图片、视频、音频或文本上下文，生成高质量中文提示词；如果无法直接读取媒体内容，请基于素材说明、链接和用户指令推理，不要编造细节。";
  if (taskType === "prompt-polish") return "你是专业 AIGC 提示词优化智能体。请把粗略想法改写为适合图像/视频生成的中文提示词。";
  return "你是简洁的 AIGC 创意助手，用于提示词、脚本、素材拆解和工作流规划。除非用户另有要求，否则用中文回答。";
}

async function readProviderError(response: Response) {
  const text = await response.text();
  try {
    const json = JSON.parse(text) as { error?: { message?: string }; message?: string };
    return json.error?.message ?? json.message ?? text;
  } catch {
    return text;
  }
}

export async function generateTextWithDeepSeek(params: TextProviderParams): Promise<ProviderGenerateResult> {
  const apiBaseUrl = params.apiBaseUrl || "https://api.deepseek.com";
  const response = await fetch(`${apiBaseUrl.replace(/\/$/, "")}/chat/completions`, {
    method: "POST",
    headers: {
      Authorization: `Bearer ${params.apiKey}`,
      "Content-Type": "application/json"
    },
    body: JSON.stringify({
      model: params.modelName,
      messages: [
        { role: "system", content: systemPromptForTask(params.taskType, params.systemPrompt) },
        { role: "user", content: params.inputText }
      ],
      stream: false
    })
  });

  if (!response.ok) {
    const message = await readProviderError(response);
    throw new Error(`DeepSeek API 调用失败：${message}`);
  }

  const json = await response.json() as {
    choices?: Array<{ message?: { content?: string } }>;
  };
  const outputText = json.choices?.[0]?.message?.content;
  if (!outputText) throw new Error("DeepSeek API 未返回文本内容");
  return { status: "success", outputText, rawResponse: json };
}
