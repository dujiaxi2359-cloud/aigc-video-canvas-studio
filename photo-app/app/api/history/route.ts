import { NextResponse } from "next/server";
import {
  listSharedHistory,
  listSharedHistoryForCustomer,
  normalizeHistoryCustomerId,
  saveSharedHistory,
} from "@/lib/server-history";
import type { SharedHistoryItem } from "@/lib/server-history";
import type { GeneratedImage } from "@/lib/image-generation";

export const runtime = "nodejs";

function isAdminHistoryCode(code: string) {
  const normalizedCode = normalizeHistoryCustomerId(code);
  if (!normalizedCode) return false;

  const envAdminCode = normalizeHistoryCustomerId(process.env.COMMERCE_AI_ADMIN_CODE);
  if (envAdminCode && normalizedCode === envAdminCode) return true;

  const envAdminCodes = (process.env.COMMERCE_AI_ADMIN_CODES || "")
    .split(",")
    .map((item) => normalizeHistoryCustomerId(item))
    .filter(Boolean);
  return envAdminCodes.includes(normalizedCode);
}

export async function GET(request: Request) {
  const url = new URL(request.url);
  const adminCode =
    url.searchParams.get("adminCode") || request.headers.get("x-admin-code") || "";
  const licenseCode =
    url.searchParams.get("licenseCode") || request.headers.get("x-license-code") || "";

  if (isAdminHistoryCode(adminCode)) {
    return NextResponse.json({ history: await listSharedHistory(), scope: "admin" });
  }

  const customerId = normalizeHistoryCustomerId(licenseCode);
  return NextResponse.json({
    history: customerId ? await listSharedHistoryForCustomer(customerId) : [],
    scope: "customer",
  });
}

export async function POST(request: Request) {
  let payload:
    | {
        item?: Partial<SharedHistoryItem>;
        images?: unknown[];
        licenseCode?: string;
        customerId?: string;
      }
    | null = null;

  try {
    payload = await request.json();

    if (!payload?.item?.id) {
      return NextResponse.json({ error: "History item id is required." }, { status: 400 });
    }

    const customerId = normalizeHistoryCustomerId(
      payload.customerId || payload.licenseCode || payload.item.customerId,
    );

    if (!customerId) {
      return NextResponse.json(
        { error: "缺少授权码，无法保存云端历史记录。" },
        { status: 400 },
      );
    }

    const item = await saveSharedHistory(
      { ...(payload.item as SharedHistoryItem), customerId },
      (payload.images || []) as GeneratedImage[],
    );
    return NextResponse.json({ item });
  } catch (error) {
    return NextResponse.json({
      item: payload?.item || null,
      warning:
        error instanceof Error
          ? `共享历史保存失败，但图片生成不受影响：${error.message}`
          : "共享历史保存失败，但图片生成不受影响。",
    });
  }
}
