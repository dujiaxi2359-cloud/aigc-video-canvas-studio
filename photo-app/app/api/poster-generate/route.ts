import { NextResponse } from "next/server";
import { generateImageWithReferences } from "@/lib/image-generation";
import { buildPosterPrompt } from "@/lib/promptBuilders";
import { platformPrompt, ratioToSize } from "@/lib/templates";
import { publicPrompt } from "@/lib/workflow-privacy";
import {
  isWorkflowAuthResponse,
  withWorkflowAuthFromFormData,
} from "@/lib/server/withWorkflowAuth";
import { defaultProductProtection, type ProductProtectionLevel } from "@/types/workflow";
import type { ImageQuality, Ratio } from "@/lib/workflow";

export const runtime = "nodejs";

export async function POST(request: Request) {
  try {
    const formData = await request.formData();
    const auth = await withWorkflowAuthFromFormData(formData, "poster");
    if (isWorkflowAuthResponse(auth)) return auth;

    const product = formData.get("productImage");
    if (!(product instanceof File) || product.size === 0) {
      return NextResponse.json({ error: "请上传产品图。" }, { status: 400 });
    }

    const logo = formData.get("logo");
    const ratio = String(formData.get("ratio") || "4:5") as Ratio;
    const quality = String(formData.get("quality") || "low") as ImageQuality;
    const protectionLevel = String(
      formData.get("protectionLevel") || "strict",
    ) as ProductProtectionLevel;
    const prompt = buildPosterPrompt({
      productName: String(formData.get("productName") || ""),
      title: String(formData.get("title") || ""),
      subtitle: String(formData.get("subtitle") || ""),
      campaignInfo: String(formData.get("campaignInfo") || ""),
      posterType: String(formData.get("posterType") || "上新"),
      style: String(formData.get("style") || "高级感"),
      ratio,
      platformPrompt: platformPrompt(String(formData.get("platform") || "general") as never),
      protection: { ...defaultProductProtection, level: protectionLevel },
    });

    const result = await generateImageWithReferences({
      prompt,
      images: [product, ...(logo instanceof File && logo.size > 0 ? [logo] : [])],
      size: ratioToSize[ratio],
      quality,
      count: 1,
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
          error instanceof Error ? error.message : "海报生成失败，请稍后重试。",
      },
      { status: 500 },
    );
  }
}
