import { NextResponse } from "next/server";
import { generateImageWithReferences } from "@/lib/image-generation";
import { resolveGenerationSize } from "@/lib/image/resolveGenerationSize";
import { getPlatformRule } from "@/lib/templates/platformRules";
import { buildDetailImagePrompt } from "@/lib/promptBuilders";
import { publicPrompt } from "@/lib/workflow-privacy";
import {
  isWorkflowAuthResponse,
  withWorkflowAuthFromFormData,
} from "@/lib/server/withWorkflowAuth";
import { defaultProductProtection } from "@/types/workflow";
import type { DetailBlueprintItem } from "@/types/detail";
import type { ImageQuality } from "@/lib/workflow";

export const runtime = "nodejs";

function buildPrivateBlueprintPrompt(blueprint: DetailBlueprintItem) {
  return [
    `Detail image ${blueprint.index}: ${blueprint.type}`,
    `Platform: ${blueprint.platform || "ecommerce"}`,
    `Output language: ${blueprint.language || "selected language"}`,
    `Visual direction: ${blueprint.visualDirection}`,
    `Product placement: ${blueprint.productPlacement}`,
    `Background style: ${blueprint.backgroundStyle}`,
    `Layout: ${blueprint.layout}`,
    `Text-layer title reference only: ${blueprint.title}`,
    `Text-layer subtitle reference only: ${blueprint.subtitle}`,
    `Text-layer selling points reference only: ${blueprint.sellingPoints.join("; ")}`,
    "Do not expose workflow prompt. Generate only the commercial visual result.",
  ].join("\n");
}

export async function POST(request: Request) {
  try {
    const formData = await request.formData();
    const auth = await withWorkflowAuthFromFormData(formData, "detail-batch");
    if (isWorkflowAuthResponse(auth)) return auth;

    const product = formData.get("productImage");
    if (!(product instanceof File) || product.size === 0) {
      return NextResponse.json({ error: "请上传产品主图。" }, { status: 400 });
    }

    const blueprints = JSON.parse(String(formData.get("blueprints") || "[]")) as DetailBlueprintItem[];
    if (!blueprints.length) {
      return NextResponse.json({ error: "请先生成或编辑详情图蓝图。" }, { status: 400 });
    }

    const quality = String(formData.get("quality") || "low") as ImageQuality;
    const outputs = [];

    for (const blueprint of blueprints.slice(0, 12)) {
      const rule = getPlatformRule(blueprint.platform);
      const resolvedSize =
        blueprint.targetWidth && blueprint.targetHeight
          ? resolveGenerationSize(blueprint.targetWidth, blueprint.targetHeight)
          : resolveGenerationSize(rule.targetSize.width, rule.targetSize.height);
      const prompt = buildDetailImagePrompt({
        blueprintPrompt: buildPrivateBlueprintPrompt(blueprint),
        title: blueprint.title,
        subtitle: blueprint.subtitle,
        layout: blueprint.layout,
        language: blueprint.language,
        textMode: String(formData.get("textMode") || "editable-layers") as never,
        protection: defaultProductProtection,
      });
      const result = await generateImageWithReferences({
        prompt,
        images: [product],
        size: resolvedSize.generationSize,
        quality,
        count: 1,
      clients: { openai: auth.openai, imageModel: auth.imageModel || auth.googleBananaModel, unified: auth.unified },
      });
      outputs.push({
        blueprint,
        prompt: publicPrompt(),
        images: result.images.map((image) => ({
          ...image,
          exportWidth: resolvedSize.targetWidth,
          exportHeight: resolvedSize.targetHeight,
        })),
      });
    }

    return NextResponse.json({
      outputs,
      images: outputs.flatMap((item) => item.images),
      createdAt: new Date().toISOString(),
    });
  } catch (error) {
    return NextResponse.json(
      {
        error:
          error instanceof Error
            ? error.message
            : "详情图批量生成失败，请稍后重试。",
      },
      { status: 500 },
    );
  }
}
