import type { GenerateImageRequest, GenerateTextRequest, GenerateVideoRequest } from "../model.service.js";
import type { ModelCapabilities } from "../../types/model.js";

export type ProviderGenerateResult = {
  status: "success" | "error" | "processing";
  outputText?: string;
  outputUrl?: string;
  outputAssetId?: string;
  localPath?: string;
  rawResponse?: unknown;
  errorCode?: string;
  errorMessage?: string;
  debugMessage?: string;
  payloadSummary?: unknown;
};

export type BaseProviderParams = {
  apiKey: string;
  apiBaseUrl: string;
  modelName: string;
  providerId?: string;
  catalogModelId?: string;
  capabilities?: ModelCapabilities;
  qualityMode?: "full_quality" | "balanced" | "fast";
};

export type TextProviderParams = GenerateTextRequest & BaseProviderParams;
export type ImageProviderParams = GenerateImageRequest & BaseProviderParams;
export type VideoProviderParams = GenerateVideoRequest & BaseProviderParams;
