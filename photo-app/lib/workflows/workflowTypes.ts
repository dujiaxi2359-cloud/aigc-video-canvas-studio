import type { FeatureKey } from "@/lib/license/licenseTypes";

export type WorkflowId =
  | "text-image"
  | "reference-mimic"
  | "product-workflow"
  | "product-variant"
  | "detail-workflow"
  | "poster-workflow";

export type WorkflowConfig = {
  id: WorkflowId;
  name: string;
  description: string;
  featureKey: FeatureKey;
  enabled: boolean;
  route: string;
};
