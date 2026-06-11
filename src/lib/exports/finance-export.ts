/**
 * finance-export.ts
 *
 * Programmatic finance report export — PDF or CSV — for any date range.
 * Produces the IDENTICAL file that the manual Export button on Finances page makes.
 *
 * Used by:
 *   - Finances page (handleExportPdf / handleExportCsv)
 *   - Lina AI assistant (programmatic trigger)
 */

import { format } from "date-fns";
import { jsPDF } from "jspdf";
import { supabase } from "@/integrations/supabase/client";
import { getTodayInTimezone } from "@/lib/date-utils";
import { PRODUCTION_CM_SHARE } from "@/lib/sewing-financials";

// ── Public API ────────────────────────────────────────────────────────────────

export interface FinanceExportParams {
  factoryId: string;
  factoryName: string;
  startDate: string; // YYYY-MM-DD
  endDate: string;   // YYYY-MM-DD
  format: "pdf" | "csv";
  granularity?: "line" | "po"; // default "line" (only affects doc section ordering; both are always included)
  timezone?: string;
  /** Cost rate per person per hour (native currency). If omitted, fetched from factory_accounts. */
  headcountCostRate?: number;
  /** "BDT" | "USD". If omitted, fetched from factory_accounts. */
  headcountCostCurrency?: string;
  /** BDT→USD rate. If omitted and currency is BDT, fetched from exchange-rate API. */
  bdtToUsdRate?: number | null;
  /** Date-range label used in title (e.g. "Jun 1 – Jun 7, 2026"). Inferred if omitted. */
  periodLabel?: string;
  /** "day" | "week" | "month" — only affects whether Daily Detail section is included (week/month). Inferred from date range if omitted. */
  rangeMode?: "day" | "week" | "month";
}

/**
 * Fetches sewing data for the given range and downloads the finance report
 * (PDF or CSV), producing the SAME file as the Finances page Export button.
 */
