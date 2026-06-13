import { NextResponse } from "next/server";
import {
  getSharedHistoryImages,
  listSharedHistory,
  normalizeHistoryCustomerId,
} from "@/lib/server-history";

export const runtime = "nodejs";

function isAdminHistoryCode(code: string) {
  const normalizedCode = normalizeHistoryCustomerId(code);
  if (!normalizedCode) return false;

  const envAdminCode = normalizeHistoryCustomerId(process.env.COMMERCE_AI_ADMIN_CODE);
  if (envAdminCode && normalizedCode === envAdminCode) return true;

  const envAdminCodes = (process.env.COMMERCE_AI_ADMIN_CODES || "")
    .split(",")
    .map((value) => normalizeHistoryCustomerId(value))
    .filter(Boolean);

  return envAdminCodes.includes(normalizedCode);
}

export async function GET(
  request: Request,
  context: { params: Promise<{ id: string }> },
) {
  try {
    const { id } = await context.params;
    const url = new URL(request.url);
    const adminCode =
      url.searchParams.get("adminCode") || request.headers.get("x-admin-code") || "";
    const licenseCode =
      url.searchParams.get("licenseCode") || request.headers.get("x-license-code") || "";

    if (!isAdminHistoryCode(adminCode)) {
      const customerId = normalizeHistoryCustomerId(licenseCode);
      const history = await listSharedHistory();
      const item = history.find((entry) => entry.id === id);

      if (!item || normalizeHistoryCustomerId(item.customerId) !== customerId) {
        return NextResponse.json({ error: "无权读取这条历史记录。" }, { status: 403 });
      }
    }

    return NextResponse.json({ images: await getSharedHistoryImages(id) });
  } catch (error) {
    return NextResponse.json(
      {
        error:
          error instanceof Error
            ? error.message
            : "Failed to load shared history images.",
      },
      { status: 404 },
    );
  }
}
