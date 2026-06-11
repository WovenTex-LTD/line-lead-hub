# Insights Export Lib Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Extract the insights report export into a standalone async function `exportInsightsReport(params)` in `src/lib/exports/insights-export.ts` that produces the identical file the manual Export button makes, callable programmatically by Lina without React state.

**Architecture:** The data-loading logic already lives (duplicated) in `InsightsReportDialog.tsx` — that component is the canonical data-loader for the export file, not the full Insights page. We extract it into `insights-export.ts` as a plain async function (`loadInsightsExportData`), move the generators (`downloadInsightsPdf` / `downloadInsightsCsv`) to the lib, then refactor `ExportInsights.tsx` and `InsightsReportDialog.tsx` to import from the lib. The contract matches the production-export pattern exactly.

**Tech Stack:** TypeScript, Supabase client, jsPDF, date-fns, `@/lib/capacitor` (savePdf/downloadCsv)

---

## File Map

| File | Action | Responsibility |
|------|--------|----------------|
| `src/lib/exports/insights-export.ts` | **Create** | `InsightsExportParams`, `ExportData` re-export, `loadInsightsExportData()`, `exportInsightsReport()` |
| `src/components/insights/ExportInsights.tsx` | **Modify** | Remove generator functions; import them from `insights-export.ts`; keep component intact |
| `src/components/insights/InsightsReportDialog.tsx` | **Modify** | Replace duplicated data-building + `downloadInsightsPdf` call with one call to `exportInsightsReport()` |

No other files touched.

---

## Task 1: Create `src/lib/exports/insights-export.ts`

**Files:**
- Create: `src/lib/exports/insights-export.ts`

### What goes in this file

The file has four sections:

1. **Re-export `ExportData` type** from `ExportInsights` — `ExportData` is already defined and exported there; we re-export it so callers only need to import from one place.
2. **`InsightsExportParams` interface** — the public contract Lina uses.
3. **`loadInsightsExportData(factoryId, factoryName, startDate, endDate, headcountCostRate?, headcountCostCurrency?, timezone?)`** — plain async function that runs the Supabase queries and builds `ExportData`. This is extracted verbatim from `InsightsReportDialog.handleExport()`.
4. **`exportInsightsReport(params)`** — orchestrator: resolves cost config, fetches exchange rate, calls `loadInsightsExportData`, then calls the PDF or CSV generator.

> **Key decision:** `downloadInsightsPdf` and `downloadInsightsCsv` stay in `ExportInsights.tsx` (they import `jsPDF` and `savePdf` which belong in a component-layer utility). `insights-export.ts` imports them from there. This is the same layering as `production-export.ts` which imports `generateProductionReportPdf` from `@/lib/report-pdf`.

- [ ] **Step 1: Create the file with imports + interface**

```typescript
/**
 * insights-export.ts
 *
 * Programmatic insights report export — PDF or CSV — for any date range.
 * Produces the IDENTICAL file that the manual InsightsReportDialog produces.
 *
 * Used by:
 *   - InsightsReportDialog (manual trigger)
 *   - Lina AI assistant (programmatic trigger)
 */

import { format, subDays } from "date-fns";
import { supabase } from "@/integrations/supabase/client";
import { getTodayInTimezone } from "@/lib/date-utils";
import { effectivePoly } from "@/lib/finishing-utils";
import {
  downloadInsightsPdf,
  downloadInsightsCsv,
  type ExportData,
} from "@/components/insights/ExportInsights";

export type { ExportData };

// ── Public API ────────────────────────────────────────────────────────────────

export interface InsightsExportParams {
  factoryId: string;
  factoryName: string;
  startDate: string; // YYYY-MM-DD
  endDate: string;   // YYYY-MM-DD
  format: "pdf" | "csv";
  /** Cost per person per hour (native currency). If omitted, fetched from factory_accounts. */
  headcountCostRate?: number;
  /** "BDT" | "USD". If omitted, fetched from factory_accounts. */
  headcountCostCurrency?: string;
  /** Factory timezone. Defaults to "Asia/Dhaka". */
  timezone?: string;
}
```

