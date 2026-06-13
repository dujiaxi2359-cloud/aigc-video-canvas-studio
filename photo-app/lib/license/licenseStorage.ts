import { verifyLicense } from "@/lib/license/verifyLicense";
import type { LicenseStatus } from "@/lib/license/licenseTypes";

const licenseStorageKey = "commerce_ai_license_code";

export function saveLicenseCode(code: string) {
  localStorage.setItem(licenseStorageKey, code.trim());
}

export function loadLicenseCode() {
  return localStorage.getItem(licenseStorageKey) || "";
}

export function clearLicenseCode() {
  localStorage.removeItem(licenseStorageKey);
}

export function loadLicenseStatus(): LicenseStatus {
  return verifyLicense(loadLicenseCode());
}
