export type WorkflowHistoryType =
  | "text-image"
  | "reference-mimic"
  | "product-workflow"
  | "product-variant"
  | "detail-workflow"
  | "poster-workflow";

export type WorkflowHistoryItem = {
  id: string;
  type: WorkflowHistoryType;
  title: string;
  createdAt: string;
  input?: Record<string, unknown>;
  images?: string[];
};
