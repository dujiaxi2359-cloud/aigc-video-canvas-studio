export type RealismMode = "off" | "natural_human" | "commercial_human" | "cinematic_human";

const humanNegativePrompt =
  "plastic skin, waxy skin, doll-like face, uncanny valley, over-smoothed skin, low detail face, distorted hands, deformed body, bad anatomy, fake texture, blurry face, AI artifacts";

export function buildNegativePrompt(input?: { negativePrompt?: string; realismMode?: RealismMode }) {
  const parts = [input?.negativePrompt?.trim()].filter(Boolean) as string[];
  const realismMode = input?.realismMode ?? "natural_human";
  if (realismMode !== "off") parts.push(humanNegativePrompt);
  return Array.from(new Set(parts)).join(", ");
}
