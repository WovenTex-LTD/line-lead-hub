/**
 * production-export.ts
 *
 * Programmatic production report export — PDF or CSV — for any date range.
 * Produces the IDENTICAL file that the manual ReportExportDialog produces.
 *
 * Used by:
 *   - ReportExportDialog (weekly/monthly paths)
 *   - Lina AI assistant (programmatic trigger)
 */

import { format } from "date-fns";
import { supabase } from "@/integrations/supabase/client";
import { getTodayInTimezone } from "@/lib/date-utils";
import { effectivePoly } from "@/lib/finishing-utils";
import { generateProductionReportPdf } from "@/lib/report-pdf";

// ── Public API ────────────────────────────────────────────────────────────────

export interface ProductionExportParams {
  factoryId: string;
  factoryName: string;
  startDate: string; // YYYY-MM-DD
  endDate: string; // YYYY-MM-DD
  reportType: "daily" | "weekly" | "monthly";
  format: "pdf" | "csv";
  departments?: {
    sewing: boolean;
    cutting: boolean;
    finishing: boolean;
    storage: boolean;
  };
  /** Cost per person per hour (native currency). If omitted, fetched from factory_accounts. */
  headcountCostRate?: number;
  /** "BDT" | "USD". If omitted, fetched from factory_accounts. */
  headcountCostCurrency?: string;
  /**
   * Timezone used to cap the date range at today. Defaults to "Asia/Dhaka".
   * Pass the factory's timezone to match the dialog exactly.
   */
  timezone?: string;
}

/**
 * Fetches data for the given range and downloads the production report —
 * PDF via generateProductionReportPdf, CSV via the shared buildPeriodCsvRows
 * logic — producing the SAME file as the manual Export dialog.
 */
