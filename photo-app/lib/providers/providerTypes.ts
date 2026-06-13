import type { ApiProvider } from "@/lib/apiKey/apiKeyTypes";

export type StudioProvider = ApiProvider;

export type ProviderConfig = {
  provider: StudioProvider;
  apiKey: string;
  baseURL?: string;
  textModel?: string;
  imageModel?: string;
  googleBananaModel?: string;
  azureEndpoint?: string;
  azureDeployment?: string;
  azureApiVersion?: string;
};

export type ProviderModelOption = {
  label: string;
  value: string;
};
