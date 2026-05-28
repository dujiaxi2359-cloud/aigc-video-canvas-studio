import type { ProviderGenerateResult, TextProviderParams } from "./providerTypes.js";

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
        ...(params.systemPrompt ? [{ role: "system", content: params.systemPrompt }] : []),
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
