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
          });
          continue;
        }

        const [sewingRes, finishingRes, sewingTargetsRes, cuttingTargetsRes, cuttingActualsRes] = await Promise.all([
          supabase
            .from('sewing_actuals')
            .select('line_id, good_today, has_blocker, manpower_actual, hours_actual, ot_manpower_actual, ot_hours_actual, work_orders(cm_per_dozen)')
            .eq('factory_id', profile.factory_id)
            .eq('production_date', dateStr),
          supabase
            .from('finishing_daily_logs')
            .select('log_type, poly, carton, planned_hours, work_order_id, m_power_actual, actual_hours, ot_manpower_actual, ot_hours_actual, work_orders(cm_per_dozen)')
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
            .select('day_cutting, leftover_recorded, leftover_quantity, leftover_unit, man_power, hours_actual, ot_manpower_actual, ot_hours_actual, work_orders(cm_per_dozen)')
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
    let totalCuttingCost = 0;
    let totalFinishingCost = 0;

    const dailyFinancials = weekStats.map(day => {
      totalRevenue += day.revenue;
      totalSewingCost += day.sewingCostNative;
      totalCuttingCost += day.cuttingCostNative;
      totalFinishingCost += day.finishingCostNative;
      const dayCostNative = day.sewingCostNative + day.cuttingCostNative + day.finishingCostNative;
      const dayCostUsd = isBDT && bdtToUsd ? dayCostNative * bdtToUsd : dayCostNative;
      return {
        ...day,
        costNative: Math.round(dayCostNative * 100) / 100,
        costUsd: Math.round(dayCostUsd * 100) / 100,
        profit: Math.round((day.revenue - dayCostUsd) * 100) / 100,
      };
    });

    const totalCostNative = totalSewingCost + totalCuttingCost + totalFinishingCost;
    const toUsd = (v: number) => isBDT && bdtToUsd ? v * bdtToUsd : v;
    const totalCostUsd = toUsd(totalCostNative);
    const profit = totalRevenue - totalCostUsd;
    const margin = totalRevenue > 0 ? (profit / totalRevenue) * 100 : 0;
    const hasData = totalRevenue > 0 || totalCostNative > 0;

    return {
      totalRevenue: Math.round(totalRevenue * 100) / 100,
      totalCostNative: Math.round(totalCostNative * 100) / 100,
      totalCostUsd: Math.round(totalCostUsd * 100) / 100,
      sewingCostUsd: Math.round(toUsd(totalSewingCost) * 100) / 100,
      cuttingCostUsd: Math.round(toUsd(totalCuttingCost) * 100) / 100,
      finishingCostUsd: Math.round(toUsd(totalFinishingCost) * 100) / 100,
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
  const handleDownloadPdf = () => {
    const doc = new jsPDF({ orientation: "landscape" });
    const pw = doc.internal.pageSize.getWidth();
    const ph = doc.internal.pageSize.getHeight();
    const margin = 12;
    let y = margin;
    const isBDT = weekFinancials.costCurrency === 'BDT';
    const fmtUsd = (v: number) => `$${v.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
    const fmtNum = (v: number) => v.toLocaleString();

    const addPage = () => { doc.addPage(); y = margin; };
    const checkPage = (need: number) => { if (y + need > ph - margin) addPage(); };

    // Header
    doc.setFont("helvetica", "bold");
    doc.setFontSize(16);
    doc.text(`${factory?.name || "Factory"} — Weekly Production Report`, margin, y);
    y += 7;
    doc.setFontSize(10);
    doc.setFont("helvetica", "normal");
    doc.text(`Period: ${getWeekRange()} | Generated: ${format(new Date(), "PPpp")}`, margin, y);
    y += 10;

    // ── Production Summary Table ──
    doc.setFont("helvetica", "bold");
    doc.setFontSize(12);
    doc.text("PRODUCTION SUMMARY", margin, y);
    y += 7;

    const prodHeaders = ["Day", "Sewing Out", "Sewing Tgt", "Finish Out", "Finish Tgt", "Cutting", "Blockers"];
    const prodRows = weekStats.map(d => [
      `${d.dayName} ${d.date.slice(5)}`,
      fmtNum(d.sewingOutput), fmtNum(d.sewingTarget),
      fmtNum(d.finishingOutput), fmtNum(d.finishingTarget),
      fmtNum(d.cuttingActual), String(d.blockers),
    ]);
    prodRows.push([
      "TOTAL",
      fmtNum(totals.sewingOutput), "",
      fmtNum(totals.finishingOutput), fmtNum(totals.finishingTarget),
      fmtNum(totals.cuttingActual), String(totals.totalBlockers),
    ]);

    const drawTable = (headers: string[], rows: string[][], colWidths: number[], boldLast = false) => {
      const rh = 7;
      const totalW = colWidths.reduce((a, b) => a + b, 0);

      // Header
      doc.setFillColor(220, 220, 220);
      doc.rect(margin, y, totalW, rh, 'F');
      doc.setFont("helvetica", "bold");
      doc.setFontSize(8);
      let cx = margin;
      headers.forEach((h, i) => {
        doc.rect(cx, y, colWidths[i], rh);
        doc.text(h, cx + 2, y + 5);
        cx += colWidths[i];
      });
      y += rh;

      // Rows
      doc.setFont("helvetica", "normal");
      rows.forEach((row, ri) => {
        checkPage(rh);
        if (boldLast && ri === rows.length - 1) {
          doc.setFillColor(240, 240, 240);
          doc.rect(margin, y, totalW, rh, 'F');
          doc.setFont("helvetica", "bold");
        }
        cx = margin;
        row.forEach((cell, ci) => {
          doc.rect(cx, y, colWidths[ci], rh);
          doc.text(cell, cx + 2, y + 5);
          cx += colWidths[ci];
        });
        if (boldLast && ri === rows.length - 1) doc.setFont("helvetica", "normal");
        y += rh;
      });
    };

    const prodColW = [32, 32, 32, 32, 32, 32, 25];
    drawTable(prodHeaders, prodRows, prodColW, true);
    y += 8;

    // ── Financial Summary ──
    if (weekFinancials.hasData) {
      checkPage(60);
      doc.setFont("helvetica", "bold");
      doc.setFontSize(12);
      doc.text("WEEKLY FINANCIALS (USD)", margin, y);
      y += 7;

      const finHeaders = ["Day", "Revenue ($)", "Sewing Cost", "Cutting Cost", "Finishing Cost", "Total Cost ($)", "Profit ($)"];
      const finColW = [32, 35, 35, 35, 35, 35, 35];
      const finRows = weekFinancials.dailyFinancials.map(d => {
        const isFuture = new Date(d.date) > new Date();
        if (isFuture) return [`${d.dayName} ${d.date.slice(5)}`, "-", "-", "-", "-", "-", "-"];
        const toUsd = (v: number) => isBDT && bdtToUsd ? v * bdtToUsd : v;
        return [
          `${d.dayName} ${d.date.slice(5)}`,
          fmtUsd(d.revenue),
          fmtUsd(Math.round(toUsd(d.sewingCostNative) * 100) / 100),
          fmtUsd(Math.round(toUsd(d.cuttingCostNative) * 100) / 100),
          fmtUsd(Math.round(toUsd(d.finishingCostNative) * 100) / 100),
          fmtUsd(d.costUsd),
          `${d.profit >= 0 ? '+' : '-'}${fmtUsd(Math.abs(d.profit))}`,
        ];
      });
      finRows.push([
        "TOTAL",
        fmtUsd(weekFinancials.totalRevenue),
        fmtUsd(weekFinancials.sewingCostUsd),
        fmtUsd(weekFinancials.cuttingCostUsd),
        fmtUsd(weekFinancials.finishingCostUsd),
        fmtUsd(weekFinancials.totalCostUsd),
        `${weekFinancials.profit >= 0 ? '+' : '-'}${fmtUsd(Math.abs(weekFinancials.profit))}`,
      ]);

      drawTable(finHeaders, finRows, finColW, true);
      y += 5;

      doc.setFontSize(9);
      doc.setFont("helvetica", "normal");
      const summaryLine = `Revenue: ${fmtUsd(weekFinancials.totalRevenue)} | Cost: ${fmtUsd(weekFinancials.totalCostUsd)} | Profit: ${weekFinancials.profit >= 0 ? '+' : '-'}${fmtUsd(Math.abs(weekFinancials.profit))} | Margin: ${weekFinancials.margin}%`;
      doc.text(summaryLine, margin, y);
      if (isBDT && bdtToUsd) {
        y += 5;
        doc.text(`Cost in BDT: Tk${weekFinancials.totalCostNative.toLocaleString()} | Rate: ${(1 / bdtToUsd).toFixed(1)} BDT/USD`, margin, y);
      }
    }

    // Page footers
    const totalPages = doc.getNumberOfPages();
    for (let p = 1; p <= totalPages; p++) {
      doc.setPage(p);
      doc.setFontSize(8);
      doc.setFont("helvetica", "normal");
      doc.text(`Page ${p} of ${totalPages}`, pw - margin - 25, ph - 5);
      doc.text(factory?.name || "", margin, ph - 5);
    }

    const weekLabel = getWeekRange().replace(/\s/g, '_');
    doc.save(`weekly_report_${weekLabel}.pdf`);
  };

  return (
    <div className="py-4 lg:py-6 space-y-6">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-3">
          <div className="h-10 w-10 rounded-xl bg-indigo-500/10 flex items-center justify-center shrink-0">
            <Calendar className="h-5 w-5 text-indigo-600 dark:text-indigo-400" />
          </div>
          <div>
            <h1 className="text-2xl font-bold">
              {isCurrentWeek ? 'This Week' : weekOffset === -1 ? 'Last Week' : `${Math.abs(weekOffset)} Weeks Ago`}
            </h1>
            <p className="text-sm text-muted-foreground">{getWeekRange()}</p>
          </div>
        </div>
        <div className="flex items-center gap-2">
          <Button variant="outline" size="sm" onClick={handleDownloadPdf} disabled={loading || weekStats.length === 0}>
            <FileDown className="h-4 w-4 mr-1.5" />
            PDF
          </Button>
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
        <Card className="relative overflow-hidden border-border/50">
          <CardContent className="p-4">
            <div className="flex items-center gap-3">
              <div className="h-10 w-10 rounded-lg bg-blue-500/10 flex items-center justify-center shrink-0">
                <SewingMachine className="h-5 w-5 text-blue-600 dark:text-blue-400" />
              </div>
              <div>
                <p className="text-2xl font-bold font-mono text-blue-600 dark:text-blue-400">{totals.sewingOutput.toLocaleString()}</p>
                <p className="text-xs text-muted-foreground font-medium">Sewing Output</p>
              </div>
            </div>
          </CardContent>
        </Card>
        <Card className="relative overflow-hidden border-border/50">
          <CardContent className="p-4">
            <div className="flex items-center gap-3">
              <div className="h-10 w-10 rounded-lg bg-violet-500/10 flex items-center justify-center shrink-0">
                <Package className="h-5 w-5 text-violet-600 dark:text-violet-400" />
              </div>
              <div>
                <p className="text-2xl font-bold font-mono text-violet-600 dark:text-violet-400">{totals.finishingOutput.toLocaleString()}</p>
                <p className="text-xs text-muted-foreground font-medium">Finishing Output</p>
              </div>
            </div>
          </CardContent>
        </Card>
        <Card className="relative overflow-hidden border-border/50">
          <CardContent className="p-4">
            <div className="flex items-center gap-3">
              <div className="h-10 w-10 rounded-lg bg-amber-500/10 flex items-center justify-center shrink-0">
                <Scissors className="h-5 w-5 text-amber-600 dark:text-amber-400" />
              </div>
              <div>
                <p className="text-2xl font-bold font-mono text-amber-600 dark:text-amber-400">{totals.leftoverYards.toLocaleString()} <span className="text-sm font-normal text-muted-foreground">yards</span></p>
                <p className="text-xs text-muted-foreground font-medium">Left Over Fabric</p>
              </div>
            </div>
          </CardContent>
        </Card>
        <Card className={`relative overflow-hidden border-border/50 ${totals.totalBlockers > 0 ? 'border-red-500/30' : ''}`}>
          <CardContent className="p-4">
            <div className="flex items-center gap-3">
              <div className={`h-10 w-10 rounded-lg flex items-center justify-center shrink-0 ${totals.totalBlockers > 0 ? 'bg-red-500/10' : 'bg-muted/50'}`}>
                <AlertTriangle className={`h-5 w-5 ${totals.totalBlockers > 0 ? 'text-red-600 dark:text-red-400' : 'text-muted-foreground'}`} />
              </div>
              <div>
                <p className={`text-2xl font-bold font-mono ${totals.totalBlockers > 0 ? 'text-red-600 dark:text-red-400' : ''}`}>{totals.totalBlockers}</p>
                <p className="text-xs text-muted-foreground font-medium">Total Blockers</p>
              </div>
            </div>
          </CardContent>
        </Card>
      </div>

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

          {/* Revenue / Cost / Profit cards */}
          <div className="grid grid-cols-3 gap-3">
            <Card className="relative overflow-hidden border-emerald-500/20">
              <div className="absolute inset-0 bg-gradient-to-br from-emerald-500/5 to-emerald-500/0" />
              <CardContent className="p-4 relative">
                <p className="text-[10px] md:text-xs font-medium uppercase tracking-wider text-muted-foreground mb-1">Revenue</p>
                <p className="font-mono text-xl md:text-2xl font-bold text-emerald-700 dark:text-emerald-400 tracking-tight">
                  ${weekFinancials.totalRevenue.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
                </p>
                <p className="text-[10px] text-muted-foreground mt-0.5">Finishing output</p>
              </CardContent>
            </Card>

            <Card className="relative overflow-hidden border-red-500/20">
              <div className="absolute inset-0 bg-gradient-to-br from-red-500/5 to-red-500/0" />
              <CardContent className="p-4 relative">
                <p className="text-[10px] md:text-xs font-medium uppercase tracking-wider text-muted-foreground mb-1">Cost</p>
                <p className="font-mono text-xl md:text-2xl font-bold text-red-600 dark:text-red-400 tracking-tight">
                  ${weekFinancials.totalCostUsd.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
                </p>
                <p className="text-[10px] text-muted-foreground mt-0.5">
                  {weekFinancials.costCurrency === 'BDT' && bdtToUsd
                    ? `৳${weekFinancials.totalCostNative.toLocaleString()}`
                    : 'All departments'}
                </p>
              </CardContent>
            </Card>

            <Card className={`relative overflow-hidden ${weekFinancials.profit >= 0 ? 'border-emerald-500/20' : 'border-red-500/20'}`}>
              <div className={`absolute inset-0 bg-gradient-to-br ${weekFinancials.profit >= 0 ? 'from-emerald-500/5 to-emerald-500/0' : 'from-red-500/5 to-red-500/0'}`} />
              <CardContent className="p-4 relative">
                <p className="text-[10px] md:text-xs font-medium uppercase tracking-wider text-muted-foreground mb-1">Profit</p>
                <p className={`font-mono text-xl md:text-2xl font-bold tracking-tight ${weekFinancials.profit >= 0 ? 'text-emerald-700 dark:text-emerald-400' : 'text-red-600 dark:text-red-400'}`}>
                  {weekFinancials.profit >= 0 ? '+' : '-'}${Math.abs(weekFinancials.profit).toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
                </p>
                <p className="text-[10px] text-muted-foreground mt-0.5">
                  {weekFinancials.margin !== 0 ? `${weekFinancials.margin}% margin` : '—'}
                </p>
              </CardContent>
            </Card>
          </div>

          {/* Expandable details */}
          <button
            onClick={() => setFinancialsExpanded(!financialsExpanded)}
            className="w-full flex items-center justify-center gap-1.5 text-xs text-blue-600 dark:text-blue-400 hover:text-blue-700 dark:hover:text-blue-300 py-1.5 transition-colors"
          >
            <span>{financialsExpanded ? 'Hide details' : 'View breakdown'}</span>
            <ChevronDown className={`h-3.5 w-3.5 transition-transform duration-200 ${financialsExpanded ? 'rotate-180' : ''}`} />
          </button>

          {financialsExpanded && (
            <Card className="border-blue-500/20">
              <CardContent className="p-4 space-y-4">
                {/* Cost breakdown by department */}
                {weekFinancials.totalCostUsd > 0 && (
                  <div>
                    <p className="text-xs font-medium text-muted-foreground mb-2.5 uppercase tracking-wider">Cost Breakdown</p>
                    <div className="space-y-2">
                      {[
                        { label: 'Sewing', value: weekFinancials.sewingCostUsd, color: 'bg-blue-500' },
                        { label: 'Cutting', value: weekFinancials.cuttingCostUsd, color: 'bg-emerald-500' },
                        { label: 'Finishing', value: weekFinancials.finishingCostUsd, color: 'bg-violet-500' },
                      ].filter(d => d.value > 0).map((dept) => (
                        <div key={dept.label} className="flex items-center gap-3">
                          <span className="text-xs text-muted-foreground w-16">{dept.label}</span>
                          <div className="flex-1 h-2.5 rounded-full bg-muted overflow-hidden">
                            <div
                              className={`h-full rounded-full ${dept.color}`}
                              style={{ width: `${Math.min((dept.value / weekFinancials.totalCostUsd) * 100, 100)}%` }}
                            />
                          </div>
                          <span className="font-mono text-xs font-medium w-20 text-right">
                            ${dept.value.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
                          </span>
                        </div>
                      ))}
                    </div>
                  </div>
                )}

                {/* Daily financials table */}
                <div>
                  <p className="text-xs font-medium text-muted-foreground mb-2.5 uppercase tracking-wider">Daily Breakdown</p>
                  <div className="overflow-x-auto">
                    <table className="w-full text-xs">
                      <thead>
                        <tr className="border-b text-muted-foreground">
                          <th className="text-left py-1.5 font-medium">Day</th>
                          <th className="text-right py-1.5 font-medium">Revenue</th>
                          <th className="text-right py-1.5 font-medium">Cost</th>
                          <th className="text-right py-1.5 font-medium">Profit</th>
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
                <SewingMachine className="h-4 w-4 text-blue-600 dark:text-blue-400" />
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
                      const outputBarHeight = isFuture ? 0 : Math.max((day.sewingOutput / maxSewing) * 100, day.sewingOutput > 0 ? 15 : 0);
                      const targetBarHeight = isFuture ? 0 : Math.max((day.sewingTarget / maxSewing) * 100, day.sewingTarget > 0 ? 10 : 0);
                      const achievement = day.sewingTarget > 0 ? Math.round((day.sewingOutput / day.sewingTarget) * 100) : 0;
                      const achievementColor = achievement >= 100 ? 'text-emerald-600 dark:text-emerald-400' : achievement >= 80 ? 'text-amber-600 dark:text-amber-400' : 'text-red-600 dark:text-red-400';

                      return (
                        <div key={day.date} className={`text-center p-3 rounded-xl transition-all ${isToday ? 'bg-blue-500/10 ring-2 ring-blue-500/30' : 'bg-muted/30'}`}>
                          <p className={`text-sm font-semibold mb-3 ${isToday ? 'text-blue-600 dark:text-blue-400' : 'text-foreground'}`}>
                            {day.dayName}
                          </p>
                          <div className="h-28 flex items-end justify-center gap-1 mb-3">
                            {!isFuture && day.sewingTarget > 0 && (
                              <div
                                className="w-5 rounded-t transition-all bg-blue-200 dark:bg-blue-900/40"
                                style={{ height: `${targetBarHeight}%`, minHeight: '8px' }}
                              />
                            )}
                            <div
                              className={`w-7 rounded-t transition-all ${isFuture ? 'bg-muted h-2' : isToday ? 'bg-blue-500' : 'bg-blue-500/70'}`}
                              style={{ height: isFuture ? '8px' : `${Math.max(outputBarHeight, 8)}%` }}
                            />
                          </div>
                          <p className={`text-base font-mono font-bold ${isFuture ? 'text-muted-foreground' : 'text-foreground'}`}>
                            {isFuture ? '-' : day.sewingOutput.toLocaleString()}
                          </p>
                          {!isFuture && day.sewingTarget > 0 && (
                            <p className={`text-xs font-medium mt-1 ${achievementColor}`}>
                              {achievement}% of target
                            </p>
                          )}
                          {!isFuture && day.sewingTarget === 0 && (
                            <p className="text-xs text-muted-foreground mt-1">No target</p>
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
                <Package className="h-4 w-4 text-violet-600 dark:text-violet-400" />
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
                      const targetBarHeight = isFuture ? 0 : Math.max((day.finishingTarget / maxFinishing) * 100, day.finishingTarget > 0 ? 15 : 0);
                      const outputBarHeight = isFuture ? 0 : Math.max((day.finishingOutput / maxFinishing) * 100, day.finishingOutput > 0 ? 10 : 0);
                      const achievement = day.finishingTarget > 0 ? Math.round((day.finishingOutput / day.finishingTarget) * 100) : 0;
                      
                      return (
                        <div key={day.date} className={`text-center p-3 rounded-xl transition-all ${isToday ? 'bg-violet-500/10 ring-2 ring-violet-500/30' : 'bg-muted/30'}`}>
                          <p className={`text-sm font-semibold mb-3 ${isToday ? 'text-violet-600 dark:text-violet-400' : 'text-foreground'}`}>
                            {day.dayName}
                          </p>
                          <div className="h-28 flex items-end justify-center gap-1 mb-3">
                            <div
                              className={`w-5 rounded-t transition-all ${isFuture ? 'bg-muted h-2' : 'bg-violet-200 dark:bg-violet-900/40'}`}
                              style={{ height: isFuture ? '8px' : `${Math.max(targetBarHeight, 8)}%` }}
                            />
                            <div
                              className={`w-7 rounded-t transition-all ${isFuture ? 'bg-muted h-2' : isToday ? 'bg-violet-500' : 'bg-violet-500/70'}`}
                              style={{ height: isFuture ? '8px' : `${Math.max(outputBarHeight, 8)}%` }}
                            />
                          </div>
                          <div className={`text-xs ${isFuture ? 'text-muted-foreground' : 'text-foreground'}`}>
                            <p className="font-mono font-bold">{isFuture ? '-' : day.finishingOutput.toLocaleString()}</p>
                            <p className="text-muted-foreground text-[10px]">Output</p>
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
                      <td className="text-right font-mono px-3 whitespace-nowrap">{isFuture ? '-' : day.sewingOutput.toLocaleString()}</td>
                      <td className="text-right font-mono px-3 whitespace-nowrap">{isFuture ? '-' : day.finishingOutput.toLocaleString()}</td>
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
