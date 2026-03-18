import { useState } from "react";
import { useTranslation } from "react-i18next";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Checkbox } from "@/components/ui/checkbox";
import { Label } from "@/components/ui/label";
import { Loader2, Download, FileSpreadsheet, Package, Scissors } from "lucide-react";
import { SewingMachine } from "@/components/icons/SewingMachine";
import { toast } from "sonner";
import { useAuth } from "@/contexts/AuthContext";
import { formatDate, formatTimeInTimezone } from "@/lib/date-utils";
import { format } from "date-fns";

interface ExportData {
  sewingTargets: any[];
  finishingTargets: any[];
  sewingActuals: any[];
  finishingActuals: any[];
  cuttingTargets: any[];
  cuttingActuals: any[];
  storageBinCards: any[];
  finishingDailyLogs: any[];
}

interface FinancialsData {
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
  revenueByPo: { po: string; buyer: string; style: string; output: number; cmDz: number; revenue: number }[];
}

interface ExportSubmissionsDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  data: ExportData;
  dateRange: string;
  financials?: FinancialsData | null;
}

const esc = (cell: string) => `"${String(cell ?? "").replace(/"/g, '""')}"`;

export function ExportSubmissionsDialog({
  open,
  onOpenChange,
  data,
  dateRange,
  financials,
}: ExportSubmissionsDialogProps) {
  const { t } = useTranslation();
  const { factory } = useAuth();
  const [exporting, setExporting] = useState(false);

  const timezone = factory?.timezone || "Asia/Dhaka";
  const fmtTime = (dateString: string) => formatTimeInTimezone(dateString, timezone);

  const [includeSewing, setIncludeSewing] = useState(true);
  const [includeFinishing, setIncludeFinishing] = useState(true);
  const [includeCutting, setIncludeCutting] = useState(true);
  const [includeStorage, setIncludeStorage] = useState(true);

  // Finishing daily logs split by type
  const finishingLogTargets = (data.finishingDailyLogs || []).filter((l: any) => l.log_type === "TARGET");
  const finishingLogOutputs = (data.finishingDailyLogs || []).filter((l: any) => l.log_type === "OUTPUT");

  // Use finishing_daily_logs if available, otherwise fall back to legacy tables
  const hasFinishingLogs = (data.finishingDailyLogs || []).length > 0;
  const effectiveFinishingTargetCount = hasFinishingLogs ? finishingLogTargets.length : data.finishingTargets.length;
  const effectiveFinishingActualCount = hasFinishingLogs ? finishingLogOutputs.length : data.finishingActuals.length;

  const getExportCounts = () => {
    let total = 0;
    if (includeSewing) total += data.sewingTargets.length + data.sewingActuals.length;
    if (includeFinishing) total += effectiveFinishingTargetCount + effectiveFinishingActualCount;
    if (includeCutting) total += data.cuttingTargets.length + data.cuttingActuals.length;
    if (includeStorage) total += data.storageBinCards.length;
    return total;
  };

  const canExport = (includeSewing || includeFinishing || includeCutting || includeStorage) && getExportCounts() > 0;

  const handleExport = () => {
    setExporting(true);
    try {
      const rows: string[][] = [];
      const exportDate = format(new Date(), "PPpp");

      // ── FACTORY SUMMARY HEADER ──
      rows.push(["ALL SUBMISSIONS REPORT"]);
      rows.push([`Factory: ${factory?.name || "—"}`]);
      rows.push([`Period: Last ${dateRange} days`]);
      rows.push([`Exported: ${exportDate}`]);
      rows.push([]);

      const deptParts: string[] = [];
      if (includeSewing) deptParts.push("Sewing");
      if (includeFinishing) deptParts.push("Finishing");
      if (includeCutting) deptParts.push("Cutting");
      if (includeStorage) deptParts.push("Storage");
      rows.push([`Departments Included: ${deptParts.join(", ")}`]);
      rows.push([]);

      // ── SEWING FINANCIALS ──
      if (financials && (financials.totalRevenue > 0 || financials.totalCostUsd > 0)) {
        rows.push(["═══ SEWING FINANCIALS (USD) ═══"]);
        rows.push(["Note: Sewing dept only. Production CM = 70% of entered CM/dozen."]);
        rows.push([]);
        rows.push(["Metric", "Amount (USD)"]);
        rows.push(["Output Value", `$${financials.totalRevenue.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`]);
        rows.push(["Operating Cost", `$${financials.totalCostUsd.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`]);
        rows.push(["Operating Margin", `${financials.profit >= 0 ? '+' : '-'}$${Math.abs(financials.profit).toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`]);
        rows.push(["Margin %", `${financials.margin}%`]);
        rows.push([]);

        if (financials.costCurrency === 'BDT' && financials.bdtToUsdRate) {
          rows.push(["Operating Cost in BDT", `৳${financials.totalCostNative.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`]);
          rows.push(["Exchange Rate", `${(1 / financials.bdtToUsdRate).toFixed(2)} BDT/USD`]);
          rows.push([]);
        }

        // Output value by PO
        if (financials.revenueByPo.length > 0) {
          rows.push(["OUTPUT VALUE BY WORK ORDER", "", "", "", ""]);
          rows.push(["PO Number", "Buyer", "Sewing Output (pcs)", "CM/Dozen (entered)", "Output Value (USD)"]);
          financials.revenueByPo.forEach(r => {
            rows.push([
              r.po, r.buyer, r.output.toLocaleString(),
              `$${r.cmDz.toFixed(2)}`,
              `$${r.revenue.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`,
            ]);
          });
          rows.push([]);
        }

        rows.push([]);
      }

      // ── CROSS-DEPARTMENT SUMMARY ──
      rows.push(["FACTORY SUMMARY"]);
      rows.push(["Metric", "Value"]);

      const totalSewingOutput = data.sewingActuals.reduce((s: number, a: any) => s + (a.good_today || 0), 0);
      const totalSewingRejects = data.sewingActuals.reduce((s: number, a: any) => s + (a.reject_today || 0), 0);

      // Finishing: use daily logs if available
      const finOutputData = hasFinishingLogs ? finishingLogOutputs : data.finishingActuals;
      const totalFinishingCarton = hasFinishingLogs
        ? finOutputData.reduce((s: number, l: any) => s + (l.carton || 0), 0)
        : finOutputData.reduce((s: number, a: any) => s + (a.day_carton || 0), 0);
      const totalFinishingPoly = hasFinishingLogs
        ? finOutputData.reduce((s: number, l: any) => s + (l.poly || 0), 0)
        : finOutputData.reduce((s: number, a: any) => s + (a.day_poly || 0), 0);
      const totalFinishingQcPass = hasFinishingLogs
        ? totalFinishingCarton // In daily logs, carton IS the output
        : finOutputData.reduce((s: number, a: any) => s + (a.day_qc_pass || 0), 0);

      const totalCuttingOutput = data.cuttingActuals.reduce((s: number, a: any) => s + (a.day_cutting || 0), 0);
      const totalCuttingInput = data.cuttingActuals.reduce((s: number, a: any) => s + (a.day_input || 0), 0);

      const sewingBlockers = data.sewingActuals.filter((a: any) => a.has_blocker).length;
      const finishingBlockers = hasFinishingLogs ? 0 : data.finishingActuals.filter((a: any) => a.has_blocker).length;
      const totalBlockers = sewingBlockers + finishingBlockers;

      const sewingLines = new Set(data.sewingActuals.map((a: any) => a.lines?.name || a.lines?.line_id)).size;
      const finishingLines = hasFinishingLogs
        ? new Set(finOutputData.map((l: any) => l.lines?.name || l.lines?.line_id)).size
        : new Set(finOutputData.map((a: any) => a.lines?.name || a.lines?.line_id)).size;

      if (includeSewing) {
        rows.push(["Sewing Targets", String(data.sewingTargets.length)]);
        rows.push(["Sewing Actuals", String(data.sewingActuals.length)]);
        rows.push(["Sewing Total Output (pcs)", totalSewingOutput.toLocaleString()]);
        rows.push(["Sewing Total Rejects", totalSewingRejects.toLocaleString()]);
        rows.push(["Sewing Lines Reporting", String(sewingLines)]);
      }
      if (includeFinishing) {
        rows.push(["Finishing Targets", String(effectiveFinishingTargetCount)]);
        rows.push(["Finishing Outputs", String(effectiveFinishingActualCount)]);
        rows.push(["Finishing Total Carton (pcs)", totalFinishingCarton.toLocaleString()]);
        rows.push(["Finishing Total Poly", totalFinishingPoly.toLocaleString()]);
        rows.push(["Finishing Lines Reporting", String(finishingLines)]);
      }
      if (includeCutting) {
        rows.push(["Cutting Targets", String(data.cuttingTargets.length)]);
        rows.push(["Cutting Actuals", String(data.cuttingActuals.length)]);
        rows.push(["Cutting Total Output (pcs)", totalCuttingOutput.toLocaleString()]);
        rows.push(["Cutting Total Input (pcs)", totalCuttingInput.toLocaleString()]);
      }
      if (includeStorage) {
        rows.push(["Storage Bin Cards", String(data.storageBinCards.length)]);
      }
      rows.push(["Total Blockers Reported", String(totalBlockers)]);
      rows.push([]);

      // ════════════════════════════════════════════════
      // SEWING SECTION
      // ════════════════════════════════════════════════
      if (includeSewing && data.sewingTargets.length > 0) {
        rows.push(["═══ SEWING TARGETS ═══"]);
        const avgTargetPerHr = data.sewingTargets.length > 0
          ? Math.round(data.sewingTargets.reduce((s: number, t: any) => s + (t.per_hour_target || 0), 0) / data.sewingTargets.length) : 0;
        const avgManpower = data.sewingTargets.length > 0
          ? Math.round(data.sewingTargets.reduce((s: number, t: any) => s + (t.manpower_planned || 0), 0) / data.sewingTargets.length) : 0;
        const lateTargets = data.sewingTargets.filter((t: any) => t.is_late).length;
        rows.push(["Section Summary:", `${data.sewingTargets.length} records | Avg Target/hr: ${avgTargetPerHr} | Avg Manpower: ${avgManpower} | Late: ${lateTargets}`]);

        rows.push(["Date", "Time", "Line", "PO Number", "Buyer", "Style", "Order Qty", "Target/hr", "Planned Total", "Manpower", "Hours Planned", "OT Hours", "Progress %", "Stage", "Next Milestone", "Remarks"]);
        data.sewingTargets.forEach((t: any) => {
          rows.push([
            formatDate(t.production_date), fmtTime(t.submitted_at),
            t.lines?.name || t.lines?.line_id || "-", t.work_orders?.po_number || "-",
            t.work_orders?.buyer || "-", t.work_orders?.style || "-",
            t.work_orders?.order_qty?.toLocaleString() || "-",
            String(t.per_hour_target || 0), String(t.target_total_planned || "-"),
            String(t.manpower_planned || 0), String(t.hours_planned || "-"),
            String(t.ot_hours_planned || 0), `${t.planned_stage_progress || 0}%`,
            t.stages?.name || "-", t.next_milestone || "-",
            t.remarks || "-",
          ]);
        });
        rows.push([]);
      }

      if (includeSewing && data.sewingActuals.length > 0) {
        rows.push(["═══ SEWING END OF DAY ═══"]);
        const avgActualPerHr = data.sewingActuals.length > 0
          ? Math.round(data.sewingActuals.reduce((s: number, a: any) => s + (a.actual_per_hour || 0), 0) / data.sewingActuals.length) : 0;
        rows.push(["Section Summary:", `${data.sewingActuals.length} records | Output: ${totalSewingOutput.toLocaleString()} pcs | Rejects: ${totalSewingRejects} | Avg Actual/hr: ${avgActualPerHr} | Blockers: ${sewingBlockers}`]);

        rows.push(["Date", "Time", "Line", "PO Number", "Buyer", "Style", "Order Qty",
          "Good Today", "Reject", "Rework", "Cumulative Total", "Actual/hr",
          "Manpower", "Hours Actual", "OT Hours", "OT Manpower", "Progress %", "Stage",
          "Has Blocker", "Blocker Type", "Blocker Impact", "Blocker Owner", "Status", "Remarks"]);
        data.sewingActuals.forEach((a: any) => {
          const pct = a.work_orders?.order_qty > 0
            ? Math.round((a.cumulative_good_total / a.work_orders.order_qty) * 100) : 0;
          rows.push([
            formatDate(a.production_date), fmtTime(a.submitted_at),
            a.lines?.name || a.lines?.line_id || "-", a.work_orders?.po_number || "-",
            a.work_orders?.buyer || "-", a.work_orders?.style || "-",
            a.work_orders?.order_qty?.toLocaleString() || "-",
            String(a.good_today || 0), String(a.reject_today || 0), String(a.rework_today || 0),
            String(a.cumulative_good_total || 0), String(a.actual_per_hour || "-"),
            String(a.manpower_actual || 0), String(a.hours_actual || "-"),
            String(a.ot_hours_actual || 0), String(a.ot_manpower_actual || "-"),
            `${a.actual_stage_progress || 0}%`, a.stages?.name || "-",
            a.has_blocker ? "Yes" : "No", a.blocker_description || "-",
            a.blocker_impact || "-", a.blocker_owner || "-",
            a.has_blocker ? "⚠ Blocker" : pct >= 100 ? "✓ Complete" : "In Progress",
            a.remarks || "-",
          ]);
        });
        rows.push([]);
      }

      // ════════════════════════════════════════════════
      // FINISHING SECTION (uses finishing_daily_logs if available)
      // ════════════════════════════════════════════════
      if (includeFinishing && hasFinishingLogs) {
        // ── Finishing Daily Logs (newer system) ──
        if (finishingLogTargets.length > 0) {
          rows.push(["═══ FINISHING TARGETS (Daily Logs) ═══"]);
          rows.push(["Section Summary:", `${finishingLogTargets.length} records`]);
          rows.push(["Date", "Time", "Line", "PO Number", "Buyer", "Style",
            "Thread Cutting", "Inside Check", "Top Side Check", "Buttoning", "Iron", "Get Up", "Poly", "Carton",
            "Planned Hours", "Manpower Planned", "OT Hours Planned", "OT Manpower Planned", "Remarks"]);
          finishingLogTargets.forEach((l: any) => {
            rows.push([
              formatDate(l.production_date), fmtTime(l.submitted_at),
              l.lines?.name || l.lines?.line_id || "-",
              l.work_orders?.po_number || "-", l.work_orders?.buyer || "-", l.work_orders?.style || "-",
              String(l.thread_cutting || 0), String(l.inside_check || 0), String(l.top_side_check || 0),
              String(l.buttoning || 0), String(l.iron || 0), String(l.get_up || 0),
              String(l.poly || 0), String(l.carton || 0),
              String(l.planned_hours ?? "-"), String(l.m_power_planned ?? "-"),
              String(l.ot_hours_planned ?? "-"), String(l.ot_manpower_planned ?? "-"),
              l.remarks || "-",
            ]);
          });
          rows.push([]);
        }

        if (finishingLogOutputs.length > 0) {
          rows.push(["═══ FINISHING OUTPUTS (Daily Logs) ═══"]);
          rows.push(["Section Summary:", `${finishingLogOutputs.length} records | Carton: ${totalFinishingCarton.toLocaleString()} | Poly: ${totalFinishingPoly.toLocaleString()}`]);
          rows.push(["Date", "Time", "Line", "PO Number", "Buyer", "Style",
            "Thread Cutting", "Inside Check", "Top Side Check", "Buttoning", "Iron", "Get Up", "Poly", "Carton",
            "Actual Hours", "Manpower Actual", "OT Hours Actual", "OT Manpower Actual", "Locked", "Remarks"]);
          finishingLogOutputs.forEach((l: any) => {
            rows.push([
              formatDate(l.production_date), fmtTime(l.submitted_at),
              l.lines?.name || l.lines?.line_id || "-",
              l.work_orders?.po_number || "-", l.work_orders?.buyer || "-", l.work_orders?.style || "-",
              String(l.thread_cutting || 0), String(l.inside_check || 0), String(l.top_side_check || 0),
              String(l.buttoning || 0), String(l.iron || 0), String(l.get_up || 0),
              String(l.poly || 0), String(l.carton || 0),
              String(l.actual_hours ?? "-"), String(l.m_power_actual ?? "-"),
              String(l.ot_hours_actual ?? "-"), String(l.ot_manpower_actual ?? "-"),
              l.is_locked ? "Yes" : "No", l.remarks || "-",
            ]);
          });
          rows.push([]);
        }
      } else if (includeFinishing) {
        // ── Legacy finishing_targets / finishing_actuals ──
        if (data.finishingTargets.length > 0) {
          rows.push(["═══ FINISHING TARGETS ═══"]);
          const avgTargetPerHr = data.finishingTargets.length > 0
            ? Math.round(data.finishingTargets.reduce((s: number, t: any) => s + (t.per_hour_target || 0), 0) / data.finishingTargets.length) : 0;
          const lateTargets = data.finishingTargets.filter((t: any) => t.is_late).length;
          rows.push(["Section Summary:", `${data.finishingTargets.length} records | Avg Target/hr: ${avgTargetPerHr} | Late: ${lateTargets}`]);
          rows.push(["Date", "Time", "Line", "PO Number", "Buyer", "Style", "Order Qty", "Target/hr", "Manpower", "Day Hours", "OT Hours", "OT Manpower", "Remarks"]);
          data.finishingTargets.forEach((t: any) => {
            rows.push([
              formatDate(t.production_date), fmtTime(t.submitted_at),
              t.lines?.name || t.lines?.line_id || "-", t.work_orders?.po_number || "-",
              t.work_orders?.buyer || "-", t.work_orders?.style || "-",
              t.work_orders?.order_qty?.toLocaleString() || "-",
              String(t.per_hour_target || 0), String(t.m_power_planned || 0),
              String(t.day_hour_planned || 0), String(t.day_over_time_planned || 0),
              String(t.ot_manpower_planned || "-"),
              t.remarks || "-",
            ]);
          });
          rows.push([]);
        }

        if (data.finishingActuals.length > 0) {
          rows.push(["═══ FINISHING END OF DAY ═══"]);
          rows.push(["Section Summary:", `${data.finishingActuals.length} records | QC Pass: ${totalFinishingQcPass.toLocaleString()} pcs | Carton: ${totalFinishingCarton.toLocaleString()} | Blockers: ${finishingBlockers}`]);
          rows.push(["Date", "Time", "Line", "PO Number", "Buyer", "Style", "Order Qty",
            "Day QC Pass", "Total QC Pass", "Day Poly", "Total Poly", "Day Carton", "Total Carton",
            "Manpower", "OT Manpower", "Day Hours", "OT Hours", "Total Hours", "Total OT",
            "Avg Production", "Has Blocker", "Blocker Type", "Blocker Impact", "Blocker Owner", "Status", "Remarks"]);
          data.finishingActuals.forEach((a: any) => {
            rows.push([
              formatDate(a.production_date), fmtTime(a.submitted_at),
              a.lines?.name || a.lines?.line_id || "-", a.work_orders?.po_number || "-",
              a.work_orders?.buyer || "-", a.work_orders?.style || "-",
              a.work_orders?.order_qty?.toLocaleString() || "-",
              String(a.day_qc_pass || 0), String(a.total_qc_pass || 0),
              String(a.day_poly || 0), String(a.total_poly || 0),
              String(a.day_carton || 0), String(a.total_carton || 0),
              String(a.m_power_actual || 0), String(a.ot_manpower_actual || "-"),
              String(a.day_hour_actual || 0), String(a.day_over_time_actual || 0),
              String(a.total_hour || "-"), String(a.total_over_time || "-"),
              String(a.average_production || "-"),
              a.has_blocker ? "Yes" : "No", a.blocker_description || "-",
              a.blocker_impact || "-", a.blocker_owner || "-",
              a.has_blocker ? "⚠ Blocker" : "✓ OK", a.remarks || "-",
            ]);
          });
          rows.push([]);
        }
      }

      // ════════════════════════════════════════════════
      // CUTTING SECTION
      // ════════════════════════════════════════════════
      if (includeCutting && data.cuttingTargets.length > 0) {
        rows.push(["═══ CUTTING TARGETS ═══"]);
        const totalMarker = data.cuttingTargets.reduce((s: number, t: any) => s + (t.marker_capacity || 0), 0);
        const totalLay = data.cuttingTargets.reduce((s: number, t: any) => s + (t.lay_capacity || 0), 0);
        const lateTargets = data.cuttingTargets.filter((t: any) => t.is_late).length;
        rows.push(["Section Summary:", `${data.cuttingTargets.length} records | Marker Capacity: ${totalMarker.toLocaleString()} | Lay Capacity: ${totalLay.toLocaleString()} | Late: ${lateTargets}`]);

        rows.push(["Date", "Time", "Line", "PO Number", "Buyer", "Style", "Colour", "Order Qty",
          "Marker Capacity", "Lay Capacity", "Cutting Capacity", "Day Cutting", "Day Input",
          "Manpower", "Hours Planned", "OT Hours", "OT Manpower", "Target/hr", "Under Qty"]);
        data.cuttingTargets.forEach((t: any) => {
          rows.push([
            formatDate(t.production_date), fmtTime(t.submitted_at),
            t.lines?.name || t.lines?.line_id || "-",
            t.work_orders?.po_number || t.po_no || "-",
            t.work_orders?.buyer || t.buyer || "-",
            t.work_orders?.style || t.style || "-",
            t.colour || "-", String(t.order_qty || "-"),
            String(t.marker_capacity || 0), String(t.lay_capacity || 0), String(t.cutting_capacity || 0),
            String(t.day_cutting || 0), String(t.day_input || 0),
            String(t.man_power || 0), String(t.hours_planned || "-"),
            String(t.ot_hours_planned || 0), String(t.ot_manpower_planned || "-"),
            String(t.target_per_hour || "-"), String(t.under_qty || 0),
          ]);
        });
        rows.push([]);
      }

      if (includeCutting && data.cuttingActuals.length > 0) {
        rows.push(["═══ CUTTING ACTUALS ═══"]);
        const totalBalance = data.cuttingActuals.reduce((s: number, a: any) => s + (a.balance || 0), 0);
        const acknowledged = data.cuttingActuals.filter((a: any) => a.acknowledged).length;
        rows.push(["Section Summary:", `${data.cuttingActuals.length} records | Output: ${totalCuttingOutput.toLocaleString()} pcs | Input: ${totalCuttingInput.toLocaleString()} pcs | Balance: ${totalBalance.toLocaleString()} | Acknowledged: ${acknowledged}/${data.cuttingActuals.length}`]);

        rows.push(["Date", "Time", "Line", "PO Number", "Buyer", "Style", "Colour", "Order Qty",
          "Day Cutting", "Total Cutting", "Day Input", "Total Input", "Balance",
          "Manpower", "Hours Actual", "OT Hours", "OT Manpower", "Actual/hr",
          "Acknowledged"]);
        data.cuttingActuals.forEach((a: any) => {
          rows.push([
            formatDate(a.production_date), fmtTime(a.submitted_at),
            a.lines?.name || a.lines?.line_id || "-",
            a.work_orders?.po_number || a.po_no || "-",
            a.work_orders?.buyer || a.buyer || "-",
            a.work_orders?.style || a.style || "-",
            a.colour || "-", String(a.order_qty || "-"),
            String(a.day_cutting || 0), String(a.total_cutting || 0),
            String(a.day_input || 0), String(a.total_input || 0), String(a.balance || 0),
            String(a.man_power || 0), String(a.hours_actual || "-"),
            String(a.ot_hours_actual || 0), String(a.ot_manpower_actual || "-"),
            String(a.actual_per_hour || "-"),
            a.acknowledged ? "Yes" : "No",
          ]);
        });
        rows.push([]);
      }

      // ════════════════════════════════════════════════
      // STORAGE SECTION
      // ════════════════════════════════════════════════
      if (includeStorage && data.storageBinCards.length > 0) {
        rows.push(["═══ STORAGE BIN CARDS ═══"]);
        rows.push(["Section Summary:", `${data.storageBinCards.length} bin cards`]);
        rows.push(["Date", "PO Number", "Buyer", "Style", "Color", "Supplier",
          "Description", "Construction", "Width", "Package Qty",
          "Total Received", "Total Issued", "Balance"]);
        data.storageBinCards.forEach((bc: any) => {
          rows.push([
            formatDate(bc.created_at), bc.work_orders?.po_number || "-",
            bc.buyer || "-", bc.style || "-", bc.color || "-",
            bc.supplier_name || "-", bc.description || "-",
            bc.construction || "-", bc.width || "-", String(bc.package_qty || "-"),
            String(bc.totalReceived || 0), String(bc.totalIssued || 0), String(bc.balance || 0),
          ]);
        });
        rows.push([]);
      }

      rows.push(["═══ END OF REPORT ═══"]);

      const csvContent = rows.map(row => row.map(esc).join(",")).join("\n");
      const fileDate = format(new Date(), "yyyy-MM-dd");
      const deptSuffix = deptParts.join("_").toLowerCase();
      const { downloadCsv } = await import("@/lib/capacitor");
      await downloadCsv(csvContent, `submissions_${deptSuffix}_${dateRange}days_${fileDate}.csv`);

      toast.success(t("modals.exportedRecords", { count: getExportCounts() }));
      onOpenChange(false);
    } catch (error) {
      console.error("Export error:", error);
      toast.error(t("modals.failedToExport"));
    } finally {
      setExporting(false);
    }
  };

  const selectAll = () => { setIncludeSewing(true); setIncludeFinishing(true); setIncludeCutting(true); setIncludeStorage(true); };
  const clearAll = () => { setIncludeSewing(false); setIncludeFinishing(false); setIncludeCutting(false); setIncludeStorage(false); };

  const getSewingCount = () => data.sewingTargets.length + data.sewingActuals.length;
  const getFinishingCount = () => effectiveFinishingTargetCount + effectiveFinishingActualCount;
  const getCuttingCount = () => data.cuttingTargets.length + data.cuttingActuals.length;
  const getStorageCount = () => data.storageBinCards.length;

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <FileSpreadsheet className="h-5 w-5 text-primary" />
            {t('modals.exportSubmissions')}
          </DialogTitle>
          <DialogDescription>
            {t('modals.exportSelectDepartments')}
          </DialogDescription>
        </DialogHeader>

        <div className="space-y-6 py-4">
          <div className="flex gap-2">
            <Button variant="outline" size="sm" onClick={selectAll}>{t('modals.selectAll')}</Button>
            <Button variant="outline" size="sm" onClick={clearAll}>{t('modals.clearAll')}</Button>
          </div>

          <div className="space-y-3">
            <Label className="text-sm font-medium">{t('modals.departments')}</Label>
            <div className="grid grid-cols-2 gap-4">
              <div className="flex items-center space-x-3 rounded-lg border p-3 hover:bg-accent/50 transition-colors">
                <Checkbox id="sewing" checked={includeSewing} onCheckedChange={(c) => setIncludeSewing(c === true)} />
                <div className="flex-1">
                  <Label htmlFor="sewing" className="cursor-pointer font-medium flex items-center gap-2">
                    <SewingMachine className="h-4 w-4" />{t('modals.sewing')}
                  </Label>
                  <p className="text-xs text-muted-foreground">{getSewingCount()} {t('modals.records')}</p>
                </div>
              </div>
              <div className="flex items-center space-x-3 rounded-lg border p-3 hover:bg-accent/50 transition-colors">
                <Checkbox id="finishing" checked={includeFinishing} onCheckedChange={(c) => setIncludeFinishing(c === true)} />
                <div className="flex-1">
                  <Label htmlFor="finishing" className="cursor-pointer font-medium flex items-center gap-2">
                    <Package className="h-4 w-4" />{t('modals.finishing')}
                  </Label>
                  <p className="text-xs text-muted-foreground">{getFinishingCount()} {t('modals.records')}</p>
                </div>
              </div>
              <div className="flex items-center space-x-3 rounded-lg border p-3 hover:bg-accent/50 transition-colors">
                <Checkbox id="cutting" checked={includeCutting} onCheckedChange={(c) => setIncludeCutting(c === true)} />
                <div className="flex-1">
                  <Label htmlFor="cutting" className="cursor-pointer font-medium flex items-center gap-2">
                    <Scissors className="h-4 w-4" />{t('modals.cutting')}
                  </Label>
                  <p className="text-xs text-muted-foreground">{getCuttingCount()} {t('modals.records')}</p>
                </div>
              </div>
              <div className="flex items-center space-x-3 rounded-lg border p-3 hover:bg-accent/50 transition-colors">
                <Checkbox id="storage" checked={includeStorage} onCheckedChange={(c) => setIncludeStorage(c === true)} />
                <div className="flex-1">
                  <Label htmlFor="storage" className="cursor-pointer font-medium flex items-center gap-2">
                    <Package className="h-4 w-4" />{t('modals.storage')}
                  </Label>
                  <p className="text-xs text-muted-foreground">{getStorageCount()} {t('modals.records')}</p>
                </div>
              </div>
            </div>
          </div>

          <div className="rounded-lg bg-muted/50 p-3">
            <p className="text-sm"><span className="font-medium">{getExportCounts()}</span> {t('modals.recordsWillBeExported')}</p>
            <p className="text-xs text-muted-foreground">{t('modals.dateRangeLastDays', { days: dateRange })}</p>
          </div>
        </div>

        <DialogFooter className="gap-2 sm:gap-0">
          <Button variant="outline" onClick={() => onOpenChange(false)}>{t('modals.cancel')}</Button>
          <Button onClick={handleExport} disabled={!canExport || exporting}>
            {exporting ? <Loader2 className="h-4 w-4 mr-2 animate-spin" /> : <Download className="h-4 w-4 mr-2" />}
            {t('modals.exportCSV')}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}