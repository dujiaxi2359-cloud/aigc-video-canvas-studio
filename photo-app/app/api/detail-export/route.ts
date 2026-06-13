import { NextResponse } from "next/server";

export const runtime = "nodejs";

export async function POST(request: Request) {
  try {
    const payload = await request.json();
    return NextResponse.json({
      ok: true,
      message: "导出数据已准备完成。前端会使用可编辑文字层合成并下载最终图片。",
      exportData: payload,
      createdAt: new Date().toISOString(),
    });
  } catch {
    return NextResponse.json(
      { error: "详情图导出失败，请检查蓝图和图片数据。" },
      { status: 500 },
    );
  }
}
