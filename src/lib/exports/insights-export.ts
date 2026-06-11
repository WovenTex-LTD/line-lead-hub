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
