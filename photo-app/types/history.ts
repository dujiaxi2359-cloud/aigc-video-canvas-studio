export type UnifiedHistoryType =
  | "text-image"
  | "reference-mimic"
  | "product-workflow"
  | "product-variant"
  | "detail-workflow"
  | "poster-workflow";

export type UnifiedHistoryItem = {
  id: string;
  type: UnifiedHistoryType;
  title: string;
  createdAt: string;
  input: Record<string, unknown>;
  prompt: string;
  images: string[];
  thumbnails: string[];
  blueprint?: unknown;
};