export async function exportProductionReport(
  params: ProductionExportParams
): Promise<void> {
  const {
    factoryId,
    factoryName,
    startDate,
    endDate,
    reportType,
    format: outputFormat,
    timezone = "Asia/Dhaka",
  } = params;

  const depts = params.departments ?? {
    sewing: true,
    cutting: true,
    finishing: true,
    storage: true,
  };

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
      if (params.headcountCostRate == null && factoryRow.headcount_cost_value != null) {
        hcRate = Number(factoryRow.headcount_cost_value);
      }
      if (params.headcountCostCurrency == null && factoryRow.headcount_cost_currency) {
        hcCurrency = factoryRow.headcount_cost_currency;
      }
    }
  }

  // ── 2. Exchange rate (BDT→USD) ─────────────────────────────────────────
  const bdtToUsdRate: number | null =
    hcCurrency === "BDT" ? await fetchExchangeRate() : null;

  // ── 3. Build date list (same logic as dialog) ──────────────────────────
  const todayStr = getTodayInTimezone(timezone);
  const dates: string[] = [];
  const cur = new Date(startDate + "T00:00:00");
  const end = new Date(endDate + "T00:00:00");
  const todayDate = new Date(todayStr + "T00:00:00");
  while (cur <= end && cur <= todayDate) {
    dates.push(format(cur, "yyyy-MM-dd"));
    cur.setDate(cur.getDate() + 1);
  }

  // ── 4. Period label ────────────────────────────────────────────────────
  const periodLabel = buildPeriodLabel(startDate, endDate, reportType);

  // ── 5. Parallel data fetch — identical selects to the dialog ──────────
  const [sewingRes, sewingTgtRes, cuttingRes, finishingRes, storageRes] =
    await Promise.all([
      depts.sewing
        ? supabase
            .from("sewing_actuals")
            .select(
              "*, lines(name, line_id), work_orders(po_number, buyer, style, cm_per_dozen, order_qty)"
            )
            .eq("factory_id", factoryId)
            .gte("production_date", startDate)
            .lte("production_date", endDate)
        : Promise.resolve({ data: [] }),
      depts.sewing
        ? supabase
            .from("sewing_targets")
            .select(
              "line_id, work_order_id, production_date, per_hour_target, target_total_planned, hours_planned"
            )
            .eq("factory_id", factoryId)
            .gte("production_date", startDate)
            .lte("production_date", endDate)
        : Promise.resolve({ data: [] }),
      depts.cutting
        ? supabase
            .from("cutting_actuals")
            .select(
              "*, lines!cutting_actuals_line_id_fkey(name, line_id), work_orders(po_number, buyer, style, color, cm_per_dozen, order_qty)"
            )
            .eq("factory_id", factoryId)
            .gte("production_date", startDate)
            .lte("production_date", endDate)
        : Promise.resolve({ data: [] }),
      depts.finishing
        ? supabase
            .from("finishing_daily_logs")
            .select(
              "*, lines(name, line_id), work_orders(po_number, buyer, style, cm_per_dozen, order_qty)"
            )
            .eq("factory_id", factoryId)
            .eq("log_type", "OUTPUT")
            .gte("production_date", startDate)
            .lte("production_date", endDate)
        : Promise.resolve({ data: [] }),
      depts.storage
        ? supabase
            .from("storage_bin_card_transactions")
            .select(
              "*, storage_bin_cards(id, buyer, style, group_name, work_orders(po_number))"
            )
            .eq("factory_id", factoryId)
            .gte("transaction_date", startDate)
            .lte("transaction_date", endDate)
        : Promise.resolve({ data: [] }),
    ]);

  const sewData = (sewingRes as any).data || [];
  const sewTgtData = (sewingTgtRes as any).data || [];
  const cutData = (cuttingRes as any).data || [];
  const finData = (finishingRes as any).data || [];
  const stoData = (storageRes as any).data || [];

  // ── 6. Generate + download ─────────────────────────────────────────────
  if (outputFormat === "csv") {
    await generatePeriodCsvAndDownload({
      sewingData: sewData,
      sewingTargets: sewTgtData,
      cuttingData: cutData,
      finishingData: finData,
      storageData: stoData,
      departments: depts,
      label: periodLabel,
      reportType,
      factoryName,
      bdtToUsdRate,
      hcRate,
      hcCurrency,
      dates,
      startDate,
      endDate,
    });
  } else {
    generateProductionReportPdf({
      factoryName,
      reportType,
      periodLabel,
      startDate,
      endDate,
      dates,
      departments: depts,
      sewing: sewData,
      sewingTargets: sewTgtData,
      cutting: cutData,
      finishing: finData,
      storage: stoData,
      headcountCostRate: hcRate,
      headcountCostCurrency: hcCurrency,
      bdtToUsdRate,
    });
  }
}

// ── Internal helpers ──────────────────────────────────────────────────────────

/** Fetch BDT→USD exchange rate. Returns fallback (1/121) on error. */
export async function fetchExchangeRate(): Promise<number> {
  try {
    const res = await fetch("https://open.er-api.com/v6/latest/USD");
    const json = await res.json();
    if (json?.rates?.BDT) return 1 / json.rates.BDT;
  } catch {}
  return 1 / 121;
}

function buildPeriodLabel(
  startDate: string,
  endDate: string,
  reportType: "daily" | "weekly" | "monthly"
): string {
  const start = new Date(startDate + "T00:00:00");
  const end = new Date(endDate + "T00:00:00");
  if (reportType === "daily") {
    return format(start, "MMM d, yyyy");
  }
  if (reportType === "weekly") {
    return `${format(start, "MMM d")} - ${format(end, "MMM d, yyyy")}`;
  }
  // monthly
  return format(start, "MMMM yyyy");
}

// ── Period CSV generation (shared logic) ─────────────────────────────────────

export interface PeriodCsvOptions {
  sewingData: any[];
  sewingTargets: any[];
  cuttingData: any[];
  finishingData: any[];
  storageData: any[];
  departments: { sewing: boolean; cutting: boolean; finishing: boolean; storage: boolean };
  label: string;
  reportType: "daily" | "weekly" | "monthly";
  factoryName: string;
  bdtToUsdRate: number | null;
  hcRate: number;
  hcCurrency: string;
  dates: string[];
  /** Used only for the filename */
  startDate?: string;
  endDate?: string;
}

/**
 * Build all CSV rows for a weekly/monthly production report.
 * This is the shared row-building logic extracted from ReportExportDialog.generatePeriodCsv.
 * Returns a 2-D array of cells (not yet stringified).
 */
