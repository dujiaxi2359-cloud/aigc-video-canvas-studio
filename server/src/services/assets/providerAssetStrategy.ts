export type AssetProviderId = "alibaba" | "google" | "azure-openai" | "openai" | string;

export type AssetInputStrategy = {
  supportsBase64: boolean;
  supportsMultipart: boolean;
  supportsPublicUrl: boolean;
  prefer: "base64" | "multipart" | "publicUrl";
};

export const providerAssetStrategies: Record<string, AssetInputStrategy> = {
  alibaba: {
    supportsBase64: true,
    supportsMultipart: false,
    supportsPublicUrl: true,
    prefer: "base64"
  },
  google: {
    supportsBase64: true,
    supportsMultipart: false,
    supportsPublicUrl: true,
    prefer: "base64"
  },
  "azure-openai": {
    supportsBase64: false,
    supportsMultipart: true,
    supportsPublicUrl: true,
    prefer: "multipart"
  },
  openai: {
    supportsBase64: false,
    supportsMultipart: true,
    supportsPublicUrl: true,
    prefer: "multipart"
  }
};

export function getProviderAssetStrategy(providerId: AssetProviderId, override?: Partial<AssetInputStrategy>) {
  const defaults: AssetInputStrategy = {
    supportsBase64: false,
    supportsMultipart: false,
    supportsPublicUrl: true,
    prefer: "publicUrl"
  };
  return {
    ...defaults,
    ...(providerAssetStrategies[providerId] ?? {}),
    ...(override ?? {})
  } satisfies AssetInputStrategy;
}