- [ ] **Step 2: Add `loadInsightsExportData` — the data pipeline**

Append to the file (after the interface):

```typescript
/**
 * Fetches all data needed for an insights report over the given date range
 * and assembles an ExportData object identical to what InsightsReportDialog builds.
 */
export async function loadInsightsExportData(
  factoryId: string,
  factoryName: string,
  startDate: string,
  endDate: string,
  headcountCostRate: number,
  headcountCostCurrency: string,
  bdtToUsd: number | null,
): Promise<ExportData> {
  // ── Fetch sewing actuals ──
  const { data: sewingActuals } = await supabase
    .from("sewing_actuals")
    .select(
      "*, lines(name, line_id), work_orders(po_number, buyer, style, order_qty, cm_per_dozen), blocker_types:blocker_type_id(name)"
    )
    .eq("factory_id", factoryId)
    .gte("production_date", startDate)
    .lte("production_date", endDate);

  // ── Fetch sewing targets ──
  const { data: sewingTargets } = await supabase
    .from("sewing_targets")
    .select(
      "production_date, line_id, per_hour_target, manpower_planned, lines(name, line_id)"
    )
    .eq("factory_id", factoryId)
    .gte("production_date", startDate)
    .lte("production_date", endDate);

  // ── Fetch finishing output logs ──
  const { data: finishingLogs } = await supabase
    .from("finishing_daily_logs")
    .select(
      "*, work_orders(po_number, buyer, style, order_qty, cm_per_dozen)"
    )
    .eq("factory_id", factoryId)
    .eq("log_type", "OUTPUT")
    .gte("production_date", startDate)
    .lte("production_date", endDate);

  // ── Fetch cutting actuals ──
  const { data: cuttingActuals } = await supabase
    .from("cutting_actuals")
    .select("*, work_orders(po_number, buyer, style, cm_per_dozen)")
    .eq("factory_id", factoryId)
    .gte("production_date", startDate)
    .lte("production_date", endDate);

  void cuttingActuals; // reserved for future cost expansion

  // ── Fetch work orders for progress tracking ──
  const { data: workOrders } = await supabase
    .from("work_orders")
    .select("*, lines(name)")
    .eq("factory_id", factoryId)
    .eq("is_active", true);

  // ── Previous period (same length, immediately before startDate) ──
  const startDateObj = new Date(startDate + "T00:00:00");
  const periodDays = Math.round(
    (new Date(endDate + "T00:00:00").getTime() - startDateObj.getTime()) /
      (1000 * 60 * 60 * 24)
  );
  const prevStartStr = format(subDays(startDateObj, periodDays), "yyyy-MM-dd");

  const { data: prevSewing } = await supabase
    .from("sewing_actuals")
    .select(
      "good_today, manpower_actual, hours_actual, ot_manpower_actual, ot_hours_actual, work_orders(cm_per_dozen)"
    )
    .eq("factory_id", factoryId)
    .gte("production_date", prevStartStr)
    .lt("production_date", startDate);

  // ── Build daily data ──
  const dailyMap = new Map<
    string,
    {
      sewingOutput: number;
      sewingTarget: number;
      finishingQcPass: number;
      efficiency: number;
      blockers: number;
      manpower: number;
    }
  >();
  const getDay = (date: string) =>
    dailyMap.get(date) || {
      sewingOutput: 0,
      sewingTarget: 0,
      finishingQcPass: 0,
      efficiency: 0,
      blockers: 0,
      manpower: 0,
    };

  const sewingActualKeys = new Set(
    sewingActuals?.map((u) => `${u.line_id}_${u.production_date}`) || []
  );

  sewingActuals?.forEach((u) => {
    const d = getDay(u.production_date);
    d.sewingOutput += u.good_today || 0;
    d.manpower += u.manpower_actual || 0;
    if (u.has_blocker) d.blockers += 1;
    dailyMap.set(u.production_date, d);
  });

  sewingTargets
    ?.filter((t) =>
      sewingActualKeys.has(`${t.line_id}_${t.production_date}`)
    )
    .forEach((t) => {
      const d = getDay(t.production_date);
      d.sewingTarget += (t.per_hour_target || 0) * 8;
      dailyMap.set(t.production_date, d);
    });

  finishingLogs?.forEach((u) => {
    const d = getDay(u.production_date);
    d.finishingQcPass += (u.poly || 0) + (u.carton || 0);
    dailyMap.set(u.production_date, d);
  });

  const dailyData = Array.from(dailyMap.entries())
    .map(([date, d]) => ({
      date,
      sewingOutput: d.sewingOutput,
      sewingTarget: d.sewingTarget,
      finishingQcPass: d.finishingQcPass,
      efficiency:
        d.sewingTarget > 0
          ? Math.round((d.sewingOutput / d.sewingTarget) * 100)
          : 0,
      blockers: d.blockers,
    }))
    .sort((a, b) => a.date.localeCompare(b.date));

  // ── Build line performance ──
  const lineMap = new Map<
    string,
    {
      lineName: string;
      totalOutput: number;
      totalTarget: number;
      avgManpower: number;
      submissions: number;
      blockers: number;
    }
  >();

  sewingActuals?.forEach((u) => {
    const id = u.line_id;
    const name = u.lines?.name || u.lines?.line_id || "Unknown";
    const l = lineMap.get(id) || {
      lineName: name,
      totalOutput: 0,
      totalTarget: 0,
      avgManpower: 0,
      submissions: 0,
      blockers: 0,
    };
    l.totalOutput += u.good_today || 0;
    l.avgManpower += u.manpower_actual || 0;
    l.submissions += 1;
    if (u.has_blocker) l.blockers += 1;
    lineMap.set(id, l);
  });

  sewingTargets
    ?.filter((t) =>
      sewingActualKeys.has(`${t.line_id}_${t.production_date}`)
    )
    .forEach((t) => {
      const id = t.line_id;
      const name = t.lines?.name || t.lines?.line_id || "Unknown";
      const l = lineMap.get(id) || {
        lineName: name,
        totalOutput: 0,
        totalTarget: 0,
        avgManpower: 0,
        submissions: 0,
        blockers: 0,
      };
      l.totalTarget += (t.per_hour_target || 0) * 8;
      lineMap.set(id, l);
    });

  const linePerformance = Array.from(lineMap.values())
    .map((l) => ({
      lineName: l.lineName,
      totalOutput: l.totalOutput,
      totalTarget: l.totalTarget,
      efficiency:
        l.totalTarget > 0
          ? Math.round((l.totalOutput / l.totalTarget) * 100)
          : 0,
      avgManpower:
        l.submissions > 0 ? Math.round(l.avgManpower / l.submissions) : 0,
      blockers: l.blockers,
    }))
    .sort((a, b) => b.efficiency - a.efficiency);

  // ── Blocker breakdown ──
  const blockerMap = new Map<string, number>();
  sewingActuals
    ?.filter((u) => u.has_blocker)
    .forEach((b) => {
      const type = (b as any).blocker_types?.name || "Other";
      blockerMap.set(type, (blockerMap.get(type) || 0) + 1);
    });
  const blockerBreakdown = Array.from(blockerMap.entries())
    .map(([type, count]) => ({ type, count }))
    .sort((a, b) => b.count - a.count);

  // ── Work order progress ──
  const woMap = new Map<
    string,
    {
      poNumber: string;
      buyer: string;
      style: string;
      orderQty: number;
      totalOutput: number;
      progress: number;
    }
  >();
  workOrders?.forEach((wo) => {
    woMap.set(wo.id, {
      poNumber: wo.po_number,
      buyer: wo.buyer,
      style: wo.style,
      orderQty: wo.order_qty,
      totalOutput: 0,
      progress: 0,
    });
  });
  sewingActuals?.forEach((u) => {
    if (u.work_order_id && woMap.has(u.work_order_id)) {
      const wo = woMap.get(u.work_order_id)!;
      wo.totalOutput += u.good_today || 0;
      wo.progress =
        wo.orderQty > 0
          ? Math.round((wo.totalOutput / wo.orderQty) * 100)
          : 0;
    }
  });
  const workOrderProgress = Array.from(woMap.values())
    .filter((wo) => wo.totalOutput > 0)
    .sort((a, b) => b.progress - a.progress)
    .slice(0, 10);

  // ── Summary ──
  const totalSewingOutput =
    sewingActuals?.reduce((s, u) => s + (u.good_today || 0), 0) || 0;
  const totalFinishingQcPass =
    finishingLogs?.reduce(
      (s, u) =>
        s +
        effectivePoly(u.poly, u.actual_hours, u.ot_hours_actual) +
        effectivePoly(u.carton, u.actual_hours, u.ot_hours_actual),
      0
    ) || 0;
  const totalManpower =
    sewingActuals?.reduce((s, u) => s + (u.manpower_actual || 0), 0) || 0;
  const allBlockers = sewingActuals?.filter((u) => u.has_blocker) || [];

  // ── Financial calculations ──
  const rate = headcountCostRate;
  const costCurrency = headcountCostCurrency;
  const toUsd = (v: number) =>
    costCurrency === "BDT" && bdtToUsd ? v * bdtToUsd : v;

  let totalRevenue = 0;
  const revenueByPoMap: Record<
    string,
    { po: string; buyer: string; revenue: number; output: number }
  > = {};
  sewingActuals?.forEach((u) => {
    const cm = (u as any).work_orders?.cm_per_dozen;
    const output = u.good_today || 0;
    if (cm && output) {
      const rev = (cm / 12) * output;
      totalRevenue += rev;
      const po = (u as any).work_orders?.po_number || "Unknown";
      if (!revenueByPoMap[po])
        revenueByPoMap[po] = {
          po,
          buyer: (u as any).work_orders?.buyer || "",
          revenue: 0,
          output: 0,
        };
      revenueByPoMap[po].revenue += rev;
      revenueByPoMap[po].output += output;
    }
  });

  let sewCost = 0;
  const costByPoMap: Record<string, { sewing: number }> = {};
  const addCost = (po: string, amt: number) => {
    if (!costByPoMap[po]) costByPoMap[po] = { sewing: 0 };
    costByPoMap[po].sewing += amt;
  };

  if (rate > 0) {
    sewingActuals?.forEach((s) => {
      if (!(s as any).work_orders?.cm_per_dozen) return;
      let c = 0;
      if (s.manpower_actual && s.hours_actual)
        c += rate * s.manpower_actual * s.hours_actual;
      if (s.ot_manpower_actual && s.ot_hours_actual)
        c += rate * s.ot_manpower_actual * s.ot_hours_actual;
      sewCost += c;
      if (c > 0)
        addCost((s as any).work_orders?.po_number || "Unknown", c);
    });
  }

  const totalCostUsd = toUsd(sewCost);
  const profit = totalRevenue - totalCostUsd;
  const margin =
    totalRevenue > 0 ? (profit / totalRevenue) * 100 : 0;

  const allPos = new Set([
    ...Object.keys(revenueByPoMap),
    ...Object.keys(costByPoMap),
  ]);
  const profitByPo = Array.from(allPos)
    .map((po) => {
      const rev = revenueByPoMap[po]?.revenue || 0;
      const cn = costByPoMap[po]?.sewing || 0;
      const cu = toUsd(cn);
      const p = rev - cu;
      return {
        po,
        buyer: revenueByPoMap[po]?.buyer || "",
        revenue: Math.round(rev * 100) / 100,
        cost: Math.round(cu * 100) / 100,
        profit: Math.round(p * 100) / 100,
        margin: rev > 0 ? Math.round((p / rev) * 1000) / 10 : 0,
      };
    })
    .filter((p) => p.revenue > 0 || p.cost > 0)
    .sort((a, b) => b.profit - a.profit);

  const dailyRevMap: Record<string, number> = {};
  const dailyCostMap: Record<string, number> = {};
  sewingActuals?.forEach((u) => {
    const cm = (u as any).work_orders?.cm_per_dozen;
    const output = u.good_today || 0;
    if (cm && output)
      dailyRevMap[u.production_date] =
        (dailyRevMap[u.production_date] || 0) + (cm / 12) * output;
  });
  if (rate > 0) {
    sewingActuals?.forEach((s) => {
      if (!(s as any).work_orders?.cm_per_dozen) return;
      let c = 0;
      if (s.manpower_actual && s.hours_actual)
        c += rate * s.manpower_actual * s.hours_actual;
      if (s.ot_manpower_actual && s.ot_hours_actual)
        c += rate * s.ot_manpower_actual * s.ot_hours_actual;
      dailyCostMap[s.production_date] =
        (dailyCostMap[s.production_date] || 0) + c;
    });
  }

  const allFinDates = new Set([
    ...Object.keys(dailyRevMap),
    ...Object.keys(dailyCostMap),
  ]);
  const dailyFinancials = Array.from(allFinDates)
    .sort()
    .map((date) => {
      const r = dailyRevMap[date] || 0;
      const c = toUsd(dailyCostMap[date] || 0);
      return {
        date,
        displayDate: new Date(date + "T00:00:00").toLocaleDateString("en-US", {
          month: "short",
          day: "numeric",
        }),
        revenue: Math.round(r * 100) / 100,
        cost: Math.round(c * 100) / 100,
        profit: Math.round((r - c) * 100) / 100,
      };
    });

  // Previous period financials — sewing only
  let prevRevenue = 0;
  let prevCostNative = 0;
  prevSewing?.forEach((s) => {
    const cm = (s as any).work_orders?.cm_per_dozen;
    const output = s.good_today || 0;
    if (cm && output) prevRevenue += (cm / 12) * output;
    if (rate > 0) {
      if (s.manpower_actual && s.hours_actual)
        prevCostNative += rate * s.manpower_actual * s.hours_actual;
      if (s.ot_manpower_actual && s.ot_hours_actual)
        prevCostNative +=
          rate * s.ot_manpower_actual * s.ot_hours_actual;
    }
  });
  const prevCostUsd = toUsd(prevCostNative);
  const prevProfit = prevRevenue - prevCostUsd;
  const prevMargin =
    prevRevenue > 0 ? (prevProfit / prevRevenue) * 100 : 0;

  const hasFinancialData = totalRevenue > 0 || sewCost > 0;

  // ── Assemble ExportData ──
  return {
    summary: {
      totalSewingOutput,
      totalFinishingQcPass,
      avgEfficiency:
        linePerformance.length > 0
          ? Math.round(
              linePerformance.reduce((s, l) => s + l.efficiency, 0) /
                linePerformance.length
            )
          : 0,
      totalBlockers: allBlockers.length,
      openBlockers: allBlockers.filter(
        (b) => (b as any).blocker_status !== "resolved"
      ).length,
      resolvedBlockers: allBlockers.filter(
        (b) => (b as any).blocker_status === "resolved"
      ).length,
      avgManpower:
        sewingActuals && sewingActuals.length > 0
          ? Math.round(totalManpower / sewingActuals.length)
          : 0,
      daysWithData: dailyData.length,
      topPerformingLine: linePerformance[0]?.lineName || null,
      worstPerformingLine:
        linePerformance.length > 1
          ? linePerformance[linePerformance.length - 1]?.lineName
          : null,
    },
    linePerformance,
    dailyData,
    blockerBreakdown,
    workOrderProgress,
    financials: hasFinancialData
      ? {
          totalRevenue: Math.round(totalRevenue * 100) / 100,
          totalCost: Math.round(totalCostUsd * 100) / 100,
          profit: Math.round(profit * 100) / 100,
          margin: Math.round(margin * 10) / 10,
          sewingCost: Math.round(toUsd(sewCost) * 100) / 100,
          cuttingCost: 0,
          finishingCost: 0,
          revenuePerPiece:
            totalSewingOutput > 0
              ? Math.round((totalRevenue / totalSewingOutput) * 100) / 100
              : 0,
          costPerPiece:
            totalSewingOutput > 0
              ? Math.round((totalCostUsd / totalSewingOutput) * 100) / 100
              : 0,
          profitByPo,
          dailyFinancials,
          prevRevenue: Math.round(prevRevenue * 100) / 100,
          prevProfit: Math.round(prevProfit * 100) / 100,
          prevMargin: Math.round(prevMargin * 10) / 10,
          hasData: true,
        }
      : undefined,
    periodDays,
    startDate,
    endDate,
    exportDate: format(new Date(), "PPpp"),
    factoryName,
  };
}
```

