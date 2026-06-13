import { NextResponse } from "next/server";
import { createOpenAIClient } from "@/lib/openai";

export const runtime = "nodejs";

export async function POST(request: Request) {
  let prompt = "";

  try {
    const body = (await request.json()) as {
      prompt?: string;
      workflowType?: string;
      useCase?: string;
      platform?: string;
      style?: string;
    };
    prompt = body.prompt?.trim() || "";

    if (!prompt) {
      return NextResponse.json(
        { error: "Please enter a prompt to optimize." },
        { status: 400 },
      );
    }

    if (!process.env.OPENAI_API_KEY) {
      return NextResponse.json({ prompt: createLocalOptimizedPrompt(prompt) });
    }

    const openai = createOpenAIClient(60_000);
    const completion = await openai.chat.completions.create({
      model: "gpt-4.1-mini",
      temperature: 0.7,
      messages: [
        {
          role: "system",
          content:
            "You are an image-generation prompt editor. Rewrite the user's short Chinese description into a clearer Chinese prompt while preserving the original subject, product category, scene, mood, and style. Do not force ecommerce, premium, clean studio, white background, hero product, or poster aesthetics unless the user asked for them. Add only useful details such as subject, composition, camera/viewpoint, lighting, materials, scene, color, and output constraints. Output only the optimized prompt.",
        },
        { role: "user", content: prompt },
      ],
    });

    return NextResponse.json({
      prompt:
        completion.choices[0]?.message.content?.trim() ||
        createLocalOptimizedPrompt(prompt),
    });
  } catch {
    return NextResponse.json({ prompt: createLocalOptimizedPrompt(prompt) });
  }
}

function createLocalOptimizedPrompt(prompt: string) {
  return [
    prompt.trim(),
    "请保留原始主题和风格方向，补充清晰的主体、构图、视角、光线、材质、场景、色彩和画面比例要求。",
    "不要默认改成白底产品主图、极简电商图、高级香氛风、蓝紫科技风或通用海报模板，除非原提示词明确要求。",
    "避免水印、乱码文字、低清晰度、明显畸变和无意义元素。",
  ]
    .filter(Boolean)
    .join(" ");
}
