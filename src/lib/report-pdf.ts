import { jsPDF } from "jspdf";
import { format } from "date-fns";
import { effectivePoly } from "@/lib/finishing-utils";

// ── Types ──

type Department = "sewing" | "cutting" | "finishing" | "storage";

export interface ReportPdfInput {
  factoryName: string;
  reportType: "daily" | "weekly" | "monthly";
  periodLabel: string;
  startDate: string;
  endDate: string;
  dates: string[]; // list of YYYY-MM-DD dates with data
  departments: Record<Department, boolean>;
  sewing: any[];
  cutting: any[];
  finishing: any[];
  storage: any[];
  headcountCostRate: number;
  headcountCostCurrency: string;
  bdtToUsdRate: number | null;
}

type Col = { label: string; w: number; align?: "left" | "right" | "center" };

// ── Generate ──

export function generateProductionReportPdf(input: ReportPdfInput) {
  const doc = new jsPDF({ orientation: "landscape", unit: "mm", format: "a4" });
  const pw = doc.internal.pageSize.getWidth();
  const ph = doc.internal.pageSize.getHeight();
  const m = 10;
  const cw = pw - m * 2;
  let y = m;

  const {
    factoryName, reportType, periodLabel, departments,
    sewing, cutting, finishing, storage,
    headcountCostRate: rate, headcountCostCurrency, bdtToUsdRate,
  } = input;

  const isBDT = headcountCostCurrency === "BDT";
  const nSym = isBDT ? "Tk " : "$";
  const fN = (v: number | null | undefined) => v != null ? v.toLocaleString() : "-";
  const fUsd = (v: number) => "$" + v.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 });
  const fNat = (v: number) => nSym + v.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 });
  const toUsd = (native: number): number => {
    if (!isBDT || !bdtToUsdRate) return native;
    return Math.round(native * bdtToUsdRate * 100) / 100;
  };
  const lineCost = (mp: number | null, hrs: number | null, otMp: number | null, otHrs: number | null): number => {
    if (!rate) return 0;
    let c = 0;
    if (mp && hrs) c += rate * mp * hrs;
    if (otMp && otHrs) c += rate * otMp * otHrs;
    return Math.round(c * 100) / 100;
  };
  const numFromName = (name: string) => parseInt(name.replace(/\D/g, "")) || 9999;
  const fmtDate = (d: string) => { const p = d.split("-"); return `${p[2]}.${p[1]}`; };
  const isDaily = reportType === "daily";
  const typeLabel = reportType === "daily" ? "DAILY" : reportType === "weekly" ? "WEEKLY" : "MONTHLY";

  // ── Generic bordered table ──
  const drawTable = (
    cols: Col[], rows: string[][], startY: number,
    opts?: { boldLastRow?: boolean; fs?: number; rh?: number; pgTitle?: string }
  ): number => {
    const fs = opts?.fs || 7;
    const rh = opts?.rh || 6.5;
    const totalW = cols.reduce((s, c) => s + c.w, 0);
    let ty = startY;

    const ensurePage = (need: number) => {
      if (ty + need > ph - 12) {
        doc.addPage();
        ty = m;
        if (opts?.pgTitle) {
          doc.setFont("helvetica", "bold"); doc.setFontSize(10); doc.setTextColor(0);
          doc.text(opts.pgTitle, m, ty); ty += 6;
        }
        // Re-draw header
        doc.setFillColor(220, 220, 220);
        doc.rect(m, ty, totalW, rh, "F");
        doc.setFont("helvetica", "bold"); doc.setFontSize(fs); doc.setTextColor(0);
        let hx = m;
        cols.forEach(c => {
          doc.rect(hx, ty, c.w, rh);
          const tx = c.align === "right" ? hx + c.w - 1.5 : hx + 1.5;
          doc.text(c.label, tx, ty + rh - 1.5, { align: c.align === "right" ? "right" : "left" });
          hx += c.w;
        });
        ty += rh;
      }
    };

    // Header
    doc.setFillColor(220, 220, 220);
    doc.rect(m, ty, totalW, rh, "F");
    doc.setFont("helvetica", "bold"); doc.setFontSize(fs); doc.setTextColor(0);
    let hx = m;
    cols.forEach(c => {
      doc.rect(hx, ty, c.w, rh);
      const tx = c.align === "right" ? hx + c.w - 1.5 : hx + 1.5;
      doc.text(c.label, tx, ty + rh - 1.5, { align: c.align === "right" ? "right" : "left" });
      hx += c.w;
    });
    ty += rh;

    // Rows
    rows.forEach((row, ri) => {
      ensurePage(rh);
      const isLast = ri === rows.length - 1 && opts?.boldLastRow;
      if (isLast) {
        doc.setFillColor(240, 240, 240);
        doc.rect(m, ty, totalW, rh, "F");
        doc.setFont("helvetica", "bold");
      } else {
        doc.setFont("helvetica", "normal");
      }
      doc.setFontSize(fs); doc.setTextColor(0);
      let rx = m;
      row.forEach((cell, ci) => {
        doc.rect(rx, ty, cols[ci].w, rh);
        const tx = cols[ci].align === "right" ? rx + cols[ci].w - 1.5 : rx + 1.5;
        doc.text((cell || "").substring(0, Math.floor(cols[ci].w / 1.8)), tx, ty + rh - 1.5, { align: cols[ci].align === "right" ? "right" : "left" });
        rx += cols[ci].w;
      });
      ty += rh;
    });
    return ty;
  };

  const pageHead = (title: string): number => {
    y = m;
    doc.setFont("helvetica", "bold"); doc.setFontSize(11); doc.setTextColor(0);
    doc.text(`${factoryName} — ${typeLabel} Report`, m, y);
    doc.setFontSize(8); doc.setFont("helvetica", "normal");
    doc.text(periodLabel, pw - m, y, { align: "right" });
    y += 5;
    doc.setDrawColor(0); doc.setLineWidth(0.4); doc.line(m, y, pw - m, y);
    y += 4;
    doc.setFont("helvetica", "bold"); doc.setFontSize(10);
    doc.text(title, m, y);
    y += 6;
    return y;
  };

  const groupHeader = (label: string, sectionTitle: string): number => {
    y += 6;
    if (y + 20 > ph - 12) { doc.addPage(); y = pageHead(sectionTitle); }
    doc.setFont("helvetica", "bold"); doc.setFontSize(9); doc.setTextColor(30, 80, 180);
    doc.text(label, m, y); y += 3;
    doc.setTextColor(0);
    return y;
  };

  const deptTotal = (text: string) => {
    y += 6; // space between last table and the total line
    if (y + 12 > ph - 12) { doc.addPage(); y = m + 10; }
    doc.setDrawColor(0); doc.setLineWidth(0.5); doc.line(m, y, pw - m, y);
    y += 5;
    doc.setFont("helvetica", "bold"); doc.setFontSize(9); doc.setTextColor(0);
    doc.text(text, m, y);
    y += 4;
  };

  // ══════════════════════════════════════════
  // PAGE 1: TITLE & SUMMARY
  // ══════════════════════════════════════════
  doc.setFont("helvetica", "bold"); doc.setFontSize(14); doc.setTextColor(0);
  doc.text(`${factoryName} — ${typeLabel} PRODUCTION REPORT`, m, y);
  y += 6;
  doc.setFontSize(9); doc.setFont("helvetica", "normal");
  doc.text(`Period: ${periodLabel} | Generated: ${format(new Date(), "PPpp")}`, m, y);
  y += 8;

  // Production summary per day
  if (input.dates.length > 0) {
    doc.setFont("helvetica", "bold"); doc.setFontSize(10);
    doc.text("PRODUCTION SUMMARY", m, y); y += 6;

    const sumCols: Col[] = [
      { label: "Day", w: 28 },
      ...(departments.sewing ? [{ label: "Sewing Out", w: 28, align: "right" as const }] : []),
      ...(departments.cutting ? [{ label: "Cutting", w: 25, align: "right" as const }] : []),
      ...(departments.finishing ? [{ label: "Finish Out", w: 28, align: "right" as const }] : []),
      ...(departments.storage ? [{ label: "Storage Txns", w: 28, align: "right" as const }] : []),
    ];

    let totSew = 0, totCut = 0, totFin = 0, totSto = 0;
    const sumRows = input.dates.map(d => {
      const daySew = departments.sewing ? sewing.filter((s: any) => s.production_date === d).reduce((s: number, r: any) => s + (r.good_today || 0), 0) : 0;
      const dayCut = departments.cutting ? cutting.filter((c: any) => c.production_date === d).reduce((s: number, r: any) => s + (r.day_cutting || 0), 0) : 0;
      const dayFin = departments.finishing ? finishing.filter((f: any) => f.production_date === d).reduce((s: number, r: any) => s + effectivePoly(r.poly, r.actual_hours, r.ot_hours_actual), 0) : 0;
      const daySto = departments.storage ? storage.filter((t: any) => t.transaction_date === d).length : 0;
      totSew += daySew; totCut += dayCut; totFin += dayFin; totSto += daySto;
      const dayDate = new Date(d + "T00:00:00");
      const label = isDaily ? format(dayDate, "EEEE") : `${format(dayDate, "EEE")} ${fmtDate(d)}`;
      return [
        label,
        ...(departments.sewing ? [fN(daySew)] : []),
        ...(departments.cutting ? [fN(dayCut)] : []),
        ...(departments.finishing ? [fN(dayFin)] : []),
        ...(departments.storage ? [String(daySto)] : []),
      ];
    });
    sumRows.push([
      "TOTAL",
      ...(departments.sewing ? [fN(totSew)] : []),
      ...(departments.cutting ? [fN(totCut)] : []),
      ...(departments.finishing ? [fN(totFin)] : []),
      ...(departments.storage ? [String(totSto)] : []),
    ]);
    y = drawTable(sumCols, sumRows, y, { boldLastRow: true });
    y += 6;
  }

  // Financial summary
  if (rate > 0) {
    let totalRevenue = 0, totalSewCost = 0, totalCutCost = 0, totalFinCost = 0;

    if (departments.sewing) {
      sewing.forEach((s: any) => {
        if (!s.work_orders?.cm_per_dozen) return;
        totalSewCost += lineCost(s.manpower_actual, s.hours_actual, s.ot_manpower_actual, s.ot_hours_actual);
      });
    }
    if (departments.cutting) {
      cutting.forEach((c: any) => {
        if (!c.work_orders?.cm_per_dozen) return;
        totalCutCost += lineCost(c.man_power, c.hours_actual, c.ot_manpower_actual, c.ot_hours_actual);
      });
    }
    if (departments.finishing) {
      finishing.forEach((f: any) => {
        if (!f.work_orders?.cm_per_dozen) return;
        totalFinCost += lineCost(f.m_power_actual, f.actual_hours, f.ot_manpower_actual, f.ot_hours_actual);
      });
    }
    // Revenue: sewing output × (cm_per_dozen / 12)
    if (departments.sewing) {
      sewing.forEach((s: any) => {
        const cm = s.work_orders?.cm_per_dozen;
        const output = s.good_today || 0;
        if (cm && output) totalRevenue += (cm / 12) * output;
      });
    }

    const totalCostNat = totalSewCost + totalCutCost + totalFinCost;
    const totalCostUsd = toUsd(totalCostNat);
    const profit = totalRevenue - totalCostUsd;
    const margin = totalRevenue > 0 ? Math.round((profit / totalRevenue) * 1000) / 10 : 0;

    if (totalRevenue > 0 || totalCostNat > 0) {
      doc.setFont("helvetica", "bold"); doc.setFontSize(10);
      doc.text("FINANCIAL SUMMARY (USD)", m, y); y += 6;

      const finCols: Col[] = [
        { label: "Revenue", w: 40, align: "right" },
        { label: "Sewing Cost", w: 40, align: "right" },
        { label: "Cutting Cost", w: 40, align: "right" },
        { label: "Finish Cost", w: 40, align: "right" },
        { label: "Total Cost", w: 40, align: "right" },
        { label: "Profit", w: 40, align: "right" },
      ];
      const finRows = [[
        fUsd(Math.round(totalRevenue * 100) / 100),
        fUsd(toUsd(totalSewCost)),
        fUsd(toUsd(totalCutCost)),
        fUsd(toUsd(totalFinCost)),
        fUsd(totalCostUsd),
        `${profit >= 0 ? "+" : "-"}${fUsd(Math.abs(Math.round(profit * 100) / 100))}`,
      ]];
      y = drawTable(finCols, finRows, y);
      y += 2;
      doc.setFontSize(7); doc.setFont("helvetica", "italic"); doc.setTextColor(90);
      if (isBDT && bdtToUsdRate) doc.text(`Cost in BDT: Tk${Math.round(totalCostNat).toLocaleString()} | Rate: ${(1 / bdtToUsdRate).toFixed(1)} BDT/USD | Margin: ${margin}%`, m, y + 2);
      else doc.text(`Margin: ${margin}%`, m, y + 2);
      y += 6;
    }
  }

  // ══════════════════════════════════════════
  // SEWING DETAIL (grouped by Line)
  // ══════════════════════════════════════════
  if (departments.sewing && sewing.length > 0) {
    try {
      doc.addPage();
      y = pageHead("SEWING — LINE WISE OUTPUT & COST");

      const sewCols: Col[] = [
        ...(!isDaily ? [{ label: "Day", w: 18 }] : []),
        { label: "PO / Style", w: 38 },
        { label: "Output", w: 18, align: "right" as const },
        { label: "Reject", w: 14, align: "right" as const },
        { label: "Rework", w: 14, align: "right" as const },
        { label: "Eff %", w: 16, align: "right" as const },
        { label: "MP", w: 12, align: "right" as const },
        { label: "Hrs", w: 12, align: "right" as const },
        { label: "OT MP", w: 14, align: "right" as const },
        { label: "OT Hrs", w: 14, align: "right" as const },
        { label: `Cost (${isBDT ? "BDT" : "USD"})`, w: 26, align: "right" as const },
        { label: "Cost ($)", w: 24, align: "right" as const },
        { label: "Notes", w: isDaily ? cw - 202 > 0 ? cw - 202 : 20 : cw - 220 > 0 ? cw - 220 : 20 },
      ];

      // Group by line
      const sewByLine: Record<string, any[]> = {};
      sewing.forEach((s: any) => {
        const ln = s.lines?.name || s.lines?.line_id || "Unknown";
        if (!sewByLine[ln]) sewByLine[ln] = [];
        sewByLine[ln].push(s);
      });
      const sewLineKeys = Object.keys(sewByLine).sort((a, b) => numFromName(a) - numFromName(b));

      let sewDeptCostNat = 0, sewDeptCostUsd = 0, sewDeptOutput = 0;

      sewLineKeys.forEach(lineName => {
        const entries = sewByLine[lineName].sort((a: any, b: any) => (a.production_date || "").localeCompare(b.production_date || ""));

        y = groupHeader(lineName, "SEWING — LINE WISE OUTPUT & COST");

        let lineCostNat = 0, lineCostUsd2 = 0, lineOutput = 0, lineReject = 0, lineRework = 0;
        const rows = entries.map((s: any) => {
          const costNat = lineCost(s.manpower_actual, s.hours_actual, s.ot_manpower_actual, s.ot_hours_actual);
          const costU = toUsd(costNat);
          lineCostNat += costNat; lineCostUsd2 += costU;
          lineOutput += s.good_today || 0;
          lineReject += s.reject_today || 0;
          lineRework += s.rework_today || 0;
          const target = s.actual_per_hour;
          const eff = target && s.manpower_actual && s.hours_actual
            ? Math.round(((s.good_today || 0) / (target * s.hours_actual)) * 100) : null;
          return [
            ...(!isDaily ? [fmtDate(s.production_date)] : []),
            ((s.work_orders?.po_number || "-") + " / " + (s.work_orders?.style || "-")).substring(0, 22),
            fN(s.good_today), String(s.reject_today || 0), String(s.rework_today || 0),
            eff != null ? eff + "%" : "-",
            fN(s.manpower_actual), fN(s.hours_actual), fN(s.ot_manpower_actual), fN(s.ot_hours_actual),
            rate ? fNat(costNat) : "-", rate ? fUsd(costU) : "-",
            (s.blocker_description || s.remarks || "-").substring(0, 24),
          ];
        });
        rows.push([
          ...(!isDaily ? [`${lineName} Total`] : [`${lineName} Total`]),
          ...(isDaily ? [] : [""]),
          fN(lineOutput), String(lineReject), String(lineRework), "",
          "", "", "", "",
          rate ? fNat(lineCostNat) : "-", rate ? fUsd(lineCostUsd2) : "-", "",
        ]);
        y = drawTable(sewCols, rows, y, { boldLastRow: true, fs: 6.5, rh: 6, pgTitle: "SEWING — LINE WISE OUTPUT & COST" });
        y += 2;

        sewDeptCostNat += lineCostNat; sewDeptCostUsd += lineCostUsd2; sewDeptOutput += lineOutput;
      });

      deptTotal(`SEWING DEPARTMENT TOTAL — Output: ${fN(sewDeptOutput)} | Cost: ${rate ? fNat(sewDeptCostNat) : "-"} (${rate ? fUsd(sewDeptCostUsd) : "-"})`);
    } catch (e) { console.error("PDF sewing section error:", e); }
  }

  // ══════════════════════════════════════════
  // CUTTING DETAIL (grouped by PO)
  // ══════════════════════════════════════════
  if (departments.cutting && cutting.length > 0) {
    try {
      doc.addPage();
      y = pageHead("CUTTING — PO WISE DETAIL & COST");

      const cutCols: Col[] = [
        ...(!isDaily ? [{ label: "Day", w: 18 }] : []),
        { label: "Line", w: 22 },
        { label: "Colour", w: 22 },
        { label: "Day Cut", w: 20, align: "right" as const },
        { label: "Day Input", w: 20, align: "right" as const },
        { label: "Total Cut", w: 22, align: "right" as const },
        { label: "Balance", w: 20, align: "right" as const },
        { label: "MP", w: 12, align: "right" as const },
        { label: "Hrs", w: 12, align: "right" as const },
        { label: "OT MP", w: 14, align: "right" as const },
        { label: "OT Hrs", w: 14, align: "right" as const },
        { label: `Cost (${isBDT ? "BDT" : "USD"})`, w: 26, align: "right" as const },
        { label: "Cost ($)", w: 24, align: "right" as const },
      ];

      const cutByPo: Record<string, { buyer: string; entries: any[] }> = {};
      cutting.forEach((c: any) => {
        const po = c.work_orders?.po_number || "Unknown PO";
        if (!cutByPo[po]) cutByPo[po] = { buyer: c.work_orders?.buyer || "-", entries: [] };
        cutByPo[po].entries.push(c);
      });
      const cutPoKeys = Object.keys(cutByPo).sort();

      let cutDeptCostNat = 0, cutDeptCostUsd = 0, cutDeptDayCut = 0;

      cutPoKeys.forEach(po => {
        const { buyer, entries } = cutByPo[po];
        entries.sort((a: any, b: any) => {
          if ((a.production_date || "") !== (b.production_date || "")) return (a.production_date || "").localeCompare(b.production_date || "");
          return numFromName(a.lines?.name || "") - numFromName(b.lines?.name || "");
        });

        y = groupHeader(`PO: ${po} — Buyer: ${buyer}`, "CUTTING — PO WISE DETAIL & COST");

        let poCostNat = 0, poCostUsd2 = 0, poDayCut = 0;
        const rows = entries.map((c: any) => {
          const costNat = lineCost(c.man_power, c.hours_actual, c.ot_manpower_actual, c.ot_hours_actual);
          const costU = toUsd(costNat);
          poCostNat += costNat; poCostUsd2 += costU;
          poDayCut += c.day_cutting || 0;
          return [
            ...(!isDaily ? [fmtDate(c.production_date)] : []),
            (c.lines?.name || c.lines?.line_id || "-").substring(0, 12),
            (c.work_orders?.color || c.colour || "-").substring(0, 13),
            fN(c.day_cutting), fN(c.day_input), fN(c.total_cutting), fN(c.balance),
            fN(c.man_power), fN(c.hours_actual), fN(c.ot_manpower_actual), fN(c.ot_hours_actual),
            rate ? fNat(costNat) : "-", rate ? fUsd(costU) : "-",
          ];
        });
        rows.push([
          `${po} Total`, ...(isDaily ? [] : [""]),
          "", "", fN(poDayCut), "", "", "", "", "", "", "",
          rate ? fNat(poCostNat) : "-", rate ? fUsd(poCostUsd2) : "-",
        ].slice(0, cutCols.length));
        y = drawTable(cutCols, rows, y, { boldLastRow: true, fs: 6.5, rh: 6, pgTitle: "CUTTING — PO WISE DETAIL & COST" });
        y += 2;

        cutDeptCostNat += poCostNat; cutDeptCostUsd += poCostUsd2; cutDeptDayCut += poDayCut;
      });

      deptTotal(`CUTTING DEPARTMENT TOTAL — Day Cut: ${fN(cutDeptDayCut)} | Cost: ${rate ? fNat(cutDeptCostNat) : "-"} (${rate ? fUsd(cutDeptCostUsd) : "-"})`);
    } catch (e) { console.error("PDF cutting section error:", e); }
  }

  // ══════════════════════════════════════════
  // FINISHING DETAIL (grouped by PO)
  // ══════════════════════════════════════════
  if (departments.finishing && finishing.length > 0) {
    try {
      doc.addPage();
      y = pageHead("FINISHING — PO WISE OUTPUT, COST & REVENUE");

      const finCols: Col[] = [
        ...(!isDaily ? [{ label: "Day", w: 18 }] : []),
        { label: "Thread", w: 16, align: "right" as const },
        { label: "Check", w: 14, align: "right" as const },
        { label: "Button", w: 16, align: "right" as const },
        { label: "Iron", w: 14, align: "right" as const },
        { label: "Get Up", w: 16, align: "right" as const },
        { label: "Poly", w: 16, align: "right" as const },
        { label: "Carton", w: 16, align: "right" as const },
        { label: "MP", w: 12, align: "right" as const },
        { label: "Hrs", w: 12, align: "right" as const },
        { label: "OT MP", w: 14, align: "right" as const },
        { label: "OT Hrs", w: 14, align: "right" as const },
        { label: "Cost ($)", w: 24, align: "right" as const },
        { label: "CM/Dz", w: 16, align: "right" as const },
        { label: "Revenue ($)", w: isDaily ? cw - 200 > 0 ? cw - 200 : 22 : cw - 218 > 0 ? cw - 218 : 22, align: "right" as const },
      ];

      const finByPo: Record<string, { buyer: string; cmDz: number | null; entries: any[] }> = {};
      finishing.forEach((f: any) => {
        const po = f.work_orders?.po_number || "Unknown PO";
        if (!finByPo[po]) finByPo[po] = { buyer: f.work_orders?.buyer || "-", cmDz: f.work_orders?.cm_per_dozen || null, entries: [] };
        finByPo[po].entries.push(f);
      });
      const finPoKeys = Object.keys(finByPo).sort();

      let finDeptCostUsd = 0, finDeptRevenue = 0, finDeptPoly = 0;

      finPoKeys.forEach(po => {
        const { buyer, cmDz, entries } = finByPo[po];
        entries.sort((a: any, b: any) => (a.production_date || "").localeCompare(b.production_date || ""));

        y = groupHeader(`PO: ${po} — Buyer: ${buyer}${cmDz ? ` — CM/Dz: $${cmDz.toFixed(2)}` : ""}`, "FINISHING — PO WISE OUTPUT, COST & REVENUE");

        let poCostUsd2 = 0, poRevenue = 0, poPoly = 0;
        const rows = entries.map((f: any) => {
          const costNat = lineCost(f.m_power_actual, f.actual_hours, f.ot_manpower_actual, f.ot_hours_actual);
          const costU = toUsd(costNat);
          poCostUsd2 += costU;
          const rev = 0; // Revenue now driven by sewing output, not finishing poly
          const adjPoly = effectivePoly(f.poly, f.actual_hours, f.ot_hours_actual);
          const adjCarton = effectivePoly(f.carton, f.actual_hours, f.ot_hours_actual);
          poPoly += adjPoly;
          return [
            ...(!isDaily ? [fmtDate(f.production_date)] : []),
            fN(f.thread_cutting), fN(f.inside_check), fN(f.buttoning), fN(f.iron), fN(f.get_up),
            fN(adjPoly), fN(adjCarton),
            fN(f.m_power_actual), fN(f.actual_hours), fN(f.ot_manpower_actual), fN(f.ot_hours_actual),
            rate ? fUsd(costU) : "-",
            cmDz ? "$" + cmDz.toFixed(2) : "-",
            rev > 0 ? fUsd(Math.round(rev * 100) / 100) : "-",
          ];
        });
        const totalRow = new Array(finCols.length).fill("");
        totalRow[0] = `${po} Total`;
        const polyIdx = isDaily ? 5 : 6;
        totalRow[polyIdx] = fN(poPoly);
        totalRow[finCols.length - 3] = rate ? fUsd(poCostUsd2) : "-";
        totalRow[finCols.length - 1] = poRevenue > 0 ? fUsd(Math.round(poRevenue * 100) / 100) : "-";
        rows.push(totalRow);
        y = drawTable(finCols, rows, y, { boldLastRow: true, fs: 6.5, rh: 6, pgTitle: "FINISHING — PO WISE OUTPUT, COST & REVENUE" });
        y += 2;

        finDeptCostUsd += poCostUsd2; finDeptRevenue += poRevenue; finDeptPoly += poPoly;
      });

      deptTotal(`FINISHING DEPARTMENT TOTAL — Poly: ${fN(finDeptPoly)} | Cost: ${rate ? fUsd(finDeptCostUsd) : "-"} | Revenue: ${finDeptRevenue > 0 ? fUsd(Math.round(finDeptRevenue * 100) / 100) : "-"} | Profit: ${finDeptRevenue > 0 && rate ? fUsd(Math.round((finDeptRevenue - finDeptCostUsd) * 100) / 100) : "-"}`);
    } catch (e) { console.error("PDF finishing section error:", e); }
  }

  // ══════════════════════════════════════════
  // STORAGE DETAIL (grouped by PO)
  // ══════════════════════════════════════════
  if (departments.storage && storage.length > 0) {
    try {
      doc.addPage();
      y = pageHead("STORAGE — BIN CARD TRANSACTIONS");

      const stoCols: Col[] = [
        ...(!isDaily ? [{ label: "Day", w: 18 }] : []),
        { label: "PO", w: 35 },
        { label: "Buyer", w: 28 },
        { label: "Style", w: 28 },
        { label: "Receive", w: 22, align: "right" as const },
        { label: "Issue", w: 22, align: "right" as const },
        { label: "Balance", w: 22, align: "right" as const },
        { label: "Ttl Receive", w: 24, align: "right" as const },
        { label: "Remarks", w: isDaily ? cw - 181 > 0 ? cw - 181 : 30 : cw - 199 > 0 ? cw - 199 : 30 },
      ];

      // Group by PO
      const stoByPo: Record<string, { buyer: string; style: string; entries: any[] }> = {};
      storage.forEach((t: any) => {
        const po = t.storage_bin_cards?.work_orders?.po_number || t.storage_bin_cards?.group_name || "Unknown";
        const buyer = t.storage_bin_cards?.buyer || "-";
        const style = t.storage_bin_cards?.style || "-";
        if (!stoByPo[po]) stoByPo[po] = { buyer, style, entries: [] };
        stoByPo[po].entries.push(t);
      });
      const stoPoKeys = Object.keys(stoByPo).sort();

      let totalReceive = 0, totalIssue = 0;

      stoPoKeys.forEach(po => {
        const { buyer, style, entries } = stoByPo[po];
        entries.sort((a: any, b: any) => (a.transaction_date || "").localeCompare(b.transaction_date || ""));

        y = groupHeader(`PO: ${po} — Buyer: ${buyer}`, "STORAGE — BIN CARD TRANSACTIONS");

        let poReceive = 0, poIssue = 0;
        const rows = entries.map((t: any) => {
          poReceive += t.receive_qty || 0;
          poIssue += t.issue_qty || 0;
          return [
            ...(!isDaily ? [fmtDate(t.transaction_date)] : []),
            (t.storage_bin_cards?.work_orders?.po_number || po).substring(0, 20),
            buyer.substring(0, 16),
            style.substring(0, 16),
            fN(t.receive_qty), fN(t.issue_qty), fN(t.balance_qty), fN(t.ttl_receive),
            (t.remarks || "-").substring(0, 30),
          ];
        });
        const totalRow = new Array(stoCols.length).fill("");
        totalRow[0] = `${po} Total`;
        const rcvIdx = isDaily ? 3 : 4;
        totalRow[rcvIdx] = fN(poReceive);
        totalRow[rcvIdx + 1] = fN(poIssue);
        rows.push(totalRow);
        y = drawTable(stoCols, rows, y, { boldLastRow: true, fs: 6.5, rh: 6, pgTitle: "STORAGE — BIN CARD TRANSACTIONS" });
        y += 2;

        totalReceive += poReceive; totalIssue += poIssue;
      });

      deptTotal(`STORAGE DEPARTMENT TOTAL — Received: ${fN(totalReceive)} | Issued: ${fN(totalIssue)}`);
    } catch (e) { console.error("PDF storage section error:", e); }
  }

  // ══════════════════════════════════════════
  // SIGN-OFF
  // ══════════════════════════════════════════
  doc.addPage();
  y = pageHead("SIGN-OFF");
  doc.setFontSize(8); doc.setFont("helvetica", "normal"); doc.setTextColor(0);
  const signLabels = ["Production Manager", "Factory Manager", "General Manager"];
  const signW = (cw - 20) / 3;
  signLabels.forEach((label, i) => {
    const sx = m + i * (signW + 10);
    doc.setDrawColor(0); doc.setLineWidth(0.3);
    doc.line(sx, y + 20, sx + signW, y + 20);
    doc.text(label, sx + signW / 2, y + 25, { align: "center" });
    doc.text("Date: _______________", sx, y + 32);
  });

  // Page footers
  const totalPages = doc.getNumberOfPages();
  for (let p = 1; p <= totalPages; p++) {
    doc.setPage(p);
    doc.setFontSize(7); doc.setFont("helvetica", "normal"); doc.setTextColor(120);
    doc.text(`Page ${p} of ${totalPages}`, pw - m - 20, ph - 5);
    doc.text(factoryName, m, ph - 5);
  }

  const safePeriod = periodLabel.replace(/[^a-zA-Z0-9\-_ ]/g, "").replace(/\s+/g, "_");
  doc.save(`${reportType}_report_${safePeriod}.pdf`);
}
