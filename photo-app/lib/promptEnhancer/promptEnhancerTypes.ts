export type PromptEnhancerInput = {
  workflowType: string;
  platform?: string;
  useCase?: string;
  language?: string;
  market?: string;
  productName?: string;
  category?: string;
  brandName?: string;
  sellingPoints?: string;
  parameters?: string;
  materialInfo?: string;
  userPrompt?: string;
  imageCount?: number;
  textMode?: "editable-layers" | "image-text" | "minimal-text";
  targetWidth?: number;
  targetHeight?: number;
};

export type PromptEnhancerOutput = {
  originalPrompt: string;
  enhancedPrompt: string;
  enhancementNotes: string[];
};
