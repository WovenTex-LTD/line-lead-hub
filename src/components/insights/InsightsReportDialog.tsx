import { useState, useEffect } from "react";
import { effectivePoly } from "@/lib/finishing-utils";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogTrigger } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { Calendar } from "@/components/ui/calendar";
import { FileDown, Loader2, CalendarIcon } from "lucide-react";
import { useAuth } from "@/contexts/AuthContext";
import { useHeadcountCost } from "@/hooks/useHeadcountCost";
import { supabase } from "@/integrations/supabase/client";
import { getTodayInTimezone } from "@/lib/date-utils";
import { format, subDays } from "date-fns";
import { toast } from "sonner";
import { downloadInsightsPdf, type ExportData } from "./ExportInsights";

export function InsightsReportDialog() {
  const { profile, factory } = useAuth();
  const { headcountCost, isConfigured: costConfigured } = useHeadcountCost();
  const tz = factory?.timezone || "Asia/Dhaka";
  const todayStr = getTodayInTimezone(tz);

  const [open, setOpen] = useState(false);
  const [period, setPeriod] = useState<7 | 14 | 21 | 30>(7);
  const [selectedDate, setSelectedDate] = useState<Date>(new Date(todayStr + "T00:00:00"));
  const [calendarOpen, setCalendarOpen] = useState(false);
  const [generating, setGenerating] = useState(false);
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

  const endDateStr = format(selectedDate, "yyyy-MM-dd");
  const startDateObj = subDays(selectedDate, period);
  const startDateStr = format(startDateObj, "yyyy-MM-dd");

  async function handleExport() {
    if (!profile?.factory_id) return;
    setGenerating(true);

    try {
      // Fetch sewing actuals
      const { data: sewingActuals } = await supabase
        .from("sewing_actuals")
        .select("*, lines(name, line_id), work_orders(po_number, buyer, style, order_qty, cm_per_dozen), blocker_types:blocker_type_id(name)")
        .eq("factory_id", profile.factory_id)
        .gte("production_date", startDateStr)
        .lte("production_date", endDateStr);

      // Fetch sewing targets
      const { data: sewingTargets } = await supabase
        .from("sewing_targets")
        .select("production_date, line_id, per_hour_target, manpower_planned, lines(name, line_id)")
        .eq("factory_id", profile.factory_id)
        .gte("production_date", startDateStr)
        .lte("production_date", endDateStr);

      // Fetch finishing output logs
      const { data: finishingLogs } = await supabase
        .from("finishing_daily_logs")
        .select("*, work_orders(po_number, buyer, style, order_qty, cm_per_dozen)")
        .eq("factory_id", profile.factory_id)
        .eq("log_type", "OUTPUT")
        .gte("production_date", startDateStr)
        .lte("production_date", endDateStr);

      // Fetch cutting actuals
      const { data: cuttingActuals } = await supabase
        .from("cutting_actuals")
        .select("*, work_orders(po_number, buyer, style, cm_per_dozen)")
        .eq("factory_id", profile.factory_id)
        .gte("production_date", startDateStr)
        .lte("production_date", endDateStr);

      // Fetch work orders for progress
      const { data: workOrders } = await supabase
        .from("work_orders")
        .select("*, lines(name)")
        .eq("factory_id", profile.factory_id)
        .eq("is_active", true);

      // Previous period for comparison
      const prevStartStr = format(subDays(startDateObj, period), "yyyy-MM-dd");
      const { data: prevSewing } = await supabase
        .from("sewing_actuals")
        .select("good_today, manpower_actual, hours_actual, ot_manpower_actual, ot_hours_actual, work_orders(cm_per_dozen)")
        .eq("factory_id", profile.factory_id)
        .gte("production_date", prevStartStr)
        .lt("production_date", startDateStr);

      // ── Build daily data ──
      const dailyMap = new Map<string, { sewingOutput: number; sewingTarget: number; finishingQcPass: number; efficiency: number; blockers: number; manpower: number }>();
      const getDay = (date: string) => dailyMap.get(date) || { sewingOutput: 0, sewingTarget: 0, finishingQcPass: 0, efficiency: 0, blockers: 0, manpower: 0 };

      const sewingActualKeys = new Set(sewingActuals?.map(u => `${u.line_id}_${u.production_date}`) || []);

      sewingActuals?.forEach(u => {
        const d = getDay(u.production_date);
        d.sewingOutput += u.good_today || 0;
        d.manpower += u.manpower_actual || 0;
        if (u.has_blocker) d.blockers += 1;
        dailyMap.set(u.production_date, d);
      });

      sewingTargets?.filter(t => sewingActualKeys.has(`${t.line_id}_${t.production_date}`)).forEach(t => {
        const d = getDay(t.production_date);
        d.sewingTarget += (t.per_hour_target || 0) * 8;
        dailyMap.set(t.production_date, d);
      });

      finishingLogs?.forEach(u => {
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
          efficiency: d.sewingTarget > 0 ? Math.round((d.sewingOutput / d.sewingTarget) * 100) : 0,
          blockers: d.blockers,
        }))
        .sort((a, b) => a.date.localeCompare(b.date));

      // ── Build line performance ──
      const lineMap = new Map<string, { lineName: string; totalOutput: number; totalTarget: number; avgManpower: number; submissions: number; blockers: number }>();

      sewingActuals?.forEach(u => {
        const id = u.line_id;
        const name = u.lines?.name || u.lines?.line_id || "Unknown";
        const l = lineMap.get(id) || { lineName: name, totalOutput: 0, totalTarget: 0, avgManpower: 0, submissions: 0, blockers: 0 };
        l.totalOutput += u.good_today || 0;
        l.avgManpower += u.manpower_actual || 0;
        l.submissions += 1;
        if (u.has_blocker) l.blockers += 1;
        lineMap.set(id, l);
      });

      sewingTargets?.filter(t => sewingActualKeys.has(`${t.line_id}_${t.production_date}`)).forEach(t => {
        const id = t.line_id;
        const name = t.lines?.name || t.lines?.line_id || "Unknown";
        const l = lineMap.get(id) || { lineName: name, totalOutput: 0, totalTarget: 0, avgManpower: 0, submissions: 0, blockers: 0 };
        l.totalTarget += (t.per_hour_target || 0) * 8;
        lineMap.set(id, l);
      });

      const linePerformance = Array.from(lineMap.values())
        .map(l => ({
          lineName: l.lineName,
          totalOutput: l.totalOutput,
          totalTarget: l.totalTarget,
          efficiency: l.totalTarget > 0 ? Math.round((l.totalOutput / l.totalTarget) * 100) : 0,
          avgManpower: l.submissions > 0 ? Math.round(l.avgManpower / l.submissions) : 0,
          blockers: l.blockers,
        }))
        .sort((a, b) => b.efficiency - a.efficiency);

      // ── Blocker breakdown ──
      const blockerMap = new Map<string, number>();
      sewingActuals?.filter(u => u.has_blocker).forEach(b => {
        const type = (b as any).blocker_types?.name || "Other";
        blockerMap.set(type, (blockerMap.get(type) || 0) + 1);
      });
      const blockerBreakdown = Array.from(blockerMap.entries())
        .map(([type, count]) => ({ type, count }))
        .sort((a, b) => b.count - a.count);

      // ── Work order progress ──
      const woMap = new Map<string, { poNumber: string; buyer: string; style: string; orderQty: number; totalOutput: number; progress: number }>();
      workOrders?.forEach(wo => {
        woMap.set(wo.id, { poNumber: wo.po_number, buyer: wo.buyer, style: wo.style, orderQty: wo.order_qty, totalOutput: 0, progress: 0 });
      });
      sewingActuals?.forEach(u => {
        if (u.work_order_id && woMap.has(u.work_order_id)) {
          const wo = woMap.get(u.work_order_id)!;
          wo.totalOutput += u.good_today || 0;
          wo.progress = wo.orderQty > 0 ? Math.round((wo.totalOutput / wo.orderQty) * 100) : 0;
        }
      });
      const workOrderProgress = Array.from(woMap.values())
        .filter(wo => wo.totalOutput > 0)
        .sort((a, b) => b.progress - a.progress)
        .slice(0, 10);

      // ── Summary ──
      const totalSewingOutput = sewingActuals?.reduce((s, u) => s + (u.good_today || 0), 0) || 0;
      const totalFinishingQcPass = finishingLogs?.reduce((s, u) => s + effectivePoly(u.poly, u.actual_hours, u.ot_hours_actual) + effectivePoly(u.carton, u.actual_hours, u.ot_hours_actual), 0) || 0;
      const totalManpower = sewingActuals?.reduce((s, u) => s + (u.manpower_actual || 0), 0) || 0;
      const allBlockers = sewingActuals?.filter(u => u.has_blocker) || [];

      // ── Financial calculations ──
      const rate = costConfigured && headcountCost.value ? headcountCost.value : 0;
      const costCurrency = headcountCost.currency;
      const toUsd = (v: number) => costCurrency === "BDT" && bdtToUsd ? v * bdtToUsd : v;

      // Revenue: sewing output × (cm_per_dozen × 0.70 / 12) — production share is 70% of CM
      let totalRevenue = 0;
      const revenueByPoMap: Record<string, { po: string; buyer: string; revenue: number; output: number }> = {};
      sewingActuals?.forEach(u => {
        const cm = (u as any).work_orders?.cm_per_dozen;
        const output = u.good_today || 0;
        if (cm && output) {
          const rev = (cm * 0.70 / 12) * output;
          totalRevenue += rev;
          const po = (u as any).work_orders?.po_number || "Unknown";
          if (!revenueByPoMap[po]) revenueByPoMap[po] = { po, buyer: (u as any).work_orders?.buyer || "", revenue: 0, output: 0 };
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
        sewingActuals?.forEach(s => {
          if (!(s as any).work_orders?.cm_per_dozen) return;
          let c = 0;
          if (s.manpower_actual && s.hours_actual) c += rate * s.manpower_actual * s.hours_actual;
          if (s.ot_manpower_actual && s.ot_hours_actual) c += rate * s.ot_manpower_actual * s.ot_hours_actual;
          sewCost += c;
          if (c > 0) addCost((s as any).work_orders?.po_number || "Unknown", c);
        });
      }

      const totalCostUsd = toUsd(sewCost);
      const profit = totalRevenue - totalCostUsd;
      const margin = totalRevenue > 0 ? (profit / totalRevenue) * 100 : 0;


      // Profit by PO
      const allPos = new Set([...Object.keys(revenueByPoMap), ...Object.keys(costByPoMap)]);
      const profitByPo = Array.from(allPos).map(po => {
        const rev = revenueByPoMap[po]?.revenue || 0;
        const cn = costByPoMap[po]?.sewing || 0;
        const cu = toUsd(cn);
        const p = rev - cu;
        return { po, buyer: revenueByPoMap[po]?.buyer || "", revenue: Math.round(rev * 100) / 100, cost: Math.round(cu * 100) / 100, profit: Math.round(p * 100) / 100, margin: rev > 0 ? Math.round((p / rev) * 1000) / 10 : 0 };
      }).filter(p => p.revenue > 0 || p.cost > 0).sort((a, b) => b.profit - a.profit);

      // Daily financials — revenue from sewing output
      const dailyRevMap: Record<string, number> = {};
      const dailyCostMap: Record<string, number> = {};
      sewingActuals?.forEach(u => {
        const cm = (u as any).work_orders?.cm_per_dozen;
        const output = u.good_today || 0;
        if (cm && output) dailyRevMap[u.production_date] = (dailyRevMap[u.production_date] || 0) + (cm * 0.70 / 12) * output;
      });
      if (rate > 0) {
        sewingActuals?.forEach(s => {
          if (!(s as any).work_orders?.cm_per_dozen) return;
          let c = 0;
          if (s.manpower_actual && s.hours_actual) c += rate * s.manpower_actual * s.hours_actual;
          if (s.ot_manpower_actual && s.ot_hours_actual) c += rate * s.ot_manpower_actual * s.ot_hours_actual;
          dailyCostMap[s.production_date] = (dailyCostMap[s.production_date] || 0) + c;
        });
      }

      const allFinDates = new Set([...Object.keys(dailyRevMap), ...Object.keys(dailyCostMap)]);
      const dailyFinancials = Array.from(allFinDates).sort().map(date => {
        const r = dailyRevMap[date] || 0;
        const c = toUsd(dailyCostMap[date] || 0);
        return { date, displayDate: new Date(date + "T00:00:00").toLocaleDateString("en-US", { month: "short", day: "numeric" }), revenue: Math.round(r * 100) / 100, cost: Math.round(c * 100) / 100, profit: Math.round((r - c) * 100) / 100 };
      });

      // Previous period financials — sewing only
      let prevRevenue = 0;
      let prevCostNative = 0;
      prevSewing?.forEach(s => {
        const cm = (s as any).work_orders?.cm_per_dozen;
        const output = s.good_today || 0;
        if (cm && output) prevRevenue += (cm * 0.70 / 12) * output;
        if (rate > 0) {
          if (s.manpower_actual && s.hours_actual) prevCostNative += rate * s.manpower_actual * s.hours_actual;
          if (s.ot_manpower_actual && s.ot_hours_actual) prevCostNative += rate * s.ot_manpower_actual * s.ot_hours_actual;
        }
      });
      const prevCostUsd = toUsd(prevCostNative);
      const prevProfit = prevRevenue - prevCostUsd;
      const prevMargin = prevRevenue > 0 ? (prevProfit / prevRevenue) * 100 : 0;

      const hasFinancialData = totalRevenue > 0 || sewCost > 0;

      // ── Build export data ──
      const exportData: ExportData = {
        summary: {
          totalSewingOutput,
          totalFinishingQcPass,
          avgEfficiency: linePerformance.length > 0 ? Math.round(linePerformance.reduce((s, l) => s + l.efficiency, 0) / linePerformance.length) : 0,
          totalBlockers: allBlockers.length,
          openBlockers: allBlockers.filter(b => (b as any).blocker_status !== "resolved").length,
          resolvedBlockers: allBlockers.filter(b => (b as any).blocker_status === "resolved").length,
          avgManpower: sewingActuals && sewingActuals.length > 0 ? Math.round(totalManpower / sewingActuals.length) : 0,
          daysWithData: dailyData.length,
          topPerformingLine: linePerformance[0]?.lineName || null,
          worstPerformingLine: linePerformance.length > 1 ? linePerformance[linePerformance.length - 1]?.lineName : null,
        },
        linePerformance,
        dailyData,
        blockerBreakdown,
        workOrderProgress,
        financials: hasFinancialData ? {
          totalRevenue: Math.round(totalRevenue * 100) / 100,
          totalCost: Math.round(totalCostUsd * 100) / 100,
          profit: Math.round(profit * 100) / 100,
          margin: Math.round(margin * 10) / 10,
          sewingCost: Math.round(toUsd(sewCost) * 100) / 100,
          cuttingCost: 0,
          finishingCost: 0,
          revenuePerPiece: totalSewingOutput > 0 ? Math.round((totalRevenue / totalSewingOutput) * 100) / 100 : 0,
          costPerPiece: totalSewingOutput > 0 ? Math.round((totalCostUsd / totalSewingOutput) * 100) / 100 : 0,
          profitByPo,
          dailyFinancials,
          prevRevenue: Math.round(prevRevenue * 100) / 100,
          prevProfit: Math.round(prevProfit * 100) / 100,
          prevMargin: Math.round(prevMargin * 10) / 10,
          hasData: true,
        } : undefined,
        periodDays: period,
        startDate: startDateStr,
        endDate: endDateStr,
        exportDate: format(new Date(), "PPpp"),
        factoryName: factory?.name || "Factory",
      };

      await downloadInsightsPdf(exportData);
      toast.success(`${period}-day insights PDF exported`);
      setOpen(false);
    } catch (error) {
      console.error("Export error:", error);
      toast.error("Failed to export report");
    } finally {
      setGenerating(false);
    }
  }

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger asChild>
        <Button variant="outline" size="sm">
          <FileDown className="h-4 w-4 mr-2" />
          Insight Report
        </Button>
      </DialogTrigger>
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle>Export Insights Report</DialogTitle>
        </DialogHeader>

        <div className="space-y-4 pt-2">
          {/* Period selector */}
          <div className="space-y-2">
            <label className="text-sm font-medium">Period</label>
            <div className="grid grid-cols-4 gap-2">
              {([7, 14, 21, 30] as const).map(p => (
                <Button
                  key={p}
                  variant={period === p ? "default" : "outline"}
                  size="sm"
                  onClick={() => setPeriod(p)}
                >
                  {p} days
                </Button>
              ))}
            </div>
          </div>

          {/* Date picker */}
          <div className="space-y-2">
            <label className="text-sm font-medium">End Date</label>
            <Popover open={calendarOpen} onOpenChange={setCalendarOpen}>
              <PopoverTrigger asChild>
                <Button variant="outline" className="w-full justify-start text-left font-normal">
                  <CalendarIcon className="mr-2 h-4 w-4" />
                  {format(selectedDate, "MMM d, yyyy")}
                  <span className="ml-auto text-xs text-muted-foreground">
                    from {format(startDateObj, "MMM d")}
                  </span>
                </Button>
              </PopoverTrigger>
              <PopoverContent className="w-auto p-0" align="start">
                <Calendar
                  mode="single"
                  selected={selectedDate}
                  onSelect={(d) => { if (d) { setSelectedDate(d); setCalendarOpen(false); } }}
                  initialFocus
                />
              </PopoverContent>
            </Popover>
          </div>

          {/* Export button */}
          <Button className="w-full" onClick={handleExport} disabled={generating}>
            {generating ? (
              <>
                <Loader2 className="h-4 w-4 mr-2 animate-spin" />
                Generating...
              </>
            ) : (
              <>
                <FileDown className="h-4 w-4 mr-2" />
                Download PDF
              </>
            )}
          </Button>
        </div>
      </DialogContent>
    </Dialog>
  );
}
