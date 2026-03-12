import { useState } from "react";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogTrigger } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { Calendar } from "@/components/ui/calendar";
import { FileDown, Loader2, CalendarIcon } from "lucide-react";
import { useAuth } from "@/contexts/AuthContext";
import { useHeadcountCost } from "@/hooks/useHeadcountCost";
import { supabase } from "@/integrations/supabase/client";
import { getTodayInTimezone } from "@/lib/date-utils";
import { effectivePoly } from "@/lib/finishing-utils";
import { format, startOfWeek, endOfWeek, startOfMonth, endOfMonth } from "date-fns";
import { generateProductionReportPdf } from "@/lib/report-pdf";
import { downloadDailyProductionReport, DailyReportData } from "@/components/DailyProductionReport";
import { toast } from "sonner";

type ReportType = "daily" | "weekly" | "monthly";
type ExportFormat = "pdf" | "csv";
type Department = "sewing" | "cutting" | "finishing" | "storage";

interface ReportExportDialogProps {
  /** Pre-select report type based on which page triggers this */
  defaultType?: ReportType;
  /** Optional: specific date for daily report (YYYY-MM-DD) */
  date?: string;
  /** Optional: week offset for weekly report */
  weekOffset?: number;
  /** Optional: pre-built daily report data (uses the detailed daily PDF format) */
  dailyReportData?: DailyReportData | null;
}

