import type { CreditCheckResult } from "@/lib/credits/creditTypes";

export async function checkCredits(): Promise<CreditCheckResult> {
  // Current version uses customer-owned API keys, so no platform credits are charged.
  return { allowed: true, requiredCredits: 0 };
}
