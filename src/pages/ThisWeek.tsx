import { useState, useEffect } from "react";
import { Link } from "react-router-dom";
import { useAuth } from "@/contexts/AuthContext";
import { getTodayInTimezone } from "@/lib/date-utils";
import { supabase } from "@/integrations/supabase/client";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { format } from "date-fns";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Button } from "@/components/ui/button";
import { Loader2, Calendar, TrendingUp, TrendingDown, Minus, Package, ChevronLeft, ChevronRight, Scissors, AlertTriangle, DollarSign } from "lucide-react";
import { SewingMachine } from "@/components/icons/SewingMachine";
import { ReportExportDialog } from "@/components/ReportExportDialog";
import { useHeadcountCost } from "@/hooks/useHeadcountCost";
import { calcSewingFinancials, SewingFinancials } from "@/lib/sewing-financials";

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
}

export default function ThisWeek() {
  const { profile, factory } = useAuth();
  const [loading, setLoading] = useState(true);
  const [weekOffset, setWeekOffset] = useState(0); // 0 = current week, -1 = last week, etc.
  const [weekStats, setWeekStats] = useState<DailyStats[]>([]);
  const [weekSewingActuals, setWeekSewingActuals] = useState<any[]>([]);
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
  const { headcountCost, isConfigured: costConfigured } = useHeadcountCost();
  const [bdtToUsd, setBdtToUsd] = useState<number | null>(null);

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
      const weekEnd = new Date(weekStart);
      weekEnd.setDate(weekStart.getDate() + 6);
      const weekStartStr = format(weekStart, "yyyy-MM-dd");
      const weekEndStr = format(weekEnd, "yyyy-MM-dd");

      // Fetch all sewing actuals for the week (with CM) in one query for financials
      const { data: weekSewingData } = await supabase
        .from('sewing_actuals')
        .select('good_today, manpower_actual, hours_actual, ot_manpower_actual, ot_hours_actual, work_orders(po_number, buyer, style, cm_per_dozen)')
        .eq('factory_id', profile.factory_id)
        .gte('production_date', weekStartStr)
        .lte('production_date', weekEndStr);
      setWeekSewingActuals(weekSewingData || []);

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
          });
          continue;
        }

        const [sewingRes, finishingRes, sewingTargetsRes, cuttingTargetsRes, cuttingActualsRes] = await Promise.all([
          supabase
            .from('sewing_actuals')
            .select('line_id, good_today, has_blocker')
            .eq('factory_id', profile.factory_id)
            .eq('production_date', dateStr),
          supabase
            .from('finishing_daily_logs')
            .select('log_type, poly, carton, planned_hours, work_order_id')
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
            .select('day_cutting, leftover_recorded, leftover_quantity, leftover_unit')
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

      {/* Weekly Financial Summary */}
      {(() => {
        if (weekSewingActuals.length === 0) return null;
        const fin: SewingFinancials = calcSewingFinancials(
          weekSewingActuals,
          headcountCost.value ?? 0,
          headcountCost.currency,
          bdtToUsd,
        );
        return (
          <Card className="relative overflow-hidden border-border/50">
            <div className="absolute top-0 left-0 right-0 h-1 bg-gradient-to-r from-blue-500 to-indigo-600" />
            <CardHeader className="pt-5 pb-3">
              <div className="flex items-center justify-between">
                <div className="flex items-center gap-2.5">
                  <div className="h-8 w-8 rounded-lg bg-blue-100 dark:bg-blue-950/50 flex items-center justify-center shrink-0">
                    <DollarSign className="h-4 w-4 text-blue-600 dark:text-blue-400" />
                  </div>
                  <CardTitle className="text-base">Weekly Sewing Financials</CardTitle>
                </div>
                <Link to="/finances" className="text-xs text-blue-600 dark:text-blue-400 hover:underline shrink-0">
                  Full Report →
                </Link>
              </div>
            </CardHeader>
            <CardContent className="pt-0 space-y-4">
              {!fin.hasData && (
                <p className="text-xs text-amber-600 dark:text-amber-400 bg-amber-50 dark:bg-amber-950/20 rounded-lg px-3 py-2">
                  CM rates not yet set on work orders — output value cannot be calculated.
                </p>
              )}
              {/* Metric tiles */}
              <div className="grid grid-cols-3 gap-3">
                <div className="rounded-xl bg-emerald-50 dark:bg-emerald-950/20 p-3 border border-emerald-100 dark:border-emerald-900/30">
                  <p className="text-[10px] font-bold uppercase tracking-[0.12em] text-muted-foreground/60 mb-1">Output Value</p>
                  <p className="text-xl font-bold tabular-nums text-emerald-700 dark:text-emerald-400">
                    {fin.totalValue > 0 ? `$${fin.totalValue.toLocaleString(undefined, { maximumFractionDigits: 0 })}` : '—'}
                  </p>
                </div>
                <div className="rounded-xl bg-muted/40 p-3 border border-border/50">
                  <p className="text-[10px] font-bold uppercase tracking-[0.12em] text-muted-foreground/60 mb-1">Operating Cost</p>
                  <p className="text-xl font-bold tabular-nums">
                    {fin.totalCostUsd > 0 ? `$${fin.totalCostUsd.toLocaleString(undefined, { maximumFractionDigits: 0 })}` : <span className="text-muted-foreground/50 text-sm font-normal">Not configured</span>}
                  </p>
                </div>
                <div className={`rounded-xl p-3 border ${fin.profit > 0 ? 'bg-emerald-50 dark:bg-emerald-950/20 border-emerald-100 dark:border-emerald-900/30' : fin.profit < 0 ? 'bg-rose-50 dark:bg-rose-950/20 border-rose-100 dark:border-rose-900/30' : 'bg-muted/40 border-border/50'}`}>
                  <p className="text-[10px] font-bold uppercase tracking-[0.12em] text-muted-foreground/60 mb-1">Margin</p>
                  <p className={`text-xl font-bold tabular-nums ${fin.profit > 0 ? 'text-emerald-700 dark:text-emerald-400' : fin.profit < 0 ? 'text-rose-600 dark:text-rose-400' : 'text-muted-foreground/50'}`}>
                    {fin.hasData ? <>{fin.profit >= 0 ? '+' : '−'}${Math.abs(fin.profit).toLocaleString(undefined, { maximumFractionDigits: 0 })}{fin.margin !== 0 && <span className="text-xs font-medium ml-1.5 opacity-70">{fin.margin}%</span>}</> : '—'}
                  </p>
                </div>
              </div>

              {/* PO breakdown table */}
              {fin.valueByPo.length > 0 && (
                <div className="rounded-xl border overflow-hidden">
                  <table className="w-full text-xs">
                    <thead>
                      <tr className="border-b bg-muted/20">
                        <th className="text-left py-2.5 px-3 font-bold uppercase tracking-[0.1em] text-muted-foreground/60">Work Order</th>
                        <th className="text-right py-2.5 px-3 font-bold uppercase tracking-[0.1em] text-muted-foreground/60">Output</th>
                        <th className="text-right py-2.5 px-3 font-bold uppercase tracking-[0.1em] text-muted-foreground/60 hidden sm:table-cell">Prod CM/pc</th>
                        <th className="text-right py-2.5 px-3 font-bold uppercase tracking-[0.1em] text-muted-foreground/60">Value</th>
                      </tr>
                    </thead>
                    <tbody>
                      {fin.valueByPo.map(row => (
                        <tr key={row.po} className="border-b last:border-0 hover:bg-muted/20 transition-colors">
                          <td className="py-2.5 px-3">
                            <p className="font-semibold">{row.po}</p>
                            {row.buyer && <p className="text-muted-foreground text-[11px]">{row.buyer}</p>}
                          </td>
                          <td className="py-2.5 px-3 text-right tabular-nums text-muted-foreground">{row.output.toLocaleString()} pcs</td>
                          <td className="py-2.5 px-3 text-right tabular-nums text-muted-foreground hidden sm:table-cell">${row.productionCmPc.toFixed(3)}</td>
                          <td className="py-2.5 px-3 text-right tabular-nums font-semibold text-emerald-700 dark:text-emerald-400">
                            ${row.value.toLocaleString(undefined, { maximumFractionDigits: 0 })}
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              )}
              <p className="text-[10px] text-muted-foreground/50">
                Sewing dept · Production CM = 70% of entered CM · Costs in USD
              </p>
            </CardContent>
          </Card>
        );
      })()}

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
