import type { BillingPlan } from "@/lib/billing/billingTypes";

export const billingPlans: BillingPlan[] = [
  { id: "trial", name: "Trial", description: "试用工具权限。" },
  { id: "basic", name: "Basic", description: "基础电商设计工作流。" },
  { id: "pro", name: "Pro", description: "完整电商生图工作流。" },
  { id: "studio", name: "Studio", description: "工作室和团队预留版本。" },
];
