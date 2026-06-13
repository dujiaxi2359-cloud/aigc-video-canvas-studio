import { NextResponse } from "next/server";
import { buildDetailBlueprint } from "@/lib/detailBlueprintBuilder";
import { publicPrompt } from "@/lib/workflow-privacy";
import {
  isWorkflowAuthResponse,
  withWorkflowAuthFromJson,
} from "@/lib/server/withWorkflowAuth";
import type { DetailBlueprintInput } from "@/types/detail";

export const runtime = "nodejs";

export async function POST(request: Request) {
  try {
    const input = (await request.json()) as DetailBlueprintInput & {
      licenseCode?: string;
      apiKey?: string;
      baseURL?: string;
    };
    const auth = await withWorkflowAuthFromJson(input, "detail-single", {
      requireApiKey: false,
    });
    if (isWorkflowAuthResponse(auth)) return auth;

    if (!input.productName?.trim()) {
      return NextResponse.json({ error: "请先填写产品名称。" }, { status: 400 });
    }

    const blueprint = buildDetailBlueprint(input).map((item) => ({
      ...item,
      prompt: publicPrompt(),
    }));

    return NextResponse.json({
      blueprint,
      createdAt: new Date().toISOString(),
    });
  } catch {
    return NextResponse.json(
      { error: "详情图蓝图生成失败，请检查产品资料后重试。" },
      { status: 500 },
    );
  }
}
