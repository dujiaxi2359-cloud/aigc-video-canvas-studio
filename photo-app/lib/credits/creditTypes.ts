export type CreditCheckResult = {
  allowed: boolean;
  requiredCredits: number;
  message?: string;
};
