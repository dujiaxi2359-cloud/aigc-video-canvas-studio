import type { ProviderModelOption, StudioProvider } from "@/lib/providers/providerTypes";

export const providerOptions: { label: string; value: StudioProvider; description: string }[] = [
  {
    label: "OpenAI Compatible",
    value: "openai-compatible",
    description: "OpenAI 官方或兼容 /v1 接口。",
  },
  {
    label: "Azure OpenAI",
    value: "azure-openai",
    description: "Azure OpenAI deployment 模式。",
  },
  {
    label: "Google Banana",
    value: "google-banana",
    description: "Banana 系列生图模型。",
  },
];

export const googleBananaModels: ProviderModelOption[] = [
  { label: "Banana 2", value: "banana-2" },
  { label: "Banana Pro", value: "banana-pro" },
];

export function providerDisplayName(provider: StudioProvider, model?: string) {
  if (provider === "google-banana") {
    const option = googleBananaModels.find((item) => item.value === model);
    return `Google ${option?.label || "Banana"}`;
  }
  if (provider === "azure" || provider === "azure-openai") return "Azure OpenAI";
  return "OpenAI Compatible";
}
