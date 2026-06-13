import type { ImageQuality, Ratio } from "@/lib/workflow";

export type ProductProtectionLevel = "standard" | "high-fidelity" | "strict";

export type ProductProtectionSettings = {
  subjectLock: boolean;
  preserveColor: boolean;
  preserveStructure: boolean;
  preserveLogo: boolean;
  preserveAccessories: boolean;
  level: ProductProtectionLevel;
};

export const defaultProductProtection: ProductProtectionSettings = {
  subjectLock: true,
  preserveColor: true,
  preserveStructure: true,
  preserveLogo: true,
  preserveAccessories: true,
  level: "strict",
};

export type ProductWorkflowOutputType = "白底图" | "场景图" | "高级质感图" | "电商主图";
export type ProductBackgroundType = "纯白" | "浅灰" | "渐变" | "场景";
export type ProductVisualStyle =
  | "高级极简"
  | "苹果风"
  | "科技感"
  | "电商风"
  | "暗色高级"
  | "浅色高级"
  | "户外场景"
  | "节日氛围";

export type ProductVariantOutputType =
  | ProductWorkflowOutputType
  | "产品海报图";

export type SharedGenerationOptions = {
  ratio: Ratio;
  quality: ImageQuality;
  count: number;
  protection: ProductProtectionSettings;
};
