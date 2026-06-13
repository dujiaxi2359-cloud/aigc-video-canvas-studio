import { NextResponse } from "next/server";
import {
  azureOpenAIApiVersion,
  azureOpenAIDeployment,
  azureOpenAIEndpoint,
  createOpenAIDispatcher,
  hasAzureImageConfig,
  imageModel,
  openAIBaseURL,
} from "@/lib/openai";
import { addServerLog } from "@/lib/server-logs";

export const runtime = "nodejs";

export async function GET() {
  if (hasAzureImageConfig()) {
    addServerLog("success", "api.openai-status", "Azure image service configured", {
      deployment: azureOpenAIDeployment,
      endpoint: azureOpenAIEndpoint,
      apiVersion: azureOpenAIApiVersion,
    });
    return NextResponse.json({
      ok: true,
      model: `azure:${azureOpenAIDeployment}`,
      baseURL: "azure",
      endpoint: azureOpenAIEndpoint,
      apiVersion: azureOpenAIApiVersion,
    });
  }

  if (!process.env.OPENAI_API_KEY) {
    return NextResponse.json(
      {
        ok: false,
        error: "Missing OPENAI_API_KEY. Please add it to .env.local.",
      },
      { status: 500 },
    );
  }

  try {
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), 12_000);

    const dispatcher = createOpenAIDispatcher();
    const response = await fetch(
      `${openAIBaseURL.replace(/\/$/, "")}/models/${imageModel}`,
      {
        headers: {
          Authorization: `Bearer ${process.env.OPENAI_API_KEY}`,
        },
        signal: controller.signal,
        ...(dispatcher ? ({ dispatcher } as never) : {}),
      },
    );
    clearTimeout(timer);

    if (!response.ok) {
      const text = await response.text();
      return NextResponse.json(
        {
          ok: false,
          error: text || `OpenAI returned HTTP ${response.status}.`,
          model: imageModel,
          baseURL: process.env.OPENAI_BASE_URL ? "custom" : "official",
        },
        { status: response.status },
      );
    }

    const model = (await response.json()) as { id?: string };

    return NextResponse.json({
      ok: true,
      model: model.id,
      baseURL: process.env.OPENAI_BASE_URL ? "custom" : "official",
    });
  } catch (error) {
    const message =
      error instanceof Error ? error.message : "OpenAI connection failed.";
    const lower = message.toLowerCase();

    return NextResponse.json(
      {
        ok: false,
        error:
          lower.includes("abort") ||
          lower.includes("timed out") ||
          lower.includes("timeout") ||
          lower.includes("fetch failed")
            ? "OpenAI API connection failed or timed out. Check your network, DNS, proxy, or OPENAI_BASE_URL."
            : message,
        model: imageModel,
        baseURL: process.env.OPENAI_BASE_URL ? "custom" : "official",
      },
      { status: 500 },
    );
  }
}
