import { NextResponse } from "next/server";
import { enhancePrompt } from "@/lib/promptEnhancer/enhancePrompt";
import type { PromptEnhancerInput } from "@/lib/promptEnhancer/promptEnhancerTypes";

export const runtime = "nodejs";

export async function POST(request: Request) {
  try {
    const input = (await request.json()) as PromptEnhancerInput;
    return NextResponse.json(enhancePrompt(input));
  } catch {
    return NextResponse.json({ error: "提示词增强失败，请检查输入后重试。" }, { status: 500 });
  }
}
