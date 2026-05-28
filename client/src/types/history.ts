export type GenerationHistory = {
  id: string;
  nodeId: string;
  projectId?: string;
  modelConfigId?: string;
  modelDisplayName?: string;
  inputMode?: string;
  prompt?: string;
  duration?: number;
  aspectRatio?: string;
  resolution?: string;
  status: "success" | "error";
  outputUrl?: string;
  errorMessage?: string;
  createdAt: number;
};
