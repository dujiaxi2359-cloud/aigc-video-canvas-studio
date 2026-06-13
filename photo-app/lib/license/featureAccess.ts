import type { FeatureKey, LicenseStatus } from "@/lib/license/licenseTypes";

export function hasFeatureAccess(license: LicenseStatus, featureKey: FeatureKey) {
  if (!license.valid) return false;
  return license.features.includes("all") || license.features.includes(featureKey);
}
