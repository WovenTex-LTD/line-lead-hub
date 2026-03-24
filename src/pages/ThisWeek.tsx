import { useState, useEffect, useMemo } from "react";
import { useAuth } from "@/contexts/AuthContext";
import { getTodayInTimezone } from "@/lib/date-utils";
import { supabase } from "@/integrations/supabase/client";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { format } from "date-fns";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Button } from "@/components/ui/button";
import { Loader2, Calendar, TrendingUp, TrendingDown, Minus, Package, ChevronLeft, ChevronRight, Scissors, AlertTriangle, DollarSign, ChevronDown, FileDown } from "lucide-react";
import { SewingMachine } from "@/components/icons/SewingMachine";
import { useHeadcountCost } from "@/hooks/useHeadcountCost";
import { jsPDF } from "jspdf";
import { ReportExportDialog } from "@/components/ReportExportDialog";

interface DailyStats {
  date: string;
  dayName: string;
  sewingTarget: number;
  sewingOutput: number;
  finishingTarget: number;
  finishingOutput: number;
  cuttingTarget: number;
  cuttingActual: number;
  sewingUpdates: number;
  finishingUpdates: number;
  cuttingTargetCount: number;
  cuttingActualCount: number;
  blockers: number;
  // Financial
  revenue: number; // USD
  sewingCostNative: number;
  cuttingCostNative: number;
  finishingCostNative: number;
  // Raw line data for PDF
  rawSewing: any[];
  rawCutting: any[];
  rawFinishing: any[];
}

