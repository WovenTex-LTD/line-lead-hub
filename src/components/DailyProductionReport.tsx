import { format } from "date-fns";
import { jsPDF } from "jspdf";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { FileDown } from "lucide-react";

// ── Types ──────────────────────────────────────────────────────────────

export interface DailyReportSewingLine {
  lineName: string;
  poNumber: string | null;
  buyer: string | null;
  style: string | null;
  targetQty: number | null;
  actualQty: number;
  rejectQty: number;
  reworkQty: number;
  manpower: number | null;
  hoursActual: number | null;
  otHours: number | null;
  otManpower: number | null;
  efficiency: number | null;
  hasBLocker: boolean;
  blockerDescription: string | null;
  stageName: string | null;
  stageProgress: number | null;
  remarks: string | null;
  submittedAt: string | null;
}

export interface DailyReportCuttingLine {
  lineName: string;
  poNumber: string | null;
  buyer: string | null;
  colour: string | null;
  dayCutting: number;
  dayInput: number;
  totalCutting: number | null;
  totalInput: number | null;
  balance: number | null;
  orderQty: number | null;
  manpower: number | null;
  hoursActual: number | null;
  otHours: number | null;
  otManpower: number | null;
  leftoverRecorded: boolean;
  leftoverType: string | null;
  leftoverQuantity: number | null;
  leftoverNotes: string | null;
  submittedAt: string | null;
}

export interface DailyReportFinishingLine {
  poNumber: string | null;
  buyer: string | null;
  style: string | null;
  logType: "TARGET" | "OUTPUT";
  threadCutting: number | null;
  insideCheck: number | null;
  topSideCheck: number | null;
  buttoning: number | null;
  iron: number | null;
  getUp: number | null;
  poly: number | null;
  carton: number | null;
  manpower: number | null;
  hours: number | null;
  otHours: number | null;
  otManpower: number | null;
  cmPerDozen: number | null;
  remarks: string | null;
  submittedAt: string | null;
}

export interface DailyReportFinancials {
  totalRevenue: number;
  totalCostUsd: number;
  totalCostNative: number;
  costCurrency: string;
  profit: number;
  margin: number;
  sewingCostUsd: number;
  cuttingCostUsd: number;
  finishingCostUsd: number;
  bdtToUsdRate: number | null;
  revenueByPo: { po: string; buyer: string; output: number; cmDz: number; revenue: number }[];
}

export interface DailyReportNote {
  title: string;
  body: string;
  department: string | null;
  lineName: string | null;
  poNumber: string | null;
  tag: string;
  impact: string | null;
  status: string;
  authorName: string | null;
}

export interface DailyReportData {
  factoryName: string;
  reportDate: string; // YYYY-MM-DD
  sewing: DailyReportSewingLine[];
  cutting: DailyReportCuttingLine[];
  finishing: DailyReportFinishingLine[];
  financials: DailyReportFinancials | null;
  generatedBy: string | null;
  headcountCostRate: number | null; // cost per person per hour
  headcountCostCurrency: string; // "BDT" or "USD"
  notes: DailyReportNote[];
}

// ── PDF Generation — Landscape Ledger ──────────────────────────────────

