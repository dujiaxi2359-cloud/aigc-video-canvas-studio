import { NextResponse } from "next/server";
import { generateImageWithReferences } from "@/lib/image-generation";
import { buildReferenceMimicPrompt } from "@/lib/promptBuilders";
import { addServerLog } from "@/lib/server-logs";
import { saveSharedHistory, type SharedHistoryItem } from "@/lib/server-history";
import { publicPrompt, redactHistoryPrompt } from "@/lib/workflow-privacy";
import {
  isWorkflowAuthResponse,
  withWorkflowAuthFromFormData,
} from "@/lib/server/withWorkflowAuth";
import { platformPrompt, ratioToSize, type EcommercePlatformId, type MimicDimension, type MimicStrength, type MimicType } from "@/lib/templates";
import { defaultProductProtection, type ProductProtectionLevel } from "@/types/workflow";
import type { ImageQuality, Ratio } from "@/lib/workflow";

export const runtime = "nodejs";

function errorResponse(message: string, status = 400) {
  return NextResponse.json({ error: message }, { status });
}

function parseHistoryMeta(value: FormDataEntryValue | null) {
  if (typeof value !== "string") return null;

  try {
    const parsed = JSON.parse(value) as Partial<SharedHistoryItem>;
    return parsed.id && parsed.workflow && parsed.title ? parsed : null;
  } catch {
    return null;
  }
}

export async function POST(request: Request) {
  const startedAt = Date.now();
  try {
    const formData = await request.formData();
    const auth = await withWorkflowAuthFromFormData(formData, "reference-mimic");
    if (isWorkflowAuthResponse(auth)) return auth;

    const referenceImage = formData.get("referenceImage");
    const productImage = formData.get("productImage");

    if (!(referenceImage instanceof File) || referenceImage.size === 0) {
      return errorResponse("请上传参考图。");
    }

    if (!(productImage instanceof File) || productImage.size === 0) {
      return errorResponse("请上传产品图。");
    }

    const ratio = String(formData.get("ratio") || "1:1") as Ratio;
    const count = Math.min(Math.max(Number(formData.get("count") || 1), 1), 4);
    const quality = String(formData.get("quality") || "low") as ImageQuality;
    const historyMeta = parseHistoryMeta(formData.get("__historyMeta"));
    const platform = String(formData.get("platform") || "general") as EcommercePlatformId;
    const protectionLevel = String(
      formData.get("protectionLevel") || "strict",
    ) as ProductProtectionLevel;
    const dimensions = String(formData.get("dimensions") || "")
      .split(",")
      .map((item) => item.trim())
      .filter(Boolean) as MimicDimension[];

    const finalPrompt = buildReferenceMimicPrompt({
      productName: String(formData.get("productName") || ""),
      sellingPoints: String(formData.get("sellingPoints") || ""),
      extraRequirements: String(formData.get("extraRequirements") || ""),
      outputType: String(formData.get("outputType") || "产品图") as MimicType,
      dimensions,
      strength: String(formData.get("strength") || "中") as MimicStrength,
      ratio,
      platformPrompt: platformPrompt(platform),
      protection: { ...defaultProductProtection, level: protectionLevel },
    });

    addServerLog("info", "api.generate-reference", "Received reference mimic request", {
      outputType: String(formData.get("outputType") || "产品图"),
      strength: String(formData.get("strength") || "中"),
      ratio,
      quality,
      count,
      dimensions,
      platform,
      protectionLevel,
      referenceBytes: referenceImage.size,
      productBytes: productImage.size,
    });

    const result = await generateImageWithReferences({
      prompt: finalPrompt,
      images: [referenceImage, productImage],
      size: ratioToSize[ratio],
      quality,
      count,
      clients: { openai: auth.openai, imageModel: auth.imageModel || auth.googleBananaModel, unified: auth.unified },
    });

    const createdAt = new Date().toISOString();
    let historyItem: SharedHistoryItem | null = null;
    if (historyMeta?.id && historyMeta.workflow && historyMeta.title) {
      try {
        historyItem = await saveSharedHistory(
          {
            id: historyMeta.id,
            workflow: historyMeta.workflow,
            title: historyMeta.title,
            customerId: auth.license.code,
            outputType: historyMeta.outputType,
            referenceThumb: historyMeta.referenceThumb,
            productThumb: historyMeta.productThumb,
            imageCount: result.images.length,
            finalPrompt: publicPrompt(),
            createdAt,
          },
          result.images,
        );
      } catch (historyError) {
        addServerLog(
          "error",
          "api.history",
          "Server-side reference history save failed",
          historyError instanceof Error ? historyError.message : historyError,
        );
      }
    }

    return NextResponse.json({
      ...result,
      finalPrompt: publicPrompt(),
      createdAt,
      durationMs: Date.now() - startedAt,
      historyItem: redactHistoryPrompt(historyItem),
    });
  } catch (error) {
    addServerLog(
      "error",
      "api.generate-reference",
      "Reference mimic request failed",
      error instanceof Error ? error.message : error,
    );
    return errorResponse(
      error instanceof Error ? error.message : "参考图模仿生图失败，请稍后重试。",
      500,
    );
  }
}
