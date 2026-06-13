export type BillingPlanId = "trial" | "basic" | "pro" | "studio";

export type BillingPlan = {
  id: BillingPlanId;
  name: string;
  monthlyPrice?: number;
  description: string;
};
