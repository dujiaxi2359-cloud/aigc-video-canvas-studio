export type ApiProvider =
  | "openai"
  | "azure"
  | "banana"
  | "openai-compatible"
  | "azure-openai"
  | "google-banana";

export type UserApiKeyConfig = {
  provider: ApiProvider;
  apiKey: string;
  baseURL?: string;
  textModel?: string;
  imageModel?: string;
  googleBananaModel?: string;
  azureEndpoint?: string;
  azureDeployment?: string;
  azureApiVersion?: string;
};
