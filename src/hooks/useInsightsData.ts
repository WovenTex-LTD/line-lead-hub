/**
 * Reusable hook that mirrors the data-fetching logic from Insights.tsx.
 * Used by the Analytics Portal pages. Does NOT modify the original Insights page.
 */
import { useState, useEffect, useMemo } from "react";
import { useAuth } from "@/contexts/AuthContext";
import { supabase } from "@/integrations/supabase/client";
import { getTodayInTimezone } from "@/lib/date-utils";
import { compareLineNames } from "@/lib/sort-lines";
import { useHeadcountCost } from "@/hooks/useHeadcountCost";

export interface DailyData {
  date: string;
  displayDate: string;
  sewingOutput: number;
  sewingTarget: number;
  finishingQcPass: number;
  finishingPolyOutput: number;
  finishingPolyTarget: number;
  efficiency: number;
  blockers: number;
  manpower: number;
}

export interface LinePerformance {
  lineName: string;
  lineId: string;
  totalOutput: number;
  totalTarget: number;
  efficiency: number;
  avgDailyOutput: number;
  workingDays: number;
  avgManpower: number;
  submissions: number;
  blockers: number;
}

export interface BlockerBreakdown {
  type: string;
  count: number;
  impact: string;
}

export interface WorkOrderProgress {
  poNumber: string;
  buyer: string;
  style: string;
  orderQty: number;
  totalOutput: number;
  progress: number;
  lineName: string | null;
}

export interface InsightSummary {
  totalSewingOutput: number;
  totalFinishingQcPass: number;
  avgDailyOutput: number;
  avgDailyQcPass: number;
  avgEfficiency: number;
  totalBlockers: number;
  openBlockers: number;
  resolvedBlockers: number;
  avgManpower: number;
  daysWithData: number;
  topPerformingLine: string | null;
  worstPerformingLine: string | null;
  mostCommonBlockerType: string | null;
  efficiencyTrend: "up" | "down" | "stable";
  outputTrend: "up" | "down" | "stable";
  previousPeriodEfficiency: number;
  previousPeriodOutput: number;
}

export interface PreviousPeriodData {
  totalOutput: number;
  totalQcPass: number;
  avgEfficiency: number;
  totalBlockers: number;
  avgManpower: number;
  daysWithData: number;
}

export interface FinancialData {
  totalRevenue: number;
  totalCost: number;
  profit: number;
  margin: number;
  sewingCost: number;
  revenueByPo: { po: string; buyer: string; revenue: number; output: number; cmDz: number }[];
  profitByPo: { po: string; buyer: string; revenue: number; cost: number; profit: number; margin: number }[];
  dailyFinancials: { date: string; displayDate: string; revenue: number; cost: number; profit: number }[];
  costPerPiece: number;
  revenuePerPiece: number;
  prevRevenue: number;
  prevCost: number;
  prevProfit: number;
  prevMargin: number;
  hasData: boolean;
}

export type Period = "7" | "14" | "21" | "30" | "90" | "180" | "365";

export interface InsightsDataResult {
  loading: boolean;
  period: Period;
  setPeriod: (p: Period) => void;
  dailyData: DailyData[];
  linePerformance: LinePerformance[];
  blockerBreakdown: BlockerBreakdown[];
  workOrderProgress: WorkOrderProgress[];
  summary: InsightSummary;
  previousPeriodData: PreviousPeriodData;
  financialData: FinancialData;
  dateRange: { start: string; end: string };
}

