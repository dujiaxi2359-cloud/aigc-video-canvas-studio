export type FeatureKey =
  | "text-image"
  | "reference-mimic"
  | "product-workflow"
  | "product-variant"
  | "detail-single"
  | "detail-batch"
  | "poster-basic"
  | "poster"
  | "export"
  | "watermark"
  | "all";

export type LicensePlanId = "trial" | "basic" | "pro" | "studio";

export type LicensePlan = {
  id: LicensePlanId;
  name: string;
  features: FeatureKey[];
};

export type LicenseStatus = {
  valid: boolean;
  code: string;
  planId?: LicensePlanId;
  features: FeatureKey[];
  expiresAt?: string;
  message?: string;
};