- [ ] **Step 3: Add `exportInsightsReport` — the public orchestrator**

Append to the file (after `loadInsightsExportData`):

```typescript
/** Fetch BDT→USD exchange rate. Returns fallback (1/121) on error. */
async function fetchExchangeRate(): Promise<number> {
  try {
    const res = await fetch("https://open.er-api.com/v6/latest/USD");
    const json = await res.json();
    if (json?.rates?.BDT) return 1 / json.rates.BDT;
  } catch {}
  return 1 / 121;
}

/**
 * Loads insights data for the range and produces + downloads the SAME insights
 * report file the manual Export button makes (PDF via downloadInsightsPdf, CSV
 * via downloadInsightsCsv).
 */
export async function exportInsightsReport(
  params: InsightsExportParams
): Promise<void> {
  const {
    factoryId,
    factoryName,
    startDate,
    endDate,
    format: outputFormat,
    timezone = "Asia/Dhaka",
  } = params;

  // ── 1. Resolve headcount cost ──────────────────────────────────────────
  let hcRate: number = params.headcountCostRate ?? 0;
  let hcCurrency: string = params.headcountCostCurrency ?? "BDT";

  if (
    params.headcountCostRate == null ||
    params.headcountCostCurrency == null
  ) {
    const { data: factoryRow } = await supabase
      .from("factory_accounts")
      .select("headcount_cost_value, headcount_cost_currency")
      .eq("id", factoryId)
      .maybeSingle();

    if (factoryRow) {
      if (
        params.headcountCostRate == null &&
        factoryRow.headcount_cost_value != null
      ) {
        hcRate = Number(factoryRow.headcount_cost_value);
      }
      if (
        params.headcountCostCurrency == null &&
        factoryRow.headcount_cost_currency
      ) {
        hcCurrency = factoryRow.headcount_cost_currency;
      }
    }
  }

  // ── 2. Exchange rate ───────────────────────────────────────────────────
  const bdtToUsd: number | null =
    hcCurrency === "BDT" ? await fetchExchangeRate() : null;

  // ── 3. Cap endDate at today (same as dialog) ───────────────────────────
  const todayStr = getTodayInTimezone(timezone);
  const effectiveEnd = endDate > todayStr ? todayStr : endDate;

  // ── 4. Load data + build ExportData ───────────────────────────────────
  const exportData = await loadInsightsExportData(
    factoryId,
    factoryName,
    startDate,
    effectiveEnd,
    hcRate,
    hcCurrency,
    bdtToUsd,
  );

  // ── 5. Generate + download ─────────────────────────────────────────────
  if (outputFormat === "csv") {
    await downloadInsightsCsv(exportData);
  } else {
    await downloadInsightsPdf(exportData);
  }
}
```

