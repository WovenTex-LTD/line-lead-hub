import { useAuth } from "@/contexts/AuthContext";

export interface HeadcountCost {
  value: number | null;
  currency: string;
}

export interface EstimatedCost {
  value: number | null;
  currency: string;
  formatted: string;
}

export function useHeadcountCost() {
  const { factory } = useAuth();

  const headcountCost: HeadcountCost = {
    value: factory?.headcount_cost_value ?? null,
    currency: factory?.headcount_cost_currency ?? "BDT",
  };

  const isConfigured = headcountCost.value != null && headcountCost.value > 0;

  function calculateEstimatedCost(
    manpower: number | null | undefined,
    hours: number | null | undefined
  ): EstimatedCost {
    const symbol = headcountCost.currency === "USD" ? "$" : "৳";

    if (!isConfigured || !manpower || !hours) {
      return { value: null, currency: headcountCost.currency, formatted: "—" };
    }

    const cost = Math.round(headcountCost.value! * manpower * hours * 100) / 100;
    return {
      value: cost,
      currency: headcountCost.currency,
      formatted: `${symbol}${cost.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`,
    };
  }

  function getCurrencySymbol(): string {
    return headcountCost.currency === "USD" ? "$" : "৳";
  }

  return {
    headcountCost,
    isConfigured,
    calculateEstimatedCost,
    getCurrencySymbol,
  };
}
