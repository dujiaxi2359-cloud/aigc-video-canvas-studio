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
  | "MODEL_NOT_SELECTED"
  | "MODEL_NOT_FOUND"
  | "CAPABILITY_MISMATCH"
  | "MODEL_ROUTING_MISMATCH"
  | "ADAPTER_ROUTING_MISMATCH"
  | "PROVIDER_MODEL_ROUTE_UNAVAILABLE"
  | "PROVIDER_ACCOUNT_UNAVAILABLE"
  | "PROVIDER_CHANNEL_UNAVAILABLE"
  | "REQUEST_SCHEMA_ERROR"
  | "GEMINI_REQUEST_SCHEMA_ERROR"
  | "ASSET_FILE_NOT_FOUND"
  | "PUBLIC_URL_REQUIRED"
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
  | "PROVIDER_VIDEO_DOWNLOAD_FAILED"
  | "MISSING_VIDEO_INPUT"
  | "SEEDANCE_ASSET_UPLOAD_FAILED"
  | "VIDEO_POLL_ENDPOINT_MISSING"
  | "PROVIDER_RESULT_EMPTY"
  | "COS_UPLOAD_FAILED"
  | "HISTORY_SAVE_FAILED"
  | "CANVAS_UPDATE_FAILED"
  | "CANVAS_NODE_UPDATE_FAILED"
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