export function downloadDailyProductionReport(d: DailyReportData) {
  const doc = new jsPDF({ orientation: "landscape", unit: "mm", format: "a4" });
  const pw = doc.internal.pageSize.getWidth(); // ~297
  const ph = doc.internal.pageSize.getHeight(); // ~210
  const m = 10;
  const cw = pw - m * 2;
  const black = 0;
  const gray = 90;
  const lightGray = 170;

  const reportDateFormatted = format(new Date(d.reportDate + "T00:00:00"), "EEEE, MMMM d, yyyy");
  const reportDateShort = format(new Date(d.reportDate + "T00:00:00"), "dd-MMM-yyyy");

  const rate = d.headcountCostRate || 0;
  const isBDT = d.headcountCostCurrency === "BDT";
  const bdtRate = d.financials?.bdtToUsdRate || null;
  // "Tk" for BDT since ৳ doesn't render in jsPDF
  const nSym = isBDT ? "Tk " : "$";

  // ── Per-line cost helper ──
  const lineCost = (mp: number | null, hrs: number | null, otMp: number | null, otHrs: number | null): number => {
    if (!rate) return 0;
    let c = 0;
    if (mp && hrs) c += rate * mp * hrs;
    if (otMp && otHrs) c += rate * otMp * otHrs;
    return Math.round(c * 100) / 100;
  };

  const toUsd = (native: number): number => {
    if (!isBDT || !bdtRate) return native;
    return Math.round(native * bdtRate * 100) / 100;
  };

  // ── Computed summaries ──
  const sewingTotalOutput = d.sewing.reduce((s, l) => s + l.actualQty, 0);
  const sewingTotalTarget = d.sewing.reduce((s, l) => s + (l.targetQty || 0), 0);
  const sewingShort = sewingTotalTarget - sewingTotalOutput;
  const sewingTotalRejects = d.sewing.reduce((s, l) => s + l.rejectQty, 0);
  const sewingTotalRework = d.sewing.reduce((s, l) => s + l.reworkQty, 0);
  const sewingAvgEff = d.sewing.length > 0
    ? Math.round(d.sewing.filter(l => l.efficiency != null).reduce((s, l) => s + (l.efficiency || 0), 0) / Math.max(d.sewing.filter(l => l.efficiency != null).length, 1))
    : 0;
  const sewingTotalManpower = d.sewing.reduce((s, l) => s + (l.manpower || 0), 0);
  const sewingTotalOT = d.sewing.reduce((s, l) => s + (l.otHours || 0), 0);

  const cuttingTotalDay = d.cutting.reduce((s, l) => s + l.dayCutting, 0);
  const cuttingTotalInput = d.cutting.reduce((s, l) => s + l.dayInput, 0);
  const cuttingTotalManpower = d.cutting.reduce((s, l) => s + (l.manpower || 0), 0);
  const cuttingTotalBalance = d.cutting.reduce((s, l) => s + (l.balance || 0), 0);
  const cuttingLeftovers = d.cutting.filter(l => l.leftoverRecorded).length;

  const finOut = d.finishing.filter(l => l.logType === "OUTPUT");
  const finTotalPoly = finOut.reduce((s, l) => s + (l.poly || 0), 0);
  const finTotalCarton = finOut.reduce((s, l) => s + (l.carton || 0), 0);
  const finTotalManpower = finOut.reduce((s, l) => s + (l.manpower || 0), 0);
  const totalManpower = sewingTotalManpower + cuttingTotalManpower + finTotalManpower;
  const totalOTAll = sewingTotalOT + d.cutting.reduce((s, l) => s + (l.otHours || 0), 0) + finOut.reduce((s, l) => s + (l.otHours || 0), 0);

  // ── Helpers ──
  const fN = (n: number | null | undefined): string => n == null ? "-" : n.toLocaleString();
  const fUsd = (n: number): string => "$" + n.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 });
  const fNat = (n: number): string => nSym + Math.round(n).toLocaleString();

  // Footer drawn after all pages
  const drawAllFooters = () => {
    const total = doc.getNumberOfPages();
    for (let i = 1; i <= total; i++) {
      doc.setPage(i);
      doc.setDrawColor(black);
      doc.setLineWidth(0.4);
      doc.line(m, ph - 12, pw - m, ph - 12);
      doc.setFontSize(7);
      doc.setFont("helvetica", "normal");
      doc.setTextColor(gray);
      doc.text(d.factoryName + " — Daily Production Report", m, ph - 7);
      doc.text(reportDateShort, pw / 2, ph - 7, { align: "center" });
      doc.text(`Page ${i} of ${total}`, pw - m, ph - 7, { align: "right" });
    }
  };

  // Page header bar
  const pageHead = (title: string): number => {
    doc.setDrawColor(black);
    doc.setLineWidth(0.6);
    doc.line(m, 11, pw - m, 11);
    doc.setFontSize(10);
    doc.setFont("helvetica", "bold");
    doc.setTextColor(black);
    doc.text(title, m, 9);
    doc.setFontSize(8);
    doc.setFont("helvetica", "normal");
    doc.text(d.factoryName + "  |  " + reportDateShort, pw - m, 9, { align: "right" });
    return 16;
  };

  // Section heading
  const secHead = (title: string, y: number): number => {
    doc.setFontSize(9);
    doc.setFont("helvetica", "bold");
    doc.setTextColor(black);
    doc.text(title, m, y + 4);
    doc.setDrawColor(black);
    doc.setLineWidth(0.3);
    doc.line(m, y + 6, pw - m, y + 6);
    return y + 10;
  };

  // Generic bordered table
  const drawTable = (
    cols: { label: string; w: number; align?: "left" | "right" | "center" }[],
    rows: string[][],
    startY: number,
    opts?: { boldLastRow?: boolean; fs?: number; rh?: number; pgTitle?: string }
  ): number => {
    const fs = opts?.fs ?? 7;
    const rh = opts?.rh ?? 6.5;
    const hh = rh + 0.5;
    let y = startY;

    const colX: number[] = [];
    let cx = m;
    cols.forEach(c => { colX.push(cx); cx += c.w; });
    const tw = cx - m;

    const drawHead = (atY: number) => {
      doc.setFillColor(210, 210, 210);
      doc.rect(m, atY, tw, hh, "F");
      doc.setFontSize(fs);
      doc.setFont("helvetica", "bold");
      doc.setTextColor(black);
      cols.forEach((col, ci) => {
        const tx = col.align === "right" ? colX[ci] + col.w - 1.5 : col.align === "center" ? colX[ci] + col.w / 2 : colX[ci] + 1.5;
        doc.text(col.label, tx, atY + hh - 2, { align: col.align === "right" ? "right" : col.align === "center" ? "center" : "left" });
      });
      doc.setDrawColor(black);
      doc.setLineWidth(0.3);
      doc.rect(m, atY, tw, hh);
      cols.forEach((_, ci) => { if (ci > 0) doc.line(colX[ci], atY, colX[ci], atY + hh); });
      return atY + hh;
    };

    y = drawHead(y);

    rows.forEach((row, ri) => {
      if (y + rh > ph - 16) {
        doc.addPage();
        y = pageHead(opts?.pgTitle || "Daily Production Report");
        y = drawHead(y);
      }

      const isLast = ri === rows.length - 1;
      const bold = isLast && opts?.boldLastRow;

      if (bold) {
        doc.setFillColor(230, 230, 230);
        doc.rect(m, y, tw, rh, "F");
      }

      doc.setFontSize(fs);
      doc.setFont("helvetica", bold ? "bold" : "normal");
      doc.setTextColor(black);

      cols.forEach((col, ci) => {
        const val = row[ci] || "";
        const tx = col.align === "right" ? colX[ci] + col.w - 1.5 : col.align === "center" ? colX[ci] + col.w / 2 : colX[ci] + 1.5;
        doc.text(val, tx, y + rh - 1.8, { align: col.align === "right" ? "right" : col.align === "center" ? "center" : "left" });
      });

      doc.setDrawColor(black);
      doc.setLineWidth(0.15);
      doc.rect(m, y, tw, rh);
      cols.forEach((_, ci) => { if (ci > 0) doc.line(colX[ci], y, colX[ci], y + rh); });

      y += rh;
    });

    return y;
  };

  // ========== PAGE 1: DAILY SUMMARY ==========

  // Title header box
  doc.setDrawColor(black);
  doc.setLineWidth(0.6);
  doc.rect(m, 8, cw, 16);
  doc.setFontSize(13);
  doc.setFont("helvetica", "bold");
  doc.setTextColor(black);
  doc.text(d.factoryName, m + 4, 16);
  doc.setFontSize(9);
  doc.setFont("helvetica", "normal");
  doc.text("DAILY PRODUCTION REPORT", m + 4, 22);
  doc.setFontSize(9);
  doc.setFont("helvetica", "bold");
  doc.text(reportDateFormatted, pw - m - 4, 16, { align: "right" });
  doc.setFontSize(7);
  doc.setFont("helvetica", "normal");
  doc.setTextColor(gray);
  doc.text(`Generated: ${format(new Date(), "dd-MMM-yyyy h:mm a")}${d.generatedBy ? "  |  Prepared by: " + d.generatedBy : ""}`, pw - m - 4, 22, { align: "right" });

  let y = 28;

  // ── Production Summary — 3-column layout ──
  y = secHead("PRODUCTION SUMMARY", y);

  const colW = Math.floor(cw / 3);
  const col1 = m;
  const col2 = m + colW;
  const col3 = m + colW * 2;

  const drawSummaryCol = (x: number, title: string, rows: [string, string][], startY: number): number => {
    doc.setFillColor(210, 210, 210);
    doc.rect(x, startY, colW, 7, "F");
    doc.setDrawColor(black);
    doc.setLineWidth(0.3);
    doc.rect(x, startY, colW, 7);
    doc.setFontSize(8);
    doc.setFont("helvetica", "bold");
    doc.setTextColor(black);
    doc.text(title, x + colW / 2, startY + 5, { align: "center" });
    let ry = startY + 7;
    rows.forEach(([label, value]) => {
      doc.setDrawColor(black);
      doc.setLineWidth(0.15);
      doc.rect(x, ry, colW, 6);
      const divX = x + colW * 0.55;
      doc.line(divX, ry, divX, ry + 6);
      doc.setFontSize(7);
      doc.setFont("helvetica", "normal");
      doc.setTextColor(black);
      doc.text(label, x + 2, ry + 4.2);
      doc.setFont("helvetica", "bold");
      doc.text(value, divX + 2, ry + 4.2);
      ry += 6;
    });
    return ry;
  };

  const y1 = drawSummaryCol(col1, "SEWING", [
    ["Target", sewingTotalTarget.toLocaleString() + " pcs"],
    ["Actual Output", sewingTotalOutput.toLocaleString() + " pcs"],
    ["Short / Excess", (sewingShort > 0 ? "-" : "+") + Math.abs(sewingShort).toLocaleString() + " pcs"],
    ["Efficiency", sewingAvgEff + "%"],
    ["Reject", sewingTotalRejects.toLocaleString()],
    ["Rework", sewingTotalRework.toLocaleString()],
    ["Manpower", sewingTotalManpower.toLocaleString()],
    ["OT Hours", sewingTotalOT.toLocaleString() + " hrs"],
    ["Lines Active", String(d.sewing.length)],
  ], y);

  const y2 = drawSummaryCol(col2, "CUTTING", [
    ["Day Cutting", cuttingTotalDay.toLocaleString() + " pcs"],
    ["Day Input", cuttingTotalInput.toLocaleString() + " pcs"],
    ["Balance", cuttingTotalBalance.toLocaleString() + " pcs"],
    ["Manpower", cuttingTotalManpower.toLocaleString()],
    ["OT Hours", d.cutting.reduce((s, l) => s + (l.otHours || 0), 0).toLocaleString() + " hrs"],
    ["Entries", String(d.cutting.length)],
    ["Leftover Records", String(cuttingLeftovers)],
    ["", ""],
    ["", ""],
  ], y);

  const y3 = drawSummaryCol(col3, "FINISHING", [
    ["Poly (Packed)", finTotalPoly.toLocaleString() + " pcs"],
    ["Carton", finTotalCarton.toLocaleString()],
    ["Manpower", finTotalManpower.toLocaleString()],
    ["OT Hours", finOut.reduce((s, l) => s + (l.otHours || 0), 0).toLocaleString() + " hrs"],
    ["Entries", String(finOut.length)],
    ["", ""],
    ["", ""],
    ["", ""],
    ["", ""],
  ], y);

  y = Math.max(y1, y2, y3) + 4;

  // ── Totals row spanning full width ──
  doc.setDrawColor(black);
  doc.setLineWidth(0.3);
  doc.setFillColor(230, 230, 230);
  const totalsH = d.financials ? 14 : 7;
  doc.rect(m, y, cw, totalsH, "FD");
  doc.setFontSize(8);
  doc.setFont("helvetica", "bold");
  doc.setTextColor(black);
  // Row 1: operational totals
  doc.text("TOTAL ALL DEPARTMENTS", m + 4, y + 5);
  doc.text(`Manpower: ${totalManpower}`, m + cw * 0.35, y + 5);
  doc.text(`OT: ${totalOTAll} hrs`, m + cw * 0.53, y + 5);
  doc.text(`Reject: ${sewingTotalRejects}`, m + cw * 0.68, y + 5);
  doc.text(`Rework: ${sewingTotalRework}`, m + cw * 0.83, y + 5);
  // Row 2: financials (sewing only)
  if (d.financials) {
    const plSign = d.financials.profit >= 0 ? "+" : "-";
    doc.text(
      `Output Value: ${fUsd(d.financials.totalRevenue)}  |  Oper. Cost: ${fUsd(d.financials.totalCostUsd)}  |  Margin: ${plSign}${fUsd(Math.abs(d.financials.profit))}`,
      m + 4, y + 11,
    );
  }
  y += totalsH + 3;

  // ── Attention Today ──
  y = secHead("ATTENTION TODAY", y);
  doc.setFontSize(7.5);
  doc.setFont("helvetica", "normal");
  doc.setTextColor(black);

  const attn: string[] = [];
  const lowLines = [...d.sewing].filter(l => l.efficiency != null && (l.efficiency || 0) < 70).sort((a, b) => (a.efficiency || 0) - (b.efficiency || 0));
  lowLines.slice(0, 3).forEach(l => {
    attn.push(`Low efficiency: ${l.lineName} (${l.efficiency}%) - ${(l.blockerDescription || l.remarks || "no reason noted").substring(0, 60)}`);
  });
  const blockers = d.sewing.filter(l => l.hasBLocker && l.blockerDescription);
  blockers.forEach(bl => {
    if (!lowLines.find(ll => ll.lineName === bl.lineName))
      attn.push(`Blocker: ${bl.lineName} - ${(bl.blockerDescription || "").substring(0, 60)}`);
  });
  if (cuttingLeftovers > 0) attn.push(`${cuttingLeftovers} cutting record(s) with leftover fabric`);
  const missing: string[] = [];
  if (d.sewing.length === 0) missing.push("Sewing");
  if (d.cutting.length === 0) missing.push("Cutting");
  if (finOut.length === 0) missing.push("Finishing");
  if (missing.length > 0) attn.push(`MISSING submissions: ${missing.join(", ")}`);
  if (sewingShort > 0 && sewingTotalTarget > 0) attn.push(`Sewing short by ${sewingShort.toLocaleString()} pcs (${Math.round((sewingShort / sewingTotalTarget) * 100)}% of target)`);
  if (attn.length === 0) attn.push("No major issues today.");

  attn.slice(0, 5).forEach((item, i) => {
    if (y + 5 > ph - 16) return;
    doc.text(`${i + 1}. ${item}`, m + 2, y + 4);
    y += 5;
  });

  // ========== SEWING DETAIL ==========
  if (d.sewing.length > 0) {
    doc.addPage();
    y = pageHead("SEWING — LINE WISE OUTPUT & COST");

    const sewCols = [
      { label: "Sl", w: 8, align: "center" as const },
      { label: "Line", w: 24 },
      { label: "PO / Style", w: 38 },
      { label: "Target", w: 18, align: "right" as const },
      { label: "Actual", w: 18, align: "right" as const },
      { label: "Short", w: 16, align: "right" as const },
      { label: "Eff%", w: 14, align: "right" as const },
      { label: "MP", w: 12, align: "right" as const },
      { label: "Hrs", w: 12, align: "right" as const },
      { label: "OT Hrs", w: 14, align: "right" as const },
      { label: "OT MP", w: 14, align: "right" as const },
      { label: "Reject", w: 14, align: "right" as const },
      { label: "Rework", w: 14, align: "right" as const },
      { label: "Cost (" + (isBDT ? "BDT" : "USD") + ")", w: 22, align: "right" as const },
      { label: "Cost ($)", w: 20, align: "right" as const },
      { label: "Notes / Delay", w: cw - 258 > 0 ? cw - 258 : 20 },
    ];

    let sewTotalCostNat = 0;
    let sewTotalCostUsd = 0;

    const sewRows = d.sewing.map((l, i) => {
      const short = (l.targetQty || 0) - l.actualQty;
      const costNat = lineCost(l.manpower, l.hoursActual, l.otManpower, l.otHours);
      const costUsd = toUsd(costNat);
      sewTotalCostNat += costNat;
      sewTotalCostUsd += costUsd;
      return [
        String(i + 1),
        l.lineName.substring(0, 12),
        ((l.poNumber || "-") + " / " + (l.style || "-")).substring(0, 20),
        fN(l.targetQty),
        fN(l.actualQty),
        short > 0 ? "-" + short.toLocaleString() : short < 0 ? "+" + Math.abs(short).toLocaleString() : "0",
        l.efficiency != null ? l.efficiency + "%" : "-",
        fN(l.manpower),
        fN(l.hoursActual),
        fN(l.otHours),
        fN(l.otManpower),
        String(l.rejectQty),
        String(l.reworkQty),
        rate ? fNat(costNat) : "-",
        rate ? fUsd(costUsd) : "-",
        (l.blockerDescription || l.remarks || "-").substring(0, 22),
      ];
    });
    sewRows.push([
      "", "TOTAL", "",
      sewingTotalTarget.toLocaleString(),
      sewingTotalOutput.toLocaleString(),
      sewingShort > 0 ? "-" + sewingShort.toLocaleString() : "+" + Math.abs(sewingShort).toLocaleString(),
      sewingAvgEff + "%",
      String(sewingTotalManpower),
      d.sewing.reduce((s, l) => s + (l.hoursActual || 0), 0).toLocaleString(),
      String(sewingTotalOT),
      d.sewing.reduce((s, l) => s + (l.otManpower || 0), 0).toLocaleString(),
      String(sewingTotalRejects),
      String(sewingTotalRework),
      rate ? fNat(sewTotalCostNat) : "-",
      rate ? fUsd(sewTotalCostUsd) : "-",
      "",
    ]);

    y = drawTable(sewCols, sewRows, y, { boldLastRow: true, fs: 6.5, rh: 6, pgTitle: "SEWING — LINE WISE OUTPUT & COST" });
    y += 4;

    // Efficiency note
    doc.setFontSize(6);
    doc.setFont("helvetica", "italic");
    doc.setTextColor(gray);
    doc.text("* Eff% = (Actual / Target) x 100  |  Cost = Rate x MP x Hrs (regular + OT)", m, y + 2);
    y += 5;

    // Manager notes
    if (y + 16 < ph - 16) {
      doc.setFontSize(7);
      doc.setFont("helvetica", "bold");
      doc.setTextColor(black);
      doc.text("Manager Notes:", m, y + 3);
      doc.setDrawColor(lightGray);
      doc.setLineWidth(0.15);
      for (let i = 0; i < 2; i++) doc.line(m, y + 7 + i * 5, pw - m, y + 7 + i * 5);
    }
  }

  // ========== CUTTING DETAIL ==========
  if (d.cutting.length > 0) {
    doc.addPage();
    y = pageHead("CUTTING — LINE WISE DETAIL");

    const cutCols = [
      { label: "Sl", w: 8, align: "center" as const },
      { label: "Line", w: 26 },
      { label: "PO / Buyer", w: 40 },
      { label: "Colour", w: 26 },
      { label: "Day Cut", w: 22, align: "right" as const },
      { label: "Day Input", w: 22, align: "right" as const },
      { label: "Total Cut", w: 22, align: "right" as const },
      { label: "Balance", w: 22, align: "right" as const },
      { label: "MP", w: 14, align: "right" as const },
      { label: "Hrs", w: 14, align: "right" as const },
      { label: "OT Hrs", w: 16, align: "right" as const },
      { label: "OT MP", w: 16, align: "right" as const },
      { label: "Leftover", w: cw - 248 > 0 ? cw - 248 : 16 },
    ];

    const cutRows = d.cutting.map((l, i) => [
      String(i + 1),
      l.lineName.substring(0, 13),
      ((l.poNumber || "-") + " / " + (l.buyer || "-")).substring(0, 21),
      (l.colour || "-").substring(0, 13),
      fN(l.dayCutting),
      fN(l.dayInput),
      fN(l.totalCutting),
      fN(l.balance),
      fN(l.manpower),
      fN(l.hoursActual),
      fN(l.otHours),
      fN(l.otManpower),
      l.leftoverRecorded ? "YES" : "-",
    ]);
    cutRows.push([
      "", "TOTAL", "", "",
      cuttingTotalDay.toLocaleString(),
      cuttingTotalInput.toLocaleString(),
      "", cuttingTotalBalance.toLocaleString(),
      String(cuttingTotalManpower),
      d.cutting.reduce((s, l) => s + (l.hoursActual || 0), 0).toLocaleString(),
      d.cutting.reduce((s, l) => s + (l.otHours || 0), 0).toLocaleString(),
      d.cutting.reduce((s, l) => s + (l.otManpower || 0), 0).toLocaleString(),
      cuttingLeftovers > 0 ? String(cuttingLeftovers) : "-",
    ]);

    y = drawTable(cutCols, cutRows, y, { boldLastRow: true, fs: 6.5, rh: 6, pgTitle: "CUTTING — LINE WISE DETAIL" });
    y += 4;

    // Leftover details
    const leftovers = d.cutting.filter(l => l.leftoverRecorded);
    if (leftovers.length > 0 && y + 14 < ph - 16) {
      y = secHead("Leftover Fabric Records", y);
      leftovers.forEach((e, i) => {
        if (y + 5 > ph - 16) return;
        doc.setFontSize(7);
        doc.setFont("helvetica", "normal");
        doc.setTextColor(black);
        doc.text(`${i + 1}. ${e.lineName} (${e.poNumber || "N/A"}) - ${e.leftoverType || "?"}: ${e.leftoverQuantity ?? "?"} ${e.leftoverNotes ? "- " + e.leftoverNotes.substring(0, 50) : ""}`, m + 2, y + 4);
        y += 5;
      });
    }

    // Manager notes
    if (y + 12 < ph - 16) {
      y += 3;
      doc.setFontSize(7);
      doc.setFont("helvetica", "bold");
      doc.setTextColor(black);
      doc.text("Manager Notes:", m, y + 3);
      doc.setDrawColor(lightGray);
      doc.setLineWidth(0.15);
      for (let i = 0; i < 2; i++) doc.line(m, y + 7 + i * 5, pw - m, y + 7 + i * 5);
    }
  }

  // ========== FINISHING DETAIL ==========
  if (finOut.length > 0) {
    doc.addPage();
    y = pageHead("FINISHING — OUTPUT DETAIL");

    const finCols = [
      { label: "Sl", w: 8, align: "center" as const },
      { label: "PO", w: 32 },
      { label: "Buyer", w: 28 },
      { label: "Thread", w: 18, align: "right" as const },
      { label: "Check", w: 18, align: "right" as const },
      { label: "Button", w: 18, align: "right" as const },
      { label: "Iron", w: 16, align: "right" as const },
      { label: "Get Up", w: 18, align: "right" as const },
      { label: "Poly", w: 20, align: "right" as const },
      { label: "Carton", w: 18, align: "right" as const },
      { label: "MP", w: 14, align: "right" as const },
      { label: "Hrs", w: 14, align: "right" as const },
      { label: "OT Hrs", w: cw - 222 > 0 ? cw - 222 : 14, align: "right" as const },
    ];

    const finRows = finOut.map((l, i) => [
      String(i + 1),
      (l.poNumber || "-").substring(0, 17),
      (l.buyer || "-").substring(0, 15),
      fN(l.threadCutting),
      fN(l.insideCheck),
      fN(l.buttoning),
      fN(l.iron),
      fN(l.getUp),
      fN(l.poly),
      fN(l.carton),
      fN(l.manpower),
      fN(l.hours),
      fN(l.otHours),
    ]);
    finRows.push([
      "", "TOTAL", "",
      finOut.reduce((s, l) => s + (l.threadCutting || 0), 0).toLocaleString(),
      finOut.reduce((s, l) => s + (l.insideCheck || 0), 0).toLocaleString(),
      finOut.reduce((s, l) => s + (l.buttoning || 0), 0).toLocaleString(),
      finOut.reduce((s, l) => s + (l.iron || 0), 0).toLocaleString(),
      finOut.reduce((s, l) => s + (l.getUp || 0), 0).toLocaleString(),
      finTotalPoly.toLocaleString(),
      finTotalCarton.toLocaleString(),
      String(finTotalManpower),
      finOut.reduce((s, l) => s + (l.hours || 0), 0).toLocaleString(),
      finOut.reduce((s, l) => s + (l.otHours || 0), 0).toLocaleString(),
    ]);

    y = drawTable(finCols, finRows, y, { boldLastRow: true, fs: 6.5, rh: 6, pgTitle: "FINISHING — OUTPUT DETAIL" });
    y += 4;

    // Manager notes
    if (y + 12 < ph - 16) {
      doc.setFontSize(7);
      doc.setFont("helvetica", "bold");
      doc.setTextColor(black);
      doc.text("Manager Notes:", m, y + 3);
      doc.setDrawColor(lightGray);
      doc.setLineWidth(0.15);
      for (let i = 0; i < 2; i++) doc.line(m, y + 7 + i * 5, pw - m, y + 7 + i * 5);
    }
  }

  // ========== COSTING SHEET ==========
  if (d.financials && (d.financials.totalRevenue > 0 || d.financials.totalCostUsd > 0)) {
    const fin = d.financials;
    doc.addPage();
    y = pageHead("COSTING SHEET");

    // CM Revenue by PO
    if (fin.revenueByPo.length > 0) {
      y = secHead("CM Revenue by PO", y);
      const revCols = [
        { label: "Sl", w: 8, align: "center" as const },
        { label: "PO Number", w: 50 },
        { label: "Buyer", w: 44 },
        { label: "Output (pcs)", w: 30, align: "right" as const },
        { label: "CM / Dozen", w: 30, align: "right" as const },
        { label: "CM Revenue ($)", w: 36, align: "right" as const },
      ];
      const revRows = fin.revenueByPo.map((r, i) => [
        String(i + 1), r.po.substring(0, 26), r.buyer.substring(0, 22),
        r.output.toLocaleString(), "$" + r.cmDz.toFixed(2), fUsd(r.revenue),
      ]);
      revRows.push(["", "TOTAL", "", fin.revenueByPo.reduce((s, r) => s + r.output, 0).toLocaleString(), "", fUsd(fin.totalRevenue)]);
      y = drawTable(revCols, revRows, y, { boldLastRow: true, fs: 7.5, rh: 7, pgTitle: "COSTING SHEET" });
      y += 6;
    }

    doc.setFontSize(6.5);
    doc.setFont("helvetica", "italic");
    doc.setTextColor(gray);
    doc.text("* Cost = Headcount Rate x Manpower x Hours (regular + OT, sewing dept only)", m, y + 2);
    if (isBDT && bdtRate) {
      doc.text("* Exchange rate: 1 USD = " + (1 / bdtRate).toFixed(2) + " BDT", m, y + 6);
      y += 4;
    }
    y += 6;

    // Profit / Loss
    y = secHead("Profit / Loss Summary", y);

    const plCols = [
      { label: "Item", w: 70 },
      { label: "Amount (USD)", w: 50, align: "right" as const },
    ];
    const plRows = [
      ["CM Revenue", fUsd(fin.totalRevenue)],
      ["Total Estimated Cost", fUsd(fin.totalCostUsd)],
      ["Profit / Loss", (fin.profit >= 0 ? "+" : "") + fUsd(fin.profit)],
      ["Margin", fin.margin + "%"],
    ];
    y = drawTable(plCols, plRows, y, { boldLastRow: false, fs: 8, rh: 7.5, pgTitle: "COSTING SHEET" });
    y += 6;

    // Where loss happened
    y = secHead("Cost Drivers Today", y);
    doc.setFontSize(7.5);
    doc.setFont("helvetica", "normal");
    doc.setTextColor(black);

    const drivers: string[] = [];
    if (totalOTAll > 0) drivers.push(`Total OT: ${totalOTAll} hrs (sewing)`);
    const lowEffSew = d.sewing.filter(l => l.efficiency != null && (l.efficiency || 0) < 70);
    if (lowEffSew.length > 0) drivers.push(`${lowEffSew.length} sewing line(s) below 70% efficiency`);
    if (sewingTotalRework > 0) drivers.push(`${sewingTotalRework} pcs rework - additional labor`);
    if (sewingTotalRejects > 0) drivers.push(`${sewingTotalRejects} pcs rejected - material + labor loss`);
    if (drivers.length === 0) drivers.push("No major cost drivers identified today.");
    drivers.forEach((item, i) => {
      if (y + 5 > ph - 16) return;
      doc.text(`${i + 1}. ${item}`, m + 2, y + 4);
      y += 5;
    });
  }

  // ========== SIGN-OFF ==========
  if (y > ph - 40) {
    doc.addPage();
    y = pageHead("SIGN-OFF");
  } else {
    y += 6;
    y = secHead("SIGN-OFF", y);
  }

  doc.setDrawColor(black);
  doc.setLineWidth(0.3);
  const sw = (cw - 16) / 3;

  // Prepared By
  doc.rect(m, y, sw, 20);
  doc.setFontSize(6.5);
  doc.setFont("helvetica", "bold");
  doc.setTextColor(gray);
  doc.text("Prepared By:", m + 3, y + 5);
  doc.setFontSize(7.5);
  doc.setFont("helvetica", "normal");
  doc.setTextColor(black);
  doc.text(d.generatedBy || "Production Portal", m + 3, y + 11);
  doc.setFontSize(6);
  doc.setTextColor(gray);
  doc.text(format(new Date(), "dd-MMM-yyyy h:mm a"), m + 3, y + 16);

  // Checked By
  doc.rect(m + sw + 8, y, sw, 20);
  doc.setFontSize(6.5);
  doc.setFont("helvetica", "bold");
  doc.setTextColor(gray);
  doc.text("Checked By:", m + sw + 11, y + 5);
  doc.setDrawColor(lightGray);
  doc.setLineWidth(0.15);
  doc.line(m + sw + 11, y + 14, m + 2 * sw + 4, y + 14);

  // Approved By
  doc.setDrawColor(black);
  doc.setLineWidth(0.3);
  doc.rect(m + 2 * (sw + 8), y, sw, 20);
  doc.setFontSize(6.5);
  doc.setFont("helvetica", "bold");
  doc.setTextColor(gray);
  doc.text("Approved By:", m + 2 * (sw + 8) + 3, y + 5);
  doc.setDrawColor(lightGray);
  doc.setLineWidth(0.15);
  doc.line(m + 2 * (sw + 8) + 3, y + 14, m + 3 * sw + 12, y + 14);

  y += 24;
  doc.setFontSize(5.5);
  doc.setFont("helvetica", "italic");
  doc.setTextColor(lightGray);
  doc.text("Auto-generated by Production Portal. Figures based on submitted data, subject to revision.", m, y + 2);

  // Draw all footers with Page X of Y
  drawAllFooters();

  const fileDate = format(new Date(d.reportDate + "T00:00:00"), "yyyy-MM-dd");
  doc.save(`daily-production-report-${fileDate}.pdf`);
}

// ── Button Component ───────────────────────────────────────────────────

interface DailyReportButtonProps {
  data: DailyReportData;
  loading?: boolean;
}

export function DailyReportButton({ data, loading }: DailyReportButtonProps) {
  const handleExport = () => {
    try {
      downloadDailyProductionReport(data);
      toast.success("Daily production report exported");
    } catch (error) {
      console.error("PDF export error:", error);
      toast.error("Failed to export report");
    }
  };

  const hasData = data.sewing.length + data.cutting.length + data.finishing.length > 0;

  return (
    <Button
      variant="outline"
      size="sm"
      onClick={handleExport}
      disabled={loading || !hasData}
      title={!hasData ? "No data to export" : "Download daily production report as PDF"}
    >
      <FileDown className="h-4 w-4 mr-1" />
      PDF Report
    </Button>
  );
}
