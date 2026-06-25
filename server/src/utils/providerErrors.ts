export type ProviderErrorCode =
  | "GOOGLE_REGION_UNSUPPORTED"
  | "GOOGLE_MODEL_NOT_FOUND"
  | "AZURE_ENDPOINT_MISSING"
  | "AZURE_ENDPOINT_INVALID"
  | "AZURE_DEPLOYMENT_MISSING"
  | "AZURE_DEPLOYMENT_NOT_FOUND"
  | "API_KEY_MISSING"
  | "API_KEY_INVALID"
  | "MODEL_ACCESS_DENIED"
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
  | "CURRENT_CHANNEL_TEXT_ONLY"
  | "NO_IMAGE_CAPABLE_CHANNEL"
  | "MODEL_PARAM_UNSUPPORTED"
  | "VEO_OPERATION_TIMEOUT"
  | "VEO_OPERATION_FAILED"
  | "VEO_OPERATION_NO_VIDEO_IN_RESPONSE"
  | "VEO_RAI_MEDIA_FILTERED"
  | "VEO_RAI_FILTERED_NO_VIDEO"
  | "VEO_VIDEO_DOWNLOAD_FAILED"
  | "VEO_VIDEO_FILE_EMPTY"
  | "MISSING_VIDEO_INPUT"
  | "SEEDANCE_ASSET_UPLOAD_FAILED"
  | "VIDEO_POLL_ENDPOINT_MISSING"
  | "PROVIDER_RESULT_EMPTY"
  | "UPSTREAM_REFERENCE_BLOCKED"
  | "UPSTREAM_HUMAN_PRIVACY_REVIEW"
  | "UPSTREAM_QUOTA_EXHAUSTED"
  | "UPSTREAM_CHANNEL_UNAVAILABLE"
  | "PROVIDER_ERROR";

export class ProviderError extends Error {
  errorCode: ProviderErrorCode;
  debugMessage?: string;
  details?: unknown;

  constructor(errorCode: ProviderErrorCode, errorMessage: string, debugMessage?: string, details?: unknown) {
    super(errorMessage);
    this.name = "ProviderError";
    this.errorCode = errorCode;
    this.debugMessage = debugMessage;
    this.details = details;
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