export function useInsightsData(initialPeriod: Period = "7"): InsightsDataResult {
  const { profile, factory } = useAuth();
  const { headcountCost, isConfigured: costConfigured } = useHeadcountCost();
  const [loading, setLoading] = useState(true);
  const [period, setPeriod] = useState<Period>(initialPeriod);
  const [dailyData, setDailyData] = useState<DailyData[]>([]);
  const [linePerformance, setLinePerformance] = useState<LinePerformance[]>([]);
  const [blockerBreakdown, setBlockerBreakdown] = useState<BlockerBreakdown[]>([]);
  const [workOrderProgress, setWorkOrderProgress] = useState<WorkOrderProgress[]>([]);
  const [dateRange, setDateRange] = useState({ start: "", end: "" });
  const [bdtToUsd, setBdtToUsd] = useState<number | null>(null);
  const [previousPeriodData, setPreviousPeriodData] = useState<PreviousPeriodData>({
    totalOutput: 0, totalQcPass: 0, avgEfficiency: 0, totalBlockers: 0, avgManpower: 0, daysWithData: 0,
  });
  const [summary, setSummary] = useState<InsightSummary>({
    totalSewingOutput: 0, totalFinishingQcPass: 0, avgDailyOutput: 0, avgDailyQcPass: 0,
    avgEfficiency: 0, totalBlockers: 0, openBlockers: 0, resolvedBlockers: 0, avgManpower: 0,
    daysWithData: 0, topPerformingLine: null, worstPerformingLine: null, mostCommonBlockerType: null,
    efficiencyTrend: "stable", outputTrend: "stable", previousPeriodEfficiency: 0, previousPeriodOutput: 0,
  });
  const [financialData, setFinancialData] = useState<FinancialData>({
    totalRevenue: 0, totalCost: 0, profit: 0, margin: 0, sewingCost: 0,
    revenueByPo: [], profitByPo: [], dailyFinancials: [],
    costPerPiece: 0, revenuePerPiece: 0, prevRevenue: 0, prevCost: 0, prevProfit: 0, prevMargin: 0, hasData: false,
  });

  // Fetch BDT→USD rate
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

  useEffect(() => {
    if (!profile?.factory_id || !factory) return;
    fetchInsights();
  }, [profile?.factory_id, period, bdtToUsd, headcountCost.value]);

  async function fetchInsights() {
    if (!profile?.factory_id) return;
    setLoading(true);

    try {
      const tz = factory?.timezone || "Asia/Dhaka";
      const today = getTodayInTimezone(tz);
      const days = parseInt(period);
      const startDate = new Date(today + "T00:00:00");
      startDate.setDate(startDate.getDate() - days);
      const startDateStr = startDate.toISOString().split("T")[0];
      setDateRange({ start: startDateStr, end: today });

      const prevStartDate = new Date(startDate);
      prevStartDate.setDate(prevStartDate.getDate() - days);
      const prevStartDateStr = prevStartDate.toISOString().split("T")[0];

      const [
        { data: sewingActualsData },
        { data: sewingTargetsData },
        { data: prevSewingActuals },
        { data: prevSewingTargets },
        { data: finishingDailyLogs },
        { data: finishingTargetLogs },
        { data: prevFinishingDailyLogs },
        { data: workOrders },
      ] = await Promise.all([
        supabase.from("sewing_actuals")
          .select("*, lines(name, line_id), work_orders(po_number, buyer, style, order_qty, cm_per_dozen), blocker_types:blocker_type_id(name)")
          .eq("factory_id", profile.factory_id).gte("production_date", startDateStr).lte("production_date", today)
          .order("production_date", { ascending: true }),
        supabase.from("sewing_targets")
          .select("production_date, line_id, per_hour_target, manpower_planned, lines(name, line_id)")
          .eq("factory_id", profile.factory_id).gte("production_date", startDateStr).lte("production_date", today),
        supabase.from("sewing_actuals")
          .select("good_today, manpower_actual, has_blocker, production_date, line_id, hours_actual, ot_manpower_actual, ot_hours_actual, work_orders(cm_per_dozen, po_number)")
          .eq("factory_id", profile.factory_id).gte("production_date", prevStartDateStr).lt("production_date", startDateStr),
        supabase.from("sewing_targets")
          .select("per_hour_target, line_id, production_date")
          .eq("factory_id", profile.factory_id).gte("production_date", prevStartDateStr).lt("production_date", startDateStr),
        supabase.from("finishing_daily_logs")
          .select("*, lines(name, line_id), work_orders(po_number, buyer, style, order_qty, cm_per_dozen)")
          .eq("factory_id", profile.factory_id).eq("log_type", "OUTPUT")
          .gte("production_date", startDateStr).lte("production_date", today).order("production_date", { ascending: true }),
        supabase.from("finishing_daily_logs")
          .select("*").eq("factory_id", profile.factory_id).eq("log_type", "TARGET")
          .gte("production_date", startDateStr).lte("production_date", today),
        supabase.from("finishing_daily_logs")
          .select("poly, carton").eq("factory_id", profile.factory_id).eq("log_type", "OUTPUT")
          .gte("production_date", prevStartDateStr).lte("production_date", startDateStr),
        supabase.from("work_orders")
          .select("*, lines(name, line_id)").eq("factory_id", profile.factory_id).eq("is_active", true),
      ]);

      // Pairing: only count targets that have matching actuals
      const sewingActualKeys = new Set(sewingActualsData?.map(u => `${u.line_id}_${u.production_date}`) || []);
      const pairedSewingTargets = sewingTargetsData?.filter(t => sewingActualKeys.has(`${t.line_id}_${t.production_date}`)) || [];
      const finishingOutputKeys = new Set(finishingDailyLogs?.map(u => `${(u as any).work_order_id}_${u.production_date}`) || []);
      const pairedFinishingTargets = finishingTargetLogs?.filter(t => finishingOutputKeys.has(`${(t as any).work_order_id}_${t.production_date}`)) || [];

      // ── Daily data ──
      const dailyMap = new Map<string, DailyData>();
      const getOrCreate = (date: string): DailyData => dailyMap.get(date) || {
        date, displayDate: new Date(date).toLocaleDateString("en-US", { month: "short", day: "numeric" }),
        sewingOutput: 0, sewingTarget: 0, finishingQcPass: 0, finishingPolyOutput: 0, finishingPolyTarget: 0,
        efficiency: 0, blockers: 0, manpower: 0,
      };

      sewingActualsData?.forEach(u => {
        const d = getOrCreate(u.production_date);
        d.sewingOutput += u.good_today || 0;
        if (u.has_blocker) d.blockers += 1;
        d.manpower += u.manpower_actual || 0;
        dailyMap.set(u.production_date, d);
      });
      pairedSewingTargets.forEach(t => {
        const d = getOrCreate(t.production_date);
        d.sewingTarget += (t.per_hour_target || 0) * 8;
        dailyMap.set(t.production_date, d);
      });
      finishingDailyLogs?.forEach(u => {
        const d = getOrCreate(u.production_date);
        d.finishingQcPass += (u.poly || 0) + (u.carton || 0);
        d.finishingPolyOutput += u.poly || 0;
        dailyMap.set(u.production_date, d);
      });
      pairedFinishingTargets.forEach(t => {
        const d = getOrCreate(t.production_date);
        const hrs = t.planned_hours || 0;
        d.finishingPolyTarget += (t.poly || 0) * (hrs > 0 ? hrs : 1);
        dailyMap.set(t.production_date, d);
      });

      const dailyArr = Array.from(dailyMap.values())
        .map(d => ({ ...d, efficiency: d.sewingTarget > 0 && d.sewingOutput > 0 ? Math.round((d.sewingOutput / d.sewingTarget) * 100) : 0 }))
        .sort((a, b) => a.date.localeCompare(b.date));
      setDailyData(dailyArr);

      // ── Line performance ──
      const lineMap = new Map<string, LinePerformance & { _dates: Set<string> }>();
      sewingActualsData?.forEach(u => {
        const id = u.line_id;
        const name = u.lines?.name || u.lines?.line_id || "Unknown";
        const ex = lineMap.get(id) || { lineName: name, lineId: id, totalOutput: 0, totalTarget: 0, efficiency: 0, avgDailyOutput: 0, workingDays: 0, avgManpower: 0, submissions: 0, blockers: 0, _dates: new Set<string>() };
        ex.totalOutput += u.good_today || 0;
        ex.avgManpower += u.manpower_actual || 0;
        ex.submissions += 1;
        if (u.has_blocker) ex.blockers += 1;
        if (u.good_today > 0 && u.production_date) ex._dates.add(u.production_date);
        lineMap.set(id, ex);
      });
      pairedSewingTargets.forEach(t => {
        const id = t.line_id;
        const name = t.lines?.name || t.lines?.line_id || "Unknown";
        const ex = lineMap.get(id) || { lineName: name, lineId: id, totalOutput: 0, totalTarget: 0, efficiency: 0, avgDailyOutput: 0, workingDays: 0, avgManpower: 0, submissions: 0, blockers: 0, _dates: new Set<string>() };
        ex.totalTarget += (t.per_hour_target || 0) * 8;
        lineMap.set(id, ex);
      });
      const lineArr = Array.from(lineMap.values()).map(l => {
        const days = l._dates.size;
        return { lineName: l.lineName, lineId: l.lineId, totalOutput: l.totalOutput, totalTarget: l.totalTarget,
          efficiency: l.totalTarget > 0 ? Math.round((l.totalOutput / l.totalTarget) * 100) : 0,
          avgDailyOutput: days > 0 ? Math.round(l.totalOutput / days) : 0, workingDays: days,
          avgManpower: l.submissions > 0 ? Math.round(l.avgManpower / l.submissions) : 0,
          submissions: l.submissions, blockers: l.blockers };
      }).sort((a, b) => compareLineNames(a.lineName, b.lineName));
      setLinePerformance(lineArr);

      // ── Blockers ──
      const bMap = new Map<string, { count: number; impact: string }>();
      sewingActualsData?.filter(u => u.has_blocker).forEach(b => {
        const name = (b as any).blocker_types?.name || "Other";
        const ex = bMap.get(name) || { count: 0, impact: (b as any).blocker_impact || "medium" };
        ex.count += 1;
        bMap.set(name, ex);
      });
      const blockerArr = Array.from(bMap.entries()).map(([type, d]) => ({ type, ...d })).sort((a, b) => b.count - a.count);
      setBlockerBreakdown(blockerArr);

      // ── Work order progress ──
      const woMap = new Map<string, WorkOrderProgress>();
      workOrders?.forEach(wo => {
        woMap.set(wo.id, { poNumber: wo.po_number, buyer: wo.buyer, style: wo.style, orderQty: wo.order_qty, totalOutput: 0, progress: 0, lineName: wo.lines?.name || null });
      });
      sewingActualsData?.forEach(u => {
        if (u.work_order_id && woMap.has(u.work_order_id)) {
          const wo = woMap.get(u.work_order_id)!;
          wo.totalOutput += u.good_today || 0;
          wo.progress = wo.orderQty > 0 ? Math.round((wo.totalOutput / wo.orderQty) * 100) : 0;
        }
      });
      setWorkOrderProgress(Array.from(woMap.values()).filter(wo => wo.totalOutput > 0).sort((a, b) => b.progress - a.progress).slice(0, 10));

      // ── Summary + previous period ──
      const totalSewingOutput = sewingActualsData?.reduce((s, u) => s + (u.good_today || 0), 0) || 0;
      const totalSewingTarget = pairedSewingTargets.reduce((s, t) => s + ((t.per_hour_target || 0) * 8), 0) || 0;
      const totalFinishingQcPass = finishingDailyLogs?.reduce((s, u) => s + (u.poly || 0) + (u.carton || 0), 0) || 0;
      const totalManpower = sewingActualsData?.reduce((s, u) => s + (u.manpower_actual || 0), 0) || 0;

      const prevTotalOutput = prevSewingActuals?.reduce((s, u) => s + (u.good_today || 0), 0) || 0;
      const prevActualKeys = new Set(prevSewingActuals?.map(u => `${u.line_id}_${u.production_date}`) || []);
      const pairedPrevTargets = prevSewingTargets?.filter(t => prevActualKeys.has(`${t.line_id}_${t.production_date}`)) || [];
      const prevTotalTarget = pairedPrevTargets.reduce((s, t) => s + ((t.per_hour_target || 0) * 8), 0) || 0;
      const prevTotalQcPass = prevFinishingDailyLogs?.reduce((s, u) => s + ((u as any).poly || 0) + ((u as any).carton || 0), 0) || 0;
      const prevEfficiency = prevTotalTarget > 0 ? (prevTotalOutput / prevTotalTarget) * 100 : 0;
      const prevTotalBlockers = prevSewingActuals?.filter(u => u.has_blocker).length || 0;
      const prevTotalManpower = prevSewingActuals?.reduce((s, u) => s + (u.manpower_actual || 0), 0) || 0;
      const prevDaysWithData = new Set(prevSewingActuals?.map(u => u.production_date) || []).size;

      setPreviousPeriodData({
        totalOutput: prevTotalOutput, totalQcPass: prevTotalQcPass, avgEfficiency: Math.round(prevEfficiency),
        totalBlockers: prevTotalBlockers,
        avgManpower: prevSewingActuals && prevSewingActuals.length > 0 ? Math.round(prevTotalManpower / prevSewingActuals.length) : 0,
        daysWithData: prevDaysWithData,
      });

      const allBlockers = sewingActualsData?.filter(u => u.has_blocker) || [];
      const openBlockers = allBlockers.filter(b => (b as any).blocker_status !== "resolved").length;
      const resolvedBlockers = allBlockers.filter(b => (b as any).blocker_status === "resolved").length;
      const avgEff = totalSewingTarget > 0 ? (totalSewingOutput / totalSewingTarget) * 100 : 0;
      let effTrend: "up" | "down" | "stable" = "stable";
      if (avgEff > prevEfficiency + 5) effTrend = "up";
      else if (avgEff < prevEfficiency - 5) effTrend = "down";
      let outTrend: "up" | "down" | "stable" = "stable";
      if (totalSewingOutput > prevTotalOutput * 1.1) outTrend = "up";
      else if (totalSewingOutput < prevTotalOutput * 0.9) outTrend = "down";

      const sewingDays = dailyArr.filter(d => d.sewingOutput > 0 || d.sewingTarget > 0).length;
      const finishingDays = dailyArr.filter(d => d.finishingQcPass > 0 || d.finishingPolyTarget > 0).length;

      setSummary({
        totalSewingOutput, totalFinishingQcPass,
        avgDailyOutput: sewingDays > 0 ? Math.round(totalSewingOutput / sewingDays) : 0,
        avgDailyQcPass: finishingDays > 0 ? Math.round(totalFinishingQcPass / finishingDays) : 0,
        avgEfficiency: Math.round(avgEff), totalBlockers: allBlockers.length, openBlockers, resolvedBlockers,
        avgManpower: sewingActualsData && sewingActualsData.length > 0 ? Math.round(totalManpower / sewingActualsData.length) : 0,
        daysWithData: sewingDays, topPerformingLine: lineArr[0]?.lineName || null,
        worstPerformingLine: lineArr[lineArr.length - 1]?.lineName || null,
        mostCommonBlockerType: blockerArr[0]?.type || null,
        efficiencyTrend: effTrend, outputTrend: outTrend,
        previousPeriodEfficiency: Math.round(prevEfficiency), previousPeriodOutput: prevTotalOutput,
      });

      // ── Financial calculations ──
      const rate = costConfigured && headcountCost.value ? headcountCost.value : 0;
      const costCurrency = headcountCost.currency;
      const toUsd = (v: number) => costCurrency === "BDT" && bdtToUsd ? v * bdtToUsd : v;

      const revenueByPoMap: Record<string, { po: string; buyer: string; revenue: number; output: number; cmDz: number }> = {};
      let totalRevenue = 0;
      sewingActualsData?.forEach(u => {
        const cm = (u as any).work_orders?.cm_per_dozen;
        const output = u.good_today || 0;
        if (cm && output) {
          const rev = (cm / 12) * output;
          totalRevenue += rev;
          const po = (u as any).work_orders?.po_number || "Unknown";
          if (!revenueByPoMap[po]) revenueByPoMap[po] = { po, buyer: (u as any).work_orders?.buyer || "", revenue: 0, output: 0, cmDz: cm };
          revenueByPoMap[po].revenue += rev;
          revenueByPoMap[po].output += output;
        }
      });

      let sewCost = 0;
      const costByPoMap: Record<string, { sewing: number }> = {};
      if (rate > 0) {
        sewingActualsData?.forEach(s => {
          if (!(s as any).work_orders?.cm_per_dozen) return;
          let c = 0;
          if (s.manpower_actual && s.hours_actual) c += rate * s.manpower_actual * s.hours_actual;
          if (s.ot_manpower_actual && s.ot_hours_actual) c += rate * s.ot_manpower_actual * s.ot_hours_actual;
          sewCost += c;
          if (c > 0) {
            const po = (s as any).work_orders?.po_number || "Unknown";
            if (!costByPoMap[po]) costByPoMap[po] = { sewing: 0 };
            costByPoMap[po].sewing += c;
          }
        });
      }

      const totalCostUsd = toUsd(sewCost);
      const profit = totalRevenue - totalCostUsd;
      const margin = totalRevenue > 0 ? (profit / totalRevenue) * 100 : 0;
      const revenueByPo = Object.values(revenueByPoMap).sort((a, b) => b.revenue - a.revenue);
      const allPos = new Set([...Object.keys(revenueByPoMap), ...Object.keys(costByPoMap)]);
      const profitByPo = Array.from(allPos).map(po => {
        const rev = revenueByPoMap[po]?.revenue || 0;
        const cUsd = toUsd(costByPoMap[po]?.sewing || 0);
        return { po, buyer: revenueByPoMap[po]?.buyer || "", revenue: Math.round(rev * 100) / 100, cost: Math.round(cUsd * 100) / 100, profit: Math.round((rev - cUsd) * 100) / 100, margin: rev > 0 ? Math.round(((rev - cUsd) / rev) * 1000) / 10 : 0 };
      }).filter(p => p.revenue > 0 || p.cost > 0).sort((a, b) => b.profit - a.profit);

      const dailyRevMap: Record<string, number> = {};
      const dailyCostMap: Record<string, number> = {};
      sewingActualsData?.forEach(s => {
        const cm = (s as any).work_orders?.cm_per_dozen;
        const out = s.good_today || 0;
        if (cm && out) dailyRevMap[s.production_date] = (dailyRevMap[s.production_date] || 0) + (cm / 12) * out;
      });
      if (rate > 0) {
        sewingActualsData?.forEach(s => {
          if (!(s as any).work_orders?.cm_per_dozen) return;
          let c = 0;
          if (s.manpower_actual && s.hours_actual) c += rate * s.manpower_actual * s.hours_actual;
          if (s.ot_manpower_actual && s.ot_hours_actual) c += rate * s.ot_manpower_actual * s.ot_hours_actual;
          dailyCostMap[s.production_date] = (dailyCostMap[s.production_date] || 0) + c;
        });
      }
      const allDates = new Set([...Object.keys(dailyRevMap), ...Object.keys(dailyCostMap)]);
      const dailyFinancials = Array.from(allDates).sort().map(date => ({
        date, displayDate: new Date(date).toLocaleDateString("en-US", { month: "short", day: "numeric" }),
        revenue: Math.round((dailyRevMap[date] || 0) * 100) / 100,
        cost: Math.round(toUsd(dailyCostMap[date] || 0) * 100) / 100,
        profit: Math.round(((dailyRevMap[date] || 0) - toUsd(dailyCostMap[date] || 0)) * 100) / 100,
      }));

      let prevRevenue = 0;
      prevSewingActuals?.forEach(s => {
        const cm = (s as any).work_orders?.cm_per_dozen;
        const out = s.good_today || 0;
        if (cm && out) prevRevenue += (cm / 12) * out;
      });
      let prevCostNative = 0;
      if (rate > 0) {
        prevSewingActuals?.forEach(s => {
          if (s.manpower_actual && (s as any).hours_actual) prevCostNative += rate * s.manpower_actual * (s as any).hours_actual;
          if ((s as any).ot_manpower_actual && (s as any).ot_hours_actual) prevCostNative += rate * (s as any).ot_manpower_actual * (s as any).ot_hours_actual;
        });
      }
      const prevCostUsd = toUsd(prevCostNative);

      setFinancialData({
        totalRevenue: Math.round(totalRevenue * 100) / 100, totalCost: Math.round(totalCostUsd * 100) / 100,
        profit: Math.round(profit * 100) / 100, margin: Math.round(margin * 10) / 10, sewingCost: Math.round(toUsd(sewCost) * 100) / 100,
        revenueByPo, profitByPo, dailyFinancials,
        costPerPiece: totalSewingOutput > 0 ? Math.round((totalCostUsd / totalSewingOutput) * 100) / 100 : 0,
        revenuePerPiece: totalSewingOutput > 0 ? Math.round((totalRevenue / totalSewingOutput) * 100) / 100 : 0,
        prevRevenue: Math.round(prevRevenue * 100) / 100, prevCost: Math.round(prevCostUsd * 100) / 100,
        prevProfit: Math.round((prevRevenue - prevCostUsd) * 100) / 100,
        prevMargin: Math.round((prevRevenue > 0 ? ((prevRevenue - prevCostUsd) / prevRevenue) * 100 : 0) * 10) / 10,
        hasData: totalRevenue > 0 || sewCost > 0,
      });
    } catch (error) {
      console.error("[useInsightsData] Error:", error);
    } finally {
      setLoading(false);
    }
  }

  return { loading, period, setPeriod, dailyData, linePerformance, blockerBreakdown, workOrderProgress, summary, previousPeriodData, financialData, dateRange };
}