- [ ] **Step 4: Verify the file compiles**

```bash
cd /Users/karimsabbagh/line-lead-hub && npm run build 2>&1 | tail -30
```

Expected: No errors referencing `insights-export.ts`. (Other pre-existing errors are fine as long as this file is clean.)

---

## Task 2: Refactor `InsightsReportDialog.tsx` to use the lib

**Files:**
- Modify: `src/components/insights/InsightsReportDialog.tsx`

The dialog currently duplicates all the data-loading logic. Replace the entire `handleExport` body with a call to `exportInsightsReport`.

- [ ] **Step 1: Replace `handleExport` implementation**

The new `handleExport` in `InsightsReportDialog.tsx` should be:

```typescript
async function handleExport() {
  if (!profile?.factory_id) return;
  setGenerating(true);
  try {
    await exportInsightsReport({
      factoryId: profile.factory_id,
      factoryName: factory?.name || "Factory",
      startDate: startDateStr,
      endDate: endDateStr,
      format: "pdf",
      headcountCostRate: costConfigured && headcountCost.value ? headcountCost.value : 0,
      headcountCostCurrency: headcountCost.currency,
      timezone: factory?.timezone || "Asia/Dhaka",
    });
    toast.success(`${period}-day insights PDF exported`);
    setOpen(false);
  } catch (error) {
    console.error("Export error:", error);
    toast.error("Failed to export report");
  } finally {
    setGenerating(false);
  }
}
```