export async function buildPeriodCsvRows(
  opts: PeriodCsvOptions
): Promise<(string | number | null)[][]> {
  const {
    sewingData,
    sewingTargets,
    cuttingData,
    finishingData,
    storageData,
    departments,
    label,
    reportType,
    factoryName,
    bdtToUsdRate,
    hcRate,
    hcCurrency,
    dates,
  } = opts;

  const isBDT = hcCurrency === "BDT";
  const costCur = isBDT ? "BDT" : "USD";
  const bdtRate = bdtToUsdRate;

  const esc = (cell: string | number | null | undefined) =>
    `"${String(cell ?? "").replace(/"/g, '""')}"`;
  void esc; // used in downloadCsvFile, not here

  const fN = (v: number | null | undefined) =>
    v != null ? v.toLocaleString() : "";
  const fUsd = (v: number) =>
    "$" +
    v.toLocaleString(undefined, {
      minimumFractionDigits: 2,
      maximumFractionDigits: 2,
    });
  const typeLabel = reportType === "weekly" ? "WEEKLY" : "MONTHLY";

  const toUsd = (native: number): number => {
    if (!isBDT || !bdtRate) return native;
    return Math.round(native * bdtRate * 100) / 100;
  };
  const lc = (
    mp: number | null,
    hrs: number | null,
    otMp: number | null,
    otHrs: number | null
  ): number => {
    if (!hcRate) return 0;
    let c = 0;
    if (mp && hrs) c += hcRate * mp * hrs;
    if (otMp && otHrs) c += hcRate * otMp * otHrs;
    return Math.round(c * 100) / 100;
  };

  const { compareLineNames: cmpLines } = await import("@/lib/sort-lines");
  const fmtDate = (d: string) => {
    const p = d.split("-");
    return `${p[2]}.${p[1]}`;
  };

  const R: (string | number | null)[][] = [];

  // ── Header ────────────────────────────────────────────────────────────
  R.push([`${factoryName} — ${typeLabel} PRODUCTION REPORT`]);
  R.push([`Period: ${label}`]);
  R.push([`Generated: ${format(new Date(), "PPpp")}`]);
  R.push([]);

  // ── Production Summary per Day ────────────────────────────────────────
  if (dates.length > 0) {
    R.push(["PRODUCTION SUMMARY"]);
    const sumHeaders = [
      "Day",
      ...(departments.sewing ? ["Sewing Out"] : []),
      ...(departments.cutting ? ["Cutting"] : []),
      ...(departments.finishing ? ["Finish Out"] : []),
      ...(departments.storage ? ["Storage Txns"] : []),
    ];
    R.push(sumHeaders);
    let totSew = 0,
      totCut = 0,
      totFin = 0,
      totSto = 0;
    dates.forEach((d) => {
      const daySew = departments.sewing
        ? sewingData
            .filter((s: any) => s.production_date === d)
            .reduce((s: number, r: any) => s + (r.good_today || 0), 0)
        : 0;
      const dayCut = departments.cutting
        ? cuttingData
            .filter((c: any) => c.production_date === d)
            .reduce((s: number, r: any) => s + (r.day_cutting || 0), 0)
        : 0;
      const dayFin = departments.finishing
        ? finishingData
            .filter((f: any) => f.production_date === d)
            .reduce((s: number, r: any) => s + (r.poly || 0), 0)
        : 0;
      const daySto = departments.storage
        ? storageData.filter((t: any) => t.transaction_date === d).length
        : 0;
      totSew += daySew;
      totCut += dayCut;
      totFin += dayFin;
      totSto += daySto;
      const dayDate = new Date(d + "T00:00:00");
      R.push([
        `${format(dayDate, "EEE")} ${fmtDate(d)}`,
        ...(departments.sewing ? [daySew] : []),
        ...(departments.cutting ? [dayCut] : []),
        ...(departments.finishing ? [dayFin] : []),
        ...(departments.storage ? [daySto] : []),
      ]);
    });
    R.push([
      "TOTAL",
      ...(departments.sewing ? [totSew] : []),
      ...(departments.cutting ? [totCut] : []),
      ...(departments.finishing ? [totFin] : []),
      ...(departments.storage ? [totSto] : []),
    ]);
    R.push([]);
  }

  // ── Financial Summary ─────────────────────────────────────────────────
  if (hcRate > 0) {
    let totalRevenue = 0,
      totalSewCost = 0,
      totalCutCost = 0,
      totalFinCost = 0;
    if (departments.sewing)
      sewingData.forEach((s: any) => {
        if (s.work_orders?.cm_per_dozen)
          totalSewCost += lc(
            s.manpower_actual,
            s.hours_actual,
            s.ot_manpower_actual,
            s.ot_hours_actual
          );
      });
    if (departments.cutting)
      cuttingData.forEach((c: any) => {
        if (c.work_orders?.cm_per_dozen)
          totalCutCost += lc(
            c.man_power,
            c.hours_actual,
            c.ot_manpower_actual,
            c.ot_hours_actual
          );
      });
    if (departments.finishing)
      finishingData.forEach((f: any) => {
        if (f.work_orders?.cm_per_dozen)
          totalFinCost += lc(
            f.m_power_actual,
            f.actual_hours,
            f.ot_manpower_actual,
            f.ot_hours_actual
          );
      });
    if (departments.sewing)
      sewingData.forEach((s: any) => {
        const cm = s.work_orders?.cm_per_dozen;
        if (cm && s.good_today) totalRevenue += (cm / 12) * s.good_today;
      });
    const totalCostNat = totalSewCost + totalCutCost + totalFinCost;
    const totalCostUsd = toUsd(totalCostNat);
    const profit = totalRevenue - totalCostUsd;
    const margin =
      totalRevenue > 0
        ? Math.round((profit / totalRevenue) * 1000) / 10
        : 0;
    if (totalRevenue > 0 || totalCostNat > 0) {
      R.push(["FINANCIAL SUMMARY (USD)"]);
      R.push([
        "Revenue",
        "Sewing Cost",
        "Cutting Cost",
        "Finishing Cost",
        "Total Cost",
        "Profit",
        "Margin",
      ]);
      R.push([
        fUsd(Math.round(totalRevenue * 100) / 100),
        fUsd(toUsd(totalSewCost)),
        fUsd(toUsd(totalCutCost)),
        fUsd(toUsd(totalFinCost)),
        fUsd(totalCostUsd),
        `${profit >= 0 ? "+" : "-"}${fUsd(Math.abs(Math.round(profit * 100) / 100))}`,
        margin + "%",
      ]);
      if (isBDT && bdtRate)
        R.push([
          `Cost in BDT: Tk${Math.round(totalCostNat).toLocaleString()} | Rate: ${(1 / bdtRate).toFixed(1)} BDT/USD`,
        ]);
      R.push([]);
    }
  }

  // ── Target lookup ─────────────────────────────────────────────────────
  const tgtLookup = new Map<string, number>();
  sewingTargets.forEach((t: any) => {
    const key = `${t.line_id}|${t.work_order_id}|${t.production_date}`;
    const resolved =
      t.target_total_planned != null
        ? t.target_total_planned
        : (t.per_hour_target || 0) * (t.hours_planned || 8);
    tgtLookup.set(key, resolved);
  });

  // ── Sewing — grouped by Line ──────────────────────────────────────────
  if (departments.sewing && sewingData.length > 0) {
    R.push(["SEWING — LINE WISE OUTPUT & COST"]);
    R.push([]);

    const byLine: Record<string, any[]> = {};
    sewingData.forEach((s: any) => {
      const ln = s.lines?.name || s.lines?.line_id || "Unknown";
      if (!byLine[ln]) byLine[ln] = [];
      byLine[ln].push(s);
    });
    const lineKeys = Object.keys(byLine).sort((a, b) => cmpLines(a, b));
    let deptOutput = 0,
      deptReject = 0,
      deptRework = 0,
      deptCostN = 0,
      deptCostU = 0;

    lineKeys.forEach((lineName) => {
      const entries = byLine[lineName].sort((a: any, b: any) =>
        (a.production_date || "").localeCompare(b.production_date || "")
      );
      R.push([`>>> ${lineName}`]);
      R.push([
        "Day",
        "PO / Style",
        "Output",
        "Reject",
        "Rework",
        "Eff %",
        "Avg/Day",
        "MP",
        "Hrs",
        "OT MP",
        "OT Hrs",
        `Cost (${costCur})`,
        "Cost ($)",
        "Notes",
      ]);
      let lineOut = 0,
        lineRej = 0,
        lineRew = 0,
        lineCN = 0,
        lineCU = 0;
      const lineDays = new Set<string>();
      entries.forEach((s: any) => {
        const cn = lc(
          s.manpower_actual,
          s.hours_actual,
          s.ot_manpower_actual,
          s.ot_hours_actual
        );
        const cu = toUsd(cn);
        lineOut += s.good_today || 0;
        lineRej += s.reject_today || 0;
        lineRew += s.rework_today || 0;
        lineCN += cn;
        lineCU += cu;
        if (s.good_today > 0) lineDays.add(s.production_date);
        const tgtKey = `${s.line_id}|${s.work_order_id}|${s.production_date}`;
        const dayTarget = tgtLookup.get(tgtKey) || 0;
        const eff =
          dayTarget > 0
            ? Math.round(((s.good_today || 0) / dayTarget) * 100)
            : null;
        R.push([
          fmtDate(s.production_date),
          (s.work_orders?.po_number || "-") +
            " / " +
            (s.work_orders?.style || "-"),
          s.good_today || 0,
          s.reject_today || 0,
          s.rework_today || 0,
          eff != null ? eff + "%" : "",
          "",
          s.manpower_actual,
          s.hours_actual,
          s.ot_manpower_actual,
          s.ot_hours_actual,
          hcRate ? cn : "",
          hcRate ? cu : "",
          s.blocker_description || s.remarks || "",
        ]);
      });
      const lineAvg =
        lineDays.size > 0 ? Math.round(lineOut / lineDays.size) : 0;
      R.push([
        `${lineName} Total`,
        "",
        lineOut,
        lineRej,
        lineRew,
        "",
        "",
        "",
        "",
        "",
        "",
        hcRate ? lineCN : "",
        hcRate ? lineCU : "",
        "",
      ]);
      if (lineAvg > 0)
        R.push([
          `  Avg Output/Day: ${fN(lineAvg)} pcs (${lineDays.size} working days)`,
        ]);
      R.push([]);
      deptOutput += lineOut;
      deptReject += lineRej;
      deptRework += lineRew;
      deptCostN += lineCN;
      deptCostU += lineCU;
    });
    void deptReject; void deptRework; void deptCostN; // used in totals line implicitly
    R.push([
      `SEWING DEPARTMENT TOTAL — Output: ${fN(deptOutput)} | Cost: ${hcRate ? fUsd(deptCostU) : "-"}`,
    ]);
    R.push([]);
  }

  // ── Cutting — grouped by PO ───────────────────────────────────────────
  if (departments.cutting && cuttingData.length > 0) {
    R.push(["CUTTING — PO WISE DETAIL & COST"]);
    R.push([]);

    const byPo: Record<string, { buyer: string; entries: any[] }> = {};
    cuttingData.forEach((c: any) => {
      const po = c.work_orders?.po_number || "Unknown PO";
      if (!byPo[po]) byPo[po] = { buyer: c.work_orders?.buyer || "-", entries: [] };
      byPo[po].entries.push(c);
    });

    let deptDayCut = 0,
      deptCostN = 0,
      deptCostU = 0;
    Object.keys(byPo)
      .sort()
      .forEach((po) => {
        const { buyer, entries } = byPo[po];
        entries.sort((a: any, b: any) => {
          if (a.production_date !== b.production_date)
            return (a.production_date || "").localeCompare(
              b.production_date || ""
            );
          return cmpLines(a.lines?.name || "", b.lines?.name || "");
        });
        R.push([`>>> PO: ${po} — Buyer: ${buyer}`]);
        R.push([
          "Day",
          "Line",
          "Colour",
          "Day Cut",
          "Day Input",
          "Total Cut",
          "Balance",
          "MP",
          "Hrs",
          "OT MP",
          "OT Hrs",
          `Cost (${costCur})`,
          "Cost ($)",
        ]);
        let poCut = 0, poCN = 0, poCU = 0;
        entries.forEach((c: any) => {
          const cn = lc(
            c.man_power,
            c.hours_actual,
            c.ot_manpower_actual,
            c.ot_hours_actual
          );
          const cu = toUsd(cn);
          poCut += c.day_cutting || 0;
          poCN += cn;
          poCU += cu;
          R.push([
            fmtDate(c.production_date),
            c.lines?.name || c.lines?.line_id || "-",
            c.work_orders?.color || c.colour || "-",
            c.day_cutting || 0,
            c.day_input || 0,
            c.total_cutting,
            c.balance,
            c.man_power,
            c.hours_actual,
            c.ot_manpower_actual,
            c.ot_hours_actual,
            hcRate ? cn : "",
            hcRate ? cu : "",
          ]);
        });
        R.push([
          `${po} Total`,
          "",
          "",
          poCut,
          "",
          "",
          "",
          "",
          "",
          "",
          "",
          hcRate ? poCN : "",
          hcRate ? poCU : "",
        ]);
        R.push([]);
        deptDayCut += poCut;
        deptCostN += poCN;
        deptCostU += poCU;
      });
    void deptCostN;
    R.push([
      `CUTTING DEPARTMENT TOTAL — Day Cut: ${fN(deptDayCut)} | Cost: ${hcRate ? fUsd(deptCostU) : "-"}`,
    ]);
    R.push([]);
  }

  // ── Finishing — grouped by PO ─────────────────────────────────────────
  if (departments.finishing && finishingData.length > 0) {
    R.push(["FINISHING — PO WISE OUTPUT, COST & REVENUE"]);
    R.push([]);

    const byPo: Record<
      string,
      { buyer: string; cmDz: number | null; entries: any[] }
    > = {};
    finishingData.forEach((f: any) => {
      const po = f.work_orders?.po_number || "Unknown PO";
      if (!byPo[po])
        byPo[po] = {
          buyer: f.work_orders?.buyer || "-",
          cmDz: f.work_orders?.cm_per_dozen || null,
          entries: [],
        };
      byPo[po].entries.push(f);
    });

    let deptPoly = 0, deptCostU = 0, deptRev = 0;
    Object.keys(byPo)
      .sort()
      .forEach((po) => {
        const { buyer, cmDz, entries } = byPo[po];
        entries.sort((a: any, b: any) =>
          (a.production_date || "").localeCompare(b.production_date || "")
        );
        R.push([
          `>>> PO: ${po} — Buyer: ${buyer}${cmDz ? ` — CM/Dz: $${cmDz.toFixed(2)}` : ""}`,
        ]);
        R.push([
          "Day",
          "Thread",
          "Check",
          "Button",
          "Iron",
          "Get Up",
          "Poly",
          "Carton",
          "MP",
          "Hrs",
          "OT MP",
          "OT Hrs",
          "Cost ($)",
          "CM/Dz",
          "Revenue ($)",
        ]);
        let poPoly = 0, poCU = 0, poRev = 0;
        entries.forEach((f: any) => {
          const cn = lc(
            f.m_power_actual,
            f.actual_hours,
            f.ot_manpower_actual,
            f.ot_hours_actual
          );
          const cu = toUsd(cn);
          poCU += cu;
          const rev = 0; // Revenue driven by sewing output, not finishing poly
          const adjPoly = effectivePoly(f.poly, f.actual_hours, f.ot_hours_actual);
          const adjCarton = effectivePoly(f.carton, f.actual_hours, f.ot_hours_actual);
          poPoly += adjPoly;
          R.push([
            fmtDate(f.production_date),
            f.thread_cutting,
            f.inside_check,
            f.buttoning,
            f.iron,
            f.get_up,
            adjPoly,
            adjCarton,
            f.m_power_actual,
            f.actual_hours,
            f.ot_manpower_actual,
            f.ot_hours_actual,
            hcRate ? cu : "",
            cmDz ? "$" + cmDz.toFixed(2) : "",
            rev > 0 ? Math.round(rev * 100) / 100 : "",
          ]);
        });
        R.push([
          `${po} Total`,
          "",
          "",
          "",
          "",
          "",
          poPoly,
          "",
          "",
          "",
          "",
          "",
          hcRate ? poCU : "",
          "",
          poRev > 0 ? Math.round(poRev * 100) / 100 : "",
        ]);
        R.push([]);
        deptPoly += poPoly;
        deptCostU += poCU;
        deptRev += poRev;
      });
    R.push([
      `FINISHING DEPARTMENT TOTAL — Poly: ${fN(deptPoly)} | Cost: ${hcRate ? fUsd(deptCostU) : "-"} | Revenue: ${deptRev > 0 ? fUsd(Math.round(deptRev * 100) / 100) : "-"} | Profit: ${deptRev > 0 && hcRate ? fUsd(Math.round((deptRev - deptCostU) * 100) / 100) : "-"}`,
    ]);
    R.push([]);
  }

  // ── Storage — grouped by PO ───────────────────────────────────────────
  if (departments.storage && storageData.length > 0) {
    R.push(["STORAGE — BIN CARD TRANSACTIONS"]);
    R.push([]);

    const byPo: Record<
      string,
      { buyer: string; style: string; entries: any[] }
    > = {};
    storageData.forEach((t: any) => {
      const po =
        t.storage_bin_cards?.work_orders?.po_number ||
        t.storage_bin_cards?.group_name ||
        "Unknown";
      if (!byPo[po])
        byPo[po] = {
          buyer: t.storage_bin_cards?.buyer || "-",
          style: t.storage_bin_cards?.style || "-",
          entries: [],
        };
      byPo[po].entries.push(t);
    });

    let totalRcv = 0, totalIss = 0;
    Object.keys(byPo)
      .sort()
      .forEach((po) => {
        const { buyer, style, entries } = byPo[po];
        entries.sort((a: any, b: any) =>
          (a.transaction_date || "").localeCompare(b.transaction_date || "")
        );
        R.push([`>>> PO: ${po} — Buyer: ${buyer}`]);
        R.push([
          "Day",
          "PO",
          "Buyer",
          "Style",
          "Receive",
          "Issue",
          "Balance",
          "Ttl Receive",
          "Remarks",
        ]);
        let poRcv = 0, poIss = 0;
        entries.forEach((t: any) => {
          poRcv += t.receive_qty || 0;
          poIss += t.issue_qty || 0;
          R.push([
            fmtDate(t.transaction_date),
            t.storage_bin_cards?.work_orders?.po_number || po,
            buyer,
            style,
            t.receive_qty,
            t.issue_qty,
            t.balance_qty,
            t.ttl_receive,
            t.remarks || "",
          ]);
        });
        R.push([`${po} Total`, "", "", "", poRcv, poIss, "", "", ""]);
        R.push([]);
        totalRcv += poRcv;
        totalIss += poIss;
      });
    R.push([
      `STORAGE DEPARTMENT TOTAL — Received: ${fN(totalRcv)} | Issued: ${fN(totalIss)}`,
    ]);
    R.push([]);
  }

  R.push(["=== END OF REPORT ==="]);
  return R;
}

/**
 * Build rows and write the CSV file to disk (or native share sheet).
 */
async function generatePeriodCsvAndDownload(
  opts: PeriodCsvOptions & { label: string; reportType: "daily" | "weekly" | "monthly" }
): Promise<void> {
  const rows = await buildPeriodCsvRows(opts);
  const escCell = (cell: string | number | null | undefined) =>
    `"${String(cell ?? "").replace(/"/g, '""')}"`;
  const csvContent = rows.map((row) => row.map(escCell).join(",")).join("\n");
  const safePeriod = opts.label
    .replace(/[^a-zA-Z0-9\- ]/g, "")
    .replace(/\s+/g, "_");
  const { downloadCsv } = await import("@/lib/capacitor");
  await downloadCsv(csvContent, `${opts.reportType}_report_${safePeriod}.csv`);
}