export default function ThisWeek() {
  const { profile, factory } = useAuth();
  const { headcountCost, isConfigured: costConfigured } = useHeadcountCost();
  const [loading, setLoading] = useState(true);
  const [weekOffset, setWeekOffset] = useState(0);
  const [weekStats, setWeekStats] = useState<DailyStats[]>([]);
  const [financialsExpanded, setFinancialsExpanded] = useState(false);
  const [bdtToUsd, setBdtToUsd] = useState<number | null>(null);
  const [totals, setTotals] = useState({
    sewingOutput: 0,
    finishingTarget: 0,
    finishingOutput: 0,
    cuttingTarget: 0,
    cuttingActual: 0,
    totalUpdates: 0,
    totalBlockers: 0,
    leftoverYards: 0,
  });

  // Fetch exchange rate
  useEffect(() => {
    let cancelled = false;
    async function fetchRate() {
      try {
        const res = await fetch('https://open.er-api.com/v6/latest/USD');
        const json = await res.json();
        if (!cancelled && json?.rates?.BDT) setBdtToUsd(1 / json.rates.BDT);
      } catch {
        if (!cancelled) setBdtToUsd(1 / 121);
      }
    }
    fetchRate();
    return () => { cancelled = true; };
  }, []);

  useEffect(() => {
    if (profile?.factory_id) {
      fetchWeekData();
    }
  }, [profile?.factory_id, weekOffset]);

  async function fetchWeekData() {
    if (!profile?.factory_id) return;
    setLoading(true);

    try {
      const todayStr = getTodayInTimezone(factory?.timezone || "Asia/Dhaka");
      const today = new Date(todayStr + "T00:00:00");
      const currentWeekStart = new Date(today);
      currentWeekStart.setDate(today.getDate() - today.getDay()); // Start of current week (Sunday)
      
      // Apply week offset
      const weekStart = new Date(currentWeekStart);
      weekStart.setDate(currentWeekStart.getDate() + (weekOffset * 7));
      const days: DailyStats[] = [];
      let totalSewing = 0;
      let totalFinishingTarget = 0;
      let totalFinishingOutput = 0;
      let totalCuttingTarget = 0;
      let totalCuttingActual = 0;
      let totalUpdates = 0;
      let totalBlockers = 0;
      let totalLeftoverYards = 0;

      for (let i = 0; i <= 6; i++) {
        const date = new Date(weekStart);
        date.setDate(weekStart.getDate() + i);
        const dateStr = format(date, "yyyy-MM-dd");
        
        if (date > today) {
          days.push({
            date: dateStr,
            dayName: format(date, "EEE"),
            sewingTarget: 0,
            sewingOutput: 0,
            finishingTarget: 0,
            finishingOutput: 0,
            cuttingTarget: 0,
            cuttingActual: 0,
            sewingUpdates: 0,
            finishingUpdates: 0,
            cuttingTargetCount: 0,
            cuttingActualCount: 0,
            blockers: 0,
            revenue: 0,
            sewingCostNative: 0,
            cuttingCostNative: 0,
            finishingCostNative: 0,
            rawSewing: [],
            rawCutting: [],
            rawFinishing: [],
          });
          continue;
        }

        const [sewingRes, finishingRes, sewingTargetsRes, cuttingTargetsRes, cuttingActualsRes] = await Promise.all([
          supabase
            .from('sewing_actuals')
            .select('line_id, good_today, has_blocker, manpower_actual, hours_actual, ot_manpower_actual, ot_hours_actual, reject_today, rework_today, actual_per_hour, blocker_description, remarks, lines(name, line_id), work_orders(po_number, buyer, style, cm_per_dozen)')
            .eq('factory_id', profile.factory_id)
            .eq('production_date', dateStr),
          supabase
            .from('finishing_daily_logs')
            .select('log_type, poly, carton, planned_hours, work_order_id, m_power_actual, actual_hours, ot_manpower_actual, ot_hours_actual, thread_cutting, inside_check, buttoning, iron, get_up, remarks, lines(name, line_id), work_orders(po_number, buyer, style, cm_per_dozen)')
            .eq('factory_id', profile.factory_id)
            .eq('production_date', dateStr),
          supabase
            .from('sewing_targets')
            .select('line_id, per_hour_target, manpower_planned')
            .eq('factory_id', profile.factory_id)
            .eq('production_date', dateStr),
          supabase
            .from('cutting_targets')
            .select('cutting_capacity')
            .eq('factory_id', profile.factory_id)
            .eq('production_date', dateStr),
          supabase
            .from('cutting_actuals')
            .select('day_cutting, total_cutting, day_input, balance, leftover_recorded, leftover_quantity, leftover_unit, man_power, hours_actual, ot_manpower_actual, ot_hours_actual, lines!cutting_actuals_line_id_fkey(name, line_id), work_orders(po_number, buyer, style, color, cm_per_dozen)')
            .eq('factory_id', profile.factory_id)
            .eq('production_date', dateStr),
        ]);

        const sewingData = sewingRes.data || [];
        const finishingData = finishingRes.data || [];
        const sewingTargetsData = sewingTargetsRes.data || [];
        const cuttingTargetsData = cuttingTargetsRes.data || [];
        const cuttingActualsData = cuttingActualsRes.data || [];

        const daySewingOutput = sewingData.reduce((sum, u) => sum + (u.good_today || 0), 0);

        // Only count targets that have matching actuals (exclude target-only submissions)
        const sewingActualLineIds = new Set(sewingData.map((u: any) => u.line_id));
        const pairedSewingTargets = sewingTargetsData.filter((t: any) => sewingActualLineIds.has(t.line_id));

        // Finishing: separate TARGET and OUTPUT logs
        const finishingOutputLogs = finishingData.filter(f => f.log_type === 'OUTPUT');
        const finishingTargetLogs = finishingData.filter(f => f.log_type === 'TARGET');

        // Only count finishing targets that have matching output logs
        const finishingOutputWoIds = new Set(finishingOutputLogs.map((f: any) => f.work_order_id));
        const pairedFinishingTargets = finishingTargetLogs.filter((f: any) => finishingOutputWoIds.has(f.work_order_id));

        // Finishing target: poly per hour × planned_hours = daily poly target
        const dayFinishingTarget = pairedFinishingTargets.reduce((sum, f) => {
          const hours = (f as any).planned_hours || 1;
          return sum + (((f as any).poly || 0) * hours);
        }, 0);

        // Finishing output: poly is the primary metric
        const dayFinishingOutput = finishingOutputLogs.reduce((sum, f) => sum + ((f as any).poly || 0), 0);

        // Cutting data - only count targets with matching actuals
        const cuttingActualExists = cuttingActualsData.length > 0;
        const dayCuttingTarget = cuttingActualExists ? cuttingTargetsData.reduce((sum, t) => sum + (t.cutting_capacity || 0), 0) : 0;
        const dayCuttingActual = cuttingActualsData.reduce((sum, a) => sum + (a.day_cutting || 0), 0);
        
        // Calculate leftover fabric in yards for this day
        const dayLeftoverYards = cuttingActualsData
          .filter((a: any) => a.leftover_recorded && a.leftover_quantity && a.leftover_quantity > 0)
          .reduce((sum: number, a: any) => {
            const qty = a.leftover_quantity || 0;
            const unit = a.leftover_unit || "pcs";
            if (unit === "yard") return sum + qty;
            if (unit === "meter") return sum + qty * 1.0936;
            if (unit === "kg") return sum + qty * 3;
            if (unit === "roll") return sum + qty * 50;
            return sum + qty;
          }, 0);
        
        const dayBlockers = sewingData.filter(u => u.has_blocker).length;

        // Calculate sewing targets (per_hour_target * 8 hours as daily estimate) - only paired targets
        const daySewingTarget = pairedSewingTargets.reduce((sum: number, t: any) => sum + ((t.per_hour_target || 0) * 8), 0);

        // ── Financial calculations for this day ──
        const rate = costConfigured && headcountCost.value ? headcountCost.value : 0;

        // Revenue: finishing output × (cm_per_dozen / 12) — only POs with CM
        let dayRevenue = 0;
        finishingOutputLogs.forEach((f: any) => {
          const cm = f.work_orders?.cm_per_dozen;
          const output = f.poly || 0;
          if (cm && output) dayRevenue += (cm / 12) * output;
        });

        // Cost by department — only POs with CM
        let daySewingCost = 0;
        let dayCuttingCost = 0;
        let dayFinishingCost = 0;
        if (rate > 0) {
          sewingData.forEach((s: any) => {
            if (!s.work_orders?.cm_per_dozen) return;
            if (s.manpower_actual && s.hours_actual) daySewingCost += rate * s.manpower_actual * s.hours_actual;
            if (s.ot_manpower_actual && s.ot_hours_actual) daySewingCost += rate * s.ot_manpower_actual * s.ot_hours_actual;
          });
          cuttingActualsData.forEach((c: any) => {
            if (!c.work_orders?.cm_per_dozen) return;
            if (c.man_power && c.hours_actual) dayCuttingCost += rate * c.man_power * c.hours_actual;
            if (c.ot_manpower_actual && c.ot_hours_actual) dayCuttingCost += rate * c.ot_manpower_actual * c.ot_hours_actual;
          });
          finishingOutputLogs.forEach((f: any) => {
            if (!f.work_orders?.cm_per_dozen) return;
            if (f.m_power_actual && f.actual_hours) dayFinishingCost += rate * f.m_power_actual * f.actual_hours;
            if (f.ot_manpower_actual && f.ot_hours_actual) dayFinishingCost += rate * f.ot_manpower_actual * f.ot_hours_actual;
          });
        }

        totalSewing += daySewingOutput;
        totalFinishingTarget += dayFinishingTarget;
        totalFinishingOutput += dayFinishingOutput;
        totalCuttingTarget += dayCuttingTarget;
        totalCuttingActual += dayCuttingActual;
        totalUpdates += sewingData.length + finishingData.length + cuttingTargetsData.length + cuttingActualsData.length;
        totalBlockers += dayBlockers;
        totalLeftoverYards += dayLeftoverYards;

        days.push({
          date: dateStr,
          dayName: format(date, "EEE"),
          sewingTarget: daySewingTarget,
          sewingOutput: daySewingOutput,
          finishingTarget: dayFinishingTarget,
          finishingOutput: dayFinishingOutput,
          cuttingTarget: dayCuttingTarget,
          cuttingActual: dayCuttingActual,
          sewingUpdates: sewingData.length,
          finishingUpdates: finishingData.length,
          cuttingTargetCount: cuttingTargetsData.length,
          cuttingActualCount: cuttingActualsData.length,
          blockers: dayBlockers,
          revenue: Math.round(dayRevenue * 100) / 100,
          sewingCostNative: Math.round(daySewingCost * 100) / 100,
          cuttingCostNative: Math.round(dayCuttingCost * 100) / 100,
          finishingCostNative: Math.round(dayFinishingCost * 100) / 100,
          rawSewing: sewingData,
          rawCutting: cuttingActualsData,
          rawFinishing: finishingOutputLogs,
        });
      }

      setWeekStats(days);
      setTotals({
        sewingOutput: totalSewing,
        finishingTarget: totalFinishingTarget,
        finishingOutput: totalFinishingOutput,
        cuttingTarget: totalCuttingTarget,
        cuttingActual: totalCuttingActual,
        totalUpdates,
        totalBlockers,
        leftoverYards: Math.round(totalLeftoverYards * 100) / 100,
      });
    } catch (error) {
      console.error('Error fetching week data:', error);
    } finally {
      setLoading(false);
    }
  }

  const maxSewing = Math.max(...weekStats.map(d => Math.max(d.sewingOutput, d.sewingTarget)), 1);
  const maxFinishing = Math.max(...weekStats.map(d => Math.max(d.finishingTarget, d.finishingOutput)), 1);

  // ── Weekly financial summary ──
  const weekFinancials = useMemo(() => {
    const costCurrency = headcountCost.currency;
    const isBDT = costCurrency === 'BDT';

    let totalRevenue = 0;
    let totalSewingCost = 0;

    const dailyFinancials = weekStats.map(day => {
      totalRevenue += day.revenue;
      totalSewingCost += day.sewingCostNative;
      const dayCostNative = day.sewingCostNative;
      const dayCostUsd = isBDT && bdtToUsd ? dayCostNative * bdtToUsd : dayCostNative;
      return {
        ...day,
        costNative: Math.round(dayCostNative * 100) / 100,
        costUsd: Math.round(dayCostUsd * 100) / 100,
        profit: Math.round((day.revenue - dayCostUsd) * 100) / 100,
      };
    });

    const totalCostNative = totalSewingCost;
    const toUsd = (v: number) => isBDT && bdtToUsd ? v * bdtToUsd : v;
    const totalCostUsd = toUsd(totalCostNative);
    const profit = totalRevenue - totalCostUsd;
    const margin = totalRevenue > 0 ? (profit / totalRevenue) * 100 : 0;
    const hasData = totalRevenue > 0 || totalCostNative > 0;

    return {
      totalRevenue: Math.round(totalRevenue * 100) / 100,
      totalCostNative: Math.round(totalCostNative * 100) / 100,
      totalCostUsd: Math.round(totalCostUsd * 100) / 100,
      profit: Math.round(profit * 100) / 100,
      margin: Math.round(margin * 10) / 10,
      costCurrency,
      hasData,
      dailyFinancials,
    };
  }, [weekStats, headcountCost.currency, bdtToUsd]);

  const getTrend = (current: number, previous: number) => {
    if (previous === 0) return { icon: Minus, color: 'text-muted-foreground' };
    const change = ((current - previous) / previous) * 100;
    if (change > 5) return { icon: TrendingUp, color: 'text-emerald-600 dark:text-emerald-400' };
    if (change < -5) return { icon: TrendingDown, color: 'text-red-600 dark:text-red-400' };
    return { icon: Minus, color: 'text-muted-foreground' };
  };

  if (loading) {
    return (
      <div className="flex min-h-[400px] items-center justify-center">
        <Loader2 className="h-8 w-8 animate-spin text-primary" />
      </div>
    );
  }

  const today = getTodayInTimezone(factory?.timezone || "Asia/Dhaka");

  // Get week date range for display
  const getWeekRange = () => {
    const todayDate = new Date(today + "T00:00:00");
    const currentWeekStart = new Date(todayDate);
    currentWeekStart.setDate(todayDate.getDate() - todayDate.getDay());
    
    const weekStart = new Date(currentWeekStart);
    weekStart.setDate(currentWeekStart.getDate() + (weekOffset * 7));
    
    const weekEnd = new Date(weekStart);
    weekEnd.setDate(weekStart.getDate() + 6);
    
    return `${format(weekStart, "MMM d")} - ${format(weekEnd, "MMM d")}`;
  };

  const isCurrentWeek = weekOffset === 0;

  // ── PDF Export ──
  const handleDownloadPdf = async () => {
    const doc = new jsPDF({ orientation: "landscape", unit: "mm", format: "a4" });
    const pw = doc.internal.pageSize.getWidth();
    const ph = doc.internal.pageSize.getHeight();
    const m = 10;
    const cw = pw - m * 2;
    let y = m;

    const isBDT = weekFinancials.costCurrency === 'BDT';
    const rate = costConfigured && headcountCost.value ? headcountCost.value : 0;
    const nSym = isBDT ? "Tk " : "$";
    const fN = (v: number | null | undefined) => v != null ? v.toLocaleString() : "-";
    const fUsd = (v: number) => "$" + v.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 });
    const fNat = (v: number) => nSym + v.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 });
    const toUsd = (native: number): number => {
      if (!isBDT || !bdtToUsd) return native;
      return Math.round(native * bdtToUsd * 100) / 100;
    };
    const lineCost = (mp: number | null, hrs: number | null, otMp: number | null, otHrs: number | null): number => {
      if (!rate) return 0;
      let c = 0;
      if (mp && hrs) c += rate * mp * hrs;
      if (otMp && otHrs) c += rate * otMp * otHrs;
      return Math.round(c * 100) / 100;
    };
    const { compareLineNames: cmpLines } = await import("@/lib/sort-lines");
    const fmtDate = (d: string) => { const p = d.split("-"); return `${p[2]}.${p[1]}`; };

    // ── Generic bordered table ──
    type Col = { label: string; w: number; align?: "left" | "right" | "center" };
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
          doc.rect(m, ty, totalW, rh, 'F');
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
      doc.rect(m, ty, totalW, rh, 'F');
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
          doc.rect(m, ty, totalW, rh, 'F');
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
      doc.text(`${factory?.name || "Factory"} — Weekly Report`, m, y);
      doc.setFontSize(8); doc.setFont("helvetica", "normal");
      doc.text(getWeekRange(), pw - m, y, { align: "right" });
      y += 5;
      doc.setDrawColor(0); doc.setLineWidth(0.4); doc.line(m, y, pw - m, y);
      y += 4;
      doc.setFont("helvetica", "bold"); doc.setFontSize(10);
      doc.text(title, m, y);
      y += 6;
      return y;
    };

    // ========== PAGE 1: SUMMARY ==========
    doc.setFont("helvetica", "bold"); doc.setFontSize(14); doc.setTextColor(0);
    doc.text(`${factory?.name || "Factory"} — WEEKLY PRODUCTION REPORT`, m, y);
    y += 6;
    doc.setFontSize(9); doc.setFont("helvetica", "normal");
    doc.text(`Period: ${getWeekRange()} | Generated: ${format(new Date(), "PPpp")}`, m, y);
    y += 8;

    // Production summary table
    doc.setFont("helvetica", "bold"); doc.setFontSize(10);
    doc.text("PRODUCTION SUMMARY", m, y); y += 6;

    const sumCols: Col[] = [
      { label: "Day", w: 28 },
      { label: "Sewing Out", w: 28, align: "right" },
      { label: "Sewing Tgt", w: 28, align: "right" },
      { label: "Finish Out", w: 28, align: "right" },
      { label: "Finish Tgt", w: 28, align: "right" },
      { label: "Cutting", w: 25, align: "right" },
      { label: "Blockers", w: 22, align: "right" },
    ];
    const sumRows = weekStats.map(d => [
      `${d.dayName} ${fmtDate(d.date)}`,
      fN(d.sewingOutput), fN(d.sewingTarget),
      fN(d.finishingOutput), fN(d.finishingTarget),
      fN(d.cuttingActual), String(d.blockers),
    ]);
    sumRows.push(["TOTAL", fN(totals.sewingOutput), "", fN(totals.finishingOutput), fN(totals.finishingTarget), fN(totals.cuttingActual), String(totals.totalBlockers)]);
    y = drawTable(sumCols, sumRows, y, { boldLastRow: true, pgTitle: "PRODUCTION SUMMARY" });
    y += 8;

    // Financial summary table
    if (weekFinancials.hasData) {
      doc.setFont("helvetica", "bold"); doc.setFontSize(10);
      doc.text("WEEKLY FINANCIALS (USD)", m, y); y += 6;

      const finCols: Col[] = [
        { label: "Day", w: 28 },
        { label: "Output Value ($)", w: 45, align: "right" },
        { label: "Operating Cost ($)", w: 45, align: "right" },
        { label: "Op. Margin ($)", w: 45, align: "right" },
      ];
      const finRows = weekFinancials.dailyFinancials.map(d => {
        const isFut = new Date(d.date) > new Date();
        if (isFut) return [`${d.dayName} ${fmtDate(d.date)}`, "-", "-", "-"];
        return [
          `${d.dayName} ${fmtDate(d.date)}`,
          fUsd(d.revenue),
          fUsd(d.costUsd),
          `${d.profit >= 0 ? "+" : "-"}${fUsd(Math.abs(d.profit))}`,
        ];
      });
      finRows.push([
        "TOTAL", fUsd(weekFinancials.totalRevenue),
        fUsd(weekFinancials.totalCostUsd),
        `${weekFinancials.profit >= 0 ? "+" : "-"}${fUsd(Math.abs(weekFinancials.profit))}`,
      ]);
      y = drawTable(finCols, finRows, y, { boldLastRow: true, pgTitle: "WEEKLY FINANCIALS" });
      y += 3;
      doc.setFontSize(7); doc.setFont("helvetica", "italic"); doc.setTextColor(90);
      if (isBDT && bdtToUsd) doc.text(`Cost in BDT: Tk${weekFinancials.totalCostNative.toLocaleString()} | Rate: ${(1 / bdtToUsd).toFixed(1)} BDT/USD | Margin: ${weekFinancials.margin}%`, m, y + 2);
      else doc.text(`Margin: ${weekFinancials.margin}%`, m, y + 2);
    }

    // ========== SEWING DETAIL (grouped by Line) ==========
    const allSewing = weekStats.flatMap(d => d.rawSewing.map((s: any) => ({ ...s, _date: d.date, _dayName: d.dayName })));
    try { if (allSewing.length > 0) {
      doc.addPage();
      y = pageHead("SEWING — LINE WISE OUTPUT & COST");

      const sewCols: Col[] = [
        { label: "Day", w: 18 },
        { label: "PO / Style", w: 38 },
        { label: "Output", w: 18, align: "right" },
        { label: "Reject", w: 14, align: "right" },
        { label: "Rework", w: 14, align: "right" },
        { label: "Eff %", w: 16, align: "right" },
        { label: "MP", w: 12, align: "right" },
        { label: "Hrs", w: 12, align: "right" },
        { label: "OT MP", w: 14, align: "right" },
        { label: "OT Hrs", w: 14, align: "right" },
        { label: `Cost (${isBDT ? "BDT" : "USD"})`, w: 26, align: "right" },
        { label: "Cost ($)", w: 24, align: "right" },
        { label: "Notes", w: cw - 220 > 0 ? cw - 220 : 20 },
      ];

      // Group by line
      const sewByLine: Record<string, any[]> = {};
      allSewing.forEach((s: any) => {
        const ln = s.lines?.name || s.lines?.line_id || "Unknown";
        if (!sewByLine[ln]) sewByLine[ln] = [];
        sewByLine[ln].push(s);
      });
      const sewLineKeys = Object.keys(sewByLine).sort(cmpLines);

      let sewDeptCostNat = 0, sewDeptCostUsd = 0, sewDeptOutput = 0;

      sewLineKeys.forEach(lineName => {
        const entries = sewByLine[lineName].sort((a: any, b: any) => a._date.localeCompare(b._date));

        // Line header label
        y += 6;
        if (y + 20 > ph - 12) { doc.addPage(); y = pageHead("SEWING — LINE WISE OUTPUT & COST"); }
        doc.setFont("helvetica", "bold"); doc.setFontSize(9); doc.setTextColor(30, 80, 180);
        doc.text(lineName, m, y); y += 3;
        doc.setTextColor(0);

        let lineCostNat = 0, lineCostUsd = 0, lineOutput = 0, lineReject = 0, lineRework = 0;
        const rows = entries.map((s: any) => {
          const costNat = lineCost(s.manpower_actual, s.hours_actual, s.ot_manpower_actual, s.ot_hours_actual);
          const costU = toUsd(costNat);
          lineCostNat += costNat; lineCostUsd += costU;
          lineOutput += s.good_today || 0;
          lineReject += s.reject_today || 0;
          lineRework += s.rework_today || 0;
          const target = s.actual_per_hour; // target pieces per hour
          const eff = target && s.manpower_actual && s.hours_actual
            ? Math.round(((s.good_today || 0) / (target * s.hours_actual)) * 100)
            : null;
          return [
            fmtDate(s._date),
            ((s.work_orders?.po_number || "-") + " / " + (s.work_orders?.style || "-")).substring(0, 22),
            fN(s.good_today), String(s.reject_today || 0), String(s.rework_today || 0),
            eff != null ? eff + "%" : "-",
            fN(s.manpower_actual), fN(s.hours_actual), fN(s.ot_manpower_actual), fN(s.ot_hours_actual),
            rate ? fNat(costNat) : "-", rate ? fUsd(costU) : "-",
            (s.blocker_description || s.remarks || "-").substring(0, 24),
          ];
        });
        rows.push([`${lineName} Total`, "", fN(lineOutput), String(lineReject), String(lineRework), "", "", "", "", "", rate ? fNat(lineCostNat) : "-", rate ? fUsd(lineCostUsd) : "-", ""]);
        y = drawTable(sewCols, rows, y, { boldLastRow: true, fs: 6.5, rh: 6, pgTitle: "SEWING — LINE WISE OUTPUT & COST" });
        y += 4;

        sewDeptCostNat += lineCostNat; sewDeptCostUsd += lineCostUsd; sewDeptOutput += lineOutput;
      });

      // Department total
      if (y + 12 > ph - 12) { doc.addPage(); y = pageHead("SEWING — LINE WISE OUTPUT & COST"); }
      doc.setFont("helvetica", "bold"); doc.setFontSize(9); doc.setTextColor(0);
      doc.text(`SEWING DEPARTMENT TOTAL — Output: ${fN(sewDeptOutput)} | Cost: ${rate ? fNat(sewDeptCostNat) : "-"} (${rate ? fUsd(sewDeptCostUsd) : "-"})`, m, y);
      y += 2;
      doc.setDrawColor(0); doc.setLineWidth(0.5); doc.line(m, y, pw - m, y);
    } } catch (e) { console.error("PDF sewing section error:", e); }

    // ========== CUTTING DETAIL (grouped by PO) ==========
    const allCutting = weekStats.flatMap(d => d.rawCutting.map((c: any) => ({ ...c, _date: d.date, _dayName: d.dayName })));
    try { if (allCutting.length > 0) {
      doc.addPage();
      y = pageHead("CUTTING — PO WISE DETAIL & COST");

      const cutCols: Col[] = [
        { label: "Day", w: 18 },
        { label: "Line", w: 22 },
        { label: "Colour", w: 22 },
        { label: "Day Cut", w: 20, align: "right" },
        { label: "Day Input", w: 20, align: "right" },
        { label: "Total Cut", w: 22, align: "right" },
        { label: "Balance", w: 20, align: "right" },
        { label: "MP", w: 12, align: "right" },
        { label: "Hrs", w: 12, align: "right" },
        { label: "OT MP", w: 14, align: "right" },
        { label: "OT Hrs", w: 14, align: "right" },
        { label: `Cost (${isBDT ? "BDT" : "USD"})`, w: 26, align: "right" },
        { label: "Cost ($)", w: 24, align: "right" },
      ];

      // Group by PO
      const cutByPo: Record<string, { buyer: string; entries: any[] }> = {};
      allCutting.forEach((c: any) => {
        const po = c.work_orders?.po_number || "Unknown PO";
        if (!cutByPo[po]) cutByPo[po] = { buyer: c.work_orders?.buyer || "-", entries: [] };
        cutByPo[po].entries.push(c);
      });
      const cutPoKeys = Object.keys(cutByPo).sort();

      let cutDeptCostNat = 0, cutDeptCostUsd = 0, cutDeptDayCut = 0;

      cutPoKeys.forEach(po => {
        const { buyer, entries } = cutByPo[po];
        entries.sort((a: any, b: any) => {
          if (a._date !== b._date) return a._date.localeCompare(b._date);
          return cmpLines(a.lines?.name || "", b.lines?.name || "");
        });

        // PO header label
        y += 6;
        if (y + 20 > ph - 12) { doc.addPage(); y = pageHead("CUTTING — PO WISE DETAIL & COST"); }
        doc.setFont("helvetica", "bold"); doc.setFontSize(9); doc.setTextColor(30, 80, 180);
        doc.text(`PO: ${po} — Buyer: ${buyer}`, m, y); y += 3;
        doc.setTextColor(0);

        let poCostNat = 0, poCostUsd = 0, poDayCut = 0;
        const rows = entries.map((c: any) => {
          const costNat = lineCost(c.man_power, c.hours_actual, c.ot_manpower_actual, c.ot_hours_actual);
          const costU = toUsd(costNat);
          poCostNat += costNat; poCostUsd += costU;
          poDayCut += c.day_cutting || 0;
          return [
            fmtDate(c._date),
            (c.lines?.name || c.lines?.line_id || "-").substring(0, 12),
            (c.work_orders?.color || "-").substring(0, 13),
            fN(c.day_cutting), fN(c.day_input), fN(c.total_cutting), fN(c.balance),
            fN(c.man_power), fN(c.hours_actual), fN(c.ot_manpower_actual), fN(c.ot_hours_actual),
            rate ? fNat(costNat) : "-", rate ? fUsd(costU) : "-",
          ];
        });
        rows.push([`${po} Total`, "", "", fN(poDayCut), "", "", "", "", "", "", "", rate ? fNat(poCostNat) : "-", rate ? fUsd(poCostUsd) : "-"]);
        y = drawTable(cutCols, rows, y, { boldLastRow: true, fs: 6.5, rh: 6, pgTitle: "CUTTING — PO WISE DETAIL & COST" });
        y += 4;

        cutDeptCostNat += poCostNat; cutDeptCostUsd += poCostUsd; cutDeptDayCut += poDayCut;
      });

      // Department total
      if (y + 12 > ph - 12) { doc.addPage(); y = pageHead("CUTTING — PO WISE DETAIL & COST"); }
      doc.setFont("helvetica", "bold"); doc.setFontSize(9); doc.setTextColor(0);
      doc.text(`CUTTING DEPARTMENT TOTAL — Day Cut: ${fN(cutDeptDayCut)} | Cost: ${rate ? fNat(cutDeptCostNat) : "-"} (${rate ? fUsd(cutDeptCostUsd) : "-"})`, m, y);
      y += 2;
      doc.setDrawColor(0); doc.setLineWidth(0.5); doc.line(m, y, pw - m, y);
    } } catch (e) { console.error("PDF cutting section error:", e); }

    // ========== FINISHING DETAIL (grouped by PO) ==========
    const allFinishing = weekStats.flatMap(d => d.rawFinishing.map((f: any) => ({ ...f, _date: d.date, _dayName: d.dayName })));
    try { if (allFinishing.length > 0) {
      doc.addPage();
      y = pageHead("FINISHING — PO WISE OUTPUT, COST & REVENUE");

      const finCols: Col[] = [
        { label: "Day", w: 18 },
        { label: "Thread", w: 16, align: "right" },
        { label: "Check", w: 14, align: "right" },
        { label: "Button", w: 16, align: "right" },
        { label: "Iron", w: 14, align: "right" },
        { label: "Get Up", w: 16, align: "right" },
        { label: "Poly", w: 16, align: "right" },
        { label: "Carton", w: 16, align: "right" },
        { label: "MP", w: 12, align: "right" },
        { label: "Hrs", w: 12, align: "right" },
        { label: "OT MP", w: 14, align: "right" },
        { label: "OT Hrs", w: 14, align: "right" },
        { label: "Cost ($)", w: 24, align: "right" },
        { label: "CM/Dz", w: 16, align: "right" },
        { label: "Revenue ($)", w: cw - 218 > 0 ? cw - 218 : 22, align: "right" },
      ];

      // Group by PO
      const finByPo: Record<string, { buyer: string; cmDz: number | null; entries: any[] }> = {};
      allFinishing.forEach((f: any) => {
        const po = f.work_orders?.po_number || "Unknown PO";
        if (!finByPo[po]) finByPo[po] = { buyer: f.work_orders?.buyer || "-", cmDz: f.work_orders?.cm_per_dozen || null, entries: [] };
        finByPo[po].entries.push(f);
      });
      const finPoKeys = Object.keys(finByPo).sort();

      let finDeptCostUsd = 0, finDeptRevenue = 0, finDeptPoly = 0;

      finPoKeys.forEach(po => {
        const { buyer, cmDz, entries } = finByPo[po];
        entries.sort((a: any, b: any) => a._date.localeCompare(b._date));

        // PO header label
        y += 6;
        if (y + 20 > ph - 12) { doc.addPage(); y = pageHead("FINISHING — PO WISE OUTPUT, COST & REVENUE"); }
        doc.setFont("helvetica", "bold"); doc.setFontSize(9); doc.setTextColor(30, 80, 180);
        doc.text(`PO: ${po} — Buyer: ${buyer}${cmDz ? ` — CM/Dz: $${cmDz.toFixed(2)}` : ""}`, m, y); y += 3;
        doc.setTextColor(0);

        let poCostUsd = 0, poRevenue = 0, poPoly = 0;
        const rows = entries.map((f: any) => {
          const costNat = lineCost(f.m_power_actual, f.actual_hours, f.ot_manpower_actual, f.ot_hours_actual);
          const costU = toUsd(costNat);
          poCostUsd += costU;
          const cm = f.work_orders?.cm_per_dozen;
          const rev = cm && f.poly ? (cm / 12) * f.poly : 0;
          poRevenue += rev;
          poPoly += f.poly || 0;
          return [
            fmtDate(f._date),
            fN(f.thread_cutting), fN(f.inside_check), fN(f.buttoning), fN(f.iron), fN(f.get_up),
            fN(f.poly), fN(f.carton),
            fN(f.m_power_actual), fN(f.actual_hours), fN(f.ot_manpower_actual), fN(f.ot_hours_actual),
            rate ? fUsd(costU) : "-",
            cm ? "$" + cm.toFixed(2) : "-",
            rev > 0 ? fUsd(Math.round(rev * 100) / 100) : "-",
          ];
        });
        rows.push([`${po} Total`, "", "", "", "", "", fN(poPoly), "", "", "", "", "", rate ? fUsd(poCostUsd) : "-", "", poRevenue > 0 ? fUsd(Math.round(poRevenue * 100) / 100) : "-"]);
        y = drawTable(finCols, rows, y, { boldLastRow: true, fs: 6.5, rh: 6, pgTitle: "FINISHING — PO WISE OUTPUT, COST & REVENUE" });
        y += 4;

        finDeptCostUsd += poCostUsd; finDeptRevenue += poRevenue; finDeptPoly += poPoly;
      });

      // Department total
      if (y + 12 > ph - 12) { doc.addPage(); y = pageHead("FINISHING — PO WISE OUTPUT, COST & REVENUE"); }
      doc.setFont("helvetica", "bold"); doc.setFontSize(9); doc.setTextColor(0);
      doc.text(`FINISHING DEPARTMENT TOTAL — Poly: ${fN(finDeptPoly)} | Cost: ${rate ? fUsd(finDeptCostUsd) : "-"} | Revenue: ${finDeptRevenue > 0 ? fUsd(Math.round(finDeptRevenue * 100) / 100) : "-"} | Profit: ${finDeptRevenue > 0 && rate ? fUsd(Math.round((finDeptRevenue - finDeptCostUsd) * 100) / 100) : "-"}`, m, y);
      y += 2;
      doc.setDrawColor(0); doc.setLineWidth(0.5); doc.line(m, y, pw - m, y);
    } } catch (e) { console.error("PDF finishing section error:", e); }

    // ========== SIGN-OFF ==========
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
      doc.text(factory?.name || "", m, ph - 5);
    }

    const weekLabel = getWeekRange().replace(/\s/g, '_');
    const { savePdf } = await import("@/lib/capacitor");
    await savePdf(doc, `weekly_report_${weekLabel}.pdf`);
  };

  return (
    <div className="py-4 lg:py-6 space-y-6">
      {/* Header */}
      <div className="flex flex-wrap items-center gap-3">
        <div className="flex items-center gap-3 mr-auto">
          <div className="h-10 w-10 rounded-xl bg-indigo-500/10 flex items-center justify-center shrink-0">
            <Calendar className="h-5 w-5 text-indigo-600 dark:text-indigo-400" />
          </div>
          <div>
            <h1 className="text-xl md:text-2xl font-bold">
              {isCurrentWeek ? 'This Week' : weekOffset === -1 ? 'Last Week' : `${Math.abs(weekOffset)} Weeks Ago`}
            </h1>
            <p className="text-sm text-muted-foreground">{getWeekRange()}</p>
          </div>
        </div>
        <div className="flex items-center gap-2">
          <ReportExportDialog defaultType="weekly" weekOffset={weekOffset} />
          <Button
            variant="outline"
            size="icon"
            onClick={() => setWeekOffset(prev => prev - 1)}
            disabled={loading || weekOffset <= -4}
          >
            <ChevronLeft className="h-4 w-4" />
          </Button>
          <Button
            variant="outline"
            size="sm"
            onClick={() => setWeekOffset(0)}
            disabled={loading || isCurrentWeek}
          >
            Today
          </Button>
          <Button
            variant="outline"
            size="icon"
            onClick={() => setWeekOffset(prev => prev + 1)}
            disabled={loading || isCurrentWeek}
          >
            <ChevronRight className="h-4 w-4" />
          </Button>
        </div>
      </div>

      {/* Week Summary Cards */}
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
        <Card className="relative overflow-hidden border-blue-200/60 dark:border-blue-800/40 bg-gradient-to-br from-blue-50 via-white to-blue-50/50 dark:from-blue-950/40 dark:via-card dark:to-blue-950/20 hover:shadow-xl hover:-translate-y-1 transition-all duration-300 group">
          <CardContent className="p-4">
            <div className="flex items-center gap-3">
              <div className="h-10 w-10 rounded-xl bg-blue-500/10 flex items-center justify-center shrink-0">
                <SewingMachine className="h-5 w-5 text-blue-600 dark:text-blue-400" />
              </div>
              <div>
                <p className="text-2xl font-bold font-mono text-blue-600 dark:text-blue-400">{totals.sewingOutput.toLocaleString()}</p>
                <p className="text-xs text-muted-foreground font-medium">Sewing Output</p>
              </div>
            </div>
          </CardContent>
        </Card>
        <Card className="relative overflow-hidden border-violet-200/60 dark:border-violet-800/40 bg-gradient-to-br from-violet-50 via-white to-violet-50/50 dark:from-violet-950/40 dark:via-card dark:to-violet-950/20 hover:shadow-xl hover:-translate-y-1 transition-all duration-300 group">
          <CardContent className="p-4">
            <div className="flex items-center gap-3">
              <div className="h-10 w-10 rounded-xl bg-violet-500/10 flex items-center justify-center shrink-0">
                <Package className="h-5 w-5 text-violet-600 dark:text-violet-400" />
              </div>
              <div>
                <p className="text-2xl font-bold font-mono text-violet-600 dark:text-violet-400">{totals.finishingOutput.toLocaleString()}</p>
                <p className="text-xs text-muted-foreground font-medium">Finishing Output</p>
              </div>
            </div>
          </CardContent>
        </Card>
        <Card className="relative overflow-hidden border-emerald-200/60 dark:border-emerald-800/40 bg-gradient-to-br from-emerald-50 via-white to-emerald-50/50 dark:from-emerald-950/40 dark:via-card dark:to-emerald-950/20 hover:shadow-xl hover:-translate-y-1 transition-all duration-300 group">
          <CardContent className="p-4">
            <div className="flex items-center gap-3">
              <div className="h-10 w-10 rounded-xl bg-emerald-500/10 flex items-center justify-center shrink-0">
                <Scissors className="h-5 w-5 text-emerald-600 dark:text-emerald-400" />
              </div>
              <div>
                <p className="text-2xl font-bold font-mono text-amber-600 dark:text-amber-400">{totals.leftoverYards.toLocaleString()} <span className="text-sm font-normal text-muted-foreground">yards</span></p>
                <p className="text-xs text-muted-foreground font-medium">Left Over Fabric</p>
              </div>
            </div>
          </CardContent>
        </Card>
        <Card className={`relative overflow-hidden border-amber-200/60 dark:border-amber-800/40 bg-gradient-to-br from-amber-50 via-white to-amber-50/50 dark:from-amber-950/40 dark:via-card dark:to-amber-950/20 hover:shadow-xl hover:-translate-y-1 transition-all duration-300 group ${totals.totalBlockers > 0 ? 'border-red-500/30' : ''}`}>
          <CardContent className="p-4">
            <div className="flex items-center gap-3">
              <div className="h-10 w-10 rounded-xl bg-amber-500/10 flex items-center justify-center shrink-0">
                <AlertTriangle className="h-5 w-5 text-amber-600 dark:text-amber-400" />
              </div>
              <div>
                <p className={`text-2xl font-bold font-mono ${totals.totalBlockers > 0 ? 'text-red-600 dark:text-red-400' : ''}`}>{totals.totalBlockers}</p>
                <p className="text-xs text-muted-foreground font-medium">Total Blockers</p>
              </div>
            </div>
          </CardContent>
        </Card>
      </div>

      {/* Daily Breakdown */}
      <Tabs defaultValue="sewing">
        <TabsList>
          <TabsTrigger value="sewing" className="data-[state=active]:text-blue-600 dark:data-[state=active]:text-blue-400">Sewing Output</TabsTrigger>
          <TabsTrigger value="finishing" className="data-[state=active]:text-violet-600 dark:data-[state=active]:text-violet-400">Finishing Output</TabsTrigger>
        </TabsList>

        <TabsContent value="sewing" className="mt-4">
          <Card className="border-border/50">
            <CardHeader>
              <CardTitle className="text-base flex items-center gap-2">
                <div className="h-7 w-7 rounded-lg bg-gradient-to-br from-blue-500 to-indigo-600 shadow-md shadow-blue-500/20 flex items-center justify-center">
                  <SewingMachine className="h-3.5 w-3.5 text-white" />
                </div>
                Daily Sewing Output
              </CardTitle>
            </CardHeader>
            <CardContent>
              <div className="w-full overflow-x-auto">
                <div className="min-w-[600px]">
                  <div className="grid grid-cols-7 gap-4">
                    {weekStats.map((day) => {
                      const isToday = day.date === today;
                      const isFuture = new Date(day.date) > new Date();
                      // 0 sewing submissions = factory closed for sewing
                      const isClosed = !isFuture && day.sewingUpdates === 0;
                      const outputBarHeight = (isFuture || isClosed) ? 0 : Math.max((day.sewingOutput / maxSewing) * 100, day.sewingOutput > 0 ? 15 : 0);
                      const targetBarHeight = (isFuture || isClosed) ? 0 : Math.max((day.sewingTarget / maxSewing) * 100, day.sewingTarget > 0 ? 10 : 0);
                      const achievement = day.sewingTarget > 0 ? Math.round((day.sewingOutput / day.sewingTarget) * 100) : 0;
                      const achievementColor = achievement >= 100 ? 'text-emerald-600 dark:text-emerald-400' : achievement >= 80 ? 'text-amber-600 dark:text-amber-400' : 'text-red-600 dark:text-red-400';

                      return (
                        <div key={day.date} className={`text-center p-3 rounded-xl transition-all ${isClosed ? 'opacity-50' : ''} ${isToday ? 'bg-blue-500/10 ring-2 ring-blue-500/30' : 'bg-muted/30'}`}>
                          <p className={`text-sm font-semibold mb-3 ${isToday ? 'text-blue-600 dark:text-blue-400' : 'text-foreground'}`}>
                            {day.dayName}
                          </p>
                          <div className="h-28 flex items-end justify-center gap-1 mb-3">
                            {!(isFuture || isClosed) && day.sewingTarget > 0 && (
                              <div
                                className="w-5 rounded-t transition-all bg-blue-200 dark:bg-blue-900/40"
                                style={{ height: `${targetBarHeight}%`, minHeight: '8px' }}
                              />
                            )}
                            <div
                              className={`w-7 rounded-t transition-all ${(isFuture || isClosed) ? 'bg-muted h-2' : isToday ? 'bg-blue-500' : 'bg-blue-500/70'}`}
                              style={{ height: (isFuture || isClosed) ? '8px' : `${Math.max(outputBarHeight, 8)}%` }}
                            />
                          </div>
                          <p className={`text-base font-mono font-bold ${(isFuture || isClosed) ? 'text-muted-foreground' : 'text-foreground'}`}>
                            {(isFuture || isClosed) ? '-' : day.sewingOutput.toLocaleString()}
                          </p>
                          {!(isFuture || isClosed) && day.sewingTarget > 0 && (
                            <p className={`text-xs font-medium mt-1 ${achievementColor}`}>
                              {achievement}% of target
                            </p>
                          )}
                          {!(isFuture || isClosed) && day.sewingTarget === 0 && (
                            <p className="text-xs text-muted-foreground mt-1">No target</p>
                          )}
                          {isClosed && (
                            <p className="text-xs text-muted-foreground mt-1">Closed</p>
                          )}
                        </div>
                      );
                    })}
                  </div>
                  <div className="flex items-center justify-center gap-6 mt-6 pt-4 border-t">
                    <div className="flex items-center gap-2">
                      <div className="w-4 h-4 rounded bg-blue-200 dark:bg-blue-900/40" />
                      <span className="text-sm text-muted-foreground">Target</span>
                    </div>
                    <div className="flex items-center gap-2">
                      <div className="w-4 h-4 rounded bg-blue-500/70" />
                      <span className="text-sm text-muted-foreground">Output</span>
                    </div>
                  </div>
                </div>
              </div>
            </CardContent>
          </Card>
        </TabsContent>

        <TabsContent value="finishing" className="mt-4">
          <Card className="border-border/50">
            <CardHeader>
              <CardTitle className="text-base flex items-center gap-2">
                <div className="h-7 w-7 rounded-lg bg-gradient-to-br from-violet-500 to-purple-600 shadow-md shadow-violet-500/20 flex items-center justify-center">
                  <Package className="h-3.5 w-3.5 text-white" />
                </div>
                Daily Finishing Output
              </CardTitle>
            </CardHeader>
            <CardContent>
              <div className="w-full overflow-x-auto">
                <div className="min-w-[600px]">
                  <div className="grid grid-cols-7 gap-4">
                    {weekStats.map((day) => {
                      const isToday = day.date === today;
                      const isFuture = new Date(day.date) > new Date();
                      // 0 finishing submissions = factory closed for finishing
                      const isClosed = !isFuture && day.finishingUpdates === 0;
                      const targetBarHeight = (isFuture || isClosed) ? 0 : Math.max((day.finishingTarget / maxFinishing) * 100, day.finishingTarget > 0 ? 15 : 0);
                      const outputBarHeight = (isFuture || isClosed) ? 0 : Math.max((day.finishingOutput / maxFinishing) * 100, day.finishingOutput > 0 ? 10 : 0);
                      const achievement = day.finishingTarget > 0 ? Math.round((day.finishingOutput / day.finishingTarget) * 100) : 0;

                      return (
                        <div key={day.date} className={`text-center p-3 rounded-xl transition-all ${isClosed ? 'opacity-50' : ''} ${isToday ? 'bg-violet-500/10 ring-2 ring-violet-500/30' : 'bg-muted/30'}`}>
                          <p className={`text-sm font-semibold mb-3 ${isToday ? 'text-violet-600 dark:text-violet-400' : 'text-foreground'}`}>
                            {day.dayName}
                          </p>
                          <div className="h-28 flex items-end justify-center gap-1 mb-3">
                            <div
                              className={`w-5 rounded-t transition-all ${(isFuture || isClosed) ? 'bg-muted h-2' : 'bg-violet-200 dark:bg-violet-900/40'}`}
                              style={{ height: (isFuture || isClosed) ? '8px' : `${Math.max(targetBarHeight, 8)}%` }}
                            />
                            <div
                              className={`w-7 rounded-t transition-all ${(isFuture || isClosed) ? 'bg-muted h-2' : isToday ? 'bg-violet-500' : 'bg-violet-500/70'}`}
                              style={{ height: (isFuture || isClosed) ? '8px' : `${Math.max(outputBarHeight, 8)}%` }}
                            />
                          </div>
                          <div className={`text-xs ${(isFuture || isClosed) ? 'text-muted-foreground' : 'text-foreground'}`}>
                            <p className="font-mono font-bold">{(isFuture || isClosed) ? '-' : day.finishingOutput.toLocaleString()}</p>
                            <p className="text-muted-foreground text-[10px]">{isClosed ? 'Closed' : 'Output'}</p>
                          </div>
                          {!isFuture && day.finishingTarget > 0 && (
                            <p className={`text-xs font-medium mt-1 ${achievement >= 100 ? 'text-emerald-600 dark:text-emerald-400' : achievement >= 80 ? 'text-amber-600 dark:text-amber-400' : 'text-red-600 dark:text-red-400'}`}>
                              {achievement}% of target
                            </p>
                          )}
                        </div>
                      );
                    })}
                  </div>
                  <div className="flex items-center justify-center gap-6 mt-6 pt-4 border-t">
                    <div className="flex items-center gap-2">
                      <div className="w-4 h-4 rounded bg-violet-200 dark:bg-violet-900/40" />
                      <span className="text-sm text-muted-foreground">Target</span>
                    </div>
                    <div className="flex items-center gap-2">
                      <div className="w-4 h-4 rounded bg-violet-500/70" />
                      <span className="text-sm text-muted-foreground">Output</span>
                    </div>
                  </div>
                </div>
              </div>
            </CardContent>
          </Card>
        </TabsContent>
      </Tabs>

      {/* Weekly Financials */}
      {weekFinancials.hasData && (
        <div className="space-y-2">
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-2">
              <div className="h-7 w-7 rounded-lg bg-blue-500/10 flex items-center justify-center">
                <DollarSign className="h-3.5 w-3.5 text-blue-600 dark:text-blue-400" />
              </div>
              <span className="text-sm font-semibold">Weekly Financials</span>
              <span className="text-[10px] text-muted-foreground">(USD)</span>
            </div>
            {weekFinancials.costCurrency === 'BDT' && bdtToUsd && (
              <span className="text-[10px] text-muted-foreground">
                Rate: {(1 / bdtToUsd).toFixed(1)} BDT/USD
              </span>
            )}
          </div>

          <div className="grid grid-cols-3 gap-2 md:gap-3">
            <Card className="relative overflow-hidden border-emerald-200/60 dark:border-emerald-800/40 bg-gradient-to-br from-emerald-50 via-white to-emerald-50/50 dark:from-emerald-950/40 dark:via-card dark:to-emerald-950/20 hover:shadow-lg hover:-translate-y-0.5 transition-all duration-300">
              <CardContent className="p-2.5 md:p-4 relative">
                <p className="text-[10px] md:text-xs font-medium uppercase tracking-wider text-muted-foreground mb-1">Output Value</p>
                <p className="font-mono text-sm md:text-2xl font-bold text-emerald-700 dark:text-emerald-400 tracking-tight truncate">
                  ${weekFinancials.totalRevenue.toLocaleString(undefined, { minimumFractionDigits: 0, maximumFractionDigits: 0 })}
                </p>
                <p className="text-[10px] text-muted-foreground mt-0.5 truncate">Sewing output</p>
              </CardContent>
            </Card>

            <Card className="relative overflow-hidden border-orange-200/60 dark:border-orange-800/40 bg-gradient-to-br from-orange-50 via-white to-orange-50/50 dark:from-orange-950/40 dark:via-card dark:to-orange-950/20 hover:shadow-lg hover:-translate-y-0.5 transition-all duration-300">
              <CardContent className="p-2.5 md:p-4 relative">
                <p className="text-[10px] md:text-xs font-medium uppercase tracking-wider text-muted-foreground mb-1">Operating Cost</p>
                <p className="font-mono text-sm md:text-2xl font-bold text-red-600 dark:text-red-400 tracking-tight truncate">
                  ${weekFinancials.totalCostUsd.toLocaleString(undefined, { minimumFractionDigits: 0, maximumFractionDigits: 0 })}
                </p>
                <p className="text-[10px] text-muted-foreground mt-0.5 truncate">
                  {weekFinancials.costCurrency === 'BDT' && bdtToUsd
                    ? `৳${weekFinancials.totalCostNative.toLocaleString()}`
                    : 'Sewing labor'}
                </p>
              </CardContent>
            </Card>

            <Card className={`relative overflow-hidden hover:shadow-lg hover:-translate-y-0.5 transition-all duration-300 ${weekFinancials.profit >= 0 ? 'border-emerald-200/60 dark:border-emerald-800/40 bg-gradient-to-br from-emerald-50 via-white to-emerald-50/50 dark:from-emerald-950/40 dark:via-card dark:to-emerald-950/20' : 'border-red-200/60 dark:border-red-800/40 bg-gradient-to-br from-red-50 via-white to-red-50/50 dark:from-red-950/40 dark:via-card dark:to-red-950/20'}`}>
              <CardContent className="p-2.5 md:p-4 relative">
                <p className="text-[10px] md:text-xs font-medium uppercase tracking-wider text-muted-foreground mb-1">Operating Margin</p>
                <p className={`font-mono text-sm md:text-2xl font-bold tracking-tight truncate ${weekFinancials.profit >= 0 ? 'text-emerald-700 dark:text-emerald-400' : 'text-red-600 dark:text-red-400'}`}>
                  {weekFinancials.profit >= 0 ? '+' : '-'}${Math.abs(weekFinancials.profit).toLocaleString(undefined, { minimumFractionDigits: 0, maximumFractionDigits: 0 })}
                </p>
                <p className="text-[10px] text-muted-foreground mt-0.5 truncate">
                  {weekFinancials.margin !== 0 ? `${weekFinancials.margin}%` : '—'}
                </p>
              </CardContent>
            </Card>
          </div>

          <button
            onClick={() => setFinancialsExpanded(!financialsExpanded)}
            className="w-full flex items-center justify-center gap-1.5 text-xs text-blue-600 dark:text-blue-400 hover:text-blue-700 dark:hover:text-blue-300 py-1.5 transition-colors"
          >
            <span>{financialsExpanded ? 'Hide details' : 'View breakdown'}</span>
            <ChevronDown className={`h-3.5 w-3.5 transition-transform duration-200 ${financialsExpanded ? 'rotate-180' : ''}`} />
          </button>

          {financialsExpanded && (
            <Card className="border-blue-500/20">
              <CardContent className="p-3 md:p-4 space-y-4">
                <div>
                  <p className="text-[10px] md:text-xs font-medium text-muted-foreground mb-2 uppercase tracking-wider">Daily Breakdown</p>
                  <div className="space-y-1.5 md:hidden">
                    {weekFinancials.dailyFinancials.map((d) => {
                      const isFuture = new Date(d.date) > new Date();
                      if (isFuture) return (
                        <div key={d.date} className="flex items-center justify-between py-1 text-[11px] text-muted-foreground">
                          <span>{d.dayName}</span>
                          <span>—</span>
                        </div>
                      );
                      return (
                        <div key={d.date} className="rounded-lg bg-muted/40 p-2 flex items-center justify-between">
                          <span className="text-[11px] font-medium w-10 shrink-0">{d.dayName.slice(0, 3)}</span>
                          <div className="flex items-center gap-3 text-[11px] font-mono">
                            <span className="text-emerald-700 dark:text-emerald-400">${Math.round(d.revenue).toLocaleString()}</span>
                            <span className="text-red-600 dark:text-red-400">${Math.round(d.costUsd).toLocaleString()}</span>
                            <span className={`font-medium ${d.profit >= 0 ? 'text-emerald-700 dark:text-emerald-400' : 'text-red-600 dark:text-red-400'}`}>
                              {d.profit >= 0 ? '+' : '-'}${Math.abs(Math.round(d.profit)).toLocaleString()}
                            </span>
                          </div>
                        </div>
                      );
                    })}
                  </div>
                  <div className="hidden md:block overflow-x-auto">
                    <table className="w-full text-xs">
                      <thead>
                        <tr className="border-b text-muted-foreground">
                          <th className="text-left py-1.5 font-medium">Day</th>
                          <th className="text-right py-1.5 font-medium">Output Value</th>
                          <th className="text-right py-1.5 font-medium">Operating Cost</th>
                          <th className="text-right py-1.5 font-medium">Operating Margin</th>
                        </tr>
                      </thead>
                      <tbody>
                        {weekFinancials.dailyFinancials.map((d) => {
                          const isFuture = new Date(d.date) > new Date();
                          if (isFuture) return (
                            <tr key={d.date} className="border-b border-muted/50 text-muted-foreground">
                              <td className="py-1.5">{d.dayName}</td>
                              <td className="py-1.5 text-right">—</td>
                              <td className="py-1.5 text-right">—</td>
                              <td className="py-1.5 text-right">—</td>
                            </tr>
                          );
                          return (
                            <tr key={d.date} className="border-b border-muted/50">
                              <td className="py-1.5 font-medium">{d.dayName}</td>
                              <td className="py-1.5 text-right font-mono text-emerald-700 dark:text-emerald-400">
                                ${d.revenue.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
                              </td>
                              <td className="py-1.5 text-right font-mono text-red-600 dark:text-red-400">
                                ${d.costUsd.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
                              </td>
                              <td className={`py-1.5 text-right font-mono font-medium ${d.profit >= 0 ? 'text-emerald-700 dark:text-emerald-400' : 'text-red-600 dark:text-red-400'}`}>
                                {d.profit >= 0 ? '+' : '-'}${Math.abs(d.profit).toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
                              </td>
                            </tr>
                          );
                        })}
                      </tbody>
                    </table>
                  </div>
                </div>
              </CardContent>
            </Card>
          )}
        </div>
      )}

      {/* Daily Details Table */}
      <Card className="border-border/50">
        <CardHeader>
          <CardTitle className="text-base flex items-center gap-2">
            <Calendar className="h-4 w-4 text-muted-foreground" />
            Daily Breakdown
          </CardTitle>
        </CardHeader>
        <CardContent>
          <div className="w-full overflow-x-auto">
            <table className="w-full text-sm min-w-[500px]">
              <thead>
                <tr className="border-b bg-muted/30">
                  <th className="text-left py-2.5 px-3 font-medium whitespace-nowrap rounded-tl-lg">Day</th>
                  <th className="text-right py-2.5 px-3 font-medium whitespace-nowrap text-blue-600 dark:text-blue-400">Sewing</th>
                  <th className="text-right py-2.5 px-3 font-medium whitespace-nowrap text-violet-600 dark:text-violet-400">Finishing</th>
                  <th className="text-right py-2.5 px-3 font-medium whitespace-nowrap">Updates</th>
                  <th className="text-right py-2.5 px-3 font-medium whitespace-nowrap rounded-tr-lg">Blockers</th>
                </tr>
              </thead>
              <tbody>
                {weekStats.map((day) => {
                  const isToday = day.date === today;
                  const isFuture = new Date(day.date) > new Date();
                  return (
                    <tr key={day.date} className={`border-b last:border-b-0 ${isToday ? 'bg-indigo-500/5' : ''} ${isFuture ? 'text-muted-foreground' : ''}`}>
                      <td className="py-3 px-3 whitespace-nowrap">
                        <span className="font-medium">{day.dayName}</span>
                        {isToday && <span className="ml-2 text-xs font-medium text-indigo-600 dark:text-indigo-400">(Today)</span>}
                      </td>
                      <td className="text-right font-mono px-3 whitespace-nowrap">{isFuture ? '-' : day.sewingUpdates === 0 ? '-' : day.sewingOutput.toLocaleString()}</td>
                      <td className="text-right font-mono px-3 whitespace-nowrap">{isFuture ? '-' : day.finishingUpdates === 0 ? '-' : day.finishingOutput.toLocaleString()}</td>
                      <td className="text-right px-3 whitespace-nowrap">{isFuture ? '-' : day.sewingUpdates + day.finishingUpdates}</td>
                      <td className={`text-right px-3 whitespace-nowrap ${day.blockers > 0 ? 'text-red-600 dark:text-red-400 font-medium' : ''}`}>
                        {isFuture ? '-' : day.blockers}
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        </CardContent>
      </Card>
    </div>
  );
}
