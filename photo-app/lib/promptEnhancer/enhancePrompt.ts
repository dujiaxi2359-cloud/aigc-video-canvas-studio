import { buildEnhancementNotes, buildPromptEnhancement } from "@/lib/promptEnhancer/enhancePromptTemplates";
import type { PromptEnhancerInput, PromptEnhancerOutput } from "@/lib/promptEnhancer/promptEnhancerTypes";

export function enhancePrompt(input: PromptEnhancerInput): PromptEnhancerOutput {
  const originalPrompt = input.userPrompt?.trim() || "";
  return {
    originalPrompt,
    enhancedPrompt: buildPromptEnhancement(input),
    enhancementNotes: buildEnhancementNotes(input),
  };
}
