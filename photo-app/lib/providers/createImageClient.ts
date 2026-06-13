import OpenAI from "openai";
import { createOpenAIClientFromRequest } from "@/lib/apiKey/openaiClientFromRequest";
import { resolveImageGenerationConfig } from "@/lib/apiKey/resolveImageGenerationConfig";
import type { ProviderConfig } from "@/lib/providers/providerTypes";

export type StudioImageClient = {
  client: OpenAI;
  imageModel?: string;
  providerLabel: string;
};

export function createImageClient(config: ProviderConfig): StudioImageClient {
  const resolved = resolveImageGenerationConfig(config);

  const client = createOpenAIClientFromRequest(resolved);

  return {
    client,
    imageModel: resolved.imageModel,
    providerLabel: resolved.providerLabel,
  };
}