- [ ] **Step 2: Update imports**

Replace the existing imports at the top of `InsightsReportDialog.tsx`. Remove:
- `import { downloadInsightsPdf, type ExportData } from "./ExportInsights";`
- `import { effectivePoly } from "@/lib/finishing-utils";`

Add:
- `import { exportInsightsReport } from "@/lib/exports/insights-export";`

Also remove these hooks/state that are no longer needed now that all data-loading is delegated:
- `const [bdtToUsd, setBdtToUsd] = useState<number | null>(null);` and its `useEffect`
- The `useHeadcountCost` hook usage (keep the `import` only if something else in the component uses it — check; in the current code it's only used in `handleExport`)

The full trimmed imports block should be:

```typescript
import { useState } from "react";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogTrigger } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { Calendar } from "@/components/ui/calendar";
import { FileDown, Loader2, CalendarIcon } from "lucide-react";
import { useAuth } from "@/contexts/AuthContext";
import { useHeadcountCost } from "@/hooks/useHeadcountCost";
import { getTodayInTimezone } from "@/lib/date-utils";
import { format, subDays } from "date-fns";
import { toast } from "sonner";
import { exportInsightsReport } from "@/lib/exports/insights-export";
```

> Note: Keep `useHeadcountCost` — it's still used to pass `headcountCostRate` and `headcountCostCurrency` to `exportInsightsReport`. The hook reads from the React context (already loaded), so there is no React-hook violation. The `bdtToUsd` state and its `useEffect` are removed since `exportInsightsReport` fetches the rate internally.

- [ ] **Step 3: Remove the now-unused `bdtToUsd` state and its useEffect**

Delete from `InsightsReportDialog.tsx`:

```typescript
  const [bdtToUsd, setBdtToUsd] = useState<number | null>(null);

  useEffect(() => {
    let cancelled = false;
    async function fetchRate() {
      try {
        const res = await fetch("https://open.er-api.com/v6/latest/USD");
        const json = await res.json();
        if (!cancelled && json?.rates?.BDT) setBdtToUsd(1 / json.rates.BDT);
      } catch {
        if (!cancelled) setBdtToUsd(1 / 121);
      }
    }
    fetchRate();
    return () => { cancelled = true; };
  }, []);
```

- [ ] **Step 4: Verify build passes**

```bash
cd /Users/karimsabbagh/line-lead-hub && npm run build 2>&1 | tail -30
```

Expected: No new type errors. The dialog's `useEffect` import can be removed from the import line (`import { useState, useEffect }` → `import { useState }`) if nothing else in the component uses it.

---

## Task 3: Final build verification

- [ ] **Step 1: Run full build**

```bash
cd /Users/karimsabbagh/line-lead-hub && npm run build 2>&1
```

Expected output ends with something like:
```
✓ built in Xs
```

No TypeScript errors. If there are pre-existing errors unrelated to this change, note them but don't fix them (out of scope).

- [ ] **Step 2: Verify the export button still compiles correctly**

```bash
grep -n "exportInsightsReport\|downloadInsightsPdf\|downloadInsightsCsv" \
  /Users/karimsabbagh/line-lead-hub/src/components/insights/InsightsReportDialog.tsx \
  /Users/karimsabbagh/line-lead-hub/src/lib/exports/insights-export.ts
```

Expected:
- `InsightsReportDialog.tsx` references `exportInsightsReport` only (no direct pdf/csv calls)
- `insights-export.ts` imports and calls both `downloadInsightsPdf` and `downloadInsightsCsv`

- [ ] **Step 3: Commit**

```bash
cd /Users/karimsabbagh/line-lead-hub && \
git add src/lib/exports/insights-export.ts \
        src/components/insights/InsightsReportDialog.tsx && \
git commit -m "feat(insights): extract export data pipeline to insights-export.ts lib

Adds exportInsightsReport(params) as a programmatic entry point (for Lina).
Refactors InsightsReportDialog to delegate all data loading to the shared lib.
ExportInsights generators (PDF/CSV) remain in place; lib imports from them.

Co-Authored-By: Claude Sonnet 4.6 <noreply@anthropic.com>"
```

---

## Self-Review

### Spec coverage check

| Requirement | Task |
|---|---|
| `InsightsExportParams` interface with exact fields | Task 1, Step 1 |
| `exportInsightsReport(params): Promise<void>` | Task 1, Step 3 |
| Reuses `downloadInsightsPdf`/`downloadInsightsCsv` — NOT duplicated | Task 1 design (generators stay in ExportInsights, lib imports them) |
| Builds `ExportData` for arbitrary date range | Task 1, Step 2 (`loadInsightsExportData`) |
| Same Supabase queries as the page uses | Task 1, Step 2 (queries copied verbatim from `InsightsReportDialog`) |
| Imports `supabase` from `@/integrations/supabase/client` | Task 1, Step 1 |
| Manual Export button refactored to use shared code | Task 2 (`InsightsReportDialog` delegates to `exportInsightsReport`) |
| `npm run build` passes | Task 3 |
| No changes to `supabase/functions/` | Not touched in any task |

### Placeholder scan

No placeholders. All code blocks are complete and copy-pasteable.

### Type consistency

- `ExportData` type: defined in `ExportInsights.tsx`, re-exported from `insights-export.ts`. Both files reference the same canonical definition — no drift possible.
- `InsightsExportParams.format` field: named `format` in the interface; destructured as `format: outputFormat` in the function body to avoid shadowing the `format` import from `date-fns`. This is consistent with the pattern used in `production-export.ts`.
- `loadInsightsExportData` signature: `(factoryId, factoryName, startDate, endDate, headcountCostRate, headcountCostCurrency, bdtToUsd)` — matches all call sites (only one: inside `exportInsightsReport`).
- `periodDays` computation in `loadInsightsExportData`: uses `Math.round(ms diff / ms_per_day)`. For a 7-day window `startDate = today - 7, endDate = today`, this gives 7. Matches the `period` number the dialog uses for `periodDays`.
