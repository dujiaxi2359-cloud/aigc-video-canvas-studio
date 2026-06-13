import type { LicensePlan, LicensePlanId } from "@/lib/license/licenseTypes";

export const licensePlans: Record<LicensePlanId, LicensePlan> = {
  trial: {
    id: "trial",
    name: "Trial",
    features: ["text-image", "product-variant", "poster-basic", "watermark"],
  },
  basic: {
    id: "basic",
    name: "Basic",
    features: [
      "text-image",
      "product-workflow",
      "product-variant",
      "poster-basic",
      "detail-single",
    ],
  },
  pro: {
    id: "pro",
    name: "Pro",
    features: [
      "text-image",
      "reference-mimic",
      "product-workflow",
      "product-variant",
      "detail-single",
      "detail-batch",
      "poster",
      "export",
    ],
  },
  studio: {
    id: "studio",
    name: "Studio",
    features: ["all"],
  },
};

export const builtInLicenseCodes: Record<string, LicensePlanId> = {};