export function ReportExportDialog({ defaultType, date, weekOffset = 0, dailyReportData }: ReportExportDialogProps) {
  const { profile, factory } = useAuth();
  const { headcountCost, isConfigured: costConfigured } = useHeadcountCost();
  const [open, setOpen] = useState(false);
  const [reportType, setReportType] = useState<ReportType>(defaultType || "weekly");
  const [exportFormat, setExportFormat] = useState<ExportFormat>("pdf");
  const [departments, setDepartments] = useState<Record<Department, boolean>>({
    sewing: true,
    cutting: true,
    finishing: true,
    storage: true,
  });
  const [generating, setGenerating] = useState(false);
  const [bdtToUsd, setBdtToUsd] = useState<number | null>(null);
  const tz = factory?.timezone || "Asia/Dhaka";
  const todayStr = date || getTodayInTimezone(tz);
  const [selectedDate, setSelectedDate] = useState<Date>(new Date(todayStr + "T00:00:00"));
  const [calendarOpen, setCalendarOpen] = useState(false);

  const toggleDept = (dept: Department) => {
    setDepartments(prev => ({ ...prev, [dept]: !prev[dept] }));
  };

  const anySelected = Object.values(departments).some(Boolean);

  async function fetchExchangeRate() {
    try {
      const res = await fetch("https://open.er-api.com/v6/latest/USD");
      const json = await res.json();
      if (json?.rates?.BDT) return 1 / json.rates.BDT;
    } catch {}
    return 1 / 121;
  }

  function getDateRange(): { startDate: string; endDate: string; label: string } {
    if (reportType === "daily") {
      const ds = format(selectedDate, "yyyy-MM-dd");
      return { startDate: ds, endDate: ds, label: format(selectedDate, "MMM d, yyyy") };
    }

    if (reportType === "weekly") {
      const ws = startOfWeek(selectedDate, { weekStartsOn: 0 });
      const we = endOfWeek(selectedDate, { weekStartsOn: 0 });
      return {
        startDate: format(ws, "yyyy-MM-dd"),
        endDate: format(we, "yyyy-MM-dd"),
        label: `${format(ws, "MMM d")} - ${format(we, "MMM d, yyyy")}`,
      };
    }

    // monthly
    const ms = startOfMonth(selectedDate);
    const me = endOfMonth(selectedDate);
    return {
      startDate: format(ms, "yyyy-MM-dd"),
      endDate: format(me, "yyyy-MM-dd"),
      label: format(ms, "MMMM yyyy"),
    };
  }

  async function buildDailyReportData(dateStr: string): Promise<DailyReportData> {
    const factoryId = profile?.factory_id;
    if (!factoryId) {
      throw new Error("Factory not available for report export");
    }

    const bdtRate = headcountCost.currency === "BDT" ? await fetchExchangeRate() : null;
    const hcRate = costConfigured && headcountCost.value ? headcountCost.value : 0;
    const isBDT = headcountCost.currency === "BDT";
    const [sewActRes, sewTgtRes, cutRes, finRes] = await Promise.all([
      supabase.from("sewing_actuals")
        .select("*, lines(name, line_id), work_orders(po_number, buyer, style, cm_per_dozen)")
        .eq("factory_id", factoryId).eq("production_date", dateStr),
      supabase.from("sewing_targets")
        .select("*, lines(name, line_id), work_orders(po_number, buyer, style)")
        .eq("factory_id", factoryId).eq("production_date", dateStr),
      supabase.from("cutting_actuals")
        .select("*, lines!cutting_actuals_line_id_fkey(name, line_id), work_orders(po_number, buyer, style, color, cm_per_dozen)")
        .eq("factory_id", factoryId).eq("production_date", dateStr),
      supabase.from("finishing_daily_logs")
        .select("*, lines(name, line_id), work_orders(po_number, buyer, style, cm_per_dozen)")
        .eq("factory_id", factoryId).eq("production_date", dateStr),
    ]);

    const sewAct = sewActRes.data || [];
    const sewTgt = sewTgtRes.data || [];
    const cutData = cutRes.data || [];
    const finData = (finRes.data || []) as any[];

    const tgtMap: Record<string, any> = {};
    sewTgt.forEach((t: any) => { tgtMap[t.line_id] = t; });

    const sewingLines = sewAct.map((s: any) => {
      const tgt = tgtMap[s.line_id];
      const target = tgt ? (tgt.per_hour_target || 0) * 8 : null;
      return {
        lineName: s.lines?.name || s.lines?.line_id || "Unknown",
        poNumber: s.work_orders?.po_number || null,
        buyer: s.work_orders?.buyer || null,
        style: s.work_orders?.style || null,
        targetQty: target,
        actualQty: s.good_today || 0,
        rejectQty: s.reject_today || 0,
        reworkQty: s.rework_today || 0,
        manpower: s.manpower_actual,
        hoursActual: s.hours_actual,
        otHours: s.ot_hours_actual,
        otManpower: s.ot_manpower_actual,
        efficiency: target && target > 0 ? Math.round(((s.good_today || 0) / target) * 100) : null,
        hasBLocker: s.has_blocker || false,
        blockerDescription: s.blocker_description || null,
        stageName: null, stageProgress: null,
        remarks: s.remarks || null,
        submittedAt: s.submitted_at || null,
      };
    });

    const cuttingLines = cutData.map((c: any) => ({
      lineName: c.lines?.name || c.lines?.line_id || "Unknown",
      poNumber: c.work_orders?.po_number || null,
      buyer: c.work_orders?.buyer || null,
      colour: c.work_orders?.color || c.colour || null,
      dayCutting: c.day_cutting || 0,
      dayInput: c.day_input || 0,
      totalCutting: c.total_cutting, totalInput: c.total_input,
      balance: c.balance, orderQty: c.order_qty,
      manpower: c.man_power, hoursActual: c.hours_actual,
      otHours: c.ot_hours_actual, otManpower: c.ot_manpower_actual,
      leftoverRecorded: c.leftover_recorded || false,
      leftoverType: c.leftover_type, leftoverQuantity: c.leftover_quantity,
      leftoverNotes: c.leftover_notes, submittedAt: c.submitted_at || null,
    }));

    const finishingLines = finData.map((f: any) => ({
      poNumber: f.work_orders?.po_number || null,
      buyer: f.work_orders?.buyer || null,
      style: f.work_orders?.style || null,
      logType: f.log_type as "TARGET" | "OUTPUT",
      threadCutting: f.thread_cutting, insideCheck: f.inside_check,
      topSideCheck: null, buttoning: f.buttoning,
      iron: f.iron, getUp: f.get_up, poly: f.poly, carton: f.carton,
      manpower: f.m_power_actual, hours: f.actual_hours,
      otHours: f.ot_hours_actual, otManpower: f.ot_manpower_actual,
      cmPerDozen: f.work_orders?.cm_per_dozen || null,
      remarks: f.remarks || null, submittedAt: f.submitted_at || null,
    }));

    // Financials
    const lc = (mp: number | null, hrs: number | null, otMp: number | null, otHrs: number | null) => {
      if (!hcRate) return 0;
      let c = 0;
      if (mp && hrs) c += hcRate * mp * hrs;
      if (otMp && otHrs) c += hcRate * otMp * otHrs;
      return Math.round(c * 100) / 100;
    };
    const toU = (v: number) => isBDT && bdtRate ? Math.round(v * bdtRate * 100) / 100 : v;

    let sewCost = 0, cutCost = 0, finCost = 0, totalRev = 0;
    const revByPo: Record<string, { po: string; buyer: string; output: number; cmDz: number; revenue: number }> = {};

    sewAct.forEach((s: any) => { if (s.work_orders?.cm_per_dozen) sewCost += lc(s.manpower_actual, s.hours_actual, s.ot_manpower_actual, s.ot_hours_actual); });
    cutData.forEach((c: any) => { if (c.work_orders?.cm_per_dozen) cutCost += lc(c.man_power, c.hours_actual, c.ot_manpower_actual, c.ot_hours_actual); });
    finData.filter((f: any) => f.log_type === "OUTPUT").forEach((f: any) => {
      if (f.work_orders?.cm_per_dozen) finCost += lc(f.m_power_actual, f.actual_hours, f.ot_manpower_actual, f.ot_hours_actual);
    });
    // Revenue: sewing output × (cm_per_dozen / 12)
    sewAct.forEach((s: any) => {
      const cm = s.work_orders?.cm_per_dozen;
      if (cm && s.good_today) {
        const rev = (cm / 12) * s.good_today;
        totalRev += rev;
        const po = s.work_orders?.po_number || "Unknown";
        if (!revByPo[po]) revByPo[po] = { po, buyer: s.work_orders?.buyer || "-", output: 0, cmDz: cm, revenue: 0 };
        revByPo[po].output += s.good_today; revByPo[po].revenue += rev;
      }
    });

    const totalCostNat = sewCost + cutCost + finCost;
    const totalCostUsd = toU(totalCostNat);
    const profit = totalRev - totalCostUsd;

    return {
      factoryName: factory?.name || "Factory",
      reportDate: dateStr,
      sewing: sewingLines,
      cutting: cuttingLines,
      finishing: finishingLines,
      financials: (totalRev > 0 || totalCostNat > 0) ? {
        totalRevenue: Math.round(totalRev * 100) / 100,
        totalCostUsd: Math.round(totalCostUsd * 100) / 100,
        totalCostNative: Math.round(totalCostNat * 100) / 100,
        costCurrency: headcountCost.currency,
        profit: Math.round(profit * 100) / 100,
        margin: totalRev > 0 ? Math.round((profit / totalRev) * 1000) / 10 : 0,
        sewingCostUsd: Math.round(toU(sewCost) * 100) / 100,
        cuttingCostUsd: Math.round(toU(cutCost) * 100) / 100,
        finishingCostUsd: Math.round(toU(finCost) * 100) / 100,
        bdtToUsdRate: bdtRate,
        revenueByPo: Object.values(revByPo).map(r => ({ ...r, revenue: Math.round(r.revenue * 100) / 100 })),
      } : null,
      generatedBy: null,
      headcountCostRate: hcRate || null,
      headcountCostCurrency: headcountCost.currency,
      notes: [],
    };
  }

  // ── CSV generation helpers ──
  const esc = (cell: string | number | null | undefined) =>
    `"${String(cell ?? "").replace(/"/g, '""')}"`;
  const fN = (v: number | null | undefined) => v != null ? v.toLocaleString() : "";
  const fUsd = (v: number) => "$" + v.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 });

  function downloadCsv(rows: (string | number | null | undefined)[][], filename: string) {
    const csvContent = rows.map(row => row.map(esc).join(",")).join("\n");
    const BOM = "\uFEFF";
    const blob = new Blob([BOM + csvContent], { type: "text/csv;charset=utf-8;" });
    const link = document.createElement("a");
    link.href = URL.createObjectURL(blob);
    link.download = filename;
    link.click();
    URL.revokeObjectURL(link.href);
  }

  function generateDailyCsv(data: DailyReportData) {
    const R: (string | number | null)[][] = [];
    const rate = data.headcountCostRate || 0;
    const isBDT = data.headcountCostCurrency === "BDT";
    const bdtRate = data.financials?.bdtToUsdRate || null;
    const costCur = isBDT ? "BDT" : "USD";
    const lc = (mp: number | null, hrs: number | null, otMp: number | null, otHrs: number | null): number => {
      if (!rate) return 0; let c = 0;
      if (mp && hrs) c += rate * mp * hrs;
      if (otMp && otHrs) c += rate * otMp * otHrs;
      return Math.round(c * 100) / 100;
    };
    const toU = (v: number) => isBDT && bdtRate ? Math.round(v * bdtRate * 100) / 100 : v;
    const numSort = (n: string) => parseInt(n.replace(/\D/g, "")) || 9999;

    // ── Header ──
    R.push(["DAILY PRODUCTION REPORT"]);
    R.push([`Factory: ${data.factoryName}`]);
    R.push([`Date: ${format(new Date(data.reportDate + "T00:00:00"), "EEEE, MMMM d, yyyy")}`]);
    R.push([`Generated: ${format(new Date(), "PPpp")}`]);
    R.push([]);

    // ── Production Summary ──
    const sewOut = data.sewing.reduce((s, l) => s + l.actualQty, 0);
    const sewTgt = data.sewing.reduce((s, l) => s + (l.targetQty || 0), 0);
    const cutOut = data.cutting.reduce((s, c) => s + c.dayCutting, 0);
    const finOutput = data.finishing.filter(f => f.logType === "OUTPUT");
    const finPoly = finOutput.reduce((s, f) => s + (f.poly || 0), 0);
    R.push(["PRODUCTION SUMMARY"]);
    R.push(["Department", "Output"]);
    if (data.sewing.length > 0) R.push(["Sewing", sewOut]);
    if (data.cutting.length > 0) R.push(["Cutting", cutOut]);
    if (finOutput.length > 0) R.push(["Finishing (Poly)", finPoly]);
    R.push([]);

    // ── Sewing — grouped by Line ──
    if (data.sewing.length > 0) {
      R.push(["SEWING — LINE WISE OUTPUT & COST"]);
      R.push([]);

      const byLine: Record<string, typeof data.sewing> = {};
      data.sewing.forEach(s => { if (!byLine[s.lineName]) byLine[s.lineName] = []; byLine[s.lineName].push(s); });
      const lineKeys = Object.keys(byLine).sort((a, b) => numSort(a) - numSort(b));

      let deptOutput = 0, deptReject = 0, deptRework = 0, deptCostN = 0, deptCostU = 0;

      lineKeys.forEach(lineName => {
        const entries = byLine[lineName];
        R.push([`>>> ${lineName}`]);
        R.push(["PO / Style", "Output", "Reject", "Rework", "Eff %", "MP", "Hours", "OT MP", "OT Hrs", `Cost (${costCur})`, "Cost ($)", "Notes"]);
        let lineOut = 0, lineRej = 0, lineRew = 0, lineCN = 0, lineCU = 0;
        entries.forEach(s => {
          const cn = lc(s.manpower, s.hoursActual, s.otManpower, s.otHours);
          const cu = toU(cn);
          lineOut += s.actualQty; lineRej += s.rejectQty; lineRew += s.reworkQty;
          lineCN += cn; lineCU += cu;
          R.push([
            (s.poNumber || "-") + " / " + (s.style || "-"),
            s.actualQty, s.rejectQty, s.reworkQty,
            s.efficiency != null ? s.efficiency + "%" : "",
            s.manpower, s.hoursActual, s.otManpower, s.otHours,
            rate ? cn : "", rate ? cu : "",
            s.blockerDescription || s.remarks || "",
          ]);
        });
        R.push([`${lineName} Total`, lineOut, lineRej, lineRew, "", "", "", "", "", rate ? lineCN : "", rate ? lineCU : "", ""]);
        R.push([]);
        deptOutput += lineOut; deptReject += lineRej; deptRework += lineRew; deptCostN += lineCN; deptCostU += lineCU;
      });
      R.push([`SEWING DEPARTMENT TOTAL — Output: ${fN(deptOutput)} | Cost: ${rate ? fUsd(deptCostU) : "-"}`]);
      R.push([]);
    }

    // ── Cutting — grouped by PO ──
    if (data.cutting.length > 0) {
      R.push(["CUTTING — PO WISE DETAIL & COST"]);
      R.push([]);

      const byPo: Record<string, { buyer: string; entries: typeof data.cutting }> = {};
      data.cutting.forEach(c => {
        const po = c.poNumber || "Unknown PO";
        if (!byPo[po]) byPo[po] = { buyer: c.buyer || "-", entries: [] };
        byPo[po].entries.push(c);
      });

      let deptDayCut = 0, deptCostN = 0, deptCostU = 0;
      Object.keys(byPo).sort().forEach(po => {
        const { buyer, entries } = byPo[po];
        R.push([`>>> PO: ${po} — Buyer: ${buyer}`]);
        R.push(["Line", "Colour", "Day Cut", "Day Input", "Total Cut", "Balance", "MP", "Hours", "OT MP", "OT Hrs", `Cost (${costCur})`, "Cost ($)"]);
        let poCut = 0, poCN = 0, poCU = 0;
        entries.forEach(c => {
          const cn = lc(c.manpower, c.hoursActual, c.otManpower, c.otHours);
          const cu = toU(cn);
          poCut += c.dayCutting; poCN += cn; poCU += cu;
          R.push([
            c.lineName, c.colour || "-",
            c.dayCutting, c.dayInput, c.totalCutting, c.balance,
            c.manpower, c.hoursActual, c.otManpower, c.otHours,
            rate ? cn : "", rate ? cu : "",
          ]);
        });
        R.push([`${po} Total`, "", poCut, "", "", "", "", "", "", "", rate ? poCN : "", rate ? poCU : ""]);
        R.push([]);
        deptDayCut += poCut; deptCostN += poCN; deptCostU += poCU;
      });
      R.push([`CUTTING DEPARTMENT TOTAL — Day Cut: ${fN(deptDayCut)} | Cost: ${rate ? fUsd(deptCostU) : "-"}`]);
      R.push([]);
    }

    // ── Finishing — grouped by PO ──
    if (finOutput.length > 0) {
      R.push(["FINISHING — PO WISE OUTPUT, COST & REVENUE"]);
      R.push([]);

      const byPo: Record<string, { buyer: string; cmDz: number | null; entries: typeof finOutput }> = {};
      finOutput.forEach(f => {
        const po = f.poNumber || "Unknown PO";
        if (!byPo[po]) byPo[po] = { buyer: f.buyer || "-", cmDz: f.cmPerDozen, entries: [] };
        byPo[po].entries.push(f);
      });

      let deptPoly = 0, deptCostU = 0, deptRev = 0;
      Object.keys(byPo).sort().forEach(po => {
        const { buyer, cmDz, entries } = byPo[po];
        R.push([`>>> PO: ${po} — Buyer: ${buyer}${cmDz ? ` — CM/Dz: $${cmDz.toFixed(2)}` : ""}`]);
        R.push(["Thread", "Check", "Button", "Iron", "Get Up", "Poly", "Carton", "MP", "Hours", "OT MP", "OT Hrs", "Cost ($)", "CM/Dz", "Revenue ($)"]);
        let poPoly = 0, poCU = 0, poRev = 0;
        entries.forEach(f => {
          const cn = lc(f.manpower, f.hours, f.otManpower, f.otHours);
          const cu = toU(cn);
          poCU += cu;
          const rev = 0; // Revenue now driven by sewing output, not finishing poly
          const adjPoly = effectivePoly(f.poly, f.hours, f.otHours);
          const adjCarton = effectivePoly(f.carton, f.hours, f.otHours);
          poPoly += adjPoly;
          R.push([
            f.threadCutting, f.insideCheck, f.buttoning, f.iron, f.getUp,
            adjPoly, adjCarton, f.manpower, f.hours, f.otManpower, f.otHours,
            rate ? cu : "",
            cm ? "$" + cm.toFixed(2) : "",
            rev > 0 ? Math.round(rev * 100) / 100 : "",
          ]);
        });
        R.push([`${po} Total`, "", "", "", "", poPoly, "", "", "", "", "", rate ? poCU : "", "", poRev > 0 ? Math.round(poRev * 100) / 100 : ""]);
        R.push([]);
        deptPoly += poPoly; deptCostU += poCU; deptRev += poRev;
      });
      R.push([`FINISHING DEPARTMENT TOTAL — Poly: ${fN(deptPoly)} | Cost: ${rate ? fUsd(deptCostU) : "-"} | Revenue: ${deptRev > 0 ? fUsd(Math.round(deptRev * 100) / 100) : "-"} | Profit: ${deptRev > 0 && rate ? fUsd(Math.round((deptRev - deptCostU) * 100) / 100) : "-"}`]);
      R.push([]);
    }

    // ── Financials ──
    if (data.financials) {
      const fin = data.financials;
      R.push(["FINANCIAL SUMMARY (USD)"]);
      R.push(["Revenue", "Sewing Cost", "Cutting Cost", "Finishing Cost", "Total Cost", "Profit", "Margin"]);
      R.push([
        fUsd(fin.totalRevenue), fUsd(fin.sewingCostUsd), fUsd(fin.cuttingCostUsd), fUsd(fin.finishingCostUsd),
        fUsd(fin.totalCostUsd), fUsd(fin.profit), fin.margin + "%",
      ]);
      if (fin.costCurrency === "BDT" && fin.bdtToUsdRate) {
        R.push([`Cost in BDT: Tk${Math.round(fin.totalCostNative).toLocaleString()} | Rate: ${(1 / fin.bdtToUsdRate).toFixed(1)} BDT/USD`]);
      }
      R.push([]);
      if (fin.revenueByPo.length > 0) {
        R.push(["REVENUE BY PO"]);
        R.push(["PO", "Buyer", "Output (pcs)", "CM/Dozen", "Revenue ($)"]);
        fin.revenueByPo.forEach(r => {
          R.push([r.po, r.buyer, r.output, "$" + r.cmDz.toFixed(2), fUsd(r.revenue)]);
        });
        R.push([]);
      }
    }

    R.push(["=== END OF REPORT ==="]);
    downloadCsv(R, `daily_report_${data.reportDate}.csv`);
  }

  function generatePeriodCsv(
    sewingData: any[], cuttingData: any[], finishingData: any[], storageData: any[],
    label: string, xRate: number | null, dates: string[],
  ) {
    const factoryName = factory?.name || "Factory";
    const typeLabel = reportType === "weekly" ? "WEEKLY" : "MONTHLY";
    const isBDT = headcountCost.currency === "BDT";
    const costCur = isBDT ? "BDT" : "USD";
    const bdtRate = xRate;
    const hcRate = costConfigured && headcountCost.value ? headcountCost.value : 0;
    const toUsd = (native: number): number => {
      if (!isBDT || !bdtRate) return native;
      return Math.round(native * bdtRate * 100) / 100;
    };
    const lc = (mp: number | null, hrs: number | null, otMp: number | null, otHrs: number | null): number => {
      if (!hcRate) return 0; let c = 0;
      if (mp && hrs) c += hcRate * mp * hrs;
      if (otMp && otHrs) c += hcRate * otMp * otHrs;
      return Math.round(c * 100) / 100;
    };
    const numSort = (n: string) => parseInt(n.replace(/\D/g, "")) || 9999;
    const fmtDate = (d: string) => { const p = d.split("-"); return `${p[2]}.${p[1]}`; };

    const R: (string | number | null)[][] = [];

    // ── Header ──
    R.push([`${factoryName} — ${typeLabel} PRODUCTION REPORT`]);
    R.push([`Period: ${label}`]);
    R.push([`Generated: ${format(new Date(), "PPpp")}`]);
    R.push([]);

    // ── Production Summary per Day ──
    if (dates.length > 0) {
      R.push(["PRODUCTION SUMMARY"]);
      const sumHeaders = ["Day",
        ...(departments.sewing ? ["Sewing Out"] : []),
        ...(departments.cutting ? ["Cutting"] : []),
        ...(departments.finishing ? ["Finish Out"] : []),
        ...(departments.storage ? ["Storage Txns"] : []),
      ];
      R.push(sumHeaders);
      let totSew = 0, totCut = 0, totFin = 0, totSto = 0;
      dates.forEach(d => {
        const daySew = departments.sewing ? sewingData.filter((s: any) => s.production_date === d).reduce((s: number, r: any) => s + (r.good_today || 0), 0) : 0;
        const dayCut = departments.cutting ? cuttingData.filter((c: any) => c.production_date === d).reduce((s: number, r: any) => s + (r.day_cutting || 0), 0) : 0;
        const dayFin = departments.finishing ? finishingData.filter((f: any) => f.production_date === d).reduce((s: number, r: any) => s + (r.poly || 0), 0) : 0;
        const daySto = departments.storage ? storageData.filter((t: any) => t.transaction_date === d).length : 0;
        totSew += daySew; totCut += dayCut; totFin += dayFin; totSto += daySto;
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

    // ── Financial Summary ──
    if (hcRate > 0) {
      let totalRevenue = 0, totalSewCost = 0, totalCutCost = 0, totalFinCost = 0;
      if (departments.sewing) sewingData.forEach((s: any) => { if (s.work_orders?.cm_per_dozen) totalSewCost += lc(s.manpower_actual, s.hours_actual, s.ot_manpower_actual, s.ot_hours_actual); });
      if (departments.cutting) cuttingData.forEach((c: any) => { if (c.work_orders?.cm_per_dozen) totalCutCost += lc(c.man_power, c.hours_actual, c.ot_manpower_actual, c.ot_hours_actual); });
      if (departments.finishing) finishingData.forEach((f: any) => {
        if (f.work_orders?.cm_per_dozen) totalFinCost += lc(f.m_power_actual, f.actual_hours, f.ot_manpower_actual, f.ot_hours_actual);
      });
      // Revenue: sewing output × (cm_per_dozen / 12)
      if (departments.sewing) sewingData.forEach((s: any) => {
        const cm = s.work_orders?.cm_per_dozen;
        if (cm && s.good_today) totalRevenue += (cm / 12) * s.good_today;
      });
      const totalCostNat = totalSewCost + totalCutCost + totalFinCost;
      const totalCostUsd = toUsd(totalCostNat);
      const profit = totalRevenue - totalCostUsd;
      const margin = totalRevenue > 0 ? Math.round((profit / totalRevenue) * 1000) / 10 : 0;
      if (totalRevenue > 0 || totalCostNat > 0) {
        R.push(["FINANCIAL SUMMARY (USD)"]);
        R.push(["Revenue", "Sewing Cost", "Cutting Cost", "Finishing Cost", "Total Cost", "Profit", "Margin"]);
        R.push([
          fUsd(Math.round(totalRevenue * 100) / 100),
          fUsd(toUsd(totalSewCost)), fUsd(toUsd(totalCutCost)), fUsd(toUsd(totalFinCost)),
          fUsd(totalCostUsd),
          `${profit >= 0 ? "+" : "-"}${fUsd(Math.abs(Math.round(profit * 100) / 100))}`,
          margin + "%",
        ]);
        if (isBDT && bdtRate) R.push([`Cost in BDT: Tk${Math.round(totalCostNat).toLocaleString()} | Rate: ${(1 / bdtRate).toFixed(1)} BDT/USD`]);
        R.push([]);
      }
    }

    // ── Sewing — grouped by Line ──
    if (departments.sewing && sewingData.length > 0) {
      R.push(["SEWING — LINE WISE OUTPUT & COST"]);
      R.push([]);

      const byLine: Record<string, any[]> = {};
      sewingData.forEach((s: any) => {
        const ln = s.lines?.name || s.lines?.line_id || "Unknown";
        if (!byLine[ln]) byLine[ln] = [];
        byLine[ln].push(s);
      });
      const lineKeys = Object.keys(byLine).sort((a, b) => numSort(a) - numSort(b));
      let deptOutput = 0, deptReject = 0, deptRework = 0, deptCostN = 0, deptCostU = 0;

      lineKeys.forEach(lineName => {
        const entries = byLine[lineName].sort((a: any, b: any) => (a.production_date || "").localeCompare(b.production_date || ""));
        R.push([`>>> ${lineName}`]);
        R.push(["Day", "PO / Style", "Output", "Reject", "Rework", "Eff %", "MP", "Hrs", "OT MP", "OT Hrs", `Cost (${costCur})`, "Cost ($)", "Notes"]);
        let lineOut = 0, lineRej = 0, lineRew = 0, lineCN = 0, lineCU = 0;
        entries.forEach((s: any) => {
          const cn = lc(s.manpower_actual, s.hours_actual, s.ot_manpower_actual, s.ot_hours_actual);
          const cu = toUsd(cn);
          lineOut += s.good_today || 0; lineRej += s.reject_today || 0; lineRew += s.rework_today || 0;
          lineCN += cn; lineCU += cu;
          const eff = s.actual_per_hour && s.manpower_actual && s.hours_actual
            ? Math.round(((s.good_today || 0) / (s.actual_per_hour * s.hours_actual)) * 100) : null;
          R.push([
            fmtDate(s.production_date),
            (s.work_orders?.po_number || "-") + " / " + (s.work_orders?.style || "-"),
            s.good_today || 0, s.reject_today || 0, s.rework_today || 0,
            eff != null ? eff + "%" : "",
            s.manpower_actual, s.hours_actual, s.ot_manpower_actual, s.ot_hours_actual,
            hcRate ? cn : "", hcRate ? cu : "",
            s.blocker_description || s.remarks || "",
          ]);
        });
        R.push([`${lineName} Total`, "", lineOut, lineRej, lineRew, "", "", "", "", "", hcRate ? lineCN : "", hcRate ? lineCU : "", ""]);
        R.push([]);
        deptOutput += lineOut; deptReject += lineRej; deptRework += lineRew; deptCostN += lineCN; deptCostU += lineCU;
      });
      R.push([`SEWING DEPARTMENT TOTAL — Output: ${fN(deptOutput)} | Cost: ${hcRate ? fUsd(deptCostU) : "-"}`]);
      R.push([]);
    }

    // ── Cutting — grouped by PO ──
    if (departments.cutting && cuttingData.length > 0) {
      R.push(["CUTTING — PO WISE DETAIL & COST"]);
      R.push([]);

      const byPo: Record<string, { buyer: string; entries: any[] }> = {};
      cuttingData.forEach((c: any) => {
        const po = c.work_orders?.po_number || "Unknown PO";
        if (!byPo[po]) byPo[po] = { buyer: c.work_orders?.buyer || "-", entries: [] };
        byPo[po].entries.push(c);
      });

      let deptDayCut = 0, deptCostN = 0, deptCostU = 0;
      Object.keys(byPo).sort().forEach(po => {
        const { buyer, entries } = byPo[po];
        entries.sort((a: any, b: any) => {
          if (a.production_date !== b.production_date) return (a.production_date || "").localeCompare(b.production_date || "");
          return numSort(a.lines?.name || "") - numSort(b.lines?.name || "");
        });
        R.push([`>>> PO: ${po} — Buyer: ${buyer}`]);
        R.push(["Day", "Line", "Colour", "Day Cut", "Day Input", "Total Cut", "Balance", "MP", "Hrs", "OT MP", "OT Hrs", `Cost (${costCur})`, "Cost ($)"]);
        let poCut = 0, poCN = 0, poCU = 0;
        entries.forEach((c: any) => {
          const cn = lc(c.man_power, c.hours_actual, c.ot_manpower_actual, c.ot_hours_actual);
          const cu = toUsd(cn);
          poCut += c.day_cutting || 0; poCN += cn; poCU += cu;
          R.push([
            fmtDate(c.production_date),
            c.lines?.name || c.lines?.line_id || "-", c.work_orders?.color || c.colour || "-",
            c.day_cutting || 0, c.day_input || 0, c.total_cutting, c.balance,
            c.man_power, c.hours_actual, c.ot_manpower_actual, c.ot_hours_actual,
            hcRate ? cn : "", hcRate ? cu : "",
          ]);
        });
        R.push([`${po} Total`, "", "", poCut, "", "", "", "", "", "", "", hcRate ? poCN : "", hcRate ? poCU : ""]);
        R.push([]);
        deptDayCut += poCut; deptCostN += poCN; deptCostU += poCU;
      });
      R.push([`CUTTING DEPARTMENT TOTAL — Day Cut: ${fN(deptDayCut)} | Cost: ${hcRate ? fUsd(deptCostU) : "-"}`]);
      R.push([]);
    }

    // ── Finishing — grouped by PO ──
    if (departments.finishing && finishingData.length > 0) {
      R.push(["FINISHING — PO WISE OUTPUT, COST & REVENUE"]);
      R.push([]);

      const byPo: Record<string, { buyer: string; cmDz: number | null; entries: any[] }> = {};
      finishingData.forEach((f: any) => {
        const po = f.work_orders?.po_number || "Unknown PO";
        if (!byPo[po]) byPo[po] = { buyer: f.work_orders?.buyer || "-", cmDz: f.work_orders?.cm_per_dozen || null, entries: [] };
        byPo[po].entries.push(f);
      });

      let deptPoly = 0, deptCostU = 0, deptRev = 0;
      Object.keys(byPo).sort().forEach(po => {
        const { buyer, cmDz, entries } = byPo[po];
        entries.sort((a: any, b: any) => (a.production_date || "").localeCompare(b.production_date || ""));
        R.push([`>>> PO: ${po} — Buyer: ${buyer}${cmDz ? ` — CM/Dz: $${cmDz.toFixed(2)}` : ""}`]);
        R.push(["Day", "Thread", "Check", "Button", "Iron", "Get Up", "Poly", "Carton", "MP", "Hrs", "OT MP", "OT Hrs", "Cost ($)", "CM/Dz", "Revenue ($)"]);
        let poPoly = 0, poCU = 0, poRev = 0;
        entries.forEach((f: any) => {
          const cn = lc(f.m_power_actual, f.actual_hours, f.ot_manpower_actual, f.ot_hours_actual);
          const cu = toUsd(cn);
          poCU += cu;
          const rev = 0; // Revenue now driven by sewing output, not finishing poly
          const adjPoly = effectivePoly(f.poly, f.actual_hours, f.ot_hours_actual);
          const adjCarton = effectivePoly(f.carton, f.actual_hours, f.ot_hours_actual);
          poPoly += adjPoly;
          R.push([
            fmtDate(f.production_date),
            f.thread_cutting, f.inside_check, f.buttoning, f.iron, f.get_up,
            adjPoly, adjCarton,
            f.m_power_actual, f.actual_hours, f.ot_manpower_actual, f.ot_hours_actual,
            hcRate ? cu : "",
            cm ? "$" + cm.toFixed(2) : "",
            rev > 0 ? Math.round(rev * 100) / 100 : "",
          ]);
        });
        R.push([`${po} Total`, "", "", "", "", "", poPoly, "", "", "", "", "", hcRate ? poCU : "", "", poRev > 0 ? Math.round(poRev * 100) / 100 : ""]);
        R.push([]);
        deptPoly += poPoly; deptCostU += poCU; deptRev += poRev;
      });
      R.push([`FINISHING DEPARTMENT TOTAL — Poly: ${fN(deptPoly)} | Cost: ${hcRate ? fUsd(deptCostU) : "-"} | Revenue: ${deptRev > 0 ? fUsd(Math.round(deptRev * 100) / 100) : "-"} | Profit: ${deptRev > 0 && hcRate ? fUsd(Math.round((deptRev - deptCostU) * 100) / 100) : "-"}`]);
      R.push([]);
    }

    // ── Storage — grouped by PO ──
    if (departments.storage && storageData.length > 0) {
      R.push(["STORAGE — BIN CARD TRANSACTIONS"]);
      R.push([]);

      const byPo: Record<string, { buyer: string; style: string; entries: any[] }> = {};
      storageData.forEach((t: any) => {
        const po = t.storage_bin_cards?.work_orders?.po_number || t.storage_bin_cards?.group_name || "Unknown";
        if (!byPo[po]) byPo[po] = { buyer: t.storage_bin_cards?.buyer || "-", style: t.storage_bin_cards?.style || "-", entries: [] };
        byPo[po].entries.push(t);
      });

      let totalRcv = 0, totalIss = 0;
      Object.keys(byPo).sort().forEach(po => {
        const { buyer, style, entries } = byPo[po];
        entries.sort((a: any, b: any) => (a.transaction_date || "").localeCompare(b.transaction_date || ""));
        R.push([`>>> PO: ${po} — Buyer: ${buyer}`]);
        R.push(["Day", "PO", "Buyer", "Style", "Receive", "Issue", "Balance", "Ttl Receive", "Remarks"]);
        let poRcv = 0, poIss = 0;
        entries.forEach((t: any) => {
          poRcv += t.receive_qty || 0; poIss += t.issue_qty || 0;
          R.push([
            fmtDate(t.transaction_date),
            t.storage_bin_cards?.work_orders?.po_number || po,
            buyer, style,
            t.receive_qty, t.issue_qty, t.balance_qty, t.ttl_receive,
            t.remarks || "",
          ]);
        });
        R.push([`${po} Total`, "", "", "", poRcv, poIss, "", "", ""]);
        R.push([]);
        totalRcv += poRcv; totalIss += poIss;
      });
      R.push([`STORAGE DEPARTMENT TOTAL — Received: ${fN(totalRcv)} | Issued: ${fN(totalIss)}`]);
      R.push([]);
    }

    R.push(["=== END OF REPORT ==="]);
    const safePeriod = label.replace(/[^a-zA-Z0-9\- ]/g, "").replace(/\s+/g, "_");
    downloadCsv(R, `${reportType}_report_${safePeriod}.csv`);
  }

  async function handleGenerate() {
    if (!profile?.factory_id || !anySelected) return;
    setGenerating(true);

    try {
      // Daily report
      if (reportType === "daily") {
        const selectedStr = format(selectedDate, "yyyy-MM-dd");
        const propsDateStr = date || getTodayInTimezone(tz);
        const data = (dailyReportData && selectedStr === propsDateStr)
          ? dailyReportData
          : await buildDailyReportData(selectedStr);

        if (exportFormat === "csv") {
          generateDailyCsv(data);
        } else {
          downloadDailyProductionReport(data);
        }
        toast.success("Report downloaded");
        setOpen(false);
        setGenerating(false);
        return;
      }

      // Weekly / Monthly
      const rate = headcountCost.currency === "BDT" ? await fetchExchangeRate() : null;
      setBdtToUsd(rate);

      const { startDate, endDate, label } = getDateRange();
      const factoryId = profile.factory_id;
      if (!factoryId) {
        throw new Error("Factory not available for report export");
      }

      // Build date list for the period
      const dates: string[] = [];
      const todayStr = getTodayInTimezone(factory?.timezone || "Asia/Dhaka");
      const cur = new Date(startDate + "T00:00:00");
      const end = new Date(endDate + "T00:00:00");
      const todayDate = new Date(todayStr + "T00:00:00");
      while (cur <= end && cur <= todayDate) {
        dates.push(format(cur, "yyyy-MM-dd"));
        cur.setDate(cur.getDate() + 1);
      }

      // Parallel data fetch per department
      const [sewingRes, cuttingRes, finishingRes, storageRes] = await Promise.all([
        departments.sewing
          ? supabase
              .from("sewing_actuals")
              .select("*, lines(name, line_id), work_orders(po_number, buyer, style, cm_per_dozen)")
              .eq("factory_id", factoryId)
              .gte("production_date", startDate)
              .lte("production_date", endDate)
          : Promise.resolve({ data: [] }),
        departments.cutting
          ? supabase
              .from("cutting_actuals")
              .select("*, lines!cutting_actuals_line_id_fkey(name, line_id), work_orders(po_number, buyer, style, color, cm_per_dozen)")
              .eq("factory_id", factoryId)
              .gte("production_date", startDate)
              .lte("production_date", endDate)
          : Promise.resolve({ data: [] }),
        departments.finishing
          ? supabase
              .from("finishing_daily_logs")
              .select("*, lines(name, line_id), work_orders(po_number, buyer, style, cm_per_dozen)")
              .eq("factory_id", factoryId)
              .eq("log_type", "OUTPUT")
              .gte("production_date", startDate)
              .lte("production_date", endDate)
          : Promise.resolve({ data: [] }),
        departments.storage
          ? supabase
              .from("storage_bin_card_transactions")
              .select("*, storage_bin_cards(id, buyer, style, group_name, work_orders(po_number))")
              .eq("factory_id", factoryId)
              .gte("transaction_date", startDate)
              .lte("transaction_date", endDate)
          : Promise.resolve({ data: [] }),
      ]);

      const sewData = (sewingRes as any).data || [];
      const cutData = (cuttingRes as any).data || [];
      const finData = (finishingRes as any).data || [];
      const stoData = (storageRes as any).data || [];

      if (exportFormat === "csv") {
        generatePeriodCsv(sewData, cutData, finData, stoData, label, rate, dates);
      } else {
        generateProductionReportPdf({
          factoryName: factory?.name || "Factory",
          reportType,
          periodLabel: label,
          startDate,
          endDate,
          dates,
          departments,
          sewing: sewData,
          cutting: cutData,
          finishing: finData,
          storage: stoData,
          headcountCostRate: costConfigured && headcountCost.value ? headcountCost.value : 0,
          headcountCostCurrency: headcountCost.currency,
          bdtToUsdRate: rate,
        });
      }

      toast.success("Report downloaded");
      setOpen(false);
    } catch (e) {
      console.error("Report generation error:", e);
      toast.error("Failed to generate report");
    } finally {
      setGenerating(false);
    }
  }

  const typeOptions: { value: ReportType; label: string }[] = [
    { value: "daily", label: "Daily" },
    { value: "weekly", label: "Weekly" },
    { value: "monthly", label: "Monthly" },
  ];

  const deptOptions: { value: Department; label: string }[] = [
    { value: "sewing", label: "Sewing" },
    { value: "cutting", label: "Cutting" },
    { value: "finishing", label: "Finishing" },
    { value: "storage", label: "Storage" },
  ];

  const formatOptions: { value: ExportFormat; label: string }[] = [
    { value: "pdf", label: "PDF" },
    { value: "csv", label: "CSV" },
  ];

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger asChild>
        <Button variant="outline" size="sm">
          <FileDown className="h-4 w-4 mr-1.5" />
          Export
        </Button>
      </DialogTrigger>
      <DialogContent className="sm:max-w-[360px]">
        <DialogHeader>
          <DialogTitle>Export Production Report</DialogTitle>
        </DialogHeader>
        <div className="space-y-4 pt-2">
          {/* Report Type */}
          <div>
            <p className="text-sm font-medium mb-2">Report Type</p>
            <div className="flex gap-2">
              {typeOptions.map(opt => (
                <button
                  key={opt.value}
                  onClick={() => setReportType(opt.value)}
                  className={`flex-1 px-3 py-2 rounded-md text-sm font-medium border transition-colors ${
                    reportType === opt.value
                      ? "bg-primary text-primary-foreground border-primary"
                      : "bg-background border-border hover:bg-muted"
                  }`}
                >
                  {opt.label}
                </button>
              ))}
            </div>
          </div>

          {/* Date Picker */}
          <div>
            <p className="text-sm font-medium mb-2">
              {reportType === "daily" ? "Date" : reportType === "weekly" ? "Week of" : "Month of"}
            </p>
            <Popover open={calendarOpen} onOpenChange={setCalendarOpen}>
              <PopoverTrigger asChild>
                <Button variant="outline" className="w-full justify-start text-left font-normal">
                  <CalendarIcon className="mr-2 h-4 w-4" />
                  {reportType === "daily" && format(selectedDate, "MMM d, yyyy")}
                  {reportType === "weekly" && (() => {
                    const ws = startOfWeek(selectedDate, { weekStartsOn: 0 });
                    const we = endOfWeek(selectedDate, { weekStartsOn: 0 });
                    return `${format(ws, "MMM d")} - ${format(we, "MMM d, yyyy")}`;
                  })()}
                  {reportType === "monthly" && format(selectedDate, "MMMM yyyy")}
                </Button>
              </PopoverTrigger>
              <PopoverContent className="w-auto p-0" align="start">
                <Calendar
                  mode="single"
                  selected={selectedDate}
                  onSelect={(d) => { if (d) { setSelectedDate(d); setCalendarOpen(false); } }}
                  disabled={(d) => d > new Date()}
                  initialFocus
                />
              </PopoverContent>
            </Popover>
          </div>

          {/* Departments (hidden for daily since it uses the full detailed report) */}
          {reportType !== "daily" && <div>
            <p className="text-sm font-medium mb-2">Departments</p>
            <div className="grid grid-cols-2 gap-2">
              {deptOptions.map(opt => (
                <button
                  key={opt.value}
                  onClick={() => toggleDept(opt.value)}
                  className={`px-3 py-2 rounded-md text-sm font-medium border transition-colors ${
                    departments[opt.value]
                      ? "bg-primary/10 text-primary border-primary/30"
                      : "bg-background text-muted-foreground border-border hover:bg-muted"
                  }`}
                >
                  {opt.label}
                </button>
              ))}
            </div>
          </div>}

          {/* Format */}
          <div>
            <p className="text-sm font-medium mb-2">Format</p>
            <div className="flex gap-2">
              {formatOptions.map(opt => (
                <button
                  key={opt.value}
                  onClick={() => setExportFormat(opt.value)}
                  className={`flex-1 px-3 py-2 rounded-md text-sm font-medium border transition-colors ${
                    exportFormat === opt.value
                      ? "bg-primary text-primary-foreground border-primary"
                      : "bg-background border-border hover:bg-muted"
                  }`}
                >
                  {opt.label}
                </button>
              ))}
            </div>
          </div>

          {/* Generate */}
          <Button
            className="w-full"
            onClick={handleGenerate}
            disabled={generating || !anySelected}
          >
            {generating ? (
              <>
                <Loader2 className="h-4 w-4 mr-2 animate-spin" />
                Generating...
              </>
            ) : (
              <>
                <FileDown className="h-4 w-4 mr-2" />
                Download {exportFormat.toUpperCase()}
              </>
            )}
          </Button>
        </div>
      </DialogContent>
    </Dialog>
  );
}
