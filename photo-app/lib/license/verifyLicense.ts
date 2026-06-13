import { builtInLicenseCodes, licensePlans } from "@/lib/license/licensePlans";
import type { LicensePlanId, LicenseStatus } from "@/lib/license/licenseTypes";

type LicenseRecord = {
  planId: LicensePlanId;
  expiresAt?: string;
};

function normalizeLicenseCode(code: string) {
  return code
    .trim()
    .replace(/[－—–]/g, "-")
    .replace(/\s+/g, "")
    .toUpperCase();
}

function normalizeDate(value?: string) {
  const trimmed = value?.trim();
  if (trimmed && /^\d{4}-\d{2}-\d{2}$/.test(trimmed)) {
    return `${trimmed}T23:59:59+08:00`;
  }
  return trimmed || undefined;
}

function isExpired(expiresAt?: string) {
  if (!expiresAt) return false;
  const expiresAtMs = Date.parse(expiresAt);
  if (Number.isNaN(expiresAtMs)) return false;
  return Date.now() > expiresAtMs;
}

function parseEnvCodes() {
  return (process.env.COMMERCE_AI_LICENSE_CODES || "")
    .split(",")
    .map((entry) => entry.trim())
    .filter(Boolean)
    .reduce<Record<string, LicenseRecord>>((acc, entry) => {
      const [code = "", plan = "pro", ...expiresAtParts] = entry.split(":").map((item) => item.trim());
      const expiresAt = expiresAtParts.join(":");
      const normalizedCode = normalizeLicenseCode(code);
      if (normalizedCode && plan in licensePlans) {
        acc[normalizedCode] = {
          planId: plan as LicensePlanId,
          expiresAt: normalizeDate(expiresAt),
        };
      }
      return acc;
    }, {});
}

const normalizedBuiltInCodes = Object.entries(builtInLicenseCodes).reduce<Record<string, LicenseRecord>>(
  (acc, [code, planId]) => {
    acc[normalizeLicenseCode(code)] = { planId };
    return acc;
  },
  {},
);

export function verifyLicense(code: string): LicenseStatus {
  const normalized = normalizeLicenseCode(code);
  const license = {
    ...normalizedBuiltInCodes,
    ...parseEnvCodes(),
  }[normalized];

  if (!license) {
    return {
      valid: false,
      code: normalized,
      features: [],
      message: "Invalid license code. Please check and try again.",
    };
  }

  if (isExpired(license.expiresAt)) {
    return {
      valid: false,
      code: normalized,
      features: [],
      expiresAt: license.expiresAt,
      message: "This license code has expired.",
    };
  }

  const plan = licensePlans[license.planId];
  return {
    valid: true,
    code: normalized,
    planId: license.planId,
    features: plan.features,
    expiresAt: license.expiresAt,
    message: license.expiresAt
      ? `Activated ${plan.name}. Expires at ${license.expiresAt}.`
      : `Activated ${plan.name}.`,
  };
}
