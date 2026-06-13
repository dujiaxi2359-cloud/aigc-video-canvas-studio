import { getWorkflowConfig } from "@/lib/workflows/workflowRegistry";
import type { FeatureKey } from "@/lib/license/licenseTypes";

export function getWorkflowFeatureKey(workflowId: string): FeatureKey {
  return getWorkflowConfig(workflowId)?.featureKey || "all";
}
