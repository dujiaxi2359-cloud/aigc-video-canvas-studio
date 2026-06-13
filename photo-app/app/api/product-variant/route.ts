import { NextResponse } from "next/server";
import { generateImageWithReferences } from "@/lib/image-generation";
import { buildProductVariantPrompt } from "@/lib/promptBuilders";
import { platformPrompt, ratioToSize } from "@/lib/templates";
import { publicPrompt } from "@/lib/workflow-privacy";
import {
  isWorkflowAuthResponse,
  withWorkflowAuthFromFormData,
} from "@/lib/server/withWorkflowAuth";
import { defaultProductProtection } from "@/types/workflow";
import type { ImageQuality, Ratio } from "@/lib/workflow";

export const runtime = "nodejs";

export async function POST(request: Request) {
  try {
    const formData = await request.formData();
    const auth = await withWorkflowAuthFromFormData(formData, "product-variant");
    if (isWorkflowAuthResponse(auth)) return auth;

    const product = formData.get("productImage");
    if (!(product instanceof File) || product.size === 0) {
      return NextResponse.json({ error: "请上传产品图。" }, { status: 400 });
    }

    const ratio = String(formData.get("ratio") || "1:1") as Ratio;
    const quality = String(formData.get("quality") || "low") as ImageQuality;
    const count = Math.min(Math.max(Number(formData.get("count") || 1), 1), 4);
    const prompt = buildProductVariantPrompt({
      userPrompt: String(formData.get("prompt") || "生成同一产品的高级电商展示图"),
      outputType: String(formData.get("outputType") || "电商主图"),
      style: String(formData.get("style") || "高级极简"),
      ratio,
      platformPrompt: platformPrompt(String(formData.get("platform") || "general") as never),
      protection: {
        ...defaultProductProtection,
        level: String(formData.get("protectionLevel") || "strict") as never,
        subjectLock: formData.get("subjectLock") !== "false",
        preserveColor: formData.get("preserveColor") !== "false",
        preserveStructure: formData.get("preserveStructure") !== "false",
        preserveLogo: formData.get("preserveLogo") !== "false",
        preserveAccessories: formData.get("preserveAccessories") !== "false",
      },
    });

    const result = await generateImageWithReferences({
      prompt,
      images: [product],
      size: ratioToSize[ratio],
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
            : "产品风格变体生成失败，请稍后重试。",
      },
      { status: 500 },
    );
  }
}