export async function exportFinanceReport(
  params: FinanceExportParams
): Promise<void> {
  const {
    factoryId,
    factoryName,
    startDate,
    timezone = "Asia/Dhaka",
  } = params;

  // ── 1. Cap endDate at today ────────────────────────────────────────────
  const todayStr = getTodayInTimezone(timezone);
  const rawEnd = params.endDate;
  const endDate = rawEnd > todayStr ? todayStr : rawEnd;

  // ── 2. Resolve headcount cost ──────────────────────────────────────────
  let hcRate: number = params.headcountCostRate ?? 0;
  let hcCurrency: string = params.headcountCostCurrency ?? "BDT";

  if (params.headcountCostRate == null || params.headcountCostCurrency == null) {
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

  // ── 3. Exchange rate (BDT→USD) ─────────────────────────────────────────
  let bdtToUsd: number | null;
  if (params.bdtToUsdRate !== undefined) {
    bdtToUsd = params.bdtToUsdRate;
  } else if (hcCurrency === "BDT") {
    bdtToUsd = await fetchFinanceExchangeRate();
  } else {
    bdtToUsd = null;
  }

  // ── 4. Fetch sewing data ───────────────────────────────────────────────
  const { data: rawSewing } = await supabase
    .from("sewing_actuals")
    .select(
      "good_today, manpower_actual, hours_actual, ot_manpower_actual, ot_hours_actual, production_date, work_orders(po_number, buyer, style, cm_per_dozen), lines(name, line_id)"
    )
    .eq("factory_id", factoryId)
    .gte("production_date", startDate)
    .lte("production_date", endDate);

  const sewingData: any[] = rawSewing || [];

  // ── 5. Infer rangeMode and label ───────────────────────────────────────
  const rangeMode: "day" | "week" | "month" =
    params.rangeMode ?? inferRangeMode(startDate, endDate);

  const label: string = params.periodLabel ?? buildFinancePeriodLabel(startDate, endDate, rangeMode);

  // ── 6. Compute rows (same logic as the page) ───────────────────────────
  const { lineRows, poRows, summary } = computeFinanceRows(
    sewingData,
    hcRate,
    hcCurrency,
    bdtToUsd
  );

  const sortedLineRows = [...lineRows].sort((a, b) => b.value - a.value);
  const sortedPoRows = [...poRows].sort((a, b) => b.value - a.value);

  // ── 7. Generate + download ─────────────────────────────────────────────
  if (params.format === "csv") {
    buildFinanceCsv({
      factoryName,
      label,
      rangeMode,
      summary,
      sortedLineRows,
      sortedPoRows,
      sewingData,
      hcRate,
      hcCurrency,
      bdtToUsd,
    });
  } else {
    buildFinancePdf({
      factoryName,
      label,
      rangeMode,
      summary,
      sortedLineRows,
      sortedPoRows,
      sewingData,
      hcRate,
      hcCurrency,
      bdtToUsd,
    });
  }
}

// ── Exchange rate helper (exported so page can reuse) ─────────────────────────

/** Fetch BDT→USD exchange rate. Returns fallback (1/121) on error. */
export async function fetchFinanceExchangeRate(): Promise<number> {
  try {
    const res = await fetch("https://open.er-api.com/v6/latest/USD");
    const json = await res.json();
    if (json?.rates?.BDT) return 1 / json.rates.BDT;
  } catch {}
  return 1 / 121;
}

// ── Row types (mirror the page's internal types) ──────────────────────────────

export interface FinanceLineRow {
  id: string;
  name: string;
  output: number;
  value: number;
  cost: number;
  margin: number;
  marginPct: number;
  outputShare: number;
  pos: { po: string; buyer: string; output: number }[];
}

export interface FinancePoRow {
  po: string;
  buyer: string;
  style: string;
  cmDz: number;
  prodCmDz: number;
  prodCmPc: number;
  output: number;
  value: number;
  cost: number;
  margin: number;
  marginPct: number;
  lines: { name: string; output: number }[];
}

export interface FinanceSummary {
  totalValue: number;
  totalCost: number;
  totalMargin: number;
  totalMarginPct: number;
  hasData: boolean;
  totalOutput: number;
}

// ── Core computation (extracted from the page's useMemo) ─────────────────────

/**
 * Compute per-line and per-PO finance rows from raw sewing actuals.
 * Uses the SAME formulas as the Finances page.
 */
export function computeFinanceRows(
  sewingData: any[],
  rate: number,
  costCurrency: string,
  bdtToUsd: number | null
): { lineRows: FinanceLineRow[]; poRows: FinancePoRow[]; summary: FinanceSummary } {
  const isBdt = costCurrency === "BDT";
  const fx = bdtToUsd ?? 1 / 121;

  const lineMap = new Map<
    string,
    {
      id: string;
      name: string;
      output: number;
      value: number;
      rawCost: number;
      posMap: Map<string, { po: string; buyer: string; output: number }>;
    }
  >();
  const poMap = new Map<
    string,
    {
      po: string;
      buyer: string;
      style: string;
      cmDz: number;
      output: number;
      value: number;
      rawCost: number;
      linesMap: Map<string, { name: string; output: number }>;
    }
  >();
  let totalOutput = 0;

  sewingData.forEach((s: any) => {
    const cmDz: number = s.work_orders?.cm_per_dozen || 0;
    // Missing-CM rule: skip rows whose PO has no CM
    if (cmDz <= 0) return;
    const lineId: string = s.lines?.line_id || s.lines?.name || "__u";
    const lineName: string = s.lines?.name || "Unassigned";
    const po: string | null = s.work_orders?.po_number || null;
    const buyer: string = s.work_orders?.buyer || "";
    const output: number = s.good_today || 0;
    const rawCost: number =
      rate > 0
        ? rate *
          ((s.manpower_actual || 0) * (s.hours_actual || 0) +
            (s.ot_manpower_actual || 0) * (s.ot_hours_actual || 0))
        : 0;
    const val: number = output > 0 ? (cmDz * PRODUCTION_CM_SHARE / 12) * output : 0;
    totalOutput += output;

    if (!lineMap.has(lineId))
      lineMap.set(lineId, {
        id: lineId,
        name: lineName,
        output: 0,
        value: 0,
        rawCost: 0,
        posMap: new Map(),
      });
    const lr = lineMap.get(lineId)!;
    lr.output += output;
    lr.value += val;
    lr.rawCost += rawCost;
    if (po) {
      const e = lr.posMap.get(po);
      if (e) e.output += output;
      else lr.posMap.set(po, { po, buyer, output });
    }

    if (po) {
      if (!poMap.has(po))
        poMap.set(po, {
          po,
          buyer,
          style: s.work_orders?.style || "",
          cmDz,
          output: 0,
          value: 0,
          rawCost: 0,
          linesMap: new Map(),
        });
      const pr = poMap.get(po)!;
      pr.output += output;
      pr.value += val;
      pr.rawCost += rawCost;
      const el = pr.linesMap.get(lineId);
      if (el) el.output += output;
      else pr.linesMap.set(lineId, { name: lineName, output });
    }
  });

  const toUsd = (r: number) => (isBdt ? r * fx : r);
  const mp = (v: number, c: number) =>
    v === 0 ? 0 : Math.round(((v - c) / v) * 100);

  const lineRows: FinanceLineRow[] = Array.from(lineMap.values()).map((r) => {
    const cost = toUsd(r.rawCost);
    const margin = r.value - cost;
    return {
      id: r.id,
      name: r.name,
      output: r.output,
      value: r.value,
      cost,
      margin,
      marginPct: mp(r.value, cost),
      outputShare: totalOutput > 0 ? Math.round((r.output / totalOutput) * 100) : 0,
      pos: Array.from(r.posMap.values()).sort((a, b) => b.output - a.output),
    };
  });

  const poRows: FinancePoRow[] = Array.from(poMap.values()).map((r) => {
    const cost = toUsd(r.rawCost);
    const margin = r.value - cost;
    const pdz = r.cmDz * PRODUCTION_CM_SHARE;
    return {
      po: r.po,
      buyer: r.buyer,
      style: r.style,
      cmDz: r.cmDz,
      prodCmDz: pdz,
      prodCmPc: pdz / 12,
      output: r.output,
      value: r.value,
      cost,
      margin,
      marginPct: mp(r.value, cost),
      lines: Array.from(r.linesMap.values()).sort((a, b) => b.output - a.output),
    };
  });

  const totalValue = lineRows.reduce((s, r) => s + r.value, 0);
  const totalCost = lineRows.reduce((s, r) => s + r.cost, 0);
  const totalMargin = totalValue - totalCost;
  const totalMarginPct =
    totalValue > 0 ? Math.round((totalMargin / totalValue) * 100) : 0;

  return {
    lineRows,
    poRows,
    summary: {
      totalValue,
      totalCost,
      totalMargin,
      totalMarginPct,
      hasData: lineRows.some((r) => r.output > 0),
      totalOutput,
    },
  };
}

// ── Options shared between PDF and CSV builders ───────────────────────────────

interface FinanceReportOptions {
  factoryName: string;
  label: string;
  rangeMode: "day" | "week" | "month";
  summary: FinanceSummary;
  sortedLineRows: FinanceLineRow[];
  sortedPoRows: FinancePoRow[];
  /** Raw sewing actuals — needed for daily-detail section */
  sewingData: any[];
  hcRate: number;
  hcCurrency: string;
  bdtToUsd: number | null;
}

// ── PDF Builder ───────────────────────────────────────────────────────────────

/**
 * Build and download (or share on native) a Finance PDF report.
 * Logic extracted 1-to-1 from Finances.tsx handleExportPdf.
 */
export function buildFinancePdf(opts: FinanceReportOptions): void {
  const { factoryName, label, rangeMode, summary, sortedLineRows, sortedPoRows, sewingData, hcRate, hcCurrency, bdtToUsd } = opts;

  const doc = new jsPDF({ orientation: "landscape", unit: "mm", format: "a4" });
  const pw = doc.internal.pageSize.getWidth();
  const ph = doc.internal.pageSize.getHeight();
  const m = 12;
  const cw = pw - m * 2;

  const fmtUsd = (v: number) =>
    `$${Math.abs(v).toLocaleString(undefined, {
      minimumFractionDigits: 2,
      maximumFractionDigits: 2,
    })}`;
  const sign = (v: number) => (v >= 0 ? "+" : "-");

  let y = m;

  // ── Header ──
  doc.setFontSize(16);
  doc.setFont("helvetica", "bold");
  doc.text("Financial Operations Report", m, y + 6);
  doc.setFontSize(9);
  doc.setFont("helvetica", "normal");
  doc.setTextColor(100);
  doc.text(`${factoryName}  |  ${label}  |  CM/dozen as entered`, m, y + 13);
  doc.text(`Generated: ${format(new Date(), "PPpp")}`, pw - m, y + 13, { align: "right" });
  doc.setTextColor(0);
  y += 20;

  // ── Divider ──
  doc.setDrawColor(220);
  doc.line(m, y, pw - m, y);
  y += 6;

  // ── Summary boxes ──
  const boxes = [
    { label: "Output Value", value: fmtUsd(summary.totalValue) },
    { label: "Operating Cost", value: fmtUsd(summary.totalCost) },
    { label: "Operating Margin", value: `${sign(summary.totalMargin)}${fmtUsd(summary.totalMargin)}` },
    { label: "Margin %", value: `${summary.totalMarginPct}%` },
    { label: "Total Output", value: `${summary.totalOutput.toLocaleString()} pcs` },
  ];
  const bw = cw / boxes.length;
  boxes.forEach((b, i) => {
    const bx = m + i * bw;
    doc.setFillColor(247, 247, 252);
    doc.roundedRect(bx, y, bw - 2, 18, 2, 2, "F");
    doc.setFontSize(7);
    doc.setFont("helvetica", "normal");
    doc.setTextColor(120);
    doc.text(b.label.toUpperCase(), bx + (bw - 2) / 2, y + 6, { align: "center" });
    doc.setFontSize(11);
    doc.setFont("helvetica", "bold");
    doc.setTextColor(0);
    doc.text(b.value, bx + (bw - 2) / 2, y + 14, { align: "center" });
  });
  y += 24;

  // ── Helper: draw a table ──
  const drawTable = (
    title: string,
    headers: string[],
    rowData: (string | number)[][],
    colWidths: number[],
    aligns: ("left" | "right" | "center")[],
  ) => {
    if (y + 30 > ph - m) { doc.addPage(); y = m; }

    doc.setFontSize(9);
    doc.setFont("helvetica", "bold");
    doc.setTextColor(0);
    doc.text(title, m, y + 4);
    y += 8;

    // Header row
    const headerH = 7;
    doc.setFillColor(237, 233, 254); // violet-100
    doc.rect(m, y, cw, headerH, "F");
    doc.setFontSize(7);
    doc.setFont("helvetica", "bold");
    doc.setTextColor(80);
    let cx = m + 1;
    headers.forEach((h, i) => {
      const tw = colWidths[i];
      if (aligns[i] === "right") doc.text(h, cx + tw - 2, y + 5, { align: "right" });
      else doc.text(h, cx + 1, y + 5);
      cx += tw;
    });
    y += headerH;

    // Data rows
    doc.setFont("helvetica", "normal");
    doc.setTextColor(30);
    rowData.forEach((row, ri) => {
      if (y + 6 > ph - m) { doc.addPage(); y = m; }
      const rowH = 6;
      if (ri % 2 === 1) { doc.setFillColor(250, 249, 255); doc.rect(m, y, cw, rowH, "F"); }
      doc.setFontSize(7.5);
      cx = m + 1;
      row.forEach((cell, i) => {
        const tw = colWidths[i];
        const txt = String(cell);
        if (aligns[i] === "right") doc.text(txt, cx + tw - 2, y + 4.5, { align: "right" });
        else doc.text(txt, cx + 1, y + 4.5);
        cx += tw;
      });
      y += rowH;
    });

    // Total row
    if (y + 7 > ph - m) { doc.addPage(); y = m; }
    doc.setFillColor(235, 230, 255);
    doc.rect(m, y, cw, 7, "F");
    doc.setFont("helvetica", "bold");
    doc.setFontSize(7.5);
    doc.setTextColor(40);
    cx = m + 1;
    const totals = rowData.reduce<(number | null)[]>((acc, row) => {
      row.forEach((cell, i) => {
        if (typeof cell === "number") acc[i] = ((acc[i] as number) || 0) + cell;
        else if (acc[i] === undefined) acc[i] = null;
      });
      return acc;
    }, []);
    headers.forEach((_, i) => {
      const tw = colWidths[i];
      if (i === 0) { doc.text("TOTAL", cx + 1, y + 5); }
      else if (typeof totals[i] === "number") {
        const v = totals[i] as number;
        const isPlainNumber = i <= 1 || headers[i].toLowerCase().includes("output (pcs)");
        const txt = isPlainNumber
          ? v.toLocaleString()
          : aligns[i] === "right"
            ? `${sign(v)}${fmtUsd(v)}`
            : `${v.toFixed(0)}`;
        if (aligns[i] === "right") doc.text(txt, cx + tw - 2, y + 5, { align: "right" });
        else doc.text(txt, cx + 1, y + 5);
      }
      cx += tw;
    });
    y += 7 + 5;
  };

  // ── By Line table ──
  drawTable(
    "BY SEWING LINE",
    ["Line", "Output (pcs)", "Output Value", "Operating Cost", "Margin", "Margin %", "Share"],
    sortedLineRows.map((r) => [
      r.name,
      r.output,
      `${sign(r.value)}${fmtUsd(r.value)}`,
      fmtUsd(r.cost),
      `${sign(r.margin)}${fmtUsd(r.margin)}`,
      `${r.marginPct}%`,
      `${r.outputShare}%`,
    ]),
    [50, 28, 40, 40, 40, 24, 20],
    ["left", "right", "right", "right", "right", "right", "right"],
  );

  // ── By Work Order table ──
  drawTable(
    "BY WORK ORDER (PO)",
    ["PO Number", "Buyer", "Style", "Output (pcs)", "CM/Dozen", "Prod CM/pc", "Output Value", "Oper. Cost", "Margin", "Margin %"],
    sortedPoRows.map((r) => [
      r.po,
      r.buyer,
      r.style,
      r.output,
      `$${r.cmDz.toFixed(2)}`,
      `$${r.prodCmPc.toFixed(4)}`,
      `${sign(r.value)}${fmtUsd(r.value)}`,
      fmtUsd(r.cost),
      `${sign(r.margin)}${fmtUsd(r.margin)}`,
      `${r.marginPct}%`,
    ]),
    [30, 30, 28, 24, 22, 24, 32, 30, 32, 20],
    ["left", "left", "left", "right", "right", "right", "right", "right", "right", "right"],
  );

  // ── Daily detail by line (week/month only) ──
  if (rangeMode !== "day") {
    const rate = hcRate;
    const isBdt = hcCurrency === "BDT";
    const fx = bdtToUsd ?? 1 / 121;
    const toUsd = (r: number) => (isBdt ? r * fx : r);

    const dayMap = new Map<
      string,
      Map<string, { name: string; output: number; value: number; rawCost: number }>
    >();
    (sewingData as any[]).forEach((s) => {
      const cmDz: number = s.work_orders?.cm_per_dozen || 0;
      if (cmDz <= 0) return;
      const date: string = s.production_date;
      const lineId: string = s.lines?.line_id || s.lines?.name || "__u";
      const lineName: string = s.lines?.name || "Unassigned";
      const output: number = s.good_today || 0;
      const rawCost: number =
        rate > 0
          ? rate *
            ((s.manpower_actual || 0) * (s.hours_actual || 0) +
              (s.ot_manpower_actual || 0) * (s.ot_hours_actual || 0))
          : 0;
      const val: number = output > 0 ? (cmDz * PRODUCTION_CM_SHARE / 12) * output : 0;
      if (!dayMap.has(date)) dayMap.set(date, new Map());
      const lm = dayMap.get(date)!;
      if (!lm.has(lineId)) lm.set(lineId, { name: lineName, output: 0, value: 0, rawCost: 0 });
      const lr = lm.get(lineId)!;
      lr.output += output;
      lr.value += val;
      lr.rawCost += rawCost;
    });

    const sortedDates = Array.from(dayMap.keys()).sort();

    if (sortedDates.length > 0) {
      if (y + 20 > ph - m) { doc.addPage(); y = m; }
      doc.setFontSize(9);
      doc.setFont("helvetica", "bold");
      doc.setTextColor(0);
      doc.text("DAILY DETAIL — BY LINE", m, y + 4);
      y += 10;

      const dCols = [50, 26, 38, 38, 38, 22];
      const dAligns: ("left" | "right")[] = ["left", "right", "right", "right", "right", "right"];
      const dHeaders = ["Line", "Output (pcs)", "Output Value", "Oper. Cost", "Margin", "Margin %"];

      sortedDates.forEach((date) => {
        const lm = dayMap.get(date)!;
        const lines = Array.from(lm.values()).sort((a, b) => b.output - a.output);
        const dayOut = lines.reduce((s, l) => s + l.output, 0);
        const dayVal = lines.reduce((s, l) => s + l.value, 0);
        const dayCost = toUsd(lines.reduce((s, l) => s + l.rawCost, 0));
        const dayMargin = dayVal - dayCost;
        const dayMpct = dayVal > 0 ? Math.round((dayMargin / dayVal) * 100) : 0;

        if (y + 14 > ph - m) { doc.addPage(); y = m; }
        const displayDate = new Date(date + "T00:00:00").toLocaleDateString("en-US", {
          weekday: "short",
          month: "short",
          day: "numeric",
        });
        doc.setFillColor(237, 233, 254);
        doc.rect(m, y, cw, 6, "F");
        doc.setFontSize(7.5);
        doc.setFont("helvetica", "bold");
        doc.setTextColor(60, 40, 120);
        doc.text(displayDate, m + 2, y + 4.5);
        doc.setTextColor(60, 40, 120);
        doc.text(
          `Total: ${dayOut.toLocaleString()} pcs  |  ${sign(dayVal)}${fmtUsd(dayVal)}  |  Cost: ${fmtUsd(dayCost)}  |  Margin: ${sign(dayMargin)}${fmtUsd(dayMargin)} (${dayMpct}%)`,
          pw - m - 2,
          y + 4.5,
          { align: "right" }
        );
        y += 6;

        if (y + 6 > ph - m) { doc.addPage(); y = m; }
        doc.setFillColor(248, 246, 255);
        doc.rect(m, y, cw, 5, "F");
        doc.setFontSize(6);
        doc.setFont("helvetica", "bold");
        doc.setTextColor(120);
        let cx = m + 1;
        dHeaders.forEach((h, i) => {
          if (dAligns[i] === "right") doc.text(h, cx + dCols[i] - 2, y + 3.5, { align: "right" });
          else doc.text(h, cx + 1, y + 3.5);
          cx += dCols[i];
        });
        y += 5;

        doc.setFont("helvetica", "normal");
        doc.setTextColor(30);
        lines.forEach((l, ri) => {
          if (y + 5 > ph - m) { doc.addPage(); y = m; }
          const cost = toUsd(l.rawCost);
          const margin = l.value - cost;
          const mpct = l.value > 0 ? Math.round((margin / l.value) * 100) : 0;
          if (ri % 2 === 1) { doc.setFillColor(252, 251, 255); doc.rect(m, y, cw, 5, "F"); }
          doc.setFontSize(7);
          cx = m + 1;
          const cells = [
            l.name,
            l.output.toLocaleString(),
            `${sign(l.value)}${fmtUsd(l.value)}`,
            fmtUsd(cost),
            `${sign(margin)}${fmtUsd(margin)}`,
            `${mpct}%`,
          ];
          cells.forEach((cell, i) => {
            if (dAligns[i] === "right") doc.text(cell, cx + dCols[i] - 2, y + 3.5, { align: "right" });
            else doc.text(cell, cx + 1, y + 3.5);
            cx += dCols[i];
          });
          y += 5;
        });
        y += 3;
      });
    }
  }

  // ── Footer ──
  doc.setFontSize(7);
  doc.setFont("helvetica", "normal");
  doc.setTextColor(160);
  doc.text(
    "Production Portal  •  Sewing dept only  •  Figures in USD",
    pw / 2,
    ph - 5,
    { align: "center" }
  );

  const filename = `financials-${label.replace(/[^a-z0-9]/gi, "-").toLowerCase()}.pdf`;

  // Use savePdf helper so native (iOS/Android) gets the share sheet
  import("@/lib/capacitor").then(({ savePdf }) => savePdf(doc, filename));
}

// ── CSV Builder ───────────────────────────────────────────────────────────────

/**
 * Build and download (or share on native) a Finance CSV report.
 * Logic extracted 1-to-1 from Finances.tsx handleExportCsv.
 */
export function buildFinanceCsv(opts: FinanceReportOptions): void {
  const { factoryName, label, rangeMode, summary, sortedLineRows, sortedPoRows, sewingData, hcRate, hcCurrency, bdtToUsd } = opts;

  const fmtN = (v: number, dp = 2) => v.toFixed(dp);
  const sign = (v: number) => (v >= 0 ? "+" : "-");
  const q = (s: string | number) => {
    const str = String(s);
    return str.includes(",") || str.includes('"') || str.includes("\n")
      ? `"${str.replace(/"/g, '""')}"` : str;
  };
  const row = (...cells: (string | number)[]) => cells.map(q).join(",");
  const blank = () => "";
  const lines: string[] = [];

  // ── Header block ──
  lines.push(row("FINANCIAL OPERATIONS REPORT"));
  lines.push(row("Factory", factoryName));
  lines.push(row("Period", label));
  lines.push(row("Generated", format(new Date(), "PPpp")));
  lines.push(row("Note", "CM/dozen as entered (sewing dept only). All figures in USD."));
  lines.push(blank());

  // ── Summary ──
  lines.push(row("SUMMARY"));
  lines.push(row("Output Value ($)", "Operating Cost ($)", "Operating Margin ($)", "Margin %", "Total Output (pcs)"));
  lines.push(
    row(
      fmtN(summary.totalValue),
      fmtN(summary.totalCost),
      `${sign(summary.totalMargin)}${fmtN(Math.abs(summary.totalMargin))}`,
      `${summary.totalMarginPct}%`,
      summary.totalOutput
    )
  );
  lines.push(blank());

  // ── By Sewing Line ──
  lines.push(row("BY SEWING LINE"));
  lines.push(row("Line", "Output (pcs)", "Output Value ($)", "Operating Cost ($)", "Margin ($)", "Margin %", "Output Share %"));
  sortedLineRows.forEach((r) => {
    lines.push(
      row(
        r.name,
        r.output,
        fmtN(r.value),
        fmtN(r.cost),
        `${sign(r.margin)}${fmtN(Math.abs(r.margin))}`,
        `${r.marginPct}%`,
        `${r.outputShare}%`
      )
    );
  });
  lines.push(
    row(
      "TOTAL",
      summary.totalOutput,
      fmtN(summary.totalValue),
      fmtN(summary.totalCost),
      `${sign(summary.totalMargin)}${fmtN(Math.abs(summary.totalMargin))}`,
      `${summary.totalMarginPct}%`,
      "100%"
    )
  );
  lines.push(blank());

  // ── By Work Order ──
  lines.push(row("BY WORK ORDER (PO)"));
  lines.push(
    row("PO Number", "Buyer", "Style", "Output (pcs)", "CM/Dozen ($)", "Prod CM/Dozen ($)", "Prod CM/pc ($)", "Output Value ($)", "Oper. Cost ($)", "Margin ($)", "Margin %")
  );
  sortedPoRows.forEach((r) => {
    lines.push(
      row(
        r.po,
        r.buyer,
        r.style,
        r.output,
        fmtN(r.cmDz),
        fmtN(r.prodCmDz),
        fmtN(r.prodCmPc, 4),
        fmtN(r.value),
        fmtN(r.cost),
        `${sign(r.margin)}${fmtN(Math.abs(r.margin))}`,
        `${r.marginPct}%`
      )
    );
  });
  lines.push(
    row(
      "TOTAL", "", "",
      summary.totalOutput,
      "", "", "",
      fmtN(summary.totalValue),
      fmtN(summary.totalCost),
      `${sign(summary.totalMargin)}${fmtN(Math.abs(summary.totalMargin))}`,
      `${summary.totalMarginPct}%`
    )
  );
  lines.push(blank());

  // ── Daily Detail (week / month only) ──
  if (rangeMode !== "day") {
    const rate = hcRate;
    const isBdt = hcCurrency === "BDT";
    const fx = bdtToUsd ?? 1 / 121;
    const toUsd = (r: number) => (isBdt ? r * fx : r);

    const dayMap = new Map<
      string,
      Map<string, { name: string; output: number; value: number; rawCost: number }>
    >();
    (sewingData as any[]).forEach((s) => {
      const cmDz: number = s.work_orders?.cm_per_dozen || 0;
      if (cmDz <= 0) return;
      const date: string = s.production_date;
      const lineId: string = s.lines?.line_id || s.lines?.name || "__u";
      const lineName: string = s.lines?.name || "Unassigned";
      const output: number = s.good_today || 0;
      const rawCost: number =
        rate > 0
          ? rate *
            ((s.manpower_actual || 0) * (s.hours_actual || 0) +
              (s.ot_manpower_actual || 0) * (s.ot_hours_actual || 0))
          : 0;
      const val: number = output > 0 ? (cmDz * PRODUCTION_CM_SHARE / 12) * output : 0;
      if (!dayMap.has(date)) dayMap.set(date, new Map());
      const lm = dayMap.get(date)!;
      if (!lm.has(lineId)) lm.set(lineId, { name: lineName, output: 0, value: 0, rawCost: 0 });
      const lr = lm.get(lineId)!;
      lr.output += output;
      lr.value += val;
      lr.rawCost += rawCost;
    });

    const sortedDates = Array.from(dayMap.keys()).sort();
    if (sortedDates.length > 0) {
      lines.push(row("DAILY DETAIL — BY LINE"));
      lines.push(row("Date", "Line", "Output (pcs)", "Output Value ($)", "Oper. Cost ($)", "Margin ($)", "Margin %"));

      sortedDates.forEach((date) => {
        const lm = dayMap.get(date)!;
        const dayLines = Array.from(lm.values()).sort((a, b) => b.output - a.output);
        const displayDate = new Date(date + "T00:00:00").toLocaleDateString("en-US", {
          weekday: "short",
          month: "short",
          day: "numeric",
          year: "numeric",
        });
        const dayOut = dayLines.reduce((s, l) => s + l.output, 0);
        const dayVal = dayLines.reduce((s, l) => s + l.value, 0);
        const dayCost = toUsd(dayLines.reduce((s, l) => s + l.rawCost, 0));
        const dayMargin = dayVal - dayCost;
        const dayMpct = dayVal > 0 ? Math.round((dayMargin / dayVal) * 100) : 0;

        dayLines.forEach((l) => {
          const cost = toUsd(l.rawCost);
          const margin = l.value - cost;
          const mpct = l.value > 0 ? Math.round((margin / l.value) * 100) : 0;
          lines.push(
            row(
              displayDate,
              l.name,
              l.output,
              fmtN(l.value),
              fmtN(cost),
              `${sign(margin)}${fmtN(Math.abs(margin))}`,
              `${mpct}%`
            )
          );
        });

        // Day subtotal
        lines.push(
          row(
            `${displayDate} — DAY TOTAL`,
            "",
            dayOut,
            fmtN(dayVal),
            fmtN(dayCost),
            `${sign(dayMargin)}${fmtN(Math.abs(dayMargin))}`,
            `${dayMpct}%`
          )
        );
        lines.push(blank());
      });
    }
  }

  // ── Footer ──
  lines.push(row("Production Portal  •  Sewing dept only  •  Figures in USD"));

  const csv = lines.join("\r\n");
  const filename = `financials-${label.replace(/[^a-z0-9]/gi, "-").toLowerCase()}.csv`;

  // Use downloadCsv helper so native (iOS/Android) gets the share sheet
  import("@/lib/capacitor").then(({ downloadCsv }) => downloadCsv(csv, filename));
}

// ── Internal helpers ──────────────────────────────────────────────────────────

function inferRangeMode(startDate: string, endDate: string): "day" | "week" | "month" {
  if (startDate === endDate) return "day";
  const start = new Date(startDate + "T00:00:00");
  const end = new Date(endDate + "T00:00:00");
  const days = Math.round((end.getTime() - start.getTime()) / 86_400_000) + 1;
  if (days <= 7) return "week";
  return "month";
}

function buildFinancePeriodLabel(
  startDate: string,
  endDate: string,
  rangeMode: "day" | "week" | "month"
): string {
  const start = new Date(startDate + "T00:00:00");
  const end = new Date(endDate + "T00:00:00");
  if (rangeMode === "day") return format(start, "EEE, MMM d yyyy");
  if (rangeMode === "week") return `${format(start, "MMM d")} – ${format(end, "MMM d, yyyy")}`;
  return format(start, "MMMM yyyy");
}
