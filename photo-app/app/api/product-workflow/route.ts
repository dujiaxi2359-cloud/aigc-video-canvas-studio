import { NextResponse } from "next/server";
import { generateImageWithReferences } from "@/lib/image-generation";
import { buildProductWorkflowPrompt } from "@/lib/promptBuilders";
import { platformPrompt, ratioToSize } from "@/lib/templates";
import { publicPrompt } from "@/lib/workflow-privacy";
import {
  isWorkflowAuthResponse,
  withWorkflowAuthFromFormData,
} from "@/lib/server/withWorkflowAuth";
import { defaultProductProtection, type ProductProtectionLevel } from "@/types/workflow";
import type { ImageQuality, ImageSize, Ratio } from "@/lib/workflow";

export const runtime = "nodejs";

const productWorkflowSizeByRatio: Partial<Record<Ratio, ImageSize>> = {
  "1:1": "1600x1600",
  "3:4": "1200x1600",
  "4:5": "1200x1500",
  "9:16": "1024x1792",
  "16:9": "1792x1024",
  "1464:600": "1952x800",
  "1464:625": "2928x1250",
  "600:450": "1600x1200",
  "463:625": "1482x2000",
  "1200:1500": "1200x1500",
  "1600:1600": "1600x1600",
};

export async function POST(request: Request) {
  try {
    const formData = await request.formData();
    const auth = await withWorkflowAuthFromFormData(formData, "product-workflow");
    if (isWorkflowAuthResponse(auth)) return auth;

    const product = formData.get("productImage");
    if (!(product instanceof File) || product.size === 0) {
      return NextResponse.json({ error: "请上传产品主图。" }, { status: 400 });
    }

    const ratio = String(formData.get("ratio") || "1:1") as Ratio;
    const quality = String(formData.get("quality") || "high") as ImageQuality;
    const count = Math.min(Math.max(Number(formData.get("count") || 1), 1), 4);
    const protectionLevel = String(
      formData.get("protectionLevel") || "strict",
    ) as ProductProtectionLevel;

    const prompt = buildProductWorkflowPrompt({
      productName: String(formData.get("productName") || ""),
      category: String(formData.get("category") || ""),
      userPrompt: String(formData.get("prompt") || ""),
      outputType: String(formData.get("outputType") || ""),
      backgroundType: String(formData.get("backgroundType") || ""),
      style: String(formData.get("style") || ""),
      ratio,
      platformPrompt: platformPrompt(String(formData.get("platform") || "general") as never),
      protection: { ...defaultProductProtection, level: protectionLevel },
    });

    const auxImages = ["frontImage", "sideImage", "backImage", "detailImage"]
      .map((key) => formData.get(key))
      .filter((item): item is File => item instanceof File && item.size > 0);

    const result = await generateImageWithReferences({
      prompt,
      images: [product, ...auxImages],
      size: productWorkflowSizeByRatio[ratio] || ratioToSize[ratio],
      quality,
      count,
      clients: { openai: auth.openai, imageModel: auth.imageModel || auth.googleBananaModel, unified: auth.unified },
    });

    return NextResponse.json({
      ...result,
      finalPrompt: publicPrompt(),
      createdAt: new Date().toISOString(),
    });
  } catch (error) {
    return NextResponse.json(
      {
        error:
          error instanceof Error
            ? error.message
            : "产品图工作流生成失败，请稍后重试。",
      },
      { status: 500 },
    );
  }
}
