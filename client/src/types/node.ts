import type { ImageInputMode, VideoInputMode } from "./model";
import type { OfficialVideoMode } from "./videoModes";

export type WorkflowNodeType = "text" | "textGenerate" | "image" | "imageGenerate" | "video" | "audio" | "script" | "compose";

export type NodeReference = { sourceNodeId: string; sourceNodeType: string; hint?: string };
export type GenerationPayloadSummary = Record<string, unknown>;

export type TextNodeData = { title: string; content: string; referencedFrom?: NodeReference };
export type TextAgentTask = "prompt-polish" | "script" | "reverse-prompt" | "custom";
export type TextGenerateNodeData = {
  title: string;
  prompt: string;
  modelConfigId?: string;
  taskType: TextAgentTask;
  status: "idle" | "generating" | "success" | "error";
  outputText?: string;
  errorMessage?: string;
  payloadSummary?: GenerationPayloadSummary;
  referencedInputs?: Array<{ sourceNodeId: string; sourceNodeType: string }>;
};
export type ImageNodeData = {
  title: string;
  assetId?: string;
  url?: string;
  localPath?: string;
  thumbnailUrl?: string;
  width?: number;
  height?: number;
  aspectRatio?: string;
};
export type ImageGenerateNodeData = {
  title: string;
  prompt: string;
  modelConfigId?: string;
  inputMode: ImageInputMode;
  aspectRatio?: string;
  imageSize?: string;
  imageQuality?: string;
  imageFormat?: string;
  generateCount: number;
  status: "idle" | "generating" | "success" | "error";
  outputAssetId?: string;
  outputUrl?: string;
  url?: string;
  thumbnailUrl?: string;
  errorCode?: string;
  errorMessage?: string;
  debugMessage?: string;
  qualityMode?: "full_quality" | "balanced" | "fast";
  payloadSummary?: GenerationPayloadSummary;
  referencedInputs?: Array<{ sourceNodeId: string; sourceNodeType: string }>;
};
export type AudioNodeData = { title: string; assetId?: string; url?: string; duration?: number };
export type VideoNodeData = {
  title: string;
  prompt: string;
  modelConfigId?: string;
  inputMode: VideoInputMode;
  videoMode?: OfficialVideoMode;
  aspectRatio?: string;
  resolution?: string;
  duration?: number;
  generateCount: number;
  status: "idle" | "generating" | "success" | "error";
  generationStartedAt?: number;
  clientRequestId?: string;
  outputAssetId?: string;
  outputUrl?: string;
  errorCode?: string;
  errorMessage?: string;
  debugMessage?: string;
  qualityMode?: "full_quality" | "balanced" | "fast";
  payloadSummary?: GenerationPayloadSummary;
  referencedInputs?: Array<{ sourceNodeId: string; sourceNodeType: string }>;
};
export type ScriptShot = {
  id: string;
  shotNumber: number;
  duration: number;
  visualDescription: string;
  prompt: string;
  subtitle?: string;
  soundDesign?: string;
};
export type ScriptNodeData = { title: string; shots: ScriptShot[] };
export type ComposeNodeData = {
  title: string;
  inputVideoAssetIds: string[];
  inputAudioAssetId?: string;
  subtitleText?: string;
  outputAssetId?: string;
  outputUrl?: string;
  status: "idle" | "composing" | "success" | "error";
  errorMessage?: string;
};
