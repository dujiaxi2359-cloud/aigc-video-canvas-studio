export type ProviderErrorCode =
  | "GOOGLE_REGION_UNSUPPORTED"
  | "GOOGLE_MODEL_NOT_FOUND"
  | "AZURE_DEPLOYMENT_NOT_FOUND"
  | "API_KEY_MISSING"
  | "API_KEY_INVALID"
  | "ASSET_FILE_NOT_FOUND"
  | "PUBLIC_URL_REQUIRED"
  | "OSS_CONFIG_MISSING"
  | "OSS_REGION_ENDPOINT_MISMATCH"
  | "OSS_ACCESS_DENIED"
  | "OSS_BUCKET_NOT_FOUND"
  | "OSS_ACCESS_KEY_INVALID"
  | "OSS_ACCESS_KEY_DISABLED"
  | "OSS_ACCESS_KEY_SECRET_INVALID"
  | "OSS_ENDPOINT_INVALID"
  | "OSS_NETWORK_ERROR"
  | "OSS_UPLOAD_FAILED"
  | "ADAPTER_NOT_IMPLEMENTED"
  | "NETWORK_ERROR"
  | "MISSING_INPUT_ASSET"
  | "MODEL_MODE_UNSUPPORTED"
  | "MODEL_PARAM_UNSUPPORTED"
  | "MISSING_VIDEO_INPUT"
  | "PROVIDER_ERROR";

export class ProviderError extends Error {
  errorCode: ProviderErrorCode;
  debugMessage?: string;

  constructor(errorCode: ProviderErrorCode, errorMessage: string, debugMessage?: string) {
    super(errorMessage);
    this.name = "ProviderError";
    this.errorCode = errorCode;
    this.debugMessage = debugMessage;
  }
}

export function isProviderError(error: unknown): error is ProviderError {
  return error instanceof ProviderError;
}

export function rawErrorMessage(error: unknown) {
  if (error instanceof Error) return error.message;
  if (typeof error === "string") return error;
  try {
    return JSON.stringify(error);
  } catch {
    return String(error);
  }
}
