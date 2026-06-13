import { NextResponse } from "next/server";
import { verifyLicense } from "@/lib/license/verifyLicense";

export const runtime = "nodejs";

export async function POST(request: Request) {
  const body = (await request.json().catch(() => ({}))) as {
    code?: string;
  };

  const license = verifyLicense(body.code || "");
  return NextResponse.json(license, { status: license.valid ? 200 : 403 });
}
