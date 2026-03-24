/**
 * Sewing-only financial calculations for Production Portal.
 *
 * Business rules:
 *  - Only sewing department output and manpower are used.
 *  - CM is entered per dozen. Only 70% of CM is the production share
 *    (30% goes to commercial costs such as LC, transport, etc.).
 *  - production_cm_per_piece = (cm_per_dozen × 0.70) / 12
 *  - sewing_value = sewing_output × production_cm_per_piece
 *  - sewing_cost  = rate × Σ(manpower × hours + ot_manpower × ot_hours)  [sewing only]
 *  - sewing_profit = sewing_value − sewing_cost_usd
 */

/** The share of CM allocated to production (70%). */
export const PRODUCTION_CM_SHARE = 0.70;

/** Returns the production CM per piece from a CM/dozen value. */
export function productionCmPerPiece(cmPerDozen: number): number {
  return (cmPerDozen * PRODUCTION_CM_SHARE) / 12;
}

/** Returns the sewing value for a given output and CM/dozen. */
export function calcSewingValue(output: number, cmPerDozen: number): number {
  return output * productionCmPerPiece(cmPerDozen);
}

/** Returns the sewing cost for one submission in native currency. */
export function calcSewingLineCost(
  manpower: number | null | undefined,
  hours: number | null | undefined,
  otManpower: number | null | undefined,
  otHours: number | null | undefined,
  rate: number,
): number {
  if (!rate) return 0;
  let c = 0;
  if (manpower && hours) c += rate * manpower * hours;
  if (otManpower && otHours) c += rate * otManpower * otHours;
  return Math.round(c * 100) / 100;
}

/** Converts a native-currency cost to USD. */
export function toUsd(
  nativeAmount: number,
  currency: string,
  bdtToUsdRate: number | null,
): number {
  if (currency === 'BDT' && bdtToUsdRate) {
    return Math.round(nativeAmount * bdtToUsdRate * 100) / 100;
  }
  return nativeAmount;
}

// ── Shared result type ───────────────────────────────────────────────────────

export interface SewingValueRow {
  po: string;
  buyer: string;
  style: string;
  output: number;
  /** CM as entered (per dozen, full amount). */
  cmDz: number;
  /** 70% production share of CM/dozen. */
  productionCmDz: number;
  /** production_cm_per_piece = productionCmDz / 12. */
  productionCmPc: number;
  value: number;
}

export interface SewingFinancials {
  valueByPo: SewingValueRow[];
  totalValue: number;
  totalCostNative: number;
  totalCostUsd: number;
  profit: number;
  margin: number;
  costCurrency: string;
  hasData: boolean;
}

// ── Main calculator ──────────────────────────────────────────────────────────

/**
 * Calculates all sewing financials from an array of sewing actual records.
 *
 * Each record is expected to have:
 *   good_today / output  – sewing output (pcs)
 *   manpower_actual / manpower
 *   hours_actual
 *   ot_manpower_actual / ot_manpower
 *   ot_hours_actual / ot_hours
 *   work_orders?.cm_per_dozen  OR  cm_per_dozen
 *   work_orders?.po_number     OR  po_number
 *   work_orders?.buyer         OR  buyer
 *   work_orders?.style         OR  style
 */
export function calcSewingFinancials(
  sewingRecords: any[],
  rate: number,
  costCurrency: string,
  bdtToUsdRate: number | null,
): SewingFinancials {
  const valueByPoMap = new Map<string, SewingValueRow>();
  let totalValue = 0;
  let totalCostNative = 0;

  for (const s of sewingRecords) {
    // Output field varies between Dashboard (EndOfDaySubmission) and raw supabase rows
    const output: number = s.good_today ?? s.output ?? 0;
    const cmDz: number | null = s.work_orders?.cm_per_dozen ?? s.cm_per_dozen ?? null;
    const po: string = s.work_orders?.po_number ?? s.po_number ?? 'Unknown';
    const buyer: string = s.work_orders?.buyer ?? s.buyer ?? '';
    const style: string = s.work_orders?.style ?? s.style ?? '';

    // Manpower field names differ across contexts
    const manpower = s.manpower_actual ?? s.manpower ?? null;
    const hours = s.hours_actual ?? null;
    const otManpower = s.ot_manpower_actual ?? s.ot_manpower ?? null;
    const otHours = s.ot_hours_actual ?? s.ot_hours ?? null;

    // Accumulate cost
    const lineCostNative = calcSewingLineCost(manpower, hours, otManpower, otHours, rate);
    totalCostNative += lineCostNative;

    // Accumulate value (only if CM is set)
    if (cmDz && output) {
      const productionCmDz = cmDz * PRODUCTION_CM_SHARE;
      const productionCmPc = productionCmDz / 12;
      const value = output * productionCmPc;
      totalValue += value;

      // Group by PO
      const existing = valueByPoMap.get(po);
      if (existing) {
        existing.output += output;
        existing.value += value;
      } else {
        valueByPoMap.set(po, {
          po,
          buyer,
          style,
          output,
          cmDz,
          productionCmDz,
          productionCmPc,
          value,
        });
      }
    }
  }

  const totalCostUsd = toUsd(totalCostNative, costCurrency, bdtToUsdRate);
  const profit = Math.round((totalValue - totalCostUsd) * 100) / 100;
  const margin = totalValue > 0 ? Math.round((profit / totalValue) * 1000) / 10 : 0;

  return {
    valueByPo: Array.from(valueByPoMap.values()),
    totalValue: Math.round(totalValue * 100) / 100,
    totalCostNative: Math.round(totalCostNative * 100) / 100,
    totalCostUsd,
    profit,
    margin,
    costCurrency,
    hasData: totalValue > 0 || totalCostNative > 0,
  };
}
